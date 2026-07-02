import sql from '@/app/api/utils/sql';
import { requireUser } from '@/lib/auth-guard';
import { checkOrigin } from '@/lib/csrf';

/** GET /api/favorites — the patient's favourite clinics (for quick check-in). */
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  const favorites = await sql`
    SELECT f.clinic_id, c.name, c.default_language
    FROM patient_favorites f JOIN clinics c ON c.id = f.clinic_id
    WHERE f.patient_id = ${ctx.userId}
    ORDER BY f.created_at DESC
  `;
  return Response.json({ favorites });
}

/** POST /api/favorites { clinicId } — add a favourite. */
export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  const { clinicId } = await request.json();
  if (!clinicId) return Response.json({ error: 'clinicId is required' }, { status: 400 });
  await sql`
    INSERT INTO patient_favorites (patient_id, clinic_id)
    VALUES (${ctx.userId}, ${clinicId}) ON CONFLICT DO NOTHING
  `;
  return Response.json({ ok: true });
}

/** DELETE /api/favorites?clinicId=... — remove a favourite. */
export async function DELETE(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  const clinicId = new URL(request.url).searchParams.get('clinicId');
  if (!clinicId) return Response.json({ error: 'clinicId is required' }, { status: 400 });
  await sql`DELETE FROM patient_favorites WHERE patient_id = ${ctx.userId} AND clinic_id = ${clinicId}`;
  return Response.json({ ok: true });
}
