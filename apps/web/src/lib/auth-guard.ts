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

/** A staff member may only act within their own clinic. */
export function assertClinic(ctx: AuthContext, clinicId: string | null | undefined): boolean {
  if (ctx.isDevBypass) return true;
  if (!isStaff(ctx.role)) return false;
  return !!clinicId && ctx.clinicId === clinicId;
}

/** Visit-level access: owning patient, or staff in the same clinic. */
export async function canAccessVisit(ctx: AuthContext, visitId: string): Promise<boolean> {
  if (ctx.isDevBypass) return true;
  if (!visitId) return false;
  const [v] = await sql`SELECT patient_id, clinic_id FROM visits WHERE id = ${visitId}`;
  if (!v) return false;
  if (isStaff(ctx.role)) return !!ctx.clinicId && ctx.clinicId === v.clinic_id;
  return ctx.userId === v.patient_id;
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
