// Orbit News' outlets: who they are, where each stands and why. One table
// for the builder (builders/news.js: each story's bar) and the app (the
// 媒體 tab, a story's sources). An outlet's place is a published finding or
// its owner's stated line, never our own reading of its stories; `weak`
// marks a place that rests on ownership and stance alone, no study.
//
//   tw  藍綠: −2 深綠, −1 偏綠, 0 中間, 1 偏藍, 2 深藍 (Taiwan's outlets)
//   cs  統獨: −2 主張獨立, −1 偏獨, 0 不站邊, 1 偏統, 2 親北京
//   lr  English outlets' left and right (AllSides): −2 Left … 2 Right;
//       where AllSides has none, Media Bias/Fact Check's (`mbfc`); null
//       only for China's state media, counted apart as 官媒
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
  // (11-13, Jay: "Taiwan news outlets sit majority in middle, that's probably
  // not so true": TEDS 2019's question on each channel's colour moved TVBS,
  // 東森 to 偏藍 and 民視, 三立 to 深綠; MBFC's Taiwan ratings 關鍵評論網 to
  // 偏綠; Chang & Fang 2023, the old source for six places, only named
  // them, citing no study. ETtoday stays 中間: 東森's newest rating, MBFC's
  // of 2026-10, is nearly centre.)
  teds2019: {
    zh: '申佳健（2023），《行政暨政策學報》76 期，用 TEDS 2019 調查問民眾哪些新聞台屬藍營、哪些屬綠營：民視（綠營提名的 34.1%）、三立（32.2%）與中天（藍營的 27.3%）最多；中視 19.3%、TVBS 19.0%、東森 11.8% 被看成藍營；台視、華視、年代、公視、非凡、客家、原民台藍綠相差不到 5 個百分點。這裡把提名與中天相當（25% 以上）的記為深，藍綠相差 5 點以上的記為偏，其餘為中間。',
    en: 'Shen (2023), Public Administration & Policy 76, from TEDS 2019’s question on which channels are Blue and which Green: FTV (34.1% of Green mentions), SET (32.2%) and CTi (27.3% of Blue) lead; CTV 19.3%, TVBS 19.0% and EBC 11.8% are seen as Blue; TTV, CTS, ERA, PTS, USTV, Hakka TV and TITV differ by under 5 points. Here: named as often as CTi (25% or more) is Deep; 5 points apart or more is Leans; the rest Centre.',
    url: 'https://pa.ntpu.edu.tw/storage/app/media/Journal/7604.pdf'
  },
  xiao2006: {
    zh: '蕭怡靖（2006），《臺灣民主季刊》3 卷 4 期，1992–2004 年的選後調查：聯合報 38.9%、中國時報 28.3% 的讀者認為該報偏泛藍，自由時報 45.6% 的讀者認為偏泛綠；蘋果日報七成讀者認為沒有政黨偏向，與內容分析的結果相符。',
    en: 'Hsiao (2006), Taiwan Democracy Quarterly 3(4), post-election surveys 1992–2004: 38.9% of UDN’s and 28.3% of the China Times’ readers call it Pan-Blue, 45.6% of the Liberty Times’ call it Pan-Green; 70% of Apple Daily’s see no party lean, matching content studies.',
    url: 'https://ah.lib.nccu.edu.tw/bitstream/140.119/74605/1/37-70.pdf'
  },
  liu2018: {
    zh: '劉嘉薇（2018），《臺灣民眾的媒體選擇與統獨立場》：五次總統大選前一年各報的社論與新聞內容分析，聯合報、中國時報偏統，自由時報偏獨，蘋果日報中立（申佳健 2023 引述）。',
    en: 'Liu (2018), Taiwanese Media Choice and Unification–Independence Stances: content analysis of each paper’s editorials and news in the year before five presidential elections: UDN and China Times lean unification, Liberty Times independence, Apple Daily neutral (as cited by Shen 2023).',
    url: 'https://pa.ntpu.edu.tw/storage/app/media/Journal/7604.pdf'
  },
  'mbfc-tw': {
    zh: 'Media Bias/Fact Check 對台灣媒體的評比（2025–26）：偏向民進黨的（自由時報、三立）評為中間偏左，對民進黨批評多的（TVBS、聯合報）評為中間偏右；這裡把中間偏左記為偏綠、中間偏右記為偏藍。',
    en: 'Media Bias/Fact Check’s ratings of Taiwan’s outlets (2025–26): those favouring the DPP (Liberty Times, SET) rated Left-Center, those most critical of it (TVBS, UDN) Right-Center; here Left-Center counts as Leans Green, Right-Center as Leans Blue.',
    url: 'https://mediabiasfactcheck.com/the-news-lens'
  },
  group: {
    zh: '沒有研究評過這家；依同一集團媒體的研究結果（依據較少）。',
    en: 'No study has rated it; placed as research places its group’s other outlets (weaker evidence).',
    url: ''
  },
  apple: {
    zh: '2022 年由台灣蘋果日報的團隊接手；研究中的蘋果日報不偏藍綠（蕭怡靖 2006、劉嘉薇 2018）。這家本身沒有研究評過，依據較少。',
    en: 'Taken over by Taiwan Apple Daily’s newsroom in 2022; research found Apple Daily leaning neither way (Hsiao 2006, Liu 2018). No study has rated it itself; weaker evidence.',
    url: 'https://ah.lib.nccu.edu.tw/bitstream/140.119/74605/1/37-70.pdf'
  },
  ydn: { zh: '國防部所屬的報紙（政府出資）。', en: 'The Ministry of National Defense’s paper (government-funded).', url: '' },
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
    zh: 'AllSides 媒體偏向評分（美國左右，依盲測問卷、編輯審閱與第三方資料；CC BY-NC 4.0）。美國以外的媒體多半是它自己標示信心較低的初評。',
    en: 'AllSides Media Bias Ratings™ (US left and right, from blind surveys, editorial reviews and third-party data; CC BY-NC 4.0). Most outlets outside the US carry its own “low or initial confidence”.',
    url: 'https://www.allsides.com/media-bias/ratings'
  },
  mbfc: {
    zh: 'Media Bias/Fact Check 的評比（AllSides 沒評的才用）：Least Biased 記為中間，Left-Center 中間偏左，Right-Center 中間偏右。',
    en: 'Media Bias/Fact Check’s rating, used only where AllSides has none: Least Biased as Centre, Left-Center as Lean Left, Right-Center as Lean Right.',
    url: 'https://mediabiasfactcheck.com/'
  },
  rti: { zh: '中央廣播電臺設置條例：國家的對外廣播，政府捐助的財團法人。', en: 'The Radio Taiwan International Act: the national overseas broadcaster, a government-funded foundation.', url: 'https://zh.wikisource.org/wiki/%E4%B8%AD%E5%A4%AE%E5%BB%A3%E6%92%AD%E9%9B%BB%E8%87%BA%E8%A8%AD%E7%BD%AE%E6%A2%9D%E4%BE%8B' },
  cts: { zh: '華視屬公廣集團：2006 年依無線電視事業公股處理條例，政府持有的股份捐給公視基金會（約七成）。', en: 'CTS belongs to the public broadcasting group: in 2006, under the act on government shares in terrestrial TV, the state’s shares (about 70%) went to the PTS Foundation.', url: 'https://info-material.pts.org.tw/annual/2025annual06cts.pdf' },
  state: { zh: '中國共產黨與政府所有、所管的媒體。', en: 'Owned and run by the Chinese Communist Party and state.', url: '' }
};

