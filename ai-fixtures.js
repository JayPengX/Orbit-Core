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
    { name: 'earliest home', input: { question: '這週哪天最早放學？', facts: 'Today: 2026-11-11 (Wed).\n2026-11-11 Wed: 1 08:10-09:00 國文; 2 09:10-10:00 英文; 3 10:10-11:00 數學; 4 11:10-12:00 物理; 5 13:10-14:00 體育 (outdoors); 6 14:10-15:00 歷史; 7 15:10-16:00 自習\n2026-11-12 Thu: 1 08:10-09:00 數學; 2 09:10-10:00 化學; 3 10:10-11:00 英文; 4 11:10-12:00 國文; 5 13:10-14:00 地理; 6 14:10-15:00 美術\n2026-11-13 Fri: 1 08:10-09:00 英文; 2 09:10-10:00 數學; 3 10:10-11:00 生物; 4 11:10-12:00 公民; 5 13:10-14:00 班會\n2026-11-16 Mon: 1 08:10-09:00 數學; 2 09:10-10:00 國文; 3 10:10-11:00 英文; 4 11:10-12:00 物理; 5 13:10-14:00 化學; 6 14:10-15:00 音樂; 7 15:10-16:00 體育 (outdoors)' } },
    { name: 'next PE', input: { question: '下次體育課是什麼時候', facts: 'Today: 2026-11-11 (Wed).\n2026-11-11 Wed: 1 08:10-09:00 國文; 2 09:10-10:00 英文; 3 10:10-11:00 數學; 4 11:10-12:00 物理; 5 13:10-14:00 體育 (outdoors); 6 14:10-15:00 歷史; 7 15:10-16:00 自習\n2026-11-12 Thu: 1 08:10-09:00 數學; 2 09:10-10:00 化學; 3 10:10-11:00 英文; 4 11:10-12:00 國文; 5 13:10-14:00 地理; 6 14:10-15:00 美術\n2026-11-13 Fri: 1 08:10-09:00 英文; 2 09:10-10:00 數學; 3 10:10-11:00 生物; 4 11:10-12:00 公民; 5 13:10-14:00 班會\n2026-11-16 Mon: 1 08:10-09:00 數學; 2 09:10-10:00 國文; 3 10:10-11:00 英文; 4 11:10-12:00 物理; 5 13:10-14:00 化學; 6 14:10-15:00 音樂; 7 15:10-16:00 體育 (outdoors)' } },
    { name: 'count English', input: { question: '接下來幾天有幾節英文？', facts: 'Today: 2026-11-11 (Wed).\n2026-11-11 Wed: 1 08:10-09:00 國文; 2 09:10-10:00 英文; 3 10:10-11:00 數學; 4 11:10-12:00 物理; 5 13:10-14:00 體育 (outdoors); 6 14:10-15:00 歷史; 7 15:10-16:00 自習\n2026-11-12 Thu: 1 08:10-09:00 數學; 2 09:10-10:00 化學; 3 10:10-11:00 英文; 4 11:10-12:00 國文; 5 13:10-14:00 地理; 6 14:10-15:00 美術\n2026-11-13 Fri: 1 08:10-09:00 英文; 2 09:10-10:00 數學; 3 10:10-11:00 生物; 4 11:10-12:00 公民; 5 13:10-14:00 班會\n2026-11-16 Mon: 1 08:10-09:00 數學; 2 09:10-10:00 國文; 3 10:10-11:00 英文; 4 11:10-12:00 物理; 5 13:10-14:00 化學; 6 14:10-15:00 音樂; 7 15:10-16:00 體育 (outdoors)' } },
    { name: 'not in facts', input: { question: '期中考是哪天？', facts: 'Today: 2026-11-11 (Wed).\n2026-11-11 Wed: 1 08:10-09:00 國文; 2 09:10-10:00 英文; 3 10:10-11:00 數學; 4 11:10-12:00 物理; 5 13:10-14:00 體育 (outdoors); 6 14:10-15:00 歷史; 7 15:10-16:00 自習\n2026-11-12 Thu: 1 08:10-09:00 數學; 2 09:10-10:00 化學; 3 10:10-11:00 英文; 4 11:10-12:00 國文; 5 13:10-14:00 地理; 6 14:10-15:00 美術\n2026-11-13 Fri: 1 08:10-09:00 英文; 2 09:10-10:00 數學; 3 10:10-11:00 生物; 4 11:10-12:00 公民; 5 13:10-14:00 班會\n2026-11-16 Mon: 1 08:10-09:00 數學; 2 09:10-10:00 國文; 3 10:10-11:00 英文; 4 11:10-12:00 物理; 5 13:10-14:00 化學; 6 14:10-15:00 音樂; 7 15:10-16:00 體育 (outdoors)' } }
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
  'words-cards': [
    {
      name: 'six words, easy to hard',
      input: { words: [{ w: 'able', zh: 'adj. 能夠的' }, { w: 'review', zh: 'v. 複習；檢討' }, { w: 'abandon', zh: 'v. 放棄、拋棄' }, { w: 'opt', zh: 'v. 選擇' }, { w: 'reluctant', zh: 'adj. 不情願的' }, { w: 'ambiguous', zh: 'adj. 模稜兩可的' }] }
    }
  ],
  'sports-recap': [
    {
      name: 'nba late swing',
      input: {
        facts: [
          'NBA (basketball)',
          'Teams in English: 湖人 = Los Angeles Lakers; 勇士 = Golden State Warriors',
          'Final: 湖人 112 at 勇士 108',
          'Records now: 湖人 8-4, 勇士 7-5',
          'By period: LAL 28 30 25 29 | GS 31 22 30 25',
          '湖人 leaders: LeBron James 31 PTS; Anthony Davis 14 REB; LeBron James 9 AST',
          '勇士 leaders: Stephen Curry 34 PTS; Draymond Green 10 REB; Stephen Curry 7 AST',
          'Biggest swings:',
          '4th 2:41 Stephen Curry misses 26-foot three point jumper (home win chance -12 pts)',
          '4th 1:05 LeBron James makes 24-foot three point jumper (Anthony Davis assists) (home win chance -24 pts)',
          '4th 0:32 Stephen Curry offensive foul (Charge) (home win chance -9 pts)'
        ].join('\n')
      }
    },
    {
      name: 'epl goals and a red',
      input: {
        facts: [
          'English Premier League (soccer)',
          'Teams in English: 兵工廠 = Arsenal; 熱刺 = Tottenham Hotspur',
          'Final: 熱刺 1 at 兵工廠 2',
          'Records now: 熱刺 6-3-3, 兵工廠 9-2-1',
          'Key events:',
          "23' Goal: Son Heung-Min (Tottenham Hotspur) right footed shot from the centre of the box.",
          "41' Red Card: Cristian Romero (Tottenham Hotspur) for a professional foul.",
          "58' Goal: Bukayo Saka (Arsenal) penalty.",
          "77' Goal: Martin Odegaard (Arsenal) left footed shot from outside the box."
        ].join('\n')
      }
    }
  ],
  'transit-notice': [
    { name: 'detour', input: { today: '2026-11-10', title: '307路線因道路施工改道', body: '自115年11月12日(三)22時起至11月14日(五)5時止，因忠孝西路施工，307往撫遠街方向改經中山北路行駛，暫停靠臺北車站(忠孝)站、北門站，請改至臺北車站(青島)站搭乘。' } },
    { name: 'stop', input: { today: '2026-11-10', title: '颱風停駛公告', body: '因颱風影響，本公司所有路線今日（11/10）下午4時起停駛，恢復時間另行公告。' } }
  ],
  'news-lines': [
    {
      name: 'two outlets',
      input: {
        stories: [
          { id: 's1', heads: [{ outlet: '中央社', title: '立法院三讀通過電業法修正案 再生能源售電門檻放寬', sum: '立法院會今天三讀通過電業法部分條文修正案，放寬再生能源售電業者門檻。' }, { outlet: '自由時報', title: '綠能新里程碑！電業法三讀 小型售電業者可直接賣電', sum: '電業法修正三讀，小型再生能源業者未來可直接售電給用戶。' }, { outlet: '聯合報', title: '電業法三讀 藍委批倉促：電價恐再漲', sum: '國民黨立委質疑修法倉促，擔憂電價上漲。' }] },
          { id: 's2', heads: [{ outlet: 'Reuters', title: 'Fed holds rates steady, signals two cuts in 2027', sum: 'The Federal Reserve kept its benchmark rate unchanged on Wednesday and projected two quarter-point cuts next year.' }, { outlet: 'AP', title: 'Federal Reserve leaves interest rates unchanged', sum: 'The Fed held rates at 3.75% to 4% as inflation cooled.' }] }
        ]
      }
    }
  ]
};
