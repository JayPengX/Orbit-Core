// ---- data.js: /data/…, the family's data on Cloudflare ----
// What doesn't change in a day (a league's season, the mirror's copies, watch
// links, win probability, photo lists, the bus packs, shapes, where.json),
// kept in R2 (bucket quadra-data, binding DATA) and served by the proxy at
// /data/<path> (everything on Cloudflare while the $5 plan is paid).
//
//   GET  /data/<path>        a file: the edge cache in Taiwan first (one R2
//                            read serves everyone for a few minutes), then R2
//   POST /data/push          files written or deleted (a builder's output),
//                            Bearer DATA_PUSH_SECRET; the body is frames of
//                            [u32 path length][path][u32 size][bytes], a
//                            size of 0xFFFFFFFF deleting the path
//   GET  /data/_list         what R2 holds ({ files: [[path, md5, size]],
//                            cursor }), the same secret: a builder sends only
//                            what changed
//
// `private/` (the store's backups) is never served: only a builder's
// _list sees it.
//
// Reads are public, as Pages' were (a phone reads a pack before it's signed
// in), counted per address in memory. R2's own allowance (10 GB, 1M writes,
// 10M reads a month) is watched by guard.js like the rest of the bill.

import { json } from './http.js';
import { sessionLimited } from './orbit-token.js';
import { sha256, gunzip } from './builders/store.js';

const TYPES = { json: 'application/json', gz: 'application/gzip', txt: 'text/plain; charset=utf-8', html: 'text/html; charset=utf-8' };
const typeOf = path => TYPES[/\.([a-z]+)$/.exec(path)?.[1]] || 'application/octet-stream';
// How long a phone and the edge keep a file: an index a few minutes (a new
// build is seen soon), the rest ten.
const maxAge = path => (/(^|\/)index\.json$|watch\.json$|unread\.json$/.test(path) ? 120 : 600);
export const cacheControl = path => `public, max-age=${maxAge(path)}`;
export const READS_PER_MIN = 900;
const DELETE = 0xffffffff;

// A file's path as kept: no empty, '.' or '..' parts, no leading slash.
export const validPath = p => typeof p === 'string' && p.length > 0 && p.length <= 900 && !p.startsWith('/') && !p.split('/').some(s => s === '' || s === '.' || s === '..');
export function cleanPath(raw) {
  try {
    const p = decodeURIComponent(raw);
    return validPath(p) ? p : null;
  } catch {
    return null;
  }
}

