import sql from '@/app/api/utils/sql';
import { requireUser, requireRole, canAccessPrescription, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';

// GET /api/prescriptions/[prescriptionId]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ prescriptionId: string }> }
) {
  const { prescriptionId } = await params;

  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  if (!(await canAccessPrescription(ctx, prescriptionId))) return forbidden();
  await audit(request, ctx, 'read', 'prescription', prescriptionId);

  const rows = await sql`
    SELECT p.*, v.token_no, v.patient_id,
           u.name as patient_name,
           d.name as doctor_name,
           dp.registration_no, dp.specialty,
           c.name as clinic_name, c.address as clinic_address, c.rx_header_json
    FROM prescriptions p
    JOIN visits v ON p.visit_id = v.id
    JOIN "user" u ON v.patient_id = u.id
    JOIN "user" d ON p.doctor_id = d.id
    LEFT JOIN doctor_profiles dp ON p.doctor_id = dp.user_id
    LEFT JOIN clinics c ON v.clinic_id = c.id
    WHERE p.id = ${prescriptionId}
  `;

  if (rows.length === 0) {
    return Response.json({ error: 'Prescription not found' }, { status: 404 });
  }

  return Response.json({ prescription: rows[0] });
}

// PUT /api/prescriptions/[prescriptionId]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ prescriptionId: string }> }
) {
  const { prescriptionId } = await params;

  const ctx = await requireRole(request, ['doctor']);
  if (ctx instanceof Response) return ctx;
  if (!(await canAccessPrescription(ctx, prescriptionId))) return forbidden();
  await audit(request, ctx, 'update', 'prescription', prescriptionId);

  const body = await request.json();
  const { items, advice, followUpDate } = body;

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (items !== undefined) {
    setClauses.push(`items_json = $${idx++}`);
    values.push(JSON.stringify(items));
  }
  if (advice !== undefined) {
    setClauses.push(`advice = $${idx++}`);
    values.push(advice);
  }
  if (followUpDate !== undefined) {
    setClauses.push(`follow_up_date = $${idx++}`);
    values.push(followUpDate || null);
  }

  if (setClauses.length === 0) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 });
  }

  values.push(prescriptionId);
  const query = `UPDATE prescriptions SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
  const rows = await sql(query, values);

  return Response.json({ prescription: rows[0] });
}
