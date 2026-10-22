// A day's sources for Play's board, made up in the shapes the proxy answers
// with (ESPN's month pages as `espn-board` trims them, Kambi's lists trimmed,
// Asia's month lists), so a build of the board runs offline on about what
// the real one reads: thirty leagues, some five hundred games over two weeks.
import { LEAGUES } from '../../kit/play-teams.mjs';
import { kambiUrl } from '../../kit/play-kambi.mjs';
import { asiaMonthUrl } from '../../kit/catalog.mjs';

// Games a day by league (on average, over the two weeks): about a normal autumn week's.
export const PER_DAY = { mlb: 4, npb: 4, kbo: 4, cpbl: 3, nba: 6, wnba: 0, nbl: 2, euroleague: 4, nfl: 2, ncaaf: 8, nhl: 8, epl: 1.5, laliga: 1.5, seriea: 1.5, bundesliga: 1.5, ligue1: 1.5, ucl: 1, uel: 1, uecl: 1, scotland: 1, mls: 2, kleague: 1.5, jleague: 3, championship: 2, eredivisie: 1, ligamx: 2, brasileirao: 2, facup: 0, worldcup: 0, nationsleague: 0 };

const FAMILY_LINES = {
  baseball: { total: 8.5, spread: 1.5 },
  basketball: { total: 224.5, spread: 5.5 },
  football: { total: 47.5, spread: 3.5 },
  hockey: { total: 5.5, spread: 1.5 },
  soccer: { total: 2.5, spread: 0.5 }
};

const rng = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const NAMES = {
  mlb: ['Los Angeles Dodgers', 'New York Yankees', 'Seattle Mariners', 'Houston Astros', 'Atlanta Braves', 'Boston Red Sox', 'Chicago Cubs', 'San Diego Padres'],
  nba: ['Los Angeles Lakers', 'Boston Celtics', 'Golden State Warriors', 'Miami Heat', 'Denver Nuggets', 'New York Knicks', 'Dallas Mavericks', 'Phoenix Suns'],
  epl: ['Arsenal', 'Liverpool', 'Manchester City', 'Chelsea', 'Tottenham Hotspur', 'Newcastle United', 'Aston Villa', 'Brighton & Hove Albion']
};
const teamsOf = (key, n = 14) => NAMES[key] ?? Array.from({ length: n }, (_, i) => `${key.toUpperCase()} Club ${String.fromCharCode(65 + i)}`);
const american = p => (p >= 0.5 ? String(-Math.round((p / (1 - p)) * 100)) : `+${Math.round(((1 - p) / p) * 100)}`);
const side = odds => ({ close: { odds: american(odds) } });

// Games of a league between `from` and `to` (ms): { key, start, away, home, p: home's chance }.
export function gamesOf(key, from, to, scale = 1) {
  const teams = teamsOf(key);
  const rand = rng([...key].reduce((s, c) => s * 31 + c.charCodeAt(0), 7));
  const out = [];
  const days = Math.ceil((to - from) / 86_400_000);
  for (let d = 0; d < days; d++) {
    const n = Math.floor((PER_DAY[key] ?? 1) * scale + rand());
    for (let i = 0; i < n; i++) {
      const start = from + d * 86_400_000 + Math.floor(rand() * 20) * 3_600_000 + Math.floor(rand() * 4) * 900_000;
      const a = Math.floor(rand() * teams.length);
      const h = (a + 1 + Math.floor(rand() * (teams.length - 1))) % teams.length;
      out.push({ key, start, away: teams[a], home: teams[h], p: 0.3 + rand() * 0.4, priced: rand() > 0.12 });
    }
  }
  return out;
}

