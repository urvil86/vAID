import { openRouterChat, parseLooseJson } from '@/lib/openrouter';
import { requireUser } from '@/lib/auth-guard';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/notes/translate { note, language }
 * Translates the VALUES of a structured clinical note into the doctor's chosen
 * language for READING — the stored note stays English. If the model is
 * unavailable, the original note is returned untranslated (never blocks).
 */
export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  // Best-effort rate limit (shared clinic IP → generous cap).
  try {
    const l = await enforceRateLimit(request, {
      key: `ai:ip:${getClientIp(request)}`,
      windowMs: 3_600_000,
      max: 600,
      route: '/api/notes/translate',
      keyType: 'ip',
      actorId: ctx.userId,
    });
    if (l) return l;
  } catch {
    /* ignore */
  }

  const { note, language } = await request.json();
  if (!note || typeof note !== 'object') {
    return Response.json({ error: 'note is required' }, { status: 400 });
  }
  const target = String(language || 'English').trim();
  if (!target || target === 'English') {
    return Response.json({ note, translated: false });
  }

  const content = await openRouterChat({
    system:
      `You are a professional medical translator. You receive a clinical note as JSON. ` +
      `Translate every human-readable STRING VALUE into ${target}, using the natural script for ${target}. ` +
      `Keep the JSON structure and all keys EXACTLY the same (do not translate keys). ` +
      `For arrays, translate each element. For ICD-10 suggestions keep the "code" untouched and translate only the "term". ` +
      `Keep drug names and dosages recognizable (transliterate rather than translate). ` +
      `Do not add, remove, reorder, or invent fields. Output STRICT JSON only — no prose, no code fences.`,
    user: JSON.stringify(note),
    jsonObject: true,
    maxTokens: 1400,
    temperature: 0.2,
  });

  const parsed = content ? parseLooseJson(content) : null;
  return Response.json({ note: parsed || note, translated: !!parsed });
}
