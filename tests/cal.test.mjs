// Orbit Class's 加到行事曆 (cal.js): the phone's calendar kept and handed out at one address.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCal, CAL_MAX } from '../cal.js';

const kvOf = () => {
  const store = new Map();
  return { store, get: async k => store.get(k) ?? null, put: async (k, v) => void store.set(k, v), delete: async k => void store.delete(k) };
};
const ORIGIN = 'http://localhost:8123';
const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
const req = (method, body, origin = ORIGIN) => new Request('https://api.test/cal', { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: body == null ? undefined : JSON.stringify(body) });

test('a Class session keeps its calendar at one address; the Calendar app reads it with no Pass', async () => {
  const env = { RATE_LIMIT_KV: kvOf() };
  const ses = { a: 'orbit', d: 'pass-one' };
  const first = await (await handleCal(req('POST', { ics: ICS }), env, {}, ses, '/cal')).json();
  assert.match(first.url, /^\/cal\/[a-z2-9]{18}\.ics$/);
  const again = await (await handleCal(req('POST', { ics: ICS.replace('2.0', '2.0\r\nX-A:1') }), env, {}, ses, '/cal')).json();
  assert.equal(again.url, first.url, 'the same address after a change');
  const got = await handleCal(new Request(`https://api.test${first.url}`), env, {}, null, first.url);
  assert.equal(got.status, 200);
  assert.match(got.headers.get('Content-Type'), /^text\/calendar/);
  assert.match(await got.text(), /X-A:1/);
  // Turned off: the address stops answering.
  await handleCal(req('DELETE'), env, {}, ses, '/cal');
  assert.equal((await handleCal(new Request(`https://api.test${first.url}`), env, {}, null, first.url)).status, 404);
});

test('only a Class session, our pages and a calendar', async () => {
  const env = { RATE_LIMIT_KV: kvOf() };
  assert.equal((await handleCal(req('POST', { ics: ICS }), env, {}, { a: 'money', d: 'p' }, '/cal')).status, 401);
  assert.equal((await handleCal(req('POST', { ics: ICS }, 'https://evil.example'), env, {}, { a: 'orbit', d: 'p' }, '/cal')).status, 403);
  assert.equal((await handleCal(req('POST', { ics: '<html>' }), env, {}, { a: 'orbit', d: 'p2' }, '/cal')).status, 400);
  assert.equal((await handleCal(req('POST', { ics: `BEGIN:VCALENDAR${'x'.repeat(CAL_MAX)}END:VCALENDAR` }), env, {}, { a: 'orbit', d: 'p3' }, '/cal')).status, 400);
  assert.equal((await handleCal(new Request('https://api.test/cal/../x.ics'), env, {}, null, '/cal/abc.ics')).status, 404);
  assert.equal(env.RATE_LIMIT_KV.store.size, 0);
});
