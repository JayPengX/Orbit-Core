// Players' photo lists, for the kit's photos.mjs: each football league's own
// studio photos (builders/official-photos.js; the Premier League's here),
// FotMob's faces for the rest, TheSportsDB's cutouts for whoever's left. Built
// by the proxy (builders/run.js) into the family's data (R2). Was part of
// Shared-Data's mirror.mjs and cutouts.mjs.
//
// Lean: squads change with transfers, so each day's run refreshes a few
// lists in turn (every list about weekly), not every list every night;
// ESPN's squads (for matching names club by club) come through the data
// proxy's route and its cache; cutouts are looked up a few each hour at
// TheSportsDB's pace. A list that can't be read keeps the last one.
// NBA.com refuses servers (GitHub's, Cloudflare's): its list stays as it is
// (the owner's call, 2026-10-13).
//
// → sports/<league>/photos.json ({ built, players: [[name, url]…] }),
// sports/<league>/faces.json ({ built, players: [[name, id]…] }),
// sports/cutouts/photos.json ({ built, players, none }) and
// sports/cutouts/pending.json ({ built, names }).

import { CATALOG } from '../kit/catalog.mjs';
import { OFFICIAL, photoList, clubFits, nameKey, CUTOUT_LEAGUES, pendingNames, cutouts } from './official-photos.js';
import { within } from './within.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';

// The Premier League's own photos (ESPN has none for footballers: its soccer
// headshots answer 404). The league's API lists this season's players with
// their Opta ids; a photo is on its current path, or its older one ('o').
// Each player under every name ESPN may use (the display name, first and
// last, with the middle name too), so the kit finds them by ESPN's.
const PL_API = 'https://footballapi.pulselive.com/football';
const PL_HEADERS = { Origin: 'https://www.premierleague.com', Referer: 'https://www.premierleague.com/', 'User-Agent': 'Mozilla/5.0 (orbit-mirror)' };
export const PL_PHOTO = (id, old) => (old ? `https://resources.premierleague.com/premierleague/photos/players/250x250/p${id}.png` : `https://resources.premierleague.com/premierleague25/photos/players/110x140/${id}.png`);
export function plNames(list, clubs = new Set()) {
  const out = [];
  for (const x of list || []) {
    const id = String(x?.altIds?.opta || '').replace(/^p/, '');
    const n = x?.name || {};
    if (!/^\d+$/.test(id) || /trialist/i.test(n.display || '')) continue;
    const full = [n.first, n.last].filter(Boolean).join(' ').trim();
    const words = full.split(/\s+/);
    const names = new Set([n.display, full, [n.first, n.middle, n.last].filter(Boolean).join(' '), words.length > 2 ? `${words[0]} ${words.at(-1)}` : ''].map(v => String(v || '').trim()).filter(Boolean));
    const here = clubs.has(x?.currentTeam?.name);
    for (const name of names) out.push([name, Number(id), here]);
  }
  // A name two players share: the one at a club in the league this season
  // (the list keeps players who've left); still two ("Gabriel"), neither: no
  // face is better than a wrong one.
  const ids = new Map();
  for (const [name, id, here] of out) {
    const k = name.toLowerCase();
    if (!ids.has(k)) ids.set(k, { all: new Set(), here: new Set() });
    ids.get(k).all.add(id);
    if (here) ids.get(k).here.add(id);
  }
  const pick = k => (ids.get(k).all.size === 1 ? [...ids.get(k).all][0] : ids.get(k).here.size === 1 ? [...ids.get(k).here][0] : null);
  const seen = new Set();
  return out.filter(([name, id]) => pick(name.toLowerCase()) === id && !seen.has(`${name}|${id}`) && seen.add(`${name}|${id}`)).map(([name, id]) => [name, id]);
}
async function plJson(path) {
  return within(30_000, async signal => {
    const res = await fetch(`${PL_API}${path}`, { headers: PL_HEADERS, signal });
    return res.ok ? res.json() : null;
  }).catch(() => null);
}
// The Premier League's list ([[name, id, 'o'?]…]), or null when it can't be read whole.
export async function plPhotos() {
  const season = (await plJson('/competitions/1/compseasons?page=0&pageSize=1'))?.content?.[0]?.id;
  if (!season) return null;
  // Each club's squad this season (the league's paged list of players stops short of its own count).
  const teams = (await plJson(`/teams?pageSize=40&compSeasons=${season}&comps=1&page=0`))?.content || [];
  if (teams.length < 18) return null;
  const squads = await Promise.all(teams.map(t => plJson(`/teams/${Number(t.id)}/compseasons/${season}/staff?pageSize=100&altIds=true&type=player`)));
  if (squads.some(x => !x?.players)) return null;
  const all = squads.flatMap((x, i) => x.players.map(p => ({ ...p, currentTeam: { name: teams[i].name } })));
  const named = plNames(all, new Set(teams.map(t => t.name)));
  const ids = [...new Set(named.map(([, id]) => id))];
  const status = async u => (await within(15_000, signal => fetch(u, { method: 'HEAD', signal })).catch(() => null))?.status || 0;
  // Which path has each photo: 'n' (current), 'o' (older), '' none; a failed read (0) keeps the current.
  const where = new Map();
  let next = 0;
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        const now = await status(PL_PHOTO(id));
        where.set(id, now === 200 || now === 0 ? 'n' : (await status(PL_PHOTO(id, true))) === 200 ? 'o' : '');
      }
    })
  );
  const players = named.filter(([, id]) => where.get(id)).map(([name, id]) => (where.get(id) === 'o' ? [name, id, 'o'] : [name, id]));
  return ids.length < 400 ? null : players;
}

