// Orbit Money's 讀圖: a picture of purchases (a receipt, a 載具 or store app's
// screenshot, a bill) read by Gemini into what was bought, for the person to
// look over before anything is saved. Only ever on a tap (the app reads an
// invoice's QR codes itself first, free); a day's cap a Pass and in all.
//
//   POST /money-read (the app, signed with its session)
//     { image: { mime_type, data } }  base64, one picture
//     → { buys: [{ day, store, total, invoice, items: [{ name, amt }] }], left }
//       or { error: 'signin' | 'origin' | 'image' | 'cap' | 'busy' | 'setup' | 'upstream', left? }
//
// The day's counts are law.js's (one row a key a day in D1).
import { json, isAllowedOrigin, bodyText, sha256Hex } from './http.js';
import { sessionLimited } from './orbit-token.js';
import { countOf, addOne } from './law.js';
import { passOfMoney } from './money-mail.js';

export const READ_LIMITS = { perPass: 30, perDay: 300, maxBody: 6_000_000, maxBuys: 60, maxItems: 60 };
const MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const INVOICE = /^[A-Z]{2}\d{8}$/;

const twDay = (now = Date.now()) => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

export function readPrompt(today) {
  return [
    'You read a picture of purchases from Taiwan for a personal money book: a paper receipt or 收據, an e-invoice (電子發票), a screenshot of the 財政部 統一發票兌獎 app or a store or payment app listing purchases, or a bill.',
    `Today is ${today} (Asia/Taipei).`,
    'Return every separate purchase you can see in `buys`, in the order shown. A single receipt is one purchase; a list of invoices is one purchase per row.',
    'For each: day as YYYY-MM-DD (民國 year + 1911 = the year; a day with no year is the latest such day not after today; "" when no date is shown), store (the seller as printed, short, no 股份有限公司 or 分公司), total (the whole amount paid, a whole number of NT$), invoice (the 發票號碼, two capital letters and eight digits, no dash; "" when none), items (each line bought with its amount in NT$, as printed; [] when the picture shows none).',
    'Read only what the picture shows. Never guess a store, a day, a number or an item that isn’t there. Leave out a purchase whose total can’t be read. Cancelled or voided (作廢) invoices are left out.',
    'If the picture shows no purchases at all, return an empty `buys`.'
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
          day: { type: 'string' },
          store: { type: 'string' },
          total: { type: 'number' },
          invoice: { type: 'string' },
          items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, amt: { type: 'number' } }, required: ['name', 'amt'] } }
        },
        required: ['day', 'store', 'total', 'invoice', 'items']
      }
    }
  },
  required: ['buys']
};

// The model's answer, kept to what can be true: a real day, a whole positive
// total, an invoice number's form; anything else dropped.
export function cleanBuys(raw, today) {
  const out = [];
  for (const b of Array.isArray(raw?.buys) ? raw.buys.slice(0, READ_LIMITS.maxBuys) : []) {
    const total = Math.round(Number(b?.total));
    if (!(total > 0 && total < 100_000_000)) continue;
    const day = DAY.test(String(b.day || '')) && !Number.isNaN(Date.parse(b.day)) && b.day <= today ? b.day : '';
    const invoice = String(b.invoice || '').replace(/[-\s]/g, '').toUpperCase();
    const items = (Array.isArray(b.items) ? b.items : [])
      .slice(0, READ_LIMITS.maxItems)
      .map(i => ({ name: String(i?.name || '').trim().slice(0, 40), amt: Math.round(Number(i?.amt)) || 0 }))
      .filter(i => i.name);
    out.push({ day, store: String(b.store || '').trim().slice(0, 40), total, invoice: INVOICE.test(invoice) ? invoice : '', items });
  }
  return out;
}

export async function handleMoneyRead(request, env, headers, session, gemini) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, headers);
  if (!isAllowedOrigin(request.headers.get('Origin') || '')) return json({ error: 'origin' }, 403, headers);
  const pass = passOfMoney(session);
  if (!pass) return json({ error: 'signin' }, 401, headers);
  if (sessionLimited(`money-read:${pass}`, 10)) return json({ error: 'busy' }, 429, headers);
  const text = await bodyText(request, READ_LIMITS.maxBody);
  let image = null;
  try {
    image = text == null ? null : JSON.parse(text)?.image;
  } catch {}
  if (!image || !MIME.includes(image.mime_type) || typeof image.data !== 'string' || !image.data || image.data.length > READ_LIMITS.maxBody) return json({ error: 'image' }, 400, headers);
  if (!env.GEMINI_API_KEY) return json({ error: 'setup' }, 503, headers);

  // Spent before the call: the Pass's count first (a capped one adds nothing to the day's).
  const day = twDay();
  const who = `money-read:${(await sha256Hex(`money|${day}|${pass}`)).slice(0, 24)}`;
  if ((await countOf(env, who, day)) >= READ_LIMITS.perPass) return json({ error: 'cap', left: 0 }, 429, headers);
  if ((await addOne(env, 'money-read:g', day)) > READ_LIMITS.perDay) return json({ error: 'cap', left: 0 }, 429, headers);
  const used = await addOne(env, who, day);
  if (used > READ_LIMITS.perPass) return json({ error: 'cap', left: 0 }, 429, headers);
  const left = Math.max(0, READ_LIMITS.perPass - used);

  try {
    const res = await gemini([{ text: readPrompt(day) }, { inline_data: { mime_type: image.mime_type, data: image.data } }], READ_SCHEMA);
    if (!res.ok) return json({ error: 'upstream', left }, 502, headers);
    const j = await res.json();
    const raw = JSON.parse((j?.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join(''));
    return json({ buys: cleanBuys(raw, day), left }, 200, headers);
  } catch {
    return json({ error: 'upstream', left }, 502, headers);
  }
}
