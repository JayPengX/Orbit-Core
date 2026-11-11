// Job 8: the articles of the laws people use most (job 5's list, in its
// order, up to 3,500 articles, procedure codes left out) explained ahead of time with /law-ask's own
// explainer (law.js explainPrompt, EXPLAIN_SCHEMA; live it's Gemini Flash,
// a tap at a time), on Sonnet 5.5, in Chinese. Out: out/8-articles.jsonl →
// checked with checkExplain, kept as Law's explain/<pcode>.json, read before any live call.
import { run } from '../lib.mjs';
import { explainPrompt, EXPLAIN_SCHEMA } from '../../../law.js';
import { EVERYDAY } from './5-phrases.mjs';

const DATA = 'https://orbit.jaypengx.com/law/data/';
const MAX = Number(process.env.MAX_ARTS || 3500);
// (The procedure codes are for lawyers more than readers: left to the live explainer.)
const SKIP = new Set(['民事訴訟法', '刑事訴訟法', '行政訴訟法', '訴願法', '強制執行法', '家事事件法', '公證法', '提存法']);
const strict = s => (s?.type === 'object' ? { ...s, additionalProperties: false, properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, strict(v)])) } : s?.type === 'array' ? { ...s, items: strict(s.items) } : s);

async function build() {
  const { laws } = await (await fetch(DATA + 'index.json')).json();
  const byName = new Map(laws.filter(l => !l[5]).map(l => [l[1], l[0]]));
  const reqs = [];
  for (const name of EVERYDAY.filter(n => !SKIP.has(n))) {
    const p = byName.get(name);
    if (!p) continue;
    const law = await (await fetch(`${DATA}law/${p}.json`)).json();
    for (const a of law.a || []) {
      if (a[0] !== 'A' || typeof a[2] !== 'string' || !a[2].trim() || /^（?(刪除|删除)）?。?$/.test(a[2].trim())) continue;
      if (reqs.length >= MAX) return reqs;
      reqs.push({ custom_id: `${p}_${a[1]}`.replace(/[^A-Za-z0-9_-]/g, '_'), params: { model: 'claude-sonnet-5-5', max_tokens: 6000, output_config: { effort: 'low', format: { type: 'json_schema', schema: strict(EXPLAIN_SCHEMA) } }, messages: [{ role: 'user', content: explainPrompt(law, [a], 'zh') }] } });
    }
  }
  return reqs;
}
run('8-articles', build, 1100);
