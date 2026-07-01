import sql from '@/app/api/utils/sql';
import { requireRole, canAccessVisit, forbidden } from '@/lib/auth-guard';
import { openRouterChat, parseLooseJson } from '@/lib/openrouter';
import { checkOrigin } from '@/lib/csrf';

/**
 * POST /api/consult/summarize  { visitId }
 *
 * Summarises the ambient consult transcript into a structured 'consult_summary'
 * section (AI DRAFT). The diagnosis field ONLY carries what the doctor said
 * aloud — the prompt forbids inferring one. The result never auto-commits; it
 * goes into the note and through the 1.4 sign flow.
 *
 * Privacy: the transcript carries no identity fields. Once the 3.6
 * deidentification layer lands this should route via the platform proxy tier.
 */
const SYSTEM = `You summarise an outpatient CONSULT conversation (doctor + patient, often code-mixed Hindi/English) into a structured EMR section for the treating doctor.

Rules:
- Capture the condition/situation discussed, findings mentioned, the plan and instructions, and follow-up.
- The "diagnosis_as_stated" field must contain ONLY a diagnosis the DOCTOR stated aloud. If none was stated, use "".
- Never infer or suggest a diagnosis, treatment, or risk that was not said.

Output STRICT JSON only, no prose or code fences:
{ "condition_discussed": string, "findings": [string], "diagnosis_as_stated": string, "plan": [string], "follow_up": string }`;

export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;

  const ctx = await requireRole(request, ['doctor']);
  if (ctx instanceof Response) return ctx;

  const { visitId } = await request.json();
  if (!visitId) return Response.json({ error: 'visitId is required' }, { status: 400 });
  if (!(await canAccessVisit(ctx, visitId))) return forbidden();

  const [rec] = await sql`SELECT transcript FROM consult_recordings WHERE visit_id = ${visitId}`;
  if (!rec?.transcript || !String(rec.transcript).trim()) {
    return Response.json({ error: 'No consult transcript yet' }, { status: 400 });
  }

  const content = await openRouterChat({
    system: SYSTEM,
    user: String(rec.transcript),
    jsonObject: true,
    maxTokens: 700,
    temperature: 0.2,
  });
  const parsed = content ? parseLooseJson(content) : null;
  if (!parsed) {
    return Response.json({ error: 'Could not summarise the consult' }, { status: 502 });
  }
  // Labeled AI DRAFT; the consult UI merges this into the note for editing + sign.
  return Response.json({ consult_summary: parsed, note_status: 'ai_draft' });
}
