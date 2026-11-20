// The guide as a person meets it (kit coach.mjs), in a browser on a page with
// a sheet, tabs and a row redrawn under it (Jay 2026-11-19: "none of them is
// stuck, not working, need two click, allow user to break out"): one tap on
// the ring moves it on; a tap, a press or a swipe anywhere else never reaches
// the app, on a line or a `show` step either; a sheet closed some other way
// moves it on; a target gone shows 下一步; a redrawn target is found again;
// a step not on screen leaves the count without a jump.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

let chromium = null;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {}
const kit = new URL('../kit/', import.meta.url);
const css = readFileSync(new URL('orbit.css', kit), 'utf8');

const PAGE = `<!doctype html><meta name="viewport" content="width=390"><style>${css}</style>
<body style="margin:0;min-height:900px">
<button id="other" style="position:absolute;left:10px;top:500px;width:100px;height:40px">other</button>
<button id="t1" style="position:absolute;left:10px;top:100px;width:100px;height:40px">one</button>
<button id="open" style="position:absolute;left:150px;top:100px;width:100px;height:40px">open</button>
<div id="row" style="position:absolute;left:10px;top:200px"><button class="live" style="width:100px;height:40px">live</button></div>
<button id="gone" style="position:absolute;left:150px;top:200px;width:100px;height:40px">gone</button>
<script type="module">
  window.heard = [];
  for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click']) document.addEventListener(ev, e => e.target.id && heard.push(ev + ':' + e.target.id));
  // An app's own drag: moves heard make the next touch's end a drag's, its click dropped.
  let moved = false;
  document.addEventListener('touchmove', () => (moved = true));
  document.addEventListener('touchend', e => moved && (e.preventDefault(), (moved = false)), { passive: false });
  document.getElementById('open').onclick = () => {
    const d = document.createElement('dialog');
    d.className = 'q-sheet';
    d.innerHTML = '<button class="q-close" style="width:44px;height:44px">✕</button><p style="height:200px">sheet</p>';
    document.body.append(d);
    d.showModal();
  };
  const { coachTour } = await import('/kit/coach.mjs');
  window.ended = null;
  window.tour = steps => coachTour(steps, { onEnd: done => (window.ended = done) });
  window.ready = true;
</script></body>`;

const STEPS = `[
  { say: ['開場', 'Open'] },
  { tap: '#t1', say: ['一', 'One'] },
  { tap: '#missing', optional: true, say: ['沒有', 'None'] },
  { show: '#other', say: ['看', 'Look'] },
  { tap: '#open', say: ['開', 'Open it'] },
  { tap: 'dialog[open] .q-close', say: ['關', 'Close'] },
  { tap: '#row .live', say: ['即時', 'Live'] },
  { tap: '#gone', say: ['走了', 'Gone'] }
]`;

