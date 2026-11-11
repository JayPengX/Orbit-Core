// Job 9b: 問法律's answer (law-chat.js, the family's biggest AI cost) at
// its setting and cheaper ones, on the same prompt each: every question
// planned and grounded once as live (Orbit Law's public data; the plan by
// Haiku here, the credit's key reaching Claude only), then answered by each
// setting, checked as a reader gets it (checkChat), its tokens kept, and the
// answers compared blind by Opus 5.5.
//   node jobs/9b-lawchat.mjs go   → out/9b-lawchat.json
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ledger } from '../lib.mjs';
import { lawCompare, COMPARE_QS, CHAT_LIMITS } from '../../../law-chat.js';
import { requestOf, geminiShapeOf } from '../../../ai-other.js';
import { PRICES, jsonOf } from '../../../ai.js';

const KEY = process.env.ANTHROPIC_CREDIT_KEY;
const PRICE = { ...PRICES, 'claude-opus-5-5': { in: 4, cached: 0.2, out: 20 } };
const usd = (m, u) => (((u.input_tokens || 0) * PRICE[m].in + (u.cache_read_input_tokens || 0) * PRICE[m].cached + (u.output_tokens || 0) * PRICE[m].out) / 1e6);
let spent = 0;
const usage = [];

async function claude(model, parts, schema, effort) {
  const req = requestOf(model, parts, schema, { ANTHROPIC_API_KEY: KEY }, effort);
  for (let i = 0; i < 3; i++) {
    const res = await fetch(req.url, { ...req.init, signal: AbortSignal.timeout(180_000) }).catch(() => null);
    const j = await res?.json().catch(() => null);
    if (res?.ok) {
      spent += usd(model, j.usage);
      return j;
    }
    if (res && ![429, 500, 502, 503, 529].includes(res.status)) throw new Error(`${model} ${res.status} ${j?.error?.message || ''}`);
    await new Promise(r => setTimeout(r, 5000 * (i + 1)));
  }
  throw new Error('gave up');
}
// worker.js's gemini(parts, schema, model, { thinking }) as law-chat calls it: the plan (no model) by Haiku.
const asResponse = (model, j) => new Response(JSON.stringify(geminiShapeOf(model, j)), { status: 200 });
const gemini = async (parts, schema, model, o = {}) => {
  const m = model && /^claude-/.test(model) ? model : 'claude-haiku-5-5';
  return asResponse(m, await claude(m, parts, schema, o.thinking || (m === 'claude-haiku-5-5' ? 'low' : null)));
};
// Each setting as a compare call: (parts, schema) → Response; its usage noted by the question.
let q = '';
const setting = (model, effort) => async (parts, schema) => {
  const j = await claude(model, parts, schema, effort);
  usage.push({ q, set: `${model}:${effort}`, in: j.usage.input_tokens, out: j.usage.output_tokens, usd: usd(model, j.usage), promptChars: parts[0].text.length });
  return asResponse(model, j);
};
// (cmd trim: the same Sonnet at medium, the law text sent cut to TRIM's limits: 'low' below is the trimmed one.)
const TRIM = process.argv[2] === 'trim' ? { maxArts: 7, maxHits: 4, maxChars: 8000 } : null;
const FULL = { maxArts: CHAT_LIMITS.maxArts, maxHits: CHAT_LIMITS.maxHits, maxChars: CHAT_LIMITS.maxChars };
const SETS = TRIM ? { current: setting('claude-sonnet-5-5', 'medium') } : { current: setting('claude-sonnet-5-5', 'medium'), low: setting('claude-sonnet-5-5', 'low') };
const QS = [...COMPARE_QS, '房東可以隨時進來我房間嗎', '打工被扣薪水合法嗎', '在路上被狗咬到可以求償嗎', '機車停紅線會罰多少', '手機被偷了警察不受理怎麼辦'];
const out = [];
for (const question of QS) {
  q = question;
  const r = await lawCompare({ GEMINI_API_KEY: 'unused' }, { waitUntil: () => {} }, {}, gemini, SETS, [question]);
  if (TRIM) {
    Object.assign(CHAT_LIMITS, TRIM);
    const usage0 = usage.length;
    const t = await lawCompare({ GEMINI_API_KEY: 'unused' }, { waitUntil: () => {} }, {}, gemini, { current: setting('claude-sonnet-5-5', 'medium') }, [question]);
    for (const u of usage.slice(usage0)) u.set += ':trim';
    Object.assign(CHAT_LIMITS, FULL);
    r.out[0].results = { current: r.out[0].results?.current, low: t.out[0].results?.current };
  }
  out.push(r.out[0]);
  console.log(question, JSON.stringify(usage.filter(u => u.q === question)), `spent $${spent.toFixed(3)}`);
}
// Blind: the current answer against the low one, for what 問法律 is for.
const SCHEMA = { type: 'object', properties: { better: { type: 'string', enum: ['A', 'B', 'same'] }, scoreA: { type: 'number' }, scoreB: { type: 'number' }, issues: { type: 'string' } }, required: ['better', 'scoreA', 'scoreB', 'issues'] };
const strip = a => (a ? { covered: a.covered, verdict: a.verdict, facts: a.facts, answer: a.answer, points: a.points, consequences: a.consequences, agency: a.agency, next: a.next, timeline: a.timeline, error: a.error } : null);
for (const row of out) {
  const cur = row.results?.current, low = row.results?.low;
  if (!cur || !low) continue;
  const flip = Math.random() < 0.5;
  const [A, B] = flip ? [low, cur] : [cur, low];
  const prompt = `A member of the public asked Taiwan's law app: 「${row.q}」. Two answers follow, each already checked by the app (every cite was among the articles the app found). Judge as a careful Taiwanese lawyer: legally correct, applies the law to their facts, concrete and useful, brief for a phone, no invented law or figures. Return better "A", "B" or "same" (same when a reader would not notice a difference in quality), a 1–10 score each, and the worse one's concrete problems.\n--- A ---\n${JSON.stringify(strip(A))}\n--- B ---\n${JSON.stringify(strip(B))}`;
  try {
    const j = await claude('claude-opus-5-5', [{ text: prompt }], SCHEMA, 'medium');
    const v = jsonOf(j.content.filter(b => b.type === 'text').map(b => b.text).join(''));
    const un = s => (s === 'same' ? 'same' : (s === 'A') !== flip ? 'current' : 'low');
    row.judge = { better: un(v.better), current: flip ? v.scoreB : v.scoreA, low: flip ? v.scoreA : v.scoreB, issues: v.issues };
  } catch (e) {
    row.judge = { error: String(e).slice(0, 200) };
  }
  console.log(row.q, JSON.stringify(row.judge));
}
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'out', TRIM ? '9b-lawchat-trim.json' : '9b-lawchat.json'), JSON.stringify({ usage, out }, null, 1));
const l = ledger();
const job = (l.jobs['9b-lawchat'] ||= {});
job.cost = +((job.cost || 0) + spent).toFixed(3);
fs.writeFileSync(path.join(ROOT, 'ledger', '9b-lawchat.json'), JSON.stringify(job, null, 1));
console.log({ spent: spent.toFixed(3) });
