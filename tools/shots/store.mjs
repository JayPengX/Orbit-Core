// The screenshots each app is shown with, in the Showcase and its README
// (tools/store-shots.mjs). An advertiser's order (RULEBOOK §3): the app's
// hero screen first, its signature features next, niche ones last. Each shot
// shows something different (another game, stock, trip, place), its key card
// in the middle of the screen, nothing cut by the edges or the tab bar.
//
//   app: preview.mjs's name · brand: kit BRANDS id · show: the Showcase's id · prefix: README file names
//   shots: [{ zh, en, dark, page: a pages.mjs name, hash, args: [...preview args], account, wait, ai }]
//   (hash and args may be { zh, en } where the two languages differ; ai: [[url text or 'feature:<name>', fixture]],
//   a real answer asked once as a phone (build.yml as-phone) and kept in shots/ai/<fixture>.<lang>.ndjson|json)
//
// Nine a set (three rows of three), as a seller would: what the app is for first, then what only
// Orbit does (its AI, 議會 and 代表會, the flight timer), then the rest of the basics.
import { tap, wait } from './pages.mjs';

const click = (...sels) => sels.flatMap(s => ['--click', s]);
// Scroll the element (the last match, so an open sheet's own) to the middle of the screen.
const centre = (sel, block = 'center') => `js:[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>e.offsetParent||e.closest('dialog[open]')).pop()?.scrollIntoView({block:'${block}'})`;
// A card in the open sheet holding this text, scrolled to the middle.
const sheetCard = (re, block = 'center') => `js:[...[...document.querySelectorAll('dialog.q-sheet[open]')].pop().querySelectorAll('.q-card')].find(c=>/${re}/.test(c.textContent))?.scrollIntoView({block:'${block}'})`;

// Scroll an element (found by a js expression) to just under the sheet's or page's header.
const toTop = (expr, gap = 84) => `js:(e=>{if(!e)return;e.scrollIntoView({block:'start'});let p=e.parentElement;while(p&&!(p.scrollHeight>p.clientHeight+1&&/auto|scroll/.test(getComputedStyle(p).overflowY)))p=p.parentElement;(p||document.scrollingElement).scrollTop-=${gap}})(${expr})`;

// Sports: yesterday's closest finished NBA game (not the followed team's, which the hero shows).
const closeNba = "js:(()=>{const r=[...document.querySelectorAll('.event-row')].filter(e=>e.offsetParent&&/完賽|Final/.test(e.textContent)&&!/湖人|Lakers/.test(e.textContent));const m=e=>{const n=(e.textContent.match(/\\d{2,3}/g)||[]).map(Number).filter(x=>x>60);return n.length>=2?Math.abs(n[0]-n[1]):99};r.sort((a,b)=>m(a)-m(b))[0].click()})()";
const yesterday = "js:(()=>{const d=new Date(Date.now()+8*36e5-864e5).toISOString().slice(0,10);[...document.querySelectorAll(`[data-day=\"${d}\"]`)].filter(e=>e.offsetParent).forEach(e=>e.click())})()";

