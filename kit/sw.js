// The Orbit apps' one service worker: keeps the page's own files so the
// app opens without a connection and can be installed. Anything on other
// sites (scores, prices, news) is never touched here (pictures: the kit's
// sw-images.js, imported before this by the apps that show them).
//
// An app's sw.js is its settings, then this file:
//   self.ORBIT_SW = { cache: 'orbit-law-v1', title: 'Orbit Law' };
//   importScripts('../Orbit-Core/kit/sw.js');
// cache: this app's cache (a new name drops the old one); prefix: what every
// version of its name starts with (the cache without its vN, by default), so
// only this app's old ones are deleted (the apps share one site); spare:
// other caches under that prefix that stay (Transit's data); title: a
// notice's title when it has none; route(request, url): 'pageFirst',
// 'cacheFirst', 'networkFirst', or an answer of the app's own (a Response
// promise), for what isn't the usual (Law's data, Beats' samples); prune(url):
// false keeps older copies of that file (Words' audio).
//
// A file with a ?v= (every deploy stamps one) is served from the cache
// first, since that exact version never changes; the page itself from the
// cache too, refreshed behind it (pageFirst); anything else from the
// network first, the cache only when offline. One copy per file is kept: a
// new version replaces the old one. Saving a copy never holds up the answer
// (it runs on after it, under waitUntil).
//
// A ?v= that is a file's own hash (12 hex digits, kit/hash.mjs) is checked
// against what came: GitHub Pages' CDN ignores the ?v=, so for a while after
// a deploy it can answer a new address with the old file. That copy was kept
// here for good, and the next openings mixed old and new files: the app
// stuck on its loading screen, which blamed the connection. Now a wrong copy
// is never kept: it's asked again past the browser's cache, and while the
// CDN still has the old one the page gets a 503 (boot.js then waits for the
// update to finish, and loads it).
const SW = { spare: [], route: () => null, prune: () => true, ...(self.ORBIT_SW || {}) };
const CACHE = SW.cache || 'orbit-app';
const PREFIX = SW.prefix || CACHE.replace(/v\d+$/, '');

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      // Only this app's own old copies: the other apps share this site (and its caches), and the pictures are kept for all of them.
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE && !SW.spare.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---- Each file checked against its address ----
const HASHED = /^[0-9a-f]{12}$/;
const hashedAs = url => {
  const v = new URL(url).searchParams.get('v');
  return v && HASHED.test(v) ? v : null;
};
async function sha12(buffer) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  let hex = '';
  for (let i = 0; i < 6; i++) hex += digest[i].toString(16).padStart(2, '0');
  return hex;
}
// Whether a response is the file its address names (an address without a file hash: always).
async function isTrue(url, response) {
  const want = hashedAs(url);
  if (!want || !response || response.status !== 200 || response.type === 'opaque') return true;
  try {
    return (await sha12(await response.clone().arrayBuffer())) === want;
  } catch {
    return false;
  }
}
// A request the network leaves hanging: nothing back in STALL_MS (or the
// file not all in BODY_MS after that) is dropped and asked once more, fresh.
// It had no limit: a phone's connection that went dead in its sleep (or a
// stream the CDN never answered) held a file the page imports, and the app
// sat on its loading screen; reloading asked the same dead connection, and
// only closing the app and opening it again got it going (Sports, 2026-10-31).
const STALL_MS = 8000;
const BODY_MS = 30_000;
async function fetchOnce(request, init) {
  const ctl = new AbortController();
  let timer = setTimeout(() => ctl.abort(), STALL_MS);
  try {
    const res = await fetch(request, { ...init, signal: ctl.signal });
    // (A redirect or another site's answer goes as it came: only a plain file's body is waited for here.)
    if (res.type !== 'basic' || res.status !== 200 || !res.body) return res;
    clearTimeout(timer);
    timer = setTimeout(() => ctl.abort(), BODY_MS);
    const body = await res.arrayBuffer();
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  } finally {
    clearTimeout(timer);
  }
}
async function fetchSure(request, init = {}) {
  try {
    return await fetchOnce(request, init);
  } catch (error) {
    // Offline is offline (the kept copies answer); a hung or cut one is asked again, past the browser's cache.
    if (self.navigator?.onLine === false) throw error;
    return fetchOnce(typeof request === 'string' ? request : request.url, { ...init, cache: 'reload', credentials: 'same-origin' });
  }
}
// The CDN still on the old file: asked again past the browser's cache (which
// may hold the same wrong copy for 10 minutes), a moment apart.
const AGAIN_MS = [0, 1500, 3500];
async function fetchTrue(request) {
  const first = await fetchSure(request);
  if (await isTrue(request.url, first)) return first;
  for (const wait of AGAIN_MS) {
    if (wait) await new Promise(done => setTimeout(done, wait));
    const res = await fetchOnce(request.url, { cache: 'reload', credentials: 'same-origin' }).catch(() => null);
    if (res && (await isTrue(request.url, res))) return res;
  }
  return new Response('', { status: 503, statusText: 'Update not ready', headers: { 'X-Orbit-Stale': '1' } });
}

