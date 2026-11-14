// Orbit News' builder (builders/news.js): feeds read whatever their kind,
// headlines grouped into stories, each story's sides counted from the
// outlets' places (kit/news-outlets.mjs), kept across builds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { piecesOf, teamsOf, otherGame, placesOf, placeHints, marksAll, gameOf, unboiled, ALTS, CLIPS_SHOWN, CLIP_LOOSE, CLIP_NEAR, bing, laOffset, frontOf, TOPIC_MIN, TOPIC_MIN_OF, parseFeed, feedsDue, FEEDS, cleanTitle, newsUrl, cleanUrl, groupStories, storyOf, storiesOf, deskOf, runNews, NEWS_PATH, NEWS_PAST, NEWS_STATE, idOf, undated, fillerOf, softOf, pageOf, sameOf, bigPicture, isVideo, pagesToRead, CLIPS_AT, CLIPS_HERE, CLIP_READS, PAGE_READS, clipsToRead, withClips, newsClips, NEWS_CLIPS, newsSite, NEWS_SITE, CHANNELS, parseChannel, clipTitle, ytFeed, reportOf, reportsOwner, otherReport, BURST, LIVE_NEW, LIVE_TURN, blindOf, oneSidedOf } from '../builders/news.js';
import { OUTLETS, sideOf, partiesIn, topicsOf, TOPICS, SPORTS_OUTLETS } from '../kit/news-outlets.mjs';

const H = 3_600_000;
const NOW = Date.parse('2026-11-10T03:00:00Z');

test('RSS, Atom, RDF and a news sitemap are all read', () => {
  const rss = `<rss><channel><item><title><![CDATA[川普：黃仁勳不知情 FBI查明中]]></title><link>https://a.tw/1?utm_source=x</link><description><![CDATA[<p>美國總統川普說&amp;FBI正在查。</p>]]></description><pubDate>Tue,10 Nov 2026 09:39:00  +0800</pubDate><media:content url="https://img.a.tw/1.jpg" medium="image"/></item></channel></rss>`;
  const [r] = parseFeed(rss);
  assert.equal(r.t, '川普：黃仁勳不知情 FBI查明中');
  assert.equal(r.d, '美國總統川普說&FBI正在查。');
  assert.equal(r.at, Date.parse('2026-11-10T01:39:00Z'));
  assert.equal(r.img, 'https://img.a.tw/1.jpg');
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>公視標題</title><link rel="alternate" href="https://news.pts.org.tw/article/1"/><summary>摘要</summary><updated>2026-11-10T09:00:00+08:00</updated></entry></feed>`;
  assert.deepEqual(parseFeed(atom).map(x => [x.t, x.u, x.d]), [['公視標題', 'https://news.pts.org.tw/article/1', '摘要']]);
  const rdf = `<rdf:RDF><item rdf:about="https://dw.com/a"><title>DW title</title><link>https://dw.com/a</link><dc:date>2026-11-10T02:00:00Z</dc:date></item></rdf:RDF>`;
  assert.equal(parseFeed(rdf)[0].at, Date.parse('2026-11-10T02:00:00Z'));
  const map = `<urlset><url><loc>https://news.tvbs.com.tw/politics/1</loc><news:news><news:publication_date>2026-11-10T10:36:53+08:00</news:publication_date><news:title>TVBS 標題</news:title></news:news></url></urlset>`;
  assert.deepEqual(parseFeed(map, 'map').map(x => [x.t, x.u]), [['TVBS 標題', 'https://news.tvbs.com.tw/politics/1']]);
});

test('a time without its zone is Taiwan\'s; a slow feed is read in its turn', () => {
  const rss = `<rss><channel><item><title>iThome</title><link>https://www.ithome.com.tw/news/1</link><pubDate>2026-11-10  12:11:45</pubDate></item></channel></rss>`;
  assert.equal(parseFeed(rss)[0].at, Date.parse('2026-11-10T04:11:45Z'));
  const feeds = { a: [['https://a/1', 'rss'], ['https://a/2', 'rss', 3]], b: [['https://b/1', 'rss', 2]] };
  const seen = [0, 1, 2, 3, 4, 5].map(k => feedsDue(feeds, k * 600_000).map(f => f[1]));
  assert.ok(seen.every(list => list.includes('https://a/1')));
  assert.equal(seen.filter(list => list.includes('https://a/2')).length, 2);
  assert.equal(seen.filter(list => list.includes('https://b/1')).length, 3);
  // (Every outlet has a feed; a build reads about 80 of them.)
  for (const o of Object.keys(OUTLETS)) assert.ok(FEEDS[o]?.length, o);
  assert.ok(feedsDue(FEEDS, NOW).length < 90);
});

test("an outlet's own marks come off a headline; full-width marks stay", () => {
  assert.equal(cleanTitle('【快訊】國1追撞 全線封閉'), '國1追撞 全線封閉');
  assert.equal(cleanTitle('《航運股》華航奪獎'), '華航奪獎');
  assert.equal(cleanTitle('影／黃仁勳外遇！川普：他很痛苦｜TVBS新聞網'), '黃仁勳外遇！川普：他很痛苦');
  assert.equal(cleanTitle('MLB》新人王出爐！'), '新人王出爐！');
  assert.equal(cleanTitle('Krakow suspect dies - BBC News'), 'Krakow suspect dies');
  // A summary's dateline comes off too.
  assert.equal(undated('（中央社記者張榮祥台南10日電）國道1號南向303.4公里'), '國道1號南向303.4公里');
  assert.equal(undated('(記者王小明／台北報導) 立法院今天'), '立法院今天');
  assert.equal(undated('（圖）不是電頭'), '（圖）不是電頭');
});

test('entertainment, sport, opinion and stock tips are left out; trackers come off', () => {
  assert.equal(newsUrl('https://ent.ltn.com.tw/news/1'), false);
  assert.equal(newsUrl('https://news.tvbs.com.tw/entertainment/1'), false);
  assert.equal(newsUrl('https://www.chinatimes.com/realtimenews/20261110001666-260410'), false);
  assert.equal(newsUrl('https://www.chinatimes.com/realtimenews/20261110001600-260407'), true);
  assert.equal(newsUrl('https://news.ltn.com.tw/news/politics/breakingnews/1'), true);
  assert.equal(cleanUrl('https://a.tw/1?utm_source=rss&id=3#top'), 'https://a.tw/1?id=3');
});

const item = (o, t, at, extra = {}) => ({ o, t, u: `https://${o}.example/${encodeURIComponent(t)}`, d: '', at, img: '', ...extra });

test('the same news in other words is one story; other news stays apart', () => {
  const items = [
    item('cna', '川普：黃仁勳不知婚外情對象涉共諜 FBI查明中', NOW - 3 * H),
    item('ctinews', '黃仁勳婚外情對象涉共諜？川普稱「他不知情」 FBI調查中', NOW - 2.8 * H),
    item('setn', '黃仁勳外遇後首交談！川普曝他「不知黃樂涉共諜」：FBI查明中', NOW - 2.5 * H),
    // (One morning's crash, as seven outlets wrote it.)
    item('cna', '國1台南麻豆段2聯結車追撞2傷 車道封閉回堵2公里', NOW - 2 * H),
    item('ebc', '國1麻豆段聯結車追撞側翻！全線封閉2傷急搶救', NOW - 1.95 * H),
    item('ettoday', '國1麻豆段2聯結車追撞！1車打橫側翻2送醫 南下全線封閉', NOW - 1.92 * H),
    item('tvbs', '國1麻豆段大車猛撞「折甘蔗」橫躺堵死全線封閉、2人急送醫', NOW - 1.9 * H),
    item('setn', '國1重大事故！多車追撞傷亡不明 下營系統-麻豆全線封閉', NOW - 1.85 * H),
    item('udn', '國一多車追撞嚴重事故6人送醫 南向下營系統至麻豆間全線封閉', NOW - 1.8 * H),
    item('ctinews', '國1出事了！台南麻豆「大車追撞翻覆碎裂」釀全線封閉', NOW - 1.7 * H),
    item('pts', '易遊網遭駭逾69萬人個資外洩 業者：不含身分證、信用卡號', NOW - H)
  ];
  const groups = groupStories(items, 'zh').map(g => g.map(x => x.o).sort().join(','));
  assert.ok(groups.includes('cna,ctinews,setn'), groups.join(' | '));
  assert.ok(groups.includes('cna,ctinews,ebc,ettoday,setn,tvbs,udn'), groups.join(' | '));
  assert.ok(groups.includes('pts'), groups.join(' | '));
});

test("one company's monthly or quarterly report is never another's story (10月, 前三季, 股本, EPS shared by all)", () => {
  const items = [
    item('newtalk', '中華電10月營收237.5億元創同期新高 EPS達0.46元', NOW - 5 * H),
    item('tvbs', '聯發科10月營收550.26億、月減0.67% Q4 ASIC將挹注營收', NOW - 4.9 * H),
    item('ctinews', '聯發科10月營收550.26億元！AI、ASIC助力Q4挑戰新高', NOW - 4.8 * H),
    item('technews', '宜特10月營收月增0.3%', NOW - 4.7 * H),
    item('technews', '志超10月營收月增6.1%', NOW - 4.65 * H),
    item('udn', '祥碩前三季賺近八股本', NOW - 4.45 * H),
    item('cna', '和碩10月營收1880億寫單月次高 AI伺服器動能助攻', NOW - 4.6 * H),
    item('tvbs', '陽明Q3賺逾半個股本 EPS 5.32元創11季新高', NOW - 4.5 * H),
    item('udn', '奇鋐前三季賺七股本', NOW - 4.4 * H),
    item('technews', '醫美版圖邁入收割期！霈方國際今年前三季大賺逾一個股本', NOW - 4.3 * H),
    item('ltn', '陽明第3季賺贏上半年 EPS 5.32元創11季新高', NOW - 4.2 * H)
  ];
  const groups = groupStories(items, 'zh').map(g => g.map(x => x.t.slice(0, 2)).sort().join(','));
  assert.deepEqual(groups.sort(), ['中華', '和碩', '奇鋐', '宜特', '志超', '祥碩', '聯發,聯發', '醫美', '陽明,陽明'].sort(), groups.join(' | '));
});

test('English: forms of a word meet (impeach, impeachment), summaries help', () => {
  const items = [
    item('bbc', 'US congressman files resolution to impeach Defence Secretary Pete Hegseth', NOW - 5 * H, { d: 'A Republican lawmaker says he will force a vote on removing Hegseth over the Iran war.' }),
    item('fox', 'US Pentagon chief Hegseth faces impeachment push over Iran war', NOW - 4 * H, { d: 'A resolution to impeach Hegseth was filed in the House.' }),
    item('nyt', 'Krakow mass shooting suspect dies in hospital', NOW - 3 * H, { d: 'Police in Poland said the gunman died.' })
  ];
  const groups = groupStories(items, 'en').map(g => g.map(x => x.o).sort().join(','));
  assert.ok(groups.includes('bbc,fox'), groups.join(' | '));
});

