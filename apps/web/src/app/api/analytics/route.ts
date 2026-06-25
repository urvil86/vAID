import sql from '@/app/api/utils/sql';
import { requireStaff, assertClinic, forbidden } from '@/lib/auth-guard';

/**
 * Clinic analytics. Computed live from visits + intake_sessions.
 *
 * Headline metric (the product's proof of value): % of consulted visits where
 * intake was complete before the patient entered the room
 * (intake_completed_at <= consult_started_at).
 */
export async function GET(request: Request) {
  const ctx = await requireStaff(request);
  if (ctx instanceof Response) return ctx;

  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get('clinicId');
  if (!clinicId) {
    return Response.json({ error: 'clinicId is required' }, { status: 400 });
  }
  if (!assertClinic(ctx, clinicId)) return forbidden();

  try {
    const [row] = await sql`
      WITH v AS (
        SELECT * FROM visits WHERE clinic_id = ${clinicId}
      ),
      latest_intake AS (
        SELECT DISTINCT ON (visit_id) visit_id, status
        FROM intake_sessions
        ORDER BY visit_id, created_at DESC
      )
      SELECT
        (SELECT count(*) FROM v) AS total_visits,
        (SELECT count(*) FROM v WHERE created_at::date = now()::date) AS today_visits,
        (SELECT count(*) FROM v WHERE status = 'DONE') AS done_visits,
        (SELECT count(*) FROM v WHERE consult_started_at IS NOT NULL) AS consulted_visits,
        (SELECT count(*) FROM latest_intake li JOIN v ON v.id = li.visit_id
           WHERE li.status = 'COMPLETED') AS intake_completed,
        (SELECT round(avg(extract(epoch FROM (consult_started_at - created_at)) / 60)::numeric, 1)
           FROM v WHERE consult_started_at IS NOT NULL) AS avg_wait_min,
        (SELECT round(avg(extract(epoch FROM (closed_at - consult_started_at)) / 60)::numeric, 1)
           FROM v WHERE closed_at IS NOT NULL AND consult_started_at IS NOT NULL) AS avg_consult_min,
        (SELECT count(*) FROM v
           WHERE consult_started_at IS NOT NULL
             AND intake_completed_at IS NOT NULL
             AND intake_completed_at <= consult_started_at) AS intake_before_room,
        (SELECT count(*) FROM v WHERE consult_started_at IS NOT NULL) AS consult_denom
    `;

    const num = (x: unknown) => (x == null ? 0 : Number(x));
    const totalVisits = num(row.total_visits);
    const consultDenom = num(row.consult_denom);
    const intakeCompletionRate = totalVisits ? Math.round((num(row.intake_completed) / totalVisits) * 100) : 0;
    const intakeBeforeRoomPct = consultDenom
      ? Math.round((num(row.intake_before_room) / consultDenom) * 100)
      : 0;

    return Response.json({
      totalVisits,
      todayVisits: num(row.today_visits),
      doneVisits: num(row.done_visits),
      consultedVisits: num(row.consulted_visits),
      intakeCompletedCount: num(row.intake_completed),
      intakeCompletionRate, // %
      avgWaitMin: row.avg_wait_min == null ? null : Number(row.avg_wait_min),
      avgConsultMin: row.avg_consult_min == null ? null : Number(row.avg_consult_min),
      intakeBeforeRoomPct, // headline proof metric, %
      intakeBeforeRoomCount: num(row.intake_before_room),
      intakeBeforeRoomDenom: consultDenom,
    });
  } catch (error) {
    console.error('Error computing analytics:', error);
    return Response.json({ error: 'Failed to compute analytics' }, { status: 500 });
  }
}
