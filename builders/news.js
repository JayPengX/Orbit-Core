// Orbit News: the day's stories, each outlet's headline on it and where the
// outlet stands (kit/news-outlets.mjs). Built by the proxy every ten
// minutes (builders/run.js NEWS_MINUTES) into the family's data (R2):
//
//   1. each outlet's own feed read: its RSS (or Atom) or, where it has none,
//      the news sitemap it publishes for search engines; only the headline,
//      the link, the time, its own short summary (cut to SUM_MAX) and its
//      own picture's address (never the article, never a copy of a picture);
//      a feed that hasn't changed (ETag) isn't read again;
//   2. kept 48 hours (private/news/items.json.gz), so a feed showing only its
//      last 20 still adds up to the day;
//   3. grouped into stories by the words their headlines share (each word
//      weighed by how rare it is that day; Chinese in two-character pieces),
//      no AI: a headline joins the story it is nearest, if near enough and
//      within a day of it;
//   4. ranked by how many outlets carry a story, fading with its age.
//
// → news/index.json: { built, tw: [story], intl: [story] }, a story:
//   { id, title, sum, img, at, first, n, sides: { g, c, b } (or l, c, r),
//     blind: 'g' | 'b' | 'l' | 'r' | '' (the side that carries none of a
//     story the other side carries widely), parties: ['g','b','w'],
//     items: [[outlet, title, url, at]] }  (each outlet's newest first).
// Read by Orbit News through /data/ (data.js; index.json: 2 minutes at the edge).

import { OUTLETS, sideOf, partiesIn } from '../kit/news-outlets.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
export const NEWS_PATH = 'news/index.json';
export const NEWS_STATE = 'private/news/items.json.gz';
const HOUR = 3_600_000;
export const KEEP_MS = 48 * HOUR;
const WINDOW = { tw: 36 * HOUR, intl: 48 * HOUR };
export const SUM_MAX = { zh: 80, en: 160 };
const TOP = 120;

