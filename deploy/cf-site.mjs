// Publishes one repo's built site to Cloudflare (Workers static assets) on the
// family's own domain (kit/domain.mjs DOMAIN). Run by each repo's deploy
// workflow after its build, with CLOUDFLARE_API_TOKEN set:
//   node <Orbit-Core>/deploy/cf-site.mjs <Repo> <built dir>
//
// Each repo is its own assets-only Worker on routes of its paths, so a push
// still deploys only that repo, and a file asked for is served straight from
// Cloudflare (free: no Worker runs, nothing read from GitHub). Routes win
// over orbit-site's custom domains on the same hosts (site.js), which hold
// the hosts' DNS and certificates.
//   an app (kit/brand.mjs SHORT)  orbit.<d>/<slug>…  → orbit-<slug>
//   Orbit-Core                    orbit.<d>/… bar the apps: / (the family's home), /pass/ (→ /),
//                                 /key/ (the public giveaway, gift.js),
//                                 /app/ (Orbit, every app in one: kit/suite.mjs),
//                                 /Orbit-Core/ (and the old /Shared-Proxy/);
//                                 <d>/Orbit-Core/ → orbit-pass
//   Orbit-Showcase                <d>/… (Jay's homepage at /, /showcase/) → orbit-home
//
// Paths work as they did on GitHub Pages: /law/ is /law/index.html, /law
// moves to /law/, /law/index.html answers as it is (no redirect a service
// worker would trip on). Every file may be read from any site (Pages' CORS).
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DOMAIN } from '../kit/domain.mjs';
import { SHORT } from '../kit/brand.mjs';

const MAX_FILES = 100_000; // the paid plan's limit per Worker
const MAX_BYTES = 25 * 1024 * 1024; // one file's limit

// What a repo publishes: its Worker, [built path ('' = the build), path on
// the site], its routes, its own redirects.
export function siteFor(repo, domain = DOMAIN) {
  const d = String(domain || '').trim().toLowerCase();
  if (!d) throw new Error('no domain (kit/domain.mjs)');
  const orbit = `orbit.${d}`;
  if (repo === 'Orbit-Core') {
    const kitRoots = ['Orbit-Core', 'Shared-Proxy'];
    return {
      name: 'orbit-pass',
      put: [['', '/pass'], ['index.html', '/index.html'], ...kitRoots.map(r => ['', `/${r}`]), ['key', '/key'], ['app', '/app'], ['favicon.ico', '/favicon.ico'], ['icons/apple-touch-icon.png', '/apple-touch-icon.png'], ['icons/apple-touch-icon.png', '/apple-touch-icon-precomposed.png']],
      // The whole orbit. host bar the apps' paths (theirs are more
      // specific, so they win): the root, the family page, the kit, the root
      // icons, and a 404 for anything else. The kit on the bare host too
      // (the showcase loads it).
      routes: [`${orbit}/*`, ...kitRoots.map(r => `${d}/${r}*`)],
      // (The family's home is the root since 2026-11-14, Jay: "orbit.jaypengx.com is the home for
      // all those apps"; its pictures stay under /pass/, and the admin page at /pass/admin/.)
      redirects: ['/pass/ / 301', '/pass/index.html / 301']
    };
  }
  if (repo === 'Orbit-Showcase') {
    return { name: 'orbit-home', put: [['', '/showcase'], ['home', '/']], routes: [`${d}/*`], redirects: [] };
  }
  const slug = Object.keys(SHORT).find(s => SHORT[s] === repo && s !== 'pass');
  if (!slug) throw new Error(`${repo} has no short name (kit/brand.mjs)`);
  return { name: `orbit-${slug}`, put: [['', `/${slug}`]], routes: [`${orbit}/${slug}*`], redirects: [] };
}

