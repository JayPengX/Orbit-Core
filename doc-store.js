// The Pass's store (every wallet, each app's data, the config):
// documents of one text `payload` each, by collection and id, in Cloudflare
// D1 (binding STORE, database orbit-store).
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
//
// Nothing of the Pass is ever lost to a write (Jay, 2026-10-27: "make sure
// our data never get lost or corrupted"). For the collections the Worker
// names (`keep`: every wallet, every app's data, the inbox, the config), the
// version a write or a delete replaces is copied into `history` first, in
// the same transaction:
//   - at most one an hour a document while it's saved again and again
//     (Words saves at each answer), the copy being the version replaced;
//   - always when the new one is under half the old one's size (a wipe or a
//     broken save looks like that), when it's deleted, restored, or written
//     over a version its device never saw (`why`);
// kept whole for 2 days, then one a day for 30 days (`prune`, the nightly
// job). Any version is put back with `restore`. Beside it, the whole store
// goes to R2 each night (store-backup.js), and D1's own Time Travel can take
// the database back to any minute of the last 30 days.

export const SCHEMA = 'CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY (coll, id))';
export const HISTORY_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS history (coll TEXT NOT NULL, id TEXT NOT NULL, updated TEXT NOT NULL, payload TEXT NOT NULL, at INTEGER NOT NULL, why TEXT NOT NULL, PRIMARY KEY (coll, id, updated))',
  'CREATE INDEX IF NOT EXISTS history_at ON history (at)'
];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const HISTORY = { every: HOUR, whole: 2 * DAY, days: 30, maxBytes: 1_500_000_000 };

// A new version: an ISO time to the microsecond (Firestore's shape, which the
// documents copied from it keep), unique enough.
export const stamp = (now = Date.now()) => `${new Date(now).toISOString().slice(0, 23)}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}Z`;
const precondition = msg => Object.assign(new Error(msg), { precondition: true });

// The tables, made once an isolate (cheap queries; the deploy needn't run SQL).
const ready = new WeakMap();
const tableOf = db => {
  if (!db) return Promise.reject(new Error('no store bound'));
  if (!ready.has(db)) ready.set(db, [SCHEMA, ...HISTORY_SCHEMA].reduce((p, sql) => p.then(() => db.prepare(sql).run()), Promise.resolve()).catch(e => (ready.delete(db), Promise.reject(e))));
  return ready.get(db);
};
// The version a write replaces, copied into history (see the top): a
// statement of the write's own transaction. ?5 the new payload's length.
const SNAPSHOT = `INSERT OR IGNORE INTO history (coll, id, updated, payload, at, why)
  SELECT coll, id, updated, payload, ?1, CASE WHEN ?2 <> '' THEN ?2 WHEN length(payload) > 2 * ?5 + 64 THEN 'shrink' ELSE 'hour' END
  FROM docs WHERE coll = ?3 AND id = ?4
  AND (?2 <> '' OR length(payload) > 2 * ?5 + 64 OR NOT EXISTS (SELECT 1 FROM history h WHERE h.coll = ?3 AND h.id = ?4 AND h.at > ?6))`;

