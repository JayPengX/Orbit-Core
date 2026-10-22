// Teams in Chinese, as Taiwan writes them, for Orbit Sports and Play alike
// (both load it from the kit, #kit/names.mjs). The American leagues are city + nickname (the lottery writes both,
// "匹茲堡海盜"; a row has room for the nickname, "海盜"); clubs elsewhere one
// name, whatever competition they play in. Also how ELTA's schedule is
// matched to games (its titles use these names).
import { normalizeTeamName } from '#kit/logos.mjs';

// A name as it's compared: accents off, lower case, trimmed ("Pérez",
// "PEREZ " and "Pérez" are one man; Rønnow is Ronnow, Müller Muller).
// Every match by name, in every app, goes through this one.
export function fold(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // The letters NFKD doesn't take apart.
    .replace(/[øœæßđðłıþ]/g, c => ({ ø: 'o', œ: 'oe', æ: 'ae', ß: 'ss', đ: 'd', ð: 'd', ł: 'l', ı: 'i', þ: 'th' })[c])
    .trim();
}

// [city, nickname] by ESPN's (and the lottery's) English name.
const US = {
  mlb: {
    'Arizona Diamondbacks': ['亞歷桑那', '響尾蛇'], Athletics: ['', '運動家'], 'Oakland Athletics': ['奧克蘭', '運動家'], 'Atlanta Braves': ['亞特蘭大', '勇士'], 'Baltimore Orioles': ['巴爾的摩', '金鶯'],
    'Boston Red Sox': ['波士頓', '紅襪'], 'Chicago Cubs': ['芝加哥', '小熊'], 'Chicago White Sox': ['芝加哥', '白襪'], 'Cincinnati Reds': ['辛辛那堤', '紅人'], 'Cleveland Guardians': ['克里夫蘭', '守護者'],
    'Colorado Rockies': ['科羅拉多', '洛磯'], 'Detroit Tigers': ['底特律', '老虎'], 'Houston Astros': ['休士頓', '太空人'], 'Kansas City Royals': ['堪薩斯', '皇家'], 'Los Angeles Angels': ['洛杉磯', '天使'],
    'Los Angeles Dodgers': ['洛杉磯', '道奇'], 'Miami Marlins': ['邁阿密', '馬林魚'], 'Milwaukee Brewers': ['密爾瓦基', '釀酒人'], 'Minnesota Twins': ['明尼蘇達', '雙城'], 'New York Mets': ['紐約', '大都會'],
    'New York Yankees': ['紐約', '洋基'], 'Philadelphia Phillies': ['費城', '費城人'], 'Pittsburgh Pirates': ['匹茲堡', '海盜'], 'San Diego Padres': ['聖地牙哥', '教士'], 'San Francisco Giants': ['舊金山', '巨人'],
    'Seattle Mariners': ['西雅圖', '水手'], 'St. Louis Cardinals': ['聖路易', '紅雀'], 'Tampa Bay Rays': ['坦帕灣', '光芒'], 'Texas Rangers': ['德州', '遊騎兵'], 'Toronto Blue Jays': ['多倫多', '藍鳥'], 'Washington Nationals': ['華盛頓', '國民']
  },
  nba: {
    'Atlanta Hawks': ['亞特蘭大', '老鷹'], 'Boston Celtics': ['波士頓', '塞爾提克'], 'Brooklyn Nets': ['布魯克林', '籃網'], 'Charlotte Hornets': ['夏洛特', '黃蜂'], 'Chicago Bulls': ['芝加哥', '公牛'],
    'Cleveland Cavaliers': ['克里夫蘭', '騎士'], 'Dallas Mavericks': ['達拉斯', '獨行俠'], 'Denver Nuggets': ['丹佛', '金塊'], 'Detroit Pistons': ['底特律', '活塞'], 'Golden State Warriors': ['金州', '勇士'],
    'Houston Rockets': ['休士頓', '火箭'], 'Indiana Pacers': ['印第安納', '溜馬'], 'LA Clippers': ['洛杉磯', '快艇'], 'Los Angeles Clippers': ['洛杉磯', '快艇'], 'Los Angeles Lakers': ['洛杉磯', '湖人'],
    'Memphis Grizzlies': ['曼菲斯', '灰熊'], 'Miami Heat': ['邁阿密', '熱火'], 'Milwaukee Bucks': ['密爾瓦基', '公鹿'], 'Minnesota Timberwolves': ['明尼蘇達', '灰狼'], 'New Orleans Pelicans': ['紐奧良', '鵜鶘'],
    'New York Knicks': ['紐約', '尼克'], 'Oklahoma City Thunder': ['奧克拉荷馬', '雷霆'], 'Orlando Magic': ['奧蘭多', '魔術'], 'Philadelphia 76ers': ['費城', '76 人'], 'Phoenix Suns': ['鳳凰城', '太陽'],
    'Portland Trail Blazers': ['波特蘭', '拓荒者'], 'Sacramento Kings': ['沙加緬度', '國王'], 'San Antonio Spurs': ['聖安東尼奧', '馬刺'], 'Toronto Raptors': ['多倫多', '暴龍'], 'Utah Jazz': ['猶他', '爵士'], 'Washington Wizards': ['華盛頓', '巫師'],
    // A preseason guest from outside the league (2026-10: the Trail Blazers').
    'London Lions': ['倫敦', '雄獅']
  },
  wnba: {
    'Atlanta Dream': ['亞特蘭大', '夢想'], 'Chicago Sky': ['芝加哥', '天空'], 'Connecticut Sun': ['康乃狄克', '太陽'], 'Dallas Wings': ['達拉斯', '飛翼'], 'Golden State Valkyries': ['金州', '女武神'],
    'Indiana Fever': ['印第安納', '狂熱'], 'Las Vegas Aces': ['拉斯維加斯', '王牌'], 'Los Angeles Sparks': ['洛杉磯', '火花'], 'Minnesota Lynx': ['明尼蘇達', '山貓'], 'New York Liberty': ['紐約', '自由人'],
    'Phoenix Mercury': ['鳳凰城', '水星'], 'Seattle Storm': ['西雅圖', '風暴'], 'Washington Mystics': ['華盛頓', '神秘人'], 'Toronto Tempo': ['多倫多', '節奏'], 'Portland Fire': ['波特蘭', '火焰']
  },
  nfl: {
    'Arizona Cardinals': ['亞利桑那', '紅雀'], 'Atlanta Falcons': ['亞特蘭大', '獵鷹'], 'Baltimore Ravens': ['巴爾的摩', '烏鴉'], 'Buffalo Bills': ['水牛城', '比爾'], 'Carolina Panthers': ['卡羅來納', '黑豹'],
    'Chicago Bears': ['芝加哥', '熊'], 'Cincinnati Bengals': ['辛辛那提', '孟加拉虎'], 'Cleveland Browns': ['克里夫蘭', '布朗'], 'Dallas Cowboys': ['達拉斯', '牛仔'], 'Denver Broncos': ['丹佛', '野馬'],
    'Detroit Lions': ['底特律', '雄獅'], 'Green Bay Packers': ['綠灣', '包裝工'], 'Houston Texans': ['休士頓', '德州人'], 'Indianapolis Colts': ['印第安納波利斯', '小馬'], 'Jacksonville Jaguars': ['傑克森維爾', '美洲豹'],
    'Kansas City Chiefs': ['堪薩斯城', '酋長'], 'Las Vegas Raiders': ['拉斯維加斯', '突擊者'], 'Los Angeles Chargers': ['洛杉磯', '閃電'], 'Los Angeles Rams': ['洛杉磯', '公羊'], 'Miami Dolphins': ['邁阿密', '海豚'],
    'Minnesota Vikings': ['明尼蘇達', '維京人'], 'New England Patriots': ['新英格蘭', '愛國者'], 'New Orleans Saints': ['紐奧良', '聖徒'], 'New York Giants': ['紐約', '巨人'], 'New York Jets': ['紐約', '噴射機'],
    'Philadelphia Eagles': ['費城', '老鷹'], 'Pittsburgh Steelers': ['匹茲堡', '鋼人'], 'San Francisco 49ers': ['舊金山', '49 人'], 'Seattle Seahawks': ['西雅圖', '海鷹'], 'Tampa Bay Buccaneers': ['坦帕灣', '海盜'],
    'Tennessee Titans': ['田納西', '泰坦'], 'Washington Commanders': ['華盛頓', '指揮官']
  },
  nhl: {
    'Anaheim Ducks': ['安那罕', '鴨'], 'Boston Bruins': ['波士頓', '棕熊'], 'Buffalo Sabres': ['水牛城', '軍刀'], 'Calgary Flames': ['卡加利', '火焰'], 'Carolina Hurricanes': ['卡羅來納', '颶風'],
    'Chicago Blackhawks': ['芝加哥', '黑鷹'], 'Colorado Avalanche': ['科羅拉多', '雪崩'], 'Columbus Blue Jackets': ['哥倫布', '藍夾克'], 'Dallas Stars': ['達拉斯', '星'], 'Detroit Red Wings': ['底特律', '紅翼'],
    'Edmonton Oilers': ['艾德蒙頓', '油人'], 'Florida Panthers': ['佛羅里達', '美洲豹'], 'Los Angeles Kings': ['洛杉磯', '國王'], 'Minnesota Wild': ['明尼蘇達', '荒野'], 'Montreal Canadiens': ['蒙特婁', '加拿大人'],
    'Nashville Predators': ['納什維爾', '掠奪者'], 'New Jersey Devils': ['紐澤西', '魔鬼'], 'New York Islanders': ['紐約', '島人'], 'New York Rangers': ['紐約', '遊騎兵'], 'Ottawa Senators': ['渥太華', '參議員'],
    'Philadelphia Flyers': ['費城', '飛人'], 'Pittsburgh Penguins': ['匹茲堡', '企鵝'], 'San Jose Sharks': ['聖荷西', '鯊魚'], 'Seattle Kraken': ['西雅圖', '海怪'], 'St. Louis Blues': ['聖路易', '藍調'],
    'Tampa Bay Lightning': ['坦帕灣', '閃電'], 'Toronto Maple Leafs': ['多倫多', '楓葉'], 'Utah Mammoth': ['猶他', '猛獁'], 'Utah Hockey Club': ['猶他', '冰球俱樂部'], 'Vancouver Canucks': ['溫哥華', '加人'],
    'Vegas Golden Knights': ['維加斯', '黃金騎士'], 'Washington Capitals': ['華盛頓', '首都'], 'Winnipeg Jets': ['溫尼伯', '噴射機']
  }
};
// By normalizeTeamName() too (Kambi's and Polymarket's spellings).
const US_BY_KEY = Object.fromEntries(Object.entries(US).map(([k, t]) => [k, Object.fromEntries(Object.entries(t).map(([n, v]) => [normalizeTeamName(n), v]))]));