// [id, 中文名, English name, site, kind, tw, cs, lr, owner zh, owner en, basis, weak]
const ROWS = [
  // Taiwan, Chinese
  ['ltn', '自由時報', 'Liberty Times', 'ltn.com.tw', 'private', -2, -2, null, '林榮三家族', 'The Lin Rong-san family', ['xiao2006', 'liu2018', 'kao', 'mbfc-tw'], false],
  ['setn', '三立新聞', 'SET News', 'setn.com', 'private', -2, -2, null, '三立電視（林崑海）', 'Sanlih E-Television (Lin Kun-hai)', ['teds2019', 'teds-tv', 'mbfc-tw'], false],
  ['ftv', '民視', 'FTV News', 'ftvnews.com.tw', 'private', -2, -2, null, '民間全民電視（郭倍宏）', 'Formosa Television (Kuo Pei-hung)', ['teds2019', 'teds-tv'], false],
  ['newtalk', '新頭殼', 'Newtalk', 'newtalk.tw', 'private', -1, -1, null, '新頭殼（莊豐嘉）', 'Newtalk (Chuang Feng-chia)', ['stance'], true],
  ['peoples', '民報', 'PeoplesNews', 'peoplenews.tw', 'private', -2, -2, null, '民報文化（陳永興等創辦）', 'Founded by Chen Yung-hsing and others', ['stance'], true],
  ['cna', '中央社', 'CNA', 'cna.com.tw', 'gov', 0, 0, null, '國家通訊社（政府捐助）', 'National news agency (government-funded)', ['cna'], false],
  ['pts', '公視', 'PTS', 'pts.org.tw', 'public', 0, 0, null, '公共電視（公廣集團）', 'Public Television Service', ['teds2019', 'pts'], false],
  ['ettoday', 'ETtoday', 'ETtoday', 'ettoday.net', 'private', 0, 0, null, '東森集團（王令麟）', 'Eastern group (Wang Ling-lin)', ['stance'], true],
  ['ebc', '東森新聞', 'EBC News', 'ebc.net.tw', 'private', 1, 1, null, '東森集團（王令麟）', 'Eastern group (Wang Ling-lin)', ['teds2019', 'teds-tv'], false],
  ['storm', '風傳媒', 'Storm Media', 'storm.mg', 'private', 0, 0, null, '風傳媒', 'Storm Media Group', ['stance'], true],
  ['mirror', '鏡週刊', 'Mirror Media', 'mirrormedia.mg', 'private', 0, 0, null, '鏡傳媒（裴偉創辦）', 'Mirror Media (founded by Pei Wei)', ['stance'], true],
  ['twreporter', '報導者', 'The Reporter', 'twreporter.org', 'nonprofit', 0, 0, null, '財團法人報導者文化基金會', 'The Reporter Foundation (non-profit)', ['stance'], true],
  ['tnl', '關鍵評論網', 'The News Lens', 'thenewslens.com', 'private', -1, -1, null, '關鍵評論網媒體集團', 'The News Lens Media Group', ['mbfc-tw'], false],
  ['upmedia', '上報', 'Up Media', 'upmedia.mg', 'private', 0, 0, null, '上報（王健壯創辦）', 'Up Media (founded by Wang Chien-chuang)', ['stance'], true],
  ['tvbs', 'TVBS', 'TVBS', 'tvbs.com.tw', 'private', 1, 1, null, 'TVBS（王雪紅）', 'TVBS (Cher Wang)', ['teds2019', 'teds-tv', 'mbfc-tw'], false],
  ['udn', '聯合報', 'United Daily News', 'udn.com', 'private', 1, 1, null, '聯合報系（王氏家族）', 'United Daily News Group (the Wang family)', ['xiao2006', 'liu2018', 'kao', 'mbfc-tw'], false],
  ['chinatimes', '中時', 'China Times', 'chinatimes.com', 'private', 2, 2, null, '旺旺中時集團（蔡衍明）', 'Want Want China Times (Tsai Eng-meng)', ['kao', 'liu2018', 'xiao2006'], false],
  ['ctinews', '中天', 'CTi News', 'ctinews.com', 'private', 2, 2, null, '旺旺中時集團（蔡衍明）', 'Want Want China Times (Tsai Eng-meng)', ['teds2019', 'teds-tv'], false],
  ['rti', '中央廣播電臺', 'Radio Taiwan International', 'rti.org.tw', 'gov', 0, 0, null, '財團法人中央廣播電臺（政府捐助）', 'Radio Taiwan International (government-funded)', ['rti'], false],
  ['cts', '華視', 'CTS', 'cts.com.tw', 'public', 0, 0, null, '中華電視（公廣集團）', 'Chinese Television System (public broadcasting group)', ['teds2019', 'cts'], false],
  ['ithome', 'iThome', 'iThome', 'ithome.com.tw', 'private', 0, 0, null, 'iThome', 'iThome', ['stance'], true],
  ['technews', '科技新報', 'TechNews', 'technews.tw', 'private', 0, 0, null, '科技新報', 'TechNews', ['stance'], true],
  ['pansci', '泛科學', 'PanSci', 'pansci.asia', 'private', 0, 0, null, '泛科知識', 'PanSci Knowledge', ['stance'], true],
  ['sportsv', '運動視界', 'Sports Vision', 'sportsv.net', 'private', 0, 0, null, '運動視界', 'Sports Vision', ['stance'], true],
  // (11-13, Jay: "even more news outlet from Taiwan and international".)
  ['ctv', '中視', 'CTV News', 'ctv.com.tw', 'private', 1, 1, null, '旺旺中時集團（蔡衍明）', 'Want Want China Times (Tsai Eng-meng)', ['teds2019'], false],
  ['ttv', '台視', 'TTV News', 'ttv.com.tw', 'private', 0, 0, null, '台灣電視（非凡集團）', 'Taiwan Television (USTV group)', ['teds2019'], false],
  ['era', '年代新聞', 'ERA News', 'eracom.com.tw', 'private', 0, 0, null, '年代集團（練台生）', 'ERA group (Lien Tai-sheng)', ['teds2019'], false],
  ['ustv', '非凡新聞', 'USTV', 'ustv.com.tw', 'private', 0, 0, null, '非凡電視', 'Unique Satellite TV', ['teds2019'], false],
  ['titv', '原視', 'TITV', 'ipcf.org.tw', 'public', 0, 0, null, '原住民族文化事業基金會', 'Indigenous Peoples Cultural Foundation (public)', ['teds2019'], false],
  ['nextapple', '壹蘋新聞網', 'Nextapple', 'nextapple.com', 'private', 0, 0, null, '壹蘋新聞網（潘杰賢）', 'Nextapple (Pan Chieh-hsien)', ['apple'], true],
  ['moneyudn', '經濟日報', 'Economic Daily News', 'money.udn.com', 'private', 1, 1, null, '聯合報系（王氏家族）', 'United Daily News Group (the Wang family)', ['group', 'xiao2006'], true],
  ['nownews', '今日新聞', 'NOWnews', 'nownews.com', 'private', -1, -1, null, '今日傳媒', 'NOWnews Network', ['mbfc-tw'], false],
  ['cnews', '匯流新聞網', 'CNEWS', 'cnews.com.tw', 'private', 0, 0, null, '匯流新聞網', 'CNEWS', ['stance'], true],
  ['cnyes', '鉅亨網', 'Anue', 'cnyes.com', 'private', 0, 0, null, '鉅亨網', 'Anue (cnyes)', ['stance'], true],
  ['ydn', '青年日報', 'Youth Daily News', 'ydn.com.tw', 'gov', 0, 0, null, '青年日報社（國防部）', 'Youth Daily News (Ministry of National Defense)', ['ydn'], true],
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
  ['latimes', '洛杉磯時報', 'Los Angeles Times', 'latimes.com', 'private', null, null, -1, '黃馨祥', 'Patrick Soon-Shiong', ['allsides'], false],
  ['bloomberg', '彭博', 'Bloomberg', 'bloomberg.com', 'private', null, null, -1, '彭博有限合夥企業', 'Bloomberg L.P.', ['allsides'], false],
  ['bi', 'Business Insider', 'Business Insider', 'businessinsider.com', 'private', null, null, -1, '施普林格', 'Axel Springer', ['allsides'], false],
  ['semafor', 'Semafor', 'Semafor', 'semafor.com', 'private', null, null, -1, 'Semafor', 'Semafor Inc.', ['allsides'], false],
  ['pbs', 'PBS', 'PBS NewsHour', 'pbs.org', 'public', null, null, -1, '美國公共電視', 'PBS (public)', ['allsides'], false],
  ['sky', '天空新聞', 'Sky News', 'news.sky.com', 'private', null, null, -1, '天空（康卡斯特）', 'Sky (Comcast)', ['allsides'], false],
  ['huffpost', '哈芬登郵報', 'HuffPost', 'huffpost.com', 'private', null, null, -2, 'BuzzFeed', 'BuzzFeed', ['allsides'], false],
  ['atlantic', '大西洋月刊', 'The Atlantic', 'theatlantic.com', 'private', null, null, -2, '鮑威爾．賈伯斯（愛默生集團）', 'Laurene Powell Jobs (Emerson Collective)', ['allsides'], false],
  ['reason', 'Reason', 'Reason', 'reason.com', 'nonprofit', null, null, 0, '理性基金會', 'Reason Foundation', ['allsides'], false],
  ['federalist', 'The Federalist', 'The Federalist', 'thefederalist.com', 'private', null, null, 2, 'FDRLST Media', 'FDRLST Media', ['allsides'], false],
  ['dailywire', 'Daily Wire', 'The Daily Wire', 'dailywire.com', 'private', null, null, 2, 'Daily Wire', 'The Daily Wire', ['allsides'], false],
  ['blaze', 'TheBlaze', 'TheBlaze', 'theblaze.com', 'private', null, null, 2, 'Blaze Media', 'Blaze Media', ['allsides'], false],
  ['dw', '德國之聲', 'DW', 'dw.com', 'public', null, null, 0, '德國公共國際廣播', 'Germany’s public international broadcaster', ['allsides'], false],
  ['f24', '法國 24', 'France 24', 'france24.com', 'public', null, null, 0, '法國公共國際媒體', 'France Médias Monde (public)', ['mbfc'], false],
  ['scmp', '南華早報', 'South China Morning Post', 'scmp.com', 'private', null, null, 0, '阿里巴巴', 'Alibaba', ['allsides'], false],
  ['nikkei', '日經亞洲', 'Nikkei Asia', 'asia.nikkei.com', 'private', null, null, 1, '日經', 'Nikkei', ['mbfc'], false],
  ['japantimes', '日本時報', 'The Japan Times', 'japantimes.co.jp', 'private', null, null, 0, 'News2u', 'News2u Holdings', ['allsides'], false],
  ['diplomat', '外交家', 'The Diplomat', 'thediplomat.com', 'private', null, null, 0, 'Diplomat Media', 'Diplomat Media', ['mbfc'], false],
  ['taipeitimes', '台北時報', 'Taipei Times', 'taipeitimes.com', 'private', -2, -2, 0, '自由時報集團', 'Liberty Times group', ['allsides', 'group', 'xiao2006'], false],
  ['globaltimes', '環球時報', 'Global Times', 'globaltimes.cn', 'state', null, 2, null, '人民日報社', 'People’s Daily (CCP)', ['state'], false],
  ['cgtn', 'CGTN', 'CGTN', 'cgtn.com', 'state', null, 2, null, '中央廣播電視總台', 'China Media Group (state)', ['state'], false],
  ['xinhua', '新華社', 'Xinhua', 'news.cn', 'state', null, 2, null, '中國國務院', 'China’s State Council', ['state'], false],
  // (11-10, Jay: the big ones missing. Places from AllSides, as of 2025–26.)
  ['cnn', 'CNN', 'CNN', 'cnn.com', 'private', null, null, -1, '華納兄弟探索', 'Warner Bros. Discovery', ['allsides'], false],
  ['reuters', '路透社', 'Reuters', 'reuters.com', 'private', null, null, 0, '湯森路透', 'Thomson Reuters', ['allsides'], false],
  ['ap', '美聯社', 'Associated Press', 'apnews.com', 'nonprofit', null, null, -2, '美聯社（各報的非營利合作社）', 'The AP (a not-for-profit cooperative)', ['allsides'], false],
  ['npr', 'NPR', 'NPR', 'npr.org', 'public', null, null, -1, '全國公共廣播（非營利）', 'National Public Radio (nonprofit)', ['allsides'], false],
  ['usatoday', '今日美國', 'USA Today', 'usatoday.com', 'private', null, null, -1, '甘尼特報業', 'Gannett', ['allsides'], false],
  ['msnow', 'MS NOW', 'MS NOW (MSNBC)', 'ms.now', 'private', null, null, -2, 'Versant（自康卡斯特分出）', 'Versant (spun off from Comcast)', ['allsides'], false],
  ['axios', 'Axios', 'Axios', 'axios.com', 'private', null, null, -1, '考克斯企業', 'Cox Enterprises', ['allsides'], false],
  ['cnbc', 'CNBC', 'CNBC', 'cnbc.com', 'private', null, null, 0, 'Versant（自康卡斯特分出）', 'Versant (spun off from Comcast)', ['allsides'], false],
  ['newsweek', '新聞週刊', 'Newsweek', 'newsweek.com', 'private', null, null, 0, '新聞週刊（Dev Pragad）', 'Newsweek (Dev Pragad)', ['allsides'], false],
  ['independent', '獨立報', 'The Independent', 'independent.co.uk', 'private', null, null, -1, '列別捷夫家族等', 'The Lebedev family and partners', ['allsides'], false],
  ['telegraph', '每日電訊報', 'The Telegraph', 'telegraph.co.uk', 'private', null, null, 1, '電訊傳媒集團', 'Telegraph Media Group', ['allsides'], true],
  ['washtimes', '華盛頓時報', 'The Washington Times', 'washingtontimes.com', 'private', null, null, 1, '統一教的 Operations Holdings', 'Operations Holdings (Unification Church)', ['allsides'], false],
  ['newsmax', 'Newsmax', 'Newsmax', 'newsmax.com', 'private', null, null, 2, 'Newsmax（Christopher Ruddy）', 'Newsmax Media (Christopher Ruddy)', ['allsides'], false],
  // (11-13, Jay: more outlets. AllSides' places as of 2025–26, else MBFC's.)
  ['focustw', '中央社英文', 'Focus Taiwan (CNA)', 'focustaiwan.tw', 'gov', 0, 0, -1, '國家通訊社（政府捐助）', 'National news agency (government-funded)', ['mbfc', 'cna'], false],
  ['vox', 'Vox', 'Vox', 'vox.com', 'private', null, null, -2, 'Vox Media', 'Vox Media', ['allsides'], false],
  ['intercept', 'The Intercept', 'The Intercept', 'theintercept.com', 'nonprofit', null, null, -2, 'The Intercept（非營利）', 'The Intercept (nonprofit)', ['allsides'], false],
  ['motherjones', 'Mother Jones', 'Mother Jones', 'motherjones.com', 'nonprofit', null, null, -2, '國家進步基金會（非營利）', 'Foundation for National Progress (nonprofit)', ['allsides'], false],
  ['slate', 'Slate', 'Slate', 'slate.com', 'private', null, null, -2, 'Graham Holdings', 'Graham Holdings', ['allsides'], false],
  ['beast', 'Daily Beast', 'The Daily Beast', 'thedailybeast.com', 'private', null, null, -2, 'IAC', 'IAC', ['allsides'], false],
  ['propublica', 'ProPublica', 'ProPublica', 'propublica.org', 'nonprofit', null, null, -1, 'ProPublica（非營利）', 'ProPublica (nonprofit)', ['allsides'], false],
  ['theweek', 'The Week', 'The Week', 'theweek.com', 'private', null, null, -1, 'Future plc', 'Future plc', ['allsides'], false],
  ['cbc', '加拿大廣播公司', 'CBC News', 'cbc.ca', 'public', null, null, -1, '加拿大公共媒體', 'Canada’s public broadcaster', ['allsides'], false],
  ['marketwatch', 'MarketWatch', 'MarketWatch', 'marketwatch.com', 'private', null, null, 0, '道瓊（新聞集團）', 'Dow Jones (News Corp)', ['allsides'], false],
  ['deseret', 'Deseret News', 'Deseret News', 'deseret.com', 'private', null, null, 0, '耶穌基督後期聖徒教會', 'The Church of Jesus Christ of Latter-day Saints', ['allsides'], false],
  ['kherald', '韓國先驅報', 'The Korea Herald', 'koreaherald.com', 'private', null, null, 0, '先驅媒體', 'Herald Media', ['allsides'], false],
  ['kyivind', '基輔獨立報', 'The Kyiv Independent', 'kyivindependent.com', 'private', null, null, 0, '員工持有', 'Owned by its staff', ['allsides'], false],
  ['moscowt', '莫斯科時報', 'The Moscow Times', 'themoscowtimes.com', 'private', null, null, 0, '莫斯科時報（流亡阿姆斯特丹）', 'The Moscow Times (in exile, Amsterdam)', ['allsides'], false],
  ['foxbiz', 'Fox Business', 'Fox Business', 'foxbusiness.com', 'private', null, null, 1, '福斯公司（梅鐸）', 'Fox Corporation (Murdoch)', ['allsides'], false],
  ['dispatch', 'The Dispatch', 'The Dispatch', 'thedispatch.com', 'private', null, null, 1, 'The Dispatch', 'The Dispatch Media', ['allsides'], false],
  ['epoch', '大紀元', 'The Epoch Times', 'theepochtimes.com', 'private', null, null, 1, '大紀元媒體集團（法輪功）', 'Epoch Media Group (Falun Gong)', ['allsides'], false],
  ['jtn', 'Just the News', 'Just the News', 'justthenews.com', 'private', null, null, 1, 'John Solomon', 'John Solomon', ['allsides'], false],
  ['beacon', 'Free Beacon', 'Washington Free Beacon', 'freebeacon.com', 'nonprofit', null, null, 2, '美國自由中心', 'Center for American Freedom', ['allsides'], false],
  ['townhall', 'Townhall', 'Townhall', 'townhall.com', 'private', null, null, 2, 'Salem Media', 'Salem Media Group', ['allsides'], false],
  ['amcon', 'The American Conservative', 'The American Conservative', 'theamericanconservative.com', 'nonprofit', null, null, 2, '美國理念研究所', 'American Ideas Institute', ['allsides'], false],
  ['abcau', '澳洲廣播公司', 'ABC News (Australia)', 'abc.net.au', 'public', null, null, -1, '澳洲公共媒體', 'Australia’s public broadcaster', ['mbfc'], false],
  ['hkfp', '香港自由新聞', 'Hong Kong Free Press', 'hongkongfp.com', 'nonprofit', null, null, -1, '香港自由新聞（非營利）', 'Hong Kong Free Press (nonprofit)', ['mbfc'], false],
  ['euronews', '歐洲新聞台', 'Euronews', 'euronews.com', 'private', null, null, -1, 'Alpac Capital', 'Alpac Capital', ['mbfc'], false],
  ['rappler', 'Rappler', 'Rappler', 'rappler.com', 'private', null, null, -1, 'Rappler', 'Rappler Holdings', ['mbfc'], false],
  ['cnasg', '亞洲新聞台', 'CNA (Singapore)', 'channelnewsasia.com', 'gov', null, null, 0, '新傳媒（淡馬錫）', 'Mediacorp (Temasek)', ['mbfc'], false],
  ['kyodo', '共同社', 'Kyodo News', 'kyodonews.net', 'nonprofit', null, null, 0, '共同通信社（非營利社團）', 'Kyodo News (a members’ cooperative)', ['mbfc'], false],
  ['asiatimes', '亞洲時報', 'Asia Times', 'asiatimes.com', 'private', null, null, 0, 'Asia Times Holdings', 'Asia Times Holdings', ['mbfc'], false],
  ['yonhap', '韓聯社', 'Yonhap', 'yna.co.kr', 'gov', null, null, 1, '聯合通訊社（政府出資）', 'Yonhap (government-funded)', ['mbfc'], false],
  ['straits', '海峽時報', 'The Straits Times', 'straitstimes.com', 'private', null, null, 1, '新報業媒體信託', 'SPH Media Trust', ['mbfc'], false]
];

