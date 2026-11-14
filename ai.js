// The family's AI door (Jay 11-10: "AI in every app", code first): every AI
// feature of every app goes through here, by name, never a prompt from a
// phone. Each feature (ai-features.js) says which app may ask it, its
// models in order (the first that answers wins: a second maker as backup),
// its fixed prompt, the JSON it must answer and how that answer is checked
// (numbers come from code, never the model). Every call is a row in
// gemini_call (gemini-use.js) with its tokens, so the admin panel's AI tab
// shows each provider's spend and money left (aiBill).
//
//   POST /ai  (an app, signed with its session)
//     { feature, input }  → { out, ask, left, model } | { error: 'signin' | 'origin' | 'feature' | 'input' | 'cap' | 'busy' | 'paused' | 'upstream', left? }
//
// Taps are capped a Pass a day (the feature's perPass) and everyone a day
// (the admin panel's DEV `ai*`, one count for the app's features, 0
// pauses). Built-once work (builders: a recap, a title) runs through
// aiOnce with the day's cap only, its answer kept by its caller in R2.
import { json, isAllowedOrigin, bodyText, sha256Hex } from './http.js';
import { sessionLimited } from './orbit-token.js';
import { countOf, addOne } from './law.js';
import { keptRead, keptPut } from './kept-store.js';
import { streamOther, makerOf } from './ai-other.js';
import { logCall } from './gemini-use.js';
import { paceOf } from './pace.js';
import { FEATURES } from './ai-features.js';
import { EXAMPLES } from './ai-fixtures.js';
import { buildKeyOk } from './law-hosts.js';

// The models by job (the plan's table): Sonnet judges, Haiku and Luna
// write and fill forms, Gemini reads pictures and PDFs. A feature's backup is
// a model of the same class from another maker (Jay 11-10: "fallback better
// be designed well"): Sonnet ↔ GPT's Sol (judgment), Haiku ↔ Luna (writing,
// forms), Flash → Haiku (pictures: Claude reads them too). Never a lesser
// class behind a better one.
export const MODELS = { sonnet: 'claude-sonnet-5-5', sol: 'gpt-6.1-sol', haiku: 'claude-haiku-5-5', luna: 'gpt-6-luna', flash: 'gemini-3.6-flash', lite: 'gemini-3.5-flash-lite' };
// US$ per 1M tokens (11-10; Flash doubles 2027-01-01): what aiBill counts spend by.
export const PRICES = {
  'claude-sonnet-5-5': { in: 2, cached: 0.1, out: 10 },
  'claude-haiku-5-5': { in: 0.1, cached: 0.01, out: 0.5 },
  'gpt-6-luna': { in: 0.1, cached: 0.025, out: 0.5 },
  'gpt-6.1-sol': { in: 2, cached: 0.5, out: 10 },
  'gemini-3.6-flash': { in: 0.75, cached: 0.075, out: 3.75 },
  'gemini-3.7-flash': { in: 0.75, cached: 0.075, out: 3.75 },
  'gemini-3.5-flash-lite': { in: 0.3, cached: 0.03, out: 2.5 }
};
export const providerOf = model => makerOf(model) || (/^gemini-/.test(model) ? 'google' : null);
export const priceOf = model => PRICES[model] || (providerOf(model) === 'google' ? PRICES['gemini-3.6-flash'] : providerOf(model) === 'anthropic' ? PRICES['claude-sonnet-5-5'] : PRICES['gpt-6.1-sol']);

const twDay = (now = Date.now()) => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

// The Pass behind an app's session, or null.
// ('*': any app's, Orbit 助理 on the Pass sheet; 'showcase': the showcase's
// own pass, counted by the address it was given to: showcase.js.)
const passIn = (session, app) =>
  app === 'showcase' ? (session?.showcase && session.s ? session.s : null) : (app === '*' || session?.a === app) && typeof session?.d === 'string' && session.d ? session.d : null;

// The model's text as JSON (a fence or words around it taken off).
export function jsonOf(text) {
  const t = String(text || '').trim();
  try {
    return JSON.parse(t);
  } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('not json');
}

