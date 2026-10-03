// The old address's service worker, replaced by this one on the next check:
// it stops answering for the old page (so the move above is seen), and
// sends any open window on. The caches stay: the moved app uses them still.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await self.registration.unregister();
      for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
    })()
  );
});
