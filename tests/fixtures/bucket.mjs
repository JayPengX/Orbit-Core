const enc = new TextEncoder();
const dec = new TextDecoder();

// A bucket in memory, R2's shape, for the builders' tests.
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
