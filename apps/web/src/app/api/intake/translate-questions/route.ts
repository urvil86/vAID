import { LANGUAGE_STRINGS, getStrings } from '@/lib/i18n';
import { openRouterChat, parseLooseJson } from '@/lib/openrouter';
import { requireUser } from '@/lib/auth-guard';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';

type Q = { text: string; hint: string };

// Translations are deterministic per language, so cache them for the process
// lifetime — every patient who picks Tamil reuses the same translated set.
const cache = new Map<string, Q[]>();

// GET /api/intake/translate-questions?language=Tamil
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  // Per-IP backstop (600/hr; clinics share one IP) + a light per-user cap.
  const ipLimit = await enforceRateLimit(request, {
    key: `ai:ip:${getClientIp(request)}`,
    windowMs: 3_600_000,
    max: 600,
    route: '/api/intake/translate-questions',
    keyType: 'ip',
    actorId: ctx.userId,
  });
  if (ipLimit) return ipLimit;
  const userLimit = await enforceRateLimit(request, {
    key: `ai:user:${ctx.userId}`,
    windowMs: 3_600_000,
    max: 20,
    route: '/api/intake/translate-questions',
    keyType: 'user',
    actorId: ctx.userId,
  });
  if (userLimit) return userLimit;

  const { searchParams } = new URL(request.url);
  const language = (searchParams.get('language') || 'English').trim();

  // Languages with fully localized UI strings (Hindi, English) are served
  // straight from i18n — no model call needed.
  if (LANGUAGE_STRINGS[language]) {
    return Response.json({ questions: getStrings(language).questions, translated: false });
  }

  if (cache.has(language)) {
    return Response.json({ questions: cache.get(language), translated: true });
  }

  const base = getStrings('English').questions; // canonical English source
  const englishTexts = base.map((q) => q.text);

  const content = await openRouterChat({
    system: `You are a professional medical translator for an outpatient clinic in India. Translate each clinical intake question into ${language}, using simple, warm, patient-friendly wording a layperson easily understands. Preserve the clinical meaning. Use the natural script for ${language}. Output STRICT JSON only, no prose or code fences, of the form {"questions": [<one translated string per input, in the same order>]}.`,
    user:
      `Translate these ${englishTexts.length} questions into ${language}:\n` +
      englishTexts.map((t, i) => `${i + 1}. ${t}`).join('\n'),
    jsonObject: true,
    maxTokens: 900,
    temperature: 0.2,
  });

  let translated: Q[] | null = null;
  if (content) {
    const parsed = parseLooseJson(content);
    const arr = Array.isArray(parsed?.questions)
      ? (parsed!.questions as unknown[])
      : Array.isArray(parsed)
        ? (parsed as unknown[])
        : null;
    if (arr && arr.length === base.length) {
      // Keep the English original as the hint so staff have a reference.
      translated = base.map((q, i) => ({ text: String(arr[i]).trim() || q.text, hint: q.text }));
    }
  }

  if (!translated) {
    // Fall back to English questions if the model is unavailable or malformed.
    return Response.json({ questions: base, translated: false });
  }

  cache.set(language, translated);
  return Response.json({ questions: translated, translated: true });
}
