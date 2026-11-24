import test from 'node:test';
import assert from 'node:assert/strict';
import { startFreeWatch } from '../ops.js';

test("the free plans' watch is started on GitHub with the Actions token (GitHub's own timer ran none of 2026-11-13's first 6)", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => (calls.push([url, init.method, init.headers.Authorization, init.body]), new Response(null, { status: 204 }));
  assert.deepEqual(await startFreeWatch({ GH_ACTIONS_TOKEN: 't' }, fetchImpl), { started: true });
  assert.deepEqual(calls, [['https://api.github.com/repos/JayPengX/Orbit-Core/actions/workflows/free-watch.yml/dispatches', 'POST', 'Bearer t', '{"ref":"main"}']]);
  assert.deepEqual(await startFreeWatch({ GH_ACTIONS_TOKEN: 't' }, async () => new Response('', { status: 403 })), { failed: 'start: HTTP 403' });
  assert.deepEqual(await startFreeWatch({}), { off: 'no token' });
});

test("the showcase's demos are looked at every hour of Taiwan's day, started on GitHub with look=true (its own hourly timer ran 2 or 3 of 14 a day)", async () => {
  const { startShowcaseLook } = await import('../ops.js');
  const calls = [];
  const fetchImpl = async (url, init) => (calls.push([url, init.method, init.body]), new Response(null, { status: 204 }));
  assert.deepEqual(await startShowcaseLook({ GH_ACTIONS_TOKEN: 't' }, fetchImpl), { started: true });
  assert.deepEqual(calls, [['https://api.github.com/repos/JayPengX/Orbit-Showcase/actions/workflows/deploy.yml/dispatches', 'POST', '{"ref":"main","inputs":{"look":"true"}}']]);
  assert.deepEqual(await startShowcaseLook({}), { off: 'no token' });
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../worker.js', import.meta.url), 'utf8'), /if \(min === 22 && tick\.getUTCHours\(\) <= 13\) run\('showcase-look', \(\) => startShowcaseLook\(env\)/);
});
