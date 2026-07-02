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
        -- Door-to-doctor: check-in → seen. Spans the time the patient spent
        -- filling intake AND queue time — it is NOT pure waiting.
        (SELECT round(avg(extract(epoch FROM (consult_started_at - created_at)) / 60)::numeric, 1)
           FROM v WHERE consult_started_at IS NOT NULL) AS avg_wait_min,
        -- Intake time: how long the patient took to answer the questions.
        (SELECT round(avg(extract(epoch FROM (intake_completed_at - intake_started_at)) / 60)::numeric, 1)
           FROM v WHERE intake_completed_at IS NOT NULL AND intake_started_at IS NOT NULL) AS avg_intake_min,
        (SELECT round(avg(extract(epoch FROM (closed_at - consult_started_at)) / 60)::numeric, 1)
           FROM v WHERE closed_at IS NOT NULL AND consult_started_at IS NOT NULL) AS avg_consult_min,
        (SELECT count(*) FROM v
           WHERE consult_started_at IS NOT NULL
             AND intake_completed_at IS NOT NULL
             AND intake_completed_at <= consult_started_at) AS intake_before_room,
        (SELECT count(*) FROM v WHERE consult_started_at IS NOT NULL) AS consult_denom
    `;

    // ── Note-quality / drift metrics (learning loop, from note_edits) ────────
    const editsByField = (await sql`
      SELECT ne.field, count(*)::int AS edits
      FROM note_edits ne
      JOIN intake_sessions ist ON ist.id = ne.intake_session_id
      JOIN visits v ON v.id = ist.visit_id
      WHERE v.clinic_id = ${clinicId}
      GROUP BY ne.field
      ORDER BY edits DESC
    `) as Array<{ field: string; edits: number }>;
    const structuringSourceMix = (await sql`
      SELECT coalesce(ist.structuring_source, 'unknown') AS source, count(*)::int AS n
      FROM intake_sessions ist
      JOIN visits v ON v.id = ist.visit_id
      WHERE v.clinic_id = ${clinicId} AND ist.structured_note_json IS NOT NULL
      GROUP BY ist.structuring_source
    `) as Array<{ source: string; n: number }>;
    const [signStats] = await sql`
      SELECT
        count(*) FILTER (WHERE ist.signed_at IS NOT NULL)::int AS signed,
        count(*) FILTER (
          WHERE ist.signed_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM note_edits ne WHERE ne.intake_session_id = ist.id)
        )::int AS signed_no_edits
      FROM intake_sessions ist
      JOIN visits v ON v.id = ist.visit_id
      WHERE v.clinic_id = ${clinicId}
    `;

    // ── Pilot metrics (3.5): retention + ops ─────────────────────────────────
    const [retention] = await sql`
      WITH pv AS (
        SELECT patient_id, count(*) AS n,
               (max(created_at) - min(created_at)) AS span
        FROM visits WHERE clinic_id = ${clinicId} GROUP BY patient_id
      )
      SELECT
        count(*) FILTER (WHERE n >= 2 AND span <= interval '90 days')::int AS returned_90d,
        count(*)::int AS total_patients
      FROM pv
    `;
    const [crossClinic] = await sql`
      SELECT
        count(DISTINCT v.patient_id)::int AS patients,
        count(DISTINCT c.patient_id) FILTER (WHERE c.scope = 'history_share' AND c.withdrawn_at IS NULL)::int AS consenting
      FROM visits v
      LEFT JOIN consent c ON c.patient_id = v.patient_id
      WHERE v.clinic_id = ${clinicId}
    `;
    const [ops] = await sql`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM (intake_completed_at - intake_started_at)) / 60
        ) FILTER (WHERE intake_completed_at IS NOT NULL AND intake_started_at IS NOT NULL) AS median_intake_min
      FROM visits WHERE clinic_id = ${clinicId}
    `;
    const [cost] = await sql`
      SELECT coalesce(sum(spend_usd), 0) AS spend, coalesce(sum(calls), 0) AS calls
      FROM ai_usage WHERE clinic_id = ${clinicId}
    `;

    // Visits/day for the last 7 days (bar chart).
    const visitsPerDay = (await sql`
      SELECT to_char(d.day, 'Dy') AS label, coalesce(c.n, 0)::int AS count
      FROM generate_series(current_date - 6, current_date, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT created_at::date AS day, count(*) AS n
        FROM visits WHERE clinic_id = ${clinicId} GROUP BY created_at::date
      ) c ON c.day = d.day::date
      ORDER BY d.day
    `) as Array<{ label: string; count: number }>;

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
      avgWaitMin: row.avg_wait_min == null ? null : Number(row.avg_wait_min), // door-to-doctor
      avgIntakeMin: row.avg_intake_min == null ? null : Number(row.avg_intake_min), // intake-fill time
      avgConsultMin: row.avg_consult_min == null ? null : Number(row.avg_consult_min),
      intakeBeforeRoomPct, // headline proof metric, %
      intakeBeforeRoomCount: num(row.intake_before_room),
      intakeBeforeRoomDenom: consultDenom,
      // Note-quality / drift (learning loop)
      noteQuality: {
        editsByField,
        structuringSourceMix,
        signedNotes: num(signStats?.signed),
        signedWithoutEdits: num(signStats?.signed_no_edits),
      },
      visitsPerDay,
      // Pilot metrics (retention + ops)
      pilot: {
        returningWithin90dPct: num(retention?.total_patients)
          ? Math.round((num(retention?.returned_90d) / num(retention?.total_patients)) * 100)
          : 0,
        crossClinicConsentPct: num(crossClinic?.patients)
          ? Math.round((num(crossClinic?.consenting) / num(crossClinic?.patients)) * 100)
          : 0,
        medianIntakeMin: ops?.median_intake_min == null ? null : Number(ops.median_intake_min),
        aiSpendUsd: num(cost?.spend),
        aiCostPerVisit: totalVisits ? num(cost?.spend) / totalVisits : 0,
      },
    });
  } catch (error) {
    console.error('Error computing analytics:', error);
    return Response.json({ error: 'Failed to compute analytics' }, { status: 500 });
  }
}
