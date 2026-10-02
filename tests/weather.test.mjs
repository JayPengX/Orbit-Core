// Orbit Weather (weather.js): the key check and its samples, without network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { weatherStatus, handleWeather, scrub } from '../weather.js';

const env = { GOOGLE_WEATHER_KEY: 'g-secret-key-123', CWA_KEY: 'CWA-SECRET-0000', MOENV_KEY: '' };
const answer = (status, body) => ({ ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

test('status says which keys are set and answer, never the keys', async () => {
  const fetchFn = async url => (url.includes('googleapis') ? answer(200, { temperature: { degrees: 28 } }) : answer(401, `bad key CWA-SECRET-0000 in ${url}`));
  const r = await weatherStatus(env, fetchFn);
  assert.equal(r.sources.google.ok, true);
  assert.equal(r.sources.cwa.ok, false);
  assert.equal(r.sources.cwa.status, 401);
  assert.deepEqual(r.sources.moenv, { key: false, ok: false, note: 'not set' });
  assert.ok(!JSON.stringify(r).includes('CWA-SECRET-0000'));
});

test('scrub hides keys, plain and URL-encoded', () => {
  assert.equal(scrub('a g-secret-key-123 b', env), 'a *** b');
});

test('samples are a fixed list, cached in KV', async () => {
  const store = new Map();
  const kv = { get: async k => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) };
  let calls = 0;
  const fetchFn = async () => (calls++, answer(200, { ok: 1, echo: 'g-secret-key-123' }));
  const req = q => new Request('https://w.example/weather/status' + q);
  const bad = await handleWeather(req('?sample=../x'), { ...env, RATE_LIMIT_KV: kv }, {}, '/weather/status', fetchFn);
  assert.equal(bad.status, 404);
  for (let i = 0; i < 2; i++) {
    const res = await handleWeather(req('?sample=google-current'), { ...env, RATE_LIMIT_KV: kv }, {}, '/weather/status', fetchFn);
    const j = await res.json();
    assert.equal(j.status, 200);
    assert.ok(!j.body.includes('g-secret-key-123'));
  }
  assert.equal(calls, 1);
});
