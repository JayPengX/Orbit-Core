// A site's many small data files read as a few packs.
//
// The Workers Free plan publishes at most 20,000 files a site (Orbit Law's
// data alone was 77,000, 2026-11-11). A site's build (Law's
// scripts/pack-data.mjs, packData below) packs each big folder under data/
// (a "root": law/, agency/, council/…) into packs of about PACK_BYTES:
// data/<root>/_p/<b>-<hash>.json holds { '<path inside the root>': its JSON, … },
// the file going to pack b = packOf(path, n). A file bigger than LOOSE_BYTES,
// or not JSON, stays where it was; their names are in <root>/_p/loose-<hash>.json.
// data/_packs.json, the one file that changes under its own name, lists the
// roots: { law: { n, h: [each pack's hash], loose: <hash> | '' } }. Every
// other address carries its content's hash: kept as long as anyone likes,
// and a deploy that didn't change a pack leaves every copy of it as it is.
//
// packReader(getJson) reads any data path as if nothing were packed, on the
// phone (Law's data()) and in the proxy (law.js readData, law-ground.js),
// and in a build reading the last deploy (Law's scripts/lib.mjs prevJson).

export const PACKS = '_packs.json';
export const PACK_BYTES = 96 * 1024;
export const LOOSE_BYTES = 48 * 1024;

// FNV-1a over the path's UTF-16 code units: the same on the build and every reader.
export function packHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
export const packOf = (rel, n) => packHash(rel) % n;
export const packPath = (root, b, hash) => `${root}/_p/${b}-${hash}.json`;
export const loosePath = (root, hash) => `${root}/_p/loose-${hash}.json`;
// The list and the packs: how a reader (a cache, a service worker) tells them apart.
export const isPackList = path => path === PACKS || path.endsWith(`/${PACKS}`);
export const isPack = path => /(?:^|\/)_p\/[^/]+$/.test(path);

// getJson(path, { fresh }) → the file's JSON, null when it isn't there (404);
// it throws on any other failure. `fresh`: past every cache (asked only for
// the list, when a pack it named is gone: the list was an older deploy's).
// Returns read(path), the same for a packed path. `ttl` (ms): how long the
// list is kept (the proxy: a minute; a phone: the page's life). `keep`:
// packs held in memory at most.
export function packReader(getJson, { ttl = Infinity, keep = 64, now = () => Date.now() } = {}) {
  let roots = null;
  let rootsAt = -Infinity;
  let freshAt = -Infinity;
  const packs = new Map();
  const held = key => {
    if (packs.has(key)) {
      const p = packs.get(key);
      packs.delete(key);
      packs.set(key, p);
      return p;
    }
    const p = Promise.resolve(getJson(key)).then(j => {
      if (j == null) packs.delete(key);
      return j;
    });
    packs.set(key, p);
    p.catch(() => packs.delete(key));
    while (packs.size > keep) packs.delete(packs.keys().next().value);
    return p;
  };
  const rootsNow = fresh => {
    if (fresh || !roots || now() - rootsAt > ttl) {
      rootsAt = now();
      if (fresh) freshAt = rootsAt;
      const p = Promise.resolve(getJson(PACKS, fresh ? { fresh: true } : undefined)).then(j => (j && typeof j === 'object' ? j : {}));
      roots = p;
      p.catch(() => roots === p && (roots = null));
    }
    return roots;
  };
  return async function read(path) {
    const i = path.indexOf('/');
    if (i <= 0 || isPack(path)) return getJson(path);
    const root = path.slice(0, i);
    const rel = path.slice(i + 1);
    for (let again = false; ; again = true) {
      let r;
      try {
        r = await rootsNow(again);
      } catch {
        r = {};
      }
      const pk = r[root];
      if (!pk?.n || !Array.isArray(pk.h)) return getJson(path);
      let gone = false;
      if (pk.loose) {
        const list = await held(loosePath(root, pk.loose));
        if (list && Array.isArray(list.loose) && list.loose.includes(rel)) return getJson(path);
        gone = !list;
      }
      const b = packOf(rel, pk.n);
      const pack = gone ? null : await held(packPath(root, b, pk.h[b]));
      if (pack) return Object.hasOwn(pack, rel) ? pack[rel] : null;
      // A pack the list names is gone: the list was an older deploy's. Read it again, past every cache, once.
      if (again || now() - freshAt < 5000) return null;
    }
  };
}

// The build's half (Node only; `fs` passed in so a phone never loads it):
// packs every root under `dir` with at least `min` files. → { roots, before, after }.
export async function packData(dir, { fs, hashOf, min = 50, packBytes = PACK_BYTES, looseBytes = LOOSE_BYTES } = {}) {
  const { readdir, readFile, writeFile, unlink, mkdir, rm, stat } = fs;
  const walk = async (d, pre = '') => {
    const out = [];
    for (const e of await readdir(d, { withFileTypes: true })) {
      const rel = pre + e.name;
      if (e.isDirectory()) out.push(...(await walk(`${d}/${e.name}`, rel + '/')));
      else out.push(rel);
    }
    return out;
  };
  const roots = {};
  let before = 0;
  let after = 0;
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!e.isDirectory()) {
      before++;
      after++;
      continue;
    }
    const root = e.name;
    const base = `${dir}/${root}`;
    await rm(`${base}/_p`, { recursive: true, force: true });
    const files = (await walk(base)).sort();
    before += files.length;
    if (files.length < min) {
      after += files.length;
      continue;
    }
    const small = [];
    const loose = [];
    let bytes = 0;
    for (const rel of files) {
      const size = (await stat(`${base}/${rel}`)).size;
      if (!rel.endsWith('.json') || size > looseBytes) loose.push(rel);
      else {
        small.push(rel);
        bytes += size;
      }
    }
    if (!small.length) {
      after += files.length;
      continue;
    }
    const n = Math.max(1, Math.ceil(bytes / packBytes));
    const buckets = Array.from({ length: n }, () => []);
    for (const rel of small) buckets[packOf(rel, n)].push(rel);
    await mkdir(`${base}/_p`, { recursive: true });
    const h = [];
    for (let b = 0; b < n; b++) {
      const parts = [];
      for (const rel of buckets[b]) parts.push(`${JSON.stringify(rel)}:${JSON.stringify(JSON.parse(await readFile(`${base}/${rel}`, 'utf8')))}`);
      const text = `{${parts.join(',')}}`;
      h.push(hashOf(text));
      await writeFile(`${dir}/${packPath(root, b, h[b])}`, text);
    }
    let lh = '';
    if (loose.length) {
      const text = JSON.stringify({ loose });
      lh = hashOf(text);
      await writeFile(`${dir}/${loosePath(root, lh)}`, text);
    }
    for (const rel of small) await unlink(`${base}/${rel}`);
    await pruneEmpty(base, fs);
    roots[root] = { n, h, loose: lh };
    after += n + loose.length + (lh ? 1 : 0);
  }
  await writeFile(`${dir}/${PACKS}`, JSON.stringify(roots));
  after++;
  return { roots, before, after };
}

async function pruneEmpty(d, fs) {
  for (const e of await fs.readdir(d, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const sub = `${d}/${e.name}`;
    await pruneEmpty(sub, fs);
    if (!(await fs.readdir(sub)).length) await fs.rmdir(sub);
  }
}
