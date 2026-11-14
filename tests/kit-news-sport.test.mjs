// Orbit News' sports reports matched to Orbit Sports' players and teams
// (kit/news-sport.mjs; Jay 11-13: "do that cross app thing for sports's
// that's news related, for example injury").
import test from 'node:test';
import assert from 'node:assert/strict';
import { sportKind, storyKind, sportsIn, teamWays, namesTeam, playerWays, namesPlayer, newsAbout, cleanSport, storyTitle, SPORT_MS } from '../kit/news-sport.mjs';
import { deskOf, sportDesk } from '../builders/news.js';

const T = (league, name, short, sport) => ({ league, name, short, sport });
const GSW = T('nba', 'Golden State Warriors', 'Warriors', 'basketball');
const ATL = T('mlb', 'Atlanta Braves', 'Braves', 'baseball');
const SFG = T('mlb', 'San Francisco Giants', 'Giants', 'baseball');
const PHI = T('nba', 'Philadelphia 76ers', '76ers', 'basketball');
const KC = T('mlb', 'Kansas City Royals', 'Royals', 'baseball');

test('a story says its kind: an injury, a ban, a coach, a move, or a game', () => {
  assert.equal(sportKind('柯瑞傷勢MRI結果出爐！確診腹斜肌撕裂至少缺席2週'), 'injury');
  assert.equal(sportKind("Warriors' Curry out at least 2 weeks with oblique injury"), 'injury');
  assert.equal(sportKind('史馬特暴力揮拳遭NBA重罰禁賽3場'), 'ban');
  assert.equal(sportKind('Manchester United fires Michael Carrick as head coach'), 'coach');
  assert.equal(sportKind('道奇牛棚大將轉戰勇士！菲利普斯3年11億加盟'), 'move');
  assert.equal(sportKind('Lakers sign veteran guard to one-year deal'), 'move');
  assert.equal(sportKind('勇士108：115輸火箭中止8連勝'), '');
  // (The FA Cup is a cup, not a free agent.)
  assert.equal(sportKind('FA Cup first round: Barnet beat Rochdale'), '');
});

test('a sport is told by its words and by the outlet\'s section in a link', () => {
  assert.deepEqual([...sportsIn('NBA／柯瑞傷退')], ['basketball']);
  assert.ok(sportsIn('https://www.cbssports.com/nba/news/x').has('basketball'));
  assert.ok(sportsIn('Giants quarterback Jaxson Dart').has('other'));
});

test('a team is named in English or Chinese; a bare nickname only where the story is its sport', () => {
  const gsw = teamWays(GSW);
  assert.equal(gsw.zhFull, '金州勇士');
  assert.equal(gsw.zhShort, '勇士');
  assert.ok(namesTeam('NBA／勇士輸球又傷王牌！柯瑞腹部不適退場', gsw));
  assert.ok(namesTeam('Golden State Warriors fall to Rockets', gsw));
  assert.ok(namesTeam('Warriors drop Rockets game as Curry exits (https://www.cbssports.com/nba/news/a)', gsw));
  // (勇士 in baseball is Atlanta's, never Golden State's; and the other way.)
  assert.ok(!namesTeam('道奇牛棚大將轉戰勇士！3年合約，牛棚再補強', gsw));
  assert.ok(namesTeam('道奇牛棚大將轉戰勇士！3年合約，牛棚再補強', teamWays(ATL)));
  // (讀賣巨人 is Yomiuri's; "Giants" with a quarterback is New York's football side.)
  const sfg = teamWays(SFG);
  assert.ok(!namesTeam('日職／讀賣巨人投手入札 挑戰大聯盟', sfg));
  assert.ok(!namesTeam('Giants quarterback Jaxson Dart in concussion protocol', sfg));
  assert.ok(namesTeam('MLB／巨人簽下自由球員投手', sfg));
  // (皇家馬德里 isn't the Royals.)
  assert.ok(!namesTeam('西甲／皇家馬德里3比0 姆巴佩梅開二度', teamWays(KC)));
  // Other names: the Sixers, 七六人.
  assert.ok(namesTeam('Sixers coach Nick Nurse explains LeBron James sitting (NBA)', teamWays(PHI)));
  assert.ok(namesTeam('詹皇領軍七六人對決暴龍', teamWays(PHI)));
  // The AI's reading of a Chinese story.
  assert.ok(namesTeam('勇者無敵', gsw, { p: [], t: ['Golden State Warriors'] }));
});

