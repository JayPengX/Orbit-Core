// Orbit Money's 拍照記帳: any picture of money spent or received (a receipt,
// an invoice, a bill, a store or payment app's screenshot, a transfer
// notice, a price tag) read by Gemini into entries, for the person to look
// over before anything is saved. Only ever on the person's tap (picking the
// picture is the tap); a day's cap a Pass and in all.
//
//   POST /money-read (the app, signed with its session)
//     { image: { mime_type, data },  base64, one picture
//       cats: [{ id, name, k }],     the person's categories and subs ('餐飲 › 午餐'), k out | in
//       pays: [{ id, name }] }       their ways to pay ('台新 · Richart •1234'), id 'acct|card'
//     → { buys: [{ k, day, store, total, items: [{ name, amt }], cat, pay, invoice }], left }
//       cat / pay: one of the ids sent, '' when the picture doesn't say
//       or { error: 'signin' | 'origin' | 'image' | 'cap' | 'busy' | 'setup' | 'upstream', left? }
//
// The day's counts are law.js's (one row a key a day in D1).
import { json, isAllowedOrigin, bodyText, sha256Hex } from './http.js';
import { sessionLimited } from './orbit-token.js';
import { countOf, addOne } from './law.js';
import { DEV } from './kit/brand.mjs';
// The Pass behind an Orbit Money session (its token's `d`), or null.
const passOfMoney = session => (session?.a === 'money' && typeof session.d === 'string' && session.d ? session.d : null);

export const READ_LIMITS = { perPass: 30, perDay: DEV.aiMoneyRead.def, maxBody: 6_000_000, maxBuys: 60, maxItems: 60, maxCats: 160, maxPays: 60 };
const MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const INVOICE = /^[A-Z]{2}\d{8}$/;

const twDay = (now = Date.now()) => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

// The lists the app sent, kept short and plain: [{ id, name, k? }].
export function cleanList(list, max) {
  return (Array.isArray(list) ? list : [])
    .slice(0, max)
    .map(x => ({ id: String(x?.id || '').slice(0, 64), name: String(x?.name || '').replace(/\s+/g, ' ').trim().slice(0, 48), k: x?.k === 'in' ? 'in' : 'out' }))
    .filter(x => x.id && x.name);
}

export function readPrompt(today, cats = [], pays = []) {
  return [
    'You read one picture for a personal money book in Taiwan and turn it into entries.',
    'The picture can be anything that shows money spent or received: a paper receipt or 收據, an e-invoice (電子發票), a bill (電費, 水費, 電信, 信用卡帳單), a screenshot of a store, delivery, ride, shopping or payment app (LINE Pay, 街口, 全支付, Apple Pay, a bank app), a transfer or payment notice, a ticket, or a price tag or menu.',
    `Today is ${today} (Asia/Taipei).`,
    'Return each separate payment you can see in `buys`, in the order shown. One receipt or one bill is one entry; a list of orders or invoices is one entry per row.',
    'For each: k "out" for money paid, "in" for money received (a salary, a transfer to the person, a refund paid out to them); day as YYYY-MM-DD (民國 year + 1911 = the year; a day with no year is the latest such day not after today; "" when no date shows); store (who was paid or who paid, short as people say it: 全家, 7-ELEVEN, Uber Eats, 台電; no 股份有限公司 or 分公司); total (the whole amount paid, after discounts, a whole number of NT$); items (each line bought with its amount in NT$ as printed; [] when none show); invoice (a 發票號碼 if one is printed: two capital letters and eight digits, no dash; "" otherwise).',
    cats.length ? `cat: the id of the one category below that fits best, or "" when unsure. Categories (id: name):\n${cats.map(c => `${c.id}: ${c.name}${c.k === 'in' ? ' (income)' : ''}`).join('\n')}` : 'cat: "".',
    pays.length ? `pay: the id of the way it was paid, from the list below, only when the picture shows it (a card's last four digits, a wallet's name or logo, 現金); "" otherwise. Ways to pay (id: name):\n${pays.map(p => `${p.id}: ${p.name}`).join('\n')}` : 'pay: "".',
    'A price tag or menu shows a price, not a purchase: return it only when one item, or the items marked as ordered, can be told apart; total is their sum.',
    'Read only what the picture shows. Never guess a store, a day, a number or an item that isn’t there. Leave out an entry whose total can’t be read, and anything cancelled, voided (作廢) or failed.',
    'If the picture shows no payment at all, return an empty `buys`.'
  ].join('\n');
}

