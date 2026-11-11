// The credit runner: build requests, measure them, submit as a Message Batch
// (50% off), collect results. Key: ANTHROPIC_CREDIT_KEY. Budget: BUDGET_USD
// in total across jobs (ledger.json), refused before a submit that would pass it.
//   node <job>.mjs plan     → counts tokens on a sample, prints the estimate (costs nothing)
//   node <job>.mjs submit   → submits (asks nothing more; the plan was approved)
//   node <job>.mjs collect  → waits for the batch, writes out/<job>.jsonl and the real cost
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

export const ROOT = path.dirname(new URL(import.meta.url).pathname);
export const BUDGET_USD = 100;
// Batch prices, US$ per million tokens (half of the list price).
const PRICE = {
  'claude-opus-5-5': { in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-sonnet-5-5': { in: 1, out: 5, cacheRead: 0.05, cacheWrite: 1.25 },
  'claude-haiku-5-5': { in: 0.05, out: 0.25, cacheRead: 0.005, cacheWrite: 0.0625 }
};
export const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_CREDIT_KEY });
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const ledgerFile = path.join(ROOT, 'ledger.json');
export const ledger = () => readJson(ledgerFile, { spent: 0, reserved: {}, jobs: {} });
const saveLedger = l => fs.writeFileSync(ledgerFile, JSON.stringify(l, null, 1));
export const costOf = (model, u) => {
  const p = PRICE[model];
  return ((u.input_tokens || 0) * p.in + (u.output_tokens || 0) * p.out + (u.cache_read_input_tokens || 0) * p.cacheRead + (u.cache_creation_input_tokens || 0) * p.cacheWrite) / 1e6;
};

// requests: [{ custom_id, params }]; outGuess: output tokens a request, guessed.
export async function countPlan(job, requests, outGuess, sample = 12) {
  const c = client();
  const pick = requests.filter((_, i) => i % Math.max(1, Math.floor(requests.length / sample)) === 0).slice(0, sample);
  let tin = 0;
  for (const r of pick) {
    const { custom_id, params } = r;
    const { max_tokens, ...rest } = params;
    tin += (await c.messages.countTokens({ model: params.model, messages: rest.messages, ...(rest.system ? { system: rest.system } : {}) })).input_tokens;
  }
  const model = requests[0].params.model;
  const avgIn = tin / pick.length;
  const usd = costOf(model, { input_tokens: avgIn * requests.length, output_tokens: outGuess * requests.length });
  const est = { job, model, requests: requests.length, avgIn: Math.round(avgIn), outGuess, usd: +usd.toFixed(2) };
  const l = ledger();
  l.jobs[job] = { ...(l.jobs[job] || {}), est };
  saveLedger(l);
  console.log(est);
  return est;
}

export async function submit(job, requests) {
  const l = ledger();
  const est = l.jobs[job]?.est;
  if (!est) throw new Error('plan first');
  const committed = l.spent + Object.values(l.reserved).reduce((a, b) => a + b, 0);
  if (committed + est.usd * 1.2 > BUDGET_USD) throw new Error(`over budget: ${committed.toFixed(2)} committed + ${est.usd} (×1.2) > ${BUDGET_USD}`);
  const ids = [];
  for (let i = 0; i < requests.length; i += 5000) {
    const b = await client().messages.batches.create({ requests: requests.slice(i, i + 5000) });
    ids.push(b.id);
    console.log('batch', b.id, b.processing_status);
  }
  l.reserved[job] = est.usd * 1.2;
  l.jobs[job] = { ...l.jobs[job], batches: ids, submitted: new Date().toISOString() };
  saveLedger(l);
}

export async function collect(job, { wait = true } = {}) {
  const c = client();
  const l = ledger();
  // (BATCHES=id,id: a job whose ids never reached the ledger.)
  const ids = process.env.BATCHES ? process.env.BATCHES.split(',') : l.jobs[job]?.batches || [];
  if (!ids.length) throw new Error(`${job}: no batches`);
  l.jobs[job] = { ...(l.jobs[job] || {}), batches: ids };
  saveLedger(l);
  for (const id of ids)
    for (;;) {
      const b = await c.messages.batches.retrieve(id);
      if (b.processing_status === 'ended') break;
      console.log(id, b.processing_status, JSON.stringify(b.request_counts));
      if (!wait) return;
      await new Promise(r => setTimeout(r, 60_000));
    }
  fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
  const out = fs.createWriteStream(path.join(ROOT, 'out', `${job}.jsonl`));
  let usd = 0, ok = 0, bad = 0;
  for (const id of ids) {
    for await (const r of await c.messages.batches.results(id)) {
      if (r.result.type === 'succeeded') {
        const m = r.result.message;
        usd += costOf(m.model, m.usage);
        const text = m.content.filter(b => b.type === 'text').map(b => b.text).join('');
        out.write(JSON.stringify({ id: r.custom_id, stop: m.stop_reason, text }) + '\n');
        ok++;
      } else { bad++; out.write(JSON.stringify({ id: r.custom_id, error: r.result.type }) + '\n'); }
    }
  }
  await new Promise(r => out.end(r));
  delete l.reserved[job];
  l.spent += usd;
  l.jobs[job] = { ...l.jobs[job], cost: +usd.toFixed(2), ok, bad, collected: new Date().toISOString() };
  saveLedger(l);
  console.log({ job, ok, bad, usd: usd.toFixed(2), spentTotal: l.spent.toFixed(2) });
}

// A rough guess with no key: about one token per CJK character, one per 4 others.
export function guess(requests, outGuess) {
  const toks = requests.reduce((n, r) => { const t = JSON.stringify(r.params.messages) + (r.params.system || ''); const cjk = (t.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length; return n + cjk + (t.length - cjk) / 4; }, 0);
  return { requests: requests.length, inputTokens: Math.round(toks), usd: +costOf(requests[0].params.model, { input_tokens: toks, output_tokens: outGuess * requests.length }).toFixed(2) };
}

// Every job file ends with: run(job, buildRequests, outGuess)
//   size     the guess, no key needed
//   dump     the first 3 requests into out/<job>.sample.json
//   go       guess (×1.25 for safety) → budget check → submit → wait → collect
//   collect  wait for and collect a job already submitted
export async function run(job, build, outGuess) {
  const cmd = process.argv[2] || 'size';
  if (cmd === 'collect') return collect(job);
  const requests = await build();
  const g = guess(requests, outGuess);
  console.log(job, g);
  if (cmd === 'dump') return fs.writeFileSync(path.join(ROOT, 'out', `${job}.sample.json`), JSON.stringify(requests.slice(0, 3), null, 1));
  if (cmd !== 'go') return;
  const l = ledger();
  if (l.jobs[job]?.batches) throw new Error(`${job} was submitted already: collect it`);
  l.jobs[job] = { ...(l.jobs[job] || {}), est: { ...g, usd: +(g.usd * 1.25).toFixed(2) } };
  saveLedger(l);
  await submit(job, requests);
  await collect(job);
}
