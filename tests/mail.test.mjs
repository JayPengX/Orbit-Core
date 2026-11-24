// Mail from the domain (mail.js), the alert mails' timing (mail-alerts.js
// plan/settle: never spam, never miss) and the looks (site/admin/mail-look.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, settle, groupsAt, DAY_MAX, modelIssues, tdxIssue } from '../mail-alerts.js';
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

test('alerts: amber turned red is mailed again; what was mailed and is gone rides along with the next mail, never one of its own', () => {
  const warn = { id: 'ai-money:anthropic', group: 'slow', tone: 'warn', mail: true, title: 'Claude 剩 22%' };
  let r = run(null, [warn], T0, ['slow']);
  let s = send(r, T0);
  r = run(s, [{ ...warn, tone: 'bad', title: 'Claude 剩 8%' }], T0 + H, ['slow']);
  assert.equal(r.mail.issues[0].tone, 'bad');
  assert.equal(r.mail.issues[0].again, false);
  s = send(r, T0 + H);
  r = run(s, [], T0 + 2 * H, ['fast']);
  assert.equal(r.mail, null, 'its check didn’t run: not gone');
  r = run(r.state, [], T0 + 3 * H, ['slow']);
  r = run(r.state, [], T0 + 4 * H, ['slow']);
  assert.equal(r.mail, null, 'fixed alone: no 全部恢復正常');
  r = run(r.state, [job], T0 + 5 * H);
  r = run(r.state, [job], T0 + 5 * H + 10 * 60_000);
  assert.deepEqual(r.mail.fixed, [{ id: 'ai-money:anthropic', title: 'Claude 剩 8%' }]);
});

test('alerts: a problem back again before its mending was told is mailed as the problem alone, never as mended beside it', () => {
  // (An AI cap reached two days running: its count starts again at midnight, so it is "gone" until reached again.)
  const cap = { id: 'ai-cap:lawAsk', group: 'mid', tone: 'warn', mail: true, title: 'AI「問法律」今天的上限用完了' };
  let r = run(null, [cap], T0, ['mid']);
  const s = send(r, T0);
  r = run(s, [], T0 + 14 * H, ['mid']);
  r = run(r.state, [], T0 + 14.5 * H, ['mid']);
  assert.deepEqual(r.state.fixed.map(f => f.id), ['ai-cap:lawAsk'], 'midnight: gone, its mending waits for the next mail');
  r = run(r.state, [cap], T0 + 26 * H, ['mid']);
  assert.deepEqual(r.mail.issues.map(i => [i.id, i.again]), [['ai-cap:lawAsk', false]], 'reached again the next day: told');
  assert.deepEqual(r.mail.fixed, [], 'and not said to be mended in the same mail');
});

