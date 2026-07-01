import type { StructuredNote } from '@/lib/types';

/**
 * Deterministic grounding check. Every medication and allergy in the note must
 * trace back to the transcript — a hallucinated medication in a clinical note is
 * a safety event. Ungrounded entities are NOT deleted; they are appended to
 * confidence_flags so the doctor-review/sign flow forces explicit confirmation.
 *
 * A cheap substring pre-check (per significant token) skips obvious matches; the
 * transcript is native-language + code-mixed, so we match on the drug/substance
 * tokens the model surfaced. (An optional LLM cross-check can be layered on top
 * later for translated/normalised names.)
 */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9ऀ-ॿঀ-ൿ ]/gi, ' ');
}

function isGrounded(entity: string, haystack: string): boolean {
  const tokens = normalise(entity)
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return true; // nothing meaningful to check
  // Grounded if any significant token appears in the transcript.
  return tokens.some((t) => haystack.includes(t));
}

export function applyGrounding(note: StructuredNote, transcript: string): StructuredNote {
  const haystack = normalise(transcript);
  const flags = [...(note.confidence_flags ?? [])];

  const check = (field: string, items?: string[]) => {
    for (const item of items ?? []) {
      if (item && !isGrounded(item, haystack)) {
        flags.push(`${field}: "${item}" not found in transcript — verify`);
      }
    }
  };

  check('current_medications', note.current_medications);
  check('allergies', note.allergies);

  return { ...note, confidence_flags: flags };
}
