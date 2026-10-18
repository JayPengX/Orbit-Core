// The Pass's store (every wallet, each app's data, Play's slips, the config):
// documents of one text `payload` each, by collection and id, in Cloudflare
// D1 (binding STORE, database quadra-store).
//
// Firebase's Firestore held it until 2026-10-14 (the owner, 2026-10-13:
// Firebase moves to Cloudflare, then is abandoned): every document was
// copied into D1, compared clean, and Firestore's last copy kept in R2
// (private/firestore-backup.jsonl.gz, never served; one JSON line a
// document: { coll, id, payload, updated }).
//
// The calls (worker.js hands them to eco.js, settle.js, kambi.js, lotto.js,
// stock-check.js, stock-fill.js, eco-admin.js): get, write (with an
// `{ updateTime }` or `{ exists: false }` precondition: a write that lost
// the race throws `precondition`), list, collections, batch, delete.
//
// One table, docs(coll, id, payload, updated): `updated` is a document's
// version (a write only if it's still what was read).

export const SCHEMA = 'CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY (coll, id))';

// A new version: an ISO time to the microsecond (Firestore's shape, which the
// documents copied from it keep), unique enough.
export const stamp = (now = Date.now()) => `${new Date(now).toISOString().slice(0, 23)}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}Z`;
const precondition = msg => Object.assign(new Error(msg), { precondition: true });

// The table, made once an isolate (one cheap query; the deploy needn't run SQL).
const ready = new WeakMap();
const tableOf = db => {
  if (!ready.has(db)) ready.set(db, db.prepare(SCHEMA).run().catch(e => (ready.delete(db), Promise.reject(e))));
  return ready.get(db);
};
export function d1Store(raw) {
  // Every query waits on the table being there.
  const db = { prepare: sql => {
    const st = { args: [] };
    const go = fn => tableOf(raw).then(() => fn(raw.prepare(sql).bind(...st.args)));
    const self = { bind: (...a) => ((st.args = a), self), first: () => go(q => q.first()), run: () => go(q => q.run()), all: () => go(q => q.all()) };
    return self;
  } };
  return {
    async get(collection, id) {
      const row = await db.prepare('SELECT payload, updated FROM docs WHERE coll = ? AND id = ?').bind(collection, id).first();
      return row ? { exists: true, updateTime: row.updated, payload: row.payload } : { exists: false, updateTime: '', payload: '' };
    },
    async write(collection, id, payload, pre, updated = stamp()) {
      // A new version is never the one it replaces (the same millisecond and
      // the same three random digits would let a stale write through).
      while (pre?.updateTime && updated === pre.updateTime) updated = stamp();
      let r;
      if (pre?.updateTime) r = await db.prepare('UPDATE docs SET payload = ?, updated = ? WHERE coll = ? AND id = ? AND updated = ?').bind(payload, updated, collection, id, pre.updateTime).run();
      else if (pre?.exists === false) r = await db.prepare('INSERT OR IGNORE INTO docs (coll, id, payload, updated) VALUES (?, ?, ?, ?)').bind(collection, id, payload, updated).run();
      else r = await db.prepare('INSERT INTO docs (coll, id, payload, updated) VALUES (?, ?, ?, ?) ON CONFLICT (coll, id) DO UPDATE SET payload = excluded.payload, updated = excluded.updated').bind(collection, id, payload, updated).run();
      if (pre && !r.meta?.changes) throw precondition(`${collection}/${id}: changed since it was read`);
      return { updateTime: updated };
    },
    async list(collection, pageSize = 300, { limit = Infinity, idsOnly = false } = {}) {
      const { results } = await db.prepare(`SELECT id, ${idsOnly ? "'' AS payload" : 'payload'}, updated FROM docs WHERE coll = ? ORDER BY id LIMIT ?`).bind(collection, Number.isFinite(limit) ? limit : -1).all();
      return results.map(r => ({ id: r.id, payload: r.payload, updateTime: r.updated }));
    },
    async collections() {
      const { results } = await db.prepare('SELECT DISTINCT coll FROM docs').all();
      return results.map(r => r.coll);
    },
    // Each write on its own (one that loses its race doesn't stop the rest):
    // { status: [{} or { code: 9 (lost its race) | 13, message }] }.
    async batch(writes) {
      const status = [];
      for (const w of writes) {
        try {
          if (w.delete) await db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?').bind(...w.delete).run();
          else await this.write(w.update[0], w.update[1], w.update[2], w.updateTime ? { updateTime: w.updateTime } : null);
          status.push({});
        } catch (e) {
          status.push({ code: e.precondition ? 9 : 13, message: String(e.message || e) });
        }
      }
      return { status };
    },
    async delete(collection, id) {
      await db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?').bind(collection, id).run();
    }
  };
}

