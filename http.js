import { ORIGINS } from './kit/domain.mjs';

// What every route of the proxy answers with (worker.js routes; sports.js,
// transit.js, weather.js, … handle): who may call it, the CORS headers, and
// a JSON answer.

// The apps' pages (kit/domain.mjs: GitHub Pages, and the family's own domain once set).
export const ALLOWED_ORIGINS = ORIGINS;
// A page served from this computer (the preview tool; over --h2 an https
// one, as Pages serves a phone): the dev doors let it in (sports.js, worker.js).
export const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

// The part of an address that counts as one caller: an IPv4 address whole,
// an IPv6 one by its first 64 bits (a home's or a phone's whole block).
export function ipBucket(ip) {
  const a = String(ip || '');
  if (!a.includes(':')) return a;
  const [head, tail = ''] = a.toLowerCase().split('::');
  const h = head ? head.split(':') : [];
  const t = a.includes('::') ? (tail ? tail.split(':') : []) : [];
  const groups = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

// A caller outside Taiwan (Jay 2026-11-06: "block international user from
// using Taiwan only service outright"): the country Cloudflare reads from the
// caller's address (a phone roaming on its Taiwan SIM still reads TW). Only a
// real country code that isn't Taiwan's; unknown ('XX'), Tor ('T1') or none
// (a test, a local run) counts as here, never turned away.
export function abroad(request) {
  const c = request?.cf?.country;
  return typeof c === 'string' && /^[A-Z]{2}$/.test(c) && c !== 'TW' && c !== 'XX';
}
// The routes of the Taiwan-only services: Orbit Transit's (TDX, Taiwan's
// map). Not Law: foreigners study Taiwan's law in it (its English texts; Jay 2026-11-06).
export const TW_ONLY_PATH = /^\/transit(\/.*)?$/;
// Turned away abroad: a Taiwan-only route asked from outside Taiwan, except
// the dev door (a local page: previews, shots) and the showcase's demos.
export const twOnlyRefused = (request, path, origin, showcase = new Set()) => TW_ONLY_PATH.test(path) && abroad(request) && !LOCAL_ORIGIN.test(origin || '') && !showcase.has(origin);

export function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin || '');
}

// X-Worker-Colo carries the IATA code of the Cloudflare colo the request came
// in through (request.cf.colo), on every answer: what showed Smart Placement
// landing on Hong Kong, which Gemini refuses (wrangler.toml's [placement]).
// Headers an app reads must be listed in Expose-Headers: the sports proxy's
// cache (X-Sports-Proxy-*), Transit's (X-Transit-*).
export function corsHeaders(origin, colo) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Worker-Colo, X-Transit-Cache, X-Transit-Age, X-Sports-Proxy-Cache, X-Sports-Proxy-Cache-Tier, X-Sports-Proxy-Age, X-Sports-Proxy-Final, Server-Timing',
    // Browsers keep a preflight this long (Chrome caps it at 2 hours): the
    // apps' JSON writes don't each cost a second Worker request.
    'Access-Control-Max-Age': '86400',
    'X-Worker-Colo': colo || 'unknown',
    Vary: 'Origin'
  };
}

export function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

// A text's SHA-256 as hex.
export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}

