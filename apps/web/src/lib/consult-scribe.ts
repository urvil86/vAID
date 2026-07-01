import sql from '@/app/api/utils/sql';

/**
 * Ambient consult recording is gated by BOTH consents:
 *   1. the patient's active 'consult_recording' consent for this visit, AND
 *   2. the treating doctor's standing opt-in (doctor_profiles.consult_recording_optin).
 * Missing either → no capture code runs.
 */
export async function canRecordConsult(
  visitId: string,
  doctorUserId: string,
  isDevBypass: boolean
): Promise<boolean> {
  const [v] = await sql`SELECT patient_id FROM visits WHERE id = ${visitId}`;
  if (!v) return false;

  const [patientConsent] = await sql`
    SELECT 1 FROM consent
    WHERE patient_id = ${v.patient_id}
      AND scope = 'consult_recording'
      AND withdrawn_at IS NULL
      AND (visit_id = ${visitId} OR visit_id IS NULL)
    LIMIT 1
  `;
  if (!patientConsent) return false;

  if (isDevBypass) return true;
  const [doc] = await sql`
    SELECT consult_recording_optin FROM doctor_profiles WHERE user_id = ${doctorUserId}
  `;
  return doc?.consult_recording_optin === true;
}