// Clubs (soccer's, whatever the competition), by normalizeTeamName().
const CLUBS = {
  // England
  arsenal: '兵工廠', 'aston villa': '阿斯頓維拉', bournemouth: '伯恩茅斯', brentford: '布倫特福德', brighton: '布萊頓', 'brighton hove albion': '布萊頓', burnley: '伯恩利', chelsea: '切爾西',
  'crystal palace': '水晶宮', everton: '艾佛頓', fulham: '富勒姆', 'hull city': '赫爾城', 'ipswich town': '伊普斯維奇', ipswich: '伊普斯維奇', 'leeds united': '利茲聯', leeds: '利茲聯',
  'leicester city': '萊斯特城', liverpool: '利物浦', 'manchester city': '曼城', 'man city': '曼城', 'manchester united': '曼聯', 'man united': '曼聯', 'newcastle united': '紐卡索聯', newcastle: '紐卡索聯',
  'nottingham forest': '諾丁漢森林', southampton: '南安普頓', sunderland: '桑德蘭', tottenham: '托特納姆熱刺', 'tottenham hotspur': '托特納姆熱刺', spurs: '托特納姆熱刺', 'west ham united': '西漢姆聯', 'west ham': '西漢姆聯',
  'wolverhampton wanderers': '狼隊', wolves: '狼隊', 'sheffield united': '謝菲爾德聯', middlesbrough: '密德斯堡', 'norwich city': '諾里奇', 'west bromwich albion': '西布朗', watford: '沃特福德',
  // Spain
  'real madrid': '皇家馬德里', barcelona: '巴塞隆納', 'atletico madrid': '馬德里競技', 'athletic club': '畢爾包競技', 'athletic bilbao': '畢爾包競技', 'real sociedad': '皇家社會', villarreal: '比利亞雷亞爾',
  'real betis': '皇家貝蒂斯', sevilla: '塞維亞', valencia: '瓦倫西亞', girona: '赫羅納', 'celta vigo': '塞爾塔', celta: '塞爾塔', osasuna: '奧薩蘇納', getafe: '赫塔費', 'rayo vallecano': '巴列卡諾', mallorca: '馬略卡',
  alaves: '阿拉維斯', 'deportivo alaves': '阿拉維斯', espanyol: '西班牙人', levante: '萊萬特', elche: '埃爾切', 'real oviedo': '奧維耶多', oviedo: '奧維耶多', 'las palmas': '拉斯帕爾馬斯', leganes: '雷加內斯', 'real valladolid': '瓦拉多利德',
  // Italy
  internazionale: '國際米蘭', inter: '國際米蘭', 'inter milan': '國際米蘭', 'ac milan': 'AC 米蘭', milan: 'AC 米蘭', juventus: '尤文圖斯', napoli: '拿坡里', roma: '羅馬', 'as roma': '羅馬', lazio: '拉齊奧', atalanta: '亞特蘭大',
  fiorentina: '佛倫提那', bologna: '波隆那', torino: '杜林', udinese: '烏迪內斯', genoa: '熱那亞', como: '科莫', cagliari: '卡利亞里', lecce: '萊切', 'hellas verona': '維羅納', verona: '維羅納', parma: '帕爾瑪', sassuolo: '薩索羅',
  cremonese: '克雷莫納', pisa: '比薩', empoli: '恩波利', monza: '蒙札', venezia: '威尼斯',
  // Germany
  'bayern munich': '拜仁慕尼黑', 'bayern munchen': '拜仁慕尼黑', 'borussia dortmund': '多特蒙德', dortmund: '多特蒙德', 'bayer leverkusen': '勒沃庫森', leverkusen: '勒沃庫森', 'rb leipzig': '萊比錫', leipzig: '萊比錫',
  'eintracht frankfurt': '法蘭克福', 'vfb stuttgart': '斯圖加特', stuttgart: '斯圖加特', freiburg: '弗萊堡', 'borussia monchengladbach': '門興格拉德巴赫', monchengladbach: '門興格拉德巴赫', 'vfl wolfsburg': '沃爾夫斯堡', wolfsburg: '沃爾夫斯堡',
  'werder bremen': '不來梅', 'tsg hoffenheim': '霍芬海姆', hoffenheim: '霍芬海姆', 'union berlin': '柏林聯合', '1 union berlin': '柏林聯合', augsburg: '奧格斯堡', mainz: '美因茲', '1 fsv mainz 05': '美因茲', 'mainz 05': '美因茲',
  heidenheim: '海登海姆', '1 heidenheim': '海登海姆', '1 heidenheim 1846': '海登海姆', 'st pauli': '聖保利', 'hamburger sv': '漢堡', hamburg: '漢堡', '1 koln': '科隆', koln: '科隆', cologne: '科隆', 'vfl bochum': '波鴻', 'holstein kiel': '基爾',
  // France
  'paris saint germain': '巴黎聖日耳曼', psg: '巴黎聖日耳曼', marseille: '馬賽', 'olympique marseille': '馬賽', monaco: '摩納哥', 'as monaco': '摩納哥', lille: '里爾', lyon: '里昂', 'olympique lyonnais': '里昂', nice: '尼斯', lens: '朗斯',
  rennes: '雷恩', 'stade rennais': '雷恩', strasbourg: '史特拉斯堡', nantes: '南特', toulouse: '土魯斯', brest: '布雷斯特', 'stade brestois 29': '布雷斯特', auxerre: '歐塞爾', angers: '昂熱', lorient: '洛里昂', metz: '梅斯',
  'paris': '巴黎 FC', reims: '蘭斯', montpellier: '蒙彼利埃', 'saint etienne': '聖埃蒂安',
  // MLS
  'atlanta united': '亞特蘭大聯', austin: '奧斯汀', charlotte: '夏洛特', 'chicago fire': '芝加哥火焰', cincinnati: '辛辛那提', 'colorado rapids': '科羅拉多急流', 'columbus crew': '哥倫布機員', 'd c united': '華盛頓聯', dallas: '達拉斯',
  'houston dynamo': '休士頓迪納摩', 'inter miami': '邁阿密國際', 'la galaxy': '洛杉磯銀河', 'los angeles': '洛杉磯 FC', 'minnesota united': '明尼蘇達聯', montreal: '蒙特婁', nashville: '納什維爾', 'new england revolution': '新英格蘭革命',
  'new york city': '紐約城', 'new york red bulls': '紐約紅牛', 'orlando city': '奧蘭多城', 'philadelphia union': '費城聯合', 'portland timbers': '波特蘭伐木者', 'real salt lake': '皇家鹽湖城',   'san jose earthquakes': '聖荷西地震', 'seattle sounders': '西雅圖海灣人', 'sporting kansas city': '堪薩斯城競技', 'st louis city': '聖路易城', toronto: '多倫多 FC', 'vancouver whitecaps': '溫哥華白帽',
  // Europe's others
  'sporting cp': '里斯本競技', sporting: '里斯本競技', benfica: '本菲卡', porto: '波爾圖', braga: '布拉加', 'psv eindhoven': 'PSV 燕豪芬', psv: 'PSV 燕豪芬', ajax: '阿賈克斯', 'az alkmaar': 'AZ 阿爾克馬爾', 'club brugge': '布魯日',
  celtic: '塞爾提克', rangers: '流浪者', galatasaray: '加拉塔薩雷', fenerbahce: '費內巴切', besiktas: '貝西克塔斯', olympiacos: '奧林匹亞科斯', 'slavia prague': '布拉格斯拉夫', 'sk slavia praha': '布拉格斯拉夫', 'sparta prague': '布拉格斯巴達',
  'red bull salzburg': '薩爾斯堡', salzburg: '薩爾斯堡', 'shakhtar donetsk': '頓內次克礦工', 'dinamo zagreb': '札格瑞布迪納摩', 'young boys': '伯恩年輕人', copenhagen: '哥本哈根', 'bodo glimt': '博德閃耀', qarabag: '卡拉巴赫',
  'union st gilloise': '聖吉羅斯聯合', 'union saint gilloise': '聖吉羅斯聯合', 'red star belgrade': '貝爾格勒紅星', 'crvena zvezda': '貝爾格勒紅星', 'pafos': '帕福斯', 'kairat almaty': '凱拉特',
  // Added 2026-10: every club in the leagues Orbit Sports covers (Spain, Italy, Germany, France, Europe's cups, Scotland, MLS, J1, the FA Cup's)
  deportivo: '拉科魯尼亞', 'deportivo la coruna': '拉科魯尼亞', malaga: '馬拉加', 'racing santander': '桑坦德競技', frosinone: '弗洛西諾內',
  'hamburg sv': '漢堡', 'paderborn 07': '帕德博恩', paderborn: '帕德博恩', 'sv elversberg': '埃爾弗斯貝格', 'schalke 04': '沙爾克 04', schalke: '沙爾克 04',
  'aj auxerre': '歐塞爾', 'le havre ac': '勒哈佛', 'le havre': '勒哈佛', 'le mans': '勒芒', troyes: '特魯瓦',
  'aek athens': 'AEK 雅典', 'feyenoord rotterdam': '費耶諾德', feyenoord: '費耶諾德', 'lask linz': 'LASK 林茲', 'sabah': '薩巴', 'slovan bratislava': '布拉提斯拉瓦斯洛萬', 'viking': '維京',
  'ararat armenia': '阿拉拉特亞美尼亞', anderlecht: '安德萊赫特', ferencvaros: '費倫茨瓦羅斯', 'hapoel be er': '貝爾謝巴夏普爾', 'hapoel beer sheva': '貝爾謝巴夏普爾', 'jagiellonia bialystok': '比亞維斯托克', 'lech poznan': '波茲南萊赫', 'levski sofia': '索非亞列夫斯基', lillestrom: '利勒斯特倫', 'nec nijmegen': '奈梅亨', 'nk celje': '采列', 'ofi crete': '克里特 OFI', 'omonia nicosia': '尼科西亞奧摩尼亞', 'rb salzburg': '薩爾斯堡', 'sk sturm graz': '格拉茨風暴', 'sturm graz': '格拉茨風暴', torreense: '托倫斯', 'viktoria plzen': '比爾森勝利',
  // Poland's Ekstraklasa (a club's own league shown when it's opened from a European cup)
  'gornik zabrze': '札布熱礦工', 'legia warszawa': '華沙萊吉亞', 'legia warsaw': '華沙萊吉亞', 'pogon szczecin': '什切青波貢', 'gks katowice': '卡托維治 GKS', 'wisla krakow': '克拉科夫維斯瓦', 'zaglebie lubin': '盧賓扎格萊別', 'piast gliwice': '格利維采皮亞斯特', 'korona kielce': '凱爾采科羅納', 'wisla plock': '普沃茨克維斯瓦', cracovia: '克拉科維亞', 'motor lublin': '盧布林摩托', 'widzew lodz': '羅茲維澤夫', 'wieczysta krakow': '克拉科夫維切斯塔', 'radomiak radom': '拉多姆拉多米亞克', 'slask wroclaw': '弗羅茨瓦夫西里西亞', 'rakow czestochowa': '琴斯托霍瓦拉科夫', 'lechia gdansk': '格但斯克萊希亞', 'arka gdynia': '格丁尼亞阿卡', 'termalica nieciecza': '涅切查特馬利卡', 'bruk bet termalica nieciecza': '涅切查特馬利卡',
  agf: '奧胡斯', 'ajax amsterdam': '阿賈克斯', 'borac banja luka': '巴尼亞盧卡博拉茨', 'cska sofia': '索非亞中央陸軍', 'csu craiova': '克拉約瓦大學', egnatia: '埃格納蒂亞', kobenhavn: '哥本哈根', lugano: '盧加諾', midtjylland: '中日德蘭', thun: '圖恩', twente: '特溫特', 'hajduk split': '斯普利特哈伊杜克', 'heart of midlothian': '哈茨', hearts: '哈茨', 'iberia 1999': '伊比利亞 1999', 'inter d escaldes': '埃斯卡爾德斯國際', jablonec: '亞布洛內茨', 'kaa gent': '根特', gent: '根特', 'kauno zalgiris': '考納斯薩爾基里斯', 'kups kuopio': '庫奧皮奧', 'lincoln red imps': '林肯紅魔', 'mjallby aif': '米爾比', mjallby: '米爾比', panathinaikos: '帕納辛奈克斯', riga: '里加', 'sk brann': '布蘭', brann: '布蘭', 'sint truidense': '聖特雷登', trabzonspor: '特拉布宗',
  aberdeen: '阿伯丁', dundee: '登地', 'dundee united': '登地聯', falkirk: '福爾柯克', hibernian: '希伯尼安', kilmarnock: '基爾馬諾克', motherwell: '馬瑟韋爾', 'st johnstone': '聖約翰斯通', 'st mirren': '聖米倫', livingston: '利文斯頓', 'ross county': '羅斯郡',
  lafc: '洛杉磯 FC', 'red bull new york': '紐約紅牛', 'san diego': '聖地牙哥 FC',
  'avispa fukuoka': '福岡黃蜂', 'cerezo osaka': '大阪櫻花', 'fc tokyo': 'FC 東京', tokyo: 'FC 東京', 'fagiano okayama': '岡山綠雉', 'gamba osaka': '大阪飛腳', 'jef united ichihara chiba': '千葉市原', 'kashima antlers': '鹿島鹿角', 'kashiwa reysol': '柏雷素爾', 'kawasaki frontale': '川崎前鋒', 'kyoto sanga': '京都不死鳥', 'machida zelvia': '町田澤維亞', 'mito hollyhock': '水戶蜀葵', 'nagoya grampus': '名古屋鯨八', 'sanfrecce hiroshima': '廣島三箭', 'shimizu s pulse': '清水心跳', 'tokyo verdy': '東京綠茵', 'urawa red diamonds': '浦和紅鑽', 'v varen nagasaki': '長崎成功丸', 'vissel kobe': '神戶勝利船', 'yokohama f marinos': '橫濱水手', 'yokohama marinos': '橫濱水手', 'albirex niigata': '新潟天鵝', 'shonan bellmare': '湘南比馬', 'consadole sapporo': '札幌岡薩多', 'yokohama': '橫濱 FC', 'tokyo verdy 1969': '東京綠茵',
  'birmingham city': '伯明罕城', 'blackburn rovers': '布萊克本', blackpool: '黑池', 'bolton wanderers': '博爾頓', 'bristol city': '布里斯托城', 'bristol rovers': '布里斯托流浪者', 'cardiff city': '卡迪夫城', 'charlton athletic': '查爾頓', 'derby county': '德比郡', 'stoke city': '斯托克城', 'swansea city': '史雲斯', 'queens park rangers': '女王公園巡遊者', 'preston north end': '普雷斯頓', millwall: '米爾沃爾', 'oxford united': '牛津聯', portsmouth: '樸茨茅斯', wrexham: '雷克瑟姆', barnsley: '巴恩斯利', 'huddersfield town': '哈德斯菲爾德', 'wigan athletic': '威根', 'reading': '雷丁', 'doncaster rovers': '唐卡斯特', 'peterborough united': '彼得堡聯', 'rotherham united': '羅瑟勒姆', 'plymouth argyle': '普利茅斯', 'stockport county': '斯托克港', 'mansfield town': '曼斯菲爾德', 'lincoln city': '林肯城', 'exeter city': '埃克塞特', 'cambridge united': '劍橋聯', 'leyton orient': '萊頓東方', 'afc wimbledon': '溫布頓', wimbledon: '溫布頓', 'northampton town': '北安普頓', 'burton albion': '伯頓', 'shrewsbury town': '什魯斯伯里', 'crewe alexandra': '克魯', 'carlisle united': '卡萊爾聯', 'colchester united': '科爾切斯特', 'bradford city': '布拉德福德', 'gillingham': '吉靈漢', 'port vale': '維爾港', 'notts county': '諾士郡', 'salford city': '索爾福德', 'luton town': '盧頓', 'coventry city': '科芬特里城',
  'sabah fk': '薩巴', 'viking fk': '維京', 'f c kobenhavn': '哥本哈根', 'nordsjaelland': '北西蘭', 'f c k benhavn': '哥本哈根', 'k benhavn': '哥本哈根', 'nordsj lland': '北西蘭',
  'telford united': '特爾福德聯', totton: '托頓', 'accrington stanley': '阿克寧頓', 'aldershot town': '奧爾德肖特', altrincham: '奧爾特靈厄姆', barnet: '巴尼特', barrow: '巴羅', 'boreham wood': '博勒姆伍德', 'brackley town': '布拉克利', 'braintree town': '布倫特里', bromley: '布羅姆利', buxton: '巴克斯頓', 'chatham town': '查塔姆', chelmsford: '切姆斯福德', 'cheltenham town': '切爾滕納姆', chester: '切斯特', chesterfield: '切斯特菲爾德', 'crawley town': '克勞利', eastleigh: '伊斯特利', 'ebbsfleet united': '埃布斯弗利特', 'halifax town': '哈利法克斯', 'fleetwood town': '弗利特伍德', 'forest green rovers': '森林綠流浪者', 'gainsborough trinity': '蓋恩斯伯勒', gateshead: '蓋茨黑德', 'grimsby town': '格林斯比', 'harrogate town': '哈羅蓋特', 'hemel hempstead town': '赫默爾亨普斯特德', macclesfield: '麥克爾斯菲爾德', 'maldon tiptree': '莫爾登蒂普特里', 'milton keynes dons': 'MK 唐斯', 'newport county': '紐波特郡', 'oldham athletic': '奧爾德姆', 'scunthorpe united': '斯肯索普', 'sheffield wednesday': '謝菲爾德星期三', 'slough town': '斯勞', 'south shields': '南希爾茲', 'southend united': '紹森德', 'spennymoor town': '斯彭尼穆爾', 'st albans city': '聖奧爾本斯', stevenage: '史蒂夫尼奇', 'sutton united': '薩頓聯', 'swindon town': '史雲頓', tamworth: '塔姆沃思', 'tranmere rovers': '特蘭米爾', walsall: '沃爾索爾', wealdstone: '威爾德斯通', 'weston super mare': '濱海韋斯頓', 'wycombe wanderers': '韋康比', 'york city': '約克城',
};

