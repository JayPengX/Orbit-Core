// 刮刮樂: every instant scratch card Taiwan Lottery has on sale (台灣彩券
// 刮刮樂 遊戲介紹 and each card's 上市公告, 2026-10), played with Orbit
// money. A card's table is its real one: every prize and how many of it were
// printed (獎金結構, 中獎張數 of 發行張數), so its win rate is the card's own
// 本期整體中獎率 and it pays back what the real card does (60-75%). What a
// card wins is fixed the moment it's bought (the proxy's crypto random number
// against the table, like a ticket off a printed run); scratching only shows
// it. The face is then laid out to read exactly that result, game by game,
// the way the real card's games read (its 玩法說明).
//
//   price    cards (newest first)
//   100      金骰子, 錢進888, 嗨刮123
//   200      好運強強滾, 喜從天降, 金磚疊疊樂, 獎金大作戰, 好運樂加倍, 金五吉, 獎金對決,
//            財富密碼, 刮刮金樂透, 狂刮10萬, 財運高升, 好運發發, 點球成金,
//            獎金倍倍樂, 金鑽999, 一觸即發, 獎金獵人
//   300      無敵開獎機, 無敵777, 麻將大賓果
//   500      10來添金, 樂刮$5,000
//   1,000    大麻將
//   (2,000萬超級紅包, NT$2,000, was sold 2026-01-20 to 07-20: none at 2,000 now.)
//
// A card is sold from `since` to `until` (its 下市日期, 17:00 Taiwan time),
// then no more (onSale). Cards no longer sold (`retired`: made-up ones,
// 2026-10) keep their table and face, so one bought before still scratches.
import { randomInt } from '#kit/play-lottery.mjs';
import { seededRandom, prizeAfterTax } from '#kit/play-odds.mjs';

// Prize tiers by price for the retired cards (multiples of the price and
// their odds, 1 in N tickets); a card on sale has its own `prizes`.
const TABLES = {
  200: [[1, 5.57], [2, 8.53], [5, 40], [10, 150], [20, 700], [100, 12_000], [1_000, 300_000], [10_000, 2_500_000]],
  300: [[1, 4.36], [2, 10.28], [5, 40], [10, 150], [20, 700], [100, 12_000], [1_000, 300_000], [10_000, 2_500_000]],
  500: [[1, 3.12], [2, 19.55], [5, 35], [10, 120], [20, 600], [100, 10_000], [1_000, 250_000], [10_000, 2_500_000]],
  1000: [[0.5, 2.85], [1, 3.93], [2, 14], [5, 60], [10, 200], [20, 900], [100, 20_000], [1_000, 400_000], [12_000, 3_000_000]],
  2000: [[0.5, 3.23], [1, 3.5], [2, 14], [5, 60], [10, 200], [20, 900], [100, 20_000], [1_000, 400_000], [10_000, 3_000_000]]
};

// Mahjong tiles (萬 筒 條, the winds and dragons, the flowers).
const NUM = [...'一二三四五六七八九'];
export const MAHJONG = [...['萬', '筒', '條'].flatMap(s => NUM.map(n => n + s)), '東', '南', '西', '北', '中', '發', '白', '春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'];
const pad = n => String(n).padStart(2, '0');
const TWO = Array.from({ length: 30 }, (_, i) => pad(i + 1));

// The 18 rounds of 大麻將 (its pyramids, left to right): tiles and prize.
const MAHJONG_ROUNDS = [[1, 500], [3, 5_000], [5, 100_000], [6, 1_000_000], [7, 10_000_000], [1, 500], [2, 1_000], [3, 1_500], [1, 500], [2, 1_500], [3, 2_000], [4, 5_000], [1, 500], [2, 1_000], [2, 1_500], [3, 2_000], [4, 10_000], [5, 50_000]];
const COUNT_ROUND = (size, table) => ({ size, table });

