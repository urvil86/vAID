/**
 * Audit logging (DPDP §8: log every access to a patient record).
 *
 * Records who did what, to which entity, from which IP, and when. Fire-and-wait
 * with a swallowed error so a logging failure never breaks the request — but in
 * practice the insert is a fast local write.
 */
import sql from '@/app/api/utils/sql';
import type { AuthContext } from '@/lib/auth-guard';

export type AuditAction =
  | 'read'
  | 'list'
  | 'create'
  | 'update'
  | 'structure'
  | 'share'
  | 'consent_grant'
  | 'consent_withdraw'
  | 'erase_visit'
  | 'erase_patient'
  | 'staff_assign'
  | 'clinic_update';

function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? null;
}

export async function audit(
  req: Request,
  ctx: Pick<AuthContext, 'userId'> | null,
  action: AuditAction,
  entity: string,
  entityId: string | null
): Promise<void> {
  try {
    await sql`
      INSERT INTO audit_log (actor_user_id, action, entity, entity_id, ip)
      VALUES (${ctx?.userId ?? null}, ${action}, ${entity}, ${entityId}, ${clientIp(req)})
    `;
  } catch (e) {
    console.error('[audit] failed to write audit log', e);
  }
}
