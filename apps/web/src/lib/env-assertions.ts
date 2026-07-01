/**
 * Boot-time environment assertions. Imported by instrumentation.ts so they run
 * once at server startup, before any route handler.
 *
 * Security posture for the DEV_AUTH_BYPASS super-user (see dev-auth.ts):
 *   - bypassAllowed() returns false in production REGARDLESS of the flag, so the
 *     bypass is inert even if the env leaks (defence in depth).
 *   - assertProductionEnv() THROWS at boot if the flag is even set in production
 *     (fail loud, not open) so a misconfigured deploy crashes instead of quietly
 *     shipping a hole.
 */

/** The raw request for the bypass, before the environment gate. */
export function bypassRequested(): boolean {
  return process.env.DEV_AUTH_BYPASS === '1';
}

/**
 * True only in a genuinely non-production environment with the flag on:
 *   NODE_ENV !== 'production'  AND  VERCEL_ENV is unset or 'development'.
 */
export function bypassAllowed(): boolean {
  const notProd = process.env.NODE_ENV !== 'production';
  const vercelDev = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'development';
  return notProd && vercelDev && bypassRequested();
}

/** Are we running as a real production deployment? */
function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'development';
}

/**
 * Validate the environment on boot. Throws (crashing the boot) on a
 * security-critical misconfiguration in production. Emits one structured line
 * summarising which checks passed.
 */
export function assertProductionEnv(): void {
  if (!isProductionRuntime()) {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'env-assertions: non-production boot',
        authBypassActive: bypassAllowed(),
      })
    );
    return;
  }

  // Fail loud, not open: a bypass flag in production is a deploy mistake.
  if (bypassRequested()) {
    throw new Error(
      '[env-assert] DEV_AUTH_BYPASS is set in a production build. Refusing to boot — remove ' +
        'DEV_AUTH_BYPASS and NEXT_PUBLIC_DEV_AUTH_BYPASS from the production environment.'
    );
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      '[env-assert] BETTER_AUTH_SECRET must be set and at least 32 characters in production.'
    );
  }

  const checks = ['auth-bypass-off', 'better-auth-secret-present'];
  if (process.env.OPENROUTER_API_KEY) {
    checks.push('openrouter-key-present');
  } else {
    // Not fatal: the app deliberately falls back to deterministic structuring
    // when no key is present, so this is a warning rather than a boot failure.
    console.warn(
      '[env-assert] OPENROUTER_API_KEY is not set — AI structuring will use the deterministic local fallback.'
    );
  }

  console.log(JSON.stringify({ level: 'info', msg: 'env-assertions passed', checks }));
}
