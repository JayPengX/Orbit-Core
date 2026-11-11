// Real-shaped examples for each AI feature's prompt (ai.js aiTry, the ops
// check `ai-try` in build.yml): every prompt is tried on these before it
// ships and again when it changes (Jay 11-10: prompts are crucial).
// `answers`: what the person tapped when it asked back.

const MONEY_CATS = 'food:餐飲|food:breakfast:餐飲 › 早餐|food:lunch:餐飲 › 午餐|food:dinner:餐飲 › 晚餐|food:drink:餐飲 › 飲料點心|transport:交通|transport:tpass:交通 › TPASS|transport:ride:交通 › 搭車|transport:long:交通 › 長途|transport:car:交通 › 汽機車|shop:購物|shop:style:購物 › 服飾美妝|shop:tech:購物 › 3C 家電|shop:daily:購物 › 日用品|home:居住|fun:娛樂|fun:leisure:娛樂 › 休閒|fun:travel:娛樂 › 旅遊|digital:數位|digital:subs:數位 › 影音串流|health:醫療|learn:學習|learn:books:學習 › 書|social:人情|social:treat:人情 › 請客|social:gift:人情 › 禮物|other:其他'
  .split('|')
  .map(x => {
    const i = x.lastIndexOf(':');
    return { id: x.slice(0, i), name: x.slice(i + 1), k: 'out' };
  })
  .concat([
    { id: 'allowance', name: '零用錢', k: 'in' },
    { id: 'side', name: '兼職', k: 'in' },
    { id: 'redenv', name: '紅包', k: 'in' }
  ]);
const MONEY_PAYS = [
  { id: 'cash|', name: '現金' },
  { id: 'easy|', name: '悠遊卡' },
  { id: 'linepay|', name: 'LINE Pay' },
  { id: 'taishin|card1', name: '台新 · Richart •4821' }
];
const money = (name, text, answers) => ({ name, input: { text, today: '2026-11-10', cats: MONEY_CATS, pays: MONEY_PAYS }, ...(answers ? { answers } : {}) });

const SPORTS_FACTS = `Today: 11/11 (Taiwan).
[mine] 我的球隊排名: 湖人, NBA · 西區, 第 3 名; 勇士, NBA · 西區, 第 8 名
[next] 我的球隊下一場: 勇士 vs 金塊, 11/11（三）19:00; 湖人 @ 太陽, 11/12（四）19:30
[last] 我的球隊上一場: 勇士 vs 塞爾提克, 11/10, 99–118 負; 湖人 vs 太陽, 11/9, 112–104 勝; 道奇 vs 洋基, 11/1, 5–4 勝
[table.nba] NBA 西區: 雷霆, 12-1, 第 1 名; 火箭, 11-2, 第 2 名; 湖人, 11-2, 第 3 名; 金塊, 10-3, 第 4 名; 灰狼, 9-4, 第 5 名; 快艇, 8-5, 第 6 名; 獨行俠, 8-5, 第 7 名; 勇士, 7-6, 第 8 名
[today] 今天我的聯賽: 公鹿 @ 尼克, 已結束, 110–121; 金塊 @ 勇士, 19:00`;
const MONEY_FACTS = `Today: 2026-11-10. Amounts are NT$.
Book starts: 2026-07-08
Income this month: 1860
[cat0] 11月（到今天）花在哪: 居住 8000; 購物 3233; 數位 1940; 餐飲 1814; 娛樂 677; 交通 190; 稅費 25
[pay0] 11月（到今天）怎麼付的: 台新 Richart 8000 (1 times); 國泰CUBE •8812 4523 (6 times); LINE Pay 1690 (9 times); 現金 1216 (11 times); 悠遊卡 190 (7 times); 國泰CUBE Apple Pay 260 (2 times)
[sub0.living] 11月（到今天）居住裡: 房租房貸 8000; 水電瓦斯 0
[sub0.shop] 11月（到今天）購物裡: 服飾美妝 2043; 日用品 682; 3C 508
[sub0.digital] 11月（到今天）數位裡: 遊戲 1290; 工具訂閱 650
[inc0] 11月（到今天）收入: 投資 1860
[place0] 11月（到今天）常去的地方: Uniqlo 2043 (2 times); 全聯 682 (2 times); 威秀 677 (2 times); 路易莎 227 (3 times)
[big0] 11月（到今天）最大筆: 11/8 房租 8000; 11/4 Steam 1290; 11/5 Uniqlo 1025
[cat1] 10月花在哪: 購物 12169; 居住 8000; 餐飲 7423; 交通 2605; 娛樂 1361; 數位 545
[pay1] 10月怎麼付的: 國泰CUBE •8812 14230 (21 times); 台新 Richart 8000 (1 times); 現金 5210 (38 times); LINE Pay 2058 (17 times); 悠遊卡 2605 (30 times)
[cat2] 9月花在哪: 居住 8000; 餐飲 6060; 購物 5443; 交通 1200
[pay2] 9月怎麼付的: 台新 Richart 8000 (1 times); 現金 7203 (44 times); 國泰CUBE •8812 4300 (9 times); 悠遊卡 1200 (1 times)
[months] 每月支出: 11月（到今天） 15879; 10月 32103; 9月 20703
[vs] 比上個月同期（到 10/10）: 購物 3233 (was 0); 數位 1940 (was 0); 餐飲 1814 (was 0); 娛樂 677 (was 0); 交通 190 (was 0); 稅費 25 (was 0)
[week] 這週和上週: 這週 1173; 上週 14504
[budget] 這個月的預算: 預算 20000; 已花 15879; 還剩 4121`;

