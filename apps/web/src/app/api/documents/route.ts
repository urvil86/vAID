import sql from '@/app/api/utils/sql';
import { requireUser, isStaff, canAccessVisit, forbidden, type AuthContext } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';

// A patient document set is readable by that patient or by clinic staff.
function canAccessPatientDocs(ctx: AuthContext, patientId: string): boolean {
  if (ctx.isDevBypass) return true;
  return isStaff(ctx.role) || ctx.userId === patientId;
}

// GET /api/documents?visitId=... or ?patientId=...
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { searchParams } = new URL(request.url);
  const visitId = searchParams.get('visitId');
  const patientId = searchParams.get('patientId');

  if (!visitId && !patientId) {
    return Response.json({ error: 'visitId or patientId is required' }, { status: 400 });
  }
  if (visitId && !(await canAccessVisit(ctx, visitId))) return forbidden();
  if (!visitId && patientId && !canAccessPatientDocs(ctx, patientId)) return forbidden();
  await audit(request, ctx, 'read', 'document', visitId ?? patientId);

  let rows;
  if (visitId) {
    rows = await sql`
      SELECT * FROM documents
      WHERE visit_id = ${visitId}
      ORDER BY created_at DESC
    `;
  } else {
    rows = await sql`
      SELECT * FROM documents
      WHERE patient_id = ${patientId}
      ORDER BY created_at DESC
    `;
  }

  return Response.json({ documents: rows });
}

// POST /api/documents
export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const body = await request.json();
  const { visitId, type, fileRef, ocrText } = body;
  let { patientId } = body;

  if (!fileRef) {
    return Response.json({ error: 'fileRef is required' }, { status: 400 });
  }

  // A patient uploading from the review screen only knows the visit — derive
  // the patient from it so the client never has to plumb a patient_id through.
  if (!patientId && visitId) {
    const [v] = await sql`SELECT patient_id FROM visits WHERE id = ${visitId} LIMIT 1`;
    patientId = v?.patient_id ?? null;
  }
  if (!patientId) {
    return Response.json({ error: 'patientId or a valid visitId is required' }, { status: 400 });
  }

  // Must be able to access the linked visit (if any) and the patient.
  if (visitId && !(await canAccessVisit(ctx, visitId))) return forbidden();
  if (!canAccessPatientDocs(ctx, patientId)) return forbidden();
  await audit(request, ctx, 'create', 'document', patientId);

  const rows = await sql`
    INSERT INTO documents (patient_id, visit_id, type, file_ref, ocr_text)
    VALUES (
      ${patientId},
      ${visitId || null},
      ${type || 'lab_report'},
      ${fileRef},
      ${ocrText || null}
    )
    RETURNING *
  `;

  return Response.json({ document: rows[0] });
}