// Taiwan's outlets come first in ROWS; the rest (from the BBC) are the English ones.
const TW_COUNT = ROWS.findIndex(r => r[0] === 'bbc');
export const OUTLETS = Object.fromEntries(
  ROWS.map(([id, zh, en, site, kind, tw, cs, lr, ownerZh, ownerEn, basis, weak], i) => [id, { id, zh, en, site, kind, tw, cs, lr, owner: { zh: ownerZh, en: ownerEn }, basis, weak, region: i < TW_COUNT ? 'tw' : 'intl' }])
);
export const outletOf = id => OUTLETS[id] || null;
// An outlet's mark: its site's own small icon (no picture of ours), through
// Google's icon service. Where Google has none for the outlet's site (it
// sends a grey globe), the address it does have: another of the outlet's
// hosts, or the site's own icon file (中視: Google knows no icon for it).
export const ICON_SITE = {
  pts: 'news.pts.org.tw',
  rti: 'www.rti.org.tw',
  ctv: 'https://www.ctv.com.tw/Cms_Data/Sites/CTV4/Files/images/favicon-32x32.ico',
  era: 'www.eracom.com.tw',
  titv: 'news.ipcf.org.tw',
  kherald: 'www.koreaherald.com'
};
export const outletIcon = (id, size = 64) => {
  if (!OUTLETS[id]) return '';
  const at = ICON_SITE[id] || OUTLETS[id].site;
  return at.startsWith('https://') ? at : `https://www.google.com/s2/favicons?domain=${at}&sz=${size}`;
};

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

