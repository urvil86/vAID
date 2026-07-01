/**
 * Sarvam Saaras — Indic speech-to-text (transcribe + translate to English).
 * Server-side only; the key never reaches the client. Returns null when no key
 * is configured so the caller degrades to browser ASR.
 *
 * Docs shape: POST https://api.sarvam.ai/speech-to-text-translate
 *   header:  api-subscription-key: <SARVAM_API_KEY>
 *   body:    multipart/form-data { file, model }
 *   returns: { transcript, language_code, ... }
 */
export function sarvamConfigured(): boolean {
  return Boolean(process.env.SARVAM_API_KEY);
}

export type SarvamResult = {
  transcript: string;
  language_detected: string | null;
  confidence: number | null;
};

export async function transcribeWithSarvam(
  audio: Blob,
  languageHint?: string
): Promise<SarvamResult | null> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return null;

  const form = new FormData();
  form.append('file', audio, 'audio.webm');
  form.append('model', process.env.SARVAM_MODEL || 'saaras:v2');
  if (languageHint) form.append('language_code', languageHint);

  const res = await fetch('https://api.sarvam.ai/speech-to-text-translate', {
    method: 'POST',
    headers: { 'api-subscription-key': key },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Sarvam ASR failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  const data = (await res.json()) as {
    transcript?: string;
    language_code?: string;
    confidence?: number;
  };
  return {
    transcript: data.transcript ?? '',
    language_detected: data.language_code ?? null,
    confidence: typeof data.confidence === 'number' ? data.confidence : null,
  };
}
