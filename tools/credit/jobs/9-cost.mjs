// Job 9: what each AI feature costs at a cheaper setting, and whether it's
// still as good (Jay 11-11: "significant improvement for all AI usage while
// retaining the quality we intended"). Every feature's examples
// (ai-fixtures.js) answered live-shaped (ai-other.js requestOf, the
// feature's own clean) at its current setting and at each candidate (a lower
// effort, a cheaper model); each call's tokens kept; then Opus 5.5 compares
// each candidate's answer with the current one, blind (A/B shuffled), for
// what the feature is for. Direct calls (each call's usage), not a batch.
//   node jobs/9-cost.mjs go [feature,feature…]  → out/9-cost.json
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ledger } from '../lib.mjs';
import { FEATURES } from '../../../ai-features.js';
import { EXAMPLES } from '../../../ai-fixtures.js';
import { MODELS, effortFor, jsonOf, twChars, PRICES } from '../../../ai.js';
import { requestOf } from '../../../ai-other.js';

const KEY = process.env.ANTHROPIC_CREDIT_KEY;
const JUDGE = 'claude-opus-5-5';
const PRICE = { ...PRICES, 'claude-opus-5-5': { in: 4, cached: 0.2, out: 20 } };
const usd = (m, u) => ((u.input_tokens || 0) * PRICE[m].in + (u.cache_read_input_tokens || 0) * PRICE[m].cached + (u.output_tokens || 0) * PRICE[m].out) / 1e6;

// [model key, effort] per feature: the first is how it runs now (null effort: the model's own default).
const CUR = name => {
  const f = FEATURES[name];
  const m = f.models.find(x => /^claude-/.test(MODELS[x])) || 'haiku';
  return [m, effortFor(f, m)];
};
const CANDIDATES = {
  'news-sides': [['sonnet', 'medium'], ['sonnet', 'low'], ['haiku', 'medium']],
  'orbit-ask': [['sonnet', 'low'], ['haiku', 'medium'], ['haiku', 'low']],
  'law-contract': [['sonnet', 'low']],
  'law-contract-read': [['haiku', 'low'], ['haiku', 'medium']],
  'class-book': [['haiku', 'low'], ['haiku', 'medium']],
  'words-photo': [['haiku', 'low'], ['haiku', 'medium']],
  'law-minutes': [['haiku', 'low'], ['haiku', 'medium']]
};
// (A feature that runs on Gemini now: its "current" is Haiku at its default, the candidates beside it.)
const GEMINI_NOW = new Set(['class-book', 'words-photo', 'law-minutes', 'law-contract-read']);
const variantsOf = name => {
  const cur = CUR(name);
  const extra = CANDIDATES[name] || (cur[0] === 'haiku' && cur[1] !== 'low' ? [['haiku', 'low']] : []);
  return [cur, ...extra.filter(v => !(v[0] === cur[0] && v[1] === cur[1]))];
};

async function b64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return { mime_type: r.headers.get('Content-Type')?.split(';')[0] || 'image/jpeg', data: Buffer.from(await r.arrayBuffer()).toString('base64') };
}
async function given(raw) {
  let g = { ...raw };
  if (g.imageUrl) g.image = await b64(g.imageUrl);
  if (Array.isArray(g.files)) g.files = await Promise.all(g.files.map(async f => (f.url ? { ...(await b64(f.url)), mime_type: f.mime_type || 'image/jpeg' } : f)));
  if (g.pdfUrl) g.pdf = { ...(await b64(g.pdfUrl)), mime_type: 'application/pdf' };
  return g;
}

async function call(model, parts, schema, effort) {
  const req = requestOf(model, parts, schema, { ANTHROPIC_API_KEY: KEY }, effort);
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const res = await fetch(req.url, { ...req.init, signal: AbortSignal.timeout(180_000) }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: String(e) } }) }));
    const j = await res.json().catch(() => null);
    if (res.ok) return { j, ms: Date.now() - t0 };
    if (![0, 429, 500, 502, 503, 529].includes(res.status)) throw new Error(`${model} ${res.status} ${j?.error?.message || ''}`.slice(0, 300));
    await new Promise(r => setTimeout(r, 5000 * (i + 1)));
  }
  throw new Error(`${model}: gave up`);
}

// One feature's example at one setting → { out, usage, ms, error }.
async function answer(name, input, [mk, effort], answers = []) {
  const f = FEATURES[name];
  const model = MODELS[mk];
  let parts = await f.parts(input, {});
  let schema = f.schema;
  if (f.clarify) {
    const { withAsk } = await import('../../../ai.js');
    ({ parts, schema } = withAsk(parts, schema, answers, !!input?.en, f.pick || []));
  }
  const { j, ms } = await call(model, parts, schema, effort);
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let out = null, error = null;
  try {
    const raw = twChars(jsonOf(text));
    out = await f.clean(raw, input);
    if (out == null) error = 'clean: nothing usable';
    if (raw?.ask?.q) out = { ...(out || {}), ask: raw.ask };
  } catch (e) {
    error = String(e?.message || e).slice(0, 200);
  }
  return { model, effort, out, error, usage: j.usage, usd: usd(model, j.usage), ms, stop: j.stop_reason };
}