// One model's answer to a feature's parts. Claude's and OpenAI's straight
// (through the Taiwan relay); Gemini's through `gemini` (worker.js's, with
// its Flash-Lite fallback) when the caller has one. → the parsed JSON, or a throw.
// A feature's effort for one model: a word for all, or a map by model; a
// model the map doesn't name gets its own default (the map itself sent to
// Claude was a 400, and every tap feature fell to its second model).
export const effortFor = (f, m) => (typeof f.effort === 'string' ? f.effort : f.effort && typeof f.effort === 'object' ? (f.effort[m] ?? null) : null);

export async function askModel(env, ctx, feature, model, parts, schema, { effort = null, gemini = null, timeoutMs = 30_000, firstMs = Math.min(timeoutMs, 20_000) } = {}) {
  let res;
  const t0 = Date.now();
  const keep = p => (ctx?.waitUntil ? ctx.waitUntil(p) : p);
  if (makerOf(model)) {
    res = await streamOther(model, parts, schema, env, { timeoutMs, firstMs, effort });
    if (!res.ok) {
      await keep(logCall(env, { feature, model, status: res.status, ms: Date.now() - t0 }));
      throw new Error(`${model} ${res.status}`);
    }
    const j = await res.json();
    await keep(logCall(env, { feature, model, status: 200, usage: j.usageMetadata, ms: Date.now() - t0 }));
    if (j?.candidates?.[0]?.finishReason === 'SAFETY') throw new Error(`${model} refused`);
    return jsonOf((j?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(''));
  }
  if (!gemini) throw new Error('no gemini here');
  res = await gemini(parts, schema, model, { thinking: effort });
  if (!res.ok) throw new Error(`${model} ${res.status}`);
  const j = await res.json();
  return jsonOf((j?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(''));
}

// Ask back (Jay 11-10): a tap feature marked `clarify` may, instead of
// guessing, ask one short question with options to tap ("午餐還是晚餐？"),
// while still filling what it's sure of. The answers come back with the
// next tap (input.answers: [{ q, a }], 3 rounds at most, then it must
// decide). The kit draws the question as chips (kit/ai.mjs aiFlow).
export const MAX_ROUNDS = 3;
export function answersOf(raw) {
  return (Array.isArray(raw) ? raw.slice(0, MAX_ROUNDS) : [])
    .map(x => ({ q: String(x?.q ?? '').trim().slice(0, 80), a: String(x?.a ?? '').trim().slice(0, 120) }))
    .filter(x => x.q && x.a);
}
// A question about one of the person's own lists (a category, a way to
// pay, a subject: the feature's `pick`, each [{ id, name }] in the input)
// names it in ask.field, its options ids from that list: the kit shows
// those as chips and 其他 opens the whole list. Every question can also be
// answered in their own words.
const askSchema = pick => ({ type: 'object', properties: { q: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, ...(pick.length ? { field: { type: 'string', enum: ['', ...pick] } } : {}) }, required: ['q', 'options', ...(pick.length ? ['field'] : [])] });
export function withAsk(parts, schema, answers, en = false, pick = []) {
  const last = answers.length >= MAX_ROUNDS;
  const rule = [
    answers.length ? `Earlier they answered your questions:\n${answers.map(x => `Q: ${x.q}\nA: ${x.a}`).join('\n')}` : '',
    last
      ? 'Do not ask anything more: decide with what you have; ask.q "" and ask.options [].'
      : `ask: when something you need is missing or could mean two things, don't guess: ask.q is ONE short question${en ? ' in English (≤ 12 words)' : ' in Traditional Chinese (≤ 20 字)'}, ask.options 2 to 4 short answers they can tap (≤ 12 characters each, the likeliest first), and still fill in everything you are sure of. When nothing is unclear: ask.q "" and ask.options [].`,
    !last && pick.length ? `When the question is which of their own ${pick.join(' / ')} it is, set ask.field to that name and ask.options to up to 4 ids from that list, likeliest first; otherwise ask.field "".` : ''
  ].filter(Boolean).join('\n');
  const out = parts.map(p => ({ ...p }));
  const i = out.map(p => typeof p.text === 'string').lastIndexOf(true);
  if (i >= 0) out[i].text = `${out[i].text}\n${rule}`;
  else out.push({ text: rule });
  return { parts: out, schema: { ...schema, properties: { ...schema.properties, ask: askSchema(pick) }, required: [...(schema.required || []), 'ask'] } };
}
// lists: the feature's own lists in the input ({ cat: [{ id, name }] }): a
// field's options kept to ids in it (one left is still a question: 其他 opens the list).
export function askOf(raw, answers, lists = {}) {
  if (answers.length >= MAX_ROUNDS) return null;
  const q = String(raw?.ask?.q ?? '').trim().slice(0, 80);
  const field = typeof raw?.ask?.field === 'string' && Array.isArray(lists[raw.ask.field]) ? raw.ask.field : '';
  let options = (Array.isArray(raw?.ask?.options) ? raw.ask.options : []).map(o => String(o ?? '').trim().slice(0, field ? 64 : 24)).filter(Boolean);
  if (field) {
    const ids = new Set(lists[field].map(x => x.id));
    options = options.filter(o => ids.has(o));
  }
  options = [...new Set(options)].slice(0, 4);
  if (!q) return null;
  if (field) return { q, field, options };
  return options.length >= 2 ? { q, options } : null;
}

// Taiwan's characters: a model now and then writes a simplified one (罚 for
// 罰). Only characters with one traditional form are mapped (never 后 发 里 干
// 只 面 台 系 复 冲 余 历 准 制 范 松 云 钟), so a right one is never changed.
const SIMP = '罚罰进進场場赛賽队隊员員胜勝负負对對个個这這们們为為时時点點门門战戰将將击擊连連获獲领領关關键鍵节節让讓帮幫选選总總说說读讀写寫车車费費钱錢买買卖賣记記账帳机機电電话話东東国國会會来來还還过過从從开開动動线線红紅黄黃绿綠蓝藍级級业業华華区區县縣长長军軍头頭号號两兩万萬亿億与與并並无無实實际際经經济濟证證价價涨漲资資产產报報闻聞议議举舉党黨应應该該网網络絡输輸赢贏换換传傳补補伤傷刚剛尔爾维維罗羅马馬乔喬达達杰傑兰蘭亚亞欧歐伦倫凯凱库庫热熱纳納饭飯课課学學练練习習题題义義词詞语語级級园園门門体體备備观觀众眾强強压壓双雙变變旧舊样樣认認识識边邊约約终終';
const SIMP_MAP = new Map();
for (let i = 0; i + 1 < SIMP.length; i += 2) SIMP_MAP.set(SIMP[i], SIMP[i + 1]);
const SIMP_RE = new RegExp(`[${[...SIMP_MAP.keys()].join('')}]`, 'g');
export const twChars = v =>
  typeof v === 'string' ? v.replace(SIMP_RE, c => SIMP_MAP.get(c)) : Array.isArray(v) ? v.map(twChars) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, twChars(x)])) : v;