// NPB, KBO, CPBL as Taiwan writes them (their own names and Kambi's spellings), by normalizeTeamName().
const ASIA = {
  'tsg hawks': '台鋼雄鷹', 'uni lions': '統一7-ELEVEn獅', 'uni president lions': '統一7-ELEVEn獅', 'fubon guardians': '富邦悍將', 'chinatrust brothers': '中信兄弟', 'ctbc brothers': '中信兄弟', 'rakuten monkeys': '樂天桃猿', 'wei chuan dragons': '味全龍',
  'yomiuri giants': '讀賣巨人', 'hanshin tigers': '阪神虎', 'chunichi dragons': '中日龍', 'yokohama dena baystars': '橫濱DeNA海灣之星', 'hiroshima toyo carp': '廣島東洋鯉魚', 'tokyo yakult swallows': '東京養樂多燕子', 'fukuoka softbank hawks': '福岡軟銀鷹',
  'hokkaido nippon ham fighters': '北海道日本火腿鬥士', 'chiba lotte marines': '千葉羅德海洋', 'tohoku rakuten golden eagles': '東北樂天金鷲', 'orix buffaloes': '歐力士猛牛', 'saitama seibu lions': '埼玉西武獅',
  'kia tigers': '起亞虎', 'samsung lions': '三星獅', 'lg twins': 'LG雙子', 'doosan bears': '斗山熊', 'kt wiz': 'KT巫師', 'ssg landers': 'SSG登陸者', 'lotte giants': '樂天巨人', 'hanwha eagles': '韓華鷹', 'nc dinos': 'NC恐龍', 'kiwoom heroes': '培證英雄',
  'yokohama bay stars': '橫濱DeNA海灣之星', 'nippon ham fighters': '北海道日本火腿鬥士', 'rakuten golden eagles': '東北樂天金鷲', 'seibu lions': '埼玉西武獅', 'kt wiz suwon': 'KT巫師', yomiuri: '讀賣巨人', 'hiroshima carp': '廣島東洋鯉魚'
};
// Asian clubs' short names ("統一7-ELEVEn獅" → 統一獅), for a row.
const ASIA_SHORT = { '統一7-ELEVEn獅': '統一獅', '橫濱DeNA海灣之星': '橫濱DeNA', '北海道日本火腿鬥士': '火腿', '東北樂天金鷲': '樂天金鷲', '東京養樂多燕子': '養樂多', '廣島東洋鯉魚': '廣島鯉魚', '福岡軟銀鷹': '軟銀鷹', '千葉羅德海洋': '羅德', '埼玉西武獅': '西武獅', '歐力士猛牛': '歐力士' };

