import { createHash } from 'node:crypto';
import sql from '@/app/api/utils/sql';

/**
 * Fixed-window rate limiter backed by Postgres (rate_limit_counters). No Redis
 * assumed — the app runs on Neon serverless. The interface is deliberately
 * simple so a Redis/Upstash backend can drop in behind checkRateLimit() later.
 */
export type RateLimitResult = { ok: boolean; retryAfterMs: number; remaining: number };

export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** Hash a sensitive value (e.g. phone number) so it never lands in a key/log. */
export function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export async function checkRateLimit(
  key: string,
  opts: { windowMs: number; max: number }
): Promise<RateLimitResult> {
  const { windowMs, max } = opts;
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  try {
    const [row] = await sql`
      INSERT INTO rate_limit_counters (key, window_start, count)
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT (key, window_start)
      DO UPDATE SET count = rate_limit_counters.count + 1
      RETURNING count
    `;
    const count = Number(row?.count ?? 1);

    // Opportunistic cleanup of stale windows (~2% of writes) so the table
    // doesn't grow unbounded without a cron.
    if (Math.random() < 0.02) {
      await sql`DELETE FROM rate_limit_counters WHERE window_start < ${new Date(now - windowMs * 4)}`;
    }

    if (count > max) {
      const windowEnd = windowStart.getTime() + windowMs;
      return { ok: false, retryAfterMs: Math.max(0, windowEnd - now), remaining: 0 };
    }
    return { ok: true, retryAfterMs: 0, remaining: Math.max(0, max - count) };
  } catch {
    // Fail OPEN: never block a clinical flow because the counter table hiccuped.
    return { ok: true, retryAfterMs: 0, remaining: max };
  }
}

async function auditRateLimited(
  req: Request,
  route: string,
  keyType: string,
  actorId: string | null
): Promise<void> {
  try {
    await sql`
      INSERT INTO audit_log (actor_user_id, action, entity, entity_id, ip)
      VALUES (${actorId}, 'RATE_LIMITED', ${route}, ${keyType}, ${getClientIp(req)})
    `;
  } catch {
    /* audit is best-effort */
  }
}

/**
 * Enforce a limit for a request. Returns a ready-to-return 429 Response on
 * breach (with Retry-After + a frontend-renderable JSON body) and audit-logs it,
 * or null when the request is under the cap. The raw key is never logged — only
 * `keyType` ('ip' | 'phone' | 'visit' | 'user').
 */
export async function enforceRateLimit(
  req: Request,
  spec: {
    key: string;
    windowMs: number;
    max: number;
    route: string;
    keyType: string;
    actorId?: string | null;
  }
): Promise<Response | null> {
  const res = await checkRateLimit(spec.key, { windowMs: spec.windowMs, max: spec.max });
  if (res.ok) return null;

  await auditRateLimited(req, spec.route, spec.keyType, spec.actorId ?? null);
  const retryAfterSec = Math.max(1, Math.ceil(res.retryAfterMs / 1000));
  return Response.json(
    {
      error: 'Too many requests. Please wait a moment and try again.',
      retryAfterMs: res.retryAfterMs,
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  );
}
