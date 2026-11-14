// Mail from the domain (mail.js), the alert mails' timing (mail-alerts.js
// plan/settle: never spam, never miss) and the looks (site/admin/mail-look.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, settle, groupsAt, DAY_MAX } from '../mail-alerts.js';
import { addressesOf, isAddress, sendMail } from '../mail.js';
import { mailRender, alertMail, blocksOf, MAIL_LOOKS } from '../site/admin/mail-look.mjs';

const H = 3_600_000;
// 10:00 Taiwan (02:00 UTC), a weekday.
const T0 = Date.parse('2026-11-16T02:00:00Z');
const job = { id: 'job:notices', group: 'fast', tone: 'bad', title: '排程「通知」一直失敗' };
const run = (state, seen, now, ran = ['fast'], opts) => plan(state, seen, ran, now, opts);
const send = (r, now) => settle(r.state, r.mail, true, now);

test('alerts: a problem is mailed once it is seen twice, then not again for a day', () => {
  let r = run(null, [job], T0);
  assert.equal(r.mail, null, 'seen once: not yet');
  r = run(r.state, [job], T0 + 10 * 60_000);
  assert.deepEqual(r.mail.issues.map(i => i.id), ['job:notices']);
  let s = send(r, T0 + 10 * 60_000);
  for (let t = T0 + 20 * 60_000; t < T0 + 10 * 60_000 + 24 * H; t += 10 * 60_000) {
    r = run(s, [job], t);
    assert.equal(r.mail, null, `quiet at +${(t - T0) / 60_000} min`);
    s = r.state;
  }
  r = run(s, [job], T0 + 10 * 60_000 + 24 * H);
  assert.equal(r.mail.issues[0].again, true, 'a day later: 還沒好');
});

test('alerts: a stopped proxy goes at once, even at night and past the day’s mails', () => {
  const stop = { id: 'guard:stopped', group: 'fast', tone: 'bad', now: true, title: '代理已停' };
  const night = Date.parse('2026-11-16T18:00:00Z'); // 02:00 Taiwan
  const r = run({ day: '2026-11-17', n: DAY_MAX, last: night - 60_000 }, [stop], night);
  assert.deepEqual(r.mail.issues.map(i => i.id), ['guard:stopped']);
});

test('alerts: night waits for 7 AM (unless quiet is off); at most DAY_MAX a day, one each 30 minutes', () => {
  const night = Date.parse('2026-11-16T18:00:00Z');
  let r = run(null, [job], night);
  r = run(r.state, [job], night + 10 * 60_000);
  assert.equal(r.mail, null, 'held at 02:10');
  assert.ok(run(r.state, [job], night + 20 * 60_000, ['fast'], { quiet: false }).mail, 'quiet off: sent');
  const morning = Date.parse('2026-11-16T23:00:00Z'); // 07:00 Taiwan
  assert.ok(run(r.state, [job], morning).mail, 'sent at 07:00');
  // The day's cap.
  assert.equal(run({ day: '2026-11-16', n: DAY_MAX, open: { [job.id]: { group: 'fast', seen: 5, sent: 0, need: 2 } } }, [job], T0).mail, null);
  // The gap.
  assert.equal(run({ day: '2026-11-16', n: 1, last: T0 - 10 * 60_000, open: { [job.id]: { group: 'fast', seen: 5, sent: 0, need: 2 } } }, [job], T0).mail, null);
});

test('alerts: amber turned red is mailed again; what was mailed and is gone is said fixed, then all clear', () => {
  const warn = { id: 'ai-money:anthropic', group: 'slow', tone: 'warn', mail: true, title: 'Claude 剩 22%' };
  let r = run(null, [warn], T0, ['slow']);
  let s = send(r, T0);
  r = run(s, [{ ...warn, tone: 'bad', title: 'Claude 剩 8%' }], T0 + H, ['slow']);
  assert.equal(r.mail.issues[0].tone, 'bad');
  assert.equal(r.mail.issues[0].again, false);
  s = send(r, T0 + H);
  // Gone twice (only counted when its check ran): fixed, alone → all clear.
  r = run(s, [], T0 + 2 * H, ['fast']);
  assert.equal(r.mail, null, 'its check didn’t run: not gone');
  r = run(r.state, [], T0 + 3 * H, ['slow']);
  assert.equal(r.mail, null, 'gone once');
  r = run(r.state, [], T0 + 4 * H, ['slow']);
  assert.deepEqual(r.mail, { issues: [], fixed: [{ id: 'ai-money:anthropic', title: 'Claude 剩 8%' }] });
  s = send(r, T0 + 4 * H);
  assert.equal(run(s, [], T0 + 5 * H, ['slow']).mail, null, 'said once');
});