// A feature's answer: each of its models in turn until one answers JSON
// its check keeps (null from `clean`: nothing usable, the next model tried).
export async function runFeature(env, ctx, name, input, { gemini = null, answers = [] } = {}) {
  const f = FEATURES[name];
  let parts = await f.parts(input, env);
  // (Lean input, Jay 11-10: code picks the facts; a feature's prompt past its size is a bug, never sent.)
  const size = parts.reduce((n, p) => n + (p.text?.length || 0), 0);
  if (size > (f.maxIn || 12_000)) throw new Error(`${name}: input ${size} chars, over ${f.maxIn || 12_000}`);
  let schema = f.schema;
  if (f.clarify) ({ parts, schema } = withAsk(parts, schema, answers, !!input?.en, f.pick || []));
  let last = null;
  for (const m of f.models) {
    const model = MODELS[m] || m;
    try {
      // (A tap gives up on a model silent for 20 s, a person waits; a build waits its whole time:
      // a long answer's thinking passed 20 s and every such call was paid for twice, 11-11's words cards 177 times.)
      const timeoutMs = f.timeoutMs || 30_000;
      const raw = twChars(await askModel(env, ctx, name, model, parts, schema, { effort: effortFor(f, m), gemini, timeoutMs, firstMs: f.tap ? Math.min(timeoutMs, 20_000) : timeoutMs }));
      const ask = f.clarify ? askOf(raw, answers, Object.fromEntries((f.pick || []).map(k => [k, input?.[`${k}s`] || []]))) : null;
      const out = await f.clean(raw, input);
      if (out != null || ask) return { out, ask, model };
      last = new Error(`${model}: nothing usable`);
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error('no model');
}

// The day's count for everyone, by the admin panel's setting for the
// feature (DEV ai*: the caller reads it, worker.js aiCap).
async function spendDay(env, name, cap, day) {
  if (!(cap > 0)) return false;
  return (await addOne(env, `${name}:g`, day)) <= cap;
}

// A built-once job (a builder's recap, a title): the day's cap only.
// → { out, model }; null when capped (the builder stops till tomorrow);
// { error } when no model gave a usable answer (that one is tried again later).
// Made ahead for everyone, read or not (Jay 11-14: "I don't want money spent
// on things I don't open"): paused. Gemini cost US$52 in 4 days (Law's
// 代表會 minutes, whole scanned PDFs, read in bulk each night), the Claude
// credit ran out on News's bulk runs (各方怎麼說 on Sonnet 4 times an hour).
// Each comes back made when someone opens it, or as code; till then the
// apps show what was made before, or the outlet's own words. (env AI_BULK
// 'on': made ahead again; the tests.)
export const BULK_PAUSED = new Set(['news-lines', 'news-sides', 'news-brief', 'news-sport', 'news-markets', 'sports-recap', 'sports-preview', 'f1-story', 'words-cards', 'law-minutes']);
export async function aiOnce(env, ctx, name, input, cap) {
  if (!FEATURES[name] || (BULK_PAUSED.has(name) && env?.AI_BULK !== 'on')) return null;
  if (!(await spendDay(env, name, cap, twDay()))) return null;
  try {
    return await runFeature(env, ctx, name, input);
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 200) };
  }
}

