/**
 * Thin OpenRouter client (OpenAI-compatible Chat Completions).
 *
 * Used for AI structuring and on-the-fly question translation. Returns null
 * when no key is configured or the call fails, so callers fall back gracefully.
 * Model is configurable via OPENROUTER_MODEL (default: Gemini 2.5 Flash).
 */

export function openRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function openRouterChat(opts: {
  system?: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  jsonObject?: boolean;
}): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Optional attribution headers shown on OpenRouter dashboards.
      'HTTP-Referer': process.env.BETTER_AUTH_URL || 'http://localhost:4000',
      'X-Title': 'V-Aid Clinical Intake',
    },
    body: JSON.stringify({
      model,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1200,
      ...(opts.jsonObject ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
        { role: 'user', content: opts.user },
      ],
    }),
  });

  if (!res.ok) {
    console.warn('[openrouter] error', res.status, await res.text().catch(() => ''));
    return null;
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? null;
}

/** Parse JSON that may be wrapped in prose or ```json fences. */
export function parseLooseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      /* ignore */
    }
  }
  return null;
}
