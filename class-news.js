// ---- class-news.js: GET /class-news, a school's announcements for Orbit Class ----
// 學校公告摘要 (Jay 11-10, the AI plan): ?site=<the school's site>&qt=<a Pass of
// Orbit Class's>. Code reads the school's own list (its RSS; ischool's news
// list; a page's dated links, any CMS), the AI only words each new title for
// a student (one line, who it's for, what to do and by when: ai-features.js
// class-news). Built once per school an hour and kept in R2
// (`class-news/<host>.json`), shared by every student of that school; a title
// already worded is never sent again.
//   → { site, at, items: [{ id, title, url, date, unit, line, who, act, by }] }
// who: [] not for students, 'all', '1' '2' '3' (the school's grades), 'jh'
// (its 國中部), 'some' (a team, those who signed up). An item the AI hasn't
// worded (capped, failed) comes with its title alone.
// The sites are read from Taiwan (gemini-relay): some serve only Taiwan.
import { json, isAllowedOrigin, sha256Hex } from './http.js';
import { countOf, addOne } from './law.js';
import { sessionLimited } from './orbit-token.js';
import { aiOnce } from './ai.js';

export const NEWS = { freshMs: 3_600_000, edgeS: 600, days: 45, keep: 60, perPass: 30, perMinute: 6, timeoutMs: 15_000, maxBytes: 3 * 1024 * 1024, hops: 4, aiBatch: 30 };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// A school's site: a host under edu.tw, no credentials or port; null otherwise.
export const schoolHost = h => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.edu\.tw$/i.test(String(h || ''));
export function schoolSite(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim().replace(/^(?!https?:\/\/)/i, 'https://'));
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.port || !schoolHost(u.hostname)) return null;
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  return u.toString();
}
// What the relay may fetch for us: a school's page (GET), or ischool's news list (POST).
export const schoolRead = (to, method = 'GET') => {
  try {
    const u = new URL(to);
    if (!/^https?:$/.test(u.protocol) || u.port || !schoolHost(u.hostname)) return false;
    return method === 'GET' || (method === 'POST' && /\/ischool\/widget\/site_news\/news_query_json\.php$/.test(u.pathname));
  } catch {
    return false;
  }
};