async function keep(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  // Drop older versions of the same file (only that file's copies are listed).
  if (SW.prune(url)) for (const old of await cache.keys(url.origin + url.pathname, { ignoreSearch: true })) if (old.url !== url.href) await cache.delete(old);
  await cache.put(request, response);
}

// A poor connection: the network gets this long before a kept copy answers
// (the network's copy still saved for next time). It had no limit: on a slow
// connection each file the page imports waited out the network in turn.
const PATIENCE_MS = 2500;
// `later` takes what may run on after the answer (saving a copy).
async function networkFirst(request, later) {
  const kept = request.mode === 'navigate' ? null : await caches.match(request);
  if (kept) {
    const fresh = networkFirstNow(request, later);
    later(fresh);
    const late = new Promise(done => setTimeout(() => done(kept), PATIENCE_MS));
    return Promise.race([fresh.catch(() => kept), late]);
  }
  return networkFirstNow(request, later);
}
async function networkFirstNow(request, later) {
  try {
    // The page itself is checked with the server every time (a cheap 304
    // when unchanged): GitHub Pages lets browsers keep it 10 minutes, which
    // would open the last deploy's page right after a new one. By address,
    // since a navigation can't be re-sent with options.
    const response = request.mode === 'navigate' ? await fetchSure(request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' }) : await fetchSure(request);
    later(keep(request, response.clone()));
    return response;
  } catch (error) {
    // Offline: this file as kept, else any version of it kept (the kit's ?v= changes with each of its deploys).
    const cached = (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' && (await caches.match('./')));
    if (cached) return cached;
    throw error;
  }
}

// Opening the app: the server's page (an update's, or a cheap check that
// nothing changed) when it comes within PAGE_WAIT_MS, the kit's newest
// version read beside it and noted into the page for its loader; else the
// page kept here (a poor or no connection), refreshed behind for next time.
// It was the kept page every time: after a deploy the old version started,
// boot.js found the new one and reloaded onto it, so the app ran twice and
// its reads shared the link with the new files (Sports on 3G: 12 s on the
// loading screen; Jay 2026-11-06: "Always stuck here so long after an
// update", and he wants the new version on that same opening).
// Only on a link that answered the last opening's check quickly (QUICK_MS):
// on a slow one (3G) that wait is a round trip or three added to every
// opening, so the kept page answers at once, as before, and boot.js loads
// a newer version behind the cover.
const PAGE_WAIT_MS = 1200;
const QUICK_MS = 700;
const KIT_BASE = /\}\('([^']*Orbit-Core\/kit\/)',/;
// How long the last check took (kept across the worker's restarts; shared by the apps, one site, one link).
const LINK = { ms: null, key: '/__orbit/page-check-ms', cache: 'orbit-sw-link' };
async function lastCheckMs() {
  if (LINK.ms != null) return LINK.ms;
  try {
    const r = await (await caches.open(LINK.cache)).match(LINK.key);
    LINK.ms = r ? Number(await r.text()) || 0 : 0;
  } catch {
    LINK.ms = 0;
  }
  return LINK.ms;
}
function noteCheckMs(ms) {
  LINK.ms = ms;
  return caches.open(LINK.cache).then(c => c.put(LINK.key, new Response(String(Math.round(ms))))).catch(() => {});
}
async function pageFirst(request, later) {
  const kept = await caches.match(request, { ignoreSearch: true });
  if (!kept) return networkFirst(request, later);
  // (The page checked with the server, a cheap 304 when unchanged; kept for next time.)
  const t0 = Date.now();
  const net = fetchSure(request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' }).then(r => {
    later(noteCheckMs(Date.now() - t0));
    if (r.status === 200 && r.type !== 'opaqueredirect') later(keep(request, r.clone()));
    return r;
  });
  later(net.catch(() => noteCheckMs(PAGE_WAIT_MS * 2)));
  if ((await lastCheckMs()) > QUICK_MS) return kept;
  let base = null;
  try {
    const m = KIT_BASE.exec(await kept.clone().text());
    base = m ? new URL(m[1], request.url).href : null;
  } catch {}
  const kit = base
    ? fetchOnce(`${base}version.json`, { cache: 'no-cache', credentials: 'same-origin' })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null)
    : Promise.resolve(null);
  // (fetchSure's answer is one it built from the body: type 'default', not 'basic'.)
  const page = net.then(r => (r.status === 200 && r.type !== 'opaqueredirect' ? r : null), () => null);
  const got = await Promise.race([Promise.all([page, kit]), new Promise(done => setTimeout(() => done(null), PAGE_WAIT_MS))]);
  if (!got?.[0]) return kept;
  try {
    return await freshPage(got[0], got[1]);
  } catch {
    return kept;
  }
}
// The server's page with a note for boot.js (window.__orbitFresh: this is
// the newest, nothing to reload for) and the kit's newest files for its
// loader (orbit.kit, orbit.kitFiles), so a kit deploy opens on the new kit too.
async function freshPage(res, kit) {
  const html = await res.clone().text();
  const ok = kit?.version && kit.files;
  const note = `<script>window.__orbitFresh=${Date.now()};${
    ok ? `try{localStorage.setItem('orbit.kit',${JSON.stringify(kit.version)});localStorage.setItem('orbit.kitFiles',${JSON.stringify(JSON.stringify({ version: kit.version, files: kit.files }))})}catch(e){}` : ''
  }</script>`;
  const at = html.indexOf('<head>');
  if (at < 0) return res;
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(html.slice(0, at + 6) + note + html.slice(at + 6), { status: 200, statusText: res.statusText, headers });
}

