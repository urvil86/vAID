// V-Aid Service Worker — DISABLED for the testing phase.
//
// The previous version precached the app shell ("/", "/clinic/queue") and
// served static assets cache-first, which made browsers keep running a stale
// build (e.g. the old sign-in redirect) after code changes. This kill-switch
// version purges every cache, unregisters itself, and reloads open tabs so the
// browser always loads the live build. /sw.js is served with no-cache headers
// (see next.config.js), so browsers pick this up on the next navigation.
//
// To restore offline/PWA support after testing, reinstate the caching SW from
// version control.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Wipe all caches created by the old service worker.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
      // Remove this service worker entirely.
      await self.registration.unregister();
      // Reload any controlled tabs so they fetch the current build fresh.
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })()
  );
});

// No fetch handler — every request goes straight to the network.