test('alerts: a failed send waits 6 hours before trying again', () => {
  let r = run(null, [job], T0);
  r = run(r.state, [job], T0 + 10 * 60_000);
  const s = settle(r.state, r.mail, false, T0 + 10 * 60_000);
  assert.equal(run(s, [job], T0 + 3 * H).mail, null);
  assert.ok(run(s, [job], T0 + 6.5 * H).mail);
});

test('alerts: the half-hour checks run at :00 and :30, the slow at 00/06/12/18 UTC', () => {
  assert.deepEqual(groupsAt(Date.parse('2026-11-16T06:00:00Z')), ['fast', 'mid', 'slow']);
  assert.deepEqual(groupsAt(Date.parse('2026-11-16T07:30:00Z')), ['fast', 'mid']);
  assert.deepEqual(groupsAt(Date.parse('2026-11-16T07:40:00Z')), ['fast']);
});

test('mail: addresses from what was typed, each once; a bad one refused', () => {
  assert.deepEqual(addressesOf('A@x.com, b@y.tw\nJay <c@z.org>；a@x.com'), ['a@x.com', 'b@y.tw', 'c@z.org']);
  assert.equal(isAddress('a@b'), false);
  assert.equal(isAddress('a b@c.com'), false);
  assert.equal(isAddress('a@b.co'), true);
});

test('mail: Resend first, to anyone; Cloudflare (verified addresses) when Resend fails or its free day is spent', async () => {
  const kept = {};
  const kv = { get: async k => kept[k] ?? null, put: async (k, v) => void (kept[k] = v) };
  const cf = { send: async m => (m.to === 'me@x.com' ? { messageId: 'cf1' } : Promise.reject(Object.assign(new Error('nope'), { code: 'E_RECIPIENT_NOT_ALLOWED' }))) };
  const m = { subject: 's', html: '<p>h</p>', text: 't' };
  let asked = null;
  const ok = async (url, o) => ((asked = JSON.parse(o.body)), new Response(JSON.stringify({ id: 'rs1' }), { status: 200 }));
  const down = async () => new Response(JSON.stringify({ message: 'down' }), { status: 500 });
  const env = { MAIL: cf, RATE_LIMIT_KV: kv, RESEND_API_KEY: 'k' };
  assert.deepEqual(await sendMail(env, { to: 'you@x.com', ...m, replyTo: 'me@x.com' }, { fetchImpl: ok }), { via: 'resend', id: 'rs1' });
  assert.deepEqual(asked.to, ['you@x.com']);
  assert.equal(asked.reply_to, 'me@x.com');
  assert.match(asked.from, /@jaypengx\.com>$/);
  assert.deepEqual(await sendMail(env, { to: 'me@x.com', ...m }, { fetchImpl: down }), { via: 'cloudflare', id: 'cf1' });
  await assert.rejects(sendMail(env, { to: 'you@x.com', ...m }, { fetchImpl: down }), e => /Resend：down/.test(e.why) && /驗證/.test(e.why));
  await assert.rejects(sendMail({ MAIL: cf, RATE_LIMIT_KV: kv }, { to: 'you@x.com', ...m }), e => e.needsResend);
});

test('looks: words are escaped, points and paragraphs kept, a link only for https', () => {
  assert.deepEqual(blocksOf('a\nb\n\n- x\n- y\nc'), [{ p: ['a', 'b'] }, { list: ['x', 'y'] }, { p: ['c'] }]);
  const m = mailRender({ look: 'announce', subject: 'S', headline: '<b>H</b>', body: 'go **now** https://orbit.jaypengx.com/app/ <script>', button: 'Open', link: 'javascript:alert(1)' });
  assert.doesNotMatch(m.html, /<script>|<b>H<\/b>|javascript:/);
  assert.match(m.html, /<strong>now<\/strong>/);
  assert.match(m.html, /href="https:\/\/orbit\.jaypengx\.com\/app\/"/);
  assert.match(m.text, /^<b>H<\/b>\n/);
  for (const k of Object.keys(MAIL_LOOKS)) for (const lang of ['zh', 'en']) assert.ok(mailRender({ look: k, lang, ...MAIL_LOOKS[k].sample[lang] }).html.includes('</html>'), `${k} ${lang}`);
  assert.match(alertMail({ issues: [{ tone: 'bad', title: 'A' }, { tone: 'warn', title: 'B' }, { tone: 'warn', title: 'C' }] }).subject, /A、B 等 3 項/);
});
