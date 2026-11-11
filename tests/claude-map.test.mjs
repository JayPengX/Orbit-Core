// The family's map (MAP.md) names every part of the architecture, so a
// session finds what exists instead of building it again (Jay 2026-11-03).
// CLAUDE.md is the short entry every session gets whole; it stays short
// (Jay 2026-11-11: AI shouldn't read heavily before each task). A kit file, a Worker file, a route, a binding, a D1
// table, a builder or a workflow added without a line there fails here on
// your machine. On GitHub it only warns (a missing line never stops a deploy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRANDS } from '../kit/brand.mjs';
import { ECO_APPS } from '../eco.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, f), 'utf8');
const map = read('MAP.md');
const entry = read('CLAUDE.md');
// MAP.md is read in parts; CLAUDE.md is loaded whole into every session.
const MAX_CHARS = 40_000;
const ENTRY_MAX = 6_000;

const tracked = dir => {
  try {
    return execFileSync('git', ['ls-files', dir], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return readdirSync(join(root, dir)).map(f => `${dir}/${f}`);
  }
};
// Named in code (`x`, or `x` at the start of a code span such as `docs(coll…)`).
const inCode = name => new RegExp('`[^`]*\\b' + name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '\\b').test(map);

function missing() {
  const out = [];
  const need = (what, name, ok = inCode(name)) => ok || out.push(`${what} ${name}`);

  // Every kit file (a folder of pictures as the folder).
  for (const f of tracked('kit')) {
    const rest = f.slice(4);
    if (rest.includes('/')) need('kit folder', `${rest.split('/')[0]}/`, map.includes(`${rest.split('/')[0]}/`));
    else need('kit file', rest);
  }
  // Every Worker file at the top, and every builder.
  for (const f of readdirSync(root).filter(f => /\.js$/.test(f))) need('Worker file', f);
  for (const f of tracked('builders')) need('builder', basename(f));
  // Every route worker.js answers.
  const worker = read('worker.js');
  const routes = new Set([...worker.matchAll(/path === '(\/[^']*)'/g), ...worker.matchAll(/path\.startsWith\('(\/[^']*?)\/?'\)/g)].map(m => m[1].replace(/\/$/, '')));
  for (const r of routes) need('route', r, map.includes('`' + r));
  // Every Worker, binding and Durable Object in the tomls, and the two deploy.yml binds.
  for (const t of readdirSync(root).filter(f => /^wrangler.*\.toml$/.test(f))) {
    const toml = read(t);
    need('toml', t);
    need('Worker', toml.match(/^name\s*=\s*"([^"]+)"/m)[1]);
    for (const m of toml.matchAll(/^\s*(?:binding|name)\s*=\s*"([A-Z][A-Z0-9_]+)"/gm)) need('binding', m[1]);
    for (const m of toml.matchAll(/class_name\s*=\s*"([^"]+)"/g)) need('Durable Object', m[1]);
  }
  for (const m of read('.github/workflows/deploy.yml').matchAll(/binding = \\"([A-Z_]+)\\"/g)) need('binding', m[1]);
  // Every D1 table the Workers make.
  for (const f of readdirSync(root).filter(f => /\.js$/.test(f))) for (const m of read(f).matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) need('D1 table', m[1]);
  // Every workflow.
  for (const f of tracked('.github/workflows')) need('workflow', basename(f));
  // Every app, its kit id, and its collection on the Pass.
  for (const [id, b] of Object.entries(BRANDS)) {
    need('app', b.repo, map.includes(b.repo));
    need('kit id', id);
    if (ECO_APPS[id]) need('collection', ECO_APPS[id].collection);
  }
  return out;
}

test('MAP.md names every kit file, Worker file, route, binding, table, builder, workflow and app', () => {
  const gaps = missing();
  if (!gaps.length) return;
  const say = `MAP.md (the family's map) doesn't name:\n  ${gaps.join('\n  ')}\nAdd a line for each where it belongs (§3 the kit, §4 the APIs, §5 data and sync, §10 deploying), in this push.`;
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const g of gaps) console.log(`::warning file=MAP.md::MAP.md doesn't name ${g}`);
    return;
  }
  assert.fail(say);
});

test('CLAUDE.md and MAP.md stay short', () => {
  const says = [];
  const n = [...map].length, e = [...entry].length;
  if (n > MAX_CHARS) says.push(`MAP.md is ${n} characters (at most ${MAX_CHARS}): say it shorter, or move an app's detail into its own MAP.md.`);
  if (e > ENTRY_MAX) says.push(`CLAUDE.md is ${e} characters (at most ${ENTRY_MAX}): it is the entry every session loads; put the detail in MAP.md or docs/.`);
  if (!says.length) return;
  if (process.env.GITHUB_ACTIONS === 'true') return says.forEach(say => console.log(`::warning::${say}`));
  assert.fail(says.join('\n'));
});

test('every app repo points its sessions at this map first', () => {
  // (Checked only where the apps are checked out beside this repo.)
  const base = join(root, '..');
  for (const b of Object.values(BRANDS)) {
    let text;
    try {
      text = readFileSync(join(base, b.repo, 'CLAUDE.md'), 'utf8');
    } catch {
      continue;
    }
    assert.match(text, /\.\.\/Orbit-Core\/CLAUDE\.md/, `${b.repo}/CLAUDE.md should send a session to ../Orbit-Core/CLAUDE.md first`);
  }
});
