// /data/_get (data.js): a file as kept, `private/` too, only with the push
// secret: the news desk in GitHub Actions reads the state the cron kept (11-19).
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleData } from '../data.js';

test('/data/_get answers a private file with the secret, nothing without it', async () => {
  const kept = new Map([['private/news/items.json.gz', new Uint8Array([0x1f, 0x8b, 1, 2])]]);
  const env = { DATA_PUSH_SECRET: 's', DATA: { get: async k => (kept.has(k) ? { body: new Blob([kept.get(k)]).stream() } : null) } };
  const ask = auth => handleData(new Request('https://p/data/_get?p=private/news/items.json.gz', { headers: auth ? { Authorization: `Bearer ${auth}` } : {} }), env, {}, {}, '1.1.1.1', '/data/_get');
  const ok = await ask('s');
  assert.equal(ok.status, 200);
  assert.deepEqual([...new Uint8Array(await ok.arrayBuffer())], [0x1f, 0x8b, 1, 2]);
  assert.equal((await ask('wrong')).status, 401);
  assert.equal((await ask('')).status, 401);
  // (The public route still never serves private/.)
  const pub = await handleData(new Request('https://p/data/private/news/items.json.gz'), env, {}, {}, '1.1.1.1', '/data/private/news/items.json.gz');
  assert.equal(pub.status, 404);
});
