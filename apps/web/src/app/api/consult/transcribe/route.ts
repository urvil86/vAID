import sql from '@/app/api/utils/sql';
import { requireRole, canAccessVisit, forbidden } from '@/lib/auth-guard';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { transcribeWithSarvam, sarvamConfigured } from '@/lib/sarvam';
import { canRecordConsult } from '@/lib/consult-scribe';

/**
 * POST /api/consult/transcribe  (multipart: file, visitId)
 *
 * A consult-audio chunk from the doctor's device is transcribed (Sarvam) and
 * appended to the rolling transcript in consult_recordings. Gated by BOTH
 * consents (canRecordConsult). Audio is transcribed and discarded — only the
 * rolling transcript is kept, and it is hard-deleted on visit close.
 */
export async function POST(request: Request) {
  const ctx = await requireRole(request, ['doctor']);
  if (ctx instanceof Response) return ctx;

  const ipLimit = await enforceRateLimit(request, {
    key: `ai:ip:${getClientIp(request)}`,
    windowMs: 3_600_000,
    max: 600,
    route: '/api/consult/transcribe',
    keyType: 'ip',
    actorId: ctx.userId,
  });
  if (ipLimit) return ipLimit;

  if (!sarvamConfigured()) {
    return Response.json({ error: 'ASR not configured', fallback: 'browser' }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }
  const file = form.get('file');
  const visitId = String(form.get('visitId') || '');
  if (!(file instanceof Blob) || !visitId) {
    return Response.json({ error: 'file and visitId are required' }, { status: 400 });
  }
  if (!(await canAccessVisit(ctx, visitId))) return forbidden();
  if (!(await canRecordConsult(visitId, ctx.userId, ctx.isDevBypass))) {
    return forbidden('Consult recording requires patient consent and the doctor opt-in');
  }

  try {
    const result = await transcribeWithSarvam(file, 'auto');
    if (!result) {
      return Response.json({ error: 'ASR not configured', fallback: 'browser' }, { status: 503 });
    }
    // Append this chunk's text to the rolling transcript (never stores audio).
    // One row per visit; the transcript accumulates across chunks.
    await sql`
      INSERT INTO consult_recordings (visit_id, status, transcript, chunk_refs_json)
      VALUES (${visitId}, 'recording', ${result.transcript}, '[]'::jsonb)
      ON CONFLICT (visit_id) DO UPDATE SET
        transcript = coalesce(consult_recordings.transcript, '') || ' ' || excluded.transcript
    `;
    return Response.json({ ok: true, appended: result.transcript.length });
  } catch (e) {
    console.error('[consult/transcribe] failed:', e);
    return Response.json({ error: 'ASR failed', fallback: 'browser' }, { status: 503 });
  }
}