// ---- Topics: what Orbit News covers -------------------------------------------
//
// A story is News' when it has a topic here: first the ones outlets take
// sides on (Jay, 11-10: politics in the wide sense, tech, the economy,
// society), then, from his 08:08 the same day, the kinds past the sides
// (life, health, science, culture, sport: `spectrum: false`, never
// one-sided); one with none (a game of Pokémon) isn't shown. `on: false`
// keeps a topic listed but off. A story's topics are those its headlines'
// words name (topicsOf), most named first.
const rx = (...parts) => new RegExp(parts.join('|'));
const rxi = (...parts) => new RegExp(`\\b(?:${parts.join('|')})\\b`, 'i');
export const TOPICS = [
  {
    id: 'pol', zh: '政治', en: 'Politics', on: true,
    zh_: rx('立法院|立委|行政院|政院|總統|賴清德|蕭美琴|卓榮泰|國民黨|民進黨|民眾黨|時代力量|藍白|藍綠|綠營|藍營|白營|綠委|藍委|白委|黨團|黨主席|黨部|朝野|選舉|大選|初選|選戰|參選|候選人|罷免|公投|議會|議員|議長|縣長|市長|縣府|市府|首長|內閣|部長|閣揆|政委|發言人|府方|修法|三讀|覆議|釋憲|倒閣|政黨|政治|政府|官員|民調|監察院|考試院|監委|總預算|施政|政見|國會|質詢|擬參選|角逐|提名|徵召|黨內|出馬|選區|選情|後援會|造勢|站台|競選|輔選',
      '鄭麗文|劉建國|黃國昌|柯文哲|朱立倫|蔣萬安|盧秀燕|侯友宜|沈伯洋|連勝文|柯志恩|陳其邁|黃偉哲|林佳龍|鄭文燦|韓國瑜|江啟臣|傅崐萁|王世堅|吳思瑤|林岱樺|賴士葆|翁曉玲|徐巧芯|謝國樑|高虹安|張善政|李四川|陳亭妃|王定宇|林右昌|管碧玲|劉世芳|陳時中|蘇巧慧|李彥秀|羅智強|洪孟楷|葉元之|黃珊珊|吳靜怡|張啟楷|卓冠廷|王鴻薇|苗博雅|蔡英文|馬英九'),
    en_: [rxi('Trump\\w*|Biden|Harris|Vance|Obama|Congress\\w*|Senate|Senators?|House (?:Speaker|Republicans?|Democrats?|GOP|votes?|passe[sd]|panel|committee|floor|majority)|Speaker|Republicans?|Democrats?|Dems?|GOP|MAGA|White House|elections?|electoral|midterms?|voters?|votes?|voting|ballots?|campaign\\w*|governors?|mayors?|parliament\\w*|prime minister|president\\w*|ministers?|government|gov\'t|shutdown|impeach\\w*|legislat\\w*|politic\\w*|polls?|administration|lawmakers?|cabinet|part(?:y|ies)|opposition|coalition|referendum|constitution\\w*|regime|officials?|liberals?|conservatives?|progressives?|left-wing|right-wing|woke|Labour|Tories|Mamdani|Newsom|Starmer|blue states?|red states?')]
  },
  {
    id: 'cs', zh: '兩岸', en: 'Cross-strait', zhAbroad: '中國', enAbroad: 'China', on: true,
    zh_: rx('中國(?!信託|醫藥|醫大|附醫|時報|石油|鋼鐵|人壽|科大|科技大學|文化大學|國民黨|砂輪|化學)|中共|大陸|陸委會|國台辦|解放軍|共軍|共機|共艦|北京|習近平|統戰|兩岸|台海|海峽|港澳|香港|中方|一中|九二共識|武統|和統|台獨|陸配|陸生|陸客|陸企|滲透|中資|廈門|福建|上海|廣東|深圳|小三通|進博會',
      '陸(?:新|外交部|官媒|國防部|海警|軍|方|媒|委會|稱|批|嗆|祭|宣布|海關|商務部|網|製)'),
    en_: [/\b(?:China|Chinese|Beijing|Xi|Taiwan\w*|Hong Kong|Taipei|PLA|CCP|Communist|Tibet\w*|Xinjiang|Uyghurs?|Macau|Shanghai|Shenzhen)\b/]
  },
  {
    id: 'world', zh: '國際', en: 'World', on: true,
    zh_: rx('外交|邦交|友邦|大使|代表處|駐美|駐日|AIT|川普|拜登|賀錦麗|萬斯|歐巴馬|美方|美軍|白宮|日方|高市|石破|北韓|朝鮮|金正恩|李在明|歐盟|烏克蘭|普丁|澤倫斯基|加薩|哈瑪斯|聯合國|世衛|WHO|APEC|G7|G20|北約|印太|梵蒂岡|教宗|美中|中美|台美|台日'),
    zhAt: rx('美國|美企|日本|韓國|南韓|歐洲|俄羅斯|俄國|以色列|伊朗|菲律賓|越南|印度|泰國|印尼|馬來西亞|新加坡|澳洲|英國|德國|法國|立陶宛|捷克|委內瑞拉|巴西|墨西哥|加拿大|中東|敘利亞|黎巴嫩|土耳其'),
    en_: [rxi('Ukrain\\w*|Putin|Zelensk\\w*|Gaza|Hamas|Hezbollah|Houthis?|United Nations|diplomat\\w*|summit|sanctions?|embass\\w*|foreign|Maduro|refugees?|Pope|Vatican|NATO|ASEAN|Kremlin|West Bank|Palestin\\w*'), /\b(?:UN|EU|G7|G20)\b/],
    enAt: [rxi('Russia\\w*|Israel\\w*|Iran\\w*|Syria\\w*|Lebanon|Yemen|European|Europe|Japan\\w*|Korea\\w*|India\\w*|Pakistan\\w*|Bangladesh\\w*|Venezuela\\w*|Mexic\\w*|Canad\\w*|Brazil\\w*|Africa\\w*|Sudan\\w*|Congo\\w*|German\\w*|France|French|Britain|British|Australia\\w*|Philippin\\w*|Vietnam\\w*|Indonesia\\w*|Thai\\w*|Myanmar|Afghan\\w*|Turk\\w*|Saudi\\w*|Qatar\\w*|Egypt\\w*|Argentin\\w*|Colombia\\w*|Cuba\\w*|Middle East|Poland|Polish|Nepal\\w*|Hungar\\w*|Ital\\w*|Spain|Spanish|Dutch|Netherlands|Swed\\w*|Norw\\w*|Danish|Denmark|Greenland|Ireland|Irish|Scot\\w*|Romania\\w*|Serbia\\w*|Greek|Greece|Chile\\w*|Peru\\w*|Ecuador\\w*|Haiti\\w*|Nigeria\\w*|Kenya\\w*|Ethiopia\\w*|Somalia\\w*|Libya\\w*|Iraq\\w*|Kurd\\w*|Armenia\\w*|Azerbaijan\\w*|Belarus\\w*|Uzbek\\w*|Kazakh\\w*|Moscow|Kyiv|Tehran|Jerusalem|Tokyo|Seoul|Pyongyang|Manila|Singapore\\w*|Malaysia\\w*|Cambodia\\w*|New Zealand|Brussels|Kashmir|international|global|world'), /\bUK\b/]
  },
  {
    id: 'def', zh: '國防', en: 'Defense', on: true,
    zh_: rx('國防|國軍|軍購|軍演|演習|漢光|飛彈|導彈|潛艦|海鯤|戰機|軍機|軍艦|艦艇|航艦|募兵|兵役|義務役|役男|後備|防空(?![污汙])|無人機|海巡|軍方|軍人|共諜|間諜|國安(?!基金)|網攻|核武|戰爭|武器|軍售|韌性|全社會防衛'),
    en_: [rxi('military|militar\\w*|Pentagon|Hegseth|troops|soldiers?|army|navy|naval|air force|missiles?|drones?|warships?|nuclear weapons?|nukes?|defen[cs]e|wars?|wartime|airstrikes?|ceasefire|truce|attack\\w*|spy|spies|espionage|intelligence|security|weapons?|arms|terror\\w*|bombs?|bombing|invasion|veterans?')]
  },
  {
    id: 'eco', zh: '經濟', en: 'Economy', on: true,
    zh_: rx('經濟|GDP|景氣|出口|進口|關稅|貿易|匯率|央行|升息|降息|利率|通膨|物價|油價|電價|水價|薪資|加薪|基本工資|最低工資|勞保|年金|退休金|稅|預算|財政|普發|補助|補貼|振興|紓困|股市|台股|美股|股價|國安基金|護盤|房價|房市|打房|囤房|信用管制|失業|就業|缺工|產業|外資|投資|供應鏈|消費|零售|內需|營收|財報|經濟部|金管會|證交所|銀行|保險|壽險|台幣|美元|漲價|企業|台商|鴻海|侵權|337'),
    en_: [rxi('econom\\w*|tariffs?|trade|trading|inflation|prices?|pricing|Fed|Federal Reserve|interest rates?|rates|jobs|jobless|unemployment|wages?|budget\\w*|tax|taxes|taxpayers?|debt|deficit|stocks?|markets?|Wall Street|recession|GDP|banks?|banking|housing|rent|mortgages?|oil|SNAP|Medicaid|Medicare|Social Security|earnings|profits?|revenue|investors?|investment|billion|trillion|dollar|currency|exports?|imports?|layoffs?|retail|consumers?|spending|costs?|affordab\\w*|insurance|compan(?:y|ies)|business\\w*|industr\\w*|CEO|bonds?|crypto\\w*|bitcoin|auto\\w*|manufactur\\w*')],
    enAt: [rxi('plants?|factor(?:y|ies)')]
  },
  {
    id: 'tech', zh: '科技', en: 'Tech', on: true,
    zh_: rx('\\bAI\\b|人工智慧|生成式|晶片|半導體|台積電|聯發科|輝達|NVIDIA|黃仁勳|資安|駭客|個資|隱私|數位|抖音|TikTok|小紅書|臉書|Meta|Google|谷歌|蘋果公司|Apple|微軟|OpenAI|ChatGPT|演算法|衛星|太空|火箭|機器人|電動車|特斯拉|馬斯克|科技|假訊息|5G|量子|伺服器|資料中心|算力|自駕|光刻機|網路平台|社群平台|數位平台|電商|網購|網路安全'),
    en_: [/\b(?:AI|A\.I\.)\b/, rxi('artificial intelligence|chips?|chipmakers?|semiconductors?|Nvidia|TSMC|OpenAI|ChatGPT|Anthropic|Google|Alphabet|Apple|Meta|Facebook|Instagram|Microsoft|Amazon|TikTok|Musk|Elon|Tesla|SpaceX|tech|technology|cyber\\w*|hack\\w*|privacy|social media|data cent(?:er|re)s?|robot\\w*|satellites?|space|rockets?|quantum|algorithm\\w*|online|internet|digital|smartphones?|EVs?|electric vehicles?|self-driving')]
  },
  {
    id: 'energy', zh: '能源', en: 'Energy', on: true,
    zh_: rx('能源|核電|核能|核一|核二|核三|核四|核廢|再生能源|綠能|綠電|風電|光電|太陽能|缺電|停電|限電|台電|電網|電力|燃煤|天然氣|中油|碳費|碳排|淨零|氣候|暖化|減碳|環境部|環保|空污|空氣品質|塑膠|污染|汙染|環評|生態|保育|水庫|缺水'),
    en_: [rxi('climate|emissions?|carbon|COP\\d*|renewables?|solar|wind (?:power|farms?|turbines?)|nuclear (?:power|plants?|energy)|energy|oil|gas|coal|electricity|power grid|grid|environment\\w*|pollution|EPA|wildfires?|drought|smog|air quality|heat ?waves?|fossil fuels?|net zero')]
  },
  {
    id: 'law', zh: '司法', en: 'Justice', on: true,
    zh_: rx('法院|地院|高院|最高法院|憲法法庭|大法官|法官|起訴|判決|判刑|判處|宣判|無罪|有罪|定讞|上訴|羈押|收押|交保|聲押|檢察|檢方|地檢|北檢|偵辦|偵查|搜索|約談|調查局|廉政署|貪污|貪汙|收賄|行賄|賄選|圖利|洗錢|詐騙|詐團|詐欺|命案|死刑|極刑|速審|司法|法務部|律師|訴訟|提告|違憲|合憲|釋字|法案|條例|新制|修正'),
    en_: [rxi('courts?|judges?|justices?|Supreme Court|trials?|lawsuits?|sued|sues|suing|rulings?|ruled|indict\\w*|charged|charges|prosecut\\w*|DOJ|Justice Department|FBI|attorneys? general|police|arrest\\w*|convict\\w*|sentenc\\w*|prison|jail\\w*|crimes?|criminal|murder\\w*|shootings?|death penalty|execution|pardon\\w*|legal|laws?|lawyers?|investigat\\w*|probe|fraud|bribery|corruption')]
  },
  {
    id: 'soc', zh: '社會', en: 'Society', on: true,
    zh_: rx('教育|課綱|學校|校園|少子化|生育|育兒|托育|長照|勞工|勞動部|移工|工時|過勞|罷工|工會|同婚|性別|性平|性騷|性侵|人權|原住民|新住民|移民|住宅|社宅|租屋|交通部|捷運|高鐵|台鐵|公車|交通安全|行人|酒駕|食安|消費者|動保|工安|公安|毒品|治安|警政|長者|身障|兒少|虐童|霸凌|自殺|貧窮|弱勢|社福|社會|人口|出生率|高齡|青年|婚姻|家暴'),
    en_: [/\b(?:ICE|FAA|FEMA)\b/, rxi('immigra\\w*|migrants?|migration|deport\\w*|border|asylum|abortion|schools?|education|universit\\w*|colleges?|students?|teachers?|guns?|Glock|LGBTQ\\w*|transgender|gay|women|gender|race|racial|racism|civil rights|protest\\w*|strikes?|unions?|workers|labou?r|homeless\\w*|poverty|welfare|food|children|famil(?:y|ies)|religio\\w*|church\\w*|Muslims?|Jewish|antisemit\\w*|drugs?')],
  },
  // The kinds past the sides (Jay 11-10, 08:08: "expand to support more
  // kinds of news and let spectrum be one feature"): shown, ranked lighter
  // where they'd crowd the front (`weight`), never counted as one-sided.
  {
    id: 'life', zh: '生活', en: 'Life', on: true, spectrum: false,
    zh_: rx('天氣|氣象|颱風|豪雨|大雨|暴雨|寒流|冷氣團|東北季風|低溫|高溫|熱浪|乾旱|地震|海嘯|停班停課|塞車|車潮|國道|連假|疏運|返鄉|班機|航班|機場|觀光|旅遊|旅客|遊客|火災|火警|大火|惡火|起火|爆炸|氣爆|車禍|追撞|相撞|撞死|撞上|翻覆|墜機|墜落|溺水|失蹤|搜救|罹難|停水|垃圾|回收|寵物|流浪狗|流浪貓|動物|外送|菜價|蛋價|房租|超商|百貨|夜市|郵局|垃圾車|天然災害|災情'),
    en_: [rxi('weather|storms?|hurricanes?|typhoons?|tornado\\w*|earthquakes?|tsunami|floods?|flooding|wildfires?|fires?|blaze|heat ?waves?|snow\\w*|blizzard|drought|disasters?|crash\\w*|collision|derail\\w*|accidents?|explosions?|rescue\\w*|travel\\w*|tourism|tourists?|airlines?|flights?|airports?|traffic|holiday\\w*|consumers?|shoppers?|recalls?|pets?|animals?|zoo')]
  },
  {
    id: 'health', zh: '健康', en: 'Health', on: true, spectrum: false,
    zh_: rx('健康|醫療|醫護|醫界|醫學|醫師荒|護理|手術|開刀|治療|癌|腫瘤|糖尿病|高血壓|心臟|中風|失智|疫苗|流感|新冠|COVID|確診|登革熱|疫情|腸病毒|猴痘|麻疹|傳染|感染|健保|衛福部|疾管署|食藥署|藥品|藥物|用藥|長照|心理健康|憂鬱|睡眠|肥胖|減重|器官'),
    en_: [/\b(?:FDA|CDC|WHO|GLP-1)\b/, rxi('health\\w*|hospitals?|doctors?|nurses?|patients?|cancers?|tumou?rs?|diabetes|heart|strokes?|dementia|Alzheimer\\w*|vaccin\\w*|flu|COVID|virus\\w*|outbreaks?|diseases?|infections?|measles|medic\\w*|surgery|mental health|depression|obesity|Ozempic|weight loss|nutrition|sleep')]
  },
  {
    id: 'sci', zh: '科學', en: 'Science', on: true, spectrum: false,
    zh_: rx('科學|研究團隊|研究人員|研究發現|新研究|論文|期刊|中研院|國科會|太空|NASA|天文|行星|彗星|流星|星系|黑洞|月球|登月|火星|恐龍|化石|考古|基因|DNA|物種|新種|演化|物理|化學|數學|諾貝爾|實驗室|望遠鏡|小行星|極光|日食|月食'),
    en_: [/\b(?:NASA|DNA)\b/, rxi('scien\\w*|researchers?|study|studies|space|astronaut\\w*|astronom\\w*|planet\\w*|galax\\w*|black holes?|moon|lunar|Mars|comets?|asteroids?|meteor\\w*|telescopes?|dinosaurs?|fossils?|archaeolog\\w*|species|evolution\\w*|genes?|genetic\\w*|genom\\w*|physics|chemistry|Nobel|eclipse|aurora')]
  },
  {
    id: 'culture', zh: '文化', en: 'Culture', on: true, spectrum: false, weight: 0.8,
    zh_: rx('文化|藝術|藝文|展覽|特展|博物館|美術館|故宮|音樂會|交響|國家劇院|劇場|舞蹈|戲劇|電影|影展|金馬|金鐘|金曲|奧斯卡|坎城|導演|紀錄片|文學|作家|詩人|小說|出版|書展|圖書|書店|閱讀|台語|客語|族語|文資|古蹟|宗教|媽祖|佛教|節慶|祭典|建築|動畫|漫畫'),
    en_: [rxi('arts?|artists?|museums?|exhibit\\w*|galler(?:y|ies)|films?|movies?|cinema|Oscars?|Cannes|directors?|documentar\\w*|music|musicians?|albums?|concerts?|orchestra|novel\\w*|books?|authors?|writers?|poets?|poetry|literature|theat(?:er|re)|Broadway|festivals?|culture|cultural|heritage|architect\\w*|anime|manga|video games?|religio\\w*|church\\w*')]
  },
  {
    id: 'sport', zh: '運動', en: 'Sport', on: true, spectrum: false, weight: 0.6,
    zh_: rx('運動員|選手|球員|球隊|教練|賽事|奪冠|冠軍|金牌|銀牌|銅牌|奧運|帕運|亞運|世大運|全運會|經典賽|世界盃|12強|中華隊|中職|日職|韓職|美職|大聯盟|MLB|NBA|NFL|NHL|PLG|TPBL|P\\.?LEAGUE|棒球|籃球|足球|網球|羽球|桌球|排球|高爾夫|田徑|游泳|舉重|跆拳|柔道|拳擊|射箭|自由車|馬拉松|鐵人|F1|賽車|大谷'),
    en_: [/\b(?:NBA|NFL|MLB|NHL|FIFA|UEFA|F1)\b/, rxi('sports?|athletes?|coach(?:es)?|tournaments?|championships?|medals?|Olympic\\w*|Paralympic\\w*|World Cup|Premier League|soccer|football|basketball|baseball|tennis|golf|cricket|rugby|boxing|marathon|Formula 1|Super Bowl|World Series|playoffs?|Wimbledon')]
  }
];
// A story's topics (ids, most named first): the one named most (by a
// quarter of its headlines at least), then those 40% name, three at most; [] when none (not News'). Some
// words (`zhAt`, `enAt`: a place abroad, a storm, a factory) name a topic
// only beside another: a fire in Turkey has no sides, Japan's central bank
// has (Jay, 11-10).
export const SECOND = 0.4;
export function topicsOf(texts, lang = 'zh') {
  const list = texts.map(String);
  const need = Math.max(1, list.length / 4);
  const hits = [];
  const near = [];
  for (const t of TOPICS) {
    if (!t.on) continue;
    const words = lang === 'en' ? t.en_ : [t.zh_];
    const at = (lang === 'en' ? t.enAt : t.zhAt && [t.zhAt]) || [];
    const n = list.filter(s => words.some(re => re.test(s))).length;
    const m = list.filter(s => [...words, ...at].some(re => re.test(s))).length;
    if (n >= need) hits.push([t.id, m]);
    else if (m >= need) near.push([t.id, m]);
  }
  // (The first is what it's about; another only where 40% of its headlines
  // name it: a doctor's car crash isn't 健康, Jay 11-10.)
  const ranked = (hits.length ? [...hits, ...near] : []).sort((a, b) => b[1] - a[1]);
  return ranked.filter(([, m], i) => !i || m >= list.length * SECOND).slice(0, 3).map(([id]) => id);
}
// A topic's name: region 'intl' takes its own where it has one (中國, not 兩岸).
export function topicWord(id, lang = 'zh', region = 'tw') {
  const t = TOPICS.find(x => x.id === id);
  if (!t) return '';
  if (region === 'intl') return (lang === 'en' ? t.enAbroad : t.zhAbroad) || (lang === 'en' ? t.en : t.zh);
  return lang === 'en' ? t.en : t.zh;
}