test('alerts: an outside source is mailed only broken 6 hours straight, its mending never (Jay 11-16)', () => {
  const src = { id: 'src:thb', group: 'mid', tone: 'bad', confirm: 12, quiet: true, title: '公路局 壞了' };
  let s = null;
  // Broken an hour, fine half an hour, broken again: never 6 hours in a row.
  for (let k = 0; k < 24; k++) {
    const r = run(s, k % 4 === 3 ? [] : [src], T0 + k * 30 * 60_000, ['mid']);
    assert.equal(r.mail, null, `flapping, tick ${k}`);
    s = r.state;
  }
  s = null;
  let r;
  for (let k = 0; k < 12; k++) r = run(s, [src], T0 + k * 30 * 60_000, ['mid']), (s = r.state);
  assert.deepEqual(r.mail.issues.map(i => i.id), ['src:thb'], '6 hours straight: mailed');
  s = send(r, T0 + 6 * H);
  r = run(s, [], T0 + 7 * H, ['mid']);
  r = run(r.state, [], T0 + 7.5 * H, ['mid']);
  r = run(r.state, [job], T0 + 8 * H);
  r = run(r.state, [job], T0 + 8 * H + 10 * 60_000);
  assert.deepEqual(r.mail.fixed, [], 'its mending never said');
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

test('red means people feel it: a forecast is amber, a phone leaving early is no error, a job with no known rhythm is never late', async () => {
  const { paceTone, isLate, errTone, routeTone } = await import('../site/admin/ops-watch.mjs');
  // 2026-11-14: the forecast 99.5%, 44% really used: amber, not red.
  assert.equal(paceTone({ paceTop: 0.9954, share: { doDuration: 0.439, requests: 0.3 } }), 'warn');
  assert.equal(paceTone({ paceTop: 0.5, share: { doDuration: 0.82 } }), 'bad');
  assert.equal(paceTone({ paceTop: 0.4, share: { requests: 0.2 } }), '');
  assert.equal(paceTone({ paceTop: 0.4, share: {}, stopped: { at: 1 } }), 'bad');
  const now = Date.parse('2026-11-14T11:00:00Z');
  assert.equal(isLate({ job: 'build:buses', at: now - 4 * 86_400_000 }, now), false);
  assert.equal(isLate({ job: 'kept-sweep', at: now - 5 * 3_600_000 }, now), false);
  assert.equal(isLate({ job: 'notices', at: now - 20 * 60_000 }, now), true);
  assert.equal(errTone({ requests: 1000, errors: 300, by: { clientDisconnected: 300 } }), '');
  assert.equal(errTone({ requests: 1000, errors: 60, by: { scriptThrewException: 60 } }), 'bad');
  assert.equal(routeTone({ today: 25, yesterday: 30 }), '');
  assert.equal(routeTone({ today: 25, yesterday: 5 }), 'slow');
  assert.equal(routeTone({ today: 150, yesterday: 20 }), 'bad');
});

test('alerts: a model failing every call today is told (the next maker answers meanwhile); one that answered once, or failed only a few times, is not', () => {
  const calls = [
    ...Array.from({ length: 7 }, () => ({ model: 'claude-haiku-5-5', status: 400 })),
    ...Array.from({ length: 9 }, () => ({ model: 'gpt-6-luna', status: 503 })),
    { model: 'gpt-6-luna', status: 200 },
    ...Array.from({ length: 3 }, () => ({ model: 'gemini-3.6-flash', status: 404 }))
  ];
  assert.deepEqual(modelIssues(calls).map(i => [i.id, i.tone, i.mail]), [['ai-model:claude-haiku-5-5', 'warn', true]]);
  assert.match(modelIssues(calls)[0].title, /^Claude /);
  assert.deepEqual(modelIssues(null), []);
});

// From 2026-12-01 TDX's free tier is 3 points a month, and the guard spends it to 95% by design: a mail
// every month near its end would be noise Jay can do nothing about (2026-11-18, "alerts only for what truly needs me").
test("TDX's month near its points: mailed on 銅級; on the free tier amber only, never mailed", () => {
  const nov = Date.parse('2026-11-25T04:00:00Z');
  const dec = Date.parse('2026-12-25T04:00:00Z');
  // 銅級: 170 of 200 points (advanced calls: 200 a point).
  const paid = tdxIssue({ 'tdx:a:2026-11-20': 170 * 200 }, nov);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].mail, true);
  // Free tier: 2.9 of 3 points.
  const free = tdxIssue({ 'tdx:a:2026-12-20': 2.9 * 200 }, dec);
  assert.equal(free.length, 1);
  assert.equal(free[0].tone, 'warn');
  assert.ok(!free[0].mail);
  assert.deepEqual(tdxIssue({ 'tdx:a:2026-12-20': 100 }, dec), []);
});

test("the free plans' watch never fails on GitHub: its findings reach the alert mail, a blip (one run) never, a stale report never", async () => {
  const { watchMerge, watchIssues } = await import('../mail-alerts.js');
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../tools/free-watch.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /process\.exit\(\s*problems/, 'a failed run is a GitHub mail (Jay 11-24)');
  assert.doesNotMatch(readFileSync(new URL('../.github/workflows/free-watch.yml', import.meta.url), 'utf8'), /schedule:/, 'started by the proxy only');
  const t = Date.parse('2026-11-24T04:00:00Z');
  const one = watchMerge(null, ['sports page: 502 bad gateway (https://…)'], t);
  assert.deepEqual(watchIssues(one, t + 60_000), []);
  const two = watchMerge(one, ['sports page: 503 (https://…)', 'vault: 1 account(s) still plain'], t + 3 * 3_600_000);
  const issues = watchIssues(two, t + 3 * 3_600_000);
  assert.deepEqual(issues.map(i => [i.id, i.tone]), [['watch:sports page', 'bad']]);
  assert.deepEqual(watchIssues(two, t + 11 * 3_600_000), []);
  // Fixed: the next run's empty list drops it.
  assert.deepEqual(watchIssues(watchMerge(two, [], t + 6 * 3_600_000), t + 6 * 3_600_000), []);
});