// ---- Reading ----
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
export const unEnt = s =>
  String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&([a-z]+|#39);/gi, (m, k) => ENT[k.toLowerCase()] ?? m);
const textOf = s => unEnt(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const pad = n => String(n).padStart(2, '0');

// A date in some text (2026-11-10, 2026/11/10, 115.11.10, 115年11月10日; a
// bare 11/10 as this school year's) → YYYY-MM-DD, or ''.
export function dateIn(s, today) {
  const t = String(s || '');
  let y, mo, d;
  let m = /(?<!\d)(20\d\d|1[0-4]\d)\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?!\d)/.exec(t);
  if (m) {
    y = +m[1];
    if (y < 1000) y += 1911;
    mo = +m[2];
    d = +m[3];
  } else {
    m = /(?<![\d/.-])(\d{1,2})[/-](\d{1,2})(?![\d/.-])/.exec(t);
    if (!m) return '';
    mo = +m[1];
    d = +m[2];
    y = +today.slice(0, 4);
    // (A month more than 2 ahead of today's is last year's: December's in February.)
    if (mo - +today.slice(5, 7) > 2) y -= 1;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${y}-${pad(mo)}-${pad(d)}`;
}
// An RSS 2.0 or Atom date (Tue, 10 Nov 2026 02:35:11 GMT; 2026-11-10 10:35:11; ISO) → Taiwan's day.
function feedDay(s, today) {
  const t = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}(?:$|[ T]\d{1,2}:\d{2}(?::\d{2})?$)/.test(t)) return t.slice(0, 10);
  const ms = Date.parse(t);
  if (Number.isFinite(ms)) return new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
  return dateIn(t, today);
}
const tag = (block, name) => {
  const m = new RegExp(`<${name}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${name}>)`, 'i').exec(block);
  return m ? m[1] ?? '' : null;
};

// An RSS or Atom feed's items.
export function feedItems(xml, base, today) {
  const out = [];
  for (const [block] of String(xml || '').matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const title = textOf(tag(block, 'title'));
    let url = textOf(tag(block, 'link') || '');
    if (!url) url = unEnt(/<link\b[^>]*href=["']([^"']+)/i.exec(block)?.[1] || '');
    const date = feedDay(textOf(tag(block, 'pubDate') ?? tag(block, 'published') ?? tag(block, 'updated') ?? tag(block, 'dc:date') ?? ''), today);
    const unit = textOf(tag(block, 'author') ?? tag(block, 'dc:creator') ?? '').slice(0, 20);
    const desc = textOf(unEnt(tag(block, 'description') ?? tag(block, 'summary') ?? tag(block, 'content') ?? '')).slice(0, 240);
    out.push({ title, url: absolute(url, base), date, unit, desc });
  }
  return out;
}
// ischool's news list (news_query_json.php): [{ meta }, { newsId, time, title, unit_name, attr_name }…].
export function ischoolItems(list, base) {
  const origin = new URL(base).origin;
  return (Array.isArray(list) ? list : [])
    .filter(x => x && x.newsId != null)
    .map(x => ({ title: textOf(x.title), url: `${origin}/ischool/public/news_view/show.php?nid=${encodeURIComponent(x.newsId)}`, date: String(x.time || '').replace(/\//g, '-').slice(0, 10), unit: textOf(x.unit_name).slice(0, 20), kind: textOf(x.attr_name).slice(0, 10) }));
}
const absolute = (href, base) => {
  try {
    const u = new URL(unEnt(href), base);
    return /^https?:$/.test(u.protocol) ? u.toString() : '';
  } catch {
    return '';
  }
};
const cleanPage = html =>
  String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, '');

// A page's dated links, whatever made it: each block (a table row, a list
// item, a paragraph) with one date and a link of 6–140 characters.
export function pageItems(html, base, today) {
  const out = [];
  for (const row of cleanPage(html).split(/<\/(?:tr|li|p|div|dd|dt|article|section|h\d)>|<br\s*\/?>/i)) {
    if (!/<a\b/i.test(row)) continue;
    const words = textOf(row);
    if (words.length > 280) continue;
    const date = dateIn(words, today);
    if (!date) continue;
    for (const [, attrs, inner] of row.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const title = (textOf(inner) || unEnt(/title\s*=\s*["']([^"']+)/i.exec(attrs)?.[1] || '')).replace(/^(\d{2,4}[-/.]\d{1,2}[-/.]\d{1,2})\s*/, '').replace(/^((置頂|重要|最新|new|hot|top)\s+)+/i, '').trim();
      const n = [...title].length;
      if (n < 6 || n > 140) continue;
      const href = /href\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] || '';
      if (!href || /^(javascript|mailto|tel|#)/i.test(href)) continue;
      const url = absolute(href, base);
      if (url) out.push({ title, url, date, unit: '' });
    }
  }
  return out;
}

// Where a page leads to its list: ischool's news widgets (最新消息, 學生專區
// first), its feeds, its 更多 / 最新消息 links on the same site; a refresh.
export function pageLeads(html, base) {
  const page = String(html || '');
  const host = new URL(base).hostname;
  const same = u => {
    try {
      return new URL(u).hostname === host;
    } catch {
      return false;
    }
  };
  const rank = t => (/教職|教師|研習|招標|採購|校外|行事曆|榮譽/.test(t) ? 9 : /學生/.test(t) ? 0 : /最新|全部|公告|news/i.test(t) ? 1 : 5);
  const widgets = [...page.matchAll(/site_news\/main2\.php\?uid=(WID_[0-9]+_2_[0-9a-f]{40})[^>]*?title=["']([^"']*)/gi)].map(m => ({ uid: m[1], title: unEnt(m[2]) }));
  const ischool = [...new Map(widgets.map(w => [w.uid, w])).values()].filter(w => rank(w.title) < 9).sort((a, b) => rank(a.title) - rank(b.title)).slice(0, 2);
  const feeds = [];
  for (const m of page.matchAll(/<link\b[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)) {
    const href = /href=["']([^"']+)/i.exec(m[0])?.[1];
    if (href) feeds.push({ url: absolute(href, base), title: unEnt(/title=["']([^"']*)/i.exec(m[0])?.[1] || '') });
  }
  for (const m of page.matchAll(/<a\b([^>]*href=["']([^"']*(?:rssfeeds|\/rss|rss\.php|feed)[^"']*)["'][^>]*)>/gi)) feeds.push({ url: absolute(m[2], base), title: unEnt(/title=["']([^"']*)/i.exec(m[1])?.[1] || '') });
  const ours = [...new Map(feeds.filter(f => f.url && same(f.url) && rank(f.title) < 9).map(f => [f.url, f])).values()].sort((a, b) => rank(a.title) - rank(b.title));
  const feed = ours[0]?.url || feeds.find(f => f.url && same(f.url))?.url || '';
  const more = [];
  for (const [, attrs, inner] of cleanPage(page).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const words = `${textOf(inner)} ${unEnt(/title=["']([^"']*)/i.exec(attrs)?.[1] || '')}`;
    if (!/最新消息|校園公告|公告事項|全部消息|閱讀更多|更多消息|news/i.test(words) || /教職|招標|採購/.test(words)) continue;
    const url = absolute(/href\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] || '', base);
    if (url && same(url) && url !== base && !/site_news\//.test(url)) more.push(url);
  }
  const refresh = /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)/i.exec(page)?.[1];
  // (A site with a feed for each of its boards, 行政消息, 活動消息…: each one, its name.)
  // (Teachers' boards read too, only to take their posts out of the 全部 feed.)
  const nameOf = f => /[-－:：]\s*([^-－:：]{2,10})\s*$/.exec(f.title)?.[1] || '';
  const skip = [...new Map(feeds.filter(f => f.url && same(f.url) && rank(f.title) === 9).map(f => [f.url, f])).values()].slice(0, 3);
  const boards = ours.length > 1 ? [...ours.slice(0, 8).map(f => ({ url: f.url, name: nameOf(f) })), ...skip.map(f => ({ url: f.url, name: nameOf(f), skip: true }))] : [];
  return { ischool, feed, boards, more: [...new Set(more)].slice(0, 2), refresh: refresh ? absolute(refresh, base) : '' };
}

// The items kept: dated within the last NEWS.days (and up to a year ahead),
// once each (by title), newest first, NEWS.keep at most; each an id.
export async function settle(items, today) {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - NEWS.days * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.parse(`${today}T00:00:00Z`) + 365 * 86_400_000).toISOString().slice(0, 10);
  const seen = new Set();
  const out = [];
  for (const it of items.filter(x => x.title && x.url && x.date >= from && x.date <= to).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))) {
    const k = it.title.replace(/\s+/g, '');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: (await sha256Hex(`${it.url}|${it.title}`)).slice(0, 12), title: it.title.slice(0, 140), url: it.url, date: it.date, unit: it.unit || '', ...(it.kind ? { kind: it.kind } : {}), ...(it.desc ? { desc: it.desc } : {}) });
    if (out.length >= NEWS.keep) break;
  }
  return out;
}

