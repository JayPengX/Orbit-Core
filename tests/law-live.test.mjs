import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ivodLive, readLive, handleLawLive } from '../law-live.js';

const LIST = `<div class="live-list"><h2><i class="icon-20-hammer"></i>社會福利及衛生環境委員會</h2><ul><li><p class="info"> <span class="time">2026-10-22 09:00</span><span class="place">群賢樓801會議室</span><span class="status" id="status_1" title="會議進行中">會議進行中</span></p><p class="text"> <span class="metdec" title="社福委員會第3次全體委員會議（事由：…）">x</span></p><div class="btn-box"><a href="/Live/Single/26/1/live/09:00" class="btn-play">播放</a></div></li></ul></div><div class="live-list"><h2><i></i>院會</h2><ul><li><p class="info"><span class="time">2026-10-22 14:00</span><span class="place">本院議場</span><span class="status" title="會議尚未開始">會議尚未開始</span></p><a href="javascript:void(0)" class="btn-play btn-play-gray">尚未播放</a></li></ul></div>`;

// IVOD as the proxy meets it: a token page that sets a cookie, the list (POST, with both), a player page.
function fakeIvod(calls = []) {
  return async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push([init.method || 'GET', path, init.headers?.Cookie || '', init.headers?.['X-CSRF-TOKEN'] || '']);
    if (path === '/Live') return new Response('<meta name="csrf-token" content="tok">', { headers: { 'Set-Cookie': 'ivod=abc; path=/' } });
    if (path === '/Live/FetchCommInfo') return new Response(LIST);
    if (path.startsWith('/Live/Single/')) return new Response('<iframe src="https://ivod.ly.gov.tw/embedd.php?id=3">');
    return new Response('', { status: 404 });
  };
}

test('IVOD live list: one row per meeting under its unit, the player page only while it streams', () => {
  const rows = ivodLive(LIST);
  assert.deepEqual(rows.map(r => [r.unit, r.time, r.place, r.status, r.single]), [
    ['社會福利及衛生環境委員會', '2026-10-22 09:00', '群賢樓801會議室', '會議進行中', '/Live/Single/26/1/live/09:00'],
    ['院會', '2026-10-22 14:00', '本院議場', '會議尚未開始', '']
  ]);
});

test('/law-live reads IVOD with its token and cookie, and names each streaming meeting’s channel', async () => {
  const calls = [];
  const out = await readLive(fakeIvod(calls), Date.parse('2026-10-22T01:05:00Z'));
  assert.equal(out.at, '2026-10-22T01:05:00.000Z');
  assert.deepEqual(out.rooms.map(r => [r.unit, r.ch]), [['社會福利及衛生環境委員會', 3], ['院會', null]]);
  assert.ok(!('single' in out.rooms[0]));
  const post = calls.find(c => c[1] === '/Live/FetchCommInfo');
  assert.deepEqual(post, ['POST', '/Live/FetchCommInfo', 'ivod=abc', 'tok']);
});

test('/law-live: kept at the edge, and the last good read when IVOD fails', async () => {
  const store = new Map();
  const cache = { match: async k => store.get(k)?.clone(), put: async (k, r) => void store.set(k, r) };
  const waits = [];
  const ctx = { waitUntil: p => waits.push(p) };
  let n = 0;
  const counted = (f => (u, i) => (n++, f(u, i)))(fakeIvod());
  const a = await handleLawLive(ctx, {}, { fetchFn: counted, cache });
  await Promise.all(waits);
  assert.equal(a.status, 200);
  assert.match(a.headers.get('Cache-Control'), /max-age=60/);
  const asked = n;
  const b = await handleLawLive(ctx, {}, { fetchFn: counted, cache });
  assert.equal(n, asked, 'the second read comes from the edge');
  assert.deepEqual((await b.json()).rooms.length, 2);
  const down = await handleLawLive(ctx, {}, { fetchFn: async () => new Response('', { status: 503 }), cache: null });
  assert.equal(down.status, 200);
  assert.equal((await down.json()).rooms.length, 2);
});

test('/law-live: a fresh isolate answers the edge-kept last read while IVOD fails (as the old live.json did)', async () => {
  const { handleLawLive: fresh } = await import('../law-live.js?cold');
  const store = new Map([['https://orbit-law-live.orbit/v1-last', new Response(JSON.stringify({ at: '2026-11-03T02:00:00Z', rooms: [{ unit: 'x' }] }))]]);
  const cache = { match: async k => store.get(k)?.clone(), put: async (k, r) => void store.set(k, r) };
  const r = await fresh({ waitUntil() {} }, {}, { fetchFn: async () => new Response('', { status: 503 }), cache });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).rooms.length, 1);
});
