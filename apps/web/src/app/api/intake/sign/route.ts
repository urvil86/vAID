import sql from '@/app/api/utils/sql';
import { requireRole, canAccessIntakeSession, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { checkOrigin } from '@/lib/csrf';
import { writeNoteVersion } from '@/lib/note-lifecycle';

/**
 * POST /api/intake/sign — the doctor signs the note. Sets note_status='signed',
 * records signed_by/signed_at, locks editing, and writes the final version.
 * After this the visit can be closed (visits PUT rejects a DONE on an unsigned
 * note). Low-confidence field confirmation is enforced in the consult UI before
 * this is called; here we require a note to exist and that it isn't already
 * signed.
 */
export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;

  const ctx = await requireRole(request, ['doctor']);
  if (ctx instanceof Response) return ctx;

  const { sessionId } = await request.json();
  if (!sessionId) return Response.json({ error: 'sessionId is required' }, { status: 400 });
  if (!(await canAccessIntakeSession(ctx, sessionId))) return forbidden();

  const [s] = await sql`
    SELECT structured_note_json, signed_at FROM intake_sessions WHERE id = ${sessionId}
  `;
  if (!s) return Response.json({ error: 'Session not found' }, { status: 404 });
  if (s.signed_at) return Response.json({ error: 'Note is already signed' }, { status: 409 });
  if (!s.structured_note_json) {
    return Response.json({ error: 'There is no note to sign yet' }, { status: 400 });
  }

  await sql`
    UPDATE intake_sessions
    SET note_status = 'signed',
        signed_by = ${ctx.userId},
        signed_at = now(),
        locked_at = coalesce(locked_at, now())
    WHERE id = ${sessionId}
  `;
  await writeNoteVersion(sessionId, s.structured_note_json, ctx.userId, 'Signed');
  await audit(request, ctx, 'NOTE_SIGNED', 'intake', sessionId);

  return Response.json({ ok: true, note_status: 'signed', signed_by: ctx.userId });
}
