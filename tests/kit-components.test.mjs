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
  const classes = ['q-shd', 'q-sh-count', 'q-sh-more', 'q-logo', 'q-match', 'q-match-top', 'q-match-teams', 'q-match-side', 'q-match-mid', 'q-live-strip', 'q-live-card', 'q-live-min', 'q-actions-grid', 'q-action', 'q-sheet-hero', 'q-sh-eyebrow', 'q-sh-big', 'q-sh-sub', 'q-sh-row', 'q-sf', 'q-sf-sum', 'pro', 'q-empty-tile', 'q-stake', 'q-stake-amt', 'q-stake-presets', 'q-balls', 'q-ball', 'q-place'];
  for (const c of classes) assert.match(css, new RegExp(`\\.${c}(?![\\w-])`), `.${c}`);
  assert.match(css, /\.q-section-head button:not\(\.q-tag\)/, 'the old head button rule keeps :not(.q-tag)');
  assert.match(rawCss, /Premium components \(round 3\)/);
  assert.match(css, /@keyframes q-pulse/);
});

test('the new CSS adds no hex colours except white, the logo tile and the place tiles', () => {
  const mine = css.slice(css.indexOf('--q-logo-bg: #ffffff'));
  const hexes = [...mine.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0].toLowerCase());
  // (#0b1020: the heroes' deep ink, the page hero's and the sheet hero's alike.)
  const allowed = new Set(['#fff', '#ffffff', '#000', '#ff9500', '#6155f5', '#0a84ff', '#ff383c', '#f5b301', '#0b1020']);
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

  const m = ui.matchCard({ league: '義甲', when: '明天', sides: [{ name: 'A', score: 2 }, { name: 'B', score: 1 }], live: true });
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

// waiting(): a part still being read, held in the shape that's coming (Jay
// 2026-11-03: 預計先發 came in last and pushed the game's page down).
test('waiting(): words turn to bars where they sit, empty boxes and pictures shimmer in their own shape, the kept title stays', () => {
  class Text {
    constructor(data) {
      this.nodeType = 3;
      this.data = data;
    }
    replaceWith(n) {
      const kids = this.parentNode.childNodes;
      kids[kids.indexOf(this)] = n;
      n.parentNode = this.parentNode;
    }
  }
  const doc = { createElement: tag => new El(tag) };
  class El {
    constructor(tag, cls = '', kids = []) {
      this.nodeType = 1;
      this.tagName = tag.toUpperCase();
      this.ownerDocument = doc;
      this.attrs = {};
      this.childNodes = [];
      this.set = new Set(cls.split(' ').filter(Boolean));
      this.classList = { add: c => this.set.add(c), contains: c => this.set.has(c) };
      for (const k of kids) this.append(typeof k === 'string' ? new Text(k) : k);
    }
    append(n) {
      n.parentNode = this;
      this.childNodes.push(n);
    }
    set className(v) {
      this.set = new Set(v.split(' '));
    }
    set textContent(v) {
      this.childNodes = [];
      this.append(new Text(v));
    }
    matches(sel) {
      return sel.split(',').some(s => this.set.has(s.trim().replace(/^\./, '')));
    }
    querySelectorAll() {
      return [];
    }
    setAttribute(k, v) {
      this.attrs[k] = v;
    }
  }
  const title = new El('span', 'head', ['先發陣容']);
  const name = new El('strong', '', ['口口口口']);
  const face = new El('span', 'face');
  const pic = new El('img');
  const row = new El('li', '', [face, pic, name, ' ']);
  const card = new El('div', 'card', [title, row]);
  assert.equal(ui.waiting(card, { keep: '.head' }), card);
  assert.ok(card.set.has('q-wait') && card.attrs['aria-busy'] === 'true' && card.inert === true);
  assert.equal(title.childNodes[0].nodeType, 3, 'the title kept as it is');
  assert.ok(face.set.has('q-wait-bit') && pic.set.has('q-wait-bit'), 'an empty box and a picture: their own shape');
  const bar = name.childNodes[0];
  assert.ok(bar.set.has('q-wait-bit') && bar.tagName === 'SPAN' && bar.childNodes[0].data === '口口口口', 'words: a bar of their own width');
  assert.equal(row.childNodes[3].nodeType, 3, 'a bare space is left alone');
  assert.ok(!name.set.has('q-wait-bit') && !row.set.has('q-wait-bit'));
  // (Again: nothing marked twice, a bar never wrapped in another.)
  ui.waiting(card, { keep: '.head' });
  assert.equal(name.childNodes[0], bar);
  assert.equal(bar.childNodes[0].nodeType, 3);
  assert.equal(ui.waiting(null), null);
  // The look: the kit's shimmer, words rounded, a face its own round; still under reduced motion.
  assert.match(rawCss, /\.q-wait \.q-wait-bit \{[^}]*q-shimmer/);
  assert.match(rawCss, /\.q-wait \.q-wait-bit:not\(:empty\) \{\s*border-radius: 6px;/);
  assert.match(rawCss, /\.q-skel,\s*\.q-wait \.q-wait-bit \{\s*animation: none;/);
  // (Words put in later, a name fitted once on the page: watched and turned to bars too.)
  assert.match(readFileSync(new URL('../kit/ui.mjs', import.meta.url), 'utf8'), /new MutationObserver\(\(\) => mark\(shape\)\)/);
});
