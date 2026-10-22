// The kit: what every app shares, Quadra's and Orbit's. It lives in
// Shared-Proxy/kit/ and is served from Shared-Proxy's GitHub Pages; every
// app loads it from there (kit/loader.html), so one push changes it for all.
//
//   Quadra Securities   stock   where money lives and grows
//   Quadra Play         odds    sports betting and the lottery
//   Orbit Class         orbit   the class schedule
//   Orbit Weather       weather one forecast, pinned places
//   Orbit Transit       transit the map, buses, trains and metros
//   Orbit Sports        match   scores, schedules and stats
//   Orbit Words         vocab   English words
//   Orbit Slips         slip    台灣運彩 tickets followed live
//   Orbit Beats         beats   beat pieces arranged into songs
//
// The names, colours and marks are brand.mjs's. The Quadra Pass (the
// account, its looks, the truth about the money, every app and its guide) is the
// sheet behind every app's account button (pass.mjs).
//
// One account works everywhere: the Quadra Pass, a 10-character code for
// Shared-Proxy's /eco. It is required: every app opens on a sign-in screen
// until the device is signed in, and the data proxy only answers signed-in
// apps. A device keeps a revocable sign-in, never the pass; another device
// signs in with the pass or a 10-minute device code. Behind the pass is one
// NT$ money pool (play money only), and the pass is the only place anything
// is saved.
//
// One app at a time: the app in use is the account's live one. Opening
// another app (or the same app on another device) makes that one live; the
// one left behind stops refreshing and shows where Quadra is open, with a
// button to continue there. Links between the apps carry the sign-in along.

import { BRANDS, FAMILIES, pathOf, appIcon, familyMark } from './brand.mjs';
import { DEV, cleanDev } from './brand.mjs';
import { icons, tile, pullToRefresh, setSheetDetent, segmented, h as node } from './ui.mjs';

export const ECO_URL = 'https://orbit-workers-proxy.pengzjay.workers.dev/eco';
export const PROXY_URL = 'https://orbit-workers-proxy.pengzjay.workers.dev/sports-proxy';

// The developer settings (devconfig.mjs, the admin panel's 設定): how often
// live data is read again, the switches. The device's copy at once, the
// Worker's read every five minutes behind it (a change reaches an open app
// within minutes, a reopened one at once).
const DEV_URL = 'https://orbit-workers-proxy.pengzjay.workers.dev/config';
const DEV_KEY = 'quadra.dev';
let devNow = (() => {
  try {
    return cleanDev(JSON.parse(localStorage.getItem(DEV_KEY) || '{}'));
  } catch {
    return cleanDev();
  }
})();
let devReadAt = 0;
export const dev = key => devNow[key] ?? DEV[key]?.def;
export function readDev() {
  if (typeof window === 'undefined' || Date.now() - devReadAt < 5 * 60_000) return;
  devReadAt = Date.now();
  fetch(DEV_URL, { signal: AbortSignal.timeout(8_000) })
    .then(r => (r.ok ? r.json() : null))
    .then(x => {
      if (!x) return;
      devNow = cleanDev(x);
      try {
        localStorage.setItem(DEV_KEY, JSON.stringify(devNow));
      } catch {}
    })
    .catch(() => {});
}
readDev();
// fn again every dev(key) seconds, the setting read at each beat (a change
// applies at the next one). Answers a stop.
// A sheet under a finger or on its way out: a live redraw then stutters
// the drag (each app's beats wait for the next one).
export const sheetHeld = () => typeof document !== 'undefined' && Boolean(document.querySelector('dialog.q-sheet.q-dragging, dialog.q-sheet.q-leaving'));
export function everyDev(key, fn) {
  let timer = 0;
  let stopped = false;
  const beat = () => {
    timer = setTimeout(() => {
      if (stopped) return;
      readDev();
      try {
        if (!sheetHeld()) fn();
      } finally {
        beat();
      }
    }, Math.max(1, dev(key)) * 1000);
  };
  beat();
  return () => ((stopped = true), clearTimeout(timer));
}
export const SITE = 'https://jaypengx.github.io';
export const BRAND = { name: 'Quadra', pass: 'Quadra Pass' };
export { BRANDS, FAMILIES, appIcon, familyMark };

// Every app, by the id it stores under. `related`: an Orbit app, outside the
// money pool.
export const APPS = Object.fromEntries(
  Object.entries(BRANDS).map(([id, b]) => [id, { name: b.name, short: b.short, family: b.family, path: pathOf(id), color: b.color, related: b.family === 'orbit', role: b.role }])
);
export const appName = app => APPS[app]?.name || app;

// ---- The economy -------------------------------------------------------------------
//
// Balanced so money matters (Shared-Proxy/tools/economy.mjs has the model):
// a new pass opens with NT$200,000; every Monday (Taiwan time) pays a fixed
// NT$10,000, the same for every account, like a salary (eco.js pays it,
// back pay for weeks nobody came). With the wealth level rewards and 急難紓困
// for someone with nothing, those are the only money Quadra gives; more is
// borrowed (信貸, loan.mjs) and repaid from the pay. Securities is where it
// grows (the market, real costs); Play and the lottery are where it goes (the
// house keeps about 14% of a single, a third of a treble, half of a draw ticket).
export const ECONOMY = {
  start: 200_000,
  weekly: PAY_WEEK
};

// What the account is worth: the pool and Securities' holdings, less what a
// loan still owes (borrowed money is nobody's worth).
export const worthOf = (wallet, now = Date.now()) => poolBalance(wallet) + finiteOr0(wallet?.snap?.stock?.holdings) - debtOf(wallet, now);
// 財富等級: what the account is worth (worthOf) puts it on a level; the
// first time it reaches one, Quadra's economy pays the level's reward once
// (eco.js RANKS, the same table: `eco:rank:<id>`; scaled 2026-10-20 to the
// NT$200,000 start, old levels' rewards counting towards the new).
export const WEALTH_RANKS = [
  { id: 'start', min: 0, reward: 0, icon: '🌱', zh: '起步', en: 'Starter' },
  { id: 'thrifty', min: 300_000, reward: 3_000, icon: '🪙', zh: '小資族', en: 'Saver' },
  { id: 'solid', min: 500_000, reward: 5_000, icon: '💼', zh: '穩健', en: 'Steady' },
  { id: 'welloff', min: 1_000_000, reward: 10_000, icon: '🏡', zh: '百萬身價', en: 'Millionaire' },
  { id: 'affluent', min: 3_000_000, reward: 20_000, icon: '💎', zh: '富裕', en: 'Wealthy' },
  { id: 'tenmil', min: 10_000_000, reward: 50_000, icon: '👑', zh: '千萬富翁', en: 'Ten-millionaire' },
  { id: 'hundredmil', min: 100_000_000, reward: 100_000, icon: '🚀', zh: '億萬大亨', en: 'Tycoon' }
];
// The levels before 2026-10-20 (their rewards stay in the statement).
const OLD_RANK_NAMES = { saver: ['小資族（舊）', 'Saver (old)'], steady: ['穩健（舊）', 'Steady (old)'], comfort: ['小康（舊）', 'Comfortable (old)'], wealthy: ['富裕（舊）', 'Wealthy (old)'], rich: ['有錢人（舊）', 'Rich (old)'], multi: ['千萬富翁（舊）', 'Multi-millionaire (old)'], tycoon: ['億萬大亨（舊）', 'Tycoon (old)'] };
const rankName = (id, i) => {
  const r = WEALTH_RANKS.find(x => x.id === id);
  return r ? (i ? r.en : r.zh) : OLD_RANK_NAMES[id]?.[i] || id;
};
// Where the money came from and went (all time, NT$): what the system gave
// (opening money, pay, level rewards, resets, VIP cashback), the government
// (govOf: relief less taxes), the account
// against Quadra (Play's settled bets less fees, loan costs and overdraft interest:
// a surplus when it has won more than it lost and paid), and its own result
// (markets, savings: worth less the other two). A bet still open is in the
// worth, as money at stake, and in neither side until it's settled.
// An account older than the shared wallet opened in the apps' own books:
// Securities' deposit (NT$100,000, or what it was opened with: it reports
// it as `snap.stock.opened`) and Play's NT$10,000 (its `odds:start` entry,
// with its weekly grants). The reset (`eco:rebase:v3`, −80,000) and its fix
// (`eco:rebase:v3fix`, for an account that had less than 110,000) brought
// that to the NT$30,000 everyone opens with: all of it is opening money.
const RESET_ID = 'eco:rebase:v3';
// 政府 (kit/gov.mjs): the same figures the admin page adds up.
import { govOf } from './gov.mjs';
import { twDay, twMonth, finiteOr0 } from './format.mjs';
export { govOf };
export function moneySides(wallet) {
  const gave = { start: 0, pay: 0, rank: 0, other: 0 };
  // Play's settled bets (payouts less stakes) and what Quadra charges (overdraft
  // interest, old fees); a bet still open is neither yet: it's money
  // at stake, still the account's.
  let play = 0;
  let fees = 0;
  let atStake = 0;
  // A loan: what came in less what went back; with what's still owed, the
  // difference is its cost (interest and fees), charged by Quadra's bank.
  let loanFlow = 0;
  const entries = wallet?.entries || [];
  const ids = new Set(entries.map(e => e.id));
  const open = e => e.kind === 'stake' && typeof e.id === 'string' && e.id.startsWith('odds:stake-') && !ids.has(`odds:payout-${e.id.slice(11)}`) && !ids.has(`odds:refund-${e.id.slice(11)}`);
  if (entries.some(e => e.id === RESET_ID) && !entries.some(e => e.id === 'eco:start')) gave.start += finiteOr0(wallet?.snap?.stock?.opened ?? 100_000);
  for (const e of entries) {
    const a = Number(e.amount) || 0;
    if (e.app === 'eco') {
      if (e.kind === 'start' || e.kind === 'grant' || e.id.startsWith(RESET_ID)) gave.start += a;
      else if (e.kind === 'pay') gave.pay += a;
      else if (e.kind === 'rank') gave.rank += a;
      // (A correction or prize from the admin page: money Quadra gave, either way.)
      else if (e.kind === 'rebase' || e.kind === 'vip' || e.kind === 'admin') gave.other += a;
      else if (e.kind === 'plus' || e.kind === 'plusrefund' || e.kind === 'od') fees -= a;
      else if (LOAN_KINDS.has(e.kind)) loanFlow += a;
    } else if (e.app === 'odds') {
      if (e.kind === 'start') gave.start += a;
      else if (e.kind === 'grant') gave.other += a;
      else if (open(e)) atStake -= a;
      else play += a;
    }
  }
  fees += debtOf(wallet) - loanFlow;
  const given = gave.start + gave.pay + gave.rank + gave.other;
  // The government's side: relief in, taxes out (govOf). Play's winnings came
  // in after tax, so Play's side counts them before it.
  const gov = govOf(wallet);
  // Against Quadra, signed: above 0 when Play has paid out more than the
  // account lost there and paid in fees (a surplus), below when Quadra kept more.
  const quadra = play + gov.paid.sports + gov.paid.lottery - fees;
  // The worth counts money at stake: it's still the account's until settled.
  const worth = worthOf(wallet) + atStake;
  return { gave, given, quadra, fees, playNet: play, atStake, took: Math.max(0, -quadra), worth, gov, own: worth - given - quadra - gov.net };
}
// The weekly pay: fixed, whatever the account holds (eco.js PAY.week).
export const paydayFor = () => ECONOMY.weekly;
// Below zero: an overdraft (1% a month, eco.js), fixed by selling something
// in Securities or borrowing on margin there.
export const OVERDRAFT_RATE = 0.01;
export const overdraft = wallet => Math.max(0, -poolBalance(wallet));

// 信貸 and 急難紓困: loan.mjs, shared with the Worker.
import { PAY_WEEK, LOAN, RELIEF, loans, activeLoan, loanOwed, payoffAmount, debtOf, credit, canBorrow, loanOffer, maxFor, dueCount, reliefCheck, openStakes, nextPayday as nextWeekPayday } from './loan.mjs';
export { LOAN, RELIEF, loans, activeLoan, loanOwed, payoffAmount, debtOf, credit, canBorrow, loanOffer, reliefCheck };
const LOAN_KINDS = new Set(['loan', 'loanfee', 'loanpay', 'loanlate', 'loanbad', 'loangar', 'loanoff']);
// Free bets and VIP: plus.mjs, shared with the Worker.
import { FREEBET, VIP, vipStakes, vipTier } from './plus.mjs';
export { FREEBET, VIP, vipStakes, vipTier };

// ---- Looks: an avatar and a frame, free for everyone ------------------------------------
//
// The account button in every app can wear an avatar (the wallet setting
// `avatar`: { id }) and a frame around it (`frame`: { id }), chosen in the
// Quadra Pass sheet (外觀). Every one is open to every account.
export const AVATARS = [
  ...[
    ['sprout', '🌱'], ['fox', '🦊'], ['panda', '🐼'], ['lion', '🦁'], ['dragon', '🐉'], ['unicorn', '🦄'], ['crown', '👑'], ['cat', '🐱'], ['dog', '🐶'], ['frog', '🐸'],
    ['penguin', '🐧'], ['rocket', '🚀'], ['rainbow', '🌈'], ['fire', '🔥'], ['gem', '💎'], ['star', '✦'], ['tiger', '🐯'], ['eagle', '🦅'], ['trophy', '🏆'], ['owl', '🦉'],
    ['octopus', '🐙'], ['whale', '🐳'], ['butterfly', '🦋'], ['cactus', '🌵'], ['sun', '🌞'], ['ball', '⚽'], ['chart', '📈'], ['wolf', '🐺'], ['shark', '🦈'], ['bolt', '⚡'],
    ['peacock', '🦚'], ['planet', '🪐'], ['drake', '🐲'], ['comet', '☄️'], ['galaxy', '🌌'], ['trident', '🔱'],
    // Taiwan's own, and more everyday faces.
    ['boba', '🧋'], ['dumpling', '🥟'], ['mango', '🥭'], ['lantern', '🏮'], ['mountain', '🏔️'], ['train', '🚄'], ['bike', '🚲'], ['baseball', '⚾'], ['basketball', '🏀'], ['koala', '🐨'],
    ['rabbit', '🐰'], ['bear', '🐻'], ['monkey', '🐵'], ['chick', '🐤'], ['turtle', '🐢'], ['dolphin', '🐬'], ['dino', '🦖'], ['guitar', '🎸'], ['headphones', '🎧'], ['game', '🎮'],
    ['camera', '📷'], ['moon', '🌙'], ['clover', '🍀'], ['cherry', '🌸'], ['coffee', '☕'], ['bull', '🐂']
  ].map(([id, glyph]) => ({ id, glyph }))
];
export const FRAMES = [
  'bronze', 'silver', 'jade', 'gold', 'neon', 'aurora', 'sakura', 'ocean', 'ember', 'mint', 'sapphire', 'ruby', 'legend', 'prism', 'mythic', 'celestial',
  'pearl', 'matcha', 'milktea', 'sunset', 'midnight', 'forest', 'candy', 'lava', 'skylantern'
].map(id => ({ id }));
const worn = (wallet, key, list) => list.find(x => x.id === setting(wallet, key, null)?.id) || null;
export const avatarOf = wallet => worn(wallet, 'avatar', AVATARS);
export const frameOf = wallet => worn(wallet, 'frame', FRAMES);

// ---- VIP: free tiers by what's played, with cashback -----------------------------------
//
// The table and a month's stakes are plus.mjs's (VIP, vipStakes, vipTier),
// one copy for the kit and the Worker that pays the cashback.
// This month so far: stakes, tier, the cashback it's heading for, the next
// tier and what's left to reach it; and last month's cashback if paid.
export function vipStatus(wallet, now = Date.now()) {
  const month = twMonth(now);
  const stakes = vipStakes(wallet, month);
  const tier = vipTier(stakes);
  const next = VIP.tiers.find(t => stakes < t.min) ?? null;
  const paid = (wallet?.entries || []).filter(e => e.app === 'eco' && e.kind === 'vip').sort((a, b) => b.t - a.t)[0] ?? null;
  return { month, stakes, tier, back: tier ? Math.floor(stakes * tier.back) : 0, next, toNext: next ? next.min - stakes : 0, paid };
}
// The tier's name alone (a medal emoji before it read as clip art, the owner 2026-10-18).
export const vipName = (tier, lang = 'zh') => (tier ? (lang === 'en' ? tier.en : tier.zh) : '');

// ---- Language ------------------------------------------------------------------------

export function detectLang() {
  try {
    const saved = localStorage.getItem('quadra.lang');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {}
  const langs = globalThis.navigator?.languages || [globalThis.navigator?.language || 'zh-TW'];
  return langs.some(l => /^zh/i.test(l)) || !langs.some(l => /^en/i.test(l)) ? 'zh' : 'en';
}
export const pick = (lang, zh, en) => (lang === 'en' ? en : zh);

// ---- Codes ---------------------------------------------------------------------------

export const PASS_PATTERN = /^[2-9A-HJ-NP-Z]{10}$/;
export const DEVICE_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{8}$/;
export function cleanCode(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[\s-]/g, '');
}
export const formatPass = code => (code && code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code && code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code || '');

// ---- Storage -------------------------------------------------------------------------
//
// A device keeps its refresh token (a revocable sign-in for this device) and
// the account's id, never the pass itself: the pass is typed to sign in,
// shown once when it's made, and that's all.

// Keyboard or touch: the focus ring shows only after a key that moves focus
// (quadra.css), never for focus a tap or the code put somewhere.
if (typeof document !== 'undefined') {
  const root = document.documentElement;
  document.addEventListener('keydown', e => ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && root.setAttribute('data-q-keys', ''), true);
  document.addEventListener('pointerdown', () => root.removeAttribute('data-q-keys'), true);
}

