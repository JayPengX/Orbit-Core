// The outside sources the family leans on, one row each (the admin panel's
// 健康 › 外部來源; the proxy's count of its own outside calls, sources.js;
// a phone's count of its own, source-watch.mjs). Jay, 2026-11-10: "our apps
// now rely heavily on outside sources, make sure our admin panel reflect the
// status of it, so when it break I can come back to you".
//
// Each source:
//   id        its key in D1's `sources` (never renamed: it's the row's name)
//   zh        its name in the panel
//   group     where it sits in the panel (GROUPS' order)
//   apps      the apps it feeds (kit ids, brand.mjs)
//   feeds     what it feeds, in a few words
//   hosts     the hosts whose calls count as it (exact names)
//   match     or a pattern of hosts (checked after every exact name)
//   jobs      a cron job whose unknown hosts count as it (a builder's
//             outlets: news.js reads pages on any outlet's site)
//   where     how it's reached: 'worker' (the proxy, near the caller),
//             'relay' (through the Taiwan relay, gemini-relay.js), 'phone'
//             (the phone itself), 'cron' (the proxy's cron), 'github' (a
//             GitHub build, which only its data's age shows)
//   fresh     how its data's age is read, and how old is late:
//               { job, every }   a cron job's heartbeat (ops.js beats)
//               { r2, every }    a file in R2 (its upload time)
//               { law, every }   a part of Orbit Law's nightly build
//                                (Orbit-Law's data/status.json)
//   quota     a usage the panel shows beside it ('google-maps',
//             'google-weather', 'tdx', 'gemini')
//   backup    sides that are only a backup, judged only when the main
//             ones have no calls (YouBike's guard turns Cloudflare's
//             addresses away: the phones read it, the proxy's tries are
//             shown but never make the row red)
//   steady    true: something reads it all day (a cron), so a day without a
//             good call is a problem; otherwise a quiet day is just nobody
//             asking
//
// A host no source names is still counted, as `host:<name>`, and shown under
// 其他 in the panel: a new source shows up by itself.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const GROUPS = [
  ['transit', '交通'],
  ['weather', '天氣'],
  ['sports', '運動'],
  ['money', '證券與錢'],
  ['law', '法律'],
  ['news', '新聞'],
  ['ai', 'AI 與地圖'],
  ['other', '其他']
];

