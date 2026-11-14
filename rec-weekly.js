// 除錯紀錄週報 (the AI plan's admin row): the week's bug reports grouped and
// explained for the owner, Mondays, in the admin panel's 健康.
//
//   A phone sends its 除錯紀錄 only when its person taps 傳給 Orbit (the Pass
//   sheet; eco.js op 'bug'): what went wrong (errors, slow or failed reads,
//   network, updates), never the pass or a token (the kit leaves them out),
//   kept in R2 `private/bugs/<day>/<who>-<at>.json` (never served).
//   Monday (Taiwan), builders/ai.js runs `weekly`: code groups the week's
//   reports by app and what went wrong (the same message once, counted),
//   with the proxy's 5xx by route; one Haiku call (`rec-weekly`, Luna next)
//   names each group in plain words and says what it likely means. Kept in
//   `private/ai/rec-weekly.json`; the admin panel reads it (eco-admin.js `bugs`).
// Code first (Jay 11-10): the groups, counts and devices are code's; the AI
// writes only each group's title and one line, for a group code made.

const KEEP_KINDS = new Set(['error', 'slow', 'proxy-fail', 'net', 'update', 'reboot']);
// (Grouped: what broke. Network, updates and restarts ride along as context only.)
const GROUP_KINDS = new Set(['error', 'slow', 'proxy-fail']);
const MAX_ENTRIES = 300;
const MAX_ENTRY = 2000;
const MAX_REPORT = 200_000;
export const REC_PREFIX = 'private/bugs/';
export const REC_WEEKLY = 'private/ai/rec-weekly.json';
const DAY = 86_400_000;
const twDay = now => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
// An entry's data, cut to size (as JSON; a long one kept as its start).
function small(data) {
  let t = '';
  try {
    t = JSON.stringify(data ?? null);
  } catch {
    return null;
  }
  if (t.length <= MAX_ENTRY) return JSON.parse(t);
  return { cut: t.slice(0, MAX_ENTRY) };
}

// A report as a phone sends it (the kit's recDump), made safe: what went
// wrong only (no screens or app details), 300 entries at most, 200 KB.
export function cleanReport(x, now = Date.now()) {
  if (!x || typeof x !== 'object') return null;
  const app = s(x.app, 12);
  if (!/^[a-z]{2,12}$/.test(app)) return null;
  const pick = e => (e && typeof e === 'object' && KEEP_KINDS.has(e.kind) && Number.isFinite(e.at) ? { at: e.at, kind: e.kind, data: small(e.data) } : null);
  const log = (Array.isArray(x.log) ? x.log : []).map(pick).filter(Boolean).slice(-MAX_ENTRIES);
  const last = Object.values(x.last && typeof x.last === 'object' ? x.last : {}).map(pick).filter(Boolean);
  const out = { app, sent: now, kit: s(x.kit, 40), ua: s(x.ua, 300), installed: x.installed === true, screen: s(x.screen, 30), log: [...last, ...log] };
  while (JSON.stringify(out).length > MAX_REPORT && out.log.length) out.log.splice(0, Math.ceil(out.log.length / 10));
  return out;
}

// The device a report came from, in a word: iPhone iOS 26, iPad, Mac, Android…
export function deviceOf(ua = '') {
  const ios = /OS (\d+)[_.]\d/.exec(ua)?.[1];
  if (/iPhone/.test(ua)) return `iPhone${ios ? ` iOS ${ios}` : ''}`;
  if (/iPad/.test(ua)) return `iPad${ios ? ` iOS ${ios}` : ''}`;
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  return '其他';
}

// What went wrong, as one line code can group by (numbers, ids and addresses' queries gone).
const norm = t =>
  String(t || '')
    .replace(/\?.*$/, '')
    .replace(/[0-9a-f]{8,}/gi, '#')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
function whatOf(e) {
  const d = e.data || {};
  if (e.kind === 'error') return { key: norm(d.message), sample: s(d.message, 200), where: s(d.at, 120) || s(String(d.stack || '').split('\n')[1] || '', 120).trim() };
  if (e.kind === 'slow') return { key: norm(d.route || d.url || d.path), sample: `${s(d.route || d.url || d.path, 120)} ${Number.isFinite(d.ms) ? `${Math.round(d.ms)} ms` : ''}`.trim(), where: '' };
  if (e.kind === 'proxy-fail') return { key: norm(`${d.status || ''} ${d.url || d.host || ''}`), sample: s(`${d.status || ''} ${d.url || d.host || ''}`.trim(), 200), where: '' };
  return { key: norm(JSON.stringify(d).slice(0, 160)), sample: s(JSON.stringify(d), 160), where: '' };
}