// One answer's text, 3 MB at most, in its own charset (Big5 too).
async function textOfRes(res) {
  const buf = new Uint8Array(await res.arrayBuffer()).subarray(0, NEWS.maxBytes);
  const type = res.headers.get('Content-Type') || '';
  const head = new TextDecoder('latin1').decode(buf.subarray(0, 4096));
  const cs = (/charset\s*=\s*["']?([\w-]+)/i.exec(type)?.[1] || /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1] || /<\?xml[^>]+encoding=["']([\w-]+)/i.exec(head)?.[1] || 'utf-8').toLowerCase();
  try {
    return new TextDecoder(/^(big5|big5-hkscs|x-x-big5|cp950|ms950)$/.test(cs) ? 'big5' : cs).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}
// A school's page, its redirects followed while they stay on school sites;
// https first, then http (many schools' https is broken). → { url, text, type } | null
export async function getPage(url, fetchFn, init = {}) {
  const tries = url.startsWith('https:') ? [url, url.replace(/^https:/, 'http:')] : [url, url.replace(/^http:/, 'https:')];
  for (const first of tries) {
    let at = first;
    try {
      for (let hop = 0; hop <= NEWS.hops; hop++) {
        const res = await fetchFn(at, { redirect: 'manual', ...init, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml,application/json,*/*;q=0.8', 'Accept-Language': 'zh-TW,zh;q=0.9', ...(init.headers || {}) }, signal: AbortSignal.timeout(NEWS.timeoutMs) });
        if (res.status >= 300 && res.status < 400) {
          res.body?.cancel?.().catch(() => {});
          const next = schoolSite(new URL(res.headers.get('Location') || '', at).toString());
          if (!next) break;
          at = next;
          continue;
        }
        if (!res.ok) {
          res.body?.cancel?.().catch(() => {});
          break;
        }
        return { url: at, text: await textOfRes(res), type: res.headers.get('Content-Type') || '' };
      }
    } catch {}
  }
  return null;
}

const isFeed = (text, type) => /xml|rss|atom/i.test(type) || /^\s*(<\?xml[^>]*>\s*)?<(rss|feed)\b/i.test(text);

// A school's announcements, by code alone. → { items, how } (how: 'feed' | 'ischool' | 'page'), or null when its site couldn't be read.
export async function readSchool(site, fetchFn, today) {
  let page = await getPage(site, fetchFn);
  if (!page) return null;
  if (isFeed(page.text, page.type)) return { items: await settle(feedItems(page.text, page.url, today), today), how: 'feed' };
  for (let i = 0; i < 2; i++) {
    const { refresh } = pageLeads(page.text, page.url);
    if (!refresh || page.text.length > 4000) break;
    page = (await getPage(refresh, fetchFn)) || page;
  }
  const best = { items: [], how: 'page' };
  const take = async (items, how) => {
    const kept = await settle(items, today);
    if (kept.length > best.items.length) Object.assign(best, { items: kept, how });
  };
  const leads = pageLeads(page.text, page.url);
  // ischool: its 最新消息 (and 學生專區) lists, as JSON.
  if (leads.ischool.length) {
    const all = [];
    for (const w of leads.ischool) {
      const api = new URL('/ischool/widget/site_news/news_query_json.php', page.url).toString();
      const got = await getPage(api, fetchFn, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `field=time&order=DESC&pageNum=0&maxRows=30&keyword=&uid=${w.uid}&tf=1&auth_type=user` });
      try {
        all.push(...ischoolItems(JSON.parse(got?.text || '[]'), page.url));
      } catch {}
    }
    await take(all, 'ischool');
  }
  // Every board's feed (older posts than the one list keeps), each item named by its board.
  if (leads.boards.length) {
    const got = await Promise.all(leads.boards.map(b => getPage(b.url, fetchFn).then(r => (r && isFeed(r.text, r.type) ? feedItems(r.text, r.url, today).map(it => (it.unit || !b.name || /^(all|全部.*)$/i.test(b.name) ? it : { ...it, kind: b.name })) : []))));
    // (The boards' own first, so a post in both keeps its board's name.)
    const out = new Set(got.flatMap((list, i) => (leads.boards[i].skip ? list.map(it => it.title.replace(/\s+/g, '')) : [])));
    const named = got
      .filter((_, i) => !leads.boards[i].skip)
      .flat()
      .filter(it => !out.has(it.title.replace(/\s+/g, '')))
      .sort((a, b) => (b.kind ? 1 : 0) - (a.kind ? 1 : 0));
    await take(named, 'feed');
  }
  if (best.items.length < 8 && leads.feed) {
    const got = await getPage(leads.feed, fetchFn);
    if (got && isFeed(got.text, got.type)) await take(feedItems(got.text, got.url, today), 'feed');
  }
  if (best.items.length < 8) await take(pageItems(page.text, page.url, today), 'page');
  for (const more of best.items.length < 5 ? leads.more : []) {
    const got = await getPage(more, fetchFn);
    if (!got) continue;
    if (isFeed(got.text, got.type)) await take(feedItems(got.text, got.url, today), 'feed');
    else {
      const sub = pageLeads(got.text, got.url);
      if (sub.feed) {
        const f = await getPage(sub.feed, fetchFn);
        if (f && isFeed(f.text, f.type)) await take(feedItems(f.text, f.url, today), 'feed');
      }
      await take(pageItems(got.text, got.url, today), 'page');
    }
    if (best.items.length >= 5) break;
  }
  return best;
}

// ---- Wording (built once) ----
// The new items worded by the AI (class-news), the ones worded before kept as they were.
const WORDS = ['line', 'who', 'act', 'by'];
export function mergeWorded(items, before = [], worded = {}) {
  const old = new Map(before.filter(x => x.line != null && x.who != null).map(x => [x.id, x]));
  return items.map(it => {
    const w = worded[it.id] || old.get(it.id);
    return w ? { ...it, ...Object.fromEntries(WORDS.map(k => [k, w[k]])) } : it;
  });
}

const keyOf = site => {
  const u = new URL(site);
  const path = u.pathname.replace(/\/+$/, '');
  return `class-news/${u.hostname}${path && path !== '/home' && path !== '/index' ? `~${path.replace(/[^\w.-]+/g, '_').slice(0, 60)}` : ''}${u.search ? `~${u.search.replace(/[^\w.-]+/g, '_').slice(0, 40)}` : ''}.json`;
};
const twDay = (now = Date.now()) => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
const edge = () => (typeof caches !== 'undefined' && caches.default) || null;

// The school's list, fast: a copy within the hour answers at once; an older
// one answers at once too and is read again behind; none: the school's own
// titles now (code-read), the AI's lines written behind (`wording`), the
// phone asking again a few seconds on. One wording at a time a school.
const NEWS_V = 3; // the class-news prompt's version: a new one words every school again
const unworded = x => (x?.items || []).some(it => it.line == null);
export async function schoolNews(env, ctx, site, { cap = 0, fetchFn = fetch, now = Date.now(), build = true, force = false } = {}) {
  const key = keyOf(site);
  let kept = null;
  try {
    kept = (await (await env.DATA?.get(key))?.json?.()) || null;
  } catch {}
  // (A copy worded by an older prompt: its words dropped, so it's worded again.)
  if (kept && kept.v !== NEWS_V) kept = { ...kept, v: NEWS_V, at: kept.at, items: (kept.items || []).map(({ line, who, act, by, ...it }) => it) };
  const later = p => (ctx?.waitUntil ? ctx.waitUntil(p.catch(() => {})) : p.catch(() => {}));
  const put = v => env.DATA?.put(key, JSON.stringify(v), { httpMetadata: { contentType: 'application/json' } }) || Promise.resolve();
  const today = twDay(now);
  // The AI's lines for the titles not yet worded, then kept.
  const word = async base => {
    // (In batches of 30, newest first, each kept as it's done: the phone shows them as they come.)
    let out = base;
    for (let i = 0; i < Math.ceil(NEWS.keep / NEWS.aiBatch); i++) {
      const fresh = out.items.filter(it => it.line == null).slice(0, NEWS.aiBatch);
      if (!fresh.length) break;
      const r = await aiOnce(env, ctx, 'class-news', { school: new URL(site).hostname, today, items: fresh }, cap);
      // (Failing, each is marked tried, '' its line: the title shows, asked again with the next read.)
      const worded = r?.out || Object.fromEntries(fresh.map(it => [it.id, { line: '', who: null, act: '', by: '' }]));
      out = { ...out, items: mergeWorded(out.items, [], worded) };
      await put({ ...out, wordingAt: out.items.some(it => it.line == null) ? out.wordingAt || now : 0 });
    }
    out = { ...out, wordingAt: 0 };
    await put(out);
    return out;
  };
  const wording = x => !!x.wordingAt && now - x.wordingAt < 90_000;
  const startWording = base => {
    const marked = { ...base, wordingAt: now };
    later(put(marked).then(() => word(marked)));
    return { ...marked, wording: true };
  };
  if (kept && !force && now - kept.at < NEWS.freshMs) {
    if (!unworded(kept)) return kept;
    if (wording(kept) || !build) return { ...kept, wording: wording(kept) };
    return startWording(kept);
  }
  if (!build) return kept;
  const rebuild = async () => {
    const read = await readSchool(site, fetchFn, today);
    if (!read || !read.items.length) return kept ? { ...kept, stale: true } : { site, at: now, items: [], how: read ? read.how : 'none', unread: !read };
    // (What the school's list no longer shows but did, within 45 days, stays: a fuller list.)
    const seen = new Set(read.items.flatMap(it => [it.id, it.title.replace(/\s+/g, '')]));
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - NEWS.days * 86_400_000).toISOString().slice(0, 10);
    const older = (kept?.items || []).filter(it => !seen.has(it.id) && !seen.has(String(it.title || '').replace(/\s+/g, '')) && it.date >= from);
    const items = [...read.items, ...older].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, NEWS.keep);
    return { site, at: now, v: NEWS_V, how: read.how, items: mergeWorded(items, kept?.items) };
  };
  // An older copy answers now; the school is read again behind it.
  if (kept?.items?.length) {
    later(
      rebuild().then(out => {
        if (out.stale || out.unread) return;
        return unworded(out) ? put({ ...out, wordingAt: now }).then(() => word(out)) : put(out);
      })
    );
    return { ...kept, stale: true, wording: false };
  }
  const out = await rebuild();
  if (!out.items.length) return out;
  return unworded(out) ? startWording(out) : (later(put(out)), out);
}

// GET /class-news?site=… (a session of Orbit Class's).
export async function handleClassNews(request, env, ctx, headers, session, { cap = 0, fetchFn = null } = {}) {
  if (request.method !== 'GET') return json({ error: 'method' }, 405, headers);
  if (!isAllowedOrigin(request.headers.get('Origin') || '')) return json({ error: 'origin' }, 403, headers);
  const pass = session?.a === 'orbit' && typeof session.d === 'string' ? session.d : null;
  if (!pass) return json({ error: 'signin' }, 401, headers);
  const site = schoolSite(new URL(request.url).searchParams.get('site'));
  if (!site) return json({ error: 'site' }, 400, headers);
  const ck = new Request(`https://class-news.cache/v1?s=${encodeURIComponent(site)}`);
  const hit = await edge()?.match(ck).catch(() => null);
  if (hit) return json(await hit.json(), 200, headers);
  if (sessionLimited(`class-news:${pass}`, NEWS.perMinute)) return json({ error: 'busy' }, 429, headers);
  // A fresh read counts against the Pass's day (a kept one is free).
  const day = twDay();
  const who = `class-news:${(await sha256Hex(`cn|${day}|${pass}`)).slice(0, 24)}`;
  const may = (await countOf(env, who, day)) < NEWS.perPass;
  const via = fetchFn || (env.GEMINI_RELAY ? (u, init) => env.GEMINI_RELAY.fetch(`https://gemini-relay/?to=${encodeURIComponent(u)}`, init) : fetch);
  const out = await schoolNews(env, ctx, site, { cap, fetchFn: via, build: may });
  if (!out) return json({ error: 'cap' }, 429, headers);
  if (may && out.at > Date.now() - 60_000) await addOne(env, who, day);
  const body = { site: out.site, at: out.at, how: out.how, stale: !!out.stale, unread: !!out.unread, wording: !!out.wording, items: (out.items || []).map(({ desc, ...it }) => it) };
  // (Kept at the edge only when it's whole: while the AI words it, the phone asks again.)
  if (body.items.length && !body.wording && !unworded(body)) ctx?.waitUntil?.(edge()?.put(ck, new Response(JSON.stringify(body), { headers: { 'Cache-Control': `max-age=${NEWS.edgeS}` } })).catch(() => {}));
  return json(body, 200, headers);
}

// The ops check (ai-try, feature=class-news&site=): a school read and worded
// now, as a phone's first ask then its ask again; what each answered and when.
export async function classNewsTry(env, raw, cap, { force = false } = {}) {
  const site = schoolSite(raw);
  if (!site) return { error: 'site' };
  const via = env.GEMINI_RELAY ? (u, init) => env.GEMINI_RELAY.fetch(`https://gemini-relay/?to=${encodeURIComponent(u)}`, init) : fetch;
  const pending = [];
  const ctx = { waitUntil: p => pending.push(p) };
  const t0 = Date.now();
  const first = await schoolNews(env, ctx, site, { cap, fetchFn: via, force });
  const firstMs = Date.now() - t0;
  while (pending.length) await Promise.all(pending.splice(0));
  const doneMs = Date.now() - t0;
  const out = await schoolNews(env, ctx, site, { cap, fetchFn: via });
  while (pending.length) await Promise.all(pending.splice(0));
  return { site, how: out?.how, firstMs, wording: !!first?.wording, stale: !!first?.stale, firstLines: (first?.items || []).filter(it => it.line).length, doneMs, items: (out?.items || []).map(({ desc, ...it }) => it) };
}

// The ops check (ai-try, feature=class-news&peek=<a school's page>): that
// page as the relay reads it, to see how a school lays out its lists: its
// links (text, address) and a slice of its text (from, n).
export async function classNewsPeek(env, raw, { from = 0, n = 4000, method = 'GET', body = '', grep = '' } = {}) {
  const url = schoolSite(raw);
  if (!url) return { error: 'site' };
  const via = env.GEMINI_RELAY ? (u, init) => env.GEMINI_RELAY.fetch(`https://gemini-relay/?to=${encodeURIComponent(u)}`, init) : fetch;
  const got = await getPage(url, via, method === 'POST' ? { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body } : {});
  if (!got) return { url, error: 'unread' };
  const links = [...got.text.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => [textOf(m[2]).slice(0, 40), m[1].slice(0, 160)]).filter(([t]) => t).slice(0, 300);
  if (grep) {
    const re = new RegExp(grep, 'gi');
    return { url: got.url, length: got.text.length, hits: [...got.text.matchAll(re)].slice(0, 40).map(m => got.text.slice(Math.max(0, m.index - 200), m.index + 300)) };
  }
  return { url: got.url, type: got.type, length: got.text.length, feeds: [...got.text.matchAll(/<link\b[^>]*(?:rss|atom)[^>]*>/gi)].map(m => m[0]).slice(0, 10), links, text: got.text.slice(+from || 0, (+from || 0) + Math.min(+n || 4000, 20000)) };
}

// The ops check (ai-try, feature=class-news&read=<site>,<site>…): each school
// read by code alone, nothing worded or kept: how, how many, from when.
export async function classNewsRead(env, raws) {
  const via = env.GEMINI_RELAY ? (u, init) => env.GEMINI_RELAY.fetch(`https://gemini-relay/?to=${encodeURIComponent(u)}`, init) : fetch;
  const today = twDay();
  return Promise.all(
    String(raws || '').split(',').slice(0, 12).map(async raw => {
      const site = schoolSite(raw.trim());
      if (!site) return { site: raw, error: 'site' };
      const t0 = Date.now();
      const r = await readSchool(site, via, today).catch(e => ({ error: String(e?.message || e) }));
      const items = r?.items || [];
      return { site, how: r?.how || null, unread: !r, n: items.length, ms: Date.now() - t0, from: items.at(-1)?.date, kinds: [...new Set(items.map(x => x.kind || x.unit).filter(Boolean))].slice(0, 8), first: items.slice(0, 4).map(x => `${x.date} ${x.title.slice(0, 30)}`) };
    })
  );
}
