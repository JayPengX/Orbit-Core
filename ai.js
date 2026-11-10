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
import { streamOther, makerOf } from './ai-other.js';
import { logCall } from './gemini-use.js';
import { paceOf } from './pace.js';
import { FEATURES } from './ai-features.js';
import { EXAMPLES } from './ai-fixtures.js';

// The models by job (the plan's table): Sonnet judges, Haiku and Luna
// write and fill forms, Gemini reads pictures and PDFs.
export const MODELS = { sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5', luna: 'gpt-6-luna', flash: 'gemini-3.6-flash', lite: 'gemini-3.5-flash-lite' };
// US$ per 1M tokens (11-10; Flash doubles 2027-01-01): what aiBill counts spend by.
export const PRICES = {
  'claude-sonnet-5-5': { in: 2, cached: 0.2, out: 10 },
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
const passIn = (session, app) => (session?.a === app && typeof session.d === 'string' && session.d ? session.d : null);

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
export async function askModel(env, ctx, feature, model, parts, schema, { effort = null, gemini = null, timeoutMs = 30_000 } = {}) {
  let res;
  const t0 = Date.now();
  const keep = p => (ctx?.waitUntil ? ctx.waitUntil(p) : p);
  if (makerOf(model)) {
    res = await streamOther(model, parts, schema, env, { timeoutMs, firstMs: Math.min(timeoutMs, 20_000), effort });
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
      const raw = await askModel(env, ctx, name, model, parts, schema, { effort: f.effort?.[m] ?? f.effort ?? null, gemini, timeoutMs: f.timeoutMs || 30_000 });
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
export async function aiOnce(env, ctx, name, input, cap) {
  if (!FEATURES[name]) return null;
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
  // Spent before the call: the Pass's count first (a capped one adds nothing to the day's).
  const day = twDay();
  const who = `ai:${name}:${(await sha256Hex(`ai|${day}|${pass}`)).slice(0, 24)}`;
  if ((await countOf(env, who, day)) >= f.perPass) return json({ error: 'cap', left: 0 }, 429, headers);
  if (!(await spendDay(env, name, cap, day))) return json({ error: 'cap', left: 0 }, 429, headers);
  const used = await addOne(env, who, day);
  const left = Math.max(0, f.perPass - used);
  try {
    const { out, ask, model } = await runFeature(env, ctx, name, input, { gemini, answers: f.clarify ? answersOf(body?.input?.answers) : [] });
    return json({ out, ask: ask || null, left, model: providerOf(model) }, 200, headers);
  } catch {
    return json({ error: 'upstream', left }, 502, headers);
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
// often a backup model answered (any model past its first).
export function healthOf(calls, firstModel = {}, now = Date.now()) {
  const out = {};
  const day = twDay(now);
  for (const c of calls) {
    const f = (out[c.feature] ||= { ms: [], failToday: 0, n: 0, backup: 0 });
    if (c.status === 200) {
      f.n++;
      if (Number.isFinite(c.ms)) f.ms.push(c.ms);
      if (firstModel[c.feature] && c.model !== firstModel[c.feature]) f.backup++;
    } else if (twDay(c.at) === day) f.failToday++;
  }
  for (const f of Object.values(out)) {
    const ms = f.ms.sort((a, b) => a - b);
    f.mid = ms.length ? ms[Math.floor(ms.length / 2)] : null;
    f.slow = ms.length ? ms[Math.floor(ms.length * 0.9)] : null;
    delete f.ms;
  }
  return out;
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
    const input = f.input ? f.input(ex.input) : ex.input;
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
