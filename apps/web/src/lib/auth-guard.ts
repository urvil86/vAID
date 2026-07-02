/**
 * Server-side authorization layer.
 *
 * Single source of truth for "who can do what" on every API route. Each handler
 * calls one guard at the top; the guard returns an AuthContext on success or a
 * Response (401/403) to return immediately.
 *
 * Access model (build spec §2, §8):
 *   - patient: only their own visits/records.
 *   - receptionist / doctor: scoped to their clinic.
 *   - admin: clinic settings + staff, scoped to their clinic.
 *
 * Dev bypass: when DEV_AUTH_BYPASS=1 and there is no real session, the context
 * is the seeded demo doctor with `isDevBypass = true`, which short-circuits all
 * role/scope checks (super-user) so the local testing flow keeps working. With
 * the bypass off (production), real roles + clinic scoping are enforced.
 */
import { auth } from '@/lib/auth';
import sql from '@/app/api/utils/sql';
import { DEV_AUTH_BYPASS, devAuthUser } from '@/lib/dev-auth';

export type Role = 'patient' | 'receptionist' | 'doctor' | 'admin';
export const STAFF_ROLES: Role[] = ['receptionist', 'doctor', 'admin'];

export type AuthContext = {
  userId: string;
  role: Role | null;
  clinicId: string | null;
  isDevBypass: boolean;
};

export function unauthorized(message = 'Authentication required') {
  return Response.json({ error: message }, { status: 401 });
}
export function forbidden(message = 'You do not have access to this resource') {
  return Response.json({ error: message }, { status: 403 });
}

export function isStaff(role: Role | null): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

/** Resolve the caller: real session first, then the dev-bypass super-user. */
export async function getAuthContext(headers: Headers): Promise<AuthContext | null> {
  const real = await auth.api.getSession({ headers });
  if (real) {
    const u = real.user as { id: string; role?: Role | null; clinic_id?: string | null };
    return { userId: u.id, role: u.role ?? null, clinicId: u.clinic_id ?? null, isDevBypass: false };
  }
  if (DEV_AUTH_BYPASS) {
    const dev = await devAuthUser();
    if (dev)
      return {
        userId: dev.userId,
        role: (dev.role as Role) ?? 'doctor',
        clinicId: dev.clinicId,
        isDevBypass: true,
      };
  }
  return null;
}

/** Require any authenticated user. Returns ctx, or a 401 Response. */
export async function requireUser(req: Request): Promise<AuthContext | Response> {
  const ctx = await getAuthContext(req.headers);
  return ctx ?? unauthorized();
}

/** Require one of the given roles (dev bypass passes). */
export async function requireRole(req: Request, roles: Role[]): Promise<AuthContext | Response> {
  const ctx = await getAuthContext(req.headers);
  if (!ctx) return unauthorized();
  if (ctx.isDevBypass) return ctx;
  if (!ctx.role || !roles.includes(ctx.role)) {
    return forbidden(`Requires role: ${roles.join(' or ')}`);
  }
  return ctx;
}

/** Require any clinic staff (receptionist/doctor/admin). */
export async function requireStaff(req: Request): Promise<AuthContext | Response> {
  return requireRole(req, STAFF_ROLES);
}

/**
 * Require a VERIFIED doctor — used for the actions only a licensed, verified
 * doctor may take (signing notes, issuing prescriptions). A doctor whose
 * verification is still 'pending' can view the queue but is blocked here.
 */
export async function requireVerifiedDoctor(req: Request): Promise<AuthContext | Response> {
  const ctx = await requireRole(req, ['doctor']);
  if (ctx instanceof Response) return ctx;
  if (ctx.isDevBypass) return ctx;
  const [row] = await sql`
    SELECT verification_status FROM doctor_profiles WHERE user_id = ${ctx.userId}
  `;
  if (row?.verification_status !== 'verified') {
    return forbidden(
      'Your doctor account is pending verification — you cannot sign notes or issue prescriptions yet.'
    );
  }
  return ctx;
}

/** A staff member may only act within their own clinic. */
export function assertClinic(ctx: AuthContext, clinicId: string | null | undefined): boolean {
  if (ctx.isDevBypass) return true;
  if (!isStaff(ctx.role)) return false;
  return !!clinicId && ctx.clinicId === clinicId;
}

/**
 * Cross-clinic history sharing: true when the patient granted an active
 * (non-withdrawn) `history_share` consent. When a clinicId is given, the consent
 * must have been granted at THAT clinic (i.e. the patient actually checked in
 * there) — so only a clinic treating the patient unlocks the cross-clinic
 * record, never an unrelated one. Without it, staff see only their own clinic.
 */
export async function hasHistoryShareConsent(
  patientId: string,
  clinicId?: string | null
): Promise<boolean> {
  if (!patientId) return false;
  if (clinicId) {
    const [c] = await sql`
      SELECT 1
      FROM consent co
      JOIN visits v ON co.visit_id = v.id
      WHERE co.patient_id = ${patientId}
        AND co.scope = 'history_share'
        AND co.withdrawn_at IS NULL
        AND v.clinic_id::text = ${clinicId}
      LIMIT 1
    `;
    return !!c;
  }
  const [c] = await sql`
    SELECT 1 FROM consent
    WHERE patient_id = ${patientId}
      AND scope = 'history_share'
      AND withdrawn_at IS NULL
    LIMIT 1
  `;
  return !!c;
}

/** Visit-level access: owning patient, or staff in the same clinic. */
export async function canAccessVisit(ctx: AuthContext, visitId: string): Promise<boolean> {
  if (ctx.isDevBypass) return true;
  if (!visitId) return false;
  const [v] = await sql`SELECT patient_id, clinic_id FROM visits WHERE id = ${visitId}`;
  if (!v) return false;
  if (isStaff(ctx.role)) return !!ctx.clinicId && ctx.clinicId === v.clinic_id;
  if (ctx.userId === v.patient_id) return true;
  // The account holder may access a dependent's visit they manage (family 3.3).
  const [managed] = await sql`
    SELECT 1 FROM patient_profiles WHERE user_id = ${v.patient_id} AND managed_by = ${ctx.userId}
  `;
  return !!managed;
}

/**
 * True when ctx may act on behalf of `patientId`: themselves, or a dependent
 * they manage (family 3.3). Does not grant staff access — callers layer that on.
 */
export async function canActAsPatient(ctx: AuthContext, patientId: string): Promise<boolean> {
  if (ctx.isDevBypass) return true;
  if (!patientId) return false;
  if (ctx.userId === patientId) return true;
  const [m] = await sql`
    SELECT 1 FROM patient_profiles WHERE user_id = ${patientId} AND managed_by = ${ctx.userId}
  `;
  return !!m;
}

/** Intake-session access — resolved via its visit. */
export async function canAccessIntakeSession(ctx: AuthContext, sessionId: string): Promise<boolean> {
  if (ctx.isDevBypass) return true;
  if (!sessionId) return false;
  const [s] = await sql`SELECT visit_id FROM intake_sessions WHERE id = ${sessionId}`;
  if (!s) return false;
  return canAccessVisit(ctx, s.visit_id as string);
}

/** Prescription access — resolved via its visit. */
export async function canAccessPrescription(ctx: AuthContext, prescriptionId: string): Promise<boolean> {
  if (ctx.isDevBypass) return true;
  if (!prescriptionId) return false;
  const [p] = await sql`SELECT visit_id FROM prescriptions WHERE id = ${prescriptionId}`;
  if (!p) return false;
  return canAccessVisit(ctx, p.visit_id as string);
}
