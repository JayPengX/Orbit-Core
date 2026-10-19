// The Quadra apps' shared service worker: keeps the page's own files so the
// app opens without a connection and can be installed. Anything on other
// sites (scores, prices, news) is never touched here.
//
// A file with a ?v= version (every deploy stamps one) is served from the
// cache first, since that exact version never changes; the page itself from
// the cache too, refreshed behind it (pageFirst); anything else from the
// network first, the cache only when offline.
// One copy per file is kept: a new version replaces the old one.
//
// The app's sw.js is one line (see tools/README.md, "Service worker"):
//   importScripts('../Shared-Proxy/kit/sw.js');
// and the deploy runs `node tools/stamp.mjs <that sw.js> --cache <name>
// --version <build> --assets <public dir>`, which writes the cache name,
// version and file list into the STAMP line below (in the app's copy of this
// file, or in the app's own sw.js as `self.QUADRA_SW = { ... }` before the
// importScripts, which wins over this line). Nothing else is app-specific.
// A page that isn't stamped (a dev server) still works: the name is
// 'quadra-app' and only './' is kept ahead.
// stamp:begin
const STAMP = { cache: 'quadra-app', version: '', assets: ['./'] };
// stamp:end
const CONFIG = { ...STAMP, ...(self.QUADRA_SW || {}) };
// This version's cache, and the prefix every version of it shares (the other
// Quadra apps share this site and its caches, so only this app's are cleared).
const PREFIX = `${CONFIG.cache}-`;
const CACHE = CONFIG.version ? `${PREFIX}${CONFIG.version}` : CONFIG.cache;

self.addEventListener('install', event => {
  // The page must be kept; a file of the list that fails doesn't stop the install.
  const assets = CONFIG.assets.filter(a => a !== './');
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(['./']).then(() => Promise.all(assets.map(a => cache.add(a).catch(() => {})))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => (k === CONFIG.cache || k.startsWith(PREFIX)) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function keep(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  // Drop older versions of the same file.
  for (const old of await cache.keys()) {
    const o = new URL(old.url);
    if (o.pathname === url.pathname && o.search !== url.search) await cache.delete(old);
  }
  await cache.put(request, response);
}

// A poor connection: the network gets this long before a kept copy answers
// (the network's copy still saved for next time). It had no limit: on a slow
// connection each file the page imports waited out the network in turn.
const PATIENCE_MS = 2500;
async function networkFirst(request) {
  const kept = request.mode === 'navigate' ? null : await caches.match(request);
  if (kept) {
    const fresh = networkFirstNow(request);
    const late = new Promise(done => setTimeout(() => done(kept), PATIENCE_MS));
    return Promise.race([fresh.catch(() => kept), late]);
  }
  return networkFirstNow(request);
}
async function networkFirstNow(request) {
  try {
    // The page itself is checked with the server every time (a cheap 304
    // when unchanged): GitHub Pages lets browsers keep it 10 minutes, which
    // would open the last deploy's page right after a new one. By address,
    // since a navigation can't be re-sent with options.
    const response = request.mode === 'navigate' ? await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' }) : await fetch(request);
    await keep(request, response.clone());
    return response;
  } catch (error) {
    // Offline: this file as kept, else any version of it kept (the kit's ?v= changes with each of its deploys).
    const cached = (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' && (await caches.match('./')));
    if (cached) return cached;
    throw error;
  }
}

// Opening the app: the page kept here at once (no wait for the network,
// even on a poor connection), refreshed in the background for next time.
// A newer deploy is caught by the kit's watchUpdates right after opening,
// which reloads under a ?v= address: that one always asks the network.
async function pageFirst(event) {
  const kept = await caches.match(event.request, { ignoreSearch: true });
  const fresh = networkFirst(event.request);
  if (!kept) return fresh;
  event.waitUntil(fresh.catch(() => {}));
  return kept;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    await keep(request, response.clone());
    return response;
  } catch (error) {
    // Offline with another version kept (the kit noted a newer one): that one, rather than no app at all.
    const other = await caches.match(request, { ignoreSearch: true });
    if (other) return other;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/version.json')) return;
  if (request.mode === 'navigate' && !url.searchParams.has('v')) return event.respondWith(pageFirst(event));
  event.respondWith(url.searchParams.has('v') && request.mode !== 'navigate' ? cacheFirst(request) : networkFirst(request));
});

// The page lists the files it loaded before this worker was in charge, so
// the very first visit already works offline next time.
self.addEventListener('message', event => {
  if (event.data?.type !== 'cache') return;
  const urls = (event.data.urls || []).filter(u => new URL(u).origin === self.location.origin && !u.endsWith('/version.json'));
  event.waitUntil(
    Promise.all(
      urls.map(u =>
        caches.match(u).then(hit => hit || fetch(u).then(r => keep(new Request(u), r)).catch(() => {}))
      )
    )
  );
});

// A tap on a price alert's notification opens (or focuses) the page.
self.addEventListener('notificationclick', event => {
  // A Quadra notice (quadra.mjs notify): open the app where it points.
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => c.url.startsWith(self.registration.scope));
      if (!open) return self.clients.openWindow(url);
      return open.focus().then(c => (url !== c.url && 'navigate' in c ? c.navigate(url) : c));
    })
  );
});

// A notice the Worker sent while the app was closed (Shared-Proxy/push.js):
// shown as it came; a tap opens the app where it points.
self.addEventListener('push', event => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data?.text() || '' };
  }
  const icon = new URL('./icons/icon-192.png', self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(data.title || 'Quadra', { body: data.body || '', tag: data.tag || undefined, icon, badge: icon, data: { url: data.url || self.registration.scope } }));
});
