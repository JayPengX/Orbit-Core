#!/usr/bin/env node
// Look before you write (CLAUDE.md): what the kit already has for a word.
//
//   node tools/kit-find.mjs sheet foot       exports and CSS whose name or comment has every word
//   node tools/kit-find.mjs --css focus      only orbit.css (classes and --q- tokens)
//   node tools/kit-find.mjs --apps put       also the apps beside this repo that define it (a copy to move into the kit)
//   node tools/kit-find.mjs --all day        every match, not the first 60
//
// Words match case-blind, Chinese too. Nothing is written; it only reads kit/
// (and, with --apps, ../Orbit-*/public, src and lib).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kit = join(root, 'kit');

// The comment lines right above line i (// … or a /* … */ block), joined.
function commentAbove(lines, i) {
  const out = [];
  for (let j = i - 1; j >= 0; j--) {
    const t = lines[j].trim();
    if (!/^(\/\/|\/\*|\*)/.test(t)) break;
    out.unshift(t.replace(/^(\/\/+|\/\*+|\*+\/?)\s?/, '').replace(/\*\/$/, '').trim());
  }
  return out.filter(Boolean).join(' ');
}

// Every export of a kit module: { name, file, line, note }.
export function kitExports(dir = kit) {
  const found = [];
  for (const f of readdirSync(dir).filter(f => /\.(mjs|js)$/.test(f)).sort()) {
    const lines = readFileSync(join(dir, f), 'utf8').split('\n');
    lines.forEach((l, i) => {
      const one = l.match(/^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/);
      const many = !one && l.match(/^export\s*\{([^}]*)\}/);
      const names = one ? [one[1]] : many ? many[1].split(',').map(x => x.trim().split(/\s+as\s+/).pop()).filter(Boolean) : [];
      for (const name of names) found.push({ name, file: `kit/${f}`, line: i + 1, note: commentAbove(lines, i) });
    });
  }
  return found;
}

// A heading and the comment right above, once each.
const noteOf = (heading, near) => (near.includes(heading) ? near : [heading, near].filter(Boolean).join(' — ')).replace(/^-+\s*|\s*-+$/g, '');

// orbit.css's classes and tokens, each with the heading or comment it sits under.
export function kitCss(file = join(kit, 'orbit.css')) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const found = new Map();
  let heading = '';
  lines.forEach((l, i) => {
    const h = l.match(/\/\*\s*-{2,}\s*(.+?)\s*-{2,}/) || l.match(/^\/\*\s*={2,}\s*(.+?)\s*={2,}/);
    if (h) heading = h[1];
    const near = commentAbove(lines, i);
    for (const m of l.matchAll(/(^|[\s,>+~(])\.(q-[a-z0-9-]+)/g)) {
      const key = `.${m[2]}`;
      if (!found.has(key)) found.set(key, { name: key, file: 'kit/orbit.css', line: i + 1, note: noteOf(heading, near) });
    }
    const t = l.match(/^\s*(--q-[a-z0-9-]+)\s*:/);
    if (t && !found.has(t[1])) found.set(t[1], { name: t[1], file: 'kit/orbit.css', line: i + 1, note: noteOf(heading, near) });
  });
  return [...found.values()];
}

// Functions and constants the apps define themselves (a copy may belong in the kit).
export function appDefinitions(base = join(root, '..')) {
  const found = [];
  const walk = (dir, depth = 0) => {
    if (depth > 4 || !existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      // (Not the showcase's demo copies of the apps, nor data or vendored code.)
      if (f.startsWith('.') || ['node_modules', 'data', 'vendor', 'kit', 'demo'].includes(f)) continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p, depth + 1);
      else if (/\.(mjs|js|jsx)$/.test(f) && statSync(p).size < 2_000_000) {
        readFileSync(p, 'utf8').split('\n').forEach((l, i, lines) => {
          const m = l.match(/^(?:export\s+)?(?:async\s+)?(?:function\*?\s+([A-Za-z0-9_$]+)|const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\(|[A-Za-z0-9_$]+\s*=>))/);
          if (m) found.push({ name: m[1] || m[2], file: relative(base, p), line: i + 1, note: commentAbove(lines, i) });
        });
      }
    }
  };
  for (const repo of readdirSync(base).filter(r => /^Orbit-/.test(r) && r !== 'Orbit-Core')) for (const sub of ['public', 'src', 'lib']) walk(join(base, repo, sub));
  return found;
}

const matches = (item, words) => words.every(w => `${item.name} ${item.note}`.toLowerCase().includes(w));
// An app's own definition matches by its name alone (comments mention everything).
const named = (item, words) => words.every(w => item.name.toLowerCase().includes(w));

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith('--')));
  const words = args.filter(a => !a.startsWith('--')).map(w => w.toLowerCase());
  if (!words.length) {
    console.log('node tools/kit-find.mjs [--css] [--apps] [--all] <word…>');
    process.exit(1);
  }
  const cap = flags.has('--all') ? Infinity : 60;
  const show = (title, items) => {
    if (!items.length) return;
    console.log(`\n${title} (${items.length})`);
    for (const x of items.slice(0, cap)) console.log(`  ${x.name.padEnd(22)} ${x.file}:${x.line}${x.note ? `  ${x.note.slice(0, 150)}` : ''}`);
    if (items.length > cap) console.log(`  … ${items.length - cap} more (--all)`);
  };
  if (!flags.has('--css')) show('Kit exports', kitExports().filter(x => matches(x, words)));
  show('orbit.css', kitCss().filter(x => matches(x, words)));
  if (flags.has('--apps')) show('Defined in the apps (a copy may belong in the kit)', appDefinitions().filter(x => named(x, words)));
}
