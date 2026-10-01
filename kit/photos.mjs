// A person's photo, wherever one is: ESPN's headshot by their id or found by
// their name (ESPN's athlete search), the official picture first (drivers,
// tennis players, golfers, fighters, the US leagues' players), else their
// Wikipedia page's picture (table tennis, badminton, snooker and anyone ESPN
// has none of) when the page is about someone in that sport. Wikipedia is
// open to browsers (CORS), so not through the proxy; names asked for together
// go in one request, and the answers are kept on the device (a found photo
// two months, none a week).
// The kit's copy (Shared-Proxy/kit/photos.mjs), synced into Fixtures and Play
// as lib/photos.mjs: never edit an app's copy.
import { CATALOG } from './catalog.mjs';

const LEAGUES = CATALOG;

const CDN = 'https://a.espncdn.com/i/headshots';
// ESPN's headshot folders by league (racing: this season's, see freshHeadshot).
const ESPN_FOLDER = { f1: 'rpm', atp: 'tennis', wta: 'tennis', pga: 'golf', lpga: 'golf', ufc: 'mma', nba: 'nba', wnba: 'wnba', mlb: 'mlb', nfl: 'nfl', nhl: 'nhl' };
const SPORT_FOLDER = { racing: 'rpm', tennis: 'tennis', golf: 'golf', mma: 'mma', soccer: 'soccer' };
export function espnHeadshot(league, id) {
  if (!id || !/^\d+$/.test(String(id))) return null;
  const folder = ESPN_FOLDER[league] || (LEAGUES[league]?.data === 'espn' ? SPORT_FOLDER[LEAGUES[league]?.sport] : null);
  return folder ? `${CDN}/${folder}/players/full/${id}.png` : null;
}
// A picture that is a flag, not a face (ESPN's country flags, the kit's).
export const isFlag = url => typeof url === 'string' && /\/flags?\/|flagcdn|countries\/500|\/i\/teamlogos\/countries\//i.test(url);

// What a Wikipedia page's one-line description says of someone in the sport.
const SPORT_WORDS = {
  soccer: /football|soccer/i,
  basketball: /basketball/i,
  baseball: /baseball/i,
  football: /american football|football player|quarterback|linebacker/i,
  hockey: /ice hockey|hockey/i,
  racing: /racing driver|formula one|racer/i,
  tennis: /(?<!table )tennis/i,
  golf: /golf/i,
  mma: /martial art|ufc|fighter|wrestler|kickbox|boxer/i,
  boxing: /boxer|boxing/i,
  badminton: /badminton/i,
  tabletennis: /table tennis/i,
  snooker: /snooker|pool player|billiards/i,
  volleyball: /volleyball/i,
  cricket: /cricket/i,
  rugby: /rugby/i,
  darts: /darts/i,
  cycling: /cyclist|cycling/i
};
const sportOf = league => (league === 'boxing' ? 'boxing' : LEAGUES[league]?.sport || '');
const plain = s =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
// Whether a page is the person: their sport in its description, and every
// word of their name in its title ("Lin Yun-ju" for "Lin Yun Ju").
export function pageFits(page, name, sport) {
  if (!page?.thumbnail?.source) return false;
  const words = SPORT_WORDS[sport];
  if (words && !words.test(page.description || '')) return false;
  const title = ` ${plain(String(page.title || '').replace(/\s*\(.*\)$/, ''))} `;
  return plain(name)
    .split(' ')
    .filter(Boolean)
    .every(w => title.includes(` ${w} `));
}

// ---- The device's copy ----------------------------------------------------------------
const STORE = 'fx.pics.v1';
const FOUND_MS = 60 * 86_400_000;
const NONE_MS = 7 * 86_400_000;
let cache = null;
function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(STORE) || '{}') || {};
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
      localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(kept)));
    } catch {}
  }, 400);
}
const keyOf = (name, sport) => `${sport}|${plain(name)}`;
// What's known already: a URL, '' (looked, none), or undefined (not looked yet).
export const knownPhoto = (name, sport) => load()[keyOf(name, sport)]?.[0];

