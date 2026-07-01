import { randomBytes } from 'node:crypto';
import sql from '@/app/api/utils/sql';
import { requireRole, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { checkOrigin } from '@/lib/csrf';

const STAFF_ROLES = ['doctor', 'receptionist', 'admin'];
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * POST /api/admin/invitations  { email?, phone?, role }
 *
 * An admin mints a staff invite scoped to their own clinic. Accepting the token
 * is the only way to acquire a staff role (self-signups are always 'patient').
 */
export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;

  const ctx = await requireRole(request, ['admin']);
  if (ctx instanceof Response) return ctx;

  const { email, phone, role } = await request.json();
  if (!role || !STAFF_ROLES.includes(role)) {
    return Response.json({ error: `role must be one of ${STAFF_ROLES.join(', ')}` }, { status: 400 });
  }
  if (!email && !phone) {
    return Response.json({ error: 'email or phone is required' }, { status: 400 });
  }
  const clinicId = ctx.clinicId;
  if (!clinicId && !ctx.isDevBypass) {
    return forbidden('Your account is not attached to a clinic');
  }

  const token = randomBytes(16).toString('base64url');
  await sql`
    INSERT INTO invitations (token, email, phone, role, clinic_id, invited_by, expires_at)
    VALUES (${token}, ${email || null}, ${phone || null}, ${role}, ${clinicId}, ${ctx.userId}, ${new Date(Date.now() + INVITE_TTL_MS)})
  `;
  await audit(request, ctx, 'staff_assign', 'invitation', token);

  const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:4000';
  return Response.json({ ok: true, token, acceptUrl: `${baseUrl}/account/accept-invite?token=${token}` });
}
