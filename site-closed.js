// Longshot's shutdown notice (Jay 2026-10-31: Longshot is shut down, its
// Worker, data and back end removed; the code stays on GitHub). site.js
// answers every longshot.<DOMAIN> address with NOTICE, and its /sw.js with
// SW, which takes the old app off a phone that still keeps it.
export const NOTICE = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>Longshot</title>
<style>
:root { --bg: #f6f7f5; --fg: #17201b; --muted: #5d6a62; --card: #fff; --line: #dfe4e0; }
@media (prefers-color-scheme: dark) { :root { --bg: #0d1210; --fg: #e8eee9; --muted: #9aa69f; --card: #161d19; --line: #26302a; } }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { background: var(--bg); color: var(--fg); font: 16px/1.6 -apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", "Segoe UI", sans-serif; display: grid; place-items: center; padding: 24px 16px; }
main { max-width: 420px; width: 100%; background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 28px 24px; }
h1 { font-size: 22px; margin: 0 0 12px; }
p { margin: 0 0 10px; color: var(--muted); }
p:last-child { margin: 0; }
</style>
</head>
<body>
<main>
  <h1 id="t">Longshot 已停止服務</h1>
  <p id="a">Longshot 已經關閉，帳號、紀錄與所有資料都已移除，不會再開放。</p>
  <p id="b">謝謝你曾經來玩。</p>
</main>
<script>
if (!/^zh/i.test(navigator.language || '')) {
  document.documentElement.lang = 'en';
  t.textContent = 'Longshot has shut down';
  a.textContent = 'Longshot is closed for good. Its accounts, records and data have been removed.';
  b.textContent = 'Thank you for playing.';
}
if (navigator.serviceWorker) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
if (self.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
</script>
</body>
</html>
`;

// The old app's service worker, replaced: it empties its caches, lets go,
// and reloads every open copy onto the notice.
export const SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
})()));
`;