// An update's reload (watchUpdates, boot.js: the page under ?v=<its
// version>): the page kept here when it is that version, at once. The watch
// fetched it (and every file it names) before swapping, so the new page
// opens from the phone like any other opening. It went to the network every
// time: a round trip at best, and on a connection that died while the app
// was in the background, 8 s and a second try before anything showed (the
// app sat on a blank or loading screen, and a restart opened it at once).
// Any other ?v= (a mend's reload) asks the network, as before.
async function versionFirst(request, later) {
  const want = new URL(request.url).searchParams.get('v');
  const kept = want ? await caches.match(request, { ignoreSearch: true }) : null;
  if (kept) {
    try {
      const page = await kept.clone().text();
      if (/<meta name="build-version" content="([^"]*)"/.exec(page)?.[1] === want) return kept;
    } catch {}
  }
  return networkFirst(request, later);
}

// The kit's boot.js is what mends an update that didn't finish (and draws
// the loading screen the apps report to): refused while the CDN still had the
// old one, nothing was left to mend it, and the app sat on a blank loading
// screen until it was closed and opened again. It stands alone (no imports),
// so another version of it (kept, else what came) beats none; never kept
// under this address.
const SELF_CONTAINED = /\/kit\/boot\.js$/;
async function cacheFirst(request, later) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetchTrue(request);
    if (response.headers.get('X-Orbit-Stale') && SELF_CONTAINED.test(new URL(request.url).pathname))
      return (await caches.match(request, { ignoreSearch: true })) || fetchSure(request.url, { cache: 'reload', credentials: 'same-origin' });
    later(keep(request, response.clone()));
    return response;
  } catch (error) {
    // Offline with another version kept (the kit noted a newer one): that
    // one, rather than no app at all. (Not for a file checked by its hash: a
    // different copy is what stops a page from starting.)
    const other = hashedAs(request.url) ? null : await caches.match(request, { ignoreSearch: true });
    if (other) return other;
    throw error;
  }
}

