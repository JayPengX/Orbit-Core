// The layout check (tools/layout-faults.mjs) on made-up pages: a computer's
// page in a narrow band, or with one half empty, fails; two full columns, a
// row of cards cut by its scroller and any phone pass; in a wide sheet, a
// lone card shrunk to its content fails. Chromium, where one
// is here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { layoutFaults } from '../tools/layout-faults.mjs';

let chromium = null;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {}

const lines = n => Array.from({ length: n }, (_, i) => `<p>第 ${i + 1} 行，一些字</p>`).join('');
const frame = body => `<!doctype html><html class="q-tabrail q-desk"><body style="margin:0;font:16px/24px sans-serif">
<nav id="tabs" style="position:fixed;left:0;top:0;bottom:0;width:224px"><button>今天</button></nav>
<main style="margin-left:240px;padding:0 16px">${body}</main></body></html>`;
const two = (l, r) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px"><div>${l}</div><div>${r}</div></div>`;
const PAGES = {
  good: [frame(two(lines(30), lines(30))), []],
  narrow: [frame(`<div style="max-width:480px;margin:0 auto">${lines(40)}</div>`), ['narrow']],
  halfEmpty: [frame(two(lines(40), '<p>一行</p>')), ['half empty']],
  // (A row of cards sliding sideways: the ones past its edge aren't drawn.)
  scroller: [frame(`<div style="max-width:480px;margin:0 auto;overflow-x:auto;white-space:nowrap">${'<span style="display:inline-block;width:300px">卡片</span>'.repeat(10)}</div>${'<div style="max-width:480px;margin:0 auto">' + lines(30) + '</div>'}`), ['narrow']],
  // (A wide sheet: a lone card shrunk to what it holds fails; two full columns pass.)
  sheetLone: [frame(lines(30)) + `<dialog class="q-sheet q-sheet-wide" open style="position:fixed;inset:40px 0 0;width:1000px;margin:0 auto;padding:16px"><div class="q-sheet-head"><h2>球隊</h2><button>✕</button></div><div style="display:grid;justify-items:start"><div style="background:#333;padding:16px">${lines(8)}</div></div></dialog>`, ['narrow']],
  sheetFull: [frame(lines(30)) + `<dialog class="q-sheet q-sheet-wide" open style="position:fixed;inset:40px 0 0;width:1000px;margin:0 auto;padding:16px"><div class="q-sheet-head"><h2>球隊</h2><button>✕</button></div>${two(`<div style="background:#333">${lines(12)}</div>`, `<div style="background:#333">${lines(12)}</div>`)}</dialog>`, []],
};

test('the layout check fails a narrow band and an empty half, passes full columns and phones', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const [name, [html, want]] of Object.entries(PAGES)) {
      await page.setContent(html);
      const got = (await page.evaluate(layoutFaults)).map(f => f.split(':')[0]);
      assert.deepEqual(got, want, name);
    }
    // A phone: never.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(frame(`<div style="max-width:120px">${lines(30)}</div>`));
    assert.deepEqual(await page.evaluate(layoutFaults), []);
  } finally {
    await browser.close();
  }
});
