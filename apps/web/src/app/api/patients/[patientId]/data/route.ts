import sql from '@/app/api/utils/sql';
import { requireRole, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { erasePatient } from '@/lib/erasure';
import { checkOrigin } from '@/lib/csrf';

/**
 * DELETE /api/patients/[patientId]/data — full subject erasure (admin only).
 *
 * Handles a DPDP "right to erasure" request: clears all of the patient's health
 * content (intake transcripts, structured notes, documents), redacts PII, and
 * withdraws outstanding consents. Visit/prescription shells and the audit log
 * are retained for operational + compliance records.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const { patientId } = await params;

  const csrf = checkOrigin(request);
  if (csrf) return csrf;

  const ctx = await requireRole(request, ['admin']);
  if (ctx instanceof Response) return ctx;

  // Clinic scoping: an admin may only erase a patient seen at their own clinic.
  // Deny with 404 (not 403) so the response doesn't confirm the id exists.
  if (!ctx.isDevBypass) {
    if (!ctx.clinicId) return forbidden('Your account is not attached to a clinic');
    const [seen] = await sql`
      SELECT 1 FROM visits WHERE patient_id = ${patientId} AND clinic_id = ${ctx.clinicId} LIMIT 1
    `;
    if (!seen) {
      await audit(request, ctx, 'ACCESS_DENIED', 'user', patientId);
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
  }

  try {
    await erasePatient(patientId);
    await audit(request, ctx, 'erase_patient', 'user', patientId);
    return Response.json({ erased: true, patientId });
  } catch (error) {
    console.error('Error erasing patient data:', error);
    return Response.json({ error: 'Failed to erase patient data' }, { status: 500 });
  }
}
