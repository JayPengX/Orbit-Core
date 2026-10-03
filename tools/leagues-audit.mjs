// Every league in the shared catalogue (kit/catalog.mjs), checked against its
// real sources: what Orbit Sports would list (schedule and scores) and what
// Quadra Play could price, today. One line per league; a league with nothing
// in either is flagged, so "every sport works" is checked rather than assumed.
//
//   node tools/leagues-audit.mjs [--sport soccer] [--json]
//
// Orbit Sports: ESPN's scoreboard (the whole year for races, tours and cards; the
// season calendar's next game day otherwise), Kambi's list, or the Asian
// baseball months (asia-baseball.js, run here). Play: ESPN events carrying
// DraftKings odds, or Kambi matches with a winner price. Off-season leagues
// show 0 and a note of their next game day when the calendar has one.
import { execFile } from 'node:child_process';
import { CATALOG, SPORTS } from '../kit/catalog.mjs';
import { asiaBaseballResponse } from '../asia-baseball.js';

const args = process.argv.slice(2);
const only = args.includes('--sport') ? args[args.indexOf('--sport') + 1] : null;
const asJson = args.includes('--json');
const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const KAMBI = 'https://eu-offering-api.kambicdn.com/offering/v2018/ub';

// curl: it goes through the container's HTTPS proxy (Node's fetch doesn't).
const get = url =>
  new Promise(resolve =>
    execFile('curl', ['-s', '--compressed', '-m', '25', url], { maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
      try {
        resolve(err ? null : JSON.parse(out));
      } catch {
        resolve(null);
      }
    })
  );
const ymd = t => new Date(t).toISOString().slice(0, 10).replaceAll('-', '');
const kambiList = path => {
  const parts = path.split('/');
  while (parts.length < 4) parts.push('all');
  return `${KAMBI}/listView/${parts.join('/')}/matches.json?lang=en_GB&market=GB&useCombined=true`;
};
const now = Date.now();

async function fixtures(key, l) {
  if (l.data === 'asia') {
    const months = [-1, 0, 1].map(d => new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + d, 1)).toISOString().slice(0, 7));
    const lists = await Promise.all(months.map(async m => JSON.parse(await (await asiaBaseballResponse(new URL(`https://asia-baseball.quadra/${l.asia}/${m}.json`))).text()).games || []));
    const games = lists.flat();
    const next = games.filter(g => Date.parse(g.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
    return { n: games.length, next: next?.start };
  }
  if (l.data === 'kambi') {
    const data = await get(kambiList(l.kambi));
    const events = data?.events || [];
    return { n: events.length, next: events.map(e => e.event.start).sort()[0] };
  }
  if (l.kind !== 'match') {
    const data = await get(`${SITE}/${l.espn}/scoreboard?dates=${new Date(now).getUTCFullYear()}&limit=400`);
    const events = data?.events || [];
    const next = events.filter(e => Date.parse(e.endDate || e.date) > now - 86_400_000).map(e => e.date).sort()[0];
    return { n: events.length, next };
  }
  const board = await get(`${SITE}/${l.espn}/scoreboard`);
  const cal = board?.leagues?.[0]?.calendar;
  let events = board?.events || [];
  // The next game day from the calendar (a whitelist of days) when today has none.
  let next = events.map(e => e.date).filter(d => Date.parse(d) > now - 4 * 3_600_000).sort()[0];
  if (!next && Array.isArray(cal) && typeof cal[0] === 'string' && board.leagues[0].calendarIsWhitelist !== false) {
    const day = cal.map(d => String(d).slice(0, 10)).find(d => Date.parse(d) >= now - 86_400_000);
    if (day) {
      const more = await get(`${SITE}/${l.espn}/scoreboard?dates=${day.replaceAll('-', '')}`);
      events = [...events, ...(more?.events || [])];
      next = day;
    }
  }
  return { n: events.length, next };
}

async function play(key, l) {
  if (!l.bet) return { sold: false };
  if (key === 'f1') return { sold: true, n: '(own board)' };
  if (l.odds === 'kambi') {
    const data = await get(kambiList(l.kambi));
    const priced = (data?.events || []).filter(e => (e.betOffers || []).some(o => o.betOfferType?.englishName === 'Match'));
    return { sold: true, n: priced.length, next: priced.map(e => e.event.start).sort()[0] };
  }
  const dates = [0, 1, 2, 3].map(d => ymd(now + d * 86_400_000));
  const pages = await Promise.all(dates.map(d => get(`${SITE}/${l.espn}/scoreboard?dates=${d}&limit=200`)));
  const seen = new Set();
  const priced = pages.flatMap(p => p?.events || []).filter(e => !seen.has(e.id) && seen.add(e.id) && e.competitions?.[0]?.odds?.length);
  return { sold: true, n: priced.length, next: priced.map(e => e.date).sort()[0] };
}

const rows = [];
const keys = Object.keys(CATALOG).filter(k => !only || CATALOG[k].sport === only);
for (let i = 0; i < keys.length; i += 6) {
  const batch = keys.slice(i, i + 6);
  rows.push(
    ...(await Promise.all(
      batch.map(async key => {
        const l = CATALOG[key];
        const [fx, pl] = await Promise.all([fixtures(key, l).catch(e => ({ error: String(e) })), play(key, l).catch(e => ({ error: String(e) }))]);
        return { key, sport: l.sport, source: l.data, fixtures: fx, play: pl };
      })
    ))
  );
}
if (asJson) console.log(JSON.stringify(rows, null, 2));
else {
  const day = d => (d ? new Date(d).toISOString().slice(5, 16).replace('T', ' ') : '');
  for (const r of rows) {
    const fx = r.fixtures.error ? `ERROR ${r.fixtures.error}` : `${String(r.fixtures.n).padStart(4)} ${day(r.fixtures.next).padEnd(11)}`;
    const pl = !r.play.sold ? 'not sold' : r.play.error ? `ERROR ${r.play.error}` : `${String(r.play.n).padStart(4)} priced ${day(r.play.next)}`;
    const flag = !r.fixtures.n && (!r.play.sold || !r.play.n) ? '  <- nothing now' : '';
    console.log(`${`${SPORTS[r.sport]?.icon || ''} ${r.key}`.padEnd(18)} ${r.source.padEnd(6)} fixtures ${fx}   play ${pl}${flag}`);
  }
}
