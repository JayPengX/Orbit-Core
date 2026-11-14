// ---- law-page.js: GET /law-page, a government page read inside Orbit Law ----
// ?u=<url>&v=1&qt=<a Pass of Orbit Law's>: the page as JSON, so the reader
// never leaves the app. Only government hosts (gov.tw and its subdomains,
// www.edu.tw), https (http is upgraded), redirects followed while they stay
// on them. A page: { url (the final one), type: 'html', html } in its own
// charset (Big5 too), its scripts, styles, noscripts and handlers taken out,
// 2 MB at most; a PDF or another file: { url, type: 'pdf' | 'file', size }.
// Nothing stored but Cloudflare's cache (judicial rulings 30 days, the rest
// a day); 500 fresh reads a Pass a day (a cached one is free).
// Orbit Law's nightly build, with its key (X-Build-Key = the secret
// LAW_BUILD_KEY) in place of a Pass, reads the county 法規 sites that serve
// only Taiwan (law-hosts.js) here, from Taiwan through gemini-relay (720 a
// minute: a page a second for each of the 12 sites).
import { json, isAllowedOrigin } from './http.js';
import { fail, twDay, passOf, passKey, countOf, addOne } from './law.js';
import { sessionLimited } from './orbit-token.js';
import { twOnly, viaTaiwan, buildKeyOk, buildHost, judicialData } from './law-hosts.js';

export const PAGE_LIMITS = { perPass: 500, perMinute: 60, buildPerMinute: 720, hops: 5, timeoutMs: 20_000, maxHtml: 2 * 1024 * 1024, maxBytes: 6 * 1024 * 1024, fileBytes: 40 * 1024 * 1024, audioBytes: 600 * 1024 * 1024 };
const LONG = new Set(['judgment.judicial.gov.tw', 'cons.judicial.gov.tw']);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// A government host: gov.tw, a name under it, or www.edu.tw.
export const allowedHost = h => {
  const host = String(h || '').toLowerCase();
  return host === 'gov.tw' || host.endsWith('.gov.tw') || host === 'www.edu.tw';
};

// The url as it's fetched and cached: https, no credentials, port or
// fragment; null when it isn't a government page's.
export function pageUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || u.port || !allowedHost(u.hostname)) return null;
  u.protocol = 'https:';
  u.hash = '';
  return u.toString();
}

// The page's charset: the header's, else its <meta>'s, else UTF-8.
export function charsetOf(type, bytes) {
  const fromHeader = /charset\s*=\s*["']?([\w-]+)/i.exec(type || '')?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  return (/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1] || 'utf-8').toLowerCase();
}
export function decode(bytes, charset) {
  const cs = /^(big5|big5-hkscs|x-x-big5|cp950|ms950)$/.test(charset) ? 'big5' : charset;
  try {
    return new TextDecoder(cs).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// What the app shows: no script, style or noscript, no on* handler and no
// javascript: link; at most 2 MB.
export function cleanHtml(html, max = PAGE_LIMITS.maxHtml) {
  const out = String(html)
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|noscript)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|action)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1="#"');
  return out.length > max ? out.slice(0, max) : out;
}

// The page, redirects followed while they stay on government hosts.
// → { url, res } or { error, status }.
// A file's read (the build's) is timed to its answer only: a recording's bytes take minutes to stream.
async function fetchPage(url, fetchFn, { file = false } = {}) {
  let at = url;
  for (let hop = 0; hop <= PAGE_LIMITS.hops; hop++) {
    const stop = file && new AbortController();
    const timer = file && setTimeout(() => stop.abort(), PAGE_LIMITS.timeoutMs);
    const res = await fetchFn(at, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8', 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.5' }, signal: file ? stop.signal : AbortSignal.timeout(PAGE_LIMITS.timeoutMs) }).finally(() => file && clearTimeout(timer));
    if (res.status < 300 || res.status >= 400) return { url: at, res };
    const next = pageUrl(new URL(res.headers.get('Location') || '', at).toString());
    if (!next) return { error: 'host', status: res.status };
    at = next;
  }
  return { error: 'upstream', status: 310 };
}

// The body's bytes, 6 MB at most.
async function bytesOf(res) {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    n += value.length;
    if (n >= PAGE_LIMITS.maxBytes) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  const out = new Uint8Array(Math.min(n, PAGE_LIMITS.maxBytes));
  let at = 0;
  for (const p of parts) {
    const take = p.subarray(0, out.length - at);
    out.set(take, at);
    at += take.length;
    if (at >= out.length) break;
  }
  return out;
}

