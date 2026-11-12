// ---- tools/news-clips.mjs: the videos in Taiwan's articles, read off Cloudflare ----
// Orbit News' stories take a clip from their outlets' own articles (Jay
// 11-12: "get the video embedded in a news web page … Taiwanese news site is
// the weak spot"). Most of Taiwan's outlets refuse Cloudflare's reads of an
// article (TVBS, 聯合, 中央社, 三立, 自由…), so GitHub Actions reads them
// (.github/workflows/news-clips.yml, started by the news build's newsClips
// when the last finds are 15 minutes old) and writes
//
//   news/clips.json  { at, pages: { url: { y, v?, at } }, shorts: { id: ±when } }
//
// through the proxy's /data/push (DATA_PUSH_SECRET): each page's clips
// (builders/news.js pageOf: a YouTube clip played in the app, else the
// outlet's own player), Shorts left out (shortOf, asked once, kept 4 days).
// A page is read once; kept while its story is on the front, or 2 days.
//
//   node tools/news-clips.mjs [--dry]   (--dry: read and counted, nothing written)
import { clipsToRead, readPage, shortOf, NEWS_CLIPS, KEEP_MS } from '../builders/news.js';

const API = (process.env.ORBIT_API || 'https://orbit-workers-proxy.pengzjay.workers.dev').replace(/\/$/, '');
const SECRET = process.env.DATA_PUSH_SECRET || '';
const DRY = process.argv.includes('--dry');
const AT_ONCE = 4;
const now = Date.now();
const t0 = Date.now();

const get = async path => {
  const r = await fetch(`${API}/data/${path}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  return r?.ok ? r.json().catch(() => null) : null;
};
const index = await get('news/index.json');
if (!index?.tw) {
  console.error('news clips: no index');
  process.exit(1);
}
const last = (await get(NEWS_CLIPS)) || {};
// (What's kept: pages still on the front, or read in the last 2 days; Shorts' answers 4 days.)
const onFront = new Set(index.tw.flatMap(s => (s.items || []).map(it => it[2])));
const pages = Object.fromEntries(Object.entries(last.pages || {}).filter(([u, p]) => onFront.has(u) || now - (p.at || 0) <= KEEP_MS));
const shorts = Object.fromEntries(Object.entries(last.shorts || {}).filter(([, at]) => now - Math.abs(at) <= 2 * KEEP_MS));

const want = clipsToRead(index, pages);
const why = {};
const found = {};
// (A few at a time, each site's in turn, so none is asked too fast.)
const queue = [...want];
await Promise.all(
  Array.from({ length: AT_ONCE }, async () => {
    for (let u; (u = queue.shift()); ) {
      const host = new URL(u).hostname;
      found[u] = await readPage(u, { why: w => (why[host] = [...(why[host] || []), w]) });
      await new Promise(r => setTimeout(r, 400));
    }
  })
);
const ask = [...new Set(Object.values(found).flatMap(p => p?.y || []))].filter(id => !(id in shorts));
for (const id of ask) shorts[id] = (await shortOf(id)) ? -now : now;
let clips = 0;
let own = 0;
for (const u of want) {
  const p = found[u];
  // (A page that wouldn't answer is kept as read too, empty: not asked again.)
  const y = (p?.y || []).filter(id => !(shorts[id] < 0));
  pages[u] = { y, ...(p?.v?.length ? { v: p.v } : {}), at: now };
  if (y.length) clips++;
  else if (p?.v?.length) own++;
}
const failed = Object.entries(why).map(([h, w]) => `${h} ${w.length}× ${w[0]}`);
console.log(`news clips: ${want.length} pages read, ${clips} with a YouTube clip, ${own} with the outlet's own player; ${ask.length} clips asked (${ask.filter(id => shorts[id] < 0).length} Shorts); ${Object.keys(pages).length} kept; ${((Date.now() - t0) / 1000).toFixed(1)} s${failed.length ? `; unread: ${failed.join(', ')}` : ''}`);
if (DRY) process.exit(0);
if (!SECRET) {
  console.error('news clips: no DATA_PUSH_SECRET');
  process.exit(1);
}

// data.js /data/push: frames of [u32 path length][path][u32 size][bytes].
function frame(path, text) {
  const p = Buffer.from(path);
  const b = Buffer.from(text);
  const head = Buffer.alloc(8 + p.length);
  head.writeUInt32BE(p.length, 0);
  p.copy(head, 4);
  head.writeUInt32BE(b.length, 4 + p.length);
  return Buffer.concat([head, b]);
}
const body = frame(NEWS_CLIPS, JSON.stringify({ at: now, pages, shorts }));
for (let tries = 0; ; tries++) {
  const r = await fetch(`${API}/data/push`, { method: 'POST', headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/octet-stream' }, body }).catch(e => ({ ok: false, status: String(e) }));
  if (r.ok) {
    console.log('pushed', JSON.stringify(await r.json()));
    break;
  }
  if (tries >= 3) {
    console.error(`news clips: push ${r.status}`);
    process.exit(1);
  }
  await new Promise(res => setTimeout(res, 3000 * (tries + 1)));
}