// The app's own pictures with no ?v= (a logo, an icon drawn by a template
// string): the copy kept here at once, checked with the network behind it.
// They went to the network first: every opening (and, on iPhone, a redraw the
// browser's memory didn't cover) waited a round trip with a blank where the
// logo goes (YouBike's in Transit, Jay 2026-11-03). A changed picture shows
// from the next time.
async function pictureFirst(request, later) {
  const kept = await caches.match(request);
  if (!kept) return networkFirstNow(request, later);
  later(networkFirstNow(request, later).catch(() => {}));
  return kept;
}

const ROUTES = { pageFirst, cacheFirst, networkFirst, versionFirst, pictureFirst };
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // (The proxy at the page's own /api/: its answers are the app's to keep, never this cache's.)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.endsWith('/version.json')) return;
  // What runs on after the answer: the event is kept alive until it's all done
  // (a save started while another was awaited is waited for too).
  const tail = [];
  const later = work => tail.push(Promise.resolve(work).catch(() => {}));
  const own = SW.route(request, url);
  const route = ROUTES[own] || (request.mode === 'navigate' ? (url.searchParams.has('v') ? versionFirst : pageFirst) : url.searchParams.has('v') ? cacheFirst : request.destination === 'image' ? pictureFirst : networkFirst);
  const answer = own && typeof own !== 'string' ? Promise.resolve(own) : route(request, later);
  event.respondWith(answer);
  event.waitUntil(
    (async () => {
      await answer.catch(() => {});
      for (let done = 0; done < tail.length; ) {
        const upTo = tail.length;
        await Promise.all(tail.slice(done, upTo));
        done = upTo;
      }
    })()
  );
});

// The page lists the files it loaded before this worker was in charge, so
// the very first visit already works offline next time (each checked, as
// any file this worker keeps). A file named by its hash is taken from the
// browser's copy the page just loaded, as it is (it can't change under its
// address, and its hash is checked): asking the server again cost the first
// visit a round trip each (Sports: 95 more requests over a phone's link
// while its first screen was still loading, 2026-11-05). Only the app's own
// files, as the fetch handler keeps: the page lists every address it read,
// and its reads through /api/ (each with its session's token, so new each
// time) were all downloaded again here whenever the app went to the
// background (a season's pack, a day's scores: hundreds of KB, and as many
// requests to the proxy, for nothing anyone reads from this cache).
// A file kept here already under another hash is left as it is: that one is
// the newer version, fetched for an update while the page that lists the old
// one was still open. A page leaving for its update listed the old version's
// files as it went (its last look on going out of sight), and each was
// downloaded again here and put back over the new version's, which the new
// page then downloaded again too (an update on a 3G link: 130 KB more, and
// the new page seconds later, Money 2026-11-05). A first visit has nothing
// kept, so all of its files are kept as before.
const ownFile = u => {
  try {
    const url = new URL(u);
    return url.origin === self.location.origin && !url.pathname.startsWith('/api/') && !url.pathname.endsWith('/version.json');
  } catch {
    return false;
  }
};
self.addEventListener('message', event => {
  if (event.data?.type !== 'cache') return;
  const urls = (event.data.urls || []).filter(ownFile);
  const mine = caches.open(CACHE);
  const another = async u => {
    const url = new URL(u);
    return Boolean(hashedAs(u) && SW.prune(url) && (await (await mine).keys(url.origin + url.pathname, { ignoreSearch: true })).length);
  };
  event.waitUntil(
    Promise.all(
      urls.map(u =>
        caches.match(u).then(async hit => {
          if (hit || (await another(u))) return;
          let res = hashedAs(u) ? await fetch(u, { cache: 'force-cache' }).catch(() => null) : null;
          if (!res || !(await isTrue(u, res))) res = await fetch(u).catch(() => null);
          if (res && (await isTrue(u, res))) await keep(new Request(u), res);
        })
      )
    )
  );
});

// A tap on a Orbit notice (orbit.mjs notify): opens (or focuses) the app where it points.
self.addEventListener('notificationclick', event => {
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

// A notice the Worker sent while the app was closed (Orbit-Core/push.js):
// shown as it came; a tap opens the app where it points.
self.addEventListener('push', event => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data?.text() || '' };
  }
  const icon = new URL('./icons/icon-192.png', self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(data.title || SW.title || 'Orbit', { body: data.body || '', tag: data.tag || undefined, icon, badge: icon, data: { url: data.url || self.registration.scope } }));
});
