import test from 'node:test';
import assert from 'node:assert/strict';
import { siteFor, folderRules, ownHeaders } from '../deploy/cf-site.mjs';

test('each repo gets its own Worker on its own paths', () => {
  const law = siteFor('Orbit-Law', 'example.tw');
  assert.equal(law.name, 'orbit-law');
  assert.deepEqual(law.put, [['', '/law']]);
  assert.deepEqual(law.routes, ['orbit.example.tw/law*']);
  const core = siteFor('Orbit-Core', 'example.tw');
  assert.ok(core.routes.includes('orbit.example.tw/*'));
  assert.ok(core.routes.includes('example.tw/Orbit-Core*'));
  assert.deepEqual(siteFor('Orbit-Showcase', 'example.tw').routes, ['example.tw/*']);
  assert.throws(() => siteFor('Orbit-Nothing', 'example.tw'));
  assert.throws(() => siteFor('Orbit-Law', ''));
});

test('folders answer as on GitHub Pages', () => {
  assert.deepEqual(folderRules(['/index.html', '/law/index.html', '/law/app.js']), ['/ /index.html 200', '/law/ /law/index.html 200', '/law /law/ 301']);
});

test("a repo's own _headers move under where it's put", () => {
  const text = '# keep\n/samples/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/empty\n';
  assert.equal(ownHeaders(text, [['', '/beats']]), '/beats/samples/*\n  Cache-Control: public, max-age=31536000, immutable\n');
  assert.equal(ownHeaders(text, [['home', '/'], ['', '/showcase']]).split('\n')[0], '/showcase/samples/*');
  assert.equal(ownHeaders('', [['', '/beats']]), '');
});

test('every page at one address: nothing forwarded, no second copy under the kit (Jay 11-14: no legacy forwards)', () => {
  const core = siteFor('Orbit-Core', 'example.tw');
  assert.ok(core.put.some(([from, to]) => from === 'admin' && to === '/admin'));
  for (const s of ['admin', 'app', 'index.html']) assert.ok(core.skip.includes(s), s);
  for (const repo of ['Orbit-Core', 'Orbit-Showcase', 'Orbit-Law']) assert.equal(siteFor(repo, 'example.tw').redirects, undefined, repo);
  assert.deepEqual(core.put.filter(([from]) => from === '').map(([, to]) => to), ['/Orbit-Core']);
  // Its own _headers block moves with it, not under the shared copies.
  assert.equal(ownHeaders('/admin/*\n  X-Frame-Options: DENY\n', core.put, core.skip), '/admin/*\n  X-Frame-Options: DENY\n');
});

test('the admin page reaches the kit and pictures at their own addresses', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../site/admin/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /["'(]\.\.\//);
  assert.match(page, /"#kit\/":"\/Orbit-Core\/kit\/"/);
});

test('/key/ (the giveaway, retired 11-14) is gone: no page and no forward (Jay 11-14: no legacy forwarding)', () => {
  const core = siteFor('Orbit-Core', 'example.tw');
  assert.ok(!core.put.some(([from]) => from === 'key'));
  assert.ok(!(core.redirects || []).some(r => String(r).startsWith('/key')));
});
