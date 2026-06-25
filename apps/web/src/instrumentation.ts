/**
 * Next.js instrumentation hook — runs once at server startup, before any route
 * handler. We use it to configure the Neon driver for the local dev proxy so
 * both the `neon()` HTTP path and the `Pool` WebSocket path are wired up before
 * the first database query (see src/lib/neon-local.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { configureNeonLocalProxy } = await import('./lib/neon-local');
    configureNeonLocalProxy();
  }
}