// American college football (FBS) by school, as Taiwan's lottery writes them:
// the school, no nickname ("Florida State Seminoles" → 佛羅里達州立). Matched
// on the start of ESPN's name, longest school first (Florida State before Florida).
const COLLEGE = {
  'Air Force': '空軍官校', Akron: '阿克倫', Alabama: '阿拉巴馬', 'App State': '阿帕拉契州立', 'Appalachian State': '阿帕拉契州立', Arizona: '亞利桑那', 'Arizona State': '亞利桑那州立', Arkansas: '阿肯色', 'Arkansas State': '阿肯色州立', Army: '陸軍官校', Auburn: '奧本',
  'Ball State': '鮑爾州立', Baylor: '貝勒', 'Boise State': '博伊西州立', 'Boston College': '波士頓學院', 'Bowling Green': '鮑林格林', Buffalo: '水牛城', BYU: '楊百翰', California: '加州柏克萊', Cal: '加州柏克萊', 'Central Michigan': '中密西根', Charlotte: '夏洛特', Cincinnati: '辛辛那提', Clemson: '克萊門森', 'Coastal Carolina': '海岸卡羅來納', Colorado: '科羅拉多', 'Colorado State': '科羅拉多州立',
  Delaware: '德拉瓦', Duke: '杜克', 'East Carolina': '東卡羅來納', 'Eastern Michigan': '東密西根', FIU: '佛羅里達國際', Florida: '佛羅里達', 'Florida Atlantic': '佛羅里達大西洋', 'Florida State': '佛羅里達州立', 'Fresno State': '弗雷斯諾州立', Georgia: '喬治亞', 'Georgia Southern': '喬治亞南方', 'Georgia State': '喬治亞州立', 'Georgia Tech': '喬治亞理工',
  "Hawai'i": '夏威夷', Hawaii: '夏威夷', Houston: '休士頓', Illinois: '伊利諾', Indiana: '印第安納', Iowa: '愛荷華', 'Iowa State': '愛荷華州立', 'Jacksonville State': '傑克森維爾州立', 'James Madison': '詹姆斯麥迪遜', Kansas: '堪薩斯', 'Kansas State': '堪薩斯州立', 'Kennesaw State': '肯尼索州立', 'Kent State': '肯特州立', Kentucky: '肯塔基',
  Liberty: '自由大學', Louisiana: '路易斯安那', 'Louisiana Tech': '路易斯安那理工', 'UL Monroe': '路易斯安那門羅', Louisville: '路易維爾', LSU: '路易斯安那州立', Marshall: '馬歇爾', Maryland: '馬里蘭', Massachusetts: '麻薩諸塞', UMass: '麻薩諸塞', Memphis: '曼菲斯', 'Miami': '邁阿密', 'Miami (OH)': '邁阿密（俄亥俄）', Michigan: '密西根', 'Michigan State': '密西根州立', 'Middle Tennessee': '中田納西', Minnesota: '明尼蘇達', 'Mississippi State': '密西西比州立', Missouri: '密蘇里', 'Missouri State': '密蘇里州立',
  Navy: '海軍官校', 'NC State': '北卡州立', Nebraska: '內布拉斯加', Nevada: '內華達', 'New Mexico': '新墨西哥', 'New Mexico State': '新墨西哥州立', 'North Carolina': '北卡羅來納', 'North Texas': '北德州', 'Northern Illinois': '北伊利諾', Northwestern: '西北', 'Notre Dame': '聖母', Ohio: '俄亥俄', 'Ohio State': '俄亥俄州立', Oklahoma: '奧克拉荷馬', 'Oklahoma State': '奧克拉荷馬州立', 'Old Dominion': '老道明', 'Ole Miss': '密西西比', Oregon: '奧勒岡', 'Oregon State': '奧勒岡州立',
  'Penn State': '賓州州立', Pittsburgh: '匹茲堡', Purdue: '普渡', Rice: '萊斯', Rutgers: '羅格斯', 'Sacramento State': '沙加緬度州立', 'Sam Houston': '山姆休士頓', 'San Diego State': '聖地牙哥州立', 'San José State': '聖荷西州立', 'San Jose State': '聖荷西州立', SMU: '南方衛理', 'South Alabama': '南阿拉巴馬', 'South Carolina': '南卡羅來納', 'South Florida': '南佛羅里達', 'Southern Miss': '南密西西比', Stanford: '史丹佛', Syracuse: '雪城',
  TCU: '德州基督教', Temple: '天普', Tennessee: '田納西', Texas: '德州', 'Texas A&M': '德州農工', 'Texas State': '德州州立', 'Texas Tech': '德州理工', Toledo: '托雷多', Troy: '特洛伊', Tulane: '杜蘭', Tulsa: '塔爾薩', UAB: '阿拉巴馬伯明罕', UCF: '中佛羅里達', UCLA: '加州大學洛杉磯', UConn: '康乃狄克', UNLV: '內華達拉斯維加斯', USC: '南加州', Utah: '猶他', 'Utah State': '猶他州立', UTEP: '德州艾爾帕索', UTSA: '德州聖安東尼奧',
  Vanderbilt: '范德堡', Virginia: '維吉尼亞', 'Virginia Tech': '維吉尼亞理工', 'Wake Forest': '維克森林', Washington: '華盛頓', 'Washington State': '華盛頓州立', 'West Virginia': '西維吉尼亞', 'Western Kentucky': '西肯塔基', 'Western Michigan': '西密西根', Wisconsin: '威斯康辛', Wyoming: '懷俄明'
};
const COLLEGE_BY_LENGTH = Object.keys(COLLEGE).sort((a, b) => b.length - a.length);
// ESPN's "School Nickname" (the lottery's too) → the school in Chinese, or null.
function collegeZh(name) {
  const school = COLLEGE_BY_LENGTH.find(s => name === s || name.startsWith(`${s} `));
  return school ? COLLEGE[school] : null;
}

