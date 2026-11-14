// Orbit News: the day's stories, each outlet's headline on it and where the
// outlet stands (kit/news-outlets.mjs). Built by the proxy every ten
// minutes (builders/run.js NEWS_MINUTES) into the family's data (R2):
//
//   1. each outlet's own feed read: its RSS (or Atom) or, where it has none,
//      the news sitemap it publishes for search engines; only the headline,
//      the link, the time, its own short summary (cut to SUM_MAX) and its
//      own picture's address (never the article, never a copy of a picture);
//      a feed that hasn't changed (ETag) isn't read again;
//   2. kept 48 hours (private/news/items.json.gz), so a feed showing only its
//      last 20 still adds up to the day;
//   3. grouped into stories by the words their headlines share (each word
//      weighed by how rare it is that day; Chinese in two-character pieces),
//      no AI: a headline joins the story it is nearest, if near enough and
//      within a day of it;
//   4. filler left out (entertainment, horoscopes, lottery, viral and
//      clickbait, by the outlet's own section or the headline's words:
//      fillerOf); a story mostly of light headlines (promos, PR, "原因曝")
//      sinks and, carried by few, goes (softOf); a story of no kind News
//      covers (kit/news-outlets.mjs TOPICS: the sides' own, and life,
//      health, science, culture, sport, Jay 11-10) isn't News';
//   5. each group added to the story it continues (deskOf: a headline of it
//      already the story's, or, after a quiet spell, near its last day's),
//      so a story is kept for days and weeks, growing as coverage comes
//      (by how wide it went: 3, 14 or 30 days after its last headline);
//   6. ranked by importance: how many outlets carry it, how much they
//      wrote, for how many days, fading by half in 36 hours on the front;
//   7. the top stories' own pages read, a few a build, each once (pageOf):
//      the picture the outlet set for it (og:image) where the feed gave none,
//      and the video in the article (Jay 11-12; Taiwan's outlets' pages,
//      CLIPS_AT, for a story with fewer than 2): a YouTube clip (VideoObject,
//      og:video, the article's player), played in the app by YouTube's
//      player, never a Short; else the outlet's own player, opened on its site.
//
// → news/index.json: { built, tw: [story], intl: [story] } (heard of in
//   the last 3 days); news/past.json the same for older ones, by
//   importance, each outlet's newest headline only. A story:
//   { id, title, sum, img, alts: [[picture, outlet]] (others, should img
//     not load), at, first, n (outlets), m (headlines), days:
//     [['MM-DD', headlines]], sides: { g, c, b } (or l, c, r), blind: 'g' |
//     'b' | 'l' | 'r' | '' (單邊: the side that left out, or all but left
//     out, an important story the other side carries widely; oneSidedOf),
//     parties: ['g','b','w'], topics: ['pol'…], imp, live (快訊: outlets
//     on it in the last 2 hours, only while it's breaking),
//     clips: [[outlet, youtubeId, url, title, picture]] (a YouTube clip, or
//     an outlet's own video page when the id is ''),
//     items: [[outlet, title, url, at, video?]] }  (each outlet's newest first).
// State (private/news/items.json.gz): the 48 hours' headlines, feeds' ETags,
// pages read, and the stories kept (recs).
// Read by Orbit News through /data/ (data.js; index.json: 2 minutes at the edge).

import { OUTLETS, TOPICS, SECOND, sideOf, partiesIn, topicsOf, SPORTS_OUTLETS } from '../kit/news-outlets.mjs';
import { enOf, NAMES } from './news-words.js';
import { SPORT_PATH, SPORT_VERSION, SPORT_MS, storyKind, sportText, sportsIn } from '../kit/news-sport.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
export const NEWS_PATH = 'news/index.json';
export const NEWS_STATE = 'private/news/items.json.gz';
const HOUR = 3_600_000;
export const KEEP_MS = 48 * HOUR;
const WINDOW = { tw: 36 * HOUR, intl: 48 * HOUR };
export const SUM_MAX = { zh: 80, en: 160 };
// How many outlets a story needs (in Taiwan two only with the wire or the
// public broadcaster among them); how many the front page lists (stories
// heard of in the last 3 days) and the past (older ones, by importance).
const FEWEST = { tw: 3, intl: 2 };
const TOP = { tw: 180, intl: 140 };
const PAST_TOP = { tw: 400, intl: 300 };
export const NOW_MS = 72 * HOUR;
export const NEWS_PAST = 'news/past.json';
// The family's AI's reading of each sports story (builders/ai.js sportWho).
export const SPORT_WHO = 'news/sport-who.json';
// A story is kept by how wide it went: carried by 6 outlets or more, 30
// days after its last headline; by 4, 14 days; else 3. It takes new
// headlines for 21 days from its first (then a new one starts), and keeps
// 80 (its first 10 and its newest).
const keepFor = n => (n >= 6 ? 30 : n >= 4 ? 14 : 3) * 24 * HOUR;
const OPEN_MS = 21 * 24 * HOUR;
const REC_ITEMS = 80;
// Pages read a build for pictures (each once; the Runner relays past its
// own 40 calls); CLIP_READS more for clips.
export const PAGE_READS = 12;

