// D1's API over node:sqlite (D1 is SQLite), for the tests.
import { DatabaseSync } from 'node:sqlite';

export function fakeD1(schema = '') {
  const db = new DatabaseSync(':memory:');
  if (schema) db.exec(schema);
  return {
    prepare: sql => {
      let args = [];
      const st = db.prepare(sql);
      const self = {
        bind: (...a) => ((args = a), self),
        first: async () => st.get(...args) || null,
        run: async () => ({ meta: { changes: Number(st.run(...args).changes) } }),
        all: async () => ({ results: st.all(...args) })
      };
      return self;
    }
  };
}