// Clubs of the leagues Play carries beyond Europe's big ones (2026-10: every
// club ESPN lists for each), by their English name as ESPN or Kambi write it
// (normalized below, as CLUBS'). Soccer's go in with CLUBS, as clubs meet in
// other competitions (Utrecht in the Europa League); a name two leagues share
// (Santos) is the league's own below.
const MORE_CLUBS = {
  // Eredivisie
  'ADO Den Haag': '海牙', Excelsior: '鹿特丹精英', 'FC Groningen': '格羅寧根', 'FC Utrecht': '烏德勒支', 'Fortuna Sittard': '錫塔德', 'Go Ahead Eagles': '前進之鷹', Heerenveen: '海倫芬', 'PEC Zwolle': '茲沃勒', 'SC Cambuur': '坎布爾', 'Sparta Rotterdam': '鹿特丹斯巴達', Telstar: '特爾斯達', 'Willem II': '威廉二世',
  // Liga MX
  América: '美洲', Atlante: '亞特蘭特', Atlas: '阿特拉斯', 'Atlético de San Luis': '聖路易斯競技', 'Cruz Azul': '藍十字', 'FC Juárez': '華雷斯', Guadalajara: '瓜達拉哈拉', León: '萊昂', Monterrey: '蒙特雷', Necaxa: '內卡薩', Pachuca: '帕丘卡', Puebla: '普埃布拉', 'Pumas UNAM': '美洲獅', Querétaro: '克雷塔羅', 'Santos Laguna': '桑托斯拉古納', 'Tigres UANL': '老虎', Tijuana: '提華納', Toluca: '托盧卡',
  // Brasileirão
  'Athletico-PR': '巴拉納競技', 'Atlético-MG': '米內羅競技', Bahia: '巴伊亞', Botafogo: '博塔弗戈', Chapecoense: '沙佩科恩斯', Corinthians: '哥林斯人', Coritiba: '科里蒂巴', Cruzeiro: '克魯塞羅', Flamengo: '佛朗明哥', Fluminense: '弗魯米嫩塞', Grêmio: '格雷米奧', Internacional: '國際', Mirassol: '米拉索爾', Palmeiras: '帕梅拉斯', 'Red Bull Bragantino': '紅牛布拉干蒂諾', Remo: '雷莫', Santos: '桑托斯', 'São Paulo': '聖保羅', 'Vasco da Gama': '華斯高', Vitória: '維多利亞',
  // K League
  'Jeonbuk Hyundai Motors': '全北現代', 'Jeonbuk Motors': '全北現代', 'Ulsan HD': '蔚山 HD', 'Ulsan Hyundai': '蔚山 HD', 'Pohang Steelers': '浦項制鐵', 'FC Seoul': '首爾', Gangwon: '江原', 'Gangwon FC': '江原', 'Gwangju FC': '光州', 'Daejeon Hana Citizen': '大田市民', 'Daejeon Citizen': '大田市民', 'Jeju United': '濟州', 'Jeju SK': '濟州', 'Incheon United': '仁川聯', 'Anyang FC': '安養', 'FC Anyang': '安養', 'Gimcheon Sangmu FC': '金泉尚武', 'Gimcheon Sangmu': '金泉尚武', 'Suwon FC': '水原 FC', 'Daegu FC': '大邱', 'Suwon Samsung Bluewings': '水原三星', 'Bucheon FC 1995': '富川 FC', 'Bucheon FC': '富川 FC', 'Jeonnam Dragons': '全南天龍'
};
// A league's own names: its clubs a name shared with another league's
// (Liga MX's Santos), and the NBL's (basketball: not CLUBS').
const LEAGUE_NAMES = {
  ligamx: { Santos: '桑托斯拉古納' },
  // EuroLeague (basketball: not CLUBS', as 運彩 lists them)
  euroleague: { 'Virtus Bologna': '博洛尼亞維圖斯', 'Virtus Segafredo Bologna': '博洛尼亞維圖斯', 'Hapoel Tel Aviv': '特拉維夫夏普爾', 'Hapoel Tel Aviv BC': '特拉維夫夏普爾', 'Anadolu Efes': '艾菲斯', 'Anadolu Efes SK': '艾菲斯', 'BC Dubai': '杜拜', 'Dubai Basketball': '杜拜', 'Real Madrid': '皇家馬德里', 'Real Madrid Baloncesto': '皇家馬德里', 'Maccabi Tel Aviv': '特拉維夫馬卡比', 'Maccabi Tel Aviv BC': '特拉維夫馬卡比', 'Maccabi Playtika Tel Aviv': '特拉維夫馬卡比', 'Saski Baskonia': '巴斯克尼亞', 'Baskonia': '巴斯克尼亞', 'Milano': '米蘭奧林匹亞', 'Olimpia Milano': '米蘭奧林匹亞', 'EA7 Emporio Armani Milan': '米蘭奧林匹亞', 'KK Crvena Zvezda Belgrade': '貝爾格勒紅星', 'KK Crvena zvezda': '貝爾格勒紅星', 'Crvena Zvezda': '貝爾格勒紅星', 'Partizan Belgrade': '貝爾格勒游擊隊', 'KK Partizan': '貝爾格勒游擊隊', 'Partizan': '貝爾格勒游擊隊', 'ASVEL Lyon-Villeurbanne': '維勒班', 'LDLC ASVEL Villeurbanne': '維勒班', 'ASVEL': '維勒班', 'Žalgiris Kaunas': '考納斯薩爾基里斯', 'BC Žalgiris': '考納斯薩爾基里斯', 'Zalgiris Kaunas': '考納斯薩爾基里斯', 'Fenerbahce SK': '費內巴切', 'Fenerbahce': '費內巴切', 'Fenerbahçe Beko Istanbul': '費內巴切', 'Olympiacos BC': '奧林匹亞科斯', 'Olympiacos': '奧林匹亞科斯', 'Olympiacos Piraeus': '奧林匹亞科斯', 'Valencia Basket Club': '瓦倫西亞', 'Valencia Basket': '瓦倫西亞', 'Paris Basket': '巴黎', 'Paris Basketball': '巴黎', 'Panathinaikos BC': '帕納辛納克斯', 'Panathinaikos': '帕納辛納克斯', 'Panathinaikos AKTOR Athens': '帕納辛納克斯', 'AS Monaco Basket': '摩納哥', 'AS Monaco': '摩納哥', 'Monaco': '摩納哥', 'FC Barcelona Basquet': '巴塞隆納', 'FC Barcelona': '巴塞隆納', 'Barcelona': '巴塞隆納', 'Bayern München Basketball': '拜仁慕尼黑', 'FC Bayern Munich': '拜仁慕尼黑', 'Bayern Munich': '拜仁慕尼黑', 'Besiktas Basketbol': '貝西克塔斯', 'Besiktas': '貝西克塔斯' },
  nbl: { 'Adelaide 36ers': '阿德萊德 36 人', 'Brisbane Bullets': '布里斯本子彈', 'Cairns Taipans': '凱恩斯太攀蛇', 'Illawarra Hawks': '伊拉瓦拉老鷹', 'Melbourne United': '墨爾本聯', 'New Zealand Breakers': '紐西蘭破浪者', 'Perth Wildcats': '伯斯野貓', 'South East Melbourne Phoenix': '東南墨爾本鳳凰', 'Sydney Kings': '雪梨國王', 'Tasmania JackJumpers': '塔斯馬尼亞跳蟻' }
};
for (const [name, zh] of Object.entries(MORE_CLUBS)) CLUBS[normalizeTeamName(name)] ??= zh;
const LEAGUE_BY_NAME = Object.fromEntries(Object.entries(LEAGUE_NAMES).map(([k, t]) => [k, Object.fromEntries(Object.entries(t).map(([name, zh]) => [normalizeTeamName(name), zh]))]));

