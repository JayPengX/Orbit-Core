// Taiwan's outlets on the world's stories (Jay 11-10: "international news …
// no Taiwan news outlet"): a Chinese headline about the world, put in the
// English words its story's headlines use, so the builder can find that
// story without a translator (builders/news.js taiwanOn). Names, places,
// bodies and the nouns world news turns on; a word missing just matches
// less. Never shown: the reader sees the outlet's own headline.

// Names: places, people, bodies (a match needs one of these shared).
export const NAMES = {
  美國: 'american', 美方: 'american', 美軍: 'military american', 白宮: 'white house', 華府: 'washington', 華盛頓: 'washington', 紐約: 'new york', 加州: 'california', 德州: 'texas', 佛州: 'florida', 佛羅里達: 'florida', 芝加哥: 'chicago', 洛杉磯: 'los angeles', 舊金山: 'san francisco', 夏威夷: 'hawaii', 阿拉斯加: 'alaska',
  中國: 'china chinese', 中共: 'china communist', 北京: 'beijing', 上海: 'shanghai', 香港: 'hong kong', 澳門: 'macau', 新疆: 'xinjiang', 西藏: 'tibet', 台海: 'taiwan strait', 南海: 'south china sea', 解放軍: 'pla military', 共軍: 'pla military', 共機: 'pla aircraft', 共艦: 'pla warships',
  日本: 'japan japanese', 東京: 'tokyo', 沖繩: 'okinawa', 大阪: 'osaka', 南韓: 'south korea korean', 韓國: 'south korea korean', 首爾: 'seoul', 北韓: 'north korea korean', 朝鮮: 'north korea korean', 平壤: 'pyongyang',
  俄羅斯: 'russia russian', 俄國: 'russia russian', 俄軍: 'russian troops', 莫斯科: 'moscow', 克里姆林宮: 'kremlin', 烏克蘭: 'ukraine ukrainian', 烏軍: 'ukrainian troops', 基輔: 'kyiv', 克里米亞: 'crimea',
  英國: 'britain british', 倫敦: 'london', 法國: 'france french', 巴黎: 'paris', 德國: 'germany german', 柏林: 'berlin', 義大利: 'italy italian', 西班牙: 'spain spanish', 波蘭: 'poland polish', 荷蘭: 'netherlands dutch', 比利時: 'belgium', 瑞士: 'switzerland swiss', 瑞典: 'sweden swedish', 挪威: 'norway', 芬蘭: 'finland', 丹麥: 'denmark danish', 格陵蘭: 'greenland', 愛爾蘭: 'ireland irish', 希臘: 'greece greek', 匈牙利: 'hungary hungarian', 捷克: 'czech', 立陶宛: 'lithuania', 羅馬尼亞: 'romania', 塞爾維亞: 'serbia', 土耳其: 'turkey turkish', 歐洲: 'europe european', 梵蒂岡: 'vatican',
  以色列: 'israel israeli', 加薩: 'gaza', 約旦河西岸: 'west bank', 巴勒斯坦: 'palestinian', 耶路撒冷: 'jerusalem', 伊朗: 'iran iranian', 德黑蘭: 'tehran', 黎巴嫩: 'lebanon', 敘利亞: 'syria syrian', 伊拉克: 'iraq', 沙烏地: 'saudi', 卡達: 'qatar', 阿聯: 'uae emirates', 杜拜: 'dubai', 葉門: 'yemen', 埃及: 'egypt', 中東: 'middle east',
  印度: 'india indian', 巴基斯坦: 'pakistan', 孟加拉: 'bangladesh', 阿富汗: 'afghanistan', 尼泊爾: 'nepal', 斯里蘭卡: 'sri lanka', 菲律賓: 'philippines philippine', 馬尼拉: 'manila', 越南: 'vietnam', 泰國: 'thailand thai', 柬埔寨: 'cambodia', 緬甸: 'myanmar', 印尼: 'indonesia', 馬來西亞: 'malaysia', 新加坡: 'singapore', 澳洲: 'australia australian', 紐西蘭: 'new zealand',
  加拿大: 'canada canadian', 墨西哥: 'mexico mexican', 巴西: 'brazil', 阿根廷: 'argentina', 委內瑞拉: 'venezuela', 哥倫比亞: 'colombia', 古巴: 'cuba', 智利: 'chile', 秘魯: 'peru', 海地: 'haiti', 巴拿馬: 'panama',
  非洲: 'africa african', 南非: 'south africa', 奈及利亞: 'nigeria', 蘇丹: 'sudan', 剛果: 'congo', 衣索比亞: 'ethiopia', 肯亞: 'kenya', 利比亞: 'libya',
  川普: 'trump', 拜登: 'biden', 賀錦麗: 'harris', 萬斯: 'vance', 盧比歐: 'rubio', 赫格塞斯: 'hegseth', 貝森特: 'bessent', 盧特尼克: 'lutnick', 李維特: 'leavitt', 馬斯克: 'musk', 歐巴馬: 'obama', 紐森: 'newsom', 曼達尼: 'mamdani', 艾普斯坦: 'epstein', 習近平: 'jinping', 李強: 'qiang', 王毅: 'wang', 普丁: 'putin', 澤倫斯基: 'zelensky', 納坦雅胡: 'netanyahu', 高市早苗: 'takaichi', 石破: 'ishiba', 李在明: 'lee jae-myung', 金正恩: 'kim jong', 莫迪: 'modi', 施凱爾: 'starmer', 施紀賢: 'starmer', 馬克宏: 'macron', 梅爾茨: 'merz', 梅茲: 'merz', 卡尼: 'carney', 艾班尼斯: 'albanese', 魯拉: 'lula', 米雷伊: 'milei', 馬杜洛: 'maduro', 艾爾段: 'erdogan', 哈米尼: 'khamenei', 小馬可仕: 'marcos', 馬可仕: 'marcos', 杜特蒂: 'duterte', 安華: 'anwar', 普拉伯沃: 'prabowo', 雪恩鮑姆: 'sheinbaum', 奧班: 'orban', 梅洛尼: 'meloni', 古特瑞斯: 'guterres', 教宗: 'pope', 良十四世: 'leo', 黃仁勳: 'jensen huang', 庫克: 'cook', 祖克柏: 'zuckerberg', 奧特曼: 'altman',
  聯合國: 'united nations', 安理會: 'security council', 北約: 'nato', 歐盟: 'european union', 世衛: 'world health', 世界衛生組織: 'world health', 世貿: 'wto', 東協: 'asean', 七大工業國: 'g7', 二十國集團: 'g20', 聯準會: 'fed federal reserve', 國會: 'congress parliament', 參議院: 'senate', 參院: 'senate', 眾議院: 'house', 眾院: 'house', 共和黨: 'republicans', 民主黨: 'democrats', 五角大廈: 'pentagon', 國務院: 'state department', 國防部: 'defense', 司法部: 'justice department', 聯邦調查局: 'fbi', 移民局: 'immigration', 中情局: 'cia', 最高法院: 'supreme court', 哈瑪斯: 'hamas', 真主黨: 'hezbollah', 胡塞: 'houthis', 塔利班: 'taliban', 輝達: 'nvidia', 台積電: 'tsmc', 蘋果: 'apple', 微軟: 'microsoft', 谷歌: 'google', 亞馬遜: 'amazon', 特斯拉: 'tesla', 波音: 'boeing', 英特爾: 'intel', 三星: 'samsung', 豐田: 'toyota', 字節跳動: 'bytedance', 抖音: 'tiktok', 臉書: 'facebook', 推特: 'twitter',
};
// What world news turns on.
const THINGS = {
  台灣: 'taiwan', 臺灣: 'taiwan',
  // (Not what they look like: 韓國瑜 is Taiwan's Speaker, not Korea.)
  韓國瑜: '', 美國隊長: '', 日本料理: '', 法國麵包: '',
  關稅: 'tariffs', 貿易: 'trade', 貿易戰: 'trade war', 協議: 'deal agreement', 協定: 'agreement', 談判: 'talks', 會談: 'talks', 會晤: 'meeting', 峰會: 'summit', 訪問: 'visit', 出訪: 'visit', 制裁: 'sanctions', 出口管制: 'export controls', 稀土: 'rare earths', 晶片: 'chips', 半導體: 'semiconductors', 人工智慧: 'artificial intelligence',
  停火: 'ceasefire', 休戰: 'truce', 和平: 'peace', 和談: 'peace talks', 戰爭: 'war', 開戰: 'war', 空襲: 'airstrikes strikes', 轟炸: 'bombing', 攻擊: 'attack', 襲擊: 'attack', 飛彈: 'missile', 導彈: 'missile', 無人機: 'drone', 核武: 'nuclear weapons', 核子: 'nuclear', 核電: 'nuclear', 軍演: 'military drills', 演習: 'drills', 軍艦: 'warship', 航艦: 'aircraft carrier', 戰機: 'fighter jets', 部隊: 'troops', 士兵: 'soldiers', 人質: 'hostages', 難民: 'refugees', 平民: 'civilians', 入侵: 'invasion',
  選舉: 'election', 大選: 'election', 期中選舉: 'midterms', 投票: 'vote voters', 公投: 'referendum', 總統: 'president', 副總統: 'vice president', 總理: 'prime minister', 首相: 'prime minister', 外長: 'foreign minister', 國務卿: 'secretary state', 國防部長: 'defense secretary', 州長: 'governor', 市長: 'mayor', 議員: 'lawmakers', 彈劾: 'impeach', 辭職: 'resign', 下台: 'resign', 政變: 'coup', 抗議: 'protest', 示威: 'protest', 罷工: 'strike', 暴動: 'riot',
  政府關門: 'government shutdown', 停擺: 'shutdown', 預算: 'budget', 法案: 'bill', 行政命令: 'executive order', 移民: 'immigration migrants', 非法移民: 'illegal immigrants', 遣返: 'deportation', 驅逐: 'deport', 邊境: 'border', 簽證: 'visa', 庇護: 'asylum', 槍擊: 'shooting', 槍手: 'gunman', 槍枝: 'guns', 爆炸: 'explosion blast', 恐攻: 'terror attack', 逮捕: 'arrested', 被捕: 'arrested', 起訴: 'charged', 判決: 'ruling', 判刑: 'sentenced', 審判: 'trial', 法官: 'judge', 赦免: 'pardon', 調查: 'investigation probe', 間諜: 'spy',
  地震: 'earthquake quake', 海嘯: 'tsunami', 颶風: 'hurricane', 颱風: 'typhoon', 洪水: 'flood flooding', 水災: 'floods', 野火: 'wildfire', 山火: 'wildfire', 火災: 'fire', 大火: 'fire blaze', 熱浪: 'heat wave', 暴風雪: 'snowstorm', 墜機: 'plane crash', 空難: 'plane crash', 客機: 'plane', 列車: 'train', 出軌: 'derailed', 死亡: 'dead killed', 喪生: 'killed', 罹難: 'killed', 身亡: 'dead', 失蹤: 'missing',
  油價: 'oil prices', 原油: 'crude oil', 股市: 'stocks', 美股: 'wall street stocks', 道瓊: 'dow', 那斯達克: 'nasdaq', 降息: 'rate cut', 升息: 'rate hike', 利率: 'rates', 通膨: 'inflation', 物價: 'prices', 經濟: 'economy', 衰退: 'recession', 就業: 'jobs', 失業: 'unemployment', 美元: 'dollar', 比特幣: 'bitcoin', 黃金: 'gold', 金價: 'gold price', 財報: 'earnings', 收購: 'deal acquisition', 併購: 'merger', 裁員: 'layoffs',
  出口: 'exports', 進口: 'imports', 順差: 'surplus', 逆差: 'deficit', 兆美元: 'trillion', 億美元: 'billion', 執行長: 'ceo', 董事長: 'chairman', 外遇: 'affair', 婚外情: 'affair', 醜聞: 'scandal', 新聞秘書: 'press secretary', 發言人: 'spokesperson', 盟友: 'allies', 盟國: 'allies', 軍援: 'military aid', 援助: 'aid', 撤軍: 'troops withdrawal', 撤離: 'evacuate', 封鎖: 'blockade', 演練: 'drills', 船艦: 'ships', 艦艇: 'ships', 海警: 'coast guard', 走私: 'smuggling', 資料中心: 'data centers', 電動車: 'electric vehicles', 機器人: 'robots', 刺殺: 'assassination', 暗殺: 'assassination', 遇刺: 'assassination', 綁架: 'kidnapped', 謀殺: 'murder', 受傷: 'injured', 傷亡: 'casualties', 沉船: 'sank', 船難: 'shipwreck', 火山: 'volcano', 噴發: 'eruption', 土石流: 'landslide', 山崩: 'landslide', 停電: 'blackout', 訴訟: 'lawsuit', 禁令: 'ban', 上訴: 'appeal', 大學: 'university', 留學生: 'students', 哈佛: 'harvard', 鋼鐵: 'steel', 工廠: 'plant factory', 礦坑: 'mine', 監獄: 'prison', 越獄: 'escape prison',
  疫苗: 'vaccine', 病毒: 'virus', 疫情: 'outbreak', 麻疹: 'measles', 禽流感: 'bird flu', 太空: 'space', 火箭: 'rocket', 衛星: 'satellite', 登月: 'moon', 氣候: 'climate', 諾貝爾: 'nobel', 奧運: 'olympics', 世界盃: 'world cup'
};

const WORDS = { ...NAMES, ...THINGS };
// Longest first, so 世界衛生組織 wins over 世界.
const KEYS = Object.keys(WORDS).sort((a, b) => b.length - a.length);
const RX = new RegExp(KEYS.join('|'), 'g');

// A Chinese headline in the English words of what it names, '' when it names
// nothing here; numbers of three digits or more carried over as they are.
export function enOf(title) {
  const s = String(title || '');
  const words = [...s.matchAll(RX)].map(m => WORDS[m[0]]).filter(Boolean);
  if (!words.length) return '';
  const nums = s.match(/\d{3,}/g) || [];
  return [...words, ...nums].join(' ');
}
