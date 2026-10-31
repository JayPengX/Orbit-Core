// Orbit Money's 拍照記帳 (money-read.js): the model's answer kept to what can be
// true, and the asks: signed in, the origin, the picture, the day's cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBuys, cleanList, handleMoneyRead, READ_LIMITS } from '../money-read.js';
import { forgetLawCounts } from '../law.js';

test('only real days, whole totals, an invoice number’s form, and the person’s own categories and ways to pay', () => {
  const lists = { cats: [{ id: 'food', name: '餐飲', k: 'out' }, { id: 'salary', name: '薪水', k: 'in' }], pays: [{ id: 'linepay|', name: 'LINE Pay' }] };
  const out = cleanBuys(
    {
      buys: [
        { k: 'out', day: '2026-10-25', store: '全家', total: 85.4, invoice: 'ab-12345678', items: [{ name: '拿鐵', amt: 55 }, { name: '', amt: 3 }], cat: 'food', pay: 'linepay|' },
        { k: 'out', day: '2026-12-31', store: 'x', total: 10, invoice: '123', items: [], cat: 'salary', pay: 'made-up|' },
        { k: 'in', day: '', store: 'y', total: 0, invoice: '', items: [], cat: '', pay: '' },
        { k: 'in', day: '2026-10-05', store: '公司', total: 30000, invoice: '', items: [], cat: 'salary', pay: '' }
      ]
    },
    '2026-10-27',
    lists
  );
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { k: 'out', day: '2026-10-25', store: '全家', total: 85, items: [{ name: '拿鐵', amt: 55 }], cat: 'food', pay: 'linepay|', invoice: 'AB12345678' });
  assert.equal(out[1].day, '');
  assert.equal(out[1].invoice, '');
  // (An income category on a spend, a way to pay the person doesn't have: left empty.)
  assert.equal(out[1].cat, '');
  assert.equal(out[1].pay, '');
  assert.equal(out[2].k, 'in');
  assert.equal(out[2].cat, 'salary');
  assert.deepEqual(cleanBuys(null, '2026-10-27'), []);
});

test('the lists the app sends are kept short and plain', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ id: `c${i}`, name: ` 名 ${i} `, k: i % 2 ? 'in' : 'x' }));
  const out = cleanList(many, READ_LIMITS.maxCats);
  assert.equal(out.length, READ_LIMITS.maxCats);
  assert.deepEqual(out[0], { id: 'c0', name: '名 0', k: 'out' });
  assert.deepEqual(cleanList('nope', 10), []);
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
  const ok = await ask(IMG, { gemini: reply([{ k: 'out', day: '2026-10-01', store: '星巴克', total: 150, invoice: '', items: [], cat: '', pay: '' }]) });
  assert.equal(ok.status, 200);
  assert.equal(ok.buys[0].store, '星巴克');
  assert.equal(ok.left, READ_LIMITS.perPass - 1);
  const bad = await ask(IMG, { session: { a: 'money', d: 'pass2' }, gemini: async () => new Response('{}', { status: 500 }) });
  assert.equal(bad.error, 'upstream');
});