// Each outlet's feeds: [url, kind] ('rss' RSS, RDF or Atom; 'map' a news sitemap).
export const FEEDS = {
  ltn: ['all', 'politics', 'society', 'life', 'world', 'local'].map(c => [`https://news.ltn.com.tw/rss/${c}.xml`, 'rss']),
  setn: [['https://www.setn.com/sitemapGoogleNews.xml', 'map']],
  newtalk: [['https://newtalk.tw/rss/all', 'rss']],
  peoples: [['https://www.peoplenews.tw/feed/', 'rss']],
  cna: ['politics', 'mainland', 'intworld', 'social', 'finance'].map(s => [`https://feeds.feedburner.com/rsscna/${s}`, 'rss']),
  pts: [['https://news.pts.org.tw/xml/newsfeed.xml', 'rss']],
  ettoday: [['https://feeds.feedburner.com/ettoday/realtime', 'rss']],
  ebc: [['https://news.ebc.net.tw/sitemap/realtime.xml', 'map']],
  storm: [['https://www.storm.mg/sitemaps/1/article-news-1.xml', 'map']],
  mirror: [['https://www.mirrormedia.mg/rss/rss.xml', 'rss']],
  twreporter: [['https://www.twreporter.org/a/rss2.xml', 'rss']],
  tnl: [['https://feeds.feedburner.com/TheNewsLens', 'rss']],
  upmedia: [['https://www.upmedia.mg/sitemapnews', 'map']],
  tvbs: [['https://news.tvbs.com.tw/sitemap/news-sitemap', 'map']],
  udn: [['https://udn.com/sitemap/gnews_contents/2/1', 'map']],
  chinatimes: [['https://www.chinatimes.com/sitemaps/sitemap_todaynews.xml', 'map']],
  ctinews: [['https://ctinews.com/rss/sitemap-news.xml', 'map']],
  bbc: [['https://feeds.bbci.co.uk/news/world/rss.xml', 'rss'], ['https://feeds.bbci.co.uk/news/world/asia/rss.xml', 'rss']],
  wsj: [['https://feeds.a.dj.com/rss/RSSWorldNews.xml', 'rss']],
  ft: [['https://www.ft.com/world?format=rss', 'rss']],
  hill: [['https://thehill.com/policy/international/feed/', 'rss']],
  csm: [['https://rss.csmonitor.com/feeds/world', 'rss']],
  guardian: [['https://www.theguardian.com/world/rss', 'rss']],
  nyt: [['https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'rss']],
  wapo: [['https://feeds.washingtonpost.com/rss/world', 'rss']],
  aljazeera: [['https://www.aljazeera.com/xml/rss/all.xml', 'rss']],
  economist: [['https://www.economist.com/asia/rss.xml', 'rss'], ['https://www.economist.com/china/rss.xml', 'rss']],
  politico: [['https://rss.politico.com/politics-news.xml', 'rss']],
  time: [['https://time.com/feed/', 'rss']],
  nbc: [['https://feeds.nbcnews.com/nbcnews/public/world', 'rss']],
  cbs: [['https://www.cbsnews.com/latest/rss/world', 'rss']],
  abc: [['https://abcnews.go.com/abcnews/internationalheadlines', 'rss']],
  fox: [['https://moxie.foxnews.com/google-publisher/world.xml', 'rss']],
  nypost: [['https://nypost.com/world-news/feed/', 'rss']],
  wexam: [['https://www.washingtonexaminer.com/feed/', 'rss']],
  breitbart: [['https://feeds.feedburner.com/breitbart', 'rss']],
  dailycaller: [['https://dailycaller.com/feed/', 'rss']],
  natreview: [['https://www.nationalreview.com/feed/', 'rss']],
  dailymail: [['https://www.dailymail.co.uk/news/worldnews/index.rss', 'rss']],
  dw: [['https://rss.dw.com/rdf/rss-en-all', 'rss']],
  f24: [['https://www.france24.com/en/asia-pacific/rss', 'rss']],
  scmp: [['https://www.scmp.com/rss/4/feed', 'rss'], ['https://www.scmp.com/rss/3/feed', 'rss']],
  nikkei: [['https://asia.nikkei.com/rss/feed/nar', 'rss']],
  japantimes: [['https://www.japantimes.co.jp/feed/', 'rss']],
  diplomat: [['https://thediplomat.com/feed/', 'rss']],
  taipeitimes: [['https://www.taipeitimes.com/xml/index.rss', 'rss']],
  globaltimes: [['https://www.globaltimes.cn/rss/outbrain.xml', 'rss']],
  cgtn: [['https://www.cgtn.com/subscribe/rss/section/world.xml', 'rss']],
  xinhua: [['https://english.news.cn/rss/worldrss.xml', 'rss']]
};

// ---- Reading a feed ----------------------------------------------------------

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·' };
export function plain(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const cdata = s => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const tagOf = (block, name) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? m[1] : '';
};
const attrOf = (block, name, attr) => {
  const m = new RegExp(`<${name}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'i').exec(block);
  return m ? m[1] : '';
};
const timeOf = s => {
  const t = Date.parse(String(s || '').trim().replace(/^(\w{3}),(?=\S)/, '$1, '));
  return Number.isFinite(t) ? t : null;
};
// A picture's address from the feed: its media, enclosure or the first <img>.
function pictureOf(block) {
  const url =
    attrOf(block, 'media:content', 'url') ||
    attrOf(block, 'media:thumbnail', 'url') ||
    (/<enclosure\b[^>]*type=["']image/i.test(block) ? attrOf(block, 'enclosure', 'url') : '') ||
    tagOf(block, 'image:loc') ||
    /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(cdata(block))?.[1] ||
    '';
  const u = plain(url);
  return /^https:\/\//.test(u) ? u : '';
}

// A feed's items: { t, u, d, at, img }, whatever its kind.
export function parseFeed(xml, kind = 'rss') {
  const s = String(xml || '');
  const out = [];
  if (kind === 'map' || /<urlset\b/.test(s.slice(0, 2000))) {
    for (const m of s.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const b = m[1];
      const t = plain(tagOf(b, 'news:title'));
      const u = plain(tagOf(b, 'loc'));
      if (t && u) out.push({ t, u, d: '', at: timeOf(tagOf(b, 'news:publication_date')) ?? timeOf(tagOf(b, 'lastmod')), img: pictureOf(b) });
    }
    return out;
  }
  const atom = /<feed\b/.test(s.slice(0, 2000));
  for (const m of s.matchAll(atom ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/g : /<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const t = plain(tagOf(b, 'title'));
    const u = atom ? plain(attrOf(b, 'link', 'href')) : plain(tagOf(b, 'link')) || plain(tagOf(b, 'guid'));
    const d = plain(tagOf(b, atom ? 'summary' : 'description') || (atom ? tagOf(b, 'content') : ''));
    const at = timeOf(tagOf(b, 'pubDate')) ?? timeOf(tagOf(b, 'dc:date')) ?? timeOf(tagOf(b, 'published')) ?? timeOf(tagOf(b, 'updated'));
    if (t && /^https?:\/\//.test(u)) out.push({ t, u, d, at, img: pictureOf(b) });
  }
  return out;
}

// ---- What's kept of an item --------------------------------------------------

// Not news for a bar of sides: entertainment, sport, style, travel, opinion,
// stock tips (by the outlet's own address for them).
const SKIP_HOST = /^(?:star|ent|sports?|istyle|auto|speed|travel|house|health|pets?|game|fashion|beauty|food|talk|playing|3c|partners|fun|style)\./;
const SKIP_PATH = /\/(?:entertainment|sports?|lifestyle|opinion|star|fashion|travel|horoscope|astro|recipes?|style|video|podcasts?|live|newsletters?)\//;
// China Times' codes: 260403 sport, 260410 stock tips, 260417 the army's own, 260418 health tips, 2608xx history, 262xxx opinion.
const CT_SKIP = /-(?:260403|260410|260417|260418|2608\d\d|262\d\d\d)$/;
export function newsUrl(u) {
  try {
    const url = new URL(u);
    if (SKIP_HOST.test(url.hostname) || SKIP_PATH.test(url.pathname) || CT_SKIP.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}
// The address without trackers and fragments: one story, one address.
export function cleanUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|from$|ref$|cmpid$|rss$|ocid$|fbclid$|ch$)/i.test(k)) url.searchParams.delete(k);
    return url.toString();
  } catch {
    return u;
  }
}
// A headline without the outlet's own marks: 【快訊】, 《航運股》, 影/, 獨家》,
// "｜TVBS新聞網", " - BBC News".
export function cleanTitle(t) {
  let s = String(t || '').trim();
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s
      .replace(/^(?:【[^】]{1,10}】|\[[^\]]{1,10}\]|《[^》]{1,8}》|〈[^〉]{1,8}〉)\s*/, '')
      .replace(/^(?:快訊|獨家|最新|即時|影音?|圖|直播|更新|有片|焦點|專訪|獨|即|社論|評論|觀點|分析)\s*[／/》:：|｜]\s*/, '')
      .replace(/^[^\s》]{1,8}》\s*/, '')
      .trim();
    if (s === before) break;
  }
  return s.replace(/\s*[|｜]\s*[^|｜]{1,20}$/, '').replace(/\s+[-–—]\s+(?:BBC News|The Guardian|NBC News|CBS News|ABC News|Fox News|Al Jazeera|The New York Times)$/i, '').trim();
}
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
// A summary without its dateline: （中央社記者某某台南10日電）, (記者某某／台北報導).
export const undated = s => s.replace(/^\s*[（(][^（()）]{2,40}?(?:電|報導)[)）]\s*/, '').trim();

// ---- Grouping headlines into stories ----------------------------------------

const EN_STOP = new Set('a an the and or but of to in on at for from by with as is are was were be been being it its this that these those after before over under into about amid says say said new will would could can may might has have had not no than more most up down out off how why what who when where which while vs his her their our your they he she we you us them news live update updates latest report reports top first year years day days week'.split(' '));
// (English words cut to their first six letters: impeach, impeachment;
// hacked, hacking. Short headlines need the forms to meet.)
const stem = w => w.slice(0, 6);
// A headline's pieces: Chinese in two-character pieces, other words whole
// (English stemmed lightly, short words and numbers of one digit left out).
export function piecesOf(title, lang) {
  const s = cleanTitle(title).normalize('NFKC').toLowerCase();
  const out = [];
  if (lang === 'zh') {
    for (const run of s.match(/[㐀-鿿]+/g) || []) {
      if (run.length === 1) out.push(run);
      for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
    }
    for (const w of s.match(/[a-z][a-z0-9.+-]*[a-z0-9]|\d{2,}/g) || []) out.push(w);
    return out;
  }
  for (const w of s.replace(/['’]s\b/g, '').match(/[a-z0-9][a-z0-9-]*/g) || []) if (w.length > 2 && !EN_STOP.has(w)) out.push(stem(w));
  return out;
}

const norm = v => {
  let n = 0;
  for (const x of v.values()) n += x * x;
  return Math.sqrt(n) || 1;
};
function cosine(a, an, b, bn) {
  let dot = 0;
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  for (const [k, x] of s) {
    const y = l.get(k);
    if (y) dot += x * y;
  }
  return dot / (an * bn);
}
// How near is near enough: by language (two-character pieces overlap more
// by chance); then stories whose middles are this near are one.
export const JOIN = { zh: 0.27, en: 0.24 };
export const MERGE = { zh: 0.36, en: 0.3 };
// An English summary's words count for this much of a headline's.
const SUM_WEIGHT = 0.4;
const GAP = 24 * HOUR;

const add = (v, k, x) => v.set(k, (v.get(k) || 0) + x);

// items: [{ o, t, u, d, at, img }] of one region → stories (unranked).
export function groupStories(items, lang, { join = JOIN[lang], merge = MERGE[lang] } = {}) {
  const docs = items.map(it => ({ it, p: piecesOf(it.t, lang), s: lang === 'en' && it.d ? piecesOf(it.d, lang) : [] })).filter(d => d.p.length);
  const df = new Map();
  for (const d of docs) for (const p of new Set([...d.p, ...d.s])) df.set(p, (df.get(p) || 0) + 1);
  // Rarity counted as if among a day's headlines at least (a quiet hour's
  // few would weigh a shared piece below a stray one, or drop it).
  const N = Math.max(docs.length, 600);
  // A piece in more than one headline in twelve says nothing of which story.
  const common = N / 12;
  for (const d of docs) {
    const v = new Map();
    for (const [list, w] of [[d.p, 1], [d.s, SUM_WEIGHT]])
      for (const p of list) {
        const n = df.get(p);
        if (n > common) continue;
        add(v, p, w * Math.log(N / n));
      }
    d.v = v;
    d.n = norm(v);
  }
  docs.sort((a, b) => (a.it.at || 0) - (b.it.at || 0));
  let groups = [];
  const index = new Map(); // piece → groups holding it
  const note = (k, g) => (index.get(k) || index.set(k, []).get(k)).push(g);
  for (const d of docs) {
    if (!d.v.size) continue;
    const seen = new Set();
    let best = null;
    let bestSim = 0;
    for (const p of d.v.keys()) {
      for (const g of index.get(p) || []) {
        if (seen.has(g)) continue;
        seen.add(g);
        if ((d.it.at || 0) - g.last > GAP) continue;
        const sim = cosine(d.v, d.n, g.v, (g.n ??= norm(g.v)));
        if (sim > bestSim) (bestSim = sim), (best = g);
      }
    }
    if (best && bestSim >= join) {
      best.docs.push(d);
      for (const [k, x] of d.v) {
        if (!best.v.has(k)) note(k, best);
        add(best.v, k, x);
      }
      best.n = null;
      best.last = Math.max(best.last, d.it.at || 0);
      best.first = Math.min(best.first, d.it.at || 0);
    } else {
      const g = { docs: [d], v: new Map(d.v), n: d.n, last: d.it.at || 0, first: d.it.at || 0 };
      groups.push(g);
      for (const k of d.v.keys()) note(k, g);
    }
  }
  // Two stories with near middles, overlapping in time, are one (the same
  // news in other words, split by the order headlines came in).
  for (const g of groups) g.n = norm(g.v);
  const into = new Map();
  const root = g => {
    while (into.has(g)) g = into.get(g);
    return g;
  };
  for (const g of groups) {
    for (const k of g.v.keys())
      for (const h of index.get(k) || []) {
        if (h === g) continue;
        const a = root(g);
        const b = root(h);
        if (a === b || h.first > g.last + GAP || g.first > h.last + GAP) continue;
        if (cosine(g.v, g.n, h.v, h.n) >= merge) into.set(b, a);
      }
  }
  const whole = new Map();
  for (const g of groups) {
    const r = root(g);
    if (!whole.has(r)) whole.set(r, { docs: [], v: new Map() });
    const w = whole.get(r);
    w.docs.push(...g.docs);
    for (const [k, x] of g.v) add(w.v, k, x);
  }
  groups = [...whole.values()];
  return groups.map(g => {
    g.n = norm(g.v);
    return g.docs.map(d => ({ ...d.it, near: cosine(d.v, d.n, g.v, g.n) }));
  });
}

// A story from its headlines: the plainest headline leads (nearest the
// story's middle, a wire service or public broadcaster a little ahead).
const STEADY = new Set(['gov', 'public']);
export function storyOf(items, region, now) {
  const byOutlet = new Map();
  for (const it of [...items].sort((a, b) => (b.at || 0) - (a.at || 0))) {
    if (!byOutlet.has(it.o)) byOutlet.set(it.o, []);
    if (byOutlet.get(it.o).length < 3) byOutlet.get(it.o).push(it);
  }
  const lead = [...items].sort((a, b) => b.near + (STEADY.has(OUTLETS[b.o]?.kind) ? 0.12 : 0) - (a.near + (STEADY.has(OUTLETS[a.o]?.kind) ? 0.12 : 0)))[0];
  const withSum = [lead, ...items].find(it => it.d);
  const withImg = [lead, ...items].find(it => it.img);
  const sides = region === 'tw' ? { g: 0, c: 0, b: 0 } : { l: 0, c: 0, r: 0 };
  for (const o of byOutlet.keys()) {
    const s = sideOf(o, region);
    if (s) sides[s]++;
  }
  const [left, right] = region === 'tw' ? ['g', 'b'] : ['l', 'r'];
  // 單邊 (one side): carried by 3 outlets or more for 2 hours or more, 2 or
  // more of them on one side and none on the other: `blind`, the side that
  // missed it.
  const many = byOutlet.size >= 3 && now - Math.min(...items.map(it => it.at || now)) >= 2 * HOUR;
  const blind = many && sides[left] >= 2 && !sides[right] ? right : many && sides[right] >= 2 && !sides[left] ? left : '';
  const ats = items.map(it => it.at || now);
  const at = Math.max(...ats);
  const first = Math.min(...ats);
  const n = byOutlet.size;
  // Many outlets first, fading by half every 8 hours since the last headline;
  // carried by both sides, a little ahead.
  const score = n * 0.5 ** ((now - at) / (8 * HOUR)) * (sides[left] && sides[right] ? 1.2 : 1);
  const lang = region === 'tw' ? 'zh' : 'en';
  return {
    id: idOf(items.reduce((a, b) => ((a.at || 0) <= (b.at || 0) ? a : b)).u),
    title: cleanTitle(lead.t),
    // (Whose each is: the headline, the summary and the picture are the
    // outlets' own, credited on the phone.)
    by: lead.o,
    sum: withSum ? cut(undated(withSum.d), SUM_MAX[lang]) : '',
    sumBy: withSum?.o || '',
    img: withImg?.img || '',
    imgBy: withImg?.o || '',
    at,
    first,
    n,
    sides,
    blind,
    parties: region === 'tw' ? partiesIn(items.map(it => it.t).join(' ')) : [],
    items: [...byOutlet.values()].flat().map(it => [it.o, cleanTitle(it.t), it.u, it.at || now]),
    score
  };
}
// A story's id: its first headline's address, hashed short (FNV-1a), so a
// story keeps its id from build to build as headlines join it.
export function idOf(u) {
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

// The stories of one region, ranked; only those two outlets or more carry.
export function storiesOf(items, region, now) {
  const lang = region === 'tw' ? 'zh' : 'en';
  const mine = items.filter(it => OUTLETS[it.o]?.region === region && now - (it.at || now) <= WINDOW[region]);
  return groupStories(mine, lang)
    .filter(g => new Set(g.map(it => it.o)).size >= 2)
    .map(g => storyOf(g, region, now))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP)
    .map(({ score, ...s }) => s);
}

// ---- The build -----------------------------------------------------------------

// One feed read: its items, or `same` when its ETag says nothing changed.
async function readFeed(url, kind, tag, { fetchImpl = fetch } = {}) {
  const headers = { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' };
  if (tag) headers['If-None-Match'] = tag;
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(12_000) });
  if (res.status === 304) return { same: true };
  if (!res.ok) throw new Error(`${res.status}`);
  return { items: parseFeed(await res.text(), kind), etag: res.headers.get('ETag') || '' };
}

export async function runNews({ store, now = Date.now(), fetchImpl = fetch, feeds = FEEDS } = {}) {
  const kept = (await store.json(NEWS_STATE).catch(() => null)) || { items: [], etag: {} };
  const byUrl = new Map(kept.items.filter(it => now - it.at <= KEEP_MS && OUTLETS[it.o]).map(it => [it.u, it]));
  const etag = {};
  const failed = [];
  let fresh = 0;
  await Promise.all(
    Object.entries(feeds).flatMap(([o, list]) =>
      list.map(async ([url, kind]) => {
        try {
          const r = await readFeed(url, kind, kept.etag?.[url], { fetchImpl });
          if (r.same) return void (etag[url] = kept.etag[url]);
          if (r.etag) etag[url] = r.etag;
          const lang = OUTLETS[o].region === 'tw' ? 'zh' : 'en';
          for (const it of r.items) {
            const u = cleanUrl(it.u);
            if (!newsUrl(u) || byUrl.has(u)) continue;
            // (A time ahead of now is a feed's wrong zone: taken as now.)
            const at = Math.min(it.at ?? now, now);
            if (now - at > KEEP_MS) continue;
            byUrl.set(u, { o, t: it.t, u, d: cut(it.d, SUM_MAX[lang] * 2), at, img: it.img });
            fresh++;
          }
        } catch (e) {
          failed.push(`${o}: ${String(e?.message || e).slice(0, 40)}`);
        }
      })
    )
  );
  // (One outlet's same headline in two of its feeds: once.)
  const seen = new Set();
  const items = [...byUrl.values()].filter(it => {
    const k = `${it.o}|${cleanTitle(it.t)}`;
    return !seen.has(k) && seen.add(k);
  });
  await store.put(NEWS_STATE, { items, etag });
  const out = { built: now, tw: storiesOf(items, 'tw', now), intl: storiesOf(items, 'intl', now) };
  // (Never an empty page over a good one: a build that read nothing keeps the last.)
  if (out.tw.length || out.intl.length) await store.put(NEWS_PATH, out);
  return { items: items.length, fresh, tw: out.tw.length, intl: out.intl.length, failed };
}