// Each outlet's feeds: [url, kind, every] ('rss' RSS, RDF or Atom; 'map' a
// news sitemap; read every build, or every 2nd or 3rd: an outlet added on
// 11-10 and the sections beside an outlet's main feed, so a build's calls
// stay near 90 (each past the Runner's 40 a relay's own request).
const S2 = 2;
const S3 = 3;
const S6 = 6;
const S12 = 12;
// (Taiwan's channels post more, so are read more often.)
const CHANNEL_EVERY = { tw: 2, intl: 4 };
const sec = (list, url, every = S3) => list.map(x => [url(x), 'rss', every]);
// Bing News' feed of one site, newest first (Google News' answers Cloudflare
// 503): its 12 latest, each with the outlet's own link and summary.
export const bing = site => `https://www.bing.com/news/search?q=site%3a${site}&format=rss&qft=sortbydate%3d%221%22&mkt=en-US&setlang=en-US&cc=US`;
export const FEEDS = {
  // (自由's 'all' holds every section's news: read every build, the sections every 2nd.)
  ltn: [['https://news.ltn.com.tw/rss/all.xml', 'rss'], ...sec(['politics', 'society', 'life', 'world', 'local'], c => `https://news.ltn.com.tw/rss/${c}.xml`, S2), ...sec(['business', 'sports'], c => `https://news.ltn.com.tw/rss/${c}.xml`)],
  setn: [['https://www.setn.com/sitemapGoogleNews.xml', 'map']],
  // (Its site answers only Taiwan, Google News' feed of it refuses Cloudflare:
  // its YouTube channel's reports, each headline the clip's.)
  ftv: [['https://www.youtube.com/feeds/videos.xml?channel_id=UC2VmWn8dAqkzlQqvy02E1PA', 'yt', S2]],
  newtalk: [['https://newtalk.tw/rss/all', 'rss']],
  peoples: [['https://www.peoplenews.tw/feed/', 'rss']],
  cna: [
    ...sec(['politics', 'mainland', 'intworld', 'social', 'finance'], s => `https://feeds.feedburner.com/rsscna/${s}`, S2),
    ...sec(['technology', 'lifehealth', 'culture', 'sport', 'local'], s => `https://feeds.feedburner.com/rsscna/${s}`)
  ],
  pts: [['https://news.pts.org.tw/xml/newsfeed.xml', 'rss']],
  ettoday: [['https://feeds.feedburner.com/ettoday/realtime', 'rss'], ['https://feeds.feedburner.com/ettoday/sport', 'rss', S12, 0]],
  ebc: [['https://news.ebc.net.tw/sitemap/realtime.xml', 'map']],
  storm: [['https://www.storm.mg/sitemaps/1/article-news-1.xml', 'map']],
  mirror: [['https://www.mirrormedia.mg/rss/rss.xml', 'rss']],
  twreporter: [['https://www.twreporter.org/a/rss2.xml', 'rss']],
  tnl: [['https://feeds.feedburner.com/TheNewsLens', 'rss']],
  upmedia: [['https://www.upmedia.mg/sitemapnews', 'map']],
  tvbs: [['https://news.tvbs.com.tw/sitemap/news-sitemap', 'map']],
  udn: [['https://udn.com/sitemap/gnews_contents/2/1', 'map']],
  chinatimes: [['https://www.chinatimes.com/sitemaps/sitemap_todaynews.xml', 'map']],
  ctinews: [['https://ctinews.com/rss/sitemap-news.xml', 'map']],
  rti: [['https://www.rti.org.tw/rss/', 'rss', S2]],
  cts: [['https://news.cts.com.tw/sitemap_cts_google.xml', 'map', S2]],
  ithome: [['https://www.ithome.com.tw/rss', 'rss', S2]],
  technews: [['https://technews.tw/feed/', 'rss', S2]],
  pansci: [['https://pansci.asia/feed', 'rss', S3]],
  sportsv: [['https://www.sportsv.net/feed', 'rss', S3]],
  bbc: [
    ['https://feeds.bbci.co.uk/news/world/rss.xml', 'rss'],
    ['https://feeds.bbci.co.uk/news/world/asia/rss.xml', 'rss'],
    // (Its sections every hour, room for the sports outlets' feeds, 11-13.)
    ...sec(['technology', 'science_and_environment', 'health', 'business'], s => `https://feeds.bbci.co.uk/news/${s}/rss.xml`, S6),
    ['https://feeds.bbci.co.uk/sport/rss.xml', 'rss', S6, 3]
  ],
  wsj: [['https://feeds.a.dj.com/rss/RSSWorldNews.xml', 'rss']],
  ft: [['https://www.ft.com/world?format=rss', 'rss']],
  hill: [['https://thehill.com/policy/international/feed/', 'rss']],
  csm: [['https://rss.csmonitor.com/feeds/world', 'rss']],
  guardian: [['https://www.theguardian.com/world/rss', 'rss'], ...sec(['technology', 'science'], s => `https://www.theguardian.com/${s}/rss`), ['https://www.theguardian.com/football/rss', 'rss', S6, 1]],
  nyt: [['https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'rss'], ...sec(['US', 'Business', 'Technology', 'Science', 'Health'], s => `https://rss.nytimes.com/services/xml/rss/nyt/${s}.xml`, S6)],
  wapo: [['https://feeds.washingtonpost.com/rss/world', 'rss'], ...sec(['politics', 'business/technology'], s => `https://feeds.washingtonpost.com/rss/${s}`)],
  aljazeera: [['https://www.aljazeera.com/xml/rss/all.xml', 'rss']],
  economist: [['https://www.economist.com/asia/rss.xml', 'rss', S2], ['https://www.economist.com/china/rss.xml', 'rss', S2]],
  politico: [['https://rss.politico.com/politics-news.xml', 'rss']],
  time: [['https://time.com/feed/', 'rss']],
  nbc: [['https://feeds.nbcnews.com/nbcnews/public/world', 'rss'], ...sec(['politics'], s => `https://feeds.nbcnews.com/nbcnews/public/${s}`)],
  cbs: [['https://www.cbsnews.com/latest/rss/world', 'rss'], ...sec(['us', 'technology', 'health'], s => `https://www.cbsnews.com/latest/rss/${s}`)],
  abc: [['https://abcnews.go.com/abcnews/internationalheadlines', 'rss'], ...sec(['usheadlines', 'politicsheadlines', 'technologyheadlines'], s => `https://abcnews.go.com/abcnews/${s}`)],
  fox: [['https://moxie.foxnews.com/google-publisher/world.xml', 'rss'], ...sec(['us', 'politics', 'tech', 'health'], s => `https://moxie.foxnews.com/google-publisher/${s}.xml`), ['https://moxie.foxnews.com/google-publisher/sports.xml', 'rss', S12, 11]],
  nypost: [['https://nypost.com/world-news/feed/', 'rss'], ['https://nypost.com/sports/feed/', 'rss', S12, 8]],
  wexam: [['https://www.washingtonexaminer.com/feed/', 'rss']],
  breitbart: [['https://feeds.feedburner.com/breitbart', 'rss']],
  dailycaller: [['https://dailycaller.com/feed/', 'rss']],
  natreview: [['https://www.nationalreview.com/feed/', 'rss']],
  dailymail: [['https://www.dailymail.co.uk/news/worldnews/index.rss', 'rss']],
  latimes: [['https://www.latimes.com/world-nation/rss2.0.xml', 'rss', S2], ['https://www.latimes.com/sports/rss2.0.xml', 'rss', S12, 7]],
  bloomberg: [['https://feeds.bloomberg.com/politics/news.rss', 'rss', S2]],
  bi: [['https://feeds.businessinsider.com/custom/all', 'rss', S2]],
  semafor: [['https://www.semafor.com/rss.xml', 'rss', S2]],
  pbs: [['https://www.pbs.org/newshour/feeds/rss/world', 'rss', S2]],
  sky: [['https://feeds.skynews.com/feeds/rss/world.xml', 'rss', S2]],
  huffpost: [['https://www.huffpost.com/section/world-news/feed', 'rss', S2]],
  atlantic: [['https://www.theatlantic.com/feed/all/', 'rss', S2]],
  reason: [['https://reason.com/feed/', 'rss', S2]],
  federalist: [['https://thefederalist.com/feed/', 'rss', S2]],
  dailywire: [['https://www.dailywire.com/feeds/rss.xml', 'rss', S2]],
  blaze: [['https://www.theblaze.com/feeds/feed.rss', 'rss', S2]],
  dw: [['https://rss.dw.com/rdf/rss-en-all', 'rss']],
  f24: [['https://www.france24.com/en/asia-pacific/rss', 'rss']],
  scmp: [['https://www.scmp.com/rss/4/feed', 'rss'], ['https://www.scmp.com/rss/3/feed', 'rss', S2]],
  nikkei: [['https://asia.nikkei.com/rss/feed/nar', 'rss']],
  japantimes: [['https://www.japantimes.co.jp/feed/', 'rss']],
  diplomat: [['https://thediplomat.com/feed/', 'rss']],
  taipeitimes: [['https://www.taipeitimes.com/xml/index.rss', 'rss']],
  globaltimes: [['https://www.globaltimes.cn/rss/outbrain.xml', 'rss']],
  cgtn: [['https://www.cgtn.com/subscribe/rss/section/world.xml', 'rss']],
  xinhua: [['https://english.news.cn/rss/worldrss.xml', 'rss']],
  cnn: [['https://www.cnn.com/sitemap/news.xml', 'map', S2]],
  msnow: [['https://www.ms.now/feed', 'rss', S2]],
  independent: [['https://www.independent.co.uk/news/world/rss', 'rss', S2]],
  cnbc: [['https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362', 'rss', S2]],
  npr: [['https://feeds.npr.org/1001/rss.xml', 'rss', S2]],
  // (Their own feeds refuse a reader that isn't a browser: Bing News' feed
  // of their site, its headlines and their links.)
  ...Object.fromEntries(
    [['reuters', 'reuters.com'], ['ap', 'apnews.com'], ['usatoday', 'usatoday.com'], ['axios', 'axios.com'], ['newsweek', 'newsweek.com'], ['telegraph', 'telegraph.co.uk'], ['newsmax', 'newsmax.com']].map(([o, site]) => [o, [[bing(site), 'bing', S3]]])
  ),
  // (Bing's copy of it is months old.)
  washtimes: [['https://www.washingtontimes.com/rss/headlines/news/', 'rss', S3]],
  // (11-13, Jay: more outlets, each read once an hour, every 6th build: its
  // feed holds more than an hour's news, and a build's calls stay under 100.
  // 中視, 台視, 非凡 publish no feed a reader can use: Bing News' of their site.)
  ...Object.fromEntries([['ctv', 'ctv.com.tw'], ['ttv', 'news.ttv.com.tw'], ['ustv', 'news.ustv.com.tw']].map(([o, site]) => [o, [[bing(site), 'bing', S6]]])),
  era: [['https://www.eracom.com.tw/eSitemapNews.xml', 'map', S6]],
  titv: [['https://news.ipcf.org.tw/rss', 'rss', S6]],
  nextapple: [['https://news.nextapple.com/api/xml/site-map/news', 'map', S6]],
  moneyudn: [['https://money.udn.com/rssfeed/news/1001/5591?ch=money', 'rss', S6]],
  nownews: [['https://www.nownews.com/newsSitemap-daily.xml', 'map', S6]],
  cnews: [['https://cnews.com.tw/feed/', 'rss', S6]],
  cnyes: [['https://news.cnyes.com/rss/v1/news/category/all', 'rss', S6]],
  ydn: [['https://www.ydn.com.tw/rss/google.aspx', 'map', S6]],
  focustw: [['https://focustaiwan.tw/GoogleNewsSitemap_fromRemote_cep2.xml', 'map', S6]],
  vox: [['https://www.vox.com/rss/index.xml', 'rss', S6]],
  intercept: [['https://theintercept.com/feed/?rss', 'rss', S6]],
  motherjones: [['https://www.motherjones.com/feed/', 'rss', S6]],
  slate: [['https://slate.com/feeds/all.rss', 'rss', S6]],
  beast: [['https://www.thedailybeast.com/arc/outboundfeeds/rss/articles/', 'rss', S6]],
  propublica: [['https://www.propublica.org/feeds/propublica/main', 'rss', S6]],
  theweek: [['https://theweek.com/feeds.xml', 'rss', S6]],
  cbc: [['https://www.cbc.ca/webfeed/rss/rss-world', 'rss', S6]],
  marketwatch: [['https://feeds.content.dowjones.io/public/rss/mw_topstories', 'rss', S6]],
  deseret: [['https://www.deseret.com/arc/outboundfeeds/rss/?outputType=xml', 'rss', S6]],
  kherald: [[bing('koreaherald.com'), 'bing', S6]],
  kyivind: [['https://kyivindependent.com/news-archive/rss/', 'rss', S6]],
  moscowt: [['https://www.themoscowtimes.com/rss/news', 'rss', S6]],
  foxbiz: [['https://moxie.foxbusiness.com/google-publisher/latest.xml', 'rss', S6]],
  dispatch: [['https://thedispatch.com/feed/', 'rss', S6]],
  epoch: [['https://feed.theepochtimes.com/us/feed', 'rss', S6]],
  jtn: [['https://justthenews.com/rss.xml', 'rss', S6]],
  beacon: [['https://freebeacon.com/feed/', 'rss', S6]],
  townhall: [['https://townhall.com/rss/columnists/', 'rss', S6]],
  amcon: [['https://www.theamericanconservative.com/feed/', 'rss', S6]],
  abcau: [['https://www.abc.net.au/news/feed/51120/rss.xml', 'rss', S6]],
  hkfp: [['https://hongkongfp.com/feed/', 'rss', S6]],
  euronews: [['https://www.euronews.com/rss?level=theme&name=news', 'rss', S6]],
  rappler: [['https://www.rappler.com/feed/', 'rss', S6]],
  cnasg: [['https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511', 'rss', S6]],
  kyodo: [[bing('english.kyodonews.net'), 'bing', S6]],
  asiatimes: [['https://asiatimes.com/feed/', 'rss', S6]],
  yonhap: [['https://en.yna.co.kr/RSS/news.xml', 'rss', S6]],
  straits: [['https://www.straitstimes.com/news/asia/rss.xml', 'rss', S6]],
  // (11-13, Jay: "if orbit news can't support sport news well enough then it
  // should": the sports desks of the outlets above, and CBS Sports' for the
  // leagues Orbit Sports shows, once an hour (the others' every 2 hours): the
  // injuries, moves and coaches Sports' pages link to, often one outlet's
  // report: news/sport.json. Each its own turn, `at`, set where the other
  // feeds and the channels leave a build lightest (under 100 calls a build).)
  cbssports: [['nba', 3], ['mlb', 1], ['soccer', 5]].map(([l, at]) => [`https://www.cbssports.com/rss/headlines/${l}/`, 'rss', S6, at]),
  // (11-13, Jay: "you really should include sport outlet not using existing
  // outlet to get sport news": the sports outlets themselves, each feed once
  // an hour at its own turn.)
  // ESPN and The Athletic refuse our servers' RSS calls, so they come through Bing News.
  espn: [[bing('espn.com'), 'bing', S6, 4]],
  yahoosports: [['https://sports.yahoo.com/rss/', 'rss', S6, 4]],
  skysports: [['12040', 4], ['11095', 0]].map(([l, at]) => [`https://www.skysports.com/rss/${l}`, 'rss', S6, at]),
  athletic: [[bing('nytimes.com/athletic'), 'bing', S6, 3]],
  si: [['https://www.si.com/feed', 'rss', S6, 5]]
};
// (Outlets read only through a search's feed: their pages refuse us too.)
const FAR = new Set(Object.entries(FEEDS).filter(([, list]) => list.every(([, kind]) => kind === 'bing' || kind === 'yt')).map(([o]) => o));

// The outlets' own YouTube channels (their news clips), read every 2nd build
// (Taiwan's) or 4th (the world's); only those whose clips play in other
// pages (YouTube's oEmbed answers), and not those posting mostly Shorts
// (The New York Times', The Journal's, The Post's: 11-10):
// each clip goes to the story its title is nearest, as that story's clip
// (Jay 11-10: video and news together). Resolved from each channel's
// handle; 自由時報's and the SCMP's are not their news.
export const CHANNELS = {
  setn: 'UCIU8ha-NHmLjtUwU7dFiXUA',
  ebc: 'UCR3asjvr_WAaxwJYEDV_Bfw',
  tvbs: 'UC5nwNW4KdC0SzrhF9BXEYOQ',
  pts: 'UCexpzYDEnfmAvPSfG4xbcjA',
  cna: 'UCVNbTzo72WMFZUN9_sdBpBA',
  ettoday: 'UCl3aKvzB7uC5mTlVEWiCogA',
  cts: 'UCDCJyLpbfgeVE9iZiEam-Kg',
  chinatimes: 'UCmdVfsLHu18lCkKYXSOGUxg',
  ctinews: 'UCpu3bemTQwAU8PqM4kJdoEQ',
  mirror: 'UC4LjkybVKXCDlneVXlKAbmw',
  bbc: 'UC16niRr50-MSBwiO3YDb3RA',
  aljazeera: 'UCNye-wNBqNL5ZzHSJj3l8Bg',
  sky: 'UCoMdktPbSTixAyNGwb-UYkQ',
  nbc: 'UCeY0bbntWzzVIaj2z3QigXg',
  abc: 'UCBi2mrWuNuyYy4gbM6fU18Q',
  cbs: 'UC8p1vwvWtl6T73JiExfWs1g',
  fox: 'UCXIJgqnII2ZOINSWNOGFThA',
  pbs: 'UC6ZFN9Tx6xh-skXCuRHCDpQ',
  dw: 'UCknLrEdhRCp1aegoMqRaCZg',
  f24: 'UCQfwfsi5VrQ8yKZ-UWmAEFg',
  cgtn: 'UCgrNz-aDmcr2uuto8_DL2jg',
  guardian: 'UCIRYBXDze5krPDzAEOxFGVA',
  bloomberg: 'UCIALMKvObZNtJ6AmdCLP7Lg',
  ftv: 'UC2VmWn8dAqkzlQqvy02E1PA',
  cnn: 'UCupvZG-5ko_eiXAupbDfxWw',
  msnow: 'UCaXkIU1QidjPwiAYu6GcHjg',
  reuters: 'UChqUTb7kYRX8-EiaN3XFrSQ',
  ap: 'UC52X5wxOL_s5yw0dQk7NtgA',
  cnbc: 'UCrp_UI8XtuYfpiqluWLD7Lw',
  newsmax: 'UCx6h-dWzJ5NpAlja1YsApdg',
  independent: 'UCshwRhftzkiov5wKR7M_LsQ',
  telegraph: 'UCPgLNge0xqQHWM5B5EFH9Cg',
  hill: 'UCPWXiRWZ29zrxPFIQT7eHSA',
  wexam: 'UC8BxSGcBKriJvoeyKOnJ6tA',
  nikkei: 'UCg5HQ8yI3f43ogvFJyVMfhQ'
};
export const ytFeed = id => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
// (Not a story's clip: a live stream, a whole broadcast, a podcast, a
// Short: its feed links it as /shorts/; tall, it won't play well here, Jay 11-10.)
const NOT_A_CLIP = /#shorts|\blive\b|直播|podcast|完整版/i;
// A channel's feed: [{ y, t, at }], its clips only.
export function parseChannel(xml) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const b = m[1];
    const y = plain(tagOf(b, 'yt:videoId'));
    const t = plain(tagOf(b, 'title'));
    const at = timeOf(tagOf(b, 'published'));
    if (/^[\w-]{11}$/.test(y) && t && at && !NOT_A_CLIP.test(t) && !/youtube\.com\/shorts\//.test(b)) out.push({ y, t, at });
  }
  return out;
}
// A clip's title without the channel's own tags: 【#重點新聞】, #hashtags,
// and what follows its first ｜ (the channel's name, the show's).
export const clipTitle = t =>
  cleanTitle(String(t || ''))
    .replace(/【[^】]*】|#\S+/g, ' ')
    .split(/\s*[｜|]\s*/)[0]
    .replace(/\s+/g, ' ')
    .trim();
// The feeds a build reads: each in its turn (`every` builds, spread so each
// build reads its share; a build's slot: :00 0, :10 1, :18 2, :30 3…).
export function feedsDue(feeds, now) {
  const slot = Math.round(now / 600_000);
  const out = [];
  let i = 0;
  for (const [o, list] of Object.entries(feeds))
    // (A feed with its own turn, `at`, leaves the others' turns as they were: the sports desks, 11-13.)
    for (const [url, kind, every = 1, at] of list) if (every === 1 || (at != null ? (slot + at) % every === 0 : (slot + i++) % every === 0)) out.push([o, url, kind]);
  return out;
}

// ---- Reading a feed ----------------------------------------------------------

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·' };
export function plain(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const cdata = s => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const tagOf = (block, name) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? m[1] : '';
};
const attrOf = (block, name, attr) => {
  const m = new RegExp(`<${name}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'i').exec(block);
  return m ? m[1] : '';
};
// (A time without its zone is Taiwan's: iThome's "2026-11-10  12:11:45".)
const SPANISH = /(?<![\w’'])(el|los|las|del|una|que|por|para|según|sobre|tras|indicio)(?![\w’'])/gi;
// Los Angeles' hours behind UTC at a time on its clock: 7 from the 2nd Sunday
// of March, 2 am, to the 1st Sunday of November, 2 am; else 8.
export function laOffset(clock) {
  const y = new Date(clock).getUTCFullYear();
  const sunday = (month, nth) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return Date.UTC(y, month, 1 + ((7 - first) % 7) + 7 * (nth - 1), 2);
  };
  return (clock >= sunday(2, 2) && clock < sunday(10, 1) ? 7 : 8) * 3_600_000;
}
const timeOf = s => {
  let v = String(s || '').trim().replace(/^(\w{3}),(?=\S)/, '$1, ');
  const bare = /^(\d{4}-\d\d-\d\d)[ T]+(\d\d:\d\d(?::\d\d)?)$/.exec(v);
  if (bare) v = `${bare[1]}T${bare[2]}+08:00`;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
// A picture's address from the feed: its widest media (The Guardian lists
// 140, 460 and 700), enclosure or the first <img>.
const widestMedia = block => {
  let best = '';
  let most = -1;
  for (const m of block.matchAll(/<media:(?:content|thumbnail)\b[^>]*>/gi)) {
    if (/\b(?:medium|type)=["'](?:video|audio)/i.test(m[0])) continue;
    const url = /\burl=["']([^"']+)["']/i.exec(m[0])?.[1];
    const w = Number(/\bwidth=["'](\d+)["']/i.exec(m[0])?.[1] || 0);
    if (url && w > most) (best = url), (most = w);
  }
  return best;
};
function pictureOf(block) {
  const url =
    widestMedia(block) ||
    (/<enclosure\b[^>]*type=["']image/i.test(block) ? attrOf(block, 'enclosure', 'url') : '') ||
    tagOf(block, 'image:loc') ||
    /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(cdata(block))?.[1] ||
    '';
  const u = plain(url);
  return /^https:\/\//.test(u) ? u : '';
}

// A feed's items: { t, u, d, at, img }, whatever its kind.
export function parseFeed(xml, kind = 'rss') {
  const s = String(xml || '');
  const out = [];
  if (kind === 'map' || /<urlset\b/.test(s.slice(0, 2000))) {
    for (const m of s.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const b = m[1];
      const t = plain(tagOf(b, 'news:title'));
      const u = plain(tagOf(b, 'loc'));
      if (t && u) out.push({ t, u, d: '', at: timeOf(tagOf(b, 'news:publication_date')) ?? timeOf(tagOf(b, 'lastmod')), img: pictureOf(b) });
    }
    return out;
  }
  if (kind === 'yt') {
    // (An outlet's YouTube channel as its feed: each report's headline, its clip's address.)
    return parseChannel(s)
      .map(({ y, t, at }) => ({ t: clipTitle(t).replace(/\s*[－—–-]\s*[^－—–\s-]{0,8}新聞[網台]?$/, ''), u: `https://www.youtube.com/watch?v=${y}`, d: '', at, img: ytPicture(y) }))
      .filter(it => it.t);
  }
  if (kind === 'bing') {
    // (Bing News: the outlet's link inside Bing's own, as url=; its time Los
    // Angeles' clock labelled GMT.)
    for (const m of s.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
      const b = m[1];
      const t = plain(tagOf(b, 'title'));
      let u = '';
      try {
        u = new URL(plain(tagOf(b, 'link'))).searchParams.get('url') || '';
      } catch {}
      const at = timeOf(tagOf(b, 'pubDate'));
      // (Not AP's Spanish service's.)
      if ((t.match(SPANISH) || []).length > 1 || /[¿¡]/.test(t)) continue;
      if (t && /^https:\/\//.test(u)) out.push({ t, u, d: plain(tagOf(b, 'description')), at: at == null ? null : at + laOffset(at), img: '' });
    }
    return out;
  }
  const atom = /<feed\b/.test(s.slice(0, 2000));
  for (const m of s.matchAll(atom ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/g : /<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const t = plain(tagOf(b, 'title'));
    const u = atom ? plain(attrOf(b, 'link', 'href')) : plain(tagOf(b, 'link')) || plain(tagOf(b, 'guid'));
    const d = plain(tagOf(b, atom ? 'summary' : 'description') || (atom ? tagOf(b, 'content') : ''));
    const at = timeOf(tagOf(b, 'pubDate')) ?? timeOf(tagOf(b, 'dc:date')) ?? timeOf(tagOf(b, 'published')) ?? timeOf(tagOf(b, 'updated'));
    if (t && /^https?:\/\//.test(u)) out.push({ t, u, d, at, img: pictureOf(b) });
  }
  return out;
}

// ---- What's kept of an item --------------------------------------------------

// Not News': entertainment, style, travel, opinion, stock tips (by the
// outlet's own address for them). Sport and health are news (Jay 11-10).
const SKIP_HOST = /^(?:star|ent|istyle|auto|speed|travel|house|pets?|game|fashion|beauty|food|talk|playing|3c|partners|fun|style)\./;
const SKIP_PATH = /\/(?:entertainment|lifestyle|opinion|star|fashion|travel|horoscope|astro|recipes?|style|podcasts?|live|live-updates|newsletters?|cnn-underscored|deals|shopping)\//;
// A video report (the outlet's own video page): a story's clip.
export const isVideo = u => /\/(?:videos?|clips)\/|\/video-/.test(u);
// China Times' codes: 260410 stock tips, 260417 the army's own, 260418 health tips, 2608xx history, 262xxx opinion.
const CT_SKIP = /-(?:260410|260417|260418|2608\d\d|262\d\d\d)$/;
export function newsUrl(u) {
  try {
    const url = new URL(u);
    if (SKIP_HOST.test(url.hostname) || SKIP_PATH.test(url.pathname) || CT_SKIP.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}
// The address without trackers and fragments: one story, one address.
export function cleanUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|from$|ref$|cmpid$|rss$|ocid$|fbclid$|ch$)/i.test(k)) url.searchParams.delete(k);
    return url.toString();
  } catch {
    return u;
  }
}
// A headline without the outlet's own marks: 【快訊】, 《航運股》, 影/, 獨家》,
// "｜TVBS新聞網", " - BBC News".
export function cleanTitle(t) {
  let s = String(t || '').trim();
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s
      .replace(/^(?:【[^】]{1,10}】|\[[^\]]{1,10}\]|《[^》]{1,8}》|〈[^〉]{1,8}〉)\s*/, '')
      .replace(/^(?:快訊|獨家|最新|即時|影音?|圖|直播|更新|有片|焦點|專訪|獨|即|社論|評論|觀點|分析)\s*[／/》:：|｜]\s*/, '')
      .replace(/^[^\s》]{1,8}》\s*/, '')
      .replace(/^(?:watch|video|live)\s*:\s*/i, '')
      .trim();
    if (s === before) break;
  }
  return s.replace(/\s*[|｜]\s*[^|｜]{1,20}$/, '').replace(/\s+[-–—]\s+(?:BBC News|The Guardian|NBC News|CBS News|ABC News|Fox News|Al Jazeera|The New York Times)$/i, '').trim();
}
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
// A feed's words that aren't the report's (Jay 11-14: AP's「Copyright 2026 The
// Associated Press. All Rights Reserved.」 twice as a story's 摘要).
const BOILER = /\s*(?:Copyright\s*(?:©\s*)?\d{4}[^.]{0,80}\.\s*All [Rr]ights [Rr]eserved\.?|All [Rr]ights [Rr]eserved\.?|Continue reading\.*|Read more at [^.]{1,60}\.|\(Source: [^)]{1,40}\)|The post .{1,200} appeared first on .{1,80}?\.?$|版權所有[^。]{0,40}。?)/g;
export const unboiled = d => String(d || '').replace(BOILER, ' ').replace(/\s{2,}/g, ' ').trim();
// A summary without its dateline: （中央社記者某某台南10日電）, (記者某某／台北報導).
export const undated = s => s.replace(/^\s*[（(][^（()）]{2,40}?(?:電|報導)[)）]\s*/, '').trim();