// keep(collection): whether its versions are kept (the Worker's list).
export function d1Store(raw, { keep = () => false, now = Date.now } = {}) {
  // Every query waits on the tables being there.
  const db = {
    prepare: sql => {
      const st = { sql, args: [] };
      const go = fn => tableOf(raw).then(() => fn(raw.prepare(sql).bind(...st.args)));
      const self = { st, bind: (...a) => ((st.args = a), self), first: () => go(q => q.first()), run: () => go(q => q.run()), all: () => go(q => q.all()) };
      return self;
    },
    // One transaction (D1's batch): every statement or none.
    batch: list => tableOf(raw).then(() => raw.batch(list.map(q => raw.prepare(q.st.sql).bind(...q.st.args))))
  };
  const snapshot = (collection, id, why, size) => db.prepare(SNAPSHOT).bind(now(), why, collection, id, size, now() - HISTORY.every);
  // A statement run with the version it replaces kept first (when kept).
  const kept = async (collection, id, why, size, q) => (keep(collection) ? (await db.batch([snapshot(collection, id, why, size), q]))[1] : q.run());
  const store = {
    async get(collection, id) {
      const row = await db.prepare('SELECT payload, updated FROM docs WHERE coll = ? AND id = ?').bind(collection, id).first();
      return row ? { exists: true, updateTime: row.updated, payload: row.payload } : { exists: false, updateTime: '', payload: '' };
    },
    // `why`: the version replaced is kept whatever its age ('overwrite',
    // 'restore'; see the top).
    async write(collection, id, payload, pre, { why = '', updated = stamp() } = {}) {
      // A new version is never the one it replaces (the same millisecond and
      // the same three random digits would let a stale write through).
      while (pre?.updateTime && updated === pre.updateTime) updated = stamp();
      let q;
      if (pre?.updateTime) q = db.prepare('UPDATE docs SET payload = ?, updated = ? WHERE coll = ? AND id = ? AND updated = ?').bind(payload, updated, collection, id, pre.updateTime);
      else if (pre?.exists === false) q = db.prepare('INSERT OR IGNORE INTO docs (coll, id, payload, updated) VALUES (?, ?, ?, ?)').bind(collection, id, payload, updated);
      else q = db.prepare('INSERT INTO docs (coll, id, payload, updated) VALUES (?, ?, ?, ?) ON CONFLICT (coll, id) DO UPDATE SET payload = excluded.payload, updated = excluded.updated').bind(collection, id, payload, updated);
      const r = await kept(collection, id, why, payload.length, q);
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
          if (w.delete) await store.delete(...w.delete);
          else await store.write(w.update[0], w.update[1], w.update[2], w.updateTime ? { updateTime: w.updateTime } : null);
          status.push({});
        } catch (e) {
          status.push({ code: e.precondition ? 9 : 13, message: String(e.message || e) });
        }
      }
      return { status };
    },
    async delete(collection, id) {
      await kept(collection, id, 'delete', 0, db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?').bind(collection, id));
    },

    // ---- Kept versions ----
    // Every kept version of documents with this id, in any collection (an
    // account's wallet and each app's data share its id), newest first:
    // [{ coll, updated, at, why, size }].
    async versions(id, collection = '') {
      const { results } = await db.prepare(`SELECT coll, updated, at, why, length(payload) AS size FROM history WHERE id = ?${collection ? ' AND coll = ?' : ''} ORDER BY at DESC, updated DESC LIMIT 500`).bind(...(collection ? [id, collection] : [id])).all();
      return results;
    },
    // Documents of a collection that are gone but still have kept versions
    // (an account deleted within 30 days), or those whose id starts with
    // `prefix`: [{ id, at }] (the newest version's time).
    async kept(collection, { prefix = '', gone = false } = {}) {
      const { results } = await db.prepare(`SELECT id, MAX(at) AS at FROM history h WHERE coll = ? AND id LIKE ? ${gone ? 'AND NOT EXISTS (SELECT 1 FROM docs d WHERE d.coll = h.coll AND d.id = h.id) ' : ''}GROUP BY id ORDER BY at DESC LIMIT 100`).bind(collection, `${prefix.replace(/[%_]/g, '')}%`).all();
      return results;
    },
    async version(collection, id, updated) {
      const row = await db.prepare('SELECT payload FROM history WHERE coll = ? AND id = ? AND updated = ?').bind(collection, id, updated).first();
      return row ? row.payload : null;
    },
    // A kept version made the document again (the one it replaces kept
    // too). Its new updateTime, or null without such a version.
    async restore(collection, id, updated, payload = null) {
      payload ??= await store.version(collection, id, updated);
      if (payload == null) return null;
      return store.write(collection, id, payload, null, { why: 'restore' });
    },
    // The nightly thinning: everything of the last 2 days, then the newest
    // of each day, nothing past 30 days; the oldest go first should all of
    // it pass HISTORY.maxBytes. How many went.
    async prune(at = now()) {
      let gone = 0;
      const n = async q => (gone += (await q.run()).meta?.changes || 0);
      await n(db.prepare('DELETE FROM history WHERE at < ?').bind(at - HISTORY.days * DAY));
      const edge = at - HISTORY.whole;
      await n(db.prepare('DELETE FROM history WHERE at < ? AND rowid NOT IN (SELECT MAX(rowid) FROM history WHERE at < ? GROUP BY coll, id, at / 86400000)').bind(edge, edge));
      for (let i = 0; i < 20; i++) {
        const { bytes } = (await db.prepare('SELECT COALESCE(SUM(length(payload)), 0) AS bytes FROM history').first()) || {};
        if (!(bytes > HISTORY.maxBytes)) break;
        await n(db.prepare('DELETE FROM history WHERE rowid IN (SELECT rowid FROM history ORDER BY at LIMIT 200)'));
      }
      return gone;
    },
    // Every document, a page at a time in (coll, id) order after `from`
    // ([coll, id]); for the nightly copy to R2.
    async page(from = ['', ''], size = 200) {
      const { results } = await db.prepare('SELECT coll, id, payload, updated FROM docs WHERE coll > ?1 OR (coll = ?1 AND id > ?2) ORDER BY coll, id LIMIT ?3').bind(from[0], from[1], size).all();
      return results;
    }
  };
  return store;
}

// Whether the store can be used: D1 bound.
export const storeReady = env => Boolean(env.STORE);

// The calls worker.js hands on, each (env, …). `keep`: the collections
// whose versions are kept (a Set).
export function docStore({ keep = new Set() } = {}) {
  const d1 = env => d1Store(env.STORE, { keep: c => keep.has(c) });
  return {
    get: (env, c, id) => d1(env).get(c, id),
    write: (env, c, id, payload, pre, o) => d1(env).write(c, id, payload, pre, o),
    versions: (env, id, c) => d1(env).versions(id, c),
    kept: (env, c, o) => d1(env).kept(c, o),
    version: (env, c, id, updated) => d1(env).version(c, id, updated),
    restore: (env, c, id, updated, payload) => d1(env).restore(c, id, updated, payload),
    prune: env => d1(env).prune(),
    page: (env, from, size) => d1(env).page(from, size),
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
// (`all`: also the account's documents the index doesn't name, found by one
// listing of the collection's ids.)
export async function moveOwned(env, deps, collection, indexId, from, to, { all = false } = {}) {
  const asIndex = v => (v && typeof v.due === 'object' ? v : { due: {} });
  const index = asIndex(parseDoc(await deps.fsGet(env, collection, indexId)));
  const prefix = `${from}_`;
  const moved = [];
  const owned = Object.entries(index.due);
  if (all && deps.fsList)
    for (const { id } of await deps.fsList(env, collection, 300, { idsOnly: true })) if (id.startsWith(prefix) && !(id in index.due)) owned.push([id, null]);
  for (const [key, at] of owned) {
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
  if (moved.some(([, , at]) => at != null))
    await changeDoc(env, deps, collection, indexId, idx => {
      const due = { ...idx.due };
      for (const [key, next, at] of moved) {
        if (at == null) continue;
        due[next] = due[key] ?? at;
        delete due[key];
      }
      return { ...idx, due };
    }, { read: asIndex });
  return moved.length;
}
