import sql from '@/app/api/utils/sql';
import { openRouterConfigured } from '@/lib/openrouter';

/**
 * GET /api/health — DB connectivity, AI provider config, and pending-migration
 * status, for uptime monitoring. No auth (returns no PII). 503 if the DB is down.
 */
export async function GET() {
  const checks: Record<string, string> = {};

  try {
    await sql`SELECT 1`;
    checks.db = 'ok';
  } catch {
    checks.db = 'down';
  }

  checks.ai = openRouterConfigured() ? 'configured' : 'fallback-local';

  // A recent column proves the latest migrations are applied.
  try {
    await sql`SELECT note_status FROM intake_sessions LIMIT 1`;
    checks.migrations = 'ok';
  } catch {
    checks.migrations = 'pending';
  }

  const ok = checks.db === 'ok';
  return Response.json({ status: ok ? 'ok' : 'degraded', checks }, { status: ok ? 200 : 503 });
}
