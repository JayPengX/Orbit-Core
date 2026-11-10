// ---- kit/today.mjs: 今天 on the Orbit Pass sheet (Jay 11-10: the apps working together) ----
// One card of what the day holds, from what each app told the family's
// notebook on this phone (family.mjs): the class on or next (Class), the
// day's umbrella and 體育課 line (Weather's 我的行程), words due (Words),
// followed games about to start (Sports). Each row opens its app there.
// Nothing is read from a server and nothing is sent; an app not used on
// this phone simply has no row.
import { heard, classesOn } from './family.mjs';
import { twDay, addDays } from './format.mjs';

const HOUR = 3_600_000;
const twHM = t => new Date(t + 8 * HOUR).toISOString().slice(11, 16);
const mins = hm => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
  return m ? +m[1] * 60 + +m[2] : null;
};

// The rows: [{ app, hash, title, sub }], in the day's order of use.
export function todayRows({ now = Date.now(), en = false, ask = heard } = {}) {
  const W = (zh, e) => (en ? e : zh);
  const rows = [];
  const day = twDay(now);
  const min = mins(twHM(now));
  // Class: the period on, else the next today, else (from 17:00) tomorrow's first.
  const today = classesOn(day);
  const on = today.find(p => mins(p.from) <= min && min < mins(p.to));
  const next = today.find(p => mins(p.from) > min);
  const label = p => W(`第 ${p.n} 節 ${p.name}`, `Period ${p.n}, ${p.name}`);
  if (on) rows.push({ app: 'orbit', hash: '', title: label(on), sub: W(`上課中，${on.to} 下課`, `On now, until ${on.to}`) });
  else if (next) rows.push({ app: 'orbit', hash: '', title: label(next), sub: W(`下一節，${next.from} 上課`, `Next, at ${next.from}`) });
  else if (min >= 17 * 60) {
    const first = classesOn(addDays(day, 1))[0];
    if (first) rows.push({ app: 'orbit', hash: '', title: label(first), sub: W(`明天第一節，${first.from} 上課`, `Tomorrow’s first, at ${first.from}`) });
  }
  // Weather: 我的行程's umbrella and 體育課 lines for today (tomorrow from 21:00).
  const w = ask('weather', 'today', { maxAge: 6 * HOUR, now });
  if (w?.lines?.length && (w.day === day || w.day === addDays(day, 1))) {
    const lines = w.lines.filter(l => l.kind === 'umbrella' || l.kind === 'pe' || (l.kind === 'wear' && l.level === 'yes'));
    if (lines.length) rows.push({ app: 'weather', hash: '', title: lines[0].text, sub: [w.day === day ? '' : w.word, ...lines.slice(1).map(l => l.text)].filter(Boolean).join(' · '), level: lines[0].level });
  }
  // Words: today's review.
  const v = ask('vocab', 'due', { maxAge: 36 * HOUR, now });
  if (v?.day === day && v.n > 0) rows.push({ app: 'vocab', hash: 'five', title: W(`${v.n} 個單字該複習`, `${v.n} word${v.n === 1 ? '' : 's'} to review`), sub: W('先背 5 個', 'Start with 5') });
  // Sports: followed games starting within the day, or on now.
  const games = (ask('sports', 'next', { maxAge: 12 * HOUR, now }) || []).filter(g => g?.title && Number.isFinite(g.at) && g.at > now - 3 * HOUR && g.at < now + 24 * HOUR);
  for (const g of games.slice(0, 2)) {
    const when = g.at <= now ? W('進行中', 'On now') : `${twDay(g.at) === day ? '' : W('明天 ', 'Tomorrow ')}${twHM(g.at)}`;
    rows.push({ app: 'match', hash: String(g.hash || '').replace(/^#/, ''), title: g.title, sub: when });
  }
  return rows;
}