// The week's groups: [{ id, app, kind, sample, where, n, reports, devices }],
// the most reports first, then the most times; 20 at most.
export function groupReports(reports) {
  const groups = new Map();
  reports.forEach((r, ri) => {
    const device = deviceOf(r.ua);
    for (const e of r.log || []) {
      if (!GROUP_KINDS.has(e.kind)) continue;
      const w = whatOf(e);
      if (!w.key) continue;
      const k = `${r.app}|${e.kind}|${w.key}`;
      const g = groups.get(k) || { app: r.app, kind: e.kind, sample: w.sample, where: w.where, n: 0, reports: new Set(), devices: new Set(), last: 0 };
      g.n++;
      g.reports.add(ri);
      g.devices.add(device);
      g.last = Math.max(g.last, e.at);
      groups.set(k, g);
    }
  });
  return [...groups.values()]
    .sort((a, b) => b.reports.size - a.reports.size || b.n - a.n)
    .slice(0, 20)
    .map((g, i) => ({ id: `g${i + 1}`, app: g.app, kind: g.kind, sample: g.sample, where: g.where, n: g.n, reports: g.reports.size, devices: [...g.devices], last: g.last }));
}

// The proxy's 5xx in the week, by route: { '/transit': 12 } (the meter's err:<route>:<day>).
export function routeErrors(used, now) {
  const days = new Set(Array.from({ length: 7 }, (_, i) => twDay(now - i * DAY)));
  const out = {};
  for (const [k, n] of Object.entries(used || {})) {
    const m = /^err:(.+):(\d{4}-\d{2}-\d{2})$/.exec(k);
    if (m && days.has(m[2])) out[m[1]] = (out[m[1]] || 0) + n;
  }
  return out;
}

// The week a Monday (Taiwan) starts: its date.
export function weekOf(now) {
  const tw = new Date(now + 8 * 3_600_000);
  const back = (tw.getUTCDay() + 6) % 7;
  return new Date(tw.getTime() - back * DAY).toISOString().slice(0, 10);
}

// Builders/ai.js's step: once a week, from Monday morning (Taiwan); `force` by hand.
export async function runRecWeekly({ store, env, ctx, cap, now = Date.now(), aiOnce, usage = async () => ({}), force = false }) {
  const week = weekOf(now);
  const was = await store.json(REC_WEEKLY);
  if (!force && (was?.week === week || new Date(now + 8 * 3_600_000).getUTCHours() < 6)) return { kept: was?.week || null };
  // The last 7 days' reports.
  const days = Array.from({ length: 7 }, (_, i) => twDay(now - (i + 1) * DAY + (force ? DAY : 0)));
  const reports = [];
  for (const day of days) {
    for (const path of await store.list(`${REC_PREFIX}${day}/`)) {
      const r = await store.json(path).catch(() => null);
      if (r) reports.push(r);
      if (reports.length >= 200) break;
    }
  }
  const groups = groupReports(reports);
  const routes = routeErrors(await usage().catch(() => ({})), now);
  const out = { week, built: now, reports: reports.length, apps: [...new Set(reports.map(r => r.app))], devices: [...new Set(reports.map(r => deviceOf(r.ua)))], routes, groups, m: '' };
  if (groups.length || Object.keys(routes).length) {
    const r = await aiOnce(env, ctx, 'rec-weekly', { groups: groups.map(({ id, app, kind, sample, where, n, reports: rs, devices }) => ({ id, app, kind, sample, where, n, reports: rs, devices })), routes }, cap);
    if (r?.out) {
      const said = new Map((r.out.groups || []).map(g => [g.id, g]));
      for (const g of out.groups) Object.assign(g, { title: said.get(g.id)?.title || '', why: said.get(g.id)?.why || '', level: said.get(g.id)?.level || '' });
      out.summary = r.out.summary || '';
      out.m = r.model || '';
    } else out.failed = r?.error || (r ? 'no answer' : 'capped');
  }
  await store.put(REC_WEEKLY, out, { always: true });
  return { week, reports: reports.length, groups: groups.length, m: out.m, failed: out.failed };
}

// Sent 除錯紀錄 go after REC_KEEP_DAYS (the privacy policy's word; the
// nightly backup's slot). One R2 list of the days, then their files.
export const REC_KEEP_DAYS = 90;
export async function pruneReports(env, now = Date.now()) {
  if (!env?.DATA) return { off: true };
  const before = twDay(now - REC_KEEP_DAYS * DAY);
  const days = [];
  let cursor;
  do {
    const r = await env.DATA.list({ prefix: REC_PREFIX, delimiter: '/', cursor });
    for (const p of r.delimitedPrefixes || []) {
      const day = p.slice(REC_PREFIX.length, -1);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < before) days.push(p);
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  let removed = 0;
  for (const prefix of days.slice(0, 30)) {
    const r = await env.DATA.list({ prefix, limit: 1000 });
    const keys = r.objects.map(o => o.key);
    if (keys.length) await env.DATA.delete(keys);
    removed += keys.length;
  }
  return { removed };
}
