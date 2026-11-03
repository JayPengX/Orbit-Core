// The screenshots each app is shown with, in the Showcase and its README
// (tools/store-shots.mjs). An advertiser's order (RULEBOOK §3): the app's
// hero screen first, its signature features next, niche ones last. Each shot
// shows something different (another game, stock, trip, place), its key card
// in the middle of the screen, nothing cut by the edges or the tab bar.
//
//   app: preview.mjs's name · brand: kit BRANDS id · show: the Showcase's id · prefix: README file names
//   shots: [{ zh, en, dark, page: a pages.mjs name, hash, args: [...preview args], account, wait }]
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
const MORNING = ['--clock', '2026-11-02T08:20'];

export const STORE = {
  transit: {
    app: 'transit', brand: 'transit', show: 'transit', prefix: 'transit', args: ['--google-map'],
    shots: [
      { zh: '路線畫在 Google 地圖上', en: 'Your trip on Google Maps', args: [...MORNING, ...click(...trip('臺中車站'))] },
      { zh: '最快的走法，一眼看懂', en: 'The fastest way, at a glance', dark: true, args: [...MORNING, ...TAIPEI, ...click(...trip('新竹車站'))] },
      { zh: '兩站之間每一班車', en: 'Every train between two stations', args: [...MORNING, ...TAIPEI, ...click('#tab-times', wait(3000), station('from', '臺北'), wait(1500), station('to', '花蓮'), wait(7000))] },
      { zh: '公車還要等多久', en: 'How long until the bus', dark: true, args: [...TAIPEI, ...click('#tab-times', wait(2500), busRoute('307'), wait(6000))] },
      { zh: 'YouBike 即時車位', en: 'YouBike docks, live', args: ['--geo', '25.0330,121.5434', ...click(wait(3000), bikeDock, '#shot-target', wait(4000))] },
      { zh: '車站即時班次', en: 'Live trains at the station', dark: true, args: click(search('板橋'), wait(8000), firstStation, wait(9000)) }
    ]
  },
  sports: {
    app: 'sports', brand: 'match', show: 'sports', prefix: 'sports', account: 'fan',
    shots: [
      { zh: '你的比賽，一打開就看到', en: 'Your games, the moment you open it', wait: 14000 },
      { zh: '正在轉播的比賽，一鍵觀看', en: 'What’s on now, one tap to watch', dark: true, hash: 'live', args: click(wait(3000)) },
      { zh: '勝率走勢與關鍵時刻', en: 'How the game swung, and when', dark: true, args: click('#tab-matches', '[data-league=nba]', wait(2500), yesterday, wait(3000), closeNba, wait(8000), sheetCard('勝率走勢|Win probability'), wait(1500)) },
      { zh: 'F1 每一站，倒數到起跑', en: 'Every F1 weekend, counted down', page: 'f1-next', args: click("js:[...document.querySelectorAll('dialog.q-sheet[open]')].pop().scrollTop=0", wait(800)) },
      { zh: '積分榜與爭冠形勢', en: 'The table and the title race', page: 'epl-table' },
      { zh: '每位球員的完整生涯', en: 'Every player’s whole career', dark: true, args: click("js:import('./sheets.js').then(m=>m.openPlayer('nba','3202'))", wait(6000), tap('資料|Bio'), wait(6000), toTop("[...document.querySelectorAll('dialog.q-sheet[open]')].pop().querySelector('.career-teams')?.closest('.q-card')"), wait(800)) }
    ]
  },
  weather: {
    app: 'weather', brand: 'weather', show: 'weather', prefix: 'weather', account: 'pins',
    shots: [
      { zh: '今天天氣一眼看完', en: 'Today, in one look', wait: 9000 },
      { zh: '未來十天降雨', en: 'Rain, ten days ahead', dark: true, page: 'rain', wait: 9000 },
      { zh: '一天的每小時', en: 'Every hour of the day', page: 'day', wait: 9000 },
      { zh: '附近空氣品質', en: 'The air around you', dark: true, page: 'air', wait: 9000 },
      { zh: '今日數據與貼心建議', en: 'Today’s numbers, and advice', page: 'lower', wait: 9000 },
      { zh: '你的每個地點', en: 'Every place you keep', dark: true, args: click('#tab-places', wait(2500)), wait: 9000 }
    ]
  },
  class: {
    app: 'orbit', brand: 'orbit', show: 'class', prefix: 'class', account: 'week', args: ['--clock', '2026-11-04T10:30'],
    shots: [
      { zh: '現在、下一節與剩餘時間', en: 'Now, next, and time left' },
      { zh: '整週課表一眼看', en: 'Your whole week', dark: true, hash: 'week' },
      { zh: '每一節課的細節', en: 'Every class, in detail', page: 'class' },
      { zh: '調課幾秒完成', en: 'Swap a class in seconds', dark: true, page: 'swap' },
      { zh: '跟著真的飛機專注', en: 'Focus on a real flight', page: 'flight', wait: 12000 },
      { zh: '拍下課表，AI 幫你讀', en: 'Snap it, AI reads it', dark: true, page: 'photo' }
    ]
  },
  money: {
    app: 'money', brand: 'money', show: 'money', prefix: 'money', account: 'demo',
    shots: [
      { zh: '一整個月的收支', en: 'Your month on a calendar' },
      { zh: '幾秒就記一筆', en: 'Log spending in seconds', dark: true, page: 'entry-typed' },
      { zh: '錢花到哪裡，一圈看懂', en: 'Where the money went', page: 'stats' },
      { zh: '每個帳戶與悠遊卡', en: 'Every account, EasyCard too', dark: true, hash: 'accts' },
      { zh: '十二大類，一眼分好', en: 'Twelve broad categories', page: 'cats' },
      { zh: '越用越懂你的習慣', en: 'It learns your habits', dark: true, page: 'guessing' }
    ]
  },
  words: {
    app: 'words', brand: 'vocab', show: 'words', prefix: 'words', account: 'demo',
    shots: [
      { zh: '今日目標與連續天數', en: 'Today’s goal and streak', wait: 7000 },
      { zh: '答完馬上知道為什麼', en: 'Know why, right away', dark: true, page: 'answered', wait: 7000 },
      { zh: '每個單字都有解說', en: 'Every word, explained', page: 'word', wait: 7000 },
      { zh: '多種練習模式', en: 'Many ways to practise', dark: true, page: 'modes', wait: 7000 },
      { zh: '拼字比賽模擬考', en: 'A mock spelling contest', page: 'contest', wait: 7000 },
      { zh: '看見自己進步', en: 'Watch yourself improve', dark: true, hash: 'progress', wait: 7000 }
    ]
  },
  beats: {
    app: 'beats', brand: 'beats', show: 'beats', prefix: 'beats',
    shots: [
      { zh: '為你做的音樂', en: 'Music made for you', dark: true, page: 'home-playing' },
      { zh: '各種心情與電台', en: 'Moods and stations', page: 'home-lower' },
      { zh: '用你的方式創作', en: 'Create your way', dark: true, page: 'make' },
      { zh: '在樂器室做節拍', en: 'Make beats in the studio', page: 'studio' },
      { zh: '用打擊墊即興', en: 'Jam on the pads', dark: true, page: 'jam' },
      { zh: '每首歌都能玩節奏遊戲', en: 'A rhythm game for any song', dark: true, page: 'game', wait: 16000 }
    ]
  },
  law: {
    app: 'law', brand: 'law', show: 'law', prefix: 'law',
    shots: [
      { zh: '用白話問法律', en: 'Ask the law in plain words', wait: 8000 },
      { zh: '每一條條文都能點', en: 'Every article, every link', dark: true, page: 'article', wait: 8000 },
      { zh: '判決隨手查', en: 'Court rulings, searchable', page: 'ruling', wait: 8000 },
      { zh: '法案改了什麼', en: 'What a bill changes', dark: true, page: 'bill-diff', wait: 8000 },
      { zh: '每個政黨怎麼投票', en: 'How every party voted', page: 'votes', wait: 8000 },
      { zh: '每一位立委', en: 'Every legislator', dark: true, page: 'people', wait: 8000 }
    ]
  },
  securities: {
    app: 'securities', brand: 'stock', show: 'securities', prefix: 'securities', account: 'demo',
    shots: [
      { zh: '投資組合總覽', en: 'Your whole portfolio', dark: true, wait: 12000 },
      { zh: '真實報價與 K 線', en: 'Real prices, real charts', page: 'stock', wait: 12000 },
      { zh: '真實台股規則、手續費與稅', en: 'Real TWSE rules, fees and tax', dark: true, page: 'ticket', wait: 12000 },
      { zh: '台股、美股、基金一次看', en: 'Taiwan, US, funds and more', page: 'list', wait: 12000 },
      { zh: '你的交易紀錄', en: 'Every trade you made', dark: true, page: 'activity', wait: 12000 },
      { zh: '用銀行匯率換匯', en: 'Exchange at bank rates', page: 'rates', wait: 12000 }
    ]
  }
};