const SOCCER = new Set(['soccer']);
// A team in Chinese: { full, short }, or null when there's no Chinese name.
// `key` is the league (Play's key; Orbit Sports' own is the same), `sport` its sport.
export function teamNameZh(key, name, sport = '') {
  if (!name) return null;
  const n = normalizeTeamName(name);
  const us = US[key]?.[name] || US_BY_KEY[key]?.[n];
  if (us) return { full: `${us[0]}${us[0] && /^[\d]/.test(us[1]) ? ' ' : ''}${us[1]}`, short: us[1] };
  const own = LEAGUE_BY_NAME[key]?.[n];
  if (own) return { full: own, short: own };
  if (key === 'ncaaf') {
    const zh = collegeZh(name);
    return zh ? { full: zh, short: zh } : null;
  }
  if (['npb', 'kbo', 'cpbl'].includes(key)) {
    const zh = ASIA[n];
    return zh ? { full: zh, short: ASIA_SHORT[zh] || zh } : null;
  }
  if (SOCCER.has(sport) || !sport) {
    // As written, else without its joining words (ESPN's "Atlético de Madrid" is Atlético Madrid).
    const zh = CLUBS[n] || CLUBS[bare(n)];
    if (zh) return { full: zh, short: zh };
  }
  return null;
}
const bare = n => n.replace(/\b(de|del|da|do|di|la|le|les|of|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
// The teams whose Chinese name has the words typed ("皇家" → Real Madrid,
// Real Sociedad…): [{ name, zh }], the English name to look them up by.
// A Chinese search finds teams by their Chinese names, not by a machine
// translation of the words (皇家 would be "Royal"). Whole names first.
export function teamsByZh(query, most = 6) {
  const q = String(query || '').replace(/\s+/g, '');
  if (!/[\u3400-\u9fff]/.test(q)) return [];
  const out = new Map();
  const add = (name, zh) => {
    const z = String(zh).replace(/\s+/g, '');
    if (z.includes(q) && !out.has(z + '|' + name)) out.set(z + '|' + name, { name, zh, whole: z === q });
  };
  for (const table of Object.values(US)) for (const [name, [city, nick]] of Object.entries(table)) add(name, `${city}${nick}`);
  for (const [name, zh] of Object.entries(CLUBS)) add(name, zh);
  for (const [name, zh] of Object.entries(ASIA)) add(name, zh);
  for (const t of Object.values(LEAGUE_NAMES)) for (const [name, zh] of Object.entries(t)) add(name, zh);
  for (const [name, zh] of Object.entries(COLLEGE)) add(name, zh);
  // One English name a team (a club written several ways: the first).
  const seen = new Set();
  return [...out.values()]
    .sort((a, b) => b.whole - a.whole)
    .filter(x => !seen.has(x.zh) && seen.add(x.zh))
    .slice(0, most)
    .map(({ name, zh }) => ({ name, zh }));
}
// Play's form: the full name (the lottery's), or the name as it came.
export const teamZh = (key, name, sport = '') => teamNameZh(key, name, sport)?.full ?? name;