// ---- Filler ------------------------------------------------------------------------

// Not worth a reader's time here, by the outlet's own section for it: udn's
// horoscopes, lifestyle, viral, sport, opinion and stock tips; China Times'
// entertainment and gadget reviews; Mirror's entertainment, food, health,
// travel and tabloid; TVBS's and EBC's health tips, cars, living; Up
// Media's TV dramas, games and columns.
const FILLER_SECTION = [
  /udn\.com\/news\/story\/(?:7268|7270|121591|120911|120912|7332|7002|7001|7005|6999|122629|7338|7339|123006|12806|10103|7243|7255)\//,
  /chinatimes\.com\/\w+\/\d+-2604(?:04|12)$/,
  /mirrormedia\.mg\/story\/\d{8}(?:ent|pod|hea|tour|web|money|\d)/,
  /news\.tvbs\.com\.tw\/(?:health|cars|entertainment|fun|travel|focus|news-video|pack)\//,
  /news\.ebc\.net\.tw\/news\/(?:health|living|fun|star|entertainment|travel|house|car)\//,
  /upmedia\.mg\/tw\/(?:popularity|game|commentary|master-forum|life)\//
];
// …or by the headline's own words (11-10, on that day's 4,900 headlines).
const FILLER_WORDS = {
  zh: [
    ['betting', /運彩|賠率|讓分盤|國際盤/],
    ['fortune', /星座|生肖|運勢|命理|風水|塔羅|紫微|算命|開運|招財|犯太歲|農民曆|桃花劫|財運|面相/],
    ['lottery', /威力彩|大樂透|今彩539|(?<!快)樂透|統一發票.{0,6}(?:號碼|中獎|開獎)|中獎號碼/],
    ['celebrity', /女星|男星|藝人|韓星|偶像|網紅|直播主|YouTuber|正妹|辣妹|女神|比基尼|身材|事業線|性感|緋聞|戀情|閃婚|劇組|新歌|新劇|主演|綜藝|選秀|男團|女團|粉絲見面|劇迷|演藝圈|《[^》]{1,12}》(?:劇|女主|男主)/i],
    ['viral', /網友|網狂|網曝|網推|網驚|網朝聖|網笑|網酸|網暴動|網讚|網淚|網嗨|網傻|網全|網敲碗|鄉民|PTT|Dcard|脆友|爆紅|瘋傳|神回|笑翻|獵奇|奇聞|萌翻|療癒/i]
  ],
  en: [
    ['celebrity', /\b(?:Kardashians?|celebrity|celeb|stuns|flaunts|sizzles|bikini|red carpet|showbiz|Love Island|Strictly Come|Bake Off|influencer|TikTok star|reality star)\b/i],
    ['fortune', /\b(?:horoscopes?|zodiac|astrolog\w*|tarot)\b/i],
    ['lottery', /\b(?:Powerball|Mega Millions|lottery|jackpot)\b/i],
    ['games', /\b(?:Wordle|crossword|puzzle|quiz|Connections hints?|sudoku)\b/i],
    ['promo', /\b(?:best .{0,30} to buy|gift guide|coupon|promo code|sponsored|partner content|recipe)\b/i],
    // (Betting tips, fantasy advice and TV listings aren't news: the
    // Telegraph's「Spain vs England predictions: … tips and odds」 held a
    // whole Nations League round in one story, Jay 11-14.)
    // (A wire's routine market wrap and a paper's round-up column: about
    // nothing but Taiwan, they held China's drills, Xi's reunification speech
    // and Jensen Huang under 「Taiwan shares close up 1.35%」, 11-14.)
    ['roundup', /^Taiwan (?:shares|stocks) (?:open|close|end|finish)\b|\bNews Quick Take$/i],
    ['betting', /\b(?:tips and odds|odds,? (?:and )?(?:predictions?|picks)|predictions?(?:,| and| &)? (?:odds|picks|tips|lineups)|vs?\.? .{1,40}\bpredictions?\b|best bets?|betting (?:tips|odds|lines?|preview)|expert picks|picks against the spread|parlays?|prop bets?|player props|fantasy (?:football|basketball|baseball|hockey|value|points)|start(?:\/| or )sit|how to watch|live stream|TV channel)\b/i]
  ]
};
// Filler: why ('section', 'fortune', …), or '' for news.
export function fillerOf(it, lang) {
  if (FILLER_SECTION.some(re => re.test(it.u))) return 'section';
  for (const [why, re] of FILLER_WORDS[lang]) if (re.test(it.t)) return why;
  return '';
}
// Light: clickbait ("原因曝", "這招"), tips, promos, PR. Not dropped alone,
// but a story mostly of these sinks, and carried by few, goes.
const LIGHT = {
  zh: /(?:原因|真相|內幕|下場|價碼|身分|近況|現況|答案|結果|秘訣)曝|曝光(?:了)?[！!]?$|這樣說$|回應了$|說話了$|發聲了$|竟然|竟是|「這\d?[件招種樣個物檔]」|\d大(?:前兆|地雷|族群|習慣|徵兆|好處|秘訣|特徵|陷阱)|醫揭|營養師|中醫師|藥師揭|小撇步|妙招|冷知識|懶人包|一次看|必看|必吃|必買|開箱|千萬別|你中了嗎|傻眼|驚呆|嚇傻|嚇壞|崩潰|超狂|超扯|太狂|太扯|暖心|淚崩|優惠|折扣|限時|好市多|買一送一|開賣|新品|聯名|試吃|美食|年菜|打卡|景點|賞楓|賞花|花海|嘉年華|聖誕|耶誕|市集|抽獎|免費送|登場$|週年慶|促銷|榮獲|獲獎|金質獎|頒獎|表揚|揭牌|動土|啟用|典禮|研討會|捐贈|義診|公益|感恩/,
  en: /\b(?:viral|internet reacts|you won't believe|jaw-dropping|hilarious|deal of the day)\b/i
};
export const softOf = (t, lang) => LIGHT[lang].test(t);

// ---- An outlet's own page: its picture and its clip ------------------------------

const metaOf = (html, name) => {
  const m =
    new RegExp(`<meta\\b[^>]*(?:property|name)=["']${name}["'][^>]*\\bcontent=["']([^"']+)["']`, 'i').exec(html) ||
    new RegExp(`<meta\\b[^>]*\\bcontent=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, 'i').exec(html);
  return m ? plain(m[1]) : '';
};
// A page's own picture (og:image) and the clips it says are its own (Jay
// 11-12: the videos are in the articles, Taiwan's above all):
//   y: YouTube's, played here: a VideoObject's (its embedUrl or contentUrl),
//      og:video, or a YouTube player in the article (its src, or data-src
//      where the page loads it late: TVBS, 華視, 中央社, 東森, 聯合…);
//   v: the outlet's own player, played on its site: a VideoObject's video
//      of its own (三立's mp4, 中天's), og:video, 聯合影音's player.
// Never a YouTube link alone (a list of the channel's clips beside the
// article: 華視's), never a Short (/shorts/). { i, y, v? }.
const YT_ID = /^https?:\/\/(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?(?:[^"'#]*&)?v=)|youtu\.be\/)([\w-]{11})/;
export function pageOf(html) {
  const s = String(html || '').slice(0, 600_000).replace(/\\\//g, '/').replace(/\\u002F/gi, '/');
  const i = metaOf(s, 'og:image') || metaOf(s, 'twitter:image');
  const y = [];
  const v = [];
  const add = u => {
    const url = plain(String(u || '')).trim().replace(/^\/\//, 'https://');
    const id = YT_ID.exec(url)?.[1];
    if (id) y.push(id);
    else if (/^https?:\/\/[^\s"'<>]+$/.test(url) && !/youtube\.com|youtu\.be/.test(url)) v.push(url);
  };
  // (A VideoObject's video: each of the page's ld+json read whole, else its fields where it won't parse.)
  for (const m of s.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data = null;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      if (/"@type"\s*:\s*"VideoObject"/.test(m[1])) for (const f of m[1].matchAll(/"(?:embedUrl|contentUrl)"\s*:\s*"([^"]+)"/g)) add(f[1]);
      continue;
    }
    const walk = (x, depth = 0) => {
      if (!x || typeof x !== 'object' || depth > 6) return;
      if (Array.isArray(x)) return void x.forEach(z => walk(z, depth + 1));
      const type = [].concat(x['@type'] || []);
      if (type.includes('VideoObject')) add(x.embedUrl || x.contentUrl);
      for (const k of ['@graph', 'video', 'mainEntity', 'associatedMedia']) walk(x[k], depth + 1);
    };
    walk(data);
  }
  // (Pages that say it in a tag: 公視's microdata, others' og:video.)
  for (const m of s.matchAll(/embedUrl["']?\s*content=\s*["']([^"']+)/g)) add(m[1]);
  for (const m of s.matchAll(/embedUrl["']?\s*:\s*["'](https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[\w-]{11})/g)) add(m[1]);
  add(metaOf(s, 'og:video:secure_url') || metaOf(s, 'og:video:url') || metaOf(s, 'og:video'));
  for (const m of s.matchAll(/<iframe\b[^>]*?\b(?:data-)?src=["']((?:https?:)?\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[\w-]{11})/g)) add(m[1]);
  for (const m of s.matchAll(/<iframe\b[^>]*?\b(?:data-)?src=["']((?:https?:)?\/\/video\.udn\.com\/embed\/[\w/]+)/g)) add(m[1]);
  return { i: /^https:\/\//.test(i) ? i : '', y: [...new Set(y)].slice(0, 4), ...(v.length ? { v: [...new Set(v)].slice(0, 2) } : {}) };
}
// What one outlet puts on every page is its own, not a story's: a clip on
// two of its pages or more (its live channel, a box beside each article), a
// picture on two of its pages (its logo) or on three of its feed's items (a
// stand-in). `ok(outlet, clip or picture)`; a clip counts only once two of
// the outlet's pages were read, so a box beside them all can show.
// A story's own clip (`mine`: its pages' addresses) may be on two of its
// pages (中央社's two reports on one event, one clip): it's the box only
// when on a page of another story, and counts once a page of another was read.
export function sameOf(pages, items) {
  const n = new Map();
  const read = new Map();
  const at = new Map();
  const count = k => n.set(k, (n.get(k) || 0) + 1);
  for (const it of items) {
    if (it.img) count(`f ${it.o} ${it.img}`);
    const p = pages[it.u];
    if (!p) continue;
    (read.get(it.o) || read.set(it.o, []).get(it.o)).push(it.u);
    if (p.i) count(`p ${it.o} ${p.i}`);
    for (const id of [...(p.y || []), ...(p.v || [])]) (at.get(`${it.o} ${id}`) || at.set(`${it.o} ${id}`, []).get(`${it.o} ${id}`)).push(it.u);
  }
  return {
    clip: (o, id, mine) => {
      const pages = read.get(o) || [];
      const on = at.get(`${o} ${id}`) || [];
      if (!mine) return pages.length >= 2 && on.length < 2;
      return pages.some(u => !mine.has(u)) && on.every(u => mine.has(u));
    },
    feedPic: (o, u) => (n.get(`f ${o} ${u}`) || 0) < 3,
    pagePic: (o, u) => (n.get(`p ${o} ${u}`) || 0) < 2
  };
}
// (Pictures a story carries past its own: other outlets', should its own not load.)
export const ALTS = 3;
// (Not a picture: a feed's tracking pixel, NPR's in every item, 11-14.)
const NO_PIC = /\/tracking\/|[-_/]pixel\.(?:png|gif)|spacer\.gif|\b1x1\b/i;
const SMALL_PIC = /[?&]width=(?:[1-3]\d\d)\b|\/(?:ace\/standard|news)\/240\//;
const ytPicture = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
// A feed's small picture swapped for the outlet's own larger size of it.
export const bigPicture = u =>
  String(u || '')
    .replace(/^(https:\/\/attach\.setn\.com\/newsimages\/.+)-XS\.jpg$/, '$1-PH.jpg')
    .replace(/^(https:\/\/s\.abcnews\.com\/images\/.+)_4x3_384\.jpg$/, '$1_16x9_992.jpg')
    .replace(/^(https:\/\/ichef\.bbci\.co\.uk\/(?:ace\/standard|news))\/240\//, '$1/976/');

// ---- Grouping headlines into stories ----------------------------------------

const EN_STOP = new Set('a an the and or but of to in on at for from by with as is are was were be been being it its this that these those after before over under into about amid says say said new will would could can may might has have had not no than more most up down out off how why what who when where which while vs his her their our your they he she we you us them news live update updates latest report reports top first year years day days week'.split(' '));
// (English words cut to their first six letters: impeach, impeachment;
// hacked, hacking. Short headlines need the forms to meet.)
// (Words that share their six letters with another of a different thing
// whole: SpaceX's Starship's flight joined Ukraine's Starshield story by
// 「starsh」 alone, 11-14.)
const WHOLE = new Set(['starship', 'starships', 'starshield']);
const stem = w => (WHOLE.has(w) ? w : w.slice(0, 6));
// A headline's pieces: Chinese in two-character pieces, other words whole
// (English stemmed lightly, short words and numbers of one digit left out).
// The words of a company's monthly report (營收, 年增, 創新高…): every
// company's, so they'd make one story of a day's reports (Jay 11-10: 台積電's
// sheet held 豆府's, 大東電's, 全家's).
// (And a quarter's results: 前三季, 股本, EPS, Q3. Jay's 11-10 rule, one
// company's report never another's story: 11-12's held 中華電's, 聯發科's,
// 和碩's and 宜特's October by 「10」 alone, and 陽明's, 祥碩's and 霈方's
// quarters by 前三季 and 股本.)
const ZH_STOP = new Set('營收 月營 收月 收年 收創 月增 年增 增率 月減 年減 創新 新高 同期 期新 累計 億元 單月 歷史 史新 合併 併營 前十 財報 獲利 毛利 每股 前三 三季 前二 二季 前四 四季 單季 季賺 賺逾 賺近 個股 股本 元創 半個 金前 這大'.split(' '));
const ZH_LATIN_STOP = /^(eps|q[1-4]|[1-4]q)$/;
export function piecesOf(title, lang) {
  const s = cleanTitle(title).normalize('NFKC').toLowerCase();
  const out = [];
  if (lang === 'zh') {
    for (const run of s.match(/[㐀-鿿]+/g) || []) {
      if (run.length === 1) out.push(run);
      for (let i = 0; i + 1 < run.length; i++) if (!ZH_STOP.has(run.slice(i, i + 2))) out.push(run.slice(i, i + 2));
    }
    // (A month's number, 「10月」, says only when: every company's October report has it.)
    for (const w of s.replace(/\d+\s*月/g, ' ').match(/[a-z][a-z0-9.+-]*[a-z0-9]|\d{2,}/g) || []) if (!ZH_LATIN_STOP.test(w)) out.push(w);
    return out;
  }
  for (const w of s.replace(/['’]s\b/g, '').match(/[a-z0-9][a-z0-9-]*/g) || []) if (w.length > 2 && !EN_STOP.has(w)) out.push(stem(w));
  return out;
}

const norm = v => {
  let n = 0;
  for (const x of v.values()) n += x * x;
  return Math.sqrt(n) || 1;
};
function cosine(a, an, b, bn) {
  let dot = 0;
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  for (const [k, x] of s) {
    const y = l.get(k);
    if (y) dot += x * y;
  }
  return dot / (an * bn);
}
// How near is near enough: by language (two-character pieces overlap more
// by chance); then stories whose middles are this near are one.
export const JOIN = { zh: 0.27, en: 0.24 };
export const MERGE = { zh: 0.36, en: 0.3 };
// An English summary's words count for this much of a headline's.
const SUM_WEIGHT = 0.4;
const TEAM_WEIGHT = 0.6;
const GAP = 24 * HOUR;
// 快訊: outlets on a story in the last BURST, a new one's (LIVE_NEW) or an old one's new turn's (LIVE_TURN).
export const BURST = 2 * HOUR;
export const LIVE_NEW = 7;
export const LIVE_TURN = 10;

const add = (v, k, x) => v.set(k, (v.get(k) || 0) + x);

// A headline's weighed pieces, each by how rare it is among these items':
// weigh(items, lang) → it => Map(piece → weight).
export function weigh(items, lang) {
  const docOf = it => ({ p: piecesOf(it.t, lang), s: lang === 'en' && it.d ? piecesOf(unboiled(it.d), lang) : [] });
  const df = new Map();
  for (const it of items) {
    const d = docOf(it);
    for (const p of new Set([...d.p, ...d.s])) df.set(p, (df.get(p) || 0) + 1);
  }
  // Rarity counted as if among a day's headlines at least (a quiet hour's
  // few would weigh a shared piece below a stray one, or drop it).
  const N = Math.max(items.length, 600);
  // A piece in more than one headline in twelve says nothing of which story.
  const common = N / 12;
  return it => {
    const d = docOf(it);
    const v = new Map();
    if (!d.p.length) return v;
    for (const [list, w] of [[d.p, 1], [d.s, SUM_WEIGHT]])
      for (const p of list) {
        const n = df.get(p) || 1;
        if (n > common) continue;
        add(v, p, w * Math.log(N / n));
      }
    // (The game a report names, as weighty as all its words: two reports of
    // one game are near whatever words each chose, gameOf.)
    const game = gameOf(it.t, lang);
    const words = norm(v);
    if (game && v.size) v.set(`#${game}`, words);
    // (And each team a sports report names, a little: 「七六人逆轉奪第10勝」
    // names one team of that game.)
    const teams = !PREVIEW.test(it.t) && teamsOf(it.t, lang);
    if (teams && v.size) for (const x of teams) v.set(`#t:${x}`, (TEAM_WEIGHT * words) / teams.size);
    return v;
  };
}

// items: [{ o, t, u, d, at, img }] of one region → stories (unranked).
// The teams a sports headline names (Sports' 11-13: AP's「Rockets and Jazz
// meet Friday in NBA Cup group stage」,「Warriors visit Spurs Friday…」and
// Reuters' Blazers-Kings, one template each, were made one story). Two
// headlines or stories that both name teams and share none are two games,
// never joined. Read only where a headline is sport's (a Senators' bill isn't
// Ottawa's). null: none named, or not sport.
const NICKS = ('Hawks|Celtics|Nets|Hornets|Bulls|Cavaliers|Cavs|Mavericks|Mavs|Nuggets|Pistons|Warriors|Rockets|Pacers|Clippers|Lakers|Grizzlies|Heat|Bucks|Timberwolves|Pelicans|Knicks|Thunder|Magic|76ers|Sixers|Suns|Trail Blazers|Blazers|Kings|Spurs|Raptors|Jazz|Wizards|' +
  'Diamondbacks|D-backs|Braves|Orioles|Red Sox|Cubs|White Sox|Reds|Guardians|Rockies|Tigers|Astros|Royals|Angels|Dodgers|Marlins|Brewers|Twins|Mets|Yankees|Athletics|Phillies|Pirates|Padres|Giants|Mariners|Cardinals|Rays|Rangers|Blue Jays|Nationals|' +
  'Falcons|Ravens|Bills|Panthers|Bears|Bengals|Browns|Cowboys|Broncos|Lions|Packers|Texans|Colts|Jaguars|Chiefs|Raiders|Chargers|Rams|Dolphins|Vikings|Patriots|Saints|Jets|Eagles|Steelers|49ers|Seahawks|Buccaneers|Bucs|Titans|Commanders|' +
  'Ducks|Bruins|Sabres|Flames|Hurricanes|Blackhawks|Avalanche|Blue Jackets|Stars|Red Wings|Oilers|Canadiens|Predators|Devils|Islanders|Senators|Flyers|Penguins|Sharks|Kraken|Blues|Lightning|Maple Leafs|Canucks|Golden Knights|Capitals|Wild|Mammoth');
const TEAM_EN = new RegExp(`\\b(?:${NICKS})\\b`, 'g');
const TEAM_ZH = /七六人|老鷹|塞爾提克|籃網|黃蜂|公牛|騎士|獨行俠|金塊|活塞|勇士|火箭|溜馬|快艇|湖人|灰熊|熱火|公鹿|灰狼|鵜鶘|尼克|雷霆|魔術|76人|太陽|拓荒者|國王|馬刺|暴龍|爵士|巫師|響尾蛇|金鶯|紅襪|小熊|白襪|紅人|守護者|落磯|老虎|太空人|皇家|天使|道奇|馬林魚|釀酒人|雙城|大都會|洋基|運動家|費城人|海盜|教士|巨人|水手|紅雀|光芒|遊騎兵|藍鳥|國民|兄弟|統一獅|桃猿|悍將|味全龍|台鋼雄鷹/g;
const SPORT_TOPIC = TOPICS.find(t => t.id === 'sport');
// (One team, many names: 七六人 and 76人 one, Sixers and 76ers.)
const TEAM_SAME = { 七六人: '76人', sixers: '76ers', cavs: 'cavaliers', mavs: 'mavericks', blazers: 'trail blazers', 'd-backs': 'diamondbacks', bucs: 'buccaneers' };
// (「Spain vs England」, 「Portugal v Denmark」: the sides of a game the
// nicknames don't know, a national team's or a club's.)
const VERSUS = /\b([A-Z][\w'.-]+)\s+(?:vs\.?|v\.?|versus)\s+([A-Z][\w'.-]+)/g;
export function teamsOf(title, lang) {
  const t = String(title || '');
  if (!(lang === 'en' ? SPORT_TOPIC.en_ : [SPORT_TOPIC.zh_]).some(re => re.test(t))) return null;
  const found = [...(t.match(lang === 'en' ? TEAM_EN : TEAM_ZH) || []), ...(lang === 'en' ? [...t.matchAll(VERSUS)].flatMap(m => [m[1], m[2]]) : [])];
  return found.length ? new Set(found.map(x => TEAM_SAME[x.toLowerCase()] || x.toLowerCase())) : null;
}
// A game's report: a sports headline naming its two teams, not a preview.
// Taiwan's six reports of 七六人 v 暴龍 had too few words in common to be
// one story (Jay 11-14: "not even merge together, all independent"); the
// game they name is: a piece of the headline's own, as weighty as its words.
const PREVIEW = /預告|賽程|轉播|看點|前瞻|直播|出戰成疑|今日賽事|\bpreviews?\b|\bhow to watch\b|\bpredictions?\b|\bodds\b|\bpicks\b|\bwhat to know\b|\bthings to watch\b|\bkeys to\b|\blive updates\b|\bstarting lineups?\b/i;
export function gameOf(title, lang) {
  if (PREVIEW.test(title)) return '';
  const teams = teamsOf(title, lang);
  return teams?.size === 2 ? [...teams].sort().join('|') : '';
}
// (Both name teams, none the same: two games.)
export const otherGame = (a, b) => Boolean(a && b && ![...a].some(x => b.has(x)));
const withTeams = (into, more) => (more ? new Set([...(into || []), ...more]) : into);

export function groupStories(items, lang, { join = JOIN[lang], merge = MERGE[lang] } = {}) {
  const vecOf = weigh(items, lang);
  const docs = items.map(it => ({ it, v: vecOf(it), teams: teamsOf(it.t, lang) })).filter(d => d.v.size);
  for (const d of docs) d.n = norm(d.v);
  docs.sort((a, b) => (a.it.at || 0) - (b.it.at || 0));
  let groups = [];
  const index = new Map(); // piece → groups holding it
  const note = (k, g) => (index.get(k) || index.set(k, []).get(k)).push(g);
  for (const d of docs) {
    if (!d.v.size) continue;
    // (Each near group's dot product summed piece by piece, the groups in the
    // order first met: one pass, not a cosine for each, 11-13: two thirds of
    // a build's CPU went to cosines.)
    const dots = new Map();
    for (const [p, x] of d.v) {
      for (const g of index.get(p) || []) {
        if ((d.it.at || 0) - g.last > GAP) continue;
        dots.set(g, (dots.get(g) || 0) + x * g.v.get(p));
      }
    }
    let best = null;
    let bestSim = 0;
    for (const [g, dot] of dots) {
      if (otherGame(d.teams, g.teams)) continue;
      const sim = dot / (d.n * (g.n ??= norm(g.v)));
      if (sim > bestSim) (bestSim = sim), (best = g);
    }
    if (best && bestSim >= join) {
      best.docs.push(d);
      for (const [k, x] of d.v) {
        if (!best.v.has(k)) note(k, best);
        add(best.v, k, x);
      }
      best.n = null;
      best.teams = withTeams(best.teams, d.teams);
      best.last = Math.max(best.last, d.it.at || 0);
      best.first = Math.min(best.first, d.it.at || 0);
    } else {
      const g = { docs: [d], v: new Map(d.v), n: d.n, teams: d.teams, last: d.it.at || 0, first: d.it.at || 0 };
      groups.push(g);
      for (const k of d.v.keys()) note(k, g);
    }
  }
  // Two stories with near middles, overlapping in time, are one (the same
  // news in other words, split by the order headlines came in).
  for (const g of groups) g.n = norm(g.v);
  const into = new Map();
  const root = g => {
    while (into.has(g)) g = into.get(g);
    return g;
  };
  for (const g of groups) {
    // (Each pair's dot product summed over the pieces they share, then
    // asked once, in the order met: its answer doesn't change.)
    const dots = new Map();
    for (const [k, x] of g.v)
      for (const h of index.get(k) || []) {
        if (h === g || h.first > g.last + GAP || g.first > h.last + GAP) continue;
        dots.set(h, (dots.get(h) || 0) + x * h.v.get(k));
      }
    for (const [h, dot] of dots) {
      const a = root(g);
      const b = root(h);
      if (a !== b && !otherGame(a.teams, b.teams) && dot / (g.n * h.n) >= merge) into.set(b, a), (a.teams = withTeams(a.teams, b.teams));
    }
  }
  const whole = new Map();
  for (const g of groups) {
    const r = root(g);
    if (!whole.has(r)) whole.set(r, { docs: [], v: new Map() });
    const w = whole.get(r);
    w.docs.push(...g.docs);
    for (const [k, x] of g.v) add(w.v, k, x);
  }
  groups = [...whole.values()];
  return groups.map(g => {
    g.n = norm(g.v);
    return g.docs.map(d => ({ ...d.it, near: cosine(d.v, d.n, g.v, g.n) }));
  });
}

// A story from its headlines: the plainest of its last day's leads (nearest
// the story's middle, a wire service or public broadcaster a little ahead),
// so a story that runs for days is led by its latest turn.
// A video's thumbnail (YouTube's): its words burned in.
export const THUMB_PIC = /^https?:\/\/(?:i\d?\.ytimg\.com|img\.youtube\.com)\//;
const STEADY = new Set(['gov', 'public']);
const TOPIC = Object.fromEntries(TOPICS.map(t => [t.id, t]));
const twDay = at => new Date(at + 8 * HOUR).toISOString().slice(5, 10);
export function storyOf(items, region, now, { pages = {}, same = sameOf(pages, items), vids = [] } = {}) {
  const lang = region === 'tw' ? 'zh' : 'en';
  const newest = [...items].sort((a, b) => (b.at || 0) - (a.at || 0));
  const byOutlet = new Map();
  for (const it of newest) {
    if (!byOutlet.has(it.o)) byOutlet.set(it.o, []);
    if (byOutlet.get(it.o).length < 3) byOutlet.get(it.o).push(it);
  }
  const ats = items.map(it => it.at || now);
  const at = Math.max(...ats);
  const first = Math.min(...ats);
  // (A video page doesn't lead: its headline is often "Watch: …".)
  const rank = it => (it.near ?? 0) + (STEADY.has(OUTLETS[it.o]?.kind) ? 0.12 : 0) - (it.v ? 0.3 : 0);
  const lead = items.filter(it => (it.at || now) >= at - 24 * HOUR).sort((a, b) => rank(b) - rank(a))[0];
  // (In the headline's own language: a Chinese headline over an English
  // outlet's summary was seen on the iPhone, 11-12; none rather than that.)
  const han = x => /\p{Script=Han}/u.test(x || '');
  const withSum = [lead, ...newest].map(it => ({ ...it, d: unboiled(it.d) })).find(it => it.d.length >= 20 && han(it.d) === han(lead.t));
  // The picture: a feed's own, else the one the outlet set on its page.
  // (Nearest the story's middle first: the FAA's ground stop led with a
  // Texas football photo from a report on the games it held up, Jay 11-14.)
  const central = [...items].sort((a, b) => (b.near ?? 0) - (a.near ?? 0));
  const pics = [lead, ...central].flatMap(it => {
    const p = pages[it.u]?.i;
    return [it.img && !NO_PIC.test(it.img) && same.feedPic(it.o, it.img) && [bigPicture(it.img), it.o], p && !NO_PIC.test(p) && same.pagePic(it.o, p) && [p, it.o]];
  });
  // The story's clips: each outlet's own YouTube clip on its page, then the
  // channels' clips matched to it (matchClips), newest first; the outlets'
  // own video pages (played on their sites) only after those, should room be
  // left (Jay 11-13: a world story's 8 video pages had kept every channel
  // clip out, and none played here).
  const clips = [];
  const own = [];
  const ids = new Set();
  const mine = new Set(items.map(it => it.u));
  for (const it of newest) {
    const y = (pages[it.u]?.y || []).filter(id => same.clip(it.o, id, mine) && !ids.has(id));
    for (const id of y) {
      ids.add(id);
      clips.push([it.o, id, it.u, cleanTitle(it.t), ytPicture(id)]);
    }
    if (!y.length && (it.v || (pages[it.u]?.v || []).some(u => same.clip(it.o, u, mine)))) own.push([it.o, '', it.u, cleanTitle(it.t), bigPicture(it.img || pages[it.u]?.i || '')]);
  }
  for (const v of [...vids].sort((x, z) => z.at - x.at)) {
    if (ids.has(v.y) || clips.length >= CLIPS_MAX) continue;
    ids.add(v.y);
    clips.push([v.o, v.y, `https://www.youtube.com/watch?v=${v.y}`, clipTitle(v.t), ytPicture(v.y)]);
  }
  // (Each outlet's first before any outlet's second: many voices, not one
  // channel's six takes.)
  const turn = new Map();
  const seen = clips.map(c => turn.set(c[0], (turn.get(c[0]) || 0) + 1).get(c[0]));
  const played = clips.map((c, i) => [c, seen[i], i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]);
  clips.splice(0, clips.length, ...played, ...own);
  // (A thumbnail's size, The Guardian's 140 kept from before, only when no other.)
  // (A photo before a video's thumbnail: a channel's frame carries its words
  // burned in, 民視's 「6死27傷！」 over 寶林茶室's story, Jay 11-13; a
  // thumbnail only when no outlet gave a photo.)
  const photo = p => p && !THUMB_PIC.test(p[0]);
  const byLook = [...pics.filter(p => photo(p) && !SMALL_PIC.test(p[0])), ...pics.filter(photo), ...pics.filter(p => p && !SMALL_PIC.test(p[0])), ...pics];
  const withImg = byLook.find(Boolean) || (clips[0]?.[4] && [clips[0][4], clips[0][0]]);
  // Others to show should a phone fail to load it (an outlet that refuses
  // another site its pictures, Jay 11-11): each another outlet's, a clip's last.
  const alts = [];
  const tried = new Set([withImg?.[1]]);
  for (const p of [...byLook, ...clips.map(c => c[4] && [c[4], c[0]])]) {
    if (alts.length >= ALTS || !p || tried.has(p[1])) continue;
    tried.add(p[1]);
    alts.push(p);
  }
  const sides = region === 'tw' ? { g: 0, c: 0, b: 0 } : { l: 0, c: 0, r: 0 };
  for (const o of byOutlet.keys()) {
    const s = sideOf(o, region);
    if (s) sides[s]++;
  }
  const [left, right] = region === 'tw' ? ['g', 'b'] : ['l', 'r'];
  const n = byOutlet.size;
  const m = items.length;
  const days = new Map();
  for (const t of ats) days.set(twDay(t), (days.get(twDay(t)) || 0) + 1);
  const parties = region === 'tw' ? partiesIn(items.map(it => it.t).join(' ')) : [];
  // What it's about (a party named is politics); none: not News'.
  let topics = topicsOf(items.map(it => it.t), lang);
  if (!topics.length && lang === 'en') topics = topicsOf(items.map(it => `${it.t} ${it.d || ''}`), lang);
  // (A party named is politics where none else is, or 40% of its headlines name one.)
  const named = parties.length ? items.filter(it => partiesIn(it.t).length).length / items.length : 0;
  if (parties.length && !topics.includes('pol') && (!topics.length || named >= SECOND)) topics = [...topics, 'pol'].slice(0, 3);
  const kinds = topics.map(id => TOPIC[id]).filter(Boolean);
  // 單邊 (one side), as the story alone tells it: `blind`, the side that
  // left it out or all but (blindOf); the region's pass (oneSidedOf) weighs
  // it against the day's coverage and keeps only the important.
  const blind = oneSidedKind(kinds) && now - first >= ONE_AGE ? blindOf(sides, region, 1, 0) : '';
  // Light: a share of its headlines clickbait, tips, promos (softOf).
  const light = items.filter(it => softOf(it.t, lang)).length / m;
  // Importance: how many outlets carry it, how much they wrote, for how many
  // days; carried by both sides a little ahead, a light one behind, and by
  // its kind (a game behind the news: TOPICS' weight).
  // (Headlines counted 4 an outlet at most: one prolific outlet doesn't make a story big.)
  const per = new Map();
  for (const it of items) per.set(it.o, Math.min(4, (per.get(it.o) || 0) + 1));
  const wrote = [...per.values()].reduce((a, b) => a + b, 0);
  const weight = kinds[0]?.weight ?? 1;
  const imp = (n + 2 * Math.log2(wrote) + 1.5 * Math.min(days.size - 1, 6)) * (sides[left] && sides[right] ? 1.2 : 1) * (1 - light * 0.7) * weight;
  // 快訊 (breaking, Jay 11-12: 黃仁勳's going sat 19th for an hour): many
  // outlets on it in the last 2 hours, a story new within 4 hours or a big
  // new turn of an old one (news, not a game or a show); ranked up while it lasts.
  const heat = byOutlet.size && [...byOutlet.values()].filter(list => (list[0].at || now) >= now - BURST).length;
  const live = weight >= 1 && light < 0.3 && ((heat >= LIVE_NEW && now - first <= 4 * HOUR) || heat >= LIVE_TURN);
  return {
    id: idOf(items.reduce((a, b) => ((a.at || 0) <= (b.at || 0) ? a : b)).u),
    title: cleanTitle(lead.t),
    // (Whose each is: the headline, the summary and the picture are the
    // outlets' own, credited on the phone.)
    by: lead.o,
    sum: withSum ? cut(undated(withSum.d), SUM_MAX[lang]) : '',
    sumBy: withSum?.o || '',
    img: withImg?.[0] || '',
    imgBy: withImg?.[1] || '',
    ...(alts.length ? { alts } : {}),
    at,
    first,
    n,
    m,
    days: [...days].sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    sides,
    blind,
    parties,
    topics,
    imp: Math.round(imp * 10) / 10,
    clips: clips.slice(0, CLIPS_SHOWN),
    items: [...byOutlet.values()].flat().map(it => [it.o, cleanTitle(it.t), it.u, it.at || now, ...(it.v ? [1] : [])]),
    // (Ranked on the front page by importance fading by half in 36 hours.)
    score: imp * 0.5 ** ((now - at) / (36 * HOUR)) * (live ? 1 + 0.12 * (Math.min(heat, 12) - 2) : 1),
    ...(live ? { live: heat } : {}),
    light
  };
}
// A story's id: its first headline's address, hashed short (FNV-1a), so a
// story keeps its id from build to build as headlines join it.
export function idOf(u) {
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}
// (A new story's id never one a kept story has: a headline let go from a
// story it gave its id to can start one of its own.)
const freeId = (u, recs) => {
  const taken = new Set(recs.map(r => r.id));
  let id = idOf(u);
  for (let i = 2; taken.has(id); i++) id = idOf(`${u}#${i}`);
  return id;
};
const enough = (outlets, region) => outlets.size >= FEWEST[region] || (outlets.size >= 2 && [...outlets].some(o => STEADY.has(OUTLETS[o]?.kind)));
const sumOf = vs => {
  const v = new Map();
  for (const x of vs) for (const [k, w] of x) add(v, k, w);
  return v;
};
// What a story keeps of a headline.
// (A story's headline this far from the rest of it, leaving it out, isn't
// the story's: measured on 11-12's page, strays sat under 0.05 (English) and
// 0.075 (Chinese), the story's own above.)
export const STRAY = { zh: 0.075, en: 0.05 };
const STRAY_MIN = 6;
// A story's core and what it keeps (Jay 11-13, a world story of 38 outlets
// over four days: "spread text … not so helpful trying to understand it"):
// a story grows a headline at a time, each near enough to the whole, and
// drifts (Trump pulling Vance from the Iran talks held Pence's 2028 run,
// Mark Kelly's, Hegseth's impeachment: Vance and Iran in each). Its core is
// the headlines most others are near (near JOIN to at least half as many
// as the best-joined headline); a headline is the story's if it is near
// that core (CORE), else let go, grouped again at the next build.
export const CORE = { zh: 0.2, en: 0.2 };
export function coreKeep(vs, lang) {
  const ns = vs.map(norm);
  // (A wire's headline that ten outlets ran word for word counts once: its
  // copies near each other would make the core that one wording, 11-13: 中央社's
  // 「黃仁勳辭輝達執行長 科技界憂…」 left out every report of who took over.)
  const one = [];
  for (let i = 0; i < vs.length; i++) if (!one.some(j => cosine(vs[i], ns[i], vs[j], ns[j]) >= 0.9)) one.push(i);
  const nb = new Map(one.map(i => [i, 0]));
  // (Its headlines near each other, joined: the core is the largest such
  // group's best joined, never two groups' mix: 11-13, a story held Harry
  // Kane's record and Wes Moore's book, its core both, keeping everything.)
  const root = new Map(one.map(i => [i, i]));
  const find = i => (root.get(i) === i ? i : (root.set(i, find(root.get(i))), root.get(i)));
  for (let a = 0; a < one.length; a++)
    for (let b = a + 1; b < one.length; b++) {
      const i = one[a], j = one[b];
      if (cosine(vs[i], ns[i], vs[j], ns[j]) >= JOIN[lang]) nb.set(i, nb.get(i) + 1), nb.set(j, nb.get(j) + 1), root.set(find(i), find(j));
    }
  const size = new Map();
  for (const i of one) size.set(find(i), (size.get(find(i)) || 0) + 1);
  const big = [...size].sort((a, b) => b[1] - a[1])[0][0];
  const mine = one.filter(i => find(i) === big);
  const top = Math.max(...mine.map(i => nb.get(i)));
  if (top < 2) return vs.map(() => true);
  const core = sumOf(mine.filter(i => nb.get(i) * 2 >= top).map(i => vs[i]));
  const cn = norm(core);
  return vs.map((v, i) => cosine(v, ns[i], core, cn) >= CORE[lang]);
}
// Which of a story's headlines it keeps: those near its core (coreKeep) and
// not sharing next to nothing with the rest (STRAY: a group joins the story
// of any one headline it holds, 11-12: the Hegseth impeachment story held
// LSU's coach, China's car sales and oil prices), as long as enough outlets
// are left (else all). vs: the headlines' weighed pieces.
export function keptOf(vs, lang, region, outlets) {
  if (vs.length < STRAY_MIN) return vs.map(() => true);
  const near = coreKeep(vs, lang);
  const c = sumOf(vs);
  const keep = vs.map((v, i) => {
    if (!near[i]) return false;
    const rest = new Map(c);
    for (const [k, x] of v) rest.set(k, rest.get(k) - x);
    return cosine(v, norm(v), rest, norm(rest)) >= STRAY[lang];
  });
  return enough(new Set(outlets.filter((_, i) => keep[i])), region) ? keep : vs.map(() => true);
}

// A company's own report (a month's 營收, a quarter's EPS) and whose it is:
// the words before the report's in the first piece of the headline that
// says one (「陽明Q3賺逾半個股本」 → 陽明, 「辣椒財報／…」 → 辣椒), '' when
// it's no report or says no name. Jay's 11-10 rule: one company's report is
// never another's story.
const REPORT = /營收|EPS|每股|股本|獲利|財報|盈餘|自結|前[一二三四1-4]季|前\d{1,2}月|前十[一二]?月|第[一二三四1-4]季|Q[1-4]/i;
const REPORT_AT = /\d|連[\d一二三四五六七八九十]|前[一二三四十\d]|第[一二三四\d]|Q[1-4]|今年|去年|明年|上半年|營收|EPS|每股|股本|獲利|財報|盈餘|自結|單月|稅[前後]/i;
export function reportOf(title) {
  for (const piece of cleanTitle(title).split(/[／/！!？?，,：:；;｜|「」【】]+/)) {
    if (!REPORT.test(piece)) continue;
    const name = piece.slice(0, piece.search(REPORT_AT)).replace(/^(獲利|營收|財報)+/, '').trim();
    if (name.length >= 2 && name.length <= 8 && /[㐀-鿿A-Za-z]/.test(name)) return name;
  }
  return '';
}
// A story's reports: whose they are (`owner`, the company named in the most
// of its headlines, two at least) and whether more than one company's are in
// it (`mixed`). A mixed story keeps its owner's reports alone; with no owner
// (a day's reports, one each) none of them; one company's alone, it's theirs.
export function reportsOwner(titles) {
  const names = [...new Set(titles.map(reportOf).filter(Boolean))];
  const count = n => titles.filter(t => t.includes(n)).length;
  const top = names.sort((a, b) => count(b) - count(a))[0];
  return { owner: top && (count(top) >= 2 || names.length === 1) ? top : '', mixed: names.length >= 2 };
}
// Whether a headline is another company's report than the story's `owner`.
export const otherReport = (title, owner) => Boolean(reportOf(title)) && !(owner && title.includes(owner));
const keepOf = ({ o, t, u, at, d, img, v }) => ({ o, t, u, at, ...(d ? { d } : {}), ...(img ? { img } : {}), ...(v ? { v } : {}) });

// Each channel clip to the kept story its title is nearest: near enough
// (CLIP_NEAR, the title against the story's middle), from a day before its
// first headline to a day after its last. → Map(rec → clips).
// (Or a little less near the middle but near one of its headlines too,
// CLIP_LOOSE: a channel's title runs long with its own words, 寶林茶室's
// 「婦:終身洗腎沒賠償?!」, and a big story's middle is wide; Jay 11-13 "a lot of
// news only got a few video". Both must hold: a headline alone took
// 蔣萬安's campaign clip to another 沈伯洋 story.)
export const CLIP_NEAR = { zh: 0.24, en: 0.28 };
export const CLIP_LOOSE = { zh: [0.15, 0.17], en: [0.2, 0.4] };
const CLIPS_MAX = 8;
// (A story's clips shown: its sheet's row scrolls.)
export const CLIPS_SHOWN = 6;
function matchClips(vids, sized, vecOf, lang) {
  const out = new Map();
  if (!vids.length || !sized.length) return out;
  // (Which stories each piece is in: a clip is weighed against those only.)
  const by = new Map();
  for (const x of sized) for (const k of x.c.keys()) (by.get(k) || by.set(k, []).get(k)).push(x);
  const [looseMid, looseHead] = CLIP_LOOSE[lang];
  for (const v of vids) {
    const vv = vecOf({ t: clipTitle(v.t) });
    if (vv.size < 2) continue;
    const vn = norm(vv);
    const near = new Map();
    for (const [k, y] of vv) for (const x of by.get(k) || []) near.set(x, (near.get(x) || 0) + y * x.c.get(k));
    let best = null;
    let bestSim = 0;
    let loose = null;
    let looseBy = 0;
    for (const [x, dot] of near) {
      if (v.at < x.first - 24 * HOUR || v.at > x.last + 24 * HOUR) continue;
      const sim = dot / (vn * x.cn);
      if (sim > bestSim) (bestSim = sim), (best = x.r);
      if (sim < looseMid || sim >= CLIP_NEAR[lang]) continue;
      // (Its nearest headline, asked only of a story already this near.)
      x.ns ||= x.vs.map(norm);
      let head = 0;
      for (let i = 0; i < x.vs.length; i++) head = Math.max(head, cosine(vv, vn, x.vs[i], x.ns[i]));
      if (head >= looseHead && sim + head > looseBy) (looseBy = sim + head), (loose = x.r);
    }
    const to = best && bestSim >= CLIP_NEAR[lang] ? best : loose;
    if (to) (out.get(to) || out.set(to, []).get(to)).push(v);
  }
  return out;
}

// The desk: today's headlines grouped, each group added to the story it
// continues (one of its headlines already that story's, or, after a quiet
// spell, its last day's headlines near), else a new story if FEWEST outlets
// carry it and it has a topic. recs: the stories kept, [{ id, r, first,
// last, peak, items }]. → { tw, intl } (the front: heard of in NOW_MS,
// ranked), past: { tw, intl } (older, by importance), recs (to keep).
export function deskOf(items, recs = [], now, { pages = {}, vids = [], who = {} } = {}) {
  // (A kept headline read again takes the feed's picture as it is now: a
  // larger one, once the build asks for it.)
  const fresh = new Map(items.filter(it => it.img).map(it => [it.u, it.img]));
  const live = recs.filter(r => now - r.last <= keepFor(r.peak || 0)).map(r => ({ ...r, items: r.items.map(it => (fresh.has(it.u) && fresh.get(it.u) !== it.img ? { ...it, img: fresh.get(it.u) } : it)) }));
  const every = new Map();
  for (const it of [...live.flatMap(r => r.items), ...items]) every.set(it.u, it);
  const same = sameOf(pages, [...every.values()]);
  const out = { tw: [], intl: [], past: { tw: [], intl: [] }, recs: live, sport: { tw: [], intl: [] } };
  for (const region of ['tw', 'intl']) {
    const lang = region === 'tw' ? 'zh' : 'en';
    const mine = items.filter(it => OUTLETS[it.o]?.region === region && now - (it.at || now) <= WINDOW[region] && !fillerOf(it, lang));
    const vecOf = weigh(mine, lang);
    const recsHere = live.filter(r => r.r === region);
    // Sports and the rest are two desks (Jay 11-14: a story of Harry Kane's
    // record held AP's Rubio and a Washington recruit, and the FAA's ground
    // stop led with a Texas football photo): a sports report only ever joins
    // a sports story, the rest only the rest's. A sports report: a sports
    // outlet's, or a headline that is about sport first.
    const deskOf_ = new Map();
    const sporty = it => {
      let v = deskOf_.get(it.u);
      if (v === undefined) deskOf_.set(it.u, (v = SPORTS_OUTLETS.has(it.o) || topicsOf([it.t], lang)[0] === 'sport'));
      return v;
    };
    const twoDesks = list => [...groupStories(list.filter(sporty), lang).map(g => Object.assign(g, { sp: true })), ...groupStories(list.filter(it => !sporty(it)), lang).map(g => Object.assign(g, { sp: false }))];
    // Each kept story back to its core first: what drifted from it is let go
    // before today's groups are placed, so it can join or start the story
    // it's really about (11-13: Pence's 2028 run out of Trump's Iran deal).
    for (const r of recsHere) {
      // (Its desk by most of its headlines; the other desk's, and filler,
      // let go: a story mixed before 11-14 is mended at the next build.)
      r.sp = r.items.filter(sporty).length * 2 > r.items.length;
      const own = r.items.filter(it => sporty(it) === r.sp && !fillerOf(it, lang));
      if (own.length < r.items.length) r.items = enough(new Set(own.map(it => it.o)), region) || (r.sp && new Set(own.map(it => it.o)).size >= 2) ? own : [];
      if (!r.items.length) continue;
      const keep = keptOf(r.items.map(vecOf), lang, region, r.items.map(it => it.o));
      if (keep.some(k => !k)) r.items = r.items.filter((_, i) => keep[i]);
    }
    const owner = new Map();
    for (const r of recsHere) for (const it of r.items) owner.set(it.u, r);
    const open = r => now - r.first <= OPEN_MS;
    // (Each kept story's last day, weighed once; only stories kept before
    // this build: today's groups were already kept apart by groupStories.)
    const lastDays = recsHere
      .filter(open)
      .map(r => {
        const v = sumOf(r.items.filter(it => it.at >= r.last - 24 * HOUR).map(vecOf));
        return { r, v, n: norm(v), whose: lang === 'zh' ? reportsOwner(r.items.map(it => it.t)).owner : '' };
      });
    // (Which kept stories each piece is in: a group is weighed against those only.)
    const daysBy = new Map();
    for (const x of lastDays) for (const k of x.v.keys()) (daysBy.get(k) || daysBy.set(k, []).get(k)).push(x);
    const loose = [];
    // A new story from a group, if it has a topic and enough outlets carry it.
    const startOf = g => {
      const sp = g.sp;
      const texts = g.map(it => (lang === 'en' ? `${it.t} ${it.d || ''}` : it.t));
      const kinds = topicsOf(texts, lang);
      if (!kinds.length && !partiesIn(texts.join(' ')).length) return null;
      // (A kind past the sides, health, science, sport…, needs only two:
      // its tab isn't empty, and there's no side to weigh, Jay 11-10.)
      const outlets = new Set(g.map(it => it.o));
      if (!enough(outlets, region) && !(outlets.size >= 2 && TOPIC[kinds[0]]?.spectrum === false)) {
        // (Sports' one-outlet reports, an injury, a move, aren't a story on
        // News' pages, but are what Orbit Sports links to: news/sport.json.)
        if (kinds.includes('sport')) loose.push(g);
        return null;
      }
      const firstIt = g.reduce((a, b) => ((a.at || 0) <= (b.at || 0) ? a : b));
      const rec = { id: freeId(firstIt.u, live), r: region, first: firstIt.at || now, last: firstIt.at || now, peak: 0, items: [], sp };
      live.push(rec);
      recsHere.push(rec);
      return rec;
    };
    for (const g of twoDesks(mine)) {
      const hits = new Map();
      for (const it of g) {
        const r = owner.get(it.u);
        if (r && open(r) && r.sp === g.sp) hits.set(r, (hits.get(r) || 0) + 1);
      }
      let rec = [...hits].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!rec) {
        const gFirst = Math.min(...g.map(it => it.at || now));
        const gv = sumOf(g.map(vecOf));
        const gn = norm(gv);
        let best = null;
        let bestSim = 0;
        // (Another company's reports never join a company's story.)
        const gReports = lang === 'zh' ? g.map(it => it.t).filter(reportOf) : [];
        // (A game never joins another game's story.)
        const gTeams = g.reduce((t, it) => withTeams(t, teamsOf(it.t, lang)), null);
        const dots = new Map();
        for (const [k, x] of gv) for (const d of daysBy.get(k) || []) dots.set(d, (dots.get(d) || 0) + x * d.v.get(k));
        for (const d of lastDays) {
          const { r, n, whose } = d;
          if (!dots.has(d) || r.last < gFirst - GAP || r.sp !== g.sp) continue;
          if (whose && gReports.length && gReports.every(t => otherReport(t, whose))) continue;
          if (gTeams && otherGame(gTeams, (d.teams ??= r.items.reduce((t, it) => withTeams(t, teamsOf(it.t, lang)), null)))) continue;
          const sim = dots.get(d) / (gn * n);
          if (sim > bestSim) (bestSim = sim), (best = r);
        }
        if (bestSim >= MERGE[lang]) rec = best;
      }
      if (!rec) rec = startOf(g);
      if (!rec) continue;
      const { owner: whose } = lang === 'zh' ? reportsOwner(rec.items.map(it => it.t)) : {};
      for (const it of g) {
        if (owner.has(it.u)) continue;
        if (whose && otherReport(it.t, whose)) continue;
        rec.items.push(keepOf(it));
        owner.set(it.u, rec);
      }
    }
    const freed = [];
    const sizeOf = r => {
      if (!r.items.length) return null;
      r.items.sort((a, b) => a.at - b.at);
      // One company's report is never another's story (Jay 11-10): a story
      // holding several companies' keeps its owner's, a day's reports one
      // each none (11-12: 日月光's held 中華電's and 台灣大's October). Let go,
      // they're grouped again, apart, at the next build.
      if (lang === 'zh') {
        const { owner: whose, mixed } = reportsOwner(r.items.map(it => it.t));
        if (mixed) {
          r.items = r.items.filter(it => !otherReport(it.t, whose));
          if (!enough(new Set(r.items.map(it => it.o)), region)) return (r.items = []), null;
        }
      }
      if (r.items.length > REC_ITEMS) r.items = [...r.items.slice(0, 10), ...r.items.slice(10 - REC_ITEMS)];
      // (What came in with this build's groups and drifted from the core, let go.)
      let vs = r.items.map(vecOf);
      const keep = keptOf(vs, lang, region, r.items.map(it => it.o));
      if (keep.some(k => !k)) {
        freed.push(...r.items.filter((_, i) => !keep[i]));
        r.items = r.items.filter((_, i) => keep[i]);
        vs = vs.filter((_, i) => keep[i]);
      }
      const c = sumOf(vs);
      return { r, vs, c, cn: norm(c), first: r.items[0]?.at || now, last: r.items.at(-1)?.at || now };
    };
    const sized = recsHere.map(sizeOf).filter(Boolean);
    // What was let go of today's starts a story of its own where enough
    // outlets carry it (11-12's 政院 answering 羅大佑 with 「皇后大道東」, out of
    // 蔣萬安's praise of him): else it would join its old story by the one
    // headline it shares at every build and be let go again.
    const today = new Set(mine.map(it => it.u));
    for (const it of freed) owner.delete(it.u);
    for (const g of twoDesks(freed.filter(it => today.has(it.u)))) {
      const rec = startOf(g);
      if (!rec) continue;
      for (const it of g) rec.items.push(keepOf(it)), owner.set(it.u, rec);
      const x = sizeOf(rec);
      if (x) sized.push(x);
    }
    const clipsOf = matchClips(vids.filter(v => OUTLETS[v.o]?.region === region), sized, vecOf, lang);
    // (The world's stories: Taiwan's outlets' on each, from Taiwan's front.)
    const twOn = region === 'intl' ? taiwanOn(out.tw, sized, vecOf, who) : new Map();
    for (const { r, vs, c, cn } of sized) {
      const s = storyOf(r.items.map((it, i) => ({ ...it, near: cosine(vs[i], norm(vs[i]), c, cn) })), region, now, { pages, same, vids: clipsOf.get(r) || [] });
      r.first = s.first;
      r.last = s.at;
      r.peak = Math.max(r.peak || 0, s.n);
      s.id = r.id;
      // Not News' (no topic), or light and carried by few: not shown.
      if (!s.topics.length || (s.light >= 0.5 && s.n < 4)) continue;
      if (twOn.has(r)) {
        s.tw = twPart(twOn.get(r));
        // (Taiwan's story says which world story it's on: 國際媒體怎麼報.)
        for (const t of twOn.get(r)) t.world = s.id;
      }
      (now - s.at <= NOW_MS ? out[region] : out.past[region]).push(s);
      if (s.topics.includes('sport') && now - s.at <= SPORT_MS) out.sport[region].push(s);
    }
    // (Each one-outlet sports report a story of its own, as the builder would make it.)
    for (const g of loose) {
      const s = storyOf(g.map(it => ({ ...it, near: 0 })), region, now, { pages, same });
      if (s.topics.includes('sport') && s.light < 0.5 && now - s.at <= SPORT_MS) out.sport[region].push(s);
    }
    out.sport[region] = sportDesk(out.sport[region], SPORT_TOP[region], { only: region === 'intl' });
    out[region] = frontOf(out[region], TOP[region]).map(({ score, light, ...s }) => s);
    // (單邊 weighed against the front's coverage, the past's by the same.)
    const one = oneSidedOf(out[region], region);
    oneSidedOf(out.past[region], region, one);
    // (The past lighter: each outlet's newest headline only.)
    out.past[region] = out.past[region]
      .sort((a, b) => b.imp - a.imp)
      .slice(0, PAST_TOP[region])
      .map(({ score, light, items: list, ...s }) => ({ ...s, items: list.filter((x, i) => list.findIndex(y => y[0] === x[0]) === i) }));
  }
  // (A story whose headlines were all let go is kept no more.)
  out.recs = out.recs.filter(r => r.items.length);
  return out;
}

