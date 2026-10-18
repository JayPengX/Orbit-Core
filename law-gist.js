// ---- law-gist.js: POST /law-gist, Orbit Law's short summaries for cards ----
// The same for everyone, so kept in KV and shared; a Pass of Orbit Law's
// asks (none, a 401 {error:'pass'}) but isn't counted: new gists are capped
// by the day in all instead (200, D1's 'gist'), and kept ones are free.
//   { kind: 'bill', items: [{ k, bill: 議案編號 }] (≤ 10), lang }: each
//     bill's 議案名稱, 案由 and 對照表 (立法院's API), one call a batch:
//     { gists: [{ k, line (one sentence: what changes for people), who (≤ 3
//     groups), covered }] }, an item it couldn't do left out. Kept 60 days
//     by bill and language.
//   { kind: 'law', p, lang }: the law's text (a long one: its headings, its
//     first 3 articles and its definitions) → { gist (2 sentences), points
//     (≤ 5, each citing an article it was given, checked as /law-ask's),
//     covered, law, cached }. Kept 180 days by the law's version.
// 30 asks a minute a Pass (a bill list asks in batches); stopped from the
// guard's pace 2.
import { json } from './http.js';
import { PCODE, BILL, fail, twDay, citeKey, cited, label, readLaw, readBill, billRows, rowText, opening, passOf, countOf, addOne, kept, keep, modelJson } from './law.js';

export const GIST_LIMITS = { perDay: 200, perMinute: 30, maxItems: 10, billChars: 2_500, lawChars: 14_000, maxBody: 4096 };
const BILL_TTL_S = 60 * 86_400;
const LAW_TTL_S = 180 * 86_400;
const K = /^[\w:.-]{1,40}$/;
// A line's length at most (characters), by language.
const LINE = { zh: 40, en: 90 };
const writeIn = l => (l === 'en' ? 'plain English' : 'Traditional Chinese as used in Taiwan (繁體中文)');

// The ask, read and checked; a string is what's wrong with it.
export function readGist(body) {
  if (!body || typeof body !== 'object') return 'bad';
  const { kind, lang = 'zh' } = body;
  if (lang !== 'zh' && lang !== 'en') return 'lang';
  if (kind === 'law') return typeof body.p === 'string' && PCODE.test(body.p) ? { kind, p: body.p, lang } : 'p';
  if (kind !== 'bill') return 'kind';
  const { items } = body;
  if (!Array.isArray(items) || !items.length || items.length > GIST_LIMITS.maxItems) return 'items';
  if (!items.every(x => typeof x?.k === 'string' && K.test(x.k) && typeof x.bill === 'string' && BILL.test(x.bill))) return 'items';
  return { kind, items: [...new Map(items.map(x => [x.k, { k: x.k, bill: x.bill }])).values()], lang };
}

// `n` new gists from the day's cap: false when they don't fit (or the
// count fails).
async function spendGists(env, n, day) {
  if ((await countOf(env, 'gist', day)) + n > GIST_LIMITS.perDay) return false;
  return (await addOne(env, 'gist', day, n)) <= GIST_LIMITS.perDay;
}

// ---- kind 'bill' -----------------------------------------------------------------

const BILL_SCHEMA = {
  type: 'object',
  properties: { gists: { type: 'array', items: { type: 'object', properties: { k: { type: 'string' }, line: { type: 'string' }, who: { type: 'array', items: { type: 'string' } }, covered: { type: 'boolean' } }, required: ['k', 'line', 'who', 'covered'] } } },
  required: ['gists']
};

export function billGistPrompt(bills, lang) {
  const body = bills
    .map(({ k, bill }) => `=== [k "${k}"] 「${bill.n}」 (${bill.by || 'unknown'})\n${bill.why ? `案由: ${bill.why.slice(0, 600)}\n` : ''}${billRows(bill.rows, GIST_LIMITS.billChars).map(rowText).join('\n')}`)
    .join('\n\n');
  return `For each bill before Taiwan's Legislative Yuan (立法院) below, write a one-line summary for a card, using ONLY that bill's own text (its name, 案由 and comparison table). Return JSON matching the schema: one entry per bill, its k exactly as given.

${body}

Rules:
- line: one sentence of at most ${LINE[lang]} characters saying what changes for ordinary people (e.g. 「長照服務對象擴大到 55 歲以上原住民」), neutral: it's a proposal.
- who: up to 3 short names of the groups it affects.
- covered: false, with line empty and who empty, when the bill's text is too thin to say what changes.
- Write in ${writeIn(lang)}.`;
}

// The model's gists, checked: only the items asked for, a covered one with
// a line (cut to the language's length), a thin one with neither.
export function checkGists(raw, ks, lang) {
  const asked = new Set(ks);
  const out = new Map();
  for (const g of Array.isArray(raw?.gists) ? raw.gists : []) {
    if (!asked.has(g?.k) || out.has(g.k)) continue;
    const line = typeof g.line === 'string' ? [...g.line.trim()].slice(0, LINE[lang]).join('') : '';
    const covered = g.covered === true && Boolean(line);
    const who = covered ? (Array.isArray(g.who) ? g.who : []).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, 3) : [];
    out.set(g.k, { k: g.k, line: covered ? line : '', who, covered });
  }
  return [...out.values()];
}

