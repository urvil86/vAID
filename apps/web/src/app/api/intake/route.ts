import sql from '@/app/api/utils/sql';
import { requireUser, canAccessVisit, canAccessIntakeSession, forbidden } from '@/lib/auth-guard';

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
    await sql`
      UPDATE visits SET status = 'INTAKE IN PROGRESS', intake_started_at = now()
      WHERE id = ${visitId}
    `;

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

  try {
    const [session] = await sql`
      UPDATE intake_sessions
      SET transcript_native = ${transcriptNative}, status = ${status}
      WHERE id = ${sessionId}
      RETURNING *
    `;

    if (status === 'COMPLETED') {
      await sql`
        UPDATE visits SET status = 'INTAKE COMPLETE', intake_completed_at = now()
        WHERE id = ${session.visit_id}
      `;
    }

    return Response.json(session);
  } catch (error) {
    console.error('Error updating intake session:', error);
    return Response.json({ error: 'Failed to update intake' }, { status: 500 });
  }
}
