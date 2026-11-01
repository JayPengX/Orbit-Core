import test from 'node:test';
import assert from 'node:assert/strict';
import { viaSite } from '../worker.js';

test("the proxy at a page's own /api: the path without it, a same-site GET named by its origin", async () => {
  const r = viaSite(new Request('https://orbit.example.tw/api/sports-today?d=1'));
  assert.equal(r.url, 'https://orbit.example.tw/sports-today?d=1');
  assert.equal(r.headers.get('Origin'), 'https://orbit.example.tw');
  const p = viaSite(new Request('https://example.tw/api/eco', { method: 'POST', body: '{"a":1}', headers: { Origin: 'https://example.tw', 'Content-Type': 'application/json' } }));
  assert.equal(p.url, 'https://example.tw/eco');
  assert.equal(p.method, 'POST');
  assert.equal(await p.text(), '{"a":1}');
  for (const u of ['https://api.example.tw/api/x', 'https://x.workers.dev/api/x', 'https://orbit.example.tw/apis/x']) assert.equal(viaSite(new Request(u)).url, u);
});
