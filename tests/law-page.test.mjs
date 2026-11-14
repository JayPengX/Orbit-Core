// Orbit Law's /law-page: a government page read inside the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pageUrl, cleanHtml, charsetOf, decode, handleLawPage, PAGE_LIMITS } from '../law-page.js';
import { forgetLawCounts } from '../law.js';

const PASS = { a: 'law', d: 'acct-page', s: 's' };
const req = (u, origin = 'https://orbit.jaypengx.com') => new Request(`https://proxy.test/law-page?v=1&u=${encodeURIComponent(u)}`, { headers: { Origin: origin } });
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

test('the build key reads a Taiwan-only county site, from Taiwan; nothing else gets in without a Pass', async () => {
  const { twOnly, buildKeyOk } = await import('../law-hosts.js');
  const KEY = 'k'.repeat(32);
  const page = 'https://law.tycg.gov.tw/LawContent.aspx?id=GL000133';
  assert.equal(twOnly(page), true);
  for (const bad of ['https://law.moj.gov.tw/LawContent.aspx?id=1', 'https://law.tycg.gov.tw/Admin.aspx', 'http://law.tycg.gov.tw/LawContent.aspx', 'https://law.tycg.gov.tw:444/LawContent.aspx']) assert.equal(twOnly(bad), false, bad);
  assert.equal(twOnly('https://bms.ntp.gov.tw/NewTCAV/BillQuery/BillQuery_Form_Context.aspx?BillNO=1'), true, 'a council’s pages too');
  for (const bad of ['http://www.mlcc.gov.tw/', 'https://www.mlcc.gov.tw:8443/', 'https://user:pw@www.tycc.gov.tw/']) assert.equal(twOnly(bad), false, bad);
  assert.equal(buildKeyOk(KEY, KEY), true);
  assert.equal(buildKeyOk('short', 'short'), false, 'no short secret');
  assert.equal(buildKeyOk('', undefined), false, 'no secret, no door');
  const via = [];
  const env = { LAW_BUILD_KEY: KEY, GEMINI_RELAY: { fetch: async u => (via.push(u), html('<p>規則</p>')) } };
  const keyed = (u, key) => new Request(`https://proxy.test/law-page?v=1&u=${encodeURIComponent(u)}`, { headers: key ? { 'X-Build-Key': key } : {} });
  const direct = async () => html('<p>direct</p>');
  assert.equal((await handleLawPage(keyed(page), env, null, {}, null, direct)).status, 401, 'no key');
  assert.equal((await handleLawPage(keyed(page, 'x'.repeat(32)), env, null, {}, null, direct)).status, 401, 'wrong key');
  assert.equal((await handleLawPage(keyed('https://law.moj.gov.tw/LawClass/LawAll.aspx', KEY), env, null, {}, null, direct)).status, 401, 'key only opens those sites');
  const ok = await handleLawPage(keyed(page, KEY), env, null, {}, null, direct);
  assert.equal(ok.status, 200);
  assert.match((await ok.json()).html, /規則/);
  assert.match(via[0], /^https:\/\/gemini-relay\/\?to=https%3A%2F%2Flaw\.tycg\.gov\.tw/);
});

test('司法院\'s judgment pages (Taiwan only since 2026-10) are read from Taiwan, for a Pass; the build key still can\'t', async () => {
  const { judgmentPage, viaTaiwan } = await import('../law-hosts.js');
  const jd = 'https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=TPSM%2C115%2C%E5%8F%B0%E4%B8%8A%2C2613%2C20261008%2C1';
  assert.equal(judgmentPage(jd), true);
  assert.equal(viaTaiwan(jd), true);
  for (const bad of ['https://judgment.judicial.gov.tw/FJUD/default.aspx', 'http://judgment.judicial.gov.tw/FJUD/data.aspx?id=1', 'https://cons.judicial.gov.tw/FJUD/data.aspx']) assert.equal(judgmentPage(bad), false, bad);
  const KEY = 'k'.repeat(32);
  const env = { LAW_BUILD_KEY: KEY, GEMINI_RELAY: { fetch: async () => html('<p>判決</p>') } };
  const r = await handleLawPage(new Request(`https://proxy.test/law-page?v=1&u=${encodeURIComponent(jd)}`, { headers: { 'X-Build-Key': KEY } }), env, null, {}, null, async () => html('<p>direct</p>'));
  assert.equal(r.status, 401);
});

