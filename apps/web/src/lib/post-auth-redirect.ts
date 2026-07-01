/**
 * Single source of truth for where a user lands after authentication, keyed on
 * role + profile completeness. Pure so it can run client- or server-side.
 *
 * NOTE: the onboarding wizard pages are a follow-up; until they exist,
 * incomplete profiles still land on their role home (the app collects the
 * minimum patient demographics at check-in, and staff details on the admin
 * side). Point the onboarding branches at the wizard routes when built.
 */
const STAFF = ['doctor', 'receptionist', 'admin'];

export function postAuthDestination(user: {
  role?: string | null;
  onboardingComplete?: boolean;
}): string {
  const role = user.role ?? null;
  const isStaff = !!role && STAFF.includes(role);

  // Future: if (!user.onboardingComplete) return isStaff ? '/onboarding/staff' : '/onboarding/patient';

  if (isStaff) return '/clinic/queue';
  return '/patient/history';
}
