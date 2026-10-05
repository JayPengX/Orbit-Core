// A person's photo: only the kind sports apps show, a studio headshot. ESPN's
// official headshot by the feed's id, or found by their name (ESPN's athlete
// search), else TheSportsDB's cutout (a headshot on a clear background) for
// the leagues ESPN doesn't cover (Asian baseball, K League, EuroLeague). Never a page's casual picture: no face is better than a wrong
// one. Both sources are open to browsers (CORS), so not through the proxy;
// answers are kept on the device (a found photo two months, none a week).
// The kit's copy (Shared-Proxy/kit/photos.mjs), synced into Orbit Sports and Play
// as lib/photos.mjs: never edit an app's copy.
import { CATALOG } from '#kit/catalog.mjs';
import { logoPicture, f1Driver, f1Constructor } from '#kit/logos.mjs';

const CDN = 'https://a.espncdn.com/i/headshots';
// ESPN's headshot at the size a phone shows it (its image service: a full
// one is about 250 KB, this about 25 KB). Any other picture as it is.
export const smallPhoto = url => (typeof url === 'string' && url.startsWith(`${CDN}/`) ? `https://a.espncdn.com/combiner/i?img=${url.slice('https://a.espncdn.com'.length)}&w=256` : url);
// ESPN's headshot folders by league (racing: this season's, see freshHeadshot).
const ESPN_FOLDER = { f1: 'rpm', nba: 'nba', wnba: 'wnba', mlb: 'mlb', nfl: 'nfl', nhl: 'nhl' };
export function espnHeadshot(league, id) {
  if (!id || !/^\d+$/.test(String(id))) return null;
  const folder = ESPN_FOLDER[league] || (CATALOG[league]?.data === 'espn' && CATALOG[league]?.sport === 'soccer' ? 'soccer' : null);
  return folder ? `${CDN}/${folder}/players/full/${id}.png` : null;
}
// A picture that is a flag, not a face (ESPN's country flags, the kit's).
export const isFlag = url => typeof url === 'string' && /\/flags?\/|flagcdn|countries\/500|\/i\/teamlogos\/countries\//i.test(url);
// A studio cutout (transparent background): shown on a tinted disc.
export const isCutout = url => typeof url === 'string' && /thesportsdb\.com\/images\/media\/player\/cutout\//.test(url);

const sportOf = league => CATALOG[league]?.sport || league || '';
const plain = s =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// ---- The device's copy ----------------------------------------------------------------
// v2: v1 held Wikipedia's pictures, which aren't kept any more.
const STORE = 'fx.pics.v2';
const FOUND_MS = 60 * 86_400_000;
const NONE_MS = 7 * 86_400_000;
let cache = null;
function load() {
  if (cache) return cache;
  try {
    globalThis.localStorage?.removeItem('fx.pics.v1');
    cache = JSON.parse(globalThis.localStorage?.getItem(STORE) || '{}') || {};
  } catch {
    cache = {};
  }
  const now = Date.now();
  for (const [k, [url, t]] of Object.entries(cache)) if (now - t > (url ? FOUND_MS : NONE_MS)) delete cache[k];
  return cache;
}
let saveTimer = 0;
function remember(key, url) {
  load()[key] = [url || '', Date.now()];
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      // The newest 1500 kept.
      const kept = Object.entries(cache).sort((a, b) => b[1][1] - a[1][1]).slice(0, 1500);
      globalThis.localStorage?.setItem(STORE, JSON.stringify(Object.fromEntries(kept)));
    } catch {}
  }, 400);
}
const keyOf = (name, sport) => `${sport}|${plain(name)}`;
// What's known already: a URL, '' (looked, none), or undefined (not looked yet).
export const knownPhoto = (name, sport) => load()[keyOf(name, sport)]?.[0];

const loads = url =>
  new Promise(resolve => {
    if (typeof Image === 'undefined') return resolve(false);
    const img = new Image();
    const done = ok => ((img.onload = img.onerror = null), resolve(ok));
    img.onload = () => done(img.naturalWidth > 8);
    img.onerror = () => done(false);
    setTimeout(() => done(false), 5000);
    img.src = url;
  });

// ---- ESPN's own headshots, found by name ------------------------------------------------
// ESPN's athlete search: the person's ESPN id in their sport, and so their
// official headshot, for players the feed didn't give an id for. Checked to
// exist before it's used.
const ESPN_SEARCH = 'https://site.web.api.espn.com/apis/common/v3/search?type=player&limit=6&query=';
const SEARCH_SPORT = { racing: 'racing', soccer: 'soccer', basketball: 'basketball', baseball: 'baseball', football: 'football', hockey: 'hockey' };
const HEADSHOT_FOLDER = { racing: 'rpm', soccer: 'soccer', basketball: 'nba', baseball: 'mlb', football: 'nfl', hockey: 'nhl' };
export async function espnSearchPhoto(name, sport, fetchJson = defaultJson, check = loads) {
  if (!SEARCH_SPORT[sport]) return '';
  const items = (await fetchJson(ESPN_SEARCH + encodeURIComponent(name)).catch(() => null))?.items || [];
  const want = plain(name);
  const hit = items.find(i => i.type === 'player' && i.sport === SEARCH_SPORT[sport] && plain(i.displayName) === want);
  if (!hit?.id) return '';
  const folder = sport === 'basketball' && hit.league === 'wnba' ? 'wnba' : HEADSHOT_FOLDER[sport];
  const url = smallPhoto(`${CDN}/${folder}/players/full/${hit.id}.png`);
  return (await check(url)) ? url : '';
}

