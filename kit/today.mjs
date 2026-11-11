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

// ---- Orbit 助理's facts (ask-orbit.mjs, the AI's `orbit-ask`) ----
// The same notebook, wider: the next days' classes, the weather's lines,
// words due, the followed games (a game in class time says which period),
// days off ahead, saved trips, the school, what's held. Each fact has an id
// for the AI to pick, its words for the AI (`text`), and a row for the
// answer (`label`, `sub`, the app and where in it). Code says every fact;
// the AI only picks and says the line.
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function dayFacts({ now = Date.now(), en = false, ask = heard, holiday = null, plan = null } = {}) {
  const W = (zh, e) => (en ? e : zh);
  const out = [];
  const add = f => out.push({ id: `f${out.length + 1}`, hash: '', ...f });
  const day = twDay(now);
  const wd = d => new Date(`${d}T12:00:00Z`).getUTCDay();
  const dayWord = d => (d === day ? W('今天', 'Today') : d === addDays(day, 1) ? W('明天', 'Tomorrow') : d === addDays(day, 2) ? W('後天', 'In 2 days') : '') || `${+d.slice(5, 7)}/${+d.slice(8)}`;
  const md = d => `${+d.slice(5, 7)}/${+d.slice(8)}`;
  const dayName = d => `${dayWord(d)}${W(`（${md(d)} 週${WD[wd(d)]}）`, ` (${WD_EN[wd(d)]} ${md(d)})`)}`;
  // Class: today's (from 17:00, tomorrow's first) and the next two days', one fact a day.
  for (const d of [day, addDays(day, 1), addDays(day, 2)]) {
    const list = classesOn(d);
    if (!list.length) continue;
    const outdoor = list.filter(p => p.out).map(p => W(`第${p.n}節${p.name}`, `P${p.n} ${p.name}`));
    add({
      app: 'orbit',
      label: W(`${dayWord(d)} ${list.length} 節課`, `${dayWord(d)}: ${list.length} classes`),
      sub: `${list[0].from}–${list.at(-1).to}${outdoor.length ? W(` · 戶外：${outdoor.join('、')}`, ` · outdoors: ${outdoor.join(', ')}`) : ''}`,
      text: `${dayName(d)} ${W('上課', 'classes')} ${list[0].from}–${list.at(-1).to}: ${list.map(p => `${p.n} ${p.name} ${p.from}${p.out ? W('（戶外）', ' (outdoors)') : ''}`).join(', ')}`
    });
  }
  const school = ask('class', 'school');
  if (school?.name) add({ app: 'orbit', label: school.name, sub: W('學校', 'School'), text: `${W('學校', 'School')}: ${school.name}` });
  // Weather: 我的行程's lines for its day.
  const w = ask('weather', 'today', { maxAge: 12 * HOUR, now });
  if (w?.lines?.length && w.day >= day) for (const l of w.lines.slice(0, 4)) add({ app: 'weather', label: l.text, sub: dayWord(w.day), text: `${dayName(w.day)} ${W('天氣', 'weather')}: ${l.text}` });
  // Words: due today.
  const v = ask('vocab', 'due', { maxAge: 36 * HOUR, now });
  if (v?.day === day && v.n > 0) add({ app: 'vocab', hash: 'five', label: W(`${v.n} 個單字該複習`, `${v.n} words to review`), sub: W('今天', 'Today'), text: W(`今天有 ${v.n} 個單字該複習`, `${v.n} words due for review today`) });
  // Sports: the followed games ahead (8 days), each saying when it falls in a class.
  const games = (ask('sports', 'games', { maxAge: 7 * 86_400_000, now }) || ask('sports', 'next', { maxAge: 12 * HOUR, now }) || []).filter(g => g?.title && Number.isFinite(g.at) && g.at > now - 3 * HOUR && g.at < now + 8 * 86_400_000);
  for (const g of games.slice(0, 6)) {
    const gd = twDay(g.at);
    const min = mins(twHM(g.at));
    const p = classesOn(gd).find(c => mins(c.from) <= min && min < mins(c.to));
    const when = g.at <= now ? W('進行中', 'on now') : `${dayName(gd)} ${twHM(g.at)}`;
    add({ app: 'match', hash: String(g.hash || '').replace(/^#/, ''), label: g.title, sub: `${g.at <= now ? when : `${dayWord(gd)} ${twHM(g.at)}`}${p ? W(` · 第${p.n}節上課中`, ` · in P${p.n}`) : ''}`, text: `${W('追蹤的比賽', 'Followed game')}: ${g.title}, ${when}${p ? W(`，正在上第${p.n}節${p.name}`, `, during period ${p.n} ${p.name}`) : ''}` });
  }
  // Days off in the next two weeks (Taiwan's).
  if (holiday)
    for (let i = 0; i < 14; i++) {
      const d = addDays(day, i);
      const h = holiday(d);
      if (h) add({ app: 'orbit', label: en ? h.en || h.zh : h.zh, sub: dayName(d), text: `${dayName(d)} ${W('放假', 'day off')}: ${en ? h.en || h.zh : h.zh}` });
    }
  // Transit: the saved trips.
  const trips = ask('transit', 'trips') || [];
  for (const t of (Array.isArray(trips) ? trips : []).slice(0, 4)) {
    if (!t?.to?.name) continue;
    add({ app: 'transit', hash: plan && t.to.lat != null ? String(plan(t.to)).replace(/^#/, '') : '', label: t.name || t.to.name, sub: W(`常用行程 · 到 ${t.to.name}`, `Saved trip · to ${t.to.name}`), text: `${W('常用行程', 'Saved trip')}: ${t.name || ''} ${W('從', 'from')} ${t.from?.name || W('目前位置', 'here')} ${W('到', 'to')} ${t.to.name}` });
  }
  // Securities: what's held (names only).
  const holds = ask('stock', 'holds') || [];
  if (Array.isArray(holds) && holds.length) add({ app: 'stock', label: W(`持有 ${holds.length} 檔`, `${holds.length} holdings`), sub: holds.slice(0, 4).map(x => x.name || x.code).join('、'), text: `${W('持有', 'Holds')}: ${holds.slice(0, 10).map(x => x.name || x.code).join(', ')}` });
  return out.slice(0, 40);
}