// POST /ai: a tap from an app.
export async function handleAi(request, env, ctx, headers, session, { cap = 0, gemini = null } = {}) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, headers);
  if (!isAllowedOrigin(request.headers.get('Origin') || '')) return json({ error: 'origin' }, 403, headers);
  const text = await bodyText(request, 6_000_000);
  let body = null;
  try {
    body = text == null ? null : JSON.parse(text);
  } catch {}
  const name = String(body?.feature || '');
  const f = FEATURES[name];
  if (!f || !f.tap) return json({ error: 'feature' }, 400, headers);
  const pass = passIn(session, f.app);
  if (!pass) return json({ error: 'signin' }, 401, headers);
  if (sessionLimited(`ai:${name}:${pass}`, f.perMinute || 10)) return json({ error: 'busy' }, 429, headers);
  if ((await paceOf(env)).pace >= 2) return json({ error: 'paused' }, 503, headers);
  const input = f.input(body?.input);
  if (!input) return json({ error: 'input' }, 400, headers);
  // (A `shared` feature's answer is kept for everyone a week, by what it was asked: the same filing, one call.)
  const keptKey = f.shared && (env.RATE_LIMIT_KV || env.DATA) ? `ai:kept:${name}:${(await sha256Hex(JSON.stringify(input))).slice(0, 32)}` : '';
  const kept = keptKey ? await keptRead(env, keptKey) : null;
  if (kept?.out) return json({ out: kept.out, ask: null, left: f.perPass, model: kept.model || null, kept: true }, 200, headers);
  // Spent before the call: the Pass's count first (a capped one adds nothing to the day's).
  const day = twDay();
  const who = `ai:${name}:${(await sha256Hex(`ai|${day}|${pass}`)).slice(0, 24)}`;
  if ((await countOf(env, who, day)) >= f.perPass) return json({ error: 'cap', left: 0 }, 429, headers);
  if (!(await spendDay(env, name, cap, day))) return json({ error: 'cap', left: 0 }, 429, headers);
  const used = await addOne(env, who, day);
  const left = Math.max(0, f.perPass - used);
  try {
    const { out, ask, model } = await runFeature(env, ctx, name, input, { gemini, answers: f.clarify ? answersOf(body?.input?.answers) : [] });
    if (keptKey && out && !ask) {
      const put = keptPut(env, keptKey, { out, model: providerOf(model) }, 8 * 86_400);
      if (ctx?.waitUntil) ctx.waitUntil(put);
      else await put;
    }
    return json({ out, ask: ask || null, left, model: providerOf(model) }, 200, headers);
  } catch {
    return json({ error: 'upstream', left }, 502, headers);
  }
}

