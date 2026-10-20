// ---- slip.js: /slip-scan, Orbit Slips' ticket photo read (jaypengx.github.io/Orbit-Slips) ----

import { paceOf } from './pace.js';
import { sessionLimited, readToken, tokenSecret } from './quadra-token.js';
import { json, LOCAL_ORIGIN, bodyText } from './http.js';

const ORIGIN = 'https://jaypengx.github.io';
const twDay = (now = Date.now()) => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

// ---- /slip-scan: a photo of a ticket read by Gemini --------------------------
// Orbit Class's photo import (worker.js's /gemini) made narrower: the prompt
// and schema are fixed here, one picture an ask (a JPEG the page has already
// shrunk, at most 1.5 MB), only the cheapest model then one stronger if
// Google is busy. Tight because there's no Pass: 2 a minute, 6 an hour and
// 12 a day an address, and 150 a day in all, counted in D1 every time (a
// failed count turns the ask away). Stopped from the guard's pace 2.
// Scans: with a Quadra Pass (qt, Orbit Slips' session) counted per account,
// 3 a minute and 30 a day; without one, per address as before. 400 a day in
// all (Gemini's flash-lite: well under a dollar).
const SCAN = { perMinute: 2, perHour: 6, perDay: 12, passPerMinute: 3, passPerDay: 30, dayCap: 400, maxBase64: 2_000_000 };
export const SCAN_LIMITS = SCAN;
const SCAN_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.7-flash'];
const SCAN_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const SCAN_LEAGUES = ['mlb', 'cpbl', 'npb', 'kbo', 'nba', 'wnba', 'nbl', 'nfl', 'ncaaf', 'nhl', 'epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'ucl', 'uel', 'uecl', 'championship', 'eredivisie', 'scotland', 'mls', 'jleague', 'ligamx', 'brasileirao', 'facup', 'leaguecup', 'communityshield', 'copadelrey', 'coppaitalia', 'dfbpokal', 'coupedefrance', 'supercup', 'nationsleague', 'worldcup', 'other'];

function scanPrompt(todayIso) {
  return `The picture is a Taiwan Sports Lottery (台灣運彩) betting ticket: a printed slip from a shop, or a screenshot of the lottery's app or site. Read every pick on it and return JSON matching the schema. Today in Taiwan is ${todayIso}.

Rules:
- isSlip: false if the picture is not a sports lottery ticket (then picks is empty).
- One entry in picks per game picked, in the order printed. A printed line like "<足球> 1179 切爾西 @ 艾佛頓" then "不讓分 切爾西 2.10" is one pick: <足球> is the sport, 1179 the lottery's game number, the team before @ is the away team and the one after @ the home team, then the market, the chosen side and its odds.
- sport: soccer (足球), baseball (棒球), basketball (籃球), football (美式足球), hockey (冰球), or other.
- league: the competition, as one of: ${SCAN_LEAGUES.join(', ')} (MLB=mlb, 中職=cpbl, 日職=npb, 韓職=kbo, NBA=nba, 英超=epl, 西甲=laliga, 義甲=seriea, 德甲=bundesliga, 法甲=ligue1, 歐冠=ucl, 歐霸=uel, 歐協聯=uecl, 英冠=championship, 荷甲=eredivisie, 美職足=mls, 日職聯=jleague, 英足總盃=facup, 英聯盃=leaguecup, 社區盾=communityshield, 國王盃=copadelrey, 義大利盃=coppaitalia, 德國盃=dfbpokal, 法國盃=coupedefrance, 歐洲超級盃=supercup, 世界盃=worldcup). If only the sport is printed, your best guess from the teams (e.g. Chelsea and Everton: epl), or other.
- teams: the two teams exactly as printed (Chinese as on the ticket), away/guest (客) first, home (主) second when the ticket says which; else in printed order. teamsEn: your best English names for the same two teams (e.g. "New York Yankees", "Manchester City"), or the printed text if unsure.
- bought: the day the ticket was bought (購買日期 / 投注時間 / 交易時間, often in the ROC calendar: 民 115年 is 2026) as YYYY-MM-DD; null if not printed. The ticket may be old: its games may be long over.
- date: the game's own date in Taiwan as YYYY-MM-DD only if printed next to the pick (a year-less date is the one nearest the day bought, else nearest today, never before the day bought); else null. The day bought is not the game's date.
- kind: ml for 不讓分 / 獨贏 / 勝負 / 勝平負; spread for 讓分; total for 大小 / 總分; oddeven for 單雙. Anything else: other.
- pick: for ml and spread, the chosen team exactly as written in teams, or "draw" for 和 / 平 / 讓分和; for total "over" (大) or "under" (小); for oddeven "odd" (單) or "even" (雙).
- line: for spread, the chosen team's handicap as a signed number (giving 1.5 points is -1.5, getting them is +1.5); for soccer's 讓分和 (pick "draw" on a 讓分 line), the home team's handicap; for total, the total line; else null.
- odds: the decimal odds printed for that pick.
- combos: the ticket's combinations as N串M strings, e.g. ["單場"], ["4串1"], ["3串4"] or ["2串1","3串1"]. 全部過關 means every pick in one parlay: with 4 picks that is "4串1". Empty if not printed.
- stakePer: the amount per combination (每組合投注金額 / 每組 / 每注; "全部過關(NTD700)" is 700) in NT$; null if not printed. total: the ticket's whole amount (總投注金額 / 總金額) in NT$; null if not printed.
- Never invent a pick that is not on the ticket. If a number is unreadable, use null.`;
}
const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    isSlip: { type: 'boolean' },
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sport: { type: 'string', enum: ['soccer', 'baseball', 'basketball', 'football', 'hockey', 'other'] },
          league: { type: 'string', enum: SCAN_LEAGUES },
          teams: { type: 'array', items: { type: 'string' } },
          teamsEn: { type: 'array', items: { type: 'string' } },
          date: { type: 'string', nullable: true },
          kind: { type: 'string', enum: ['ml', 'spread', 'total', 'oddeven', 'other'] },
          pick: { type: 'string' },
          line: { type: 'number', nullable: true },
          odds: { type: 'number', nullable: true }
        },
        required: ['sport', 'league', 'teams', 'teamsEn', 'kind', 'pick', 'odds']
      }
    },
    bought: { type: 'string', nullable: true },
    combos: { type: 'array', items: { type: 'string' } },
    stakePer: { type: 'number', nullable: true },
    total: { type: 'number', nullable: true }
  },
  required: ['isSlip', 'picks', 'combos']
};

