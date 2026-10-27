// Orbit Money's 讀圖 (money-read.js): the model's answer kept to what can be
// true, and the asks: signed in, the origin, the picture, the day's cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBuys, handleMoneyRead, READ_LIMITS } from '../money-read.js';
import { forgetLawCounts } from '../law.js';

test('only real days, whole totals and an invoice number’s form', () => {
  const out = cleanBuys(
    {
      buys: [
        { day: '2026-10-25', store: '全家', total: 85.4, invoice: 'ab-12345678', items: [{ name: '拿鐵', amt: 55 }, { name: '', amt: 3 }] },
        { day: '2026-12-31', store: 'x', total: 10, invoice: '123', items: [] },
        { day: '', store: 'y', total: 0, invoice: '', items: [] }
      ]
    },
    '2026-10-27'
  );
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { day: '2026-10-25', store: '全家', total: 85, invoice: 'AB12345678', items: [{ name: '拿鐵', amt: 55 }] });
  assert.equal(out[1].day, '');
  assert.equal(out[1].invoice, '');
  assert.deepEqual(cleanBuys(null, '2026-10-27'), []);
});

const ORIGIN = 'https://jaypengx.github.io';
const ask = (body, { origin = ORIGIN, session = { a: 'money', d: 'pass1' }, gemini } = {}) =>
  handleMoneyRead(new Request('https://w/money-read', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify(body) }), { GEMINI_API_KEY: 'k' }, {}, session, gemini).then(async r => ({ status: r.status, ...(await r.json()) }));
const reply = buys => async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ buys }) }] } }] }));
const IMG = { image: { mime_type: 'image/jpeg', data: 'AAAA' } };

test('the asks: a Pass, our origin, a picture, the day’s cap', async () => {
  forgetLawCounts();
  assert.equal((await ask(IMG, { session: null })).error, 'signin');
  assert.equal((await ask(IMG, { origin: 'https://evil.example' })).error, 'origin');
  assert.equal((await ask({ image: { mime_type: 'text/html', data: 'x' } })).error, 'image');
  const ok = await ask(IMG, { gemini: reply([{ day: '2026-10-01', store: '星巴克', total: 150, invoice: '', items: [] }]) });
  assert.equal(ok.status, 200);
  assert.equal(ok.buys[0].store, '星巴克');
  assert.equal(ok.left, READ_LIMITS.perPass - 1);
  const bad = await ask(IMG, { session: { a: 'money', d: 'pass2' }, gemini: async () => new Response('{}', { status: 500 }) });
  assert.equal(bad.error, 'upstream');
});
