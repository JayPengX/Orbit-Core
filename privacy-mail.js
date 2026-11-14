// ---- privacy-mail.js: data requests by email, answered by code (Jay 2026-11-14) ----
//
// Jay: "only email them, so it's a more process way not something people
// just access everyday", "just send them automatically no need to send
// anything to me", "and limit request for a duration". So:
//
//   1. Someone writes to privacy@<DOMAIN> (the privacy policy's address).
//      Email Routing hands it to the proxy's email() (worker.js), here.
//   2. The answer is a reply to that mail (Email Routing's own reply: no
//      outside sender, only to the address that wrote): three links, 24 h,
//      signed (orbit-token.js, kind 'priv'): a copy of the account's data,
//      the account deleted, usage stats off. From an account's verified
//      recovery email (pass-mail.js accountOfMail) the link carries the
//      account; from any other address, the page asks for the pass.
//   3. The link opens /privacy/request/ (site/privacy/request/), which asks
//      `/eco { op: 'privacy', token, passcode? }` (privacyDo) once tapped.
//
// Limits: replies to one address 3 a day (D1 docs `eco-privacy`, by the
// address's HMAC); a copy once in 30 days an account; deletion always (a
// right); a pass typed on the page as a sign-in is (ECO_LIMITS.login an hour).
// Nothing reaches Jay's inbox.

import { DOMAIN } from './kit/domain.mjs';
import { accountOfMail, cleanAddr, mailIndexId, mailOf } from './pass-mail.js';
import { WALLET_COLLECTION, INBOX_COLLECTION, NOW_COLLECTION, FAMILY_SHELF, ECO_APPS, ECO_PASSCODE_PATTERN, shelfId, parseWallet, publicWallet, deleteAccount, updateWallet, mergeWallet, passAccount, ECO_LIMITS } from './eco.js';
import { signToken, readToken, tokenSecret } from './orbit-token.js';
import { BRANDS } from './kit/brand.mjs';
import * as look from './site/admin/mail-look.mjs';

export const PRIVACY_USER = 'privacy';
export const PRIVACY_COLLECTION = 'eco-privacy';
export const LINK_MS = 24 * 3_600_000;
export const EXPORT_EVERY_MS = 30 * 86_400_000;
export const REPLIES_A_DAY = 3;
export const KINDS = ['export', 'delete', 'stop'];
const DAY = 86_400_000;
const twDay = t => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
const site = () => `https://orbit.${DOMAIN}`;

// ---- The mail and its reply ----

// The links a reply carries, one a kind (`d`: the account, when the address is its recovery email).
// (`lang`: the page opens in the reply's language.)
export async function requestLinks(secret, docId, now = Date.now(), lang = 'zh') {
  const out = {};
  for (const w of KINDS) {
    const t = await signToken(secret, { k: 'priv', w, ...(docId ? { d: docId } : {}), e: now + LINK_MS });
    out[w] = `${site()}/privacy/request/#t=${t}&l=${lang === 'en' ? 'en' : 'zh'}`;
  }
  return out;
}

// The reply's one language (Jay 11-14: two stacked looked odd): the mail's
// own (its Content-Language, else Chinese characters in its subject), else
// English for a subject in Latin letters, else Chinese (Orbit is Taiwan's).
const words = v => String(v || '').replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (m, enc, x) => {
  try {
    if (enc.toLowerCase() === 'q') return decodeURIComponent(x.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, '%$1'));
    return new TextDecoder().decode(Uint8Array.from(atob(x), c => c.charCodeAt(0)));
  } catch {
    return '';
  }
});
export function mailLang(headers) {
  const said = String(headers?.get?.('Content-Language') || '').toLowerCase();
  if (/^zh/.test(said)) return 'zh';
  if (/^en/.test(said)) return 'en';
  const subject = words(headers?.get?.('Subject'));
  if (/[\u3400-\u9fff]/.test(subject)) return 'zh';
  return /[a-z]{2}/i.test(subject) ? 'en' : 'zh';
}
export const replySubject = lang => (lang === 'en' ? 'Your Orbit data request' : '你的 Orbit 資料請求');