test("a story counts outlets by side; 單邊 names the end that left out, or all but, a story the other end carries widely", () => {
  const blueOuts = ['chinatimes', 'ctinews', 'udn', 'tvbs', 'ebc'];
  const blue = blueOuts.map((o, i) => ({ ...item(o, `公督盟辱柯志恩「聽話的狗」${i}`, NOW - 4 * H + i), near: 0.5 }));
  const mid = ['cna', 'pts', 'storm'].map((o, i) => ({ ...item(o, `公督盟辱柯志恩${i}`, NOW - 3 * H + i), near: 0.6 }));
  const s = storyOf([...blue, ...mid], 'tw', NOW);
  assert.deepEqual(s.sides, { g: 0, c: 3, b: 5 });
  assert.equal(s.blind, 'g');
  assert.equal(s.n, 8);
  // A token one of the other side's doesn't put it back (Jay 11-14: "if just one of the other side report it it's not in 單邊?").
  assert.equal(storyOf([...blue, ...mid, { ...item('ltn', '柯志恩', NOW - 3 * H), near: 0.4 }], 'tw', NOW).blind, 'g');
  // Not one-sided while it's new (the other side may still come).
  assert.equal(storyOf([...blue, ...mid].map(x => ({ ...x, at: NOW - H })), 'tw', NOW).blind, '');
  // Carried by a few only: not 單邊 (11-14's were mostly 3 and 4 outlets' small news).
  assert.equal(storyOf(blue.slice(0, 3), 'tw', NOW).blind, '');
  // A story's first headline's id stays its id as headlines join it.
  assert.equal(s.id, idOf(blue[0].u));
  // A kind sides don't take (a game): never one-sided, and ranked lighter.
  const game = blueOuts.concat(['cna', 'pts', 'storm']).map((o, i) => ({ ...item(o, `中華隊經典賽奪冠${i}`, NOW - 4 * H + i), near: 0.5 }));
  const g = storyOf(game, 'tw', NOW);
  assert.deepEqual(g.topics, ['sport']);
  assert.equal(g.blind, '');
  assert.ok(g.imp < s.imp);
});

test('單邊 by proportion: a token one or two of the other end, its lead past the day\'s, important stories only', () => {
  // (11-14's front: the Gaza hospital strike 20 to 2, Trump on Cuba 2 to 8.)
  assert.equal(blindOf({ l: 20, c: 5, r: 2 }, 'intl', 1.54), 'r');
  assert.equal(blindOf({ l: 2, c: 4, r: 8 }, 'intl', 1.54), 'l');
  assert.equal(blindOf({ g: 5, c: 5, b: 0 }, 'tw', 0.92), 'b');
  // Three of the other end: both sides carry it.
  assert.equal(blindOf({ l: 9, c: 2, r: 3 }, 'intl', 1), '');
  // One in 8 of a big story's is still a token: 30 to 3.
  assert.equal(blindOf({ l: 30, c: 4, r: 3 }, 'intl', 1), 'r');
  // A lead not far past the day's: the world's left wrote 1.5 times the right's, 5 to 1 is not one-sided there; where the right wrote more, it is.
  assert.equal(blindOf({ l: 5, c: 4, r: 1 }, 'intl', 1.54), '');
  assert.equal(blindOf({ l: 5, c: 4, r: 1 }, 'intl', 0.8), 'r');
  // Fewer than 8 outlets on the ends: too small to say.
  assert.equal(blindOf({ g: 4, c: 2, b: 0 }, 'tw', 1), '');
  // The region's pass: weighed against the front (here the right well ahead), the less important let go.
  const st = (imp, sides) => ({ imp, sides, blind: blindOf(sides, 'intl', 1, 0) });
  const front = [st(40, { l: 2, c: 4, r: 8 }), st(10, { l: 6, c: 2, r: 0 }), st(30, { l: 0, c: 3, r: 9 }), st(25, { l: 3, c: 5, r: 9 }), st(20, { l: 3, c: 3, r: 8 })];
  const was = oneSidedOf(front, 'intl');
  assert.ok(was.base < 0.5);
  assert.equal(was.mid, 25);
  assert.deepEqual(front.map(s => s.blind), ['', '', 'l', '', '']);
  // The past by the front's measure.
  const past = [st(30, { l: 0, c: 3, r: 9 })];
  oneSidedOf(past, 'intl', was);
  assert.equal(past[0].blind, 'l');
});

test('快訊: a story many outlets carried in the last 2 hours is live and ranked up; a quiet or old one, or a game, is not', () => {
  const outs = ['cna', 'ltn', 'udn', 'chinatimes', 'ctinews', 'tvbs', 'setn', 'ettoday', 'pts', 'storm', 'mirror'];
  const burst = (k, at) => outs.slice(0, k).map((o, i) => ({ ...item(o, `黃仁勳辭輝達執行長 財務長暫代${i}`, at + i), near: 0.5 }));
  const s = storyOf(burst(LIVE_NEW, NOW - H), 'tw', NOW);
  assert.equal(s.live, LIVE_NEW);
  assert.ok(s.score > s.imp * 1.5);
  // (Fewer outlets, or the same burst 3 hours ago: not live, not lifted.)
  assert.equal(storyOf(burst(LIVE_NEW - 1, NOW - H), 'tw', NOW).live, undefined);
  const old = storyOf(burst(LIVE_NEW, NOW - BURST - H), 'tw', NOW);
  assert.equal(old.live, undefined);
  assert.ok(old.score < old.imp);
  // An old story's big new turn: live when LIVE_TURN outlets carry it again.
  const days = [...burst(LIVE_TURN, NOW - 40 * H), ...burst(LIVE_TURN, NOW - 0.5 * H)];
  assert.equal(storyOf(days, 'tw', NOW).live, LIVE_TURN);
  assert.equal(storyOf([...burst(LIVE_NEW, NOW - 40 * H), ...burst(LIVE_NEW, NOW - 0.5 * H)], 'tw', NOW).live, undefined);
  // A game: never 快訊.
  const game = outs.map((o, i) => ({ ...item(o, `中華隊經典賽奪冠${i}`, NOW - H + i), near: 0.5 }));
  assert.equal(storyOf(game, 'tw', NOW).live, undefined);
});

test('outlets: every one has a place and a reason; only state media and the sports outlets stand apart', () => {
  for (const o of Object.values(OUTLETS)) {
    assert.ok(o.basis.length, o.id);
    // (The sports outlets on no scale, Jay 11-14: "let them be alone".)
    if (SPORTS_OUTLETS.has(o.id)) {
      assert.equal(sideOf(o, o.region), null, o.id);
      continue;
    }
    if (o.region === 'tw') assert.ok([-2, -1, 0, 1, 2].includes(o.tw), o.id);
    // (No 未評 left, Jay 11-10: AllSides, else Media Bias/Fact Check.)
    if (o.kind === 'state') assert.equal(sideOf(o, 'intl'), null, o.id);
    else assert.ok(sideOf(o, o.region), o.id);
  }
  assert.equal(sideOf('ltn', 'tw'), 'g');
  assert.equal(sideOf('chinatimes', 'tw'), 'b');
  assert.equal(sideOf('fox', 'intl'), 'r');
  assert.equal(sideOf('dw', 'intl'), 'c');
  // (No Chinese state media read, Jay 11-14.)
  assert.ok(!Object.values(OUTLETS).some(o => o.kind === 'state' || /globaltimes|cgtn|news\.cn/.test(o.site || '')));
  assert.deepEqual(partiesIn('藍白合作 民進黨團回應'), ['g', 'b', 'w']);
  assert.deepEqual(partiesIn('KMT and DPP lawmakers clash'), ['g', 'b']);
});

test('a build reads every feed, keeps what it read, never writes an empty page over a good one', async () => {
  const files = new Map();
  const store = { json: async p => files.get(p) ?? null, put: async (p, d) => (files.set(p, JSON.parse(JSON.stringify(d))), true) };
  const rss = list => `<rss><channel>${list.map(([t, h]) => `<item><title>${t}</title><link>https://x.example/${encodeURIComponent(t)}</link><pubDate>${new Date(NOW - h * H).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
  const feeds = { cna: [['https://cna/1', 'rss']], ctinews: [['https://cti/1', 'rss']], setn: [['https://setn/1', 'rss']] };
  const bodies = {
    'https://cna/1': rss([['川普：黃仁勳不知婚外情對象涉共諜 FBI查明中', 3]]),
    'https://cti/1': rss([['黃仁勳婚外情對象涉共諜？川普稱「他不知情」 FBI調查中', 2]]),
    'https://setn/1': rss([['黃仁勳外遇後首交談！川普曝他「不知黃樂涉共諜」：FBI查明中', 1]])
  };
  const fetchImpl = async url => new Response(bodies[url], { status: 200, headers: { ETag: `"${url}"` } });
  const r = await runNews({ store, now: NOW, fetchImpl, feeds, channels: {} });
  assert.equal(r.items, 3);
  const page = files.get(NEWS_PATH);
  assert.equal(page.tw.length, 1);
  assert.deepEqual(page.tw[0].sides, { g: 1, c: 1, b: 1 });
  // The next build: every feed unchanged (304), the kept headlines still make the story.
  const r2 = await runNews({ store, now: NOW + 600_000, fetchImpl: async () => new Response(null, { status: 304 }), feeds, channels: {} });
  assert.equal(r2.items, 3);
  assert.equal(files.get(NEWS_PATH).tw.length, 1);
  // Every feed failing, nothing kept: the page stays as it was.
  files.set(NEWS_STATE, { items: [], etag: {} });
  const before = files.get(NEWS_PATH);
  const r3 = await runNews({ store, now: NOW + 1_200_000, fetchImpl: async () => new Response('', { status: 500 }), feeds, channels: {} });
  assert.equal(r3.failed.length, 3);
  assert.equal(files.get(NEWS_PATH), before);
  assert.ok(files.get(NEWS_PAST));
  // One feed of three failing: a normal build, the miss noted (YouTube's feeds 404 a channel at a time).
  const one = async url => (url === 'https://setn/1' ? new Response('', { status: 404 }) : new Response(bodies[url], { status: 200 }));
  const r4 = await runNews({ store, now: NOW + 1_800_000, fetchImpl: one, feeds, channels: {} });
  assert.equal(r4.failed, undefined);
  assert.deepEqual(r4.missed, ['setn: 404']);
  // Every YouTube channel's feed 404 while the stories' feeds answer: still a good build.
  const yt = async url => (/youtube/.test(url) ? new Response('', { status: 404 }) : new Response(bodies[url], { status: 200 }));
  const r5 = await runNews({ store, now: NOW + 2_400_000, fetchImpl: yt, feeds, channels: { setn: 'UC1', cna: 'UC2', ctinews: 'UC3' } });
  assert.equal(r5.failed, undefined);
  assert.ok(r5.missed?.some(m => /clips/.test(m)), "the clips were asked");
});

test('only stories two outlets or more carry are listed, the widest and newest first', () => {
  const items = [
    item('cna', '易遊網遭駭逾69萬人個資外洩', NOW - H),
    item('tvbs', '易遊網遭駭！逾69萬人個資外洩', NOW - H),
    item('ltn', '易遊網遭駭 69萬人個資外洩', NOW - H),
    item('pts', '颱風山陀兒逼近 東部豪雨', NOW - 2 * H),
    item('udn', '颱風山陀兒逼近 東部嚴防豪雨', NOW - 2 * H),
    item('setn', '只有一家報的事', NOW - H)
  ];
  const s = storiesOf(items, 'tw', NOW);
  assert.deepEqual(s.map(x => x.n), [3, 2]);
});

test('filler is left out by its section or its words; light headlines are told apart', () => {
  assert.equal(fillerOf({ u: 'https://udn.com/news/story/7268/1', t: '今日運勢' }, 'zh'), 'section');
  assert.equal(fillerOf({ u: 'https://x.tw/1', t: '12星座本週運勢 這3星座財運旺' }, 'zh'), 'fortune');
  assert.equal(fillerOf({ u: 'https://x.tw/1', t: '威力彩頭獎槓龜 下期上看5億' }, 'zh'), 'lottery');
  assert.equal(fillerOf({ u: 'https://x.tw/1', t: '女星曬比基尼身材 網友暴動' }, 'zh'), 'celebrity');
  // (Sport is news now, Jay 11-10.)
  assert.equal(fillerOf({ u: 'https://x.tw/1', t: 'NBA／勇士逆轉湖人' }, 'zh'), '');
  assert.ok(newsUrl('https://www.chinatimes.com/realtimenews/20261110000001-260403'));
  assert.equal(fillerOf({ u: 'https://x.tw/1', t: '立法院三讀通過預算案' }, 'zh'), '');
  assert.equal(fillerOf({ u: 'https://x.com/1', t: 'Powerball jackpot climbs to $900 million' }, 'en'), 'lottery');
  assert.equal(fillerOf({ u: 'https://x.com/1', t: 'Senate passes the budget' }, 'en'), '');
  // (11-14: routine wraps glued China's drills and Xi's speech under 「Taiwan shares close up」.)
  assert.equal(fillerOf({ u: 'https://x.com/1', t: 'Taiwan shares close up 1.35%' }, 'en'), 'roundup');
  assert.equal(fillerOf({ u: 'https://x.com/1', t: 'Taiwan News Quick Take' }, 'en'), 'roundup');
  assert.equal(fillerOf({ u: 'https://x.com/1', t: 'Taiwan shares drop as Nvidia scandal hits chipmakers' }, 'en'), '');
  assert.ok(softOf('全聯年菜開賣 買一送一', 'zh'));
  assert.ok(softOf('他退黨原因曝', 'zh'));
  assert.ok(!softOf('卓榮泰不副署老福法', 'zh'));
});