// Orbit Sports' links to the news (news/sport.json, kit news-sport.mjs): the
// sports stories of the last three days, a one-outlet report too, newest
// first, `top` a region; each with its kind (storyKind, from its headline: 傷病, 禁賽, 換帥, 轉隊),
// and those of a sport Sports never shows (the NFL, hockey, colleges) left
// out. A story is News' own (News opens it from a link), lighter: no clips'
// pictures past its first, no score.
// The world's (`only`): those plainly of a sport Sports shows (NBA, MLB,
// football, F1) and nothing else: high-school football, golf and the NFL
// from Yahoo Sports and SI had filled its 260 with nine hours, every NBA
// game's page left to Taiwan's outlets (Jay 11-14).
export const SPORT_TOP = { tw: 260, intl: 420 };
const SHOWN = ['basketball', 'baseball', 'soccer', 'racing'];
export function sportDesk(stories, top, { only = false } = {}) {
  const seen = new Set();
  return stories
    .filter(s => !seen.has(s.id) && seen.add(s.id))
    .map(s => ({ s, text: sportText(s) }))
    .filter(({ text }) => {
      const sp = sportsIn(text);
      if (only) return SHOWN.some(k => sp.has(k));
      return !(sp.has('other') && sp.size === 1);
    })
    .sort((a, b) => b.s.at - a.s.at)
    .slice(0, top)
    .map(({ s: { score, light, alts, ...s }, text }) => ({ ...s, clips: (s.clips || []).slice(0, 2), k: storyKind(s) }));
}

