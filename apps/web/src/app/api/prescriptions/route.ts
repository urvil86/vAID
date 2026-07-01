import sql from '@/app/api/utils/sql';
import { requireUser, requireRole, canAccessVisit, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { checkOrigin } from '@/lib/csrf';
import { parseBody, prescriptionCreateSchema } from '@/lib/validation';

// GET /api/prescriptions?visitId=...
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visitId');

  if (!visitId) {
    return Response.json({ error: 'visitId is required' }, { status: 400 });
  }
  if (!(await canAccessVisit(ctx, visitId))) return forbidden();
  await audit(request, ctx, 'read', 'prescription', visitId);

  const rows = await sql`
    SELECT * FROM prescriptions
    WHERE visit_id = ${visitId}
    ORDER BY generated_at DESC
    LIMIT 1
  `;

  return Response.json({ prescription: rows[0] ?? null });
}

// POST /api/prescriptions — doctor only
export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;

  const ctx = await requireRole(request, ['doctor']);
  if (ctx instanceof Response) return ctx;

  const parsed = await parseBody(request, prescriptionCreateSchema);
  if (parsed.error) return parsed.error;
  const { visitId, items, advice, followUpDate } = parsed.data;

  if (!(await canAccessVisit(ctx, visitId))) return forbidden();

  const rows = await sql`
    INSERT INTO prescriptions (visit_id, doctor_id, items_json, advice, follow_up_date)
    VALUES (
      ${visitId},
      ${ctx.userId},
      ${JSON.stringify(items)},
      ${advice || ''},
      ${followUpDate || null}
    )
    RETURNING *
  `;
  await audit(request, ctx, 'create', 'prescription', rows[0]?.id ?? visitId);

  return Response.json({ prescription: rows[0] });
}
