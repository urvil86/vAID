import sql from '@/app/api/utils/sql';
import {
  requireRole,
  assertClinic,
  forbidden,
  getAuthContext,
  isStaff,
} from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { checkOrigin } from '@/lib/csrf';

// GET: minimal public fields (name/branding/language) for the pre-auth check-in
// landing; the FULL clinic record (rx_header_json, address…) only for
// authenticated staff scoped to this clinic.
export async function GET(request: Request, { params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params;

  try {
    const ctx = await getAuthContext(request.headers);
    const scopedStaff =
      !!ctx && (ctx.isDevBypass || (isStaff(ctx.role) && ctx.clinicId === clinicId));

    const [clinic] = scopedStaff
      ? await sql`SELECT * FROM clinics WHERE id = ${clinicId}`
      : await sql`SELECT id, name, default_language, branding_json FROM clinics WHERE id = ${clinicId}`;

    if (!clinic) {
      return Response.json({ error: 'Clinic not found' }, { status: 404 });
    }

    return Response.json(clinic);
  } catch (error) {
    console.error('Error fetching clinic:', error);
    return Response.json({ error: 'Failed to fetch clinic' }, { status: 500 });
  }
}

// PUT — update clinic settings (name, address, default language, Rx header,
// branding). Only provided fields change.
export async function PUT(request: Request, { params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params;

  const csrf = checkOrigin(request);
  if (csrf) return csrf;

  const ctx = await requireRole(request, ['admin']);
  if (ctx instanceof Response) return ctx;
  if (!assertClinic(ctx, clinicId)) return forbidden();
  await audit(request, ctx, 'clinic_update', 'clinic', clinicId);

  const body = await request.json();
  const { name, address, default_language, rx_header_json, branding_json } = body;

  try {
    const [clinic] = await sql`
      UPDATE clinics SET
        name = coalesce(${name ?? null}, name),
        address = coalesce(${address ?? null}, address),
        default_language = coalesce(${default_language ?? null}, default_language),
        rx_header_json = coalesce(${rx_header_json ? JSON.stringify(rx_header_json) : null}::jsonb, rx_header_json),
        branding_json = coalesce(${branding_json ? JSON.stringify(branding_json) : null}::jsonb, branding_json)
      WHERE id = ${clinicId}
      RETURNING *
    `;
    if (!clinic) return Response.json({ error: 'Clinic not found' }, { status: 404 });
    return Response.json(clinic);
  } catch (error) {
    console.error('Error updating clinic:', error);
    return Response.json({ error: 'Failed to update clinic' }, { status: 500 });
  }
}
