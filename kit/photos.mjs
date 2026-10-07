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
import * as kit from '#kit/quadra.mjs';

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
export const isCutout = url => typeof url === 'string' && /thesportsdb\.com\/images\/media\/player\/cutout\/|images\.fotmob\.com\/image_resources\/playerimages\/|resources\.premierleague\.com\/premierleague\d*\/photos\/players\/|assets\.laliga\.com\/squad\/|assets\.bundesliga\.com\/player\/|media-sdp\.legaseriea\.it|ligue1\.image\/players\//.test(url);

const sportOf = league => CATALOG[league]?.sport || league || '';
const plain = s =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // The letters NFKD doesn't take apart (Rønnow, ESPN's Ronnow).
    .replace(/[øœæßđðłıþ]/g, c => ({ ø: 'o', œ: 'oe', æ: 'ae', ß: 'ss', đ: 'd', ð: 'd', ł: 'l', ı: 'i', þ: 'th' })[c])
    .replace(/\b(jr|sr|ii|iii)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// ---- A league's own photos -----------------------------------------------------------
// ESPN's headshots can be a season old (a player traded in the summer still in
// his old team's shirt), and it has none for footballers; a league's own site
// has this season's, a studio half-body. Its players come from the nightly
// packs (Shared-Data's sports/<league>/photos.json), read once: NBA.com's and
// the Premier League's as [name, id, 'o'?] ('o' a photo on the league's older
// path); LaLiga's, the Bundesliga's, Serie A's and Ligue 1's as [name, url].
// A player found there gets that photo first.
const OWN_PHOTO = {
  nba: id => `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`,
  epl: (id, old) => (old ? `https://resources.premierleague.com/premierleague/photos/players/250x250/p${id}.png` : `https://resources.premierleague.com/premierleague25/photos/players/110x140/${id}.png`)
};
// Football's lists, each looked in for any footballer (a cup's players are
// its clubs' leagues'; a player who moved this summer is under his new one).
const SOCCER_OWN = ['epl', 'laliga', 'bundesliga', 'seriea', 'ligue1'];
const ownLists = {};
function ownList(league) {
  if (!ownLists[league]) {
    ownLists[league] = { map: null, ready: null };
    ownLists[league].ready = (kit.packJson?.(`sports/${league}/photos.json`, { ttl: 12 * 3_600_000 }) || Promise.resolve(null))
      .then(d => (ownLists[league].map = new Map((d?.players || []).map(([n, id, where]) => [plain(n), /^https:/.test(String(id)) ? String(id) : OWN_PHOTO[league]?.(id, where === 'o')]).filter(([, url]) => url))))
      // A failed read: asked again when a player is next drawn.
      .catch(() => void delete ownLists[league]);
  }
  return ownLists[league];
}
const ownFor = league => (OWN_PHOTO[league] && league !== 'epl' ? [league] : sportOf(league) === 'soccer' ? [...new Set([league, ...SOCCER_OWN].filter(l => SOCCER_OWN.includes(l)))] : []);
if (typeof window !== 'undefined') ownList('nba');
// The lists a player's league looks in, read (a promise when one isn't yet).
function ownReady(league) {
  const lists = ownFor(league).map(ownList);
  return lists.every(l => l.map) ? null : Promise.all(lists.map(l => l.ready));
}
export function ownPhoto(name, league) {
  if (!name) return null;
  const k = plain(name);
  // A two-word name the other way round too (ESPN's Kim Min-Jae is the Bundesliga's Min-Jae Kim).
  const w = k.split(' ');
  const keys = w.length === 3 && /^[a-z]+$/.test(w[0]) ? [k, `${w[1]} ${w[2]} ${w[0]}`] : w.length === 2 ? [k, `${w[1]} ${w[0]}`] : [k];
  for (const key of keys)
    for (const l of ownFor(league)) {
      const url = ownList(l).map?.get(key);
      if (url) return url;
    }
  return null;
}

// Every football league's and cup's faces, from FotMob (Shared-Data's
// sports/<league>/faces.json, [[name, id]…]: each club's squad now, a studio
// cutout each): after the league's own photo, before a search by name. A
// league's list is read the first time one of its players is drawn (not all
// of them up front: there are twenty), so faceFor waits for it.
const FACE = id => `https://images.fotmob.com/image_resources/playerimages/${id}.png`;
const faceLists = {};
function faceList(league) {
  if (sportOf(league) !== 'soccer') return null;
  if (!faceLists[league]) {
    faceLists[league] = { map: null, ready: null };
    faceLists[league].ready = (kit.packJson?.(`sports/${league}/faces.json`, { ttl: 12 * 3_600_000 }) || Promise.resolve(null))
      .then(d => (faceLists[league].map = new Map((d?.players || []).map(([n, id]) => [plain(n), id]))))
      // A failed read isn't "no faces": read again when a player is next drawn.
      .catch(() => void delete faceLists[league]);
  }
  return faceLists[league];
}
const faceIn = (list, name) => {
  const id = name && list?.map?.get(plain(name));
  return id ? FACE(id) : null;
};
export const facePhoto = (name, league) => faceIn(name && faceList(league), name);
export async function faceFor(name, league) {
  const list = name && faceList(league);
  if (!list) return null;
  await list.ready;
  return faceIn(list, name);
}

// ---- The device's copy ----------------------------------------------------------------
// v3: v2 kept "none" for a lookup that had failed (TheSportsDB's limit hit
// while browsing): those players stayed faceless for a week. v1 held
// Wikipedia's pictures, which aren't kept any more.
const STORE = 'fx.pics.v3';
const FOUND_MS = 60 * 86_400_000;
const NONE_MS = 7 * 86_400_000;
let cache = null;
function load() {
  if (cache) return cache;
  try {
    globalThis.localStorage?.removeItem('fx.pics.v1');
    globalThis.localStorage?.removeItem('fx.pics.v2');
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
  // (A failed search throws: findPhoto keeps nothing, and asks again later.)
  const items = (await fetchJson(ESPN_SEARCH + encodeURIComponent(name)))?.items || [];
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
// Its free key takes about 30 searches a minute: they go one at a time, 2.1 s
// apart, so a roster opened (or a few teams flicked through) never hits the
// limit; one that does pauses the queue a minute. A failed search throws.
// (Exported so the tests can run it without the waits.)
export const TSDB_PACE = { gap: 2100, pause: 60_000 };
let tsdbQueue = Promise.resolve();
let tsdbNext = 0;
const tsdbTurn = () => {
  const turn = tsdbQueue.then(async () => {
    const wait = tsdbNext - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    tsdbNext = Date.now() + TSDB_PACE.gap;
  });
  tsdbQueue = turn.catch(() => {});
  return turn;
};
export async function tsdbCutout(name, sport, fetchJson = defaultJson, { paced = fetchJson === defaultJson } = {}) {
  if (!TSDB_SPORT[sport]) return '';
  if (paced) await tsdbTurn();
  let data;
  try {
    data = await fetchJson(TSDB_SEARCH + encodeURIComponent(name));
  } catch (error) {
    if (paced && /^429$/.test(error?.message)) tsdbNext = Date.now() + TSDB_PACE.pause;
    throw error;
  }
  const list = data?.player || [];
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
          // A failed request isn't remembered: asked again the next time the
          // face is drawn (not only next session).
          asked.delete(key);
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
export function personPhoto(name, league, opts) {
  const { urls = [], guess = null, cls = '', fallback, waited = false } = opts;
  // The league's faces still being read (the first of its players drawn
  // this session): its stand-in until they are, then the picture.
  const faces = name && !waited ? faceList(league) : null;
  const own = name && !waited ? ownReady(league) : null;
  if ((faces && !faces.map) || own) {
    const stand = fallback();
    const swap = (tries = 0) => (stand.isConnected ? stand.replaceWith(personPhoto(name, league, { ...opts, waited: true })) : tries < 20 && requestAnimationFrame(() => swap(tries + 1)));
    Promise.all([faces?.ready, own]).then(() => swap(), () => swap());
    return stand;
  }
  const known = knownPhoto(name, sportOf(league));
  const guessed = smallPhoto(guess);
  const face = facePhoto(name, league);
  // The league's own studio photo, the feed's, one found before, ESPN's by id;
  // FotMob's face (a head in a circle, not the half-body the rest are) last.
  const list = [...new Set([ownPhoto(name, league), ...urls, known, guess, face].map(smallPhoto).filter(Boolean))];
  const found = url => logoPicture(url, null, `${cls} photo${isCutout(url) ? ' cutout' : ''}`, () => fallback());
  const search = stand => {
    if (known === undefined && name)
      findPhoto(name, league).then(url => {
        if (url && stand.isConnected) stand.replaceWith(found(url));
      });
  };
  const last = () => {
    const stand = fallback();
    // The league's faces not read yet: once they are, theirs (a search only without one).
    if (face || !faceList(league)?.ready || faceList(league).map) search(stand);
    else
      faceFor(name, league).then(url => {
        if (!url || list.includes(url)) return search(stand);
        if (!stand.isConnected) return;
        const pic = logoPicture(url, null, `${cls} photo cutout`, () => {
          const again = fallback();
          search(again);
          return again;
        });
        stand.replaceWith(pic);
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