// 單邊 (Jay 11-14: "most news there is just less notable news"; "if just
// one of the other side report it it's not in 單邊?"): no more a story the
// other side carries none of (one outlet put it back, and only small ones
// were left: 11-14's 19 all past the front's 100th), but an important one
// it all but leaves out. A story of a topic sides take, 2 hours old or more,
// carried by ONE_MIN outlets or more, ONE_HEAVY or more of them on one end
// and on the other at most ONE_FEW (a token one or two; one in 8 of a big
// story's), the heavy end ahead ONE_SKEW times or more past how far it is
// ahead on the day's whole front (the world's left outlets wrote 1.5 times
// the right's: a story 3 to 2 is not one-sided), and as important as the
// front's middle story or more. 11-14's front: 19 became 7, the Gaza
// hospital strike (偏左 20 · 偏右 2), Trump on toppling Cuba's government
// (偏右 8 · 偏左 2), 沈伯洋's and 蔣萬安's pay given away (偏綠 5 · 偏藍 0).
// (By outlets, not readers: no published figures place each outlet's reach.)
export const ONE_AGE = 2 * HOUR;
export const ONE_MIN = 8;
export const ONE_HEAVY = 4;
export const ONE_FEW = 2;
export const ONE_SKEW = 4;
const ENDS_OF = { tw: ['g', 'b'], intl: ['l', 'r'] };
const oneSidedKind = kinds => kinds.some(t => t.spectrum !== false);
// The end that left it out ('' none), `base` how far the left end is ahead
// on the day's whole front (its outlets' count over the right's).
// (`skew` 0: the story alone, before the day's front is known.)
export function blindOf(sides, region, base = 1, skew = ONE_SKEW) {
  const [left, right] = ENDS_OF[region];
  const n = Object.values(sides).reduce((a, b) => a + b, 0);
  if (n < ONE_MIN) return '';
  for (const [heavy, light, ahead] of [[left, right, base], [right, left, 1 / base]]) {
    const H = sides[heavy] || 0;
    const L = sides[light] || 0;
    if (H >= ONE_HEAVY && L <= Math.max(ONE_FEW, Math.floor(H / 8)) && (H + 0.5) / (L + 0.5) / ahead >= skew) return light;
  }
  return '';
}
// The region's stories' `blind` weighed against the day's front: each end's
// share of its outlets, the importance of its middle story (`was`: the
// front's, for the past). → { base, mid }.
export function oneSidedOf(stories, region, was = null) {
  const [left, right] = ENDS_OF[region];
  let a = 0;
  let b = 0;
  for (const s of stories) (a += s.sides?.[left] || 0), (b += s.sides?.[right] || 0);
  const imps = stories.map(s => s.imp).sort((x, y) => x - y);
  const base = was?.base ?? (a && b ? a / b : 1);
  const mid = was?.mid ?? (imps.length ? imps[Math.floor((imps.length - 1) / 2)] : 0);
  for (const s of stories) if (s.blind) s.blind = s.imp >= mid ? blindOf(s.sides, region, base) : '';
  return { base, mid };
}