// The reply's words, in one language: the plain-text copy.
const WORDS = {
  zh: {
    head: '你的資料請求',
    lead: `我們收到了你寄到 ${PRIVACY_USER}@${DOMAIN} 的信。請選一項，連結 24 小時內有效。`,
    export: '下載我的資料副本',
    delete: '刪除我的帳戶',
    stop: '停止使用統計',
    how: '如果這個信箱是你 Orbit Pass 的救援信箱，點連結就能完成；否則會請你輸入通行碼。刪除後無法復原。資料副本每個帳戶 30 天一次。',
    notYou: '不是你寄的信？不用理會這封，什麼都不會改變。',
    policy: '隱私權政策'
  },
  en: {
    head: 'Your data request',
    lead: `We got your email to ${PRIVACY_USER}@${DOMAIN}. Pick one; the links work for 24 hours.`,
    export: 'Download a copy of my data',
    delete: 'Delete my account',
    stop: 'Stop usage stats',
    how: 'If this is your Orbit Pass’s recovery email, the link alone does it; otherwise it asks for your pass. Deleting can’t be undone. A copy can be downloaded once every 30 days per account.',
    notYou: 'Didn’t write to us? Ignore this email; nothing changes.',
    policy: 'Privacy policy'
  }
};
const wordsOf = lang => WORDS[lang === 'en' ? 'en' : 'zh'];
const policyUrl = lang => `${site()}/privacy/?lang=${lang === 'en' ? 'en' : 'zh'}`;
export function replyText(links, lang = 'zh') {
  const w = wordsOf(lang);
  return `${w.lead}

${w.export}:
${links.export}

${w.delete}:
${links.delete}

${w.stop}:
${links.stop}

${w.how}
${w.notYou}

${w.policy}: ${policyUrl(lang)}
`.replace(/^(.+):\n/gm, lang === 'en' ? '$1:\n' : '$1：\n');
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// The HTML: the family's mail card (site/admin/mail-look.mjs), its buttons the three asks.
export function replyHtml(links, lang = 'zh') {
  const w = wordsOf(lang);
  // (Until the family's card is on main, a plain one in the same words.)
  if (typeof look.cardMailHtml !== 'function') {
    const btn = (href, label, danger) => `<p style="margin:10px 0"><a href="${esc(href)}" style="display:inline-block;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:600;${danger ? 'border:1.5px solid #dc2626;color:#dc2626' : 'background:#4f46e5;color:#fff'}">${esc(label)}</a></p>`;
    return `<!doctype html><html lang="${lang === 'en' ? 'en' : 'zh-Hant'}"><body style="font:16px/1.55 -apple-system,'PingFang TC','Noto Sans TC',sans-serif;color:#111;max-width:520px;margin:0 auto;padding:20px"><p style="font-size:13px;color:#6b7280;margin:0">Orbit Pass</p><h1 style="font-size:22px;margin:4px 0 12px">${esc(w.head)}</h1><p>${esc(w.lead)}</p>${btn(links.export, w.export)}${btn(links.stop, w.stop)}${btn(links.delete, w.delete, true)}<hr style="border:0;border-top:1px solid #e5e7eb;margin:20px 0"><p style="color:#6b7280;font-size:14px">${esc(w.how)} ${esc(w.notYou)}</p><p style="font-size:14px"><a href="${esc(policyUrl(lang))}">${esc(w.policy)}</a></p></body></html>`;
  }
  return look.cardMailHtml({
    lang: lang === 'en' ? 'en' : 'zh',
    eyebrow: 'Orbit Pass',
    headline: w.head,
    preheader: w.lead,
    paras: [w.lead],
    buttons: [
      { label: w.export, link: links.export },
      { label: w.stop, link: links.stop },
      { label: w.delete, link: links.delete, danger: true }
    ],
    note: `${w.how} ${w.notYou}`,
    foot: `<a href="${esc(policyUrl(lang))}">${esc(w.policy)}</a>`
  });
}

// A reply as raw MIME (Email Routing's reply takes the whole message).
const b64 = text => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/.{76}/g, '$&\r\n');
};
export function replyMime({ from, to, inReplyTo, subject, text, html, id = crypto.randomUUID(), now = Date.now() }) {
  const b = `orbit-${id}`;
  return [
    `From: Orbit <${from}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${b64(subject).replace(/\r\n/g, '')}?=`,
    `Message-ID: <${id}@${DOMAIN}>`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    `Date: ${new Date(now).toUTCString()}`,
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-replied',
    `Content-Type: multipart/alternative; boundary="${b}"`,
    '',
    `--${b}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text),
    `--${b}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(html),
    `--${b}--`,
    ''
  ].join('\r\n');
}

// Replies to one address today: under the cap → true (and counted).
async function replyRoom(env, deps, secret, addr, now) {
  const id = `m-${(await mailIndexId(secret, addr)).slice(0, 40)}`;
  const doc = await deps.fsGet(env, PRIVACY_COLLECTION, id).catch(() => ({ exists: false }));
  let row = { day: twDay(now), n: 0 };
  try {
    const was = doc.exists ? JSON.parse(doc.payload) : null;
    if (was?.day === row.day) row = was;
  } catch {}
  if (row.n >= REPLIES_A_DAY) return false;
  row.n++;
  await deps.fsWrite(env, PRIVACY_COLLECTION, id, JSON.stringify(row));
  return true;
}

