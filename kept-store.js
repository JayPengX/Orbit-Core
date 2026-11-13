// What the Worker keeps for itself between requests (kept answers, counts,
// weather cells and their scores, the last bike counts, the TDX token, the
// calendar feeds): one row a key in D1's `kept` (STORE), with when it ends.
//
// KV's Free plan takes 1,000 writes a day for the whole account, and from
// 2026-11-13 (the paid plan's end) these went past it by morning: every
// write after that failed until 00:00 UTC. D1's Free plan takes 100,000
// rows written a day and five million read, and a read sees the last write
// at once. (Not R2: Cloudflare switched R2 off with the paid plan, and a
// copy the Worker needs must not wait on it.) KV is still read when D1 has
// no row (what was kept there before the move, until it ends), and written
// only where there is no D1 (tests, a local run). sweepKept (worker.js,
// every 6 hours) deletes what has ended.
const TABLE = 'CREATE TABLE IF NOT EXISTS kept (key TEXT PRIMARY KEY, value TEXT NOT NULL, meta TEXT, exp INTEGER NOT NULL)';
const made = new WeakSet();
async function dbOf(env) {
  const db = env?.STORE;
  if (!db?.prepare) return null;
  if (!made.has(db)) {
    await db.prepare(TABLE).run();
    made.add(db);
  }
  return db;
}

// → the kept text (or { value, metadata } with `meta`), null when there's none
// or it has ended. Never throws.
export async function keptText(env, key, { meta = false, now = Date.now() } = {}) {
  try {
    const db = await dbOf(env);
    if (db) {
      const row = await db.prepare('SELECT value, meta, exp FROM kept WHERE key = ?1').bind(key).first();
      if (row) {
        if (row.exp <= now) return null;
        return meta ? { value: row.value, metadata: JSON.parse(row.meta || '{}') } : row.value;
      }
    }
  } catch {}
  const kv = env?.RATE_LIMIT_KV;
  if (!kv) return null;
  try {
    if (meta) {
      const r = await kv.getWithMetadata(key);
      return r?.value == null ? null : { value: r.value, metadata: r.metadata || {} };
    }
    return await kv.get(key);
  } catch {
    return null;
  }
}
export async function keptRead(env, key, opts) {
  const v = await keptText(env, key, opts);
  if (v == null) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

// `data` kept `ttlS` seconds, as JSON (`raw`: a text kept as it is). `metadata`: small values
// kept beside it (read with keptText's `meta`). Never throws (a failed write is a copy not kept).
export async function keptPut(env, key, data, ttlS, { metadata = {}, raw = false, now = Date.now() } = {}) {
  const value = raw ? String(data) : JSON.stringify(data);
  try {
    const db = await dbOf(env);
    if (db) {
      await db
        .prepare('INSERT INTO kept (key, value, meta, exp) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (key) DO UPDATE SET value = excluded.value, meta = excluded.meta, exp = excluded.exp')
        .bind(key, value, Object.keys(metadata).length ? JSON.stringify(metadata) : null, now + Math.max(60, ttlS) * 1000)
        .run();
    } else if (env?.RATE_LIMIT_KV) {
      await env.RATE_LIMIT_KV.put(key, value, { expirationTtl: Math.max(60, Math.ceil(ttlS)), ...(Object.keys(metadata).length && { metadata }) });
    }
  } catch {}
}

export async function keptDelete(env, key) {
  const db = await dbOf(env).catch(() => null);
  await Promise.all([db?.prepare('DELETE FROM kept WHERE key = ?1').bind(key).run(), env?.RATE_LIMIT_KV?.delete(key)].map(p => Promise.resolve(p).catch(() => {})));
}

// What has ended, deleted. → { gone }
export async function sweepKept(env, { now = Date.now() } = {}) {
  const db = await dbOf(env);
  if (!db) return { off: true };
  const r = await db.prepare('DELETE FROM kept WHERE exp <= ?1').bind(now).run();
  return { gone: r?.meta?.changes ?? 0 };
}
