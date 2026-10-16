// The family's data as the builders see it (builders/*.js, run by the
// proxy's crons): R2's files (data.js serves them at /data/), read and
// written by path. What was Shared-Data's `site/` on disk.
//
// A file is written only when its bytes changed (each keeps its SHA-256 in
// R2's metadata), so a builder that writes all it built costs a write only
// for what's new: R2 allows 1M writes a month (guard.js counts them).
// `.gz` paths are gzipped on the way in and unpacked on the way out.

const enc = new TextEncoder();
const dec = new TextDecoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));

export async function gzip(bytes) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
export async function gunzip(bytes) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}
const isGz = b => b[0] === 0x1f && b[1] === 0x8b;
const TYPES = { json: 'application/json', gz: 'application/gzip' };
const typeOf = path => TYPES[/\.([a-z]+)$/.exec(path)?.[1]] || 'application/octet-stream';

export function r2Store(bucket) {
  const stats = { read: 0, written: 0, same: 0, deleted: 0 };
  // What this run read or wrote, by path: its sum, so writing the same back
  // asks R2 nothing at all.
  const known = new Map();
  const store = {
    stats,
    // A file's bytes (unpacked when gzipped), or null when there's none.
    async bytes(path) {
      const obj = await bucket.get(path);
      stats.read++;
      if (!obj) return null;
      const raw = new Uint8Array(await obj.arrayBuffer());
      const b = isGz(raw) ? await gunzip(raw) : raw;
      if (obj.customMetadata?.sha256) known.set(path, obj.customMetadata.sha256);
      return b;
    },
    async json(path) {
      const b = await store.bytes(path);
      return b ? JSON.parse(dec.decode(b)) : null;
    },
    // Written when changed: data (an object, written as JSON) or bytes.
    async put(path, data) {
      let b = data instanceof Uint8Array ? data : enc.encode(typeof data === 'string' ? data : JSON.stringify(data));
      if (path.endsWith('.gz') && !isGz(b)) b = await gzip(b);
      // (The sum of what's meant, not of gzip's bytes, which carry a time,
      // nor of an object's `built` stamp: a week's rebuild of a bus pack
      // that didn't change isn't written, and phones keep theirs.)
      const stamped = data && typeof data === 'object' && !(data instanceof Uint8Array) && 'built' in data;
      const sum = await sha256(stamped ? enc.encode(JSON.stringify({ ...data, built: undefined })) : path.endsWith('.gz') ? await gunzip(b) : b);
      const was = known.has(path) ? known.get(path) : (await bucket.head(path))?.customMetadata?.sha256;
      if (was === sum) return stats.same++, false;
      await bucket.put(path, b, { httpMetadata: { contentType: typeOf(path) }, customMetadata: { sha256: sum } });
      known.set(path, sum);
      stats.written++;
      return true;
    },
    async delete(path) {
      await bucket.delete(path);
      stats.deleted++;
    },
    // Every path under a prefix.
    async list(prefix) {
      const out = [];
      let cursor;
      do {
        const r = await bucket.list({ prefix, cursor, limit: 1000 });
        out.push(...r.objects.map(o => o.key));
        cursor = r.truncated ? r.cursor : undefined;
      } while (cursor);
      return out;
    },
    // A whole folder replaced by `files` ({ path: data }): what's not in it goes.
    async replace(prefix, files) {
      for (const [p, d] of Object.entries(files)) await store.put(p, d);
      for (const p of await store.list(prefix)) if (!(p in files)) await store.delete(p);
    }
  };
  return store;
}

// A bucket in memory, R2's shape (tests, and a builder run in Node).
export function memoryBucket(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, { b: v instanceof Uint8Array ? v : enc.encode(typeof v === 'string' ? v : JSON.stringify(v)), meta: {} }]));
  const obj = (k, v) => ({ key: k, size: v.b.length, customMetadata: v.meta, arrayBuffer: async () => v.b.slice().buffer, text: async () => dec.decode(v.b), json: async () => JSON.parse(dec.decode(v.b)), etag: '' });
  return {
    m,
    async get(k) {
      const v = m.get(k);
      return v ? obj(k, v) : null;
    },
    async head(k) {
      const v = m.get(k);
      return v ? obj(k, v) : null;
    },
    async put(k, b, o = {}) {
      m.set(k, { b: new Uint8Array(b), meta: o.customMetadata || {} });
    },
    async delete(k) {
      m.delete(k);
    },
    async list({ prefix = '', cursor, limit = 1000 } = {}) {
      const keys = [...m.keys()].filter(k => k.startsWith(prefix)).sort();
      const at = cursor ? Number(cursor) : 0;
      const page = keys.slice(at, at + limit);
      return { objects: page.map(k => obj(k, m.get(k))), truncated: at + limit < keys.length, cursor: String(at + limit) };
    }
  };
}
