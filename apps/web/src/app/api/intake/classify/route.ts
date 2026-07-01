import { requireUser } from '@/lib/auth-guard';
import { openRouterChat, parseLooseJson } from '@/lib/openrouter';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { BODY_SYSTEMS, branchQuestions, type BodySystem } from '@/data/intake-scripts';

/**
 * POST /api/intake/classify  { chiefComplaint, language?, baseCount? }
 *
 * Classifies the chief complaint into (at most) one body system and returns the
 * targeted branch questions to insert. The classifier output is a FIXED enum,
 * validated; any failure degrades to system:'none' (base script only), so a
 * classification error never blocks intake.
 */
const SYSTEM_PROMPT = `You classify a patient's chief complaint into exactly ONE body system for adaptive clinical intake. Consider the whole complaint (it may be in any Indian language or code-mixed).

Output STRICT JSON only, no prose or code fences:
{ "system": "<one of: fever, respiratory, chest_pain, abdominal, musculoskeletal, skin, headache_neuro, none>" }

Use "none" when it does not clearly fit one system.`;

export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const ipLimit = await enforceRateLimit(request, {
    key: `ai:ip:${getClientIp(request)}`,
    windowMs: 3_600_000,
    max: 600,
    route: '/api/intake/classify',
    keyType: 'ip',
    actorId: ctx.userId,
  });
  if (ipLimit) return ipLimit;

  const { chiefComplaint, language, baseCount } = await request.json();
  if (!chiefComplaint || !String(chiefComplaint).trim()) {
    return Response.json({ system: 'none', branch: [] });
  }

  let system: BodySystem = 'none';
  if (process.env.DISABLE_THIRD_PARTY_AI !== '1') {
    try {
      const content = await openRouterChat({
        system: SYSTEM_PROMPT,
        user: String(chiefComplaint),
        jsonObject: true,
        maxTokens: 40,
        temperature: 0,
      });
      const parsed = content ? parseLooseJson(content) : null;
      const s = parsed?.system;
      if (typeof s === 'string' && (BODY_SYSTEMS as readonly string[]).includes(s)) {
        system = s as BodySystem;
      }
    } catch {
      system = 'none';
    }
  }

  const branch = branchQuestions(system, Number(baseCount) || 7).map((q) => ({
    id: q.id,
    field: q.field,
    text: language === 'Hindi' ? q.hi : q.en,
    hint: '',
  }));
  return Response.json({ system, branch });
}
