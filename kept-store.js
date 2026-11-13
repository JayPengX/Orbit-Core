// What the Worker keeps for itself between requests (kept answers, counts,
// weather cells and their scores, the last bike counts, the TDX token): in
// R2 at private/kv/<key> (never served, data.js), each with when it ends
// (`exp`, customMetadata), not in KV.
//
// KV's Free plan takes 1,000 writes a day for the whole account, and from
// 2026-11-13 (the paid plan's end) these went past it by morning: every
// write after that failed until 00:00 UTC. R2's Free plan takes a million
// writes a month (about 33,000 a day) and ten million reads, and a read sees
// the last write at once. KV is still read when R2 has no copy (what was
// kept there before the move, until it ends), and written only where there
// is no R2 (tests, a local run). sweepKept (worker.js, every 6 hours) clears
// what has ended.
const PREFIX = 'private/kv/';
const bucketOf = env => (env?.DATA?.get && env.DATA.put ? env.DATA : null);

// → the kept text (or { value, metadata } with `meta`), null when there's none
// or it has ended. Never throws.
export async function keptText(env, key, { meta = false, now = Date.now() } = {}) {
  const r2 = bucketOf(env);
  if (r2) {
    try {
      const o = await r2.get(PREFIX + key);
      if (o) {
        const exp = Number(o.customMetadata?.exp) || 0;
        if (exp && exp <= now) return null;
        const value = await o.text();
        return meta ? { value, metadata: o.customMetadata || {} } : value;
      }
    } catch {}
  }
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

// `value` kept `ttlS` seconds, as JSON (`raw`: a text kept as it is). `metadata`: small strings
// kept beside it (read with keptText's `meta`). Never throws (a failed write is a copy not kept).
export async function keptPut(env, key, data, ttlS, { metadata = {}, raw = false, now = Date.now() } = {}) {
  const value = raw ? String(data) : JSON.stringify(data);
  const r2 = bucketOf(env);
  try {
    if (r2) {
      const meta = Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, String(v)]));
      await r2.put(PREFIX + key, value, { httpMetadata: { contentType: 'application/json' }, customMetadata: { ...meta, exp: String(now + Math.max(60, ttlS) * 1000) } });
    } else if (env?.RATE_LIMIT_KV) {
      await env.RATE_LIMIT_KV.put(key, value, { expirationTtl: Math.max(60, Math.ceil(ttlS)), ...(Object.keys(metadata).length && { metadata }) });
    }
  } catch {}
}

export async function keptDelete(env, key) {
  const r2 = bucketOf(env);
  await Promise.all([r2?.delete(PREFIX + key), env?.RATE_LIMIT_KV?.delete(key)].map(p => Promise.resolve(p).catch(() => {})));
}

// What has ended, deleted (a list of a thousand is one read; deletes cost nothing). → { seen, gone }
export async function sweepKept(env, { now = Date.now(), pages = 50 } = {}) {
  const r2 = bucketOf(env);
  if (!r2?.list) return { off: true };
  let cursor;
  let seen = 0;
  let gone = 0;
  for (let i = 0; i < pages; i++) {
    const page = await r2.list({ prefix: PREFIX, cursor, limit: 1000, include: ['customMetadata'] });
    const dead = page.objects.filter(o => {
      const exp = Number(o.customMetadata?.exp) || 0;
      return exp && exp <= now;
    });
    seen += page.objects.length;
    for (let j = 0; j < dead.length; j += 1000) await r2.delete(dead.slice(j, j + 1000).map(o => o.key));
    gone += dead.length;
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  return { seen, gone };
}