// A request's body as text, or null past `max` bytes: read as it comes and
// stopped there (a client may send Cloudflare's 100 MB, more than an
// isolate's 128 MB holds, and a crash takes every request in it along).
export async function bodyText(request, max) {
  if (Number(request.headers.get('Content-Length')) > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return new TextDecoder().decode(out);
}

// ---- An answer a line at a time --------------------------------------------------

// An answer written as it's made, one JSON value a line (x-ndjson), each line
// readable by the page the moment it's written. Gzipped here, each line
// flushed (gzipLines): Cloudflare compresses no x-ndjson (Weather's two lines
// went whole, 156 KB, where 25 KB do), and holds the end of each line of a
// type it does compress until the next line comes (measured 2026-11-05: a
// line ready at once came with the next, 0.8 s later). → { response, line(value), end(), abort() }
export function lineAnswer(request, headers) {
  const zip = /\bgzip\b/.test(request?.headers?.get?.('Accept-Encoding') || '') ? gzipLines() : null;
  const { readable, writable } = new TransformStream();
  const out = writable.getWriter();
  const enc = new TextEncoder();
  const head = { ...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8', ...(zip ? { 'Content-Encoding': 'gzip', Vary: `${headers?.Vary ? `${headers.Vary}, ` : ''}Accept-Encoding` } : {}) };
  return {
    // (encodeBody 'manual': the bytes are gzip already, never compressed again.)
    response: new Response(readable, { headers: head, ...(zip ? { encodeBody: 'manual' } : {}) }),
    line: value => {
      const b = enc.encode(`${JSON.stringify(value)}\n`);
      return out.write(zip ? zip.write(b) : b);
    },
    end: async () => {
      if (zip) await out.write(zip.end());
      await out.close();
    },
    abort: () => out.abort().catch(() => {})
  };
}

// gzip written as it goes (RFC 1951, 1952): each write() ends in a sync flush
// (an empty stored block), so all written so far can be read at once; LZ77
// over the last 32 KB with the fixed Huffman codes (no tables to send). About
// 4 ms of CPU for Weather's 156 KB, to 25 KB. write(bytes) → its bytes; end() → the last.
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const flip = (c, n) => {
  let r = 0;
  for (let i = 0; i < n; i++) r = (r << 1) | ((c >> i) & 1);
  return r;
};
// The fixed literal/length codes, bit-reversed for the stream's LSB-first order: [code, bits].
const LIT = Array.from({ length: 288 }, (_, s) => (s < 144 ? [flip(0x30 + s, 8), 8] : s < 256 ? [flip(0x190 + s - 144, 9), 9] : s < 280 ? [flip(s - 256, 7), 7] : [flip(0xc0 + s - 280, 8), 8]));
const DIST = Array.from({ length: 30 }, (_, d) => flip(d, 5));
let LEN_SYM = null;
let DIST_SYM = null;
let CRC = null;
const WIN = 32768;
const HASH = 1 << 15;
const CHAIN = 16;
export function gzipLines() {
  if (!CRC) {
    LEN_SYM = new Uint8Array(259);
    DIST_SYM = new Uint8Array(WIN + 1);
    for (let s = 0; s < 29; s++) for (let l = LEN_BASE[s]; l < (s < 28 ? LEN_BASE[s + 1] : 259); l++) LEN_SYM[l] = s;
    for (let s = 0; s < 30; s++) for (let d = DIST_BASE[s]; d < (s < 29 ? DIST_BASE[s + 1] : WIN + 1); d++) DIST_SYM[d] = s;
    CRC = new Int32Array(256).map((_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c;
    });
  }
  let data = new Uint8Array(1 << 16);
  let size = 0;
  let crc = -1;
  const head = new Int32Array(HASH).fill(-1);
  const prev = new Int32Array(WIN);
  let out = new Uint8Array(1 << 12);
  let n = 0;
  let bits = 0;
  let nbits = 0;
  const room = k => {
    if (n + k <= out.length) return;
    const o = new Uint8Array(Math.max(out.length * 2, n + k));
    o.set(out.subarray(0, n));
    out = o;
  };
  const put = (v, k) => {
    bits |= v << nbits;
    nbits += k;
    while (nbits >= 8) {
      out[n++] = bits & 255;
      bits >>>= 8;
      nbits -= 8;
    }
  };
  const align = () => nbits && put(0, 8 - nbits);
  const take = () => {
    const o = out.slice(0, n);
    n = 0;
    return o;
  };
  const hashAt = i => ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & (HASH - 1);
  const insert = i => {
    const h = hashAt(i);
    prev[i & (WIN - 1)] = head[h];
    head[h] = i;
  };
  for (const b of [0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff]) out[n++] = b;
  return {
    write(chunk) {
      if (size + chunk.length > data.length) {
        const d = new Uint8Array(Math.max(data.length * 2, size + chunk.length));
        d.set(data.subarray(0, size));
        data = d;
      }
      data.set(chunk, size);
      for (let i = 0; i < chunk.length; i++) crc = CRC[(crc ^ chunk[i]) & 255] ^ (crc >>> 8);
      let i = size;
      size += chunk.length;
      // (A literal is at most 9 bits, a match at least 3 bytes in 31 bits.)
      room(Math.ceil(chunk.length * 1.2) + 16);
      put(0, 1);
      put(1, 2);
      while (i < size) {
        let best = 0;
        let dist = 0;
        if (i + 2 < size) {
          const max = Math.min(258, size - i);
          let c = head[hashAt(i)];
          for (let tries = CHAIN; c >= 0 && i - c <= WIN && tries > 0; tries--) {
            if (data[c + best] === data[i + best]) {
              let l = 0;
              while (l < max && data[c + l] === data[i + l]) l++;
              if (l > best) {
                best = l;
                dist = i - c;
                if (l === max) break;
              }
            }
            const p = prev[c & (WIN - 1)];
            if (p >= c) break;
            c = p;
          }
        }
        if (best >= 3) {
          const s = LEN_SYM[best];
          put(LIT[257 + s][0], LIT[257 + s][1]);
          if (LEN_EXTRA[s]) put(best - LEN_BASE[s], LEN_EXTRA[s]);
          const d = DIST_SYM[dist];
          put(DIST[d], 5);
          if (DIST_EXTRA[d]) put(dist - DIST_BASE[d], DIST_EXTRA[d]);
          for (const end = i + best; i < end; i++) if (i + 2 < size) insert(i);
        } else {
          put(LIT[data[i]][0], LIT[data[i]][1]);
          if (i + 2 < size) insert(i);
          i++;
        }
      }
      put(LIT[256][0], 7);
      // The sync flush: an empty stored block, the stream byte-aligned.
      put(0, 3);
      align();
      room(4);
      for (const b of [0, 0, 0xff, 0xff]) out[n++] = b;
      return take();
    },
    end() {
      room(16);
      put(1, 1);
      put(1, 2);
      put(LIT[256][0], 7);
      align();
      for (const v of [~crc, size]) for (let k = 0; k < 4; k++) out[n++] = (v >>> (8 * k)) & 255;
      return take();
    }
  };
}
