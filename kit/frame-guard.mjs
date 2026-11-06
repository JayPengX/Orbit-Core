// A test helper, never served to a phone: the tab bar and the rail are the
// kit's alone, so every app draws them alike (Jay 2026-11-06, an iPad: Law's
// side bar beside Sports'). frameFaults(css) lists each declaration an app's
// CSS sets on a tab bar part beyond its colours; each app's tests and
// Orbit-Core's tests/kit-tabrail.test.mjs ask for none.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const FRAME = /\.q-tab(?:bar|-label|-icon|-badge|-action)?(?![\w-])|\.q-appbar\s+\.q-actions/;
const ALLOWED = new Set(['background', 'background-color', 'background-image', 'color', 'fill', 'stroke', 'box-shadow', 'opacity', 'pointer-events', 'display', 'visibility']);
const rules = text => [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));

export function frameFaults(text) {
  const out = [];
  for (const { sel, body } of rules(text)) {
    if (sel.startsWith('@') || !FRAME.test(sel)) continue;
    for (const decl of body.split(';')) {
      const prop = decl.split(':')[0].trim().toLowerCase();
      if (prop && !prop.startsWith('--') && !ALLOWED.has(prop)) out.push(`${sel} { ${prop} }`);
    }
  }
  return out;
}

// Every .css under an app's public/, css/ and src/ (not built copies).
export function appCss(dir) {
  const out = [];
  const walk = d => {
    for (const n of readdirSync(d)) {
      if (['node_modules', 'dist', '.kit', '.git', 'data'].includes(n)) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith('.css')) out.push(p);
    }
  };
  for (const sub of ['public', 'css', 'src']) if (existsSync(join(dir, sub))) walk(join(dir, sub));
  return out;
}

export const appFrameFaults = dir => appCss(dir).flatMap(f => frameFaults(readFileSync(f, 'utf8')).map(x => `${f.slice(dir.length + 1)}: ${x}`));
