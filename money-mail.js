// Orbit Money's mail-in 載具 invoices. A person can't have 財政部's AppID, so
// the 載具's invoices come by mail: the person gives the 電子發票平台 the
// account's own address, <box>@MAIL_DOMAIN, as the 手機條碼's email and turns
// on 消費發票彙整通知, and the platform mails the CSV every month by itself
// (Cloudflare Email Routing's catch-all sends every address to the Worker's
// email handler). A one-off 匯出, or a Gmail forward, lands the same way.
//
//   email     the mail's CSV attachments read (kit/carrier-csv.mjs), their
//             invoices kept for the box's Pass until the app takes them;
//             an address no Pass owns is turned away
//   /money-mail (the app, signed with its session):
//     GET  ?op=box          { address, items, confirm, note, got }  (the box made
//                           on first ask; address '' until MAIL_DOMAIN is set;
//                           confirm: Gmail's forwarding code { code, at }; note:
//                           財政部's last mail with no invoices, such as the check
//                           of a new address { subject, link, code, at }; got:
//                           the last mail with invoices { at, n })
//     POST ?op=took {upto}  the items received up to then dropped (in the books now)
//     POST ?op=new          a new address (the old one stops)
//     POST ?op=fwd {to}     the person's own inbox ('' for none): each of
//                           財政部's mails is copied there (Email Sending,
//                           env.EMAIL, from einvoice@MAIL_DOMAIN, reply-to 財政部),
//                           so giving the platform this address loses nothing
//
// Store: orbit-money-mail/<pass> { box, items: [{ …invoice, at }], confirm, note, got, fwd, sent } and
// orbit-money-mail/box_<box> { pass }.
import { json } from './http.js';
import { changeDoc, parseDoc } from './doc-store.js';
import { sessionLimited } from './orbit-token.js';
import { parseCarrierCsv, csvText } from './kit/carrier-csv.mjs';
import { MAIL_DOMAIN } from './kit/domain.mjs';

export const MAIL_COLLECTION = 'orbit-money-mail';
export const MAX_MAIL_BYTES = 4_000_000;
export const MAX_ITEMS = 3000;
const BOX = /^[a-z0-9]{10}$/;

export const passOfMoney = session => (session?.a === 'money' && typeof session.d === 'string' && session.d ? session.d : null);
const newBox = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
// (The family's domain, kit/domain.mjs; a MAIL_DOMAIN var overrides it.)
const mailDomain = env => env.MAIL_DOMAIN || MAIL_DOMAIN;
const addressOf = (env, box) => (mailDomain(env) && box ? `${box}@${mailDomain(env)}` : '');

// ---- The mail ---------------------------------------------------------------------