// Pages' folders: /a/ is /a/index.html, /a goes to /a/.
export function folderRules(files) {
  const rules = [];
  for (const f of files) {
    if (!f.endsWith('/index.html')) continue;
    const dir = f.slice(0, -'index.html'.length);
    rules.push(`${dir} ${dir}index.html 200`);
    if (dir !== '/') rules.push(`${dir.slice(0, -1)} ${dir} 301`);
  }
  return rules;
}

// Every file of every site: readable by any page (the showcase loads the kit
// from the bare domain); never taken for another type than it's sent as; and
// shown in a frame only by a page of its own site (Orbit's /app/ holds each
// app in one), never under someone else's page made to catch a tap.
export const SITE_HEADERS = "/*\n  Access-Control-Allow-Origin: *\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: frame-ancestors 'self'\n";

// A repo's own _headers (its paths as on its own site, e.g. /samples/*),
// moved under each place the build is put (/beats/samples/*).
export function ownHeaders(text, put) {
  const blocks = [];
  let cur = null;
  for (const line of String(text || '').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s/.test(line)) cur?.rules.push(line.trimEnd());
    else blocks.push((cur = { path: line.trim(), rules: [] }));
  }
  const out = [];
  for (const [from, to] of put) {
    if (from !== '') continue;
    const at = to === '/' ? '' : to;
    for (const b of blocks) if (b.path.startsWith('/') && b.rules.length) out.push(at + b.path, ...b.rules);
  }
  return out.length ? out.join('\n') + '\n' : '';
}

async function walk(dir, base = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = `${base}/${e.name}`;
    if (e.isDirectory()) out.push(...(await walk(join(dir, e.name), rel)));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

async function main() {
  const [repo, built, ...flags] = process.argv.slice(2);
  if (!repo || !built) throw new Error('usage: node deploy/cf-site.mjs <Repo> <built dir> [--dry]');
  const site = siteFor(repo);
  const stage = resolve(process.env.RUNNER_TEMP || '/tmp', `cf-${site.name}`);
  const out = join(stage, 'site');
  await rm(stage, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const [from, to] of site.put) {
    const src = join(resolve(built), from);
    const dest = join(out, to);
    if ((await stat(src)).isDirectory()) await cp(src, dest, { recursive: true, dereference: true });
    else await mkdir(join(dest, '..'), { recursive: true }).then(() => cp(src, dest));
  }
  for (const junk of ['_redirects', '_headers', '.assetsignore']) for (const [, to] of site.put) await rm(join(out, to, junk), { force: true }).catch(() => {}); // (a file put, e.g. /favicon.ico: nothing under it)
  const own = await readFile(join(resolve(built), '_headers'), 'utf8').catch(() => '');
  const files = await walk(out);
  if (files.length > MAX_FILES) throw new Error(`${files.length} files: over ${MAX_FILES}`);
  for (const f of files) if ((await stat(join(out, f))).size > MAX_BYTES) throw new Error(`${f} is over 25 MB`);
  const redirects = [...site.redirects, ...folderRules(files)];
  await writeFile(join(out, '_redirects'), redirects.join('\n') + '\n');
  await writeFile(join(out, '_headers'), ownHeaders(own, site.put) + SITE_HEADERS);
  const zone = DOMAIN.trim().toLowerCase();
  const config = {
    name: site.name,
    compatibility_date: '2025-01-01',
    workers_dev: false,
    preview_urls: false,
    assets: { directory: './site', html_handling: 'none', not_found_handling: 'none' },
    routes: site.routes.map(pattern => ({ pattern, zone_name: zone }))
  };
  await writeFile(join(stage, 'wrangler.json'), JSON.stringify(config, null, 2));
  console.log(`${repo} → ${site.name}: ${files.length} files, ${redirects.length} redirects, routes ${site.routes.join(' ')}`);
  if (flags.includes('--dry')) return console.log('staged at', stage);
  const run = spawnSync('npx', ['--yes', 'wrangler@4', 'deploy', '--config', join(stage, 'wrangler.json')], { stdio: 'inherit', cwd: stage });
  if (run.status !== 0) process.exit(run.status || 1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
