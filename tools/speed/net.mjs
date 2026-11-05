// The phone's link for tools/speed.mjs: one local HTTPS server (HTTP/2,
// TLS) that answers for every host the browser asks (Chromium maps every
// name to it: --host-resolver-rules), and holds each answer as a phone's
// link would: a round trip before it starts, a new connection's setup, the
// request's own upload, and the download shared by everything in flight
// at once (a fluid model: each transfer gets an equal share of the link).
//
// Each browser ("device") reaches the server on its own loopback address
// (127.0.0.N), so each has its own link and its own log.
import { createSecureServer } from 'node:http2';
import { createSecureContext } from 'node:tls';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

// rtt in ms, down/up in bytes a millisecond, setup: round trips a new
// connection costs (DNS and the handshake) before its first request goes.
export const PROFILES = {
  // WebPageTest's "3G (slow)": 400 kbps both ways, 400 ms round trips (Jay 2026-11-05: "close to 3G").
  '3g': { name: '3G (400 kbps, 400 ms)', rtt: 400, down: 400_000 / 8 / 1000, up: 400_000 / 8 / 1000, setup: 2 },
  // A phone's 4G in Taiwan (WebPageTest's 4G: 9 Mbps, 170 ms).
  '4g': { name: '4G (9 Mbps, 170 ms)', rtt: 170, down: 9_000_000 / 8 / 1000, up: 3_000_000 / 8 / 1000, setup: 2 },
  wifi: { name: 'Wi-Fi (50 Mbps, 20 ms)', rtt: 20, down: 50_000_000 / 8 / 1000, up: 20_000_000 / 8 / 1000, setup: 2 }
};
// What a response's and a request's headers cost on the wire (HTTP/2, HPACK), and a new connection's handshake (Cloudflare's certificates).
export const HEAD_DOWN = 150;
export const HEAD_UP = 100;
export const HANDSHAKE = 5000;

export const now = () => performance.now();

// ---- Certificates: one key for every host, its SPKI allowed by Chromium ----
const TLS_DIR = join(tmpdir(), 'orbit-speed-tls');
export function tls() {
  mkdirSync(TLS_DIR, { recursive: true });
  const f = n => join(TLS_DIR, n);
  if (!existsSync(f('ca.pem'))) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '3650', '-subj', '/CN=Orbit Speed CA', '-keyout', f('ca.key'), '-out', f('ca.pem'), '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign'], { stdio: 'ignore' });
    execFileSync('openssl', ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', f('leaf.key')]);
  }
  const key = readFileSync(f('leaf.key'));
  const ca = readFileSync(f('ca.pem'));
  const spki = execFileSync('sh', ['-c', `openssl pkey -in '${f('leaf.key')}' -pubout -outform der | openssl dgst -sha256 -binary | base64`]).toString().trim();
  const contexts = new Map();
  const contextFor = host => {
    host = String(host || 'localhost').toLowerCase().replace(/[^a-z0-9.-]/g, '');
    if (contexts.has(host)) return contexts.get(host);
    const pemFile = f(`host-${host}.pem`);
    if (!existsSync(pemFile)) {
      const csr = execFileSync('openssl', ['req', '-new', '-key', f('leaf.key'), '-subj', `/CN=${host}`]);
      const ext = f(`host-${host}.cnf`);
      writeFileSync(ext, `subjectAltName=DNS:${host}\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n`);
      writeFileSync(pemFile, execFileSync('openssl', ['x509', '-req', '-CA', f('ca.pem'), '-CAkey', f('ca.key'), '-CAcreateserial', '-days', '825', '-extfile', ext, '-sha256'], { input: csr, stdio: ['pipe', 'pipe', 'ignore'] }));
    }
    const ctx = createSecureContext({ key, cert: Buffer.concat([readFileSync(pemFile), ca]) });
    contexts.set(host, ctx);
    return ctx;
  };
  return { contextFor, spki, key, cert: () => readFileSync(f('ca.pem')) };
}

