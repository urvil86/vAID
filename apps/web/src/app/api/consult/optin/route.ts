import sql from '@/app/api/utils/sql';
import { requireRole, forbidden } from '@/lib/auth-guard';
import { checkOrigin } from '@/lib/csrf';

/**
 * GET  /api/consult/optin — the doctor's standing consult-recording opt-in.
 * POST /api/consult/optin { optin: boolean } — set it.
 * Recording only runs when this is on AND the patient consented (2.5 gating).
 */
export async function GET(request: Request) {
  const ctx = await requireRole(request, ['doctor']);
  if (ctx instanceof Response) return ctx;
  const [row] = await sql`
    SELECT consult_recording_optin FROM doctor_profiles WHERE user_id = ${ctx.userId}
  `;
  return Response.json({ optin: row?.consult_recording_optin === true });
}

export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;
  const ctx = await requireRole(request, ['doctor']);
  if (ctx instanceof Response) return ctx;

  const { optin } = await request.json();
  if (typeof optin !== 'boolean') {
    return Response.json({ error: 'optin (boolean) is required' }, { status: 400 });
  }
  const [row] = await sql`
    UPDATE doctor_profiles SET consult_recording_optin = ${optin}
    WHERE user_id = ${ctx.userId}
    RETURNING consult_recording_optin
  `;
  if (!row) return forbidden('No doctor profile');
  return Response.json({ optin: row.consult_recording_optin });
}
