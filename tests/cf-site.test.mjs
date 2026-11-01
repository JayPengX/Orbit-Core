import test from 'node:test';
import assert from 'node:assert/strict';
import { siteFor, folderRules } from '../deploy/cf-site.mjs';

test('each repo gets its own Worker on its own paths', () => {
  const law = siteFor('Orbit-Law', 'example.tw');
  assert.equal(law.name, 'orbit-law');
  assert.deepEqual(law.put, [['', '/law']]);
  assert.deepEqual(law.routes, ['orbit.example.tw/law*']);
  const core = siteFor('Orbit-Core', 'example.tw');
  assert.ok(core.routes.includes('orbit.example.tw/pass*'));
  assert.ok(core.routes.includes('example.tw/Orbit-Core*'));
  assert.ok(core.put.some(([, to]) => to === '/Shared-Proxy'));
  assert.deepEqual(siteFor('Orbit-Showcase', 'example.tw').routes, ['example.tw/*']);
  assert.throws(() => siteFor('Orbit-Nothing', 'example.tw'));
  assert.throws(() => siteFor('Orbit-Law', ''));
});

test('folders answer as on GitHub Pages', () => {
  assert.deepEqual(folderRules(['/index.html', '/law/index.html', '/law/app.js']), ['/ /index.html 200', '/law/ /law/index.html 200', '/law /law/ 301']);
});
