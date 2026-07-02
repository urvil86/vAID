import sql from '@/app/api/utils/sql';
import { requireUser, canAccessVisit, forbidden } from '@/lib/auth-guard';
import { openRouterChat, parseLooseJson } from '@/lib/openrouter';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { deidentify } from '@/lib/deidentify';
import { audit } from '@/lib/audit';

/**
 * Ambient consult scribe. The consult conversation is transcribed in the
 * browser and posted here as text; we structure it into an English EMR consult
 * note and store ONLY the structured result on the visit's intake session. The
 * raw transcript/recording is never persisted — it is discarded by the client
 * once this returns (the deletion the doctor asked for).
 *
 * POST /api/consult/scribe { visitId, transcript, language? }
 */
const SYSTEM_PROMPT = `You are a clinical documentation assistant. You receive a rough transcript of a spoken consultation between a doctor and a patient in an Indian outpatient clinic. The speakers may use Hindi, English, or any Indian language, often code-mixed.

Produce a concise, structured consultation note in clear clinical ENGLISH for the medical record. Do NOT invent findings; only capture what was discussed. You are documentation support, not a decision-maker — do not add a diagnosis the doctor did not state.

Output STRICT JSON only — no prose, no markdown, no code fences — matching exactly:
{
  "summary": string,                 // 1-3 sentence gist of the encounter
  "subjective": string,              // what the patient reported
  "objective": string,               // exam findings / vitals mentioned aloud
  "assessment": string,              // the doctor's stated impression (empty if none)
  "plan": [string],                  // next steps the doctor stated (meds, tests, advice, follow-up)
  "medications_discussed": [string], // drugs mentioned, with dose if stated
  "follow_up": string                // follow-up interval if stated, else ""
}
Every field must be present. Use "" for empty strings and [] for empty arrays. Never output anything outside the JSON.`;

function normalize(p: Record<string, unknown>) {
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => x != null && String(x).trim()).map((x) => String(x).trim()) : [];
  return {
    summary: String(p.summary ?? ''),
    subjective: String(p.subjective ?? ''),
    objective: String(p.objective ?? ''),
    assessment: String(p.assessment ?? ''),
    plan: list(p.plan),
    medications_discussed: list(p.medications_discussed),
    follow_up: String(p.follow_up ?? ''),
  };
}

export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { visitId, transcript } = await request.json();
  if (!visitId || !transcript || !String(transcript).trim()) {
    return Response.json({ error: 'visitId and transcript are required' }, { status: 400 });
  }
  if (!(await canAccessVisit(ctx, visitId))) return forbidden();

  try {
    const l = await enforceRateLimit(request, {
      key: `ai:ip:${getClientIp(request)}`,
      windowMs: 3_600_000,
      max: 600,
      route: '/api/consult/scribe',
      keyType: 'ip',
      actorId: ctx.userId,
    });
    if (l) return l;
  } catch {
    /* ignore */
  }

  try {
    await audit(request, ctx, 'scribe', 'visit', visitId);
  } catch {
    /* ignore */
  }

  // De-identify before the third-party model (same discipline as intake 3.6).
  let ident: { name?: string; phone?: string; abha?: string } | undefined;
  try {
    [ident] = await sql`
      SELECT u.name, u."phoneNumber" AS phone, pp.abha_id AS abha
      FROM visits v JOIN "user" u ON u.id = v.patient_id
      LEFT JOIN patient_profiles pp ON pp.user_id = u.id
      WHERE v.id = ${visitId}
    `;
  } catch {
    /* names just won't be scrubbed by identity; proceed */
  }
  const safe = deidentify(String(transcript), {
    name: ident?.name as string,
    phone: ident?.phone as string,
    abha: ident?.abha as string,
  });

  const content = await openRouterChat({
    system: SYSTEM_PROMPT,
    user: `Consultation transcript:\n\n${safe}`,
    jsonObject: true,
    maxTokens: 1200,
    temperature: 0.2,
  });

  const parsed = content ? parseLooseJson(content) : null;
  if (!parsed) {
    return Response.json(
      { error: 'Could not structure the consult. The transcription service may be unavailable.' },
      { status: 502 }
    );
  }
  const note = normalize(parsed);

  // Persist ONLY the structured note against the visit's intake session. The raw
  // transcript is not stored here or anywhere — the client discards it.
  try {
    const [s] = await sql`
      SELECT id FROM intake_sessions WHERE visit_id = ${visitId}
      ORDER BY (transcript_native IS NOT NULL) DESC, created_at DESC LIMIT 1
    `;
    if (s?.id) {
      await sql`
        UPDATE intake_sessions
        SET consult_note_json = ${note}, consult_recorded_at = now()
        WHERE id = ${s.id}
      `;
    }
  } catch (e) {
    console.warn('[scribe] could not persist consult note (schema may be behind):', e);
  }

  return Response.json({ consultNote: note });
}
