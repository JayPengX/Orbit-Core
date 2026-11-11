// The kit's pieces that lay out by their own width, never the screen's
// (Jay 2026-11-06: "such a work to have to adjust UI design constantly over
// three kind of devices"): .q-cols, .q-cols-3, .q-grid, .q-split and
// .q-flow (flowColumns) in boxes of a phone's, an iPad's and a computer's
// width, all on one wide screen; nothing wider than its box. Chromium,
// where one is here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

let chromium = null;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {}

const KIT = new URL('../kit/', import.meta.url).pathname;
const TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css' };
const card = n => `<div class="card" style="height:${n}px;background:#333"></div>`;
const PAGE = `<!doctype html><html lang="zh-Hant" data-look="native"><head><meta charset="utf-8"><link rel="stylesheet" href="/kit/orbit.css"></head>
<body style="margin:0">${[288, 640, 1000]
  .map(w => `<div class="box" data-w="${w}" style="width:${w}px">
<div class="q-cols">${card(40)}${card(40)}</div>
<div class="q-cols q-cols-3">${card(40)}${card(40)}${card(40)}</div>
<div class="q-grid">${card(40).repeat(6)}</div>
<div class="q-split"><div class="q-split-list">${card(40)}</div><div class="q-split-main">${card(40)}</div></div>
<div class="q-flow">${[200, 120, 160, 90, 140].map(card).join('')}</div>
</div>`)
  .join('')}
<div id="lone" style="width:1000px"><div class="q-grid q-rows-full q-rows-snug">${card(40)}</div><div class="q-grid q-rows-full q-rows-snug">${card(40).repeat(3)}</div><div class="q-grid q-rows-full">${card(40)}</div></div>
<div id="refit" style="width:640px"><div class="q-flow q-flow-refit">${[120, 300, 120, 120].map((n, i) => `<div class="card" id="part${i}" style="height:${n}px;background:#333"></div>`).join('')}</div></div>
<script type="module">
import { flowColumns } from '/kit/ui.mjs';
import { fullRows } from '/kit/orbit.mjs';
flowColumns(document);
fullRows(document);
globalThis.ready = true;
</script></body></html>`;

test('columns, grids, splits and flows count their own width', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    const file = join(KIT, path.replace(/^\/kit\//, ''));
    if (!path.startsWith('/kit/') || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise(ok => server.listen(0, ok));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.waitForFunction(() => globalThis.ready);
    const got = await page.evaluate(() =>
      [...document.querySelectorAll('.box')].map(b => {
        const across = el => new Set([...el.children].map(c => Math.round(c.getBoundingClientRect().left))).size;
        const box = b.getBoundingClientRect();
        const over = [...b.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > box.right + 0.5).map(e => e.className);
        return { w: +b.dataset.w, cols: across(b.querySelector('.q-cols:not(.q-cols-3)')), cols3: across(b.querySelector('.q-cols-3')), grid: across(b.querySelector('.q-grid')), split: across(b.querySelector('.q-split')), flow: b.querySelector('.q-flow').querySelectorAll(':scope > .q-flow-col').length || 1, over };
      })
    );
    assert.deepEqual(got, [
      { w: 288, cols: 1, cols3: 1, grid: 1, split: 1, flow: 1, over: [] },
      { w: 640, cols: 2, cols3: 2, grid: 2, split: 1, flow: 2, over: [] },
      { w: 1000, cols: 2, cols3: 3, grid: 4, split: 2, flow: 3, over: [] },
    ]);
    // (A box that narrows deals its flow again by itself.)
    await page.evaluate(() => (document.querySelector('.box[data-w="1000"]').style.width = '640px'));
    await page.waitForFunction(() => document.querySelector('.box[data-w="1000"] .q-flow').querySelectorAll(':scope > .q-flow-col').length === 2);
    // (Pictures (.q-rows-snug) in a row shorter than the row widen at most to twice
    // their size: one song to come stood a cover the page's width in Beats, 2026-11-11;
    // a row of figures still fills its card.)
    const lone = await page.evaluate(() => [...document.querySelectorAll('#lone .q-grid')].map(g => Math.round(g.firstElementChild.getBoundingClientRect().width)));
    assert.ok(lone[0] <= 2 * 240 + 12, `a lone tile ${lone[0]} wide`);
    assert.ok(lone[1] > 300 && lone[1] < 340, `three tiles fill the row: ${lone[1]}`);
    assert.equal(lone[2], 1000);
    // (.q-flow-refit: a part that fills in after the deal deals the flow again,
    // so one column isn't left one class long beside a long one: Class's 今天, 2026-11-11.)
    const colOf = id => page.evaluate(i => [...document.querySelectorAll('#refit .q-flow-col')].indexOf(document.getElementById(i).parentNode), id);
    assert.equal(await colOf('part2'), 0);
    await page.evaluate(() => (document.getElementById('part0').style.height = '600px'));
    await page.waitForFunction(() => document.getElementById('part2').parentNode === document.querySelectorAll('#refit .q-flow-col')[1]);
  } finally {
    await browser.close();
    server.close();
  }
});
