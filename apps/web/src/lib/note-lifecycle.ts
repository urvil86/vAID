import sql from '@/app/api/utils/sql';
import type { StructuredNote } from '@/lib/types';

/** Structured-note fields tracked for editing + AI-vs-doctor diffing. */
const TRACKED_FIELDS: (keyof StructuredNote)[] = [
  'chief_complaint',
  'history_of_present_illness',
  'duration',
  'severity',
  'associated_symptoms',
  'current_medications',
  'allergies',
  'past_history',
];

function asText(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ');
  return v == null ? '' : String(v);
}

/** Append a new immutable version row (version_no auto-incremented). */
export async function writeNoteVersion(
  sessionId: string,
  note: unknown,
  editedBy: string | null,
  changeSummary: string,
  isAddendum = false
): Promise<void> {
  const [row] = await sql`
    SELECT coalesce(max(version_no), 0) + 1 AS next
    FROM note_versions WHERE intake_session_id = ${sessionId}
  `;
  const next = Number(row?.next ?? 1);
  await sql`
    INSERT INTO note_versions
      (intake_session_id, version_no, structured_note_json, edited_by, change_summary, is_addendum)
    VALUES (${sessionId}, ${next}, ${JSON.stringify(note)}, ${editedBy}, ${changeSummary}, ${isAddendum})
  `;
}

/** The original AI draft (first version) for a session, as the diff baseline. */
export async function getAiDraftNote(sessionId: string): Promise<StructuredNote | null> {
  const [row] = await sql`
    SELECT structured_note_json FROM note_versions
    WHERE intake_session_id = ${sessionId}
    ORDER BY version_no ASC LIMIT 1
  `;
  return (row?.structured_note_json as StructuredNote) ?? null;
}

/** Record field-level AI-vs-doctor diffs into note_edits (training signal). */
export async function captureNoteEdits(
  sessionId: string,
  aiNote: StructuredNote | null,
  newNote: StructuredNote
): Promise<void> {
  for (const field of TRACKED_FIELDS) {
    const aiVal = asText(aiNote?.[field]);
    const docVal = asText(newNote[field]);
    if (aiVal !== docVal) {
      await sql`
        INSERT INTO note_edits (intake_session_id, field, ai_value, doctor_value)
        VALUES (${sessionId}, ${field}, ${aiVal}, ${docVal})
      `;
    }
  }
}
