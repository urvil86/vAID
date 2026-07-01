import { openRouterChat, parseLooseJson } from '@/lib/openrouter';
import { requireUser } from '@/lib/auth-guard';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Adaptive intake follow-up.
 *
 * Given the question just asked and the patient's answer, returns ONE short
 * clarifying question (in the patient's language) when the answer is too thin to
 * structure — otherwise null. Strictly collection-only: never diagnoses,
 * advises, reassures, or alarms (see Section 6 of the build spec).
 */
const SYSTEM_PROMPT = `You are a clinical intake assistant for an outpatient clinic in India. You help collect a clear history for the doctor — you do NOT diagnose, suggest treatment, reassure, or alarm.

You are given one intake question and the patient's answer. Decide if the answer is detailed enough for a doctor to understand, or if it is too thin/vague/ambiguous to structure.

- If the answer is clear and sufficient, return no follow-up.
- If it is too thin (e.g. "pain" with no location/duration, "some medicine" with no name, a one-word answer that needs detail), return EXACTLY ONE short, simple clarifying question to gather the missing detail.

Hard rules:
- Ask at most ONE follow-up. Keep it under 15 words, warm and plain.
- Only collect facts. NEVER name a possible condition, NEVER give advice, NEVER reassure or alarm.
- Write the follow-up in the patient's language (use the natural script).

Output STRICT JSON only, no prose or code fences:
{ "followup": string | null }
Use null for "followup" when no follow-up is needed.`;

export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  // Cap adaptive follow-ups: per patient (20/hr) + per-IP backstop (600/hr;
  // clinics share one IP). followup carries no visit id, so key on the patient.
  const ipLimit = await enforceRateLimit(request, {
    key: `ai:ip:${getClientIp(request)}`,
    windowMs: 3_600_000,
    max: 600,
    route: '/api/intake/followup',
    keyType: 'ip',
    actorId: ctx.userId,
  });
  if (ipLimit) return ipLimit;
  const userLimit = await enforceRateLimit(request, {
    key: `ai:user:${ctx.userId}`,
    windowMs: 3_600_000,
    max: 20,
    route: '/api/intake/followup',
    keyType: 'user',
    actorId: ctx.userId,
  });
  if (userLimit) return userLimit;

  // Data minimisation: with third-party AI disabled, never send the patient's
  // answer to an external model — simply skip the adaptive follow-up.
  if (process.env.DISABLE_THIRD_PARTY_AI === '1') {
    return Response.json({ followup: null });
  }

  try {
    const { question, answer, language } = await request.json();
    if (!answer || typeof answer !== 'string' || !answer.trim()) {
      return Response.json({ followup: null });
    }

    const content = await openRouterChat({
      system: SYSTEM_PROMPT,
      user:
        `Patient language: ${language || 'English'}\n` +
        `Question asked: ${question}\n` +
        `Patient answer: ${answer}\n\n` +
        `Return JSON with one follow-up question (in ${language || 'English'}) only if the answer is too thin to structure; otherwise {"followup": null}.`,
      jsonObject: true,
      maxTokens: 200,
      temperature: 0.3,
    });

    if (!content) return Response.json({ followup: null });
    const parsed = parseLooseJson(content);
    const followup =
      parsed && typeof parsed.followup === 'string' && parsed.followup.trim()
        ? parsed.followup.trim()
        : null;
    return Response.json({ followup });
  } catch (error) {
    console.error('[intake/followup] error', error);
    // Fail open — never block the intake flow on the follow-up.
    return Response.json({ followup: null });
  }
}
