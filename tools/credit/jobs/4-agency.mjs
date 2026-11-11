// Job 4: every agency rule Orbit Law keeps (行政規則, 函釋, 命令: agency/all.json)
// in one plain line and the everyday words people would search it by.
// Haiku 5.5 (a summary needs no more), the rule's start (5,000 characters).
// Out: out/4-agency.jsonl → Law's agency/summary.json ({ id: [line, words] }),
// read by the 法規 search and 問法律's finder.
import { run } from '../lib.mjs';

const DATA = 'https://orbit.jaypengx.com/law/data/agency/';
const textFile = id => String(id).replace(/[^A-Za-z0-9_-]/g, '_');
const SCHEMA = { type: 'object', additionalProperties: false, properties: { line: { type: 'string' }, words: { type: 'array', items: { type: 'string' } } }, required: ['line', 'words'] };

const prompt = (name, agency, text) => `下面是台灣${agency}的一則規定「${name}」${text ? '的開頭' : '（只有名稱）'}。

${text ? `<<<\n${text}\n>>>\n\n` : ''}請用 JSON 回答：
- line：一句白話（最多 40 個全形字），說這則規定管什麼、對誰有用。只寫規定裡有的，不要猜；只有名稱時，就照名稱寫。
- words：最多 8 個一般人查這件事時會打的字（日常說法，例如「學貸」「押金」「加班費」），不要重複名稱裡已有的整串字。
繁體中文（台灣用語）。`;

async function build() {
  const { rules } = await (await fetch(DATA + 'all.json')).json();
  const reqs = [];
  for (let i = 0; i < rules.length; i += 24) {
    const chunk = await Promise.all(
      rules.slice(i, i + 24).map(async r => {
        let t = '';
        try { const res = await fetch(`${DATA}text/${textFile(r[0])}.json`); if (res.ok) t = String((await res.json()).t || ''); } catch {}
        return [r, t.replace(/[　 ]+/g, '').slice(0, 5000)];
      })
    );
    for (const [[id, name, agency], t] of chunk)
      reqs.push({ custom_id: textFile(id).slice(0, 64), params: { model: 'claude-haiku-5-5', max_tokens: 1500, output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } }, messages: [{ role: 'user', content: prompt(name, agency, t) }] } });
  }
  return reqs;
}
run('4-agency', build, 400);
