// Orbit News' builder (builders/news.js): feeds read whatever their kind,
// headlines grouped into stories, each story's sides counted from the
// outlets' places (kit/news-outlets.mjs), kept across builds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, cleanTitle, newsUrl, cleanUrl, groupStories, storyOf, storiesOf, runNews, NEWS_PATH, NEWS_STATE, idOf, undated } from '../builders/news.js';
import { OUTLETS, sideOf, partiesIn } from '../kit/news-outlets.mjs';

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

test('English: forms of a word meet (impeach, impeachment), summaries help', () => {
  const items = [
    item('bbc', 'US congressman files resolution to impeach Defence Secretary Pete Hegseth', NOW - 5 * H, { d: 'A Republican lawmaker says he will force a vote on removing Hegseth over the Iran war.' }),
    item('fox', 'US Pentagon chief Hegseth faces impeachment push over Iran war', NOW - 4 * H, { d: 'A resolution to impeach Hegseth was filed in the House.' }),
    item('nyt', 'Krakow mass shooting suspect dies in hospital', NOW - 3 * H, { d: 'Police in Poland said the gunman died.' })
  ];
  const groups = groupStories(items, 'en').map(g => g.map(x => x.o).sort().join(','));
  assert.ok(groups.includes('bbc,fox'), groups.join(' | '));
});

test("a story counts outlets by side; one-sided names the side that carries none of a story the other side carries", () => {
  const blue = ['chinatimes', 'ctinews', 'udn'].map((o, i) => ({ ...item(o, `公督盟辱柯志恩「聽話的狗」${i}`, NOW - 4 * H + i), near: 0.5 }));
  const s = storyOf([...blue, { ...item('cna', '公督盟辱柯志恩', NOW - 3 * H), near: 0.6 }], 'tw', NOW);
  assert.deepEqual(s.sides, { g: 0, c: 1, b: 3 });
  assert.equal(s.blind, 'g');
  assert.equal(s.n, 4);
  // (The wire leads: plain words, credited.)
  assert.equal(s.title, '公督盟辱柯志恩');
  assert.equal(s.by, 'cna');
  // Not one-sided while it's new (the other side may still come).
  assert.equal(storyOf(blue.map(x => ({ ...x, at: NOW - H })), 'tw', NOW).blind, '');
  // Carried by both sides: not one-sided.
  assert.equal(storyOf([...blue, { ...item('ltn', '柯志恩', NOW - 3 * H), near: 0.4 }], 'tw', NOW).blind, '');
  // A story keeps its id as headlines join it: its first headline's.
  assert.equal(s.id, idOf(blue[0].u));
});

test('outlets: every one has a place or says it has none, and a reason', () => {
  for (const o of Object.values(OUTLETS)) {
    assert.ok(o.basis.length, o.id);
    if (o.region === 'tw') assert.ok([-2, -1, 0, 1, 2].includes(o.tw), o.id);
    if (o.kind === 'state') assert.equal(sideOf(o, 'intl'), null, o.id);
  }
  assert.equal(sideOf('ltn', 'tw'), 'g');
  assert.equal(sideOf('chinatimes', 'tw'), 'b');
  assert.equal(sideOf('fox', 'intl'), 'r');
  assert.equal(sideOf('dw', 'intl'), null);
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
  const r = await runNews({ store, now: NOW, fetchImpl, feeds });
  assert.equal(r.items, 3);
  const page = files.get(NEWS_PATH);
  assert.equal(page.tw.length, 1);
  assert.deepEqual(page.tw[0].sides, { g: 1, c: 1, b: 1 });
  // The next build: every feed unchanged (304), the kept headlines still make the story.
  const r2 = await runNews({ store, now: NOW + 600_000, fetchImpl: async () => new Response(null, { status: 304 }), feeds });
  assert.equal(r2.items, 3);
  assert.equal(files.get(NEWS_PATH).tw.length, 1);
  // Every feed failing, nothing kept: the page stays as it was.
  files.set(NEWS_STATE, { items: [], etag: {} });
  const before = files.get(NEWS_PATH);
  const r3 = await runNews({ store, now: NOW + 1_200_000, fetchImpl: async () => new Response('', { status: 500 }), feeds });
  assert.equal(r3.failed.length, 3);
  assert.equal(files.get(NEWS_PATH), before);
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
