import { resolveDevPatientId } from '@/lib/dev-auth';
import sql from '@/app/api/utils/sql';
import {
  requireUser,
  isStaff,
  assertClinic,
  forbidden,
  hasHistoryShareConsent,
} from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { ensurePatientUhid } from '@/lib/patient';

export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { clinicId, patientId: rawPatientId, tokenNo } = await request.json();
  const patientId = await resolveDevPatientId(rawPatientId);

  if (!clinicId || !patientId || !tokenNo) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // A patient may only create their own visit; staff only within their clinic.
  if (!ctx.isDevBypass) {
    if (isStaff(ctx.role)) {
      if (!assertClinic(ctx, clinicId)) return forbidden();
    } else if (ctx.userId !== patientId) {
      return forbidden('You can only check in for yourself');
    }
  }

  try {
    const [visit] = await sql`
      INSERT INTO visits (patient_id, clinic_id, token_no, status)
      VALUES (${patientId}, ${clinicId}, ${tokenNo}, 'CHECKED IN')
      RETURNING *
    `;

    // Every visited patient gets a permanent V-Aid ID (UHID) on first check-in.
    await ensurePatientUhid(patientId);

    return Response.json(visit);
  } catch (error) {
    console.error('Error creating visit:', error);
    return Response.json({ error: 'Failed to create visit' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  const { searchParams } = new URL(request.url);
  const clinicId = searchParams.get('clinicId');
  const patientId = searchParams.get('patientId');

  if (!clinicId && !patientId) {
    return Response.json({ error: 'Missing clinicId or patientId' }, { status: 400 });
  }

  // The clinic queue is staff-only and clinic-scoped; a patient history list is
  // viewable by that patient or by staff.
  if (clinicId && !patientId) {
    if (!ctx.isDevBypass && (!isStaff(ctx.role) || !assertClinic(ctx, clinicId))) {
      return forbidden();
    }
  } else if (patientId) {
    if (!ctx.isDevBypass && !isStaff(ctx.role) && ctx.userId !== patientId) {
      return forbidden();
    }
  }
  await audit(request, ctx, 'list', 'visit', clinicId ?? patientId);

  try {
    let visits;
    if (patientId) {
      // The patient sees their own full history. Staff see ONLY their own
      // clinic's visits for this patient, unless the patient granted an active
      // cross-clinic history-share consent — then the full record unlocks.
      const isSelf = ctx.userId === patientId;
      const fullHistory =
        ctx.isDevBypass ||
        isSelf ||
        (isStaff(ctx.role) && (await hasHistoryShareConsent(patientId, ctx.clinicId)));
      const clinicFilter = fullHistory ? null : ctx.clinicId;

      visits = await sql`
        SELECT v.*, u.name as patient_name,
               c.name as clinic_name,
               ist.structured_note_json,
               ist.status as intake_status
        FROM visits v
        JOIN "user" u ON v.patient_id = u.id
        LEFT JOIN clinics c ON v.clinic_id = c.id
        LEFT JOIN LATERAL (
          SELECT structured_note_json, status FROM intake_sessions
          WHERE visit_id = v.id ORDER BY created_at DESC LIMIT 1
        ) ist ON true
        WHERE v.patient_id = ${patientId}
          AND (${clinicFilter}::text IS NULL OR v.clinic_id::text = ${clinicFilter})
        ORDER BY v.created_at DESC
      `;
    } else {
      visits = await sql`
        SELECT v.*, u.name as patient_name,
               ist.screen_flags_json,
               ist.status as intake_status
        FROM visits v
        JOIN "user" u ON v.patient_id = u.id
        LEFT JOIN LATERAL (
          SELECT screen_flags_json, status FROM intake_sessions
          WHERE visit_id = v.id ORDER BY created_at DESC LIMIT 1
        ) ist ON true
        WHERE v.clinic_id = ${clinicId}
        ORDER BY v.created_at DESC
      `;
    }

    return Response.json(visits);
  } catch (error) {
    console.error('Error fetching visits:', error);
    return Response.json({ error: 'Failed to fetch visits' }, { status: 500 });
  }
}
