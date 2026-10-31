import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { pngAlpha, faceCrop } from '../f1-people.js';

// A w×h RGBA PNG (filter 0 on each row) with a figure drawn by `on(x, y)`.
function png(w, h, on) {
  const crc = buf => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'ascii');
    body.copy(out, 8);
    out.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, 'ascii'), body])), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) raw[y * (w * 4 + 1) + 1 + x * 4 + 3] = 255;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('a half-body cutout: zoomed in on the head', async () => {
  // A head 40 wide from y 10 to 60 at x 100, shoulders 160 wide below.
  const p = await pngAlpha(png(200, 200, (x, y) => (y >= 10 && y < 60 && Math.abs(x - 100) < 20) || (y >= 60 && Math.abs(x - 100) < 80)));
  assert.equal(p.w, 200);
  const c = faceCrop(p);
  assert.ok(c.s > 1.8 && c.s < 2.3, `s ${c.s}`);
  assert.ok(Math.abs(c.x - 0.5) < 0.02);
  assert.ok(c.y < 0.35);
});
test('a head-and-shoulders cutout already: left as it is', async () => {
  const p = await pngAlpha(png(200, 200, (x, y) => y >= 4 && Math.abs(x - 100) < (y < 120 ? 50 : 95)));
  assert.equal(faceCrop(p).s, 1);
});
test('not a PNG: no crop', async () => {
  assert.equal(await pngAlpha(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null);
});