export const SOURCES = [
  // ---- 交通 ----
  { id: 'tdx', zh: 'TDX 運輸資料', group: 'transit', apps: ['transit'], feeds: '公車與捷運即時、台鐵看板、通阻、票價', hosts: ['tdx.transportdata.tw'], where: ['worker', 'github'], quota: 'tdx' },
  { id: 'hccg-bus', zh: '竹塹交通資訊網（新竹公車）', group: 'transit', apps: ['transit'], feeds: '新竹市公車到站與位置', hosts: ['hisatisfy.hccg.gov.tw', 'ibus.hsinchu.gov.tw'], where: ['worker'] },
  { id: 'tpe-bus', zh: '臺北市公車開放資料', group: 'transit', apps: ['transit'], feeds: '臺北公車到站與位置', hosts: ['tcgbusfs.blob.core.windows.net'], where: ['worker'] },
  { id: 'ntpc-bus', zh: '新北市公車開放資料', group: 'transit', apps: ['transit'], feeds: '新北公車到站', hosts: ['data.ntpc.gov.tw'], where: ['worker'] },
  { id: 'tyc-bus', zh: '桃園市公車動態', group: 'transit', apps: ['transit'], feeds: '桃園公車到站', hosts: ['ebus.tycg.gov.tw'], where: ['worker', 'phone'] },
  { id: 'txg-bus', zh: '臺中市公車動態', group: 'transit', apps: ['transit'], feeds: '臺中公車到站、通阻', hosts: ['citybus.taichung.gov.tw'], where: ['worker', 'phone'] },
  { id: 'tnn-bus', zh: '臺南市公車動態', group: 'transit', apps: ['transit'], feeds: '臺南公車到站', hosts: ['2384.tainan.gov.tw'], where: ['worker', 'phone'] },
  { id: 'khh-bus', zh: '高雄市公車動態', group: 'transit', apps: ['transit'], feeds: '高雄公車到站、位置、通阻（只答臺灣的網路：手機自己讀）', hosts: ['ibus.tbkc.gov.tw'], where: ['phone'] },
  { id: 'thb-bus', zh: '公路局公路客運乘車資訊', group: 'transit', apps: ['transit'], feeds: '公路客運與 11 縣市公車到站與位置', hosts: ['www.taiwanbus.tw'], where: ['worker'] },
  { id: 'tra', zh: '臺鐵開放資料', group: 'transit', apps: ['transit'], feeds: '臺鐵今天的時刻', hosts: ['ods.railway.gov.tw'], where: ['worker'] },
  { id: 'metro', zh: '捷運（臺北、桃園、臺中、高雄）', group: 'transit', apps: ['transit'], feeds: '捷運列車到站、營運狀態', hosts: ['tcgmetro.blob.core.windows.net', 'web.metro.taipei', 'ssl.metro.taipei', 'www.tymetro.com.tw', 'www.tmrt.com.tw', 'easygo.krtc.com.tw', 'www.krtc.com.tw'], where: ['worker'] },
  { id: 'tra-site', zh: '臺鐵網站', group: 'transit', apps: ['transit'], feeds: '路線運行狀態、一班車的誤點、票價', hosts: ['www.railway.gov.tw'], where: ['worker'] },
  { id: 'thsr-site', zh: '高鐵網站', group: 'transit', apps: ['transit'], feeds: '票價、列車運行狀況', hosts: ['www.thsrc.com.tw'], where: ['worker'] },
  { id: 'youbike', zh: 'YouBike', group: 'transit', apps: ['transit'], feeds: '站點的車與空位', hosts: ['apis.youbike.com.tw'], where: ['phone', 'worker'], backup: ['worker', 'cron'] },
  { id: 'bus-build', zh: '公車與鐵路時刻（每週）', group: 'transit', apps: ['transit'], feeds: '路線、站牌、時刻表、高鐵 4 週、捷運', hosts: [], where: ['github'], fresh: { r2: 'where.json', every: 8 * DAY } },
  { id: 'osm', zh: 'OpenStreetMap', group: 'transit', apps: ['transit'], feeds: '地點搜尋的備援、走路路線', hosts: ['nominatim.openstreetmap.org', 'routing.openstreetmap.de'], where: ['worker', 'phone'] },

  // ---- 天氣 ----
  { id: 'cwa', zh: '中央氣象署', group: 'weather', apps: ['weather'], feeds: '鄉鎮預報、測站、警特報', hosts: ['opendata.cwa.gov.tw'], where: ['worker'] },
  { id: 'cwa-radar', zh: '氣象署雷達回波', group: 'weather', apps: ['weather'], feeds: '接下來兩小時的雨：何時來、多大、何時停', hosts: ['cwaopendata.s3.ap-northeast-1.amazonaws.com'], where: ['cron'], fresh: { job: 'radar', every: 30 * MIN }, steady: true },
  { id: 'google-weather', zh: 'Google 天氣', group: 'weather', apps: ['weather'], feeds: '逐時預報、體感、紫外線', hosts: ['weather.googleapis.com'], where: ['worker'], quota: 'google-weather' },
  { id: 'google-air', zh: 'Google 空氣品質', group: 'weather', apps: ['weather'], feeds: '空氣品質', hosts: ['airquality.googleapis.com'], where: ['worker'] },
  { id: 'moenv', zh: '環境部', group: 'weather', apps: ['weather', 'law'], feeds: '空品測站與預報', hosts: ['data.moenv.gov.tw'], where: ['worker'] },
  { id: 'ncdr', zh: '國家災防中心（颱風）', group: 'weather', apps: ['weather'], feeds: '颱風警報', hosts: ['alerts.ncdr.nat.gov.tw'], where: ['worker'] },
  { id: 'dgpa', zh: '人事行政總處（停班停課）', group: 'weather', apps: ['weather'], feeds: '各縣市停班停課', hosts: ['www.dgpa.gov.tw'], where: ['relay'] },
  { id: 'open-meteo', zh: 'Open-Meteo', group: 'weather', apps: ['weather', 'sports'], feeds: '颱風路徑備援、F1 賽道天氣', hosts: ['api.open-meteo.com'], where: ['phone', 'worker'] },
  { id: 'met-no', zh: '挪威氣象局', group: 'weather', apps: ['weather'], feeds: '颱風路徑備援', hosts: ['api.met.no'], where: ['worker'] },
  { id: 'nlsc', zh: '國土測繪中心', group: 'weather', apps: ['weather', 'transit'], feeds: '所在的鄉鎮', hosts: ['api.nlsc.gov.tw'], where: ['worker'] },

  // ---- 運動 ----
  { id: 'espn', zh: 'ESPN', group: 'sports', apps: ['match'], feeds: '比分、賽程、球員、排名', hosts: ['site.api.espn.com', 'site.web.api.espn.com', 'sports.core.api.espn.com', 'now.core.api.espn.com', 'cdn.espn.com'], where: ['phone', 'worker', 'cron'] },
  { id: 'mlb', zh: 'MLB', group: 'sports', apps: ['match'], feeds: '美國職棒、季後賽', hosts: ['statsapi.mlb.com'], where: ['phone', 'worker'] },
  { id: 'jolpica', zh: 'Jolpica（F1 成績）', group: 'sports', apps: ['match'], feeds: 'F1 成績與積分', hosts: ['api.jolpi.ca'], where: ['worker', 'phone'] },
  { id: 'f1-timing', zh: 'F1 即時計時', group: 'sports', apps: ['match'], feeds: 'F1 即時與賽道圖', hosts: ['livetiming.formula1.com', 'api.multiviewer.app', 'www.formula1.com'], where: ['worker', 'cron'] },
  { id: 'openf1', zh: 'OpenF1', group: 'sports', apps: ['match'], feeds: 'F1 賽段、數據、勝率', hosts: ['api.openf1.org'], where: ['phone', 'worker', 'cron'] },
  { id: 'polymarket', zh: 'Polymarket', group: 'sports', apps: ['match'], feeds: '預測市場機率', hosts: ['gamma-api.polymarket.com', 'clob.polymarket.com'], where: ['phone', 'worker'] },
  { id: 'kambi', zh: 'Kambi', group: 'sports', apps: ['match'], feeds: '場中比分', hosts: ['eu-offering-api.kambicdn.com'], where: ['worker'] },
  { id: 'fotmob', zh: 'FotMob', group: 'sports', apps: ['match'], feeds: '足球細節、球員照', hosts: ['www.fotmob.com', 'data.fotmob.com'], where: ['worker', 'cron'] },
  { id: 'tsdb', zh: 'TheSportsDB', group: 'sports', apps: ['match'], feeds: '中職、照片、隊徽', hosts: ['www.thesportsdb.com', 'r2.thesportsdb.com'], where: ['phone', 'relay', 'cron'] },
  { id: 'cpbl', zh: '中華職棒', group: 'sports', apps: ['match'], feeds: '中職賽程與戰績', hosts: ['www.cpbl.com.tw'], where: ['cron'], fresh: { job: 'build:daily', every: 26 * HOUR }, steady: true },
  { id: 'elta', zh: '愛爾達', group: 'sports', apps: ['match'], feeds: '在哪裡看（轉播表）', hosts: ['piceltaott-elta.cdn.hinet.net', 'eltaott.tv'], where: ['phone', 'worker', 'cron'], fresh: { job: 'build:watch', every: 2 * HOUR }, steady: true },
  { id: 'youtube', zh: 'YouTube', group: 'sports', apps: ['match', 'news'], feeds: '精華影片', hosts: ['www.youtube.com', 'i.ytimg.com'], where: ['worker', 'cron'] },
  { id: 'apple-tv', zh: 'Apple TV', group: 'sports', apps: ['match'], feeds: '在哪裡看（Apple TV）', hosts: ['tv.apple.com'], where: ['cron'] },
  { id: 'leagues', zh: '聯盟官網（照片）', group: 'sports', apps: ['match'], feeds: '球員官方照', hosts: ['footballapi.pulselive.com', 'resources.premierleague.com', 'www.premierleague.com', 'apim.laliga.com', 'www.bundesliga.com', 'en.legaseriea.it', 'ma-api.ligue1.fr', 'dapi.mlssoccer.com', 'wsrv.nl', 'cdn.nba.com'], where: ['cron'], fresh: { job: 'build:daily', every: 26 * HOUR } },
  { id: 'wikipedia', zh: '維基百科', group: 'sports', apps: ['match'], feeds: '車手與球員的介紹', hosts: ['en.wikipedia.org', 'zh.wikipedia.org'], where: ['worker', 'cron'] },
  { id: 'rotowire', zh: 'RotoWire', group: 'sports', apps: ['match'], feeds: '傷兵', hosts: ['www.rotowire.com'], where: ['worker'] },

  // ---- 證券與錢 ----
  { id: 'yahoo', zh: 'Yahoo 財經', group: 'money', apps: ['stock'], feeds: '報價、走勢、股利、成交', hosts: ['query1.finance.yahoo.com', 'query2.finance.yahoo.com', 'fc.yahoo.com'], where: ['worker'] },
  { id: 'twse', zh: '證交所', group: 'money', apps: ['stock'], feeds: '新股申購、權證報價', hosts: ['www.twse.com.tw', 'mis.twse.com.tw'], where: ['worker'] },
  { id: 'filings', zh: '證交所、櫃買中心重大訊息', group: 'money', apps: ['stock'], feeds: '重大訊息白話', hosts: ['openapi.twse.com.tw', 'www.tpex.org.tw'], where: ['cron'], fresh: { job: 'build:ai', every: HOUR } },
  { id: 'taifex', zh: '期交所', group: 'money', apps: ['stock'], feeds: '期貨、選擇權', hosts: ['openapi.taifex.com.tw', 'www.taifex.com.tw'], where: ['worker'] },
  { id: 'funds', zh: '投信投顧公會、鉅亨', group: 'money', apps: ['stock'], feeds: '境內基金淨值', hosts: ['www.sitca.org.tw', 'fund.api.cnyes.com'], where: ['worker'] },
  { id: 'gcis', zh: '經濟部商工登記', group: 'money', apps: ['money'], feeds: '統編的公司名（拍照記帳）', hosts: ['data.gcis.nat.gov.tw'], where: ['worker'] },
  { id: 'google-translate', zh: 'Google 翻譯', group: 'money', apps: ['stock'], feeds: '公司介紹翻成你的語言', hosts: ['clients5.google.com', 'translate.googleapis.com'], where: ['worker'] },

  // ---- 法律 ----
  { id: 'law-moj', zh: '全國法規資料庫', group: 'law', apps: ['law'], feeds: '法律、命令、修法', hosts: [], where: ['github'], fresh: { law: 'laws', every: 2 * DAY } },
  { id: 'ly', zh: '立法院開放資料', group: 'law', apps: ['law'], feeds: '法案、表決、立委、議程', hosts: ['v2.ly.govapi.tw', 'data.ly.gov.tw', 'ppg.ly.gov.tw'], where: ['worker', 'github'], fresh: { law: 'bills', every: 2 * DAY } },
  { id: 'ivod', zh: '立法院議事轉播', group: 'law', apps: ['law'], feeds: '現在的直播', hosts: ['ivod.ly.gov.tw'], where: ['worker'] },
  { id: 'councils', zh: '地方議會', group: 'law', apps: ['law'], feeds: '22 縣市議會的會議、提案、議員', hosts: ['all.cc.govapi.tw'], where: ['github'], fresh: { law: 'councils', every: 2 * DAY } },
  { id: 'local-rules', zh: '縣市法規', group: 'law', apps: ['law'], feeds: '自治條例、自治規則', hosts: [], match: /^(laws\.gov\.taipei|web\.law\.ntpc\.gov\.tw|outlaw\.kcg\.gov\.tw|law\.[a-z]+\.gov\.tw|law01\.tainan\.gov\.tw|lawsearch\.chcg\.gov\.tw|hclaw\.hsinchu\.gov\.tw|glrslaw\.e-land\.gov\.tw|glrs\.[a-z]+\.gov\.tw|ptlaw\.pthg\.gov\.tw)$/, where: ['relay', 'github'], fresh: { law: 'local', every: 2 * DAY } },
  { id: 'agency-rules', zh: '各部會行政規則', group: 'law', apps: ['law'], feeds: '部會的行政規則', hosts: ['edu.law.moe.gov.tw', 'law-out.mof.gov.tw', 'oaout.moenv.gov.tw'], where: ['worker', 'github'], fresh: { law: 'agency', every: 2 * DAY } },
  { id: 'judicial', zh: '司法院裁判書', group: 'law', apps: ['law'], feeds: '裁判、判決', hosts: ['judgment.judicial.gov.tw', 'opendata.judicial.gov.tw'], where: ['relay', 'github'], fresh: { law: 'rulings', every: 2 * DAY } },
  { id: 'cons-court', zh: '憲法法庭', group: 'law', apps: ['law'], feeds: '釋字、憲判字', hosts: ['cons.judicial.gov.tw'], where: ['github'], fresh: { law: 'cons', every: 3 * DAY } },
  { id: 'gov-pages', zh: '政府網頁', group: 'law', apps: ['law'], feeds: '在 Orbit Law 裡讀的政府網頁', hosts: [], match: /(^|\.)gov\.tw$|\.edu\.tw$/, where: ['worker', 'relay'] },

  // ---- 新聞 ----
  { id: 'news', zh: '新聞媒體 RSS', group: 'news', apps: ['news'], feeds: '台灣與國際各家的標題', hosts: ['feeds.feedburner.com', 'feeds.bbci.co.uk', 'feeds.a.dj.com', 'rss.csmonitor.com', 'feeds.washingtonpost.com', 'rss.nytimes.com', 'rss.politico.com', 'rss.dw.com', 'moxie.foxnews.com', 'feeds.nbcnews.com'], jobs: ['build:news'], where: ['cron'], fresh: { job: 'build:news', every: 30 * MIN }, steady: true },

  // ---- AI 與地圖 ----
  { id: 'gemini', zh: 'Gemini', group: 'ai', apps: ['orbit', 'law', 'money'], feeds: '課表拍照、問法律、拍照記帳', hosts: ['generativelanguage.googleapis.com'], where: ['relay'], quota: 'gemini' },
  { id: 'claude', zh: 'Claude', group: 'ai', apps: ['law'], feeds: '問法律（試用比較）', hosts: ['api.anthropic.com'], where: ['relay'] },
  { id: 'openai', zh: 'OpenAI', group: 'ai', apps: ['law'], feeds: '問法律（試用比較）', hosts: ['api.openai.com'], where: ['relay'] },
  { id: 'google-maps', zh: 'Google 地圖', group: 'ai', apps: ['transit'], feeds: '地點、搜尋、路線、走路', hosts: ['places.googleapis.com', 'routes.googleapis.com', 'maps.googleapis.com'], where: ['worker', 'phone'], quota: 'google-maps' },

  // ---- 其他 ----
  { id: 'adsb', zh: 'ADS-B 航班', group: 'other', apps: ['orbit'], feeds: '專注飛行的真實航班', hosts: ['api.adsb.lol', 'api.adsbdb.com', 'opendata.adsb.fi'], where: ['worker'] },
  { id: 'github', zh: 'GitHub', group: 'other', apps: [], feeds: '管理頁的部署、中職備援', hosts: ['api.github.com', 'github.com'], where: ['worker'] }
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map(s => [s.id, s]));
const BY_HOST = new Map(SOURCES.flatMap(s => s.hosts.map(h => [h, s.id])));
const PATTERNS = SOURCES.filter(s => s.match);
const BY_JOB = new Map(SOURCES.flatMap(s => (s.jobs || []).map(j => [j, s.id])));