// Orbit Law's 拍合約幫你看: the clauses of the two made-up contracts in site/ai-try/, as law-contract-read gives them.
const LEASE = [{"n":"一","text":"租賃標的：〔個資略〕房屋一間，供承租人居住使用。"},{"n":"二","text":"租賃期間自民國115年9月1日起至116年8月31日止，共一年。"},{"n":"三","text":"租金每月新臺幣9,500元，承租人應於每月5日前支付，逾期一日加收滯納金500元。"},{"n":"四","text":"押金新臺幣28,500元（三個月租金），於租期屆滿、承租人遷出且無欠款時無息返還；承租人提前終止租約者，押金全數沒收。"},{"n":"五","text":"租賃期間房屋及設備之一切修繕，不論原因，均由承租人負擔。"},{"n":"六","text":"承租人不得申請設籍，亦不得申報租金支出扣除額。"},{"n":"七","text":"出租人得隨時進入房屋查看，無須事先通知承租人。"},{"n":"八","text":"水電費由承租人負擔，電費每度以新臺幣6元計收。"},{"n":"九","text":"承租人已詳閱本契約全部條款，同意放棄審閱期間。"}];
const JOB = [{"n":"一","text":"乙方擔任甲方門市兼職人員，工作時間依甲方排班。"},{"n":"二","text":"時薪新臺幣180元，每月10日發放上月薪資。"},{"n":"三","text":"到職前三日為試做期，試做期間不支薪。"},{"n":"四","text":"乙方遲到一次扣薪新臺幣300元。"},{"n":"五","text":"乙方應服務滿六個月，未滿六個月離職者，最後一個月薪資不予發放。"},{"n":"六","text":"兼職人員不投保勞工保險，亦不提繳勞工退休金。"},{"n":"七","text":"國定假日照常排班，不另給加班費。"},{"n":"八","text":"乙方離職後一年內，不得至其他飲料店任職。"},{"n":"九","text":"乙方為民國98年出生，已取得法定代理人口頭同意。"}];
// A real 議事錄 as Law's build cuts it (lib/minutes.mjs digest): 伸港's results sit in the chair's speeches.
const MINUTES_SHENGANG = "時間：中華民國114年1月13日起至1月15止\n1月15日（星期三）：第三次會：討論提案、臨時動議、閉幕典禮。\n家好！這一次召開第21屆第11次臨時會，要審議公所提案，請代\n1月13日（星期一）：第一次會：報到、預備會議。\n1月14日（星期二）：第二次會：開幕典禮、討論提案。\n1月15日（星期三）：第三次會：討論提案、臨時動議、閉幕典禮。\n公所第1號提案。\n伸港鄉公所第1號提案\n提案人：鄉長黄永欽\n類別：社政\n案由：為本所辦理「伸港鄉海尾社區活動中心廁所及關懷據點簡\n易廚房新建工程」，彰化縣政府補助新台幣（下同）450萬\n元，及本所自籌配合款620萬1,186元，合計1,070萬\n1,186元，請同意先行墊付。\n理由：\n辦法：審議通過後先行墊付，俟辦理114年追加減預算或115年\n萬1,186元，請大會同意先行墊付，以上報告，敬請代表支持通過。\n代表同仁對公所第1號提案是否有意見？如無意見本案照原案\n通過。請陳秘書宣讀公所第2號提案。\n伸港鄉公所第2號提案\n提案人：鄉長黄永欽\n類別：環保\n案由：有關彰化縣環境保護局核定「114年公共設施改善-補助鄉\n鎮市購置垃圾車及資源回收車」案，補助本所垃圾車及資\n源回收車各1輛，彰化縣政府補助257萬2,350元(55%)，\n本所需自籌配合款210萬4,650元(45%)，合計新台幣467\n理由：\n辦法：審議通過後，先行墊付，俟辦理114年追加減預算或115年\n付支應，以上報告，請多多支持通過，謝謝。\n各位代表同仁對公所第2號提案是否有意見？如無意見本案照\n原案通過。請陳秘書宣讀公所第3號提案。\n伸港鄉公所第3號提案\n提案人：鄉長黄永欽\n類別：社政\n案由：為本所辦理「彰化縣伸港鄉老人文康中心屋頂防水修繕及\n牆面粉刷工程」，衛生福利部補助新台幣（下同）225萬元\n整，及本所自籌配合款25萬元整，合計250萬元整，請同\n意先行墊付。\n理由：\n辦法：審議通過後先行墊付，俟辦理114年追加減預算或115年\n萬元，請大會同意先行墊付，以上報告，敬請代表支持通過，謝謝。\n各位代表同仁對公所第3號提案是否有意見？如無意見本案照\n原案通過。\n各位代表是否要發言或臨時動議要提？若無，本次臨時會議到";

// Orbit 助理's facts as today.mjs dayFacts says them (a sample student's phone).
const ORBIT_APPS = ['weather', 'transit', 'match', 'orbit', 'money', 'vocab', 'stock', 'news', 'law', 'beats'];
const ORBIT_FACTS = [
  { id: 'f1', app: 'orbit', text: '明天（11/12 週四） 上課 08:10–16:00: 1 國文 08:10, 2 英文 09:10, 3 數學 10:10, 4 化學 11:10, 5 體育 13:10（戶外）, 6 歷史 14:10, 7 物理 15:10' },
  { id: 'f2', app: 'orbit', text: '學校: 竹東高中' },
  { id: 'f3', app: 'weather', text: '明天（11/12 週四） 天氣: 雨傘：要帶，14時起 70%' },
  { id: 'f4', app: 'weather', text: '明天（11/12 週四） 天氣: 體育課：13:10 體育，雨 60%，可能改室內' },
  { id: 'f5', app: 'vocab', text: '今天有 18 個單字該複習' },
  { id: 'f6', app: 'match', text: '追蹤的比賽: 湖人 vs 勇士, 明天（11/12 週四） 10:30，正在上第3節數學' },
  { id: 'f7', app: 'orbit', text: '11/15（週六） 放假: 國父誕辰紀念日（補假）' },
  { id: 'f8', app: 'transit', text: '常用行程: 上學 從 家 到 竹東高中' }
];
// The showcase's cards as lib/ask.mjs gives them (two of the tree's, shortened).
const SHOW_CARDS = [
  { id: 'cheap', title: '不超過額度、不花錢', text: '每天用得到，但不能每個月付錢。 服務都要錢，用多了會被收費。 能放成靜態檔案的就放，能在手機上算的就在手機上算，伺服器只做非做不可的事；一個守門員每 5 分鐘看一次帳單。 主機費 0 元，只有網址每年付一次。' },
  { id: 'team', title: '怎麼做出來的', text: 'Jay 不寫程式：他決定要做什麼、定標準、做取捨，每天在 iPhone 上試；Claude 寫程式、測試、推上去。' },
  { id: 'kit', title: '共用零件', text: '像樂高：十個 App 用同一盒積木。 改一次，十個 App 同時變好。' }
];

