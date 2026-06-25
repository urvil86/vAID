import { requireRole } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { erasePatient } from '@/lib/erasure';

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

  const ctx = await requireRole(request, ['admin']);
  if (ctx instanceof Response) return ctx;

  try {
    await erasePatient(patientId);
    await audit(request, ctx, 'erase_patient', 'user', patientId);
    return Response.json({ erased: true, patientId });
  } catch (error) {
    console.error('Error erasing patient data:', error);
    return Response.json({ error: 'Failed to erase patient data' }, { status: 500 });
  }
}