// A part's body decoded to bytes (base64, quoted-printable, or as it is).
function decodeBody(body, encoding) {
  const enc = String(encoding || '').toLowerCase();
  if (enc === 'base64') {
    try {
      return Uint8Array.from(atob(body.replace(/[^A-Za-z0-9+/=]/g, '')), c => c.charCodeAt(0));
    } catch {
      return new Uint8Array();
    }
  }
  const bin = enc === 'quoted-printable' ? body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : body;
  return Uint8Array.from(bin, c => c.charCodeAt(0) & 255);
}
// Headers (unfolded, lower-cased names) and body of one MIME entity, read as
// latin1 so the bytes survive until a part is decoded.
function splitEntity(raw) {
  const cut = raw.search(/\r?\n\r?\n/);
  const head = cut < 0 ? raw : raw.slice(0, cut);
  const body = cut < 0 ? '' : raw.slice(cut).replace(/^\r?\n\r?\n/, '');
  const headers = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { headers, body };
}
const param = (value, name) => new RegExp(`${name}\\*?=(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(value || '')?.slice(1).find(Boolean) || '';

// Every file-like part of a raw mail that may be the export: CSV or plain
// text, by type or name (a forwarded mail keeps its attachments; a mail
// forwarded inline is read as text too). Bytes each.
export function csvParts(raw, depth = 0) {
  const { headers, body } = splitEntity(raw);
  const type = headers['content-type'] || 'text/plain';
  if (/^multipart\//i.test(type) && depth < 6) {
    const boundary = param(type, 'boundary');
    if (!boundary) return [];
    return body
      .split(`--${boundary}`)
      .slice(1)
      .filter(p => !p.startsWith('--'))
      .flatMap(p => csvParts(p.replace(/^\r?\n/, ''), depth + 1));
  }
  if (/^message\/rfc822/i.test(type) && depth < 6) return csvParts(body, depth + 1);
  const name = param(headers['content-disposition'], 'filename') || param(type, 'name');
  if (/csv|text\/plain|octet-stream|excel/i.test(type) || /\.(csv|txt)$/i.test(name)) return [decodeBody(body, headers['content-transfer-encoding'])];
  return [];
}

// Bytes as a one-char-a-byte string (TextDecoder's 'latin1' is really
// windows-1252, which moves 0x80–0x9f).
export function binary(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return out;
}

// The invoices a raw mail carries (deduplicated by number).
export function mailInvoices(raw) {
  const byNo = new Map();
  for (const bytes of csvParts(raw)) for (const inv of parseCarrierCsv(csvText(bytes))) byNo.set(inv.no, inv);
  return [...byNo.values()];
}

// The text a person reads in a mail: its text/plain and text/html parts that
// aren't attachments, decoded with their charset.
export function mailText(raw, depth = 0) {
  const { headers, body } = splitEntity(raw);
  const type = headers['content-type'] || 'text/plain';
  if (/^multipart\//i.test(type) && depth < 6) {
    const boundary = param(type, 'boundary');
    if (!boundary) return '';
    return body
      .split(`--${boundary}`)
      .slice(1)
      .filter(p => !p.startsWith('--'))
      .map(p => mailText(p.replace(/^\r?\n/, ''), depth + 1))
      .join('\n');
  }
  if (!/^text\/(plain|html)/i.test(type) || /attachment/i.test(headers['content-disposition'] || '')) return '';
  const bytes = decodeBody(body, headers['content-transfer-encoding']);
  let charset = param(type, 'charset') || 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}
// A header's encoded words (=?UTF-8?B?…?=, =?Big5?Q?…?=) read.
export function headerText(value) {
  return String(value || '').replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=\s*/gi, (_, charset, enc, text) => {
    const bin = enc.toUpperCase() === 'B' ? (() => { try { return atob(text); } catch { return ''; } })() : text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (__, h) => String.fromCharCode(parseInt(h, 16)));
    try {
      return new TextDecoder(charset).decode(Uint8Array.from(bin, c => c.charCodeAt(0) & 255));
    } catch {
      return bin;
    }
  });
}
// 財政部's own mail that carries no invoices (the check of a new address, a
// prize notice): its subject, the platform link to open (one with a query
// first: the check's), and any code in it, for the app to show. null for
// anyone else's mail.
export function einvoiceNote(from, raw) {
  if (!/@([a-z0-9-]+\.)*nat\.gov\.tw\b/i.test(String(from || ''))) return null;
  const { headers } = splitEntity(raw);
  const text = mailText(raw).replace(/&amp;/g, '&');
  const links = [...new Set(text.match(/https?:\/\/[a-z0-9.-]*einvoice\.nat\.gov\.tw[^\s"'<>)\]]*/gi) || [])].filter(u => !/\.(png|jpe?g|gif|svg|css|js)(\?|$)/i.test(u));
  const link = links.find(u => u.includes('?')) || links[0] || '';
  const code = /(?:驗證碼|認證碼|verification code)[^0-9A-Za-z]{0,12}([0-9A-Za-z]{4,12})/i.exec(text.replace(/<[^>]+>/g, ' '))?.[1] || '';
  return { subject: headerText(headers.subject).trim().slice(0, 120), link: link.slice(0, 600), code };
}

// Every leaf part of a mail: { type, name, inline, bytes }.
export function leafParts(raw, depth = 0) {
  const { headers, body } = splitEntity(raw);
  const type = headers['content-type'] || 'text/plain';
  if (/^multipart\//i.test(type) && depth < 6) {
    const boundary = param(type, 'boundary');
    if (!boundary) return [];
    return body
      .split(`--${boundary}`)
      .slice(1)
      .filter(p => !p.startsWith('--'))
      .flatMap(p => leafParts(p.replace(/^\r?\n/, ''), depth + 1));
  }
  const disposition = headers['content-disposition'] || '';
  const name = headerText(param(disposition, 'filename') || param(type, 'name'));
  return [{ type: type.split(';')[0].trim().toLowerCase(), charset: param(type, 'charset'), name, inline: !/attachment/i.test(disposition) && !name, bytes: decodeBody(body, headers['content-transfer-encoding']) }];
}
const decodeText = (bytes, charset) => {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
};
// A mail as Email Sending's send() takes it: the same subject, words and
// files, sent from our domain (only an onboarded domain may send) with
// replies going to the one who wrote it.
export function mailCopy(raw, from, to, domain) {
  const { headers } = splitEntity(raw);
  const leaves = leafParts(raw);
  const text = leaves.find(l => l.inline && l.type === 'text/plain');
  const html = leaves.find(l => l.inline && l.type === 'text/html');
  const files = leaves.filter(l => !l.inline).slice(0, 10);
  return {
    from: { email: `einvoice@${domain}`, name: '財政部電子發票（Orbit 轉寄）' },
    to,
    replyTo: String(from || '').replace(/^.*<([^>]+)>.*$/, '$1').trim() || undefined,
    subject: headerText(headers.subject).trim().slice(0, 200) || '財政部電子發票',
    ...(text ? { text: decodeText(text.bytes, text.charset) } : {}),
    ...(html ? { html: decodeText(html.bytes, html.charset) } : {}),
    ...(!text && !html ? { text: ' ' } : {}),
    ...(files.length ? { attachments: files.map((f, i) => ({ content: f.bytes, filename: f.name || `attachment-${i + 1}`, type: f.type || 'application/octet-stream', disposition: 'attachment' })) } : {})
  };
}
// An inbox a copy may go to: a plain address, never one of our own boxes.
export const fwdOk = (to, env) => typeof to === 'string' && to.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(to) && !to.toLowerCase().endsWith(`@${mailDomain(env)}`);
const fromGov = from => /@([a-z0-9-]+\.)*nat\.gov\.tw\b/i.test(String(from || ''));

// Gmail's forwarding check: its confirmation code, or ''.
export function gmailCode(from, raw) {
  if (!/forwarding-noreply@google\.com/i.test(String(from || ''))) return '';
  const { body } = splitEntity(raw);
  return /(?:confirmation code|確認碼|確認代碼)\s*[:：]\s*(\d{6,12})/i.exec(raw)?.[1] || /\b(\d{9})\b/.exec(body)?.[1] || '';
}

// Items kept: the newest copy of each invoice, at most MAX_ITEMS.
export function addItems(items, invoices, at) {
  const byNo = new Map((items || []).map(i => [i.no, i]));
  for (const inv of invoices) byNo.set(inv.no, { ...inv, at });
  return [...byNo.values()].sort((a, b) => a.at - b.at).slice(-MAX_ITEMS);
}

// The email handler: worker.js's `email` hands each message here.
export async function handleMoneyMail(message, env, deps) {
  const local = String(message.to || '').split('@')[0].toLowerCase();
  const owner = BOX.test(local) ? parseDoc(await deps.fsGet(env, MAIL_COLLECTION, `box_${local}`))?.pass : null;
  if (!owner) return message.setReject('No such mailbox');
  if (message.rawSize > MAX_MAIL_BYTES) return message.setReject('Too large');
  const raw = binary(new Uint8Array(await new Response(message.raw).arrayBuffer()));
  const at = Date.now();
  // Gmail asks the new forwarding address to confirm with a code: kept for the app to show.
  const code = gmailCode(message.from, raw);
  if (code) {
    await changeDoc(env, deps, MAIL_COLLECTION, owner, v => ({ ...v, confirm: { code, at } }), { read: v => v || { box: local, items: [] } });
    return { owner, added: 0 };
  }
  const invoices = mailInvoices(raw);
  const read = v => v || { box: local, items: [] };
  let doc;
  if (!invoices.length) {
    // 財政部 checking the address (the app shows its link to tap), or another notice.
    const note = einvoiceNote(message.from, raw);
    if (note) doc = await changeDoc(env, deps, MAIL_COLLECTION, owner, v => ({ ...v, note: { ...note, at } }), { read });
  } else doc = await changeDoc(env, deps, MAIL_COLLECTION, owner, v => ({ ...v, items: addItems(v.items, invoices, at), got: { at, n: invoices.length } }), { read });
  // 財政部's mail copied on to the person's own inbox, as it used to arrive.
  if (doc?.fwd && fromGov(message.from) && env.EMAIL && fwdOk(doc.fwd, env)) {
    let sent;
    try {
      await env.EMAIL.send(mailCopy(raw, message.from, doc.fwd, mailDomain(env)));
      sent = { at, ok: true };
    } catch (error) {
      sent = { at, ok: false, code: String(error?.code || error?.message || 'failed').slice(0, 60) };
      console.log('money-mail copy failed', sent.code);
    }
    await changeDoc(env, deps, MAIL_COLLECTION, owner, v => ({ ...v, sent }), { read }).catch(() => {});
  }
  return { owner, added: invoices.length };
}

// ---- The app's side ----------------------------------------------------------------

export async function handleMoneyMailRequest(request, env, headers, session, deps) {
  const pass = passOfMoney(session);
  if (!pass) return json({ error: 'signin' }, 401, headers);
  if (sessionLimited(`money-mail:${pass}`, 20)) return json({ error: 'busy' }, 429, headers);
  const op = new URL(request.url).searchParams.get('op') || 'box';
  const read = v => v || { box: '', items: [] };
  // A box for this Pass (made when it has none; `fresh`: a new one).
  const boxFor = async fresh => {
    const doc = read(parseDoc(await deps.fsGet(env, MAIL_COLLECTION, pass)));
    if (doc.box && !fresh) return doc;
    const box = newBox();
    await deps.fsWrite(env, MAIL_COLLECTION, `box_${box}`, JSON.stringify({ pass }), { exists: false });
    // (A new address starts over: the platform has to be told it again.)
    const next = await changeDoc(env, deps, MAIL_COLLECTION, pass, v => (fresh ? { ...v, box, note: null, got: null, confirm: null } : { ...v, box }), { read });
    if (doc.box) await deps.fsDelete(env, MAIL_COLLECTION, `box_${doc.box}`).catch(() => {});
    return next;
  };
  if (op === 'box' && request.method === 'GET') {
    const doc = await boxFor(false);
    return json({ address: addressOf(env, doc.box), items: doc.items || [], confirm: doc.confirm || null, note: doc.note || null, got: doc.got || null, fwd: doc.fwd || '', sent: doc.sent || null }, 200, headers);
  }
  if (op === 'new' && request.method === 'POST') {
    const doc = await boxFor(true);
    return json({ address: addressOf(env, doc.box), items: doc.items || [], note: null, got: null, fwd: doc.fwd || '', sent: doc.sent || null }, 200, headers);
  }
  if (op === 'took' && request.method === 'POST') {
    let upto = 0;
    try {
      upto = Number(JSON.parse(await request.text()).upto) || 0;
    } catch {}
    const doc = await changeDoc(env, deps, MAIL_COLLECTION, pass, v => {
      const items = (v.items || []).filter(i => i.at > upto);
      return items.length === (v.items || []).length ? v : { ...v, items };
    }, { read });
    return json({ items: doc?.items || [] }, 200, headers);
  }
  if (op === 'fwd' && request.method === 'POST') {
    let to = '';
    try {
      to = String(JSON.parse(await request.text()).to || '').trim();
    } catch {}
    if (to && !fwdOk(to, env)) return json({ error: 'address' }, 400, headers);
    const doc = await changeDoc(env, deps, MAIL_COLLECTION, pass, v => ({ ...v, fwd: to, sent: null }), { read });
    return json({ fwd: doc?.fwd || '' }, 200, headers);
  }
  return json({ error: 'op' }, 400, headers);
}
