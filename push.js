// ---- push.js ----
// Quadra's notices while an app is closed (Web Push), routed by worker.js.
//
// A phone (an iPhone above all) stops a home-screen app as soon as it's in
// the background, so an app can't tell anyone anything itself once it's
// closed. Instead each app hands the Worker its coming notices ahead of time
// and the Worker sends them when they're due, through the browser's push
// service, to the device's service worker (which shows them):
//
//   GET  /push/key                     the Worker's public VAPID key
//   POST /push/subscribe?qt=<session>  { sub: PushSubscription JSON, lang }
//   POST /push/schedule?qt=<session>   { items: [notice…] } (replaces the app's list)
//   POST /push/prefs?qt=<session>      { on, off: ['stock:alert', …] } the pass's
//                                      notice switches (kit notifyPrefs): a kind
//                                      turned off (or notices off) in any app is
//                                      dropped from every app's list when due
//   scheduled (cron, every 5 minutes)  sends what's due
//
// A notice: { at: ms, title, body, tag, url, kind } and, for news that isn't known
// ahead, a check the Worker makes at `at` (and again every 15 minutes until
// it has the answer, or 8 hours have passed, or `until`):
//   check: { espn: 'football/nfl', event: '401…' }            a game's final score
//   check: { yahoo: '2330.TW', op: 'above'|'below', price }  a price reached
//   check: { weather: { lat, lon, kind: 'brief'|'rain' } }   Orbit Weather's
//          morning brief, or a rain alert when the next 2 hours turn wet
//          (weather.js weatherCheck)
//   check: { bus: { path, route, dir, min } }  Orbit Transit's 到站提醒: the bus
//          (RouteUID, direction) is `min` minutes from the stop, by TDX's live
//          estimates at that stop (`path`, the app's own TDX ask, through the
//          shared cache); asked again every run (each 2 minutes), not each 15
//
// Stored in KV (RATE_LIMIT_KV): `push:<account>:<app>` the device's
// subscription and list, `push:prefs:<account>` the switches, `push:due` when each list's next notice is due,
// `push:vapid` the Worker's own key pair (made on first use). One device a
// person an app: the one that subscribed last (Quadra runs one live session
// an account anyway).
//
// The message is encrypted for the device (RFC 8291, aes128gcm) and signed
// for the push service (RFC 8292, VAPID): WebCrypto only, no library.

import { weatherCheck } from './weather.js';
import { tdxGet, tdxRequest } from './transit.js';

const enc = new TextEncoder();
const b64u = bytes => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)), c => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
// HKDF (RFC 5869) with SHA-256, one block of output at most (all push needs).
const hkdf = async (salt, ikm, info, length) => (await hmac(await hmac(salt, ikm), concat(info, new Uint8Array([1])))).slice(0, length);

// ---- The Worker's VAPID key pair ------------------------------------------------

let vapid = null;
export async function vapidKeys(env) {
  if (vapid) return vapid;
  const kv = env.RATE_LIMIT_KV;
  let stored = kv ? await kv.get('push:vapid', 'json') : null;
  if (!stored) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    stored = { jwk: await crypto.subtle.exportKey('jwk', pair.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)) };
    if (kv) await kv.put('push:vapid', JSON.stringify(stored));
  }
  vapid = { pub: stored.pub, key: await crypto.subtle.importKey('jwk', stored.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) };
  return vapid;
}

async function vapidHeader(env, endpoint) {
  const { pub, key } = await vapidKeys(env);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:quadra@jaypengx.github.io' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
}

// ---- Encrypting a message for a device (RFC 8291) ------------------------------

