// Orbit News's desk (builders/news.js runDesk), laid here in GitHub Actions:
// in the proxy it passed the Runner's 30 s of CPU on every build once ~22,000
// headlines and ~5,000 stories were kept (11-19). The proxy's cron reads the
// feeds and keeps them (runNews, desk: false), then starts this
// (news-desk.yml); it reads what was kept through /data/_get and writes the
// front, the past and the stories through /data/push (DATA_PUSH_SECRET).
//   DATA_PUSH_SECRET=… node tools/news-desk.mjs
import { gzipSync, gunzipSync } from 'node:zlib';
import { runDesk } from '../builders/news.js';

const API = (process.env.ORBIT_API || 'https://orbit-workers-proxy.pengzjay.workers.dev').replace(/\/$/, '');
const SECRET = process.env.DATA_PUSH_SECRET || '';
if (!SECRET) {
  console.error('news desk: no DATA_PUSH_SECRET');
  process.exit(1);
}
const auth = { Authorization: `Bearer ${SECRET}` };
const tries = async (what, fn) => {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= 3) throw new Error(`${what}: ${e.message}`);
      await new Promise(r => setTimeout(r, 3000 * (i + 1)));
    }
  }
};
const frame = (path, bytes) => {
  const p = Buffer.from(path);
  const out = Buffer.alloc(8 + p.length + bytes.length);
  out.writeUInt32BE(p.length, 0);
  p.copy(out, 4);
  out.writeUInt32BE(bytes.length, 4 + p.length);
  bytes.copy(out, 8 + p.length);
  return out;
};
const store = {
  async json(path) {
    return tries(`read ${path}`, async () => {
      const r = await fetch(`${API}/data/_get?p=${encodeURIComponent(path)}`, { headers: auth });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const b = Buffer.from(await r.arrayBuffer());
      return JSON.parse((b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b).toString('utf8'));
    });
  },
  async put(path, data) {
    const raw = Buffer.from(JSON.stringify(data));
    const bytes = path.endsWith('.gz') ? gzipSync(raw) : raw;
    return tries(`write ${path}`, async () => {
      const r = await fetch(`${API}/data/push`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream' }, body: frame(path, bytes) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return true;
    });
  }
};
const t0 = Date.now();
const cpu0 = process.cpuUsage();
const r = await runDesk({ store, now: Date.now() });
const c = process.cpuUsage(cpu0);
console.log(`news desk: ${JSON.stringify(r)} in ${Date.now() - t0} ms, ${Math.round((c.user + c.system) / 1000)} ms CPU`);
