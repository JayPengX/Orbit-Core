// Orbit News' outlets: who they are, where each stands and why. One table
// for the builder (builders/news.js: each story's bar) and the app (the
// 媒體 tab, a story's sources). An outlet's place is a published finding or
// its owner's stated line, never our own reading of its stories; `weak`
// marks a place that rests on ownership and stance alone, no study.
//
//   tw  藍綠: −2 深綠, −1 偏綠, 0 中間, 1 偏藍, 2 深藍 (Taiwan's outlets)
//   cs  統獨: −2 主張獨立, −1 偏獨, 0 不站邊, 1 偏統, 2 親北京
//   lr  English outlets' left and right (AllSides): −2 Left … 2 Right;
//       null where AllSides has none (most outlets outside the US)
//   kind  private | public (公共媒體) | gov (政府出資) | nonprofit | state (中國官媒)
//
// No outlet is placed as 白 (民眾黨): no study rates one so. A story says
// which parties its headlines name instead (partiesIn).

export const BASIS = {
  'teds-tv': {
    zh: '江淳芳、施秀函（2013），以 TEDS 2004–2008 調查與各地收視率：泛藍支持者較常看 TVBS、中天、東森，較少看民視、三立；所引內容研究也見民視、三立有利綠營，TVBS、中天、東森有利藍營。',
    en: 'Chiang & Shih (2013), TEDS 2004–08 surveys and regional ratings: Pan-Blue supporters watch TVBS, CTi and EBC more, FTV and SET less; the content studies it cites find FTV and SET favour the DPP, TVBS, CTi and EBC the KMT.',
    url: 'http://homepage.ntu.edu.tw/~chunfang/TVnews.pdf'
  },
  chang2023: {
    zh: 'Chang 與 Fang（2023），2024 大選前的社群資料：聯合報、中時、中天偏藍，自由時報、民視、三立偏綠，TVBS 列為中間。',
    en: 'Chang & Fang (2023), social media before the 2024 election: UDN, China Times and CTi lean Blue; Liberty Times, FTV and SET lean Green; TVBS centred.',
    url: 'https://arxiv.org/abs/2310.07739'
  },
  kao: {
    zh: 'Kao，《美國政治學評論》（APSR）田野實驗：中國時報屬北京支持的媒體集團（旺旺），讀它讓受試者對中國的看法變得較友善。',
    en: 'Kao, American Political Science Review field experiment: the China Times is a Beijing-backed conglomerate (Want Want); reading it moved voters’ views toward the PRC.',
    url: 'https://www.cambridge.org/core/journals/american-political-science-review/article/how-the-probeijing-media-influences-voters-evidence-from-a-randomized-field-experiment/D9AFD28D149D8643F378CE5A4D116526'
  },
  stance: {
    zh: '經營者與公開立場（沒有研究評過，依據較少）。',
    en: 'Owner and stated stance (no study has rated it; weaker evidence).',
    url: ''
  },
  pts: { zh: '公共電視法：公視須維持政治中立。', en: 'The Public Television Act requires PTS to stay politically neutral.', url: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=P0050001' },
  cna: { zh: '中央通訊社設置條例：國家通訊社，政府出資、董事會獨立。', en: 'The CNA Act: the national news agency, government-funded with an independent board.', url: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=P0050010' },
  allsides: {
    zh: 'AllSides 媒體偏向評分（美國左右，依盲測問卷、編輯審閱與第三方資料；CC BY-NC 4.0）。',
    en: 'AllSides Media Bias Ratings™ (US left and right, from blind surveys, editorial reviews and third-party data; CC BY-NC 4.0).',
    url: 'https://www.allsides.com/media-bias/ratings'
  },
  state: { zh: '中國共產黨與政府所有、所管的媒體。', en: 'Owned and run by the Chinese Communist Party and state.', url: '' }
};

// [id, 中文名, English name, site, kind, tw, cs, lr, owner zh, owner en, basis, weak]
const ROWS = [
  // Taiwan, Chinese
  ['ltn', '自由時報', 'Liberty Times', 'ltn.com.tw', 'private', -2, -2, null, '林榮三家族', 'The Lin Rong-san family', ['chang2023'], false],
  ['setn', '三立新聞', 'SET News', 'setn.com', 'private', -1, -1, null, '三立電視（林崑海）', 'Sanlih E-Television (Lin Kun-hai)', ['teds-tv', 'chang2023'], false],
  ['newtalk', '新頭殼', 'Newtalk', 'newtalk.tw', 'private', -1, -1, null, '新頭殼（莊豐嘉）', 'Newtalk (Chuang Feng-chia)', ['stance'], true],
  ['peoples', '民報', 'PeoplesNews', 'peoplenews.tw', 'private', -2, -2, null, '民報文化（陳永興等創辦）', 'Founded by Chen Yung-hsing and others', ['stance'], true],
  ['cna', '中央社', 'CNA', 'cna.com.tw', 'gov', 0, 0, null, '國家通訊社（政府捐助）', 'National news agency (government-funded)', ['cna'], false],
  ['pts', '公視', 'PTS', 'pts.org.tw', 'public', 0, 0, null, '公共電視（公廣集團）', 'Public Television Service', ['pts'], false],
  ['ettoday', 'ETtoday', 'ETtoday', 'ettoday.net', 'private', 0, 0, null, '東森集團（王令麟）', 'Eastern group (Wang Ling-lin)', ['stance'], true],
  ['ebc', '東森新聞', 'EBC News', 'ebc.net.tw', 'private', 0, 0, null, '東森集團（王令麟）', 'Eastern group (Wang Ling-lin)', ['teds-tv', 'stance'], true],
  ['storm', '風傳媒', 'Storm Media', 'storm.mg', 'private', 0, 0, null, '風傳媒', 'Storm Media Group', ['stance'], true],
  ['mirror', '鏡週刊', 'Mirror Media', 'mirrormedia.mg', 'private', 0, 0, null, '鏡傳媒（裴偉創辦）', 'Mirror Media (founded by Pei Wei)', ['stance'], true],
  ['twreporter', '報導者', 'The Reporter', 'twreporter.org', 'nonprofit', 0, 0, null, '財團法人報導者文化基金會', 'The Reporter Foundation (non-profit)', ['stance'], true],
  ['tnl', '關鍵評論網', 'The News Lens', 'thenewslens.com', 'private', 0, 0, null, '關鍵評論網媒體集團', 'The News Lens Media Group', ['stance'], true],
  ['upmedia', '上報', 'Up Media', 'upmedia.mg', 'private', 0, 0, null, '上報（王健壯創辦）', 'Up Media (founded by Wang Chien-chuang)', ['stance'], true],
  ['tvbs', 'TVBS', 'TVBS', 'tvbs.com.tw', 'private', 0, 0, null, 'TVBS（王雪紅）', 'TVBS (Cher Wang)', ['teds-tv', 'chang2023'], false],
  ['udn', '聯合報', 'United Daily News', 'udn.com', 'private', 1, 1, null, '聯合報系（王氏家族）', 'United Daily News Group (the Wang family)', ['chang2023'], false],
  ['chinatimes', '中時', 'China Times', 'chinatimes.com', 'private', 2, 2, null, '旺旺中時集團（蔡衍明）', 'Want Want China Times (Tsai Eng-meng)', ['chang2023', 'kao'], false],
  ['ctinews', '中天', 'CTi News', 'ctinews.com', 'private', 2, 2, null, '旺旺中時集團（蔡衍明）', 'Want Want China Times (Tsai Eng-meng)', ['teds-tv', 'chang2023'], false],
  // English
  ['bbc', 'BBC', 'BBC', 'bbc.com', 'public', null, null, 0, '英國廣播公司（公共媒體）', 'British Broadcasting Corporation (public)', ['allsides'], false],
  ['wsj', '華爾街日報', 'The Wall Street Journal', 'wsj.com', 'private', null, null, 0, '新聞集團（梅鐸）', 'News Corp (Murdoch)', ['allsides'], false],
  ['ft', '金融時報', 'Financial Times', 'ft.com', 'private', null, null, 0, '日經', 'Nikkei', ['allsides'], false],
  ['hill', 'The Hill', 'The Hill', 'thehill.com', 'private', null, null, 0, 'Nexstar', 'Nexstar Media', ['allsides'], false],
  ['csm', '基督科學箴言報', 'Christian Science Monitor', 'csmonitor.com', 'nonprofit', null, null, 0, '基督科學教會', 'Church of Christ, Scientist', ['allsides'], false],
  ['guardian', '衛報', 'The Guardian', 'theguardian.com', 'private', null, null, -1, '史考特信託', 'Scott Trust', ['allsides'], false],
  ['nyt', '紐約時報', 'The New York Times', 'nytimes.com', 'private', null, null, -1, '紐約時報公司', 'The New York Times Company', ['allsides'], false],
  ['wapo', '華盛頓郵報', 'The Washington Post', 'washingtonpost.com', 'private', null, null, -1, '貝佐斯', 'Jeff Bezos', ['allsides'], false],
  ['aljazeera', '半島電視台', 'Al Jazeera', 'aljazeera.com', 'gov', null, null, -1, '卡達政府出資', 'Funded by the government of Qatar', ['allsides'], false],
  ['economist', '經濟學人', 'The Economist', 'economist.com', 'private', null, null, -1, '經濟學人集團', 'The Economist Group', ['allsides'], false],
  ['politico', 'Politico', 'Politico', 'politico.com', 'private', null, null, -1, '施普林格', 'Axel Springer', ['allsides'], false],
  ['time', '時代雜誌', 'TIME', 'time.com', 'private', null, null, -1, '貝尼奧夫', 'Marc Benioff', ['allsides'], false],
  ['nbc', 'NBC', 'NBC News', 'nbcnews.com', 'private', null, null, -1, '康卡斯特', 'Comcast', ['allsides'], false],
  ['cbs', 'CBS', 'CBS News', 'cbsnews.com', 'private', null, null, -1, '派拉蒙', 'Paramount', ['allsides'], false],
  ['abc', 'ABC', 'ABC News', 'abcnews.go.com', 'private', null, null, -1, '迪士尼', 'Disney', ['allsides'], false],
  ['fox', '福斯新聞', 'Fox News', 'foxnews.com', 'private', null, null, 2, '福斯公司（梅鐸）', 'Fox Corporation (Murdoch)', ['allsides'], false],
  ['nypost', '紐約郵報', 'New York Post', 'nypost.com', 'private', null, null, 1, '新聞集團（梅鐸）', 'News Corp (Murdoch)', ['allsides'], false],
  ['wexam', '華盛頓觀察家報', 'Washington Examiner', 'washingtonexaminer.com', 'private', null, null, 1, 'Clarity Media', 'Clarity Media Group', ['allsides'], false],
  ['breitbart', 'Breitbart', 'Breitbart', 'breitbart.com', 'private', null, null, 2, 'Breitbart', 'Breitbart News Network', ['allsides'], false],
  ['dailycaller', 'Daily Caller', 'The Daily Caller', 'dailycaller.com', 'private', null, null, 2, 'Daily Caller', 'The Daily Caller, Inc.', ['allsides'], false],
  ['natreview', '國家評論', 'National Review', 'nationalreview.com', 'nonprofit', null, null, 2, '國家評論研究所', 'National Review Institute', ['allsides'], false],
  ['dailymail', '每日郵報', 'Daily Mail', 'dailymail.co.uk', 'private', null, null, 2, 'DMG Media', 'DMG Media', ['allsides'], false],
  ['dw', '德國之聲', 'DW', 'dw.com', 'public', null, null, null, '德國公共國際廣播', 'Germany’s public international broadcaster', ['stance'], true],
  ['f24', '法國 24', 'France 24', 'france24.com', 'public', null, null, null, '法國公共國際媒體', 'France Médias Monde (public)', ['stance'], true],
  ['scmp', '南華早報', 'South China Morning Post', 'scmp.com', 'private', null, null, null, '阿里巴巴', 'Alibaba', ['stance'], true],
  ['nikkei', '日經亞洲', 'Nikkei Asia', 'asia.nikkei.com', 'private', null, null, null, '日經', 'Nikkei', ['stance'], true],
  ['japantimes', '日本時報', 'The Japan Times', 'japantimes.co.jp', 'private', null, null, null, 'News2u', 'News2u Holdings', ['stance'], true],
  ['diplomat', '外交家', 'The Diplomat', 'thediplomat.com', 'private', null, null, null, 'Diplomat Media', 'Diplomat Media', ['stance'], true],
  ['taipeitimes', '台北時報', 'Taipei Times', 'taipeitimes.com', 'private', -2, -2, null, '自由時報集團', 'Liberty Times group', ['chang2023'], false],
  ['globaltimes', '環球時報', 'Global Times', 'globaltimes.cn', 'state', null, 2, null, '人民日報社', 'People’s Daily (CCP)', ['state'], false],
  ['cgtn', 'CGTN', 'CGTN', 'cgtn.com', 'state', null, 2, null, '中央廣播電視總台', 'China Media Group (state)', ['state'], false],
  ['xinhua', '新華社', 'Xinhua', 'news.cn', 'state', null, 2, null, '中國國務院', 'China’s State Council', ['state'], false]
];

// Taiwan's outlets come first in ROWS; the rest are the English ones.
const TW_COUNT = 17;
export const OUTLETS = Object.fromEntries(
  ROWS.map(([id, zh, en, site, kind, tw, cs, lr, ownerZh, ownerEn, basis, weak], i) => [id, { id, zh, en, site, kind, tw, cs, lr, owner: { zh: ownerZh, en: ownerEn }, basis, weak, region: i < TW_COUNT ? 'tw' : 'intl' }])
);
export const outletOf = id => OUTLETS[id] || null;
// An outlet's mark: its site's own small icon (no picture of ours).
export const outletIcon = (id, size = 64) => (OUTLETS[id] ? `https://www.google.com/s2/favicons?domain=${OUTLETS[id].site}&sz=${size}` : '');

// The side an outlet counts for in a story's bar: Taiwan's g (綠) c b (藍),
// the English l c r; null when it has no place on that axis (unrated, or
// state media: they're counted apart).
export function sideOf(outlet, region) {
  const o = typeof outlet === 'string' ? OUTLETS[outlet] : outlet;
  if (!o) return null;
  const v = region === 'tw' ? o.tw : o.lr;
  if (v == null) return null;
  if (region === 'tw') return v < 0 ? 'g' : v > 0 ? 'b' : 'c';
  return v < 0 ? 'l' : v > 0 ? 'r' : 'c';
}
export const SIDES = { tw: ['g', 'c', 'b'], intl: ['l', 'c', 'r'] };

// The words for a place on an axis.
const WORDS = {
  tw: { '-2': ['深綠', 'Deep Green'], '-1': ['偏綠', 'Leans Green'], 0: ['中間', 'Centre'], 1: ['偏藍', 'Leans Blue'], 2: ['深藍', 'Deep Blue'] },
  cs: { '-2': ['主張獨立', 'Pro-independence'], '-1': ['偏獨', 'Leans independence'], 0: ['不站邊', 'Neither'], 1: ['偏統', 'Leans unification'], 2: ['親北京', 'Pro-Beijing'] },
  lr: { '-2': ['左', 'Left'], '-1': ['中間偏左', 'Lean Left'], 0: ['中間', 'Centre'], 1: ['中間偏右', 'Lean Right'], 2: ['右', 'Right'] }
};
export const placeWord = (axis, v, lang = 'zh') => (v == null ? (lang === 'en' ? 'Not rated' : '未評') : WORDS[axis]?.[String(v)]?.[lang === 'en' ? 1 : 0] || '');
export const SIDE_WORDS = { g: ['綠', 'Green'], c: ['中', 'Centre'], b: ['藍', 'Blue'], l: ['左', 'Left'], r: ['右', 'Right'] };
export const sideWord = (side, lang = 'zh') => SIDE_WORDS[side]?.[lang === 'en' ? 1 : 0] || '';
// A side's name in full (a column's head, a sentence).
export const SIDE_NAMES = { g: ['偏綠', 'Leans green'], c: ['中間', 'Centre'], b: ['偏藍', 'Leans blue'], l: ['偏左', 'Leans left'], r: ['偏右', 'Leans right'] };
export const sideName = (side, lang = 'zh') => SIDE_NAMES[side]?.[lang === 'en' ? 1 : 0] || '';

// Which parties a headline names: 民進黨 (g), 國民黨 (b), 民眾黨 (w), by the
// parties' own names and the camps' (綠營, 藍委, 藍白…); English too.
const PARTY_RX = {
  g: /民進黨|綠營|綠委|\bDPP\b|Democratic Progressive Party/,
  b: /國民黨|藍營|藍委|藍白|\bKMT\b|Kuomintang/,
  w: /民眾黨|白營|白委|藍白|\bTPP\b|Taiwan People'?s Party/
};
export function partiesIn(text) {
  const s = String(text || '');
  return Object.keys(PARTY_RX).filter(k => PARTY_RX[k].test(s));
}
export const PARTY_WORDS = { g: ['民進黨', 'DPP'], b: ['國民黨', 'KMT'], w: ['民眾黨', 'TPP'] };