// Transit: a place typed in the map's search, its first answer, then 交通's plans (and one plan).
// (Typed in Chinese in both languages: English names find only Google's places, not the stations.)
const search = name => `js:(()=>{const q=document.querySelector('#q');q.focus();q.value=${JSON.stringify(name)};q.dispatchEvent(new Event('input',{bubbles:true}))})()`;
// The first answer that is a station (台鐵 or 高鐵), else the first.
const firstStation = "js:([...document.querySelectorAll('.ot-res')].find(b=>/\"kind\":\"(tra|hsr)\"/.test(b.dataset.res||''))||document.querySelector('.ot-res')).click()";
const trip = name => [search(name), wait(8000), firstStation, wait(1500), "js:document.querySelector('[data-card=go]')?.click()", wait(9000)];
const plan0 = ["js:document.querySelector('.ot-plan[data-plan=\"0\"]')?.click()", wait(8000)];
// 查時刻: a station picked for 出發 or 抵達 (typed in Chinese: the picker finds both languages' names).
const station = (which, name) => `js:(async()=>{const z=ms=>new Promise(r=>setTimeout(r,ms));document.querySelector('[data-pick=${which}]').click();await z(800);const q=document.querySelector('#s-q');q.value='${name}';q.dispatchEvent(new Event('input',{bubbles:true}));await z(800);document.querySelector('#s-body [data-st]').click()})()`;
const busRoute = no => `js:(async()=>{const z=ms=>new Promise(r=>setTimeout(r,ms));[...document.querySelectorAll('button,[role=tab]')].find(b=>b.offsetParent&&/^(公車|Bus)$/.test(b.textContent.trim())).click();await z(2500);const q=document.querySelector('#tb-q');q.value='${no}';q.dispatchEvent(new Event('input',{bubbles:true}));await z(3000);[...document.querySelectorAll('#times-bus button')].find(b=>b.offsetParent&&b.textContent.trim().startsWith('${no}'))?.click()})()`;
// The busiest YouBike dock in view above the sheet, marked for a real tap (#shot-target).
const bikeDock = "js:(()=>{const n=m=>(m.textContent.match(/\\d+/g)||[]).reduce((s,x)=>s+ +x,0);const ms=[...document.querySelectorAll('.bike:not(.plan)')].filter(m=>{const r=m.getBoundingClientRect();return r.width&&r.top>120&&r.bottom<400&&r.left>20&&r.right<330&&n(m)});ms.sort((a,b)=>n(b)-n(a));if(ms[0])ms[0].id='shot-target'})()";
const TAIPEI = ['--geo', '25.0478,121.5170'];
// Trips on the real clock: a fixed day goes stale (yesterday's timetables are gone). Shoot in Taiwan's morning.
const MORNING = [];