// A name in the news (News' 你關心的, Securities' 持股新聞): Chinese names as
// written (2 characters at least), English ones as whole words (5 letters at
// least: "Heat" is a word), a Taiwan stock's code only standing alone. A
// RegExp, or null when no word is long enough to match by chance.
const latinWord = w => /^[\x20-\x7e]+$/.test(w);
const escRe = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function namesRe(words = [], codes = []) {
  const ws = [...new Set(words.filter(Boolean).map(String))];
  const zh = ws.filter(w => !latinWord(w) && w.length >= 2);
  const en = ws.filter(w => latinWord(w) && w.length >= 5 && !/^\d+$/.test(w));
  const cs = codes.filter(c => /^\d{4,6}$/.test(c || ''));
  const parts = [...zh.map(escRe), ...en.map(w => `\\b${escRe(w)}\\b`), ...cs.map(c => `(?<!\\d)${c}(?!\\d)`)];
  return parts.length ? new RegExp(parts.join('|'), 'i') : null;
}
// The headlines a story is known by (news/index.json's): its own and each outlet's.
export const storyText = story => [story?.title, story?.zh, ...(story?.items || []).map(it => it[1]), ...(story?.tw?.items || []).map(it => it[1])].filter(Boolean).join('\n');

// 各方怎麼說's one difference, said again as each side's line (Jay 11-10: AI
// repeating what's on screen is for nothing): it names three sides, or
// quotes a 「word」 a side's own line already quotes.
export function sidesRecap(diff, lines = []) {
  const d = String(diff || '');
  if (!d) return false;
  const named = [/綠/, /藍/, /中間|中立|centre|center/i, /左/, /右/].filter(re => re.test(d)).length;
  if (named >= 3) return true;
  const quotes = d.match(/「[^」]{1,12}」/g) || [];
  return quotes.some(q => lines.some(l => String(l || '').includes(q)));
}