// Mail to the domain (worker.js email()): privacy@ answered, the rest refused.
// `reply`: how a reply goes (tests); by default Email Routing's own.
export async function privacyMail(message, env, deps, { now = Date.now(), reply = null } = {}) {
  const to = cleanAddr(message.to);
  if (to !== `${PRIVACY_USER}@${DOMAIN}`) return void message.setReject('No mailbox here');
  const from = cleanAddr(message.from);
  const secret = await tokenSecret(env);
  // (No address to answer, an automatic mail (a bounce, an auto-reply: never answered, so two robots can't loop), or no secret.)
  const auto = /^(auto-|yes)/i.test(message.headers?.get?.('Auto-Submitted') || '') || /^(mailer-daemon|postmaster|no-?reply)@/i.test(from);
  if (!from || !secret || auto) return;
  if (!(await replyRoom(env, deps, secret, from, now))) return;
  const docId = await accountOfMail(env, deps, from).catch(() => '');
  const lang = mailLang(message.headers);
  const links = await requestLinks(secret, docId, now, lang);
  const raw = replyMime({ from: `${PRIVACY_USER}@${DOMAIN}`, to: from, inReplyTo: message.headers?.get?.('Message-ID') || '', subject: replySubject(lang), text: replyText(links, lang), html: replyHtml(links, lang), now });
  if (reply) return reply(raw, { from, docId, links, lang });
  const { EmailMessage } = await import('cloudflare:email');
  await message.reply(new EmailMessage(`${PRIVACY_USER}@${DOMAIN}`, message.from, raw));
}

// ---- The confirm page's ask (POST /eco { op: 'privacy', token, passcode? }) ----