test('a player by his whole name, his surname beside his team, or the AI\'s reading; never a plain word', () => {
  const curry = playerWays({ name: 'Stephen Curry', team: GSW });
  assert.ok(namesPlayer("Stephen Curry out at least 2 weeks", curry));
  assert.ok(namesPlayer('Curry負傷提前退場 勇士八連勝止步', curry));
  assert.ok(!namesPlayer('Curry chicken recipes for the cold', curry));
  // (His first name short as written, never another's.)
  assert.ok(namesPlayer('Steph Curry calls out former NBA pros', curry));
  assert.ok(!namesPlayer('Seth Curry signs with Hornets', curry));
  assert.ok(namesPlayer('柯瑞傷勢MRI結果出爐', curry, { p: ['Steph Curry'], t: [] }));
  assert.ok(!namesPlayer('柯瑞傷勢MRI結果出爐', curry, { p: ['Seth Curry'], t: [] }));
  // (A surname that's a word is never matched alone: Brown, James.)
  const brown = playerWays({ name: 'Jaylen Brown', team: T('nba', 'Boston Celtics', 'Celtics', 'basketball') });
  assert.ok(!namesPlayer('Celtics fans in brown coats; Brown leads NBA rookies', brown));
  // (A suffix isn't the surname.)
  assert.equal(playerWays({ name: 'Jaren Jackson Jr.' }).surname, 'jackson');
  // His own Chinese name (the CPBL's).
  assert.ok(namesPlayer('中職／林安可續約 統一獅', playerWays({ name: 'An-Ko Lin', zh: '林安可' })));
});

const NOW = Date.parse('2026-11-13T00:00:00Z');
const story = (id, title, at, extra = {}) => ({ id, title, at, by: 'udn', n: 1, items: [['udn', title, `https://udn.com/news/story/${id}`, at]], ...extra });
const pack = cleanSport({
  built: NOW,
  tw: [
    story('a1', 'NBA／勇士108：115輸火箭 中止8連勝', NOW - 3_600_000, { k: '' }),
    story('a2', '柯瑞傷勢MRI結果出爐！確診腹斜肌撕裂', NOW - 7_200_000, { k: 'injury', who: { p: ['Stephen Curry'], t: ['Golden State Warriors'] } }),
    story('a3', 'NBA／勇士簽下自由球員', NOW - 9_000_000, { k: 'move' }),
    story('old', 'NBA／勇士一週前的消息', NOW - SPORT_MS - 1, { k: '' }),
    { id: 'bad', title: 1 }
  ],
  intl: [story('b1', 'Houston Rockets beat Golden State Warriors', NOW - 1_800_000, { k: '' })]
});

test('a page\'s stories: a player\'s own first, then by kind, injury first, then newest; three days at most', () => {
  assert.equal(pack.list.length, 5);
  assert.equal(pack.list.find(s => s.id === 'a2').who.p[0], 'Stephen Curry');
  const team = newsAbout(pack, { teams: [GSW], now: NOW });
  // (The world's outlets first, Jay 11-14.)
  assert.deepEqual(team.map(s => s.id), ['b1', 'a2', 'a3', 'a1']);
  const player = newsAbout(pack, { players: [{ name: 'Stephen Curry', team: GSW }], teams: [GSW], now: NOW, most: 2 });
  assert.deepEqual(player.map(s => s.id), ['a2', 'b1']);
  // A game: both sides named.
  const game = newsAbout(pack, { teams: [GSW, T('nba', 'Houston Rockets', 'Rockets', 'basketball')], both: true, now: NOW });
  assert.deepEqual(game.map(s => s.id), ['b1', 'a1']);
  // Only these kinds.
  assert.deepEqual(newsAbout(pack, { teams: [GSW], kinds: ['injury'], now: NOW }).map(s => s.id), ['a2']);
  assert.deepEqual(newsAbout(pack, { teams: [], players: [], now: NOW }), []);
});

test('a story\'s title in the reader\'s language where the AI made one', () => {
  assert.deepEqual(storyTitle({ title: 'Curry out 2 weeks', zh: '柯瑞至少缺陣兩週' }, 'zh'), ['柯瑞至少缺陣兩週', 'zh-Hant']);
  assert.deepEqual(storyTitle({ title: 'Curry out 2 weeks' }, 'zh'), ['Curry out 2 weeks', 'en']);
  assert.deepEqual(storyTitle({ title: '柯瑞缺陣', en: 'Curry out' }, 'en'), ['Curry out', 'en']);
});

