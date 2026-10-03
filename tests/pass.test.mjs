// The Quadra Pass sheet's numbers and guides (truth.mjs, help.mjs, pass.mjs),
// and the brand (brand.mjs): moved here from Quadra Hub, now Orbit Words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { PLAY, houseKeep, boostedKeep, freeBetWorth, roundTrip, plusMath, record, overdraftYear, vipShare } = await import('../kit/truth.mjs');
const { HELP, HELP_ORDER, parseHelpHash } = await import('../kit/help.mjs');
const kit = await import('#kit/quadra.mjs');
const brand = await import('../kit/brand.mjs');

test('truth: what the house keeps, what boosts and free bets are worth, what trading costs', () => {
  assert.equal(Math.round(houseKeep(1) * 1000), 136);
  assert.equal(Math.round(houseKeep(3) * 1000), 356);
  assert.ok(houseKeep(7) > 4 * houseKeep(1));
  // The boost gives back a little of the cut; Plus's a little more, never all of it.
  const plain = boostedKeep(3, 8);
  const plus = boostedKeep(3, 8, kit.PLUS.odds.boost);
  assert.ok(plus < plain && plain < houseKeep(3) && plus > 0.3);
  assert.equal(freeBetWorth(200), 86);
  assert.ok(freeBetWorth(200, PLAY.freeMinOdds) < freeBetWorth(200));
  assert.deepEqual(roundTrip(100_000), { fee: 284, tax: 300, total: 584, share: 0.00584 });
  assert.equal(roundTrip(100_000, true).fee, 2 * Math.floor(100_000 * 0.001425 * kit.PLUS.stock.commission));
  // The commission minimum still applies.
  assert.equal(roundTrip(1_000).fee, 40);
  const m = plusMath();
  assert.equal(m.fee, kit.PLUS.fee);
  assert.ok(m.betsWorth < m.betsFace && m.betsWorth < m.fee);
  assert.equal(m.tradesToBreakEven, Math.ceil(kit.PLUS.fee / m.savedPerTrade));
  assert.ok(overdraftYear() > 0.12 && overdraftYear() < 0.13);
  assert.ok(kit.VIP.tiers.every(t => vipShare(t) < 0.15));
});

test('truth: this account’s own record from the wallet', () => {
  const e = (app, kind, amount, extra = {}) => ({ id: `${app}:${kind}:${amount}`, t: 1, app, kind, amount, ...extra });
  const w = {
    entries: [
      e('eco', 'start', 30_000), e('eco', 'pay', 6_000), e('eco', 'plus', -490), e('eco', 'od', -120), e('eco', 'vip', 80),
      e('eco', 'freebet', 0, { note: '200' }), e('odds', 'stake', -1_000), e('odds', 'refund', 100), e('odds', 'payout', 450), e('odds', 'plusboost', 12),
      e('odds', 'lottery', -300), e('odds', 'prize', 100)
    ],
    snap: {}
  };
  const r = record(w);
  assert.deepEqual([r.staked, r.won, r.tickets, r.prizes, r.plusPaid, r.od, r.vip, r.freeBets], [900, 462, 300, 100, 490, 120, 80, 200]);
  assert.equal(Math.round(r.betBack * 100), 51);
  assert.equal(r.sides.given, 36_080);
  assert.equal(record({ entries: [] }).betBack, null);
});

test('help covers every app in both languages; every string exists in both', () => {
  for (const app of HELP_ORDER) {
    assert.ok(HELP[app].zh.length && HELP[app].zh.length === HELP[app].en.length, app);
    HELP[app].zh.forEach((s, i) => assert.equal(s[0], HELP[app].en[i][0]));
  }
  assert.deepEqual(parseHelpHash('#help=stock:orders'), { app: 'stock', topic: 'orders' });
  assert.equal(parseHelpHash('#words'), null);
});

test('the Pass sheet: every string in both languages; every tab named', async () => {
  const src = readFileSync(new URL('../kit/pass.mjs', import.meta.url), 'utf8');
  const { STRINGS } = await import('../kit/pass.mjs');
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.zh).sort());
  for (const tab of ['pass', 'plus', 'truth', 'apps', 'help']) assert.ok(STRINGS.zh[`tab_${tab}`] && STRINGS.en[`tab_${tab}`], tab);
  for (const key of new Set([...src.matchAll(/\bt\('([A-Za-z_]+)'/g)].map(m => m[1]))) assert.ok(key in STRINGS.zh, key);
  assert.doesNotMatch(JSON.stringify(STRINGS), /Quadra Hub|Fixtures/);
});

test('the brand: Quadra is where the money is, Orbit the everyday tools; ids never change', () => {
  const family = id => kit.APPS[id].family;
  assert.deepEqual(Object.keys(kit.APPS).filter(id => family(id) === 'quadra'), ['stock', 'odds']);
  assert.deepEqual(Object.keys(kit.APPS).filter(id => family(id) === 'orbit').sort(), ['match', 'orbit', 'transit', 'vocab', 'weather']);
  assert.equal(kit.APPS.match.name, 'Orbit Sports');
  assert.equal(kit.APPS.vocab.name, 'Orbit Words');
  assert.ok(Object.values(kit.APPS).every(a => a.related === (a.family === 'orbit')));
  // Until the repos are renamed, links go where the apps are.
  assert.equal(kit.APPS.match.path, brand.RENAMED ? '/Orbit-Sports/' : '/Quadra-Fixtures/');
  assert.equal(kit.APPS.vocab.path, brand.RENAMED ? '/Orbit-Words/' : '/Quadra-Hub/');
  for (const id of [...Object.keys(kit.APPS), 'pass']) for (const shape of ['rounded', 'square', 'maskable']) assert.match(brand.appIcon(id, { shape }), /^<svg [^>]*viewBox="0 0 512 512"/);
  assert.match(kit.helpUrl('stock', 'orders'), /^\/Quadra-Securities\/#help=stock:orders$/);
});

test('the family page (site/index.html) links where the kit does: regenerate it after a rename', () => {
  const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const links = [...page.matchAll(/class="app" href="([^"]+)"/g)].map(m => m[1]).sort();
  assert.deepEqual(links, Object.values(kit.APPS).map(a => a.path).sort());
});
