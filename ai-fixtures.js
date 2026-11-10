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

const MONEY_FACTS = `Today: 2026-11-10. Amounts are NT$.
Book starts: 2026-07-08
2026-11 (to 2026-11-10): spent 15879, income 1860
  spent by category: 居住 8000 (房租房貸 8000); 購物 3233 (服飾美妝 2043, 日用品 682); 數位 1940 (遊戲 1290, 工具訂閱 650); 餐飲 1814 (午餐 942, 飲料點心 227); 娛樂 677 (休閒 677); 交通 190 (搭車 190); 稅費 25 (手續費 25)
  income by category: 投資 1860
  places seen twice or more: Uniqlo 2043 (2 times); 全聯 682 (2 times); 威秀 677 (2 times); 路易莎 227 (3 times)
  largest: 11-08 房租 8000; 11-04 Steam 1290; 11-05 Uniqlo 1025
2026-10: spent 32103, income 104000
  spent by category: 購物 12169 (服飾美妝 5058, 日用品 2648); 居住 8000 (房租房貸 8000); 餐飲 7423 (午餐 7066, 飲料點心 357); 交通 2605 (TPASS 2400, 搭車 205); 娛樂 1361 (休閒 1361); 數位 545 (影音串流 390, 專案維運 155)
  income by category: 薪水 104000
2026-09: spent 20703, income 52000
  spent by category: 居住 8000 (房租房貸 8000); 餐飲 6060 (午餐 6060); 購物 5443; 交通 1200 (TPASS 1200)
  income by category: 薪水 52000
Last month to the same day (2026-10-10): spent 8000
Change from last month to the same day, by category: 購物 more 3233 (0 → 3233); 數位 more 1940 (0 → 1940); 餐飲 more 1814 (0 → 1814); 娛樂 more 677 (0 → 677); 交通 more 190 (0 → 190); 稅費 more 25 (0 → 25)
This week (from 2026-11-09): spent 1173; last week: 14504
Monthly budget: 20000, left this month 4121`;

