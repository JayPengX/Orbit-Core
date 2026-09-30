// ---- push.js ----
// Quadra's notices while an app is closed (Web Push), for sports-proxy-worker.js.
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
//
// Stored in KV (RATE_LIMIT_KV): `push:<account>:<app>` the device's
// subscription and list, `push:prefs:<account>` the switches, `push:due` when each list's next notice is due,
// `push:vapid` the Worker's own key pair (made on first use). One device a
// person an app: the one that subscribed last (Quadra runs one live session
// an account anyway).
//
// The message is encrypted for the device (RFC 8291, aes128gcm) and signed
// for the push service (RFC 8292, VAPID): WebCrypto only, no library.

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

const APP_KEYS = new Set(['match', 'odds', 'stock', 'vocab', 'orbit', 'eco']);
const MAX_ITEMS = 60;
const HOLD_MS = 8 * 3_600_000;
const CHECK_EVERY = 15 * 60_000;
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
      }
      if (c?.yahoo && /^[\w.^=-]{1,20}$/.test(c.yahoo) && ['above', 'below'].includes(c.op) && Number.isFinite(c.price)) item.check = { yahoo: c.yahoo, op: c.op, price: c.price };
      return item;
    })
    .filter(x => x.title || x.check)
    .sort((a, b) => a.at - b.at);
}

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
  // Each app's state for this account: subscribed, how many notices wait,
  // the last send's answer; `test` sends every subscribed app a notice now.
  if (path === '/push/status' || path === '/push/test') {
    const apps = {};
    for (const app of APP_KEYS) {
      const record = await kv.get(recordKey(session.d, app), 'json');
      if (!record) continue;
      apps[app] = { sub: record.sub ? new URL(record.sub.endpoint).host : null, items: record.items.length, next: record.items[0]?.at || null, last: record.last || null };
      if (path === '/push/test' && record.sub) {
        // Samples of the app's notices (to this account's own devices), or one plain test.
        const samples = Array.isArray(body?.samples?.[app]) ? body.samples[app].slice(0, 12) : [{ title: 'Quadra', body: record.lang === 'en' ? 'Notices are working ✅' : '通知設定成功 ✅' }];
        apps[app].test = [];
        for (const [i, x] of samples.entries()) apps[app].test.push(await sendPush(env, record.sub, { title: cleanText(x?.title, 120), body: cleanText(x?.body, 240), tag: `test-${app}-${i}` }).catch(e => `failed ${e?.message || e}`));
      }
    }
    return reply({ apps });
  }
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
    record.items = cleanItems(body?.items);
  } else return reply({ error: { message: 'Not found' } }, 404);
  await kv.put(key, JSON.stringify(record), { expirationTtl: 60 * 86_400 });
  await setDue(env, key, record.sub && record.items.length ? record.items[0].at : 0);
  return reply({ ok: true, n: record.items.length });
}

// ---- Checks: news the Worker finds out itself --------------------------------

async function runCheck(check, lang) {
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
        const found = await runCheck(item.check, record.lang).catch(() => null);
        if (!found) {
          if (now < (item.until || item.firstAt || item.at) + (item.until ? 0 : HOLD_MS)) keep.push({ ...item, firstAt: item.firstAt || item.at, at: now + CHECK_EVERY });
          continue;
        }
        message = { ...message, title: found.title || item.title, body: (item.body || found.body || '').replace('{result}', found.result || '') };
      }
      const r = await sendPush(env, record.sub, message).catch(e => `failed ${e?.message || e}`);
      record.last = { at: now, r };
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
