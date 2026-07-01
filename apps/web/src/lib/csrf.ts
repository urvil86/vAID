/**
 * Lightweight CSRF guard for state-changing app routes (better-auth covers its
 * own endpoints). Rejects a request whose Origin is present but not trusted —
 * the shape of a cross-site form POST riding the user's cookies. Requests with
 * no Origin (server-to-server, curl) and mobile bearer-token requests (not
 * cookie-based, so not CSRF-exposed) are allowed through.
 */
function trustedOrigins(): string[] {
  const raw = [
    process.env.BETTER_AUTH_URL,
    process.env.EXPO_PUBLIC_PROXY_BASE_URL,
    process.env.NEXT_PUBLIC_CREATE_BASE_URL,
    process.env.NEXT_PUBLIC_CREATE_HOST ? `https://${process.env.NEXT_PUBLIC_CREATE_HOST}` : null,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null,
    process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  ].filter((v): v is string => Boolean(v));
  const origins = new Set<string>();
  for (const u of raw) {
    try {
      origins.add(new URL(u).origin);
    } catch {
      /* skip */
    }
  }
  return [...origins];
}

function isTrustedOrigin(origin: string): boolean {
  if (trustedOrigins().includes(origin)) return true;
  try {
    // Trust any *.vercel.app origin (mirrors auth.ts trustedOrigins wildcard).
    return /(^|\.)vercel\.app$/.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** Returns a 403 Response to reject, or null to allow the request through. */
export function checkOrigin(req: Request): Response | null {
  const authz = req.headers.get('authorization');
  if (authz?.toLowerCase().startsWith('bearer ')) return null;

  const origin = req.headers.get('origin');
  if (!origin) return null; // no cross-site browser context
  if (isTrustedOrigin(origin)) return null;

  return Response.json({ error: 'Invalid origin' }, { status: 403 });
}