// The day's scans in all: counted in D1 before each one (or in memory with
// no store, as in the tests).
let scanMemory = { key: '', n: 0 };
async function countScan(env, now = Date.now()) {
  const key = `scan:${twDay(now)}`;
  if (!env.STORE) {
    if (scanMemory.key !== key) scanMemory = { key, n: 0 };
    return ++scanMemory.n;
  }
  try {
    await env.STORE.prepare('CREATE TABLE IF NOT EXISTS slip_day (day TEXT PRIMARY KEY, n INTEGER NOT NULL)').run();
    const row = await env.STORE.prepare('INSERT INTO slip_day (day, n) VALUES (?1, ?2) ON CONFLICT (day) DO UPDATE SET n = n + ?2 RETURNING n').bind(key, 1).first();
    return Number(row?.n) || Infinity;
  } catch {
    return Infinity;
  }
}
export const forgetScans = () => (scanMemory = { key: '', n: 0 });

// gemini(model, parts, schema) -> the upstream Response (worker.js's proxyGeminiRequest).
export async function handleSlipScan(request, env, headers, ip, gemini) {
  if (request.method !== 'POST') return json({ error: { message: 'POST only' } }, 405, headers);
  const origin = request.headers.get('Origin') || '';
  if (origin !== ORIGIN && !LOCAL_ORIGIN.test(origin)) return json({ error: { message: 'Forbidden' } }, 403, headers);
  if (!env.GEMINI_API_KEY) return json({ error: { message: 'Not set up' } }, 503, headers);
  // (Read only up to what a picture can be, Content-Length or not.)
  const text = await bodyText(request, SCAN.maxBase64 + 1000);
  if (text == null) return json({ error: { message: 'Too large' } }, 413, headers);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: { message: 'Bad JSON' } }, 400, headers);
  }
  const image = body?.image;
  if (typeof image?.data === 'string' && image.data.length > SCAN.maxBase64) return json({ error: { message: 'Too large' } }, 413, headers);
  if (!image || !SCAN_TYPES.includes(image.mime_type) || typeof image.data !== 'string' || !image.data || image.data.length > SCAN.maxBase64 || !/^[A-Za-z0-9+/=]+$/.test(image.data.slice(0, 200))) return json({ error: { message: 'Bad image' } }, 400, headers);
  if ((await paceOf(env)).pace >= 2) return json({ error: { message: 'Paused' } }, 503, headers);
  const qt = typeof body.qt === 'string' ? body.qt : new URL(request.url).searchParams.get('qt');
  if (qt) {
    const claims = await readToken(await tokenSecret(env), qt, 'ses');
    if (!claims) return json({ error: { code: 'QUADRA_PASS_REQUIRED', message: 'Sign in with a Quadra Pass.' } }, 401, headers);
    if (sessionLimited(`scan:pm:${claims.d}`, SCAN.passPerMinute) || sessionLimited(`scan:pd:${claims.d}`, SCAN.passPerDay, 86_400_000)) return json({ error: { message: 'Too many requests' } }, 429, headers);
  } else if (sessionLimited(`scan:m:${ip}`, SCAN.perMinute) || sessionLimited(`scan:h:${ip}`, SCAN.perHour, 3_600_000) || sessionLimited(`scan:d:${ip}`, SCAN.perDay, 86_400_000)) return json({ error: { message: 'Too many requests' } }, 429, headers);
  if ((await countScan(env)) > SCAN.dayCap) return json({ error: { message: 'Busy today' } }, 503, headers);
  const parts = [{ text: scanPrompt(twDay()) }, { inline_data: { mime_type: image.mime_type, data: image.data } }];
  let res;
  for (const model of SCAN_MODELS) {
    res = await gemini(model, parts, SCAN_SCHEMA);
    if (res.ok || !(res.status === 429 || res.status >= 500)) break;
  }
  return res;
}