export const EXAMPLES = {
  'money-ask': [
    { name: 'food this month', input: { question: '這個月吃飯花多少？', facts: MONEY_FACTS } },
    { name: 'up on last month', input: { question: '比上個月多花在哪？', facts: MONEY_FACTS } },
    { name: 'budget', input: { question: '預算還剩多少？', facts: MONEY_FACTS } },
    { name: 'not in the facts', input: { question: '我去年花最多的是哪個月？', facts: MONEY_FACTS } },
    { name: 'english', input: { question: 'Where did most of my money go this month?', facts: MONEY_FACTS, lang: 'en' } },
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
      name: 'a national school’s feed',
      input: {
        school: 'www.ctsh.hcc.edu.tw',
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
    { name: 'brazil 2026, rain to slicks and back', input: { facts: "Grand Prix race: São Paulo Grand Prix, 71 laps, track 22°C.\nResult (place, driver, team, grid slot, stops, tyres and laps on each):\n1 Lando Norris (McLaren), from 1, 3 stops: inter 16, soft 33, soft 13, inter 9\n2 Max Verstappen (Red Bull Racing), from 21, 3 stops: inter 17, soft 28, soft 17, inter 9, +14.602\n3 Isack Hadjar (Red Bull Racing), from 5, 3 stops: inter 16, soft 34, soft 12, inter 9, +24.485\n4 George Russell (Mercedes), from 7, 2 stops: inter 16, soft 45, inter 10, +33.991\n5 Kimi Antonelli (Mercedes), from 2, 3 stops: inter 17, soft 36, soft 9, inter 9, +36.017\n6 Oscar Piastri (McLaren), from 10, 3 stops: inter 16, soft 35, soft 11, inter 9, +56.475\nBiggest climbs: Max Verstappen 21 → 2; Lewis Hamilton 20 → 9; Charles Leclerc 14 → 7\nDropped back: Liam Lawson 3 → 8; Nico Hulkenberg 4 → 10\nLed (laps): Antonelli 1–19, Norris 20–49, Antonelli 50–53, Norris 54–71\nRetired: Lance Stroll (lap 30), Valtteri Bottas (lap 1)\nFastest lap: Kimi Antonelli 1:12.689 on lap 55" } },
    { name: 'sprint, safety car, no stops', input: { facts: "Sprint: Qatar Grand Prix, 19 laps, track 31°C.\nResult (place, driver, team, grid slot, stops, tyres and laps on each):\n1 Oscar Piastri (McLaren), from 1, 0 stops: medium 19\n2 George Russell (Mercedes), from 3, 0 stops: medium 19, +1.215\n3 Lando Norris (McLaren), from 2, 0 stops: medium 19, +2.904\n4 Max Verstappen (Red Bull Racing), from 6, 0 stops: medium 19, +4.501\n5 Yuki Tsunoda (Red Bull Racing), from 4, 0 stops: medium 19, +6.333\n6 Kimi Antonelli (Mercedes), from 5, 0 stops: medium 19, +7.120\nLed (laps): Piastri 1–19\nRetired: Pierre Gasly (lap 2)\nTrack: lap 2 safety car deployed\nFastest lap: Lando Norris 1:23.120 on lap 17" } }
  ],
  'sports-recap': [
    {"name": "nuggets at rockets", "input": {"facts": "NBA (basketball)\nTeams: {t:10} = home (Houston Rockets); {t:7} = away (Denver Nuggets)\nLead changes: 3; ties: 2\n{t:10} ahead for good: Q3 4:14, 62-60, on {p:4433192}'s play (Tari Eason makes two point shot (Marcus Smart assists))\nBiggest run: {t:10} 14-0, Q1 2.6 to Q2 8:08 (from 29-24 for them), {p:4433192} 7 of them\nPlays that swung the win chance most:\n3rd Quarter 5:16 Kevin Durant misses 12-foot pullup jump shot (home win chance -7 pts)\n3rd Quarter 7:17 Aaron Gordon misses 1-foot tip shot (home win chance +18 pts)\n4th Quarter 8:48 Alperen Sengun shooting foul (home win chance -6 pts)\nPlayers: {p:3202} = Kevin Durant; {p:2990992} = Marcus Smart; {p:3064290} = Aaron Gordon; {p:4433192} = Tari Eason; {p:4871144} = Alperen Sengun"}},
    {"name": "pacers at mavericks", "input": {"facts": "NBA (basketball)\nTeams: {t:6} = home (Dallas Mavericks); {t:11} = away (Indiana Pacers)\nLead changes: 5; ties: 6\n{t:6} came back from 13 down (50-63, Q2 1:36)\n{t:6} ahead for good: Q4 9:36, 98-97, on {p:6442}'s play (Kyrie Irving makes 23-foot three point jumper (Caleb Martin assists))\nBiggest run: {t:11} 13-0, Q2 5:18 to Q2 3:08 (from 45-48 for them), {p:3149673} 10 of them\n{t:6} trailed by 3 going into the Q4\nPlays that swung the win chance most:\n4th Quarter 38.6 Naji Marshall misses free throw 2 of 2 (home win chance -17 pts)\n4th Quarter 20.6 Aaron Nesmith makes 24-foot three pointer (Pascal Siakam assists) (home win chance -16 pts)\n4th Quarter 18.0 Aaron Nesmith personal foul (home win chance +16 pts)\nPlayers: {p:6442} = Kyrie Irving; {p:3138160} = Caleb Martin; {p:3149673} = Pascal Siakam; {p:4278594} = Naji Marshall; {p:4396909} = Aaron Nesmith"}},
    {"name": "pelicans at warriors", "input": {"facts": "NBA (basketball)\nTeams: {t:9} = home (Golden State Warriors); {t:3} = away (New Orleans Pelicans)\nLead changes: 2; ties: 0\n{t:9} ahead for good: Q1 10:49, 5-3, on {p:5175737}'s play (Yaxel Lendeborg makes 26-foot three pointer)\nBiggest run: {t:9} 13-0, Q3 4:39 to Q3 2:26 (from 90-61 for them), {p:3975} 7 of them\n{t:9} won the Q3 40-22\nPlays that swung the win chance most:\n1st Quarter 11:02 Jeremiah Fears makes 26-foot three point jumper (Saddiq Bey assists) (home win chance -4 pts)\n1st Quarter 10:49 Yaxel Lendeborg makes 26-foot three pointer (home win chance +4 pts)\n1st Quarter 7:50 Stephen Curry makes 25-foot three point jumper (Draymond Green assists) (home win chance +3 pts)\nPlayers: {p:3975} = Stephen Curry; {p:6589} = Draymond Green; {p:4397136} = Saddiq Bey; {p:5144091} = Jeremiah Fears; {p:5175737} = Yaxel Lendeborg"}}
  ],
  'transit-notice': [
    { name: 'detour', input: { today: '2026-11-10', title: '307路線因道路施工改道', body: '自115年11月12日(三)22時起至11月14日(五)5時止，因忠孝西路施工，307往撫遠街方向改經中山北路行駛，暫停靠臺北車站(忠孝)站、北門站，請改至臺北車站(青島)站搭乘。' } },
    { name: 'stop', input: { today: '2026-11-10', title: '颱風停駛公告', body: '因颱風影響，本公司所有路線今日（11/10）下午4時起停駛，恢復時間另行公告。' } }
  ],
  'beats-say': [
    { name: 'scene', input: { text: '考完試想放空一下的感覺' } },
    { name: 'place', input: { text: '海邊夕陽' } },
    { name: 'sound', input: { text: '有點像周杰倫那種中國風但要帶節奏' } },
    { name: 'nonsense', input: { text: '明天幾點開會' } }
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
  ]
};
