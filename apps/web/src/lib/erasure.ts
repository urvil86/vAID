/**
 * DPDP Act 2023 — right to erasure / withdrawal.
 *
 * Removes identifiable health content while retaining the minimal operational
 * shell (visit token + timestamps, prescription record) and the audit trail —
 * which is itself a compliance requirement and must survive an erasure.
 *
 *   eraseVisitIntake — clears one visit's captured intake (on consent withdrawal).
 *   erasePatient     — clears all of a patient's health content + redacts PII
 *                      (on a subject erasure request).
 */
import sql from '@/app/api/utils/sql';

/** Clear the captured intake content (and documents) for a single visit. */
export async function eraseVisitIntake(visitId: string): Promise<void> {
  await sql`
    UPDATE intake_sessions SET
      transcript_native = NULL,
      transcript_english = NULL,
      structured_note_json = NULL,
      screen_flags_json = NULL,
      confidence_flags_json = NULL,
      audio_refs_json = NULL,
      status = 'WITHDRAWN'
    WHERE visit_id = ${visitId}
  `;
  await sql`DELETE FROM documents WHERE visit_id = ${visitId}`;
}

/** Full subject erasure: all health content for the patient + PII redaction. */
export async function erasePatient(patientId: string): Promise<void> {
  await sql`
    UPDATE intake_sessions SET
      transcript_native = NULL,
      transcript_english = NULL,
      structured_note_json = NULL,
      screen_flags_json = NULL,
      confidence_flags_json = NULL,
      audio_refs_json = NULL,
      status = 'WITHDRAWN'
    WHERE visit_id IN (SELECT id FROM visits WHERE patient_id = ${patientId})
  `;
  await sql`DELETE FROM documents WHERE patient_id = ${patientId}`;
  await sql`
    UPDATE patient_profiles
    SET date_of_birth = NULL, sex = NULL, abha_id = NULL
    WHERE user_id = ${patientId}
  `;
  await sql`UPDATE "user" SET name = '[erased]', image = NULL WHERE id = ${patientId}`;
  await sql`
    UPDATE consent SET withdrawn_at = now()
    WHERE patient_id = ${patientId} AND withdrawn_at IS NULL
  `;
}
