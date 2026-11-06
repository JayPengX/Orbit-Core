// What our Workers answered, kept for a batch of tool runs.
//
// tools/shots.mjs opens one app in dozens of browsers: every screen, light
// and dark, before and after. Each browser asked the live proxy for
// everything again, and our own tools were about three quarters of the
// Workers' CPU (2026-11-06; the people using Orbit about a tenth). With ORBIT_LIVE_KEEP naming a folder, preview.mjs's
// live reads of our Workers (the data proxy, a batch's items one by one;
// Transit's and Weather's dev doors; 專注飛行; /data/) go through here: each
// is asked once in ORBIT_LIVE_KEEP_S seconds (90 by default: a bus's estimate
// counts on from when it was made, so a minute and a half shows nothing
// stale) and every run of the batch takes that answer, so a before and an
// after shot also see the same data. Only a 200 is kept. Runs asking for the
// same address at once wait for the first one's answer (a lock file) rather
// than asking again. Without the folder, every read goes to the Worker.
import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// (Node decodes the body; the browser is answered by preview.mjs with CORS of its own.)
const DROP = /^(content-encoding|content-length|transfer-encoding|connection|keep-alive|access-control-allow-origin|set-cookie)$/i;

export function makeKeep({ dir = process.env.ORBIT_LIVE_KEEP || '', ttlS = process.env.ORBIT_LIVE_KEEP_S, fetchFn = (...a) => fetch(...a), now = Date.now, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const ttl = (Number(ttlS) || 90) * 1000;
  const fileOf = key => join(dir, `${createHash('sha1').update(key).digest('hex')}.json`);
  const read = file => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };
  const fresh = got => (got && now() - got.at < ttl ? got : null);
  const write = (file, value) => {
    mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    writeFileSync(tmp, JSON.stringify({ at: now(), ...value }));
    renameSync(tmp, file);
  };
  // The batch's count: p a read the pages made, k one answered from the keep, q a request sent to a Worker.
  const tally = (what, n = 1) => {
    if (!dir || n <= 0) return;
    try {
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, 'tally'), what.repeat(n));
    } catch {}
  };
  const counts = () => {
    let s = '';
    try {
      s = readFileSync(join(dir, 'tally'), 'utf8');
    } catch {}
    const n = c => s.split(c).length - 1;
    return { reads: n('p'), kept: n('k'), sent: n('q') };
  };
  // Runs asking for one thing at once: the first claims it (a lock file), the
  // rest wait up to 20 s for its answer; a lock left by a run that died is
  // taken after 30 s.
  const lockOf = key => `${fileOf(key)}.lock`;
  const claim = key => {
    if (!dir) return true;
    mkdirSync(dir, { recursive: true });
    const lock = lockOf(key);
    const take = () => {
      try {
        closeSync(openSync(lock, 'wx'));
        return true;
      } catch {
        return false;
      }
    };
    if (take()) return true;
    try {
      if (now() - statSync(lock).mtimeMs > 30_000) return unlinkSync(lock), take();
    } catch {}
    return false;
  };
  const release = key => {
    try {
      unlinkSync(lockOf(key));
    } catch {}
  };
  const settled = async key => {
    for (let t = 0; t < 100 && existsSync(lockOf(key)); t++) await wait(200);
  };
  // One address of a Worker → { status, headers, body (Buffer), kept }.
  async function liveFetch(url, { method = 'GET', headers = {}, body, keep = Boolean(dir) } = {}) {
    const ask = async () => {
      tally('q');
      const r = await fetchFn(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : body });
      const h = {};
      r.headers.forEach((v, k) => !DROP.test(k) && (h[k] = v));
      return { status: r.status, headers: h, body: Buffer.from(await r.arrayBuffer()), kept: false };
    };
    if (!keep || !dir) return ask();
    const key = `${method} ${url} ${body || ''}`;
    const file = fileOf(key);
    const out = got => (tally('k'), { status: got.status, headers: got.headers, body: Buffer.from(got.body, 'base64'), kept: true });
    let got = fresh(read(file));
    if (got) return out(got);
    const mine = claim(key);
    if (!mine) {
      await settled(key);
      got = fresh(read(file));
      if (got) return out(got);
    }
    try {
      const r = await ask();
      if (r.status === 200) write(file, { status: r.status, headers: r.headers, body: r.body.toString('base64') });
      return r;
    } finally {
      if (mine) release(key);
    }
  }
  // A JSON value under a key of the caller's (a batch's item): kept while fresh, else null.
  const kept = key => (dir ? (fresh(read(fileOf(key)))?.value ?? null) : null);
  const keepValue = (key, value) => dir && write(fileOf(key), { value });
  return { on: Boolean(dir), dir, ttl, liveFetch, kept, keep: keepValue, claim, release, settled, tally, counts };
}

export const liveKeep = makeKeep();
