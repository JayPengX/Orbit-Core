import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { packData, packReader, packOf, PACKS, isPack, isPackList } from '../kit/data-pack.mjs';

const hashOf = t => createHash('sha256').update(t).digest('hex').slice(0, 12);

// A site's data folder: one big root (law/, 300 small files, two big ones, a picture), one small (ai/), a file on its own.
async function site() {
  const dir = mkdtempSync(join(tmpdir(), 'pack-'));
  const files = {};
  const put = async (rel, body) => {
    await fs.mkdir(join(dir, rel, '..'), { recursive: true });
    await fs.writeFile(join(dir, rel), body);
    files[rel] = body;
  };
  for (let i = 0; i < 300; i++) await put(`law/${i % 3 ? 'a' : 'b/c'}/${i}.json`, JSON.stringify({ i, name: `法規 ${i}`, text: 'x'.repeat(i * 7) }));
  await put('law/big.json', JSON.stringify({ text: 'y'.repeat(60 * 1024) }));
  await put('law/b/big2.json', JSON.stringify({ text: 'z'.repeat(50 * 1024) }));
  await put('law/pic.png', 'PNG');
  await put('ai/one.json', JSON.stringify({ one: 1 }));
  await put('status.json', JSON.stringify({ ok: true }));
  return { dir, files };
}
const fromDir = (dir, asked = []) => async (path, o) => {
  asked.push(o?.fresh ? `fresh:${path}` : path);
  try {
    return JSON.parse(await fs.readFile(join(dir, path), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
};

test('a packed site reads every file as it was; the big root is a few files, the small one untouched', async () => {
  const { dir, files } = await site();
  const { roots, before, after } = await packData(dir, { fs, hashOf });
  assert.equal(before, 305);
  assert.ok(after < 20, `${after} files after`);
  assert.deepEqual(Object.keys(roots), ['law']);
  assert.ok(roots.law.n >= 1 && roots.law.h.length === roots.law.n && roots.law.loose);
  // What's left in law/: the packs, the loose list, the two big files and the picture.
  const left = (await fs.readdir(join(dir, 'law'), { recursive: true })).filter(f => f.includes('.'));
  assert.ok(left.includes('big.json') && left.includes(join('b', 'big2.json')) && left.includes('pic.png'));
  assert.ok(!left.includes(join('a', '1.json')));
  const read = packReader(fromDir(dir));
  for (const [rel, body] of Object.entries(files)) if (rel.endsWith('.json')) assert.deepEqual(await read(rel), JSON.parse(body), rel);
  assert.equal(await read('law/a/nothing.json'), null);
  assert.equal(await read('nothing/x.json'), null);
});

test('packing again gives the same addresses (a deploy that changed nothing keeps every copy)', async () => {
  const { dir } = await site();
  const first = (await packData(dir, { fs, hashOf })).roots;
  // Unpack by hand isn't needed: a second build of the same files writes the same packs.
  const { dir: dir2 } = await site();
  const second = (await packData(dir2, { fs, hashOf })).roots;
  assert.deepEqual(second, first);
  assert.equal(packOf('a/1.json', 7), packOf('a/1.json', 7));
});

test('a site not packed (no list) reads each file at its own address', async () => {
  const { dir, files } = await site();
  const read = packReader(fromDir(dir));
  assert.deepEqual(await read('law/a/1.json'), JSON.parse(files['law/a/1.json']));
});

test('a list from an older deploy: the gone pack sends one fresh read of the list, then the file', async () => {
  const { dir, files } = await site();
  await packData(dir, { fs, hashOf });
  const real = JSON.parse(await fs.readFile(join(dir, PACKS), 'utf8'));
  const old = structuredClone(real);
  old.law.h = old.law.h.map(() => 'gone');
  const asked = [];
  const disk = fromDir(dir, asked);
  const read = packReader((path, o) => (path === PACKS && !o?.fresh ? old : disk(path, o)));
  assert.deepEqual(await read('law/a/1.json'), JSON.parse(files['law/a/1.json']));
  assert.ok(asked.includes(`fresh:${PACKS}`));
  // Gone for real (no pack has it): null, and no storm of fresh reads.
  const n = asked.length;
  assert.equal(await read('law/a/none.json'), null);
  assert.ok(asked.filter(a => a.startsWith('fresh:')).length === 1, asked.slice(n).join());
});

test('a failed pack read throws (never "not there"), and is asked again next time', async () => {
  const { dir, files } = await site();
  await packData(dir, { fs, hashOf });
  let fail = true;
  const disk = fromDir(dir);
  const read = packReader((path, o) => (fail && isPack(path) && !path.includes('loose') ? Promise.reject(new Error('503')) : disk(path, o)));
  await assert.rejects(read('law/a/1.json'));
  fail = false;
  assert.deepEqual(await read('law/a/1.json'), JSON.parse(files['law/a/1.json']));
});

test('packs and the list are told apart (a cache keeps a pack for good, the list never)', () => {
  assert.ok(isPack('law/_p/3-ab12.json') && isPack('law/_p/loose-ab12.json'));
  assert.ok(!isPack('law/a/1.json') && !isPack(PACKS));
  assert.ok(isPackList(PACKS) && isPackList('data/_packs.json') && !isPackList('law/_p/3-ab.json'));
});

test("the proxy reads Law's packed data as files (readData, readGround), the list a minute at the edge", async () => {
  const { useLawSite, readData, DATA } = await import('../law.js');
  const { readGround, forgetGround } = await import('../law-ground.js');
  const { dir, files } = await site();
  await packData(dir, { fs, hashOf });
  const asked = [];
  useLawSite({
    fetch: async (url, init) => {
      const path = url.slice(DATA.length);
      asked.push([path, init.cf?.cacheTtlByStatus?.['200-299']]);
      const j = await fromDir(dir)(path);
      return j == null ? new Response('', { status: 404 }) : Response.json(j);
    }
  });
  try {
    assert.deepEqual(await readData('law/a/1.json'), JSON.parse(files['law/a/1.json']));
    assert.deepEqual(await readData('law/big.json'), JSON.parse(files['law/big.json']));
    assert.equal(await readData('law/a/none.json'), null);
    forgetGround();
    assert.deepEqual(await readGround('law/b/c/0.json'), JSON.parse(files['law/b/c/0.json']));
    assert.deepEqual(new Set(asked.filter(([p]) => p === PACKS).map(a => a[1])), new Set([60]));
    assert.ok(asked.filter(([p]) => isPack(p)).every(a => a[1] === 30 * 86_400));
  } finally {
    useLawSite(null);
  }
});
