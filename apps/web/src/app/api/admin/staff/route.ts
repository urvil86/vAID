import sql from '@/app/api/utils/sql';
import { requireRole, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { checkOrigin } from '@/lib/csrf';

const STAFF_ROLES = ['doctor', 'receptionist', 'admin'];

// GET /api/admin/staff — list the admin's OWN clinic staff (admin only).
// Any client-supplied clinicId is ignored: the clinic is always derived from
// the authenticated admin, so an admin can never enumerate other clinics.
export async function GET(request: Request) {
  const ctx = await requireRole(request, ['admin']);
  if (ctx instanceof Response) return ctx;

  const clinicId = ctx.clinicId;
  if (!clinicId && !ctx.isDevBypass) {
    return forbidden('Your admin account is not attached to a clinic');
  }

  try {
    const staff = await sql`
      SELECT u.id, u.name, u.email, u.role, u.clinic_id,
             dp.registration_no, dp.specialty, dp.verification_status
      FROM "user" u
      LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
      WHERE u.role IN ('doctor', 'receptionist', 'admin')
        AND (${clinicId}::text IS NULL OR u.clinic_id = ${clinicId})
      ORDER BY u.role, u.name
    `;
    return Response.json({ staff });
  } catch (error) {
    console.error('Error listing staff:', error);
    return Response.json({ error: 'Failed to list staff' }, { status: 500 });
  }
}

// POST /api/admin/staff — assign a role + clinic to an existing (signed-up)
// user, by email (admin only). Creating a brand-new staff login requires the
// phone-OTP onboarding (pending — needs an SMS provider), so this promotes an
// existing account.
export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;

  const ctx = await requireRole(request, ['admin']);
  if (ctx instanceof Response) return ctx;

  try {
    const body = await request.json();
    const { email, role, registrationNo, specialty } = body;

    if (!email || !role) {
      return Response.json({ error: 'email and role are required' }, { status: 400 });
    }
    if (!STAFF_ROLES.includes(role)) {
      return Response.json({ error: `role must be one of ${STAFF_ROLES.join(', ')}` }, { status: 400 });
    }
    // Staff are ALWAYS assigned into the admin's own clinic — the client cannot
    // pick a clinic, so an admin can't promote users into another clinic.
    const clinicId = ctx.clinicId;
    if (!clinicId && !ctx.isDevBypass) {
      return forbidden('Your admin account is not attached to a clinic');
    }

    const [user] = await sql`
      UPDATE "user"
      SET role = ${role}, clinic_id = coalesce(${clinicId ?? null}, clinic_id)
      WHERE lower(email) = lower(${email})
      RETURNING id, name, email, role, clinic_id
    `;

    if (!user) {
      return Response.json(
        { error: 'No account with that email. Ask them to sign up first, then assign a role.' },
        { status: 404 }
      );
    }

    await audit(request, ctx, 'staff_assign', 'user', user.id);

    if (role === 'doctor') {
      await sql`
        INSERT INTO doctor_profiles (user_id, registration_no, specialty)
        VALUES (${user.id}, ${registrationNo || null}, ${specialty || null})
        ON CONFLICT (user_id) DO UPDATE SET
          registration_no = coalesce(${registrationNo || null}, doctor_profiles.registration_no),
          specialty = coalesce(${specialty || null}, doctor_profiles.specialty)
      `;
    }

    return Response.json({ user });
  } catch (error) {
    console.error('Error assigning staff:', error);
    return Response.json({ error: 'Failed to assign staff' }, { status: 500 });
  }
}