const KEY = { refresh: 'quadra.refresh', account: 'quadra.account', wallet: 'quadra.wallet', aff: 'quadra.aff', dismiss: 'quadra.dismiss' };
// This device's localStorage, never throwing (a private window, storage
// full or blocked): a string, or a value as JSON (`fallback` when there's
// none or it can't be read); null (or undefined) removes the key.
export function readStore(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStore(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}
export const readJson = (key, fallback) => {
  try {
    return JSON.parse(readStore(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
};
export const writeJson = (key, value, replacer) => {
  try {
    writeStore(key, value == null ? null : JSON.stringify(value, replacer));
  } catch {}
};

// The signed-in account's id on this device (the first 16 characters of
// the pass's hash, from the refresh token), '' when signed out.
export function storedAccount() {
  const id = readStore(KEY.account) || '';
  return /^[0-9a-f]{16}$/.test(id) && readStore(KEY.refresh) ? id : '';
}
function accountOf(refresh) {
  try {
    const body = String(refresh).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(body + '==='.slice((body.length + 3) % 4))).d.slice(0, 16);
  } catch {
    return '';
  }
}
export function cachedWallet(account = storedAccount()) {
  const saved = readJson(KEY.wallet, null);
  return saved && account && saved.account === account ? saved.wallet : null;
}
function cacheWallet(account, wallet) {
  if (account && wallet) writeStore(KEY.wallet, JSON.stringify({ account, wallet }));
}
// The app's own data as last read or written on this device (under the
// account), so a cold start paints at once, before the Worker answers.
// Only small ones (Securities keeps its own compressed copy).
const payloadKey = app => `quadra.payload.${app}`;
export function cachedPayload(app, account = storedAccount()) {
  const saved = readJson(payloadKey(app), null);
  return saved && account && saved.account === account ? saved.payload : null;
}
function cachePayload(app, account, payload) {
  if (!account || typeof payload !== 'string') return;
  writeStore(payloadKey(app), payload.length < 200_000 ? JSON.stringify({ account, payload }) : null);
}

// ---- The Worker ----------------------------------------------------------------------

// (JSON sent as plain text, and saves as a POST: a request the browser sends
// at once, where a JSON content type, a PATCH or a DELETE is asked about
// first, a second request and a round trip before every save.)
//
// A weak connection: a request that gets no answer in time (or is lost on the
// way) is sent again once, on a fresh connection, a moment later, instead of
// one wait of 25 s that left the app on "—" (a save on weak 4G hung for
// minutes). Each try has 10 s plus a second for every 20 KB it sends (a big
// save on a slow upload still gets there). Every call can be sent twice: the
// Worker's entries have fixed ids and a write sets the whole payload.
// Without a connection at all it isn't tried (the app's next sync sends it).
export const callWait = bytes => 10_000 + Math.round(bytes / 20);
export const CALL_RETRY_MS = 1_500;
async function call(method, query = '', body) {
  const text = body ? JSON.stringify(body) : undefined;
  if (globalThis.navigator?.onLine === false) throw Object.assign(new Error('offline'), { code: 'OFFLINE' });
  let res;
  for (let tries = 0; ; tries++) {
    try {
      res = await fetch(`${ECO_URL}${query}`, {
        method,
        headers: body ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {},
        body: text,
        signal: AbortSignal.timeout(callWait(text?.length || 0))
      });
      break;
    } catch (error) {
      if (tries >= 1 || globalThis.navigator?.onLine === false) throw error;
      await new Promise(done => setTimeout(done, CALL_RETRY_MS));
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error?.message || `HTTP ${res.status}`);
    error.code = data?.error?.code || `HTTP_${res.status}`;
    error.status = res.status;
    error.live = data?.live || null;
    if (data?.error?.index != null) error.index = data.error.index;
    for (const k of ['why', 'max', 'until', 'need']) if (data?.error?.[k] != null) error[k] = data.error[k];
    throw error;
  }
  return data;
}
const qs = params => `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString()}`;

export function randomId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ---- Data through the proxy: batched, remembered, shared ------------------------------
//
// proxyJson(url, { ttl, trim, persist }) is how every app reads outside data
// (ESPN, Kambi, Yahoo…) through the data proxy:
//
//   - the same URL asked twice within `ttl` is answered from memory;
//   - with `persist` (the default), the answer is also kept on the device
//     (Cache Storage), so it survives closing the app: a copy younger than
//     `ttl` is used without asking the proxy at all, and peekJson(url) gives
//     the last copy of any age for painting at once while a fresh one loads;
//   - requests made within a few milliseconds of each other go to the proxy
//     as one batch (`?batch=1&u=…`, up to 24): the Worker plan bills per
//     request, and a first paint asks for about 28 lists at once. A batch
//     that fails is asked again one by one.
//
// The session token comes from the app's quadraSession (the last one made).
let dataSession = null;
const DATA_CACHE = 'quadra-data-v1';
const DATA_KEEP_MS = 4 * 86_400_000;
const memory = new Map();
const dataKey = (url, trim) => `https://quadra.data/${trim ? `${trim}!` : ''}${encodeURIComponent(url)}`;
const hasCaches = () => typeof caches !== 'undefined' && typeof Response !== 'undefined';
async function persisted(key) {
  if (!hasCaches()) return null;
  try {
    const cache = await caches.open(DATA_CACHE);
    const hit = await cache.match(key);
    if (!hit) return null;
    return { at: Number(hit.headers.get('x-at')) || 0, data: await hit.json() };
  } catch {
    return null;
  }
}
async function persist(key, text) {
  if (!hasCaches()) return;
  try {
    const cache = await caches.open(DATA_CACHE);
    await cache.put(key, new Response(text, { headers: { 'content-type': 'application/json', 'x-at': String(Date.now()) } }));
    prune();
  } catch {}
}
// The copies are written when the page is idle, a few at a time (the
// newest of each key; one a turn where there's no idle time, as Safari),
// not in a block in the middle of a tab tap: a full board's
// hundreds of answers kept at once were a quarter second of a phone's time.
const keeping = new Map();
let keepTimer = 0;
function keepLater(key, got) {
  keeping.set(key, got);
  if (keepTimer) return;
  const idle = globalThis.requestIdleCallback ? f => globalThis.requestIdleCallback(f, { timeout: 4000 }) : f => setTimeout(() => f(null), 0);
  const run = deadline => {
    for (const [k, v] of keeping) {
      keeping.delete(k);
      persist(k, typeof v === 'string' ? v : JSON.stringify(v));
      if (!deadline || deadline.timeRemaining() < 4) break;
    }
    keepTimer = keeping.size ? idle(run) || 1 : 0;
  };
  keepTimer = idle(run) || 1;
}
// Now and then (every 6 hours on this device, while it's idle), what's
// older than a few days goes. It read every copy kept: at each app's open
// it was a tenth to half a second of work, beside the app's own reads.
const PRUNED_KEY = 'quadra.dataPruned';
const PRUNE_EVERY_MS = 6 * 3_600_000;
let prunedAt = 0;
function prune() {
  try {
    prunedAt = Math.max(prunedAt, Number(globalThis.localStorage?.getItem(PRUNED_KEY)) || 0);
  } catch {}
  if (Date.now() - prunedAt < PRUNE_EVERY_MS) return;
  prunedAt = Date.now();
  try {
    globalThis.localStorage?.setItem(PRUNED_KEY, String(prunedAt));
  } catch {}
  const idle = globalThis.requestIdleCallback || (f => setTimeout(f, 5000));
  idle(async () => {
    try {
      const cache = await caches.open(DATA_CACHE);
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        if (Date.now() - (Number(res?.headers.get('x-at')) || 0) > DATA_KEEP_MS) await cache.delete(req);
      }
    } catch {}
  });
}
export function clearData() {
  memory.clear();
  if (hasCaches()) caches.delete(DATA_CACHE).catch(() => {});
}
// Signed out: nothing of the account stays on this device. The Quadra apps
// share one origin, so every app's keys in this storage go (the account,
// the wallet, each app's copy and its own settings; a home-screen app on a
// phone has storage of its own), this tab's too, and the kept data. Only
// how the device itself is set up stays: its language and its screen's
// safe area, and the kit's version (the app files stay cached, so the
// sign-in screen opens offline).
const DEVICE_KEYS = new Set(['quadra.lang', 'quadra.safeBottom', 'quadra.kit', 'quadra.kitFiles']);
export function wipeDevice() {
  for (const store of [globalThis.localStorage, globalThis.sessionStorage]) {
    try {
      const keys = [];
      for (let i = 0; i < store.length; i++) keys.push(store.key(i));
      for (const k of keys) if (!(store === globalThis.localStorage && DEVICE_KEYS.has(k))) store.removeItem(k);
    } catch {}
  }
  clearData();
}
// The last copy kept on this device, of any age: { at, data } or null.
export const peekJson = (url, { trim = '' } = {}) => persisted(dataKey(url, trim));

async function dataToken(renew = false) {
  const s = dataSession;
  if (!s) return '';
  return s.ensureToken({ renew }).catch(() => s.token || '');
}
// A proxy ask with this app's token: turned away for it (401: a token signed
// before the proxy's secret changed, or run out), asked once more with a new one.
async function signedFetch(address, init) {
  const withToken = t => fetch(`${address}${t ? `&qt=${encodeURIComponent(t)}` : ''}`, init);
  const res = await withToken(await dataToken());
  return res.status === 401 && dataSession ? withToken(await dataToken(true)) : res;
}
// One of the Worker's own routes, signed with the
// app's session; null when it can't be had.
// `body`: sent as a POST (text/plain: no preflight).
export async function workerJson(path, query, { timeout = 8000, body = null } = {}) {
  try {
    const init = body == null ? {} : { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body };
    const res = await signedFetch(`${ECO_URL.replace(/\/eco$/, path)}?${query || 'v=1'}`, { ...init, signal: AbortSignal.timeout(timeout) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
// Which app asks: the proxy counts each app's asks apart (Securities' quotes
// left running never use up Sports' minute).
const appParam = () => (dataSession?.app ? `&app=${dataSession.app}` : '');
const proxyAddress = (url, trim) => `${PROXY_URL}?url=${encodeURIComponent(url)}${trim ? `&trim=${trim}` : ''}${appParam()}`;
async function fetchOne(url, trim, timeout, extra = '') {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await signedFetch(`${proxyAddress(url, trim)}${extra}`, { signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      return await res.text();
    } catch (error) {
      // Too many asks (429) is never asked again at once: that only keeps the limit hit.
      if (attempt >= 1 || (error.status >= 400 && error.status < 500)) throw error;
      await new Promise(r => setTimeout(r, 700));
    }
  }
}
// The batch queue (the proxy answers 24 at most; one it didn't is asked alone).
const BATCH_MAX = 24;
let queue = [];
let flushTimer = 0;
function enqueue(url, trim, timeout) {
  return new Promise((resolve, reject) => {
    queue.push({ url, trim, timeout, resolve, reject });
    if (queue.length >= BATCH_MAX) flush();
    else if (!flushTimer) flushTimer = setTimeout(flush, 12);
  });
}
async function flush() {
  clearTimeout(flushTimer);
  flushTimer = 0;
  const items = queue.splice(0, BATCH_MAX);
  if (queue.length) flushTimer = setTimeout(flush, 0);
  if (!items.length) return;
  const one = item => fetchOne(item.url, item.trim, item.timeout).then(item.resolve, item.reject);
  if (items.length === 1) return void items.forEach(one);
  // Each item once: its answer, or asked again alone (a failed source, or
  // none came), or its failure.
  const done = new Set();
  const settle = (i, got) => {
    const item = items[i];
    if (!item || done.has(i)) return;
    done.add(i);
    if (got?.s === 200) item.resolve(got.b);
    else if (got?.s >= 500 || !got) one(item);
    else item.reject(Object.assign(new Error(`HTTP ${got.s}`), { status: got.s }));
  };
  try {
    const u = items.map(i => `&u=${encodeURIComponent(i.trim ? `${i.trim}!${i.url}` : i.url)}`).join('');
    // `lines`: the proxy writes each item the moment it's in, a line of its
    // own ({ i, s, b }), taken here as it comes: a batch answered whole
    // waited on its slowest item. (A proxy from before answers whole: { r }.)
    const res = await signedFetch(`${PROXY_URL}?batch=1&lines=1${u}${appParam()}`, { signal: AbortSignal.timeout(Math.max(...items.map(i => i.timeout))) });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let whole = false;
    for (;;) {
      const { done: end, value } = await reader.read();
      // (A line ends only in what just came: a 2 MB line isn't searched again at each piece of it.)
      let from = text.length;
      text += decoder.decode(value || new Uint8Array(), { stream: !end });
      whole ||= text.startsWith('{"r":');
      for (let nl; !whole && (nl = text.indexOf('\n', from)) >= 0; from = 0) {
        const line = text.slice(0, nl);
        text = text.slice(nl + 1);
        if (line) {
          const got = JSON.parse(line);
          settle(got.i, got);
        }
      }
      if (end) break;
    }
    if (whole) JSON.parse(text).r?.forEach((got, i) => settle(i, got));
    items.forEach((item, i) => settle(i, null));
  } catch (error) {
    // Over the limit: each asked again alone would only count against it more.
    if (error?.status === 429 || error?.status === 401) items.forEach(item => item.reject(error));
    else items.forEach((item, i) => settle(i, null));
  }
}
// A read that failed, in the 除錯紀錄 (where, and why; never the token).
const recFail = (url, error) => {
  try {
    const u = new URL(url);
    rec('proxy-fail', { url: u.hostname === 'clients5.google.com' ? u.hostname : `${u.hostname}${u.pathname}${u.search}`.slice(0, 200), status: error?.status || 0, error: String(error?.name || error?.message || error).slice(0, 60) });
  } catch {}
};

// A text in another language (English company descriptions for a Chinese
// reader…), through the proxy's translate route, kept a month everywhere.
// to: 'zh-TW' | 'en' | …; resolves to the original text if it can't.
// A text with Chinese already in it (a name put in before translating) is
// English to translate: Google's guess calls it Chinese and hands it back as
// it was. An empty answer (Google busy; older copies kept one) is asked again
// as English, a read of its own.
export async function translate(text, to = 'zh-TW', from = 'auto') {
  const q = String(text || '').slice(0, 4500);
  if (!q.trim()) return q;
  const ask = async sl => {
    try {
      const got = await proxyJson(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sl}&tl=${to}&q=${encodeURIComponent(q)}`, { ttl: 30 * 86_400_000 });
      const out = Array.isArray(got) ? (Array.isArray(got[0]) ? got[0][0] : got[0]) : null;
      return typeof out === 'string' && out.trim() ? out : '';
    } catch {
      return '';
    }
  };
  const sl = from === 'auto' && to.startsWith('zh') && /[A-Za-z]/.test(q) && /[\u3400-\u9fff]/.test(q) ? 'en' : from;
  return (await ask(sl)) || (sl !== 'en' && to !== 'en' ? await ask('en') : '') || q;
}

// A list that failed (after the kit's own second try) is failed for a little
// while too: as long as it would have been kept, a minute at most, so the
// parts of a page that want it don't each ask a source that's down again.
const FAILED_HOLD_MS = 60_000;
// A failed or stale read asked again after this.
const RETRY_MS = 15_000;
// A read over for good is answered from what the proxy keeps (sports.js),
// in the batch like any other. `mirror: false`: this one from its source,
// never a kept copy, asked on its own.
// (`alone`: never in a batch, which answers only when its slowest read is
// in: a league's table waited on its playoffs' game days, 2026-10-15.)
// ESPN's core API turns the proxy away (403 on every path, 2026-10-22) but
// answers a phone itself (open to any page): read from the device, kept
// like any other.
const DIRECT_HOSTS = new Set(['sports.core.api.espn.com']);
const isDirect = url => {
  try {
    return DIRECT_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
};
async function fetchDirect(url, timeout) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.text();
}
export function proxyJson(url, { ttl = 60_000, trim = '', persist: keep = true, timeout = 20_000, mirror = true, alone = false } = {}) {
  return keptJson(url, dataKey(url, trim), { ttl, keep }, () => (isDirect(url) ? fetchDirect(url, timeout) : !mirror ? fetchOne(url, trim, timeout, '&mirror=0') : alone ? fetchOne(url, trim, timeout) : enqueue(url, trim, timeout)));
}
// The family's data (the proxy's /data/, kept in R2 on Cloudflare; built at
// night and through the day): what doesn't change in a day (a league's
// season, sports/<league>/<year>.json), read from there, never through the
// data proxy's sources. Kept and failed like proxyJson's; a pack not there
// (not built yet) is a failure (404) the app reads another way. Saved on the
// device under the address the packs had on GitHub Pages (PACKS_KEY), so
// what a phone kept before the move is still its copy.
export const PACKS_URL = 'https://orbit-workers-proxy.pengzjay.workers.dev/data/';
const PACKS_KEY = 'https://jaypengx.github.io/Shared-Data/';
export function packJson(path, { ttl = 3 * 3_600_000, timeout = 30_000 } = {}) {
  const url = `${PACKS_URL}${path}`;
  return keptJson(url, dataKey(`${PACKS_KEY}${path}`, ''), { ttl, keep: true }, async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return res.text();
  });
}
// A live read (asked every few seconds) is kept on the device at most once a
// minute: each copy is a whole answer's write (an MLB game's is 0.9 MB).
const LIVE_KEEP_MS = 60_000;
const keptAt = new Map(); // key → when it was last written to the device
function keptJson(url, key, { ttl, keep }, read) {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < (hit.failed ? Math.min(ttl, hit.hold) : hit.stale ? Math.min(ttl, RETRY_MS) : ttl)) return hit.promise;
  let entry;
  const promise = (async () => {
    // The last answer this page had is the copy to fall back on: the
    // device's is read (and parsed) only for a key's first read here.
    const saved = keep ? (hit?.data !== undefined ? { at: hit.dataAt, data: hit.data } : await persisted(key)) : null;
    if (saved && Date.now() - saved.at < ttl) return ((entry.data = saved.data), (entry.dataAt = saved.at), saved.data);
    let got;
    let data;
    try {
      got = await read();
      // (An answer that isn't JSON, cut off or a captive portal's page, is a
      // failed read like any other: the device's copy answers, nothing saved.)
      data = typeof got === 'string' ? JSON.parse(got) : got;
    } catch (error) {
      // A fresh read failed: the copy this device has (of any age) is the
      // answer, and it's asked again soon. A league that read fine an hour
      // ago never turns into "no data" for a refused minute.
      if (!saved) throw error;
      recFail(url, error);
      entry.stale = true;
      entry.data = saved.data;
      entry.dataAt = saved.at;
      return saved.data;
    }
    entry.data = data;
    entry.dataAt = Date.now();
    // Kept on the device off the critical path (a live one once a minute).
    if (keep && (ttl >= LIVE_KEEP_MS || !(Date.now() - (keptAt.get(key) || 0) < LIVE_KEEP_MS))) {
      keptAt.set(key, Date.now());
      if (keptAt.size > 500) keptAt.delete(keptAt.keys().next().value);
      keepLater(key, got);
    }
    return data;
  })();
  entry = { at: Date.now(), promise, failed: false, stale: false };
  memory.set(key, entry);
  promise.then(
    () => entry.stale && Object.assign(entry, { at: Date.now() }),
    error => {
      recFail(url, error);
      // Too many asks or signed out: a minute. Anything else (a slow or
      // failed source): asked again soon.
      if (memory.get(key) === entry) Object.assign(entry, { at: Date.now(), failed: true, hold: error?.status === 429 || error?.status === 401 ? FAILED_HOLD_MS : RETRY_MS });
    }
  );
  if (memory.size > 500) memory.delete(memory.keys().next().value);
  return promise;
}

// ---- The session ---------------------------------------------------------------------
//
// const q = quadraSession('odds');
// q.on('wallet', w => ...)      the wallet changed (pool, settings…)
// q.on('active', live => ...)   true: this app is the live one; false: paused
// q.on('claim', c => ...)      every claim's end (opening, coming back,
//                               q.claim(), a sign-in), also one that changed
//                               nothing: { ok, active, live, changed }
//                               (ok false: it didn't reach the Worker)
// q.on('signedout', () => ...)
// await q.start()               signs in (the gate) and makes this app live;
//                               resolves to the first reply ({ payload, inbox,
//                               wallet } or { offline })
// q.pass                        the account's id on this device ('' signed out)
// q.read({ data, inbox })       { wallet, pool, payload, inbox } (app data when data)
// q.write({ payload, wallet })  only while live
// q.proxy(url, extra)           the data proxy's address for `url`, signed in

// No two-finger zoom in any Quadra app. iOS ignores the viewport's
// user-scalable=no in Safari and doesn't honour touch-action for pinches
// everywhere, so the pinch itself is stopped: its gesture events (Safari),
// a move with two fingers down (every touch browser) and ctrl+wheel (a
// trackpad pinch). One finger still scrolls and every tap still works.
function noZoom() {
  if (typeof document === 'undefined' || document.__quadraNoZoom) return;
  document.__quadraNoZoom = true;
  const stop = e => e.cancelable && e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, stop, { passive: false });
  document.addEventListener('touchmove', e => e.touches && e.touches.length > 1 && stop(e), { passive: false });
  globalThis.addEventListener?.('wheel', e => e.ctrlKey && stop(e), { passive: false });
}
noZoom();

// A tap felt, as iOS's own controls do: Safari (iOS 18 on) gives a native
// switch a haptic tick when it's tapped, so a hidden one is tapped. Only
// during a tap (a gesture), and nothing where there's no such switch.
export function haptic() {
  if (typeof document === 'undefined' || !document.body) return;
  try {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.style.display = 'none';
    label.setAttribute('aria-hidden', 'true');
    label.append(input);
    document.body.append(label);
    label.click();
    label.remove();
  } catch {}
}
// Also as a global: an app that calls it this way still opens on a device
// whose kit is an older one (an import of a name the old kit lacks would not).
if (typeof globalThis !== 'undefined') globalThis.quadraHaptic = haptic;

// A sheet closing slides to the foot as its dimming fades, as iOS's (its ✕,
// a tap outside, a swipe): it leaves at the finger's own speed (`speed`,
// px/ms) and eases out to the foot over 0.38 to 0.5 s (a ✕ 0.45 s from an
// even start), the way UIKit's
// sheet does (a flick had been gone in a sixth of a second, the ✕'s in a
// quarter: too quick for iOS). A wide screen's card (it popped in) closed
// by its ✕ or a tap outside just closes; swiped down, it goes on down with
// the finger, as an iPad's does. One asked for no motion just closes.
export function closeSheet(d, speed = 0) {
  if (!d?.open || d.classList.contains('q-leaving')) return;
  if ((innerWidth >= 720 && !(speed > 0)) || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return d.close();
  // Where the finger left it (a swipe's translateY) and how far is left to go: the
  // way to the foot measured from its place at rest, as the transform is (from where
  // it was dragged to, it stopped that far short of the foot, then vanished: the owner, 2026-10-18).
  const now = new DOMMatrixReadOnly(getComputedStyle(d).transform === 'none' ? undefined : getComputedStyle(d).transform).m42 || 0;
  const foot = Math.ceil(innerHeight - (d.getBoundingClientRect().top - now) + 40);
  const rest = Math.max(1, foot - now);
  const ms = speed > 0 ? Math.round(Math.min(500, Math.max(380, 380 + rest / 8 - speed * 60))) : 450;
  // The curve starts as fast as the finger moved (its first handle's slope is
  // the speed, in the curve's units); without a finger, an even start (iOS's
  // ✕ doesn't throw the sheet: half the way gone in a tenth of a second read as too quick).
  const slope = speed > 0 ? (speed * ms) / rest : 0;
  const ease = speed > 0 ? `cubic-bezier(0.25, ${Math.min(1, Math.max(0.05, slope * 0.25)).toFixed(3)}, 0.3, 1)` : 'cubic-bezier(0.3, 0.3, 0.2, 1)';
  d.classList.remove('q-settle', 'q-dragging');
  d.style.setProperty('--q-leave', `${ms}ms`);
  d.style.setProperty('--q-leave-ease', ease);
  d.classList.add('q-leaving');
  // Past the foot of the screen (a wide screen's card sits in its middle: 110% of its own height left it in view).
  d.style.transform = `translateY(${foot}px)`;
  let done = false;
  const shut = () => {
    if (done) return;
    done = true;
    d.close();
    d.classList.remove('q-leaving');
    d.style.transform = '';
    d.style.removeProperty('--q-leave-ease');
  };
  d.addEventListener('transitionend', e => e.target === d && e.propertyName === 'transform' && shut());
  setTimeout(shut, ms + 60);
}
if (typeof globalThis !== 'undefined') globalThis.quadraCloseSheet = closeSheet;

// Where a sheet's swipe comes to when the finger lets go: 'close' (down past 120 px
// or flicked), 'expand' (a medium sheet pulled up: large), 'shrink' (a large sheet
// that opened medium, pulled down: back to medium; a hard flick still closes it) or
// 'settle' (springs back). dy: where the sheet is (rubber-banded); raw: the finger's
// travel; speed: px/ms, down positive.
export function sheetVerdict({ dy = 0, raw = 0, speed = 0, detent = '', expandable = false } = {}) {
  if (expandable && detent === 'medium' && (raw < -40 || speed < -0.4)) return 'expand';
  if (speed > -0.2 && (dy > 120 || (dy > 24 && speed > 0.5))) return expandable && detent === 'large' && speed < 1.2 ? 'shrink' : 'close';
  return 'settle';
}

// A sheet swiped down from its top closes, as on iOS (a phone's bottom
// sheets, dialog.q-sheet, and an iPad's card: it couldn't be swiped away
// there, the owner 2026-10-18): it follows the finger and closes past 120 px or
// on a flick (its speed over the last tenth of a second, not since the
// touch), else springs back. Not from a field or a sideways list, and not
// while the sheet is scrolled (that finger scrolls it).
function sheetSwipe() {
  if (typeof document === 'undefined' || document.__quadraSheetSwipe) return;
  document.__quadraSheetSwipe = true;
  let sheet = null;
  let y0 = 0;
  let x0 = 0;
  let dy = 0;
  let dragging = false;
  // The finger's last moves: [time, y], for its speed when it lets go.
  let trail = [];
  // A sheet's rise plays once (.q-risen): risen, grabbed, or shut and reset for its next opening.
  document.addEventListener('animationend', e => (e.animationName === 'q-sheet-up' || e.animationName === 'q-pop-in') && e.target.classList?.contains('q-sheet') && e.target.classList.add('q-risen'));
  document.addEventListener('close', e => e.target.classList?.remove('q-risen'), true);
  document.addEventListener(
    'touchstart',
    e => {
      const s = e.target.closest?.('dialog.q-sheet[open]');
      sheet = null;
      if (!s || e.touches.length !== 1 || s.scrollTop > 0 || s.classList.contains('q-leaving')) return;
      if (e.target.closest('input, textarea, select, [contenteditable], .q-chips, .ot-scroll-chips, .leaflet-container, [data-no-sheet-swipe]')) return;
      // A box inside the sheet that scrolls (a list, a timeline): the finger is its, not the sheet's.
      for (let n = e.target; n && n !== s; n = n.parentElement) {
        if (n.scrollTop > 0) return;
        const oy = globalThis.getComputedStyle?.(n).overflowY || '';
        if (/auto|scroll/.test(oy) && n.scrollHeight > n.clientHeight + 1) return;
      }
      sheet = s;
      [x0, y0, dy, dragging] = [e.touches[0].clientX, e.touches[0].clientY, 0, false];
      trail = [[e.timeStamp, 0]];
    },
    { passive: true }
  );
  document.addEventListener(
    'touchmove',
    e => {
      if (!sheet) return;
      const y = e.touches[0].clientY - y0;
      const x = e.touches[0].clientX - x0;
      if (!dragging) {
        // Up, or sideways: not a swipe down (the sheet scrolls, the list slides).
        if (Math.abs(x) > Math.abs(y) + 4) return void (sheet = null);
        if (y < -4) {
          // (A sheet with more to show scrolls up; one that fits gives a little;
          // a medium one is pulled up to large first, as iOS's.)
          const grows = sheet.hasAttribute('data-expandable') && sheet.getAttribute('data-detent') === 'medium';
          if (!grows && sheet.scrollHeight > sheet.clientHeight + 1) return void (sheet = null);
          dragging = true;
          sheet.classList.add('q-dragging', 'q-risen');
          return;
        }
        // Downward from the first move on, the finger is the sheet's: left
        // alone below 8 px, Safari began scrolling the page behind with it.
        if (y > 0 && y >= Math.abs(x) && e.cancelable) e.preventDefault();
        if (y < 4) return;
        // From here, not from the touch: the sheet moves on with the finger
        // instead of jumping the first few pixels it was held still for.
        y0 += 4;
        dragging = true;
        // Taken from where it is (still rising, or springing back).
        sheet.classList.remove('q-settle');
        sheet.classList.add('q-dragging', 'q-risen');
      }
      // Down with the finger; pulled up, it gives a little and no more (iOS's rubber band).
      const yy = e.touches[0].clientY - y0;
      dy = yy >= 0 ? yy : -Math.sqrt(-yy) * 2.2;
      sheet.style.transform = `translateY(${dy}px)`;
      trail.push([e.timeStamp, yy]);
      while (trail.length > 2 && e.timeStamp - trail[0][0] > 100) trail.shift();
      if (e.cancelable) e.preventDefault();
    },
    { passive: false }
  );
  const end = () => {
    const s = sheet;
    sheet = null;
    if (!s || !dragging) return;
    dragging = false;
    s.classList.remove('q-dragging');
    const [[ta, ya], [tb, yb]] = [trail[0], trail.at(-1)];
    const speed = tb > ta ? (yb - ya) / (tb - ta) : 0;
    const verdict = sheetVerdict({ dy, raw: yb, speed, detent: s.getAttribute('data-detent') || '', expandable: s.hasAttribute('data-expandable') });
    if (verdict === 'close') {
      haptic();
      return closeSheet(s, speed);
    }
    s.classList.add('q-settle');
    s.style.transform = '';
    // A medium sheet pulled up grows to large; one grown, pulled down, goes back.
    if (verdict !== 'settle') {
      haptic();
      setSheetDetent(s, verdict === 'expand' ? 'large' : 'medium');
    }
    setTimeout(() => s.classList.remove('q-settle'), 500);
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
}
sheetSwipe();

// Every segmented control on the page (.q-seg, the kit's), however an app
// draws it (a builder, an HTML string redrawn whole): its options counted,
// the chosen one found (aria-pressed / aria-selected), and its thumb slid
// there from where that control's thumb last was (a control is known by
// its options' words), so a redraw still moves like iOS's.
function segThumbs() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || document.__quadraSegs) return;
  document.__quadraSegs = true;
  const last = new Map();
  const keyOf = seg => seg.dataset.key || [...seg.children].map(b => b.textContent.trim()).join('|');
  const fit = seg => {
    const kids = [...seg.children].filter(b => !b.hidden);
    if (!kids.length) return;
    const i = Math.max(0, kids.findIndex(b => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true'));
    seg.style.setProperty('--q-seg-n', String(kids.length));
    if (seg.dataset.to != null) return;
    const key = keyOf(seg);
    const was = last.get(key);
    last.set(key, i);
    const now = seg.style.getPropertyValue('--q-seg-i');
    if (now === String(i)) return;
    if (was != null && was !== i && !now && seg.isConnected) {
      seg.style.setProperty('--q-seg-i', String(was));
      requestAnimationFrame(() => requestAnimationFrame(() => seg.style.setProperty('--q-seg-i', String(i))));
    } else seg.style.setProperty('--q-seg-i', String(i));
  };
  const scan = root => {
    if (root.nodeType !== 1) return;
    if (root.classList.contains('q-seg')) fit(root);
    root.querySelectorAll?.('.q-seg').forEach(fit);
  };
  const start = () => {
    scan(document.body);
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'attributes') {
          const seg = m.target.parentElement;
          if (seg?.classList.contains('q-seg')) fit(seg);
        } else m.addedNodes.forEach(scan);
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected'] });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
segThumbs();

// A search field's ✕ (.q-search-clear, the kit's): the field emptied as if
// typed away (its own input event, so the app's search runs), and kept for typing.
if (typeof document !== 'undefined' && !document.__quadraSearchClear) {
  document.__quadraSearchClear = true;
  document.addEventListener('click', e => {
    const x = e.target.closest?.('.q-search-clear');
    const input = x?.closest('.q-search')?.querySelector('input');
    if (!input) return;
    e.preventDefault();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
}

// A phone or a tablet: html.q-touch, so a tablet gets a phone's frame (no
// brand header, the tabs at the bottom; quadra.css). boot.js sets it earlier
// in the apps that load it.
if (typeof document !== 'undefined' && isPhoneOrTablet()) document.documentElement.classList.add('q-touch');

// Pressed only when pressed (the owner, 2026-10-11): iPhone Safari puts
// :active on whatever a finger lands on, so scrolling a list greyed every
// card it passed. On a phone or tablet every :active in every sheet (the
// kit's and the app's, the same origin) becomes [data-q-press], and that is
// set as iOS does it: after the finger has rested a moment, or briefly on a
// quick tap, and never once it moves or the page scrolls (pointercancel).
export const PRESS_DELAY = 90;
export const pressSelector = sel => sel.replace(/:active\b/g, '[data-q-press]');
function pressOnlyWhenPressed() {
  if (typeof document === 'undefined' || document.__quadraPress || !document.documentElement.classList.contains('q-touch')) return;
  document.__quadraPress = true;
  const done = new WeakSet();
  let sheets = -1;
  const fixRules = rules => {
    for (const r of rules || []) {
      if (r.selectorText?.includes(':active')) r.selectorText = pressSelector(r.selectorText);
      else if (r.cssRules) fixRules(r.cssRules);
    }
  };
  const fixSheets = () => {
    if (document.styleSheets.length === sheets) return;
    sheets = document.styleSheets.length;
    for (const s of document.styleSheets) {
      if (done.has(s)) continue;
      try {
        fixRules(s.cssRules);
        done.add(s);
      } catch {
        // (Still loading: asked again at the next press.)
        sheets = -1;
      }
    }
  };
  fixSheets();
  addEventListener('load', fixSheets);
  document.addEventListener('DOMContentLoaded', fixSheets);
  let held = [];
  let timer = 0;
  let start = null;
  let target = null;
  const clear = () => {
    clearTimeout(timer);
    timer = 0;
    target = null;
    for (const n of held) n.removeAttribute('data-q-press');
    held = [];
  };
  const mark = el => {
    for (let n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      n.setAttribute('data-q-press', '');
      held.push(n);
    }
  };
  document.addEventListener('pointerdown', e => {
    clear();
    fixSheets();
    if (!e.isPrimary || !(e.target instanceof Element)) return;
    target = e.target;
    start = { x: e.clientX, y: e.clientY };
    if (e.pointerType !== 'touch') return mark(target);
    timer = setTimeout(() => ((timer = 0), target && mark(target)), PRESS_DELAY);
  }, true);
  document.addEventListener('pointermove', e => {
    if (target && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) clear();
  }, true);
  document.addEventListener('pointerup', () => {
    // A tap quicker than the delay still shows it was pressed, for a moment.
    if (timer && target) {
      const t = target;
      clear();
      mark(t);
      setTimeout(clear, 120);
    } else setTimeout(clear, 0);
  }, true);
  document.addEventListener('pointercancel', clear, true);
  document.addEventListener('scroll', () => held.length || timer ? clear() : 0, { capture: true, passive: true });
}
pressOnlyWhenPressed();

// The solid strip under the phone's status bar (see .q-statusbar in quadra.css).
function statusStrip() {
  if (typeof document === 'undefined' || !document.body || document.querySelector('.q-statusbar')) return;
  const bar = document.createElement('div');
  bar.className = 'q-statusbar';
  bar.setAttribute('aria-hidden', 'true');
  document.body.prepend(bar);
}
// A phone turned sideways: every app's screens are drawn for a phone held
// upright (the owner, 2026-10-10), and iOS can't lock a web app's
// orientation, so the page turns back against the phone: it stays upright
// on the glass as if the phone hadn't turned (quadra.css html[data-q-turn]).
// Only a phone (its short side 520 px or less); a tablet turns as it likes.
function uprightTurn() {
  if (typeof document === 'undefined' || document.documentElement.dataset.qTurnOn) return;
  const root = document.documentElement;
  root.dataset.qTurnOn = '1';
  const set = () => {
    const w = globalThis.innerWidth;
    const h = globalThis.innerHeight;
    const phone = root.classList.contains('q-touch') && Math.min(w, h) <= 520;
    const angle = Number(globalThis.screen?.orientation?.angle ?? globalThis.orientation ?? 90);
    // Turned left (90): the page a quarter back to the right, and the other way round.
    const turn = phone && w > h ? (angle === 270 || angle === -90 ? '90' : '-90') : '';
    if (turn) {
      root.style.setProperty('--q-turn-w', `${h}px`);
      root.style.setProperty('--q-turn-h', `${w}px`);
    }
    // Upright, no mark at all: an empty one still matches html[data-q-turn],
    // whose rules put every alert in the top-left corner.
    if (turn && root.dataset.qTurn !== turn) root.dataset.qTurn = turn;
    else if (!turn && 'qTurn' in root.dataset) delete root.dataset.qTurn;
    turnRules(turn ? [h, w, turn] : null);
  };
  set();
  globalThis.addEventListener?.('resize', set);
  globalThis.screen?.orientation?.addEventListener?.('change', set);
  // A stylesheet that arrives later is read the same way.
  if (typeof MutationObserver === 'function' && document.head) {
    new MutationObserver(() => root.dataset.qTurn && set()).observe(document.head, { childList: true });
    document.addEventListener('load', e => e.target?.tagName === 'LINK' && root.dataset.qTurn && set(), true);
  }
}
// Turned, the page is still laid out by the phone's sideways screen: its
// @media widths and vw/vh lengths read 874 px wide, and the notch's and home
// bar's margins (safe-area insets) land on the page's left and right, so
// the page came out narrower and laid out differently from upright. While
// turned, each is read against the upright screen instead ([width, height,
// turn]: an inset is the sideways screen's side that is now the page's
// top, left, …); null puts every rule back as written.
const turnedMedia = new Map();
const turnedStyles = new Map();
const VIEW_LEN = /(-?[\d.]+)(d|s|l)?v(w|h|min|max)\b|safe-area-inset-(top|right|bottom|left)/g;
const TURN_SIDES = {
  '-90': { top: 'left', left: 'bottom', bottom: 'right', right: 'top' },
  90: { top: 'right', left: 'top', bottom: 'left', right: 'bottom' },
};
function turnRules(size) {
  if (typeof document === 'undefined') return;
  const [W, H, turn] = size || [];
  const sizeFits = (_, side, dim, n, unit) => {
    const px = Number(n) * (unit === 'em' || unit === 'rem' ? 16 : 1);
    const have = /height/.test(dim) ? H : W;
    const ok = side === 'min-' ? have >= px : side === 'max-' ? have <= px : have === px;
    return ok ? '(min-width: 0px)' : '(max-width: 0px)';
  };
  const viewLen = (_, n, __, axis, side) => {
    if (side) return `safe-area-inset-${TURN_SIDES[turn][side]}`;
    const unit = { w: W, h: H, min: Math.min(W, H), max: Math.max(W, H) }[axis];
    return `${Math.round(Number(n) * unit) / 100}px`;
  };
  const walk = rules => {
    for (const rule of rules || []) {
      if (rule.media && rule.cssRules) {
        const was = turnedMedia.get(rule) ?? rule.media.mediaText;
        if (/width|height|orientation/.test(was)) {
          turnedMedia.set(rule, was);
          const text = size
            ? was
                .replace(/\(\s*(min-|max-)?(width|height|device-width|device-height)\s*:\s*([\d.]+)(px|em|rem)?\s*\)/g, sizeFits)
                .replace(/\(\s*orientation\s*:\s*(\w+)\s*\)/g, (_, o) => (o === 'portrait' ? '(min-width: 0px)' : '(max-width: 0px)'))
            : was;
          if (rule.media.mediaText !== text) rule.media.mediaText = text;
        }
      }
      // The turned page's own rules (html[data-q-turn]) already speak sideways.
      if (rule.style && !/data-q-turn/.test(rule.selectorText || '')) {
        // The whole declaration block: an inset inside a shorthand (padding)
        // has no longhand to read.
        const was = turnedStyles.get(rule) ?? rule.style.cssText;
        VIEW_LEN.lastIndex = 0;
        if (VIEW_LEN.test(was)) {
          turnedStyles.set(rule, was);
          const text = size ? was.replace(VIEW_LEN, viewLen) : was;
          if (rule.style.cssText !== text) rule.style.cssText = text;
        }
      }
      if (rule.styleSheet) walk(safeRules(rule.styleSheet));
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  if (!size && !turnedMedia.size && !turnedStyles.size) return;
  for (const sheet of document.styleSheets) walk(safeRules(sheet));
}
// Another site's stylesheet (the fonts) can't be read; it has no layout rules.
function safeRules(sheet) {
  try {
    return sheet.cssRules;
  } catch {
    return null;
  }
}
// The phone paints its own status bar above the page in the theme colour (or
// black), so the theme colour is the strip's: one colour from the top of the
// screen down to the page, never a black band with a seam under it. Kept in
// step with light and dark and with an app recolouring the strip.
function syncThemeColor() {
  // (Called by observers and listeners that can outlive their page: a test's
  // torn-down document, a colour-scheme change after it's gone.)
  if (typeof document === 'undefined' || !document?.head) return;
  const bar = document.querySelector('.q-statusbar');
  if (!bar || typeof getComputedStyle !== 'function') return;
  const colour = getComputedStyle(bar).backgroundColor;
  if (!colour || /^rgba\(.*,\s*0\)$|^transparent$/.test(colour)) return;
  const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
  const meta = metas[0] || document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
  metas.slice(1).forEach(m => m.remove());
  meta.removeAttribute('media');
  if (meta.content !== colour) meta.content = colour;
}
// Back at once if an app redraws its body (innerHTML) and takes it away.
function keepStatusStrip() {
  statusStrip();
  uprightTurn();
  syncThemeColor();
  if (typeof MutationObserver === 'function') {
    // (The colour read again only when the strip came back or the body's
    // look really changed: a tap's haptic adds and removes a node, and an
    // app re-setting a class it has, each forced a style recalculation.)
    const look = () => `${document.body.className}|${document.body.getAttribute('style') || ''}|${document.body.dataset.theme || ''}|${document.body.dataset.sky || ''}`;
    let seen = look();
    new MutationObserver(() => {
      // (A test's page torn down under a pending observer: nothing to keep.)
      if (typeof document === 'undefined' || !document?.body) return;
      const had = document.querySelector('.q-statusbar');
      statusStrip();
      const now = look();
      if (had && now === seen) return;
      seen = now;
      syncThemeColor();
    }).observe(document.body, { childList: true, attributes: true, attributeFilter: ['style', 'class', 'data-theme', 'data-sky'] });
    new MutationObserver(() => typeof document !== 'undefined' && syncThemeColor()).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
  }
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeColor);
  globalThis.addEventListener?.('load', syncThemeColor);
}
if (typeof document !== 'undefined') document.body ? keepStatusStrip() : document.addEventListener('DOMContentLoaded', keepStatusStrip);

// The heartbeat (another device's changes, whether this app is still the live
// one) every 2 minutes: a read of the pass each time; back on screen it's
// asked at once anyway (wake), and a write from an app no longer live is
// refused by the Worker whatever the beat.
export function quadraSession(app, { lang = detectLang(), heartbeat = 120_000 } = {}) {
  // The app's colour and meaning tokens (quadra.css) follow <html data-app>;
  // kit/apps.mjs writes it into the page, this covers a page it hasn't yet.
  if (typeof document !== 'undefined' && document.documentElement && !document.documentElement.dataset.app) document.documentElement.dataset.app = app;
  // Every app notes the kit's newest version for its next opening, also
  // the apps that don't watch for updates (watchUpdates puts it in place
  // at once).
  // (A page that watches already asks with every check.)
  if (typeof document !== 'undefined') setTimeout(() => watching || kitLatest(), 4000);
  const made = makeSession(app, { lang, heartbeat });
  // A link to a guide (#help=<app>:<topic>) opens the Quadra Pass
  // sheet on it, once the app's first screen is up.
  const help = typeof location !== 'undefined' && /(?:^|[#&])help=([a-z]+)(?::([a-z0-9]+))?/.exec(location.hash);
  if (help && typeof document !== 'undefined') setTimeout(() => !document.querySelector('dialog[open]') && openHelp(made, help[1], help[2] || null), 800);
  made.app ??= app;
  dataSession = made;
  return made;
}
function makeSession(app, { lang, heartbeat }) {
  const listeners = {};
  const emit = (name, value) => (listeners[name] || []).forEach(fn => fn(value));
  let token = '';
  let tokenAt = 0;
  // The session's token kept on this device with its time (each app's own:
  // the apps share one origin), so a cold start's first data call goes out
  // with it rather than after a sign-in round trip (every opening of a
  // home-screen app iOS had closed waited on one: Weather's forecast a second
  // or more later). Taken only for the account signed in here and well inside
  // its 20 minutes (quadra-token.js SESSION_MS); the refresh token beside it
  // is the stronger key already. Gone with the account (signedOut, wipeDevice).
  const tokenKey = `quadra.token:${app}`;
  try {
    const kept = JSON.parse(readStore(tokenKey) || 'null');
    if (kept?.t && kept.account && kept.account === storedAccount() && Date.now() - kept.at < 12 * 60_000) [token, tokenAt] = [kept.t, kept.at];
  } catch {}
  let active = false;
  let live = null;
  let wallet = cachedWallet();
  // When the Worker's copy of the wallet held here was made: a read sends it,
  // and an unchanged wallet doesn't come back (`same`).
  let walletAt = '';
  let timer = 0;
  let started = false;

  const s = {
    app,
    lang,
    get pass() {
      return storedAccount();
    },
    get token() {
      return token;
    },
    get wallet() {
      return wallet;
    },
    get pool() {
      return poolBalance(wallet);
    },
    get active() {
      return active;
    },
    get live() {
      return live;
    },
    on(name, fn) {
      (listeners[name] ||= []).push(fn);
      return s;
    }
  };

  function setWallet(w) {
    if (!w) return;
    wallet = w;
    cacheWallet(storedAccount(), w);
    // The pass's notice switches (newer here: sent up).
    adoptNotifyPrefs(w);
    emit('wallet', w);
    setTimeout(() => syncPrefs(s), 0);
  }
  function setActive(next, where = null) {
    live = where;
    if (active === next) return;
    active = next;
    emit('active', next);
    if (!next) showMoved(s);
    else hideMoved();
  }
  function absorb(data) {
    if (data.refresh) {
      writeStore(KEY.refresh, data.refresh);
      writeStore(KEY.account, accountOf(data.refresh));
    }
    if (data.token) {
      token = data.token;
      tokenAt = Date.now();
      writeStore(tokenKey, JSON.stringify({ t: token, at: tokenAt, account: storedAccount() }));
    }
    if (data.wallet) {
      walletAt = data.walletTime || '';
      setWallet(data.wallet);
    }
    if (typeof data.payload === 'string') cachePayload(app, storedAccount(), data.payload);
    if (data.active != null) setActive(Boolean(data.active), data.live || null);
    return data;
  }

  // Every way of signing in ends here: a refresh token for this device.
  const signIn = body => claimed(call('POST', '', { ...body, app, inbox: true }).then(res => absorb({ ...res, active: true })));
  const login = code => signIn(DEVICE_CODE_PATTERN.test(cleanCode(code)) ? { op: 'pair-redeem', code: cleanCode(code) } : { op: 'login', passcode: cleanCode(code) });
  const create = () => signIn({ op: 'create' });
  // A session from the device's refresh token (claim: make this app live).
  // One at a time: a data fetch that needs a token while the start's sign-in
  // is on its way waits for that one (not a second call to the Worker).
  let refreshing = null;
  function refresh(opts) {
    const p = refreshOnce(opts);
    refreshing = p;
    const done = () => refreshing === p && (refreshing = null);
    p.then(done, done);
    return p;
  }
  // A usable token: the one held, the sign-in already on its way, or a new one.
  async function freshToken() {
    // One in hand and young: used as it is, not held for a refresh under way
    // (the sign-in's, at every opening).
    if (token && Date.now() - tokenAt <= 15 * 60_000) return;
    if (refreshing) await refreshing.catch(() => {});
    if (!token || Date.now() - tokenAt > 15 * 60_000) await (refreshing || refresh({ claim: false }));
  }
  // A claim (this app made live) said when it ends, every time: `active`
  // fires only when it changes, so a claim on coming back that finds this
  // app still live said nothing, and an app couldn't tell it had landed.
  function claimed(p) {
    const was = active;
    const end = ok => emit('claim', { ok, active, live, changed: active !== was });
    return p.then(
      res => (res?.signedOut || end(true), res),
      error => {
        end(false);
        throw error;
      }
    );
  }
  // (`since`: the updateTime of the app's data held here; still the same,
  // it doesn't come back: `unchanged`. A Worker without it sends it anyway.)
  function refreshOnce({ claim = false, data = false, since = '' } = {}) {
    return claim ? claimed(refreshCall({ claim, data, since })) : refreshCall({ claim, data, since });
  }
  async function refreshCall({ claim, data, since }) {
    const ref = readStore(KEY.refresh);
    if (!ref) return signedOut();
    try {
      const res = absorb(await call('POST', '', { op: 'refresh', refresh: ref, app, claim, data, inbox: data, w: wallet ? walletAt : '', since: data ? since : '' }));
      if (res.same) res.wallet = wallet;
      return res;
    } catch (error) {
      if (error.code === 'ECO_SIGNED_OUT' || error.code === 'ECO_TOKEN_INVALID') return signedOut();
      throw error;
    }
  }
  function signedOut() {
    const had = Boolean(storedAccount());
    // An account was signed in here: everything of it goes. (Never signed
    // in, a token asked for by a data fetch: nothing to wipe.)
    if (had) wipeDevice();
    else for (const k of [KEY.refresh, KEY.account, KEY.wallet, payloadKey(app), tokenKey]) writeStore(k, null);
    token = '';
    wallet = null;
    active = false;
    emit('signedout');
    // Signed out while in use (another device signed everyone out, the
    // pass changed): straight back to the sign-in screen, like a new device.
    if (started && had && typeof location !== 'undefined') setTimeout(() => location.reload(), 60);
    return { signedOut: true };
  }
  // Every call with the session token: a fresh one on expiry, once.
  async function withToken(fn) {
    await freshToken();
    if (!token) {
      const error = new Error('not live');
      error.code = 'ECO_SESSION_MOVED';
      error.live = live;
      setActive(false, live);
      throw error;
    }
    try {
      return await fn(token);
    } catch (error) {
      if (error.code === 'ECO_TOKEN_INVALID') {
        await refresh({ claim: false });
        return fn(token);
      }
      if (error.code === 'ECO_SIGNED_OUT') signedOut();
      if (error.code === 'ECO_SESSION_MOVED') setActive(false, error.live);
      throw error;
    }
  }

  s.login = login;
  s.create = create;
  // ({ data, since }: the app's data in the same request, as for read.)
  s.claim = ({ data = false, since = '' } = {}) => refresh({ claim: true, data, since });
  s.signOut = () => signedOut();
  // Every other device signed out; this one stays signed in.
  s.signOutEverywhere = () => withToken(qt => call('POST', '', { op: 'signout-all', qt })).then(absorb);
  // A new pass for the account: shown once, the old one stops working.
  s.rotate = () =>
    withToken(qt => call('POST', '', { op: 'rotate', qt })).then(res => {
      absorb(res);
      return res.passcode;
    });
  // A device code: sign in on another device within 10 minutes, once.
  s.deviceCode = () => withToken(qt => call('POST', '', { op: 'pair-create', qt }));
  // (The heartbeat's read every 2 minutes: the whole wallet, up to hundreds
  // of KB, came back each time, and every app redrew for it.)
  // (`since`: the updateTime of the app's data held here; while it's still
  // the same, { unchanged: true, updateTime } comes back without `payload`.
  // An older Worker sends the data anyway: no `unchanged` means changed.)
  s.read = ({ data = false, inbox = false, since = '' } = {}) =>
    withToken(qt => call('GET', qs({ qt, app: data ? app : '', inbox: inbox ? '1' : '', w: wallet ? walletAt : '', since: data ? since : '' }))).then(res => {
      absorb(res);
      if (res.same) res.wallet = wallet;
      return res;
    });
  s.write = ({ payload, wallet: patch } = {}) =>
    withToken(qt => {
      if (!active) {
        const error = new Error('not live');
        error.code = 'ECO_SESSION_MOVED';
        error.live = live;
        throw error;
      }
      return call('POST', qs({ app }), { op: 'write', qt, payload, wallet: patch, w: wallet ? walletAt : '' });
    }).then(res => {
      if (typeof payload === 'string') cachePayload(app, storedAccount(), payload);
      absorb(res);
      if (res.same) res.wallet = wallet;
      return res;
    });
  // 信貸 and 急難紓困 (loan.mjs): the Worker checks and writes them.
  s.loan = (action, body = {}) => withToken(qt => call('POST', '', { op: 'loan', qt, action, ...body })).then(res => (absorb(res), res));
  s.relief = () => withToken(qt => call('POST', '', { op: 'relief', qt })).then(res => (absorb(res), res));
  s.dropInbox = id => withToken(qt => call('POST', qs({ app }), { op: 'drop-inbox', qt, inbox: id }));
  // Other passes into this one (they're deleted after).
  s.merge = passes => withToken(qt => call('POST', '', { op: 'merge', qt, sources: passes.map(passcode => ({ passcode })) })).then(absorb);
  s.op = (op, body = {}) => withToken(qt => call('POST', '', { op, qt, ...body }));
  // The data proxy, signed in.
  s.proxy = (url, extra = '') => `${PROXY_URL}?url=${encodeURIComponent(url)}${extra}&app=${app}${token ? `&qt=${encodeURIComponent(token)}` : ''}`;
  // (`renew`: a new one now, whatever the age of this one: the proxy turned it away.)
  s.ensureToken = async ({ renew = false } = {}) => {
    if (renew) tokenAt = 0;
    await freshToken();
    return token;
  };

  // Sign in (the gate, when this device isn't), take a sign-in handed over
  // by a link, and make this app live.
  s.start = async ({ data = true } = {}) => {
    if (started) return s.first || {};
    // Every app behind the same two doors (Jay, 2026-10-18): on a phone, the
    // home screen only (installGate, its page covered and nothing started),
    // then a Quadra Pass (signInGate below). An app that asked first is
    // covered once.
    if (typeof document !== 'undefined' && installGate(app, lang)) return new Promise(() => {});
    started = true;
    let first = null;
    try {
      first = await takeHandoff(app);
      if (first) await claimed(Promise.resolve(first).then(f => (absorb({ ...f, active: true }), f)));
      if (!first && storedAccount()) {
        first = await refresh({ claim: true, data });
        if (first?.signedOut) first = null;
      }
    } catch (error) {
      // Offline: the cached wallet stands in until the next try.
      first = { offline: true, error };
    }
    if (!first) first = await signInGate(s);
    s.first = first;
    // The loading screen's line (boot.js): signed in, the app's data next.
    globalThis.__bootStep?.('', 0.8);
    loop();
    // The first reply: what the app merges its own copy with (never the
    // session itself: an app that took the session for the reply saw "no
    // data" and saved over the pass).
    return first || {};
  };
  function loop() {
    clearInterval(timer);
    timer = setInterval(beat, heartbeat);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake());
    globalThis.addEventListener?.('pageshow', event => event.persisted && wake());
    globalThis.addEventListener?.('online', wake);
  }
  // Back on screen: this app becomes the live one again.
  let waking = null;
  function wake() {
    if (!storedAccount() || waking) return;
    const was = active;
    waking = refresh({ claim: true })
      // Back from another device or app that was live meanwhile (the Worker's
      // `took`): told as becoming live again even when this one never saw
      // itself paused (asleep, no beat), so the app reads what changed.
      // (One that saw itself paused was told by setActive already.)
      .then(res => res?.took && was && active && emit('active', true))
      .catch(() => {})
      .finally(() => (waking = null));
  }
  function beat() {
    if (document.visibilityState === 'hidden' || !storedAccount() || !active) return;
    s.read().catch(() => {});
  }

  s.appUrl = (other, hash = '') => appUrl(other, hash);
  // A link to another app that arrives signed in (apps on a phone's home
  // screen don't share storage): a sealed sign-in, good for 3 minutes.
  s.go = async (other, hash = '') => {
    let target = appUrl(other, hash);
    if (isStandalone() && storedAccount()) {
      try {
        const { handoff } = await s.op('handoff');
        target = appUrl(other, [String(hash || '').replace(/^#/, ''), `qh=${handoff}`].filter(Boolean).join('&'));
      } catch {}
    }
    globalThis.location.assign(target);
  };
  return s;
}

export function appUrl(app, hash = '') {
  const h = String(hash || '').replace(/^#/, '');
  return `${APPS[app]?.path || '/'}${h ? `#${h}` : ''}`;
}

// A sign-in handed over in the address (#qh=<sealed>): taken out of the
// address at once and traded for this device's own sign-in. null if none.
async function takeHandoff(app) {
  const loc = globalThis.location;
  if (!loc?.hash) return null;
  const parts = loc.hash.slice(1).split('&');
  const at = parts.findIndex(p => p.startsWith('qh=') || p.startsWith('qp='));
  if (at < 0) return null;
  const [k, v] = [parts[at].slice(0, 2), decodeURIComponent(parts[at].slice(3))];
  parts.splice(at, 1);
  try {
    globalThis.history?.replaceState(globalThis.history.state, '', `${loc.pathname}${loc.search}${parts.length ? `#${parts.join('&')}` : ''}`);
  } catch {}
  try {
    sessionStorage.setItem('quadra.visit', '1');
  } catch {}
  if (k !== 'qh') return null;
  try {
    return await call('POST', '', { op: 'redeem', handoff: v, app, inbox: true });
  } catch {
    return null;
  }
}

// ---- The pool --------------------------------------------------------------------------

const cash = s => (typeof s?.cash === 'number' && Number.isFinite(s.cash) ? s.cash : 0);
export function poolBalance(wallet) {
  if (!wallet) return 0;
  const entries = (wallet.entries || []).reduce((sum, e) => sum + e.amount, 0);
  return Math.round((entries + Object.values(wallet.snap || {}).reduce((sum, s) => sum + cash(s), 0)) * 100) / 100;
}
// The pool less `app`'s own part (an app with its own books shows its own
// money plus this).
export function othersBalance(wallet, app) {
  if (!wallet) return 0;
  const entries = (wallet.entries || []).filter(e => e.app !== app).reduce((sum, e) => sum + e.amount, 0);
  const snaps = Object.entries(wallet.snap || {})
    .filter(([name]) => name !== app)
    .reduce((sum, [, s]) => sum + cash(s), 0);
  return Math.round((entries + snaps) * 100) / 100;
}

const KIND = {
  start: ['開戶金', 'Opening money'],
  grant: ['零用金', 'Allowance'],
  pay: ['薪水', 'Pay'],
  loan: ['信貸撥款', 'Loan paid out'],
  loanfee: ['信貸開辦費', 'Loan set-up fee'],
  loanpay: ['信貸還款', 'Loan installment'],
  loanlate: ['信貸逾期違約金', 'Late payment charge'],
  loanbad: ['催收：存款抵銷', 'Collection: balance taken'],
  loangar: ['催收：薪資扣押', 'Collection: pay garnished'],
  loanoff: ['信貸清償', 'Loan paid off'],
  relief: ['急難紓困', 'Emergency relief'],
  stake: ['下注', 'Bet'],
  payout: ['彩金', 'Winnings'],
  tax: ['運彩中獎稅補扣', 'Sports tax, back charged'],
  refund: ['退款', 'Refund'],
  lottery: ['彩券', 'Lottery ticket'],
  prize: ['彩券獎金', 'Lottery prize'],
  plus: ['Quadra Plus 月費', 'Quadra Plus'],
  plusrefund: ['Quadra Plus 退費', 'Quadra Plus refund'],
  rebase: ['經濟調整', 'Economy reset'],
  rank: ['財富等級獎勵', 'Wealth level reward'],
  od: ['透支利息', 'Overdraft interest'],
  cashout: ['提前兌現', 'Cash out'],
  freebet: ['免費投注', 'Free bet'],
  plusboost: ['✦ Plus 串關加成', '✦ Plus parlay boost'],
  vip: ['VIP 投注回饋', 'VIP cashback'],
  welcome: ['新手禮', 'Welcome offer'],
  'xfer-in': ['轉入', 'Transfer in'],
  'xfer-out': ['轉出', 'Transfer out'],
  merge: ['合併帶入', 'Carried over']
};
// One-off Worker entries named for what they were.
const NAMED = { 'eco:topup:v12': ['開戶金補發', 'Opening money raised'], 'eco:rebase:v3fix': ['開戶金補足', 'Opening money made up'], 'eco:odback:v3': ['透支利息退還', 'Overdraft interest refunded'] };
export function describeEntry(e, lang = 'zh') {
  const i = lang === 'en' ? 1 : 0;
  const what = NAMED[e.id]?.[i] || KIND[e.kind]?.[i] || e.kind;
  const from = e.app === 'eco' ? 'Quadra' : APPS[e.app]?.short || e.app;
  const peer = e.peer ? ` ${e.peer}` : '';
  const note = e.kind === 'rank' && e.app === 'eco' && e.note ? rankName(e.note, i) : e.note;
  return `${from} · ${what}${peer}${note ? ` · ${note}` : ''}`;
}

export const setting = (wallet, key, fallback = null) => wallet?.settings?.[key]?.value ?? fallback;
export const settingPatch = (key, value) => ({ settings: { [key]: { value, t: Date.now() } } });

export function money(x, { sign = false, cents = false } = {}) {
  const v = Number(x) || 0;
  const body = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: 0 });
  // What rounds to nothing carries no sign: never +NT$0 or −NT$0.
  const zero = !/[1-9]/.test(body);
  return `${zero ? '' : v < 0 ? '−' : sign && v > 0 ? '+' : ''}NT$${body}`;
}

// ---- Taiwan days -------------------------------------------------------------------------

const TPE = 8 * 3_600_000;
export const taipeiDay = (t = Date.now()) => twDay(t);

// ---- Recommendations: one engine for every app -------------------------------------------
//
// Affinity: every meaningful action (opening a match, a bet, a trade, a
// watch) adds weight to the keys it's about ('team:mlb:LAD', 'league:mlb',
// 'sport:baseball', 'sym:2330.TW', 'sector:tech' …), decaying with a half
// life, so the model follows what the person does now. Each app keeps its
// own map (and syncs its strongest keys to the wallet); ranking reads all
// the apps' maps together, so a sector traded in Securities lifts its
// stocks' news, and a team bet on in Play its games there.
//
// Ranking: score = quality × (1 + affinity) + exploration, then a diversity
// pass (maximal marginal relevance) so one team or sector doesn't fill the
// list, with a little exploration for keys seldom seen (so the list learns
// instead of repeating itself) and items the person dismissed pushed down.

const HALF_LIFE = 21 * 86_400_000;
const AFF_SYNC_KEYS = 40;
const decay = (v, t, now) => v * 0.5 ** ((now - t) / HALF_LIFE);

export function affinityOf(app) {
  return readJson(`${KEY.aff}.${app}`, {});
}
export function recordAffinity(app, keys, weight = 1, now = Date.now()) {
  const map = affinityOf(app);
  for (const k of [].concat(keys).filter(Boolean)) {
    const had = map[k];
    map[k] = { v: (had ? decay(had.v, had.t, now) : 0) + weight, t: now, n: (had?.n || 0) + 1 };
  }
  // Keep it small: the strongest 300.
  const kept = Object.entries(map)
    .sort((a, b) => decay(b[1].v, b[1].t, now) - decay(a[1].v, a[1].t, now))
    .slice(0, 300);
  writeStore(`${KEY.aff}.${app}`, JSON.stringify(Object.fromEntries(kept)));
}
// The strongest keys for the wallet (aff:<app>).
export function affinityPatch(app, now = Date.now()) {
  const top = Object.entries(affinityOf(app))
    .map(([k, a]) => [k, Math.round(decay(a.v, a.t, now) * 100) / 100])
    .filter(([, v]) => v > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, AFF_SYNC_KEYS);
  return settingPatch(`aff:${app}`, Object.fromEntries(top));
}
// Everything known: this device's maps and every app's synced map (the
// larger of the two per key), key -> weight. `apps`: only those apps' maps
// (Orbit Sports, an add-on, reads its own).
export function affinity(wallet, now = Date.now(), apps = Object.keys(APPS)) {
  const out = {};
  const add = (k, v) => (out[k] = Math.max(out[k] || 0, v));
  for (const app of apps) {
    for (const [k, a] of Object.entries(affinityOf(app))) add(k, decay(a.v, a.t, now));
    for (const [k, v] of Object.entries(setting(wallet, `aff:${app}`, {}) || {})) add(k, Number(v) || 0);
  }
  return out;
}

export function dismiss(id) {
  const d = readJson(KEY.dismiss, {});
  d[id] = Date.now();
  const kept = Object.entries(d)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200);
  writeStore(KEY.dismiss, JSON.stringify(Object.fromEntries(kept)));
}
const dismissed = () => readJson(KEY.dismiss, {});

// items: [{ id, keys: [...], quality (0..1), group }]; returns the best
// `n`, each with `why` (its strongest matching key) and `score`.
export function rank(items, { wallet, n = 10, diversity = 0.35, explore = 0.08, now = Date.now(), aff = affinity(wallet, now) } = {}) {
  const gone = dismissed();
  const max = Math.max(1, ...Object.values(aff));
  const scored = items.map(item => {
    let best = 0;
    let why = null;
    let seen = 0;
    for (const k of item.keys || []) {
      const v = (aff[k] || 0) / max;
      if (v > best) [best, why] = [v, k];
      if (aff[k]) seen++;
    }
    const q = Math.max(0, Math.min(1, item.quality ?? 0.5));
    // A little for the unexplored: items touching nothing known yet.
    const novelty = seen ? 0 : explore * (0.5 + hash01(`${item.id}:${taipeiDay(now)}`));
    const penalty = gone[item.id] ? 0.25 : 1;
    return { ...item, why, score: (q * (0.6 + 1.4 * best) + novelty) * penalty };
  });
  // Maximal marginal relevance over groups.
  const picked = [];
  const groups = {};
  const pool = scored.sort((a, b) => b.score - a.score);
  while (picked.length < n && pool.length) {
    let bi = 0;
    let bv = -Infinity;
    for (let i = 0; i < Math.min(pool.length, 60); i++) {
      const c = pool[i];
      const v = c.score * (1 - diversity) ** (groups[c.group] || 0);
      if (v > bv) [bi, bv] = [i, v];
    }
    const [c] = pool.splice(bi, 1);
    groups[c.group] = (groups[c.group] || 0) + 1;
    picked.push(c);
  }
  return picked;
}
function hash01(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

// ---- Help: every app's guide, in the Quadra Pass sheet (help.mjs) ------------------------

// ---- Screens -----------------------------------------------------------------------------

// The kit's element helper (ui.mjs h), as the pages have always called it.
export { node as el };

const typedPass = text => cleanCode(text).replace(/[^2-9A-HJ-NP-Z]/g, '').slice(0, 10);
// No maxlength: a pass is copied as ABCDE-23456 (11 characters), and a
// maxlength of 10 cut its last character off before the dash was taken out.
function passInput(label) {
  const input = node('input', { class: 'q-pass-input', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false', placeholder: 'ABCDE23456', 'aria-label': label });
  input.addEventListener('input', () => {
    input.value = typedPass(input.value);
  });
  return input;
}
const ERR = {
  SYNC_PASSCODE_NOT_FOUND: ['找不到這組通行碼。', 'No Quadra Pass has this code.'],
  ECO_CREATE_CLOSED: ['Quadra Pass 由擁有者發放，請向分享給你的人索取。', 'Quadra Passes are handed out by their owner: ask the person who shared Quadra with you.'],
  ECO_PAIR_NOT_FOUND: ['這組裝置代碼無效或已過期（10 分鐘內、只能用一次）。', 'That device code isn’t valid or has expired (10 minutes, once).'],
  RATE_LIMITED: ['嘗試太多次，請稍後再試。', 'Too many tries. Please wait a little.'],
  ECO_LOAN_FUNDS: ['餘額不足以一次還清。', 'Your balance doesn’t cover paying it all off.'],
  ECO_LOAN_NONE: ['沒有未還清的信貸。', 'There’s no loan to pay off.'],
  ECO_LOAN_REFUSED: ['銀行婉拒了這筆申請。', 'The bank turned this application down.'],
  ECO_RELIEF_REFUSED: ['目前不符合急難紓困資格。', 'You don’t qualify for relief right now.'],
  ECO_SESSION_MOVED: ['帳戶正在另一個 App 使用中，回到這裡後再試一次。', 'Your account is in use in another app. Come back here and try again.'],
  INVALID_PASSCODE: ['請輸入 10 碼通行碼（例如 ABCDE-23456）或 8 碼裝置代碼。', 'Enter your 10-character pass (like ABCDE-23456) or an 8-character device code.']
};
export const errorText = (error, lang) => {
  const e = ERR[error?.code];
  if (e) return lang === 'en' ? e[1] : e[0];
  return lang === 'en' ? 'Couldn’t reach Quadra. Check the connection and try again.' : '無法連線到 Quadra，請檢查網路後再試一次。';
};

// Quadra's own screens (sign-in, install, "in use elsewhere") always sit on
// top of everything: each is a modal <dialog> on the browser's top layer,
// where no z-index of an app can reach it, and if an app opens a sheet of
// its own while one is up, the Quadra screen is put back on top at once.
// Esc doesn't close them.
const onTop = new Set();
let topWatch = null;
function keepOnTop(dialog) {
  dialog.addEventListener('cancel', e => e.preventDefault());
  document.body.append(dialog);
  try {
    dialog.showModal();
  } catch {
    dialog.setAttribute('open', '');
  }
  onTop.add(dialog);
  topWatch ||= new MutationObserver(records => {
    if (!records.some(r => r.target !== dialog && r.target.tagName === 'DIALOG' && r.target.open && !onTop.has(r.target))) return;
    for (const d of onTop) {
      if (!d.isConnected || !d.open) continue;
      d.close();
      try {
        d.showModal();
      } catch {}
    }
  });
  topWatch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  return dialog;
}
function dropFromTop(dialog) {
  if (!dialog) return;
  onTop.delete(dialog);
  if (dialog.open) dialog.close();
  dialog.remove();
}

// The sign-in screen: nothing of the app shows until there's a pass.
function signInGate(s) {
  const en = s.lang === 'en';
  const a = APPS[s.app];
  document.getElementById('loading')?.setAttribute('hidden', '');
  return new Promise(resolve => {
    const input = passInput(BRAND.pass);
    const error = node('p', { class: 'q-gate-error', role: 'alert' });
    const enter = node('button', { class: 'q-btn primary block', type: 'submit', text: en ? 'Sign in' : '登入' });
    const busy = on => [enter, input].forEach(b => (b.disabled = on));
    const done = async task => {
      busy(true);
      error.textContent = '';
      try {
        const res = await task();
        dropFromTop(gate);
        document.documentElement.classList.remove('q-signing-in');
        resolve(res);
      } catch (e) {
        error.textContent = errorText(e, s.lang);
        busy(false);
      }
    };
    const form = node(
      'form',
      {
        class: 'q-gate-form',
        onsubmit: event => {
          event.preventDefault();
          const code = cleanCode(input.value);
          if (!PASS_PATTERN.test(code) && !DEVICE_CODE_PATTERN.test(code)) return void (error.textContent = errorText({ code: 'INVALID_PASSCODE' }, s.lang));
          done(() => s.login(code));
        }
      },
      [node('label', { class: 'q-gate-label', text: en ? 'Your Quadra Pass or a device code' : 'Quadra Pass 或裝置代碼' }), input, error, enter]
    );
    const gate = node('dialog', { class: 'q-gate', 'aria-modal': 'true', style: `--q-accent:${a.color}` }, [
      node('div', { class: 'q-gate-box' }, [
        node('img', { class: 'q-gate-icon', src: './favicon.svg', alt: '', width: '72', height: '72' }),
        node('p', { class: 'q-gate-brand', text: a.family === 'orbit' ? 'ORBIT' : 'QUADRA' }),
        node('h1', { class: 'q-gate-title', text: a.name }),
        node('p', { class: 'q-gate-lede', text: en ? 'Sign in with your Quadra Pass: one account for every Quadra and Orbit app.' : '用 Quadra Pass 登入：所有 Quadra 和 Orbit 的 App 共用一個帳戶。' }),
        form,
        node('p', { class: 'q-gate-note', text: en ? 'No Quadra Pass yet? Ask the person who shared Quadra with you for one.' : '還沒有 Quadra Pass？請向分享 Quadra 給你的人索取。' }),
        node('p', { class: 'q-gate-note', text: en ? 'Signed in on another device? Its Account sheet gives a device code for this one.' : '已在其他裝置登入？在那裡的「帳戶」取得裝置代碼，就能在這裡登入。' })
      ])
    ]);
    document.documentElement.classList.add('q-signing-in');
    // Alone on screen: any sheet the app had open closes first.
    for (const d of document.querySelectorAll('dialog[open]')) if (!onTop.has(d)) d.close();
    keepOnTop(gate);
    setTimeout(() => input.focus(), 50);
  });
}

// "Quadra is open in another app": this one waits.
let movedEl = null;
function showMoved(s) {
  if (movedEl || typeof document === 'undefined') return;
  const en = s.lang === 'en';
  const where = s.live?.app && APPS[s.live.app] ? APPS[s.live.app].name : en ? 'another app' : '另一個 App';
  const same = s.live?.app === s.app;
  movedEl = node('dialog', { class: 'q-moved', 'aria-modal': 'true' }, [
    node('div', { class: 'q-moved-box' }, [
      node('p', { class: 'q-moved-title', text: same ? (en ? 'Open on another device' : '已在其他裝置使用') : en ? `In use in ${where}` : `正在 ${where} 使用中` }),
      node('p', { class: 'q-moved-text', text: en ? 'Quadra runs in one app at a time. This one paused so nothing gets out of step.' : 'Quadra 一次只在一個 App 使用，這裡先暫停，資料才不會互相覆蓋。' }),
      node('button', {
        class: 'q-btn primary block',
        type: 'button',
        text: en ? 'Continue here' : '在這裡繼續',
        onclick: async event => {
          event.currentTarget.disabled = true;
          try {
            await s.claim();
          } finally {
            if (movedEl) movedEl.querySelector('button').disabled = false;
          }
        }
      })
    ])
  ]);
  keepOnTop(movedEl);
}
function hideMoved() {
  dropFromTop(movedEl);
  movedEl = null;
}

// ---- The account sheet: the same in every app ---------------------------------------------
//
// accountSheet(s, { extra }) opens a sheet with the pass, the pool, the
// apps, and the security actions. `extra`: an element the app adds (its
// own settings).

// extra(): the app's own settings for the sheet (an element), optional.
// The button is the account's badge (a person in the Quadra mark's colours),
// never the balance: the balance lives inside the sheet.
const PERSON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1.2-4 4.2-6 7.5-6s6.3 2 7.5 6"/></svg>';
export function accountButton(s, { extra = null } = {}) {
  const btn = node('button', { class: 'q-account', type: 'button', 'aria-label': s.lang === 'en' ? 'Quadra Pass' : 'Quadra Pass 帳戶', title: BRAND.pass });
  const dot = node('span', { class: 'q-account-dot', 'aria-hidden': 'true' });
  // The avatar worn, else the person.
  const paint = () => {
    const a = avatarOf(s.wallet);
    const f = frameOf(s.wallet);
    btn.replaceChildren();
    for (const c of [...btn.classList]) if (c.startsWith('q-frame-')) btn.classList.remove(c);
    if (f) btn.classList.add('q-framed', `q-frame-${f.id}`);
    else btn.classList.remove('q-framed');
    if (a) btn.append(node('span', { class: 'q-avatar', 'aria-hidden': 'true', text: a.glyph }));
    else btn.innerHTML = PERSON_SVG;
    btn.append(dot);
    btn.classList.toggle('signed', Boolean(s.wallet));
  };
  paint();
  s.on('wallet', paint);
  btn.addEventListener('click', () => accountSheet(s, { extra: extra ? extra() : null }));
  return btn;
}

// ---- Dialogs: Quadra's own, never the browser's alert/confirm ---------------------------
//
// ask({ title, body, ok, cancel, danger }) resolves true or false; tell({
// title, body, ok }) resolves once closed. A centred card over the page (and
// over an open sheet), Esc or a tap outside cancels.
// `points`: short rows ([icon, title, line]) under the body, instead of a
// paragraph that says the same. A point may also be { icon, text, tint }: icon
// a key of the kit's icons, drawn as a small tinted icon, then one line of text.
const isIconPoint = p => p != null && typeof p === 'object' && !Array.isArray(p);
const iconPoint = ({ icon, text = '', tint = '' }) =>
  node('li', { class: 'q-ask-icon-point' }, [
    node('span', { class: 'q-ask-mark ico', 'aria-hidden': 'true', ...(Object.hasOwn(icons, icon) ? { html: icons[icon] } : { text: icon == null ? '' : String(icon) }), ...(tint ? { style: `--t:${tint}` } : {}) }),
    node('span', {}, [node('strong', { text })])
  ]);
export function ask({ title, body = '', points = [], ok = '', cancel = '', danger = false, icon = '', tint = '', lang = detectLang(), alertOnly = false } = {}) {
  // `icon` a key of the kit's icons ('ticket'): a 56px colour tile (`tint`); anything else (an emoji) as before.
  const named = typeof icon === 'string' && Object.hasOwn(icons, icon);
  const en = lang === 'en';
  return new Promise(resolve => {
    const dialog = node('dialog', { class: `q-ask${danger ? ' danger' : ''}${named ? ' pro' : ''}`, 'aria-labelledby': 'q-ask-title' });
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      dialog.classList.add('out');
      setTimeout(() => {
        dialog.close();
        dialog.remove();
      }, 140);
      resolve(value);
    };
    const okBtn = node('button', { class: `q-btn ${danger ? 'danger' : 'primary'}`, type: 'button', text: ok || (alertOnly ? (en ? 'OK' : '好') : en ? 'Continue' : '繼續'), onclick: () => finish(true) });
    dialog.append(
      ...[
      icon ? (named ? node('div', { class: 'q-ask-icon q-tile', 'aria-hidden': 'true', html: icons[icon], ...(tint ? { style: `--t:${tint}` } : {}) }) : node('div', { class: 'q-ask-icon', 'aria-hidden': 'true', text: icon })) : null,
      node('h2', { id: 'q-ask-title', class: 'q-ask-title', text: title }),
      body ? node('p', { class: 'q-ask-body', text: body }) : null,
      points.length
        ? node('ul', { class: 'q-ask-points' }, points.map(point => (isIconPoint(point) ? iconPoint(point) : (([mark, head, line]) => node('li', {}, [node('span', { class: 'q-ask-mark', 'aria-hidden': 'true', text: mark }), node('span', {}, [node('strong', { text: head }), line ? node('small', { text: line }) : null].filter(Boolean))]))(point))))
        : null,
      node('div', { class: 'q-ask-actions' }, [
        alertOnly ? null : node('button', { class: 'q-btn', type: 'button', text: cancel || (en ? 'Cancel' : '取消'), onclick: () => finish(false) }),
        okBtn
      ])
      ].filter(Boolean)
    );
    dialog.addEventListener('cancel', event => (event.preventDefault(), finish(alertOnly)));
    dialog.addEventListener('click', event => event.target === dialog && finish(alertOnly));
    document.body.append(dialog);
    dialog.showModal();
    (alertOnly || !danger ? okBtn : dialog.querySelector('.q-btn:not(.danger)'))?.focus();
  });
}
export const tell = (opts = {}) => ask({ ...opts, alertOnly: true }).then(() => undefined);

// The next payday: next Monday 00:00 Taiwan time.
export const nextPayday = (now = Date.now()) => nextWeekPayday(now);
const mdText = t => {
  const d = new Date(t + TPE);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
export function paydayText(lang, now = Date.now()) {
  const next = mdText(nextPayday(now));
  const amount = money(ECONOMY.weekly);
  return lang === 'en' ? `Next pay ${amount} · Mon ${next}` : `下次發薪 ${amount} · ${next}（一）`;
}

// The account at a glance: its number, since when, this month's money in
// and out, and the latest entries (every app's, like a bank statement).
// An entry that moved money (free bet tokens are amount 0).
const moved = e => e.amount !== 0;
export function accountDetails(wallet, lang = 'zh', now = Date.now()) {
  const entries = [...(wallet?.entries || [])].sort((a, b) => b.t - a.t);
  const month = taipeiDay(now).slice(0, 7);
  const thisMonth = entries.filter(e => taipeiDay(e.t).slice(0, 7) === month);
  const sum = list => Math.round(list.reduce((x, e) => x + e.amount, 0) * 100) / 100;
  return {
    created: Number.isFinite(wallet?.created) ? wallet.created : null,
    in: sum(thisMonth.filter(e => e.amount > 0)),
    out: sum(thisMonth.filter(e => e.amount < 0)),
    count: thisMonth.filter(moved).length,
    recent: entries.filter(moved).slice(0, 8).map(e => ({ t: e.t, amount: e.amount, text: describeEntry(e, lang), app: e.app }))
  };
}
const accountNumber = id => (id ? `QP ${id.slice(0, 4).toUpperCase()} ${id.slice(4, 8).toUpperCase()} ${id.slice(8, 12).toUpperCase()}` : '');
function detailsCard(s) {
  const en = s.lang === 'en';
  const T = (zh, e) => (en ? e : zh);
  const d = accountDetails(s.wallet, s.lang);
  const date = t => new Date(t).toLocaleDateString(en ? 'en-US' : 'zh-TW', { year: 'numeric', month: 'short', day: 'numeric' });
  const short = t => new Date(t).toLocaleDateString(en ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric' });
  const days = d.created ? Math.max(1, Math.round((Date.now() - d.created) / 86_400_000)) : 0;
  return node('div', { class: 'q-details' }, [
    node('div', { class: 'q-card-hero' }, [
      node('div', { class: 'q-hero-top' }, [node('span', { class: 'q-hero-brand', text: 'QUADRA PASS' }), node('span', { class: 'q-hero-no num', text: accountNumber(s.pass) })]),
      node('span', { class: 'q-hero-label', text: T('Quadra 餘額', 'Quadra balance') }),
      node('strong', { class: 'q-hero-balance num', text: money(s.pool) }),
      node('span', { class: 'q-hero-sub', text: d.created ? T(`${date(d.created)} 開戶 · 第 ${days} 天`, `Opened ${date(d.created)} · day ${days}`) : '' })
    ]),
    node('div', { class: 'q-month' }, [
      node('div', {}, [node('small', { text: T('本月收入', 'In this month') }), node('strong', { class: 'num up', text: money(d.in, { sign: true }) })]),
      node('div', {}, [node('small', { text: T('本月支出', 'Out this month') }), node('strong', { class: 'num down', text: money(d.out) })])
    ]),
    overdraft(s.wallet) > 0 ? node('p', { class: 'q-overdraft', text: T(`帳戶透支 ${money(overdraft(s.wallet))}：每月計息 1%。2 天內沒補足就是違約交割：扣 7% 違約金、賣出持股，5 年內不能融資。`, `Overdrawn by ${money(overdraft(s.wallet))}: 1% a month. Not covered within 2 days, it's a default: a 7% penalty, holdings sold, and no margin for 5 years.`) }) : null,
    node('p', { class: 'q-payday', text: paydayText(s.lang) }),
    d.recent.length
      ? node('details', { class: 'q-recent' }, [
          node('summary', { text: T(`最近明細（本月 ${d.count} 筆）`, `Latest entries (${d.count} this month)`) }),
          node(
            'ul',
            {},
            d.recent.map(e => node('li', {}, [node('span', { class: 'q-recent-when num', text: short(e.t) }), node('span', { class: 'q-recent-what', text: e.text }), node('strong', { class: `num ${e.amount < 0 ? 'down' : 'up'}`, text: money(e.amount, { sign: true }) })]))
          )
        ])
      : null
  ].filter(Boolean));
}
// The Quadra Pass sheet, in every app (the account button, #help= links; its
// 說明 tab is the one place the guide lives now): Pass (this account), 外觀
// (avatar and frame), 真相 (how the money moves), App (every app) and 說明
// (every app's guide). Loaded when first opened (pass.mjs). tab: 'pass' |
// 'looks' | 'truth' | 'apps' | 'help';
// help: { app, topic } for the guide to open on.
export async function accountSheet(s, { extra = null, tab = 'pass', help = null } = {}) {
  const { openPass } = await import('./pass.mjs');
  return openPass(s, { extra, tab, help });
}
export const openHelp = (s, app = s.app, topic = null) => accountSheet(s, { tab: 'help', help: { app, topic } });

// ---- 信貸 and 急難紓困 on screen (the rules: loan.mjs) -------------------------------------
//
// In the Pass tab under the balance: the loan as a bank shows it (what's
// left, the weekly installment, late weeks or 催收 in red, pay it off), or
// an application (amount, term, every cost before signing), and relief
// only when the account has nothing.
const pctText = x => `${Math.round(x * 1000) / 10}%`;
const LOAN_WHY = {
  active: ['一次只能有一筆信貸。', 'One loan at a time.'],
  collection: ['催收中，不能再借。', 'In collection: no new loans.'],
  record: ['聯徵有違約紀錄，{d} 前不能借款。', 'A default on your credit record: no loans until {d}.'],
  new: ['開戶滿 4 週才能申請，{d} 起可以借。', 'Accounts can borrow after 4 weeks: from {d}.'],
  term: ['請選擇期數。', 'Pick a term.'],
  amount: ['金額要在 {min} 到 {max} 之間。', 'The amount must be between {min} and {max}.']
};
const RELIEF_WHY = {
  cooldown: ['每 13 週只能申請一次，{d} 起可以再申請。', 'Once every 13 weeks: again from {d}.'],
  year: ['今年已申請 3 次，明年再來。', 'Three times this year already.'],
  collection: ['催收中的帳戶不能申請。', 'Not while a loan is in collection.'],
  payday: ['發薪日快到了，{d} 會入帳。', 'Payday is close: your pay arrives {d}.'],
  worth: ['名下現金、股票和投注中的錢合計要低於 {v}。', 'Your cash, stocks and open bets together must be under {v}.']
};
const whyText = (table, why, lang, vars = {}) => (table[why]?.[lang === 'en' ? 1 : 0] || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const dayText = (t, lang) => new Date(t).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric' });
export function loanCard(s) {
  const en = s.lang === 'en';
  const T = (zh, e) => (en ? e : zh);
  const box = node('div', { class: 'q-loan' });
  const note = node('p', { class: 'q-sheet-note', role: 'status' });
  let weeks = LOAN.terms[0];
  let amount = null;
  let open = false;
  const refusal = e =>
    e.code === 'ECO_LOAN_REFUSED' && e.why
      ? whyText(LOAN_WHY, e.why, s.lang, { min: money(LOAN.min), max: money(e.max || 0), d: e.until ? dayText(e.until, s.lang) : '' })
      : e.code === 'ECO_RELIEF_REFUSED' && e.why
        ? whyText(RELIEF_WHY, e.why, s.lang, { v: money(RELIEF.under), d: e.until ? dayText(e.until, s.lang) : '' })
        : errorText(e, s.lang);
  const btn = (label, fn, cls = 'q-btn tinted block') =>
    node('button', {
      class: cls,
      type: 'button',
      text: label,
      onclick: async event => {
        const b = event.currentTarget;
        b.disabled = true;
        note.textContent = '';
        try {
          await fn();
        } catch (e) {
          note.textContent = refusal(e);
        } finally {
          b.disabled = false;
        }
      }
    });
  const head = (left, right) => node('div', { class: 'q-loan-head' }, [node('span', { text: left }), node('span', { class: 'num', text: right })]);
  const fact = (label, value, tone = '') => node('div', { class: 'q-loan-fact' }, [node('small', { text: label }), node('strong', { class: `num ${tone}`, text: value })]);
  const sub = text => node('p', { class: 'q-loan-sub', text });
  function current(loan, now) {
    const owed = loanOwed(loan, now);
    const late = Math.max(0, dueCount(loan, now) - loan.paid);
    const payoff = payoffAmount(loan, now);
    const years = T(`${loan.weeks / 52} 年`, `${loan.weeks / 52} yr`);
    const next = dayText(nextPayday(now), s.lang);
    return [
      head(loan.bad ? T('信貸 · 催收中', 'Loan · in collection') : T('信貸', 'Personal loan'), `${pctText(loan.apr)} · ${years}`),
      node('div', { class: 'q-loan-facts' }, [
        fact(loan.bad ? T('尚欠', 'Owed') : T('剩餘未還', 'Left to repay'), money(owed), loan.bad || late ? 'down' : ''),
        loan.bad ? fact(T('每週扣薪', 'Taken from pay'), money(Math.round(PAY_WEEK * LOAN.garnish)), 'down') : fact(T('每週扣款', 'Each Monday'), money(loan.installment))
      ]),
      loan.bad ? null : node('div', { class: 'q-loan-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(loan.weeks), 'aria-valuenow': String(loan.paid) }, [node('span', { style: `width:${Math.round((loan.paid / loan.weeks) * 100)}%` })]),
      loan.bad ? null : sub(T(`已繳 ${loan.paid} / ${loan.weeks} 期 · ${next}（一）發薪後扣款`, `${loan.paid} of ${loan.weeks} paid · next Mon ${next}, after the pay`)),
      loan.bad
        ? node('p', { class: 'q-loan-warn', text: T('已轉催收：存款已抵銷，之後每週薪水扣三分之一，利息照算，直到還清。聯徵紀錄保留到還清後 1 年。', "In collection: your balance was taken, then a third of every weekly pay until it's paid, with interest running. Your credit record keeps it for a year after.") })
        : late
          ? node('p', { class: 'q-loan-warn', text: T(`逾期 ${late} 期，已計違約金。餘額一夠就自動扣款；逾期滿 ${LOAN.missesToDefault} 期就轉催收，全部到期。`, `${late} installment${late > 1 ? 's' : ''} late, with late charges. It's taken as soon as the balance covers it; at ${LOAN.missesToDefault} late the whole loan falls due and goes to collection.`) })
          : null,
      btn(
        T(`一次還清 · ${money(payoff)}`, `Pay it all off · ${money(payoff)}`),
        async () => {
          const body = payoff > owed ? T(`含提前清償違約金 ${money(payoff - owed)}（借款 1 年內 2%）。`, `Includes ${money(payoff - owed)} for paying off early (2% in the first year).`) : T('從 Quadra 餘額扣款。', 'Taken from your Quadra balance.');
          if (!(await ask({ lang: s.lang, icon: '🏦', title: T(`還清 ${money(payoff)}？`, `Pay off ${money(payoff)}?`), body, ok: T('還清', 'Pay off') }))) return;
          await s.loan('payoff');
          note.textContent = T('信貸已還清。', 'The loan is paid off.');
        },
        'q-btn plain block'
      )
    ].filter(Boolean);
  }
  function apply(w, now) {
    const can = canBorrow(w, now);
    const c = can.credit;
    if (!can.ok) return [head(T('信貸', 'Personal loan'), pctText(c.apr)), sub(whyText(LOAN_WHY, can.why, s.lang, { d: can.until ? dayText(can.until, s.lang) : '' }))];
    if (!open) {
      return [
        head(T('信貸', 'Personal loan'), T(`年利率 ${pctText(c.apr)}`, `${pctText(c.apr)} a year`)),
        node('div', { class: 'q-loan-facts' }, [fact(T('可借額度', 'You can borrow'), money(c.limit)), fact(T('最長', 'Up to'), T(`${LOAN.terms.at(-1) / 52} 年`, `${LOAN.terms.at(-1) / 52} years`))]),
        btn(T('申請信貸', 'Apply for a loan'), async () => ((open = true), paint()))
      ];
    }
    const max = maxFor(c.apr, weeks, c.limit);
    amount = Math.min(max, Math.max(LOAN.min, amount ?? LOAN.base));
    const offer = loanOffer(w, amount, weeks, now);
    const out = node('strong', { class: 'q-loan-amount num', text: money(amount) });
    const range = node('input', { type: 'range', class: 'q-loan-range', min: String(LOAN.min), max: String(Math.max(LOAN.min, max)), step: '10000', value: String(amount), 'aria-label': T('借款金額', 'Amount') });
    range.addEventListener('input', () => ((amount = Number(range.value)), (out.textContent = money(amount))));
    range.addEventListener('change', () => paint());
    const seg = segmented(
      LOAN.terms.map(n => ({ id: n, label: T(`${n / 52} 年`, `${n / 52} yr`) })),
      { value: weeks, onChange: id => ((weeks = id), paint()), label: T('期數', 'Term') }
    );
    const sign = async () => {
      const points = [
        ['📅', T(`每週一扣 ${money(offer.installment)}`, `${money(offer.installment)} each Monday`), T(`年利率 ${pctText(offer.apr)}，共 ${weeks} 期，發薪後自動扣款`, `${pctText(offer.apr)} a year, ${weeks} installments, taken after the pay`)],
        ['🧾', T(`總共要還 ${money(offer.total)}`, `${money(offer.total)} to repay in all`), T(`開辦費 ${money(offer.fee)} 從撥款扣除`, `A ${money(offer.fee)} set-up fee comes off the money`)],
        ['⚠️', T('逾期 3 期轉催收', '3 late and it goes to collection'), T('全部到期、存款抵銷、每週扣薪三分之一', 'It all falls due: your balance is taken, then a third of every pay')],
        ['🔒', T('1 年內還清收 2%', '2% to pay off within a year'), T('提前清償違約金', 'An early repayment charge')]
      ];
      if (!(await ask({ lang: s.lang, icon: '🏦', title: T(`借 ${money(offer.principal)}？`, `Borrow ${money(offer.principal)}?`), points, ok: T('簽約', 'Sign'), cancel: T('先不要', 'Not now') }))) return;
      await s.loan('borrow', { amount: offer.principal, weeks });
      open = false;
      note.textContent = T(`已撥款 ${money(offer.principal - offer.fee)}。`, `${money(offer.principal - offer.fee)} paid in.`);
      paint();
    };
    return [
      head(T('申請信貸', 'Apply for a loan'), T(`最多 ${money(max)}`, `Up to ${money(max)}`)),
      out,
      range,
      seg,
      offer.ok ? node('div', { class: 'q-loan-facts three' }, [fact(T('每週扣款', 'Each Monday'), money(offer.installment)), fact(T('利息＋開辦費', 'Interest + fee'), money(offer.cost), 'down'), fact(T('總費用年百分率', 'APR with fees'), pctText(offer.totalApr))]) : null,
      offer.ok ? btn(T(`簽約借款 · 實拿 ${money(offer.principal - offer.fee)}`, `Sign · you get ${money(offer.principal - offer.fee)}`), sign) : sub(whyText(LOAN_WHY, offer.why, s.lang, { min: money(LOAN.min), max: money(max) })),
      btn(T('取消', 'Cancel'), async () => ((open = false), paint()), 'q-btn plain block')
    ].filter(Boolean);
  }
  function relief(w, now) {
    const worth = poolBalance(w) + finiteOr0(w?.snap?.stock?.holdings) + openStakes(w);
    if (!(worth < RELIEF.under)) return [];
    const check = reliefCheck(w, worth, now);
    return [
      head(T('急難紓困', 'Emergency relief'), money(RELIEF.amount)),
      check.ok
        ? btn(T(`申請 ${money(RELIEF.amount)}`, `Apply for ${money(RELIEF.amount)}`), async () => {
            if (!(await ask({ lang: s.lang, icon: '🤝', title: T(`申請急難紓困 ${money(RELIEF.amount)}？`, `Apply for ${money(RELIEF.amount)} relief?`), body: T('一次性救助：每 13 週一次、一年最多 3 次，會留在紀錄上。', 'One-off help: once every 13 weeks, 3 times a year at most, and it stays on your record.'), ok: T('申請', 'Apply') }))) return;
            await s.relief();
            note.textContent = T(`已撥入 ${money(RELIEF.amount)}。`, `${money(RELIEF.amount)} paid in.`);
          })
        : sub(whyText(RELIEF_WHY, check.why, s.lang, { v: money(RELIEF.under), d: check.until ? dayText(check.until, s.lang) : '' }))
    ];
  }
  function paint() {
    const w = s.wallet;
    const now = Date.now();
    const loan = activeLoan(w);
    const help = relief(w, now);
    box.replaceChildren(node('div', { class: `q-loan-card${loan?.bad ? ' bad' : ''}` }, loan ? current(loan, now) : apply(w, now)), ...(help.length ? [node('div', { class: 'q-loan-card' }, help)] : []), note);
  }
  paint();
  s.on?.('wallet', () => box.isConnected && !open && paint());
  return box;
}

// The Pass tab: the account, its devices, notices and security. close()
// closes the sheet (before a new pass is shown over everything).
export function passAccount(s, { extra = null, close = () => {} } = {}) {
  const en = s.lang === 'en';
  const T = (zh, e) => (en ? e : zh);
  const note = node('p', { class: 'q-sheet-note', role: 'status' });
  const act = (label, fn, cls = 'q-row-btn') =>
    node('button', {
      class: cls,
      type: 'button',
      text: label,
      onclick: async event => {
        const b = event.currentTarget;
        b.disabled = true;
        try {
          await fn();
        } catch (e) {
          note.textContent = errorText(e, s.lang);
        } finally {
          b.disabled = false;
        }
      }
    });
  // A device code, shown with its countdown.
  const device = node('div', { class: 'q-device', hidden: true });
  let tick = 0;
  const showCode = ({ code, exp }) => {
    clearInterval(tick);
    const left = node('span', { class: 'q-device-left' });
    const paint = () => {
      const ms = exp - Date.now();
      if (ms <= 0) {
        clearInterval(tick);
        device.hidden = true;
        return;
      }
      left.textContent = T(`${Math.ceil(ms / 60_000)} 分鐘內有效，只能用一次`, `Valid ${Math.ceil(ms / 60_000)} more min, once`);
    };
    device.replaceChildren(node('span', { class: 'q-device-label', text: T('裝置代碼', 'Device code') }), node('strong', { class: 'q-device-code num', text: formatPass(code) }), left, node('span', { class: 'q-device-how', text: T('在另一台裝置輸入這組代碼登入', 'Enter it on the other device to sign in') }));
    device.hidden = false;
    paint();
    tick = setInterval(paint, 15_000);
  };
  const nodes = [
    detailsCard(s),
    loanCard(s),
    ...(extra ? [extra] : []),
    node('h3', { class: 'q-sheet-h', text: T('裝置', 'Devices') }),
    node('div', { class: 'q-rows' }, [act(T('新增裝置（取得裝置代碼）', 'Add a device (get a device code)'), async () => showCode(await s.deviceCode())), device]),
    node('h3', { class: 'q-sheet-h', text: T('通知', 'Notifications') }),
    ...notifyRows(s, note),
    node('h3', { class: 'q-sheet-h', text: T('除錯紀錄', 'Debug log') }),
    recRows(s, note),
    node('h3', { class: 'q-sheet-h', text: T('帳戶安全', 'Security') }),
    node('div', { class: 'q-rows' }, [
      act(T('登出其他所有裝置', 'Sign out every other device'), async () => {
        if (!(await ask({ lang: s.lang, icon: '🔒', title: T('登出其他所有裝置？', 'Sign out every other device?'), body: T('除了這台，所有裝置都會登出。', 'Every device but this one is signed out.'), ok: T('全部登出', 'Sign them out'), danger: true }))) return;
        await s.signOutEverywhere();
        note.textContent = T('其他裝置都已登出。', 'Every other device is signed out.');
      }),
      act(T('更換通行碼', 'Change my pass'), async () => {
        if (!(await ask({ lang: s.lang, icon: '🔑', title: T('換一組新的通行碼？', 'Get a new pass?'), body: T('舊通行碼立即失效，其他裝置會登出。新通行碼只顯示一次。', 'The old pass stops working and other devices sign out. The new one is shown once.'), ok: T('換新通行碼', 'Get a new pass'), danger: true }))) return;
        const passcode = await s.rotate();
        // The sheet closes first: a modal sheet stays above everything else,
        // so the new pass would open behind it.
        close();
        await showNewPass(s, passcode);
      }),
      act(
        T('在這台裝置登出', 'Sign out on this device'),
        async () => {
          if (!(await ask({ lang: s.lang, icon: '👋', title: T('在這台裝置登出？', 'Sign out on this device?'), body: T('這台裝置上的資料會全部清除，都保留在 Quadra Pass。', 'Everything on this device is wiped; it all stays on your Quadra Pass.'), ok: T('登出', 'Sign out') }))) return;
          s.signOut();
          location.reload();
        },
        'q-row-btn danger'
      )
    ]),
    node('p', { class: 'q-sheet-sub', text: T('忘記通行碼？在已登入的裝置按「更換通行碼」。', 'Forgot your pass? Choose “Change my pass” on a signed-in device.') }),
    note
  ];
  return { nodes, stop: () => clearInterval(tick) };
}
export function showNewPass(s, passcode) {
  const en = s.lang === 'en';
  const T = (zh, e) => (en ? e : zh);
  const shown = formatPass(passcode);
  const tail = String(passcode).replace(/[^0-9A-Za-z]/g, '').slice(-5).toUpperCase();
  return new Promise(resolve => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    const ok = node('button', { class: 'q-btn primary block', type: 'button', text: T('我已經記下來了', 'I’ve saved it'), disabled: true });
    const copy = node('button', {
      class: 'q-btn small',
      type: 'button',
      text: T('複製', 'Copy'),
      onclick: () => navigator.clipboard?.writeText(shown).then(() => (copy.textContent = T('已複製', 'Copied')))
    });
    const hint = node('small', { class: 'q-newpass-hint' });
    const check = node('input', { class: 'q-pass-input q-newpass-check num', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '5', placeholder: '•••••', 'aria-label': T('通行碼最後 5 個字', 'The last 5 characters of your pass') });
    check.addEventListener('input', () => {
      const typed = check.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      ok.disabled = typed !== tail;
      hint.textContent = typed.length === 5 && typed !== tail ? T('不對：請對照上面的通行碼。', 'That doesn’t match: check the pass above.') : '';
    });
    const box = node('dialog', { class: 'q-gate q-newpass', style: `--q-accent:${APPS[s.app].color}` }, [
      node('div', { class: 'q-gate-box' }, [
        node('p', { class: 'q-gate-brand', text: 'QUADRA PASS' }),
        node('h1', { class: 'q-gate-title', text: T('這是你的新通行碼', 'This is your new pass') }),
        node('div', { class: 'q-pass-code' }, [node('strong', { class: 'num', text: shown }), copy]),
        node('p', { class: 'q-gate-lede', text: T('只會顯示這一次，請記在安全的地方。', 'Shown only once: keep it somewhere safe.') }),
        node('label', { class: 'q-newpass-label', text: T('記好以後，輸入通行碼的最後 5 個字確認：', 'Once it’s saved, type its last 5 characters to confirm:') }),
        check,
        hint,
        ok
      ])
    ]);
    // Not closed by Esc or a tap outside: only by the confirmed button.
    ok.addEventListener('click', () => {
      dropFromTop(box);
      resolve();
    });
    keepOnTop(box);
  });
}

// ---- Notifications: the same in every app --------------------------------------------
//
// notify(s, { title, body, tag, hash }) shows an in-app banner while the app
// is on screen, and a system notification when it isn't (once allowed in
// the account sheet, per device). `tag` keeps one notice per thing (a slip,
// a match), `hash` is where tapping it goes, `kind` is its NOTICE_KINDS entry
// (a kind turned off in the account sheet is dropped).
//
// A phone stops an app in the background, so what's known ahead (a game's
// start, a class, a streak about to end) and what the Worker can find out
// itself (a final score, a price reached) goes to the Worker as a list,
// schedulePush(s, items), and arrives as a push notice while the app is
// closed (Shared-Proxy/push.js).

// Notices on for the pass (every app, every device) and allowed on this one.
export const notifyOn = () => notifyPrefs().on === true && globalThis.Notification?.permission === 'granted';

const PUSH_URL = ECO_URL.replace(/\/eco$/, '/push');
async function pushPost(s, path, body) {
  const token = await s.ensureToken?.().catch(() => s.token || '');
  if (!token) return null;
  // text/plain: no preflight request.
  return fetch(`${PUSH_URL}/${path}?qt=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);
}
const keyBytes = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)), c => c.charCodeAt(0));
// This device's push subscription, given to the Worker (again each day, or
// whenever it changes). False when this browser can't take pushes (an
// iPhone needs the app on the home screen, iOS 16.4 or later).
export async function enablePush(s, force = false) {
  if (!notifyOn() || !globalThis.navigator?.serviceWorker) return false;
  try {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 4000))]);
    if (!reg?.pushManager) return false;
    // The Worker's key, asked once a day (it was asked at every list change).
    const day = new Date().toDateString();
    const kept = readJson('quadra.push.key', null);
    const key = kept?.day === day && kept.key ? kept.key : (await fetch(`${PUSH_URL}/key`).then(r => r.json())).key;
    if (key && !(kept?.day === day && kept.key === key)) writeStore('quadra.push.key', JSON.stringify({ key, day }));
    let sub = await reg.pushManager.getSubscription();
    // One made with another key is replaced.
    const own = sub?.options?.applicationServerKey ? btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === key : true;
    if (sub && !own) await sub.unsubscribe().catch(() => {});
    if (!sub || !own) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    const mark = `${sub.endpoint}|${new Date().toDateString()}`;
    const storeKey = `quadra.push.sub.${s.app}`;
    if (!force && readStore(storeKey) === mark) return true;
    if (await pushPost(s, 'subscribe', { sub: sub.toJSON(), lang: s.lang })) writeStore(storeKey, mark);
    return true;
  } catch {
    return false;
  }
}
// The app's coming notices, for the Worker to send while the app is closed:
// [{ at, title, body, tag, hash, kind, check, until }] (check: see push.js). The
// whole list each time (it replaces the last); sent only when it changed.
export async function schedulePush(s, items) {
  if (!s?.app) return;
  const storeKey = `quadra.push.list.${s.app}`;
  // Turned off: the Worker's list emptied too (once).
  if (!notifyOn()) {
    // (Something of the person's own to send, and the pass wants notices: this phone asked, once.)
    if (items.some(x => x && kindOn(s.app, x.kind))) offerNotices(s);
    if (readStore(storeKey) && readStore(storeKey) !== '[]' && (await pushPost(s, 'schedule', { items: [] }))) writeStore(storeKey, '[]');
    return;
  }
  const base = `${globalThis.location?.origin || 'https://jaypengx.github.io'}${APPS[s.app]?.path || '/'}`;
  const list = items
    .filter(x => x && Number.isFinite(x.at) && kindOn(s.app, x.kind))
    .map(x => ({ at: Math.round(x.at), title: x.title || '', body: x.body || '', tag: `${s.app}:${x.tag || x.title}`, ...(x.kind ? { kind: x.kind } : {}), url: `${base}${x.hash ? `#${x.hash}` : ''}`, ...(x.check ? { check: x.check } : {}), ...(x.until ? { until: Math.round(x.until) } : {}) }))
    .sort((a, b) => a.at - b.at)
    .slice(0, 60);
  const text = JSON.stringify(list);
  if (readStore(storeKey) === text && readStore(`quadra.push.sub.${s.app}`)) return;
  if (!(await enablePush(s))) return;
  const before = readStore(storeKey);
  if (await pushPost(s, 'schedule', { items: list })) {
    keepPushed(s.app, before);
    writeStore(storeKey, text);
  }
}
// What the Worker had on the list and whose time has come was sent as a
// phone notice: remembered (two days) when the list is replaced, so the app
// doesn't show it again as a banner once its item is off the new list (a
// class's notice, then the app opened later in the same break).
const PUSHED_MS = 2 * 86_400_000;
function keepPushed(app, listText) {
  const now = Date.now();
  let kept = {};
  try {
    kept = JSON.parse(readStore(`quadra.push.sent.${app}`) || '{}') || {};
    for (const x of JSON.parse(listText || '[]')) if (x?.tag && x.at <= now) kept[x.tag] = x.at;
  } catch {}
  writeStore(`quadra.push.sent.${app}`, JSON.stringify(Object.fromEntries(Object.entries(kept).filter(([, at]) => at > now - PUSHED_MS))));
}
function pushedHere(app, key) {
  try {
    const now = Date.now();
    if (JSON.parse(readStore(`quadra.push.list.${app}`) || '[]').some(x => x.tag === key)) return true;
    const at = JSON.parse(readStore(`quadra.push.sent.${app}`) || '{}')[key];
    return Number.isFinite(at) && at > now - PUSHED_MS;
  } catch {
    return false;
  }
}

// Every kind of notice, by app: what it is and when it comes. Each can be
// turned off on its own; a kind that's off shows neither a banner nor a
// system notice, and the Worker drops it from what it sends while the app
// is closed.
export const NOTICE_KINDS = {
  match: [
    ['start', '比賽開打', 'A game starts', '你追蹤的球隊比賽開始時。', 'When a team you follow starts a game.'],
    ['end', '比賽結束', 'Final score', '你追蹤的球隊比賽結束，附上比分。', 'When a team you follow finishes a game, with the score.'],
    ['pick', '今日推薦開賽', 'Today’s picks start', '今日推薦的每一場開始時。', 'When each of today’s picks starts.'],
    ['pickend', '今日推薦賽果', 'Today’s picks: final', '今日推薦的每一場結束，附上比分。', 'When each of today’s picks ends, with the score.']
  ],
  odds: [
    ['slip', '投注單結算', 'Slip settled', '投注單的比賽全部結束、算好派彩時。', 'When every game on a slip is over and it’s paid.'],
    ['ticket', '彩券中獎', 'Lottery win', '電腦彩券開獎、你的彩券中獎時。', 'When a draw is out and your ticket won.'],
  ],
  vocab: [
    ['streak', '連續練習快斷了', 'Streak ending', '今天還沒練習單字，連續天數今晚就會歸零時。', 'When you haven’t practised today and your streak ends tonight.']
  ],
  stock: [
    ['alert', '價格提醒', 'Price alert', '你設定的價格提醒到價時。', 'When a price alert you set is reached.'],
    ['fill', '委託成交', 'Order filled', '掛單或定期定額成交時，和定期定額扣款日當天。', 'When an order or a monthly plan is filled, and on a plan’s day.'],
    ['order', '委託未成交', 'Order not filled', '委託到期失效、被取消，或定期定額這個月跳過時。', 'When an order lapses or is dropped, or a monthly plan skips a month.'],
    ['margin', '維持率與斷頭', 'Margin call', '維持率偏低，或融資、放空被強制處理時。', 'When margin runs low, or a loan or short is force-closed.'],
    ['income', '股利與利息', 'Dividends and interest', '除息、股利入帳、債券配息和活存利息入帳時。', 'When a holding goes ex-dividend, and when dividends, coupons or interest arrive.']
  ],
  slip: [
    ['start', '注單比賽開打', 'A ticket’s game starts', '注單上的比賽開始時。', 'When a game on one of your tickets starts.'],
    ['end', '注單比賽結束', 'A ticket’s game ends', '注單上的比賽結束，附上比分。', 'When a game on one of your tickets ends, with the score.']
  ],
  orbit: [['class', '上課提醒', 'Class reminder', '每堂課開始前 5 分鐘。', 'Five minutes before each class.']],
  weather: [
    ['brief', '早晨天氣', 'Morning weather', '每天早上一句話：降雨、溫度、紫外線、空氣。', 'Each morning in one line: rain, temperature, UV, air.'],
    ['rain', '降雨提醒', 'Rain alert', '白天 2 小時內可能下雨時，一天最多一次。', 'When rain is likely within 2 hours, once a day at most.']
  ],
  transit: [
    ['bus', '到站提醒', 'Bus alert', '你設定的公車快到站時，手機鎖著也會通知。', 'When a bus you set an alert for is nearly at your stop, even with the phone locked.'],
    ['nav', '導航提醒', 'Navigation', '導航中：該出發、要搭的公車快到了、火車快開、快到下車站，手機鎖著也會通知。', 'While navigating: time to leave, your bus nearly here, your train about to leave, your stop coming up, even with the phone locked.']
  ]
};

// The switches belong to the pass, not the device: the wallet setting
// `notify` ({ on, off: ['stock:alert', …] }, newest wins), so every app and
// every device follows the same ones (apps on a phone's home screen don't
// even share storage). This device keeps a copy (`quadra.notify.prefs`, with
// the time it was set) for when it's offline, and sends a newer one up when
// its app is the live one. `on` is "system notices wanted"; each device (and,
// on an iPhone, each app) still has to be allowed once by the phone.
const PREFS_KEY = 'quadra.notify.prefs';
const cleanPrefs = v => ({
  ...(typeof v?.on === 'boolean' ? { on: v.on } : {}),
  // (The ask closed once, anywhere: never asked again, in any app or on any device.)
  ...(v?.quiet === true ? { quiet: true } : {}),
  off: [...new Set((Array.isArray(v?.off) ? v.off : []).filter(k => typeof k === 'string' && /^[a-z]+:[a-z]+$/.test(k)))].sort()
});
export function notifyPrefs() {
  const saved = readJson(PREFS_KEY, null);
  return saved && typeof saved === 'object' ? { ...cleanPrefs(saved), t: Number(saved.t) || 0 } : { off: [], t: 0 };
}
const samePrefs = (a, b) => a.on === b.on && Boolean(a.quiet) === Boolean(b.quiet) && a.off.join() === b.off.join();
function savePrefs(next, s) {
  const prefs = { ...cleanPrefs(next), t: Date.now() };
  writeStore(PREFS_KEY, JSON.stringify(prefs));
  if (s) syncPrefs(s);
  return prefs;
}
// Whether notices of this kind are wanted (every kind is, until turned off).
export const kindOn = (app, kind) => !kind || !notifyPrefs().off.includes(`${app}:${kind}`);
export function setKind(app, kind, on, s = null) {
  const prefs = notifyPrefs();
  const off = prefs.off.filter(k => k !== `${app}:${kind}`);
  if (!on) off.push(`${app}:${kind}`);
  return savePrefs({ ...prefs, off }, s);
}
export const setNotifyOn = (on, s = null) => savePrefs({ ...notifyPrefs(), on: Boolean(on) }, s);
// The pass's copy and this device's, made one: the newer wins; a newer (or
// never uploaded) copy here goes up when this app may write; the Worker's
// copy (for notices sent while the app is closed) follows.
let syncingPrefs = null;
export function adoptNotifyPrefs(wallet) {
  const held = wallet?.settings?.notify;
  const mine = notifyPrefs();
  if (!held?.value || !(Number(held.t) > mine.t)) return false;
  writeStore(PREFS_KEY, JSON.stringify({ ...cleanPrefs(held.value), t: Number(held.t) }));
  return true;
}
export async function syncPrefs(s) {
  if (!s?.wallet || syncingPrefs) return;
  syncingPrefs = (async () => {
    adoptNotifyPrefs(s.wallet);
    const mine = notifyPrefs();
    const held = s.wallet.settings?.notify;
    const heldPrefs = held?.value ? cleanPrefs(held.value) : null;
    const worth = mine.on !== undefined || mine.off.length;
    if (s.active && worth && (!heldPrefs || (mine.t > (Number(held.t) || 0) && !samePrefs(mine, heldPrefs)))) {
      const t = mine.t || Date.now();
      const { t: _, ...value } = mine;
      await s.write({ wallet: { settings: { notify: { value, t } } } }).catch(() => null);
    }
    // The Worker's copy, once per change.
    const now = notifyPrefs();
    const text = JSON.stringify({ on: now.on !== false, off: now.off });
    if (readStore('quadra.push.prefs') !== text && (await pushPost(s, 'prefs', JSON.parse(text)))) writeStore('quadra.push.prefs', text);
  })().finally(() => (syncingPrefs = null));
  return syncingPrefs;
}

// Notices were turned on for the pass (on another device or in another
// app), but the phone hasn't been asked here yet: a banner offers it (the
// phone asks only after a tap) once this app has a notice of the person's
// own to send (a team followed, a reminder set), never as the app opens.
// Once per app on a device, ever; closed, never again anywhere (Jay
// 2026-10-21: "keep giving me in app notification to turn on notification").
function offerNotices(s) {
  if (typeof document === 'undefined' || !s.pass || !('Notification' in globalThis)) return;
  if (notifyPrefs().on !== true || notifyPrefs().quiet || Notification.permission !== 'default') return;
  if (readStore('quadra.notify.offered') || bannerEl?.isConnected) return;
  const T = (zh, e) => (s.lang === 'en' ? e : zh);
  bannerEl?.remove();
  const el = node('div', { class: 'q-banner q-banner-ask', role: 'dialog', 'aria-label': T('開啟通知', 'Turn on notices'), style: `--q-accent:${APPS[s.app].color}` }, [
    node('img', { src: './favicon.svg', alt: '' }),
    node('div', {}, [node('strong', { text: T('在這裡也開啟通知？', 'Notices here too?') }), node('span', { text: T(`你的 Quadra Pass 開啟了通知，${APPS[s.app].short} 在這台裝置還需要允許一次。`, `Your Quadra Pass has notices on; ${APPS[s.app].short} on this device needs allowing once.`) })]),
    node('button', { class: 'q-banner-go', type: 'button', text: T('允許', 'Allow') }),
    node('button', { class: 'q-banner-x', type: 'button', 'aria-label': T('關閉', 'Close'), text: '×' })
  ]);
  writeStore('quadra.notify.offered', String(Date.now()));
  const gone = (quiet = false) => {
    if (quiet) savePrefs({ ...notifyPrefs(), quiet: true }, s);
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  };
  el.querySelector('.q-banner-x').addEventListener('click', () => gone(true));
  el.querySelector('.q-banner-go').addEventListener('click', async () => {
    const p = await Notification.requestPermission().catch(() => 'denied');
    if (p === 'granted') enablePush(s, true);
    gone();
  });
  document.body.append(el);
  bannerEl = el;
}

// A switch: role=switch, aria-checked.
function toggle(on, label, onchange) {
  const b = node('button', { class: 'q-switch', type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': label });
  b.addEventListener('click', async () => {
    haptic();
    const next = b.getAttribute('aria-checked') !== 'true';
    const ok = await onchange(next);
    if (ok !== false) b.setAttribute('aria-checked', String(next));
  });
  return b;
}

// The account sheet's notices: system notices for the pass (on, off, or
// not allowed yet by this phone), then every kind of notice with what it is
// and its own switch. All of them follow the pass to every app and device.
function notifyRows(s, note) {
  const en = s.lang === 'en';
  const T = (zh, e) => (en ? e : zh);
  const supported = 'Notification' in globalThis;
  const state = () => {
    if (!supported) return notifyPrefs().on ? T('已開啟；這個瀏覽器收不到通知', 'On; this browser can’t show them') : T('這個瀏覽器不支援', 'Not supported here');
    if (Notification.permission === 'denied') return T('這台裝置封鎖了通知：請到系統設定允許', 'Blocked on this device: allow them in system settings');
    if (notifyOn()) return T('開啟：每個 App、每台裝置', 'On: every app, every device');
    if (notifyPrefs().on) return T('已開啟；這台裝置還沒允許，點開關允許', 'On; not allowed on this device yet: tap to allow');
    return T('關閉', 'Off');
  };
  const sub = node('small', { class: 'q-notice-sub', text: state() });
  const master = node('div', { class: 'q-notice-row master' }, [
    // Notifications' own red tile, as iOS's Settings draws it (no emoji).
    tile(icons.bell, 'var(--q-red)'),
    node('div', { class: 'q-notice-text' }, [node('strong', { text: T('系統通知', 'System notices') }), sub]),
    supported
      ? toggle(notifyOn(), T('系統通知', 'System notices'), async on => {
          if (!on) {
            setNotifyOn(false, s);
            sub.textContent = state();
            schedulePush(s, []);
            return true;
          }
          const p = await Notification.requestPermission().catch(() => 'denied');
          if (p === 'granted') {
            setNotifyOn(true, s);
            enablePush(s, true);
          } else note.textContent = T('請到系統設定允許通知。', 'Allow notifications in system settings.');
          sub.textContent = state();
          return p === 'granted';
        })
      : null
  ]);
  // This app's kinds first, then the rest.
  const order = [s.app, ...Object.keys(NOTICE_KINDS).filter(a => a !== s.app)].filter(a => NOTICE_KINDS[a] && APPS[a]);
  const groups = order.map(app =>
    node('div', { class: 'q-notice-group' }, [
      node('p', { class: 'q-notice-app', text: APPS[app].short }),
      ...NOTICE_KINDS[app].map(([kind, zh, e, dzh, de]) =>
        node('div', { class: 'q-notice-row' }, [
          node('div', { class: 'q-notice-text' }, [node('strong', { text: T(zh, e) }), node('small', { class: 'q-notice-sub', text: T(dzh, de) })]),
          toggle(kindOn(app, kind), T(zh, e), on => void setKind(app, kind, on, s))
        ])
      )
    ])
  );
  return [
    node('div', { class: 'q-rows' }, [master]),
    node('p', { class: 'q-notice-note', text: T('通知設定跟著 Quadra Pass：在每個 App、每台裝置都一樣。', 'Notice settings follow your Quadra Pass: the same in every app, on every device.') }),
    node('div', { class: 'q-rows q-notice-kinds' }, groups)
  ];
}

const shown = new Set();
export async function notify(s, { title, body = '', tag = '', hash = '', kind = '' }) {
  if (!kindOn(s.app, kind)) return;
  const key = `${s.app}:${tag || title}`;
  if (tag && shown.has(key)) return;
  if (tag) shown.add(key);
  // One the Worker sends (or already sent) this device as a phone notice
  // (schedulePush, push on here): no banner on top of it.
  if (tag && notifyOn() && readStore(`quadra.push.sub.${s.app}`) && pushedHere(s.app, key)) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return queueBanner(s, { title, body, hash });
  if (!notifyOn()) return;
  const options = { body, tag: key, icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { url: `${APPS[s.app].path}${hash ? `#${hash}` : ''}` } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) return void (await reg.showNotification(title, options));
    const n = new Notification(title, options);
    n.onclick = () => {
      globalThis.focus?.();
      if (hash) location.hash = hash;
      n.close();
    };
  } catch {}
}
// Notices that come together (the first sign-in on a device, catching up
// after a while away) are one banner: the first, and how many more.
let bannerQueue = null;
function queueBanner(s, notice) {
  if (bannerQueue) return void bannerQueue.push(notice);
  bannerQueue = [notice];
  setTimeout(() => {
    const list = bannerQueue;
    bannerQueue = null;
    if (list.length === 1) return banner(s, list[0]);
    const zh = !/^en/i.test(globalThis.navigator?.language || '');
    banner(s, { title: list[0].title, body: zh ? `還有 ${list.length - 1} 則通知` : `and ${list.length - 1} more`, hash: list[0].hash, more: list.slice(1) });
  }, 700);
}
let bannerEl = null;
function banner(s, { title, body, hash, more = [] }) {
  bannerEl?.remove();
  const el = node('div', { class: 'q-banner', role: 'status', style: `--q-accent:${APPS[s.app].color}` }, [
    node('img', { src: './favicon.svg', alt: '' }),
    node('div', {}, [node('strong', { text: title }), body ? node('span', { text: body }) : null])
  ]);
  const gone = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  };
  let open = false;
  el.addEventListener('click', () => {
    // A grouped banner: the first tap lists them all, the next closes it.
    if (more.length && !open) {
      open = true;
      el.classList.add('open');
      el.append(node('ul', { class: 'q-banner-more' }, more.map(n => node('li', {}, [node('strong', { text: n.title }), n.body ? node('span', { text: n.body }) : null]))));
      return;
    }
    if (hash) location.hash = hash;
    gone();
  });
  document.body.append(el);
  bannerEl = el;
  setTimeout(() => !open && gone(), more.length ? 7000 : 5000);
}

// ---- Shell: installed-only on phones, and always the newest version ------------------------

// Whether to ask the phone where it is now: iOS is asked unprompted once
// per app (`key`, the app's own note that it asked), never at every open,
// return or tick; a phone that would ask again (iOS's 允許一次, 下次詢問, a
// grant that lapsed) is left alone and the app uses the last place it
// kept, until the person taps to locate (`force`). 'yes' | 'no' | 'denied'.
// (Transit asked at every open and every minute; Weather once.)
export async function mayLocate(key, { force = false } = {}) {
  let state = 'unknown';
  try {
    state = (await navigator.permissions?.query({ name: 'geolocation' }))?.state || 'unknown';
  } catch {}
  if (state === 'denied') return 'denied';
  if (state === 'granted') return 'yes';
  if (!force && readStore(key) === '1') return 'no';
  writeStore(key, '1');
  return 'yes';
}
export function isStandalone() {
  return Boolean(globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.matchMedia?.('(display-mode: fullscreen)').matches || globalThis.navigator?.standalone);
}
export function isPhoneOrTablet() {
  const ua = globalThis.navigator?.userAgent || '';
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  return /Macintosh/.test(ua) && (globalThis.navigator?.maxTouchPoints || 0) > 1;
}
const isIOS = () => /iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgent || '') || (/Macintosh/.test(globalThis.navigator?.userAgent || '') && (globalThis.navigator?.maxTouchPoints || 0) > 1);
const inAppBrowser = () => /Line\/|FBAN|FBAV|Instagram|Messenger|MicroMessenger|KAKAOTALK/i.test(globalThis.navigator?.userAgent || '');
// On phones and tablets the apps run from the home screen only, every one
// of them: opened from another app or a link in Safari, it asks to be added
// too (a hand-over no longer lets it run in the browser). Returns true when
// it covered the page (the app shouldn't start).
let installCovered = false;
export function installGate(app, lang = detectLang()) {
  if (!isPhoneOrTablet() || isStandalone()) return false;
  if (installCovered) return true;
  installCovered = true;
  const en = lang === 'en';
  const name = appName(app);
  const steps = inAppBrowser()
    ? en
      ? ['Open this page in Safari (iPhone) or Chrome (Android): tap ⋯ and “Open in browser”.', 'Then add it to your home screen.']
      : ['請先用 Safari（iPhone）或 Chrome（Android）開啟：點右上角 ⋯，選「在瀏覽器開啟」。', '再加入主畫面。']
    : isIOS()
      ? en
        ? ['Tap Share (the square with an arrow) in Safari.', 'Choose “Add to Home Screen”, then “Add”.', `Open ${name} from its new icon.`]
        : ['點 Safari 的「分享」（方框加箭頭）。', '選「加入主畫面」，再點「新增」。', `從主畫面的新圖示打開 ${name}。`]
      : en
        ? ['Tap ⋮ at the top right of Chrome.', 'Choose “Add to Home screen” (or “Install app”).', `Open ${name} from its new icon.`]
        : ['點 Chrome 右上角的 ⋮。', '選「加入主畫面」或「安裝應用程式」。', `從主畫面的新圖示打開 ${name}。`];
  const gate = node('dialog', { class: 'q-gate q-install', 'aria-modal': 'true', style: `--q-accent:${APPS[app].color}` }, [
    node('div', { class: 'q-gate-box' }, [
      node('img', { class: 'q-gate-icon', src: './favicon.svg', alt: '', width: '72', height: '72' }),
      node('p', { class: 'q-gate-brand', text: APPS[app].family === 'orbit' ? 'ORBIT' : 'QUADRA' }),
      node('h1', { class: 'q-gate-title', text: en ? `Add ${name} to your home screen` : `把 ${name} 加入主畫面` }),
      node(
        'ol',
        { class: 'q-steps' },
        steps.map(t => node('li', { text: t }))
      )
    ])
  ]);
  keepOnTop(gate);
  document.documentElement.classList.add('q-signing-in');
  document.getElementById('loading')?.setAttribute('hidden', '');
  return true;
}

// A phone-only app on a computer: covers the page with where to open it
// instead (a QR code the app draws, `qr` as SVG markup, and the link), then
// how to add it to the home screen. Returns true when it covered the page.
export function phoneOnlyGate(app, { lang = detectLang(), qr = '' } = {}) {
  if (isPhoneOrTablet()) return false;
  const en = lang === 'en';
  const name = appName(app);
  const url = `${SITE}${APPS[app].path}`;
  const qrBox = node('div', { class: 'q-qr', role: 'img', 'aria-label': en ? `QR code for ${url}` : `${url} 的 QR code` });
  qrBox.innerHTML = qr;
  const copy = node('button', {
    class: 'q-btn',
    type: 'button',
    text: en ? 'Copy the link' : '複製連結',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(url);
        copy.textContent = en ? 'Copied ✓' : '已複製 ✓';
      } catch {}
    }
  });
  const gate = node('dialog', { class: 'q-gate q-phone-only', 'aria-modal': 'true', style: `--q-accent:${APPS[app].color}` }, [
    node('div', { class: 'q-gate-box' }, [
      node('img', { class: 'q-gate-icon', src: './favicon.svg', alt: '', width: '72', height: '72' }),
      node('p', { class: 'q-gate-brand', text: APPS[app].family === 'orbit' ? 'ORBIT' : 'QUADRA' }),
      node('h1', { class: 'q-gate-title', text: en ? `${name} is made for your phone` : `${name} 是手機 App` }),
      node('p', { class: 'q-gate-lede', text: en ? 'It lives in your pocket, beside your day. Open it on your phone:' : '課表跟著你一整天，所以只在手機上使用。用手機打開：' }),
      qrBox,
      node('p', { class: 'q-qr-url', text: url.replace(/^https:\/\//, '') }),
      copy,
      node(
        'ol',
        { class: 'q-steps' },
        (en
          ? ['Scan the code with your phone’s camera (or open the link on it).', 'Add it to the home screen: Share → “Add to Home Screen” on iPhone, ⋮ → “Install app” on Android.', 'Sign in with your Quadra Pass or a device code: your schedule is already there.']
          : ['用手機相機掃描上面的條碼（或在手機打開連結）。', '加入主畫面：iPhone 點「分享」→「加入主畫面」；Android 點 ⋮ →「安裝應用程式」。', '用 Quadra Pass 或裝置代碼登入，課表就在裡面。']
        ).map(t => node('li', { text: t }))
      )
    ])
  ]);
  keepOnTop(gate);
  document.documentElement.classList.add('q-signing-in');
  document.getElementById('loading')?.setAttribute('hidden', '');
  return true;
}

// Keeps every open Quadra page on the latest deploy, at once, whatever the
// person is doing (the owner's rule: an update never waits for a sheet to
// close or a relaunch). version.json is read as soon as the kit loads (this
// module starts the watch itself from the page's build-version, before the
// app's own start has finished), every `every` ms, whenever the page comes
// back into view, gets focus or comes online, and as soon as any other open
// Quadra page has found an update (a BroadcastChannel). A newer deploy is put
// in place straight away: the place on the page kept (rememberPlace), the new
// page loaded (cached files kept: each file's address is its content's, so
// only what changed downloads again). A reload that came back on the
// old page (GitHub's CDN a moment behind the deploy) is tried again a few
// seconds later, not left for the next launch.
// The kit, loaded from one place for every app (kit/loader.html), has its
// own version. kitLatest() notes the newest one for the next page load
// and each file's hash (quadra.kit and quadra.kitFiles, which the loader
// reads) and says whether this page runs an older one: 'kit:<version>', or
// null when it's current. The first version seen on a device is only noted:
// that page already runs the latest (or the hashes its deploy baked in).
const KIT = () => globalThis.QUADRA_KIT;
async function kitLatest() {
  const kit = KIT();
  if (!kit?.base) return null;
  try {
    const res = await fetch(`${kit.base}version.json?t=${Date.now()}`, { cache: 'no-store' });
    const got = res.ok ? await res.json() : null;
    const latest = got?.version;
    if (!latest) return null;
    if (readStore('quadra.kit') !== latest) writeStore('quadra.kit', latest);
    const files = got.files ? JSON.stringify({ version: latest, files: got.files }) : null;
    if (files && readStore('quadra.kitFiles') !== files) writeStore('quadra.kitFiles', files);
    if (latest === kit.version) return null;
    if (!kit.version || kit.noted === false) {
      kit.version = latest;
      kit.noted = true;
      return null;
    }
    return `kit:${latest}`;
  } catch {
    return null;
  }
}

// Whether the app may lift its loading screen: once boot.js's first update
// check has answered, true; false when that check is reloading the page onto
// a newer deploy (the app then shows nothing, so a person never sees the old
// screen swapped out). Waited for 0.8 s at most: version.json is a round
// trip on every opening (1-2 s on a phone's link, up to 7 s on a bad one,
// with the kept app ready long before); one later than that is the watch's.
export async function updateChecked(max = 800) {
  const boot = globalThis.__bootCheck;
  if (!boot?.then) return true;
  const r = await Promise.race([boot.catch(() => 'watch'), new Promise(done => setTimeout(() => done('late'), max))]);
  return r !== 'boot';
}

// Sound playing (an app's <audio> or <video>, on the page or not): an update waits for it to stop,
// never cutting the music off (Beats in the background, back on the screen). Each element is noted as it
// plays; the music paused or ended, the next check updates.
const media = new Set();
if (typeof HTMLMediaElement !== 'undefined') {
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    media.add(this);
    return play.apply(this, args);
  };
}
export function sounding() {
  for (const m of media) if (m.paused || m.ended) media.delete(m);
  if (media.size) return true;
  try {
    return globalThis.navigator?.mediaSession?.playbackState === 'playing';
  } catch {
    return false;
  }
}

let watching = null;
export function watchUpdates({ current, key, every = 15_000 } = {}) {
  if (!current || current === 'dev' || typeof document === 'undefined') return;
  // Started already (by the kit itself, or an earlier call): one watch a page.
  if (watching) return;
  watching = { current, key };
  let checking = false;
  let retry = 0;
  const channel = globalThis.BroadcastChannel ? new BroadcastChannel('quadra-updates') : null;
  async function apply(latest) {
    // (Music playing: not now. The check every few seconds, or the next opening, updates once it stops.)
    if (sounding()) return;
    // (Out of sight: never. All the apps share one site, so one app finding
    // a new kit told every other app, and Beats playing in the background
    // reloaded and stopped (2026-10-21). Coming back on screen checks at once.)
    if (document.visibilityState === 'hidden') return;
    // The same deploy tried again at most 6 times in the session, 5 s apart.
    const flag = `${key || 'quadra'}.reloadedTo`;
    const [was, tries = 0, at = 0] = String(sessionStorage.getItem(flag) || '').split('|');
    const n = was === latest ? Number(tries) || 0 : 0;
    if (n >= 6) return;
    const wait = n ? 5_000 - (Date.now() - Number(at)) : 0;
    if (wait > 0) {
      clearTimeout(retry);
      retry = setTimeout(() => check(true), wait + 50);
      return;
    }
    sessionStorage.setItem(flag, `${latest}|${n + 1}|${Date.now()}`);
    rememberPlace();
    // (Leaving: what the page still had on the way fails as the page goes, and says nothing of the network.)
    globalThis.__bootUpdating = true;
    // Only the kit changed: the same page again, its loader now on the new
    // kit (the app's own files are still current).
    if (latest.startsWith('kit:')) return location.reload();
    // (The files kept on the phone stay: every one is kept under its own
    // hash, so the new page asks only for the ones that changed. They were
    // all dropped here, and every update downloaded the whole app again.)
    const reg = await navigator.serviceWorker?.getRegistration?.(location.pathname);
    await reg?.update?.().catch(() => {});
    location.replace(`${location.pathname}?v=${encodeURIComponent(latest)}${location.hash}`);
  }
  // An opening asks once: boot.js has just asked (window.__bootChecked), and
  // the page's first check, its pageshow and its focus come within seconds.
  let lastAt = globalThis.__bootChecked || 0;
  async function check(force = false) {
    if (checking || (!force && Date.now() - lastAt < 3000)) return;
    checking = true;
    lastAt = Date.now();
    try {
      const [res, kitNew] = await Promise.all([fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' }), kitLatest()]);
      const appNew = res.ok ? (await res.json())?.version : null;
      const latest = appNew && appNew !== current ? appNew : kitNew;
      if (!latest) return;
      channel?.postMessage({ update: key || location.pathname });
      await apply(latest);
    } catch {
    } finally {
      checking = false;
    }
  }
  // boot.js's first look: a newer deploy it found with the app already on screen
  // (or a version it couldn't read) is looked for again at once.
  const boot = globalThis.__bootCheck;
  if (boot?.then) boot.then(r => r !== 'boot' && r !== 'none' && check(true), () => check(true));
  else check();
  channel?.addEventListener('message', () => check(true));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  globalThis.addEventListener?.('focus', () => check());
  globalThis.addEventListener?.('online', () => check(true));
  globalThis.addEventListener?.('pageshow', () => check());
  // A part of the app that didn't load (a screen's module the CDN answered with another version): a newer deploy looked for at once.
  globalThis.addEventListener?.('unhandledrejection', e => /import|module/i.test(String(e?.reason?.message || e?.reason || '')) && check(true));
  // (Not while the app is out of sight: coming back asks at once.)
  setInterval(() => document.visibilityState !== 'hidden' && check(), every);
}
// Every app's page starts the watch as the kit loads: its build-version, the
// same one it passes to watchUpdates later (that call then finds it running).
if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  const current = document.querySelector('meta[name="build-version"]')?.content;
  if (current) watchUpdates({ current, key: `quadra.page:${location.pathname}` });
  // Back from an update's reload: the scroll put back once the app lifts its loading screen, in every app.
  const box = document.getElementById('loading');
  let placed = false;
  try {
    placed = Boolean(sessionStorage.getItem('quadra.place'));
  } catch {}
  if (box && placed && typeof MutationObserver !== 'undefined') {
    const seen = new MutationObserver(() => {
      if (!box.hidden) return;
      seen.disconnect();
      restorePlace();
    });
    seen.observe(box, { attributes: true, attributeFilter: ['hidden'] });
  }
}

// Strips that scroll sideways (chips, tabs, dates) keep their place when
// the app redraws them: a redraw replaces the strip with a new one at the
// start, which threw the person back to the first chip after every tap. The
// kit notes where each strip was scrolled (by the nearest element with an
// id, its class and its place among its likes) by the item first in view
// (its text, and how far into view), and after any redraw puts a fresh
// strip back at that same item, unless the app placed it itself. A strip
// redrawn with other items (a sport's season days in place of the month,
// another league's rounds) has no such item and is left where the app put
// it: a pixel offset carried over landed months away. A newly chosen
// chip (aria-pressed / aria-selected / .active / .on) is brought into view,
// the one the person scrolled away from never pulled back. Every app,
// every strip, nothing to call.
function keepStrips() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || globalThis.__quadraStrips) return;
  globalThis.__quadraStrips = true;
  const kept = new Map();
  const host = el => el.parentElement?.closest('[id]') || document.body;
  const classOf = el => (typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(c => !/^(is-|on$|active$|open$|stuck$)/.test(c)).sort().join('.') : '');
  // Its likes found by the browser's own class match (a tag alone was every
  // div in the page, its classes split and sorted, on every redraw: 30–50 ms
  // a tap on a Mac, more on a phone), then the exact classes compared.
  const likes = (h, tag, cls) => [...h.querySelectorAll(cls ? `${tag}.${cls.split('.').map(c => CSS.escape(c)).join('.')}` : tag)].filter(x => classOf(x) === cls);
  // (Worked out once for a strip: a scroll asks for it at every frame.)
  const sigs = new WeakMap();
  const signature = el => {
    if (sigs.has(el)) return sigs.get(el);
    const h = host(el);
    const cls = classOf(el);
    const index = likes(h, el.tagName, cls).indexOf(el);
    const sig = { key: `${h.id || 'body'}|${el.tagName}|${cls}|${index}`, hostId: h.id || '', tag: el.tagName, cls, index };
    sigs.set(el, sig);
    return sig;
  };
  const sideways = el => el instanceof Element && el.scrollWidth > el.clientWidth + 2;
  const note = el => {
    if (!sideways(el)) return;
    const sig = signature(el);
    // The chip chosen then too: the same one still chosen after a redraw is
    // never pulled back into view (the person scrolled away from it).
    kept.set(sig.key, { ...sig, ...anchorOf(el), pick: el.querySelector(chosen)?.textContent ?? null, el });
  };
  // The item first in view: its text and how far it sits from the strip's left edge.
  const anchorOf = el => {
    const box = el.getBoundingClientRect();
    const item = [...el.children].find(c => c.getBoundingClientRect().right > box.left + 1);
    return item ? { text: item.textContent, at: item.getBoundingClientRect().left - box.left } : { text: null, at: 0 };
  };
  document.addEventListener('scroll', e => note(e.target), true);
  // A tap on a chip counts as where the strip was, even never scrolled.
  document.addEventListener('pointerdown', e => {
    for (let el = e.target instanceof Element ? e.target : null; el && el !== document.body; el = el.parentElement) if (sideways(el)) return note(el);
  }, true);
  const chosen = '[aria-pressed="true"], [aria-selected="true"], [aria-current="true"], [aria-current="page"], .active, .on, .selected';
  let queued = false;
  const restore = () => {
    queued = false;
    // (Every strip measured first, then every one scrolled: a measure after a
    // scroll lays the page out again, which was most of a league switch's
    // freeze in Sports on a phone.)
    const moves = [];
    for (const k of kept.values()) {
      // The strip still in the page: not redrawn, nothing to do (and nothing measured).
      if (k.el?.isConnected) continue;
      const h = k.hostId ? document.getElementById(k.hostId) : document.body;
      if (!h) continue;
      const el = likes(h, k.tag, k.cls)[k.index];
      if (!el || el.__quadraKept === k || !sideways(el)) continue;
      el.__quadraKept = k;
      k.el = el;
      if (el.scrollLeft !== 0) continue;
      const item = k.text == null ? null : [...el.children].find(c => c.textContent === k.text);
      if (!item) continue;
      const b = el.getBoundingClientRect();
      let by = item.getBoundingClientRect().left - b.left - k.at;
      const pick = el.querySelector(chosen);
      if (pick && pick.textContent !== k.pick) {
        // (Where the newly chosen chip lands after that scroll.)
        const a = pick.getBoundingClientRect();
        const left = a.left - by;
        const right = a.right - by;
        if (left < b.left || right > b.right) by += left < b.left ? left - b.left - 12 : right - b.right + 12;
      }
      moves.push([el, by]);
    }
    for (const [el, by] of moves) el.scrollLeft += by;
  };
  // Right after the redraw (before it's painted), so the strip never shows at its start.
  new MutationObserver(() => {
    if (queued || !kept.size) return;
    queued = true;
    restore();
  }).observe(document.documentElement, { childList: true, subtree: true });
}
keepStrips();

// The on-screen keyboard, in every app, nothing to call. iOS lays the
// keyboard over the page without shrinking it, then slides the whole screen
// up to show the field: a sheet's foot and its fields went under the keys,
// a search at the top was pushed off the screen. The kit follows the visible
// part of the screen (visualViewport) and writes it as CSS variables on
// <html>: --q-kb (how much the keys cover at the foot), --q-vvh (the height
// still seen); .q-kb while the keys are up. quadra.css lifts open sheets
// above the keys and fits them to what's left, hides the tab bar, and
// anything marked .q-kb-dock (a bar that belongs on top of the keys) sits
// there, as does a bar fixed at the foot holding the field (.q-kb-docked).
// A focused field is brought into view inside its own scroller, and the
// screen's slide put back when it only hid the top. A home-screen app on a
// newer iOS shrinks the page instead (innerHeight drops with the keys, the
// visible part no smaller than it): the keys are seen by the page's height
// against its height before typing, at the same width, so the tab bar still
// waits behind them and the composer still rides on them (--q-kb stays the
// part the keys cover, 0 there, since the page's foot is already on them).
function watchKeyboard() {
  const vv = globalThis.visualViewport;
  if (typeof document === 'undefined' || !vv || globalThis.__quadraKeyboard) return;
  globalThis.__quadraKeyboard = true;
  const root = document.documentElement;
  let frame = 0;
  // The page's height before any typing, at this width (an iPhone turned resets it).
  let full = 0, fullW = 0;
  const typing = () => {
    const el = document.activeElement;
    return Boolean(el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) && !/^(checkbox|radio|range|button|submit|color|file)$/.test(el.type));
  };
  const apply = () => {
    frame = 0;
    const now = typing();
    if (fullW !== globalThis.innerWidth) ((fullW = globalThis.innerWidth), (full = 0));
    full = now ? Math.max(full, globalThis.innerHeight) : globalThis.innerHeight;
    const shrunk = full ? full - globalThis.innerHeight : 0;
    // The keys' own height (iOS's slide doesn't change it) and what they cover at the foot.
    const keys = Math.max(0, Math.round(globalThis.innerHeight - vv.height));
    const up = (keys > 80 || shrunk > 80) && now;
    // Held while the same field is typed in: iOS's slide (vv.offsetTop) moves
    // as the page answers it, and a sheet lifted by each new reading moved,
    // iOS slid again, and the screen flickered (Jay 2026-10-21, an iPad on
    // its side: the sign-in and Play's stake). Read again for another field,
    // or keys that really changed height (more than 60px).
    const el = document.activeElement;
    if (!up) held = null;
    else if (!held || held.el !== el || Math.abs(held.keys - keys) > 60) {
      held = { el, keys, kb: Math.max(0, Math.round(globalThis.innerHeight - vv.height - vv.offsetTop)), vvh: Math.round(vv.height), lift: true };
    }
    root.style.setProperty('--q-kb', `${held ? held.kb : 0}px`);
    root.style.setProperty('--q-vvh', `${held ? held.vvh : Math.round(vv.height)}px`);
    root.classList.toggle('q-kb', up);
    for (const d of document.querySelectorAll('.q-kb-docked')) if (!up || !d.contains(document.activeElement)) d.classList.remove('q-kb-docked');
    // (Lifted once per field and keys, never on the scrolls and resizes it causes itself.)
    if (held?.lift) {
      held.lift = false;
      lift(el, held.kb);
    }
  };
  let held = null;
  // The field in what's left above the keys. One in a bar fixed at the
  // foot (a composer, a stake bar) rides on the keys with its bar; any
  // other is scrolled into view inside its own scroller (a sheet, a list,
  // the page) by just enough, measured against the visible part, since
  // the browser's own scrollIntoView doesn't know the keys are there. Then
  // the screen's slide is put back: iOS slid it up to show the field,
  // pushing the top off the edge, and the field now shows without it.
  const scroller = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (/auto|scroll/.test(o) && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return document.scrollingElement || root;
  };
  const lift = (el, kb) => {
    if (!el?.getBoundingClientRect) return;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      // (A bar at the foot: fixed, its lower edge in the screen's lower part, not a full-height panel.)
      const pr = cs.position === 'fixed' && p.getBoundingClientRect();
      if (pr && pr.bottom > globalThis.innerHeight * 0.6 && pr.height < globalThis.innerHeight * 0.5) return void p.classList.add('q-kb-docked');
      if (cs.position === 'fixed' || p.matches('dialog[open]')) break;
    }
    const top = vv.offsetTop + 8;
    let bottom = globalThis.innerHeight - kb - 12;
    // (A sheet's own bar at its foot, buy/sell or place, stays up over its content: the field goes above it too.)
    const foot = el.closest('dialog')?.querySelector('.q-sheet-foot');
    const fr = foot && !foot.contains(el) && foot.getBoundingClientRect();
    if (fr?.height && fr.top < bottom + 12) bottom = Math.min(bottom, fr.top - 8);
    const r = el.getBoundingClientRect();
    const by = r.bottom > bottom ? Math.min(r.bottom - bottom, r.top - top) : r.top < top ? r.top - top : 0;
    if (by) scroller(el).scrollBy?.({ top: by });
    if (vv.offsetTop > 0) {
      const after = el.getBoundingClientRect();
      if (after.top >= 0 && after.bottom <= globalThis.innerHeight - kb) globalThis.scrollTo?.(globalThis.scrollX, globalThis.scrollY - vv.offsetTop);
    }
  };
  const soon = () => (frame ||= requestAnimationFrame(apply));
  vv.addEventListener('resize', soon);
  vv.addEventListener('scroll', soon);
  globalThis.addEventListener?.('resize', soon);
  document.addEventListener('focusin', () => setTimeout(soon, 60));
  document.addEventListener('focusout', () => setTimeout(soon, 60));
  apply();
}
watchKeyboard();

// The loading screen lifts onto a finished screen, pictures included, in
// every app: when the app hides #loading with logos, faces or covers on the
// first screen still on their way, the kit keeps it up until they're in
// (at most 1.5 s more, counting ones drawn while it waits), so they don't
// pop in one by one after it lifted.
// Only the first lift, and never after "Open anyway" (boot.js) or offline.
function liftOnPictures() {
  const box = typeof document === 'undefined' ? null : document.getElementById('loading');
  if (!box || box.hidden || typeof MutationObserver === 'undefined') return;
  let done = false;
  const seen = new MutationObserver(() => {
    if (done || !box.hidden) return;
    done = true;
    seen.disconnect();
    if (box.dataset.now || globalThis.navigator?.onLine === false) return;
    const h = globalThis.innerHeight || 800;
    // (Each on-screen picture still coming, counted once; those added during the hold count too. One further along a rail is lazy: it loads as it scrolls in.)
    const pending = new Set();
    const look = () => {
      // (Dark logos swapped now, not a frame later: the white lion is what's waited for.)
      darkLogos();
      for (const img of document.images) {
        if (pending.has(img) || img.complete || img.closest('#loading, [hidden]')) continue;
        const r = img.getBoundingClientRect();
        if (r.width > 0 && r.bottom > 0 && r.top < h && r.right > 0 && r.left < (globalThis.innerWidth || 400)) {
          pending.add(img);
          const settle = () => (pending.delete(img), pending.size || queueMicrotask(lookAgain));
          img.addEventListener('load', settle, { once: true });
          img.addEventListener('error', settle, { once: true });
        }
      }
    };
    look();
    if (!pending.size) return;
    // (Back up before the next paint: the screen never shows half-drawn in between.)
    box.removeAttribute('hidden');
    let lifted = false;
    const lift = () => {
      if (lifted) return;
      lifted = true;
      added.disconnect();
      clearTimeout(cap);
      box.setAttribute('hidden', '');
    };
    // (The last picture in: one more look before lifting, for any added since.)
    function lookAgain() {
      if (lifted) return;
      look();
      if (!pending.size) lift();
    }
    // (Looked at once a frame, however many changes: each look measures every picture.)
    let queued = false;
    const added = new MutationObserver(() => {
      if (lifted || queued) return;
      queued = true;
      requestAnimationFrame(() => ((queued = false), lifted || look()));
    });
    added.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    const cap = setTimeout(lift, 1500);
  });
  seen.observe(box, { attributes: true, attributeFilter: ['hidden'] });
}
liftOnPictures();

// Names that must stay on one line (a long law, a team, a fund, a large
// title, English's longer words): any .q-fit, and the kit's own one-line
// names (a row's title, a large title, a stock's or a team's name), are
// shrunk just enough to fit their box (down to 72%) before any ellipsis,
// redone as the page changes or turns. Nothing to call.
const FIT = '.q-fit, .q-fit-wrap, .q-ritem-title, .q-nav-title, .q-seg > button, .q-stock-id b, .q-match-side b, .q-league strong';
export function fitNames(root = document) {
  // (Every box read first, then every size set: one layout, not one a name.)
  const todo = [];
  for (const el of root.querySelectorAll?.(FIT) || []) {
    // (A hidden tab's names wait for it to be shown: measuring them would lay it out.)
    if (el.closest('[hidden]')) continue;
    const w = el.clientWidth;
    if (!w) continue;
    // (A choice set in bold is wider: its own key.)
    const key = `${w}|${el.textContent}|${el.getAttribute('aria-pressed') || el.getAttribute('aria-selected') || ''}`;
    if (el.dataset.qFitKey === key) continue;
    // (.q-fit-wrap: a sentence more than a name, measured on one line, wrapped only when shrinking can't fit it.)
    const wraps = el.matches('.q-fit-wrap, .q-match-side b');
    if (wraps) el.classList.remove('q-wrapped');
    const cs = getComputedStyle(el);
    if (!wraps && !el.classList.contains('q-fit') && cs.whiteSpace !== 'nowrap') continue;
    // (Its own size noted once, whatever rule set it; the shrink is inline, so no rule outranks it.)
    const base = Number(el.dataset.qFit) || parseFloat(cs.fontSize);
    const was = parseFloat(el.style.fontSize) / base || 1;
    // (The text against the room inside the padding: only the text scales.)
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const k = Math.min(1, (w - pad - 1) / ((el.scrollWidth - pad) / was));
    todo.push([el, key, base, was, wraps && k < 0.72 ? 'wrap' : Math.max(0.72, k)]);
  }
  for (const [el, key, base, was, k] of todo) {
    el.dataset.qFit = String(base);
    el.dataset.qFitKey = key;
    if (k === 'wrap') {
      el.classList.add('q-wrapped');
      el.style.fontSize = '';
      continue;
    }
    if (Math.abs(k - was) > 0.01) el.style.fontSize = k === 1 ? '' : `${(base * k).toFixed(2)}px`;
  }
}
// A wrapped row of pills (.q-balance) never leaves one alone on its last
// line: the row is narrowed just enough that the last line takes two or
// more, as text-wrap: balance does for words (Law's quick questions came
// out 4 + 1). Redone with the names.
export function balanceRows(root = document) {
  for (const el of root.querySelectorAll?.('.q-balance') || []) {
    if (el.closest('[hidden]')) continue;
    const full = el.parentElement?.clientWidth || 0;
    const key = `${full}|${el.childElementCount}|${el.textContent.length}`;
    if (!full || el.dataset.qBal === key) continue;
    el.dataset.qBal = key;
    el.style.maxWidth = '';
    const rows = () => {
      const tops = [...el.children].filter(k => k.offsetWidth).map(k => k.offsetTop);
      const n = new Map();
      for (const t of tops) n.set(t, (n.get(t) || 0) + 1);
      return [...n].sort((x, y) => x[0] - y[0]).map(([, c]) => c);
    };
    const was = rows();
    if (was.length < 2 || was.at(-1) > 1) continue;
    // (The widest that leaves the last line two or more, as many lines as before.)
    let lo = full * 0.5;
    let hi = el.offsetWidth;
    let best = 0;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      el.style.maxWidth = `${Math.round(mid)}px`;
      const now = rows();
      if (now.length > was.length) lo = mid;
      else if (now.at(-1) > 1) ((best = mid), (lo = mid));
      else hi = mid;
    }
    el.style.maxWidth = best ? `${Math.round(best)}px` : '';
  }
}
function watchNames() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || globalThis.__quadraFit) return;
  globalThis.__quadraFit = true;
  let frame = 0;
  const soon = () => (frame ||= requestAnimationFrame(() => ((frame = 0), fitNames(), balanceRows())));
  const start = () => {
    // (A tab or sheet shown again counts too: a name drawn while hidden had no box to fit.)
    new MutationObserver(soon).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'open', 'aria-selected', 'aria-pressed'] });
    globalThis.addEventListener('resize', soon);
    soon();
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
watchNames();

// Logos on a dark screen, in every app: an ESPN team or league logo drawn
// on a dark tile is swapped for ESPN's own dark-screen version (500-dark:
// the white lion, the light wordmark) and back when the screen goes light,
// so no app needs a white plate behind its logos (Jay 2026-10-21: "hate the
// white in dark mode"). A logo still on a light plate keeps its own; one
// with no dark version (Falkirk) goes back at once, and is remembered.
const ESPN_LOGO = /^https:\/\/a\.espncdn\.com\/(?:i\/|combiner\/i\?img=\/i\/)(?:teamlogos|leaguelogos)\/(?!countries\/)[\w/-]*\/500\//;
// (The Premier League's purple lion, the kit's or an app's copy: its white one beside it.)
const EPL_LION = /\/img\/epl\.png(\?.*)?$/;
const noDark = new Set();
const darkIn = new Set();
const darkNow = () => {
  const de = document.documentElement;
  return de.dataset.theme === 'dark' || (de.dataset.theme !== 'light' && Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches));
};
export function darkLogos(root = document) {
  const dark = darkNow();
  swapLogos(root, dark);
  if (typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function') toneLogos(root, dark);
}
function swapLogos(root, dark) {
  const plateLight = img => {
    for (let p = img.parentElement, i = 0; p && i < 3; p = p.parentElement, i++) {
      const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(getComputedStyle(p).backgroundColor);
      if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) continue;
      return Math.min(m[1], m[2], m[3]) > 200;
    }
    return false;
  };
  // (ESPN's, and the kit's own purple lion wherever an app draws it: matchCard, liveStrip, a chip.)
  for (const img of root.querySelectorAll?.('img[src*="espncdn.com"], img[src*="/img/epl.png"], img[data-q-light]') || []) {
    const light = img.dataset.qLight;
    if (dark && !light) {
      const src = img.getAttribute('src') || '';
      // (A <picture> with a dark source picks its own.)
      const to = ESPN_LOGO.test(src) ? src.replace('/500/', '/500-dark/') : EPL_LION.test(src) ? src.replace(EPL_LION, '/img/epl-dark.png$1') : '';
      if (!to || noDark.has(src) || img.closest('[hidden], picture:has(source)') || plateLight(img)) continue;
      img.dataset.qLight = src;
      // (One already shown once comes straight from the cache: not held back as a lazy one.)
      if (darkIn.has(to)) img.loading = 'eager';
      img.setAttribute('src', to);
    } else if (!dark && light) {
      delete img.dataset.qLight;
      img.setAttribute('src', light);
    }
  }
}
// A logo's own tone on a dark screen, read from its pixels once (the hosts
// answer CORS): a dark mark in one colour with no light parts (歐冠's star
// ball, Ligue 1's grey) is drawn white (data-q-tone="mono"); a dark one in
// colours is drawn brighter, its own colours lifted ("color"); one with a few
// light parts but mostly lost against the dark tile (a dark blue wordmark
// with a grey swoosh, the Warriors' navy disc) is lifted too ("lift"); any
// other stays as it is. Never a light plate behind it (Jay: no white in dark
// mode). Remembered by address.
// (A colour's relative luminance, and the dark logo tile's: --q-grouped-3, #2c2c2e.)
const rel = (...c) => c.map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const TILE_L = rel(44 / 255, 44 / 255, 46 / 255);
const LOGO_HOST = /^https:\/\/(a\.espncdn\.com|r2\.thesportsdb\.com|www\.thesportsdb\.com|cdn\.nba\.com)\//;
const tones = new Map();
const toneOf = async url => {
  if (tones.has(url)) return tones.get(url);
  const job = (async () => {
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) return '';
      const bmp = await createImageBitmap(await res.blob());
      const n = 48;
      const c = new OffscreenCanvas(n, n);
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(bmp, 0, 0, n, n);
      const px = g.getImageData(0, 0, n, n).data;
      let count = 0;
      let lum = 0;
      let sat = 0;
      let light = 0;
      // (Against the dark logo tile, by contrast ratio: lost under 1.7, weak under 3, strong from 4.5;
      // edge: a pixel on the mark's outline, which is what the eye finds it by. Near-black parts
      // aren't counted lost or weak: lifting can't bring them out.)
      let lost = 0;
      let weak = 0;
      let strong = 0;
      let edge = 0;
      let edgeLost = 0;
      const solid = i => i >= 0 && i < px.length && px[i + 3] >= 140;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 140) continue;
        const [r, gr, b] = [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255];
        const max = Math.max(r, gr, b);
        const min = Math.min(r, gr, b);
        count++;
        const l = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
        lum += l;
        if (l > 0.55) light++;
        sat += max ? (max - min) / max : 0;
        const ratio = (Math.max(rel(r, gr, b), TILE_L) + 0.05) / (Math.min(rel(r, gr, b), TILE_L) + 0.05);
        const liftable = max > 0.2;
        if (ratio < 1.7 && liftable) lost++;
        if (ratio < 3 && liftable) weak++;
        if (ratio >= 4.5) strong++;
        const x = (i / 4) % n;
        if (x === 0 || x === n - 1 || !solid(i - 4) || !solid(i + 4) || !solid(i - n * 4) || !solid(i + n * 4)) {
          edge++;
          if (ratio < 1.7 && liftable) edgeLost++;
        }
      }
      // (A picture with a solid background, a photo: nothing to do.)
      if (!count || count > n * n * 0.92) return '';
      lum /= count;
      sat /= count;
      // (A logo with light parts of its own, a white outline, a cream crest, isn't whitened:
      // the Spurs' became a blank blob. Lifted only when most of it, outline and all, is lost
      // on the tile, or almost none of it stands out: a dark blue wordmark beside a grey swoosh.)
      if (lum >= 0.33 || light / count > 0.06) return (lost / count >= 0.45 && edgeLost / Math.max(edge, 1) >= 0.75) || (weak / count >= 0.7 && strong / count < 0.1) ? 'lift' : '';
      return sat < 0.25 ? 'mono' : 'color';
    } catch {
      return '';
    }
  })();
  tones.set(url, job);
  return job;
};
const toneLogos = (root, dark) => {
  for (const img of root.querySelectorAll?.('img') || []) {
    const src = img.currentSrc || img.getAttribute('src') || '';
    // (A logo host's, or any picture in a logo's tile: an app's own, Sports' lion.)
    // (A hidden tab's keep theirs, read when shown: nothing to lay out now.)
    if (dark && img.closest('[hidden]')) continue;
    if (!dark || !src || !(LOGO_HOST.test(src) || (img.closest('.q-logo, .league-badge, .logo') && new URL(src, location.href).origin === location.origin))) {
      delete img.dataset.qTone;
      delete img.dataset.qToneOf;
      continue;
    }
    // (Read once it's in, from the cache: never a second download beside the picture's own.)
    if (img.dataset.qToneOf === src || !img.complete) continue;
    img.dataset.qToneOf = src;
    toneOf(src).then(t => {
      if (img.dataset.qToneOf !== src) return;
      if (t) img.dataset.qTone = t;
      else delete img.dataset.qTone;
    });
  }
};
// (Called by ui.mjs wireLogos before any fallback: the dark version failed, the ordinary one instead.)
export function darkLogoFailed(img) {
  const light = img.dataset?.qLight;
  if (!light || !/\/500-dark\/|epl-dark\.png/.test(img.getAttribute('src') || '')) return false;
  noDark.add(light);
  delete img.dataset.qLight;
  // (Told to the logo fallbacks, which see this same error: not theirs.)
  img.dataset.qDarkFailed = '1';
  setTimeout(() => delete img.dataset.qDarkFailed, 0);
  img.setAttribute('src', light);
  return true;
}
function watchDarkLogos() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || globalThis.__quadraDarkLogos) return;
  globalThis.__quadraDarkLogos = true;
  let frame = 0;
  const soon = () => (frame ||= requestAnimationFrame(() => ((frame = 0), darkLogos())));
  const start = () => {
    // (A logo just added swapped at once, before it's laid out: a lazy one only ever fetches the dark version.)
    const added = records => {
      const dark = darkNow();
      if (dark) for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) swapLogos(n.tagName === 'IMG' ? n.parentElement || n : n, dark);
      soon();
    };
    new MutationObserver(added).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'hidden'] });
    new MutationObserver(soon).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', soon);
    // (One that fails before wireLogos runs: the ordinary one.)
    document.addEventListener('error', e => e.target?.tagName === 'IMG' && darkLogoFailed(e.target), true);
    // (A <picture> settles on its source when it loads: its tone read then.)
    document.addEventListener(
      'load',
      e => {
        if (e.target?.tagName !== 'IMG') return;
        if (e.target.dataset.qLight) darkIn.add(e.target.getAttribute('src'));
        if (e.target.dataset.qToneOf !== e.target.currentSrc) soon();
      },
      true
    );
    soon();
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
watchDarkLogos();

// Where the person was (the scroll), kept across a reload for an update and
// put back by restorePlace() once the app has painted.
const PLACE_KEY = 'quadra.place';
export function rememberPlace() {
  try {
    sessionStorage.setItem(PLACE_KEY, JSON.stringify({ path: location.pathname, hash: location.hash, y: Math.round(globalThis.scrollY || 0), t: Date.now() }));
  } catch {}
}
export function restorePlace() {
  try {
    const p = JSON.parse(sessionStorage.getItem(PLACE_KEY) || 'null');
    sessionStorage.removeItem(PLACE_KEY);
    if (p && p.path === location.pathname && p.hash === location.hash && Date.now() - p.t < 60_000 && p.y > 0) requestAnimationFrame(() => globalThis.scrollTo(0, p.y));
  } catch {}
}

// The fixed tab bar keeps clear of the iPhone's home indicator even when iOS
// reports no safe area after a resume (the largest inset seen is a floor).
const SAFE_KEY = 'quadra.safeBottom';
function steadyTabBar() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.getComputedStyle) return;
  const root = document.documentElement;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)';
  let seen = { p: 0, l: 0 };
  try {
    seen = { ...seen, ...JSON.parse(localStorage.getItem(SAFE_KEY) || '{}') };
  } catch {}
  const fix = () => {
    if (!document.body) return;
    if (!probe.isConnected) document.body.append(probe);
    const side = window.innerWidth > window.innerHeight ? 'l' : 'p';
    const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    if (inset > (seen[side] || 0) && inset < 80) {
      seen[side] = inset;
      try {
        localStorage.setItem(SAFE_KEY, JSON.stringify(seen));
      } catch {}
    }
    root.style.setProperty('--q-safe-bottom', `${isStandalone() ? seen[side] || 0 : 0}px`);
  };
  const settle = () => {
    fix();
    requestAnimationFrame(fix);
    for (const ms of [120, 400, 1000, 2000]) setTimeout(fix, ms);
  };
  for (const ev of ['resize', 'orientationchange', 'pageshow', 'focus']) window.addEventListener(ev, settle);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && settle());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', settle, { once: true });
  else settle();
}
steadyTabBar();

// ---- The connection: off, slow, or fine, said once for every app ----------------------------
//
// Every request the page makes beyond its own files is watched (the kit's
// and the app's own: Weather's forecast, Transit's buses). An answer of any
// kind means the network is there; a request that reached nothing, or the
// phone saying it's offline, means it isn't; one still waiting after 5 s
// with nothing answered meanwhile means it's slow. While it's off or slow a
// glass capsule over the tab bar says so (沒有網路連線, 網路連線很慢) and the
// app goes on with what the phone kept (every read answers its saved copy
// when the network fails); a tap tries again. Back on, the capsule goes
// and the app's own refresh runs (topActions' refresh) once.
// netState() 'online' | 'offline' | 'slow'.
const NET_SLOW_MS = 5000;
// The proxy's AI routes (Gemini at work for 5 to 30 s): their wait says nothing of the network.
const AI_ROUTES = /\/(law-chat|law-ask|law-gist|gemini|nl-edit|slip-scan)(\?|$)/;
export const slowByNature = url => {
  try {
    const u = new URL(url, globalThis.location?.href);
    return u.hostname.endsWith('.workers.dev') && AI_ROUTES.test(u.pathname + (u.search ? '?' : ''));
  } catch {
    return false;
  }
};
const net = { state: 'online', waiting: new Map(), lastOk: Date.now(), probing: 0, fails: 0, refresh: null, timer: 0, id: 0, only: null, reached: false, hadReached: false };
export const netState = () => net.state;
function setNet(next) {
  if (next === net.state) return;
  const was = net.state;
  net.state = next;
  rec('net', { next, was });
  paintNet();
  // Back on: the app's refresh; an online-only app that opened with no connection (its first screen never read) opens again.
  if (next === 'offline') net.hadReached = net.reached;
  if (next === 'online' && was === 'offline') setTimeout(() => (net.only && !net.hadReached ? location.reload() : net.refresh?.()), 0);
  clearInterval(net.timer);
  // While it's off or slow: judged each second, and the network tried every 10 s.
  if (next !== 'online') {
    let n = 0;
    net.timer = setInterval(() => (judgeNet(), ++n % 10 === 0 && probeNet()), 1000);
  }
}
// The rule: the phone says it's offline, or twice nothing was reached since
// the last answer (a phone on Wi-Fi without internet says it's online): off.
// Slow only on evidence about the connection itself: a request waiting over
// 5 s with nothing answered meanwhile is first put to the probe (a tiny file
// from GitHub Pages); only when that too is still waiting after 3 s is it
// slow. A slow Worker, ESPN or AI answer on a fast connection said 網路連線很慢
// (the owner on 300 Mbps, 2026-10-21): now the probe answers at once and the
// app just waits for that one answer (noted in 除錯紀錄 as 'slow', by address).
const PROBE_SLOW_MS = 3000;
// Away this long: coming back refreshes the app (watchNet).
const RESUME_AFTER_MS = 60_000;
export function netVerdict({ onLine = true, fails = 0, waitingSince = [], lastOk = 0, probing = 0, now = Date.now() } = {}) {
  if (onLine === false || fails >= 2) return 'offline';
  const waiting = waitingSince.some(t => now - t > NET_SLOW_MS) && now - lastOk > NET_SLOW_MS;
  return waiting && probing && now - probing > PROBE_SLOW_MS ? 'slow' : 'online';
}
function judgeNet() {
  const now = Date.now();
  const waits = [...net.waiting.values()];
  // Something has waited long with nothing answered: the probe asked (and judged again once it's had its 3 s).
  if (!net.probing && waits.some(t => now - t > NET_SLOW_MS) && now - net.lastOk > NET_SLOW_MS) {
    probeNet();
    setTimeout(judgeNet, PROBE_SLOW_MS + 50);
  }
  setNet(netVerdict({ onLine: globalThis.navigator?.onLine, fails: net.fails, waitingSince: waits, lastOk: net.lastOk, probing: net.probing, now }));
}
// One small ask that never comes from a copy: the kit's version.
function probeNet() {
  const base = globalThis.QUADRA_KIT?.base;
  if (!base || net.probing) return;
  net.probing = Date.now();
  globalThis
    .fetch(`${base}version.json?net=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    .catch(() => {})
    .finally(() => {
      net.probing = 0;
      judgeNet();
    });
}
function paintNet() {
  if (typeof document === 'undefined') return;
  paintCover();
  let box = document.querySelector('.q-net');
  if (net.state === 'online') {
    if (box && !box.classList.contains('out')) {
      box.classList.add('out');
      setTimeout(() => box.classList.contains('out') && box.remove(), 320);
    }
    document.documentElement.classList.remove('q-net-on');
    return;
  }
  const zh = detectLang() !== 'en';
  // (Off in an online-only app: its cover says it, not the capsule too.)
  if (net.only && net.state === 'offline') {
    box?.remove();
    document.documentElement.classList.remove('q-net-on');
    return;
  }
  if (!box) {
    box = node('button', { class: 'q-net', type: 'button', role: 'status', 'aria-live': 'polite' });
    box.addEventListener('click', () => {
      haptic();
      net.fails = 0;
      probeNet();
      net.refresh?.();
    });
    document.body.append(box);
  }
  box.classList.remove('out');
  box.dataset.state = net.state;
  box.innerHTML = `${icon(net.state)}<span></span>`;
  box.querySelector('span').textContent = net.state === 'offline' ? (zh ? '沒有網路連線' : 'No internet connection') : zh ? '網路連線很慢' : 'Slow internet connection';
  document.documentElement.classList.add('q-net-on');
}
// An app whose every screen is live (Securities' prices and trades, Play's
// odds, Transit's buses, Sports' scores): with no connection it isn't shown
// on what the phone kept (an hour-old price or bus reads as now), but
// covered: its mark, 沒有網路連線, why, and 重試. A slow connection never
// covers it (the capsule says so; the answers come). Apps that are useful on
// what they kept (Words, Weather, Class) don't call this and lock only what
// needs the network. `why`: one short line, { zh, en }.
export function onlineOnly(why = {}) {
  net.only = { why: (detectLang() === 'en' ? why.en : why.zh) || '' };
  // (The capsule too: one drawn before the app said so goes.)
  paintNet();
}
function paintCover() {
  if (typeof document === 'undefined' || !document.body) return;
  let cover = document.querySelector('.q-offline');
  if (!net.only || net.state !== 'offline') {
    cover?.remove();
    return;
  }
  if (cover) return;
  const zh = detectLang() !== 'en';
  const boot = document.getElementById('loading');
  const logo = boot?.getAttribute('data-logo') || './favicon.svg';
  const title = boot?.getAttribute('data-title') || document.title;
  cover = node('div', { class: 'q-offline', role: 'alert' }, [
    node('img', { class: 'q-offline-logo', src: logo, alt: '', width: 64, height: 64 }),
    node('p', { class: 'q-offline-app', text: title }),
    node('h2', { class: 'q-offline-title', text: zh ? '沒有網路連線' : 'No internet connection' }),
    net.only.why ? node('p', { class: 'q-offline-why', text: net.only.why }) : null
  ]);
  const again = node('button', { class: 'q-btn primary q-offline-again', type: 'button', text: zh ? '重試' : 'Try again' });
  again.addEventListener('click', () => {
    haptic();
    again.disabled = true;
    net.fails = 0;
    probeNet();
    setTimeout(() => ((again.disabled = false), judgeNet()), 1500);
  });
  cover.append(again);
  document.body.append(cover);
}
function watchNet() {
  if (typeof window === 'undefined' || window.__quadraNet || typeof window.fetch !== 'function') return;
  window.__quadraNet = true;
  const real = window.fetch.bind(window);
  const own = url => {
    try {
      const u = new URL(url, location.href);
      // The page's own files (its service worker keeps them) aren't the connection; the probe is.
      return u.origin === location.origin && !u.searchParams.has('net');
    } catch {
      return true;
    }
  };
  // The family's own: the proxy, the page's site (the kit's probe), the kit's.
  const ours = url => {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin || u.hostname.endsWith('.workers.dev') || (globalThis.QUADRA_KIT?.base && u.href.startsWith(new URL(globalThis.QUADRA_KIT.base, location.href).href));
    } catch {
      return true;
    }
  };
  let probedAt = 0;
  const probeSoon = () => Date.now() - probedAt > 5000 && ((probedAt = Date.now()), probeNet());
  // Requests that fail as the page goes (an update's reload) or that were
  // under way while the phone put the app away (iOS cuts them: "Load
  // failed" on coming back) say nothing of the network: an update showed
  // 沒有網路連線 over the app, and so did every return to it. Those ask the
  // probe instead.
  let leaving = false;
  let shownAt = 0;
  let hiddenAt = 0;
  // Back after a while away (or out of the browser's back-forward cache):
  // what failed meanwhile forgotten, and the app's own refresh run once, so
  // a screen that broke while the phone slept comes back by itself instead
  // of only after the app was closed and opened again.
  //
  // A page whose own code failed since it opened (an error nothing caught: a
  // screen half drawn, a timer stopped) starts again instead, in place (the
  // place kept, nothing downloaded again), at most once in 30 minutes, never
  // over music: what only a full restart of the app fixed before.
  let broken = 0;
  addEventListener('error', e => {
    if (e?.filename && String(e.filename).startsWith(location.origin)) broken += 1;
  });
  addEventListener('unhandledrejection', e => {
    const r = e?.reason;
    if (r instanceof Error && !['AbortError', 'TimeoutError'].includes(r.name) && !/load failed|failed to fetch|networkerror|network|offline/i.test(`${r.message} ${r.code || ''}`)) broken += 1;
  });
  const reboot = () => {
    if (!broken || sounding()) return false;
    try {
      const key = `quadra.reboot:${location.pathname}`;
      if (Date.now() - Number(sessionStorage.getItem(key) || 0) < 30 * 60_000) return false;
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      return false;
    }
    rec('reboot', { errors: broken });
    rememberPlace();
    globalThis.__bootUpdating = true;
    location.reload();
    return true;
  };
  const resume = () => {
    if (reboot()) return;
    net.fails = 0;
    judgeNet();
    setTimeout(() => net.refresh?.(), 400);
  };
  addEventListener('pagehide', () => (leaving = true));
  addEventListener('pageshow', event => {
    leaving = false;
    if (event.persisted) resume();
  });
  document.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'hidden') return void (hiddenAt = Date.now());
    shownAt = Date.now();
    if (hiddenAt && shownAt - hiddenAt > RESUME_AFTER_MS) resume();
  });
  // Which request was slow, for 除錯紀錄 (its site and path, never its query).
  // With the Worker's own time (Server-Timing), the rest being the way there and back.
  const noteSlow = (url, at, error, res) => {
    const ms = Date.now() - at;
    if (ms < NET_SLOW_MS) return;
    const server = Number(/(?:^|,)\s*w;dur=(\d+)/.exec(res?.headers?.get?.('Server-Timing') || '')?.[1]) || undefined;
    let where = '';
    try {
      const u = new URL(url, location.href);
      where = u.host + u.pathname;
    } catch {}
    rec('slow', { where, ms, server, failed: error ? error.name || 'error' : undefined, net: net.state });
  };
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (own(url)) return real(input, init);
    const k = ++net.id;
    const at = Date.now();
    // (An AI's answer takes its time: never read as a slow connection; its failure still counts.)
    if (!slowByNature(url)) net.waiting.set(k, Date.now());
    if (net.state === 'online') setTimeout(judgeNet, NET_SLOW_MS + 50);
    return real(input, init).then(
      res => {
        net.waiting.delete(k);
        noteSlow(url, at, null, res);
        net.lastOk = Date.now();
        net.reached = true;
        net.fails = 0;
        judgeNet();
        return res;
      },
      error => {
        net.waiting.delete(k);
        noteSlow(url, at, error);
        // Given up on by the app (a sheet closed): says nothing of the network. A time limit run out: slow at best.
        // Another site's refusal reads the same as no network (TheSportsDB's 429 has no CORS header: the
        // browser calls it a failed request, and two put an online-only app behind 沒有網路連線, 2026-10-17):
        // only the family's own (the proxy, the kit's probe) count; another's asks the probe instead.
        if (leaving || globalThis.__bootUpdating) throw error;
        const cut = document.visibilityState === 'hidden' || at <= shownAt + 1000;
        if (error?.name !== 'AbortError' && error?.name !== 'TimeoutError') ours(url) && !cut ? (net.fails += 1) : probeSoon();
        judgeNet();
        throw error;
      }
    );
  };
  addEventListener('offline', judgeNet);
  addEventListener('online', () => {
    net.fails = 0;
    probeNet();
    judgeNet();
  });
  // (Judged once the module has run: its icons are defined further on.)
  setTimeout(judgeNet, 0);
}
watchNet();

// The app's own files kept for opening without a connection: its service
// worker registered, and told every file the page has loaded (the first
// opening's too, before the worker was in charge; again when the app goes
// to the background, for what it loaded later), so it opens offline next
// time. Every app calls this in place of registering its own.
export function keepOffline(path = './sw.js') {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !globalThis.isSecureContext) return;
  const tell = reg => {
    const urls = [location.href.split('#')[0], ...performance.getEntriesByType('resource').map(e => e.name)].filter(u => u.startsWith(location.origin) && !/version\.json/.test(u));
    reg?.active?.postMessage({ type: 'cache', urls });
  };
  navigator.serviceWorker
    // (The worker itself always from the network: an update never waits on a browser's copy of sw.js.)
    .register(path, { updateViaCache: 'none' })
    .then(() => navigator.serviceWorker.ready)
    .then(reg => {
      tell(reg);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && tell(reg));
    })
    .catch(() => {});
}

// ---- The app frame: the tab bar and the top-right, the same in every app -------------------
//
// Every app's header is the same markup (index.html):
//   <header class="q-appbar"><div class="q-appbar-inner">
//     <div class="q-brand">logo, <h1 id="title">, <p id="status" class="q-status"></div>
//     <nav id="tabs" class="q-tabbar"></nav> <div id="top-actions" class="q-actions"></div>
//   </div></header>
// On a phone the tabs sit at the bottom and the header is only the status
// line and the buttons; on a wider screen it's one sticky bar.

// One drawing per idea, shared by every app (24×24, stroked).
export const ICONS = {
  home: '<path d="M3.5 10.6 12 4l8.5 6.6"/><path d="M5.5 9.3V20h13V9.3"/><path d="M10 20v-5.4h4V20"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  live: '<circle cx="12" cy="12" r="2.3"/><path d="M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6"/>',
  star: '<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  balls: '<circle cx="8" cy="8" r="4"/><circle cx="16.5" cy="16" r="4"/><circle cx="17" cy="7" r="2.4"/><circle cx="7.2" cy="17" r="2.4"/>',
  ticket: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V9a3 3 0 0 0 0 6v2.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5V15a3 3 0 0 0 0-6z"/><path d="M9.5 9h5M9.5 12h5M9.5 15h3"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3"/><path d="M3.5 4.5v4.3h4.3"/><path d="M12 7.5V12l3 2"/>',
  chart: '<path d="M4 20h16"/><path d="M5 16l4.2-5 3.6 3 6.2-8"/><circle cx="19" cy="6" r="1.4"/>',
  wallet: '<rect x="3.5" y="6.5" width="17" height="13.5" rx="3"/><path d="M8 6.5V5.3A1.8 1.8 0 0 1 9.8 3.5h4.4A1.8 1.8 0 0 1 16 5.3v1.2"/><path d="M3.5 12h17"/>',
  exchange: '<path d="M4 8.5h14l-3.2-3.2"/><path d="M20 15.5H6l3.2 3.2"/>',
  book: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14.5H7.5A2.5 2.5 0 0 0 5 20z"/><path d="M5 20a1.5 1.5 0 0 0 1.5 1.5H19v-4"/><path d="M9.5 7.5h6M9.5 11h4"/>',
  pass: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.2c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h3.5M14.5 13.5h2.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.2"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
  offline: '<path d="M2.5 8.8a14 14 0 0 1 4-2.6M9.6 5.2A14 14 0 0 1 21.5 8.8M5.6 12.3a9 9 0 0 1 3.7-2.1M14.7 10.3a9 9 0 0 1 3.7 2M8.9 15.7a4.5 4.5 0 0 1 6.2 0"/><circle cx="12" cy="19" r=".6"/><path d="M3.5 3.5l17 17"/>',
  slow: '<path d="M2.5 8.8a14 14 0 0 1 19 0" opacity=".3"/><path d="M5.6 12.3a9 9 0 0 1 12.8 0" opacity=".3"/><path d="M8.9 15.7a4.5 4.5 0 0 1 6.2 0"/><circle cx="12" cy="19" r=".6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.4a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 3.9"/><circle cx="12" cy="17.2" r=".5"/>',
  refresh: '<path d="M19.5 11.5a7.5 7.5 0 1 0-2.2 5.4"/><path d="M19.5 4.5v7h-7"/>'
};
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || name}</svg>`;
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// tabBar({ tabs: [{ id, label, icon }], onSelect }) draws the tab bar in #tabs
// and returns { select, badge, label, hide, current }.
//   onSelect(id, { again }): the app shows that tab (its own rendering), and
//     calls select(id) for the bar, the panels (#panel-<id>) and the address.
//   Tapping the tab that's already open scrolls it back to the top; tapped
//   again at the top, onSelect(id, { again: true }) (a tab may reset itself).
//   Each tab keeps its place: switching back returns to where it was
//   (select(id, { top: true }) starts it at the top instead).
//   hash(id): the address for a tab ('#<id>' by default; null leaves it).
export function tabBar({ tabs, onSelect, hash = id => `#${id}`, nav = document.getElementById('tabs'), label: ariaLabel = '' } = {}) {
  const buttons = new Map();
  const places = {};
  const visited = new Set();
  let current = null;
  nav.classList.add('q-tabbar');
  nav.setAttribute('role', 'tablist');
  if (ariaLabel) nav.setAttribute('aria-label', ariaLabel);
  nav.style.setProperty('--q-tabs', String(tabs.length));
  const again = id => {
    if ((globalThis.scrollY || 0) > 4) globalThis.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    else onSelect(id, { again: true });
  };
  for (const tab of tabs) {
    const b = node('button', { class: 'q-tab', id: `tab-${tab.id}`, type: 'button', role: 'tab', 'data-tab': tab.id, 'aria-controls': `panel-${tab.id}`, 'aria-selected': 'false', tabindex: '-1' });
    b.innerHTML = `<span class="q-tab-icon">${icon(tab.icon)}<b class="q-tab-badge" hidden></b></span><span class="q-tab-label"></span>`;
    b.querySelector('.q-tab-label').textContent = tab.label;
    b.addEventListener('click', () => (haptic(), tab.id === current ? again(tab.id) : onSelect(tab.id, { again: false })));
    buttons.set(tab.id, b);
  }
  nav.replaceChildren(...buttons.values());
  // The chosen tab's pill (the bar's ::before) slides to it on a spring:
  // its place and width as CSS variables, set without a slide the first time.
  const pill = (still = false) => {
    const b = buttons.get(current);
    if (!b || b.hidden || !b.offsetWidth) return;
    if (still) nav.style.setProperty('transition', 'none');
    nav.style.setProperty('--q-tab-x', `${b.offsetLeft}px`);
    nav.style.setProperty('--q-tab-w', `${b.offsetWidth}px`);
    if (still) requestAnimationFrame(() => requestAnimationFrame(() => nav.style.removeProperty('transition')));
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => pill(true)).observe(nav);
  // Scrolling down, the bar draws in to its icons; its labels come back at
  // the top, or after a scroll back up of a good part of the screen in one
  // go, as iOS's: not on a nudge up, nor on the page bouncing back at its foot
  // (a fling's rubber band moved it up a few px and brought them back). Only
  // a page with room to scroll (one that nearly fits, Transit's 交通 at 78 px,
  // never draws it in: its labels would come back only at its very top), and
  // never from what the page did itself: a page grown shorter pulling the
  // scroll up, or a tab's own place put back (a change of tab shows the whole
  // bar, as iOS's, the map's included).
  let lastY = globalThis.scrollY || 0;
  let lastMax = 0;
  let dir = 0;
  let turnY = lastY;
  const root = document.documentElement;
  const resetScroll = (y = globalThis.scrollY || 0) => {
    root.classList.remove('q-tabs-small');
    [lastY, dir, turnY] = [y, 0, y];
  };
  globalThis.addEventListener?.(
    'scroll',
    () => {
      const max = Math.max(0, root.scrollHeight - globalThis.innerHeight);
      const y = Math.min(Math.max(globalThis.scrollY || 0, 0), max);
      const shrunk = max < lastMax - 1 && y >= max - 1;
      lastMax = max;
      if (y < 40 || max < 200) return resetScroll(y);
      if (shrunk) return void ([lastY, turnY] = [y, y]);
      if (y > lastY) {
        if (dir !== 1) [dir, turnY] = [1, lastY];
        if (y - turnY > 12 && !reducedMotion()) root.classList.add('q-tabs-small');
      } else if (y < lastY) {
        if (dir !== -1) [dir, turnY] = [-1, lastY];
        if (turnY - y > Math.max(160, globalThis.innerHeight * 0.3)) root.classList.remove('q-tabs-small');
      }
      lastY = y;
    },
    { passive: true }
  );
  nav.addEventListener('keydown', event => {
    const shown = [...buttons].filter(([, b]) => !b.hidden).map(([id]) => id);
    const i = shown.indexOf(current);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step || i < 0) return;
    event.preventDefault();
    const next = shown[(i + step + shown.length) % shown.length];
    onSelect(next, { again: false });
    buttons.get(next)?.focus();
  });
  const api = {
    get current() {
      return current;
    },
    select(id, { top = false } = {}) {
      const changed = current !== id;
      const first = current == null;
      if (changed && !first) places[current] = globalThis.scrollY || 0;
      current = id;
      // (The same tab again, as an app's redraw asks: nothing written, the pill left.)
      if (changed) requestAnimationFrame(() => pill(first));
      for (const [tid, b] of buttons) {
        const on = tid === id;
        if (b.getAttribute('aria-selected') !== String(on)) b.setAttribute('aria-selected', String(on));
        if (b.tabIndex !== (on ? 0 : -1)) b.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(`panel-${tid}`);
        // (.q-tabpanel: hidden without dropping its drawing, quadra.css, so its
        // pictures are there at once when it's chosen again, never redrawn blank.)
        if (panel && !panel.classList.contains('q-tabpanel')) panel.classList.add('q-tabpanel');
        if (panel && panel.hidden !== !on) panel.hidden = !on;
        // A tab the person chose fades in the first time, as iOS 26's do (never
        // the first one: the page opens still); after that it's simply there:
        // a fade on every tap faded its logos in again each time (Jay
        // 2026-10-20: "images flashes every time I switch tab"). Opacity only:
        // a transform would make the panel hold its fixed children for the moment.
        // (Started by the Web Animations API where there is one: the class taken
        // off and put back needed a layout of the whole panel first, before the
        // app had even drawn it, on every tab tap.)
        const firstVisit = on && changed && !visited.has(tid);
        if (on) visited.add(tid);
        if (on && panel && firstVisit && !first && !reducedMotion()) {
          if (typeof panel.animate === 'function') panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
          else {
            panel.classList.remove('q-panel-in');
            void panel.offsetWidth;
            panel.classList.add('q-panel-in');
            panel.addEventListener('animationend', () => panel.classList.remove('q-panel-in'), { once: true });
          }
        }
      }
      // Only a change of tab moves the address (the first paint leaves it:
      // the app reads it to start).
      try {
        const h = changed && !first ? hash(id) : null;
        if (h != null && location.hash !== h) history.replaceState(null, '', h || location.pathname + location.search);
      } catch {}
      if (changed && !first) {
        // After the app has drawn the tab (it does so right after select).
        const y = top ? 0 : places[id] || 0;
        resetScroll(y);
        globalThis.scrollTo?.(0, y);
        if (y) requestAnimationFrame(() => (globalThis.scrollTo(0, y), resetScroll(globalThis.scrollY || 0)));
      }
    },
    // A count (a number or short text) on a tab's icon; 0/''/null hides it.
    // tone: 'bad' (red, default), 'warn', 'accent'; dot: a dot without text.
    badge(id, value, { tone = 'bad', dot = false } = {}) {
      const b = buttons.get(id)?.querySelector('.q-tab-badge');
      if (!b) return;
      const show = dot ? Boolean(value) : value != null && value !== '' && value !== 0 && value !== false;
      b.hidden = !show;
      b.textContent = show && !dot ? String(value) : '';
      b.className = `q-tab-badge${dot ? ' dot' : ''}${tone !== 'bad' ? ` ${tone}` : ''}`;
    },
    label(id, text) {
      const l = buttons.get(id)?.querySelector('.q-tab-label');
      if (l && l.textContent !== text) l.textContent = text;
    },
    hide(id, hidden = true) {
      const b = buttons.get(id);
      // (Already so: nothing to move.)
      if (!b || b.hidden === Boolean(hidden)) return;
      b.hidden = Boolean(hidden);
      nav.style.setProperty('--q-tabs', String([...buttons.values()].filter(x => !x.hidden).length));
      requestAnimationFrame(() => pill(true));
    }
  };
  return api;
}

