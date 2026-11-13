// R2 with D1 behind it: env.DATA as every route and builder uses it, falling
// back to D1's `data_file` when R2 refuses.
//
// On 2026-11-13 the paid plan's end switched R2 off for the account ("Please
// enable R2 through the Cloudflare Dashboard", 10042): every /data/ read and
// every builder's write failed, and News showed 讀不到新聞. With this, a
// file R2 can't take is kept in D1 (one row a path, its bytes in base64, up
// to D1's 2 MB a row: the day's files, News's pages, not the big bus
// packs), and a read R2 can't answer is answered from there. Once R2 fails,
// this isolate asks D1 alone for OFF_MS (each refused R2 call is a
// subrequest, 50 a request on the Free plan). When R2 is back, the builders'
// next runs write it again; D1's copies are left to age (sweepDataFiles).
export const OFF_MS = 5 * 60_000;
const MAX_ROW = 1_400_000; // raw bytes: base64 under D1's 2 MB a row
const TABLE = 'CREATE TABLE IF NOT EXISTS data_file (path TEXT PRIMARY KEY, body TEXT NOT NULL, meta TEXT, type TEXT, at INTEGER NOT NULL)';

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function bytesOf(value) {
  if (value == null) return new Uint8Array(0);
  if (typeof value === 'string') return enc.encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(await new Response(value).arrayBuffer());
}

// An object as R2's binding gives one.
function objectOf(row) {
  const bytes = unb64(row.body);
  const meta = row.meta ? JSON.parse(row.meta) : {};
  const etag = `d1-${row.at}`;
  return {
    key: row.path,
    size: bytes.length,
    uploaded: new Date(row.at),
    etag,
    httpEtag: `"${etag}"`,
    customMetadata: meta,
    httpMetadata: { contentType: row.type || undefined },
    get body() {
      return new Response(bytes).body;
    },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => dec.decode(bytes),
    json: async () => JSON.parse(dec.decode(bytes))
  };
}

export function d1Bucket(db, now = () => Date.now()) {
  let made = null;
  const ready = () => (made ||= db.prepare(TABLE).run());
  const one = async path => {
    await ready();
    return db.prepare('SELECT path, body, meta, type, at FROM data_file WHERE path = ?1').bind(path).first();
  };
  return {
    async get(path) {
      const row = await one(path);
      return row ? objectOf(row) : null;
    },
    async head(path) {
      const row = await one(path);
      return row ? { key: row.path, uploaded: new Date(row.at), customMetadata: row.meta ? JSON.parse(row.meta) : {}, httpEtag: `"d1-${row.at}"` } : null;
    },
    async put(path, value, opts = {}) {
      const bytes = await bytesOf(value);
      if (bytes.length > MAX_ROW) throw new Error(`${path}: ${bytes.length} bytes, past D1's row (R2 off)`);
      await ready();
      await db
        .prepare('INSERT INTO data_file (path, body, meta, type, at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (path) DO UPDATE SET body = excluded.body, meta = excluded.meta, type = excluded.type, at = excluded.at')
        .bind(path, b64(bytes), opts.customMetadata ? JSON.stringify(opts.customMetadata) : null, opts.httpMetadata?.contentType || null, now())
        .run();
      return { key: path };
    },
    async delete(paths) {
      await ready();
      for (const p of [].concat(paths)) await db.prepare('DELETE FROM data_file WHERE path = ?1').bind(p).run();
    },
    async list({ prefix = '', cursor, limit = 1000 } = {}) {
      await ready();
      const after = cursor || '';
      const { results } = await db
        .prepare("SELECT path, meta, at, length(body) AS n FROM data_file WHERE path >= ?1 AND path < ?2 AND path > ?3 ORDER BY path LIMIT ?4")
        .bind(prefix, `${prefix}￿`, after, limit + 1)
        .all();
      const rows = results || [];
      const page = rows.slice(0, limit);
      return {
        objects: page.map(r => ({ key: r.path, uploaded: new Date(r.at), size: Math.floor((r.n * 3) / 4), customMetadata: r.meta ? JSON.parse(r.meta) : {} })),
        truncated: rows.length > limit,
        cursor: rows.length > limit ? page.at(-1).path : undefined
      };
    }
  };
}

// env with DATA as R2 first, D1 behind it. The same env back when there's no D1.
const wrapped = new WeakMap();
let offUntil = 0;
export function withDataFallback(env, now = () => Date.now()) {
  if (!env?.STORE?.prepare) return env;
  if (wrapped.has(env)) {
    if (!env.DATA) offUntil = now() + OFF_MS;
    return wrapped.get(env);
  }
  const r2 = env.DATA || null;
  // (No R2 bound at all, as when a deploy found R2 off: D1 alone, and a file it lacks is a failure.)
  if (!r2) offUntil = now() + OFF_MS;
  const d1 = d1Bucket(env.STORE, now);
  const either = method => async (...args) => {
    if (r2 && now() >= offUntil) {
      try {
        const got = await r2[method](...args);
        // (A file R2 hasn't got, written to D1 while R2 was off: read from there.)
        if (got == null && (method === 'get' || method === 'head')) return d1[method](...args).catch(() => null);
        // (A file R2 let go goes from D1 too: an old copy there must never come back.)
        if (method === 'delete') await d1.delete(...args).catch(() => {});
        return got;
      } catch (err) {
        offUntil = now() + OFF_MS;
        console.warn(`R2 ${method} refused, D1 instead: ${err?.message || err}`);
      }
    }
    return d1[method](...args);
  };
  const DATA = { get: either('get'), head: either('head'), put: either('put'), delete: either('delete'), list: either('list'), fallback: true };
  const out = new Proxy(env, { get: (t, k) => (k === 'DATA' ? DATA : t[k]) });
  wrapped.set(env, out);
  return out;
}
export const dataOffNow = () => Date.now() < offUntil;
export const resetDataFallback = () => void (offUntil = 0);

// What D1 kept while R2 was off, past `days` and with R2 answering again, deleted (the builders wrote R2 since).
export async function sweepDataFiles(env, { days = 7, now = Date.now() } = {}) {
  if (!env?.STORE?.prepare || now < offUntil) return { off: true };
  await env.STORE.prepare(TABLE).run();
  const r = await env.STORE.prepare('DELETE FROM data_file WHERE at < ?1').bind(now - days * 86_400_000).run();
  return { gone: r?.meta?.changes ?? 0 };
}