test('the builder keeps one outlet\'s sports report, never a story on News\' pages, for Sports\' links', () => {
  const at = NOW - 3_600_000;
  const items = [
    { o: 'cna', t: 'NBA／柯瑞腹斜肌撕裂 至少缺陣兩週', u: 'https://www.cna.com.tw/news/aspt/1.aspx', at, d: '' },
    { o: 'ltn', t: '立法院三讀通過電業法修正案', u: 'https://news.ltn.com.tw/news/politics/1', at, d: '' }
  ];
  const out = deskOf(items, [], NOW);
  assert.equal(out.tw.length, 0, 'not News\' story: one outlet');
  assert.equal(out.sport.tw.length, 1);
  assert.equal(out.sport.tw[0].k, 'injury');
  assert.equal(out.sport.tw[0].title, 'NBA／柯瑞腹斜肌撕裂 至少缺陣兩週');
  // (A sport Sports never shows is left out; the newest first; no score kept.)
  const desk = sportDesk([{ id: 'n', title: 'NFL: Giants quarterback out', at: 2, items: [], score: 1 }, { id: 'm', title: 'NBA: Warriors win', at: 3, items: [], score: 1, light: 0 }], 10);
  assert.deepEqual(desk.map(s => s.id), ['m']);
  assert.ok(!('score' in desk[0]) && !('light' in desk[0]));
});

test("a story the AI has read is about whom it says and its own words name, never a team only in one of its links (Jay 11-13: Dončić's ankle under the Warriors v Spurs)", () => {
  const now = Date.parse('2026-11-13T08:00Z');
  const luka = {
    id: 'luka',
    title: "Lakers' Luka Dončić 'feeling good' after injury scare, per report",
    zh: '東契奇傷勢更新：湖人球星扭傷腳踝',
    sum: 'Los Angeles Lakers star Luka Dončić had an injury scare against the Milwaukee Bucks.',
    items: [['x', 'Luka Doncic’s 32 points help Lakers beat Hawks; Wembanyama powers Spurs', 'https://www.aljazeera.com/sports/2026/11/10/nba-doncic-lakers-wembanyama-spurs-curry-warriors']],
    at: now - 3_600_000,
    k: 'injury',
    who: { p: ['Luka Dončić'], t: ['Los Angeles Lakers', 'Milwaukee Bucks'] }
  };
  const pack = cleanSport({ intl: [luka] });
  const SAS = T('nba', 'San Antonio Spurs', 'Spurs', 'basketball');
  assert.equal(newsAbout(pack, { teams: [GSW, SAS], kinds: ['injury'], now }).length, 0);
  assert.equal(newsAbout(pack, { teams: [T('nba', 'Los Angeles Lakers', 'Lakers', 'basketball')], now }).length, 1);
  // (Not read yet: its links still count, as before.)
  const unread = cleanSport({ intl: [{ ...luka, who: null }] });
  assert.equal(newsAbout(unread, { teams: [SAS], now }).length, 1);
});

test("a story's kind is its headline's: a trade is a move whatever injury led to it, a summary's injury never tags it (Jay 11-13)", () => {
  assert.equal(storyKind({ title: '勇士致電公牛醞釀交易補強 鎖定場均12.8分7.4籃板大前鋒史密斯', sum: '在當家一哥柯瑞驚傳腹斜肌撕裂…' }), 'move');
  assert.equal(storyKind({ title: 'NBA／柯瑞倒下勇士加速交易？美媒點名「2長人」', en: 'After Curry injury, Warriors look to trade' }), 'move');
  assert.equal(storyKind({ title: '柯瑞傷勢更新，勇士考慮補強' }), 'injury');
  assert.equal(storyKind({ title: "Marcus Smart called out for 'fake toughness' after throwing punch at Warriors' Charles Bassey", zh: '史馬特揮拳遭驅逐 恐再遭處分' }), 'ban');
  assert.equal(storyKind({ title: '賀中華隊亞冠賽奪首勝！必勝客披薩買大送大', en: 'Pizza Hut offers a 666-yuan deal after the win' }), '');
  assert.equal(storyKind({ title: 'Mauricio Pochettino announced as new Manchester United manager' }), 'coach');
});