test('the build reads a Taiwan-only PDF\u2019s bytes (file=1), passed through, never kept at the edge; a Pass or no key gets only its size', async () => {
  const KEY = 'k'.repeat(32);
  const pdf = 'https://www.zhubei.gov.tw/admin/upload/twgov_file_1.pdf';
  const env = { LAW_BUILD_KEY: KEY, GEMINI_RELAY: { fetch: async () => new Response('%PDF-1.7 x', { headers: { 'Content-Type': 'application/pdf' } }) } };
  const ask = (q, key) => handleLawPage(new Request(`https://proxy.test/law-page?v=1&u=${encodeURIComponent(pdf)}${q}`, { headers: key ? { 'X-Build-Key': key } : {} }), env, null, {}, null, async () => new Response('direct'));
  const got = await ask('&file=1', KEY);
  assert.equal(got.headers.get('Content-Type'), 'application/pdf');
  assert.equal(await got.text(), '%PDF-1.7 x', 'its bytes straight through');
  const plain = await (await ask('', KEY)).json();
  assert.equal(plain.b64, undefined, 'without file=1, its size only');
  assert.equal((await ask('&file=1')).status, 401, 'no key, no file');
});


test('the build streams a 代表會 recording from Taiwan (file=1) past a file\u2019s 40 MB, timed only to its answer', async () => {
  const KEY = 'k'.repeat(32);
  const mp3 = 'https://subws.hsinchu.gov.tw/001/Upload/1/meeting.mp3';
  const big = String(200 * 1024 * 1024);
  const env = { LAW_BUILD_KEY: KEY, GEMINI_RELAY: { fetch: async (u, init) => new Response('ID3 x', { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': big } }) } };
  const got = await handleLawPage(new Request(`https://proxy.test/law-page?v=1&file=1&u=${encodeURIComponent(mp3)}`, { headers: { 'X-Build-Key': KEY } }), env, null, {}, null, async () => new Response('direct'));
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(got.headers.get('Content-Length'), big);
  assert.ok(PAGE_LIMITS.audioBytes > PAGE_LIMITS.fileBytes);
});

test('the build reads a Taiwan-only site’s own JSON and raw page (file=1) as they came; without it, a page is cleaned', async () => {
  const KEY = 'k'.repeat(32);
  const env = { LAW_BUILD_KEY: KEY, GEMINI_RELAY: { fetch: async u => (/api/.test(u) ? new Response('[{"a":1}]', { headers: { 'Content-Type': 'application/json; charset=utf-8' } }) : new Response('<p>x</p><script>var api="/api/x"</script>', { headers: { 'Content-Type': 'text/html' } })) } };
  const ask = (u, q) => handleLawPage(new Request(`https://proxy.test/law-page?v=1&u=${encodeURIComponent(u)}${q}`, { headers: { 'X-Build-Key': KEY } }), env, null, {}, null, async () => new Response('direct'));
  const j = await ask('https://tccvideo.tcc.gov.tw/api/list', '&file=1');
  assert.equal(j.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(await j.text(), '[{"a":1}]');
  assert.match(await (await ask('https://tccvideo.tcc.gov.tw/', '&file=1')).text(), /<script>/, 'its scripts kept for the build');
  assert.doesNotMatch((await (await ask('https://tccvideo.tcc.gov.tw/', '')).json()).html, /<script>/, 'cleaned without file=1');
});

test('the build reads any gov.tw page from Taiwan (a township’s site), never another host; a Pass’s read of one stays direct', async () => {
  const { buildHost } = await import('../law-hosts.js');
  assert.equal(buildHost('https://town.chcg.gov.tw/beidou/'), true);
  assert.equal(buildHost('https://example.com/'), false);
  assert.equal(buildHost('https://evilgov.tw/'), false);
  assert.equal(buildHost('http://town.chcg.gov.tw/'), false);
  assert.equal(buildHost('https://judgment.judicial.gov.tw/FJUD/data.aspx'), false, 'judgments stay a Pass\u2019s');
  const KEY = 'k'.repeat(32);
  let relayed = 0;
  const env = { LAW_BUILD_KEY: KEY, GEMINI_RELAY: { fetch: async () => (relayed++, new Response('<p>代表會</p>', { headers: { 'Content-Type': 'text/html' } })) } };
  const u = 'https://town.chcg.gov.tw/beidou/';
  const r = await handleLawPage(new Request(`https://proxy.test/law-page?v=1&u=${encodeURIComponent(u)}`, { headers: { 'X-Build-Key': KEY } }), env, null, {}, null, async () => new Response('direct'));
  assert.equal(r.status, 200);
  assert.equal(relayed, 1);
  const bad = await handleLawPage(new Request(`https://proxy.test/law-page?v=1&u=${encodeURIComponent('https://example.com/')}`, { headers: { 'X-Build-Key': KEY } }), env, null, {}, null, async () => new Response('direct'));
  assert.equal(bad.status, 401);
});

test('/law-judicial: 司法院\'s open data for the rulings build, its key only, from Taiwan, these calls only', async () => {
  const { judicialData } = await import('../law-hosts.js');
  const { handleLawJudicial } = await import('../law-page.js');
  for (const ok of ['https://data.judicial.gov.tw/jdg/api/Auth', 'https://data.judicial.gov.tw/jdg/api/JDoc', 'https://opendata.judicial.gov.tw/data/api/rest/categories/051/resources', 'https://opendata.judicial.gov.tw/api/MemberTokens', 'https://opendata.judicial.gov.tw/api/FilesetLists/12345/file']) assert.equal(judicialData(ok), true, ok);
  for (const bad of ['https://data.judicial.gov.tw/jdg/api/Other', 'http://data.judicial.gov.tw/jdg/api/Auth', 'https://opendata.judicial.gov.tw/api/FilesetLists/x/file', 'https://evil.com/jdg/api/Auth', 'https://data.judicial.gov.tw/jdg/api/Auth?x=1', 'https://judgment.judicial.gov.tw/FJUD/data.aspx']) assert.equal(judicialData(bad), false, bad);
  const KEY = 'k'.repeat(32);
  const seen = [];
  const env = { LAW_BUILD_KEY: KEY, GEMINI_RELAY: { fetch: async (u, init) => (seen.push([u, init.method, init.body, init.headers]), new Response('{"Token":"t"}', { headers: { 'Content-Type': 'application/json' } })) } };
  const at = (u, init = {}) => new Request(`https://proxy.test/law-judicial?u=${encodeURIComponent(u)}`, init);
  const AUTH = 'https://data.judicial.gov.tw/jdg/api/Auth';
  assert.equal((await handleLawJudicial(at(AUTH, { method: 'POST', body: '{}' }), env, {})).status, 401, 'no key');
  assert.equal((await handleLawJudicial(at(AUTH, { method: 'POST', body: '{}', headers: { 'X-Build-Key': 'x'.repeat(32) } }), env, {})).status, 401, 'wrong key');
  assert.equal((await handleLawJudicial(at('https://evil.com/', { headers: { 'X-Build-Key': KEY } }), env, {})).status, 400);
  assert.equal((await handleLawJudicial(at(AUTH, { method: 'PUT', headers: { 'X-Build-Key': KEY } }), env, {})).status, 405);
  const r = await handleLawJudicial(at(AUTH, { method: 'POST', body: '{"user":"u"}', headers: { 'X-Build-Key': KEY, 'Content-Type': 'application/json' } }), env, {});
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { Token: 't' });
  assert.equal(seen[0][0], `https://gemini-relay/?to=${encodeURIComponent(AUTH)}`, 'through the relay');
  assert.deepEqual([seen[0][1], seen[0][2], seen[0][3]['Content-Type'], 'X-Build-Key' in seen[0][3]], ['POST', '{"user":"u"}', 'application/json', false], 'the key never passed on');
});