async function readFile(env, ctx, path, request) {
  const key = new Request(`https://orbit-data.orbit/${path}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const hit = cache && (await cache.match(key));
  // (A file not built yet is noted at the edge for 2 minutes: an app asks
  // again every 15 s, each an R2 read for nothing.)
  if (hit) return hit.headers.get('X-Data-Missing') ? new Response('', { status: 404 }) : hit;
  const obj = env.DATA ? await env.DATA.get(path) : null;
  if (!obj) {
    if (cache) ctx.waitUntil(cache.put(key, new Response('', { headers: { 'X-Data-Missing': '1', 'Cache-Control': 'public, max-age=120' } })));
    return new Response('', { status: 404 });
  }
  const res = new Response(obj.body, { headers: { 'Content-Type': typeOf(path), ETag: obj.httpEtag, 'Cache-Control': cacheControl(path) } });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

const authorized = (request, env) => !!env.DATA_PUSH_SECRET && request.headers.get('Authorization') === `Bearer ${env.DATA_PUSH_SECRET}`;

// The push body's frames, read as they come (a 40 MB batch never whole in memory).
export async function* frames(stream) {
  const reader = stream.getReader();
  let buf = new Uint8Array(0);
  let done = false;
  const need = async n => {
    while (buf.length < n && !done) {
      const r = await reader.read();
      if (r.done) done = true;
      else {
        const next = new Uint8Array(buf.length + r.value.length);
        next.set(buf);
        next.set(r.value, buf.length);
        buf = next;
      }
    }
    return buf.length >= n;
  };
  const take = n => {
    const out = buf.slice(0, n);
    buf = buf.slice(n);
    return out;
  };
  const u32 = b => new DataView(b.buffer, b.byteOffset, 4).getUint32(0);
  while (await need(4)) {
    const plen = u32(take(4));
    if (!(await need(plen + 4))) throw new Error('truncated');
    const path = new TextDecoder().decode(take(plen));
    const size = u32(take(4));
    if (size === DELETE) {
      yield { path, del: true };
      continue;
    }
    if (!(await need(size))) throw new Error('truncated');
    yield { path, bytes: take(size) };
  }
}
// The same, written (builders and tests).
export function frame(path, bytes) {
  const p = new TextEncoder().encode(path);
  const out = new Uint8Array(8 + p.length + (bytes ? bytes.length : 0));
  const dv = new DataView(out.buffer);
  dv.setUint32(0, p.length);
  out.set(p, 4);
  dv.setUint32(4 + p.length, bytes ? bytes.length : DELETE);
  if (bytes) out.set(bytes, 8 + p.length);
  return out;
}

async function push(request, env, ctx, headers) {
  let put = 0;
  let gone = 0;
  const bad = [];
  const purge = [];
  for await (const f of frames(request.body)) {
    const path = f.path;
    if (!validPath(path)) {
      bad.push(String(f.path).slice(0, 80));
      continue;
    }
    if (f.del) {
      await env.DATA.delete(path);
      gone++;
    } else {
      // (Its sum as builders/store.js keeps it: a builder writing the same leaves it.)
      const meant = f.bytes[0] === 0x1f && f.bytes[1] === 0x8b ? await gunzip(f.bytes) : f.bytes;
      await env.DATA.put(path, f.bytes, { httpMetadata: { contentType: typeOf(path) }, customMetadata: { sha256: await sha256(meant) } });
      put++;
    }
    purge.push(path);
  }
  // The edge's copies of what changed go, so the new ones are read at once.
  if (typeof caches !== 'undefined') ctx.waitUntil(Promise.all(purge.map(p => caches.default.delete(new Request(`https://orbit-data.orbit/${p}`)))));
  return json({ put, gone, bad }, 200, headers);
}

async function list(request, env, headers) {
  const u = new URL(request.url);
  const r = await env.DATA.list({ prefix: u.searchParams.get('prefix') || undefined, cursor: u.searchParams.get('cursor') || undefined, limit: 1000 });
  return json({ files: r.objects.map(o => [o.key, o.etag, o.size]), cursor: r.truncated ? r.cursor : null }, 200, headers);
}

export async function handleData(request, env, ctx, headers, ip, path) {
  const rest = path.slice('/data/'.length);
  if (rest === 'push' || rest === '_list') {
    if (!authorized(request, env)) return json({ error: { message: 'Not allowed' } }, 401, headers);
    if (!env.DATA) return json({ error: { message: 'No data bucket yet' } }, 503, headers);
    if (rest === 'push' && request.method === 'POST') return push(request, env, ctx, headers);
    if (rest === '_list' && request.method === 'GET') return list(request, env, headers);
    return json({ error: { message: 'Method not allowed' } }, 405, headers);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: { message: 'GET only' } }, 405, headers);
  if (sessionLimited(`data:${ip}`, READS_PER_MIN)) return json({ error: { message: 'Too many requests' } }, 429, headers);
  const file = cleanPath(rest);
  if (!file || file.startsWith('private/')) return json({ error: { message: 'Not found' } }, 404, headers);
  const res = await readFile(env, ctx, file, request);
  const out = new Response(request.method === 'HEAD' ? null : res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  const tag = res.headers.get('ETag');
  if (tag && request.headers.get('If-None-Match') === tag) return new Response(null, { status: 304, headers: out.headers });
  return out;
}
