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
const SLUGS = ['sports', 'transit', 'weather', 'class', 'money', 'news', 'words', 'beats', 'law', 'securities', 'app'];

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
    [`${SITE}/`, 'home page'],
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
  // (GitHub's token for the schedules, github-keep.js: Jay is mailed 21 days before it ends.)
  const gh = r.body.github;
  notes.push(`GH_ACTIONS_TOKEN: ${!gh ? 'not seen yet' : gh.bad ? `refused (${gh.bad})` : gh.tokenEnds ? `ends ${new Date(gh.tokenEnds).toISOString().slice(0, 10)}` : 'no end date'}`);
}

// The AI makers' money (Jay pays for these, 11-14): each balance typed less
// the calls since, warned a week before it runs out or at a quarter left; and
// today's calls against each maker's day cap (gemini-use.js PROVIDER_DAY).
// Google's spend by our log is counted GOOGLE_BILLED times over: 11-14 its
// bill was about 25 times what its replies' own token counts came to.
export const GOOGLE_BILLED = 25;
// A low balance is a note, never a failed run (GitHub mails each one; Jay
// 11-15: "stop me from getting this email"): a maker running out only falls
// to its backup, and the admin panel shows each balance.
// Every account's data sealed (docs/PRIVACY.md); one left plain is a failed run.
async function vault() {
  const secret = process.env.DATA_PUSH_SECRET;
  if (!secret) return notes.push('vault: not checked (no DATA_PUSH_SECRET)');
  const r = await get(`https://orbit-workers-proxy.pengzjay.workers.dev/ops?check=vault&now=1`, { json: true, secret });
  if (r?.body?.accounts == null) return bad(`ops vault: ${r?.status} ${String(r?.text || '').slice(0, 120)}`);
  const { accounts, sealed, escrow, swept } = r.body;
  notes.push(`vault: ${sealed} of ${accounts} accounts sealed, ${escrow} openable by their devices${swept?.accounts ? ` (${swept.accounts} just now)` : ''}`);
  if (sealed < accounts) bad(`vault: ${accounts - sealed} account(s) still plain`);
  if (escrow < accounts) notes.push(`vault: ${accounts - escrow} account(s) waiting for a device that holds the key (op vault-escrow)`);
}
// (TRACE=1, a run by hand: each account's documents and kept versions, no content: ops trace.)
async function trace() {
  if (!process.env.TRACE || !process.env.DATA_PUSH_SECRET) return;
  const r = await get(`https://orbit-workers-proxy.pengzjay.workers.dev/ops?check=trace&hours=${process.env.TRACE}`, { json: true, secret: process.env.DATA_PUSH_SECRET });
  if (!r?.body || typeof r.body !== 'object') return console.log('trace:', r?.status, String(r?.text || '').slice(0, 200));
  for (const [ref, a] of Object.entries(r.body)) {
    console.log(`== ${ref} created ${a.created} vault ${JSON.stringify(a.vault)} settings ${a.settings.join(',')} entries ${a.entries} passkeys ${a.passkeys}`);
    console.log(`   apps ${JSON.stringify(a.apps)} live ${JSON.stringify(a.live)}`);
    for (const d of a.docs) console.log(`   now  ${d.join(' ')}`);
    for (const k of a.kept) console.log(`   kept ${k.join(' ')}`);
  }
}
// (REKEY=<account>[:go], a run by hand: ops rekey, eco.js rekeyAccount.)
async function rekey() {
  if (!process.env.REKEY || !process.env.DATA_PUSH_SECRET) return;
  // (<acct>[:plain][:go]: plain puts back the last open versions, eco.js restorePlain.)
  const [acct, ...flags] = process.env.REKEY.split(':');
  const r = await get(`https://orbit-workers-proxy.pengzjay.workers.dev/ops?check=rekey&acct=${encodeURIComponent(acct)}${flags.includes('plain') ? '&plain=1' : ''}${flags.includes('go') ? '&go=1' : ''}`, { json: true, secret: process.env.DATA_PUSH_SECRET });
  console.log('rekey', JSON.stringify(r?.body ?? r?.text));
}
async function aiMoney() {
  const secret = process.env.DATA_PUSH_SECRET;
  if (!secret) return notes.push('AI money: not checked (no DATA_PUSH_SECRET)');
  const r = await get(`https://orbit-workers-proxy.pengzjay.workers.dev/ops?check=ai-money`, { json: true, secret });
  if (!r?.body?.money) return bad(`ops ai-money: ${r?.status} ${String(r?.text || '').slice(0, 120)}`);
  const rate = r.body.rate || 32;
  const said = [];
  for (const [prov, m] of Object.entries(r.body.money)) {
    if (!m.typed) {
      said.push(`${prov} no balance typed`);
      continue;
    }
    const x = prov === 'google' ? GOOGLE_BILLED : 1;
    const left = m.typed.usd - m.spent * x, perDay = m.perDay * x;
    const days = perDay > 0 ? Math.floor(left / perDay) : null;
    said.push(`${prov} NT$${Math.round(left * rate)} left${days != null ? `, ~${days} days` : ''}`);
    if (left <= m.typed.usd * 0.25 || (days != null && days <= 7)) notes.push(`low: AI ${prov}: about NT$${Math.max(0, Math.round(left * rate))} left${days != null ? ` (about ${days} days at this week's rate)` : ''}: top it up, or it falls to its backup`);
  }
  for (const [prov, t] of Object.entries(r.body.today || {})) if (t.n != null && t.cap && t.n >= t.cap * 0.8) bad(`AI ${prov}: ${t.n} of ${t.cap} calls today (its day cap)`);
  notes.push(`AI money: ${said.join(', ')}; today ${Object.entries(r.body.today || {}).map(([p, t]) => `${p} ${t.n}/${t.cap}`).join(', ')}`);
}

// Cloudflare's tokens' end dates: the deploys' (CLOUDFLARE_API_TOKEN: every
// app's site, Law's data, the Showcase's demos) and the guard's (CF_GUARD_TOKEN).
// One ending within 21 days, or refused, fails the run (GitHub mails it); a
// token with no end date is fine for good. A new one: Cloudflare › My Profile ›
// API Tokens, the same rights, typed into GitHub (Orbit-Core › Settings › Secrets).
const TOKEN_DAYS = 21;
function tokenSay(name, verify, now = Date.now()) {
  const r = verify?.result;
  if (!verify?.success || r?.status !== 'active') return { bad: `${name}: Cloudflare refuses it (${verify?.errors?.[0]?.message || r?.status || 'no answer'}): make a new one` };
  if (!r.expires_on) return { note: `${name}: no end date` };
  const days = Math.floor((Date.parse(r.expires_on) - now) / 86_400_000);
  return days < TOKEN_DAYS ? { bad: `${name} ends in ${days} days (${r.expires_on.slice(0, 10)}): make a new one before then` } : { note: `${name}: ends ${r.expires_on.slice(0, 10)}` };
}
async function cfTokens() {
  const api = 'https://api.cloudflare.com/client/v4';
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CF_GUARD_TOKEN']) {
    const token = process.env[name];
    if (!token) continue;
    const ask = path => fetch(`${api}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }).then(r => r.json()).catch(() => null);
    // (A user's token answers here; an account's at its account's own.)
    let v = await ask('/user/tokens/verify');
    if (!v?.success) {
      const acct = (await ask('/accounts'))?.result?.[0]?.id;
      const w = acct ? await ask(`/accounts/${acct}/tokens/verify`) : null;
      // (Neither answering is no verdict: a deploy that fails says it plainly.)
      if (!w) {
        notes.push(`${name}: end date not checked (Cloudflare didn't say)`);
        continue;
      }
      v = w;
    }
    const said = tokenSay(name, v);
    if (said.bad) bad(said.bad);
    else notes.push(said.note);
  }
}

const got = await smoke();
await allowances(got.find(r => r?.body?.caps));
await beats();
await aiMoney();
await vault();
await trace();
await rekey();
await cfTokens();

const out = [`# Orbit on the free plans: ${problems.length ? `${problems.length} problem${problems.length > 1 ? 's' : ''}` : 'all well'}`, '', ...problems.map(p => `- ❌ ${p}`), ...(problems.length ? [''] : []), ...notes.map(n => `- ${n}`)].join('\n');
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) (await import('node:fs')).appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + '\n');
process.exit(problems.length ? 1 : 0);
