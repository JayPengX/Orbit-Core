// Orbit's own screenshots (this repo's README, store.mjs `core`): preview.mjs
// --suite --door opens Orbit (/app/), and this --script sets up the scene its
// hash names, as a person would get there. Each app is a frame of its own,
// its ⌄ switcher and sheets inside that frame.
//   tabs      Beats playing, then Weather, then Transit: the tabs along the top
//   switcher  the same, the ⌄ sheet open (the apps open, 進行中, every app)
//   pass      Weather open, its Orbit Pass sheet
//   add       the add page in Safari (--safari): every app, or one alone
//   setup     the add page in Safari (--safari), 自訂名稱、App 和圖示 open
//   school    the same, made into an Orbit for school: its name and four apps
//   rail      a computer's or tablet's: Beats playing, News, then Weather
export default async function ({ page, hash }) {
  const z = ms => page.waitForTimeout(ms);
  const fr = name => page.frames().find(f => new RegExp(`/Orbit-${name}/`).test(f.url()));
  // A button by its label: in the open sheet if there is one, else on the page.
  const tapIn = (f, re) =>
    f.evaluate(r => {
      const d = [...document.querySelectorAll('dialog[open]')].pop();
      const b = [...(d || document).querySelectorAll('button')].find(b => (d || b.offsetParent) && new RegExp(r).test((b.getAttribute('aria-label') || b.textContent).trim()));
      b?.click();
      return !!b;
    }, re);
  const open = async (from, to, ms) => {
    await fr(from).evaluate(() => document.querySelector('.q-suite-switch')?.click());
    await z(1500);
    if (!(await tapIn(fr(from), `^${to}$`))) throw new Error(`no ${to} in ${from}'s switcher`);
    await z(ms);
  };
  const first = async (app, ms) => {
    await z(2500);
    if (!(await tapIn(page.mainFrame(), `^${app}$`))) throw new Error(`no ${app} on Orbit's home`);
    await z(ms);
  };
  const play = async () => {
    await first('Beats', 6000);
    await fr('Beats').evaluate(() => document.querySelector('.bt-play')?.click());
    await z(3000);
  };
  if (hash === 'tabs' || hash === 'switcher') {
    await play();
    await open('Beats', 'Weather', 7000);
    await open('Weather', 'Transit', 9000);
    if (hash === 'switcher') await fr('Transit').evaluate(() => document.querySelector('.q-suite-switch')?.click());
    await z(1500);
  } else if (hash === 'pass') {
    await first('Weather', 8000);
    await fr('Weather').evaluate(() => document.querySelector('.q-account')?.click());
    await z(2500);
  } else if (hash === 'add') {
    await z(2500);
  } else if (hash === 'setup' || hash === 'school') {
    await z(2500);
    if (!(await tapIn(page.mainFrame(), '^(自訂名稱|Choose its name)'))) throw new Error('no setup row on the add page');
    await z(1500);
    if (hash === 'school')
      await page.evaluate(async () => {
        const en = localStorage.getItem('orbit.lang') === 'en';
        for (const name of ['Sports', 'Money', 'News', 'Beats', 'Law', 'Securities'])
          [...document.querySelectorAll('button,[role=checkbox],label')].find(b => b.offsetParent && (b.getAttribute('aria-label') || b.textContent).trim() === name)?.click();
        const i = [...document.querySelectorAll('input')].find(x => x.offsetParent && x.type !== 'checkbox');
        if (i) (i.value = en ? 'School' : '上學'), i.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await z(1200);
  } else if (hash === 'rail') {
    await play();
    await open('Beats', 'News', 9000);
    await open('News', 'Weather', 9000);
  } else throw new Error(`no scene "${hash}"`);
}