// Ours (the family's own Workers and sites), and the made-up hosts the
// proxy keys its caches by: never a source.
const OURS = /(^|\.)jaypengx\.com$|\.workers\.dev$|\.orbit$|^[^.]+$|\.cache$|\.kept$|^jaypengx\.github\.io$/;

// A host's source id ('' for ours, `host:<name>` for one no source names);
// `job`: the cron job that made the call, if any.
export function sourceOf(host, job = '') {
  const h = String(host || '').toLowerCase();
  if (!h || OURS.test(h)) return '';
  const id = BY_HOST.get(h);
  if (id) return id;
  for (const s of PATTERNS) if (s.match.test(h)) return s.id;
  return BY_JOB.get(job) || `host:${h.slice(0, 60)}`;
}

// ---- A source's state, from its counts (sources.js `readSources`) ----
//
// row: { ok, fail, ms, lastOk, lastFail, err, hours: [[hour, ok, fail]],
//        sides: { worker: {...}, phone: {...} } }, fresh: { at, late } or null.
// 'bad' (壞了): its calls have failed for half an hour with nothing working
// since (three failures at least in the last 3 hours), or its data is past twice its time;
// 'warn' (不穩): more than one call in ten failed today, or its data is late;
// 'ok' (正常); 'idle' (沒人用): no call in 24 hours and nothing to be late.
export function stateOf(row, fresh, now = Date.now(), steady = false) {
  const r = row || { ok: 0, fail: 0, lastOk: 0, lastFail: 0, hours: [] };
  const since = now - 3 * HOUR;
  const recent = (r.hours || []).filter(([h]) => h * HOUR >= since).reduce((a, [, ok, fail]) => [a[0] + ok, a[1] + fail], [0, 0]);
  const calls = r.ok + r.fail;
  if (fresh?.late === 2) return 'bad';
  // (Failing for half an hour with nothing working since: broken, whatever worked before.)
  if (recent[1] >= 3 && r.lastFail > r.lastOk && now - r.lastOk > 30 * MIN) return 'bad';
  if (steady && calls && !r.ok) return 'bad';
  if (fresh?.late) return 'warn';
  if (calls && r.fail / calls > 0.1) return 'warn';
  if (recent[1] >= 2 && r.lastFail > r.lastOk) return 'warn';
  if (!calls && !fresh) return 'idle';
  return 'ok';
}
// The row a source is judged by: with `backup` sides, only its main sides'
// counts while they have any (no hours by side: the last 3 hours' rule
// reads their last answer and failure instead).
export function judgedRow(s, row) {
  if (!row || !s?.backup?.length || !row.sides) return row;
  const main = Object.entries(row.sides).filter(([side]) => !s.backup.includes(side)).map(([, v]) => v);
  const ok = main.reduce((n, v) => n + (v.ok || 0), 0);
  const fail = main.reduce((n, v) => n + (v.fail || 0), 0);
  if (!ok && !fail) return row;
  const lastOk = Math.max(0, ...main.map(v => v.lastOk || 0));
  const lastFail = Math.max(0, ...main.map(v => v.lastFail || 0));
  return { ...row, ok, fail, lastOk, lastFail, hours: lastFail > lastOk ? row.hours : [] };
}
// The age of what's built from a source (the admin op `sources`' jobs,
// files, law): { at, every, late, job?, failed?, note?, part?, n? } or null.
export function freshAt(s, d) {
  const f = s?.fresh;
  if (!f) return null;
  if (f.job) {
    const b = d?.jobs?.[f.job];
    return { at: b?.okAt || 0, every: f.every, late: lateOf(b?.okAt, f.every, d?.at), job: true, failed: !!b && !b.ok, note: b?.note || '' };
  }
  if (f.r2) {
    const at = d?.files?.[f.r2] || 0;
    return { at, every: f.every, late: lateOf(at, f.every, d?.at), file: f.r2 };
  }
  if (f.law) {
    // (Orbit Law's status file comes with its first nightly build after 2026-11-10: till then, nothing to say.)
    if (!d?.law) return null;
    const p = d.law[f.law] || { built: 0, n: 0 };
    return { at: p.built, every: f.every, late: lateOf(p.built, f.every, d.at), part: f.law, n: p.n || 0 };
  }
  return null;
}
// A source's state as the panel shows it, before its quota: its judged
// counts, its data's age, a build that last failed (one 'warn' at most).
export function sourceState(s, row, fresh, now = Date.now()) {
  const state = stateOf(judgedRow(s, row), fresh, now, s?.steady);
  return fresh?.failed && state === 'ok' ? 'warn' : state;
}
// How late a source's data is: 0 on time, 1 late (past its time), 2 very late (past twice).
export const lateOf = (at, every, now = Date.now()) => (!at ? 2 : now - at > 2 * every ? 2 : now - at > every ? 1 : 0);
