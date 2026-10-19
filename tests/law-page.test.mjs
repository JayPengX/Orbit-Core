// Orbit Law's /law-page: a government page read inside the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pageUrl, cleanHtml, charsetOf, decode, handleLawPage, PAGE_LIMITS } from '../law-page.js';
import { forgetLawCounts } from '../law.js';

const PASS = { a: 'law', d: 'acct-page', s: 's' };
const req = (u, origin = 'https://jaypengx.github.io') => new Request(`https://proxy.test/law-page?v=1&u=${encodeURIComponent(u)}`, { headers: { Origin: origin } });
const html = (body, type = 'text/html; charset=utf-8', status = 200, extra = {}) => new Response(body, { status, headers: { 'Content-Type': type, ...extra } });

test('only government hosts, on https', () => {
  assert.equal(pageUrl('http://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0030001#x'), 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0030001');
  assert.equal(pageUrl('https://gov.tw/'), 'https://gov.tw/');
  assert.equal(pageUrl('https://www.edu.tw/News.aspx'), 'https://www.edu.tw/News.aspx');
  for (const bad of ['https://evil.com/', 'https://gov.tw.evil.com/', 'https://xgov.tw/', 'https://ntu.edu.tw/', 'ftp://law.moj.gov.tw/', 'https://u:p@law.moj.gov.tw/', 'https://law.moj.gov.tw:8443/', 'javascript:alert(1)', '']) assert.equal(pageUrl(bad), null, bad);
});

test('scripts, styles, handlers and javascript: links taken out', () => {
  const out = cleanHtml('<p onclick="x()">a</p><script>bad()</script><style>p{}</style><noscript>n</noscript><a href="javascript:evil()">l</a><img src=x onerror=alert(1)>');
  assert.equal(out, '<p>a</p><a href="#">l</a><img src=x>');
  assert.equal(cleanHtml('x'.repeat(10), 4), 'xxxx');
});

test('Big5 pages decode by their header or <meta>', () => {
  const big5 = new Uint8Array([0xa4, 0xa4, 0xa4, 0xe5]); // 中文
  assert.equal(charsetOf('text/html; charset=Big5', big5), 'big5');
  assert.equal(charsetOf('text/html', new TextEncoder().encode('<meta charset="big5">')), 'big5');
  assert.equal(decode(big5, 'big5'), '中文');
  assert.equal(decode(new TextEncoder().encode('中文'), 'nonsense'), '中文');
});

test('a Pass, its origin and a government url, before anything is fetched', async () => {
  let calls = 0;
  const f = async () => (calls++, html('<p>x</p>'));
  assert.equal((await handleLawPage(req('https://law.moj.gov.tw/'), {}, null, {}, null, f)).status, 401);
  assert.equal((await handleLawPage(req('https://law.moj.gov.tw/'), {}, null, {}, { a: 'stock', d: 'x' }, f)).status, 401);
  assert.equal((await handleLawPage(req('https://law.moj.gov.tw/', 'https://evil.example'), {}, null, {}, PASS, f)).status, 403);
  const r = await handleLawPage(req('https://example.com/'), {}, null, {}, PASS, f);
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: 'host' });
  assert.equal(calls, 0);
});

test('a page comes back clean, redirects followed only on government hosts, files by their size', async () => {
  forgetLawCounts();
  const f = async u => {
    if (u === 'https://www.mol.gov.tw/a') return new Response(null, { status: 302, headers: { Location: '/b' } });
    if (u === 'https://www.mol.gov.tw/b') return html('<h1>最低工資</h1><script>x</script>');
    if (u === 'https://www.mol.gov.tw/out') return new Response(null, { status: 301, headers: { Location: 'https://evil.com/' } });
    if (u === 'https://www.mol.gov.tw/f.pdf') return html('%PDF', 'application/pdf', 200, { 'Content-Length': '1234' });
    if (u === 'https://www.mol.gov.tw/down') return html('', 'text/html', 503);
    throw new Error(u);
  };
  const ok = await (await handleLawPage(req('http://www.mol.gov.tw/a'), {}, null, {}, PASS, f)).json();
  assert.deepEqual(ok, { url: 'https://www.mol.gov.tw/b', type: 'html', html: '<h1>最低工資</h1>', cached: false });
  assert.equal((await handleLawPage(req('https://www.mol.gov.tw/out'), {}, null, {}, PASS, f)).status, 400);
  assert.deepEqual(await (await handleLawPage(req('https://www.mol.gov.tw/f.pdf'), {}, null, {}, PASS, f)).json(), { url: 'https://www.mol.gov.tw/f.pdf', type: 'pdf', size: 1234, cached: false });
  const down = await handleLawPage(req('https://www.mol.gov.tw/down'), {}, null, {}, PASS, f);
  assert.equal(down.status, 502);
  assert.deepEqual(await down.json(), { error: 'upstream', status: 503 });
});

test('500 fresh reads a Pass a day', async () => {
  forgetLawCounts();
  const { addOne, twDay, passKey } = await import('../law.js');
  const pass = { a: 'law', d: 'acct-cap' };
  const f = async () => html('<p>x</p>');
  await addOne({}, await passKey('page', pass.d, twDay()), twDay(), PAGE_LIMITS.perPass - 1);
  assert.equal((await handleLawPage(req('https://law.moj.gov.tw/x'), {}, null, {}, pass, f)).status, 200);
  const r = await handleLawPage(req('https://law.moj.gov.tw/y'), {}, null, {}, pass, f);
  assert.equal(r.status, 429);
  assert.equal((await r.json()).error, 'cap');
});
