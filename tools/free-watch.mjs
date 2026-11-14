// The free plans' watch (free-watch.yml, every 3 hours; by hand any time):
// everything Orbit runs on, as a phone reaches it, and every allowance
// against its free amount. From 2026-11-13 Orbit pays only for its domain:
// Cloudflare's Free plan (Workers, KV, D1, R2, Durable Objects: the guard's
// shares of a day), Google's free months (the proxy's caps) and TDX's free
// points. The run fails, and GitHub mails the owner, when a page or a route
// doesn't answer, a cron job keeps failing, or an allowance passes WARN.
//   node tools/free-watch.mjs            (DATA_PUSH_SECRET: the cron jobs' health too)
const DOMAIN = 'jaypengx.com';
const SITE = `https://orbit.${DOMAIN}`;
const API = `https://api.${DOMAIN}`;
export const WARN = 0.75;
const SLUGS = ['sports', 'transit', 'weather', 'class', 'money', 'news', 'words', 'beats', 'law', 'securities', 'pass'];

const problems = [];
const notes = [];
const bad = s => problems.push(s);

async function get(url, { origin = false, json = false, secret = '' } = {}) {
  const headers = { 'User-Agent': 'Orbit free-watch (GitHub Actions)' };
  if (origin) headers.Origin = SITE;
  if (secret) headers.Authorization = `Bearer ${secret}`;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(25_000), method: secret ? 'POST' : 'GET' });
      const text = await r.text();
      if (!r.ok) {
        if (i) return { status: r.status, text };
        continue;
      }
      return { status: r.status, text, body: json ? JSON.parse(text) : null };
    } catch (e) {
      if (i) return { status: 0, text: e.message };
    }
  }
}

// Pages and routes, as a phone asks them.
async function smoke() {
  const checks = [
    ...SLUGS.map(s => [`${SITE}/${s}/`, `${s} page`]),
    [`https://${DOMAIN}/showcase/`, 'showcase page'],
    [`${SITE}/Orbit-Core/kit/version.json`, 'kit', { json: true }],
    [`${API}/config`, '/config', { json: true }],
    [`${API}/data/sports/bounds.json`, '/data (sports)', { json: true }],
    [`${API}/data/news/index.json`, '/data (news)', { json: true }],
    [`${API}/data/where.json`, '/data (transit)', { json: true }],
    [`${API}/sports-today?day=${new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)}`, '/sports-today', { origin: true, json: true }],
    [`${API}/law-live`, '/law-live', { origin: true, json: true }],
    [`${API}/transit/status?google=1`, '/transit/status', { json: true }],
    [`${SITE}/law/data/index.json`, 'Law data', { json: true }],
    [`${SITE}/law/data/_packs.json`, 'Law data packs', { json: true }]
  ];
  const got = await Promise.all(checks.map(([url, , o]) => get(url, o).catch(e => ({ status: 0, text: e.message }))));
  checks.forEach(([url, name], i) => {
    const r = got[i];
    if (!r || r.status < 200 || r.status >= 300) bad(`${name}: ${r?.status || 'no answer'} ${String(r?.text || '').slice(0, 160)} (${url})`);
  });
  return got;
}

// The guard's shares of today's free amounts (guard.js FREE_PLAN), as it last read the bill.
async function allowances(transitStatus) {
  const g = await get(`${API}/guard`, { json: true });
  if (!g?.body) return bad(`guard: no answer (${g?.status})`);
  const s = g.body;
  if (s.error) bad(`guard: ${s.error}`);
  if (s.stopped) bad(`guard: the proxy is stopped (${JSON.stringify(s.stopped).slice(0, 120)})`);
  // (The guard reads the bill each 5 minutes and keeps it hourly when nothing changed: KV's 1,000 writes a day.)
  if (Date.now() - (s.at || 0) > 75 * 60_000) bad(`guard: last read the bill ${Math.round((Date.now() - (s.at || 0)) / 60_000)} min ago`);
  const shares = Object.entries(s.share || {}).sort((a, b) => b[1] - a[1]);
  // (A share of the day so far: projected to the day's end from how much of it has passed.)
  const day = s.period ? Math.min(1, Math.max(0.05, ((s.at || Date.now()) - s.period.start) / (s.period.end - s.period.start))) : 1;
  for (const [k, v] of shares) {
    const end = v / day;
    if (v >= WARN) bad(`Cloudflare ${k}: ${Math.round(v * 100)}% of today's free amount used`);
    else if (end >= 1) bad(`Cloudflare ${k}: ${Math.round(v * 100)}% used, heading for ${Math.round(end * 100)}% by the day's end`);
  }
  notes.push(`Cloudflare (today so far): ${shares.slice(0, 6).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(', ')}`);
  // Google's free months, by the proxy's own caps (90% of each), and TDX's points.
  const t = transitStatus?.body;
  if (t?.used && t?.caps) {
    const rows = Object.entries(t.caps).map(([k, cap]) => [k, (t.used[k] || 0) / cap]).sort((a, b) => b[1] - a[1]);
    // (Translation's characters and Weather's calls, each against its own cap under the free month.)
    for (const [k, g] of Object.entries(t.google || {})) if (g?.cap) rows.push([k, (g.used || 0) / g.cap]);
    if (t.google?.error) bad(`Google counts: ${t.google.error}`);
    rows.sort((a, b) => b[1] - a[1]);
    for (const [k, v] of rows) if (v >= WARN) bad(`Google ${k}: ${Math.round(v * 100)}% of this month's cap`);
    notes.push(`Google (this month, of each cap under the free amount): ${rows.slice(0, 6).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', ')}`);
  }
}

// The cron jobs (ops.js beats): one failing again and again, with why (R2 switched off, a source gone…).
async function beats() {
  const secret = process.env.DATA_PUSH_SECRET;
  if (!secret) return notes.push('cron jobs: not checked (no DATA_PUSH_SECRET)');
  const r = await get(`https://orbit-workers-proxy.pengzjay.workers.dev/ops?check=system`, { json: true, secret });
  if (!r?.body) return bad(`ops system: ${r?.status} ${String(r?.text || '').slice(0, 120)}`);
  const failing = (r.body.beats || []).filter(b => !b.ok && (b.fails || 0) >= 3);
  for (const b of failing) bad(`cron ${b.job}: failed ${b.fails} times in a row; last good ${b.okAt ? new Date(b.okAt).toISOString() : 'never'}: ${String(b.note || '').slice(0, 200)}`);
  notes.push(`cron jobs: ${(r.body.beats || []).length} watched, ${failing.length} failing`);
}

const got = await smoke();
await allowances(got.find(r => r?.body?.caps));
await beats();

const out = [`# Orbit on the free plans: ${problems.length ? `${problems.length} problem${problems.length > 1 ? 's' : ''}` : 'all well'}`, '', ...problems.map(p => `- ❌ ${p}`), ...(problems.length ? [''] : []), ...notes.map(n => `- ${n}`)].join('\n');
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) (await import('node:fs')).appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + '\n');
process.exit(problems.length ? 1 : 0);