test("the clubs a story is about are the AI's `a` where it gave them; an opponent named in passing is none of its (Jay 11-13: 威爾森's fracture under 勇士 v 馬刺)", () => {
  const now = Date.parse('2026-11-13T12:00Z');
  const SAS = T('nba', 'San Antonio Spurs', 'Spurs', 'basketball');
  const CHI = T('nba', 'Chicago Bulls', 'Bulls', 'basketball');
  const MIA = T('nba', 'Miami Heat', 'Heat', 'basketball');
  const HOU = T('nba', 'Houston Rockets', 'Rockets', 'basketball');
  const wilson = { id: 'w', title: 'Caleb Wilson out 4-6 weeks with hand fracture in big Bulls blow', zh: '威爾森手部骨折，缺陣4-6週', sum: "Bulls rookie Caleb Wilson will miss 4 to 6 weeks after a fractured right hand suffered in Wednesday's loss to the Spurs.", items: [['reuters', 'Minus injured rookie Caleb Wilson, Bulls encounter restless Hawks', 'https://www.reuters.com/sports/basketball/minus-injured-rookie-caleb-wilson-bulls-encounter-restless-hawks'], ['ap', 'Wembanyama, Harper lead Spurs past Bulls', 'https://apnews.com/article/spurs-bulls']], at: now - 3_600_000, who: { p: ['Caleb Wilson'], t: ['Chicago Bulls', 'Atlanta Hawks'] } };
  const smart = { id: 's', title: '史馬特暴力揮拳遭NBA重罰禁賽3場 對爵士、巫師與熱火3戰不能打', items: [], at: now - 3_600_000, who: { p: ['Marcus Smart'], t: ['Utah Jazz', 'Washington Wizards', 'Miami Heat'], a: ['Houston Rockets'] } };
  const pack = cleanSport({ intl: [wilson], tw: [smart] });
  assert.deepEqual(newsAbout(pack, { teams: [SAS], now }).map(s => s.id), [], 'the Spurs only in its summary');
  assert.deepEqual(newsAbout(pack, { teams: [CHI], now }).map(s => s.id), ['w']);
  assert.deepEqual(newsAbout(pack, { teams: [T('nba', 'Atlanta Hawks', 'Hawks', 'basketball')], now }).map(s => s.id), [], 'one of several the AI names, not in its title');
  assert.deepEqual(newsAbout(pack, { teams: [MIA], now }).map(s => s.id), [], 'the Heat only as a game he misses');
  assert.deepEqual(newsAbout(pack, { teams: [HOU], now }).map(s => s.id), ['s']);
});

test("a game's news: the world's sports outlets first, Taiwan's filling in; a guide to the day's games, a betting tip or a round-up with another event is none of it (Jay 11-14)", () => {
  const now = Date.parse('2026-11-14T02:00Z');
  const PHI = T('nba', 'Philadelphia 76ers', '76ers', 'basketball');
  const TOR = T('nba', 'Toronto Raptors', 'Raptors', 'basketball');
  const a = ['Philadelphia 76ers', 'Toronto Raptors'];
  const st = (id, title, region, extra = {}) => ({ id, title, items: [['x', title, 'https://example.com/nba/x']], at: now - 20 * 3_600_000, region, who: { p: [], t: a, a }, ...extra });
  const pack = cleanSport({
    tw: [
      st('guide', '詹皇領軍七六人對決暴龍 台灣亞冠賽戰澳洲搶勝 今日賽事預告與轉播', 'tw', { who: { p: [], t: [...a, 'Chinese Taipei'], a: [...a, 'Chinese Taipei'] } }),
      st('bet', '運彩報報－七六人對暴龍 首推讓分', 'tw'),
      st('tw1', 'NBA/七六人驚天逆轉 三巨頭合砍65分痛宰暴龍', 'tw'),
      st('tw2', '詹皇再休兵沒差 七六人上演17分逆轉秀擊退暴龍', 'tw')
    ],
    // (Its last report a day and more after the game: still the game's, by its first.)
    intl: [st('w1', 'Tyrese Maxey, reserves help 76ers pull away from Raptors', 'intl', { first: now - 30 * 3_600_000, at: now })]
  });
  const at = now - 26 * 3_600_000;
  const got = newsAbout(pack, { teams: [PHI, TOR], both: true, from: at - 3 * 86_400_000, to: at + 86_400_000, now });
  assert.deepEqual(got.map(s => s.id), ['w1', 'tw1']);
});
