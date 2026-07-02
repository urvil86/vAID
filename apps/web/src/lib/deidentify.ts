/**
 * Deterministic de-identification applied BEFORE any third-party AI call
 * (OpenRouter, Sarvam). No name, phone, ABHA, DOB, or address should reach a
 * third party. Known identity values for the patient are redacted first, then a
 * regex layer catches phone/ABHA patterns the patient may have spoken. Values
 * are replaced with stable placeholders ([PATIENT], [PHONE], [ABHA]) that are
 * only ever restored to display values at doctor-facing render time.
 */
export type KnownIdentity = {
  name?: string | null;
  phone?: string | null;
  abha?: string | null;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function deidentify(text: string, known: KnownIdentity = {}): string {
  let out = text || '';
  if (!out) return out;

  // Redact known values first, longest-first so a full name goes before a token.
  const pairs: Array<[string, string]> = [];
  if (known.name) pairs.push([known.name, '[PATIENT]']);
  if (known.phone) pairs.push([known.phone, '[PHONE]']);
  if (known.abha) pairs.push([known.abha, '[ABHA]']);
  pairs
    .filter(([v]) => v && v.trim().length >= 3)
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([value, token]) => {
      out = out.replace(new RegExp(escapeRegExp(value.trim()), 'gi'), token);
    });

  // Pattern layer: Indian phone numbers and ABHA numbers.
  out = out.replace(/\+?91[-\s]?\d{5}[-\s]?\d{5}/g, '[PHONE]');
  out = out.replace(/(?<!\d)\d{10}(?!\d)/g, '[PHONE]');
  out = out.replace(/\b\d{2}-?\d{4}-?\d{4}-?\d{4}\b/g, '[ABHA]');

  return out;
}
