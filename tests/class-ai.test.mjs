// Orbit Class's three AI features (ai-features.js class-book, class-plan,
// class-news) and the school reader they stand on (class-news.js): what an
// answer may keep, and how a school's own list is read by code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, cleanBook, spanOf } from '../ai-features.js';
import { schoolSite, schoolRead, dateIn, feedItems, ischoolItems, pageItems, pageLeads, settle, readSchool, mergeWorded, schoolNews, handleClassNews } from '../class-news.js';

const ev = o => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
const sse = obj => new Response([{ type: 'message_start', message: { usage: { input_tokens: 100 } } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: JSON.stringify(obj) } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } }].map(ev).join(''));

test('拍聯絡簿: a subject only from their own list, a due day near, a kind always', () => {
  const out = cleanBook(
    {
      items: [
        { kind: 'hw', subject: '數', text: '習作 p.32-35', due: '2026-11-12', next: false },
        { kind: 'test', subject: '英', text: 'L3 單字', due: '', next: true },
        { kind: 'nope', subject: '化學', text: '帶實驗衣', due: '2027-09-01', next: false },
        { kind: 'hw', subject: '數學', text: '習作 p.32-35', due: '2026-11-12' },
        { kind: 'do', subject: '', text: '', due: '' }
      ]
    },
    { today: '2026-11-11', subjects: ['數學', '英文', '國文'] }
  );
  assert.deepEqual(out.items, [
    { kind: 'hw', subject: '數學', text: '習作 p.32-35', due: '2026-11-12', next: false },
    { kind: 'test', subject: '英文', text: 'L3 單字', due: '', next: true },
    { kind: 'do', subject: '', text: '帶實驗衣', due: '', next: false }
  ]);
  const f = FEATURES['class-book'];
  assert.equal(f.app, 'orbit');
  assert.equal(f.input({ image: { mime_type: 'image/gif', data: 'x'.repeat(2000) }, today: '2026-11-11' }), null, 'a picture only as JPEG, PNG or WebP');
  const input = f.input({ image: { mime_type: 'image/jpeg', data: 'A'.repeat(2000) }, today: '2026-11-11', subjects: ['數學', '數學', '英文'] });
  assert.deepEqual(input.subjects, ['數學', '英文']);
  assert.match(f.parts(input)[0].text, /數學、英文/);
  assert.match(f.parts(input)[0].text, /2026-11-11 \(三\)/, 'today with its weekday, for 週五 and 明天');
});

test('讀書計畫: every task a session of theirs, numbers only from the scope typed', () => {
  const f = FEATURES['class-plan'];
  const input = f.input({ today: '2026-11-11', exam: '第二次段考', subjects: [{ name: '數學', scope: '2-1~3-2', n: 3, exam: '2026-11-26' }, { name: '英文', scope: '', n: 2, exam: '2026-11-27' }, { name: '', n: 2, exam: '2026-11-27' }] });
  assert.equal(input.subjects.length, 2);
  const out = f.clean({ plans: [{ subject: '數學', tasks: ['2-1、2-2 課本例題', '2-3 到 3-2 習作', '總複習：錯題重做', 'extra'] }, { subject: '英文', tasks: ['L5 課文', '總複習'] }] }, input);
  assert.deepEqual(out.plans['數學'], ['2-1、2-2 課本例題', '2-3 到 3-2 習作', '總複習：錯題重做']);
  assert.deepEqual(out.plans['英文'], ['', '總複習'], 'a lesson the scope never named is dropped (the phone writes its own)');
  assert.equal(f.clean({ plans: [] }, input), null);
  assert.equal(spanOf('L4-L6'), 'L4-L6 5', 'a range names what’s inside it');
  const two = f.input({ today: '2026-11-11', subjects: [{ name: '英文', scope: 'L4-L6', n: 3, exam: '2026-11-26' }] });
  assert.deepEqual(f.clean({ plans: [{ subject: '英文', tasks: ['L4 課文', 'L5 課文', 'L7 課文'] }] }, two).plans['英文'], ['L4 課文', 'L5 課文', '']);
  assert.ok(f.parts(input)[0].text.includes('數學: n 3, exam 2026-11-26, scope: 2-1~3-2'));
});

