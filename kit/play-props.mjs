// Quadra Play's props, in the shared kit: Play and the Worker's settling (settle.mjs) use this one copy.
// Players' markets: which of Kambi's the board sells, what each is called,
// and how each is settled from the game's ESPN box score.
//
// A pick is { stat, line, side, player }: `yes` wins with at least `line`
// (to score: 1 goal), `over` / `under` against a half line, and `first`
// (soccer's first goalscorer) on the first goal that isn't an own goal. A
// player who doesn't play (MLB: isn't in the starting lineup, as Kambi rules)
// gets the stake back. Only markets on the whole game (with overtime where
// Kambi says so), and only numbers ESPN's box score has, are sold.

// [family, Kambi's label, the stat, a fixed line]; a label's "N+" is the line.
const RULES = [
  ['soccer', /^To Score$/, 'goals', 1],
  ['soccer', /^To score at least (\d+) goals$/, 'goals'],
  ['soccer', /^First Goal Scorer$/, 'first'],
  ['soccer', /^Player's shots on target \(Settled using Opta data\)$/, 'sot'],
  ['soccer', /^To give an assist \(Settled using Opta data\)$/, 'assists', 1],
  ['soccer', /^To score or give an assist \(Settled using Opta data\)$/, 'ga', 1],
  ['hockey', /^To score - Including Overtime$/, 'goals', 1],
  ['hockey', /^To score at least (\d+) goals - Including Overtime$/, 'goals'],
  ['hockey', /^Player to score at least (\d+) points - Including Overtime$/, 'points'],
  ['hockey', /^Player to record at least (\d+) assists - Including Overtime$/, 'assists'],
  ['hockey', /^Player's shots on goal - Including Overtime$/, 'shots'],
  ['baseball', /^Player to Hit a Home Run - Including Extra Innings/, 'hr', 1],
  ['baseball', /^Player to hit 2 or more Home Runs - Including Extra Innings/, 'hr', 2],
  ['baseball', /^Total Hits by the Player - Including Extra Innings/, 'hits'],
  ['baseball', /^(\d+)\+ Hits by the Player - Including Extra Innings/, 'hits'],
  ['baseball', /^Total RBI by the Player - Including Extra Innings/, 'rbi'],
  ['baseball', /^(\d+)\+ RBIs by the Player - Including Extra Innings/, 'rbi'],
  ['baseball', /^(\d+)\+ Runs Scored by the Player - Including Extra Innings/, 'runs'],
  ['baseball', /^(\d+)\+ Hits, Runs & RBIs Recorded by the Player - Including Extra Innings/, 'hrr'],
  ['football', /^Touchdown Scorer$/, 'td', 1],
  ['football', /^(\d+)\+ Touchdown To Be Scored By The Player - Including Overtime$/, 'td'],
  ['football', /^(?:Total|(\d+)\+) Passing Yards By The Player - Including Overtime$/i, 'passYds'],
  ['football', /^(?:Total|(\d+)\+) Rushing Yards By The Player - Including Overtime$/i, 'rushYds'],
  ['football', /^(?:Total|(\d+)\+) Receiving Yards By The Player - Including Overtime$/i, 'recYds'],
  ['football', /^(?:Total|(\d+)\+) Receptions By The Player - Including Overtime$/i, 'rec'],
  ['football', /^(?:Total|(\d+)\+) Pass Completions By The Player - Including Overtime$/i, 'passComp'],
  ['football', /^(?:Total|(\d+)\+) Pass Attempts By The Player - Including Overtime$/i, 'passAtt'],
  ['football', /^(?:Total|(\d+)\+) Rush(?:ing)? Attempts By The Player - Including Overtime$/i, 'rushAtt'],
  ['football', /^(?:Total Touchdown Passes Thrown by the Player|(\d+)\+ Touchdown Passes By The Player) - Including Overtime$/i, 'passTD'],
  ['football', /^(?:Total Interceptions Thrown by the Player|(\d+)\+ Interceptions Thrown By The Player) - Including Overtime$/i, 'ints'],
  ['football', /^(?:Total|(\d+)\+) Passing & Rushing Yards By The Player - Including Overtime$/i, 'passRushYds'],
  ['football', /^(?:Total|(\d+)\+) Rushing & Receiving Yards By The Player - Including Overtime$/i, 'rushRecYds'],
  ['basketball', /^Points scored by the player - Including Overtime$/i, 'pts'],
  ['basketball', /^Rebounds by the player - Including Overtime$/i, 'reb'],
  ['basketball', /^Assists by the player - Including Overtime$/i, 'ast'],
  ['basketball', /^3-point field goals made by the player - Including Overtime$/i, 'threes']
];

// { stat, line } for one of Kambi's players' markets, or null (not sold).
export function propOf(family, label, type) {
  for (const [f, re, stat, line] of RULES) {
    if (f !== family) continue;
    const m = re.exec(label);
    if (!m) continue;
    if (stat === 'first') return type === 'Player Occurrence Number' ? { stat, line: null } : null;
    const n = m[1] != null ? Number(m[1]) : line;
    return { stat, line: n ?? null };
  }
  return null;
}

// What each stat is called (Chinese, English) and its unit.
export const PROP_NAMES = {
  goals: ['進球', 'Goals'],
  assists: ['助攻', 'Assists'],
  ga: ['進球或助攻', 'Goal or assist'],
  sot: ['射正', 'Shots on target'],
  first: ['首位進球', 'First goalscorer'],
  points: ['得分（進球＋助攻）', 'Points (goals + assists)'],
  shots: ['射門', 'Shots on goal'],
  hr: ['全壘打', 'Home runs'],
  hits: ['安打', 'Hits'],
  rbi: ['打點', 'RBIs'],
  runs: ['得分', 'Runs'],
  hrr: ['安打＋得分＋打點', 'Hits + runs + RBIs'],
  td: ['達陣', 'Touchdowns'],
  passYds: ['傳球碼數', 'Passing yards'],
  rushYds: ['衝球碼數', 'Rushing yards'],
  recYds: ['接球碼數', 'Receiving yards'],
  rec: ['接球次數', 'Receptions'],
  passComp: ['傳球成功', 'Completions'],
  passAtt: ['傳球次數', 'Pass attempts'],
  rushAtt: ['衝球次數', 'Rush attempts'],
  passTD: ['傳球達陣', 'Passing TDs'],
  ints: ['被抄截', 'Interceptions thrown'],
  passRushYds: ['傳球＋衝球碼數', 'Passing + rushing yards'],
  rushRecYds: ['衝球＋接球碼數', 'Rushing + receiving yards'],
  pts: ['得分', 'Points'],
  reb: ['籃板', 'Rebounds'],
  ast: ['助攻', 'Assists'],
  threes: ['三分球', 'Threes']
};
export const propName = (stat, lang = 'zh') => PROP_NAMES[stat]?.[lang === 'en' ? 1 : 0] ?? stat;

// ---- Settling from ESPN's game summary ------------------------------------------------

export const normPlayer = name =>
  String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Every player in a summary: normalized name -> { name, played, stats }, the
// stats under each box key ("completions/passingAttempts" split in two;
// a key two groups share, like interceptions, also as group.key).
export function boxPlayers(summary) {
  const out = new Map();
  const add = (name, played, stats) => {
    const key = normPlayer(name);
    if (!key) return;
    const was = out.get(key);
    out.set(key, { name, played: Boolean(played || was?.played), stats: { ...(was?.stats ?? {}), ...stats } });
  };
  // Soccer: each side's roster, with its own stats.
  for (const side of summary?.rosters || []) {
    for (const p of side.roster || []) {
      const stats = Object.fromEntries((p.stats || []).map(s => [s.name, num(s.value)]));
      add(p.athlete?.displayName, p.starter || p.subbedIn || num(stats.appearances) > 0, stats);
    }
  }
  // Every other sport: the box score's groups (batting, passing, skaters …).
  for (const team of summary?.boxscore?.players || []) {
    for (const group of team.statistics || []) {
      const keys = group.keys || group.labels || [];
      const gname = group.name ?? group.type ?? '';
      for (const a of group.athletes || []) {
        const stats = {};
        keys.forEach((k, i) => {
          const raw = a.stats?.[i];
          const parts = String(k).split(/[-/]/);
          const values = String(raw ?? '').split(/[-/]/);
          if (parts.length > 1 && values.length === parts.length) parts.forEach((p, j) => (stats[p] = num(values[j])));
          else stats[k] = num(raw);
          stats[`${gname}.${parts.length > 1 ? parts[0] : k}`] = num(values[0]);
        });
        // MLB: Kambi's props stand only for the starting lineup.
        const played = gname === 'batting' ? a.starter : !a.didNotPlay && (a.stats?.length ?? 0) > 0;
        add(a.athlete?.displayName, played, stats);
      }
    }
  }
  return out;
}

// The player's number for a stat (null: not in the box score).
export function statOf(stats, stat) {
  const s = stats || {};
  const v = k => (k in s ? s[k] : null);
  const sum = (...ks) => (ks.some(k => k in s) ? ks.reduce((t, k) => t + (s[k] ?? 0), 0) : null);
  switch (stat) {
    case 'goals':
      return v('totalGoals') ?? v('goals');
    case 'assists':
      return v('goalAssists') ?? v('assists');
    case 'ga':
      return sum('totalGoals', 'goalAssists');
    case 'sot':
      return v('shotsOnTarget');
    case 'points':
      return sum('goals', 'assists');
    case 'shots':
      return v('shotsTotal');
    case 'hr':
      return v('homeRuns');
    case 'hits':
      return v('batting.hits') ?? v('hits');
    case 'rbi':
      return v('RBIs');
    case 'runs':
      return v('batting.runs') ?? v('runs');
    case 'hrr':
      return v('batting.hits') == null ? null : (s['batting.hits'] ?? 0) + (s['batting.runs'] ?? 0) + (s.RBIs ?? 0);
    case 'td':
      return sum('rushingTouchdowns', 'receivingTouchdowns');
    case 'passYds':
      return v('passingYards');
    case 'rushYds':
      return v('rushingYards');
    case 'recYds':
      return v('receivingYards');
    case 'rec':
      return v('receptions');
    case 'passComp':
      return v('completions');
    case 'passAtt':
      return v('passingAttempts');
    case 'rushAtt':
      return v('rushingAttempts');
    case 'passTD':
      return v('passingTouchdowns');
    case 'ints':
      return v('passing.interceptions');
    case 'passRushYds':
      return sum('passingYards', 'rushingYards');
    case 'rushRecYds':
      return sum('rushingYards', 'receivingYards');
    case 'pts':
      return v('points');
    case 'reb':
      return v('rebounds');
    case 'ast':
      return v('assists');
    case 'threes':
      return v('threePointFieldGoalsMade');
    default:
      return null;
  }
}

// Find a player by name: the same name, else the same last name with the
// same first initial ("J.T. Realmuto" / "JT Realmuto").
export function findPlayer(players, name) {
  const key = normPlayer(name);
  if (players.has(key)) return players.get(key);
  const words = key.split(' ');
  const last = words.at(-1);
  const first = words[0]?.[0];
  const near = [...players.values()].filter(p => {
    const w = normPlayer(p.name).split(' ');
    return w.at(-1) === last && w[0]?.[0] === first;
  });
  return near.length === 1 ? near[0] : null;
}

// Soccer's first goal that isn't an own goal: its scorer's name, or '' when
// no such goal was scored.
export function firstScorer(summary) {
  const goals = (summary?.keyEvents || []).filter(e => e.scoringPlay && !/own goal/i.test(e.type?.text || '') && !e.ownGoal);
  const first = goals[0];
  return first ? first.participants?.[0]?.athlete?.displayName ?? '' : '';
}

// A player pick's outcome from the summary of a finished game: { status:
// 'final', value } (value: the player's number, or for `first` whether they
// scored first), or void when they didn't play.
export function propOutcome(leg, summary) {
  const players = boxPlayers(summary);
  if (!players.size) return null;
  const p = findPlayer(players, leg.player);
  if (!p || !p.played) return { status: 'void' };
  if (leg.stat === 'first') return { status: 'final', value: normPlayer(firstScorer(summary)) === normPlayer(p.name) ? 1 : 0 };
  const value = statOf(p.stats, leg.stat);
  return value == null ? { status: 'void' } : { status: 'final', value };
}

// 'won', 'lost' or 'void' for a player pick from propOutcome's answer.
export function propResult(leg, outcome) {
  if (!outcome || outcome.status === 'pending') return null;
  if (outcome.status === 'void') return 'void';
  const v = Number(outcome.value);
  if (!Number.isFinite(v)) return null;
  if (leg.stat === 'first') return v > 0 ? 'won' : 'lost';
  if (leg.side === 'yes') return v >= leg.line ? 'won' : 'lost';
  if (leg.side === 'over') return v > leg.line ? 'won' : v === leg.line ? 'void' : 'lost';
  if (leg.side === 'under') return v < leg.line ? 'won' : v === leg.line ? 'void' : 'lost';
  return null;
}
