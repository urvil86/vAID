import sql from '@/app/api/utils/sql';
import { requireUser } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';

/**
 * GET /api/my-record — the patient-held record (3.6). On the patient's own
 * authenticated device the record renders FULLY identified; this exports the
 * complete identified record (JSON) as the patient-owned copy. The server keeps
 * identity sealed; the patient holds their own full copy.
 */
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const [user] = await sql`SELECT id, name, email, "phoneNumber" AS phone FROM "user" WHERE id = ${ctx.userId}`;
  const [profile] = await sql`
    SELECT uhid, abha_id, abha_verified, date_of_birth, sex FROM patient_profiles WHERE user_id = ${ctx.userId}
  `;
  const visits = await sql`
    SELECT v.id, v.token_no, v.status, v.created_at,
           ist.structured_note_json, ist.note_status, ist.signed_at
    FROM visits v
    LEFT JOIN LATERAL (
      SELECT structured_note_json, note_status, signed_at FROM intake_sessions
      WHERE visit_id = v.id ORDER BY created_at DESC LIMIT 1
    ) ist ON true
    WHERE v.patient_id = ${ctx.userId}
    ORDER BY v.created_at DESC
  `;
  const prescriptions = await sql`
    SELECT p.id, p.items_json, p.advice, p.follow_up_date, p.generated_at
    FROM prescriptions p JOIN visits v ON v.id = p.visit_id
    WHERE v.patient_id = ${ctx.userId} ORDER BY p.generated_at DESC
  `;
  const conditions = await sql`SELECT code_icd10, display_text, clinical_status, recorded_at FROM conditions WHERE patient_id = ${ctx.userId}`;
  const medications = await sql`SELECT drug_name, dose, frequency, status, source, recorded_at FROM medication_statements WHERE patient_id = ${ctx.userId}`;
  const allergies = await sql`SELECT substance, reaction, severity, recorded_at FROM allergy_intolerances WHERE patient_id = ${ctx.userId}`;

  await audit(request, ctx, 'read', 'patient_record', ctx.userId);

  return Response.json({
    exported_at: new Date().toISOString(),
    patient: { ...user, ...profile },
    visits,
    prescriptions,
    conditions,
    medications,
    allergies,
  });
}
