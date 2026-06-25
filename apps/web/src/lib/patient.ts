import sql from '@/app/api/utils/sql';

/**
 * Ensure the patient has a profile row — which mints their permanent V-Aid ID
 * (UHID) via the column default — and return it.
 *
 * Best-effort: returns null if the `uhid` column hasn't been migrated onto the
 * database yet, so callers (visit check-in, profile reads) never break before
 * the schema migration is applied.
 */
export async function ensurePatientUhid(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    await sql`
      INSERT INTO patient_profiles (user_id) VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
    `;
    const [row] = await sql`SELECT uhid FROM patient_profiles WHERE user_id = ${userId}`;
    return (row?.uhid as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Merge a duplicate patient into a canonical one: repoint all visits, documents
 * and consent to the canonical user, carry over an ABHA the canonical lacks,
 * then retire the duplicate's profile + summary. The duplicate `user` row is
 * left as an empty shell (no records point to it) rather than hard-deleted.
 *
 * Use the first time two accounts turn out to be the same person.
 */
export async function mergePatients(canonicalId: string, duplicateId: string): Promise<void> {
  if (!canonicalId || !duplicateId || canonicalId === duplicateId) {
    throw new Error('canonicalId and duplicateId must differ and be non-empty');
  }

  await sql`UPDATE visits    SET patient_id = ${canonicalId} WHERE patient_id = ${duplicateId}`;
  await sql`UPDATE documents SET patient_id = ${canonicalId} WHERE patient_id = ${duplicateId}`;
  await sql`UPDATE consent   SET patient_id = ${canonicalId} WHERE patient_id = ${duplicateId}`;

  // Free the duplicate's profile (and its ABHA) from the unique index BEFORE
  // assigning that ABHA to the canonical, to avoid a momentary collision.
  const [dup] = await sql`SELECT abha_id FROM patient_profiles WHERE user_id = ${duplicateId}`;
  await sql`DELETE FROM patient_profiles WHERE user_id = ${duplicateId}`;
  await sql`DELETE FROM patient_summary  WHERE patient_id = ${duplicateId}`;

  if (dup?.abha_id) {
    await sql`
      INSERT INTO patient_profiles (user_id, abha_id) VALUES (${canonicalId}, ${dup.abha_id})
      ON CONFLICT (user_id) DO UPDATE SET
        abha_id = COALESCE(patient_profiles.abha_id, ${dup.abha_id})
    `;
  }
}
