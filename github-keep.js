// ---- github-keep.js: the family's GitHub schedules kept running with nobody committing ----
// GitHub turns a public repo's scheduled workflows off after 60 days with no
// commit: Law's data, rulings and 代表會 recordings, Sports' site data, the
// Showcase's demos, 專注飛行's flight pool, the bus packs and the free plans'
// watch would all stop (Jay 11-17: "ultra stable", and nobody commits after
// 11-18). The proxy's cron (worker.js, :12 every hour) visits one of the
// family's repos in turn, each about every 12 hours: a workflow GitHub turned
// off for that is turned on again at once; the rest are turned on again once
// a week, which starts their 60 days over. One turned off by hand stays off.
// GitHub sends GH_ACTIONS_TOKEN's end date with each answer: kept here, and
// mailed 21 days ahead (mail-alerts.js). A new token: GitHub › Settings ›
// Developer settings › Fine-grained tokens, Actions read and write on the
// family's repos, typed into the proxy Worker as GH_ACTIONS_TOKEN.
import { BRANDS } from './kit/brand.mjs';
import { keptRead, keptPut } from './kept-store.js';

export const GH_OWNER = 'JayPengX';
export const GH_REPOS = ['Orbit-Core', ...Object.values(BRANDS).map(b => b.repo), 'Orbit-Showcase'];
export const GH_KEEP = 'gh:keep';
const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;

// The repo this hour visits.
export const repoAt = now => GH_REPOS[Math.floor(now / HOUR) % GH_REPOS.length];
// GitHub's `github-authentication-token-expiration` ("2027-03-01 12:00:00 UTC") as ms, or null.
export function tokenEnd(header) {
  const m = /(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(String(header || ''));
  return m ? Date.parse(`${m[1]}T${m[2]}Z`) || null : null;
}

export async function keepWorkflows(env, now = Date.now(), fetchImpl = fetch) {
  if (!env?.GH_ACTIONS_TOKEN) return { off: 'no token' };
  const repo = repoAt(now);
  const gh = (path, method = 'GET') =>
    fetchImpl(`https://api.github.com/repos/${GH_OWNER}/${repo}/actions/workflows${path}`, {
      method,
      headers: { Authorization: `Bearer ${env.GH_ACTIONS_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'orbit-keep' },
      signal: AbortSignal.timeout(10_000)
    });
  const was = (await keptRead(env, GH_KEEP).catch(() => null)) || {};
  const res = await gh('?per_page=100');
  const ends = tokenEnd(res.headers.get('github-authentication-token-expiration'));
  const save = extra => keptPut(env, GH_KEEP, { ...was, at: now, tokenEnds: ends ?? was.tokenEnds ?? null, ...extra }, 400 * 86_400).catch(() => {});
  if (!res.ok) {
    // (401: the token ended or was revoked; 403/404: it can't reach this repo.)
    await save({ bad: { repo, status: res.status, at: now } });
    return { repo, failed: `HTTP ${res.status}` };
  }
  const flows = (await res.json())?.workflows || [];
  const name = w => String(w.path || w.name).split('/').pop();
  const weekly = now - (was.repos?.[repo] || 0) >= WEEK;
  const revive = flows.filter(w => w.state === 'disabled_inactivity');
  const refresh = weekly ? flows.filter(w => w.state === 'active') : [];
  const failed = [];
  for (const w of [...revive, ...refresh]) {
    const r = await gh(`/${w.id}/enable`, 'PUT');
    if (!r.ok) failed.push(`${name(w)}: HTTP ${r.status}`);
  }
  await save({
    bad: null,
    repos: { ...was.repos, ...(weekly && !failed.length ? { [repo]: now } : {}) },
    ...(revive.length ? { revived: { repo, at: now, flows: revive.map(name) } } : {})
  });
  return { repo, ...(revive.length ? { revived: revive.map(name) } : {}), ...(refresh.length ? { refreshed: refresh.length } : {}), ...(failed.length ? { failed } : {}) };
}

// What the owner should hear (mail-alerts.js): the token failing or ending within 21 days.
export function keepIssues(state, now = Date.now()) {
  if (!state) return [];
  const out = [];
  if (state.bad?.status === 401) out.push({ id: 'gh:token', tone: 'bad', mail: true, title: 'GitHub 的金鑰失效了', detail: 'GH_ACTIONS_TOKEN 不能用了：法律資料、Sports、Showcase 等 GitHub 排程停了之後沒辦法自動打開。到 GitHub › Settings › Developer settings 做一把新的（Actions 讀寫），放進代理 Worker。', go: 'health' });
  const days = state.tokenEnds ? Math.floor((state.tokenEnds - now) / 86_400_000) : null;
  if (days != null && days < 21 && state.bad?.status !== 401) out.push({ id: 'gh:token-ends', tone: days < 7 ? 'bad' : 'warn', mail: true, title: days < 0 ? 'GitHub 的金鑰已經到期' : `GitHub 的金鑰 ${days} 天後到期`, detail: '到期後 GitHub 的排程（法律資料、Sports、Showcase…）停了就沒辦法自動打開。到 GitHub › Settings › Developer settings 換一把新的 GH_ACTIONS_TOKEN（Actions 讀寫），放進代理 Worker。', go: 'health' });
  return out;
}
