import { requireRole } from '@/lib/auth-guard';
import { mergePatients } from '@/lib/patient';
import { regeneratePatientSummary } from '@/lib/summary';
import { audit } from '@/lib/audit';

/**
 * POST /api/admin/merge-patients  { canonicalId, duplicateId }
 *
 * Admin tool to fold a duplicate patient account into a canonical one when two
 * records turn out to be the same person. Repoints visits/documents/consent,
 * carries over ABHA, and rebuilds the canonical summary.
 */
export async function POST(request: Request) {
  const ctx = await requireRole(request, ['admin']);
  if (ctx instanceof Response) return ctx;

  const { canonicalId, duplicateId } = await request.json();
  if (!canonicalId || !duplicateId) {
    return Response.json({ error: 'canonicalId and duplicateId are required' }, { status: 400 });
  }
  if (canonicalId === duplicateId) {
    return Response.json({ error: 'canonicalId and duplicateId must differ' }, { status: 400 });
  }

  try {
    await mergePatients(canonicalId, duplicateId);
    await regeneratePatientSummary(canonicalId);
    await audit(request, ctx, 'merge_patient', 'patient', `${duplicateId}->${canonicalId}`);
    return Response.json({ ok: true, canonicalId, mergedFrom: duplicateId });
  } catch (e) {
    console.error('Error merging patients:', e);
    return Response.json(
      { error: e instanceof Error ? e.message : 'Merge failed' },
      { status: 500 }
    );
  }
}
