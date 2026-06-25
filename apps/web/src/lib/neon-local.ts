/**
 * Local-development shim for @neondatabase/serverless.
 *
 * The app's data layer (src/app/api/utils/sql.ts via `neon()` and
 * src/lib/auth.ts via `Pool`) speaks Neon's HTTP/WebSocket protocol, which
 * normally targets Neon Cloud. For local dev we run a Neon-compatible proxy
 * (ghcr.io/timowilhelm/local-neon-http-proxy) in front of a plain Postgres,
 * and point the driver's global config at it.
 *
 * Activated only when NEON_LOCAL_PROXY is set (e.g. "localhost:4444"), so this
 * is a no-op in any environment that talks to real Neon Cloud. neonConfig is a
 * process-wide singleton, and fetchEndpoint / wsProxy / useSecureWebSocket are
 * read at query/connect time, so configuring it here (before the first query)
 * applies to every consumer in the same Node process.
 */
import { neonConfig } from '@neondatabase/serverless';

let configured = false;

export function configureNeonLocalProxy(): void {
  if (configured) return;

  const proxy = process.env.NEON_LOCAL_PROXY;
  if (!proxy) return; // talking to real Neon Cloud — leave defaults untouched

  // HTTP path — used by `neon()` one-shot queries (sql.ts)
  neonConfig.fetchEndpoint = `http://${proxy}/sql`;

  // WebSocket path — used by `Pool` (auth.ts)
  neonConfig.useSecureWebSocket = false;
  neonConfig.wsProxy = () => `${proxy}/v2`;
  // The local proxy does not support libpq connect-time password pipelining.
  neonConfig.pipelineConnect = false;

  configured = true;
  // eslint-disable-next-line no-console
  console.log(`[neon-local] driver pointed at local proxy http(s)://${proxy}`);
}

// Configure eagerly on import as well, so importing this module from a route is
// sufficient even if instrumentation has not run yet.
configureNeonLocalProxy();