// A card: its name, price, sale dates, the run (`issued`) and its prizes
// ([amount, how many printed]), the games on its face (`games`, see GAMES)
// and, when its games are checked against one set of numbers or tiles, that
// set (`pool`: how many, out of what, and what the card calls it).
export const CARDS = {
  golddice: {
    icon: '🎲', zh: '金骰子', en: 'Gold Dice', price: 100, color: '#0891b2', since: '2026-10-20', until: '2027-04-20', issued: 6_120_000,
    prizes: [[100, 1_012_210], [200, 872_120], [500, 195_786], [800, 1_123], [1_000, 618], [2_000, 156], [5_000, 29], [10_000, 28], [50_000, 22], [500_000, 5]],
    games: [{ type: 'duel', rows: 5, max: 6, dice: true }],
    how: { zh: '任一局中，若「您的骰子」點數大於「對手的骰子」，即得該局獎金（不可跨局對獎）。', en: 'In any of the 5 rounds, your die higher than your opponent’s wins that round’s prize (a tie doesn’t).' }
  },
  rolling: {
    icon: '🦀', zh: '好運強強滾', en: 'Lucky Rolling', price: 200, color: '#db2777', since: '2026-10-20', until: '2027-04-20', issued: 6_055_100,
    prizes: [[200, 1_029_411], [300, 697_523], [500, 193_896], [1_000, 184_101], [2_000, 12_068], [5_000, 2_178], [10_000, 215], [50_000, 145], [2_000_000, 5]],
    games: [{ type: 'match', k: 3, n: 16, syms: [['蛋', 200], ['香菇', 300], ['玉米', 500], ['魚板', 1_000], ['牛排', 2_000], ['魚', 5_000], ['蝦', 10_000], ['螃蟹', 50_000], ['元寶', 2_000_000]] }],
    how: { zh: '刮開刮區後，若刮出3個相同符號，即得上表中獎方式對應的獎金。', en: 'Three of the same symbol win its prize on the table.' }
  },
  lucky7: {
    icon: '8️⃣', zh: '錢進888', en: 'Money 888', price: 100, color: '#dc2626', since: '2026-08-18', until: '2027-02-18', issued: 6_063_200,
    prizes: [[100, 1_067_726], [200, 425_850], [300, 97_060], [400, 52_210], [500, 121_321], [800, 44_431], [1_000, 9_421], [1_600, 6_781], [8_000, 173], [80_000, 10], [800_000, 4]],
    games: [{ type: 'spots', n: 8, win: { 8: 1 }, decoys: ['0', '1', '2', '3', '4', '5', '6', '7', '9'] }],
    how: { zh: '刮出任一個「8」，即得其對應的獎額。', en: 'Uncover any 8 to win the prize under it.' }
  },
  hi123: {
    icon: '🔢', zh: '嗨刮123', en: 'Hi 123', price: 100, color: '#f59e0b', since: '2026-06-15', until: '2026-12-15', issued: 4_080_000,
    prizes: [[100, 926_888], [200, 202_491], [300, 94_621], [600, 90_416], [800, 16_309], [1_000, 13_061], [1_500, 2_448], [5_000, 342], [10_000, 32], [300_000, 4]],
    games: [{ type: 'spots', n: 7, win: { '1倍': 1, '2倍': 2, '3倍': 3 }, decoys: ['$', '♥', '♛', '♣', '金條'] }],
    how: { zh: '刮出一個「1倍」即得其下方對應獎金；刮出一個「2倍」即得其下方對應獎金2倍的獎金；刮出一個「3倍」即得其下方對應獎金3倍的獎金。', en: 'A 1× wins the prize under it; a 2× twice it; a 3× three times it.' }
  },
  gift: {
    icon: '🎁', zh: '喜從天降', en: 'Gifts from Above', price: 200, color: '#ec4899', since: '2026-10-05', until: '2027-04-07', issued: 6_080_000,
    prizes: [[200, 966_706], [300, 446_309], [500, 70_514], [1_000, 356_384], [1_500, 5_837], [5_000, 2_432], [10_000, 132], [50_000, 12], [2_000_000, 6]],
    games: [{ type: 'numbers', of: [1, 40], winning: 2, yours: 5, bonus: { s: '🎁', all: true } }, { type: 'match', n: 6, k: 3 }],
    how: { zh: '遊戲1：任一個「您的號碼」對中「幸運號碼」，即得該號碼對應的獎金；或刮出一個「🎁」符號，即得遊戲1刮區內所有獎金。遊戲2：刮出3個相同金額，即得該獎金。', en: 'Game 1: any of your numbers matching a lucky number wins the prize beside it; a 🎁 wins every prize in game 1. Game 2: three of the same amount win it.' }
  },
  fruit: {
    icon: '🧱', zh: '金磚疊疊樂', en: 'Gold Bricks', price: 200, color: '#ca8a04', since: '2026-09-15', until: '2027-03-15', issued: 6_079_300,
    prizes: [[200, 1_068_694], [300, 637_132], [500, 170_293], [1_000, 231_520], [2_000, 12_131], [3_000, 4_859], [5_000, 2_443], [10_000, 486], [100_000, 147], [2_000_000, 5]],
    games: [{ type: 'rows', sizes: [2, 2, 3, 4, 5, 6], symbols: TWO }],
    how: { zh: '第1局至第6局，若任一局中刮出的數字皆相同，即得該局獎金（不可跨局對獎）。', en: 'In any of the 6 rounds, if the numbers are all the same, you win that round’s prize.' }
  },
  battle: {
    icon: '⚔️', zh: '獎金大作戰', en: 'Prize Battle', price: 200, color: '#2563eb', since: '2026-09-15', until: '2027-03-15', issued: 5_914_300,
    prizes: [[200, 941_616], [300, 579_521], [500, 189_258], [1_000, 224_740], [1_500, 7_122], [2_000, 2_830], [2_500, 2_384], [3_000, 1_950], [5_000, 1_891], [10_000, 121], [50_000, 24], [2_000_000, 6]],
    pool: { n: 15, of: [1, 30], zh: '您的號碼', en: 'Your numbers' },
    games: [
      { type: 'grid', size: 3, mode: 'pool' },
      { type: 'rounds', rounds: [{ size: 1 }, { size: 2 }, { size: 3 }] },
      { type: 'rounds', rounds: [COUNT_ROUND(6, [[1, 300], [2, 1_000], [3, 3_000], [4, 5_000], [5, 10_000], [6, 2_000_000]])] }
    ],
    how: { zh: '刮開「您的號碼」區共15個號碼，各遊戲號碼若對中「您的號碼」則依各遊戲玩法得對應獎金（不可跨遊戲對獎）。遊戲1：對中「您的號碼」且連成一條直線、橫線或對角線，即得獎金欄獎金。遊戲2：同一局的號碼全數出現在「您的號碼」區中，即得該局獎金。遊戲3：依對中「您的號碼」個數對照上表決定中獎獎金。', en: 'Your 15 numbers play three games. Game 1: matched numbers making a line win the prize box. Game 2: a round whose numbers are all yours wins its prize. Game 3: how many of its numbers are yours sets the prize (the table).' }
  },
  double: {
    icon: '✖️', zh: '好運樂加倍', en: 'Lucky Double', price: 200, color: '#f97316', since: '2026-09-01', until: '2027-03-02', issued: 6_046_600,
    prizes: [[200, 956_700], [300, 510_427], [500, 42_069], [600, 123_307], [1_000, 174_879], [1_500, 48_299], [2_000, 7_311], [2_500, 6_021], [3_000, 3_192], [5_000, 1_933], [10_000, 119], [50_000, 54], [2_000_000, 5]],
    games: [{ type: 'rows', sizes: [2, 2, 2, 2, 2, 2], symbols: TWO, mults: [1, 2, 5], decoyMults: [1, 1, 1, 2, 5] }],
    how: { zh: '任一局中刮出的「您的號碼」皆相同，即得該局獎金乘以該局倍數之金額（不可跨局對獎）。', en: 'A round whose two numbers are the same wins its prize times its multiplier.' }
  },
  ingot: {
    icon: '🪙', zh: '金五吉', en: 'Gold Fortune', price: 200, color: '#b91c1c', since: '2026-08-18', until: '2027-02-18', issued: 6_081_400,
    prizes: [[200, 924_284], [300, 498_008], [500, 279_779], [1_000, 228_574], [2_000, 12_178], [3_000, 1_955], [5_000, 979], [10_000, 243], [100_000, 36], [2_000_000, 5]],
    games: [{ type: 'tally', n: 15, need: '元寶', table: [[2, 200], [3, 300], [4, 500], [5, 1_000], [6, 2_000], [7, 3_000], [8, 5_000], [9, 10_000], [10, 100_000], [11, 2_000_000]], decoys: ['鑽石', '錢袋', '吉', '小豬', '戒指', '荷包', '橘子', '$'] }],
    how: { zh: '刮開刮區後，若刮出2個（含）以上的「元寶」符號，即得下表中獎方式對應的獎金。', en: 'Two or more gold ingots win the prize for that many (the table).' }
  },
  beat: {
    icon: '💪', zh: '獎金對決', en: 'Prize Duel', price: 200, color: '#0284c7', since: '2026-08-04', until: '2027-02-11', issued: 5_892_100,
    prizes: [[200, 992_305], [300, 589_208], [500, 126_118], [1_000, 176_763], [1_500, 46_731], [2_000, 9_382], [3_000, 2_808], [5_000, 1_069], [10_000, 167], [50_000, 30], [2_000_000, 5]],
    games: [{ type: 'duel', rows: 8, max: 30 }],
    how: { zh: '任一局中，若「您的分數」數字大於「大力士分數」，即得該局對應之獎金（不可跨局對獎）。', en: 'In any of the 8 rounds, your score higher than the strongman’s wins that round’s prize (a tie doesn’t).' }
  },
  code: {
    icon: '🔐', zh: '財富密碼', en: 'Fortune Code', price: 200, color: '#1e40af', since: '2026-07-16', until: '2027-01-18', issued: 3_567_300,
    prizes: [[200, 522_169], [300, 310_540], [500, 158_390], [1_000, 141_295], [2_000, 5_706], [3_000, 2_838], [5_000, 564], [10_000, 134], [50_000, 20], [2_000_000, 3]],
    games: [{ type: 'grid', size: 3, mode: 'same' }, { type: 'grid', size: 3, mode: 'same' }, { type: 'code', rows: 3 }],
    how: { zh: '遊戲1、2：若任一直線、橫線或對角線刮出3個相同數字，即得獎金欄獎額（不可跨遊戲對獎）。遊戲3：若任一局中「幸運密碼」的3個數字與「您的密碼」的3個數字皆完全相同，即得該局獎金（不可跨局對獎）。', en: 'Games 1 and 2: three of the same digit in a line win the prize box. Game 3: a round whose lucky code and your code are the same three digits wins its prize.' }
  },
  goldlotto: {
    icon: '🎱', zh: '刮刮金樂透', en: 'Gold Lotto', price: 200, color: '#eab308', since: '2026-07-16', until: '2027-01-18', issued: 7_140_000,
    prizes: [[200, 1_265_208], [500, 685_501], [1_000, 276_962], [2_000, 25_722], [5_000, 2_260], [10_000, 288], [100_000, 19], [2_000_000, 8]],
    pool: { n: 15, of: [1, 49], zh: '您的號碼', en: 'Your numbers' },
    games: [{ type: 'lotto', table: [[6, false, 2_000_000], [5, true, 100_000], [5, false, 10_000], [4, true, 5_000], [4, false, 2_000], [3, true, 1_000], [2, true, 500], [3, false, 200]] }],
    how: { zh: '刮開「您的號碼」刮區，若「您的號碼」對中「金樂透號碼」、「特別號」，請對照上表決定中獎獎金，以領取最高金額之獎項為限。', en: 'Your numbers against the six gold lotto numbers and the special number: the table says what that wins (the highest one only).' }
  },
  crazy10: {
    icon: '💸', zh: '狂刮10萬', en: 'Crazy 100K', price: 200, color: '#16a34a', since: '2026-07-02', until: '2027-01-04', issued: 4_590_000,
    prizes: [[200, 892_214], [400, 248_405], [1_000, 211_476], [1_200, 28_316], [10_000, 100], [100_000, 800]],
    games: [{ type: 'numbers', of: [1, 25], winning: 3, yours: 12, bonus: { s: '🪙', a: 100_000 } }],
    how: { zh: '任一個「您的號碼」對中「幸運號碼」，即得該號碼對應的獎金；或刮中一個「🪙」，即得獎金10萬元。', en: 'Any of your numbers matching a lucky number wins the prize beside it; a 🪙 wins NT$100,000.' }
  },
  rising: {
    icon: '📈', zh: '財運高升', en: 'Rising Fortune', price: 200, color: '#db2777', since: '2026-06-15', until: '2026-12-15', issued: 6_120_000,
    prizes: [[200, 856_734], [300, 575_330], [500, 159_047], [1_000, 293_139], [2_000, 10_917], [3_000, 1_211], [5_000, 749], [10_000, 176], [100_000, 30], [2_000_000, 4]],
    pool: { n: 20, of: [1, 50], zh: '您的號碼', en: 'Your numbers' },
    games: [{ type: 'rounds', rounds: [200, 300, 1_000, 2_000, 5_000, 10_000, 100_000, 2_000_000].map((a, i) => ({ size: i + 1, a })) }],
    how: { zh: '刮開「您的號碼」區，共有20個號碼。若任一局號碼全數出現在「您的號碼」區，即得該局之獎金。', en: 'A round whose numbers all appear among your 20 numbers wins that round’s prize.' }
  },
  fafa: {
    icon: '🧧', zh: '好運發發', en: 'Lucky Fa Fa', price: 200, color: '#e11d48', since: '2026-06-02', until: '2026-12-02', issued: 4_080_000,
    prizes: [[200, 692_388], [300, 278_117], [500, 89_711], [800, 122_589], [1_000, 117_146], [1_500, 2_922], [2_000, 991], [5_000, 820], [8_800, 620], [88_000, 88]],
    games: [
      { type: 'numbers', of: [1, 30], winning: 2, yours: 4 },
      { type: 'tally', n: 2, need: '8', table: [[2, 800]], decoys: ['1', '2', '3', '5', '6', '9'] },
      { type: 'match', n: 6, k: 3 },
      { type: 'spots', n: 1, box: true, win: { $: 1 } }
    ],
    how: { zh: '1. 任一個「您的號碼」對中「幸運號碼」，即得該號碼對應的獎金。2. 刮出2個「8」，即得獎金800元。3. 刮出3個相同金額，即得該獎金。4. 刮出一個金額，即得該獎金。', en: '1. Any of your numbers matching a lucky number wins the prize beside it. 2. Two 8s win NT$800. 3. Three of the same amount win it. 4. An amount in the bag wins it.' }
  },
  goal: {
    icon: '⚽', zh: '點球成金', en: 'Golden Goal', price: 200, color: '#15803d', since: '2026-05-19', until: '2026-11-19', issued: 4_564_000,
    prizes: [[200, 627_549], [300, 483_982], [500, 160_576], [1_000, 164_443], [1_200, 11_659], [1_500, 10_203], [5_000, 2_083], [10_000, 91], [100_000, 18], [2_000_000, 4]],
    pool: { n: 16, of: [1, 60], zh: '您的號碼', en: 'Your numbers' },
    games: [{ type: 'rounds', rounds: ['orange', 'navy', 'green', 'red', 'yellow', 'blue'].map(color => ({ size: 3, color })) }],
    how: { zh: '「您的號碼」區共有16個號碼，若「您的號碼」出現在「進球號碼」中，且全數對中相同顏色之「進球號碼」，即得該顏色對應之獎金。', en: 'When every goal number of one colour is among your 16 numbers, you win that colour’s prize.' }
  },
  multiply: {
    icon: '✴️', zh: '獎金倍倍樂', en: 'Prize Multiplier', price: 200, color: '#be123c', since: '2026-05-19', until: '2026-11-19', issued: 3_965_100,
    prizes: [[200, 634_469], [300, 333_005], [500, 38_120], [1_000, 179_210], [1_500, 31_718], [2_000, 4_755], [2_500, 4_272], [3_000, 2_404], [5_000, 1_255], [10_000, 109], [50_000, 40], [2_000_000, 3]],
    games: [{ type: 'numbers', of: [1, 30], winning: 4, yours: 11, zones: [[1, 4], [2, 3], [5, 2], [10, 2]] }],
    how: { zh: '共有4個獎金倍數區，任一個「您的號碼」對中「幸運號碼」即得該號碼對應獎金乘以該區獎金倍數之金額。', en: 'Four multiplier zones: any of your numbers matching a lucky number wins its prize times its zone’s multiplier.' }
  },
  numbers: {
    icon: '💎', zh: '金鑽999', en: 'Diamond 999', price: 200, color: '#059669', since: '2026-05-05', until: '2026-11-05', issued: 4_080_000,
    prizes: [[200, 627_829], [300, 195_875], [500, 86_501], [900, 131_901], [2_000, 80_320], [5_000, 1_586], [10_000, 23], [90_000, 8], [2_000_000, 3]],
    games: [{ type: 'numbers', of: [1, 40], winning: 2, yours: 10 }, { type: 'spots', n: 1, box: true, win: { $: 1 } }],
    how: { zh: '1. 任一個「您的號碼」對中「幸運號碼」，即得該號碼對應的獎額。2. 刮出一個金額，即得該獎額。', en: '1. Any of your numbers matching a lucky number wins the prize beside it. 2. An amount in the box wins it.' }
  },
  touch: {
    icon: '⚡', zh: '一觸即發', en: 'Hair Trigger', price: 200, color: '#dc2626', since: '2026-04-07', until: '2026-10-21', issued: 3_551_700,
    prizes: [[200, 675_064], [300, 276_769], [500, 113_523], [1_000, 132_969], [2_000, 5_194], [3_000, 2_928], [5_000, 987], [10_000, 59], [15_000, 55], [50_000, 20], [2_000_000, 3]],
    games: [{ type: 'cross', n: 4, of: [1, 30], bonus: { s: '發', a: 1_000 } }],
    how: { zh: '任一個「您的號碼」對中「幸運號碼」，即得連線交點處之獎金；或每刮中一個「發」，即得獎金1,000元。', en: 'Any of your numbers matching a lucky number wins the prize where their lines cross; each 發 wins NT$1,000.' }
  },
  hunter: {
    icon: '🎯', zh: '獎金獵人', en: 'Prize Hunter', price: 200, color: '#d97706', since: '2026-04-07', until: '2026-10-21', issued: 5_904_800,
    prizes: [[200, 708_538], [300, 525_592], [500, 236_121], [1_000, 283_667], [2_000, 21_270], [5_000, 1_881], [10_000, 169], [100_000, 12], [2_000_000, 6]],
    pool: { n: 15, of: [1, 55], zh: '您的號碼', en: 'Your numbers' },
    games: [{ type: 'score', ones: 16, tens: 5, table: [[7, 200], [8, 300], [9, 500], [10, 1_000], [11, 2_000], [12, 5_000], [13, 10_000], [14, 100_000], [15, 2_000_000]] }],
    how: { zh: '刮開「您的號碼」刮區，共有15個號碼。「獎金號碼」區共有21個號碼，其中16個號碼位於「1分區」，對中得1分；5個號碼位於「10分區」，對中得10分。以「對中總分數」決定中獎獎金，請對照上表。', en: 'Each of your 15 numbers among the prize numbers scores: 1 point in the 1-point zone, 10 in the 10-point zone. The total sets the prize (the table).' }
  },
  machine: {
    icon: '🎰', zh: '無敵開獎機', en: 'Draw Machine', price: 300, color: '#ea580c', since: '2026-09-01', until: '2027-03-02', issued: 6_603_400,
    prizes: [[300, 1_238_563], [500, 691_410], [800, 162_875], [1_000, 348_662], [1_500, 56_775], [2_000, 9_534], [5_000, 1_860], [10_000, 136], [100_000, 39], [3_000_000, 4]],
    pool: { n: 22, of: [1, 45], zh: '幸運號碼', en: 'Lucky numbers' },
    games: [{
      type: 'rounds',
      rounds: [
        COUNT_ROUND(1, [[1, 300]]), COUNT_ROUND(2, [[1, 300], [2, 500]]), COUNT_ROUND(2, [[1, 300], [2, 500]]),
        COUNT_ROUND(3, [[2, 500], [3, 5_000]]), COUNT_ROUND(3, [[2, 500], [3, 5_000]]), COUNT_ROUND(4, [[2, 500], [3, 5_000], [4, 10_000]]),
        COUNT_ROUND(5, [[3, 5_000], [4, 10_000], [5, 100_000]]), COUNT_ROUND(5, [[3, 5_000], [4, 10_000], [5, 100_000]]), COUNT_ROUND(6, [[4, 10_000], [5, 100_000], [6, 3_000_000]])
      ]
    }],
    how: { zh: '刮開「幸運號碼」刮區，共有22個幸運號碼。第1局至第9局遊戲中，依對中「幸運號碼」數，領取該局遊戲之獎金，各局以領取一個獎項為限（不可跨局對獎）。', en: 'Rounds 1 to 9: how many of a round’s numbers are among the 22 lucky numbers sets its prize (one prize a round).' }
  },
  super777: {
    icon: '7️⃣', zh: '無敵777', en: 'Super 777', price: 300, color: '#c026d3', since: '2026-07-02', until: '2027-01-04', issued: 6_616_400,
    prizes: [[300, 1_279_209], [500, 760_994], [700, 42_313], [1_000, 87_345], [1_400, 47_345], [2_100, 158_700], [3_500, 4_483], [4_200, 1_592], [5_000, 373], [14_000, 327], [70_000, 72], [3_000_000, 5]],
    games: [
      { type: 'numbers', of: [1, 20], winning: 2, yours: 8, bonus: { s: '✕3', x: 3 } },
      { type: 'match', n: 6, k: 3 },
      { type: 'tally', n: 3, need: '7', table: [[3, 700]], decoys: ['2', '3', '5', '8'] },
      { type: 'tally', n: 3, need: '7', table: [[3, 700]], decoys: ['2', '3', '5', '8'] },
      { type: 'spots', n: 1, box: true, win: { $: 1 } },
      { type: 'spots', n: 1, box: true, win: { $: 1 } }
    ],
    how: { zh: '遊戲1：任一個「您的號碼」對中「幸運號碼」，即得該號碼對應的獎額；或刮出一個「✕3」，即得該符號對應獎額3倍的獎金。遊戲2：刮出3個相同金額，即得該獎額。遊戲3、4：刮中3個「7」，即得700元。遊戲5、6：刮出一個金額，即得該獎額。', en: 'Game 1: your numbers matching a lucky number win the prize beside them; a ✕3 wins three times its prize. Game 2: three of the same amount win it. Games 3 and 4: three 7s win NT$700. Games 5 and 6: an amount wins it.' }
  },
  mjbingo: {
    icon: '🀄', zh: '麻將大賓果', en: 'Mahjong Bingo', price: 300, color: '#be185d', since: '2026-05-05', until: '2026-11-05', issued: 7_093_500,
    prizes: [[300, 1_180_321], [500, 876_690], [1_000, 425_644], [2_000, 56_774], [5_000, 14_203], [10_000, 167], [100_000, 30], [3_000_000, 6]],
    pool: { n: 27, of: 'mahjong', zh: '您的麻將牌', en: 'Your tiles' },
    games: [{ type: 'grid', size: 6, mode: 'pool', frees: 3, table: [[1, 300], [2, 500], [3, 1_000], [4, 2_000], [5, 5_000], [6, 10_000], [7, 100_000], [8, 3_000_000]] }],
    how: { zh: '刮開「您的麻將牌」區，共有27個麻將牌符號。若「您的麻將牌」出現在「賓果區」，且有任6個麻將牌符號連成一條直線、橫線或對角線，即為連線成功，可依連線成功數得到其對應的獎金。「賓果區」中的 FREE 可視為對中1個麻將牌符號。', en: 'Your 27 tiles on the 6×6 bingo board: six in a line (across, down or diagonal; FREE counts) make a line, and how many lines sets the prize (the table).' }
  },
  ten: {
    icon: '🔟', zh: '10來添金', en: 'Ten for Gold', price: 500, color: '#7c3aed', since: '2026-10-05', until: '2027-04-07', issued: 4_000_000,
    prizes: [[500, 1_091_680], [600, 333_440], [1_000, 99_200], [2_000, 33_600], [5_000, 80_640], [10_000, 1_360], [50_000, 120], [100_000, 48], [5_000_000, 4]],
    games: [
      { type: 'spots', n: 8, win: { 10: 1, '💰': 1 }, decoys: ['3', '6', '8', '12', '15', '17', '19'] },
      { type: 'rows', sizes: [3, 3, 3], symbols: ['🔔', '🎲', '🪙', 'BAR', '◇10'], need: '◇10' },
      { type: 'spots', n: 1, fixed: 500, win: { '⑩': 1 }, decoys: ['⑧', '⑥'] },
      { type: 'sum', rows: 2, target: 10 },
      { type: 'tally', n: 6, need: '10', k: 3, decoys: ['20', '30', '40', '50', '80'] }
    ],
    how: { zh: '1. 刮出任一個「10」或「💰」，即得其對應的獎金。2. 任一局中刮出3個「◇10」，即得該局獎金（不可跨局對獎）。3. 刮出一個「⑩」，即得獎金500元。4. 任一局中，若2個數字相加為10，即得該局獎金（不可跨局對獎）。5. 刮出3個「10」，即得該獎金。', en: '1. Any 10 or 💰 wins the prize under it. 2. A round of three ◇10 wins its prize. 3. A ⑩ wins NT$500. 4. A round whose two numbers add up to 10 wins its prize. 5. Three 10s win the prize.' }
  },
  million: {
    icon: '💵', zh: '樂刮$5,000', en: 'Scratch $5,000', price: 500, color: '#1d4ed8', since: '2026-06-02', until: '2026-12-02', issued: 4_000_000,
    prizes: [[500, 1_120_000], [1_000, 85_088], [2_000, 24_000], [5_000, 159_936], [100_000, 12], [3_000_000, 2]],
    games: [{ type: 'numbers', of: [1, 40], winning: 4, yours: 20, bonus: { s: '$', a: 5_000 } }],
    how: { zh: '任一個「您的號碼」對中「幸運號碼」，即得該號碼對應的獎金；或刮中一個「$」，即得獎金5,000元。', en: 'Any of your numbers matching a lucky number wins the prize beside it; a $ wins NT$5,000.' }
  },
  mahjong: {
    icon: '🀄', zh: '大麻將', en: 'Big Mahjong', price: 1000, color: '#991b1b', since: '2026-08-04', until: '2027-02-11', issued: 3_500_000,
    prizes: [[500, 1_176_000], [1_000, 482_160], [1_500, 557_200], [2_000, 195_300], [5_000, 41_860], [10_000, 2_100], [50_000, 140], [100_000, 95], [1_000_000, 20], [10_000_000, 3]],
    pool: { n: 18, of: 'mahjong', zh: '您的麻將', en: 'Your tiles' },
    games: [{ type: 'rounds', rounds: MAHJONG_ROUNDS.map(([size, a]) => ({ size, a })) }, { type: 'match', n: 2, k: 2, a: 1_000, of: 'mahjong' }],
    how: { zh: '遊戲一：刮開「您的麻將」區，共有18個麻將符號；第1局至第18局遊戲中，若任一局的麻將符號全數出現在「您的麻將」區，即得該局遊戲之獎金。遊戲二：刮出2個相同符號，即得獎金1,000元（不可跨遊戲刮區對獎）。', en: 'Game 1: a round whose tiles all appear among your 18 tiles wins that round’s prize (18 rounds). Game 2: two of the same tile win NT$1,000.' }
  },
  triple: { retired: true, icon: '🎯', zh: '三個一樣', en: 'Match 3', price: 200, color: '#d97706', layout: 'match3', how: { zh: '刮出三個相同金額，就贏得該金額。', en: 'Uncover three of the same amount to win it.' } },
  bingo: { retired: true, icon: '🎱', zh: '賓果連線', en: 'Bingo Line', price: 500, color: '#7c3aed', layout: 'bingo', how: { zh: '開出的號碼在卡上連成一線（橫、直、斜），就贏得該線的獎金。', en: 'Called numbers making a line (across, down or diagonal) win that line’s prize.' } },
  gold: { retired: true, icon: '💰', zh: '金幣翻倍', en: 'Golden Coins', price: 1000, color: '#ca8a04', layout: 'symbol', symbol: '💰', spots: 10, multiplier: true, how: { zh: '刮出💰贏得它的獎金，再乘上左上角的倍數。', en: 'Each 💰 wins its prize, times the multiplier in the corner.' } },
  treasure: { retired: true, icon: '🗺️', zh: '尋寶地圖', en: 'Treasure Map', price: 300, color: '#b45309', layout: 'treasure', how: { zh: '挖出三個相同的寶物，就贏得圖例上它的獎金。', en: 'Dig up three of the same treasure to win its prize on the key.' } },
  dice: { retired: true, icon: '🎲', zh: '骰子對決', en: 'Dice Duel', price: 500, color: '#16a34a', layout: 'dice', rounds: 5, how: { zh: '每一局你的兩顆骰子點數加起來比對手大，就贏得該局的獎金。', en: 'In each round, if your two dice add up to more than your opponent’s, you win that round’s prize.' } },
  wheel: { retired: true, icon: '🎡', zh: '幸運轉盤', en: 'Lucky Wheel', price: 1000, color: '#9333ea', layout: 'wheel', how: { zh: '刮開看指針停在哪一格，就贏得那一格的獎金。', en: 'See where the pointer stops: you win that slice.' } },
  palace: { retired: true, icon: '🏯', zh: '金殿老虎機', en: 'Palace Slots', price: 2000, color: '#a16207', layout: 'slots', lines: 5, symbols: ['7️⃣', '💎', '👑', '🔔', '⭐', '🍀'], how: { zh: '任一橫排出現三個相同圖案，就贏得該排右邊的獎金。', en: 'Three of the same picture across a row wins that row’s prize.' } }
};
// The cards on sale, by price, then the newest first (Taiwan Lottery's own
// order: its 期數).
export const CARD_ORDER = ['golddice', 'lucky7', 'hi123', 'rolling', 'gift', 'fruit', 'battle', 'double', 'ingot', 'beat', 'code', 'goldlotto', 'crazy10', 'rising', 'fafa', 'goal', 'multiply', 'numbers', 'touch', 'hunter', 'machine', 'super777', 'mjbingo', 'ten', 'million', 'mahjong'];
// Sold now: on sale from its 上市日期 and not past its 下市日期 (sales close 17:00 Taiwan time).
export const onSale = (id, now = new Date()) => {
  const c = CARDS[id];
  return !!c && !c.retired && CARD_ORDER.includes(id) && (!c.since || now >= new Date(`${c.since}T00:00:00+08:00`)) && (!c.until || now < new Date(`${c.until}T17:00:00+08:00`));
};
// Treasures on the map's key, cheapest tier first.
const TREASURES = ['🐚', '🪙', '🗝️', '🏺', '📿', '💍', '👑', '💎', '🏆'];