// POST /ai/build: an app's nightly build asks a built-once feature (Orbit
// Law's 會議紀錄變表格 and 法案週報 lines, made on GitHub where the papers are
// read). Its key in place of a Pass (X-Build-Key, the secret LAW_BUILD_KEY);
// only features marked `build` with that app; the day's cap as aiOnce's.
//   { feature, input } → { out, model } | { error: 'key' | 'feature' | 'input' | 'cap' | 'upstream' }
const BUILD_KEYS = { law: 'LAW_BUILD_KEY' };
export async function handleAiBuild(request, env, ctx, headers, { cap = 0, gemini = null } = {}) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405, headers);
  const text = await bodyText(request, 13_000_000);
  let body = null;
  try {
    body = text == null ? null : JSON.parse(text);
  } catch {}
  const name = String(body?.feature || '');
  const f = FEATURES[name];
  if (!f?.build || !BUILD_KEYS[f.build]) return json({ error: 'feature' }, 400, headers);
  // (A bulk job paused: the build keeps what it has; 429 stops its asks for the run.)
  if (BULK_PAUSED.has(name) && env?.AI_BULK !== 'on') return json({ error: 'cap', why: 'paused' }, 429, headers);
  if (!buildKeyOk(request.headers.get('X-Build-Key'), env?.[BUILD_KEYS[f.build]])) return json({ error: 'key' }, 401, headers);
  const input = f.input ? f.input(body?.input) : body?.input;
  if (!input) return json({ error: 'input' }, 400, headers);
  if (!(await spendDay(env, name, cap, twDay()))) return json({ error: 'cap' }, 429, headers);
  try {
    const { out, model } = await runFeature(env, ctx, name, input, { gemini });
    return json({ out, model }, 200, headers);
  } catch (e) {
    return json({ error: 'upstream', why: String(e?.message || e).slice(0, 160) }, 502, headers);
  }
}

// ---- What the admin panel's AI tab reads (eco-admin.js `ai`) ----

// Spend in US$ of calls (gemini_call rows), by provider, model and feature.
export function spendOf(calls) {
  const providers = {}, features = {}, models = {};
  for (const c of calls) {
    if (c.status !== 200) continue;
    const p = priceOf(c.model);
    const usd = (c.tin * p.in + c.cached * (p.cached ?? p.in) + c.tout * p.out) / 1e6;
    const prov = providerOf(c.model) || 'google';
    providers[prov] = (providers[prov] || 0) + usd;
    const m = (models[c.model] ||= { n: 0, usd: 0, tin: 0, tout: 0 });
    m.n++;
    m.usd += usd;
    m.tin += c.tin + c.cached;
    m.tout += c.tout;
    const f = (features[c.feature] ||= { n: 0, usd: 0, fail: 0 });
    f.n++;
    f.usd += usd;
  }
  for (const c of calls) if (c.status !== 200) (features[c.feature] ||= { n: 0, usd: 0, fail: 0 }).fail++;
  return { providers, features, models };
}

// Each provider's money left: the balance the owner last read off the
// provider's own page and typed in (US$, and when), less what the calls
// since cost; how long that lasts at the last 7 days' rate; the 25% and 10%
// marks of the balance typed (a top-up: type the new balance).
// saved: { anthropic: { usd, at }, openai: {…}, google: {…} }.
export const PROVIDERS = ['anthropic', 'openai', 'google'];
export function moneyLeft(saved, calls, now = Date.now()) {
  const out = {};
  for (const prov of PROVIDERS) {
    const s = saved?.[prov];
    const mine = calls.filter(c => (providerOf(c.model) || 'google') === prov);
    const spent = s ? spendOf(mine.filter(c => c.at >= s.at)).providers[prov] || 0 : 0;
    const week = spendOf(mine.filter(c => c.at >= now - 7 * 86_400_000)).providers[prov] || 0;
    const left = s ? Number(s.usd) - spent : null;
    const perDay = week / 7;
    const share = s && s.usd > 0 ? left / s.usd : null;
    out[prov] = { typed: s || null, spent, left, perDay, days: left != null && perDay > 0 ? Math.max(0, Math.floor(left / perDay)) : null, tone: share == null ? '' : share <= 0.1 ? 'bad' : share <= 0.25 ? 'warn' : '' };
  }
  return out;
}

