import sql from '@/app/api/utils/sql';
import { requireRole, canAccessIntakeSession, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { checkOrigin } from '@/lib/csrf';
import { writeNoteVersion, captureNoteEdits, getAiDraftNote } from '@/lib/note-lifecycle';
import type { StructuredNote } from '@/lib/types';

/**
 * PUT /api/intake/note — the DOCTOR authors the note.
 *
 * Saves the doctor's edited structured note as a new immutable version, records
 * the field-level AI-vs-doctor diffs (training signal), and moves the note to
 * 'doctor_reviewed'. A signed note cannot be edited here — corrections after
 * signing go through POST (addendum) below.
 */
export async function PUT(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;

  const ctx = await requireRole(request, ['doctor']);
  if (ctx instanceof Response) return ctx;

  const { sessionId, note } = await request.json();
  if (!sessionId || !note) {
    return Response.json({ error: 'sessionId and note are required' }, { status: 400 });
  }
  if (!(await canAccessIntakeSession(ctx, sessionId))) return forbidden();

  const [s] = await sql`SELECT signed_at FROM intake_sessions WHERE id = ${sessionId}`;
  if (!s) return Response.json({ error: 'Session not found' }, { status: 404 });
  if (s.signed_at) {
    return Response.json(
      { error: 'This note is signed. Add a dated addendum instead of editing it.' },
      { status: 409 }
    );
  }

  const clean = note as StructuredNote;
  const aiNote = await getAiDraftNote(sessionId);
  await captureNoteEdits(sessionId, aiNote, clean);

  await sql`
    UPDATE intake_sessions
    SET structured_note_json = ${clean},
        transcript_english = ${clean.history_of_present_illness ?? null},
        screen_flags_json = ${JSON.stringify(clean.screen_flags ?? [])},
        confidence_flags_json = ${JSON.stringify(clean.confidence_flags ?? [])},
        note_status = 'doctor_reviewed'
    WHERE id = ${sessionId}
  `;
  await writeNoteVersion(sessionId, clean, ctx.userId, 'Doctor edit');
  await audit(request, ctx, 'update', 'intake', sessionId);

  return Response.json({ ok: true, note_status: 'doctor_reviewed' });
}

/**
 * POST /api/intake/note — add a dated ADDENDUM to a signed note. The signed
 * structured note is never mutated; the addendum is a new version row.
 */
export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;

  const ctx = await requireRole(request, ['doctor']);
  if (ctx instanceof Response) return ctx;

  const { sessionId, text } = await request.json();
  if (!sessionId || !text || !String(text).trim()) {
    return Response.json({ error: 'sessionId and text are required' }, { status: 400 });
  }
  if (!(await canAccessIntakeSession(ctx, sessionId))) return forbidden();

  const [s] = await sql`SELECT signed_at FROM intake_sessions WHERE id = ${sessionId}`;
  if (!s) return Response.json({ error: 'Session not found' }, { status: 404 });
  if (!s.signed_at) {
    return Response.json({ error: 'Only a signed note can take an addendum' }, { status: 409 });
  }

  await writeNoteVersion(sessionId, { addendum: String(text).trim() }, ctx.userId, 'Addendum', true);
  await audit(request, ctx, 'update', 'intake', sessionId);
  return Response.json({ ok: true });
}