// The front: the TOP stories by score, then each topic's best past them
// to TOPIC_MIN (its first topic's), so a quiet day's 科學 or 運動 isn't cut
// for the 150th politics story (Jay 11-10: tabs nearly empty).
export const TOPIC_MIN = 12;
// (運動 more: a day's games and moves are many, and the general outlets'
// reports of them are News' too, Jay 11-14: "regular outlet like taiwan
// ones … could also bring goods"; the tab had 13 of the 85 sports stories
// two outlets or more carried. A story is 運動's when sport is any of its
// topics: a national team's game abroad is 國際 first.)
export const TOPIC_MIN_OF = { sport: 40 };
const frontTopic = s => (s.topics.includes('sport') ? 'sport' : s.topics[0]);
export function frontOf(stories, top) {
  const ranked = [...stories].sort((a, b) => b.score - a.score);
  const front = ranked.slice(0, top);
  const have = new Map();
  for (const s of front) have.set(frontTopic(s), (have.get(frontTopic(s)) || 0) + 1);
  for (const s of ranked.slice(top)) {
    const k = frontTopic(s);
    const n = have.get(k) || 0;
    if (n >= (TOPIC_MIN_OF[k] ?? TOPIC_MIN)) continue;
    have.set(k, n + 1);
    front.push(s);
  }
  return front;
}

