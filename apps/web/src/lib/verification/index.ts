import sql from '@/app/api/utils/sql';

/**
 * Doctor identity verification. Structured so an automated NMC/state-council
 * registry lookup can drop in later behind verifyAgainstRegistry(); for now a
 * verified status is a manual admin decision that records who verified, when,
 * and the registry reference they checked.
 */
export async function isDoctorVerified(userId: string): Promise<boolean> {
  const [row] = await sql`
    SELECT verification_status FROM doctor_profiles WHERE user_id = ${userId}
  `;
  return row?.verification_status === 'verified';
}

export async function setDoctorVerification(
  userId: string,
  status: 'verified' | 'rejected',
  verifiedBy: string,
  registryRef: string | null
): Promise<void> {
  await sql`
    UPDATE doctor_profiles
    SET verification_status = ${status},
        verified_by = ${verifiedBy},
        verified_at = now(),
        registry_ref = ${registryRef ?? null}
    WHERE user_id = ${userId}
  `;
}
