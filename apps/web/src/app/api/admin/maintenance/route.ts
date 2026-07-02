import sql from '@/app/api/utils/sql';
import { requireRole } from '@/lib/auth-guard';
import { checkOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/maintenance — idempotent housekeeping (admin, manual trigger
 * only; never on a schedule for now).
 *   - Archive audit_log rows older than AUDIT_RETENTION_DAYS (default 3y) into
 *     audit_log_archive.
 *   - Hard-purge consents soft-deleted more than 30 days ago (recovery window).
 *   - Safety-net: purge consult_recordings older than 24h regardless of state (2.5).
 */
const AUDIT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS || '1095');
const CONSENT_RECOVERY_DAYS = 30;

export async function POST(request: Request) {
  const csrf = checkOrigin(request);
  if (csrf) return csrf;
  const ctx = await requireRole(request, ['admin']);
  if (ctx instanceof Response) return ctx;

  const archived = await sql`
    WITH moved AS (
      DELETE FROM audit_log
      WHERE created_at < now() - make_interval(days => ${AUDIT_RETENTION_DAYS})
      RETURNING *
    )
    INSERT INTO audit_log_archive SELECT * FROM moved
    RETURNING 1
  `;
  const consentsPurged = await sql`
    DELETE FROM consent
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - make_interval(days => ${CONSENT_RECOVERY_DAYS})
    RETURNING 1
  `;
  const recordingsPurged = await sql`
    DELETE FROM consult_recordings WHERE created_at < now() - interval '24 hours' RETURNING 1
  `;

  const result = {
    ok: true,
    auditArchived: archived.length,
    consentsPurged: consentsPurged.length,
    consultRecordingsPurged: recordingsPurged.length,
  };
  logger.info('maintenance_run', result);
  return Response.json(result);
}
