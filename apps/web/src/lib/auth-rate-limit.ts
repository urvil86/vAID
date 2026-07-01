import { enforceRateLimit, getClientIp, hashKey } from '@/lib/rate-limit';

/**
 * Rate limits for better-auth POST endpoints. Returns a ready-to-return 429
 * Response on breach, or null to proceed. Applied as a thin pre-check in the
 * auth catch-all so the toNextJsHandler wiring stays intact.
 *
 * Only POST is limited; GET (get-session, polled by useSession) is never
 * limited.
 */
export async function enforceAuthRateLimits(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/auth/, '');
  const ip = getClientIp(req);

  // General: 30 auth POSTs per IP per minute (generous — signin/signup/signout
  // are infrequent per user; a human never hits this).
  const general = await enforceRateLimit(req, {
    key: `auth:ip:${ip}`,
    windowMs: 60_000,
    max: 30,
    route: url.pathname,
    keyType: 'ip',
  });
  if (general) return general;

  // OTP send: 3 per phone / 15 min (the real anti-brute-force guard), plus a
  // per-IP backstop of 60/hr — clinics share one public IP, so the audit's
  // suggested 10/hr would throttle legitimate signups.
  if (path === '/phone-number/send-otp') {
    let phone = '';
    try {
      phone = ((await req.clone().json()) as { phoneNumber?: string })?.phoneNumber ?? '';
    } catch {
      /* non-JSON body — skip the per-phone key */
    }
    if (phone) {
      const perPhone = await enforceRateLimit(req, {
        key: `otp:phone:${hashKey(phone)}`,
        windowMs: 900_000,
        max: 3,
        route: url.pathname,
        keyType: 'phone',
      });
      if (perPhone) return perPhone;
    }
    const perIp = await enforceRateLimit(req, {
      key: `otp:ip:${ip}`,
      windowMs: 3_600_000,
      max: 60,
      route: url.pathname,
      keyType: 'ip',
    });
    if (perIp) return perIp;
  }

  return null;
}
