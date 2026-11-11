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
//      and the clip it published on YouTube (its VideoObject's embedUrl or
//      the article's YouTube embed), played in the app by YouTube's player.
//
// → news/index.json: { built, tw: [story], intl: [story] } (heard of in
//   the last 3 days); news/past.json the same for older ones, by
//   importance, each outlet's newest headline only. A story:
//   { id, title, sum, img, alts: [[picture, outlet]] (others, should img
//     not load), at, first, n (outlets), m (headlines), days:
//     [['MM-DD', headlines]], sides: { g, c, b } (or l, c, r), blind: 'g' |
//     'b' | 'l' | 'r' | '' (the side that carries none of a story the other
//     side carries widely; only a topic sides take: TOPICS' spectrum),
//     parties: ['g','b','w'], topics: ['pol'…], imp,
//     clips: [[outlet, youtubeId, url, title, picture]] (a YouTube clip, or
//     an outlet's own video page when the id is ''),
//     items: [[outlet, title, url, at, video?]] }  (each outlet's newest first).
// State (private/news/items.json.gz): the 48 hours' headlines, feeds' ETags,
// pages read, and the stories kept (recs).
// Read by Orbit News through /data/ (data.js; index.json: 2 minutes at the edge).

import { OUTLETS, TOPICS, SECOND, sideOf, partiesIn, topicsOf } from '../kit/news-outlets.mjs';
import { enOf, NAMES } from './news-words.js';

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
// A story is kept by how wide it went: carried by 6 outlets or more, 30
// days after its last headline; by 4, 14 days; else 3. It takes new
// headlines for 21 days from its first (then a new one starts), and keeps
// 80 (its first 10 and its newest).
const keepFor = n => (n >= 6 ? 30 : n >= 4 ? 14 : 3) * 24 * HOUR;
const OPEN_MS = 21 * 24 * HOUR;
const REC_ITEMS = 80;
// Pages read a build (each once; the Runner relays past its own 40 calls).
export const PAGE_READS = 12;