test('學校公告: who it’s for, a line and a deadline only from the title', () => {
  const f = FEATURES['class-news'];
  const items = [
    { id: 'a1', title: '115學年度第1學期第2次期中考考程表', date: '2026-11-10', unit: '教務處' },
    { id: 'b2', title: '高三學習歷程檔案課程學習成果上傳，11/20截止', date: '2026-11-05', unit: '' },
    { id: 'c3', title: '午餐採購招標公告', date: '2026-11-04', unit: '總務處' }
  ];
  const out = f.clean(
    {
      items: [
        { id: 'a1', who: ['all'], line: '第二次期中考的考程出來了', act: '看考程', by: '' },
        { id: 'b2', who: ['3', 'bad'], line: '高三學習成果 11/20 前上傳', act: '上傳學習歷程', by: '2026-11-20' },
        { id: 'c3', who: [], line: '午餐 12 月起換廠商', act: '', by: '2026-12-01' },
        { id: 'zz', who: ['all'], line: 'not given', act: '', by: '' }
      ]
    },
    { items }
  );
  assert.deepEqual(Object.keys(out), ['a1', 'b2', 'c3']);
  assert.deepEqual(out.b2, { line: '高三學習成果 11/20 前上傳', who: ['3'], act: '上傳學習歷程', by: '2026-11-20' });
  assert.equal(out.c3.line, '', 'a number the title never gave');
  assert.equal(out.c3.by, '', 'a deadline the title never gave');
  assert.ok(f.parts({ school: 'x.edu.tw', today: '2026-11-11', items }).text === undefined);
  assert.match(f.parts({ school: 'x.edu.tw', today: '2026-11-11', items })[0].text, /期中考考程表/);
});

test('a school’s site: only edu.tw, read by GET (and ischool’s list by POST)', () => {
  assert.equal(schoolSite('www.hchs.hc.edu.tw'), 'https://www.hchs.hc.edu.tw/');
  assert.equal(schoolSite('http://www.hchs.hc.edu.tw/home#x'), 'http://www.hchs.hc.edu.tw/home');
  assert.equal(schoolSite('https://example.com/'), null);
  assert.equal(schoolSite('https://evil.edu.tw.example.com/'), null);
  assert.equal(schoolSite('https://a.edu.tw:8443/'), null);
  assert.equal(schoolRead('https://www.x.hc.edu.tw/home'), true);
  assert.equal(schoolRead('https://www.x.hc.edu.tw/home', 'POST'), false);
  assert.equal(schoolRead('https://www.x.hc.edu.tw/ischool/widget/site_news/news_query_json.php', 'POST'), true);
  assert.equal(schoolRead('https://api.anthropic.com/v1/messages', 'POST'), false);
});

test('dates as schools write them', () => {
  assert.equal(dateIn('2026/11/10 公告', '2026-11-11'), '2026-11-10');
  assert.equal(dateIn('115-11-09', '2026-11-11'), '2026-11-09');
  assert.equal(dateIn('115年11月9日', '2026-11-11'), '2026-11-09');
  assert.equal(dateIn('[11/05] 段考', '2026-11-11'), '2026-11-05');
  assert.equal(dateIn('12/20', '2027-02-01'), '2026-12-20', 'December’s in February is last year’s');
  assert.equal(dateIn('第3節', '2026-11-11'), '');
});

