import sql from '@/app/api/utils/sql';
import type { StructuredNote } from '@/lib/types';

/**
 * Sign-time population: when a doctor SIGNS a note, its narrative becomes coded,
 * FHIR-aligned resources. The doctor has reviewed/edited the note, so the
 * entities are recorded verified_by_doctor=true. Idempotent per visit — prior
 * coded rows for the visit are cleared first so re-signing never duplicates.
 */
export async function populateClinicalResources(
  visitId: string,
  patientId: string,
  note: StructuredNote,
  doctorId: string
): Promise<void> {
  await sql`DELETE FROM conditions WHERE visit_id = ${visitId}`;
  await sql`DELETE FROM medication_statements WHERE visit_id = ${visitId} AND source = 'intake'`;
  await sql`DELETE FROM allergy_intolerances WHERE visit_id = ${visitId}`;

  for (const hint of note.icd10_suggestions ?? []) {
    if (!hint?.term) continue;
    await sql`
      INSERT INTO conditions (patient_id, visit_id, code_icd10, display_text, recorded_by, verified_by_doctor)
      VALUES (${patientId}, ${visitId}, ${hint.code ?? null}, ${hint.term}, ${doctorId}, true)
    `;
  }
  for (const med of note.current_medications ?? []) {
    if (!med?.trim()) continue;
    await sql`
      INSERT INTO medication_statements (patient_id, visit_id, drug_name, source, status)
      VALUES (${patientId}, ${visitId}, ${med.trim()}, 'intake', 'active')
    `;
  }
  for (const a of note.allergies ?? []) {
    if (!a?.trim()) continue;
    await sql`
      INSERT INTO allergy_intolerances (patient_id, visit_id, substance, verified_by_doctor)
      VALUES (${patientId}, ${visitId}, ${a.trim()}, true)
    `;
  }
}

/**
 * Best-effort backfill for visits closed before 3.1 — extracts coded resources
 * from each signed note's structured_note_json, marked verified_by_doctor=false
 * (they predate an explicit sign-time confirmation). Skips visits already coded.
 */
export async function backfillClinicalResources(): Promise<number> {
  const rows = (await sql`
    SELECT ist.visit_id, v.patient_id, ist.structured_note_json AS note
    FROM intake_sessions ist
    JOIN visits v ON v.id = ist.visit_id
    WHERE ist.signed_at IS NOT NULL
      AND ist.structured_note_json IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM medication_statements m WHERE m.visit_id = ist.visit_id)
      AND NOT EXISTS (SELECT 1 FROM allergy_intolerances a WHERE a.visit_id = ist.visit_id)
  `) as Array<{ visit_id: string; patient_id: string; note: StructuredNote | null }>;

  let n = 0;
  for (const r of rows) {
    if (!r.note) continue;
    for (const med of r.note.current_medications ?? []) {
      if (med?.trim())
        await sql`INSERT INTO medication_statements (patient_id, visit_id, drug_name, source) VALUES (${r.patient_id}, ${r.visit_id}, ${med.trim()}, 'intake')`;
    }
    for (const a of r.note.allergies ?? []) {
      if (a?.trim())
        await sql`INSERT INTO allergy_intolerances (patient_id, visit_id, substance) VALUES (${r.patient_id}, ${r.visit_id}, ${a.trim()})`;
    }
    for (const hint of r.note.icd10_suggestions ?? []) {
      if (hint?.term)
        await sql`INSERT INTO conditions (patient_id, visit_id, code_icd10, display_text) VALUES (${r.patient_id}, ${r.visit_id}, ${hint.code ?? null}, ${hint.term})`;
    }
    n++;
  }
  return n;
}