export const READ_SCHEMA = {
  type: 'object',
  properties: {
    buys: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          k: { type: 'string', enum: ['out', 'in'] },
          day: { type: 'string' },
          store: { type: 'string' },
          total: { type: 'number' },
          items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, amt: { type: 'number' } }, required: ['name', 'amt'] } },
          cat: { type: 'string' },
          pay: { type: 'string' },
          invoice: { type: 'string' }
        },
        required: ['k', 'day', 'store', 'total', 'items', 'cat', 'pay', 'invoice']
      }
    }
  },
  required: ['buys']
};

// The model's answer, kept to what can be true: a real day, a whole positive
// total, an invoice number's form, a category and way to pay from the
// person's own lists (an income only under an income category); anything else dropped.
export function cleanBuys(raw, today, { cats = [], pays = [] } = {}) {
  const catK = new Map(cats.map(c => [c.id, c.k]));
  const payIds = new Set(pays.map(p => p.id));
  const out = [];
  for (const b of Array.isArray(raw?.buys) ? raw.buys.slice(0, READ_LIMITS.maxBuys) : []) {
    const total = Math.round(Number(b?.total));
    if (!(total > 0 && total < 100_000_000)) continue;
    const k = b.k === 'in' ? 'in' : 'out';
    const day = DAY.test(String(b.day || '')) && !Number.isNaN(Date.parse(b.day)) && b.day <= today ? b.day : '';
    const invoice = String(b.invoice || '').replace(/[-\s]/g, '').toUpperCase();
    const items = (Array.isArray(b.items) ? b.items : [])
      .slice(0, READ_LIMITS.maxItems)
      .map(i => ({ name: String(i?.name || '').trim().slice(0, 40), amt: Math.round(Number(i?.amt)) || 0 }))
      .filter(i => i.name);
    const cat = String(b.cat || '');
    const pay = String(b.pay || '');
    out.push({ k, day, store: String(b.store || '').trim().slice(0, 40), total, items, cat: catK.get(cat) === k ? cat : '', pay: payIds.has(pay) ? pay : '', invoice: INVOICE.test(invoice) ? invoice : '' });
  }
  return out;
}

export async function handleMoneyRead(request, env, headers, session, gemini, dayCap = READ_LIMITS.perDay) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, headers);
  if (!isAllowedOrigin(request.headers.get('Origin') || '')) return json({ error: 'origin' }, 403, headers);
  const pass = passOfMoney(session);
  if (!pass) return json({ error: 'signin' }, 401, headers);
  if (sessionLimited(`money-read:${pass}`, 10)) return json({ error: 'busy' }, 429, headers);
  const text = await bodyText(request, READ_LIMITS.maxBody);
  let body = null;
  try {
    body = text == null ? null : JSON.parse(text);
  } catch {}
  const image = body?.image;
  if (!image || !MIME.includes(image.mime_type) || typeof image.data !== 'string' || !image.data || image.data.length > READ_LIMITS.maxBody) return json({ error: 'image' }, 400, headers);
  if (!env.GEMINI_API_KEY) return json({ error: 'setup' }, 503, headers);
  const cats = cleanList(body.cats, READ_LIMITS.maxCats);
  const pays = cleanList(body.pays, READ_LIMITS.maxPays);

  // Spent before the call: the Pass's count first (a capped one adds nothing to the day's).
  const day = twDay();
  const who = `money-read:${(await sha256Hex(`money|${day}|${pass}`)).slice(0, 24)}`;
  if ((await countOf(env, who, day)) >= READ_LIMITS.perPass) return json({ error: 'cap', left: 0 }, 429, headers);
  if ((await addOne(env, 'money-read:g', day)) > dayCap) return json({ error: 'cap', left: 0 }, 429, headers);
  const used = await addOne(env, who, day);
  if (used > READ_LIMITS.perPass) return json({ error: 'cap', left: 0 }, 429, headers);
  const left = Math.max(0, READ_LIMITS.perPass - used);

  try {
    const res = await gemini([{ text: readPrompt(day, cats, pays) }, { inline_data: { mime_type: image.mime_type, data: image.data } }], READ_SCHEMA);
    if (!res.ok) return json({ error: 'upstream', left }, 502, headers);
    const j = await res.json();
    const raw = JSON.parse((j?.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join(''));
    return json({ buys: cleanBuys(raw, day, { cats, pays }), left }, 200, headers);
  } catch {
    return json({ error: 'upstream', left }, 502, headers);
  }
}