// Every other football league's and cup's photos, from FotMob (the leagues'
// own sites have no list to read, and ESPN none for footballers): each club's
// squad as FotMob has it now, a studio cutout per player at FotMob's id.
// → sports/<league>/faces.json ([[name, id]…]). Gently: three at a time with
// a pause between, and on FotMob's "too many" a minute's wait, a second one
// stops it asking; a list it couldn't make keeps the last one.
export const FOTMOB = 'https://www.fotmob.com/api/data';
// Orbit's leagues → FotMob's (the Nations League's A to D; a key in place
// of an id: a cup made of those leagues' clubs).
export const FOTMOB_LEAGUES = {
  epl: [47], laliga: [87], seriea: [55], bundesliga: [54], ligue1: [53], scotland: [64], mls: [130],
  ucl: [42], uel: [73], uecl: [10216], championship: [48], eredivisie: [57], ligamx: [230],
  brasileirao: [268], jleague: [223], kleague: [9080], worldcup: [77], nationsleague: [9806, 9807, 9808, 9809],
  facup: [132]
};
export const FOTMOB_PACE = { at: 3, gap: 400, wait: 60_000 };
// The teams in a league's tables (this season's), or, a cup without one yet, its games'.
export function fotmobTeams(league) {
  const found = new Map();
  const rows = x => {
    if (Array.isArray(x)) return x.forEach(rows);
    if (!x || typeof x !== 'object') return;
    if (x.id && x.name && 'played' in x) found.set(Number(x.id), x.name);
    else Object.values(x).forEach(rows);
  };
  rows(league?.table);
  if (!found.size)
    for (const m of league?.fixtures?.allMatches || []) for (const t of [m.home, m.away]) if (t?.id && t.name) found.set(Number(t.id), t.name);
  return found;
}
// As the kit's photos.mjs compares names.
export const faceKey = n =>
  String(n || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[øœæßđðłıþ]/g, c => ({ ø: 'o', œ: 'oe', æ: 'ae', ß: 'ss', đ: 'd', ð: 'd', ł: 'l', ı: 'i', þ: 'th' })[c])
    .replace(/\b(jr|sr|ii|iii)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
// A squad's players (no coach) under each name ESPN may use: FotMob's, with
// its apostrophes and hyphens dropped (N'Dicka, ESPN's Ndicka), the first
// and last of a longer one, a two-word one turned round (FotMob's Woo-yeong
// Jeong, ESPN's Jeong Woo-Yeong). A name two players share: neither (no face is
// better than a wrong one).
export function fotmobNames(squads) {
  const out = [];
  for (const squad of squads)
    for (const g of squad?.squad || [])
      if (g.title !== 'coach')
        for (const m of g.members || []) {
          const id = Number(m?.id);
          const name = String(m?.name || '').trim();
          if (!id || !name) continue;
          const words = name.split(/\s+/);
          const variants = [name, name.replace(/['’‘`-]/g, ''), words.length > 2 ? `${words[0]} ${words.at(-1)}` : '', words.length === 2 ? `${words[1]} ${words[0]}` : ''];
          for (const v of new Set(variants)) if (v) out.push([v, id]);
        }
  const key = faceKey;
  const ids = new Map();
  for (const [name, id] of out) ids.set(key(name), (ids.get(key(name)) || new Set()).add(id));
  const seen = new Set();
  return out.filter(([name, id]) => ids.get(key(name)).size === 1 && !seen.has(key(name)) && seen.add(key(name)));
}
// A player ESPN names otherwise (Pio Esposito, FotMob's Francesco Pio
// Esposito; Matt, Matthew; Bremer, Gleison Bremer; Laurtaro, Lautaro): looked
// for in their own club only (the FotMob squad sharing most names with ESPN's),
// among the players not matched by name, and taken only when one alone fits.
const editsApart = (a, b) => {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
};
export function sameNameish(a, b) {
  const A = a.split(' ');
  const B = b.split(' ');
  if (A.length === 1 || B.length === 1) {
    const [one, many] = A.length === 1 ? [A[0], B] : [B[0], A];
    return one.length >= 4 && many.length > 1 && many.includes(one);
  }
  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  if (short.every(w => long.includes(w))) return true;
  if (A.at(-1) === B.at(-1) && Math.min(A[0].length, B[0].length) >= 3 && (A[0].startsWith(B[0]) || B[0].startsWith(A[0]))) return true;
  return Math.min(a.length, b.length) >= 8 && editsApart(a, b) <= 2;
}
export function clubMatches(squads, clubs) {
  const people = squads.map(sq => (sq?.squad || []).filter(g => g.title !== 'coach').flatMap(g => g.members || []).filter(m => m?.id && m?.name).map(m => ({ id: Number(m.id), k: faceKey(m.name) })));
  const found = [];
  for (const names of clubs) {
    const espn = names.map(name => ({ name, k: faceKey(name) }));
    const keys = new Set(espn.map(x => x.k));
    let club = null;
    let most = 2;
    for (const c of people) {
      const n = c.filter(p => keys.has(p.k)).length;
      if (n > most) [club, most] = [c, n];
    }
    if (!club) continue;
    const named = new Set(club.map(p => p.k));
    const left = club.filter(p => !keys.has(p.k));
    for (const x of espn) {
      if (named.has(x.k)) continue;
      const fits = left.filter(p => sameNameish(x.k, p.k));
      if (fits.length === 1) found.push([x.name, fits[0].id]);
    }
  }
  // One FotMob player two ESPN names fit: neither.
  const count = new Map();
  for (const [, id] of found) count.set(id, (count.get(id) || 0) + 1);
  return found.filter(([, id]) => count.get(id) === 1);
}
export function fotmobReader(fetchJson, pace = FOTMOB_PACE, sleep = ms => new Promise(r => setTimeout(r, ms))) {
  let turn = Promise.resolve();
  let limited = 0;
  const asked = { n: 0 };
  // One request at a time leaves each `gap` apart (the three readers share it).
  const read = async path => {
    for (let tries = 0; tries < 3 && limited < 2; tries++) {
      const go = turn.then(() => sleep(pace.gap));
      turn = go;
      await go;
      asked.n++;
      const r = await fetchJson(`${FOTMOB}${path}`).catch(() => ({ status: 0 }));
      if (r.status === 200) return r.data;
      if (r.status === 404) return null;
      if (r.status === 429 && ++limited < 2) await sleep(pace.wait);
    }
    throw new Error(limited >= 2 ? 'fotmob: too many' : `fotmob: ${path} failed`);
  };
  return { read, asked, stopped: () => limited >= 2 };
}
async function fotmobJson(url) {
  return within(30_000, async signal => {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (orbit-photos)' }, signal });
    return { status: res.status, data: res.ok ? await res.json() : null };
  });
}
// One league's (or cup's) faces: its clubs' squads from FotMob, ESPN's other
// names for them club by club (`clubs`: ESPN's squads' names). null: unread.
export async function fotmobLeague(ids, clubs, { fetchJson = fotmobJson, pace = FOTMOB_PACE, sleep } = {}) {
  const fm = fotmobReader(fetchJson, pace, sleep);
  const teams = new Map();
  for (const id of ids) for (const [t, name] of fotmobTeams(await fm.read(`/leagues?id=${id}`))) teams.set(t, name);
  if (teams.size < 4) return null;
  const list = [...teams.keys()];
  const got = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: pace.at }, async () => {
      while (next < list.length) {
        const i = next++;
        got[i] = await fm.read(`/teams?id=${list[i]}`).then(d => d?.squad || null);
      }
    })
  );
  if (got.filter(s => !s?.squad?.length).length > list.length / 2) return null;
  const squads = got.filter(Boolean);
  const players = fotmobNames(squads);
  const taken = new Set(players.map(([name]) => faceKey(name)));
  for (const [name, id] of clubMatches(squads, clubs)) if (!taken.has(faceKey(name))) taken.add(faceKey(name)) && players.push([name, id]);
  return players;
}

// ESPN's squads of a league: [[`${key}:${team id}`, [names]]…], through the
// data proxy's route (rosters trimmed, cached). `proxy(url, trim)`.
async function espnSquads(key, proxy) {
  const l = CATALOG[key];
  if (!l?.espn) return [];
  const list = await proxy(`${SITE}/${l.espn}/teams?limit=1000`).catch(() => null);
  const ids = (list?.sports?.[0]?.leagues?.[0]?.teams || []).map(t => String(t.team?.id ?? '')).filter(Boolean);
  const out = [];
  for (const id of ids) {
    const r = await proxy(`${SITE}/${l.espn}/teams/${id}/roster`, 'espn-roster').catch(() => null);
    const names = (r?.athletes || []).flatMap(x => (Array.isArray(x?.items) ? x.items : [x])).map(a => a?.displayName).filter(Boolean);
    if (names.length) out.push([`${key}:${id}`, names]);
  }
  return out;
}

// Every list, in the order the days take them (a few a day).
export const PHOTO_JOBS = ['epl', ...Object.keys(OFFICIAL), ...Object.keys(FOTMOB_LEAGUES).map(k => `faces:${k}`), 'cutouts:names'];
export const PHOTOS_HOUR = 18;
export const PER_DAY = 4;
const dayNo = now => Math.floor(now / 86_400_000);
export const jobsOf = now => Array.from({ length: PER_DAY }, (_, i) => PHOTO_JOBS[(dayNo(now) * PER_DAY + i) % PHOTO_JOBS.length]);

// The day's lists (`jobs`), each written when it could be read whole.
export async function runPhotos({ store, proxy, now = Date.now(), jobs = jobsOf(now), sleep }) {
  const built = new Date(now).toISOString().slice(0, 10);
  const done = {};
  const squads = new Map();
  const espnOf = async key => (squads.has(key) ? squads.get(key) : squads.set(key, await espnSquads(key, proxy)).get(key));
  for (const job of jobs) {
    try {
      if (job === 'epl') {
        const players = await plPhotos();
        if (players) await store.put('sports/epl/photos.json', { built, players });
        done[job] = players ? players.length : 'kept';
      } else if (OFFICIAL[job]) {
        const people = await OFFICIAL[job]().catch(() => null);
        const players = people ? photoList(people) : [];
        if (people) {
          const taken = new Set(players.map(([n]) => nameKey(n)));
          const clubs = (await espnOf(job)).map(([, names]) => names);
          for (const [name, url] of clubFits(people.filter(p => !/\/default|defaultAssets/i.test(p.url || '')), clubs, sameNameish)) if (!taken.has(nameKey(name))) taken.add(nameKey(name)) && players.push([name, url]);
        }
        if (players.length >= 300) await store.put(`sports/${job}/photos.json`, { built, players });
        done[job] = players.length >= 300 ? players.length : 'kept';
      } else if (job.startsWith('faces:')) {
        const key = job.slice(6);
        const ids = FOTMOB_LEAGUES[key];
        // A cup made of other leagues' clubs: theirs together.
        const parts = typeof ids[0] === 'string' ? ids : [key];
        const clubs = [];
        for (const k of parts) clubs.push(...(await espnOf(k)).map(([, names]) => names));
        let players;
        if (typeof ids[0] === 'string') {
          players = [];
          for (const k of ids) players.push(...((await store.json(`sports/${k}/faces.json`))?.players || []));
        } else players = await fotmobLeague(ids, clubs, { sleep });
        if (players?.length) await store.put(`sports/${key}/faces.json`, { built, players });
        done[job] = players?.length || 'kept';
      } else if (job === 'cutouts:names') {
        // Whose cutouts to look up: the cups' squads without an official photo.
        const covered = new Set();
        for (const k of ['epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'mls']) for (const [n] of (await store.json(`sports/${k}/photos.json`))?.players || []) covered.add(nameKey(n));
        const espn = new Map();
        for (const k of CUTOUT_LEAGUES) for (const [id, names] of await espnOf(k)) espn.set(id, names);
        const carried = (await store.json('sports/cutouts/photos.json')) || {};
        const names = pendingNames({ espn, covered, carried, now });
        await store.put('sports/cutouts/pending.json', { built, names });
        done[job] = names.length;
      }
    } catch (e) {
      done[job] = `failed: ${String(e?.message || e).slice(0, 80)}`;
    }
  }
  return done;
}

// Every hour: a few cutouts looked up (TheSportsDB's free key: one every 2.1 s).
export const CUTOUTS_PER_HOUR = 20;
export async function runCutouts({ store, now = Date.now(), sleep, search }) {
  const pending = (await store.json('sports/cutouts/pending.json'))?.names || [];
  if (!pending.length) return { left: 0 };
  const kept = (await store.json('sports/cutouts/photos.json')) || {};
  const got = await cutouts({ names: pending, carried: kept, budget: CUTOUTS_PER_HOUR, now, ...(sleep ? { sleep } : {}), ...(search ? { search } : {}) });
  await store.put('sports/cutouts/photos.json', { built: new Date(now).toISOString().slice(0, 10), players: got.players, none: got.none });
  await store.put('sports/cutouts/pending.json', { built: new Date(now).toISOString().slice(0, 10), names: got.left });
  return { asked: got.asked, left: got.left.length };
}

// The players whose photo isn't the silhouette. A failed read (no tag) keeps
// the player: a photo that may be there isn't dropped for a failed read.
export async function withPhotos(players, tag, silhouette, at = 16) {
  const out = new Array(players.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: at }, async () => {
      while (next < players.length) {
        const i = next++;
        out[i] = (await tag(players[i][1])) !== silhouette;
      }
    })
  );
  return players.filter((_, i) => out[i]);
}