// ESPN's event, as the `espn-board` trim leaves it.
// (A game whose time has come is under way, as ESPN says it: `late` keeps one to come still.)
function espnEvent(g, i, family, now = Infinity, late = new Set()) {
  const state = g.start <= now && !late.has(g.home) ? 'in' : 'pre';
  const lines = FAMILY_LINES[family];
  const soccer = family === 'soccer';
  const draw = soccer ? 0.27 - 0.4 * (g.p - 0.5) ** 2 : 0;
  const home = g.p * (1 - draw);
  const away = (1 - g.p) * (1 - draw);
  const date = new Date(g.start).toISOString();
  const odds = g.priced
    ? [{
        moneyline: { away: side(away * 1.05), home: side(home * 1.05), ...(soccer ? { draw: side(draw * 1.05) } : {}) },
        total: { over: { close: { odds: '-110', line: `o${lines.total}` } }, under: { close: { odds: '-110', line: `u${lines.total}` } } },
        pointSpread: { away: { close: { odds: '-110', line: g.p > 0.5 ? `+${lines.spread}` : `-${lines.spread}` } }, home: { close: { odds: '-110', line: g.p > 0.5 ? `-${lines.spread}` : `+${lines.spread}` } } }
      }]
    : [];
  const team = (name, n) => ({ id: String(100 + n), displayName: name, abbreviation: name.slice(0, 3).toUpperCase(), logo: `https://a.espncdn.com/i/teamlogos/${name.replaceAll(' ', '-').toLowerCase()}.png` });
  return {
    id: `${g.key}${i}`,
    date,
    season: { type: 2 },
    status: { type: { state, completed: false } },
    competitions: [{ date, timeValid: true, neutralSite: false, status: { type: { state, completed: false } }, competitors: [{ homeAway: 'home', team: team(g.home, 1) }, { homeAway: 'away', team: team(g.away, 2) }], odds }]
  };
}

// Kambi's list view, trimmed: events with their winner and (basketball, baseball) total.
function kambiEvents(list, now = Infinity, late = new Set()) {
  const o = (type, odds, extra = {}) => ({ type, odds, status: 'OPEN', ...extra });
  return {
    events: list.map((g, i) => ({
      event: { id: 1_000_000 + i, name: `${g.away} - ${g.home}`, homeName: g.home, awayName: g.away, start: new Date(g.start).toISOString(), state: g.start <= now && !late.has(g.home) ? 'STARTED' : 'NOT_STARTED', group: '' },
      betOffers: [
        { criterion: { englishLabel: 'Match' }, betOfferType: { englishName: 'Match' }, outcomes: [o('OT_ONE', Math.round(1000 / (g.p * 0.95))), o('OT_TWO', Math.round(1000 / ((1 - g.p) * 0.95)))] },
        { criterion: { englishLabel: 'Total' }, betOfferType: { englishName: 'Over/Under' }, outcomes: [o('OT_OVER', 1910, { line: 8500 }), o('OT_UNDER', 1910, { line: 8500 })] }
      ]
    }))
  };
}

