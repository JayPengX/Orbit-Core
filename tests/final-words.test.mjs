// A final's notice, one way in every sport (Jay 2026-11-11: "塞爾提克 123 :
// 101 76 人 / 塞爾提克 贏了 · NBA" ran the scores into the names and was hard
// to read): who won in the title, in words; the score alone in the body, the
// winner's first, never a number beside a name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { finalWords } from '../kit/sports-espn.mjs';
import { runCheck } from '../push.js';

test('who won in the title, the score in the body: basketball, baseball, football, a draw, a shootout', () => {
  assert.deepEqual(finalWords({ away: { name: '塞爾提克', score: '123' }, home: { name: '76 人', score: '101' } }), { title: '塞爾提克 擊敗 76 人', result: '123–101' });
  assert.deepEqual(finalWords({ away: { name: 'Celtics', score: 123 }, home: { name: '76ers', score: 101 } }, 'en'), { title: 'Celtics beat 76ers', result: '123–101' });
  assert.deepEqual(finalWords({ away: { name: '道奇', score: '2' }, home: { name: '洋基', score: '5' } }), { title: '洋基 擊敗 道奇', result: '5–2' }, "the winner's score first, whichever side");
  assert.deepEqual(finalWords({ away: { name: '兵工廠', score: '1' }, home: { name: '曼城', score: '1' } }), { title: '兵工廠 與 曼城 平手', result: '1–1' });
  assert.deepEqual(finalWords({ away: { name: 'Arsenal', score: '1' }, home: { name: 'Man City', score: '1' } }, 'en').title, 'Arsenal and Man City draw');
  assert.deepEqual(finalWords({ away: { name: '國米', score: '1' }, home: { name: '拜仁', score: '1' }, winner: 'home', shootout: { away: 3, home: 4 } }), { title: '拜仁 擊敗 國米', result: '1–1，PK 4–3' });
  assert.equal(finalWords({ away: { name: 'A', score: '' }, home: { name: 'B', score: '3' } }), null, 'no score, no words');
});

test("the Worker's ESPN final reads the same: 塞爾提克 擊敗 76 人 over 123–101", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ header: { competitions: [{ status: { type: { state: 'post', completed: true } }, competitors: [{ homeAway: 'away', score: '123', winner: true, team: { shortDisplayName: 'Celtics' } }, { homeAway: 'home', score: '101', team: { shortDisplayName: '76ers' } }] }] } }), { status: 200 });
  try {
    assert.deepEqual(await runCheck({ espn: 'basketball/nba', event: '401909961', names: ['塞爾提克', '76 人'] }, 'zh', {}), { title: '塞爾提克 擊敗 76 人', body: '123–101', result: '123–101' });
  } finally {
    globalThis.fetch = real;
  }
});