// Each feature's speed and health from its calls (ms logged since 11-10):
// the middle and the slow end of its answered calls, today's failures, how
// often a backup model answered (any model past its first), and each
// model's answers (`models`); the week's failures (`fail`, `why`: by
// status and model) and today's backups (`backupToday`), so the panel can
// tell a failure a backup answered from one nobody did.
export function healthOf(calls, firstModel = {}, now = Date.now()) {
  const out = {};
  const day = twDay(now);
  for (const c of calls) {
    const f = (out[c.feature] ||= { ms: [], failToday: 0, fail: 0, why: {}, n: 0, backup: 0, backupToday: 0, models: {} });
    if (c.status === 200) {
      f.n++;
      if (firstModel[c.feature] && c.model !== firstModel[c.feature] && twDay(c.at) === day) f.backupToday++;
      // (Which model answered, each counted: admin's AI 錢包 shows them.)
      if (c.model) f.models[c.model] = (f.models[c.model] || 0) + 1;
      if (Number.isFinite(c.ms)) f.ms.push(c.ms);
      if (firstModel[c.feature] && c.model !== firstModel[c.feature]) f.backup++;
    } else {
      // (The week's failures by status and model: 504 our time limit, 429 the maker pacing us…)
      f.fail++;
      const k = `${c.status} ${c.model}`;
      f.why[k] = (f.why[k] || 0) + 1;
      if (twDay(c.at) === day) f.failToday++;
    }
  }
  for (const f of Object.values(out)) {
    const ms = f.ms.sort((a, b) => a - b);
    f.mid = ms.length ? ms[Math.floor(ms.length / 2)] : null;
    f.slow = ms.length ? ms[Math.floor(ms.length * 0.9)] : null;
    delete f.ms;
  }
  return out;
}

// An example's pictures and PDFs by address (site/ai-try/: a real-looking
// contract photographed), read and sent as the phone would: { mime_type, data }.
async function withFiles(input) {
  if (!Array.isArray(input?.files) || !input.files.some(f => f?.url)) return input;
  const files = await Promise.all(
    input.files.map(async f => {
      if (!f?.url) return f;
      const res = await fetch(f.url, { signal: AbortSignal.timeout(15_000) });
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { mime_type: f.mime_type || res.headers.get('content-type') || 'image/jpeg', data: btoa(bin) };
    })
  );
  return { ...input, files };
}

// The ops check `ai-try` (build.yml): a feature's examples through each
// model named (or its own chain), with answers given for any question back
// (an example's `answers`), timed. Counts as calls in the log ('ai-try').
export async function aiTry(env, ctx, name, { models = [], from = 0, n = 3, gemini = null } = {}) {
  const f = FEATURES[name];
  if (!f) return { error: 'feature', features: Object.keys(FEATURES) };
  const examples = (EXAMPLES[name] || []).slice(from, from + Math.min(10, Math.max(1, n)));
  const out = [];
  for (const ex of examples) {
    let given = await withFiles(ex.input);
    // (A picture by its address: read and sent as the phone sends one.)
    if (given?.imageUrl) {
      try {
        const res = await fetch(given.imageUrl);
        const bytes = new Uint8Array(await res.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        given = { ...given, image: { mime_type: res.headers.get('Content-Type')?.split(';')[0] || 'image/jpeg', data: btoa(bin) } };
      } catch {}
    }
    const input = f.input ? f.input(given) : given;
    if (!input) {
      out.push({ example: ex.name, error: 'input refused' });
      continue;
    }
    for (const m of models.length ? models : [null]) {
      const t0 = Date.now();
      try {
        const g = m ? { ...f, models: [m] } : f;
        FEATURES[`${name}~try`] = g;
        const r = await runFeature(env, ctx, `${name}~try`, input, { gemini, answers: ex.answers || [] });
        out.push({ example: ex.name, model: r.model, ms: Date.now() - t0, out: r.out, ask: r.ask || null });
      } catch (e) {
        out.push({ example: ex.name, model: m, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 200) });
      } finally {
        delete FEATURES[`${name}~try`];
      }
    }
  }
  return { feature: name, results: out };
}
