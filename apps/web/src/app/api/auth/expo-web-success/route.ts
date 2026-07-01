/**
 * ⚠ ANYTHING PLATFORM — DO NOT REWRITE THIS FILE ⚠
 *
 * Shipped v2 Expo-web postMessage bridge. Renders an HTML page that posts
 * `{ type: 'AUTH_SUCCESS'|'AUTH_ERROR', jwt, user }` to window.parent —
 * AuthWebView.tsx listens for exactly that shape. Changing the event type or
 * payload shape breaks Expo-web auth; do NOT replace with a JSON response or
 * a redirect.
 */
import { auth } from '@/lib/auth';

// Concrete origins we will hand the session token to, derived from the same env
// as auth.ts trustedOrigins. postMessage only delivers to a frame whose origin
// matches the target, so looping the allowlist hands the token to the real
// parent only — never an arbitrary embedder (was posting to '*', a token leak).
function trustedTargetOrigins(): string[] {
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
      /* skip malformed */
    }
  }
  return [...origins];
}

// Renders an HTML page that posts the session token to the parent frame.
// AuthWebView on the mobile "web" platform listens for this postMessage to
// capture the session after a successful web signin/signup inside its iframe.
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  const payload =
    session?.user && session?.session
      ? {
          type: 'AUTH_SUCCESS',
          jwt: session.session.token,
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
          },
        }
      : { type: 'AUTH_ERROR', error: 'Unauthorized' };

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Signing in…</title>
</head>
<body>
<script>
(function () {
  var data = ${JSON.stringify(payload)};
  var origins = ${JSON.stringify(trustedTargetOrigins())};
  if (window.parent && window.parent !== window) {
    // Deliver only to a parent whose origin is on the allowlist. The browser
    // drops the message for every non-matching target, so the token cannot
    // leak to an arbitrary embedder.
    origins.forEach(function (o) {
      try { window.parent.postMessage(data, o); } catch (e) {}
    });
  }
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