const RSS = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>最新消息</title>
<item><title>【轉知】寒假營隊</title><link>https://www.s.hcc.edu.tw/content?a=1</link><description>&lt;p&gt;報名至12月1日&lt;/p&gt;</description><pubDate>2026-11-10 10:35:11</pubDate></item>
<item><title><![CDATA[第二次期中考考程表]]></title><link>https://www.s.hcc.edu.tw/content?a=2</link><pubDate>Mon, 09 Nov 2026 20:00:00 GMT</pubDate></item>
<item><title>舊的消息</title><link>https://www.s.hcc.edu.tw/content?a=3</link><pubDate>2026-08-01 10:00:00</pubDate></item>
</channel></rss>`;

test('a feed, ischool’s list and a page’s dated links read alike', async () => {
  const feed = feedItems(RSS, 'https://www.s.hcc.edu.tw/', '2026-11-11');
  assert.deepEqual(feed.map(x => [x.title, x.date]), [['【轉知】寒假營隊', '2026-11-10'], ['第二次期中考考程表', '2026-11-10'], ['舊的消息', '2026-08-01']]);
  assert.equal(feed[0].desc, '報名至12月1日');
  const kept = await settle(feed, '2026-11-11');
  assert.equal(kept.length, 2, 'older than 45 days left out');
  assert.match(kept[0].id, /^[0-9a-f]{12}$/);
  const isch = ischoolItems([{ pageNum: 0 }, { newsId: '16918', time: '2026/11/09', title: '輔導室 親職講座', unit_name: '輔導室', attr_name: '公告' }], 'http://www.h.hc.edu.tw/home');
  assert.deepEqual(isch, [{ title: '輔導室 親職講座', url: 'http://www.h.hc.edu.tw/ischool/public/news_view/show.php?nid=16918', date: '2026-11-09', unit: '輔導室', kind: '公告' }]);
  const page = pageItems('<table><tr><td>2026-11-10</td><td><a href="/news/1">置頂 重要 115學年度第2次期中考考程表</a></td></tr><tr><td><a href="/x">首頁</a></td></tr><tr><td>2026-11-09</td><td><a href="javascript:void(0)">不能點的公告標題</a></td></tr></table>', 'https://www.g.hc.edu.tw/', '2026-11-11');
  assert.deepEqual(page, [{ title: '115學年度第2次期中考考程表', url: 'https://www.g.hc.edu.tw/news/1', date: '2026-11-10', unit: '' }]);
});

test('where a page leads: ischool’s widgets (students’ first), its feed, a refresh', () => {
  const html = `<meta http-equiv=refresh content="0;url=home">
  <a href="site_news/main2.php?uid=WID_0_2_${'a'.repeat(40)}&maximize=1" title="全部教職員專區">全部</a>
  <a href="site_news/main2.php?uid=WID_0_2_${'b'.repeat(40)}&maximize=1" title="全部最新消息">全部</a>
  <a href="site_news/main2.php?uid=WID_0_2_${'c'.repeat(40)}&maximize=1" title="全部學生專區">全部</a>
  <a class="rssIcon" href="/rssfeeds?a=1" title="RSS訂閱此分類-all">RSS</a>
  <a href="/news">最新消息</a>`;
  const l = pageLeads(html, 'https://www.s.hc.edu.tw/');
  assert.deepEqual(l.ischool.map(w => w.title), ['全部學生專區', '全部最新消息']);
  assert.equal(l.feed, 'https://www.s.hc.edu.tw/rssfeeds?a=1');
  assert.equal(l.refresh, 'https://www.s.hc.edu.tw/home');
  assert.deepEqual(l.more, ['https://www.s.hc.edu.tw/news']);
});

// A school's site in memory: its home page leads to its feed.
const school = (pages, seen = []) => async (u, init = {}) => {
  seen.push(`${init.method || 'GET'} ${u}`);
  const p = pages[u];
  if (p == null) return new Response('', { status: 404 });
  return new Response(p.body ?? p, { headers: { 'Content-Type': p.type || 'text/html; charset=utf-8' } });
};

test('a site with a feed for each board: every board read, each post named by its board, one copy of each', async () => {
  const feed = items => ({ type: 'application/xml', body: `<rss><channel>${items.map(([t, d, n]) => `<item><title>${t}</title><link>https://www.c.hc.edu.tw/content?a=${n}</link><pubDate>${d} 08:00:00</pubDate></item>`).join('')}</channel></rss>` });
  const pages = {
    'https://www.c.hc.edu.tw/': `<a class="rssIcon" href="/rssfeeds?a=all" title="RSS訂閱此分類-all">RSS</a><a class="rssIcon" href="/rssfeeds?a=adm" title="RSS訂閱此分類-行政消息">RSS</a><a class="rssIcon" href="/rssfeeds?a=act" title="RSS訂閱此分類-活動消息">RSS</a><a class="rssIcon" href="/rssfeeds?a=t" title="RSS訂閱此分類-教職員專區">RSS</a><a class="rssIcon" href="/rssfeeds?a=t" title="RSS訂閱此分類-教師研習">RSS</a>`,
    'https://www.c.hc.edu.tw/rssfeeds?a=all': feed([['第二次期中考考程表', '2026-11-10', 1], ['寒假營隊', '2026-11-09', 2], ['教師研習', '2026-11-10', 5]]),
    'https://www.c.hc.edu.tw/rssfeeds?a=adm': feed([['第二次期中考考程表', '2026-11-10', 1], ['減免學雜費申請', '2026-10-20', 3]]),
    'https://www.c.hc.edu.tw/rssfeeds?a=act': feed([['寒假營隊', '2026-11-09', 2], ['校慶運動會', '2026-10-15', 4]]),
    'https://www.c.hc.edu.tw/rssfeeds?a=t': feed([['教師研習', '2026-11-10', 5]])
  };
  const seen = [];
  const read = await readSchool('https://www.c.hc.edu.tw/', school(pages, seen), '2026-11-11');
  assert.deepEqual(read.items.map(x => [x.title, x.kind || '']), [['第二次期中考考程表', '行政消息'], ['寒假營隊', '活動消息'], ['減免學雜費申請', '行政消息'], ['校慶運動會', '活動消息']]);
  // (A teachers' board is read only to take its posts out of 全部's.)
});

test('a school read by code at once, worded behind, kept an hour; a title worded before never sent again', async () => {
  const pages = { 'https://www.s.hcc.edu.tw/': '<html><a class="rssIcon" href="/rssfeeds?a=1" title="RSS">RSS</a></html>', 'https://www.s.hcc.edu.tw/rssfeeds?a=1': { body: RSS, type: 'application/xml' } };
  const read = await readSchool('https://www.s.hcc.edu.tw/', school(pages), '2026-11-11');
  assert.equal(read.how, 'feed');
  assert.equal(read.items.length, 2);
  const store = new Map();
  const asked = [];
  const env = {
    ANTHROPIC_API_KEY: 'a',
    DATA: { get: async k => (store.has(k) ? { json: async () => JSON.parse(store.get(k)) } : null), put: async (k, v) => store.set(k, v) },
    GEMINI_RELAY: {
      fetch: async (u, init) => {
        const body = JSON.parse(init.body);
        const items = JSON.parse(body.messages[0].content.at(-1).text.split('\n').at(-1));
        asked.push(items.map(x => x.id));
        return sse({ items: items.map(x => ({ id: x.id, who: ['all'], line: '寒假營隊開放報名', act: '報名', by: '' })) });
      }
    }
  };
  const now = Date.parse('2026-11-11T02:00:00Z');
  // A Worker's ctx: what runs behind the answer, settled when the test says.
  const pending = [];
  const ctx = { waitUntil: p => pending.push(p) };
  const settle = async () => {
    while (pending.length) await Promise.all(pending.splice(0));
  };
  const first = await schoolNews(env, ctx, 'https://www.s.hcc.edu.tw/', { cap: 10, fetchFn: school(pages), now });
  assert.equal(first.items.length, 2, 'the titles at once');
  assert.equal(first.wording, true, 'the AI words them behind');
  assert.equal(first.items[0].line, undefined);
  await settle();
  assert.equal(asked.length, 1);
  const worded = await schoolNews(env, ctx, 'https://www.s.hcc.edu.tw/', { cap: 10, fetchFn: school(pages), now: now + 15_000 });
  assert.equal(worded.items[0].line, '寒假營隊開放報名');
  assert.deepEqual(worded.items[0].who, ['all']);
  assert.ok(!worded.wording);
  const again = await schoolNews(env, ctx, 'https://www.s.hcc.edu.tw/', { cap: 10, fetchFn: school(pages), now: now + 600_000 });
  assert.equal(again.at, first.at, 'within the hour: the kept copy, nothing read');
  pages['https://www.s.hcc.edu.tw/rssfeeds?a=1'].body = RSS.replace('<item>', '<item><title>新的公告標題</title><link>https://www.s.hcc.edu.tw/content?a=9</link><pubDate>2026-11-11 08:00:00</pubDate></item><item>');
  const old = await schoolNews(env, ctx, 'https://www.s.hcc.edu.tw/', { cap: 10, fetchFn: school(pages), now: now + 2 * 3_600_000 });
  assert.equal(old.items.length, 2, 'past the hour: the older copy answers at once…');
  assert.equal(old.stale, true);
  await settle();
  const later = await schoolNews(env, ctx, 'https://www.s.hcc.edu.tw/', { cap: 10, fetchFn: school(pages), now: now + 2 * 3_600_000 + 20_000 });
  assert.equal(later.items.length, 3, '…and the school is read again behind it');
  assert.equal(asked.length, 2);
  assert.equal(asked[1].length, 1, 'only the new title asked');
  assert.ok(later.items.every(x => x.line), 'the old ones keep their words');
  // The school's feed shows only its newest: what it showed before stays (45 days), with its words.
  pages['https://www.s.hcc.edu.tw/rssfeeds?a=1'].body = RSS.replace(/<item>[\s\S]*<\/item>/, '<item><title>最新一則</title><link>https://www.s.hcc.edu.tw/content?a=10</link><pubDate>2026-11-11 12:00:00</pubDate></item>');
  await schoolNews(env, ctx, 'https://www.s.hcc.edu.tw/', { cap: 10, fetchFn: school(pages), now: now + 4 * 3_600_000 });
  await settle();
  const fuller = await schoolNews(env, ctx, 'https://www.s.hcc.edu.tw/', { cap: 10, fetchFn: school(pages), now: now + 4 * 3_600_000 + 20_000 });
  assert.deepEqual(fuller.items.map(x => x.title), ['最新一則', '新的公告標題', '【轉知】寒假營隊', '第二次期中考考程表']);
  assert.ok(fuller.items.every(x => x.line), 'each worded, the older ones not asked again');
  assert.equal(asked.length, 3);
  const capped = await schoolNews({ ...env, DATA: { get: async () => null, put: async () => {} } }, ctx, 'https://www.s.hcc.edu.tw/', { cap: 0, fetchFn: school(pages), now });
  assert.equal(capped.items.length, 1, 'capped: the titles alone');
  assert.equal(capped.items[0].line, undefined);
  await settle();
  assert.deepEqual(mergeWorded([{ id: 'x', title: 't' }], [{ id: 'x', line: 'l', who: [], act: '', by: '' }]), [{ id: 'x', title: 't', line: 'l', who: [], act: '', by: '' }]);
});

test('GET /class-news: Class’s session only, a school’s site only', async () => {
  const req = site => new Request(`https://w/class-news?site=${encodeURIComponent(site)}`, { headers: { Origin: 'https://orbit.jaypengx.com' } });
  const call = async (site, session) => {
    const r = await handleClassNews(req(site), { DATA: { get: async () => null, put: async () => {} } }, {}, {}, session, { fetchFn: school({}) });
    return { status: r.status, ...(await r.json()) };
  };
  assert.equal((await call('https://www.s.hcc.edu.tw/', { a: 'money', d: 'p' })).error, 'signin');
  assert.equal((await call('https://example.com/', { a: 'orbit', d: 'p' })).error, 'site');
  const unread = await call('https://www.s.hcc.edu.tw/', { a: 'orbit', d: 'p' });
  assert.equal(unread.status, 200);
  assert.equal(unread.unread, true, 'a site that can’t be read says so');
});
