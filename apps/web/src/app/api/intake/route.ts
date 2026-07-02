import sql from '@/app/api/utils/sql';
import { requireUser, canAccessVisit, canAccessIntakeSession, forbidden } from '@/lib/auth-guard';
import { logEvent } from '@/lib/events';

export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { visitId, language } = await request.json();
  if (!(await canAccessVisit(ctx, visitId))) return forbidden();

  try {
    const [session] = await sql`
      INSERT INTO intake_sessions (visit_id, language, status)
      VALUES (${visitId}, ${language}, 'IN_PROGRESS')
      RETURNING *
    `;

    // Update visit status
    const [v] = await sql`
      UPDATE visits SET status = 'INTAKE IN PROGRESS', intake_started_at = now()
      WHERE id = ${visitId}
      RETURNING clinic_id
    `;
    await logEvent('intake_started', visitId, (v?.clinic_id as string) ?? null);

    return Response.json(session);
  } catch (error) {
    console.error('Error creating intake session:', error);
    return Response.json({ error: 'Failed to start intake' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { sessionId, transcriptNative, status } = await request.json();
  if (!(await canAccessIntakeSession(ctx, sessionId))) return forbidden();

  // Never let an intake COMPLETE with no content (empty/whitespace transcript).
  if (status === 'COMPLETED' && (!transcriptNative || !String(transcriptNative).trim())) {
    return Response.json(
      { error: 'Cannot complete intake with an empty transcript' },
      { status: 400 }
    );
  }

  try {
    const [session] = await sql`
      UPDATE intake_sessions
      SET transcript_native = ${transcriptNative}, status = ${status}
      WHERE id = ${sessionId}
      RETURNING *
    `;

    if (status === 'COMPLETED') {
      const [v] = await sql`
        UPDATE visits SET status = 'INTAKE COMPLETE', intake_completed_at = now()
        WHERE id = ${session.visit_id}
        RETURNING clinic_id
      `;
      await logEvent('intake_completed', session.visit_id as string, (v?.clinic_id as string) ?? null);
    }

    return Response.json(session);
  } catch (error) {
    console.error('Error updating intake session:', error);
    return Response.json({ error: 'Failed to update intake' }, { status: 500 });
  }
}