// Each outlet's feeds: [url, kind, every] ('rss' RSS, RDF or Atom; 'map' a
// news sitemap; read every build, or every 2nd or 3rd: an outlet added on
// 11-10 and the sections beside an outlet's main feed, so a build's calls
// stay near 90 (each past the Runner's 40 a relay's own request).
const S2 = 2;
const S3 = 3;
// (Taiwan's channels post more, so are read more often.)
const CHANNEL_EVERY = { tw: 2, intl: 4 };
const sec = (list, url, every = S3) => list.map(x => [url(x), 'rss', every]);
// Bing News' feed of one site, newest first (Google News' answers Cloudflare
// 503): its 12 latest, each with the outlet's own link and summary.
export const bing = site => `https://www.bing.com/news/search?q=site%3a${site}&format=rss&qft=sortbydate%3d%221%22&mkt=en-US&setlang=en-US&cc=US`;
export const FEEDS = {
  ltn: [...['all', 'politics', 'society', 'life', 'world', 'local'].map(c => [`https://news.ltn.com.tw/rss/${c}.xml`, 'rss']), ...sec(['business', 'sports'], c => `https://news.ltn.com.tw/rss/${c}.xml`)],
  setn: [['https://www.setn.com/sitemapGoogleNews.xml', 'map']],
  // (Its site answers only Taiwan, Google News' feed of it refuses Cloudflare:
  // its YouTube channel's reports, each headline the clip's.)
  ftv: [['https://www.youtube.com/feeds/videos.xml?channel_id=UC2VmWn8dAqkzlQqvy02E1PA', 'yt', S2]],
  newtalk: [['https://newtalk.tw/rss/all', 'rss']],
  peoples: [['https://www.peoplenews.tw/feed/', 'rss']],
  cna: [
    ...['politics', 'mainland', 'intworld', 'social', 'finance'].map(s => [`https://feeds.feedburner.com/rsscna/${s}`, 'rss']),
    ...sec(['technology', 'lifehealth', 'culture', 'sport', 'local'], s => `https://feeds.feedburner.com/rsscna/${s}`)
  ],
  pts: [['https://news.pts.org.tw/xml/newsfeed.xml', 'rss']],
  ettoday: [['https://feeds.feedburner.com/ettoday/realtime', 'rss']],
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
    ...sec(['technology', 'science_and_environment', 'health', 'business'], s => `https://feeds.bbci.co.uk/news/${s}/rss.xml`)
  ],
  wsj: [['https://feeds.a.dj.com/rss/RSSWorldNews.xml', 'rss']],
  ft: [['https://www.ft.com/world?format=rss', 'rss']],
  hill: [['https://thehill.com/policy/international/feed/', 'rss']],
  csm: [['https://rss.csmonitor.com/feeds/world', 'rss']],
  guardian: [['https://www.theguardian.com/world/rss', 'rss'], ...sec(['technology', 'science'], s => `https://www.theguardian.com/${s}/rss`)],
  nyt: [['https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'rss'], ...sec(['US', 'Business', 'Technology', 'Science', 'Health'], s => `https://rss.nytimes.com/services/xml/rss/nyt/${s}.xml`)],
  wapo: [['https://feeds.washingtonpost.com/rss/world', 'rss'], ...sec(['politics', 'business/technology'], s => `https://feeds.washingtonpost.com/rss/${s}`)],
  aljazeera: [['https://www.aljazeera.com/xml/rss/all.xml', 'rss']],
  economist: [['https://www.economist.com/asia/rss.xml', 'rss', S2], ['https://www.economist.com/china/rss.xml', 'rss', S2]],
  politico: [['https://rss.politico.com/politics-news.xml', 'rss']],
  time: [['https://time.com/feed/', 'rss']],
  nbc: [['https://feeds.nbcnews.com/nbcnews/public/world', 'rss'], ...sec(['politics'], s => `https://feeds.nbcnews.com/nbcnews/public/${s}`)],
  cbs: [['https://www.cbsnews.com/latest/rss/world', 'rss'], ...sec(['us', 'technology', 'health'], s => `https://www.cbsnews.com/latest/rss/${s}`)],
  abc: [['https://abcnews.go.com/abcnews/internationalheadlines', 'rss'], ...sec(['usheadlines', 'politicsheadlines', 'technologyheadlines'], s => `https://abcnews.go.com/abcnews/${s}`)],
  fox: [['https://moxie.foxnews.com/google-publisher/world.xml', 'rss'], ...sec(['us', 'politics', 'tech', 'health'], s => `https://moxie.foxnews.com/google-publisher/${s}.xml`)],
  nypost: [['https://nypost.com/world-news/feed/', 'rss']],
  wexam: [['https://www.washingtonexaminer.com/feed/', 'rss']],
  breitbart: [['https://feeds.feedburner.com/breitbart', 'rss']],
  dailycaller: [['https://dailycaller.com/feed/', 'rss']],
  natreview: [['https://www.nationalreview.com/feed/', 'rss']],
  dailymail: [['https://www.dailymail.co.uk/news/worldnews/index.rss', 'rss']],
  latimes: [['https://www.latimes.com/world-nation/rss2.0.xml', 'rss', S2]],
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
  washtimes: [['https://www.washingtontimes.com/rss/headlines/news/', 'rss', S3]]
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
    for (const [url, kind, every = 1] of list) if (every === 1 || (slot + i++) % every === 0) out.push([o, url, kind]);
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
    ['promo', /\b(?:best .{0,30} to buy|gift guide|coupon|promo code|sponsored|partner content|recipe)\b/i]
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
// A page's own picture (og:image) and the YouTube clips it says are its own:
// a VideoObject's embedUrl, or a YouTube player in the article. { i, y }.
export function pageOf(html) {
  const s = String(html || '').slice(0, 600_000).replace(/\\\//g, '/');
  const i = metaOf(s, 'og:image') || metaOf(s, 'twitter:image');
  const y = [];
  for (const m of s.matchAll(/embedUrl["']?\s*(?::|content=)\s*["']https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/g)) y.push(m[1]);
  for (const m of s.matchAll(/<iframe\b[^>]*\bsrc=["'](?:https?:)?\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/g)) y.push(m[1]);
  return { i: /^https:\/\//.test(i) ? i : '', y: [...new Set(y)].slice(0, 2) };
}
// What one outlet puts on every page is its own, not a story's: a clip on
// two of its pages or more (its live channel, a box beside each article), a
// picture on two of its pages (its logo) or on three of its feed's items (a
// stand-in). `ok(outlet, clip or picture)`; a clip counts only once two of
// the outlet's pages were read, so a box beside them all can show.
export function sameOf(pages, items) {
  const n = new Map();
  const read = new Map();
  const count = k => n.set(k, (n.get(k) || 0) + 1);
  for (const it of items) {
    if (it.img) count(`f ${it.o} ${it.img}`);
    const p = pages[it.u];
    if (!p) continue;
    read.set(it.o, (read.get(it.o) || 0) + 1);
    if (p.i) count(`p ${it.o} ${p.i}`);
    for (const id of p.y || []) count(`y ${it.o} ${id}`);
  }
  return {
    clip: (o, id) => (read.get(o) || 0) >= 2 && (n.get(`y ${o} ${id}`) || 0) < 2,
    feedPic: (o, u) => (n.get(`f ${o} ${u}`) || 0) < 3,
    pagePic: (o, u) => (n.get(`p ${o} ${u}`) || 0) < 2
  };
}
// (Pictures a story carries past its own: other outlets', should its own not load.)
export const ALTS = 3;
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
const stem = w => w.slice(0, 6);
// A headline's pieces: Chinese in two-character pieces, other words whole
// (English stemmed lightly, short words and numbers of one digit left out).
// The words of a company's monthly report (營收, 年增, 創新高…): every
// company's, so they'd make one story of a day's reports (Jay 11-10: 台積電's
// sheet held 豆府's, 大東電's, 全家's).
const ZH_STOP = new Set('營收 月營 收月 收年 收創 月增 年增 增率 月減 年減 創新 新高 同期 期新 累計 億元 單月 歷史 史新 合併 併營 前十 財報 獲利 毛利 每股'.split(' '));
export function piecesOf(title, lang) {
  const s = cleanTitle(title).normalize('NFKC').toLowerCase();
  const out = [];
  if (lang === 'zh') {
    for (const run of s.match(/[㐀-鿿]+/g) || []) {
      if (run.length === 1) out.push(run);
      for (let i = 0; i + 1 < run.length; i++) if (!ZH_STOP.has(run.slice(i, i + 2))) out.push(run.slice(i, i + 2));
    }
    for (const w of s.match(/[a-z][a-z0-9.+-]*[a-z0-9]|\d{2,}/g) || []) out.push(w);
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
const GAP = 24 * HOUR;

const add = (v, k, x) => v.set(k, (v.get(k) || 0) + x);

// A headline's weighed pieces, each by how rare it is among these items':
// weigh(items, lang) → it => Map(piece → weight).
export function weigh(items, lang) {
  const docOf = it => ({ p: piecesOf(it.t, lang), s: lang === 'en' && it.d ? piecesOf(it.d, lang) : [] });
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
    return v;
  };
}

// items: [{ o, t, u, d, at, img }] of one region → stories (unranked).
export function groupStories(items, lang, { join = JOIN[lang], merge = MERGE[lang] } = {}) {
  const vecOf = weigh(items, lang);
  const docs = items.map(it => ({ it, v: vecOf(it) })).filter(d => d.v.size);
  for (const d of docs) d.n = norm(d.v);
  docs.sort((a, b) => (a.it.at || 0) - (b.it.at || 0));
  let groups = [];
  const index = new Map(); // piece → groups holding it
  const note = (k, g) => (index.get(k) || index.set(k, []).get(k)).push(g);
  for (const d of docs) {
    if (!d.v.size) continue;
    const seen = new Set();
    let best = null;
    let bestSim = 0;
    for (const p of d.v.keys()) {
      for (const g of index.get(p) || []) {
        if (seen.has(g)) continue;
        seen.add(g);
        if ((d.it.at || 0) - g.last > GAP) continue;
        const sim = cosine(d.v, d.n, g.v, (g.n ??= norm(g.v)));
        if (sim > bestSim) (bestSim = sim), (best = g);
      }
    }
    if (best && bestSim >= join) {
      best.docs.push(d);
      for (const [k, x] of d.v) {
        if (!best.v.has(k)) note(k, best);
        add(best.v, k, x);
      }
      best.n = null;
      best.last = Math.max(best.last, d.it.at || 0);
      best.first = Math.min(best.first, d.it.at || 0);
    } else {
      const g = { docs: [d], v: new Map(d.v), n: d.n, last: d.it.at || 0, first: d.it.at || 0 };
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
    for (const k of g.v.keys())
      for (const h of index.get(k) || []) {
        if (h === g) continue;
        const a = root(g);
        const b = root(h);
        if (a === b || h.first > g.last + GAP || g.first > h.last + GAP) continue;
        if (cosine(g.v, g.n, h.v, h.n) >= merge) into.set(b, a);
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
  const withSum = [lead, ...newest].find(it => it.d);
  // The picture: a feed's own, else the one the outlet set on its page.
  const pics = [lead, ...newest].flatMap(it => {
    const p = pages[it.u]?.i;
    return [it.img && same.feedPic(it.o, it.img) && [bigPicture(it.img), it.o], p && same.pagePic(it.o, p) && [p, it.o]];
  });
  // The story's clips: each outlet's own YouTube clip on its page, or its
  // video page (played on the outlet's site), newest first, one a clip.
  const clips = [];
  const ids = new Set();
  for (const it of newest) {
    const y = (pages[it.u]?.y || []).filter(id => same.clip(it.o, id) && !ids.has(id));
    for (const id of y) {
      ids.add(id);
      clips.push([it.o, id, it.u, cleanTitle(it.t), ytPicture(id)]);
    }
    if (it.v && !y.length) clips.push([it.o, '', it.u, cleanTitle(it.t), bigPicture(it.img || pages[it.u]?.i || '')]);
  }
  // Then the channels' clips matched to it (matchClips), newest first.
  for (const v of [...vids].sort((x, z) => z.at - x.at)) {
    if (ids.has(v.y) || clips.length >= CLIPS_MAX) continue;
    ids.add(v.y);
    clips.push([v.o, v.y, `https://www.youtube.com/watch?v=${v.y}`, clipTitle(v.t), ytPicture(v.y)]);
  }
  // (Those that play here first, then the outlets' own video pages.)
  clips.sort((a, b) => Boolean(b[1]) - Boolean(a[1]));
  // (A thumbnail's size, The Guardian's 140 kept from before, only when no other.)
  const withImg = pics.find(p => p && !SMALL_PIC.test(p[0])) || pics.find(Boolean) || (clips[0]?.[4] && [clips[0][4], clips[0][0]]);
  // Others to show should a phone fail to load it (an outlet that refuses
  // another site its pictures, Jay 11-11): each another outlet's, a clip's last.
  const alts = [];
  const tried = new Set([withImg?.[1]]);
  for (const p of [...pics.filter(p => p && !SMALL_PIC.test(p[0])), ...pics, ...clips.map(c => c[4] && [c[4], c[0]])]) {
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
  // 單邊 (one side): a story of a topic sides take, carried by 3 outlets or
  // more for 2 hours or more, 2 or more of them on one side and none on the
  // other: `blind`, the side that missed it.
  const many = n >= 3 && now - first >= 2 * HOUR && kinds.some(t => t.spectrum !== false);
  const blind = many && sides[left] >= 2 && !sides[right] ? right : many && sides[right] >= 2 && !sides[left] ? left : '';
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
    clips: clips.slice(0, 4),
    items: [...byOutlet.values()].flat().map(it => [it.o, cleanTitle(it.t), it.u, it.at || now, ...(it.v ? [1] : [])]),
    // (Ranked on the front page by importance fading by half in 36 hours.)
    score: imp * 0.5 ** ((now - at) / (36 * HOUR)),
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
const enough = (outlets, region) => outlets.size >= FEWEST[region] || (outlets.size >= 2 && [...outlets].some(o => STEADY.has(OUTLETS[o]?.kind)));
const sumOf = vs => {
  const v = new Map();
  for (const x of vs) for (const [k, w] of x) add(v, k, w);
  return v;
};
// What a story keeps of a headline.
const keepOf = ({ o, t, u, at, d, img, v }) => ({ o, t, u, at, ...(d ? { d } : {}), ...(img ? { img } : {}), ...(v ? { v } : {}) });

// Each channel clip to the kept story its title is nearest: near enough
// (CLIP_NEAR, the title against the story's middle), from a day before its
// first headline to a day after its last. → Map(rec → clips).
export const CLIP_NEAR = { zh: 0.24, en: 0.28 };
const CLIPS_MAX = 8;
function matchClips(vids, sized, vecOf, lang) {
  const out = new Map();
  if (!vids.length || !sized.length) return out;
  // (Which stories each piece is in: a clip is weighed against those only.)
  const by = new Map();
  for (const x of sized) for (const k of x.c.keys()) (by.get(k) || by.set(k, []).get(k)).push(x);
  for (const v of vids) {
    const vv = vecOf({ t: clipTitle(v.t) });
    if (vv.size < 2) continue;
    const vn = norm(vv);
    const near = new Set();
    for (const k of vv.keys()) for (const x of by.get(k) || []) near.add(x);
    let best = null;
    let bestSim = 0;
    for (const x of near) {
      if (v.at < x.first - 24 * HOUR || v.at > x.last + 24 * HOUR) continue;
      const sim = cosine(vv, vn, x.c, x.cn);
      if (sim > bestSim) (bestSim = sim), (best = x.r);
    }
    if (best && bestSim >= CLIP_NEAR[lang]) (out.get(best) || out.set(best, []).get(best)).push(v);
  }
  return out;
}

// The desk: today's headlines grouped, each group added to the story it
// continues (one of its headlines already that story's, or, after a quiet
// spell, its last day's headlines near), else a new story if FEWEST outlets
// carry it and it has a topic. recs: the stories kept, [{ id, r, first,
// last, peak, items }]. → { tw, intl } (the front: heard of in NOW_MS,
// ranked), past: { tw, intl } (older, by importance), recs (to keep).
export function deskOf(items, recs = [], now, { pages = {}, vids = [] } = {}) {
  // (A kept headline read again takes the feed's picture as it is now: a
  // larger one, once the build asks for it.)
  const fresh = new Map(items.filter(it => it.img).map(it => [it.u, it.img]));
  const live = recs.filter(r => now - r.last <= keepFor(r.peak || 0)).map(r => ({ ...r, items: r.items.map(it => (fresh.has(it.u) && fresh.get(it.u) !== it.img ? { ...it, img: fresh.get(it.u) } : it)) }));
  const every = new Map();
  for (const it of [...live.flatMap(r => r.items), ...items]) every.set(it.u, it);
  const same = sameOf(pages, [...every.values()]);
  const out = { tw: [], intl: [], past: { tw: [], intl: [] }, recs: live };
  for (const region of ['tw', 'intl']) {
    const lang = region === 'tw' ? 'zh' : 'en';
    const mine = items.filter(it => OUTLETS[it.o]?.region === region && now - (it.at || now) <= WINDOW[region] && !fillerOf(it, lang));
    const vecOf = weigh(mine, lang);
    const recsHere = live.filter(r => r.r === region);
    const owner = new Map();
    for (const r of recsHere) for (const it of r.items) owner.set(it.u, r);
    const open = r => now - r.first <= OPEN_MS;
    // (Each kept story's last day, weighed once; only stories kept before
    // this build: today's groups were already kept apart by groupStories.)
    const lastDays = recsHere
      .filter(open)
      .map(r => {
        const v = sumOf(r.items.filter(it => it.at >= r.last - 24 * HOUR).map(vecOf));
        return { r, v, n: norm(v) };
      });
    for (const g of groupStories(mine, lang)) {
      const hits = new Map();
      for (const it of g) {
        const r = owner.get(it.u);
        if (r && open(r)) hits.set(r, (hits.get(r) || 0) + 1);
      }
      let rec = [...hits].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!rec) {
        const gFirst = Math.min(...g.map(it => it.at || now));
        const gv = sumOf(g.map(vecOf));
        const gn = norm(gv);
        let best = null;
        let bestSim = 0;
        for (const { r, v, n } of lastDays) {
          if (r.last < gFirst - GAP) continue;
          const sim = cosine(gv, gn, v, n);
          if (sim > bestSim) (bestSim = sim), (best = r);
        }
        if (bestSim >= MERGE[lang]) rec = best;
      }
      if (!rec) {
        const texts = g.map(it => (lang === 'en' ? `${it.t} ${it.d || ''}` : it.t));
        const kinds = topicsOf(texts, lang);
        if (!kinds.length && !partiesIn(texts.join(' ')).length) continue;
        // (A kind past the sides, health, science, sport…, needs only two:
        // its tab isn't empty, and there's no side to weigh, Jay 11-10.)
        const outlets = new Set(g.map(it => it.o));
        if (!enough(outlets, region) && !(outlets.size >= 2 && TOPIC[kinds[0]]?.spectrum === false)) continue;
        const firstIt = g.reduce((a, b) => ((a.at || 0) <= (b.at || 0) ? a : b));
        rec = { id: idOf(firstIt.u), r: region, first: firstIt.at || now, last: firstIt.at || now, peak: 0, items: [] };
        live.push(rec);
        recsHere.push(rec);
      }
      for (const it of g) {
        if (owner.has(it.u)) continue;
        rec.items.push(keepOf(it));
        owner.set(it.u, rec);
      }
    }
    const sized = recsHere.map(r => {
      r.items.sort((a, b) => a.at - b.at);
      if (r.items.length > REC_ITEMS) r.items = [...r.items.slice(0, 10), ...r.items.slice(10 - REC_ITEMS)];
      const vs = r.items.map(vecOf);
      const c = sumOf(vs);
      return { r, vs, c, cn: norm(c), first: r.items[0]?.at || now, last: r.items.at(-1)?.at || now };
    });
    const clipsOf = matchClips(vids.filter(v => OUTLETS[v.o]?.region === region), sized, vecOf, lang);
    // (The world's stories: Taiwan's outlets' on each, from Taiwan's front.)
    const twOn = region === 'intl' ? taiwanOn(out.tw, sized, vecOf) : new Map();
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
    }
    out[region] = frontOf(out[region], TOP[region]).map(({ score, light, ...s }) => s);
    // (The past lighter: each outlet's newest headline only.)
    out.past[region] = out.past[region]
      .sort((a, b) => b.imp - a.imp)
      .slice(0, PAST_TOP[region])
      .map(({ score, light, items: list, ...s }) => ({ ...s, items: list.filter((x, i) => list.findIndex(y => y[0] === x[0]) === i) }));
  }
  return out;
}

// The front: the TOP stories by score, then each topic's best past them
// to TOPIC_MIN (its first topic's), so a quiet day's 科學 or 運動 isn't cut
// for the 150th politics story (Jay 11-10: tabs nearly empty).
export const TOPIC_MIN = 12;
export function frontOf(stories, top) {
  const ranked = [...stories].sort((a, b) => b.score - a.score);
  const front = ranked.slice(0, top);
  const have = new Map();
  for (const s of front) have.set(s.topics[0], (have.get(s.topics[0]) || 0) + 1);
  for (const s of ranked.slice(top)) {
    const n = have.get(s.topics[0]) || 0;
    if (n >= TOPIC_MIN) continue;
    have.set(s.topics[0], n + 1);
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
function taiwanOn(twStories, sized, vecOf) {
  const index = new Map();
  for (const z of sized) for (const k of z.c.keys()) (index.get(k) || index.set(k, []).get(k)).push(z);
  const out = new Map();
  for (const s of twStories) {
    const v = new Map();
    for (const it of s.items) {
      const en = enOf(it[1]);
      if (en) for (const [k, w] of vecOf({ t: en })) add(v, k, w);
    }
    if (v.size < 2) continue;
    const vn = norm(v);
    const shared = new Map();
    for (const k of v.keys()) for (const z of index.get(k) || []) (shared.get(z) || shared.set(z, []).get(z)).push(k);
    let best = null;
    let bestSim = 0;
    for (const [z, keys] of shared) {
      // (A name shared, a place, a person, a body abroad, and a word more.)
      if (keys.length < 2 || !keys.some(k => NAME_KEYS.has(k)) || s.at < z.first - GAP || s.first > z.last + GAP) continue;
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
          byUrl.set(u, { o, t: it.t, u, d: cut(it.d, SUM_MAX[lang] * 2), at, img: it.img, ...(isVideo(u) ? { v: 1 } : {}) });
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
  let out = deskOf(items, recs, now, { pages, vids: clips });
  const want = pagesToRead(out, pages);
  const read = await Promise.all(want.map(u => readPage(u, { fetchImpl })));
  want.forEach((u, i) => (pages[u] = read[i] || { i: '', y: [] }));
  if (want.length) out = deskOf(items, recs, now, { pages, vids: clips });
  const keep = new Set([...items, ...out.recs.flatMap(r => r.items)].map(it => it.u));
  for (const u of Object.keys(pages)) if (!keep.has(u)) delete pages[u];
  await store.put(NEWS_STATE, { items, etag, pages, recs: out.recs, vids: clips });
  // (Never an empty page over a good one: a build that read nothing keeps the last.)
  if (out.tw.length || out.intl.length) {
    await store.put(NEWS_PATH, { built: now, tw: out.tw, intl: out.intl });
    await store.put(NEWS_PAST, { built: now, ...out.past });
  }
  // (A few feeds missing is a normal build. Only half or more of the stories' feeds asked
  // failing is the build's failure, what the beat and the panel's 外部來源 call broken.)
  // (Channels' clips apart: YouTube's feeds can all 404 for a day (11-11, every channel from
  // everywhere) while the stories build fine; the clips kept 48 hours carry them.)
  const storyFails = failed.filter(f => !/ clips: /.test(f)).length;
  const missed = failed.length && storyFails * 2 < feedsNow.length ? failed.slice(0, 12) : null;
  return { items: items.length, fresh, clips: clips.length, pages: want.length, kept: out.recs.length, tw: out.tw.length, intl: out.intl.length, past: out.past.tw.length + out.past.intl.length, ...(missed ? { missed } : { failed }) };
}

// Outlets whose pages carry the story's own YouTube clip.
const CLIPS_AT = new Set(['pts', 'ebc', 'ctinews']);
// The pages a build reads, PAGE_READS at most, top stories first (two of
// Taiwan's to one abroad): one with a clip where a story has none yet, and
// the lead's (else any) where it has no picture.
export function pagesToRead(out, pages, most = PAGE_READS) {
  const order = [];
  for (let i = 0; i < 40; i++) order.push(out.tw[2 * i], out.tw[2 * i + 1], out.intl[i]);
  const want = [];
  for (const s of order.filter(Boolean)) {
    // (Those read through a search's feed or a channel: no page of theirs to read.)
    const fresh = s.items.filter(([o, , u]) => !pages[u] && !want.includes(u) && !FAR.has(o));
    const clip = !s.clips?.some(c => c[1]) && fresh.find(([o]) => CLIPS_AT.has(o));
    if (clip) want.push(clip[2]);
    const pic = !s.img && (fresh.find(([, , u]) => u === s.items[0]?.[2]) || fresh.find(([, , u]) => u !== clip?.[2]));
    if (pic) want.push(pic[2]);
    if (want.length >= most) break;
  }
  return want.slice(0, most);
}
// One page read for its picture and clip; null when it can't be.
async function readPage(url, { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(10_000) });
    if (!res?.ok) return null;
    return pageOf(await res.text());
  } catch {
    return null;
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
