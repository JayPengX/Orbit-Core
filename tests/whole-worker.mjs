// The whole Worker on a real (SQLite) store, as a phone and the admin panel call it: for tests of what
// only shows with every part in place (the Pass, the notices, the AI counts, kept versions).
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { fakeD1 } from './fake-d1.mjs';
import { readToken } from '../orbit-token.js';

const KEY = 'k'.repeat(40);
let n = 0;
export function wholeWorker(vars = {}) {
  const env = { ECO_TOKEN_SECRET: `whole-secret-${++n}`, ECO_ADMIN_TOKEN: KEY, STORE: fakeD1(''), ...vars };
  // (settle(): what the Worker left running behind its answers, waited for.)
  const later = [];
  const ctx = { waitUntil: p => void later.push(Promise.resolve(p).catch(() => {})), passThroughOnException: () => {} };
  const settle = async () => {
    while (later.length) await Promise.all(later.splice(0));
  };
  const ip = `7.7.${n % 250}.${1 + Math.floor(n / 250)}`;
  // send(path, method, body) → { status, data }
  const send = (path, method, body) =>
    worker
      .fetch(new Request(`https://api.jaypengx.com${path}`, { method, headers: { Origin: 'https://orbit.jaypengx.com', 'Content-Type': 'text/plain;charset=UTF-8', 'CF-Connecting-IP': ip }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, ctx)
      .then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));
  const eco = (body, app = '') => send(`/eco${app ? `?app=${app}` : ''}`, 'POST', body);
  const admin = (action, body = {}) => eco({ op: 'admin', token: KEY, action, ...body });
  const sql = (q, ...a) => env.STORE.prepare(q).bind(...a);
  const doc = async (coll, id) => (await sql('SELECT payload FROM docs WHERE coll = ? AND id = ?', coll, id).first())?.payload ?? null;
  const put = (coll, id, payload) => sql('INSERT OR REPLACE INTO docs (coll, id, payload, updated) VALUES (?, ?, ?, ?)', coll, id, payload, `t${Math.random()}`).run();
  const idOf = async token => ((await readToken(env.ECO_TOKEN_SECRET, token, 'ses')) || (await readToken(env.ECO_TOKEN_SECRET, token, 'new'))).d;
  // An account in use: issued by the owner, its handed-over pass replaced at the first sign-in.
  const account = async (app = 'stock') => {
    const [pass] = (await admin('issue', { count: 1 })).data.passes;
    const first = await eco({ op: 'login', passcode: pass, app });
    assert.equal(first.data.fresh, true);
    const own = await eco({ op: 'rotate', qt: first.data.token });
    assert.equal(own.status, 200);
    return { ...own.data, id: await idOf(own.data.token) };
  };
  return { env, send, eco, admin, sql, doc, put, idOf, account, settle };
}