export async function encryptPush(sub, text, { salt = crypto.getRandomValues(new Uint8Array(16)), pair = null } = {}) {
  const uaPublic = unb64u(sub.keys.p256dh);
  const auth = unb64u(sub.keys.auth);
  const local = pair || (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const ua = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

// Sends one message; 'gone' when the device has unsubscribed (404/410).
export async function sendPush(env, sub, message) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(env, sub.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '14400', Urgency: 'high' },
    body: await encryptPush(sub, JSON.stringify(message))
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  return res.ok ? 'sent' : `failed ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`.trim();
}

// ---- The lists ------------------------------------------------------------------

const APP_KEYS = new Set(['match', 'odds', 'stock', 'vocab', 'orbit', 'weather', 'transit']);
const MAX_ITEMS = 60;
const HOLD_MS = 8 * 3_600_000;
const CHECK_EVERY = 15 * 60_000;
// A bus comes in minutes: every run (the cron's 2 minutes).
const BUS_EVERY = 60_000;
// Runs are 2 minutes apart: told up to a minute early rather than late.
const BUS_EARLY = 60;
const cleanText = (x, n) => String(x ?? '').slice(0, n);
const okUrl = u => (typeof u === 'string' && /^https:\/\/jaypengx\.github\.io\//.test(u) ? u : '');

export function cleanItems(items, now = Date.now()) {
  return (Array.isArray(items) ? items : [])
    .filter(x => x && Number.isFinite(x.at) && (x.at > now - 10 * 60_000 || (x.check && x.until > now)) && x.at < now + 40 * 86_400_000 && (x.title || x.check))
    .slice(0, MAX_ITEMS)
    .map(x => {
      const item = { at: Math.round(x.at), title: cleanText(x.title, 120), body: cleanText(x.body, 240), tag: cleanText(x.tag, 80), url: okUrl(x.url) };
      if (typeof x.kind === 'string' && /^[a-z]{1,16}$/.test(x.kind)) item.kind = x.kind;
      if (Number.isFinite(x.until) && x.until > x.at && x.until < now + 40 * 86_400_000) item.until = Math.round(x.until);
      const c = x.check;
      if (c?.espn && /^[a-z-]+\/[a-z0-9.-]+$/.test(c.espn) && /^\d+$/.test(String(c.event))) {
        item.check = { espn: c.espn, event: String(c.event) };
        // The names the app shows (the Worker adds the score and who won).
        if (Array.isArray(c.names) && c.names.length === 2) item.check.names = c.names.map(n => cleanText(n, 40));
        // A race (racing's weekend event, one of its sessions, read from that day's board).
        if (/^racing\//.test(c.espn) && ['Race', 'SR'].includes(c.session) && /^\d{8}$/.test(String(c.day))) {
          item.check = { espn: c.espn, event: String(c.event), session: c.session, day: String(c.day) };
          // The drivers as the app names them, by surname ({ Antonelli: '安東內利' }).
          const zh = Object.entries(c.zh && typeof c.zh === 'object' ? c.zh : {}).filter(([k, v]) => /^[A-Za-z' -]{2,24}$/.test(k) && typeof v === 'string' && v.length <= 12).slice(0, 40);
          if (zh.length) item.check.zh = Object.fromEntries(zh);
        }
      }
      const w = c?.weather;
      if (w && Math.abs(w.lat) <= 90 && Math.abs(w.lon) <= 180 && ['brief', 'rain'].includes(w.kind)) item.check = { weather: { lat: Math.round(w.lat * 1e4) / 1e4, lon: Math.round(w.lon * 1e4) / 1e4, kind: w.kind } };
      const b = c?.bus;
      if (b && typeof b.path === 'string' && /^advanced\/v2\/Bus\/EstimatedTimeOfArrival\/[^?]*\/PassThrough\/Station\//.test(b.path) && tdxRequest(b.path) && /^[A-Z]{3}[\w-]{1,20}$/.test(String(b.route)) && [0, 1, 2].includes(Number(b.dir)) && Number(b.min) >= 1 && Number(b.min) <= 30)
        item.check = { bus: { path: b.path, route: String(b.route), dir: Number(b.dir), min: Number(b.min) } };
      if (c?.yahoo && /^[\w.^=-]{1,20}$/.test(c.yahoo) && ['above', 'below'].includes(c.op) && Number.isFinite(c.price)) item.check = { yahoo: c.yahoo, op: c.op, price: c.price };
      return item;
    })
    .filter(x => x.title || x.check)
    .sort((a, b) => a.at - b.at);
}

// A notice of news that happens once: told once (by its tag), for 2 days.
const TOLD_MS = 2 * 86_400_000;
const onceOnly = x => Boolean(x.tag && (x.check?.espn || x.check?.yahoo));
const recordKey = (account, app) => `push:${account}:${app}`;
const prefsKey = account => `push:prefs:${account}`;
export function cleanPrefs(body) {
  const off = (Array.isArray(body?.off) ? body.off : []).filter(k => typeof k === 'string' && /^[a-z]{1,16}:[a-z]{1,16}$/.test(k)).slice(0, 64);
  return { on: body?.on !== false, off: [...new Set(off)] };
}
// Whether the pass's switches let this notice through (all do without any).
export const wanted = (prefs, app, item) => !prefs || (prefs.on !== false && !(item.kind && prefs.off?.includes(`${app}:${item.kind}`)));
async function setDue(env, key, next) {
  const kv = env.RATE_LIMIT_KV;
  const due = (await kv.get('push:due', 'json')) || {};
  if (next) due[key] = next;
  else delete due[key];
  await kv.put('push:due', JSON.stringify(due));
}

export async function handlePush(request, env, headers, session, path) {
  const kv = env.RATE_LIMIT_KV;
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
  if (path === '/push/key') return reply({ key: (await vapidKeys(env)).pub });
  if (!kv) return reply({ error: { message: 'Push isn’t set up here.' } }, 503);
  if (request.method !== 'POST') return reply({ error: { message: 'POST only' } }, 405);
  if (!session?.d || !APP_KEYS.has(session.a)) return reply({ error: { code: 'QUADRA_PASS_REQUIRED', message: 'Sign in with a Quadra Pass.' } }, 401);
  const body = await request.json().catch(() => null);
  if (path === '/push/prefs') {
    const prefs = cleanPrefs(body);
    await kv.put(prefsKey(session.d), JSON.stringify(prefs), { expirationTtl: 400 * 86_400 });
    return reply({ ok: true, ...prefs });
  }
  const key = recordKey(session.d, session.a);
  const record = (await kv.get(key, 'json')) || { items: [] };
  if (path === '/push/subscribe') {
    const sub = body?.sub;
    if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return reply({ error: { message: 'Bad subscription' } }, 400);
    record.sub = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
    record.lang = body.lang === 'en' ? 'en' : 'zh';
  } else if (path === '/push/schedule') {
    // News that happens once (a game's final score, a price reached) and was
    // told already isn't taken again: an app whose copy of the game is behind
    // ('on' still) would have it sent at every open.
    const told = record.told || {};
    record.items = cleanItems(body?.items).filter(x => !(onceOnly(x) && told[x.tag]));
  } else return reply({ error: { message: 'Not found' } }, 404);
  await kv.put(key, JSON.stringify(record), { expirationTtl: 60 * 86_400 });
  await setDue(env, key, record.sub && record.items.length ? record.items[0].at : 0);
  return reply({ ok: true, n: record.items.length });
}

// ---- Checks: news the Worker finds out itself --------------------------------

export async function runCheck(check, lang, env) {
  if (check.weather) return weatherCheck(env, check.weather);
  if (check.bus) {
    const got = await tdxGet(env, check.bus.path);
    if (got.status !== 200) return null;
    const j = JSON.parse(got.body);
    // TDX's v2 answers are a list, or an object holding it (the app's rows()).
    const rows = Array.isArray(j) ? j : (j && typeof j === 'object' && Object.values(j).find(Array.isArray)) || [];
    const secs = rows
      .filter(r => r.RouteUID === check.bus.route && Number(r.Direction) === check.bus.dir && Number(r.StopStatus || 0) === 0 && r.EstimateTime != null)
      .map(r => Number(r.EstimateTime))
      .filter(Number.isFinite);
    if (!secs.length) return null;
    const sec = Math.min(...secs);
    if (sec > check.bus.min * 60 + BUS_EARLY) return null;
    const m = Math.round(sec / 60);
    const result = m <= 1 ? (lang === 'en' ? 'arriving now' : '進站中') : lang === 'en' ? `${m} min away` : `約 ${m} 分鐘到站`;
    return { body: result, result };
  }
  if (check.espn && check.session) {
    // A race: ESPN has no summary for a weekend; its day's board has each session and its order.
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${check.espn}/scoreboard?dates=${check.day}`);
    if (!res.ok) return null;
    const ev = (await res.json())?.events?.find(e => String(e.id) === check.event);
    const comp = ev?.competitions?.find(c => c?.type?.abbreviation === check.session);
    if (comp?.status?.type?.state !== 'post') return null;
    // Each driver as the app names them (by surname, accents aside), else ESPN's short name.
    const plain = t => String(t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const named = a => {
      const full = plain(a?.displayName || a?.shortName);
      const hit = lang !== 'en' && Object.entries(check.zh || {}).find(([k]) => new RegExp(`\\b${k}\\b`, 'i').test(full));
      return hit ? hit[1] : a?.shortName || a?.displayName || '';
    };
    const top = [...(comp.competitors || [])].sort((x, y) => (x.order ?? 99) - (y.order ?? 99)).slice(0, 3).map(c => named(c?.athlete)).filter(Boolean);
    if (!top.length) return null;
    const result = lang === 'en' ? `${top[0]} wins${top.length > 1 ? ` · podium: ${top.join(', ')}` : ''}` : `${top[0]}${/[\u4e00-\u9fff]$/.test(top[0]) ? '' : ' '}奪冠${top.length > 1 ? ` · 頒獎台：${top.join('、')}` : ''}`;
    return { body: result, result };
  }
  if (check.espn) {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${check.espn}/summary?event=${check.event}`);
    if (!res.ok) return null;
    const comp = (await res.json())?.header?.competitions?.[0];
    if (comp?.status?.type?.state !== 'post') return null;
    const side = h => comp.competitors?.find(c => c.homeAway === h);
    const name = c => c?.team?.shortDisplayName || c?.team?.name || c?.team?.displayName || c?.athlete?.shortName || '';
    const [a, h] = [side('away'), side('home')];
    const [na, nh] = check.names || [name(a), name(h)];
    const T = (zh, en) => (lang === 'en' ? en : zh);
    const type = comp.status.type;
    // Called off: no score, just what happened.
    if (!type.completed) {
      const result = /postpon|delay|suspend/i.test(type.name || '') ? T('延賽', 'Postponed') : /cancel/i.test(type.name || '') ? T('比賽取消', 'Canceled') : T('比賽結束', 'Final');
      return { body: result, result };
    }
    const [as, hs] = [Number(a?.score), Number(h?.score)];
    const won = a?.winner ? na : h?.winner ? nh : as > hs ? na : hs > as ? nh : null;
    const result = won ? T(`${won} 贏了`, `${won} win`) : as === hs ? T('平手', 'Draw') : T('比賽結束', 'Final');
    return { title: `${na} ${a?.score ?? ''} : ${h?.score ?? ''} ${nh}`, body: result, result };
  }
  if (check.yahoo) {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(check.yahoo)}?range=1d&interval=5m`, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } });
    if (!res.ok) return null;
    const price = (await res.json())?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (!Number.isFinite(price)) return null;
    const hit = check.op === 'above' ? price >= check.price : price <= check.price;
    return hit ? { price } : null;
  }
  return null;
}

// What's due, sent: each list's notices up to now (a check that has no
// answer yet waits 15 minutes more), and the lists' next times.
export async function sendDue(env, now = Date.now()) {
  const kv = env.RATE_LIMIT_KV;
  if (!kv) return { sent: 0 };
  const due = (await kv.get('push:due', 'json')) || {};
  let sent = 0;
  let changed = false;
  const prefsOf = {};
  for (const [key, next] of Object.entries(due)) {
    if (next > now + 60_000) continue;
    const record = await kv.get(key, 'json');
    if (!record?.sub) {
      delete due[key];
      changed = true;
      continue;
    }
    const keep = [];
    let gone = false;
    // push:<account>:<app>
    const [account, app] = [key.slice(5, key.lastIndexOf(':')), key.slice(key.lastIndexOf(':') + 1)];
    if (!(account in prefsOf)) prefsOf[account] = await kv.get(prefsKey(account), 'json').catch(() => null);
    const prefs = prefsOf[account];
    for (const item of record.items) {
      // Switched off (in any app, on any device): never sent.
      if (!wanted(prefs, app, item)) continue;
      if (item.at > now + 60_000 || gone) {
        keep.push(item);
        continue;
      }
      let message = { title: item.title, body: item.body, tag: item.tag, url: item.url };
      if (item.check) {
        const found = await runCheck(item.check, record.lang, env).catch(() => null);
        if (!found) {
          if (now < (item.until || item.firstAt || item.at) + (item.until ? 0 : HOLD_MS)) keep.push({ ...item, firstAt: item.firstAt || item.at, at: now + (item.check.bus ? BUS_EVERY : CHECK_EVERY) });
          continue;
        }
        message = { ...message, title: found.title || item.title, body: (item.body || found.body || '').replace('{result}', found.result || '') };
      }
      const r = await sendPush(env, record.sub, message).catch(e => `failed ${e?.message || e}`);
      record.last = { at: now, r };
      if (r === 'sent' && onceOnly(item)) record.told = { ...Object.fromEntries(Object.entries(record.told || {}).filter(([, at]) => at > now - TOLD_MS)), [item.tag]: now };
      if (r === 'gone') gone = true;
      else if (r === 'sent') sent++;
    }
    if (gone) {
      await kv.delete(key);
      delete due[key];
    } else {
      record.items = keep.sort((a, b) => a.at - b.at);
      await kv.put(key, JSON.stringify(record), { expirationTtl: 60 * 86_400 });
      if (record.items.length) due[key] = record.items[0].at;
      else delete due[key];
    }
    changed = true;
  }
  if (changed) await kv.put('push:due', JSON.stringify(due));
  return { sent };
}