// ---- One phone's link ----
export class Link {
  constructor(profile) {
    Object.assign(this, { rtt: profile.rtt, down: profile.down, up: profile.up, setup: profile.setup });
    this.flows = new Set();
    this.timer = null;
    this.last = now();
  }
  // Resolves (with the time it ends) once `bytes` have come down, starting no earlier than `at`.
  transfer(at, bytes) {
    return new Promise(resolve => {
      this.flows.add({ at, left: Math.max(1, bytes), resolve });
      if (!this.timer) {
        this.last = now();
        this.timer = setInterval(() => this.tick(), 4);
      }
    });
  }
  tick() {
    const t = now();
    const dt = t - this.last;
    this.last = t;
    const live = [...this.flows].filter(f => f.at <= t);
    if (live.length) {
      const each = (this.down * dt) / live.length;
      for (const f of live) {
        f.left -= each;
        if (f.left <= 0) {
          this.flows.delete(f);
          f.resolve(t);
        }
      }
    }
    if (!this.flows.size) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

const wait = until => new Promise(r => setTimeout(r, Math.max(0, until - now())));

// ---- The server ----
// handle(device, request) → { status, headers, chunks: [{ t, data }], serverMs, kind, note }
//   t: when that part was ready, in ms after the request reached the origin
//   (serverMs for a whole answer); data: what's sent (already encoded).
// devices: Map<ip, device>; a device has { link, log: [], inflight, zero }.
export function startServer({ devices, handle, port = 443 }) {
  const { contextFor } = tls();
  const server = createSecureServer({ SNICallback: (h, cb) => cb(null, contextFor(h)), allowHTTP1: true, maxSessionMemory: 64 });
  const deviceOf = sock => devices.get(String(sock?.localAddress || '').replace(/^::ffff:/, ''));
  // A new connection: ready after the link's setup round trips (and its handshake's bytes come down).
  const fresh = target => {
    const dev = deviceOf(target.socket || target);
    if (!dev) return;
    const t = now();
    target.__readyAt = t + dev.link.setup * dev.link.rtt;
    target.__dev = dev;
    dev.connections = (dev.connections || 0) + 1;
    dev.handshakeBytes = (dev.handshakeBytes || 0) + HANDSHAKE;
    if (dev.step) dev.step.handshakes = (dev.step.handshakes || 0) + 1;
  };
  server.on('session', session => fresh(session));
  server.on('secureConnection', sock => {
    if (!sock.alpnProtocol || sock.alpnProtocol === 'http/1.1') fresh(sock);
  });
  server.on('request', async (req, res) => {
    const t0 = now();
    const session = req.stream?.session;
    const dev = session?.__dev || deviceOf(req.socket);
    if (!dev) {
      res.writeHead(421);
      return res.end();
    }
    const host = String(req.headers[':authority'] || req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    const url = new URL(req.url, `https://${host}`);
    const parts = [];
    for await (const c of req) parts.push(c);
    const body = Buffer.concat(parts);
    const L = dev.link;
    const readyAt = session?.__readyAt ?? req.socket?.__readyAt ?? t0;
    const sendAt = Math.max(t0, readyAt);
    const arriveAt = sendAt + L.rtt / 2 + (body.length + HEAD_UP) / L.up;
    const entry = { at: t0 - dev.zero, host, path: url.pathname + url.search, method: req.method, status: 0, bytes: 0, raw: 0, serverMs: 0, kind: '', done: 0, step: dev.step?.name || '' };
    dev.inflight++;
    dev.lastActive = t0;
    (dev.step?.log || dev.log).push(entry);
    try {
      const out = await handle(dev, { host, url, method: req.method, headers: req.headers, body, accepts: String(req.headers['accept-encoding'] || '') });
      entry.status = out.status;
      entry.kind = out.kind || '';
      entry.serverMs = Math.round(out.serverMs || 0);
      entry.raw = out.raw || 0;
      entry.note = out.note || '';
      entry.route = out.route || '';
      const chunks = out.chunks?.length ? out.chunks : [{ t: out.serverMs || 0, data: Buffer.alloc(0) }];
      let last = 0;
      let headed = false;
      for (const [i, ch] of chunks.entries()) {
        const avail = arriveAt + Math.max(ch.t ?? 0, i === 0 ? out.serverMs || 0 : 0) + L.rtt / 2;
        const size = ch.data.length + (i === 0 ? HEAD_DOWN : 0);
        entry.bytes += size;
        last = await L.transfer(Math.max(avail, last), size);
        if (res.destroyed || res.writableEnded) break;
        if (!headed) {
          headed = true;
          res.writeHead(out.status, out.headers || {});
        }
        if (ch.data.length) res.write(ch.data);
      }
      if (!res.writableEnded && !res.destroyed) {
        if (!headed) res.writeHead(out.status, out.headers || {});
        res.end();
      }
      entry.done = now() - dev.zero;
    } catch (error) {
      entry.status = 599;
      entry.note = String(error?.message || error).slice(0, 120);
      if (!res.headersSent) res.writeHead(502);
      res.end();
      entry.done = now() - dev.zero;
    } finally {
      dev.inflight--;
      dev.lastActive = now();
    }
  });
  server.on('sessionError', () => {});
  server.on('tlsClientError', () => {});
  server.on('error', e => console.log('speed server:', e.message));
  return new Promise((ok, no) => {
    server.once('error', no);
    server.listen(port, '0.0.0.0', () => ok({ server, close: () => new Promise(r => server.close(() => r())) }));
  });
}

export { wait };
