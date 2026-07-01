import { z } from 'zod';

/**
 * Request-body schemas. Parse at the top of a route with parseBody(); it returns
 * either { data } or a ready-to-return 400 Response with field-level errors.
 * Unknown keys are stripped (`.strict()` where we want to reject them outright).
 *
 * This module is the pattern for the remaining POST/PUT routes; the highest-risk
 * structured bodies (prescriptions, consent, profile) are covered first.
 */

export const prescriptionItemSchema = z
  .object({
    drug: z.string().trim().min(1, 'drug is required').max(200),
    strength: z.string().trim().max(100).optional().default(''),
    dose: z.string().trim().max(100).optional().default(''),
    frequency: z.string().trim().max(100).optional().default(''),
    duration: z.string().trim().max(100).optional().default(''),
    instructions: z.string().trim().max(500).optional().default(''),
  })
  .strict();

export const prescriptionCreateSchema = z
  .object({
    visitId: z.string().min(1),
    items: z.array(prescriptionItemSchema).min(1, 'at least one item is required').max(50),
    advice: z.string().max(4000).optional(),
    followUpDate: z.string().max(40).nullable().optional(),
  })
  .strict();

export const consentSchema = z
  .object({
    patientId: z.string().min(1),
    visitId: z.string().min(1).nullable().optional(),
    scope: z.string().max(80).optional(),
    version: z.string().max(40).optional(),
    textShown: z.string().min(1).max(20000),
  })
  .strict();

export const profileUpdateSchema = z
  .object({
    abhaId: z.string().trim().max(80).optional(),
    dateOfBirth: z.string().max(40).nullable().optional(),
    sex: z.string().max(20).nullable().optional(),
  })
  .strict();

/** Parse a request JSON body against a schema. */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<{ data: z.infer<T>; error?: undefined } | { data?: undefined; error: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: Response.json({ error: 'Invalid JSON body' }, { status: 400 }) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return { error: Response.json({ error: 'Validation failed', fields }, { status: 400 }) };
  }
  return { data: result.data };
}
