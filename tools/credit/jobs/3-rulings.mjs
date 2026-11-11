// Job 3: every 釋字 and 憲判字 explained ahead of time, with the live
// explainer's own prompt, schema and check (Orbit-Core law-ruling.js), on
// Sonnet 5.5, in Chinese and English. Out: out/3-rulings.jsonl → the KV keys
// /law-ask already reads (law:ruling:v1:…), so no reader waits and no live call is made.
import { run } from '../lib.mjs';
import { numbered, rulingPrompt, RULING_SCHEMA } from '../../../law-ruling.js';

const DATA = 'https://orbit.jaypengx.com/law/data/';
const get = async p => (await fetch(DATA + p)).json();
const LANGS = (process.env.LANGS || 'zh,en').split(',');

async function build() {
  const { items } = await get('cons/index.json');
  const reqs = [];
  for (let i = 0; i < items.length; i += 16) {
    const chunk = await Promise.all(items.slice(i, i + 16).map(([id]) => get(`cons/${id}.json`).then(j => [id, j]).catch(() => [id, null])));
    for (const [id, j] of chunk) {
      if (!j) continue;
      const paras = [...(j.issue ? [{ part: id[0] === 's' ? '爭點' : '案由', text: j.issue }] : []), ...(j.main || []).map(text => ({ part: id[0] === 's' ? '解釋文' : '主文', text })), ...(j.reason || []).map(text => ({ part: '理由', text }))].filter(p => typeof p.text === 'string' && p.text.trim());
      const r = { id, title: [j.label, j.n].filter(Boolean).join(' '), court: '憲法法庭', v: String(j.d || ''), paras };
      const { rows, cut } = numbered(r.paras);
      for (const lang of LANGS)
        reqs.push({ custom_id: `${id}.${lang}`, params: { model: 'claude-sonnet-5-5', max_tokens: 4000, output_config: { effort: 'low', format: { type: 'json_schema', schema: { ...RULING_SCHEMA, additionalProperties: false, properties: { ...RULING_SCHEMA.properties, points: { type: 'array', items: { ...RULING_SCHEMA.properties.points.items, additionalProperties: false } } } } } }, messages: [{ role: 'user', content: rulingPrompt(r, rows, cut, '', lang) }] } });
    }
  }
  return reqs;
}
run('3-rulings', build, 900);
