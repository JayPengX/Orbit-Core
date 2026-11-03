// Rewind ESPN's real MLS scoreboard to a moment: each game's status, minute
// and score as they stood then, from its own recorded goals and cards.
import { readFileSync, writeFileSync } from 'node:fs';
const [,, src, dst, at] = process.argv;
const now = Date.parse(at);
const j = JSON.parse(readFileSync(src, 'utf8'));
const HALF = 47, BREAK = 15;
for (const e of j.events) {
  const c = e.competitions[0];
  const mins = (now - Date.parse(e.date)) / 60000;
  let st;
  if (mins < 0) st = { clock: 0, displayClock: "0'", period: 0, type: { id: '1', name: 'STATUS_SCHEDULED', state: 'pre', completed: false, description: 'Scheduled', detail: 'Scheduled', shortDetail: 'Scheduled' } };
  else if (mins >= 2 * HALF + BREAK + 6) continue; // over by then: left as recorded
  else {
    const first = mins < HALF;
    const brk = !first && mins < HALF + BREAK;
    const minute = first ? Math.max(1, Math.ceil(mins)) : brk ? 45 : Math.min(90, Math.ceil(45 + mins - HALF - BREAK));
    st = brk
      ? { clock: 2700, displayClock: "45'", period: 1, type: { id: '23', name: 'STATUS_HALFTIME', state: 'in', completed: false, description: 'Halftime', detail: 'HT', shortDetail: 'HT' } }
      : { clock: minute * 60, displayClock: `${minute}'`, period: first ? 1 : 2, type: first ? { id: '2', name: 'STATUS_FIRST_HALF', state: 'in', completed: false, description: 'First Half', detail: `${minute}'`, shortDetail: `${minute}'` } : { id: '22', name: 'STATUS_SECOND_HALF', state: 'in', completed: false, description: 'Second Half', detail: `${minute}'`, shortDetail: `${minute}'` } };
    c.details = (c.details || []).filter(d => (d.clock?.value ?? 0) <= st.clock);
  }
  e.status = c.status = st;
  for (const t of c.competitors) {
    t.score = st.type.state === 'pre' ? '0' : String((c.details || []).filter(d => d.scoringPlay && !d.shootout && String(d.team?.id) === String(t.team.id)).length);
    delete t.winner;
  }
  c.recent = false;
}
writeFileSync(dst, JSON.stringify(j));
for (const e of j.events) console.log(e.shortName, e.status.type.name, e.status.displayClock, e.competitions[0].competitors.map(t => t.score).join('-'));
