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

// The Pass tab's section labels sit with their own card, not the one before
// (2026-11-12: `.q-pass h3 { margin: 0 }` left every label 4 px under the card above).
test('Pass tab labels sit with the card under them', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    await page.setContent(`<style>${css}</style><body><div class="q-pass"><div class="q-pass-body"><div class="q-rows" id="a" style="height:52px"></div><h3 class="q-sheet-h" id="h">通行密鑰</h3><div class="q-rows" id="b" style="height:52px"></div><p class="q-sheet-sub" id="n">note</p><h3 class="q-sheet-h" id="h2">通知</h3></div></div></body>`);
    const r = await page.evaluate(() => { const b = id => document.getElementById(id).getBoundingClientRect(); return { above: b('h').top - b('a').bottom, below: b('b').top - b('h').bottom, note: b('n').top - b('b').bottom, after: b('h2').top - b('n').bottom }; });
    assert.ok(r.above >= 20 && r.below <= 10, `label: ${r.above} above, ${r.below} below`);
    assert.ok(r.note >= 6 && r.note < r.after, `note: ${r.note} under its card, the next label ${r.after} after it`);
  } finally {
    await browser.close();
  }
});

// Every tab starts the same distance under the segments (2026-11-17: the App
// tab with no 今天 rows began with its label 44 px under them and 外觀 with its
// section 38 px, the Pass tab and 說明 24 px).
test('every Pass tab starts the same distance under the tabs', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    const rows = '<div class="q-rows q-pass-group"><div class="q-cell" style="height:52px">row</div></div>';
    const tabs = {
      pass: `<div class="q-rows q-pass-group q-pass-me" id="first"><div class="q-cell" style="height:52px">me</div></div><h3 class="q-sheet-h">登入與安全</h3>${rows}`,
      looks: `<div><section class="q-section"><div class="q-section-head"><h2 id="first">里程碑</h2></div>${rows}</section><section class="q-section" id="second"><div class="q-section-head"><h2>頭像與頭像框</h2></div>${rows}</section></div>`,
      apps: `<h3 class="q-sheet-h" id="first">所有 App</h3>${rows}`,
      appsToday: `<section class="q-list-group"><h3 class="q-list-head" id="first">今天</h3><div class="q-list" id="today"><div class="q-cell" style="height:52px">row</div></div></section><h3 class="q-sheet-h" id="second">所有 App</h3>${rows}`
    };
    const gaps = {};
    for (const [name, body] of Object.entries(tabs)) {
      await page.setContent(`<style>${css}</style><body><dialog class="q-sheet q-pass" style="height:700px"><div class="q-sheet-head"><strong>Orbit Pass</strong></div><div class="q-pass-tabs"><div class="q-seg"><button>Pass</button></div></div><div class="q-pass-body">${body}</div></dialog></body>`);
      await page.evaluate(() => document.querySelector('dialog').showModal());
      gaps[name] = await page.evaluate(() => {
        const b = id => document.getElementById(id)?.getBoundingClientRect();
        const prev = document.getElementById('second')?.previousElementSibling?.getBoundingClientRect();
        return { first: Math.round(b('first').top - document.querySelector('.q-seg').getBoundingClientRect().bottom), second: prev ? Math.round(b('second').top - prev.bottom) : null };
      });
    }
    for (const name of ['looks', 'apps', 'appsToday']) assert.equal(gaps[name].first, gaps.pass.first, `${name} starts ${gaps[name].first} px under the tabs, Pass ${gaps.pass.first}`);
    // (Only the first: a later label or section keeps its space from the card before it.)
    assert.ok(gaps.looks.second >= 14, `外觀's second section ${gaps.looks.second} px under the first`);
    assert.ok(gaps.appsToday.second >= 20, `所有 App ${gaps.appsToday.second} px under 今天's card`);
  } finally {
    await browser.close();
  }
});
