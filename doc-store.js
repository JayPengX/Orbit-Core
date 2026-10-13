// The Pass's store (every wallet, each app's data, Play's slips, the config):
// documents of one text `payload` each, by collection and id. On Cloudflare
// D1 (binding STORE, database quadra-store) once moved; Firebase's Firestore
// until then, and both while moving (the owner, 2026-10-13: Firebase moves to
// Cloudflare, then is abandoned).
//
// env.STORE_MODE:
//   'firestore' (or unset): Firestore alone, as before;
//   'dual':  Firestore is the truth; every write is copied to D1 as it
//            succeeds (its updateTime the same), and the cron copies what
//            D1 doesn't have yet (copyToD1); reads are Firestore's;
//   'd1':    D1 alone.
//
// The same calls as Firestore's (worker.js hands them to eco.js, settle.js,
// kambi.js, lotto.js, stock-check.js, eco-admin.js): get, write (with an
// `{ updateTime }` or `{ exists: false }` precondition: a write that lost the
// race throws `precondition`), list, collections, batch, delete.
//
// D1: one table, docs(coll, id, payload, updated): `updated` plays
// Firestore's updateTime (a write only if it's still what was read).

export const SCHEMA = 'CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY (coll, id))';

// A new updateTime: Firestore's shape (an ISO time to the microsecond), unique enough.
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
    // Each write on its own (one that loses its race doesn't stop the rest), as Firestore's batchWrite answers.
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
    },
    // A Firestore document as it was (its own updateTime), unless D1 has it already.
    async copy(collection, id, payload, updated) {
      const r = await db.prepare('INSERT OR IGNORE INTO docs (coll, id, payload, updated) VALUES (?, ?, ?, ?)').bind(collection, id, payload, updated || stamp()).run();
      return Boolean(r.meta?.changes);
    },
    // A Firestore write as it landed, made in D1 too (whatever D1 had).
    async mirror(collection, id, payload, updated) {
      await db.prepare('INSERT INTO docs (coll, id, payload, updated) VALUES (?, ?, ?, ?) ON CONFLICT (coll, id) DO UPDATE SET payload = excluded.payload, updated = excluded.updated').bind(collection, id, payload, updated).run();
    }
  };
}

// Whether the store can be used: D1 bound in 'd1' mode, else Firebase's
// service account set.
export const storeReady = env => (env.STORE_MODE === 'd1' ? Boolean(env.STORE) : Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY));

// The calls worker.js hands on, by the mode. `fs`: Firestore's
// ({ get, write, list, collections, batch, delete }, each (env, …)).
export function docStore(fs) {
  const mode = env => (env.STORE ? env.STORE_MODE || 'firestore' : 'firestore');
  const d1 = env => d1Store(env.STORE);
  // A D1 copy that fails never fails the Firestore write it follows (the cron's copy catches up).
  const also = async fn => {
    try {
      await fn();
    } catch (e) {
      console.log('store: D1 copy failed', String(e?.message || e).slice(0, 160));
    }
  };
  return {
    get: (env, c, id) => (mode(env) === 'd1' ? d1(env).get(c, id) : fs.get(env, c, id)),
    async write(env, c, id, payload, pre) {
      if (mode(env) === 'd1') return d1(env).write(c, id, payload, pre);
      const r = await fs.write(env, c, id, payload, pre);
      if (mode(env) === 'dual') await also(() => d1(env).mirror(c, id, payload, r?.updateTime || stamp()));
      return r;
    },
    list: (env, c, pageSize, o) => (mode(env) === 'd1' ? d1(env).list(c, pageSize, o) : fs.list(env, c, pageSize, o)),
    collections: env => (mode(env) === 'd1' ? d1(env).collections() : fs.collections(env)),
    async batch(env, writes) {
      if (mode(env) === 'd1') return d1(env).batch(writes);
      const r = await fs.batch(env, writes);
      if (mode(env) === 'dual')
        await also(async () => {
          const s = d1(env);
          for (const [i, w] of writes.entries()) {
            if (r?.status?.[i]?.code) continue;
            if (w.delete) await s.delete(...w.delete);
            else await s.mirror(w.update[0], w.update[1], w.update[2], r?.writeResults?.[i]?.updateTime || stamp());
          }
        });
      return r;
    },
    async delete(env, c, id) {
      if (mode(env) === 'd1') return d1(env).delete(c, id);
      await fs.delete(env, c, id);
      if (mode(env) === 'dual') await also(() => d1(env).delete(c, id));
    }
  };
}

// The move: every Firestore document into D1 (what D1 has already, from a
// write while moving, is newer and stays), and the comparison after it.
export async function copyToD1(env, fs, { log = () => {} } = {}) {
  const s = d1Store(env.STORE);
  const out = { collections: 0, docs: 0, copied: 0 };
  for (const c of await fs.collections(env)) {
    out.collections++;
    for (const d of await fs.list(env, c, 300)) {
      out.docs++;
      if (await s.copy(c, d.id, d.payload, d.updateTime)) out.copied++;
    }
    log(c);
  }
  return out;
}
// Each collection's documents in both, and how many differ (payload or
// updateTime) or are missing on either side: all zero, D1 can take over.
export async function compareStores(env, fs) {
  const s = d1Store(env.STORE);
  const out = { collections: {}, differ: 0, missing: 0, extra: 0 };
  for (const c of await fs.collections(env)) {
    const a = await fs.list(env, c, 300);
    const b = new Map((await s.list(c)).map(d => [d.id, d]));
    let differ = 0;
    let missing = 0;
    for (const d of a) {
      const x = b.get(d.id);
      if (!x) missing++;
      else if (x.payload !== d.payload || x.updateTime !== d.updateTime) differ++;
      b.delete(d.id);
    }
    out.collections[c] = { firestore: a.length, differ, missing, extra: b.size };
    out.differ += differ;
    out.missing += missing;
    out.extra += b.size;
  }
  return out;
}

// Firestore's last copy before it goes: every document ({ coll, id,
// payload, updated } lines), gzipped into R2 under private/ (never served by
// /data/). Kept for good, in case anything is ever found missing in D1.
export const BACKUP_PATH = 'private/firestore-backup.jsonl.gz';
export async function backupToR2(env, fs, { gzip }) {
  const lines = [];
  for (const c of await fs.collections(env)) for (const d of await fs.list(env, c, 300)) lines.push(JSON.stringify({ coll: c, id: d.id, payload: d.payload, updated: d.updateTime }));
  const bytes = await gzip(new TextEncoder().encode(lines.join('\n')));
  await env.DATA.put(BACKUP_PATH, bytes, { customMetadata: { docs: String(lines.length), at: new Date().toISOString() } });
  return { path: BACKUP_PATH, docs: lines.length, bytes: bytes.length };
}