// The build's own read of a file (`&file=1`, its key only): a PDF's bytes passed straight through, never held
// or encoded here (its text is read at build: a 代表會's 決議案 on a site that serves only Taiwan); any other
// answer as it came too (臺北市議會's video lists, its JSON and pages).
export async function readPage(url, fetchFn = fetch, { file = false } = {}) {
  const got = await fetchPage(url, fetchFn, { file });
  if (got.error) return got;
  const { res } = got;
  if (!res.ok) {
    res.body?.cancel?.().catch(() => {});
    return { error: 'upstream', status: res.status };
  }
  const type = res.headers.get('Content-Type') || '';
  // The build's file read takes any answer as it came (a Taiwan-only site's own JSON or page, scripts and all), up to a file's size.
  if (file && !/pdf/i.test(type) && !/\.pdf$/i.test(new URL(got.url).pathname)) {
    const size = Number(res.headers.get('Content-Length')) || null;
    // A 代表會's meeting recording (heard at build on a GitHub runner) runs to hundreds of MB: streamed, never held.
    const audio = /^audio\//i.test(type) || /\.(mp3|m4a|wav|aac)$/i.test(new URL(got.url).pathname);
    if (!size || size <= (audio ? PAGE_LIMITS.audioBytes : PAGE_LIMITS.fileBytes)) return { url: got.url, type: 'file', size, body: res.body, ctype: type || 'application/octet-stream' };
  }
  if (!/text\/html|application\/xhtml|text\/plain/i.test(type) && type) {
    const size = Number(res.headers.get('Content-Length')) || null;
    const kind = /pdf/i.test(type) || /\.pdf$/i.test(new URL(got.url).pathname) ? 'pdf' : 'file';
    if (file && kind === 'pdf' && (!size || size <= PAGE_LIMITS.fileBytes)) return { url: got.url, type: 'pdf', size, body: res.body };
    res.body?.cancel?.().catch(() => {});
    return { url: got.url, type: kind, size };
  }
  const bytes = await bytesOf(res);
  const text = decode(bytes, charsetOf(type, bytes));
  return { url: got.url, type: 'html', html: /text\/plain/i.test(type) ? cleanHtml(`<pre>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`) : cleanHtml(text) };
}

const cacheKey = url => `https://law-page.cache/v1?u=${encodeURIComponent(url)}`;
const ttlOf = url => (LONG.has(new URL(url).hostname) ? 30 * 86_400 : 86_400);
const edge = () => (typeof caches !== 'undefined' && caches.default) || null;

// session: the request's Orbit Pass session (worker.js), or null.
export async function handleLawPage(request, env, ctx, headers, session, fetchFn = fetch) {
  if (request.method !== 'GET') return fail('method', 405, headers);
  const origin = request.headers.get('Origin') || '';
  if (origin && !isAllowedOrigin(origin)) return fail('origin', 403, headers);
  const pass = passOf(session);
  const raw = new URL(request.url).searchParams.get('u');
  const build = !pass && (twOnly(raw) || buildHost(raw)) && buildKeyOk(request.headers.get('X-Build-Key'), env?.LAW_BUILD_KEY);
  if (!pass && !build) return fail('pass', 401, headers);
  const url = pageUrl(raw);
  if (!url) return fail('host', 400, headers);
  if (sessionLimited(build ? 'law:build' : `law:page:${pass}`, build ? PAGE_LIMITS.buildPerMinute : PAGE_LIMITS.perMinute)) return fail('busy', 429, headers);
  // A site that serves only Taiwan (a county's rules, 司法院's judgments) is read from there (when the relay is bound).
  // (The build's every read too: it runs abroad and wants Taiwan's view.)
  const via = (viaTaiwan(url) || build) && env?.GEMINI_RELAY ? (u, init) => env.GEMINI_RELAY.fetch(`https://gemini-relay/?to=${encodeURIComponent(u)}`, init) : fetchFn;

  // A file's bytes are the build's alone, and never kept at the edge.
  const file = build && new URL(request.url).searchParams.get('file') === '1';
  const cache = file ? null : edge();
  const key = cacheKey(url);
  const hit = cache && (await cache.match(key).catch(() => null));
  if (hit) return json({ ...(await hit.json()), cached: true }, 200, headers);

  if (!build) {
    const day = twDay();
    const who = await passKey('page', pass, day);
    if ((await countOf(env, who, day)) >= PAGE_LIMITS.perPass) return fail('cap', 429, headers, { left: 0 });
    await addOne(env, who, day);
  }

  let out;
  try {
    out = await readPage(url, via, { file });
  } catch {
    return fail('upstream', 502, headers, { status: 0 });
  }
  if (out.error === 'host') return fail('host', 400, headers);
  if (out.error) return fail('upstream', 502, headers, { status: out.status });
  if (out.body) return new Response(out.body, { status: 200, headers: { ...headers, 'Content-Type': out.ctype || 'application/pdf', 'Cache-Control': 'no-store', ...(out.size ? { 'Content-Length': String(out.size) } : {}) } });
  if (cache) ctx?.waitUntil?.(cache.put(key, new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttlOf(url)}` } })).catch(() => {}));
  return json({ ...out, cached: false }, 200, headers);
}

// /law-judicial?u=: 司法院's open data for the rulings store's build (its key only), read from
// Taiwan through the relay: JDoc's API (POST) and the monthly archives (a member token, files of
// a few hundred MB, streamed through, never kept). Nothing else.
export async function handleLawJudicial(request, env, headers, fetchFn = null) {
  if (request.method !== 'GET' && request.method !== 'POST') return fail('method', 405, headers);
  if (!buildKeyOk(request.headers.get('X-Build-Key'), env?.LAW_BUILD_KEY)) return fail('pass', 401, headers);
  const raw = new URL(request.url).searchParams.get('u') || '';
  if (!judicialData(raw)) return fail('host', 400, headers);
  const go = fetchFn || (env?.GEMINI_RELAY ? (u, init) => env.GEMINI_RELAY.fetch(`https://gemini-relay/?to=${encodeURIComponent(u)}`, init) : fetch);
  const pick = ['Content-Type', 'Authorization', 'Accept'].filter(h => request.headers.get(h)).map(h => [h, request.headers.get(h)]);
  let r;
  try {
    r = await go(raw, { method: request.method, headers: Object.fromEntries(pick), body: request.method === 'POST' ? await request.text() : undefined });
  } catch {
    return fail('upstream', 502, headers, { status: 0 });
  }
  const size = r.headers.get('Content-Length');
  return new Response(r.body, { status: r.status, headers: { ...headers, 'Content-Type': r.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': 'no-store', ...(size ? { 'Content-Length': size } : {}) } });
}
