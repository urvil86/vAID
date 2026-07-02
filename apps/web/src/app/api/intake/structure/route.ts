import sql from '@/app/api/utils/sql';
import type { StructuredNote } from '@/lib/types';
import { openRouterChat, parseLooseJson } from '@/lib/openrouter';
import { requireUser, canAccessIntakeSession, forbidden } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit';
import { writeNoteVersion } from '@/lib/note-lifecycle';
import { validateStructuredNote } from '@/lib/validation/structured-note';
import { applyGrounding } from '@/lib/grounding';
import { overDailyBudget, recordAiSpend } from '@/lib/ai-cost';
import { deidentify } from '@/lib/deidentify';

// Instruction shared by every LLM-backed structuring path. Written to be
// multilingual: patients in India answer in Hindi, English, or any other major
// Indian language (often code-mixed), and the physician's note must be English.
const SYSTEM_PROMPT = `You are a clinical intake structuring assistant for an outpatient clinic in India.

You receive a raw transcript of a patient describing their symptoms. The patient may have answered in ANY major Indian language or a mix of them — including Hindi, Bengali, Telugu, Marathi, Tamil, Urdu, Gujarati, Kannada, Odia, Malayalam, Punjabi, Assamese, or English — and may switch scripts or code-mix English medical words into a regional language. Detect the language(s) automatically.

Your job is to TRANSLATE the content faithfully into clear clinical English and structure it into an intake note for the treating physician. You do not diagnose, you do not suggest treatment, and you do not assess risk for the patient. You organize what the patient said.

Output STRICT JSON only — no prose, no markdown, no code fences — matching exactly this schema:
{
  "chief_complaint": string,
  "history_of_present_illness": string,
  "duration": string,
  "severity": string,
  "associated_symptoms": [string],
  "current_medications": [string],
  "allergies": [string],
  "past_history": [string],
  "icd10_suggestions": [{ "code": string, "term": string }],
  "confidence_flags": [string],
  "screen_flags": [string]
}

Rules:
- Translate faithfully to English. Preserve the patient's own descriptions; do not embellish or infer symptoms they did not mention.
- Keep drug names and dosages as stated (transliterate if needed).
- If a field is ambiguous, vague, or missing, name the SPECIFIC field in confidence_flags as "field_name: short reason" (e.g. "current_medications: name vague", "duration: not clearly stated") rather than guessing to fill it.
- icd10_suggestions are coding hints for the physician only, never shown to the patient, never a diagnosis. Provide AT MOST THREE, and leave the array empty if the complaint is too vague to code.
- screen_flags is an internal, doctor-only safety field. If the transcript contains a combination warranting the physician's immediate attention (e.g. chest pain with breathlessness, or sudden severe headache), add a short neutral flag such as "chest pain with breathlessness noted." Do not explain, advise, or alarm. Leave empty if nothing applies.
- Every array field must be present (use [] when empty). Never return null. Never output anything outside the JSON.`;

const EMPTY_NOTE: StructuredNote = {
  chief_complaint: '',
  history_of_present_illness: '',
  duration: '',
  severity: '',
  associated_symptoms: [],
  current_medications: [],
  allergies: [],
  past_history: [],
  icd10_suggestions: [],
  confidence_flags: [],
  screen_flags: [],
};

// ── Shared helpers ──────────────────────────────────────────────────────────
function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => x != null).map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

function normalizeNote(p: Record<string, unknown>): StructuredNote {
  const icd = Array.isArray(p.icd10_suggestions) ? p.icd10_suggestions : [];
  return {
    chief_complaint: String(p.chief_complaint ?? ''),
    history_of_present_illness: String(p.history_of_present_illness ?? ''),
    duration: String(p.duration ?? ''),
    severity: String(p.severity ?? ''),
    associated_symptoms: asStringList(p.associated_symptoms),
    current_medications: asStringList(p.current_medications),
    allergies: asStringList(p.allergies),
    past_history: asStringList(p.past_history),
    icd10_suggestions: icd
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({ code: String(x.code ?? ''), term: String(x.term ?? '') }))
      .filter((x) => x.code || x.term),
    confidence_flags: asStringList(p.confidence_flags),
    screen_flags: asStringList(p.screen_flags),
  };
}

// ── Path 1: OpenRouter (preferred — cheap, multilingual models) ─────────────
// Uses OpenRouter's OpenAI-compatible Chat Completions API. Model is
// configurable via OPENROUTER_MODEL (default: Gemini 2.5 Flash). Returns null
// when no key is set or the call fails, so callers fall back gracefully.
async function structureViaOpenRouter(
  transcript: string,
  language?: string
): Promise<StructuredNote | null> {
  const userContent =
    `${language ? `Patient's selected language: ${language}.\n` : ''}` +
    `Transcript (question then answer pairs):\n\n${transcript}`;

  const content = await openRouterChat({
    system: SYSTEM_PROMPT,
    user: userContent,
    maxTokens: 1200,
    temperature: 0.2,
    jsonObject: true,
  });
  if (!content) return null;
  const parsed = parseLooseJson(content);
  return parsed ? normalizeNote(parsed) : null;
}

