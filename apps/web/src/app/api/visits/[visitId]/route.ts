import sql from '@/app/api/utils/sql';
import { requireUser, requireStaff, canAccessVisit, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { regeneratePatientSummary } from '@/lib/summary';

export async function GET(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;

  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  if (!(await canAccessVisit(ctx, visitId))) return forbidden();
  await audit(request, ctx, 'read', 'visit', visitId);

  try {
    const [visit] = await sql`
      SELECT v.*, u.name as patient_name, pp.date_of_birth, pp.sex
      FROM visits v
      JOIN "user" u ON v.patient_id = u.id
      LEFT JOIN patient_profiles pp ON u.id = pp.user_id
      WHERE v.id = ${visitId}
    `;

    if (!visit) {
      return Response.json({ error: 'Visit not found' }, { status: 404 });
    }

    return Response.json(visit);
  } catch (error) {
    console.error('Error fetching visit:', error);
    return Response.json({ error: 'Failed to fetch visit' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;

  // Status changes (CHECKED IN → CONSULT → DONE) are staff actions.
  const ctx = await requireStaff(request);
  if (ctx instanceof Response) return ctx;
  if (!(await canAccessVisit(ctx, visitId))) return forbidden();
  await audit(request, ctx, 'update', 'visit', visitId);

  const { status } = await request.json();

  // A visit cannot be closed with an unsigned note — the doctor must sign first.
  if (status === 'DONE') {
    const [s] = await sql`
      SELECT note_status FROM intake_sessions
      WHERE visit_id = ${visitId} ORDER BY created_at DESC LIMIT 1
    `;
    if (s && s.note_status !== 'signed') {
      return Response.json(
        { error: 'Sign the note before closing the visit.' },
        { status: 409 }
      );
    }
  }

  try {
    // Stamp lifecycle timestamps so the queue + analytics can measure flow:
    // consult_started_at = "patient entered the room" (CONSULT), closed_at =
    // visit done. coalesce() keeps the earliest stamp if already set.
    const [visit] = await sql`
      UPDATE visits
      SET status = ${status},
          consult_started_at = CASE
            WHEN ${status} IN ('CONSULT', 'DONE') THEN coalesce(consult_started_at, now())
            ELSE consult_started_at END,
          closed_at = CASE
            WHEN ${status} = 'DONE' THEN coalesce(closed_at, now())
            ELSE closed_at END
      WHERE id = ${visitId}
      RETURNING *
    `;

    // When a consult closes: lock the structured note against silent overwrites
    // and roll up the patient's longitudinal summary.
    if (status === 'DONE') {
      await sql`
        UPDATE intake_sessions
        SET locked_at = coalesce(locked_at, now())
        WHERE visit_id = ${visitId}
      `;
      if (visit?.patient_id) await regeneratePatientSummary(visit.patient_id as string);
    }

    return Response.json(visit);
  } catch (error) {
    console.error('Error updating visit:', error);
    return Response.json({ error: 'Failed to update visit' }, { status: 500 });
  }
}
