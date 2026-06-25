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