// Taiwan's stories about the world, each joined to the world story its
// headlines are nearest, put in the English words world headlines use
// (news-words.js), weighed as the world's: near enough (TW_NEAR), a name
// and two more words shared (or a name and one, nearer), within a day of it. → Map(world rec → [Taiwan's stories]).
export const TW_NEAR = 0.4;
const NAME_KEYS = new Set(Object.values(NAMES).flatMap(v => piecesOf(v, 'en')));
function taiwanOn(twStories, sized, vecOf, who = {}) {
  const index = new Map();
  for (const z of sized) for (const k of z.c.keys()) (index.get(k) || index.set(k, []).get(k)).push(z);
  const out = new Map();
  const sport = new Map();
  const isSport = z => (sport.has(z) ? sport.get(z) : sport.set(z, topicsOf(z.r.items.map(it => it.t), 'en').includes('sport')).get(z));
  for (const s of twStories) {
    const v = new Map();
    for (const it of s.items) {
      const en = enOf(it[1]);
      if (en) for (const [k, w] of vecOf({ t: en })) add(v, k, w);
    }
    // (A sports story: the AI's English title and its players' and teams'
    // names, a name each, the way the world's headlines put them.)
    const sw = s.topics.includes('sport') && who[s.id];
    const names = new Set(sw ? [...(sw.p || []), ...(sw.t || [])].flatMap(n => piecesOf(n, 'en')) : []);
    if (sw?.en) for (const [k, w] of vecOf({ t: `${sw.en} ${[...(sw.p || []), ...(sw.t || [])].join(' ')}` })) add(v, k, w);
    if (v.size < 2) continue;
    const vn = norm(v);
    const shared = new Map();
    for (const k of v.keys()) for (const z of index.get(k) || []) (shared.get(z) || shared.set(z, []).get(z)).push(k);
    let best = null;
    let bestSim = 0;
    for (const [z, keys] of shared) {
      // (A name shared, a place, a person, a body abroad, and a word more.)
      if (keys.length < 2 || !keys.some(k => NAME_KEYS.has(k) || names.has(k)) || s.at < z.first - GAP || s.first > z.last + GAP) continue;
      // (A game joins a game: Taiwan's U23 team facing South Korea isn't Korea's news.)
      if (sw && !isSport(z)) continue;
      const sim = cosine(v, vn, z.c, z.cn);
      if (sim > bestSim && (keys.length >= 3 || sim >= TW_NEAR + 0.15)) (bestSim = sim), (best = z);
    }
    if (best && bestSim >= TW_NEAR) (out.get(best.r) || out.set(best.r, []).get(best.r)).push(s);
  }
  return out;
}
// What a world story shows of Taiwan's: how many outlets, each side's count,
// their headlines (three an outlet, newest first).
function twPart(stories) {
  const seen = new Set();
  const per = new Map();
  const items = [];
  for (const it of stories.flatMap(s => s.items).sort((a, b) => b[3] - a[3])) {
    if (seen.has(it[2]) || (per.get(it[0]) || 0) >= 3) continue;
    seen.add(it[2]);
    per.set(it[0], (per.get(it[0]) || 0) + 1);
    items.push(it.slice(0, 4));
  }
  const sides = { g: 0, c: 0, b: 0 };
  for (const o of per.keys()) {
    const side = sideOf(o, 'tw');
    if (side) sides[side]++;
  }
  return { n: per.size, sides, items };
}

// One region's stories from these headlines alone (no stories kept).
export const storiesOf = (items, region, now, opts) => deskOf(items, [], now, opts)[region];

// ---- The build -----------------------------------------------------------------

// One feed read: its items, or `same` when its ETag says nothing changed.
async function readFeed(url, kind, tag, { fetchImpl = fetch } = {}) {
  const headers = { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' };
  if (tag) headers['If-None-Match'] = tag;
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(12_000) });
  if (res.status === 304) return { same: true };
  if (!res.ok) throw new Error(`${res.status}`);
  return { items: parseFeed(await res.text(), kind), etag: res.headers.get('ETag') || '' };
}

