// The Pass sheet's tabs (Pass / 外觀 / App / 說明), stuck at the top as the
// sheet scrolls, sit clear under the sheet's grabber (2026-11-12: the grabber
// lay across their top edge), and unstuck they sit where they did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

let chromium = null;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {}
const css = readFileSync(new URL('../kit/orbit.css', import.meta.url), 'utf8');

test('Pass tabs clear the grabber when stuck', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 700 } });
    await page.setContent(`<style>${css}</style><body><dialog class="q-sheet q-pass" style="height:600px"><div class="q-sheet-head"><strong>Orbit Pass</strong></div><div class="q-pass-tabs"><div class="seg" style="height:36px;background:#888">tabs</div></div>${'<p style="height:80px">row</p>'.repeat(20)}</dialog></body>`);
    await page.evaluate(() => document.querySelector('dialog').showModal());
    const at = () => page.evaluate(() => {
      const d = document.querySelector('dialog').getBoundingClientRect();
      const seg = document.querySelector('.seg').getBoundingClientRect();
      const head = document.querySelector('.q-sheet-head').getBoundingClientRect();
      const grab = getComputedStyle(document.querySelector('dialog'), '::before');
      return { seg: seg.top - d.top, gap: seg.top - head.bottom, grabEnd: parseFloat(grab.top) + parseFloat(grab.height) };
    });
    const top = await at();
    await page.evaluate(() => (document.querySelector('dialog').scrollTop = 900));
    const stuck = await at();
    assert.ok(stuck.seg >= stuck.grabEnd + 1, `stuck: tabs at ${stuck.seg}, grabber ends at ${stuck.grabEnd}`);
    assert.ok(top.gap >= 12 && top.gap <= 20, `unstuck: ${top.gap} px under the head`);
  } finally {
    await browser.close();
  }
});