test('topics: the sides\' own, and the kinds past them; a game of Pokémon has none', () => {
  assert.deepEqual(topicsOf(['Pokémon Legends Z-A sales top 10 million'], 'en'), []);
  assert.deepEqual(topicsOf(['國1麻豆段聯結車追撞 全線封閉'], 'zh'), ['life']);
  assert.deepEqual(topicsOf(['NBA／勇士逆轉湖人'], 'zh'), ['sport']);
  // (11-14: Taiwan's 亞冠賽 reports named no sport word, 「亞冠賽不敵日本！韓國慘吞對戰12連敗」 had no topic.)
  assert.equal(topicsOf(['亞冠賽不敵日本！韓國慘吞對戰12連敗 韓媒絕望痛批'], 'zh')[0], 'sport');
  assert.ok(topicsOf(['台日職棒交流賽拍板 明年3／6連兩晚攻大巨蛋'], 'zh').includes('sport'));
  // (11-14: 桃園's shooting, eight outlets, had no topic and wasn't shown.)
  assert.deepEqual(topicsOf(['桃園驚傳槍響！男持鎮暴槍隨機掃射7旬翁 逃基隆落網'], 'zh'), ['law']);
  assert.ok(topicsOf(['奪命瞬間！曳引車右轉撞機車 蘇澳68歲騎士捲輪下送醫不治'], 'zh').includes('life'));
  assert.deepEqual(topicsOf(['金馬獎入圍名單出爐'], 'zh'), ['culture']);
  assert.deepEqual(topicsOf(['NASA telescope spots water on an asteroid'], 'en'), ['sci']);
  assert.deepEqual(topicsOf(['賴清德出席國防論壇', '國軍漢光演習登場'], 'zh'), ['def', 'pol']);
  assert.ok(topicsOf(['台積電10月營收創新高'], 'zh').includes('tech'));
  assert.ok(topicsOf(['Trump tariffs hit Chinese chips'], 'en').includes('eco'));
  // A place abroad, a storm or a factory names a topic only beside another (11-10).
  assert.deepEqual(topicsOf(['土耳其鋼鐵廠爆炸陷火海 疑天車砸熔爐釀16死13傷'], 'zh'), ['life', 'world']);
  assert.deepEqual(topicsOf(['Japan earthquake kills 10'], 'en'), ['life', 'world']);
  assert.deepEqual(topicsOf(['Pokémon fans in Japan line up'], 'en'), []);
  assert.deepEqual(topicsOf(['日本央行宣布升息'], 'zh'), ['eco', 'world']);
  assert.deepEqual(topicsOf(['外媒指立陶宛要求代表處更名 外交部：無更名計畫'], 'zh'), ['world']);
  assert.ok(topicsOf(['Hurricane aid stalls as FEMA cuts staff'], 'en').includes('soc'));
  // (11-12: a fire's 防空污 and the stock market's 國安基金 read as 國防.)
  assert.deepEqual(topicsOf(['新北深夜惡火延燒4廠商 土城、板橋、中和防空污'], 'zh'), ['energy', 'life']);
  assert.deepEqual(topicsOf(['國安基金進場護盤 法人：還需3條件才能真正止跌'], 'zh'), ['eco']);
  assert.ok(topicsOf(['國安局揭共諜案'], 'zh').includes('def'));
  assert.ok(topicsOf(['國軍防空飛彈試射'], 'zh').includes('def'));
  for (const t of TOPICS) assert.ok(t.zh && t.en && t.zh_ instanceof RegExp && t.en_.length, t.id);
  // Not News': a story with no topic isn't listed, however many carry it.
  const game = ['cna', 'ebc', 'tvbs', 'udn'].map((o, i) => item(o, `寶可夢新作預購破百萬套${i}`, NOW - H));
  assert.equal(storiesOf(game, 'tw', NOW).length, 0);
  const crash = ['cna', 'ebc', 'tvbs', 'udn'].map((o, i) => item(o, `國1麻豆段聯結車追撞 全線封閉${i}`, NOW - H));
  assert.deepEqual(storiesOf(crash, 'tw', NOW)[0].topics, ['life']);
});

test("an outlet's page gives its picture and its own YouTube clip; one on every page is its channel's", () => {
  const ld = `<meta property="og:image" content="https://img.pts.org.tw/1.jpg"><script type="application/ld+json">{"@type":"VideoObject","embedUrl":"https:\/\/www.youtube.com\/embed\/AbCdEfGhIjK"}</script>`;
  assert.deepEqual(pageOf(ld), { i: 'https://img.pts.org.tw/1.jpg', y: ['AbCdEfGhIjK'] });
  assert.deepEqual(pageOf('<iframe width="560" src="https://www.youtube.com/embed/ZyXwVuTsRqP?rel=0"></iframe>').y, ['ZyXwVuTsRqP']);
  assert.deepEqual(pageOf('<meta content="http://x/1.jpg" property="og:image">'), { i: '', y: [] });
  const a = { o: 'ebc', u: 'https://ebc/1' };
  const b = { o: 'ebc', u: 'https://ebc/2' };
  const c = { o: 'ebc', u: 'https://ebc/3' };
  const pages = { 'https://ebc/1': { i: 'https://logo.png', y: ['LIVE0000000', 'OWN00000001'] }, 'https://ebc/2': { i: 'https://logo.png', y: ['LIVE0000000'] } };
  const same = sameOf(pages, [a, b, c]);
  assert.equal(same.clip('ebc', 'OWN00000001'), true);
  assert.equal(same.clip('ebc', 'LIVE0000000'), false);
  assert.equal(same.pagePic('ebc', 'https://logo.png'), false);
  // (One page read: a clip can't yet be told from the channel's.)
  assert.equal(sameOf({ 'https://ebc/1': pages['https://ebc/1'] }, [a]).clip('ebc', 'OWN00000001'), false);
  assert.equal(bigPicture('https://attach.setn.com/newsimages/2026/11/10/5781919-XS.jpg'), 'https://attach.setn.com/newsimages/2026/11/10/5781919-PH.jpg');
  assert.equal(bigPicture('https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/0303/live/a.png'), 'https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/0303/live/a.png');
  // (The widest of a feed's pictures: The Guardian lists 140, 460 and 700; a clip's isn't one.)
  const g = `<rss><channel><item><title>Guardian story</title><link>https://www.theguardian.com/world/1</link><media:content medium="video" url="https://g/v.mp4" width="1280"/><media:content width="140" url="https://i.guim.co.uk/a.jpg?width=140&amp;s=1"/><media:content width="700" url="https://i.guim.co.uk/a.jpg?width=700&amp;s=3"/><media:content width="460" url="https://i.guim.co.uk/a.jpg?width=460&amp;s=2"/></item></channel></rss>`;
  assert.equal(parseFeed(g)[0].img, 'https://i.guim.co.uk/a.jpg?width=700&s=3');
  // (A story with a thumbnail and a full picture shows the full one.)
  const two = [item('guardian', 'Krakow gunman dies in hospital', NOW - H, { img: 'https://i.guim.co.uk/k.jpg?width=140&s=1', near: 1 }), item('bbc', 'Krakow gunman dies in hospital, police say', NOW - 2 * H, { img: 'https://ichef.bbci.co.uk/ace/standard/976/k.jpg' })];
  assert.equal(storyOf(two, 'intl', NOW).img, 'https://ichef.bbci.co.uk/ace/standard/976/k.jpg');
  assert.ok(isVideo('https://www.cbsnews.com/video/abc/'));
  assert.ok(!isVideo('https://www.cbsnews.com/news/abc/'));
});

test("a story's clips and picture come from its outlets' pages; the build reads the top stories' pages", () => {
  const its = ['pts', 'ebc', 'ltn'].map((o, i) => item(o, `立法院三讀通過總預算${i}`, NOW - H - i, { near: 0.5 }));
  const pages = {
    [its[0].u]: { i: 'https://pts/pic.jpg', y: ['OWNCLIP0001'] },
    'https://pts.example/other': { i: '', y: [] }
  };
  const all = [...its, { o: 'pts', u: 'https://pts.example/other' }];
  const s = storyOf(its, 'tw', NOW, { pages, same: sameOf(pages, all) });
  assert.equal(s.img, 'https://pts/pic.jpg');
  assert.deepEqual(s.clips[0].slice(0, 3), ['pts', 'OWNCLIP0001', its[0].u]);
  // Pages to read: a clip outlet's for a story with no clip, the lead's for one with no picture.
  const want = pagesToRead({ tw: [{ items: its.map(x => [x.o, x.t, x.u, x.at]), clips: [], img: '' }], intl: [] }, {});
  assert.ok(want.includes(its[1].u) || want.includes(its[0].u));
  assert.ok(want.length <= PAGE_READS + CLIP_READS);
});

test('a story is kept for days, grows as coverage comes, and ranks by importance, not newness', () => {
  const day = 24 * H;
  const T = NOW - 3 * day;
  const words = ['卓榮泰不副署老福法 批破壞憲政', '不副署老福法 卓榮泰：破壞憲政秩序', '老福法不副署 卓榮泰批憲政'];
  const first = ['cna', 'udn', 'ltn'].map((o, i) => item(o, words[i], T + i * H));
  const b1 = deskOf(first, [], T + 4 * H);
  assert.equal(b1.tw.length, 1);
  const id = b1.tw[0].id;
  // The next day: three more outlets on it, with the first day's still in the window.
  const second = ['tvbs', 'setn', 'chinatimes'].map((o, i) => item(o, `${words[i]} 藍委反擊`, T + 20 * H + i * H));
  const b2 = deskOf([...first, ...second], b1.recs, T + 23 * H);
  assert.equal(b2.tw[0].id, id);
  assert.equal(b2.tw[0].n, 6);
  assert.equal(b2.tw[0].days.length, 2);
  // Two days on, the first day's headlines gone from the window: still that story.
  const b3 = deskOf(second, b2.recs, T + 46 * H);
  assert.equal(b3.tw[0].id, id);
  assert.equal(b3.tw[0].m, 6);
  // A kept headline read again takes the feed's picture as it is now (a larger one).
  const bigger = second.map((it, i) => (i ? it : { ...it, img: 'https://pic.example/700.jpg' }));
  const kept = deskOf(bigger, b2.recs, T + 46 * H).recs.flatMap(r => r.items).find(it => it.u === second[0].u);
  assert.equal(kept.img, 'https://pic.example/700.jpg');
  // A fresh small story doesn't push it down: it carried six outlets over two days.
  const fresh = ['pts', 'ebc', 'ettoday'].map((o, i) => item(o, `易遊網遭駭個資外洩${i}`, T + 46 * H));
  const b4 = deskOf([...second, ...fresh], b3.recs, T + 47 * H);
  assert.equal(b4.tw[0].id, id);
  // Past three days with nothing new: the past's, kept 30 days (six outlets).
  const b5 = deskOf([], b4.recs, T + 7 * day);
  assert.equal(b5.tw.length, 0);
  assert.equal(b5.past.tw[0].id, id);
  assert.equal(deskOf([], b5.recs, T + 33 * day).past.tw.length, 0);
});

