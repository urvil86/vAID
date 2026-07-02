import sql from '@/app/api/utils/sql';

/**
 * Pilot instrumentation event log (kept in Postgres; no third-party analytics).
 * Best-effort — instrumentation never breaks a clinical flow.
 */
export type EventName =
  | 'intake_started'
  | 'intake_completed'
  | 'intake_abandoned'
  | 'note_signed'
  | 'rx_shared';

export async function logEvent(
  event: EventName,
  visitId: string | null,
  clinicId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await sql`
      INSERT INTO analytics_events (event, visit_id, clinic_id, metadata_json)
      VALUES (${event}, ${visitId}, ${clinicId}, ${JSON.stringify(metadata)})
    `;
  } catch {
    /* best-effort */
  }
}