test('the guide: one tap on the ring, nothing else reaches the app, never stuck', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.route('http://app.test/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/kit/')) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(new URL(path.slice(5), kit)) });
      return route.fulfill({ contentType: 'text/html', body: PAGE });
    });
    await page.goto('http://app.test/');
    await page.waitForFunction(() => window.ready);
    await page.evaluate(s => window.tour(eval(s)), STEPS);
    const say = () => page.locator('.q-coach-say').textContent();
    const count = () => page.locator('.q-coach-n').textContent();
    const heard = () => page.evaluate(() => window.heard.splice(0));
    const at = async (text, ms = 5000) => page.waitForFunction(w => document.querySelector('.q-coach-say')?.textContent === w && !document.querySelector('.q-coach.wait'), text, { timeout: ms });

    // The opening line: a tap, a press, a touch on the app goes nowhere.
    await at('開場');
    await page.mouse.click(60, 520);
    await page.touchscreen.tap(60, 520);
    assert.deepEqual(await heard(), [], 'nothing reaches the app on a line');
    await page.click('.q-coach-next');

    // A tap step: elsewhere held back; one tap on the target is heard and moves it on.
    await at('一');
    assert.equal(await count(), '2/8');
    // (a stray swipe first: its moves held back too, or the app takes the next tap for a drag's end)
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', 60, 520);
    for (let j = 1; j <= 6; j++) await touch('touchMove', 60 + j * 30, 520 + j * 30);
    await touch('touchEnd');
    await page.touchscreen.tap(60, 120);
    await at('看');
    await page.evaluate(s => window.tour(eval(s)), STEPS);
    await at('開場');
    await page.click('.q-coach-next');
    await at('一');
    await heard();
    await page.mouse.click(60, 520);
    assert.deepEqual(await heard(), [], 'a tap off the target is held back');
    assert.equal(await say(), '一');
    await page.mouse.click(60, 120);
    assert.ok((await heard()).includes('click:t1'), 'the target hears its one tap');
    // (a step not on screen: skipped, and the count closes up rather than jump)
    await at('看');
    assert.equal(await count(), '3/7');

    // A show step: its target, too, answers nothing.
    await page.mouse.click(60, 520);
    assert.deepEqual(await heard(), [], 'a show step taps nothing');
    await page.click('.q-coach-next');

    // A sheet opened by the step, then closed some other way (a swipe, its dimmed page): moved on.
    await at('開');
    await page.mouse.click(200, 120);
    await at('關');
    assert.ok(await page.locator('dialog[open] .q-coach').count(), 'the bubble rides in the open sheet, so it can be tapped');
    await page.evaluate(() => document.querySelector('dialog[open]').close());
    await at('即時', 4000);

    // The target drawn again (a live score): found again, and its tap still counts.
    await page.evaluate(() => (document.getElementById('row').innerHTML = '<button class="live" style="width:100px;height:40px">live 2</button>'));
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.q-coach-ring').isHidden(), false, 'the ring found the new row');
    await page.mouse.click(60, 220);
    await at('走了');

    // The target taken away for good: 下一步 shows, never stuck.
    await page.evaluate(() => document.getElementById('gone').remove());
    await page.waitForSelector('.q-coach-next:not([hidden])', { timeout: 4000 });
    await page.click('.q-coach-next');
    await page.waitForSelector('.q-coach.done', { timeout: 3000 });
    assert.deepEqual((await heard()).filter(e => !/:(t1|open|row)$/.test(e) && !e.endsWith('live')), [], 'nothing else reached the app');
    await page.click('.q-coach-next');
    await page.waitForFunction(() => window.ended === true);
    await page.waitForFunction(() => !document.querySelector('.q-coach'), null, { timeout: 2000 });
  } finally {
    await browser.close();
  }
});

test('the guide: Escape or 略過 ends it, and the app answers taps again', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('http://app.test/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/kit/')) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(new URL(path.slice(5), kit)) });
      return route.fulfill({ contentType: 'text/html', body: PAGE });
    });
    await page.goto('http://app.test/');
    await page.waitForFunction(() => window.ready);
    for (const way of ['skip', 'escape']) {
      await page.evaluate(s => ((window.ended = null), window.tour(eval(s))), STEPS);
      await page.waitForSelector('.q-coach-say');
      if (way === 'skip') await page.click('.q-coach-skip');
      else await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.ended === false);
      await page.waitForFunction(() => !document.querySelector('.q-coach'));
      await page.evaluate(() => window.heard.splice(0));
      await page.mouse.click(60, 520);
      assert.ok((await page.evaluate(() => window.heard.splice(0))).includes('click:other'), `after ${way}, the app is the person's again`);
    }
  } finally {
    await browser.close();
  }
});

