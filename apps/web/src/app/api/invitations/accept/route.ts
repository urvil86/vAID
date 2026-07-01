import sql from '@/app/api/utils/sql';
import { requireUser } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { checkOrigin } from '@/lib/csrf';

/**
 * POST /api/invitations/accept  { token }
 *
 * The invited person (already signed in) accepts a valid, unexpired invite and
 * is granted the staff role + clinic. This is the ONLY path to a staff role;
 * a doctor lands as verification_status='pending' until an admin verifies them.
 */
export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;

  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { token } = await request.json();
  if (!token) return Response.json({ error: 'token is required' }, { status: 400 });

  const [inv] = await sql`SELECT * FROM invitations WHERE token = ${token}`;
  if (!inv) return Response.json({ error: 'This invite is not valid.' }, { status: 404 });
  if (inv.accepted_at) {
    return Response.json({ error: 'This invite has already been used.' }, { status: 409 });
  }
  if (new Date(inv.expires_at as string) < new Date()) {
    return Response.json({ error: 'This invite has expired.' }, { status: 410 });
  }

  await sql`
    UPDATE "user" SET role = ${inv.role}, clinic_id = ${inv.clinic_id} WHERE id = ${ctx.userId}
  `;
  await sql`
    UPDATE invitations SET accepted_at = now(), accepted_by = ${ctx.userId} WHERE token = ${token}
  `;
  if (inv.role === 'doctor') {
    // Doctor lands pending — an admin must verify before they can sign/prescribe.
    await sql`
      INSERT INTO doctor_profiles (user_id) VALUES (${ctx.userId}) ON CONFLICT (user_id) DO NOTHING
    `;
  }
  await audit(request, ctx, 'staff_assign', 'user', ctx.userId);
  return Response.json({ ok: true, role: inv.role });
}
