import sql from '@/app/api/utils/sql';
import { requireUser, canAccessVisit, forbidden } from '@/lib/auth-guard';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { transcribeWithSarvam, sarvamConfigured } from '@/lib/sarvam';

/**
 * POST /api/intake/transcribe  (multipart: file, visitId, language?)
 *
 * Server-side Sarvam Indic ASR. The key never reaches the client. If Sarvam is
 * not configured (or fails), responds 503 with fallback:'browser' so the client
 * degrades to the Web Speech path. Audio is transcribed and DISCARDED — only the
 * transcript is returned; raw audio is retained only if AUDIO_RETENTION=1.
 */
export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  // Same AI-endpoint caps: per-IP backstop (clinics share one IP).
  const ipLimit = await enforceRateLimit(request, {
    key: `ai:ip:${getClientIp(request)}`,
    windowMs: 3_600_000,
    max: 600,
    route: '/api/intake/transcribe',
    keyType: 'ip',
    actorId: ctx.userId,
  });
  if (ipLimit) return ipLimit;

  if (!sarvamConfigured()) {
    return Response.json(
      { error: 'ASR not configured', fallback: 'browser' },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }
  const file = form.get('file');
  const visitId = String(form.get('visitId') || '');
  const language = form.get('language') ? String(form.get('language')) : undefined;

  if (!(file instanceof Blob) || !visitId) {
    return Response.json({ error: 'file and visitId are required' }, { status: 400 });
  }
  if (!(await canAccessVisit(ctx, visitId))) return forbidden();

  try {
    const result = await transcribeWithSarvam(file, language);
    if (!result) {
      return Response.json({ error: 'ASR not configured', fallback: 'browser' }, { status: 503 });
    }
    // Record the ASR vendor used for this visit's latest session (provenance).
    await sql`
      UPDATE intake_sessions
      SET audio_refs_json = coalesce(audio_refs_json, '{}'::jsonb) ||
        ${JSON.stringify({ asr_source: 'sarvam', language_detected: result.language_detected, confidence: result.confidence })}::jsonb
      WHERE visit_id = ${visitId}
    `;
    return Response.json({
      transcript: result.transcript,
      language_detected: result.language_detected,
      confidence: result.confidence,
      asr_source: 'sarvam',
    });
  } catch (e) {
    console.error('[transcribe] Sarvam failed:', e);
    // Degrade to browser ASR rather than break intake.
    return Response.json({ error: 'ASR failed', fallback: 'browser' }, { status: 503 });
  }
}
