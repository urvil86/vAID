import sql from '@/app/api/utils/sql';
import { requireRole } from '@/lib/auth-guard';
import { mergePatients } from '@/lib/patient';
import { regeneratePatientSummary } from '@/lib/summary';
import { audit } from '@/lib/audit';

/** Resolve an email, V-Aid ID (VAID-…), or raw user id to a user id. */
async function resolveUserId(input: string): Promise<string | null> {
  const v = input.trim();
  if (!v) return null;
  if (v.includes('@')) {
    const [u] = await sql`SELECT id FROM "user" WHERE lower(email) = lower(${v}) LIMIT 1`;
    return (u?.id as string) ?? null;
  }
  if (/^vaid-/i.test(v)) {
    const [p] = await sql`SELECT user_id FROM patient_profiles WHERE upper(uhid) = upper(${v}) LIMIT 1`;
    return (p?.user_id as string) ?? null;
  }
  const [u] = await sql`SELECT id FROM "user" WHERE id = ${v} LIMIT 1`;
  return (u?.id as string) ?? null;
}

/**
 * POST /api/admin/merge-patients  { canonical, duplicate }
 *
 * Admin tool to fold a duplicate patient into a canonical one. Each field may be
 * an email, a V-Aid ID (VAID-…), or a raw user id. Repoints
 * visits/documents/consent, carries ABHA, rebuilds the summary.
 */
export async function POST(request: Request) {
  const ctx = await requireRole(request, ['admin']);
  if (ctx instanceof Response) return ctx;

  const body = await request.json();
  const canonicalInput = body.canonical ?? body.canonicalId;
  const duplicateInput = body.duplicate ?? body.duplicateId;
  if (!canonicalInput || !duplicateInput) {
    return Response.json(
      { error: 'canonical and duplicate are required (email or V-Aid ID)' },
      { status: 400 }
    );
  }

  const canonicalId = await resolveUserId(String(canonicalInput));
  const duplicateId = await resolveUserId(String(duplicateInput));
  if (!canonicalId)
    return Response.json({ error: `No patient found for "${canonicalInput}"` }, { status: 404 });
  if (!duplicateId)
    return Response.json({ error: `No patient found for "${duplicateInput}"` }, { status: 404 });
  if (canonicalId === duplicateId)
    return Response.json({ error: 'Both identifiers resolve to the same patient' }, { status: 400 });

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
