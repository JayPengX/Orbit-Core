// Job 2b: Opus 5.5 reviews each AI feature: its source (prompt, schema,
// clean), its prompt as sent on each example, and what its own model
// answered (job 2a), against the family's AI rules. Out: out/2b-review.jsonl,
// findings, exact prompt edits and new examples, applied by hand after reading.
import fs from 'node:fs';
import path from 'node:path';
import { run, ROOT } from '../lib.mjs';
import { examplesRun } from './2a-run.mjs';

const SRC = ['ai-features.js', 'law-ai.js'].map(f => fs.readFileSync(path.join(ROOT, '../..', f), 'utf8'));
// A feature's block of source: from its key to the next feature's.
function blockOf(name) {
  for (const s of SRC) {
    const at = s.indexOf(`\n  '${name}': {`);
    if (at < 0) continue;
    const rest = s.slice(at + 1);
    const next = rest.slice(1).search(/\n  '[a-z0-9-]+': \{/);
    return next < 0 ? rest.slice(0, 12000) : rest.slice(0, next + 1);
  }
  return '';
}
const RULES = `The family's AI rules (the owner's, standing):
- Code first: AI only for what code can't read or write reliably; the input is a small digest of facts code picked.
- Insight, not repetition: never restate what the page already shows (a score, a headline, a figure on the card); say what the reader can't see at a glance.
- Answers are drawn as UI (chips, icons, short lines), so fields must be short, structured and checkable; no padding, no hedging boilerplate.
- Traditional Chinese as Taiwan writes it (台灣用語, 全形標點) unless asked for English; plain words a high-school student understands.
- Never invent numbers, names, dates or sources; every figure comes from the input.
- Asks back (clarify) only when guessing would be wrong, with options to tap.
- Cheap models (Haiku 5.5 / GPT Luna) for most; prompts must be explicit enough for them.`;
const SCHEMA = { type: 'object', additionalProperties: false, properties: {
  verdict: { type: 'string' },
  findings: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { severity: { type: 'string', enum: ['high', 'medium', 'low'] }, what: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'what', 'evidence', 'fix'] } },
  edits: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { old: { type: 'string' }, new: { type: 'string' }, why: { type: 'string' } }, required: ['old', 'new', 'why'] } },
  examples: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, input: { type: 'string' }, expect: { type: 'string' } }, required: ['name', 'input', 'expect'] } }
}, required: ['verdict', 'findings', 'edits', 'examples'] };

async function build() {
  const outFile = path.join(ROOT, 'out', '2a-run.jsonl');
  const answers = new Map(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(r => [r.id, r]) : []);
  const byFeature = new Map();
  for (const r of examplesRun()) (byFeature.get(r.name) || byFeature.set(r.name, []).get(r.name)).push(r);
  const reqs = [];
  for (const [name, runs] of byFeature) {
    const src = blockOf(name);
    if (!src) continue;
    const shown = runs.map(r => {
      const a = answers.get(r.custom_id);
      const prompt = r.params.messages[0].content.map(b => b.text || '').join('\n');
      return `### Example ${r.i}\nPrompt as sent (${r.params.model}):\n<<<\n${prompt.slice(0, 9000)}\n>>>\nAnswer:\n<<<\n${(a?.text || a?.error || '(none)').slice(0, 4000)}\n>>>`;
    }).join('\n\n');
    reqs.push({ custom_id: `rev_${name}`.replace(/[^A-Za-z0-9_-]/g, '_'), params: { model: 'claude-opus-5-5', max_tokens: 24000, output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } }, messages: [{ role: 'user', content: `You are reviewing one AI feature of Orbit, a family of Taiwanese phone apps, before it ships to real people. Find what would make its answers wrong, unhelpful, slow or costly, and fix the prompt.

${RULES}

The feature's source (JavaScript: its prompt in parts(), the JSON schema the model must return, and clean(), which keeps only what may be shown):
<<<
${src}
>>>

Its examples, each with the prompt as sent and what the model answered:
${shown}

Return JSON:
- verdict: two sentences on how good this feature is now.
- findings: every real problem, most severe first, each with evidence quoted from an answer or the prompt, and the fix. No style nits; nothing the rules above don't care about.
- edits: exact edits to the source: old is a string copied exactly from the source above (unique in it), new its replacement. Prompt wording, limits, schema descriptions; keep clean()'s checks unless one is wrong. At most 8; none when it's already right.
- examples: 6 new realistic inputs that would catch the problems you found or the cases its examples miss (input: the input object as JSON, in the same shape the examples' inputs take; expect: what a right answer must and must not do).` }] } });
  }
  return reqs;
}
run('2b-review', build, 9000);
