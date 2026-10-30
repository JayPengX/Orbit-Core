// Every app's own tests against this checkout's kit, before a kit push: each
// app's deploy tests it against Orbit-Core's main, so a kit change that breaks
// one (a renamed or dropped module) fails that app's next deploy and mails Jay.
// Apps are the checkouts beside this one (../Orbit-<App>); a missing one is skipped.
//   node tools/test-apps.mjs [beats words …]
import { spawnSync } from 'node:child_process';
import { existsSync, symlinkSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';

const APPS = ['Beats', 'Class', 'Law', 'Money', 'Securities', 'Showcase', 'Sports', 'Transit', 'Weather', 'Words'];
const kit = resolve(new URL('../kit', import.meta.url).pathname);
const asked = process.argv.slice(2).map(a => a.toLowerCase());
const failed = [];
for (const app of APPS.filter(a => !asked.length || asked.includes(a.toLowerCase()))) {
  const dir = resolve(kit, '../..', `Orbit-${app}`);
  if (!existsSync(join(dir, 'package.json'))) { console.log(`- ${app}: not checked out beside Orbit-Core, skipped`); continue; }
  try { lstatSync(join(dir, '.kit')); } catch { symlinkSync(kit, join(dir, '.kit')); }
  if (!existsSync(join(dir, 'node_modules'))) spawnSync('npm', ['ci', '--silent'], { cwd: dir, stdio: 'ignore' });
  const run = spawnSync('npm', ['test'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = `${run.stdout}${run.stderr}`;
  const bad = out.split('\n').filter(l => /^not ok|FAIL /.test(l)).slice(0, 5);
  console.log(`${run.status === 0 ? '✓' : '✗'} ${app}${bad.length ? `\n    ${bad.join('\n    ')}` : ''}`);
  if (run.status !== 0) failed.push(app);
}
if (failed.length) { console.log(`\nFails with this kit: ${failed.join(', ')}`); process.exit(1); }
