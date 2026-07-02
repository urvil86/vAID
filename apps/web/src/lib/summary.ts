import sql from '@/app/api/utils/sql';
import { StructuredNote } from '@/lib/types';

export type ProblemItem = { problem: string; last_seen: string; visits: number };
export type PatientSummary = {
  problems: ProblemItem[];
  medications: string[];
  allergies: string[];
  updated_at?: string;
};

/** Case-insensitive dedupe, preserving the first-seen original casing. */
function dedupeStrings(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const trimmed = (v ?? '').trim();
    const key = trimmed.toLowerCase();
    if (key && !seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()];
}

/**
 * Rebuild the patient's longitudinal summary from every structured note across
 * their visits. Deterministic (no LLM): medications + allergies already live in
 * each note, so we just dedupe and carry them forward, and roll chief complaints
 * up into a problem list with recurrence count + last-seen date.
 *
 * Best-effort: silently no-ops if the patient_summary table isn't migrated yet.
 */
export async function regeneratePatientSummary(patientId: string): Promise<PatientSummary | null> {
  if (!patientId) return null;

  let rows: Array<{ note: StructuredNote | null; created_at: unknown }>;
  try {
    rows = (await sql`
      SELECT ist.note AS note, v.created_at AS created_at
      FROM visits v
      JOIN LATERAL (
        SELECT structured_note_json AS note FROM intake_sessions
        WHERE visit_id = v.id AND structured_note_json IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
      ) ist ON true
      WHERE v.patient_id = ${patientId}
      ORDER BY v.created_at DESC
    `) as Array<{ note: StructuredNote | null; created_at: unknown }>;
  } catch {
    return null;
  }

  const meds: string[] = [];
  const allergies: string[] = [];
  const problemMap = new Map<string, ProblemItem>();

  for (const r of rows) {
    const note = r.note;
    if (!note) continue;
    if (Array.isArray(note.current_medications)) meds.push(...note.current_medications);
    if (Array.isArray(note.allergies)) allergies.push(...note.allergies);

    const cc = (note.chief_complaint || '').trim();
    if (cc) {
      const key = cc.toLowerCase();
      const when =
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? '');
      const existing = problemMap.get(key);
      if (existing) {
        existing.visits += 1;
      } else {
        problemMap.set(key, { problem: cc, last_seen: when, visits: 1 });
      }
    }
  }

  // Roll up the coded FHIR-aligned resources (3.1) and merge them with the
  // note-derived aggregation (backward-compatible for pre-3.1 / unsigned visits).
  try {
    const codedMeds = (await sql`
      SELECT DISTINCT drug_name FROM medication_statements
      WHERE patient_id = ${patientId} AND status = 'active'
    `) as Array<{ drug_name: string }>;
    meds.push(...codedMeds.map((m) => m.drug_name));

    const codedAllergies = (await sql`
      SELECT DISTINCT substance FROM allergy_intolerances WHERE patient_id = ${patientId}
    `) as Array<{ substance: string }>;
    allergies.push(...codedAllergies.map((a) => a.substance));

    const codedConditions = (await sql`
      SELECT display_text, max(recorded_at) AS last_seen, count(*)::int AS visits
      FROM conditions
      WHERE patient_id = ${patientId} AND clinical_status = 'active'
      GROUP BY display_text
    `) as Array<{ display_text: string; last_seen: unknown; visits: number }>;
    for (const c of codedConditions) {
      const key = c.display_text.toLowerCase();
      if (!problemMap.has(key)) {
        problemMap.set(key, {
          problem: c.display_text,
          last_seen: c.last_seen instanceof Date ? c.last_seen.toISOString() : String(c.last_seen ?? ''),
          visits: c.visits,
        });
      }
    }
  } catch {
    /* coded tables not migrated yet — fall back to the note aggregation */
  }

  // Drop problems the patient/doctor marked resolved.
  try {
    const resolved = (await sql`
      SELECT problem_norm FROM resolved_problems WHERE patient_id = ${patientId}
    `) as Array<{ problem_norm: string }>;
    const resolvedSet = new Set(resolved.map((r) => r.problem_norm));
    for (const key of [...problemMap.keys()]) {
      if (resolvedSet.has(key)) problemMap.delete(key);
    }
  } catch {
    /* table not migrated yet */
  }

  const summary: PatientSummary = {
    problems: [...problemMap.values()],
    medications: dedupeStrings(meds),
    allergies: dedupeStrings(allergies),
  };

  try {
    await sql`
      INSERT INTO patient_summary (patient_id, problems_json, medications_json, allergies_json, updated_at)
      VALUES (
        ${patientId},
        ${JSON.stringify(summary.problems)},
        ${JSON.stringify(summary.medications)},
        ${JSON.stringify(summary.allergies)},
        now()
      )
      ON CONFLICT (patient_id) DO UPDATE SET
        problems_json    = ${JSON.stringify(summary.problems)},
        medications_json = ${JSON.stringify(summary.medications)},
        allergies_json   = ${JSON.stringify(summary.allergies)},
        updated_at       = now()
    `;
  } catch {
    /* table not migrated yet — return the computed summary anyway */
  }

  return summary;
}
