// The share sheet's QR codes (kit/share.mjs): what makes them scan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrSvg, qrMatrix, qrRisk, QR_DOTS, QR_CORNERS } from '../kit/share.mjs';

const URL = 'https://jaypengx.com/showcase/';

test('a centre image raises error correction to H and covers under 8% of the code, never a corner square', () => {
  const plain = qrSvg(URL);
  const withLogo = qrSvg(URL, { logo: 'data:image/png;base64,x' });
  assert.equal(plain.modules, qrMatrix(URL, 'Q').length);
  assert.equal(withLogo.modules, qrMatrix(URL, 'H').length);
  assert.equal(plain.plate, null);
  const { plate, side, modules } = withLogo;
  // The plate is the image plus a module each side.
  const covered = (plate.size * side + 2) ** 2;
  assert.ok(covered / modules ** 2 < 0.08, `covers ${covered} of ${modules ** 2}`);
  assert.ok(plate.x * side > 7 + 4 && plate.x * side + plate.size * side < side - 7 - 4, 'clear of the corner squares');
  assert.match(withLogo.svg, /<image href="data:image\/png;base64,x"/);
});

test('every style draws, the margin stays 2 to 8 modules, colours are checked', () => {
  for (const dots of QR_DOTS)
    for (const corners of QR_CORNERS) {
      const { svg } = qrSvg(URL, { dots, corners });
      assert.match(svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
      assert.ok(!/NaN|undefined/.test(svg), `${dots}/${corners}`);
    }
  const n = qrMatrix(URL, 'Q').length;
  assert.equal(qrSvg(URL, { margin: 0 }).side, n + 4);
  assert.equal(qrSvg(URL, { margin: 99 }).side, n + 16);
  assert.match(qrSvg(URL, { fg: 'red;"', bg: 'nope' }).svg, /fill="#000000"/);
  assert.equal(qrRisk({ fg: '#000000', bg: '#ffffff' }), '');
  assert.equal(qrRisk({ fg: '#ffffff', bg: '#000000' }), 'inverted');
  assert.equal(qrRisk({ fg: '#9ca3af', bg: '#ffffff' }), 'faint');
});

test('a link with Chinese in it is coded as UTF-8', () => {
  assert.ok(qrMatrix('https://jaypengx.com/law/#q=民法').length > 0);
});
