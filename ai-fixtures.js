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

export const EXAMPLES = {
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