// topActions(s, { help, refresh, extra }): the top-right of every app, in
// #top-actions: the account, and nothing else but what the app asks for.
//   refresh(): reloads the app's data (it may return a promise). On a touch
//     screen that is pull-to-refresh, the page dragged down from its top (the
//     kit's pullToRefresh), and no button; on a computer the button stays
//     (id="refresh", it spins while it's disabled). Either way `refresh`
//     in the result has a `disabled` an app sets while it loads: on a phone
//     it holds off a pull, on a computer it spins the button.
//   help(): only for an app with a help of its own: it keeps its 說明 button.
//     Without it there's none: 說明 is a tab of the Quadra Pass sheet (the
//     account button), opening on this app's guide.
// Returns { help, refresh } (the buttons, or null, or refresh's stand-in).
let stopPull = null;
export function topActions(s, { help = null, refresh = null, extra = null, into = document.getElementById('top-actions') } = {}) {
  const en = s.lang === 'en';
  let helpBtn = null;
  if (help) {
    helpBtn = node('button', { class: 'q-icon-btn', id: 'help-button', type: 'button', 'aria-label': en ? 'Help' : '說明', title: en ? 'Help' : '說明' });
    helpBtn.innerHTML = icon('help');
    helpBtn.addEventListener('click', () => help());
  }
  let refreshBtn = null;
  // (Also what runs when the connection comes back.)
  if (refresh) net.refresh = refresh;
  stopPull?.();
  stopPull = null;
  const pull = Boolean(refresh && globalThis.matchMedia?.('(pointer: coarse)').matches);
  // The button is always made (apps look up #refresh and set .disabled while
  // they load); on a phone it's hidden and the page pulls down instead,
  // held off while it's disabled.
  const refreshButton = refresh ? node('button', { class: 'q-icon-btn q-refresh', id: 'refresh', type: 'button', 'aria-label': en ? 'Refresh' : '重新整理', title: en ? 'Refresh' : '重新整理' }) : null;
  if (refreshButton) {
    refreshButton.innerHTML = icon('refresh');
    refreshButton.addEventListener('click', () => refresh());
    refreshBtn = refreshButton;
  }
  // (On a phone it waits hidden outside the bar, which it would otherwise widen.)
  document.getElementById?.('refresh')?.remove();
  if (pull) {
    refreshButton.hidden = true;
    refreshButton.style.display = 'none';
    document.body?.append(refreshButton);
  }
  if (pull) stopPull = pullToRefresh(() => refresh(), { disabled: () => refreshButton.disabled });
  into.classList.add('q-actions');
  into.replaceChildren(...[helpBtn, pull ? null : refreshButton, accountButton(s, { extra })].filter(Boolean));
  return { help: helpBtn, refresh: refreshBtn };
}