async function billGists(ask, env, ctx, headers, gemini) {
  const keyOf = bill => `law:gist:bill:v1:${bill}|${ask.lang}`;
  const hits = await Promise.all(ask.items.map(async x => [x, await kept(env, keyOf(x.bill))]));
  const gists = hits.filter(([, h]) => h).map(([x, h]) => ({ k: x.k, ...h }));
  const missing = hits.filter(([, h]) => !h).map(([x]) => x);
  if (!missing.length) return json({ gists }, 200, headers);
  // Each bill read (one not there, or that can't be read, is left out); one
  // with no text at all is thin without asking.
  let why = null;
  const unread = () => {
    why = 'upstream';
    return null;
  };
  const read = (await Promise.all(missing.map(async x => ({ ...x, bill: await readBill(x.bill).catch(unread) })))).filter(x => x.bill);
  const toAsk = [];
  for (const x of read) {
    if (x.bill.rows.length || x.bill.why) toAsk.push(x);
    else {
      const thin = { line: '', who: [], covered: false };
      keep(env, ctx, keyOf(x.bill.id), thin, BILL_TTL_S);
      gists.push({ k: x.k, ...thin });
    }
  }
  if (toAsk.length) {
    if (!env.GEMINI_API_KEY) why = 'setup';
    else if (!(await spendGists(env, toAsk.length, twDay()))) why = 'cap';
    else {
      try {
        for (const g of checkGists(await modelJson(gemini, billGistPrompt(toAsk, ask.lang), BILL_SCHEMA), toAsk.map(x => x.k), ask.lang)) {
          const { k, ...gist } = g;
          keep(env, ctx, keyOf(toAsk.find(x => x.k === k).bill.id), gist, BILL_TTL_S);
          gists.push(g);
        }
      } catch {
        why = 'upstream';
      }
    }
  }
  // Nothing at all to show: why, as the other routes say it.
  if (!gists.length && why) return fail(why, { cap: 429, setup: 503, upstream: 502 }[why], headers);
  return json({ gists }, 200, headers);
}

// ---- kind 'law' ------------------------------------------------------------------

const LAW_SCHEMA = {
  type: 'object',
  properties: { gist: { type: 'string' }, points: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, cites: { type: 'array', items: { type: 'string' } } }, required: ['text', 'cites'] } }, covered: { type: 'boolean' } },
  required: ['gist', 'points', 'covered']
};

// What the model reads of a law: all of it when it's short; else its
// headings, its first 3 articles and its definitions (用詞，定義如下, 本法所稱),
// while they fit.
export function gistParts(law, max = GIST_LIMITS.lawChars) {
  const rows = law.a.filter(x => Array.isArray(x) && (x[0] === 'A' || x[0] === 'C') && typeof x[2] === 'string');
  const arts = rows.filter(x => x[0] === 'A');
  if (rows.reduce((n, x) => n + x[2].length, 0) <= max) return { rows, keys: arts.map(x => String(x[1])) };
  const first = new Set(arts.slice(0, 3));
  const want = rows.filter(x => x[0] === 'C' || first.has(x) || /用詞，定義如下|本法所稱/.test(x[2]));
  const out = [];
  let n = 0;
  for (const x of want) {
    if (n + x[2].length > max) continue;
    n += x[2].length;
    out.push(x);
  }
  return { rows: out, keys: out.filter(x => x[0] === 'A').map(x => String(x[1])) };
}

export function lawGistPrompt(law, rows, lang) {
  const body = rows.map(([kind, key, text]) => (kind === 'C' ? `## ${text}` : `[key "${key}"] ${label(String(key), 'zh')}\n${text}`)).join('\n\n');
  return `Introduce Taiwan's 「${law.n}」 (version ${law.m}) to a member of the public, using ONLY the text quoted below (its headings and articles; a long law is quoted in part). Return JSON matching the schema.

${body}

Rules:
- gist: 2 sentences in plain words: what this law is about and whom it concerns.
- points: up to 5 key points; each one's cites lists the key of every article it rests on, exactly as given in quotes (e.g. "15" or "15-1"). Never a point without a cite, never a key not listed above.
- Use only the text above; no outside knowledge. covered: false if it's too thin to say what the law does.
- Write in ${writeIn(lang)}.`;
}

async function lawGist(ask, env, ctx, headers, gemini) {
  let law;
  try {
    law = await readLaw(ask.p);
  } catch {
    return fail('upstream', 502, headers);
  }
  if (!law) return fail('law', 404, headers);
  const info = { p: law.p, n: law.n, m: law.m };
  const key = `law:gist:law:v1:${law.p}|${law.m}|${ask.lang}`;
  const hit = await kept(env, key);
  if (hit) return json({ ...hit, law: info, cached: true }, 200, headers);
  const { rows, keys } = gistParts(law);
  if (!keys.length) return fail('law', 404, headers);
  if (!env.GEMINI_API_KEY) return fail('setup', 503, headers);
  if (!(await spendGists(env, 1, twDay()))) return fail('cap', 429, headers);
  let out;
  try {
    const raw = await modelJson(gemini, lawGistPrompt(law, rows, ask.lang), LAW_SCHEMA);
    const points = cited(raw?.points, new Set(keys), citeKey, 5);
    out = { gist: typeof raw?.gist === 'string' ? raw.gist.trim() : '', points, covered: raw?.covered === true && points.length > 0 };
  } catch {
    return fail('upstream', 502, headers);
  }
  keep(env, ctx, key, out, LAW_TTL_S);
  return json({ ...out, law: info, cached: false }, 200, headers);
}

// gemini(parts, schema) -> the upstream Response (worker.js's proxyGeminiRequest);
// session: the request's Quadra Pass session (worker.js), or null.
export async function handleLawGist(request, env, ctx, headers, session, gemini) {
  const ask = await opening(request, env, headers, { maxBody: GIST_LIMITS.maxBody, read: readGist, who: passOf(session), busy: ['law:gist:m', GIST_LIMITS.perMinute] });
  if (ask instanceof Response) return ask;
  return (ask.kind === 'bill' ? billGists : lawGist)(ask, env, ctx, headers, gemini);
}
