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
export async function requestLinks(secret, docId, now = Date.now()) {
  const out = {};
  for (const w of KINDS) {
    const t = await signToken(secret, { k: 'priv', w, ...(docId ? { d: docId } : {}), e: now + LINK_MS });
    out[w] = `${site()}/privacy/request/#t=${t}`;
  }
  return out;
}

// The reply's words, both languages (we don't know theirs).
export function replyText(links) {
  const zh = `你好，我們收到了你寄到 ${PRIVACY_USER}@${DOMAIN} 的信。請選一個（連結 24 小時內有效）：

下載我的資料副本：
${links.export}

刪除我的 Orbit Pass 帳戶（無法復原）：
${links.delete}

停止使用統計：
${links.stop}

如果這個信箱是你 Orbit Pass 的救援信箱，點連結就能完成；否則點連結後要輸入你的通行碼。
資料副本每個帳戶 30 天一次。不是你寄的信？不用理會這封。

隱私權政策：${site()}/privacy/`;
  const en = `Hi, we got your email to ${PRIVACY_USER}@${DOMAIN}. Pick one (links work for 24 hours):

Download a copy of my data:
${links.export}

Delete my Orbit Pass account (can't be undone):
${links.delete}

Stop usage stats:
${links.stop}

If this address is your Orbit Pass's recovery email, the link alone does it; otherwise the link asks for your pass.
A copy can be downloaded once every 30 days per account. Didn't write to us? Ignore this email.

Privacy policy: ${site()}/privacy/?lang=en`;
  return `${zh}\n\n— — —\n\n${en}\n`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function replyHtml(links) {
  const btn = (href, label) => `<p style="margin:8px 0"><a href="${esc(href)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;
  const part = (lead, a, b, c, note) => `<p>${esc(lead)}</p>${btn(links.export, a)}${btn(links.delete, b)}${btn(links.stop, c)}<p style="color:#666;font-size:14px">${esc(note)}</p>`;
  return `<!doctype html><html><body style="font:16px/1.5 -apple-system,'PingFang TC','Noto Sans TC',sans-serif;color:#111;max-width:560px;margin:0 auto;padding:16px">
${part(`你好，我們收到了你寄到 ${PRIVACY_USER}@${DOMAIN} 的信。請選一個（連結 24 小時內有效）：`, '下載我的資料副本', '刪除我的帳戶（無法復原）', '停止使用統計', '如果這個信箱是你 Orbit Pass 的救援信箱，點連結就能完成；否則點連結後要輸入通行碼。資料副本每個帳戶 30 天一次。不是你寄的信？不用理會這封。')}
<hr style="border:0;border-top:1px solid #ddd;margin:24px 0">
${part(`Hi, we got your email to ${PRIVACY_USER}@${DOMAIN}. Pick one (links work for 24 hours):`, 'Download a copy of my data', "Delete my account (can't be undone)", 'Stop usage stats', "If this address is your Orbit Pass's recovery email, the link alone does it; otherwise the link asks for your pass. A copy once every 30 days per account. Didn't write to us? Ignore this email.")}
<p style="color:#666;font-size:14px"><a href="${site()}/privacy/">隱私權政策 · Privacy policy</a></p></body></html>`;
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
  const links = await requestLinks(secret, docId, now);
  const raw = replyMime({ from: `${PRIVACY_USER}@${DOMAIN}`, to: from, inReplyTo: message.headers?.get?.('Message-ID') || '', subject: 'Orbit 資料請求 · Your Orbit data request', text: replyText(links), html: replyHtml(links), now });
  if (reply) return reply(raw, { from, docId, links });
  const { EmailMessage } = await import('cloudflare:email');
  await message.reply(new EmailMessage(`${PRIVACY_USER}@${DOMAIN}`, message.from, raw));
}

// ---- The confirm page's ask (POST /eco { op: 'privacy', token, passcode? }) ----

// Everything the account holds, as one file.
export async function exportOf(env, deps, docId, now = Date.now()) {
  const read = async (coll, id) => {
    const doc = await deps.fsGet(env, coll, id).catch(() => ({ exists: false }));
    if (!doc.exists) return null;
    try {
      return JSON.parse(doc.payload);
    } catch {
      return doc.payload;
    }
  };
  const wDoc = await deps.fsGet(env, WALLET_COLLECTION, docId);
  const wallet = wDoc.exists ? parseWallet(wDoc.payload) : null;
  if (!wallet) return null;
  const apps = {};
  for (const [app, { collection }] of Object.entries(ECO_APPS)) {
    const v = await read(collection, docId);
    if (v != null) apps[app] = v;
  }
  const now_ = {};
  for (const name of [...Object.keys(ECO_APPS), FAMILY_SHELF]) {
    const v = await read(NOW_COLLECTION, shelfId(docId, name));
    if (v != null) now_[name] = v;
  }
  const inbox = {};
  for (const [app, ids] of Object.entries(wallet.inbox || {})) for (const id of ids) inbox[id] = await read(INBOX_COLLECTION, id);
  const { live, ...pub } = publicWallet(wallet);
  return {
    about: 'Orbit Pass: everything this account holds, as of the date below. Usage stats have no account in them, so there are none here. 這個帳戶的所有資料；使用統計不含帳號，所以不在這裡。',
    at: new Date(now).toISOString(),
    account: docId.slice(0, 6),
    recoveryEmail: mailOf(wallet) || null,
    wallet: pub,
    apps,
    underWay: now_,
    inbox
  };
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
    const file = await exportOf(env, deps, docId, now);
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
