// The kit's cards and tiles (sectionHead, logoTile, matchCard…): they exist, import without a DOM, their
// classes are in the stylesheet, and empty/confirm keep an emoji icon working.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as ui from '../kit/ui.mjs';
import * as orbit from '../kit/orbit.mjs';

const rawCss = readFileSync(new URL('../kit/orbit.css', import.meta.url), 'utf8');
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
const orbitSrc = readFileSync(new URL('../kit/orbit.mjs', import.meta.url), 'utf8');

// A just-enough DOM for h(): elements with a class, attributes and children.
class FakeNode {}
class FakeEl extends FakeNode {
  constructor(tag) {
    super();
    this.tag = tag;
    this.className = '';
    this.attrs = {};
    this.children = [];
    this.style = { props: {}, setProperty: (k, v) => (this.style.props[k] = v) };
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  addEventListener() {}
  append(...xs) {
    this.children.push(...xs);
  }
  replaceChildren(...xs) {
    this.children = xs;
  }
  set textContent(v) {
    this.children = [String(v)];
  }
  get textContent() {
    return this.children.map(c => (c instanceof FakeEl ? c.textContent : c)).join('');
  }
  find(cls) {
    return this.className.split(' ').includes(cls) ? this : this.children.filter(c => c instanceof FakeEl).map(c => c.find(cls)).find(Boolean) || null;
  }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: t => new FakeEl(t), createTextNode: s => String(s) };

test('every new export exists', () => {
  for (const name of ['sectionHead', 'logoTile', 'matchCard', 'liveStrip', 'actionGrid', 'sheetHero', 'sheetFoot', 'confirm', 'stakeInput', 'ballRow', 'placeTile']) {
    assert.equal(typeof ui[name], 'function', name);
  }
  for (const name of ['work', 'school', 'chevron']) assert.match(ui.icons[name], /^<svg/, `icons.${name}`);
  assert.equal(typeof orbit.ask, 'function');
});

test('the stylesheet has each new class, and keeps the old section-head rules', () => {
  const classes = ['q-shd', 'q-sh-count', 'q-sh-more', 'q-logo', 'q-match', 'q-match-top', 'q-match-teams', 'q-match-side', 'q-match-mid', 'q-match-prices', 'q-price', 'q-live-strip', 'q-live-card', 'q-live-min', 'q-actions-grid', 'q-action', 'q-sheet-hero', 'q-sh-eyebrow', 'q-sh-big', 'q-sh-sub', 'q-sh-row', 'q-sf', 'q-sf-sum', 'pro', 'q-empty-tile', 'q-stake', 'q-stake-amt', 'q-stake-presets', 'q-balls', 'q-ball', 'q-place'];
  for (const c of classes) assert.match(css, new RegExp(`\\.${c}(?![\\w-])`), `.${c}`);
  assert.match(css, /\.q-section-head button:not\(\.q-tag\)/, 'the old head button rule keeps :not(.q-tag)');
  assert.match(rawCss, /Premium components \(round 3\)/);
  assert.match(css, /@keyframes q-pulse/);
});

test('the new CSS adds no hex colours except white, the logo tile and the place tiles', () => {
  const mine = css.slice(css.indexOf('--q-logo-bg: #ffffff'));
  const hexes = [...mine.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0].toLowerCase());
  const allowed = new Set(['#fff', '#ffffff', '#000', '#ff9500', '#6155f5', '#0a84ff', '#ff383c', '#f5b301']);
  assert.deepEqual(hexes.filter(x => !allowed.has(x)), []);
  assert.doesNotMatch(mine, /--q-label2|--q-card\b/, 'the kit\'s token names');
});

test('components build their markup', () => {
  const head = ui.sectionHead('為你推薦', { count: 4, more: '全部', onMore() {} });
  assert.equal(head.className, 'q-section-head q-shd');
  assert.ok(head.find('q-sh-count') && head.find('q-sh-more'));
  assert.equal(ui.sectionHead('x').find('q-sh-more'), null);

  const logo = ui.logoTile('a.png', { size: 32 });
  assert.equal(logo.className, 'q-logo');
  assert.equal(logo.style.props['--s'], '32px');
  assert.equal(ui.logoTile('', { size: 24, fallbackText: '蒙札' }).className, 'q-logo text');

  const m = ui.matchCard({ league: '義甲', when: '明天', sides: [{ name: 'A', score: 2 }, { name: 'B', score: 1 }], prices: [{ label: '主', odds: 2.18 }], live: true });
  assert.match(m.className, /q-match live/);
  assert.equal(m.find('q-match-mid').textContent, '2 : 1');
  assert.equal(ui.matchCard({ sides: [{ name: 'A' }, { name: 'B' }] }).find('q-match-mid').textContent, 'VS');
  assert.equal(ui.matchCard({ tag: { text: '', tone: 'orange' }, sides: [{ name: 'A' }, { name: 'B' }] }).find('q-tag'), null, 'a tag with no text is no capsule');

  assert.equal(ui.liveStrip([{ min: "45'", rows: [{ name: 'A', score: 1 }, { name: 'B', score: 0 }] }]).className, 'q-live-strip');
  const grid = ui.actionGrid([{ icon: 'live', tint: 'red', label: '場中', badge: 0 }, { icon: 'ticket', label: '彩券', badge: 3 }]);
  assert.equal(grid.className, 'q-actions-grid');
  assert.equal(grid.children[0].find('q-badge'), null, 'a badge of 0 is hidden');
  assert.ok(grid.children[1].find('q-badge'));

  const hero = ui.sheetHero({ eyebrow: 'e', big: 'NT$1', sub: 's', tint: 'green', tags: ['a'] });
  assert.ok(hero.find('q-sh-big') && hero.find('q-sh-row'));
  assert.equal(hero.style.props['--t'], 'green');

  const foot = ui.sheetFoot({ summary: { small: '餘額', big: 'NT$1' }, button: { label: '確認', disabled: true } });
  assert.equal(foot.className, 'q-sheet-foot q-sf');
  assert.ok(foot.find('q-sf-sum'));

  const balls = ui.ballRow([1, 2, null], { special: 7, hit: [2] });
  assert.equal(balls.children.length, 4);
  assert.match(balls.children[1].className, /hit/);
  assert.match(balls.children[2].className, /empty/);
  assert.match(balls.children[3].className, /sp/);

  assert.match(ui.placeTile('school').className, /q-tile.*q-place school/);
  assert.match(ui.placeTile('nope').className, /pin/);
  assert.ok(ui.stakeInput({ presets: [100, 500], value: 500 }).find('q-stake-presets'));
});

test('empty(): an icon name is a tile, anything else renders as before', () => {
  const named = ui.empty({ icon: 'ticket', title: 't' });
  assert.ok(named.find('q-empty-tile'));
  assert.equal(named.find('q-empty-icon'), null);
  const emoji = ui.empty({ icon: '🎫', title: 't' });
  assert.equal(emoji.find('q-empty-tile'), null);
  assert.equal(emoji.find('q-empty-icon').textContent, '🎫');
  assert.equal(ui.empty({ title: 't' }).find('q-empty-icon'), null);
});

test('ask/confirm: a named icon is a tile, an emoji keeps its old markup', () => {
  assert.match(orbitSrc, /Object\.hasOwn\(icons, icon\)/);
  assert.match(orbitSrc, /named \? ' pro' : ''/);
  assert.match(orbitSrc, /class: 'q-ask-icon', 'aria-hidden': 'true', text: icon/, 'the emoji branch is unchanged');
});
