import { z } from 'zod';

/**
 * Strict schema for the AI structured note. Every model response is parsed
 * against this before it can touch the database — a malformed note (or a
 * hallucinated shape) never reaches the record. Unknown keys are stripped;
 * field types are enforced; arrays default to empty so downstream reads are safe.
 */
export const structuredNoteSchema = z.object({
  chief_complaint: z.string().default(''),
  history_of_present_illness: z.string().default(''),
  duration: z.string().default(''),
  severity: z.string().default(''),
  associated_symptoms: z.array(z.string()).default([]),
  current_medications: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  past_history: z.array(z.string()).default([]),
  icd10_suggestions: z
    .array(z.object({ code: z.string(), term: z.string() }))
    .default([]),
  confidence_flags: z.array(z.string()).default([]),
  screen_flags: z.array(z.string()).default([]),
});

export type ValidatedNote = z.infer<typeof structuredNoteSchema>;

export function validateStructuredNote(
  raw: unknown
): { ok: true; note: ValidatedNote } | { ok: false; errors: string } {
  const r = structuredNoteSchema.safeParse(raw);
  if (r.success) return { ok: true, note: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  };
}