// ---- The copy ----
// What each app keeps, as it reads: the apps save packed (gzip in base64
// after a mark like 'm1:', Class's '[ORBIT]' base91 + deflate, JSON after
// 'w1:'); the copy holds it unpacked, each app under its name, and times as
// dates (Jay 11-14: "see if the downloaded copy is even good").
const inflate = async (bytes, kind) => JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(kind))).text());
const B91 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+,-./:;<=>?@[]^_`{|}~';
function base91(str) {
  const bytes = [];
  let b = 0;
  let n = 0;
  let v = -1;
  for (const ch of str) {
    const c = B91.indexOf(ch);
    if (c < 0) continue;
    if (v < 0) {
      v = c;
      continue;
    }
    v += c * 91;
    b |= v << n;
    n += (v & 8191) > 88 ? 13 : 14;
    while (n >= 8) {
      bytes.push(b & 255);
      b >>= 8;
      n -= 8;
    }
    v = -1;
  }
  if (v >= 0) bytes.push((b | (v << n)) & 255);
  return Uint8Array.from(bytes);
}
export async function unpack(v) {
  if (typeof v !== 'string') return v;
  try {
    const orbit = v.match(/^\[ORBIT\]([\s\S]*)\[\/ORBIT\]$/);
    if (orbit) return await inflate(base91(orbit[1].trim()), 'deflate-raw');
    const gz = v.match(/^[a-z]+\d*:(H4sI[A-Za-z0-9+/=\s]+)$/);
    if (gz) return await inflate(Uint8Array.from(atob(gz[1].replace(/\s/g, '')), c => c.charCodeAt(0)), 'gzip');
    const json = v.match(/^(?:[a-z]+\d*:)?([[{][\s\S]*)$/);
    if (json) return JSON.parse(json[1]);
  } catch {}
  return v;
}
// (A number that is a moment, by its name and size: 2017 to 2049.)
const WHEN = /^(t|at|ts|time|created|updated|used|lastUsed|first|last|since|until|added|saved|v2|e|exp|when|start|end|[a-z]+(At|Time|T))$/;
function dated(v, key = '') {
  if (Array.isArray(v)) return v.map(x => dated(x));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dated(x, k)]));
  if (typeof v === 'number' && v > 1.5e12 && v < 2.5e12 && WHEN.test(key)) return new Date(v).toISOString();
  return v;
}
const appName = id => BRANDS[id]?.name || id;
// What a copy says it is, in the language of the page that asked.
const ABOUT = {
  zh: '你的 Orbit Pass 帳戶在下載這一刻存的所有資料。「apps」是每個 App 存的內容（Orbit 存的樣子，已解開成可讀的 JSON）；「account」是帳戶本身；「betweenApps」是 App 之間共用的。使用統計不含帳號，所以不在這裡。',
  en: 'Everything your Orbit Pass account held when this was downloaded. "apps" is what each app keeps (unpacked from how Orbit stores it into readable JSON); "account" is the account itself; "betweenApps" is what the apps share. Usage stats have no account in them, so there are none here.'
};

// Everything the account holds, as one file.
export async function exportOf(env, deps, docId, now = Date.now(), lang = 'zh') {
  const read = async (coll, id) => {
    const doc = await deps.fsGet(env, coll, id).catch(() => ({ exists: false }));
    if (!doc.exists) return null;
    let v = doc.payload;
    try {
      v = JSON.parse(v);
    } catch {}
    return unpack(v);
  };
  const wDoc = await deps.fsGet(env, WALLET_COLLECTION, docId);
  const wallet = wDoc.exists ? parseWallet(wDoc.payload) : null;
  if (!wallet) return null;
  const apps = {};
  for (const [app, { collection }] of Object.entries(ECO_APPS)) {
    const v = await read(collection, docId);
    if (v != null) apps[appName(app)] = v;
  }
  const between = {};
  for (const name of [...Object.keys(ECO_APPS), FAMILY_SHELF]) {
    const v = await read(NOW_COLLECTION, shelfId(docId, name));
    if (v != null) between[ECO_APPS[name] ? appName(name) : name] = v;
  }
  const inbox = {};
  for (const ids of Object.values(wallet.inbox || {})) for (const id of ids) inbox[id] = await read(INBOX_COLLECTION, id);
  const { live, inbox: _, apps: opened, passkeys, mail, ...rest } = publicWallet(wallet);
  const account = {
    id: docId.slice(0, 6),
    recoveryEmail: mailOf(wallet) || null,
    appsOpened: Object.fromEntries(Object.entries(opened || {}).map(([k, v]) => [appName(k), v])),
    passkeys: (passkeys || []).map(({ on, via, t, used }) => ({ device: on || '', via: via || '', added: t, lastUsed: used })),
    ...rest
  };
  return dated({
    about: ABOUT[lang === 'en' ? 'en' : 'zh'],
    downloadedAt: now,
    account,
    apps,
    betweenApps: between,
    inbox
  });
}

// The ask: { file } (a copy), { deleted }, { stopped }, or an error with a code.
export async function privacyDo(ctx) {
  const { env, deps, body, headers, request, secret, ip } = ctx;
  const bad = (code, status = 400, extra = {}) => deps.json({ error: { code, ...extra } }, status, headers);
  const now = deps.now();
  const c = await readToken(secret, String(body.token || ''), 'priv', now);
  if (!c || !KINDS.includes(c.w)) return bad('PRIVACY_LINK_OLD', 400);
  let docId = typeof c.d === 'string' ? c.d : '';
  if (!docId) {
    const passcode = String(body.passcode || '')
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '');
    if (!passcode) return bad('PRIVACY_NEEDS_PASS', 401);
    // (A pass typed here is a sign-in: the same cap an address.)
    const hit = await deps.rateLimitResponse(env, ip, 'eco:login', ECO_LIMITS.login, headers, request);
    if (hit) return hit;
    if (!ECO_PASSCODE_PATTERN.test(passcode)) return bad('SYNC_PASSCODE_NOT_FOUND', 404);
    docId = await passAccount(env, deps, passcode);
    if (!docId) return bad('SYNC_PASSCODE_NOT_FOUND', 404);
  }
  const w = await deps.fsGet(env, WALLET_COLLECTION, docId);
  if (!w.exists) return bad('PRIVACY_NO_ACCOUNT', 404);
  if (c.w === 'export') {
    const doc = await deps.fsGet(env, PRIVACY_COLLECTION, `a-${docId}`).catch(() => ({ exists: false }));
    let last = 0;
    try {
      last = doc.exists ? Number(JSON.parse(doc.payload).export) || 0 : 0;
    } catch {}
    if (last && now - last < EXPORT_EVERY_MS) return bad('PRIVACY_EXPORT_WAIT', 429, { next: last + EXPORT_EVERY_MS });
    const file = await exportOf(env, deps, docId, now, body.lang);
    if (!file) return bad('PRIVACY_NO_ACCOUNT', 404);
    await deps.fsWrite(env, PRIVACY_COLLECTION, `a-${docId}`, JSON.stringify({ export: now }));
    return deps.json({ file }, 200, headers);
  }
  if (c.w === 'delete') {
    await deleteAccount(env, deps, docId, { retire: true });
    await deps.fsDelete(env, PRIVACY_COLLECTION, `a-${docId}`).catch(() => {});
    return deps.json({ deleted: true }, 200, headers);
  }
  await updateWallet(env, deps, docId, x => mergeWallet(x, { settings: { usage: { value: 'off', t: now } } }));
  return deps.json({ stopped: true }, 200, headers);
}
