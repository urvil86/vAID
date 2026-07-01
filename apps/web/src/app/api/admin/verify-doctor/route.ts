import sql from '@/app/api/utils/sql';
import { requireRole, forbidden } from '@/lib/auth-guard';
import { setDoctorVerification } from '@/lib/verification';
import { audit } from '@/lib/audit';
import { checkOrigin } from '@/lib/csrf';

/**
 * POST /api/admin/verify-doctor  { userId, status?, registryRef? }
 *
 * An admin verifies (or rejects) a doctor in their clinic after checking the
 * registration number against the issuing council's public register. Until
 * verified, the doctor cannot sign notes or issue prescriptions.
 */
export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;

  const ctx = await requireRole(request, ['admin']);
  if (ctx instanceof Response) return ctx;

  const { userId, status, registryRef } = await request.json();
  if (!userId) return Response.json({ error: 'userId is required' }, { status: 400 });
  const nextStatus: 'verified' | 'rejected' = status === 'rejected' ? 'rejected' : 'verified';

  // The doctor must belong to the admin's own clinic.
  if (!ctx.isDevBypass) {
    if (!ctx.clinicId) return forbidden('Your account is not attached to a clinic');
    const [u] = await sql`
      SELECT 1 FROM "user"
      WHERE id = ${userId} AND role = 'doctor' AND clinic_id = ${ctx.clinicId}
    `;
    if (!u) return Response.json({ error: 'Not found' }, { status: 404 });
  }

  await setDoctorVerification(userId, nextStatus, ctx.userId, registryRef || null);
  await audit(request, ctx, 'staff_assign', 'user', userId);
  return Response.json({ ok: true, status: nextStatus });
}
