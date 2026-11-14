// D1's API over node:sqlite (D1 is SQLite), for the tests.
// (`fullPasses`: every account a test's made-up session names reads as a
// 'full' one (eco.js levelOf), so its AI asks go through.)
import { DatabaseSync } from 'node:sqlite';

const WALLET_READ = /^SELECT payload, updated FROM docs WHERE coll = \? AND id = \?$/;
const FULL = JSON.stringify({ v: 1, created: 1, entries: [], snap: {}, settings: {}, apps: {}, inbox: {}, sec: { level: 'full' } });

export function fakeD1(schema = '', { fullPasses = false } = {}) {
  const db = new DatabaseSync(':memory:');
  if (schema) db.exec(schema);
  return {
    prepare: sql => {
      let args = [];
      const st = db.prepare(sql);
      const made = () => (fullPasses && WALLET_READ.test(sql.trim()) && args[0] === 'eco-wallets' ? { payload: FULL, updated: 'test' } : null);
      const self = {
        bind: (...a) => ((args = a), self),
        first: async () => st.get(...args) || made(),
        run: async () => ({ meta: { changes: Number(st.run(...args).changes) } }),
        all: async () => ({ results: st.all(...args) })
      };
      return self;
    },
    // One transaction, as D1's batch.
    batch: async list => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const q of list) out.push(await q.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
  };
}