// Big numbers never wrap: they shrink (to 60% at most) to fit their box.
// (All reset, then all measured, then all set: one layout, not one a
// number. Widths are fractional: whole pixels rounded a 64.4px number into
// a 64px box, which then showed 11,7… instead of shrinking. Text doesn't
// narrow exactly with its size, −NT$1,052 at 13.2px still 75.9px in a 75px
// box, so each one shrunk is checked again and stepped down until it fits.)
// Play's and Securities' own copies were this; `node.__fit` is the text it
// was last fitted for (watchFit).
const textWidth = node => {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range.getBoundingClientRect().width;
};
export function fitNumbers(nodes) {
  const list = [...nodes];
  for (const node of list) {
    node.style.fontSize = '';
    node.__fit = node.textContent;
  }
  const sizes = list.map(node => {
    const box = node.getBoundingClientRect().width;
    const need = textWidth(node);
    if (!box || need <= box) return null;
    const full = parseFloat(getComputedStyle(node).fontSize);
    return Math.max(full * 0.6, Math.floor(((full * (box - 0.5)) / need) * 10) / 10);
  });
  list.forEach((node, i) => sizes[i] && (node.style.fontSize = `${sizes[i]}px`));
  list.forEach((node, i) => {
    if (!sizes[i]) return;
    const floor = sizes[i] * 0.85;
    for (let size = sizes[i]; size > floor && textWidth(node) > node.getBoundingClientRect().width - 0.5; ) node.style.fontSize = `${(size -= 0.4)}px`;
  });
}
// Keeps every `selector` number fitted: when its text changes (only those
// new or changed since they were last fitted: every one on every redraw was
// most of a tap's time), when its box resizes, and once the fonts load (a
// number fitted before its font came widens while its box doesn't move).
// `roots`: where to watch for redraws (the page by default).
export function watchFit(selector, { roots = null } = {}) {
  if (typeof ResizeObserver !== 'function' || typeof MutationObserver !== 'function' || typeof document === 'undefined') return () => {};
  const resized = new ResizeObserver(entries => fitNumbers(entries.map(e => e.target)));
  const seen = new WeakSet();
  const watch = new MutationObserver(() => {
    const nodes = [...document.querySelectorAll(selector)].filter(node => node.__fit !== node.textContent);
    for (const node of nodes) if (!seen.has(node)) (seen.add(node), resized.observe(node));
    if (nodes.length) fitNumbers(nodes);
  });
  for (const root of roots || [document.body]) if (root) watch.observe(root, { childList: true, subtree: true, characterData: true });
  const fonts = () => fitNumbers(document.querySelectorAll(selector));
  document.fonts?.addEventListener?.('loadingdone', fonts);
  return () => {
    watch.disconnect();
    resized.disconnect();
    document.fonts?.removeEventListener?.('loadingdone', fonts);
  };
}