// ── Path 2: Anything platform Claude proxy (production default) ─────────────
async function structureViaPlatform(transcript: string): Promise<StructuredNote | null> {
  const baseUrl = process.env.NEXT_PUBLIC_CREATE_BASE_URL;
  const token = process.env.ANYTHING_PROJECT_TOKEN;
  if (!baseUrl || !token) return null;

  const response = await fetch(`${baseUrl}/integrations/anthropic/v1/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const parsed = parseLooseJson(data.content?.[0]?.text ?? '');
  return parsed ? normalizeNote(parsed) : null;
}

// ── Path 3: deterministic local structuring (no AI, no network) ─────────────
// The transcript is built as `${question}\n${answer}` blocks joined by blank
// lines, in the fixed order from lib/i18n.ts, so each answer maps to a clinical
// field directly. This keeps the pre-read populated even with no model
// configured — it does NOT translate, so non-English answers stay as written.
const NONE_RE =
  /^(none|no|nope|nothing|n\/?a|nil|nahi+n?|कुछ ?नहीं|नहीं|\(no answer\))\.?$/i;

function splitList(value: string): string[] {
  if (!value || NONE_RE.test(value.trim())) return [];
  return value
    .split(/,|;|\n|·|•|\band\b|और/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !NONE_RE.test(s));
}

function structureLocally(transcript: string): StructuredNote {
  const answers = transcript.split(/\n\s*\n/).map((block) => {
    const nl = block.indexOf('\n');
    const a = (nl === -1 ? '' : block.slice(nl + 1)).trim();
    return a && a !== '(no answer)' ? a : '';
  });
  const at = (i: number) => answers[i] ?? '';

  const hpi = [at(0), at(1) && `Duration: ${at(1)}`, at(2) && `Severity: ${at(2)}`]
    .filter(Boolean)
    .join('. ');

  return {
    ...EMPTY_NOTE,
    chief_complaint: at(0),
    history_of_present_illness: hpi,
    duration: at(1),
    severity: at(2),
    associated_symptoms: splitList(at(3)),
    current_medications: splitList(at(4)),
    allergies: splitList(at(5)),
    past_history: splitList(at(6)),
    confidence_flags: [
      'Structured locally without AI translation. Review the native transcript for accuracy.',
    ],
  };
}

export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { sessionId } = await request.json();
  if (!(await canAccessIntakeSession(ctx, sessionId))) return forbidden();

  // Cap AI structuring: per session (20/hr) is the real per-patient guard; the
  // per-IP backstop is 600/hr, not 60, because a whole clinic shares one public
  // IP and would otherwise throttle legitimate patients.
  const ipLimit = await enforceRateLimit(request, {
    key: `ai:ip:${getClientIp(request)}`,
    windowMs: 3_600_000,
    max: 600,
    route: '/api/intake/structure',
    keyType: 'ip',
    actorId: ctx.userId,
  });
  if (ipLimit) return ipLimit;
  const sessionLimit = await enforceRateLimit(request, {
    key: `ai:session:${sessionId}`,
    windowMs: 3_600_000,
    max: 20,
    route: '/api/intake/structure',
    keyType: 'visit',
    actorId: ctx.userId,
  });
  if (sessionLimit) return sessionLimit;

  await audit(request, ctx, 'structure', 'intake', sessionId);

  try {
    const [session] = await sql`
      SELECT * FROM intake_sessions WHERE id = ${sessionId}
    `;

    if (!session || !session.transcript_native) {
      return Response.json({ error: 'Session or transcript not found' }, { status: 400 });
    }

    const transcript: string = session.transcript_native;
    const language: string | undefined = session.language;

    // AI cost control (3.4): over the clinic's daily AI budget → local tier only
    // (never blocks intake; the admin dashboard shows a banner).
    const [vrow] = await sql`SELECT clinic_id FROM visits WHERE id = ${session.visit_id}`;
    const clinicId = (vrow?.clinic_id as string) || null;
    const budgetExceeded = await overDailyBudget(clinicId);

    // De-identify before ANY third-party call (3.6): no name/phone/ABHA leaves
    // the platform. The local tier + grounding use the raw in-house transcript.
    const [ident] = await sql`
      SELECT u.name, u."phoneNumber" AS phone, pp.abha_id AS abha
      FROM visits v JOIN "user" u ON u.id = v.patient_id
      LEFT JOIN patient_profiles pp ON pp.user_id = u.id
      WHERE v.id = ${session.visit_id}
    `;
    const safeTranscript = deidentify(transcript, {
      name: ident?.name as string,
      phone: ident?.phone as string,
      abha: ident?.abha as string,
    });

    // Preference order: OpenRouter (cheap multilingual) → platform → local.
    // Each tier's output is VALIDATED against the strict note schema; an invalid
    // note degrades to the next tier rather than reaching the record. A 25s
    // budget bounds the external calls; the deterministic local tier is instant.
    const thirdPartyDisabled = process.env.DISABLE_THIRD_PARTY_AI === '1';
    let structuredNote: StructuredNote | null = null;
    let structuringSource = 'local';
    const structuringStatus = 'ok';

    const withTimeout = <T>(p: Promise<T>, ms: number) =>
      Promise.race([
        p,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('structuring timeout')), ms)),
      ]);

    if (!thirdPartyDisabled && !budgetExceeded) {
      const tiers = [
        ['openrouter', () => structureViaOpenRouter(safeTranscript, language)],
        ['platform', () => structureViaPlatform(safeTranscript)],
      ] as const;
      const deadline = Date.now() + 25_000;
      for (const [source, attempt] of tiers) {
        if (Date.now() >= deadline) break;
        try {
          const raw = await withTimeout(attempt(), Math.max(1000, deadline - Date.now()));
          const v = validateStructuredNote(raw);
          if (v.ok) {
            structuredNote = v.note as StructuredNote;
            structuringSource = source;
            break;
          }
          console.warn(`[structure] ${source} output failed validation: ${v.errors}`);
        } catch (e) {
          console.warn(`[structure] ${source} failed, trying next:`, e);
        }
      }
    }

    if (!structuredNote) {
      // Deterministic local fallback — always available, no external call.
      const local = structureLocally(transcript);
      const v = validateStructuredNote(local);
      structuredNote = (v.ok ? v.note : local) as StructuredNote;
      structuringSource = 'local';
    }

    // Record AI spend for the clinic's daily budget (rough per-call estimate).
    if (structuringSource !== 'local') {
      await recordAiSpend(clinicId, 0.002);
    }

    // Grounding: FLAG (never delete) any medication/allergy not traceable to the
    // transcript, so the doctor must confirm it before signing (1.4 sign flow).
    structuredNote = applyGrounding(structuredNote, transcript);

    // Persist the typed flag columns too (not just inside the JSON note), so the
    // queue's screen-flag glyph and any flag-driven queries work off real data.
    await sql`
      UPDATE intake_sessions
      SET structured_note_json = ${structuredNote},
          transcript_english = ${structuredNote.history_of_present_illness},
          screen_flags_json = ${JSON.stringify(structuredNote.screen_flags ?? [])},
          confidence_flags_json = ${JSON.stringify(structuredNote.confidence_flags ?? [])},
          note_status = 'ai_draft',
          structuring_source = ${structuringSource},
          structuring_status = ${structuringStatus}
      WHERE id = ${sessionId} AND signed_at IS NULL
    `;
    // Version 1 = the AI draft baseline (used for the doctor-edit diff).
    await writeNoteVersion(sessionId, structuredNote, null, 'AI draft');

    return Response.json(structuredNote);
  } catch (error) {
    console.error('Error structuring intake:', error);
    return Response.json({ error: 'Failed to structure intake' }, { status: 500 });
  }
}

// PUT /api/intake/structure — save a patient-edited note from the review screen.
export async function PUT(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { sessionId, note } = await request.json();
  if (!sessionId || !note) {
    return Response.json({ error: 'sessionId and note are required' }, { status: 400 });
  }
  if (!(await canAccessIntakeSession(ctx, sessionId))) return forbidden();

  // A closed consult locks the note — no silent overwrites after the fact.
  const [lockRow] = await sql`SELECT locked_at FROM intake_sessions WHERE id = ${sessionId}`;
  if (lockRow?.locked_at) {
    return Response.json(
      { error: 'This note is locked because the consult has closed. Corrections must be added as a dated addendum.' },
      { status: 409 }
    );
  }

  try {
    const clean = normalizeNote(note);
    await sql`
      UPDATE intake_sessions
      SET structured_note_json = ${clean},
          transcript_english = ${clean.history_of_present_illness},
          screen_flags_json = ${JSON.stringify(clean.screen_flags ?? [])},
          confidence_flags_json = ${JSON.stringify(clean.confidence_flags ?? [])}
      WHERE id = ${sessionId}
    `;
    await audit(request, ctx, 'update', 'intake', sessionId);
    return Response.json(clean);
  } catch (error) {
    console.error('Error saving edited intake note:', error);
    return Response.json({ error: 'Failed to save note' }, { status: 500 });
  }
}
