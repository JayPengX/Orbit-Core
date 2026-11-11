// Job 2a: every AI feature's examples (ai-fixtures.js EXAMPLES) through its
// own Claude model, built exactly as live (ai-other.js requestOf), so job 2b
// can grade real answers. A feature whose chain has no Claude model runs on
// Haiku 5.5 (the cheap class's other maker). Examples with pictures or files skipped.
import { run } from '../lib.mjs';
import { FEATURES } from '../../../ai-features.js';
import { EXAMPLES } from '../../../ai-fixtures.js';
import { MODELS, effortFor } from '../../../ai.js';
import { requestOf } from '../../../ai-other.js';

export function examplesRun() {
  const reqs = [];
  for (const [name, f] of Object.entries(FEATURES)) {
    const exs = EXAMPLES[name] || [];
    const m = (f.models || []).find(x => /^claude-/.test(MODELS[x])) || 'haiku';
    exs.forEach((ex, i) => {
      if (!ex.input || ex.input.imageUrl || ex.input.fileUrl || ex.input.image || ex.input.file) return;
      let input;
      try { input = f.input ? f.input(ex.input) : ex.input; } catch { return; }
      if (!input) return;
      let parts;
      try { parts = f.parts(input); } catch { return; }
      if (!Array.isArray(parts) || parts.some(p => typeof p.text !== 'string')) return;
      const req = requestOf(MODELS[m], parts, f.schema, {}, effortFor(f, m));
      const params = JSON.parse(req.init.body);
      reqs.push({ custom_id: `${name}__${i}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64), params, name, i, input });
    });
  }
  return reqs;
}
run('2a-run', async () => examplesRun().map(({ custom_id, params }) => ({ custom_id, params })), 1200);