// A card's tiers, the cheapest first: each prize and its odds (1 in N).
export const tiersOf = id => {
  const c = CARDS[id];
  if (c.prizes) return [...c.prizes].sort((a, b) => a[0] - b[0]).map(([prize, n]) => ({ prize, odds: c.issued / n }));
  return TABLES[c.price].map(([mult, odds]) => ({ prize: mult * c.price, odds }));
};
export const topPrize = id => tiersOf(id).at(-1).prize;
export const expectedReturn = id => tiersOf(id).reduce((s, t) => s + t.prize / t.odds, 0) / CARDS[id].price;

// The prize a new card holds: one uniform draw against the table.
export function drawPrize(id, rand = Math.random) {
  let r = rand();
  for (const t of tiersOf(id)) {
    if (r < 1 / t.odds) return t.prize;
    r -= 1 / t.odds;
  }
  return 0;
}
const cryptoRand = () => randomInt(2 ** 30) / 2 ** 30;

// A small seeded generator (the slip simulator's Mulberry32), so a card's
// face is the same every time it's drawn.
const seeded = seededRandom;
const pickOf = (rand, list) => list[Math.floor(rand() * list.length)];
const shuffle = (rand, list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const times = (n, f) => Array.from({ length: Math.max(0, n) }, (_, i) => f(i));
// The amounts a face shows (losing ones as decoys too).
const amounts = id => [...new Set(tiersOf(id).map(t => t.prize))];

// ---- The games on a card's face ------------------------------------------
//
// A face is { kind: 'games', pool, games }: `pool` the card's set of numbers
// or tiles its games are checked against (null when it has none), `games`
// one entry a game, each { type, ... } as below. Every type says:
//   slots(spec)   the prizes it can show (one a winning element: `values`
//                 when only some amounts, `ok` to check an amount, `alone`
//                 when it can't share its game with another win)
//   build(...)    its face for the parts of the prize it was given
//   pays(g, has)  what that face pays (`has`: is it in the pool)
// The prize is split over slots (assign) and every game built for its part;
// the tests check each face pays exactly its prize.
class Retry extends Error {}
const retry = () => {
  throw new Retry('retry');
};
const best = (table, hits) => table.filter(([k]) => k <= hits).reduce((m, [, a]) => Math.max(m, a), 0);
const sameAll = s => s.every(x => x === s[0]);
const linesOf = size => {
  const at = (r, c) => r * size + c;
  const lines = [];
  for (let i = 0; i < size; i++) lines.push(times(size, j => at(i, j)), times(size, j => at(j, i)));
  lines.push(times(size, i => at(i, i)), times(size, i => at(i, size - 1 - i)));
  return lines;
};
// Sets of lines whose cells, all marked, complete no other line (by size and count).
const CLOSED = new Map();
function closedSets(size, want) {
  const key = `${size}:${want}`;
  if (CLOSED.has(key)) return CLOSED.get(key);
  const lines = linesOf(size);
  const out = [];
  const pick = (from, chosen) => {
    if (chosen.length === want) {
      const cells = new Set(chosen.flatMap(i => lines[i]));
      if (lines.every((l, i) => chosen.includes(i) || !l.every(x => cells.has(x)))) out.push({ lines: [...chosen], cells: [...cells] });
      return;
    }
    for (let i = from; i < lines.length; i++) pick(i + 1, [...chosen, i]);
  };
  pick(0, []);
  CLOSED.set(key, out);
  return out;
}

// An amount on a losing element: any of the card's, the small ones most.
const decoy = (rand, list) => list[Math.floor(list.length * rand() ** 2)];

const GAMES = {
  // Symbols under the scratch-off, each with an amount: a winning symbol pays
  // its amount times its multiplier (`win`: symbol → ×). `box`: one amount
  // that's a win when it's there (0 when not); `fixed`: every amount the same.
  spots: {
    slots: (s, ctx) => {
      if (s.box) return [{}];
      if (s.fixed) return times(Math.min(3, s.n), () => ({ values: [s.fixed] }));
      const xs = Object.values(s.win);
      return times(Math.min(3, s.n), () => ({ ok: a => xs.some(x => a % x === 0 && a / x >= ctx.min) }));
    },
    build: (s, parts, { rand, list, min }) => {
      const syms = Object.keys(s.win);
      const spots = parts.map(p => {
        const fits = syms.filter(x => p.a % s.win[x] === 0 && p.a / s.win[x] >= min);
        const sym = pickOf(rand, fits.length ? fits : syms.filter(x => s.win[x] === 1));
        return { s: sym, a: s.fixed ?? p.a / s.win[sym] };
      });
      while (spots.length < s.n) spots.push(s.box ? { s: syms[0], a: 0 } : { s: pickOf(rand, s.decoys), a: s.fixed ?? decoy(rand, list) });
      return { win: s.win, spots: shuffle(rand, spots) };
    },
    pays: g => g.spots.reduce((t, x) => t + (g.win[x.s] ? x.a * g.win[x.s] : 0), 0)
  },
  // 幸運號碼 and 您的號碼 (each with an amount, and in `zones` a multiplier):
  // a match wins its amount (× its zone's). `bonus`: a symbol among yours
  // that wins `a`, or `x` times its own amount, or (`all`) every amount there.
  numbers: {
    slots: (s, ctx) => {
      const zone = s.zones ? a => s.zones.some(([x]) => a % x === 0 && a / x >= ctx.min) : null;
      const out = times(3, () => ({ ok: zone }));
      const b = s.bonus;
      if (b?.a) out.push({ values: [b.a], tag: 'bonus' });
      else if (b?.x) out.push({ ok: a => a % b.x === 0 && a / b.x >= ctx.min, tag: 'bonus' });
      else if (b?.all) out.push({ ok: a => a % s.yours === 0 && ctx.list.includes(a / s.yours), tag: 'bonus', alone: true });
      return out;
    },
    build: (s, parts, { rand, list, min }) => {
      const nums = shuffle(rand, range(...s.of));
      const winning = nums.slice(0, s.winning).sort((a, b) => a - b);
      const others = nums.slice(s.winning);
      const b = s.bonus;
      const bonus = parts.find(p => p.tag === 'bonus');
      let k = 0;
      if (b?.all && bonus) {
        const each = bonus.a / s.yours;
        const yours = [{ s: b.s, a: each }, ...times(s.yours - 1, () => ({ n: others[k++], a: each }))];
        return { winning, bonus: b, yours: shuffle(rand, yours) };
      }
      const xs = s.zones ? s.zones.flatMap(([x, n]) => times(n, () => x)) : times(s.yours, () => 1);
      let free = shuffle(rand, xs.map((_, i) => i));
      const yours = Array(xs.length).fill(null);
      const place = (a, fit) => {
        const i = free.find(i => fit(xs[i])) ?? free.find(i => xs[i] === 1) ?? free[0];
        free = free.filter(j => j !== i);
        return i;
      };
      for (const p of parts.filter(p => p.tag !== 'bonus')) {
        const i = place(p.a, x => p.a % x === 0 && p.a / x >= min);
        yours[i] = { n: pickOf(rand, winning), a: p.a / xs[i] };
      }
      if (bonus) {
        const i = place(bonus.a, x => x === 1);
        yours[i] = { s: b.s, a: b.x ? bonus.a / b.x : b.a };
      }
      for (const i of free) yours[i] = { n: others[k++], a: decoy(rand, list) };
      if (s.zones) yours.forEach((y, i) => (y.x = xs[i]));
      return { winning, ...(b ? { bonus: b } : {}), yours };
    },
    pays: g => {
      const b = g.bonus;
      if (b?.all && g.yours.some(y => y.s === b.s)) return g.yours.reduce((t, y) => t + y.a, 0);
      return g.yours.reduce((t, y) => t + (y.s ? (y.s === b?.s ? (b.x ? y.a * b.x : b.a) : 0) : g.winning.includes(y.n) ? y.a * (y.x || 1) : 0), 0);
    }
  },
  // `k` of the same: amounts (three alike win it) or, with `a`, symbols (any
  // `k` alike win `a`), or with `syms`, symbols each with its own amount (the
  // table: `k` alike win that symbol's).
  match: {
    slots: s => [s.a ? { values: [s.a] } : s.syms ? { values: s.syms.map(x => x[1]) } : {}],
    build: (s, parts, { rand, list }) => {
      const p = parts[0];
      if (s.syms) {
        const win = p ? s.syms.find(x => x[1] === p.a)[0] : null;
        const cells = win ? times(s.k, () => win) : [];
        const counts = new Map(win ? [[win, s.k]] : []);
        const names = s.syms.map(x => x[0]);
        let guard = 0;
        while (cells.length < s.n) {
          if (++guard > 500) retry();
          const v = pickOf(rand, names);
          if (v === win || (counts.get(v) || 0) >= s.k - 1) continue;
          counts.set(v, (counts.get(v) || 0) + 1);
          cells.push(v);
        }
        return { k: s.k, syms: s.syms, cells: shuffle(rand, cells) };
      }
      const pool = s.a ? (s.of === 'mahjong' ? MAHJONG : s.of) : list;
      const cells = p ? times(s.k, () => (s.a ? pickOf(rand, pool) : p.a)) : [];
      if (s.a && p) cells.fill(cells[0]);
      const counts = new Map(cells.length ? [[cells[0], s.k]] : []);
      let guard = 0;
      while (cells.length < s.n) {
        if (++guard > 500) retry();
        const v = pickOf(rand, pool);
        if ((counts.get(v) || 0) >= (s.a ? (p ? 0 : 1) : s.k - 1)) continue;
        counts.set(v, (counts.get(v) || 0) + 1);
        cells.push(v);
      }
      return { k: s.k, ...(s.a ? { a: s.a } : {}), cells: shuffle(rand, cells) };
    },
    pays: g => {
      const counts = new Map();
      for (const v of g.cells) counts.set(v, (counts.get(v) || 0) + 1);
      const hit = [...counts].filter(([, n]) => n >= g.k);
      if (g.syms) return hit.reduce((t, [v]) => t + (g.syms.find(x => x[0] === v)?.[1] || 0), 0);
      return g.a ? (hit.length ? g.a : 0) : hit.reduce((t, [v]) => t + v, 0);
    }
  },
  // How many of one symbol (`need`) were uncovered, against a table; with
  // `k` instead, `k` of them win the amount printed (any).
  tally: {
    slots: s => [s.table ? { values: s.table.map(t => t[1]) } : {}],
    build: (s, parts, { rand, list }) => {
      const p = parts[0];
      const table = s.table ?? [[s.k, p ? p.a : decoy(rand, list)]];
      const least = Math.min(...table.map(t => t[0]));
      const count = p ? table.find(t => t[1] === p.a)[0] : Math.floor(rand() * least);
      const cells = [...times(count, () => s.need), ...times(s.n - count, () => pickOf(rand, s.decoys))];
      return { need: s.need, table, cells: shuffle(rand, cells) };
    },
    pays: g => best(g.table, g.cells.filter(x => x === g.need).length)
  },
  // Rounds of symbols: all the same (all `need`, when it says) wins the
  // round's amount (× its multiplier).
  rows: {
    slots: (s, ctx) => s.sizes.map((_, i) => ({ i, ok: s.mults ? a => s.mults.some(x => a % x === 0 && a / x >= ctx.min) : null })),
    build: (s, parts, { rand, list, min }) => {
      const rows = s.sizes.map((size, i) => {
        const p = parts.find(p => p.i === i);
        if (p) {
          const xs = s.mults ? s.mults.filter(x => p.a % x === 0 && p.a / x >= min) : [1];
          const x = xs.length ? pickOf(rand, xs) : 1;
          return { s: times(size, () => null).fill(s.need ?? pickOf(rand, s.symbols)), a: p.a / x, ...(s.mults ? { x } : {}) };
        }
        let sym;
        do sym = times(size, () => pickOf(rand, s.symbols));
        while (sameAll(sym));
        return { s: sym, a: decoy(rand, list), ...(s.mults ? { x: pickOf(rand, s.decoyMults || s.mults) } : {}) };
      });
      return { ...(s.need ? { need: s.need } : {}), rows };
    },
    pays: g => g.rows.reduce((t, r) => t + (sameAll(r.s) && (!g.need || r.s[0] === g.need) ? r.a * (r.x || 1) : 0), 0)
  },
  // 您的分數 against 大力士分數 (`dice`: 您的骰子 against 對手的骰子, 1-6), a
  // round each: higher wins (a tie doesn't).
  duel: {
    slots: s => times(s.rows, i => ({ i })),
    build: (s, parts, { rand, list }) => ({
      ...(s.dice ? { dice: true } : {}),
      rows: times(s.rows, i => {
        const p = parts.find(p => p.i === i);
        if (p) {
          const them = 1 + Math.floor(rand() * (s.max - 1));
          return { you: them + 1 + Math.floor(rand() * (s.max - them)), them, a: p.a };
        }
        const you = 1 + Math.floor(rand() * s.max);
        return { you, them: you + Math.floor(rand() * (s.max - you + 1)), a: decoy(rand, list) };
      })
    }),
    pays: g => g.rows.reduce((t, r) => t + (r.you > r.them ? r.a : 0), 0)
  },
  // Two numbers (1-9) a round: adding up to `target` wins it.
  sum: {
    slots: s => times(s.rows, i => ({ i })),
    build: (s, parts, { rand, list }) => ({
      target: s.target,
      rows: times(s.rows, i => {
        const p = parts.find(p => p.i === i);
        if (p) {
          const x = 1 + Math.floor(rand() * 9);
          return { n: [x, s.target - x], a: p.a };
        }
        let n;
        do n = [1 + Math.floor(rand() * 9), 1 + Math.floor(rand() * 9)];
        while (n[0] + n[1] === s.target);
        return { n, a: decoy(rand, list) };
      })
    }),
    pays: g => g.rows.reduce((t, r) => t + (r.n[0] + r.n[1] === g.target ? r.a : 0), 0)
  },
  // 幸運密碼 and 您的密碼, three digits each a round: the same three win it.
  code: {
    slots: s => times(s.rows, i => ({ i })),
    build: (s, parts, { rand, list }) => ({
      rows: times(s.rows, i => {
        const p = parts.find(p => p.i === i);
        const lucky = times(3, () => Math.floor(rand() * 10));
        if (p) return { lucky, yours: [...lucky], a: p.a };
        const yours = [...lucky];
        const at = Math.floor(rand() * 3);
        yours[at] = (yours[at] + 1 + Math.floor(rand() * 9)) % 10;
        for (let j = 0; j < 3; j++) if (j !== at && rand() < 0.5) yours[j] = Math.floor(rand() * 10);
        return { lucky, yours, a: decoy(rand, list) };
      })
    }),
    pays: g => g.rows.reduce((t, r) => t + (r.lucky.every((d, j) => d === r.yours[j]) ? r.a : 0), 0)
  },
  // Rounds checked against the pool: every item in it wins the round's
  // amount; or (`table`) how many are in it sets the prize.
  rounds: {
    slots: s => s.rounds.map((r, i) => (r.table ? { i, values: r.table.map(t => t[1]) } : r.a ? { i, values: [r.a] } : { i })),
    build: (s, parts, { rand, list, pool }) => ({
      rounds: s.rounds.map((r, i) => {
        const p = parts.find(p => p.i === i);
        const avoid = new Set();
        const take = st => {
          const x = pool.take(st, avoid);
          avoid.add(x);
          return x;
        };
        const extra = r.color ? { color: r.color } : {};
        if (r.table) {
          const least = Math.min(...r.table.map(t => t[0]));
          const hits = p ? r.table.find(t => t[1] === p.a)[0] : Math.floor(rand() * least);
          return { items: shuffle(rand, [...times(hits, () => take('in')), ...times(r.size - hits, () => take('out'))]), table: r.table, ...extra };
        }
        const items = p ? times(r.size, () => take('in')) : shuffle(rand, [take('out'), ...times(r.size - 1, () => take(pool.lean()))]);
        return { items, a: r.a ?? (p ? p.a : decoy(rand, list)), ...extra };
      })
    }),
    pays: (g, has) =>
      g.rounds.reduce((t, r) => {
        const hits = r.items.filter(has).length;
        return t + (r.table ? best(r.table, hits) : hits === r.items.length ? r.a : 0);
      }, 0)
  },
  // A size × size board, its lines across, down and diagonal: complete when
  // every cell is in the pool (or FREE, null) — `mode: 'pool'` — or the same
  // digit — `mode: 'same'`. Any line wins the prize box (`a`); or (`table`)
  // how many lines sets the prize.
  grid: {
    slots: s => [s.table ? { values: s.table.map(t => t[1]) } : {}],
    build: (s, parts, ctx) => {
      const { rand, list, pool } = ctx;
      const p = parts[0];
      const want = p ? (s.table ? s.table.find(t => t[1] === p.a)[0] : 1) : 0;
      const box = s.table ? { table: s.table } : { a: p ? p.a : decoy(rand, list) };
      const lines = linesOf(s.size);
      const n = s.size * s.size;
      if (s.mode === 'same') {
        for (let tries = 0; tries < 400; tries++) {
          const cells = times(n, () => Math.floor(rand() * 10));
          if (want) {
            const d = Math.floor(rand() * 10);
            for (const x of pickOf(rand, lines)) cells[x] = d;
          }
          if (lines.filter(l => sameAll(l.map(x => cells[x]))).length === want) return { size: s.size, mode: 'same', cells, ...box };
        }
        retry();
      }
      const frees = s.frees || 0;
      const options = closedSets(s.size, want).filter(o => o.cells.length - Math.min(frees, o.cells.length) <= pool.room());
      if (!options.length) retry();
      const pick = pickOf(rand, options);
      const covered = new Set(pick.cells);
      const freeAt = new Set(shuffle(rand, want ? pick.cells : range(0, n - 1)).slice(0, frees));
      const state = times(n, x => (freeAt.has(x) ? 'free' : covered.has(x) ? 'in' : null));
      lines.forEach((l, i) => {
        if (pick.lines.includes(i) || l.some(x => state[x] === 'out')) return;
        const open = l.filter(x => state[x] === null);
        if (!open.length) retry();
        state[pickOf(rand, open)] = 'out';
      });
      // The cells that decide nothing: in or out, as many as the pool has room for.
      let roomIn = pool.left('in') - state.filter(st => st === 'in').length;
      let roomOut = pool.left('out') - state.filter(st => st === 'out').length;
      state.forEach((st, x) => {
        if (st !== null) return;
        const inside = roomIn > 0 && (roomOut <= 0 || rand() < 0.45);
        state[x] = inside ? 'in' : 'out';
        if (inside) roomIn--;
        else roomOut--;
      });
      if (roomIn < 0 || roomOut < 0) retry();
      const avoid = new Set();
      const cells = state.map(st => {
        if (st === 'free') return null;
        const x = pool.take(st, avoid);
        avoid.add(x);
        return x;
      });
      return { size: s.size, mode: 'pool', cells, ...box };
    },
    pays: (g, has) => {
      const done = linesOf(g.size).filter(l => (g.mode === 'same' ? sameAll(l.map(x => g.cells[x])) : l.every(x => g.cells[x] === null || has(g.cells[x])))).length;
      return g.table ? (g.table.find(t => t[0] === done)?.[1] ?? 0) : done ? g.a : 0;
    }
  },
  // 金樂透號碼 (six) and 特別號 against the pool: the table by how many and
  // whether the special number's there, the highest only.
  lotto: {
    slots: s => [{ values: s.table.map(t => t[2]) }],
    build: (s, parts, { rand, pool }) => {
      const p = parts[0];
      let hits, special;
      if (p) [hits, special] = s.table.find(t => t[2] === p.a);
      else {
        special = rand() < 0.3;
        hits = Math.floor(rand() * (special ? 2 : 3));
      }
      const avoid = new Set();
      const take = st => {
        const x = pool.take(st, avoid);
        avoid.add(x);
        return x;
      };
      const lotto = shuffle(rand, [...times(hits, () => take('in')), ...times(6 - hits, () => take('out'))]);
      return { lotto, special: take(special ? 'in' : 'out'), table: s.table };
    },
    pays: (g, has) => {
      const hits = g.lotto.filter(has).length;
      const sp = has(g.special);
      return g.table.filter(([k, needSp]) => k === hits && (!needSp || sp)).reduce((m, t) => Math.max(m, t[2]), 0);
    }
  },
  // 獎金號碼: `ones` in the 1-point zone, `tens` in the 10-point zone; the
  // pool's points against the table.
  score: {
    slots: s => [{ values: s.table.map(t => t[1]) }],
    build: (s, parts, { rand, pool }) => {
      const p = parts[0];
      const pts = p ? s.table.find(t => t[1] === p.a)[0] : Math.floor(rand() * s.table[0][0]);
      const tens = pts >= 10 && (pts - 10 < 1 || rand() < 0.7) ? 1 : 0;
      const ones = pts - 10 * tens;
      if (ones > Math.min(s.ones, pool.room())) retry();
      const avoid = new Set();
      const take = st => {
        const x = pool.take(st, avoid);
        avoid.add(x);
        return x;
      };
      return {
        ones: shuffle(rand, [...times(ones, () => take('in')), ...times(s.ones - ones, () => take('out'))]),
        tens: shuffle(rand, [...times(tens, () => take('in')), ...times(s.tens - tens, () => take('out'))]),
        table: s.table
      };
    },
    pays: (g, has) => {
      const pts = g.ones.filter(has).length + 10 * g.tens.filter(has).length;
      return g.table.find(t => t[0] === pts)?.[1] ?? 0;
    }
  },
  // 您的號碼 across the top, 幸運號碼 down the side, an amount where each
  // pair's lines cross: a match wins the amount there; every `bonus` symbol
  // on the board wins its amount.
  cross: {
    slots: s => [...times(3, () => ({ tag: 'match' })), ...times(3, () => ({ values: [s.bonus.a], tag: 'bonus' }))],
    build: (s, parts, { rand, list }) => {
      const nums = shuffle(rand, range(...s.of));
      const yours = nums.slice(0, s.n);
      const lucky = nums.slice(s.n, 2 * s.n);
      const cells = times(s.n, () => times(s.n, () => decoy(rand, list)));
      const cols = shuffle(rand, range(0, s.n - 1));
      const rows = shuffle(rand, range(0, s.n - 1));
      const hit = new Set();
      parts.filter(p => p.tag === 'match').forEach((p, k) => {
        lucky[rows[k]] = yours[cols[k]];
        cells[rows[k]][cols[k]] = p.a;
        hit.add(rows[k] * s.n + cols[k]);
      });
      const open = shuffle(rand, range(0, s.n * s.n - 1).filter(x => !hit.has(x)));
      parts.filter(p => p.tag === 'bonus').forEach((_, k) => (cells[Math.floor(open[k] / s.n)][open[k] % s.n] = s.bonus.s));
      return { yours, lucky, cells, bonus: s.bonus };
    },
    pays: g => {
      let t = 0;
      g.lucky.forEach((l, r) =>
        g.yours.forEach((y, c) => {
          const v = g.cells[r][c];
          if (v === g.bonus.s) t += g.bonus.a;
          else if (y === l) t += v;
        })
      );
      return t;
    }
  }
};

// The pool being built: each item on the card's games marked in it or out of
// it, so a round meant to lose has one item that isn't there.
function poolOf(rand, spec) {
  const alpha = spec.of === 'mahjong' ? MAHJONG : range(...spec.of);
  const state = new Map();
  const cap = { in: spec.n, out: alpha.length - spec.n };
  const count = { in: 0, out: 0 };
  return {
    room: () => cap.in,
    left: st => cap[st] - count[st],
    // In or out at random (an item that decides nothing).
    lean: () => (count.in < cap.in && (count.out >= cap.out || rand() < 0.45) ? 'in' : 'out'),
    take(want, avoid) {
      const fresh = count[want] < cap[want] ? alpha.filter(x => !state.has(x) && !avoid.has(x)) : [];
      const list = fresh.length ? fresh : alpha.filter(x => state.get(x) === want && !avoid.has(x));
      if (!list.length) retry();
      const x = decoy(rand, list);
      if (!state.has(x)) {
        state.set(x, want);
        count[want]++;
      }
      return x;
    },
    // The pool: every item marked in, the rest from items no game shows.
    finish() {
      const items = alpha.filter(x => state.get(x) === 'in');
      const rest = shuffle(rand, alpha.filter(x => !state.has(x)));
      while (items.length < spec.n && rest.length) items.push(rest.pop());
      return shuffle(rand, items);
    }
  };
}

// The prize split over the face's slots: up to 4 parts (or 6 when it can't
// otherwise be shown), mostly one, sometimes a few.
function assign(rand, prize, slots, list) {
  let budget = 6_000;
  const go = (left, avail, depth, split) => {
    if (left === 0) return [];
    if (depth === 0 || --budget < 0) return null;
    for (const s of shuffle(rand, avail)) {
      let o = s.values ? s.values.filter(v => v <= left) : [left, ...(depth > 1 ? list.filter(v => v < left) : [])];
      if (s.ok) o = o.filter(s.ok);
      o = split ? shuffle(rand, o) : [...o.filter(v => v === left), ...shuffle(rand, o.filter(v => v !== left))];
      for (const a of o.slice(0, 4)) {
        const rest = go(left - a, avail.filter(x => x !== s && !(x.gi === s.gi && (x.alone || s.alone))), depth - 1, split);
        if (rest) return [{ ...s, a }, ...rest];
      }
    }
    return null;
  };
  const split = rand() < 0.3;
  const found = go(prize, slots, 4, split) ?? go(prize, slots, 4, !split);
  if (found) return found;
  budget = 40_000;
  return go(prize, slots, 6, false);
}

function gamesFace(id, prize, rand) {
  const c = CARDS[id];
  const list = amounts(id);
  const ctx = { rand, list, min: Math.min(...list) };
  const slots = c.games.flatMap((g, gi) => GAMES[g.type].slots(g, ctx).map(s => ({ ...s, gi })));
  const parts = prize ? assign(rand, prize, slots, list) : [];
  if (!parts) return null;
  ctx.pool = c.pool ? poolOf(rand, c.pool) : null;
  const games = c.games.map((g, gi) =>
    GAMES[g.type].build(
      g,
      parts.filter(p => p.gi === gi),
      ctx
    )
  );
  return { kind: 'games', pool: ctx.pool ? ctx.pool.finish() : null, games: games.map((g, gi) => ({ type: c.games[gi].type, ...g })) };
}

// The card's face for its prize: what's under the scratch-off (the same for
// the same seed).
export function face(id, prize, seed) {
  if (!CARDS[id].games) return legacyFace(id, prize, seed);
  for (let t = 0; t < 40; t++) {
    try {
      const f = gamesFace(id, prize, seeded(seed + t * 7_919));
      if (f) return f;
    } catch (e) {
      if (!(e instanceof Retry)) throw e;
    }
  }
  return null;
}

// What a face pays, read from the face alone (the tests check it equals the
// prize the card was bought with).
export function facePays(id, f) {
  if (!f) return 0;
  if (f.kind !== 'games') return legacyPays(id, f);
  const pool = new Set(f.pool || []);
  const has = x => pool.has(x);
  return f.games.reduce((t, g) => t + GAMES[g.type].pays(g, has), 0);
}

// ---- The retired cards' faces (one layout each) ---------------------------

// Splits a prize into up to `n` shown amounts that add up to it.
function split(rand, prize, list, n) {
  const parts = [];
  let left = prize;
  const usable = list.filter(a => a <= prize).sort((a, b) => b - a);
  while (left > 0 && parts.length < n - 1 && rand() < 0.45) {
    const a = usable.find(x => x < left && rand() < 0.7);
    if (!a) break;
    parts.push(a);
    left -= a;
  }
  parts.push(left);
  return parts;
}
function legacyFace(id, prize, seed) {
  const c = CARDS[id];
  const rand = seeded(seed);
  const list = amounts(id);
  if (c.layout === 'symbol') {
    const decoys = c.multiplier ? ['🪙', '💎', '👑', '🏆', '⭐', '🍀'] : ['🍒', '🔔', '🍋', '⭐', '🍀', '💎'];
    let mult = 1;
    let base = prize;
    if (c.multiplier && prize) {
      const options = [1, 2, 5, 10].filter(m => prize % m === 0 && list.some(a => a <= prize / m));
      mult = pickOf(rand, options);
      base = prize / mult;
    } else if (c.multiplier) mult = pickOf(rand, [1, 2, 5, 10]);
    const wins = prize ? split(rand, base, list, 3) : [];
    const spots = [...wins.map(a => ({ s: c.symbol, a, win: true }))];
    while (spots.length < c.spots) spots.push({ s: pickOf(rand, decoys), a: pickOf(rand, list), win: false });
    return { kind: 'symbol', mult: c.multiplier ? mult : null, spots: shuffle(rand, spots) };
  }
  if (c.layout === 'match3') {
    // Nine amounts; the prize three times, nothing else three times.
    const cells = prize ? [prize, prize, prize] : [];
    const counts = new Map(cells.length ? [[prize, 3]] : []);
    while (cells.length < 9) {
      const a = pickOf(rand, list);
      if ((counts.get(a) || 0) >= 2) continue;
      counts.set(a, (counts.get(a) || 0) + 1);
      cells.push(a);
    }
    return { kind: 'match3', cells: shuffle(rand, cells) };
  }
  if (c.layout === 'numbers') {
    const pool = shuffle(rand, Array.from({ length: 60 }, (_, i) => i + 1));
    const winning = pool.slice(0, c.winning);
    const others = pool.slice(c.winning);
    const wins = prize ? split(rand, prize, list, 3) : [];
    const yours = wins.map((a, i) => ({ n: winning[i % winning.length], a, win: true }));
    let k = 0;
    while (yours.length < c.yours) yours.push({ n: others[k++], a: pickOf(rand, list), win: false });
    return { kind: 'numbers', winning, yours: shuffle(rand, yours) };
  }
  if (c.layout === 'bingo') {
    // A 5×5 card of 1-75 (free centre), 24 called numbers; the prize's line
    // complete (a row, a column or a diagonal) and no other.
    const cols = [0, 1, 2, 3, 4].map(col => shuffle(rand, Array.from({ length: 15 }, (_, i) => col * 15 + i + 1)).slice(0, 5));
    const grid = Array.from({ length: 5 }, (_, r) => cols.map(col => col[r]));
    grid[2][2] = 0;
    const lines = [];
    for (let i = 0; i < 5; i++) lines.push(grid[i].map((_, j) => [i, j]), grid.map((_, j) => [j, i]));
    lines.push([0, 1, 2, 3, 4].map(i => [i, i]), [0, 1, 2, 3, 4].map(i => [i, 4 - i]));
    const complete = called => lines.filter(line => line.every(([r, c2]) => !grid[r][c2] || called.has(grid[r][c2])));
    for (let attempt = 0; attempt < 400; attempt++) {
      const called = new Set();
      let line = null;
      if (prize) {
        line = pickOf(rand, lines);
        for (const [r, c2] of line) if (grid[r][c2]) called.add(grid[r][c2]);
      }
      const all = shuffle(rand, Array.from({ length: 75 }, (_, i) => i + 1));
      for (const n of all) {
        if (called.size >= 24) break;
        if (called.has(n)) continue;
        called.add(n);
        if (complete(called).length > (prize ? 1 : 0)) called.delete(n);
      }
      if (called.size === 24 && complete(called).length === (prize ? 1 : 0)) return { kind: 'bingo', grid, called: shuffle(rand, [...called]), line, prize };
    }
    return { kind: 'bingo', grid, called: [], line: null, prize };
  }
  if (c.layout === 'slots') {
    // Rows of three pictures and a prize each: the prize's rows three alike,
    // no other row.
    const wins = prize ? split(rand, prize, list, 3) : [];
    const rows = wins.map(a => ({ s: Array(3).fill(pickOf(rand, c.symbols)), a, win: true }));
    while (rows.length < c.lines) {
      const s = [pickOf(rand, c.symbols), pickOf(rand, c.symbols), pickOf(rand, c.symbols)];
      if (s[0] === s[1] && s[1] === s[2]) continue;
      rows.push({ s, a: pickOf(rand, list), win: false });
    }
    return { kind: 'slots', rows: shuffle(rand, rows) };
  }
  if (c.layout === 'beat') {
    // The 大力士分數 (`dealer`, 6-17 of 1-20); winning rows above it, the rest at or under.
    const dealer = 6 + Math.floor(rand() * 12);
    const wins = prize ? split(rand, prize, list, 3) : [];
    const rows = wins.map(a => ({ n: dealer + 1 + Math.floor(rand() * (20 - dealer)), a }));
    while (rows.length < c.rows) rows.push({ n: 1 + Math.floor(rand() * dealer), a: pickOf(rand, list) });
    return { kind: 'beat', dealer, rows: shuffle(rand, rows) };
  }
  if (c.layout === 'treasure') {
    // Twelve digs; the prize's treasure three times, every other at most twice.
    const key = tiersOf(id).map((t, i) => ({ s: TREASURES[i], a: t.prize }));
    const hit = key.find(k => k.a === prize);
    const cells = hit ? [hit.s, hit.s, hit.s] : [];
    const counts = new Map(hit ? [[hit.s, 3]] : []);
    const pool = [...TREASURES, '🪨', '🦴'];
    while (cells.length < 12) {
      const s = pickOf(rand, pool);
      if ((counts.get(s) || 0) >= 2) continue;
      counts.set(s, (counts.get(s) || 0) + 1);
      cells.push(s);
    }
    return { kind: 'treasure', key, cells: shuffle(rand, cells) };
  }
  if (c.layout === 'dice') {
    const pair = total => {
      const a = Math.max(1, total - 6) + Math.floor(rand() * (Math.min(6, total - 1) - Math.max(1, total - 6) + 1));
      return [a, total - a];
    };
    const wins = prize ? split(rand, prize, list, 3) : [];
    const rounds = wins.map(a => {
      const them = 2 + Math.floor(rand() * 10);
      return { you: pair(them + 1 + Math.floor(rand() * (12 - them))), them: pair(them), a };
    });
    while (rounds.length < c.rounds) {
      const you = 2 + Math.floor(rand() * 11);
      rounds.push({ you: pair(you), them: pair(you + Math.floor(rand() * (13 - you))), a: pickOf(rand, list) });
    }
    return { kind: 'dice', rounds: shuffle(rand, rounds) };
  }
  if (c.layout === 'wheel') {
    // Twelve slices: every prize once and four 0s; the pointer on the prize's.
    const slices = shuffle(rand, [...list, 0, 0, 0, 0]);
    const at = prize ? slices.indexOf(prize) : pickOf(rand, slices.map((v, i) => (v ? -1 : i)).filter(i => i >= 0));
    return { kind: 'wheel', slices, at };
  }
  return null;
}

function legacyPays(id, f) {
  if (f.kind === 'symbol') return f.spots.filter(s => s.win).reduce((s, x) => s + x.a, 0) * (f.mult || 1);
  if (f.kind === 'match3') {
    const counts = new Map();
    for (const a of f.cells) counts.set(a, (counts.get(a) || 0) + 1);
    return [...counts].filter(([, n]) => n >= 3).reduce((s, [a]) => s + a, 0);
  }
  if (f.kind === 'numbers') return f.yours.filter(y => f.winning.includes(y.n)).reduce((s, y) => s + y.a, 0);
  if (f.kind === 'bingo') return f.line ? f.prize : 0;
  if (f.kind === 'slots') return f.rows.filter(r => r.s[0] === r.s[1] && r.s[1] === r.s[2]).reduce((s, r) => s + r.a, 0);
  if (f.kind === 'beat') return f.rows.filter(r => r.n > f.dealer).reduce((s, r) => s + r.a, 0);
  if (f.kind === 'treasure') {
    const counts = new Map();
    for (const s of f.cells) counts.set(s, (counts.get(s) || 0) + 1);
    return f.key.filter(k => (counts.get(k.s) || 0) >= 3).reduce((s, k) => s + k.a, 0);
  }
  if (f.kind === 'dice') return f.rounds.filter(r => r.you[0] + r.you[1] > r.them[0] + r.them[1]).reduce((s, r) => s + r.a, 0);
  if (f.kind === 'wheel') return f.slices[f.at] || 0;
  return 0;
}

// Buying: the cost now; the prize goes in once it's scratched (revealScratch).
export function buyScratch(account, { id, card }, now = new Date(), { extra = 0, rand = cryptoRand, seed = randomInt(2 ** 31) } = {}) {
  const c = CARDS[card];
  if (!onSale(card, now)) return { error: 'game' };
  const own = account.ledger.reduce((s, e) => s + e.amount, 0);
  if (c.price > own + extra) return { error: 'funds' };
  const t = now.toISOString();
  const ticket = { id, t, game: `scratch:${card}`, card, cost: c.price, prize: drawPrize(card, rand), seed, status: 'open' };
  return { account: { ...account, updated: t, ledger: [...account.ledger, { id: `lotto-${id}`, t, kind: 'lottery', amount: -c.price }], tickets: [ticket, ...(account.tickets || [])] }, ticket };
}

// Scratched: the prize paid in (taxed like any lottery prize over NT$5,000).
export function revealScratch(account, ticketId, now = new Date()) {
  const ticket = (account.tickets || []).find(x => x.id === ticketId);
  if (!ticket || ticket.status !== 'open' || !ticket.card) return account;
  const net = prizeAfterTax(ticket.prize);
  const t = now.toISOString();
  const ledger = net > 0 && !account.ledger.some(e => e.id === `prize-${ticketId}`) ? [...account.ledger, { id: `prize-${ticketId}`, t, kind: 'prize', amount: net }] : account.ledger;
  return { ...account, updated: t, ledger, tickets: account.tickets.map(x => (x.id === ticketId ? { ...x, status: 'settled', gross: x.prize, prize: net, settledAt: t } : x)) };
}
