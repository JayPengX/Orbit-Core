// Quadra Fixtures' logo map (Quadra-Fixtures/public/lib/logos.mjs): every
// league's logo, and the team badges of the leagues whose feed has none
// (Kambi's NPB, KBO, CPBL, EuroLeague, B.League).
//   node tools/logos.mjs            writes ../Quadra-Fixtures/public/lib/logos.mjs
// ESPN leagues: the scoreboard's league logo. The rest: TheSportsDB's
// badges (free key; one request a team, run it now and then, not per user).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { LEAGUES } from '../../Quadra-Fixtures/public/lib/leagues.mjs';

const get = url => {
  for (let i = 0; i < 3; i++) {
    try {
      return JSON.parse(execFileSync('curl', ['-s', '--compressed', '-m', '25', url], { maxBuffer: 32 * 1024 * 1024 }).toString());
    } catch {
      execFileSync('sleep', ['2']);
    }
  }
  return null;
};
const TSDB = 'https://www.thesportsdb.com/api/v1/json/3';

// TheSportsDB league ids for the leagues ESPN doesn't carry.
const TSDB_LEAGUES = { npb: 4591, kbo: 4830, cpbl: 5111, euroleague: 4546, bleague: 4977, badminton: 5646, snooker: 4555, tabletennis: 5641, volleyball: 5083 };
// Each team: the word(s) that pick it out of Kambi's name, and TheSportsDB's name.
const TEAMS = {
  npb: [['giants', 'Yomiuri Giants'], ['tigers', 'Hanshin Tigers'], ['dragons', 'Chunichi Dragons'], ['baystars', 'Yokohama DeNA BayStars'], ['carp', 'Hiroshima Toyo Carp'], ['swallows', 'Tokyo Yakult Swallows'], ['buffaloes', 'Orix Buffaloes'], ['marines', 'Chiba Lotte Marines'], ['hawks', 'Fukuoka SoftBank Hawks'], ['eagles', 'Tohoku Rakuten Golden Eagles'], ['lions', 'Saitama Seibu Lions'], ['fighters', 'Hokkaido Nippon Ham Fighters']],
  kbo: [['tigers', 'Kia Tigers'], ['lions', 'Samsung Lions'], ['twins', 'LG Twins'], ['bears', 'Doosan Bears'], ['wiz', 'KT Wiz'], ['landers', 'SSG Landers'], ['giants', 'Lotte Giants'], ['eagles', 'Hanwha Eagles'], ['dinos', 'NC Dinos'], ['heroes', 'Kiwoom Heroes']],
  cpbl: [['brothers', 'CTBC Brothers'], ['guardians', 'Fubon Guardians'], ['monkeys', 'Rakuten Monkeys'], ['hawks', 'TSG Hawks'], ['lions', 'Uni President Lions'], ['dragons', 'Wei Chuan Dragons']],
  euroleague: [['real madrid', 'Real Madrid Baloncesto'], ['barcelona', 'FC Barcelona Basquet'], ['olympiacos', 'Olympiacos BC'], ['panathinaikos', 'Panathinaikos BC'], ['fenerbahce', 'Fenerbahce Basketball'], ['efes', 'Anadolu Efes'], ['monaco', 'AS Monaco Basket'], ['maccabi', 'Maccabi Tel Aviv BC'], ['hapoel', 'Hapoel Tel Aviv BC'], ['partizan', 'KK Partizan'], ['zvezda', 'KK Crvena Zvezda'], ['red star', 'KK Crvena Zvezda'], ['zalgiris', 'Zalgiris Kaunas'], ['baskonia', 'Baskonia'], ['bayern', 'FC Bayern Munchen Basketball'], ['milan', 'Olimpia Milano'], ['virtus', 'Virtus Bologna'], ['paris', 'Paris Basketball'], ['asvel', 'ASVEL Basket'], ['valencia', 'Valencia Basket'], ['dubai', 'Dubai Basketball']],
  bleague: [['brex', 'Utsunomiya Brex'], ['jets', 'Chiba Jets'], ['alvark', 'Alvark Tokyo'], ['golden kings', 'Ryukyu Golden Kings'], ['diamond dolphins', 'Nagoya Diamond Dolphins'], ['susanoo', 'Shimane Susanoo Magic'], ['brave thunders', 'Kawasaki Brave Thunders'], ['corsairs', 'Yokohama B Corsairs'], ['sunrockers', 'SunRockers Shibuya'], ['dragonflies', 'Hiroshima Dragonflies'], ['crane thunders', 'Gunma Crane Thunders'], ['mikawa', 'SeaHorses Mikawa'], ['evessa', 'Osaka Evessa'], ['hannaryz', 'Kyoto Hannaryz'], ['levanga', 'Levanga Hokkaido'], ['happinets', 'Akita Northern Happinets'], ['89ers', 'Sendai 89ers'], ['robots', 'Ibaraki Robots'], ['alphas', 'Koshigaya Alphas'], ['altiri', 'Altiri Chiba'], ['neophoenix', 'San-en NeoPhoenix'], ['fe nagoya', 'Fighting Eagles Nagoya'], ['lakes', 'Shiga Lakes'], ['grouses', 'Toyama Grouses'], ['ballooners', 'Saga Ballooners'], ['velca', 'Nagasaki Velca']]
};
const SPORT = { npb: 'Baseball', kbo: 'Baseball', cpbl: 'Baseball', euroleague: 'Basketball', bleague: 'Basketball' };

const leagues = {};
for (const [key, l] of Object.entries(LEAGUES)) {
  if (l.espn) {
    const data = get(`https://site.api.espn.com/apis/site/v2/sports/${l.espn}/scoreboard`);
    const logos = data?.leagues?.[0]?.logos || [];
    const href = (logos.find(x => x.rel?.includes('dark')) || logos[0])?.href;
    if (href) leagues[key] = href;
  } else if (TSDB_LEAGUES[key]) {
    const x = get(`${TSDB}/lookupleague.php?id=${TSDB_LEAGUES[key]}`)?.leagues?.[0];
    if (x?.strBadge) leagues[key] = x.strBadge;
  }
  console.log(key, leagues[key] || '—');
}
const teams = {};
for (const [league, list] of Object.entries(TEAMS)) {
  teams[league] = [];
  for (const [word, name] of list) {
    const found = (get(`${TSDB}/searchteams.php?t=${encodeURIComponent(name)}`)?.teams || []).find(x => x.strSport === SPORT[league] && x.strBadge);
    if (found) teams[league].push([word, found.strBadge]);
    console.log(league, word, found?.strBadge || '—');
  }
}

const out = `// Logos the feeds leave out: each league's, and the team badges of the
// leagues Kambi carries (its feed has names only). Made by
// Shared-Proxy/tools/logos.mjs (ESPN's league logos, TheSportsDB's badges):
// run it again when a league changes its teams.
export const LEAGUE_LOGOS = ${JSON.stringify(leagues, null, 1)};

// [the word(s) in the team's name, badge]
export const TEAM_BADGES = ${JSON.stringify(teams, null, 1)};

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
export const leagueLogoOf = key => LEAGUE_LOGOS[key] || null;
export function teamBadge(league, name) {
  const n = norm(name);
  return (TEAM_BADGES[league] || []).find(([word]) => n.includes(word))?.[1] || null;
}
`;
writeFileSync(new URL('../../Quadra-Fixtures/public/lib/logos.mjs', import.meta.url), out);
console.log('written');
