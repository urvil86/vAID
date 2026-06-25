import sql from '@/app/api/utils/sql';
import { requireUser, isStaff, forbidden, hasHistoryShareConsent } from '@/lib/auth-guard';
import { regeneratePatientSummary } from '@/lib/summary';
import { audit } from '@/lib/audit';

// GET /api/patient-summary?patientId=  (defaults to the caller)
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get('patientId') || ctx.userId;

  // The summary spans clinics, so it follows the same rule as the longitudinal
  // record: self, dev, or staff WITH an active history-share consent.
  const isSelf = ctx.userId === patientId;
  const allowed =
    ctx.isDevBypass ||
    isSelf ||
    (isStaff(ctx.role) && (await hasHistoryShareConsent(patientId, ctx.clinicId)));
  if (!allowed) return forbidden();

  await audit(request, ctx, 'read', 'patient_summary', patientId);

  let row: Record<string, unknown> | null = null;
  try {
    [row] = await sql`
      SELECT problems_json, medications_json, allergies_json, updated_at
      FROM patient_summary WHERE patient_id = ${patientId}
    `;
  } catch {
    row = null;
  }

  if (!row) {
    // Build it lazily the first time it's viewed.
    const fresh = await regeneratePatientSummary(patientId);
    return Response.json({
      summary: fresh
        ? { problems: fresh.problems, medications: fresh.medications, allergies: fresh.allergies }
        : null,
    });
  }

  return Response.json({
    summary: {
      problems: row.problems_json ?? [],
      medications: row.medications_json ?? [],
      allergies: row.allergies_json ?? [],
      updated_at: row.updated_at,
    },
  });
}
