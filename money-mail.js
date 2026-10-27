// Orbit Money's mail-in 載具 invoices. A person can't have 財政部's AppID, so
// the 載具's invoices come as the CSV the 電子發票平台 emails (查詢消費發票 ›
// 匯出); a mail rule forwards it to the account's own address,
// <box>@MAIL_DOMAIN, and this reads it (Cloudflare Email Routing's catch-all
// sends every address to the Worker's email handler).
//
//   email     the mail's CSV attachments read (kit/carrier-csv.mjs), their
//             invoices kept for the box's Pass until the app takes them;
//             an address no Pass owns is turned away
//   /money-mail (the app, signed with its session):
//     GET  ?op=box          { address, items, confirm }  (the box made on first ask;
//                           address '' until MAIL_DOMAIN is set; confirm: Gmail's
//                           forwarding code { code, at }, when one came)
//     POST ?op=took {upto}  the items received up to then dropped (in the books now)
//     POST ?op=new          a new address (the old one stops)
//
// Store: orbit-money-mail/<pass> { box, items: [{ …invoice, at }] } and
// orbit-money-mail/box_<box> { pass }.
import { json } from './http.js';
import { changeDoc, parseDoc } from './doc-store.js';
import { sessionLimited } from './orbit-token.js';
import { parseCarrierCsv, csvText } from './kit/carrier-csv.mjs';

export const MAIL_COLLECTION = 'orbit-money-mail';
export const MAX_MAIL_BYTES = 4_000_000;
export const MAX_ITEMS = 3000;
const BOX = /^[a-z0-9]{10}$/;

export const passOfMoney = session => (session?.a === 'money' && typeof session.d === 'string' && session.d ? session.d : null);
const newBox = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
const addressOf = (env, box) => (env.MAIL_DOMAIN && box ? `${box}@${env.MAIL_DOMAIN}` : '');

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
  if (!invoices.length) return { owner, added: 0 };
  await changeDoc(env, deps, MAIL_COLLECTION, owner, v => ({ ...v, items: addItems(v.items, invoices, at) }), { read: v => v || { box: local, items: [] } });
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
    const next = await changeDoc(env, deps, MAIL_COLLECTION, pass, v => ({ ...v, box }), { read });
    if (doc.box) await deps.fsDelete(env, MAIL_COLLECTION, `box_${doc.box}`).catch(() => {});
    return next;
  };
  if (op === 'box' && request.method === 'GET') {
    const doc = await boxFor(false);
    return json({ address: addressOf(env, doc.box), items: doc.items || [], confirm: doc.confirm || null }, 200, headers);
  }
  if (op === 'new' && request.method === 'POST') {
    const doc = await boxFor(true);
    return json({ address: addressOf(env, doc.box), items: doc.items || [] }, 200, headers);
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
  return json({ error: 'op' }, 400, headers);
}