test('newsSite: News\'s site published once a commit, from the news builds', async () => {
  const files = new Map();
  const store = { json: async p => files.get(p) ?? null, put: async (p, d) => (files.set(p, d), true) };
  let sha = 'a'.repeat(40);
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push([init.method || 'GET', url, init.body && JSON.parse(init.body)]);
    if (url.endsWith('/Orbit-News/commits/main')) return new Response(sha);
    return new Response(null, { status: 204 });
  };
  const env = { GH_ACTIONS_TOKEN: 't' };
  assert.deepEqual(await newsSite({ store, env: {}, fetchImpl }), { off: 'no token' });
  assert.deepEqual(await newsSite({ store, env, now: 1, fetchImpl }), { sha: 'aaaaaaa', started: true });
  assert.deepEqual(calls[1], ['POST', 'https://api.github.com/repos/JayPengX/Orbit-Core/actions/workflows/news-site.yml/dispatches', { ref: 'main', inputs: { auto: 'true' } }]);
  assert.deepEqual(files.get(NEWS_SITE), { sha, at: 1 });
  // The same commit again: looked at, not started.
  assert.deepEqual(await newsSite({ store, env, fetchImpl }), { sha: 'aaaaaaa' });
  assert.equal(calls.length, 3);
  // A new one: started; a refused start isn't noted, so the next build tries again.
  sha = 'b'.repeat(40);
  const refused = async (url, init) => (url.endsWith('/main') ? new Response(sha) : new Response('', { status: 403 }));
  assert.deepEqual(await newsSite({ store, env, fetchImpl: refused }), { failed: 'start: HTTP 403' });
  assert.equal(files.get(NEWS_SITE).sha, 'a'.repeat(40));
  assert.equal((await newsSite({ store, env, fetchImpl })).started, true);
});

test("the outlets' YouTube clips go to the story their title is nearest (Jay 11-10: video and news together)", async () => {
  // A channel's feed: its clips, not its live streams, broadcasts or shorts.
  const entry = (y, t, at) => `<entry><id>yt:video:${y}</id><yt:videoId>${y}</yt:videoId><title>${t}</title><published>${new Date(at).toISOString()}</published></entry>`;
  const xml = `<feed>${entry('CLIP0000001', '卓榮泰批老福法破壞憲政 不副署｜三立新聞網 SETN.com', NOW - H)}${entry('LIVE0000001', '【LIVE】立法院直播', NOW)}${entry('SHORT000001', '一句話 #shorts', NOW)}</feed>`;
  assert.deepEqual(parseChannel(xml).map(v => v.y), ['CLIP0000001']);
  assert.equal(clipTitle('【#重點新聞】基隆辯論！謝國樑沉默6秒｜三立新聞網 SETN.com'), '基隆辯論！謝國樑沉默6秒');
  assert.equal(clipTitle('France blames Iran for cyberattack | DW News'), 'France blames Iran for cyberattack');
  for (const o of Object.keys(CHANNELS)) assert.ok(OUTLETS[o], o);
  // Matched to its story (not the other one), as a clip that plays here.
  const words = ['卓榮泰不副署老福法 批破壞憲政', '不副署老福法 卓榮泰：破壞憲政秩序', '老福法不副署 卓榮泰批憲政'];
  const items = [...['cna', 'udn', 'ltn'].map((o, i) => item(o, words[i], NOW - 3 * H + i * H)), ...['pts', 'ebc', 'tvbs'].map((o, i) => item(o, `易遊網遭駭個資外洩 ${['十萬', '多人', '用戶'][i]}`, NOW - 2 * H))];
  const vids = [{ o: 'setn', y: 'CLIP0000001', t: '卓榮泰批老福法破壞憲政 不副署｜三立新聞網 SETN.com', at: NOW - H }, { o: 'setn', y: 'FAR00000001', t: '颱風明天登陸 全台嚴防豪雨', at: NOW - H }];
  const out = deskOf(items, [], NOW, { vids });
  const s = out.tw.find(x => /老福法/.test(x.title));
  assert.deepEqual(s.clips.map(c => c[1]), ['CLIP0000001']);
  assert.equal(s.clips[0][2], 'https://www.youtube.com/watch?v=CLIP0000001');
  assert.ok(out.tw.filter(x => x !== s).every(x => !x.clips.length));
  // The build reads the channels due, keeps their clips, and counts them.
  const files = new Map();
  const store = { json: async p => files.get(p) ?? null, put: async (p, d) => (files.set(p, d), true) };
  const fetchImpl = async url => ({ ok: true, status: 200, headers: new Headers(), text: async () => (url === ytFeed(CHANNELS.setn) ? xml : '<rss></rss>') });
  const r = await runNews({ store, now: NOW, fetchImpl, feeds: {}, channels: { setn: CHANNELS.setn }, channelEvery: { tw: 1 } });
  assert.equal(r.clips, 1);
  assert.deepEqual(files.get(NEWS_STATE).vids.map(v => v.y), ['CLIP0000001']);
  // (A build's calls, feeds and channels, stay under 100.)
  const chans = Object.fromEntries(Object.entries(CHANNELS).map(([o, id]) => [o, [[ytFeed(id), 'yt', OUTLETS[o].region === 'tw' ? 2 : 4]]]));
  for (let k = 0; k < 4; k++) assert.ok(feedsDue(FEEDS, NOW + k * 600_000).length + feedsDue(chans, NOW + k * 600_000).length < 100);
});

test('a Short is never a clip: its feed links it as /shorts/ (Jay 11-10: they won’t play well)', () => {
  const entry = (y, href) => `<entry><yt:videoId>${y}</yt:videoId><title>颱風來襲 東北角浪高</title><link rel="alternate" href="${href}"/><published>2026-11-10T08:00:00+00:00</published></entry>`;
  const xml = `<feed>${entry('AAAAAAAAAAA', 'https://www.youtube.com/watch?v=AAAAAAAAAAA')}${entry('BBBBBBBBBBB', 'https://www.youtube.com/shorts/BBBBBBBBBBB')}</feed>`;
  assert.deepEqual(parseChannel(xml).map(v => v.y), ['AAAAAAAAAAA']);
});

test('Bing News’ feed of a site: the outlet’s own link and summary, its Los Angeles time put right (NPR’s 09:35 EST read 06:36 “GMT”)', () => {
  const link = 'http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;tid=x&amp;url=https%3a%2f%2fwww.npr.org%2f2026%2f11%2f10%2fgas-prices&amp;c=1&amp;mkt=en-us';
  const xml = `<rss><channel><item><title>Gas prices dip below $4 but inflation remains stubbornly high</title><link>${link}</link><description>Prices fell for a third week.</description><pubDate>Tue, 10 Nov 2026 06:36:00 GMT</pubDate><News:Source>NPR</News:Source></item><item><title>El papa insta a los argentinos a seguir el ejemplo de los santos</title><link>http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fapnews.com%2farticle%2fpapa</link></item><item><title>No link</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss</link></item></channel></rss>`;
  assert.deepEqual(parseFeed(xml, 'bing'), [{ t: 'Gas prices dip below $4 but inflation remains stubbornly high', u: 'https://www.npr.org/2026/11/10/gas-prices', d: 'Prices fell for a third week.', at: Date.parse('2026-11-10T14:36:00Z'), img: '' }]);
  assert.match(bing('reuters.com'), /q=site%3areuters\.com&format=rss/);
  // (Summer time in Los Angeles: 7 hours behind; winter 8.)
  assert.equal(laOffset(Date.parse('2026-07-01T12:00:00Z')), 7 * 3_600_000);
  assert.equal(laOffset(Date.parse('2026-11-01T01:59:00Z')), 7 * 3_600_000);
  assert.equal(laOffset(Date.parse('2026-11-01T02:00:00Z')), 8 * 3_600_000);
  assert.equal(laOffset(Date.parse('2026-03-08T02:00:00Z')), 7 * 3_600_000);
  assert.equal(laOffset(Date.parse('2026-01-15T12:00:00Z')), 8 * 3_600_000);
  // (Their pages refuse us: never read for a picture.)
  const s = { items: [['reuters', 'x', 'https://www.reuters.com/world/x-2026-11-10/', NOW]], clips: [], img: '' };
  assert.deepEqual(pagesToRead({ tw: [], intl: [s] }, {}), []);
  assert.equal(FEEDS.reuters[0][1], 'bing');
});

