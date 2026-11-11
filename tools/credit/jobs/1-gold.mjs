// Job 1: Law's test questions. Job 5 wrote 3,706 everyday questions, each
// with the articles that answer it (checked by code: the articles exist and
// hold the law's words, out/gold.json). Sonnet 5.5 now reads each question
// with those articles' own text and says whether they really answer it, so
// only true pairs become 找法's and 問法律's test set (Law: scripts/eval-find.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { run, ROOT } from '../lib.mjs';

const DATA = 'https://orbit.jaypengx.com/law/data/';
const SCHEMA = { type: 'object', additionalProperties: false, properties: { fit: { type: 'string', enum: ['yes', 'partly', 'no'] }, best: { type: 'array', items: { type: 'string' } }, why: { type: 'string' } }, required: ['fit', 'best', 'why'] };

async function build() {
  const gold = JSON.parse(fs.readFileSync(path.join(ROOT, 'out', 'gold.json'), 'utf8'));
  const laws = new Map();
  const reqs = [];
  for (const [i, g] of gold.entries()) {
    if (!laws.has(g.p)) laws.set(g.p, await (await fetch(`${DATA}law/${g.p}.json`)).json());
    const law = laws.get(g.p);
    const text = g.arts.map(k => law.a.find(a => a[0] === 'A' && String(a[1]) === k)).filter(Boolean).map(a => `第${a[1]}條：${a[2].replace(/\s+/g, '').slice(0, 1500)}`).join('\n');
    reqs.push({ custom_id: `g${i}`, params: { model: 'claude-sonnet-5-5', max_tokens: 2000, output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } }, messages: [{ role: 'user', content: `一般人問：「${g.q}」\n\n《${g.n}》的這幾條：\n${text}\n\n這些條文是不是回答這個問題時，律師會先指出的條文？用 JSON 回答：fit：yes（就是這幾條）、partly（有關但不是主要的，或少了更關鍵的條文）、no（答非所問）；best：上面條號中真正回答問題的（例如 "24"），沒有就空；why：一句話（30 字內）。` }] } });
  }
  return reqs;
}
run('1-gold', build, 250);
