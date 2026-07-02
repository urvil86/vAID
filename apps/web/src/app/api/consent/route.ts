import sql from '@/app/api/utils/sql';
import { requireUser, isStaff, forbidden, canActAsPatient } from '@/lib/auth-guard';
import { audit } from '@/lib/audit';
import { eraseVisitIntake } from '@/lib/erasure';

/**
 * DPDP Act 2023 consent record. Captured before any voice is recorded — stores
 * what was shown (text + version), the scope, and the timestamp, linked to the
 * patient and visit. Withdrawal/erasure is handled via PUT (sets withdrawn_at).
 */

// POST /api/consent — record a granted consent
export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  try {
    const body = await request.json();
    const { patientId, visitId, scope, version, textShown } = body;

    if (!patientId || !textShown) {
      return Response.json({ error: 'patientId and textShown are required' }, { status: 400 });
    }
    // A patient records their own consent (or a dependent's, if they manage
    // them); staff may record on their behalf.
    if (!ctx.isDevBypass && !isStaff(ctx.role) && !(await canActAsPatient(ctx, patientId))) {
      return forbidden('You can only record consent for yourself or someone you manage');
    }

    const [consent] = await sql`
      INSERT INTO consent (patient_id, visit_id, scope, version, text_shown)
      VALUES (
        ${patientId},
        ${visitId || null},
        ${scope || 'voice_health_intake'},
        ${version || 'v1'},
        ${textShown}
      )
      RETURNING *
    `;
    await audit(request, ctx, 'consent_grant', 'consent', consent.id);

    return Response.json({ consent });
  } catch (error) {
    console.error('Error recording consent:', error);
    return Response.json({ error: 'Failed to record consent' }, { status: 500 });
  }
}

// PUT /api/consent — withdraw consent (DPDP right to withdraw)
export async function PUT(request: Request) {
  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;

  try {
    const { consentId } = await request.json();
    if (!consentId) {
      return Response.json({ error: 'consentId is required' }, { status: 400 });
    }

    const [existing] = await sql`SELECT * FROM consent WHERE id = ${consentId}`;
    if (!existing) {
      return Response.json({ error: 'Consent not found' }, { status: 404 });
    }
    // Only the consenting patient (or staff) may withdraw it.
    if (!ctx.isDevBypass && !isStaff(ctx.role) && ctx.userId !== existing.patient_id) {
      return forbidden('You can only withdraw your own consent');
    }

    const [consent] = await sql`
      UPDATE consent SET withdrawn_at = now() WHERE id = ${consentId} RETURNING *
    `;
    await audit(request, ctx, 'consent_withdraw', 'consent', consentId);

    // DPDP erasure: withdrawing consent erases the captured intake for that visit.
    if (consent.visit_id) {
      await eraseVisitIntake(consent.visit_id);
      await audit(request, ctx, 'erase_visit', 'visit', consent.visit_id);
    }

    return Response.json({ consent, erased: !!consent.visit_id });
  } catch (error) {
    console.error('Error withdrawing consent:', error);
    return Response.json({ error: 'Failed to withdraw consent' }, { status: 500 });
  }
}