test('民視 through its YouTube channel: each report’s headline (its tags off), the clip’s address; never a live stream or a Short', () => {
  const entry = (y, title, href = `https://www.youtube.com/watch?v=${y}`) => `<entry><yt:videoId>${y}</yt:videoId><title>${title}</title><link rel="alternate" href="${href}"/><published>2026-11-10T08:00:00+00:00</published></entry>`;
  const xml = `<feed>${entry('AAAAAAAAAAA', '【#重點新聞】立院三讀通過預算案｜民視新聞網')}${entry('DDDDDDDDDDD', '竹市長選情關鍵倒數 林俊憲現身授證－民視新聞')}${entry('BBBBBBBBBBB', '民視新聞 LIVE 直播')}${entry('CCCCCCCCCCC', '颱風來襲', 'https://www.youtube.com/shorts/CCCCCCCCCCC')}</feed>`;
  assert.deepEqual(parseFeed(xml, 'yt'), [{ t: '立院三讀通過預算案', u: 'https://www.youtube.com/watch?v=AAAAAAAAAAA', d: '', at: Date.parse('2026-11-10T08:00:00Z'), img: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg' }, { t: '竹市長選情關鍵倒數 林俊憲現身授證', u: 'https://www.youtube.com/watch?v=DDDDDDDDDDD', d: '', at: Date.parse('2026-11-10T08:00:00Z'), img: 'https://i.ytimg.com/vi/DDDDDDDDDDD/hqdefault.jpg' }]);
  assert.equal(FEEDS.ftv[0][1], 'yt');
  // (No page of its own to read for a picture.)
  const s = { items: [['ftv', 'x', 'https://www.youtube.com/watch?v=AAAAAAAAAAA', NOW]], clips: [], img: '' };
  assert.deepEqual(pagesToRead({ tw: [s], intl: [] }, {}), []);
});

test('a story’s topic is what most of it names; another only where 40% name it (Jay 11-10: 健康 held a car crash)', () => {
  // A doctor's car crash is life, not health.
  const crash = ['高雄退休名醫「牛伯伯」車禍亡！妻悲痛相驗', '兒科名醫「牛伯伯」車禍亡！ 8月才退休 病患、後輩惋惜', '剛退休半年…高雄兒科名醫車禍驟逝 病患淚憶：最溫柔醫生', '高雄名醫「牛伯伯」剛退休遇死劫 逆向暴衝撞爛燈桿身亡', '術後退休！名醫「牛伯伯」車禍亡 病患：少1個好醫生', '高雄名醫駕車突逆向暴衝撞燈桿亡'];
  assert.deepEqual(topicsOf(crash), ['life']);
  // The flu is health, not 社會.
  assert.deepEqual(topicsOf(['流感上週增103重症、38死 公費抗病毒藥再延長', '流感重症仍破百 疾管署暫緩宣布脫離流行期', '流感降溫卻未脫流行期 上周增103重症、38死']), ['health']);
  // Two of four is enough for a second.
  assert.deepEqual(topicsOf(['台積電10月營收創新高', '台積電營收年增6成 AI晶片助攻', '台積電10月營收5868億元', '聯發科營收創高 晶片出貨旺']).sort(), ['eco', 'tech']);
});

test('the front keeps each topic’s best past its cap (Jay 11-10: 科學 had one story)', () => {
  const st = (id, t, score) => ({ id, topics: [t], score });
  const many = Array.from({ length: 30 }, (_, i) => st(`p${i}`, 'pol', 100 - i));
  const out = frontOf([...many, st('s1', 'sci', 1), st('s2', 'sci', 2)], 20);
  assert.equal(out.length, 22);
  assert.deepEqual(out.slice(20).map(s => s.id), ['s2', 's1']);
  assert.ok(out.filter(s => s.topics[0] === 'pol').length === 20);
  assert.ok(TOPIC_MIN >= 10);
});

test('運動 keeps more past the cap, a national team\'s game abroad counted as sport (Jay 11-14: regular outlets bring good sports stories too)', () => {
  const st = (id, topics, score) => ({ id, topics, score });
  const many = Array.from({ length: 30 }, (_, i) => st(`p${i}`, ['pol'], 100 - i));
  const games = Array.from({ length: 50 }, (_, i) => st(`g${i}`, i % 2 ? ['world', 'sport'] : ['sport'], 1 - i / 100));
  const out = frontOf([...many, ...games], 20);
  assert.equal(out.filter(s => s.topics.includes('sport')).length, TOPIC_MIN_OF.sport);
  assert.ok(out.some(s => s.topics[0] === 'world'));
});


test('Taiwan’s sports story finds the world’s by the AI’s English names, a game only a game (Jay 11-13: 柯瑞, "why is this Taiwan outlet only")', () => {
  const items = [
    item('ap', 'Stephen Curry injury: Warriors star to miss at least two weeks with oblique tear', NOW - 6 * H),
    item('usatoday', 'Steph Curry injury update: Warriors star suffers oblique tear', NOW - 5 * H),
    item('cbssports', 'Warriors’ Stephen Curry out at least two weeks with oblique tear', NOW - 5.5 * H),
    item('reuters', 'South Korea and US discuss North Korea nuclear issue', NOW - 6 * H),
    item('ap', 'South Korea, US envoys meet on North Korea nuclear talks', NOW - 5 * H),
    item('ctinews', 'NBA/勇士戰力拉警報 柯瑞側腹斜肌撕裂、至少休2周', NOW - 5 * H),
    item('ltn', '柯瑞腹斜肌撕裂缺陣勇士慘了？柯爾：狀況已比預期的好', NOW - 4.5 * H),
    item('tvbs', '柯瑞腹斜肌撕裂恐休近一個月！勇士陷考驗', NOW - 4 * H),
    item('udn', 'U23世界盃台灣明戰南韓 超級循環賽首戰', NOW - 5 * H),
    item('ltn', 'U23世界盃／中華隊明對決南韓 超級循環賽開打', NOW - 4.6 * H),
    item('cna', 'U23世界盃 台灣晉級超級循環賽首戰南韓', NOW - 4.4 * H)
  ];
  const first = deskOf(items, [], NOW);
  const curry = first.tw.find(s => /柯瑞/.test(s.title));
  const u23 = first.tw.find(s => /U23/.test(s.title));
  assert.ok(curry && u23);
  assert.ok(!first.intl.find(s => /Curry/.test(s.title)).tw, 'no English word in 柯瑞');
  const who = { [curry.id]: { p: ['Stephen Curry'], t: ['Golden State Warriors'], en: 'Stephen Curry out at least a month with oblique tear' }, [u23.id]: { p: [], t: ['Chinese Taipei', 'South Korea'], en: 'Chinese Taipei face South Korea in U23 World Cup Super Round' } };
  const out = deskOf(items, first.recs, NOW, { who });
  const world = out.intl.find(s => /Curry/.test(s.title));
  assert.ok(world.tw?.n >= 2);
  assert.equal(out.tw.find(s => /柯瑞/.test(s.title)).world, world.id);
  assert.ok(!out.intl.find(s => /Korea/.test(s.title))?.tw, 'Taiwan’s game with South Korea isn’t Korea’s news');
});

test('Taiwan’s outlets on a world story: joined by the names and words they share, never by a lookalike (Jay 11-10)', () => {
  const items = [
    item('bbc', 'Pope Leo celebrates huge open-air Mass in Argentina', NOW - 6 * H),
    item('ap', 'Pope Leo draws 2.5 million to Mass in Buenos Aires, Argentina', NOW - 5 * H),
    item('reuters', 'Pope urges Argentines to follow saints at Buenos Aires Mass', NOW - 5.5 * H),
    item('cnn', 'Pope Leo in Argentina: crowds fill Buenos Aires for Mass', NOW - 4 * H),
    item('nbc', 'South Korea plans $880 billion AI build-out amid stock slump', NOW - 6 * H),
    item('cnbc', 'South Korea AI infrastructure push meets market doubts', NOW - 5 * H),
    item('pts', '教宗良十四訪問阿根廷 250萬名信徒共襄盛舉', NOW - 5 * H),
    item('ctinews', '教宗良十四世阿根廷戶外彌撒吸引250萬人 籲米雷保障弱勢', NOW - 4.5 * H),
    item('udn', '教宗良十四世阿根廷主持露天彌撒 籲重視家庭價值', NOW - 4 * H),
    // (韓國瑜 is Taiwan's Speaker: not Korea.)
    item('ltn', '韓國瑜：嘗試在民主治理中導入AI 開啟更多可能性', NOW - 5 * H),
    item('cna', '韓國瑜談AI治理 立法院導入AI助理', NOW - 4.8 * H),
    item('udn', '韓國瑜：立法院將導入AI 提升議事效率', NOW - 4.6 * H)
  ];
  const out = deskOf(items, [], NOW);
  const pope = out.intl.find(s => /Pope/.test(s.title));
  assert.equal(pope.tw?.n, 3);
  assert.deepEqual(pope.tw.sides, { g: 0, c: 1, b: 2 });
  assert.ok(pope.tw.items.every(it => /教宗/.test(it[1]) && it.length === 4));
  // (Taiwan's story says which world story it's on.)
  assert.equal(out.tw.find(s => /教宗/.test(s.title)).world, pope.id);
  assert.ok(!out.intl.find(s => /Korea/.test(s.title))?.tw);
  assert.ok(!out.tw.find(s => /韓國瑜/.test(s.title))?.world);
  // (The world's own headlines stay the world's: Taiwan's are apart.)
  assert.ok(pope.items.every(it => OUTLETS[it[0]].region === 'intl'));
});

test('a story carries other outlets’ pictures to fall back on: each another outlet’s, a clip’s last (Jay 11-11: one that wouldn’t load left an empty space)', () => {
  const t = 'US, Russia and Ukraine start talks in Abu Dhabi';
  const items = [
    { ...item('japantimes', t, NOW - H, { img: 'https://jt.example/a.jpg' }), near: 0.9 },
    item('japantimes', `${t} again`, NOW - 2 * H, { img: 'https://jt.example/b.jpg' }),
    item('nypost', t, NOW - 3 * H, { img: 'https://ny.example/c.jpg' }),
    item('bbc', t, NOW - 4 * H, { img: 'https://bbc.example/d.jpg' }),
    item('fox', t, NOW - 5 * H)
  ];
  const vids = [{ o: 'cnn', y: 'AAAAAAAAAAA', t, at: NOW - H }];
  const s = storyOf(items, 'intl', NOW, { vids });
  assert.equal(s.img, 'https://jt.example/a.jpg');
  assert.equal(s.imgBy, 'japantimes');
  // (Not Japan Times' other: an outlet that refuses one refuses them all.)
  assert.deepEqual(s.alts.map(a => a[1]), ['nypost', 'bbc', 'cnn'].slice(0, ALTS));
  assert.equal(s.alts.at(-1)[0], 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg');
  assert.equal(storyOf([item('fox', t, NOW - H), item('nyt', t, NOW - 2 * H)], 'intl', NOW).alts, undefined);
});

test('a headline chained into a story it shares nothing with is let go (11-12: Hegseth\'s impeachment held LSU\'s coach and oil prices)', () => {
  const T = NOW - 6 * H;
  const words = ['卓榮泰不副署老福法 批破壞憲政', '不副署老福法 卓榮泰：破壞憲政秩序', '老福法不副署 卓榮泰批憲政', '卓榮泰不副署老福法 藍委反擊', '老福法不副署 藍委批卓榮泰', '不副署老福法 立法院藍委反擊卓榮泰'];
  const own = ['cna', 'udn', 'ltn', 'tvbs', 'setn', 'chinatimes'].map((o, i) => item(o, words[i], T + i * 10 * 60_000));
  const stray = item('pts', '中華電信攜手青年世代 傳承歌仔戲時代魅力', T + H);
  const recs = [{ id: 'old', r: 'tw', first: T, last: T + H, peak: 6, items: [...own, stray].map(({ o, t, u, at }) => ({ o, t, u, at })) }];
  const out = deskOf([...own, stray], recs, T + 2 * H);
  const kept = out.recs.find(r => r.id === 'old').items.map(it => it.u);
  assert.ok(!kept.includes(stray.u));
  assert.equal(kept.length, 6);
  assert.equal(out.tw[0].n, 6);
});

test("a kept story of several companies' reports keeps its owner's alone (11-12: 日月光's held 中華電's and 台灣大's October)", () => {
  const T = NOW - 6 * H;
  const at = i => T + i * 10 * 60_000;
  const own = [
    item('udn', '聯發科10月營收550.26億元 月減0.67%', at(0)),
    item('ctinews', '聯發科10月營收550.26億元！AI、ASIC助力Q4挑戰新高', at(1)),
    item('technews', '聯發科 10 月營收年增 5.8% 達 550.25 億元', at(2)),
    item('tvbs', '聯發科10月營收創同期新高 連3個月突破500億', at(3))
  ];
  const others = [item('newtalk', '中華電10月營收237.5億元創同期新高 EPS達0.46元', at(4)), item('cna', '台灣大10月每股賺0.48元 重回電信三雄EPS王', at(5)), item('ltn', '日月光投控10月營收886億元 再創新高', at(6))];
  const day = [item('udn', '辣椒財報／前三季每股賺4.94元', at(0)), item('ltn', '智邦財報／前三季每股大賺58.09元', at(1)), item('cna', '豆府前三季每股賺12.21元 創歷年同期新高', at(2)), item('tvbs', '緯創Q3每股賺5.74元創單季新高', at(3))];
  const keep = list => list.map(({ o, t, u, at }) => ({ o, t, u, at }));
  const recs = [
    { id: 'mtk', r: 'tw', first: T, last: at(6), peak: 7, items: keep([...own, ...others]) },
    { id: 'day', r: 'tw', first: T, last: at(3), peak: 4, items: keep(day) }
  ];
  const out = deskOf([...own, ...others, ...day], recs, T + 2 * H);
  const mtk = out.recs.find(r => r.id === 'mtk');
  assert.deepEqual(mtk.items.map(it => it.u).sort(), own.map(it => it.u).sort());
  // (A day's reports, one company each: no story.)
  assert.equal(out.recs.find(r => r.id === 'day'), undefined);
  assert.ok(!out.tw.some(s => s.items.some(x => /辣椒|智邦|豆府|緯創/.test(x[1] || ''))), 'no story of the day\'s reports');
  // Owner-less mixed reports, one company's alone, a non-report: as they are.
  assert.equal(reportOf('陽明Q3賺逾半個股本 EPS 5.32元'), '陽明');
  assert.equal(reportOf('日月光投控連4個月營收創高'), '日月光投控');
  assert.equal(reportOf('獲利亮眼！元大金前十月EPS 4.3元 中信金3.45元'), '元大金');
  assert.equal(reportOf('卓榮泰不副署老福法'), '');
  assert.deepEqual(reportsOwner(['中信金前10月EPS 3.45元', '中信金前10月賺685.5億', '獲利亮眼！元大金前十月EPS 4.3元 中信金3.45元']), { owner: '中信金', mixed: true });
  assert.equal(otherReport('獲利亮眼！元大金前十月EPS 4.3元 中信金3.45元', '中信金'), false);
});

test("the videos in Taiwan's articles (Jay 11-12): each outlet's way of putting one in, the article's own only, never a Short", async () => {
  // TVBS's and 中央社's players in the article (late-loaded too), 華視's beside a list of the channel's links (never those).
  assert.deepEqual(pageOf('<p>…</p><iframe data-lexical-youtube="D6pygPlBxmE" src="https://www.youtube-nocookie.com/embed/D6pygPlBxmE" frameborder="0"></iframe>').y, ['D6pygPlBxmE']);
  assert.deepEqual(pageOf("<iframe title='youtube iframe' src='//www.youtube.com/embed/gOPqT0Wkd5s'></iframe>").y, ['gOPqT0Wkd5s']);
  assert.deepEqual(pageOf('<iframe class="lazy" data-src="https://www.youtube.com/embed/LAZY0000001?rel=0"></iframe>').y, ['LAZY0000001']);
  assert.deepEqual(pageOf('<a href="https://www.youtube.com/watch?v=LIST0000001">x</a><a href="https://www.youtube.com/shorts/SHRT0000001">y</a>').y, []);
  // og:video naming a YouTube clip; a VideoObject's own video (三立's mp4, 中天's), played on the outlet's site.
  assert.deepEqual(pageOf('<meta property="og:video:url" content="https://www.youtube.com/embed/OGVIDEO0001">').y, ['OGVIDEO0001']);
  const setn = `<script type="application/ld+json">
    { "@context": "https://schema.org", "@type": "VideoObject", "name": "羅大佑", "thumbnailUrl": ["dest/x.jpg"],
      "embedUrl": "https://video.setn.com/dest/2026/11/12/250144_1829/mp4/master.mp4" }
  </script>`;
  assert.deepEqual(pageOf(setn), { i: '', y: [], v: ['https://video.setn.com/dest/2026/11/12/250144_1829/mp4/master.mp4'] });
  const graph = `<script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","video":{"@type":"VideoObject","contentUrl":"https://www.youtube.com/watch?v=GRAPH000001"}}]}</script>`;
  assert.deepEqual(pageOf(graph).y, ['GRAPH000001']);
  // (A VideoObject that won't parse is read for its fields.)
  assert.deepEqual(pageOf('<script type="application/ld+json">{"@type":"VideoObject","contentUrl":"https://storage.ctinews.com/a.m3u8",}</script>').v, ['https://storage.ctinews.com/a.m3u8']);
  // 聯合's own player.
  assert.deepEqual(pageOf('<div class="video-container"><iframe width="640" src="https://video.udn.com/embed/news/1331985"></iframe></div>').v, ['https://video.udn.com/embed/news/1331985']);

  // The article's own: a clip on two reports of one story is the story's
  // (中央社's two on one event); on a page of another story it's the box beside them all.
  const one = [item('cna', '施振榮出席APEC 賴總統交付任務', NOW - H, { near: 0.5 }), item('cna', '施振榮：台灣是AI不可或缺夥伴', NOW - 2 * H, { near: 0.5 }), item('pts', '施振榮代表出席APEC', NOW - H, { near: 0.5 })];
  const other = item('cna', '颱風明天登陸', NOW - H);
  const pages = {
    [one[0].u]: { i: '', y: ['OWNCLIP0001', 'BOXCLIP0001'] },
    [one[1].u]: { i: '', y: ['OWNCLIP0001', 'BOXCLIP0001'] },
    [one[2].u]: { i: '', y: [], v: ['https://pts/own.mp4'] },
    [other.u]: { i: '', y: ['BOXCLIP0001'] }
  };
  const same = sameOf(pages, [...one, other]);
  const mine = new Set(one.map(x => x.u));
  assert.equal(same.clip('cna', 'OWNCLIP0001', mine), true);
  assert.equal(same.clip('cna', 'BOXCLIP0001', mine), false);
  // (Only pages of this one story read: a box can't yet be told from its own.)
  assert.equal(sameOf(pages, one).clip('cna', 'OWNCLIP0001', mine), false);
  const ptsOther = item('pts', '別的新聞', NOW);
  pages[ptsOther.u] = { i: '', y: [] };
  const s = storyOf(one, 'tw', NOW, { pages, same: sameOf(pages, [...one, other, ptsOther]) });
  assert.deepEqual(s.clips.map(c => [c[0], c[1]]), [['cna', 'OWNCLIP0001'], ['pts', '']]);
  assert.equal(s.clips[1][2], one[2].u);

  // Which pages here: a story with fewer than 2 clips gets its clip outlets' that answer Cloudflare (公視's; the rest on GitHub).
  const story = { items: [['tvbs', 'x', 'https://tvbs/1', NOW], ['cts', 'x', 'https://cts/1', NOW], ['pts', 'x', 'https://pts/1', NOW], ['newtalk', 'x', 'https://newtalk/1', NOW]], clips: [], img: 'https://p.jpg' };
  assert.deepEqual(pagesToRead({ tw: [story], intl: [] }, {}), ['https://pts/1']);
  assert.deepEqual(pagesToRead({ tw: [{ ...story, clips: [['pts', 'AAAAAAAAAAA'], ['ebc', 'BBBBBBBBBBB']] }], intl: [] }, {}), []);
  assert.deepEqual(pagesToRead({ tw: [{ ...story, items: [...story.items, ['ebc', 'x', 'https://ebc/1', NOW]], clips: [['pts', 'AAAAAAAAAAA']] }], intl: [] }, {}), ['https://ebc/1']);
  // (Three clips in, 公視's page still read: Jay 11-13, "it doesn't get all videos".)
  assert.deepEqual(pagesToRead({ tw: [{ ...story, clips: [['ftv', 'AAAAAAAAAAA'], ['ebc', 'BBBBBBBBBBB'], ['mirror', 'CCCCCCCCCCC']] }], intl: [] }, {}), ['https://pts/1']);
  assert.ok(CLIPS_AT.every(o => OUTLETS[o]?.region === 'tw'), 'Taiwan’s outlets');
  const many = Array.from({ length: 30 }, (_, i) => ({ ...story, items: story.items.map(([o, t, u, at]) => [o, t, `${u}/${i}`, at]), img: '' }));
  const want = pagesToRead({ tw: many, intl: [] }, {});
  assert.equal(want.length, CLIP_READS + PAGE_READS);

  // The build: an article's clip asked once whether it's a Short; a Short left out.
  const files = new Map();
  const store = { json: async p => files.get(p) ?? null, put: async (p, d) => (files.set(p, d), true) };
  const titles = ['立法院三讀通過總預算 朝野協商破局', '總預算三讀通過 朝野協商破局', '朝野協商破局 立法院三讀總預算'];
  const feed = (o, t, u) => `<rss><channel><item><title>${t}</title><link>${u}</link><pubDate>${new Date(NOW - H).toUTCString()}</pubDate></item></channel></rss>`;
  const feeds = { ebc: [['https://cts/rss', 'rss']], pts: [['https://pts/rss', 'rss']], cna: [['https://cna/rss', 'rss']] };
  const page = { 'https://cts.example/1': '<iframe src="https://www.youtube.com/embed/CTSCLIP0001"></iframe>', 'https://pts.example/1': '<iframe src="https://www.youtube.com/embed/SHORTCLIP01"></iframe>' };
  const asked = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://www.youtube.com/shorts/')) {
      asked.push([u, init.redirect]);
      return /SHORTCLIP01/.test(u) ? { ok: true, status: 200, redirected: false, url: u, headers: new Headers() } : { ok: false, status: 303, url: u, headers: new Headers() };
    }
    const rss = { 'https://cts/rss': ['ebc', titles[0], 'https://cts.example/1'], 'https://pts/rss': ['pts', titles[1], 'https://pts.example/1'], 'https://cna/rss': ['cna', titles[2], 'https://cna.example/1'] }[u];
    return { ok: true, status: 200, headers: new Headers(), text: async () => (rss ? feed(...rss) : page[u] || '<html></html>') };
  };
  // (The pages are the last build's top stories': the first lays the desk, the next reads them.)
  await runNews({ store, now: NOW - 600_000, fetchImpl, feeds, channels: {} });
  assert.equal(asked.length, 0);
  await runNews({ store, now: NOW, fetchImpl, feeds, channels: {} });
  const st = files.get(NEWS_STATE);
  assert.deepEqual(st.pages['https://cts.example/1'].y, ['CTSCLIP0001']);
  assert.deepEqual(st.pages['https://pts.example/1'].y, []);
  assert.deepEqual(st.shorts, { CTSCLIP0001: NOW, SHORTCLIP01: -NOW });
  assert.ok(asked.every(([, r]) => r === 'manual'));
  // (Asked once: the next build asks nothing.)
  asked.length = 0;
  await runNews({ store, now: NOW + 600_000, fetchImpl, feeds, channels: {} });
  assert.equal(asked.length, 0);
});

test("the pages that refuse Cloudflare are read on GitHub: which, and their clips taken in where the build found none", async () => {
  const s = (clips, items) => ({ clips, items: items.map(([o, u]) => [o, 'x', u, NOW]) });
  const index = {
    tw: [
      s([], [['tvbs', 'https://tvbs/1'], ['cts', 'https://cts/1'], ['newtalk', 'https://newtalk/1'], ['pts', 'https://pts/1']]),
      s([['pts', 'AAAAAAAAAAA'], ['ebc', 'BBBBBBBBBBB']], [['udn', 'https://udn/1']]),
      s([['pts', 'AAAAAAAAAAA']], [['udn', 'https://udn/2'], ['cna', 'https://cna/2']])
    ]
  };
  assert.deepEqual(clipsToRead(index, { 'https://pts/1': { y: [] } }), ['https://cts/1', 'https://tvbs/1', 'https://cna/2', 'https://udn/2', 'https://udn/1']);
  // (A story with clips enough still has its other outlets' read, after: 公視's missed beside three, Jay 11-13.)
  assert.ok(!clipsToRead({ tw: [s([['pts', 'AAAAAAAAAAA'], ['ebc', 'BBBBBBBBBBB']], [['pts', 'https://pts/9'], ['udn', 'https://udn/9']])] }).includes('https://pts/9'), 'an outlet with its clip in already isn’t read again');
  assert.deepEqual(clipsToRead(index, {}, { each: 1, most: 3 }), ['https://pts/1', 'https://cts/1', 'https://tvbs/1']);
  // (A page that wouldn't answer: asked again, 3 times at most.)
  assert.ok(clipsToRead(index, { 'https://cts/1': { y: [], f: 2 } }).includes('https://cts/1'));
  assert.ok(!clipsToRead(index, { 'https://cts/1': { y: [], f: 3 } }).includes('https://cts/1'));
  assert.ok(CLIPS_HERE.every(o => CLIPS_AT.includes(o)));
  // Taken in where the build read nothing of its own (its picture kept), never over its own.
  const pages = { 'https://tvbs/1': { i: 'https://tvbs/pic.jpg', y: [] }, 'https://pts/1': { i: '', y: ['OWNCLIP0001'] } };
  withClips(pages, { pages: { 'https://tvbs/1': { y: ['TVBSCLIP001'], at: NOW }, 'https://pts/1': { y: ['OTHER000001'] }, 'https://udn/2': { y: [], v: ['https://video.udn.com/embed/news/1'] }, 'https://cna/2': { y: [] } } });
  assert.deepEqual(pages['https://tvbs/1'], { i: 'https://tvbs/pic.jpg', y: ['TVBSCLIP001'] });
  assert.deepEqual(pages['https://pts/1'].y, ['OWNCLIP0001']);
  assert.deepEqual(pages['https://udn/2'], { i: '', y: [], v: ['https://video.udn.com/embed/news/1'] });
  assert.deepEqual(pages['https://cna/2'], { i: '', y: [] });
  withClips(pages, { pages: { 'https://cts/9': { y: [], f: 1 }, 'https://cts/8': { y: [], i: 'https://cts/pic.jpg' } } });
  assert.equal(pages['https://cts/9'], undefined);
  assert.deepEqual(pages['https://cts/8'], { i: 'https://cts/pic.jpg', y: [] });
  // The build starts GitHub's run when its finds are 15 minutes old, not again within 15.
  const files = new Map([[NEWS_CLIPS, { at: NOW - 20 * 60_000, pages: {} }]]);
  const store = { json: async p => files.get(p) ?? null, put: async (p, d) => (files.set(p, d), true) };
  const calls = [];
  const fetchImpl = async (url, init) => (calls.push([url, init.method]), { ok: true, status: 204 });
  assert.deepEqual(await newsClips({ store, env: { GH_ACTIONS_TOKEN: 't' }, now: NOW, fetchImpl }), { started: true });
  assert.ok(/news-clips\.yml\/dispatches$/.test(calls[0][0]));
  assert.equal((await newsClips({ store, env: { GH_ACTIONS_TOKEN: 't' }, now: NOW + 5 * 60_000, fetchImpl })).started, undefined);
  files.set(NEWS_CLIPS, { at: NOW + 6 * 60_000, pages: { a: {} } });
  assert.deepEqual(await newsClips({ store, env: { GH_ACTIONS_TOKEN: 't' }, now: NOW + 20 * 60_000, fetchImpl }), { found: 1, age: 14 });
  assert.equal(calls.length, 1);
});

test('a story\'s clips: those that play here before the outlets\' own video pages, each outlet once before twice (Jay 11-13: few videos)', () => {
  const t = 'Nvidia CEO Jensen Huang resigns after affair';
  // (A world story whose outlets put up 8 video pages of their own: the
  // channels' clips matched to it still come in, and lead.)
  const items = ['cnn', 'bloomberg', 'aljazeera', 'nbc', 'abc', 'cbs', 'sky', 'fox'].map((o, i) => item(o, `${t} ${i}`, NOW - (i + 1) * H, { v: 1 }));
  const vids = [
    { o: 'cbs', y: 'CBS00000001', t, at: NOW - H },
    { o: 'cbs', y: 'CBS00000002', t, at: NOW - 2 * H },
    { o: 'cbs', y: 'CBS00000003', t, at: NOW - 3 * H },
    { o: 'sky', y: 'SKY00000001', t, at: NOW - 4 * H },
    { o: 'ap', y: 'AP000000001', t, at: NOW - 5 * H }
  ];
  const s = storyOf(items, 'intl', NOW, { vids });
  assert.equal(s.clips.length, CLIPS_SHOWN);
  assert.deepEqual(s.clips.slice(0, 5).map(c => c[1]), ['CBS00000001', 'SKY00000001', 'AP000000001', 'CBS00000002', 'CBS00000003']);
  // (Then the outlets' own, played on their sites.)
  assert.deepEqual(s.clips.slice(5).map(c => [c[0], c[1]]), [['cnn', '']]);
});

test('a channel\'s clip a little off a big story\'s middle still finds it when one of its headlines is near too (CLIP_LOOSE)', () => {
  assert.ok(CLIP_LOOSE.zh[0] < CLIP_NEAR.zh && CLIP_LOOSE.en[0] < CLIP_NEAR.en);
  const T = NOW - 6 * H;
  // (A story of many takes on 寶林茶室's verdict: a channel's clip, long with
  // its own words, sits off its middle.)
  const heads = ['寶林茶室案一審宣判 負責人遭判1年10月', '寶林茶室中毒釀6死判決出爐 負責人判1年10月', '寶林茶室毒粿條案宣判 家屬不滿輕判', '寶林茶室案判決 倖存者哽咽太不公平', '米酵菌酸中毒案宣判 寶林茶室負責人判刑', '寶林茶室案一審 檢方將上訴'];
  const items = ['cna', 'udn', 'ltn', 'tvbs', 'setn', 'chinatimes'].map((o, i) => item(o, heads[i], T + i * 10 * 60_000));
  const vids = [
    // (0.23 off the middle, 0.20 off its 倖存者 headline: taken.)
    { o: 'ctinews', y: 'CTI00000001', t: '寶林茶室案判決 倖存者哽咽!? 婦:終身洗腎沒賠償?! 20261112', at: T + H },
    // (Off the middle of the four takes the story once held; with all six
    // joined, 11-14, near enough: taken.)
    { o: 'ctinews', y: 'CTI00000002', t: '寶林茶室 倖存者哽咽太不公平!? 婦:終身洗腎沒賠償?! 店長無罪 20261112', at: T + H },
    { o: 'ctinews', y: 'CTI00000003', t: '颱風明天登陸 全台嚴防豪雨', at: T + H }
  ];
  const out = deskOf(items, [], NOW, { vids });
  const s = out.tw.find(x => x.title.includes('寶林'));
  assert.ok(s, 'the story');
  assert.equal(s.n, 6, 'all six takes, each worded its own way, one story');
  assert.deepEqual(s.clips.map(c => c[1]), ['CTI00000001', 'CTI00000002']);
});

test('a story\'s picture is an outlet\'s photo before a video\'s thumbnail, its words burned in (Jay 11-13: 民視\'s 「6死27傷！」)', () => {
  const t = '寶林茶室案一審宣判 負責人遭判1年10月';
  const thumb = 'https://i.ytimg.com/vi/bBaoW8LvY5c/hqdefault.jpg';
  const items = [
    { ...item('ftv', t, NOW - H, { img: thumb }), near: 0.95 },
    item('cts', `${t} 家屬不滿`, NOW - 2 * H, { img: 'https://www.cts.com.tw/a.jpg' }),
    item('mirror', `${t} 倖存者`, NOW - 3 * H, { img: 'https://mirror.example/b.jpg' })
  ];
  const s = storyOf(items, 'tw', NOW);
  assert.equal(s.img, 'https://www.cts.com.tw/a.jpg');
  assert.equal(s.imgBy, 'cts');
  // (The thumbnail last of those to try.)
  assert.deepEqual(s.alts.map(a => a[1]), ['mirror', 'ftv'].slice(0, ALTS));
  // (Only a thumbnail to show: it's shown.)
  assert.equal(storyOf([item('ftv', t, NOW - H, { img: thumb }), item('cts', t, NOW - 2 * H)], 'tw', NOW).img, thumb);
});

test('a story drifted from its core lets the drift go, and the drift starts its own story (Jay 11-13: Trump ending the Iran talks held Pence\'s 2028 run)', () => {
  const T = NOW - 30 * H;
  const at = i => T + i * 20 * 60_000;
  const core = [
    ['ap', 'Trump says US does not need a deal with Iran, pulls Vance from talks'],
    ['cnn', 'Trump tells Vance to turn his focus away from Iran: we don’t need a deal'],
    ['nbc', 'Trump says the US doesn’t need a deal with Iran'],
    ['guardian', 'Trump says no deal needed on Iran and orders Vance to focus on corruption'],
    ['wapo', 'Trump says no deal needed with Iran, pulls Vance off negotiations'],
    ['latimes', 'Trump pulls Vance from Iran talks, saying we don’t need a deal'],
    ['semafor', 'Trump says US doesn’t need Iran deal']
  ].map(([o, t], i) => item(o, t, at(i)));
  const drift = [
    ['fox', 'Pence leaves door open to 2028 White House run after midterm losses'],
    ['dailycaller', 'Former Vice President Mike Pence threatens to run for president again in 2028'],
    ['washtimes', 'Pence weighs a 2028 White House run as GOP licks midterm wounds']
  ].map(([o, t], i) => item(o, t, at(8 + i)));
  // (Chained in by Vance and Iran: each near enough to the whole when it came.)
  const linked = item('hill', 'Pence rebukes Vance over Iran as he weighs a 2028 run', at(7));
  const all = [...core, linked, ...drift];
  const recs = [{ id: 'iran', r: 'intl', first: T, last: at(10), peak: 11, items: all.map(({ o, t, u, at }) => ({ o, t, u, at })) }];
  const out = deskOf(all, recs, T + 12 * H);
  const iran = out.intl.find(s => s.id === 'iran');
  assert.ok(iran.items.every(x => !/Pence/.test(x[1]) || /Iran/.test(x[1])), 'Pence’s 2028 run let go');
  assert.equal(iran.n, core.length + 1);
  const pence = out.intl.find(s => s.id !== 'iran' && s.items.some(x => /2028/.test(x[1])));
  assert.ok(pence && pence.n >= 2, 'the 2028 run, a story of its own');
  assert.equal(new Set(out.intl.map(s => s.id)).size, out.intl.length, 'ids never shared');
});

test('a political story isn’t also sport by a word in it (Jay 11-13: Rubio’s jets to football games, "why is this sport")', () => {
  const heads = ['Karoline Leavitt roasted for her defense of Rubio after reports he spent $1.2 million on private trips', 'Rubio relies on costly military jets to attend college football games', 'Marco Rubio spent over $1.2m of taxpayer money traveling to son’s football games', 'Flying by pricey military jet, Rubio rarely misses a Florida football game'];
  const t = topicsOf(heads, 'en');
  assert.equal(t[0], 'pol');
  assert.ok(!t.includes('sport'));
  assert.ok(topicsOf(['亞冠賽中職聯隊0比5遭日本完封', '亞冠賽／首戰遭日本完封 中華隊先發抗澳'], 'zh').includes('sport'), 'a game abroad stays sport');
});

test('a sports headline naming a team or a player, not the sport, is sport (Jay 11-13: the Curry injury, "why is this Taiwan outlet only")', () => {
  assert.deepEqual(topicsOf(['Steph Curry injury update: What we know as Warriors star’s night ends early', 'Stephen Curry injury: Warriors star to miss at least two weeks with oblique tear'], 'en'), ['sport']);
  assert.deepEqual(topicsOf(['What to know for the first week after the NFL’s wild trade deadline'], 'en'), ['sport']);
  assert.deepEqual(topicsOf(['James Harden breaks slump, leads Cavaliers over Knicks'], 'en'), ['sport']);
  assert.deepEqual(topicsOf(['比想像嚴重！柯瑞腹斜肌撕裂預計至少缺席1個月', '柯瑞腹斜肌撕裂缺陣勇士慘了？柯爾：狀況已比預期的好', '受傷後更衣室喊話「我沒事」 柯瑞右腹斜肌撕裂恐缺席一個月'], 'zh'), ['sport']);
  assert.ok(!topicsOf(['Jets scramble as Russian bombers near Alaska', 'Fighter jets intercept bombers'], 'en').includes('sport'), 'a word that is also a nickname stays out');
});

test('two games never one story: one outlet’s template previews naming other teams stay apart (Sports 11-13: AP’s NBA Cup)', () => {
  const at = NOW - 2 * H;
  const its = [
    item('ap', 'Rockets and Jazz meet Friday in NBA Cup group stage', at),
    item('ap', 'Warriors visit Spurs Friday in NBA Cup group stage', at + 60_000),
    item('ap', 'Pelicans host Grizzlies Friday in NBA Cup group stage', at + 120_000),
    item('reuters', 'Blazers take on Kings in NBA Cup group stage action Friday', at + 180_000)
  ];
  const groups = groupStories(its, 'en');
  assert.ok(groups.every(g => g.length === 1), groups.map(g => g.map(it => it.t).join(' + ')).join(' | '));
  assert.equal(teamsOf('Senators push AI bill', 'en'), null, 'a Senators’ bill isn’t a game');
  assert.ok(!otherGame(teamsOf('Curry out as Warriors face Spurs', 'en'), teamsOf('Warriors visit Spurs Friday in NBA Cup group stage', 'en')));
});

test('sports and the rest are two desks; one game is one story; betting and boilerplate are out (Jay 11-14)', () => {
  // Taiwan's reports of one game, in words too different to join by words alone.
  const game = [
    ['chinatimes', '詹皇再休兵沒差 七六人上演17分逆轉秀擊退暴龍'],
    ['ltn', '詹姆斯沒打！七六人靠馬克西領軍克服17分落後大逆轉暴龍'],
    ['nownews', 'NBA 11/13戰報》東區第2支10勝球隊！沒詹皇的76人123:112宰暴龍'],
    ['ctinews', 'NBA/詹皇沒打不要緊！七六人驚天逆轉 三巨頭合砍65分痛宰暴龍']
  ].map(([o, t], i) => item(o, t, NOW - H - i * 600_000));
  assert.equal(gameOf(game[2].t, 'zh'), '76人|暴龍', '七六人 and 76人 one team');
  assert.equal(gameOf('NBA 11/13賽程》詹皇、恩比德出戰成疑 七六人戰暴龍', 'zh'), '', 'a preview names no game');
  const tw = deskOf(game, [], NOW);
  assert.equal(tw.sport.tw.filter(s => s.n >= 4).length, 1, 'one story of four outlets');
  // A sports outlet's report on the games a ground stop held up stays out of the ground stop's story.
  const faa = ['ap', 'reuters', 'nyt', 'cnn'].map((o, i) => item(o, `FAA orders nationwide ground stop of all departing flights ${i}`, NOW - H - i * 60_000, { img: `https://${o}.example/faa.jpg` }));
  const si = item('si', 'Texas Longhorns cleared for new takeoff time after FAA lifts nationwide ground stop of flights', NOW - 30 * 60_000, { img: 'https://si.example/longhorns.jpg' });
  const out = deskOf([...faa, si], [], NOW);
  const story = out.intl.find(s => /ground stop/.test(s.title));
  assert.ok(story && !story.items.some(it => it[0] === 'si') && !/longhorns/.test(story.img));
  // A story mixed before is mended: the other desk's reports let go.
  const mixed = { id: 'mix', r: 'intl', first: NOW - 2 * H, last: NOW - H, peak: 5, items: [...faa, si].map(({ o, t, u, at }) => ({ o, t, u, at })) };
  const mended = deskOf([...faa, si], [mixed], NOW);
  assert.ok(!mended.intl.find(s => s.id === 'mix')?.items.some(it => it[0] === 'si'));
  // Betting tips aren't news; a feed's copyright line is no summary.
  assert.equal(fillerOf({ t: 'Spain vs England predictions: Uefa Nations League tips and odds', u: 'https://x/1' }, 'en'), 'betting');
  assert.equal(fillerOf({ t: 'Harry Kane breaks caps record as England reach Nations League knockouts', u: 'https://x/2' }, 'en'), '');
  assert.equal(unboiled('Copyright 2026 The Associated Press. All Rights Reserved. Passengers wait at a terminal.'), 'Passengers wait at a terminal.');
  assert.equal(unboiled('Kane scored again. Continue reading...'), 'Kane scored again.');
});

test('a word sharing six letters with another thing stays whole: Starship isn\'t Starshield (11-14)', () => {
  const a = new Set(piecesOf('SpaceX aborts attempt to catch Starship booster rocket', 'en'));
  assert.ok(!piecesOf('Zelenskiy says Starshield speed limited again', 'en').some(p => a.has(p)));
  assert.ok(piecesOf('Impeachment vote', 'en').includes('impeac'));
});

test('a national team\'s game is one story (11-14: 中華隊 6:4 Australia at the 亞冠賽 was some 30 stories); a youth side\'s game another; a country alone no pull', () => {
  assert.equal(gameOf('亞冠賽／首局丟4分仍逆轉！中華隊6：4擊退澳洲 首勝入袋', 'zh'), gameOf('台灣打線大復活！亞冠賽6比4逆轉澳洲 保住爭冠希望', 'zh'));
  assert.notEqual(gameOf('U23世界盃台灣打爆韓國！單局狂灌5分逆轉', 'zh'), gameOf('亞冠賽／中華隊6比1擊敗韓國', 'zh'));
  // (A report not saying U23 may be either: never kept apart from it.)
  assert.equal(otherGame(teamsOf('U23世界盃台灣打爆韓國！', 'zh'), teamsOf('中華隊6比1擊敗韓國 林佾葳奪第3勝', 'zh')), false);
  assert.equal(otherGame(teamsOf('亞冠賽／日本16：1扣倒澳洲', 'zh'), teamsOf('亞冠賽／中華隊挑戰韓國', 'zh')), true);
  // (A country named outside a national team's report is no team: 日本 in a club's news.)
  assert.equal(teamsOf('道奇強投赴日本拍廣告', 'zh')?.size ?? 0, 1);
  const items = [
    { o: 'ettoday', t: '一生只有一次的青奧！台灣霹靂舞小將壓軸替中華隊奪下銀牌', u: 'https://x/1', at: 1 },
    { o: 'ctinews', t: '中華隊何時公司化？蔡其昌點出「深水區」', u: 'https://x/2', at: 2 },
    { o: 'nownews', t: '賀中華隊亞冠賽奪首勝！必勝客披薩買大送大', u: 'https://x/3', at: 3 }
  ];
  assert.equal(groupStories(items, 'zh').length, 3, 'three 中華隊 reports of three things stay three');
});

test('a breaking story told over several builds is one: small stories join the one they are (11-14: Trump–Xi–Putin sat in five stories)', () => {
  const now = Date.UTC(2026, 10, 14, 8);
  const H = 3_600_000;
  const it = (o, t, h) => ({ o, t, u: `https://${o}.com/${encodeURIComponent(t).slice(0, 40)}`, at: now - h * H });
  const rec = (id, items) => ({ id, r: 'intl', first: Math.min(...items.map(i => i.at)), last: Math.max(...items.map(i => i.at)), peak: items.length, items, sp: false });
  const a = rec('a', [it('kyodo', 'Trump to hold unprecedented trilateral meeting with Xi, Putin in China', 8), it('bloomberg', 'Trump to Hold Trilateral Meeting With Xi, Putin in China', 7), it('cnn', 'Trump to meet with China’s Xi and Russia’s Putin at historic trilateral sit-down', 7)]);
  const b = rec('b', [it('hill', 'Trump, Putin and Xi to meet in first trilateral meeting between leaders', 5), it('telegraph', 'Trump to meet Xi and Putin in China', 4)]);
  const c = rec('c', [it('ap', 'Supreme Court takes up Trump asylum ban case', 6), it('npr', 'Supreme Court agrees to hear Trump asylum ban', 5)]);
  const out = deskOf([], [a, b, c], now);
  const tri = out.intl.find(s => s.items.some(x => /trilateral/i.test(x[1])));
  assert.equal(tri.n, 5, 'one story of all five');
  assert.equal(out.intl.filter(s => s.items.some(x => /Xi/.test(x[1]))).length, 1);
  assert.ok(out.intl.some(s => /asylum/.test(s.title) && s.n === 2), 'another story stays its own');
});

test('one event told in each outlet\'s own words is one story (11-14: 8 outlets\' 桃園 shooting were 6); two cities\' polls or 政見會 stay two; a lone headline stays', () => {
  const at = h => NOW - h * H;
  const items = [
    item('chinatimes', '獨家》桃園觀音傳槍響 ！夜跑男無辜遭槍擊 臉部2處穿刺傷', at(5)),
    item('tvbs', '桃園觀音隨機槍擊！41歲男持鎮暴槍朝7旬翁射擊 頭部濺血送醫', at(4.8)),
    item('ebc', '桃園驚傳槍響！男持鎮暴槍隨機掃射7旬翁 逃基隆落網', at(4.6)),
    item('ctinews', '桃園觀音驚傳槍擊！老翁遭鎮暴槍掃射頭臉 41歲嫌基隆落網', at(4.4)),
    item('nextapple', '桃園7旬翁跑步「胸部中彈」 基隆逮到兇嫌！查扣鎮暴槍', at(4.2)),
    item('udn', '工作不順竟持鎮暴槍洩憤！觀音七旬翁散步遭打傷 大園警基隆逮人', at(4)),
    item('cna', '桃園7旬翁慢跑遭鎮暴槍射傷 警赴基隆逮捕嫌犯', at(3.8)),
    item('ltn', '新北最新民調 蘇巧慧領先8.4％ 李四川守住永和', at(3)),
    item('ltn', '基隆民調 童子瑋支持度領先謝國樑3.3%', at(2.8)),
    item('setn', '民調／童子瑋支持度38% 領先謝國樑3.3%！破四成民意盼基隆政黨輪替', at(2.7)),
    item('ftv', '新北政見會登場蘇巧慧、李四川互槓', at(2)),
    item('cna', '台北市長選舉政見會 蔣萬安稱說到做到盼市民續支持', at(1.9)),
    item('ltn', '台北市長選舉政見會今14：00登場 沈伯洋、蔣萬安等6候選人政見對決', at(1.8)),
    item('pts', '易遊網遭駭逾69萬人個資外洩 業者：不含身分證、信用卡號', at(1))
  ];
  const groups = groupStories(items, 'zh').map(g => g.map(x => x.t));
  const shot = groups.find(g => g.some(t => /鎮暴槍/.test(t)));
  assert.ok(shot.length >= 6, shot.join(' | '));
  assert.ok(!shot.some(t => /民調|政見會/.test(t)));
  for (const g of groups) assert.ok(new Set(g.flatMap(t => [...(placesOf(t, 'zh') || [])]).filter(p => /新北|台北|基隆/.test(p) && !/鎮暴槍/.test(g[0]))).size <= 1, g.join(' | '));
  assert.ok(groups.some(g => g.length === 1 && /易遊網/.test(g[0])), 'a headline sharing nothing still stands as its own story');
  assert.deepEqual([...placesOf('臺北市長政見會 北市府回應', 'zh')], ['p:台北']);
  assert.equal(placesOf('新北市長政見會', 'zh').has('p:台北'), false);
});

test('a headline naming no city is of the city its names are seen with (11-14: 基隆\'s poll by 戴立安 joined 新北\'s); a story is of the city it names most', () => {
  const at = h => NOW - h * H;
  const items = [
    item('ltn', '基隆藍綠巷戰 謝國樑、童子瑋掃街', at(30)),
    item('udn', '基隆市長辯論 童子瑋批謝國樑施政', at(29)),
    item('setn', '童子瑋推「基隆新國門」 謝國樑回應', at(28)),
    item('udn', '新竹縣長最新民調 徐欣瑩領先鄭朝方', at(8)),
    item('tvbs', '台中市長最新民調出爐 江啟臣領先何欣純', at(7)),
    item('ltn', '新北最新民調 蘇巧慧領先8.4％ 李四川守住永和', at(6)),
    item('ettoday', '新北市長最新民調 蘇巧慧領先李四川差距8.4個百分點', at(5.8)),
    item('ctinews', '新北選戰倒數15天！最新民調蘇巧慧領先李四川8.4個百分點', at(5.6)),
    item('newtalk', '(影)戴立安最新民調 童子瑋反超謝國樑3.3% 一定投票差距達9個百分點', at(5))
  ];
  const hint = placeHints(items, 'zh');
  assert.deepEqual([...hint('(影)戴立安最新民調 童子瑋反超謝國樑3.3% 一定投票差距達9個百分點')], ['p:基隆']);
  assert.equal(hint('黃仁勳請辭 輝達董事會回應'), null);
  const groups = groupStories(items, 'zh').map(g => g.map(x => x.t));
  assert.ok(!groups.some(g => g.some(t => /童子瑋/.test(t)) && g.some(t => /蘇巧慧/.test(t))), groups.join(' | '));
  // (Fifteen 新北 reports and one 台北 one: the story is 新北's.)
  assert.deepEqual([...marksAll([...Array(15)].map(() => new Set(['p:新北'])).concat([new Set(['p:台北'])]))], ['p:新北']);
  assert.equal(otherGame(marksAll([new Set(['p:新北']), new Set(['p:新北']), new Set(['p:新北']), new Set(['p:台北'])]), new Set(['p:台北'])), true);
});