// A target the person scrolled under the app's floating bar: brought back out once their hands
// are still (11-19: the ring on a row under the tab bar, where a tap hits the tab).
test('the guide: a target scrolled under a floating bar is brought back once the person stops', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 600 } });
    const tall = PAGE.replace('min-height:900px', 'min-height:2000px').replace('<script type="module">', '<nav id="bar" style="position:fixed;left:0;right:0;bottom:0;height:70px;background:#ccc;z-index:5"></nav><button id="low" style="position:absolute;left:10px;top:1000px;width:100px;height:40px">low</button><script type="module">');
    await page.route('http://app.test/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/kit/')) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(new URL(path.slice(5), kit)) });
      return route.fulfill({ contentType: 'text/html', body: tall });
    });
    await page.goto('http://app.test/');
    await page.waitForFunction(() => window.ready);
    await page.evaluate(() => window.tour([{ tap: '#low', say: ['低', 'Low'] }]));
    await page.waitForFunction(() => document.querySelector('.q-coach-say')?.textContent === '低');
    await page.waitForTimeout(1500);
    // the person scrolls it down under the bar
    await page.mouse.wheel(0, 0);
    await page.evaluate(() => scrollTo(0, 1000 - 600 + 60));
    const under = () => page.evaluate(() => { const r = document.getElementById('low').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id; });
    assert.equal(await under(), 'bar', 'set up: the target is under the bar');
    await page.waitForFunction(() => { const r = document.getElementById('low').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id === 'low'; }, null, { timeout: 5000 });
  } finally {
    await browser.close();
  }
});

// Jay 11-20: a guide started away from the app's home (another tab) found none of its steps,
// looked for each one with its bubble hidden and every tap held back, and the app seemed frozen.
// Now it starts from home (goHome: the first tab, tapped again if need be), nothing is held back
// while it looks, and two steps in a row not there stop it, said.
test('the guide: started away from home it goes home first; looking never freezes the app; lost, it stops', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const tabs = PAGE.replace('<script type="module">', `<nav class="q-tabbar"><button class="q-tab" id="tab-home" aria-selected="false">home</button><button class="q-tab" id="tab-two" aria-selected="true">two</button></nav>
<script>
  document.getElementById('t1').hidden = true;
  document.getElementById('tab-home').onclick = () => { document.getElementById('t1').hidden = false; document.getElementById('tab-home').setAttribute('aria-selected', 'true'); document.getElementById('tab-two').setAttribute('aria-selected', 'false'); };
</script><script type="module">
  window.coach = await import('/kit/coach.mjs');`);
    await page.route('http://app.test/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/kit/')) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(new URL(path.slice(5), kit)) });
      return route.fulfill({ contentType: 'text/html', body: tabs });
    });
    await page.goto('http://app.test/');
    await page.waitForFunction(() => window.ready && window.coach);
    // Home first: the first tab opened, so the first step's target is there.
    assert.equal(await page.locator('#t1').isVisible(), false, 'set up: away from home');
    await page.evaluate(() => window.coach.goHome([{ say: ['開場', 'Open'] }, { tap: '#t1', say: ['一', 'One'] }]));
    assert.equal(await page.locator('#t1').isVisible(), true, 'home: the first step is on screen');

    // Lost: two steps in a row not there. While it looks, a tap reaches the app; then it stops.
    await page.evaluate(() => window.heard.splice(0));
    await page.evaluate(() => window.tour([{ say: ['開場', 'Open'] }, { tap: '#nope1', say: ['甲', 'A'] }, { tap: '#nope2', say: ['乙', 'B'] }, { tap: '#t1', say: ['一', 'One'] }]));
    await page.waitForSelector('.q-coach-next:not([hidden])');
    await page.click('.q-coach-next');
    await page.waitForSelector('.q-coach.wait', { state: 'attached' });
    await page.mouse.click(60, 520);
    assert.ok((await page.evaluate(() => window.heard.splice(0))).includes('click:other'), 'looking, the app still answers');
    await page.waitForFunction(() => window.ended === false, null, { timeout: 12000 });
    await page.waitForFunction(() => /導覽先停在這裡/.test(document.querySelector('.q-toast')?.textContent || ''), null, { timeout: 2000 });
  } finally {
    await browser.close();
  }
});