async function judge(name, input, a, b) {
  const f = FEATURES[name];
  const brief = (await f.parts(input, {})).map(p => p.text || '[a picture or file]').join('\n').slice(0, 7000);
  const flip = Math.random() < 0.5;
  const [A, B] = flip ? [b, a] : [a, b];
  const prompt = [
    'You check an app feature\'s AI answers. Below: the instructions and input the model was given (the feature\'s own prompt), then two answers A and B after the app\'s own checks (fields a check threw away are already gone; null means nothing usable).',
    'Judge each against what the prompt asks: correct and faithful to the input (no invented facts, names, numbers), follows every length and format rule, as useful to the person. Ignore wording differences that don\'t change quality.',
    'Return: better "A", "B" or "same" (same when a reader would not notice a difference in quality), a 1–10 score for each, and issues: the concrete problems of the worse one (empty when same).',
    '--- PROMPT ---', brief,
    '--- ANSWER A ---', JSON.stringify(A.out ?? null).slice(0, 6000),
    '--- ANSWER B ---', JSON.stringify(B.out ?? null).slice(0, 6000)
  ].join('\n');
  const schema = { type: 'object', properties: { better: { type: 'string', enum: ['A', 'B', 'same'] }, scoreA: { type: 'number' }, scoreB: { type: 'number' }, issues: { type: 'string' } }, required: ['better', 'scoreA', 'scoreB', 'issues'] };
  const { j } = await call(JUDGE, [{ text: prompt }], schema, 'medium');
  const v = jsonOf((j.content || []).filter(x => x.type === 'text').map(x => x.text).join(''));
  const un = s => (s === 'same' ? 'same' : (s === 'A') !== flip ? 'current' : 'candidate');
  return { better: un(v.better), current: flip ? v.scoreB : v.scoreA, candidate: flip ? v.scoreA : v.scoreB, issues: v.issues, usd: usd(JUDGE, j.usage) };
}

// (News 各方怎麼說 on today's real stories too, batched as the builder does: two examples are too few to tell.)
if (process.env.LIVE_NEWS || process.argv[2] === 'news') {
  const { sideFacts, sidesWanted } = await import('../../../builders/ai.js');
  const idx = await (await fetch('https://orbit.jaypengx.com/api/data/news/index.json')).json();
  const front = ['tw', 'intl'].flatMap(r => (idx[r] || []).filter(s => sidesWanted(s, r)).slice(0, r === 'tw' ? 12 : 8).map(s => sideFacts(s, r)));
  for (let i = 0; i < front.length; i += 4) EXAMPLES['news-sides'].push({ name: `live ${i / 4 + 1}`, input: { stories: front.slice(i, i + 4) } });
}
const only = (process.env.BATCHES || process.argv[3] || '').split(',').filter(Boolean);
const names = Object.keys(EXAMPLES).filter(n => FEATURES[n] && (only.length ? only.includes(n) : true));
const REPS = Number(process.env.REPS || 2);
const outFile = path.join(ROOT, 'out', '9-cost.json');
const all = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
let spent = 0;
const cap = Number(process.env.CAP_USD || 8);
for (const name of names) {
  const vs = variantsOf(name);
  if (vs.length < 2 && !GEMINI_NOW.has(name)) continue;
  const rows = [];
  for (const [i, ex] of EXAMPLES[name].entries()) {
    if (spent > cap) break;
    let input;
    try {
      const g = await given(ex.input);
      input = FEATURES[name].input ? FEATURES[name].input(g) : g;
    } catch (e) {
      rows.push({ example: ex.name, error: String(e).slice(0, 200) });
      continue;
    }
    if (!input) {
      rows.push({ example: ex.name, error: 'input refused' });
      continue;
    }
    const runs = [];
    for (const v of vs) {
      const reps = [];
      for (let r = 0; r < REPS; r++) {
        try {
          const a = await answer(name, input, v, ex.answers || []);
          spent += a.usd;
          reps.push(a);
        } catch (e) {
          reps.push({ model: MODELS[v[0]], effort: v[1], error: String(e?.message || e).slice(0, 300) });
        }
      }
      runs.push({ v, reps });
    }
    const base = runs[0].reps.find(x => !x.error) || runs[0].reps[0];
    for (const run of runs.slice(1)) {
      const cand = run.reps.find(x => !x.error) || run.reps[0];
      try {
        run.judge = await judge(name, input, base, cand);
        spent += run.judge.usd;
      } catch (e) {
        run.judge = { error: String(e?.message || e).slice(0, 200) };
      }
    }
    rows.push({ example: ex.name, runs });
    console.log(name, ex.name, runs.map(r => `${r.v.join(':')} $${(r.reps.reduce((n, x) => n + (x.usd || 0), 0) / r.reps.length).toFixed(5)} out ${Math.round(r.reps.reduce((n, x) => n + (x.usage?.output_tokens || 0), 0) / r.reps.length)} ${r.judge ? `→ ${r.judge.better} ${r.judge.current}/${r.judge.candidate}` : ''}`).join(' | '), `spent $${spent.toFixed(3)}`);
  }
  all[name] = rows;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(all, null, 1));
}
// The ledger: this run's cost.
const l = ledger();
const job = (l.jobs['9-cost'] ||= {});
job.cost = +((job.cost || 0) + spent).toFixed(3);
job.runs = (job.runs || 0) + 1;
fs.mkdirSync(path.join(ROOT, 'ledger'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'ledger', '9-cost.json'), JSON.stringify(job, null, 1));
console.log({ spent: spent.toFixed(3), total: l.spent.toFixed(2) });
