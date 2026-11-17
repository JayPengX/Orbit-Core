// GitHub's schedules kept on with nobody committing (github-keep.js): one
// repo an hour, a workflow GitHub turned off for no commits turned on again,
// the rest refreshed once a week, the token's end date kept and told 21 days ahead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepWorkflows, keepIssues, tokenEnd, repoAt, GH_REPOS, GH_KEEP } from '../github-keep.js';

const kv = () => {
  const m = new Map();
  return { get: async k => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), m };
};
const HOUR = 3_600_000;
// An hour that visits Orbit-Law.
const lawHour = GH_REPOS.indexOf('Orbit-Law') * HOUR + 1000 * GH_REPOS.length * HOUR;

function github(flows, { status = 200, ends = '2027-01-20 08:00:00 UTC' } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([init.method, url.replace('https://api.github.com/repos/JayPengX/', '')]);
    if (init.method === 'PUT') return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ workflows: flows }), { status, headers: { 'github-authentication-token-expiration': ends } });
  };
  return { calls, fetchImpl };
}

test('one repo an hour, every repo twice a day', () => {
  assert.equal(repoAt(lawHour), 'Orbit-Law');
  assert.equal(new Set(Array.from({ length: GH_REPOS.length }, (_, i) => repoAt(lawHour + i * HOUR))).size, GH_REPOS.length);
  assert.ok(GH_REPOS.length <= 12);
});

test('a workflow turned off for no commits is turned on at once; the rest once a week; one turned off by hand stays off', async () => {
  const env = { GH_ACTIONS_TOKEN: 't', RATE_LIMIT_KV: kv() };
  const flows = [
    { id: 1, path: '.github/workflows/data.yml', state: 'disabled_inactivity' },
    { id: 2, path: '.github/workflows/rulings.yml', state: 'active' },
    { id: 3, path: '.github/workflows/asr-trial.yml', state: 'disabled_manually' }
  ];
  const a = github(flows);
  const r = await keepWorkflows(env, lawHour, a.fetchImpl);
  assert.deepEqual(r, { repo: 'Orbit-Law', revived: ['data.yml'], refreshed: 1 });
  assert.deepEqual(a.calls, [['GET', 'Orbit-Law/actions/workflows?per_page=100'], ['PUT', 'Orbit-Law/actions/workflows/1/enable'], ['PUT', 'Orbit-Law/actions/workflows/2/enable']]);
  const kept = JSON.parse(env.RATE_LIMIT_KV.m.get(GH_KEEP));
  assert.equal(kept.tokenEnds, Date.parse('2027-01-20T08:00:00Z'));
  assert.equal(kept.repos['Orbit-Law'], lawHour);
  // Twelve hours on: the active ones were refreshed this week, nothing to do.
  const b = github(flows.map(f => (f.id === 1 ? { ...f, state: 'active' } : f)));
  assert.deepEqual(await keepWorkflows(env, lawHour + GH_REPOS.length * HOUR, b.fetchImpl), { repo: 'Orbit-Law' });
  assert.equal(b.calls.length, 1);
  // A week on: refreshed again.
  const c = github(flows.map(f => (f.id === 1 ? { ...f, state: 'active' } : f)));
  const week = lawHour + 14 * GH_REPOS.length * HOUR;
  assert.equal(repoAt(week), 'Orbit-Law');
  assert.deepEqual(await keepWorkflows(env, week, c.fetchImpl), { repo: 'Orbit-Law', refreshed: 2 });
});

test("the token: its end date read, a failed one kept, the owner told 21 days ahead and when it's refused", async () => {
  assert.equal(tokenEnd('2027-03-01 12:00:00 UTC'), Date.parse('2027-03-01T12:00:00Z'));
  assert.equal(tokenEnd(null), null);
  const env = { GH_ACTIONS_TOKEN: 't', RATE_LIMIT_KV: kv() };
  const r = await keepWorkflows(env, lawHour, github([], { status: 401, ends: '' }).fetchImpl);
  assert.deepEqual(r, { repo: 'Orbit-Law', failed: 'HTTP 401' });
  const kept = JSON.parse(env.RATE_LIMIT_KV.m.get(GH_KEEP));
  assert.deepEqual(keepIssues(kept, lawHour).map(i => [i.id, i.tone]), [['gh:token', 'bad']]);
  const now = Date.parse('2027-01-01T00:00:00Z');
  assert.deepEqual(keepIssues({ tokenEnds: Date.parse('2027-01-30T00:00:00Z') }, now), []);
  assert.deepEqual(keepIssues({ tokenEnds: Date.parse('2027-01-15T00:00:00Z') }, now).map(i => [i.tone, i.title]), [['warn', 'GitHub 的金鑰 14 天後到期']]);
  assert.deepEqual(keepIssues({ tokenEnds: Date.parse('2027-01-03T00:00:00Z') }, now).map(i => i.tone), ['bad']);
  assert.deepEqual(await keepWorkflows({}, lawHour), { off: 'no token' });
});
