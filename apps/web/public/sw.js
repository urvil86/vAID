// V-Aid Service Worker — intentionally a no-op (PWA not enabled yet).
//
// It clears any stale caches from a previous service-worker version, takes
// control, and then does nothing else: no precache, no fetch handler (every
// request goes straight to the network), and crucially NO page reload. This
// replaces an earlier self-reloading "kill-switch" worker that caused a
// reload loop in production. /sw.js is served with no-cache headers (see
// next.config.js), so browsers pick this up on the next navigation.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// No fetch handler — the network serves everything.
