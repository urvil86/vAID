import sql from '@/app/api/utils/sql';
import { requireUser, isStaff, forbidden } from '@/lib/auth-guard';
import { checkOrigin } from '@/lib/csrf';
import { regeneratePatientSummary } from '@/lib/summary';

/**
 * POST /api/patient-summary/resolve  { problem, patientId? }
 *
 * Marks a summary problem resolved so it stops appearing as active. A patient
 * resolves their own; staff may resolve for a patientId. Marks any matching
 * coded condition 'resolved' AND suppresses the note-derived problem text, then
 * rebuilds the summary.
 */
export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { problem, patientId } = await request.json();
  if (!problem || !String(problem).trim()) {
    return Response.json({ error: 'problem is required' }, { status: 400 });
  }
  const target = patientId || ctx.userId;
  if (target !== ctx.userId && !isStaff(ctx.role) && !ctx.isDevBypass) return forbidden();

  const norm = String(problem).trim().toLowerCase();

  await sql`
    INSERT INTO resolved_problems (patient_id, problem_norm)
    VALUES (${target}, ${norm}) ON CONFLICT DO NOTHING
  `;
  await sql`
    UPDATE conditions SET clinical_status = 'resolved'
    WHERE patient_id = ${target} AND lower(display_text) = ${norm}
  `;
  await regeneratePatientSummary(target);

  return Response.json({ ok: true });
}