export async function runNews({ store, now = Date.now(), fetchImpl = fetch, feeds = FEEDS, channels = CHANNELS, channelEvery = CHANNEL_EVERY } = {}) {
  const kept = (await store.json(NEWS_STATE).catch(() => null)) || { items: [], etag: {} };
  const byUrl = new Map(kept.items.filter(it => now - it.at <= KEEP_MS && OUTLETS[it.o]).map(it => [it.u, it]));
  // (A feed not due this build keeps its ETag.)
  const urls = new Set(Object.values(feeds).flatMap(list => list.map(f => f[0])));
  const etag = Object.fromEntries(Object.entries(kept.etag || {}).filter(([u]) => urls.has(u)));
  const failed = [];
  let fresh = 0;
  // The channels' clips kept 48 hours (each channel's newest 120).
  const vids = new Map((kept.vids || []).filter(v => now - v.at <= KEEP_MS && OUTLETS[v.o]).map(v => [v.y, v]));
  const chans = Object.fromEntries(Object.entries(channels).map(([o, id]) => [o, [[ytFeed(id), 'yt', channelEvery[OUTLETS[o]?.region] || 3]]]));
  const readChannel = async ([o, url]) => {
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/atom+xml, application/xml;q=0.9' }, signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`${res.status}`);
      for (const v of parseChannel(await res.text())) if (!vids.has(v.y) && now - v.at <= KEEP_MS) vids.set(v.y, { o, ...v, at: Math.min(v.at, now) });
    } catch (e) {
      failed.push(`${o} clips: ${String(e?.message || e).slice(0, 40)}`);
    }
  };
  const chansDue = feedsDue(chans, now);
  const feedsNow = feedsDue(feeds, now);
  await Promise.all([
    ...chansDue.map(readChannel),
    ...feedsNow.map(async ([o, url, kind]) => {
      try {
        const r = await readFeed(url, kind, kept.etag?.[url], { fetchImpl });
        if (r.same) return void (etag[url] = kept.etag[url]);
        if (r.etag) etag[url] = r.etag;
        const lang = OUTLETS[o].region === 'tw' ? 'zh' : 'en';
        for (const it of r.items) {
          const u = cleanUrl(it.u);
          if (!newsUrl(u) || byUrl.has(u)) continue;
          // (A time ahead of now is a feed's wrong zone: taken as now.)
          const at = Math.min(it.at ?? now, now);
          if (now - at > KEEP_MS) continue;
          byUrl.set(u, { o, t: it.t, u, d: cut(unboiled(it.d), SUM_MAX[lang] * 2), at, img: it.img, ...(isVideo(u) ? { v: 1 } : {}) });
          fresh++;
        }
      } catch (e) {
        failed.push(`${o}: ${String(e?.message || e).slice(0, 40)}`);
      }
    })
  ]);
  const clips = [];
  const perOutlet = new Map();
  for (const v of [...vids.values()].sort((a, b) => b.at - a.at)) {
    const n = (perOutlet.get(v.o) || 0) + 1;
    perOutlet.set(v.o, n);
    if (n <= 120) clips.push(v);
  }
  // (One outlet's same headline in two of its feeds: once.)
  const seen = new Set();
  const items = [...byUrl.values()].filter(it => {
    const k = `${it.o}|${cleanTitle(it.t)}`;
    return !seen.has(k) && seen.add(k);
  });
  // The pages read before (still kept), then a few more for the top stories.
  const recs = kept.recs || [];
  const pages = {};
  for (const it of [...items, ...recs.flatMap(r => r.items)]) if (kept.pages?.[it.u]) pages[it.u] = kept.pages[it.u];
  // (And the clips GitHub found in the pages that refuse us.)
  withClips(pages, await store.json(NEWS_CLIPS).catch(() => null));
  // (Which pages: the last build's top stories (its index), so the desk is
  // laid once a build; twice passed the Runner's 30 s of CPU, 11-12.)
  const last = await store.json(NEWS_PATH).catch(() => null);
  const want = pagesToRead({ tw: last?.tw || [], intl: last?.intl || [] }, pages);
  const whyNot = {};
  const read = await Promise.all(want.map(u => readPage(u, { fetchImpl, why: w => (whyNot[u] = w) })));
  // (Each clip a page names asked once whether it's a Short: those are left
  // out. The answers kept 4 days: { id: when asked, less than 0 a Short }.)
  const shorts = Object.fromEntries(Object.entries(kept.shorts || {}).filter(([, at]) => now - Math.abs(at) <= 2 * KEEP_MS));
  const ask = [...new Set(read.flatMap(p => p?.y || []))].filter(id => !(id in shorts));
  const isShort = await Promise.all(ask.map(id => shortOf(id, { fetchImpl })));
  ask.forEach((id, i) => (shorts[id] = isShort[i] ? -now : now));
  const unread = {};
  want.forEach((u, i) => {
    const p = read[i];
    const o = byUrl.get(u)?.o || new URL(u).hostname;
    if (!p) (unread[o] ||= []).push(whyNot[u] || '?');
    pages[u] = p ? { ...p, y: p.y.filter(id => !(shorts[id] < 0)) } : { i: '', y: [] };
  });
  // (The AI's reading of Taiwan's sports stories, English title and names, so
  // 柯瑞's injury finds the world's story on Curry: Jay 11-13 "why is this
  // Taiwan outlet only".)
  const who = (await store.json(SPORT_WHO).catch(() => null))?.who || {};
  const out = deskOf(items, recs, now, { pages, vids: clips, who });
  const keep = new Set([...items, ...out.recs.flatMap(r => r.items)].map(it => it.u));
  for (const u of Object.keys(pages)) if (!keep.has(u)) delete pages[u];
  await store.put(NEWS_STATE, { items, etag, pages, recs: out.recs, vids: clips, shorts });
  // (Never an empty page over a good one: a build that read nothing keeps the last.)
  if (out.tw.length || out.intl.length) {
    await store.put(NEWS_PATH, { built: now, tw: out.tw, intl: out.intl });
    await store.put(NEWS_PAST, { built: now, ...out.past });
  }
  // Orbit Sports' links: the sports stories, each with the family's AI's
  // reading of its names and its title in the other language (builders/ai.js
  // sportWho → news/sport-who.json), where it has made one yet.
  if (out.sport.tw.length || out.sport.intl.length) {
    const withWho = list => list.map(s => (who[s.id] ? { ...s, who: { p: who[s.id].p || [], t: who[s.id].t || [], ...(Array.isArray(who[s.id].a) ? { a: who[s.id].a } : {}) }, ...(who[s.id].zh ? { zh: who[s.id].zh } : {}), ...(who[s.id].en ? { en: who[s.id].en } : {}) } : s));
    await store.put(SPORT_PATH, { v: SPORT_VERSION, built: now, tw: withWho(out.sport.tw), intl: withWho(out.sport.intl) });
  }
  // (A few feeds missing is a normal build. Only half or more of the stories' feeds asked
  // failing is the build's failure, what the beat and the panel's 外部來源 call broken.)
  // (Channels' clips apart: YouTube's feeds can all 404 for a day (11-11, every channel from
  // everywhere) while the stories build fine; the clips kept 48 hours carry them.)
  const storyFails = failed.filter(f => !/ clips: /.test(f)).length;
  const missed = failed.length && storyFails * 2 < feedsNow.length ? failed.slice(0, 12) : null;
  return { items: items.length, fresh, clips: clips.length, pages: want.length, ...(Object.keys(unread).length ? { unread } : {}), ...(ask.length ? { asked: ask.length, shorts: isShort.filter(Boolean).length } : {}), kept: out.recs.length, tw: out.tw.length, intl: out.intl.length, sport: out.sport.tw.length + out.sport.intl.length, past: out.past.tw.length + out.past.intl.length, ...(missed ? { missed } : { failed }) };
}

// Outlets whose article pages carry the story's own clip, most often first
// (11-12, 25 of each's pages: 公視 and 華視 half of them, 中天, 東森, 中央社,
// 聯合 one in six or eight, TVBS, 三立, ETtoday, 中時 fewer; 自由's pages
// refuse some readers: last). 民視 is read by its channel, no page.
// (11-13, Jay "it doesn't get all videos": 年代's pages each carry its own
// clip, 壹蘋's half, 台視's and 原民台's some.)
export const CLIPS_AT = ['pts', 'era', 'cts', 'nextapple', 'ctinews', 'ebc', 'ttv', 'cna', 'udn', 'tvbs', 'setn', 'ettoday', 'chinatimes', 'upmedia', 'mirror', 'titv', 'ltn'];
// Those whose pages answer Cloudflare (the rest refuse it, 11-12: TVBS,
// 聯合, 中央社, 三立, 自由…): read here too. Every one of CLIPS_AT is read on
// GitHub (clipsToRead, tools/news-clips.mjs), its finds in NEWS_CLIPS.
export const CLIPS_HERE = ['pts', 'ctinews', 'ebc'];
// Pages a build reads for clips (on top of PAGE_READS for pictures): a top
// story with fewer than 2 that play here, two of its outlets' pages at most.
export const CLIP_READS = 6;
// The pages a build reads, top stories first (two of Taiwan's to one
// abroad): PAGE_READS for the lead's (else any) where a story has no
// picture, CLIP_READS for its clip outlets' that have no clip in it yet.
export function pagesToRead(out, pages, most = PAGE_READS, clipMost = CLIP_READS) {
  const order = [];
  for (let i = 0; i < 40; i++) order.push(out.tw[2 * i], out.tw[2 * i + 1], out.intl[i]);
  const pics = [];
  const clips = [];
  const taken = u => pages[u] || pics.includes(u) || clips.includes(u);
  for (const s of order.filter(Boolean)) {
    if (pics.length >= most && clips.length >= clipMost) break;
    // (Those read through a search's feed or a channel: no page of theirs to read.)
    const fresh = s.items.filter(([o, , u]) => !taken(u) && !FAR.has(o));
    // (Every clip outlet's page, however many clips a story has: 公視's own
    // was missed beside three others', Jay 11-13 "it doesn't get all videos".)
    if (clips.length < clipMost) {
      const has = new Set((s.clips || []).map(c => c[0]));
      const by = new Set();
      const picks = fresh
        .filter(([o]) => CLIPS_HERE.includes(o) && !has.has(o))
        .sort((a, b) => CLIPS_HERE.indexOf(a[0]) - CLIPS_HERE.indexOf(b[0]))
        .filter(([o]) => !by.has(o) && by.add(o))
        .slice(0, Math.min(2, clipMost - clips.length));
      clips.push(...picks.map(x => x[2]));
    }
    if (!s.img && pics.length < most) {
      const pic = fresh.find(([, , u]) => u === s.items[0]?.[2] && !clips.includes(u)) || fresh.find(([, , u]) => !clips.includes(u));
      if (pic) pics.push(pic[2]);
    }
  }
  return [...clips, ...pics];
}
// ---- Clips read on GitHub ----------------------------------------------------
//
// Most of Taiwan's outlets refuse Cloudflare's reads of their articles, so
// GitHub Actions reads them (tools/news-clips.mjs, news-clips.yml, started
// by newsClips when its last finds are 15 minutes old) and writes
// NEWS_CLIPS: { at, pages: { url: { y, v?, i?, at, f? } }, shorts: { id: ±when } }
// (pageOf's clips, Shorts left out). A build takes each page's clips where
// it read none of its own.
export const NEWS_CLIPS = 'news/clips.json';
// The pages a GitHub run reads: every clip outlet's report on Taiwan's
// stories (those with fewer than 2 clips first), top stories first, not read before
// (華視's refuses a reader asking fast: asked again later);
// `most` a run, `each` an outlet (a site that's asked too fast refuses: 華視).
const CLIPS_TOP = 60;
export function clipsToRead(index, done = {}, { most = 120, each = 14 } = {}) {
  const want = [];
  const per = new Map();
  // (The top stories' first, those with fewer than 2 clips ahead, then
  // every other's clip outlets without one yet: Jay 11-13, 公視's clip
  // missed beside three others'.)
  const few = s => (s.clips || []).filter(c => c[1]).length < 2;
  const tw = index?.tw || [];
  const top = tw.slice(0, CLIPS_TOP), rest = tw.slice(CLIPS_TOP);
  for (const s of [...top.filter(few), ...top.filter(s => !few(s)), ...rest.filter(few), ...rest.filter(s => !few(s))]) {
    const has = new Set((s.clips || []).filter(c => c[1]).map(c => c[0]));
    // (A page that wouldn't answer, `f` times, is asked again in a later run, 3 times at most.)
    const its = (s.items || []).filter(([o, , u]) => CLIPS_AT.includes(o) && !has.has(o) && !(done[u] && !(done[u].f < 3)) && !want.includes(u)).sort((a, b) => CLIPS_AT.indexOf(a[0]) - CLIPS_AT.indexOf(b[0]));
    for (const [o, , u] of its) {
      if ((per.get(o) || 0) >= each) continue;
      per.set(o, (per.get(o) || 0) + 1);
      want.push(u);
      if (want.length >= most) return want;
    }
  }
  return want;
}
// A GitHub run's pages into the build's: each page's clips where the build
// has none of its own (its picture the build's where it has one). Those
// without a clip too: an outlet's pages read elsewhere tell its box from a
// story's own clip (sameOf). One that wouldn't answer (`f`) stays out.
export function withClips(pages, found) {
  for (const [u, p] of Object.entries(found?.pages || {})) {
    const mine = pages[u];
    if (!p || p.f || (mine && (mine.y?.length || mine.v?.length))) continue;
    pages[u] = { i: mine?.i || (/^https:\/\//.test(p.i || '') ? p.i : ''), y: (p.y || []).filter(id => /^[\w-]{11}$/.test(id)), ...(p.v?.length ? { v: p.v } : {}) };
  }
  return pages;
}
// Starts news-clips.yml when its last finds are 15 minutes old and none
// was started in the last 15 (GitHub's own timer runs late or not at all).
export const NEWS_CLIPS_RUN = 'private/news/clips-run.json';
export async function newsClips({ store, env, now = Date.now(), fetchImpl = fetch }) {
  if (!env?.GH_ACTIONS_TOKEN) return { off: 'no token' };
  const found = await store.json(NEWS_CLIPS).catch(() => null);
  const ran = await store.json(NEWS_CLIPS_RUN).catch(() => null);
  const age = now - (found?.at || 0);
  if (age < 15 * 60_000 || now - (ran?.at || 0) < 15 * 60_000) return { found: Object.keys(found?.pages || {}).length, age: Math.round(age / 60_000) };
  const go = await fetchImpl('https://api.github.com/repos/JayPengX/Orbit-Core/actions/workflows/news-clips.yml/dispatches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GH_ACTIONS_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'orbit-news', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!go.ok) return { failed: `start: HTTP ${go.status}` };
  await store.put(NEWS_CLIPS_RUN, { at: now });
  return { started: true };
}

// One page read for its picture and clip; null when it can't be.
// (Why not, by the outlet, in the build's report: `why`.)
export async function readPage(url, { fetchImpl = fetch, why = () => {} } = {}) {
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(10_000) });
    if (!res?.ok) return void why(String(res?.status || 'no answer'));
    return pageOf(await res.text());
  } catch (e) {
    why(String(e?.name === 'TimeoutError' ? 'timeout' : e?.message || e).slice(0, 30));
    return null;
  }
}

// Whether a YouTube clip is a Short (tall: it won't play well here, Jay
// 11-10): YouTube answers its /shorts/ address for a Short and sends any
// other clip on to /watch. Unsure (no answer, a relay that followed the
// redirect and lost where it went): not a Short.
export async function shortOf(id, { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6_000) });
    return res.status === 200 && !res.redirected && /\/shorts\//.test(res.url || '');
  } catch {
    return false;
  }
}

// ---- News's site ------------------------------------------------------------
//
// News has no Cloudflare token of its own: this repo's news-site.yml publishes
// it. GitHub's own timer runs hours late here, or not at all (11-10: none in
// two hours), so each news build looks at News's main and, once a commit,
// starts that workflow (`auto`: it publishes only what isn't live yet).
export const NEWS_SITE = 'private/news/site.json';
export async function newsSite({ store, env, now = Date.now(), fetchImpl = fetch }) {
  if (!env?.GH_ACTIONS_TOKEN) return { off: 'no token' };
  const gh = (path, { headers, ...init } = {}) =>
    fetchImpl(`https://api.github.com/repos/JayPengX/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.GH_ACTIONS_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'orbit-news', ...headers },
      signal: AbortSignal.timeout(10_000)
    });
  const res = await gh('Orbit-News/commits/main', { headers: { Accept: 'application/vnd.github.sha' } });
  if (!res.ok) return { failed: `HTTP ${res.status}` };
  const sha = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) return { failed: 'no commit' };
  if ((await store.json(NEWS_SITE).catch(() => null))?.sha === sha) return { sha: sha.slice(0, 7) };
  const go = await gh('Orbit-Core/actions/workflows/news-site.yml/dispatches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { auto: 'true' } })
  });
  if (!go.ok) return { failed: `start: HTTP ${go.status}` };
  await store.put(NEWS_SITE, { sha, at: now });
  return { sha: sha.slice(0, 7), started: true };
}