const SCHOOL = ['--clock', '2026-11-04T10:30'];
// Text typed in a field (found by selector) and sent as input.
const type = (sel, text) => `js:(i=>{i.focus();i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}))})(document.querySelector(${JSON.stringify(sel)}))`;
// The open sheet's scrolled parts back at their top.
const sheetTop = "js:document.querySelectorAll('dialog[open], dialog[open] *').forEach(e=>{if(e.scrollTop)e.scrollTop=0})";
// A button or row whose text starts so, the last one showing (a sheet's over the page's).
const press = re => `js:[...document.querySelectorAll('button,a,[role=button],.q-ritem,.q-cell')].filter(e=>e.offsetParent&&/^\\s*(${re})/.test(e.textContent.trim())).pop()?.click()`;
// Law: a council's page (its code kept as the phone would), and one of its 代表會 opened.
const council = code => ['--store', `orbit-law.council.v1=${code}`];
// Beats: 用說的做節奏, typed in the radio's bar and sent.
const say = text => click(wait(6000), "js:document.querySelector('.bt-stations, .bt-sec')?.scrollIntoView({block:'start'})", `js:(i=>{i.focus();i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}));i.closest('form')?.requestSubmit?.()||i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})(document.querySelector('.bt-stations textarea, .bt-stations input, .bt-sec textarea, .bt-sec input'))`, wait(6000));
const town = name => click(wait(3500), `js:[...document.querySelectorAll('[data-town]')].find(e=>e.offsetParent&&/${name}/.test(e.textContent))?.click()`, wait(6000));
export const STORE = {
  transit: {
    app: 'transit', brand: 'transit', show: 'transit', prefix: 'transit', args: ['--google-map'],
    shots: [
      { zh: '路線畫在 Google 地圖上', en: 'Your trip on Google Maps', args: [...MORNING, ...click(...trip('臺中車站'))] },
      { zh: '用說的查路線', en: 'Just say where you’re going', dark: true, hash: { zh: 'ask=明天早上八點從新竹車站到台北101', en: 'ask=Tomorrow 8am from Hsinchu Station to Taipei 101' }, ai: [['feature:transit-say', 'transit-say']], wait: 12000 },
      { zh: '最快的走法，一眼看懂', en: 'The fastest way, at a glance', args: [...MORNING, ...TAIPEI, ...click(...trip('新竹車站'))] },
      { zh: '兩站之間每一班車', en: 'Every train between two stations', dark: true, args: [...MORNING, ...TAIPEI, ...click('#tab-times', wait(3000), station('from', '臺北'), wait(1500), station('to', '花蓮'), wait(7000))] },
      { zh: '公車還要等多久', en: 'How long until the bus', args: [...TAIPEI, ...click('#tab-times', wait(2500), busRoute('307'), wait(6000))] },
      { zh: 'YouBike 即時車位', en: 'YouBike docks, live', args: ['--geo', '25.0330,121.5434', ...click(wait(6000), bikeDock, "js:(e=>{if(!e)return;for(const t of ['pointerdown','mousedown','pointerup','mouseup','click'])e.dispatchEvent(new MouseEvent(t,{bubbles:true}))})(document.getElementById('shot-target'))", wait(4000))] },
      { zh: '車站即時班次', en: 'Live trains at the station', dark: true, args: click(search('板橋'), wait(8000), firstStation, wait(9000)) },
      { zh: '捷運路網，照真的路線畫', en: 'Metro maps, true to the lines', page: 'metro', wait: 8000 },
      { zh: '高鐵訂位一路帶到底', en: 'High-speed rail, booked through', dark: true, page: 'hsr-book', wait: 8000 }
    ]
  },
  sports: {
    app: 'sports', brand: 'match', show: 'sports', prefix: 'sports', account: 'fan',
    shots: [
      { zh: '你的比賽，一打開就看到', en: 'Your games, the moment you open it', wait: 14000 },
      { zh: '問你的球隊，AI 從真資料回答', en: 'Ask about your teams, answered from real data', dark: true, hash: { zh: 'ask=湖人現在排第幾？下一場打誰？', en: 'ask=Where are the Lakers in the standings, and who do they play next?' }, ai: [['feature:sports-ask', 'sports-ask']], wait: 12000 },
      { zh: '賽後三句話，球員和球隊一眼認', en: 'Three lines after the game, faces and logos', page: 'home-recap', args: click("js:document.querySelector('.q-card.recap .event-row, .q-card.recap')?.click()", wait(7000)) },
      { zh: 'F1 勝負關鍵，AI 讀完整場', en: 'What decided the F1 race', dark: true, page: 'f1-story', args: click(toTop("document.querySelector('.f1-ai')", 100), wait(1500)) },
      { zh: '正在轉播的比賽，一鍵觀看', en: 'What’s on now, one tap to watch', hash: 'live', args: click(wait(3000)) },
      { zh: '勝率走勢與關鍵時刻', en: 'How the game swung, and when', dark: true, args: click('#tab-matches', '[data-league=nba]', wait(2500), yesterday, wait(3000), closeNba, wait(8000), sheetCard('勝率走勢|Win probability'), wait(1500)) },
      { zh: 'F1 每一站，倒數到起跑', en: 'Every F1 weekend, counted down', page: 'f1-next', args: click("js:[...document.querySelectorAll('dialog.q-sheet[open]')].pop().scrollTop=0", wait(800)) },
      { zh: '積分榜與爭冠形勢', en: 'The table and the title race', dark: true, page: 'epl-table' },
      { zh: '每位球員的完整生涯', en: 'Every player’s whole career', args: click("js:import('./sheets.js').then(m=>m.openPlayer('nba','3202'))", wait(6000), tap('資料|Bio'), wait(6000), toTop("[...document.querySelectorAll('dialog.q-sheet[open]')].pop().querySelector('.career-teams')?.closest('.q-card')"), wait(800)) }
    ]
  },
  weather: {
    app: 'weather', brand: 'weather', show: 'weather', prefix: 'weather', account: 'pins',
    shots: [
      { zh: '今天天氣一眼看完', en: 'Today, in one look', wait: 9000 },
      { zh: '用問的：明天會下雨嗎？', en: 'Just ask: will it rain tomorrow?', dark: true, hash: { zh: 'ask=明天竹北會下雨嗎', en: 'ask=Will it rain in Zhubei tomorrow?' }, wait: 9000 },
      { zh: '未來十天降雨', en: 'Rain, ten days ahead', page: 'rain', wait: 9000 },
      { zh: '一天的每小時', en: 'Every hour of the day', dark: true, page: 'day', wait: 9000 },
      { zh: '附近空氣品質', en: 'The air around you', page: 'air', wait: 9000 },
      { zh: '今日數據與貼心建議', en: 'Today’s numbers, and advice', dark: true, page: 'lower', wait: 9000 },
      { zh: '你的每個地點', en: 'Every place you keep', args: click('#tab-places', wait(2500)), wait: 9000 },
      { zh: '明天每小時的天氣', en: 'Tomorrow, hour by hour', dark: true, page: 'day', args: click(press('明天|Tmrw|Tomorrow'), wait(2500)), wait: 9000 },
      { zh: '首頁照你的習慣排', en: 'Your home, in your order', page: 'layout', wait: 9000 }
    ]
  },
  class: {
    app: 'orbit', brand: 'orbit', show: 'class', prefix: 'class', account: 'week',
    // Mid-morning on a school day; the flight on the real clock (planes landing now).
    shots: [
      { zh: '現在、下一節與剩餘時間', en: 'Now, next, and time left', args: SCHOOL },
      { zh: '跟著真的飛機專注', en: 'Focus on a real flight', dark: true, page: 'flight', wait: 12000 },
      { zh: '用說的改課表，也能問課表', en: 'Change or ask your timetable in words', page: 'editor', args: SCHOOL },
      { zh: '整週課表一眼看', en: 'Your whole week', dark: true, hash: 'week', args: SCHOOL },
      { zh: '每一節課的細節', en: 'Every class, in detail', page: 'class', args: SCHOOL },
      { zh: '調課幾秒完成', en: 'Swap a class in seconds', dark: true, page: 'swap', args: SCHOOL },
      { zh: '拍下課表，AI 幫你讀', en: 'Snap it, AI reads it', page: 'photo', args: SCHOOL },
      { zh: '課表加到手機行事曆', en: 'Your timetable in your calendar', dark: true, page: 'cal', args: SCHOOL },
      { zh: '今天的課與倒數', en: 'Today’s classes and countdowns', page: 'lower', args: SCHOOL }
    ]
  },
  money: {
    app: 'money', brand: 'money', show: 'money', prefix: 'money', account: 'demo',
    shots: [
      { zh: '一整個月的收支', en: 'Your month on a calendar' },
      { zh: '問你的帳，答案畫成圖', en: 'Ask your books, see the answer', dark: true, hash: { zh: 'ask=這個月吃飯花了多少？', en: 'ask=How much did I spend on food this month?' }, ai: [['feature:money-ask', 'money-ask']], args: click(wait(1500), sheetTop, wait(600)), wait: 9000 },
      { zh: '幾秒就記一筆', en: 'Log spending in seconds', page: 'entry-typed' },
      { zh: '錢花到哪裡，一圈看懂', en: 'Where the money went', dark: true, page: 'stats' },
      { zh: '每個帳戶與悠遊卡', en: 'Every account, EasyCard too', hash: 'accts' },
      { zh: '一整年的走勢', en: 'The whole year', dark: true, page: 'stats-year' },
      { zh: '早餐、午餐、晚餐分開記', en: 'Breakfast, lunch and dinner apart', page: 'entry-food' },
      { zh: '十二大類，一眼分好', en: 'Twelve broad categories', dark: true, page: 'cats' },
      { zh: '越用越懂你的習慣', en: 'It learns your habits', page: 'guessing' }
    ]
  },
  news: {
    app: 'news', brand: 'news', show: 'news', prefix: 'news',
    shots: [
      { zh: '今天的頭條，各家怎麼報', en: 'Today’s top stories, every side', wait: 9000 },
      { zh: '同一則新聞，每一邊的標題', en: 'One story, each side’s headlines', dark: true, args: click("js:document.querySelector('.nw-lead')?.click()", wait(3000)), wait: 9000 },
      { zh: '今天五則，挑給你的', en: 'Today’s five, picked for you', args: click("js:document.querySelector('.nw-brief')?.scrollIntoView({block:'center'})", wait(1500)), wait: 9000 },
      { zh: '台灣新聞，依重要程度排', en: 'Taiwan’s news, by importance', dark: true, hash: 'tw', args: click(tap('能源|Energy'), wait(2500)), wait: 9000 },
      { zh: '國際新聞，左中右一眼看', en: 'World news, left to right', hash: 'intl', args: click(tap('經濟|Economy'), wait(2500)), wait: 9000 },
      { zh: '只有一邊在報的新聞', en: 'Stories only one side carries', dark: true, hash: 'side', wait: 9000 },
      { zh: '每家媒體的立場與來源', en: 'Every outlet’s place, and why', hash: 'outlets', args: click(toTop("[...document.querySelectorAll('h2,h3,.q-section-head,header')].find(e=>e.offsetParent&&/^(台灣媒體|Taiwan’s outlets)/.test(e.textContent.trim()))", 40), wait(800)), wait: 9000 },
      { zh: '科技新聞，各方一起看', en: 'Tech news, every side', dark: true, hash: 'tw', args: click(tap('科技|Tech'), wait(2500)), wait: 9000 },
      { zh: '政治新聞，標出立場', en: 'Politics, each side marked', hash: 'tw', args: click(tap('政治|Politics'), wait(2500)), wait: 9000 }
    ]
  },
  words: {
    app: 'words', brand: 'vocab', show: 'words', prefix: 'words', account: 'demo',
    shots: [
      { zh: '今日目標與連續天數', en: 'Today’s goal and streak', wait: 7000 },
      { zh: '用新字跟 AI 聊天', en: 'Chat with AI using new words', dark: true, args: click(press('用新字聊天|Chat with'), wait(3000)), wait: 7000 },
      { zh: '答完馬上知道為什麼', en: 'Know why, right away', page: 'answered', wait: 7000 },
      { zh: '每個單字都有解說', en: 'Every word, explained', dark: true, page: 'word', wait: 7000 },
      { zh: '多種練習模式', en: 'Many ways to practise', page: 'modes', wait: 7000 },
      { zh: '用例句練習', en: 'Practise in sentences', dark: true, page: 'sentence', wait: 7000 },
      { zh: '拼字比賽模擬考', en: 'A mock spelling contest', page: 'contest', wait: 7000 },
      { zh: '單字卡複習', en: 'Flash cards', dark: true, page: 'flash', wait: 7000 },
      { zh: '看見自己進步', en: 'Watch yourself improve', hash: 'progress', wait: 7000 }
    ]
  },
  beats: {
    app: 'beats', brand: 'beats', show: 'beats', prefix: 'beats',
    shots: [
      { zh: '為你做的音樂', en: 'Music made for you', dark: true, page: 'home-playing' },
      { zh: '說想聽什麼，就換成那種歌', en: 'Say what you want to hear', args: { zh: say('讀書用的 lo-fi'), en: say('lo-fi to study') } },
      { zh: '各種心情與電台', en: 'Moods and stations', dark: true, page: 'home-lower' },
      { zh: '用你的方式創作', en: 'Create your way', page: 'make' },
      { zh: '在樂器室做節拍', en: 'Make beats in the studio', dark: true, page: 'studio' },
      { zh: '用打擊墊即興', en: 'Jam on the pads', page: 'jam' },
      { zh: '每首歌都能玩節奏遊戲', en: 'A rhythm game for any song', dark: true, page: 'game', args: click(wait(14000)) },
      { zh: '正在播放', en: 'Now playing', page: 'now-playing' },
      { zh: '收藏你喜歡的歌', en: 'Keep the songs you like', dark: true, page: 'library-songs' }
    ]
  },
  law: {
    app: 'law', brand: 'law', show: 'law', prefix: 'law',
    shots: [
      { zh: '用白話問法律，每句都附條文', en: 'Ask in plain words, every point cited', hash: { zh: 'tab=ask&q=房東扣光押金合理嗎？', en: 'tab=ask&q=Can my landlord keep my whole deposit?' }, ai: [['law-chat', 'law-deposit']], wait: 9000 },
      { zh: '22 個縣市議會都在這', en: 'All 22 city and county councils', dark: true, hash: 'tab=bills&f=council', wait: 9000 },
      { zh: '連鄉鎮市民代表會都有', en: 'Down to every township council', hash: 'tab=bills&f=council', args: [...council('hsq'), ...click(wait(3500), toTop("[...document.querySelectorAll('[data-town]')].find(e=>e.offsetParent)", 150), wait(1500))], wait: 4000 },
      { zh: '代表會的決議、質詢與錄音', en: 'A township’s votes, questions and recordings', dark: true, hash: 'tab=bills&f=council', args: [...council('hsq'), ...town('竹北')], wait: 4000 },
      { zh: '每個議會哪天開會，錄影都在', en: 'Every council’s sittings, day by day', hash: 'tab=bills&f=council', args: click(wait(3000), press('各議會的議程|Every council'), wait(3500), press('昨天|Yday|Yesterday'), wait(2500)), wait: 4000 },
      { zh: '每一條條文都能點', en: 'Every article, every link', dark: true, page: 'article', wait: 8000 },
      { zh: '法案改了什麼', en: 'What a bill changes', page: 'bill-diff', wait: 8000 },
      { zh: '每個政黨怎麼投票', en: 'How every party voted', dark: true, page: 'votes', wait: 8000 },
      { zh: '判決隨手查', en: 'Court rulings, searchable', page: 'ruling', wait: 8000 }
    ]
  },
  securities: {
    app: 'securities', brand: 'stock', show: 'securities', prefix: 'securities', account: 'demo',
    shots: [
      { zh: '投資組合總覽', en: 'Your whole portfolio', dark: true, wait: 12000 },
      { zh: '用說的下單，單子幫你填好', en: 'Say the order, the ticket fills itself', args: click('#tab-markets', wait(2000), type('#search', '用 5 萬買台積電零股'), wait(6000), press('填好單|Fill'), wait(4000)), wait: 8000 },
      { zh: '真實報價與 K 線', en: 'Real prices, real charts', dark: true, page: 'stock', wait: 12000 },
      { zh: '真實台股規則、手續費與稅', en: 'Real TWSE rules, fees and tax', page: 'ticket', wait: 12000 },
      { zh: '台股、美股、基金一次看', en: 'Taiwan, US, funds and more', dark: true, page: 'list', wait: 12000 },
      { zh: '你的交易紀錄', en: 'Every trade you made', page: 'activity', wait: 12000 },
      { zh: '交易統計與勝率', en: 'Your trading, in numbers', dark: true, page: 'stats', wait: 12000 },
      { zh: '配息、定期定額與提醒', en: 'Dividends, plans and alerts', page: 'more', wait: 12000 },
      { zh: '用銀行匯率換匯', en: 'Exchange at bank rates', dark: true, page: 'rates', wait: 12000 }
    ]
  }
};