// ---- Wikipedia ----------------------------------------------------------------------
const API = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages|description&piprop=thumbnail&pithumbsize=240';
const pending = new Map(); // key → { name, sport, resolve[] }
const asked = new Map(); // key → Promise
let flushTimer = 0;
async function wiki(url) {
  const r = await fetch(url);
  return r.ok ? r.json() : null;
}
// Pages by the title asked for (following Wikipedia's spelling fixes and redirects).
function pagesByTitle(data) {
  const q = data?.query || {};
  const to = new Map();
  for (const n of q.normalized || []) to.set(n.from, n.to);
  for (const r of q.redirects || []) to.set(r.from, r.to);
  const byTitle = new Map(Object.values(q.pages || {}).map(p => [p.title, p]));
  return title => {
    let t = title;
    for (let i = 0; i < 3 && to.has(t); i++) t = to.get(t);
    return byTitle.get(t) || null;
  };
}
async function flush() {
  flushTimer = 0;
  const batch = [...pending.values()].slice(0, 40);
  for (const b of batch) pending.delete(b.key);
  if (pending.size) flushTimer = setTimeout(flush, 50);
  if (!batch.length) return;
  let find = () => null;
  try {
    find = pagesByTitle(await wiki(`${API}&titles=${encodeURIComponent(batch.map(b => b.name).join('|'))}`));
  } catch {}
  for (const b of batch) {
    const page = find(b.name);
    if (pageFits(page, b.name, b.sport)) b.done(page.thumbnail.source);
    else searchOne(b);
  }
}
// Not under that title: Wikipedia's search, the name and the sport (two at a time).
const searches = [];
let searching = 0;
function searchOne(b) {
  searches.push(b);
  pump();
}
function pump() {
  while (searching < 2 && searches.length) {
    const b = searches.shift();
    searching++;
    const word = { tabletennis: 'table tennis', mma: 'fighter', racing: 'racing driver', soccer: 'footballer' }[b.sport] || b.sport;
    wiki(`${API}&generator=search&gsrlimit=3&gsrsearch=${encodeURIComponent(`${b.name} ${word}`)}`)
      .then(d => Object.values(d?.query?.pages || {}).sort((x, y) => (x.index || 0) - (y.index || 0)).find(p => pageFits(p, b.name, b.sport)))
      .then(p => b.done(p?.thumbnail?.source || ''))
      .catch(() => b.done('', true))
      .finally(() => {
        searching--;
        pump();
      });
  }
}
// ---- ESPN's own headshots, found by name ------------------------------------------------
// ESPN's athlete search (open to browsers): the person's ESPN id in their
// sport, and so their official headshot, for players the feed didn't give an
// id for (Kambi's tennis, a draw's names). Checked to exist before it's used.
const ESPN_SEARCH = 'https://site.web.api.espn.com/apis/common/v3/search?type=player&limit=6&query=';
const SEARCH_SPORT = { tennis: 'tennis', golf: 'golf', mma: 'mma', racing: 'racing', soccer: 'soccer', basketball: 'basketball', baseball: 'baseball', football: 'football', hockey: 'hockey' };
const HEADSHOT_FOLDER = { tennis: 'tennis', golf: 'golf', mma: 'mma', racing: 'rpm', soccer: 'soccer', basketball: 'nba', baseball: 'mlb', football: 'nfl', hockey: 'nhl' };
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
async function espnSearchPhoto(name, sport) {
  if (!SEARCH_SPORT[sport]) return '';
  try {
    const r = await fetch(ESPN_SEARCH + encodeURIComponent(name));
    if (!r.ok) return '';
    const items = (await r.json())?.items || [];
    const want = plain(name);
    const hit = items.find(i => i.type === 'player' && i.sport === SEARCH_SPORT[sport] && plain(i.displayName) === want);
    if (!hit?.id) return '';
    const folder = sport === 'basketball' && hit.league === 'wnba' ? 'wnba' : HEADSHOT_FOLDER[sport];
    const url = `${CDN}/${folder}/players/full/${hit.id}.png`;
    return (await loads(url)) ? url : '';
  } catch {
    return '';
  }
}

// A person's photo by name (a promise of a URL, or '' for none): ESPN's
// official headshot if it has one, else their Wikipedia page's picture.
export function wikiPhoto(name, league) {
  const sport = sportOf(league);
  const n = String(name || '').trim();
  if (!n || /[㐀-鿿]/.test(n) || /\//.test(n)) return Promise.resolve('');
  const key = keyOf(n, sport);
  const known = load()[key];
  if (known) return Promise.resolve(known[0]);
  if (!asked.has(key)) {
    asked.set(
      key,
      new Promise(resolve => {
        const ask = () => {
          pending.set(key, {
            key,
            name: n,
            sport,
            // A failed request isn't remembered (asked again next time).
            done: (url, failed) => {
              if (!failed) remember(key, url);
              resolve(url || '');
            }
          });
          if (!flushTimer) flushTimer = setTimeout(flush, 60);
        };
        espnSearchPhoto(n, sport).then(url => (url ? (remember(key, url), resolve(url)) : ask()));
      })
    );
  }
  return asked.get(key);
}