// ---- TheSportsDB's cutouts ------------------------------------------------------------
// Its player search (free key, open to browsers): the player's cutout when
// their name and sport match. Its thumbnails are often casual pictures, so
// only the cutout counts.
const TSDB_SEARCH = 'https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=';
const TSDB_SPORT = { soccer: 'Soccer', baseball: 'Baseball', basketball: 'Basketball', football: 'American Football', hockey: 'Ice Hockey', racing: 'Motorsport' };
export async function tsdbCutout(name, sport, fetchJson = defaultJson) {
  if (!TSDB_SPORT[sport]) return '';
  const list = (await fetchJson(TSDB_SEARCH + encodeURIComponent(name)).catch(() => null))?.player || [];
  const want = plain(name);
  const hit = list.find(p => p.strSport === TSDB_SPORT[sport] && plain(p.strPlayer) === want && p.strCutout);
  return hit ? hit.strCutout : '';
}

async function defaultJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

// A person's photo by name (a promise of a URL, or '' for none): ESPN's
// official headshot, else TheSportsDB's cutout. Asked once a name.
const asked = new Map();
export function findPhoto(name, league) {
  const sport = sportOf(league);
  const n = String(name || '').trim();
  if (!n || /[㐀-鿿]/.test(n) || /\//.test(n)) return Promise.resolve('');
  const key = keyOf(n, sport);
  const known = load()[key];
  if (known) return Promise.resolve(known[0]);
  if (!asked.has(key)) {
    asked.set(
      key,
      (async () => {
        try {
          const url = (await espnSearchPhoto(n, sport)) || (await tsdbCutout(n, sport));
          remember(key, url);
          return url;
        } catch {
          // A failed request isn't remembered (asked again next time).
          return '';
        }
      })()
    );
  }
  return asked.get(key);
}

// ---- A person's picture on the page -------------------------------------------------------
// The same in every app (Orbit Sports' rosters and players, Play's players'
// markets): each of `urls` in turn (the feed's own pictures), then one found
// before on this device, then `guess` (ESPN's headshot by id: given up at
// its first miss, not retried, since many players have none). When all of
// them fail, `fallback()` (initials, a flag, a badge) stands in, and a search
// by name (findPhoto) puts the face in when it comes. Every try goes through
// logoPicture (retries, never a broken picture, drawn at once when seen
// before), so a redraw never makes a face blink or vanish.
export function personPhoto(name, league, { urls = [], guess = null, cls = '', fallback }) {
  const known = knownPhoto(name, sportOf(league));
  const guessed = smallPhoto(guess);
  const list = [...new Set([...urls, known, guess].map(smallPhoto).filter(Boolean))];
  const last = () => {
    const stand = fallback();
    if (known === undefined && name)
      findPhoto(name, league).then(url => {
        if (url && stand.isConnected) stand.replaceWith(logoPicture(url, null, `${cls} photo${isCutout(url) ? ' cutout' : ''}`, () => fallback()));
      });
    return stand;
  };
  const chain = i => (i >= list.length ? last() : logoPicture(list[i], null, `${cls}${isCutout(list[i]) ? ' photo cutout' : ''}`, () => chain(i + 1), { guess: list[i] === guessed }));
  return chain(0);
}

// ---- F1: a driver's face, a team's logo (every app the same) ---------------------
// A driver: their headshot (personPhoto's way: one found before, a search by
// name), their team's colour with their initials until then or when there's
// none. `cls` sizes it (the app's own class beside the kit's q-person).
const initialsOf = name => String(name || '').split(/\s+/).filter(w => w && !/^(jr|sr)\.?$/i.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const badgeEl = (cls, color, text) => {
  const b = document.createElement('span');
  b.className = cls;
  b.style.setProperty('--team', color);
  b.setAttribute('aria-hidden', 'true');
  b.textContent = text;
  return b;
};
export function driverPic(name, { cls = '', urls = [] } = {}) {
  const d = f1Driver(name);
  return personPhoto(name, 'f1', { urls, cls: `q-person q-driver ${cls}`.trim(), fallback: () => badgeEl(`q-person q-driver-badge ${cls}`.trim(), d.color, initialsOf(name)) });
}
// A team: formula1.com's white logo on the team's colour, its short name when
// the logo can't be had.
export function teamPic(name, { cls = '' } = {}) {
  const c = f1Constructor(name);
  const disc = badgeEl(`q-team-disc ${cls}`.trim(), c.color, '');
  if (c.logo) disc.append(logoPicture(c.logo, null, 'q-team-disc-img', () => document.createTextNode(c.short)));
  else disc.textContent = c.short;
  return disc;
}