// The sources of the board as the proxy answers them, from `now`: `proxy(url, trim)` → JSON or null.
// `down`: a predicate on a URL that answers null (a source that can't be read).
// `late`: home sides whose game is past its time but hasn't begun.
export function fakeSources({ now, scale = 1, down = () => false, f1 = false, late = new Set() } = {}) {
  const from = now - 12 * 3_600_000;
  const to = now + 16 * 86_400_000;
  const calls = [];
  const leagueOf = url => {
    for (const [key, l] of Object.entries(LEAGUES)) {
      if (l.path && url.includes(`/sports/${l.path}/`)) return key;
      if (l.book && url === kambiUrl(l.book)) return `${key}:book`;
      if (l.kambi && url === kambiUrl(l.kambi)) return `${key}:kambi`;
    }
    return null;
  };
  const proxy = async (url, trim = '') => {
    calls.push(url);
    if (down(url)) return null;
    const u = new URL(url);
    if (u.hostname === 'site.api.espn.com' && u.pathname.includes('/scoreboard')) {
      const key = leagueOf(url);
      if (!key) return null;
      const family = LEAGUES[key].family;
      const dates = u.searchParams.get('dates');
      const list = gamesOf(key, from, to, scale).filter(g => {
        if (!dates) return g.start < now + 7 * 86_400_000;
        const ym = new Date(g.start).toISOString().replace(/-/g, '').slice(0, dates.length);
        return ym === dates;
      });
      return { events: list.map((g, i) => espnEvent(g, i, family, now, late)) };
    }
    if (u.hostname === 'site.api.espn.com') return null; // standings: the house reads none
    if (u.hostname === 'eu-offering-api.kambicdn.com' && u.pathname.includes('formula_1')) {
      return f1 ? { events: [{ event: { id: 2_000_001, name: 'Race: Mexico City GP 2026', start: new Date(now + 4 * 86_400_000).toISOString(), state: 'NOT_STARTED' } }] } : { events: [] };
    }
    if (u.hostname === 'eu-offering-api.kambicdn.com' && u.pathname.includes('/betoffer/event/2000001')) {
      return { betOffers: [{ criterion: { englishLabel: 'GP Winner' }, from: 1, to: 1, outcomes: F1_GRID.map((participant, i) => ({ participant, odds: Math.round(1000 * (2.2 + i * i * 0.45)), status: 'OPEN' })) }] };
    }
    if (u.hostname === 'eu-offering-api.kambicdn.com') {
      const which = leagueOf(url);
      if (!which) return { events: [] };
      const [key, kind] = which.split(':');
      // An ESPN league's own Kambi list prices nothing here (DraftKings does); a Kambi-only league's is its schedule.
      return kind === 'kambi' ? kambiEvents(gamesOf(key, from, to, scale), now, late) : { events: [] };
    }
    if (u.hostname === 'asia-baseball.orbit') {
      const [league, ym] = u.pathname.slice(1).replace('.json', '').split('/');
      const key = Object.entries(LEAGUES).find(([, l]) => l.schedule?.asia === league)?.[0];
      const games = gamesOf(key, from - 60 * 86_400_000, to, scale).filter(g => new Date(g.start + 8 * 3_600_000).toISOString().slice(0, 7) === ym);
      return { games: games.map((g, i) => ({ id: `${league}${i}`, start: new Date(g.start).toISOString(), state: g.start < now ? 'post' : 'pre', home: { en: g.home }, away: { en: g.away }, homeScore: 3, awayScore: 2 })) };
    }
    if (u.hostname === 'gamma-api.polymarket.com') return [];
    return null;
  };
  return { proxy, calls, asiaMonthUrl };
}

const F1_GRID = ['Max Verstappen', 'Lando Norris', 'Oscar Piastri', 'Charles Leclerc', 'George Russell', 'Lewis Hamilton', 'Carlos Sainz', 'Fernando Alonso', 'Kimi Antonelli', 'Pierre Gasly', 'Yuki Tsunoda', 'Alexander Albon', 'Lance Stroll', 'Esteban Ocon', 'Nico Hulkenberg', 'Oliver Bearman'];

// Taiwan Lottery's answers, as the kit's `upcoming` and `latestResults` return them.
export const fakeLottery = ({ fail = false } = {}) => ({
  upcoming: async () => {
    if (fail) throw new Error('down');
    return { super638: { date: '2026-10-22', period: 115000087, jackpot: { amount: 480_000_000, desc: '上看' } }, lotto649: { date: '2026-10-20', period: 115000090, jackpot: { amount: 200_000_000, desc: '保證' } }, daily539: { date: '2026-10-19' }, bingo: { date: '2026-10-19' } };
  },
  latestResults: async () => {
    if (fail) throw new Error('down');
    return { super638: { numbers: [1, 2, 3, 4, 5, 6], jackpot: 410_000_000 }, lotto649: { numbers: [7, 8, 9, 10, 11, 12], jackpot: 150_000_000 }, daily539: { numbers: [1, 2, 3, 4, 5] } };
  }
});