export const EXAMPLES = {
  'money-ask': [
    { name: 'how it was paid', input: { question: '這個月的錢都怎麼付出去的', facts: MONEY_FACTS } },
    { name: 'card or cash', input: { question: '我用信用卡刷了多少', facts: MONEY_FACTS } },
    { name: 'food this month', input: { question: '這個月吃飯花多少？', facts: MONEY_FACTS } },
    { name: 'up on last month', input: { question: '比上個月多花在哪？', facts: MONEY_FACTS } },
    { name: 'budget', input: { question: '預算還剩多少？', facts: MONEY_FACTS } },
    { name: 'not in the facts', input: { question: '我去年花最多的是哪個月？', facts: MONEY_FACTS } },
    { name: 'english', input: { question: 'Where did most of my money go this month?', facts: MONEY_FACTS, lang: 'en' } },
  ],

  'transit-say': [
    { name: 'arrive by tomorrow', input: { text: '明天早上八點前到台大醫院', now: '2026-11-11 10:00 週三', places: ['家', '學校'] } },
    { name: 'from a saved place', input: { text: '下午三點半從學校去台北車站', now: '2026-11-11 10:00 週三', places: ['家', '學校'] } },
    { name: 'home tonight', input: { text: '晚上七點回家', now: '2026-11-11 10:00 週三', places: ['家', '學校'] } },
    { name: 'a weekday', input: { text: '週六十點出發去淡水老街', now: '2026-11-11 10:00 週三', places: [] } },
    { name: 'no place', input: { text: '明天早上八點', now: '2026-11-11 10:00 週三', places: [] } },
  ],

  'sports-ask': [
    { name: 'my places', input: { question: '我的球隊排第幾？', facts: SPORTS_FACTS } },
    { name: 'next game', input: { question: '湖人下一場什麼時候？', facts: SPORTS_FACTS } },
    { name: 'last results', input: { question: '最近打得怎麼樣？', facts: SPORTS_FACTS } },
    { name: 'today', input: { question: '今天有什麼比賽？', facts: SPORTS_FACTS } },
    { name: 'the table', input: { question: '西區誰第一？', facts: SPORTS_FACTS } },
    { name: 'not followed', input: { question: '熱火排第幾？', facts: SPORTS_FACTS } },
    { name: 'english', input: { question: 'When do my teams play next?', facts: SPORTS_FACTS, lang: 'en' } },
  ],

  'sec-lesson': [
    { name: 'sold below the best close', input: { facts: 'Stock: 台積電\n[pl] Result: 5000 TWD (+5%)\n[buy] Average cost a share: 1000\n[sell] Sold at: 1050\n[held] Held: 10 days\n[high] Best close while held: 1100 on 10/05 (+10% on cost)\n[low] Worst close while held: 980 on 10/03 (-2% on cost)\n[market] The market over the same days: +5%\n[costs] Fees and tax on the sale: 465 TWD' } },
    { name: 'a loss in a rising market', input: { facts: 'Stock: 長榮\n[pl] Result: -12400 TWD (-8.3%)\n[buy] Average cost a share: 186.5\n[sell] Sold at: 171\n[held] Held: 41 days\n[high] Best close while held: 192 on 09/22 (+2.9% on cost)\n[low] Worst close while held: 168.5 on 10/28 (-9.7% on cost)\n[market] The market over the same days: +3.1%\n[costs] Fees and tax on the sale: 790 TWD' } },
    { name: 'a quick day trade, costs ate it', input: { facts: 'Stock: 鴻海\n[pl] Result: 120 TWD (+0.1%)\n[buy] Average cost a share: 210\n[sell] Sold at: 211\n[held] Held: 0 days\n[costs] Fees and tax on the sale: 380 TWD' } },
    { name: 'english', input: { lang: 'en', facts: 'Stock: Apple\n[pl] Result: 84.2 USD (+4.6%)\n[buy] Average cost a share: 182.4\n[sell] Sold at: 190.8\n[held] Held: 63 days\n[high] Best close while held: 199.1 on 10/14 (+9.2% on cost)\n[low] Worst close while held: 176 on 09/05 (-3.5% on cost)\n[market] The market over the same days: +6.8%\n[costs] Fees and tax on the sale: 1.2 USD' } }
  ],
  // (Real filings of 11-10, as builders/filings.js parsed them.)
  'sec-filing': [
    {"name": "quarter loss", "input": {"title": "公告本公司董事會通過115年第2季合併財務報告", "name": "國慶科技", "rows": [["財務報告或年度自結財務資訊報導期間起訖日期", "115/01/01-115/09/30"], ["今年累計營業收入(仟元)", "1,227,508"], ["今年累計營業毛利(毛損)(仟元)", "−48,339"], ["今年累計營業利益(損失)(仟元)", "−185,240"], ["今年累計稅前淨利(淨損)(仟元)", "−193,085"], ["今年累計本期淨利(淨損)(仟元)", "−191,479"], ["今年累計歸屬於母公司業主淨利(損)(仟元)", "−191,479"], ["今年累計基本每股盈餘(損失)(元)", "−1.04"], ["期末總資產(仟元)", "2,848,896"], ["期末總負債(仟元)", "1,307,981"], ["期末歸屬於母公司業主之權益(仟元)", "1,540,915"]]}},
    {"name": "dividend dates", "input": {"title": "公告本公司115年第三季度現金股利除息基準日", "name": "桂盟", "rows": [["董事會、股東會決議或公司決定日期", "115/11/10"], ["除權、息類別", "除息"], ["普通股發放股利種類及金額", "普通股現金股利新台幣125,244,000元每股約配發0.9939939元"], ["除權（息）交易日", "116/03/18"], ["最後過戶日", "116/03/19"], ["停止過戶起始日期", "116/03/24"], ["停止過戶截止日期", "116/03/24"], ["除權（息）基準日", "116/03/24"], ["普通股現金股利發放日期", "116/04/16"], ["現金股利之一部或全部是否以外幣發放", "否"]]}},
    {"name": "guarantee for a subsidiary", "input": {"title": "公告子公司背書保證達公開發行公司資金貸與及背書保證處理準則第25條第1項第4款之規定", "name": "百和", "rows": [["公司名稱", "越南百宏責任有限公司"], ["與提供背書保證公司之關係", "間接持有表決權之股份超過百分之五十之子公司"], ["背書保證之限額(仟元)", "18,242,885"], ["原背書保證之餘額(仟元)", "11,289,496"], ["本次新增背書保證之金額(仟元)", "1,347,875"], ["迄事實發生日止背書保證餘額(仟元)", "12,637,371"], ["被背書保證公司實際動支金額(仟元)", "7,288,519"], ["", "續約之融資額度"], ["", "董事會提前召開，致本次續約融資額度與現有融資額度重複"], ["價值(仟元)", "0"], ["資本(仟元)", "6,911,450"], ["累積盈虧金額(仟元)", "-3,291,119"]]}},
    {"name": "loan to an affiliate", "input": {"title": "代子公司永豐餘家品(昆山)有限公司公告資金貸與事項", "name": "永豐實", "rows": [["公司名稱", "永豐餘投資有限公司"], ["與資金貸與他人公司之關係", "關係企業公司"], ["資金貸與之限額(仟元)", "722,772"], ["原資金貸與之餘額(仟元)", "0"], ["本次新增資金貸與之金額(仟元)", "361,386"], ["是否為董事會授權董事長對同一貸與對象分次撥貸或循環動用之資金", "否"], ["迄事實發生日止資金貸與餘額(仟元)", "361,386"], ["本次新增資金貸與之原因", "資金池業務到期，重新訂定資金貸與限額"], ["價值(仟元)", "0"], ["資本(仟元)", "3,614,270"], ["累積盈虧金額(仟元)", "-1,406,514"], ["計息方式", "年利率2.5%"]]}},
    {"name": "clearing up a report", "input": {"title": "澄清經濟日報115年11月10日報導", "name": "台達電", "rows": [["公司名稱", "台達電子工業股份有限公司"], ["傳播媒體名稱", "經濟日報"], ["報導內容", "外界預期，台達電本季營收力拚連三季改寫新猷，單季營收將首度突破2,000億元大關"]]}},
    {"name": "english", "input": {"title": "公告本公司董事會通過115年第2季合併財務報告", "name": "國慶科技", "rows": [["財務報告或年度自結財務資訊報導期間起訖日期", "115/01/01-115/09/30"], ["今年累計營業收入(仟元)", "1,227,508"], ["今年累計營業毛利(毛損)(仟元)", "−48,339"], ["今年累計營業利益(損失)(仟元)", "−185,240"], ["今年累計稅前淨利(淨損)(仟元)", "−193,085"], ["今年累計本期淨利(淨損)(仟元)", "−191,479"], ["今年累計歸屬於母公司業主淨利(損)(仟元)", "−191,479"], ["今年累計基本每股盈餘(損失)(元)", "−1.04"], ["期末總資產(仟元)", "2,848,896"], ["期末總負債(仟元)", "1,307,981"], ["期末歸屬於母公司業主之權益(仟元)", "1,540,915"]], "lang": "en"}}
  ],

  'class-ask': [
    { name: 'earliest home', input: { question: '這週哪天最早放學？', facts: 'Now: 2026-11-11 (Wed) 10:30.\n2026-11-11 Wed: 1 08:10-09:00 國文; 2 09:10-10:00 英文; 3 10:10-11:00 數學; 4 11:10-12:00 物理; 5 13:10-14:00 體育 (outdoors); 6 14:10-15:00 歷史; 7 15:10-16:00 自習\n2026-11-12 Thu: 1 08:10-09:00 數學; 2 09:10-10:00 化學; 3 10:10-11:00 英文; 4 11:10-12:00 國文; 5 13:10-14:00 地理; 6 14:10-15:00 美術\n2026-11-13 Fri: 1 08:10-09:00 英文; 2 09:10-10:00 數學; 3 10:10-11:00 生物; 4 11:10-12:00 公民; 5 13:10-14:00 班會\n2026-11-16 Mon: 1 08:10-09:00 數學; 2 09:10-10:00 國文; 3 10:10-11:00 英文; 4 11:10-12:00 物理; 5 13:10-14:00 化學; 6 14:10-15:00 音樂; 7 15:10-16:00 體育 (outdoors)' } },
    { name: 'next PE', input: { question: '下次體育課是什麼時候', facts: 'Now: 2026-11-11 (Wed) 10:30.\n2026-11-11 Wed: 1 08:10-09:00 國文; 2 09:10-10:00 英文; 3 10:10-11:00 數學; 4 11:10-12:00 物理; 5 13:10-14:00 體育 (outdoors); 6 14:10-15:00 歷史; 7 15:10-16:00 自習\n2026-11-12 Thu: 1 08:10-09:00 數學; 2 09:10-10:00 化學; 3 10:10-11:00 英文; 4 11:10-12:00 國文; 5 13:10-14:00 地理; 6 14:10-15:00 美術\n2026-11-13 Fri: 1 08:10-09:00 英文; 2 09:10-10:00 數學; 3 10:10-11:00 生物; 4 11:10-12:00 公民; 5 13:10-14:00 班會\n2026-11-16 Mon: 1 08:10-09:00 數學; 2 09:10-10:00 國文; 3 10:10-11:00 英文; 4 11:10-12:00 物理; 5 13:10-14:00 化學; 6 14:10-15:00 音樂; 7 15:10-16:00 體育 (outdoors)' } },
    { name: 'count English', input: { question: '接下來幾天有幾節英文？', facts: 'Now: 2026-11-11 (Wed) 10:30.\n2026-11-11 Wed: 1 08:10-09:00 國文; 2 09:10-10:00 英文; 3 10:10-11:00 數學; 4 11:10-12:00 物理; 5 13:10-14:00 體育 (outdoors); 6 14:10-15:00 歷史; 7 15:10-16:00 自習\n2026-11-12 Thu: 1 08:10-09:00 數學; 2 09:10-10:00 化學; 3 10:10-11:00 英文; 4 11:10-12:00 國文; 5 13:10-14:00 地理; 6 14:10-15:00 美術\n2026-11-13 Fri: 1 08:10-09:00 英文; 2 09:10-10:00 數學; 3 10:10-11:00 生物; 4 11:10-12:00 公民; 5 13:10-14:00 班會\n2026-11-16 Mon: 1 08:10-09:00 數學; 2 09:10-10:00 國文; 3 10:10-11:00 英文; 4 11:10-12:00 物理; 5 13:10-14:00 化學; 6 14:10-15:00 音樂; 7 15:10-16:00 體育 (outdoors)' } },
    { name: 'not in facts', input: { question: '期中考是哪天？', facts: 'Now: 2026-11-11 (Wed) 10:30.\n2026-11-11 Wed: 1 08:10-09:00 國文; 2 09:10-10:00 英文; 3 10:10-11:00 數學; 4 11:10-12:00 物理; 5 13:10-14:00 體育 (outdoors); 6 14:10-15:00 歷史; 7 15:10-16:00 自習\n2026-11-12 Thu: 1 08:10-09:00 數學; 2 09:10-10:00 化學; 3 10:10-11:00 英文; 4 11:10-12:00 國文; 5 13:10-14:00 地理; 6 14:10-15:00 美術\n2026-11-13 Fri: 1 08:10-09:00 英文; 2 09:10-10:00 數學; 3 10:10-11:00 生物; 4 11:10-12:00 公民; 5 13:10-14:00 班會\n2026-11-16 Mon: 1 08:10-09:00 數學; 2 09:10-10:00 國文; 3 10:10-11:00 英文; 4 11:10-12:00 物理; 5 13:10-14:00 化學; 6 14:10-15:00 音樂; 7 15:10-16:00 體育 (outdoors)' } }
  ],
  // (A picture by address: ai.js aiTry reads it and sends it as the phone would.)
  'class-book': [
    { name: 'contact book page', input: { imageUrl: 'https://orbit.jaypengx.com/Orbit-Core/test/class-book.jpg', today: '2026-11-11', subjects: ['國文', '英文', '數學', '物理', '化學', '生物', '歷史', '地理', '公民', '體育', '美術', '音樂', '班會'] } }
  ],
  'class-plan': [
    { name: 'midterm, scopes typed', input: { today: '2026-11-11', exam: '第二次段考', subjects: [{ name: '數學', scope: '2-1~3-2', n: 5, exam: '2026-11-26', weak: true }, { name: '英文', scope: 'L4-L6、文法：關係代名詞', n: 4, exam: '2026-11-26' }, { name: '化學', scope: 'Ch3 化學反應、Ch4 酸鹼', n: 3, exam: '2026-11-27' }, { name: '國文', scope: '', n: 3, exam: '2026-11-27' }] } },
    { name: 'one quiz', input: { today: '2026-11-11', exam: '英文 L4 單字小考', subjects: [{ name: '英文', scope: 'L4 單字', n: 2, exam: '2026-11-13' }] } },
    { name: 'english', input: { today: '2026-11-11', exam: 'Midterm', lang: 'en', subjects: [{ name: 'Physics', scope: 'Ch1–Ch2 motion', n: 3, exam: '2026-11-26' }] } }
  ],
  'class-news': [
    {
      name: 'a senior high’s feed',
      input: {
        school: 'www.example.edu.tw',
        today: '2026-11-11',
        items: [
          { id: 'n1', title: '【轉知】伊甸社會福利基金會2027伊甸服務學習寒假營隊', date: '2026-11-10', desc: '報名時間：於115年11月9日起開放營隊報名' },
          { id: 'n2', title: '【轉知】南華大學116學年度特殊選才學系探索線上說明會', date: '2026-11-10' },
          { id: 'n3', title: '【進修部】116學年度四技二專甄選入學、四技二專技優入學及二技技優入學招生群類別採計技藝技能競賽優勝對照表', date: '2026-11-10' },
          { id: 'n4', title: '「2027第23屆科技教育研究與發展學術研討會」論文徵稿資訊', date: '2026-11-09' },
          { id: 'n5', title: '【轉知】115年度生成式AI演算法認證暨競賽活動辦法，歡迎同學報名參加。', date: '2026-11-06' },
          { id: 'n6', title: '<公告>「教育人員任用條例施行細則」第11條、第27條，業經教育部修正發布', date: '2026-11-06' },
          { id: 'n7', title: '115學年度第1學期第2次期中考考程表', date: '2026-11-10', unit: '教務處' },
          { id: 'n8', title: '【全校】學習歷程檔案115-1課程學習成果上傳期程', date: '2026-11-05' },
          { id: 'n9', title: '11/27(五)全校晚自習暫停乙次(當日請於17：30離開校園)', date: '2026-11-09' },
          { id: 'n10', title: '公告本校115學年度第2學期減免學雜費申請', date: '2026-11-09' },
          { id: 'n11', title: '高三模擬考 12/3、12/4 舉行，請同學準時到考', date: '2026-11-08', unit: '教務處' },
          { id: 'n12', title: '午餐廚房設備採購案招標公告', date: '2026-11-04', unit: '總務處' }
        ]
      }
    }
  ],
  'money-month': [
    { name: 'shopping grew', input: { facts: 'Month: 2026-10. Amounts are NT$.\nSpent 32103; the month before 20703\nIncome 104000; kept 69% of it\nMost went to 購物: 12169\nUp most on the month before: 購物 5443 → 12169 (more 6726)\nWent most often to 路易莎: 6 times, 534' } },
    { name: 'student, little income', input: { facts: 'Month: 2026-10. Amounts are NT$.\nSpent 4380; the month before 3920\nIncome 2000; spent more than that\nMost went to 餐飲: 2650\nUp most on the month before: 餐飲 2210 → 2650 (more 440)\nWent most often to 7-ELEVEN: 14 times, 1120' } }
  ],
  'money-say': [
    money('free-form hotpot', '跟同學吃火鍋花了三百五'),
    money('a day in one line', '早上麥當勞 89 中午 自助餐 95 晚上跟朋友吃拉麵 260 用 line pay 付的'),
    money('meal unclear', '便當 110'),
    money('meal answered', '便當 110', [{ q: '這是午餐還是晚餐？', a: '晚餐' }]),
    money('income and spend', '媽給我零用錢兩千，買了一本英文單字書 420'),
    money('yesterday, card', '昨天 uniqlo 外套 1290 刷台新'),
    money('not money', '明天要考數學')
  ],
  'words-check': [
    { name: 'right', input: { word: 'abandon', meaning: '放棄；拋棄', sentence: 'The sailors had to abandon the sinking ship.' } },
    { name: 'wrong form', input: { word: 'abandon', meaning: '放棄；拋棄', sentence: 'He abandon his dream after he fail the exam.' } },
    { name: 'wrong meaning', input: { word: 'novel', meaning: '新奇的 (adj.)', sentence: 'I read a novel last night.' } },
    { name: 'word missing', input: { word: 'reluctant', meaning: '不情願的', sentence: 'She did not want to go to school.' } },
    { name: 'english phone', input: { word: 'brief', meaning: '簡短的', sentence: 'Please make your speech more brief.', lang: 'en' } }
  ],
  'words-chat': [
    { name: 'first line, two words used', input: { words: ['reluctant', 'abandon', 'brief', 'deserve'], turns: [{ who: 'ai', text: 'Hi! How was school today? Tell me something that happened.' }, { who: 'me', text: 'I was reluctant to go to school because we had a test, and the teacher gave a brief talk.' }] } },
    { name: 'a mistake to fix', input: { words: ['reluctant', 'abandon', 'brief', 'deserve'], used: ['reluctant'], turns: [{ who: 'ai', text: 'Hi! How was school today?' }, { who: 'me', text: 'I was reluctant to go.' }, { who: 'ai', text: 'Oh no, why? Did something make you want to give up?' }, { who: 'me', text: 'I want abandon my math homework yesterday because it too hard.' }] } },
    { name: 'english phone', input: { words: ['generous', 'compete'], lang: 'en', turns: [{ who: 'ai', text: 'What did you do last weekend?' }, { who: 'me', text: 'My uncle is very generous, he buyed me a new bike.' }] } }
  ],
  'words-cards': [
    {
      name: 'six words, easy to hard',
      input: { words: [{ w: 'able', zh: 'adj. 能夠的' }, { w: 'review', zh: 'v. 複習；檢討' }, { w: 'abandon', zh: 'v. 放棄、拋棄' }, { w: 'opt', zh: 'v. 選擇' }, { w: 'reluctant', zh: 'adj. 不情願的' }, { w: 'ambiguous', zh: 'adj. 模稜兩可的' }] }
    }
  ],
  'f1-story': [
    { name: 'brazil 2026, rain to slicks and back', input: { facts: "Grand Prix race: São Paulo Grand Prix, 71 laps, track 22°C.\nResult (place, driver, team, grid slot, stops, tyres and laps on each):\n1 Lando Norris #4 (McLaren), from 1, 3 stops: inter 16, soft 33, soft 13, inter 9\n2 Max Verstappen #1 (Red Bull Racing), from 21, 3 stops: inter 17, soft 28, soft 17, inter 9, +14.602\n3 Isack Hadjar #6 (Red Bull Racing), from 5, 3 stops: inter 16, soft 34, soft 12, inter 9, +24.485\n4 George Russell #63 (Mercedes), from 7, 2 stops: inter 16, soft 45, inter 10, +33.991\n5 Kimi Antonelli #12 (Mercedes), from 2, 3 stops: inter 17, soft 36, soft 9, inter 9, +36.017\n6 Oscar Piastri #81 (McLaren), from 10, 3 stops: inter 16, soft 35, soft 11, inter 9, +56.475\nBiggest climbs: Max Verstappen #1 21 → 2; Lewis Hamilton #44 20 → 9; Charles Leclerc #16 14 → 7\nDropped back: Liam Lawson #30 3 → 8; Nico Hulkenberg #27 4 → 10\nLed (laps): Antonelli #12 1–19, Norris #4 20–49, Antonelli #12 50–53, Norris #4 54–71\nRetired: Lance Stroll #18 (lap 30), Valtteri Bottas #77 (lap 1)\nFastest lap: Kimi Antonelli #12 1:12.689 on lap 55" } },
    { name: 'sprint, safety car, no stops', input: { facts: "Sprint: Qatar Grand Prix, 19 laps, track 31°C.\nResult (place, driver, team, grid slot, stops, tyres and laps on each):\n1 Oscar Piastri #81 (McLaren), from 1, 0 stops: medium 19\n2 George Russell #63 (Mercedes), from 3, 0 stops: medium 19, +1.215\n3 Lando Norris #4 (McLaren), from 2, 0 stops: medium 19, +2.904\n4 Max Verstappen #1 (Red Bull Racing), from 6, 0 stops: medium 19, +4.501\n5 Yuki Tsunoda #22 (Red Bull Racing), from 4, 0 stops: medium 19, +6.333\n6 Kimi Antonelli #12 (Mercedes), from 5, 0 stops: medium 19, +7.120\nLed (laps): Piastri #81 1–19\nRetired: Pierre Gasly #10 (lap 2)\nTrack: lap 2 safety car deployed\nFastest lap: Lando Norris #4 1:23.120 on lap 17" } }
  ],
  'sports-preview': [
    {"name": "mavericks at timberwolves", "input": {"facts": "NBA (basketball)\nTeams: {t:16} = home (Minnesota Timberwolves); {t:6} = away (Dallas Mavericks)\nLeaders (already shown on the card): {p:4432816} 18.3 Points ({t:16}); {p:5041939} 25.9 Points ({t:6})\n{t:16} rested 4 days since its last game\n{t:6} rested 3 days since its last game\nPreview (AP):\nDallas visits the Minnesota Timberwolves after {p:5041939} scored 43 points in the Mavericks' 125-122 victory over the Indiana Pacers .\nOut for {t:16}: {p:4594268} Out (Knee), due back 2026-12-21; {p:3934673} Out (Achilles), due back 2027-04-02\nOut for {t:6}: {p:5279129} Out (Knee), due back 2026-11-12; {p:5148538} Out (Heel), due back 2026-11-12; {p:4683688} Out (Foot), due back 2026-11-12\nPlayers: {p:3934673} = Donte DiVincenzo ({t:16}); {p:4432816} = LaMelo Ball ({t:16}); {p:4594268} = Anthony Edwards ({t:16}); {p:4683688} = Dereck Lively II ({t:6}); {p:5041939} = Cooper Flagg ({t:6}); {p:5148538} = Tarik Biberovic ({t:6}); {p:5279129} = Sergio de Larrea ({t:6})"}},
    {"name": "fulham at man city", "input": {"facts": "Premier League (soccer)\nTeams: {t:382} = home (Manchester City); {t:370} = away (Fulham)\n{t:382} rested 14 days since its last game\n{t:370} rested 14 days since its last game\n{t:382} last games, newest first (score home side first): L 3-1 at NFO (Premier League), W 3-2 at RBL (UEFA Champions League), L 1-0 v BHA (Premier League), W 2-2 v BHA (Carabao Cup), L 2-1 at AVL (Premier League)\n{t:370} last games, newest first (score home side first): D 1-1 v NEW (Premier League), D 1-1 at AVL (Premier League), L 1-0 v CRY (Carabao Cup), W 1-0 at COV (Premier League), W 1-0 v HUL (Premier League)\nTable (20 teams): {t:382} 3rd, 21 pts; {t:370} 15th, 10 pts\nIf {t:382} win: up to 2nd, from 3rd\nIf {t:370} win: up to 10th, from 15th\n{t:382} 6 pts behind the leader\n{t:370} 2 pts above the bottom three (relegation)"}}
  ],
  'sports-recap': [
    {"name": "nuggets at rockets", "input": {"facts": "NBA (basketball)\nTeams: {t:10} = home (Houston Rockets); {t:7} = away (Denver Nuggets)\nLead changes: 3; ties: 2\n{t:10} ahead for good: Q3 4:14, 62-60, on {p:4433192}'s play (Tari Eason makes two point shot (Marcus Smart assists))\nBiggest run: {t:10} 14-0, Q1 2.6 to Q2 8:08 (from 29-24 for them), {p:4433192} 7 of them\nPlays that swung the win chance most:\n3rd Quarter 5:16 Kevin Durant misses 12-foot pullup jump shot (home win chance -7 pts)\n3rd Quarter 7:17 Aaron Gordon misses 1-foot tip shot (home win chance +18 pts)\n4th Quarter 8:48 Alperen Sengun shooting foul (home win chance -6 pts)\nPlayers: {p:3202} = Kevin Durant; {p:2990992} = Marcus Smart; {p:3064290} = Aaron Gordon; {p:4433192} = Tari Eason; {p:4871144} = Alperen Sengun"}},
    {"name": "pacers at mavericks", "input": {"facts": "NBA (basketball)\nTeams: {t:6} = home (Dallas Mavericks); {t:11} = away (Indiana Pacers)\nLead changes: 5; ties: 6\n{t:6} came back from 13 down (50-63, Q2 1:36)\n{t:6} ahead for good: Q4 9:36, 98-97, on {p:6442}'s play (Kyrie Irving makes 23-foot three point jumper (Caleb Martin assists))\nBiggest run: {t:11} 13-0, Q2 5:18 to Q2 3:08 (from 45-48 for them), {p:3149673} 10 of them\n{t:6} trailed by 3 going into the Q4\nPlays that swung the win chance most:\n4th Quarter 38.6 Naji Marshall misses free throw 2 of 2 (home win chance -17 pts)\n4th Quarter 20.6 Aaron Nesmith makes 24-foot three pointer (Pascal Siakam assists) (home win chance -16 pts)\n4th Quarter 18.0 Aaron Nesmith personal foul (home win chance +16 pts)\nPlayers: {p:6442} = Kyrie Irving; {p:3138160} = Caleb Martin; {p:3149673} = Pascal Siakam; {p:4278594} = Naji Marshall; {p:4396909} = Aaron Nesmith"}},
    {"name": "pelicans at warriors", "input": {"facts": "NBA (basketball)\nTeams: {t:9} = home (Golden State Warriors); {t:3} = away (New Orleans Pelicans)\nLead changes: 2; ties: 0\n{t:9} ahead for good: Q1 10:49, 5-3, on {p:5175737}'s play (Yaxel Lendeborg makes 26-foot three pointer)\nBiggest run: {t:9} 13-0, Q3 4:39 to Q3 2:26 (from 90-61 for them), {p:3975} 7 of them\n{t:9} won the Q3 40-22\nPlays that swung the win chance most:\n1st Quarter 11:02 Jeremiah Fears makes 26-foot three point jumper (Saddiq Bey assists) (home win chance -4 pts)\n1st Quarter 10:49 Yaxel Lendeborg makes 26-foot three pointer (home win chance +4 pts)\n1st Quarter 7:50 Stephen Curry makes 25-foot three point jumper (Draymond Green assists) (home win chance +3 pts)\nPlayers: {p:3975} = Stephen Curry; {p:6589} = Draymond Green; {p:4397136} = Saddiq Bey; {p:5144091} = Jeremiah Fears; {p:5175737} = Yaxel Lendeborg"}}
  ],
  'beats-say': [
    { name: 'scene', input: { text: '考完試想放空一下的感覺' } },
    { name: 'place', input: { text: '海邊夕陽' } },
    { name: 'sound', input: { text: '有點像周杰倫那種中國風但要帶節奏' } },
    { name: 'nonsense', input: { text: '明天幾點開會' } }
  ],
  'orbit-ask': [
    { name: 'tomorrow', input: { q: '明天要注意什麼', now: '2026-11-11 21:00 Wed', facts: ORBIT_FACTS, apps: ORBIT_APPS } },
    { name: 'today', input: { q: '今天還有什麼事', now: '2026-11-11 21:00 Wed', facts: ORBIT_FACTS, apps: ORBIT_APPS } },
    { name: 'for an app', input: { q: '怎麼去台北車站', now: '2026-11-11 21:00 Wed', facts: ORBIT_FACTS, apps: ORBIT_APPS } },
    { name: 'not there', input: { q: '我下週考試考什麼', now: '2026-11-11 21:00 Wed', facts: ORBIT_FACTS, apps: ORBIT_APPS } },
    { name: 'english', input: { q: 'What should I watch out for tomorrow?', now: '2026-11-11 21:00 Wed', facts: ORBIT_FACTS, apps: ORBIT_APPS, lang: 'en' } }
  ],
  'showcase-ask': [
    { name: 'free', input: { q: '怎麼做到不花錢？', cards: SHOW_CARDS } },
    { name: 'who codes', input: { q: 'Jay 自己寫程式嗎？', cards: SHOW_CARDS } },
    { name: 'not there', input: { q: '這個 App 要多少錢？', cards: SHOW_CARDS } }
  ],
  'weather-ask': [
    { name: 'mountain', input: { question: '週六合歡山會下雪嗎', place: '合歡山' } },
    { name: 'sight', input: { question: '明天日月潭會下雨嗎', place: '日月潭' } },
    { name: 'school', input: { question: '明天竹北高中熱不熱', place: '竹北高中' } },
    { name: 'nonsense', input: { question: '明天阿巴阿巴會下雨嗎', place: '阿巴阿巴' } }
  ],
  'news-sides': [
    { name: 'taiwan two', input: { stories: [{"id": "1v8c6to", "region": "tw", "sides": {"g": ["蔣萬安要沈伯洋為兒虐道歉！律師喊「1原因」是應該道歉", "兒虐攻防不讓步！蔣萬安再批沈伯洋：不認錯的勇氣是哪來的？", "蔣萬安：接受廖玉蕙道歉、但不知道沈伯洋有啥理由不道歉"], "c": ["沈伯洋兒虐數字「用猜的」拒認錯 蔣萬安怒了：這勇氣哪來的？", "曾為兒虐案、市府不足處致歉 蔣萬安：沈伯洋永不認錯勇氣哪來的？", "兒虐數字「用猜的」遭逼道歉 沈伯洋回擊：該道歉的是蔣萬安", "台北市長選戰／蔣萬安要求沈伯洋為兒虐說道歉 沈：該道歉的是現任市長"], "b": ["合體張善政掃街延三夜市人潮擠爆！蔣萬安喊話沈伯洋：永不認錯的勇氣從哪來？", "沈伯洋指要道歉是他 蔣萬安反批兒虐用猜的「永不認錯勇氣哪來」", "沈伯洋不為猜兒虐數道歉還反嗆 蔣萬安：永不認錯的勇氣哪來的"]}}, {"id": "181cz57", "region": "tw", "sides": {"b": ["遭提案彈劾 赫塞斯強硬反擊"], "c": ["美防長遭自家人彈劾！赫格塞斯轟「鬧劇必敗」：再來一次仍會開戰", "美戰爭部長赫格塞斯遭同黨議員發動彈劾 稱是必敗鬧劇", "美防長赫格塞斯斥自家人彈劾他是「鬧劇」 堅稱伊朗戰爭是正確之舉", "控未經國會授權對伊朗動武 眾議員對赫格塞斯提彈劾案"], "g": ["美防長被同黨議員提彈劾 赫格塞斯：鬧劇終將失敗", "指控赫格塞斯違憲戰爭涉「八大罪」 美共和黨人提案彈劾"]}}] } },
    { name: 'world', input: { stories: [{"id": "1iag6xn", "region": "intl", "sides": {"r": ["Democrats rally behind GOP lawmaker's Hegseth impeachment push, signal more to come in Jan", "Hegseth ties impeachment efforts against him to attacks on Trump and troops", "Vance: Question of Hegseth Impeachable Crimes 'Absurd'", "Pete Hegseth: Massie's Impeachment Effort Is a 'Political Spectacle,' 'Farce'"], "c": ["Massie Is Giving Over 300 Civilian War Dead a Voice In Hegseth's Impeachment", "Explainer: How would impeaching Pentagon chief Hegseth work?", "Pete Hegseth’s Low-T Tirade Against Impeachment: Dissected", "'It's a farce': Hegseth's defiant response to impeachment effort"], "l": ["Why Pete Hegseth Faces Impeachment", "Vance says Hegseth impeachment vote \"isn't about Iran\"", "As Pete Hegseth faces impeachment vote, a reminder about that military testosterone plan", "Hegseth Calls Massie Impeachment Bid an Attack on Troops"]}}] } }
  ],
  'news-lines': [
    {
      name: 'both ways',
      input: {
        stories: [
          { id: 's1', lang: 'en', heads: ['立法院三讀通過電業法修正案 再生能源售電門檻放寬', '電業法修法三讀 綠電業者售電更彈性', '再生能源售電鬆綁 電業法三讀'] },
          { id: 's2', lang: 'zh', heads: ['Fed holds rates steady, signals two cuts in 2027', 'Federal Reserve keeps rates unchanged, sees two cuts next year'] }
        ]
      }
    }
  ],
  // Law: the pictures are made-up contracts with planted faults (site/ai-try/), served by this repo's site.
  'law-contract-read': [
    { name: 'lease photo', input: { files: [{ url: 'https://orbit.jaypengx.com/Orbit-Core/ai-try/contract-lease.jpg', mime_type: 'image/jpeg' }] } },
    { name: 'job photo', input: { files: [{ url: 'https://orbit.jaypengx.com/Orbit-Core/ai-try/contract-job.jpg', mime_type: 'image/jpeg' }] } }
  ],
  'law-contract': [
    { name: 'lease, tenant', input: { kind: 'rent', side: '承租人', who: '房客', title: '房屋租賃契約書', clauses: LEASE } },
    { name: 'job, minor worker', input: { kind: 'work', side: '乙方', who: '員工', minor: true, title: '兼職人員工作契約', clauses: JOB } },
    { name: 'pledge, english', input: { kind: 'pledge', side: '立書人', who: '學生', lang: 'en', title: '切結書', clauses: [{ n: '一', text: '本人自願參加本次校外活動，活動期間如有任何意外或傷害，概由本人自行負責，與主辦單位無涉，絕無異議。' }, { n: '二', text: '本人同意主辦單位得將活動照片及本人姓名用於宣傳，不另支付報酬。' }] } }
  ],
  'law-minutes': [
    { name: '伸港, results in the speeches', input: { town: '彰化縣伸港鄉民代表會', session: '第21屆第11次臨時會', text: MINUTES_SHENGANG } }
  ],
  'law-weekly': [
    {
      name: 'bills and a rule',
      input: {
        items: [
          { id: '11:02513', kind: 'bill', name: '食品安全衛生管理法', about: '為了強化對業者食品安全查驗分工與合作管理機制、完善食品安全防護體系以保障國民健康；現行法令規定，食品業者若發現其產品有危害衛生安全之虞時，除應主動採取因應措施外，並同步通報主管機關', arts: ['第22條（8 案）', '第7條（3 案）'] },
          { id: '11:01191', kind: 'bill', name: '都市更新條例', about: '為了協助民眾推動自主都更，放寬災後重建及自主都更；為了提高老舊房屋所有權人參與都更之意願', arts: [] },
          { id: 'K0040075@20261030', kind: 'law', name: '酒駕毒駕防制教育及酒癮毒品戒癮治療實施管理辦法', about: '', arts: ['第2條：…曾依本條例第三十五條【刪去：第一項第一款、第二項至第五項】…執照前一年內完成酒駕【毒駕】…除依前項規定完成酒駕【毒駕】', '第3條：…酒駕【毒駕】…經公路主管機關認可之【刪去：民營】…以上學校辦理之。酒駕【毒駕】', '第6條：…車駕駛人申請參加酒駕【毒駕】…校繳交費用。接受酒駕【毒駕】'] }
        ]
      }
    }
  ]
};