// ---- 除錯紀錄: what an app did, for its maker to replay ---------------------------------------
//
// Each app notes what it worked something out from (rec(kind, data): Orbit
// Transit a trip's plans and the bikes round them, before they're ranked).
// The last of each kind is always kept, in memory only, so 複製 right after
// something looks wrong has it, with nothing switched on first. With 記錄
// on (Quadra Pass → 除錯紀錄; it stays on until switched off), every one is
// kept on this device, with the app's errors and the screens opened, up to
// about 2 MB, oldest gone first. Nothing leaves the device unless copied or
// shared, and never the pass, a token or a key (left out by name).
const REC_KEY = 'quadra.rec';
const REC_ON = 'quadra.recOn';
const REC_MAX = 2_000_000;
const recLast = new Map();
const secret = /^(pass|passcode|token|secret|auth|authorization|password|apikey|api_key)$/i;
const recClean = x => JSON.parse(JSON.stringify(x ?? null, (k, v) => (secret.test(k) ? undefined : v)));
export const recOn = () => {
  try {
    return localStorage.getItem(REC_ON) === '1';
  } catch {
    return false;
  }
};
function recSaved() {
  try {
    return JSON.parse(localStorage.getItem(REC_KEY) || '[]');
  } catch {
    return [];
  }
}
const recRead = () => [...recSaved(), ...recPending];
// Written a second after the last entry, all at once: rewriting up to 2 MB at
// every entry (a burst of failed reads) would freeze the page.
let recPending = [];
let recTimer = 0;
function recPush(entry) {
  recPending.push(entry);
  if (!recTimer) recTimer = setTimeout(recFlush, 1000);
}
function recFlush() {
  recTimer = 0;
  if (!recPending.length) return;
  const list = recSaved();
  list.push(...recPending.splice(0));
  let text = JSON.stringify(list);
  while (text.length > REC_MAX && list.length > 1) {
    list.splice(0, Math.max(1, Math.ceil(list.length / 10)));
    text = JSON.stringify(list);
  }
  try {
    localStorage.setItem(REC_KEY, text);
  } catch {}
}
export function rec(kind, data) {
  let clean;
  try {
    clean = recClean(data);
  } catch {
    return;
  }
  const entry = { at: Date.now(), kind, data: clean };
  recLast.set(kind, entry);
  if (recOn()) recPush(entry);
}
export function setRecOn(on) {
  try {
    if (on) localStorage.setItem(REC_ON, '1');
    else localStorage.removeItem(REC_ON);
  } catch {}
  recMark();
}
export const recClear = () => {
  recLast.clear();
  recPending = [];
  try {
    localStorage.removeItem(REC_KEY);
  } catch {}
};
// Everything to send: where and what, the last of each kind, and the log.
export function recDump(app = dataSession?.app || '') {
  const log = recRead();
  return JSON.stringify(
    {
      app,
      at: new Date().toISOString(),
      kit: globalThis.QUADRA_KIT?.version || '',
      page: typeof location !== 'undefined' ? location.pathname + location.hash : '',
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      installed: typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches,
      screen: typeof innerWidth !== 'undefined' ? `${innerWidth}x${innerHeight}@${devicePixelRatio}` : '',
      last: Object.fromEntries([...recLast].filter(([, e]) => !log.some(x => x.at === e.at && x.kind === e.kind))),
      log
    },
    null,
    1
  );
}
// While recording: the app's errors, and which screen (#hash) it was on.
function recMark() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('q-recording', recOn());
}
if (typeof window !== 'undefined') {
  window.addEventListener('error', e => recOn() && rec('error', { message: e.message, at: `${e.filename || ''}:${e.lineno || 0}:${e.colno || 0}`, stack: String(e.error?.stack || '').slice(0, 1500) }));
  window.addEventListener('unhandledrejection', e => recOn() && rec('error', { message: String(e.reason?.message || e.reason), stack: String(e.reason?.stack || '').slice(0, 1500) }));
  window.addEventListener('hashchange', () => recOn() && rec('screen', { hash: location.hash }));
  if (document.documentElement) recMark();
}
function recRows(s, note) {
  const en = s.lang === 'en';
  const T = (zh, e) => (en ? e : zh);
  const sub = node('small', { class: 'q-notice-sub' });
  const paint = () => (sub.textContent = recOn() ? T(`記錄中・${recRead().length} 筆`, `Recording · ${recRead().length}`) : T('關閉：只留每件事的最後一次', 'Off: only the last of each kept'));
  paint();
  const send = async how => {
    const text = recDump(s.app);
    if (how === 'share' && navigator.share) {
      const file = new File([text], `${s.app}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file] }).catch(() => {});
    }
    await navigator.clipboard.writeText(text);
    note.textContent = T(`已複製（${Math.round(text.length / 1024)} KB）`, `Copied (${Math.round(text.length / 1024)} KB)`);
  };
  const btn = (label, fn) => node('button', { class: 'q-chip', type: 'button', text: label, onclick: () => fn().catch(() => (note.textContent = T('沒辦法複製', 'Couldn’t copy'))) });
  return node('div', { class: 'q-rows' }, [
    node('div', { class: 'q-notice-row master' }, [
      node('span', { class: 'q-notice-icon', 'aria-hidden': 'true', text: '🐞' }),
      node('div', { class: 'q-notice-text' }, [node('strong', { text: T('記錄操作過程', 'Record what the app does') }), sub]),
      toggle(recOn(), T('記錄操作過程', 'Record'), on => {
        setRecOn(on);
        paint();
      })
    ]),
    node('div', { class: 'q-rec-acts' }, [
      btn(T('複製紀錄', 'Copy'), () => send('copy')),
      btn(T('分享檔案', 'Share file'), () => send('share')),
      btn(T('清除', 'Clear'), async () => {
        recClear();
        paint();
        note.textContent = T('已清除', 'Cleared');
      })
    ])
  ]);
}

// ---- 中場休息: how long the break has left, the same in every app ----------------------------
// When a half ended, to the second: the latest play on the wall clock in
// ESPN's game summary (soccer's 'halftime' key event, basketball's End
// Period, football's End of Half: checked live 2026-10-17). The break's
// length is the league's rule; past it, the countdown goes and 中場休息
// stays alone. Kept on the phone for the rest of the break, so reopening
// the app doesn't ask again. Every countdown shown ticks from one beat,
// never a redraw (an element with halftimeAttrs).
const HALFTIME_MIN = { soccer: 15, basketball: 15, football: 13 };
const HALFTIME_LEAGUE_MIN = { ncaaf: 20, 'college-football': 20, 'football/college-football': 20 };
const HALFTIME_KEY = 'quadra.halftime';
export const halftimeMinutes = (sport, league = '') => HALFTIME_LEAGUE_MIN[league] ?? HALFTIME_MIN[sport] ?? null;
export function halftimeStartOf(summary) {
  const drives = summary?.drives || {};
  const plays = [...(summary?.plays || []), ...(summary?.keyEvents || []), ...(drives.previous || []).flatMap(d => d?.plays || []), ...(drives.current?.plays || [])];
  const at = plays.map(p => Date.parse(p?.wallclock || '')).filter(Number.isFinite);
  return at.length ? Math.max(...at) : null;
}
// "12:34" left at `now`; '' once the break's length is up.
export function halftimeClock(end, now = Date.now()) {
  const s = Math.ceil((end - now) / 1000);
  return end && s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
}
const halftimeEnds = (() => {
  try {
    const kept = JSON.parse(localStorage.getItem(HALFTIME_KEY) || '{}');
    // A break long over is forgotten.
    return new Map(Object.entries(kept).filter(([, end]) => end > Date.now() - 3_600_000));
  } catch {
    return new Map();
  }
})();
const halftimeAsked = new Map();
export const halftimeEnd = key => halftimeEnds.get(String(key)) ?? null;
// A game at half-time: its break's end found once (read: () => ESPN's
// summary of it), then ticking. A summary not yet at the break (a cached
// copy from before the whistle) is asked again 20 s later.
export function watchHalftime(key, { sport, league = '', read }) {
  const minutes = halftimeMinutes(sport, league);
  return minutes ? watchBreak(key, { seconds: minutes * 60, read, test: /HALFTIME|^HT$|^half/i }) : null;
}

// ---- Every break, timeouts too: the same countdown -------------------------------------------
// A game stopped by its rules: half-time, a period or quarter over, the
// break between innings, a timeout (a team's, the officials' TV one), the
// two-minute warning. Its length is the league's rule; its start the
// stopping play's clock on the wall in ESPN's summary. (No countdown for a
// stop with no set length: an injury, a review, a rain delay.)
//   basketball  NBA: 2:10 between quarters and before overtime; a period's
//               first two timeouts are its mandatory ones, 2:45 (3:15 on
//               national TV), any more 1:15 (Rule 5); FIBA (EuroLeague,
//               NBL): 2:00, 60 s.
//   football    NFL: 2:00 between quarters, a timeout and the two-minute
//               warning on TV 2:00; half-time 13 min (college 20).
//   hockey      NHL: an intermission 18 min (15 before a play-off overtime), a timeout 30 s.
//   soccer      half-time 15 min, 5 before extra time, 1 at its half.
//   baseball    MLB: the inning break and a pitching change 2:15 (3:10 in the play-offs).
const BREAK_SECONDS = {
  basketball: { half: 900, period: 130, timeout: 75 },
  football: { half: 780, period: 120, timeout: 120, warning: 120 },
  hockey: { period: 1080, overtime: 900, timeout: 30 },
  soccer: { half: 900, extra: 300, etHalf: 60 },
  baseball: { inning: 135, pitching: 135 }
};
const BREAK_LEAGUE = { euroleague: { period: 120, timeout: 60 }, nbl: { period: 120, timeout: 60 }, ncaaf: { half: 1200 }, 'college-football': { half: 1200 } };
const BREAK_POST = { baseball: { inning: 190, pitching: 190 } };
// The break a game is in now, from its status ({ name: ESPN's code, period,
// short }) and the last play ({ lastType, lastId, half }), or null.
// `post`: a play-off game. { kind, seconds, test, play } (test: what the
// summary's status says during it; play: the stopping play's id).
export function breakOf({ sport, league = '', status = {}, live = {}, post = false }) {
  if (status.state && status.state !== 'in') return null;
  if (status.delayed) return null;
  const len = { ...BREAK_SECONDS[sport], ...BREAK_LEAGUE[league], ...(post ? BREAK_POST[sport] : null) };
  const code = `${status.name || ''}`;
  const n = Number(status.period) || 0;
  const pick = (kind, test, play = '') => (len[kind] ? { kind, seconds: len[kind], test, play } : null);
  if (/HALFTIME_ET|HALF_TIME_ET/.test(code)) return pick('etHalf', /HALF/i);
  if (/HALFTIME/.test(code)) return pick('half', /HALFTIME|^HT$|^half/i);
  if (sport === 'soccer' && /END_OF_REGULATION|END_REGULATION|END_OF_REGULAR/.test(code)) return pick('extra', /END/i);
  if (/END_PERIOD|END_OF_PERIOD/.test(code) || (sport !== 'baseball' && /^end of/i.test(status.short || ''))) {
    if (sport === 'football' && n === 2) return pick('half', /END|HALF/i);
    if (sport === 'hockey' && n >= 3) return post ? pick('overtime', /END/i) : null;
    if (sport !== 'baseball') return pick('period', /END/i);
  }
  if (sport === 'baseball' && (live.half === 'mid' || live.half === 'end')) return pick('inning', /^(mid|end)/i);
  const last = `${live.lastType || ''}`;
  if (/two.minute warning/i.test(last)) return pick('warning', /./, live.lastId);
  if (sport === 'baseball' && /pitching change/i.test(last)) return pick('pitching', /./, live.lastId);
  if (/timeout/i.test(last) && !/end (of )?timeout/i.test(last)) {
    const b = pick('timeout', /./, live.lastId);
    return b && league === 'nba' ? { ...b, mandatory: { first: 2, local: 165, national: 195 } } : b;
  }
  return null;
}
// The break's countdown: its end found once (read: () => ESPN's summary of
// the game), then ticking with the half-time ones (the same beat, the same
// halftimeAttrs on what shows it). `play`: the stopping play's id (its own
// clock, not the latest); `test`: the summary's status says the break (a
// copy from before it isn't taken, and is asked again 20 s later).
// `mandatory`: { first, local, national }: a period's first timeouts run
// longer (the NBA's TV ones), national TV longer still (the summary says
// which, and which timeout of its period this is).
const isTimeout = p => /timeout/i.test(p?.type?.text || '') && !/end (of )?timeout/i.test(p?.type?.text || '');
function breakSeconds(summary, own, seconds, mandatory) {
  if (!mandatory || !own) return seconds;
  const plays = summary?.plays || [];
  const at = plays.indexOf(own);
  const n = plays.slice(0, at + 1).filter(p => isTimeout(p) && p?.period?.number === own?.period?.number).length;
  if (!n || n > mandatory.first) return seconds;
  const national = (summary?.header?.competitions?.[0]?.broadcasts || []).some(b => b?.isNational && /tv/i.test(b?.type?.shortName || ''));
  return national ? mandatory.national : mandatory.local;
}
export function watchBreak(key, { seconds, read, test = /./, play = '', mandatory = null }) {
  key = String(key);
  if (!seconds || halftimeEnds.has(key) || Date.now() - (halftimeAsked.get(key) || 0) < 20_000) return halftimeEnd(key);
  halftimeAsked.set(key, Date.now());
  Promise.resolve()
    .then(read)
    .then(summary => {
      const status = summary?.header?.competitions?.[0]?.status?.type || {};
      const own = play ? [...(summary?.plays || []), ...(summary?.drives?.current?.plays || []), ...(summary?.drives?.previous || []).flatMap(d => d?.plays || [])].find(p => String(p?.id) === String(play)) : null;
      const start = own ? Date.parse(own.wallclock || '') : play ? null : halftimeStartOf(summary);
      if (!Number.isFinite(start) || !start || (!play && !test.test(`${status.name || ''} ${status.shortDetail || ''}`.trim()) && !test.test(status.shortDetail || ''))) return;
      halftimeEnds.set(key, start + breakSeconds(summary, own, seconds, mandatory) * 1000);
      try {
        localStorage.setItem(HALFTIME_KEY, JSON.stringify(Object.fromEntries(halftimeEnds)));
      } catch {}
      halftimeBeat();
    })
    .catch(() => {});
  halftimeBeat();
  return null;
}
// What an element showing a game's break carries for the beat: its key and
// the words before the countdown ('中場休息', or '' for the countdown alone).
export const halftimeAttrs = (key, label = '') => ({ 'data-halftime': String(key), 'data-halftime-label': label });
let halftimeTimer = 0;
function halftimeBeat() {
  if (halftimeTimer || typeof document === 'undefined') return;
  const tick = () => {
    const shown = document.querySelectorAll('[data-halftime]');
    for (const node of shown) {
      const text = [node.dataset.halftimeLabel, halftimeClock(halftimeEnd(node.dataset.halftime))].filter(Boolean).join(' ');
      if (node.textContent !== text) node.textContent = text;
    }
  };
  tick();
  halftimeTimer = setInterval(tick, 1000);
}

// ---- A live number that changed: a small spring pop -------------------------------------------
//
// Any element with data-q-live="<key>" (a score, a price, a balance) pops
// once when its text changes, wherever the app's redraw put it (the key
// carries it across a node replaced by a redraw). Never in the first
// seconds after opening (the page opens still), nor while hidden, nor with
// less movement asked. The app only marks its numbers.
export const LIVE_QUIET_MS = 6000;
const liveSeen = new Map();
export function liveChanged(key, text, now = globalThis.performance?.now?.() ?? Date.now()) {
  const before = liveSeen.get(key);
  liveSeen.set(key, text);
  // (A number for a number: '…' or '–' becoming one is it arriving, not changing.)
  return before != null && before !== text && /\d/.test(before) && /\d/.test(text) && now > LIVE_QUIET_MS;
}
function watchLive() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || document.__quadraLive) return;
  document.__quadraLive = true;
  const pop = el => {
    if (reducedMotion() || document.hidden) return;
    el.classList.remove('q-bump');
    void el.offsetWidth;
    el.classList.add('q-bump');
    el.addEventListener('animationend', () => el.classList.remove('q-bump'), { once: true });
  };
  const check = el => {
    const key = el.dataset.qLive;
    if (key && liveChanged(key, el.textContent.trim())) pop(el);
  };
  const scan = () => document.querySelectorAll('[data-q-live]').forEach(el => liveSeen.set(el.dataset.qLive, el.textContent.trim()));
  new MutationObserver(list => {
    const found = new Set();
    for (const m of list) {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      const own = t?.closest?.('[data-q-live]');
      if (own) found.add(own);
      for (const n of m.addedNodes) if (n.nodeType === 1) (n.matches('[data-q-live]') ? [n] : n.querySelectorAll('[data-q-live]')).forEach(x => found.add(x));
    }
    found.forEach(check);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scan();
}
watchLive();
