/**
 * Dev-only auth bypass for the testing phase.
 *
 * When DEV_AUTH_BYPASS=1, server routes that would otherwise 401 fall back to a
 * real seeded demo user instead of requiring a logged-in session. A real
 * session always takes precedence, and with the flag off these helpers behave
 * exactly like `auth.api.getSession`, so production behaviour is unchanged.
 *
 * Turn off by removing DEV_AUTH_BYPASS / NEXT_PUBLIC_DEV_AUTH_BYPASS from .env.
 */
import sql from '@/app/api/utils/sql';
import { auth } from '@/lib/auth';

export const DEV_AUTH_BYPASS = process.env.DEV_AUTH_BYPASS === '1';

type RealSession = Awaited<ReturnType<typeof auth.api.getSession>>;

let cachedDoctor:
  | { id: string; email: string; name: string; role: string | null; clinic_id: string | null }
  | null = null;
let cachedPatientId: string | null = null;

async function devDoctor() {
  if (cachedDoctor) return cachedDoctor;
  const doctors = await sql`
    SELECT id, email, name, role, clinic_id FROM "user"
    WHERE role = 'doctor' ORDER BY "createdAt" ASC LIMIT 1
  `;
  // Fall back to any user if no doctor has been seeded yet.
  const rows = doctors.length
    ? doctors
    : await sql`SELECT id, email, name, role, clinic_id FROM "user" ORDER BY "createdAt" ASC LIMIT 1`;
  const row = rows[0];
  cachedDoctor = row
    ? { id: row.id, email: row.email, name: row.name, role: row.role, clinic_id: row.clinic_id ?? null }
    : null;
  return cachedDoctor;
}

/**
 * Identity used by the authorization layer when the dev bypass is active and no
 * real session is present. Returns the seeded demo doctor (id, role, clinic),
 * or null when the bypass is off.
 */
export async function devAuthUser(): Promise<
  { userId: string; role: string | null; clinicId: string | null } | null
> {
  if (!DEV_AUTH_BYPASS) return null;
  const u = await devDoctor();
  if (!u) return null;
  return { userId: u.id, role: u.role, clinicId: u.clinic_id };
}

/**
 * Like `auth.api.getSession`, but returns a synthetic session for a seeded demo
 * doctor when no real session exists and the bypass flag is on.
 */
export async function getSessionOrDev(args: { headers: Headers }): Promise<RealSession> {
  const real = await auth.api.getSession(args);
  if (real || !DEV_AUTH_BYPASS) return real;

  const u = await devDoctor();
  if (!u) return null;

  const now = new Date();
  return {
    session: {
      id: 'dev-session',
      token: 'dev-bypass',
      userId: u.id,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    },
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  } as unknown as RealSession;
}

/**
 * Resolve the patient id for a write. With the bypass on, a missing or
 * placeholder ("temp-patient") id is replaced with a seeded demo patient so the
 * visit's user JOINs resolve. Otherwise the id is returned untouched.
 */
export async function resolveDevPatientId(rawId: unknown): Promise<string | null> {
  const id = typeof rawId === 'string' ? rawId : null;
  if (!DEV_AUTH_BYPASS) return id;
  if (id && id !== 'temp-patient') return id;

  if (cachedPatientId) return cachedPatientId;
  const [p] = await sql`
    SELECT id FROM "user" WHERE role = 'patient' ORDER BY "createdAt" ASC LIMIT 1
  `;
  cachedPatientId = (p?.id as string) ?? (await devDoctor())?.id ?? null;
  return cachedPatientId;
}
