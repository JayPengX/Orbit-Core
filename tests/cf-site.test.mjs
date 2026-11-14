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
  assert.ok(core.put.some(([, to]) => to === '/Shared-Proxy'));
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

test("the owner's panel is at /admin/ alone; where it was goes there", () => {
  const core = siteFor('Orbit-Core', 'example.tw');
  assert.ok(core.put.some(([from, to]) => from === 'admin' && to === '/admin'));
  assert.deepEqual(core.skip, ['admin']);
  for (const at of ['/pass', '/Orbit-Core', '/Shared-Proxy']) {
    assert.ok(core.redirects.includes(`${at}/admin/ https://orbit.example.tw/admin/ 301`), at);
    assert.ok(core.redirects.includes(`${at}/admin/* https://orbit.example.tw/admin/:splat 301`), at);
  }
  // (Cloudflare refuses a _redirects with one path twice.)
  const from = core.redirects.map(r => r.split(' ')[0]);
  assert.equal(new Set(from).size, from.length);
  assert.ok(!from.some(f => f.startsWith('/admin')));
  // Its own _headers block moves with it, not under the shared copies.
  assert.equal(ownHeaders('/admin/*\n  X-Frame-Options: DENY\n', core.put, core.skip), '/admin/*\n  X-Frame-Options: DENY\n');
});

test('the admin page reaches the kit and pictures at their own addresses (it is not under /pass/ any more)', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../site/admin/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /["'(]\.\.\//);
  assert.match(page, /"#kit\/":"\/Orbit-Core\/kit\/"/);
});