// Whether the store can be used: D1 bound.
export const storeReady = env => Boolean(env.STORE);

// The calls worker.js hands on, each (env, …).
export function docStore() {
  const d1 = env => d1Store(env.STORE);
  return {
    get: (env, c, id) => d1(env).get(c, id),
    write: (env, c, id, payload, pre) => d1(env).write(c, id, payload, pre),
    list: (env, c, pageSize, o) => d1(env).list(c, pageSize, o),
    collections: env => d1(env).collections(),
    batch: (env, writes) => d1(env).batch(writes),
    delete: (env, c, id) => d1(env).delete(c, id),
    // Each collection and how many documents it holds (/store/check).
    count: async env => Object.fromEntries((await env.STORE.prepare('SELECT coll, COUNT(*) AS n FROM docs GROUP BY coll').all()).results.map(r => [r.coll, r.n]))
  };
}

// ---- One JSON document changed safely (every caller's read-change-write) ----

// A stored document's JSON (fsGet's answer), or null: missing or unreadable.
export function parseDoc(doc) {
  if (!doc?.exists) return null;
  try {
    return JSON.parse(doc.payload);
  } catch {
    return null;
  }
}

// Reads a document, changes it and writes it back only over the version it
// read; a write that lost the race (another got in between) reads and
// changes it again, up to `attempts` times. With deps' fsGet / fsWrite /
// fsDelete (eco.js's plumbing).
//   read(json|null)   the value `change` works on (a default for a missing one)
//   change(value)     the next value; the same value: nothing written
//   write(value)      what's stored (null: the document deleted)
// The value written (or the unchanged one), or undefined when every attempt
// lost its race.
export async function changeDoc(env, deps, collection, id, change, { read = v => v, write = v => v, attempts = 4 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const doc = await deps.fsGet(env, collection, id);
    const value = read(parseDoc(doc));
    const next = change(value);
    if (next === value) return value;
    const out = write(next);
    try {
      if (out == null) {
        if (doc.exists) await deps.fsDelete(env, collection, id);
      } else await deps.fsWrite(env, collection, id, JSON.stringify(out), doc.exists ? { updateTime: doc.updateTime } : { exists: false });
      return next;
    } catch (error) {
      if (!error.precondition) throw error;
    }
  }
  return undefined;
}

// An account's watched documents moved to another account (a pass merged
// into another): every `<from>_<id>` the collection's index (`due`: key →
// time) lists is written again as `<to>_<id>` with `account: to`, the old
// one deleted, and the index changed to match. How many moved.
export async function moveOwned(env, deps, collection, indexId, from, to) {
  const asIndex = v => (v && typeof v.due === 'object' ? v : { due: {} });
  const index = asIndex(parseDoc(await deps.fsGet(env, collection, indexId)));
  const prefix = `${from}_`;
  const moved = [];
  for (const [key, at] of Object.entries(index.due)) {
    if (!key.startsWith(prefix)) continue;
    const value = parseDoc(await deps.fsGet(env, collection, key));
    if (!value) continue;
    const next = `${to}_${key.slice(prefix.length)}`;
    try {
      await deps.fsWrite(env, collection, next, JSON.stringify({ ...value, account: to }), { exists: false });
    } catch (error) {
      if (!error.precondition) throw error;
      continue;
    }
    await deps.fsDelete(env, collection, key);
    moved.push([key, next, at]);
  }
  if (moved.length)
    await changeDoc(env, deps, collection, indexId, idx => {
      const due = { ...idx.due };
      for (const [key, next, at] of moved) {
        due[next] = due[key] ?? at;
        delete due[key];
      }
      return { ...idx, due };
    }, { read: asIndex });
  return moved.length;
}
