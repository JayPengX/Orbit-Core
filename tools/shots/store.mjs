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
// A seller's set (Jay 11-12, RULEBOOK §3): shot 1 says what the app is; each shot after it one
// main feature that makes the app special, in proportion to how central it is, each headline
// confident and carrying a real number where one sells (counted from the data, rounded so it
// stays true). Every shot shows different content (another story, game, stock, word); one shot
// per feature; Orbit AI at most once, only where it is central; never a competitor's name.
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
// Beats: the radio's bar with a wish typed (not sent), 電台 under the top bar.
const ask = text => click(wait(6000), "js:(i=>{const s=i.closest('section')||i.parentElement;let p=s.parentElement;while(p&&!(p.scrollHeight>p.clientHeight+1&&/auto|scroll/.test(getComputedStyle(p).overflowY)))p=p.parentElement;const box=p||document.scrollingElement;box.scrollTop+=s.getBoundingClientRect().top-60})(document.querySelector('.bt-stations textarea, .bt-stations input, .bt-sec textarea, .bt-sec input'))", wait(800), `js:(i=>{i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}))})(document.querySelector('.bt-stations textarea, .bt-stations input, .bt-sec textarea, .bt-sec input'))`, wait(1200));
const town = name => click(wait(3500), `js:[...document.querySelectorAll('[data-town]')].find(e=>e.offsetParent&&/${name}/.test(e.textContent))?.click()`, wait(6000));
export const STORE = {
  // Every way to get around Taiwan in one plan, live, with a recommendation. Shoot in Taiwan's morning.
  transit: {
    app: 'transit', brand: 'transit', show: 'transit', prefix: 'transit', args: ['--google-map'],
    shots: [
      { zh: '火車、公車、YouBike，一次排好', en: 'Train, bus and YouBike in one plan', args: [...MORNING, ...click(...trip('臺中車站'))] },
      { zh: '每個車站的下一班，即時', en: 'Every station’s next train, live', dark: true, args: click(search('板橋'), wait(8000), firstStation, wait(9000)) },
      { zh: '兩站之間，每一班車', en: 'Every train between two stations', args: [...MORNING, ...TAIPEI, ...click('#tab-times', wait(3000), station('from', '臺北'), wait(1500), station('to', '花蓮'), wait(7000))] },
      { zh: '公車還要等幾分鐘', en: 'Minutes until your bus', dark: true, args: [...TAIPEI, ...click('#tab-times', wait(2500), busRoute('307'), wait(6000))] },
      { zh: 'YouBike 車位，即時', en: 'YouBike docks, live', args: ['--geo', '25.0330,121.5434', ...click(wait(6000), bikeDock, "js:(e=>{if(!e)return;for(const t of ['pointerdown','mousedown','pointerup','mouseup','click'])e.dispatchEvent(new MouseEvent(t,{bubbles:true}))})(document.getElementById('shot-target'))", wait(4000))] },
      { zh: '全台捷運，照真的路線畫', en: 'Every metro, drawn true to its lines', dark: true, page: 'metro', wait: 8000 }
    ]
  },
  // Everything you can watch in Taiwan, with where to watch it. No AI shot (Jay 11-12: not what Sports is for).
  sports: {
    app: 'sports', brand: 'match', show: 'sports', prefix: 'sports', account: 'fan',
    shots: [
      { zh: '你的比賽，一打開就看到', en: 'Your games, the moment you open it', wait: 14000 },
      { zh: '台灣轉播的 15 項賽事，全在這', en: 'All 15 competitions on TV in Taiwan', dark: true, args: click('#tab-matches', wait(5000)), wait: 8000 },
      { zh: '每場比賽在哪一台播，一次看', en: 'Every game, and the channel it’s on', page: 'guide' },
      { zh: '勝率走勢與關鍵時刻', en: 'How the game swung, and when', dark: true, args: click('#tab-matches', '[data-league=nba]', wait(2500), yesterday, wait(3000), closeNba, wait(8000), sheetCard('勝率走勢|Win probability'), wait(1500)) },
      { zh: '積分榜與爭冠形勢', en: 'The table and the title race', page: 'epl-table' },
      { zh: '每位球員的完整生涯', en: 'Every player’s whole career', dark: true, args: click("js:import('./sheets.js').then(m=>m.openPlayer('nba','3202'))", wait(6000), tap('資料|Bio'), wait(6000), toTop("[...document.querySelectorAll('dialog.q-sheet[open]')].pop().querySelector('.career-teams')?.closest('.q-card')"), wait(800)) },
      { zh: 'F1 每一站，倒數到起跑', en: 'Every F1 weekend, counted down', page: 'f1-next', args: click("js:[...document.querySelectorAll('dialog.q-sheet[open]')].pop().scrollTop=0", wait(800)) }
    ]
  },
  // One forecast for your township, blended from several sources, rain in plain words.
  weather: {
    app: 'weather', brand: 'weather', show: 'weather', prefix: 'weather', account: 'pins',
    shots: [
      { zh: '你所在的鄉鎮，天氣一眼看完', en: 'Your township’s weather, in one look', wait: 9000 },
      { zh: '直接問：明天會下雨嗎？', en: 'Just ask: will it rain tomorrow?', dark: true, hash: { zh: 'ask=明天竹北會下雨嗎', en: 'ask=Will it rain in Zhubei tomorrow?' }, wait: 20000 },
      { zh: '未來十天，哪天會下雨', en: 'Which of the next ten days it rains', page: 'rain', wait: 9000 },
      { zh: '每小時的溫度與降雨', en: 'Every hour’s temperature and rain', dark: true, page: 'day', wait: 9000 },
      { zh: '穿什麼、帶不帶傘，直接說', en: 'What to wear, umbrella or not', args: click(wait(2500), toTop("document.querySelector('.ot-advice')", 70), wait(1000)), wait: 9000 },
      { zh: '家、學校，每個地點都顧到', en: 'Home, school, every place you keep', dark: true, args: click('#tab-places', wait(2500)), wait: 9000 }
    ]
  },
  // Your school day, live: what's on now, time left, 調課, your own school's notices.
  class: {
    app: 'orbit', brand: 'orbit', show: 'class', prefix: 'class', account: 'week',
    // Mid-morning on a school day; the flight on the real clock (planes flying now).
    shots: [
      { zh: '現在上什麼、還剩幾分鐘', en: 'What’s on now, and how long is left', args: SCHOOL },
      { zh: '整週課表，單雙週都對', en: 'Your whole week, odd and even weeks', dark: true, hash: 'week', args: SCHOOL },
      { zh: '待辦與考試倒數', en: 'To-dos and exam countdowns', dark: true, args: [...SCHOOL, ...click(wait(2500), toTop("document.querySelector('#cx-todos')", 150), wait(800))] },
      { zh: '調課，幾秒完成', en: 'Swap a class in seconds', page: 'swap', args: SCHOOL },
      { zh: '跟著一班真的飛機專注', en: 'Focus along a real flight', dark: true, page: 'flight', wait: 12000 }
    ]
  },
  // Logging takes seconds and learns your habits; Taiwan's cards and EasyCard built in.
  money: {
    app: 'money', brand: 'money', show: 'money', prefix: 'money', account: 'demo',
    shots: [
      { zh: '一整個月，花多少一眼看', en: 'Your month, at a glance' },
      { zh: '幾秒記一筆，分類自動猜好', en: 'Log in seconds, category guessed', dark: true, page: 'entry-typed' },
      { zh: '錢花到哪裡，一圈看懂', en: 'Where the money went', page: 'stats' },
      { zh: '銀行、信用卡、悠遊卡，全都管', en: 'Banks, cards and EasyCard, all in one', dark: true, hash: 'accts' },
      { zh: '問你的帳，答案畫成圖', en: 'Ask your books, see the answer', hash: { zh: 'ask=這個月吃飯花了多少？', en: 'ask=How much did I spend on food this month?' }, ai: [['feature:money-ask', 'money-ask']], args: click(wait(1500), sheetTop, wait(600)), wait: 9000 }
    ]
  },
  // Every story from all sides: 81 outlets placed by published research. Every shot another story.
  news: {
    app: 'news', brand: 'news', show: 'news', prefix: 'news',
    shots: [
      { zh: '每則新聞，各家怎麼報一次看', en: 'Every story, as every outlet tells it', wait: 9000 },
      { zh: '同一件事，偏綠、中間、偏藍怎麼下標', en: 'One story, each side’s headline', dark: true, args: click("js:[...document.querySelectorAll('.nw-card')].filter(e=>e.offsetParent)[0]?.click()", wait(3000), toTop("[...document.querySelectorAll('dialog[open] .nw-spec')].pop()", 70), wait(1000)), wait: 9000 },
      { zh: '只有一邊在報的新聞', en: 'The stories only one side carries', hash: 'side', args: click(wait(2000), "js:[...document.querySelectorAll('button,[role=tab],a')].filter(e=>e.offsetParent&&/^(國際|World)$/.test(e.textContent.trim())).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0]?.click()", wait(2500)), wait: 9000 },
      { zh: '國際大事，台灣媒體怎麼報', en: 'World news, and how Taiwan reports it', dark: true, hash: 'intl', args: click(tap('能源|Energy'), wait(2500)), wait: 9000 },
      { zh: '81 家媒體，立場都有出處', en: '81 outlets, each place sourced', hash: 'outlets', args: click(toTop("[...document.querySelectorAll('h2,h3,.q-section-head,header')].find(e=>e.offsetParent&&/^(台灣媒體|Taiwan’s outlets)/.test(e.textContent.trim()))", 40), wait(800)), wait: 9000 },
      { zh: '14 個主題，照重要程度排', en: '14 topics, ranked by importance', dark: true, hash: 'tw', args: click(tap('生活|Life'), wait(2500)), wait: 9000 }
    ]
  },
  // The 大考 list taught hard on purpose: your own mix-ups as the wrong options, a memory model decides.
  words: {
    app: 'words', brand: 'vocab', show: 'words', prefix: 'words', account: 'demo',
    shots: [
      { zh: '今天該背的字，一打開就知道', en: 'Today’s words, the moment you open it', wait: 7000 },
      { zh: '答錯馬上知道為什麼', en: 'Wrong? See why, right away', dark: true, page: 'answered', wait: 7000 },
      { zh: '6,169 個大考單字，真人發音', en: '6,169 exam words, each in a real voice', page: 'word', wait: 7000 },
      { zh: '8 種練習方式，記得更牢', en: '8 ways to practise', dark: true, page: 'modes', wait: 7000 },
      { zh: '搞混過的字，自動排進複習', en: 'The words you mix up come back for review', hash: 'review', wait: 7000 },
      { zh: '用新學的字跟 AI 聊天', en: 'Chat with AI using new words', dark: true, args: click(press('用新字聊天|Chat with'), wait(3000)), wait: 7000 }
    ]
  },
  // Music made on the phone that never repeats, and you steer, make and play it.
  beats: {
    app: 'beats', brand: 'beats', show: 'beats', prefix: 'beats',
    shots: [
      { zh: '手機現做的音樂，首首不重複', en: 'Endless music, made on your phone', dark: true, page: 'now-playing' },
      { zh: '49 種曲風，說想聽什麼就換', en: '49 styles: say what you want to hear', args: { zh: ask('讀書用的 lo-fi'), en: ask('lo-fi to study') } },
      { zh: '用你的素材，做成整首歌', en: 'Your own sounds, made into songs', dark: true, page: 'make' },
      { zh: '在樂器室做節拍', en: 'Make beats in the studio', page: 'studio' },
      { zh: '打擊墊，隨手即興', en: 'Jam on the pads', dark: true, page: 'jam' },
      { zh: '每首歌都能玩節奏遊戲', en: 'A rhythm game for any song', page: 'game', args: click(wait(14000)) }
    ]
  },
  // Everything about Taiwan's law in one app, all linked; AI across all of it (Jay 11-12).
  law: {
    app: 'law', brand: 'law', show: 'law', prefix: 'law',
    shots: [
      { zh: '法律、判決、法案，一個 App 全包', en: 'Laws, rulings and bills, all in one app', wait: 8000 },
      { zh: '5.4 萬部法規，中央到地方', en: '54,000 laws and rules, national to local', dark: true, hash: 'tab=laws', wait: 8000 },
      { zh: '每一條都連到判決、修法和引用', en: 'Every article linked to its rulings and bills', hash: 'law=N0030001&a=38', wait: 8000 },
      { zh: '4.7 萬則判決，大法官解釋全收', en: '47,000 rulings, every constitutional one', dark: true, page: 'ruling', wait: 8000 },
      { zh: '白話問，答案附上條文', en: 'Ask in plain words, every point cited', hash: { zh: 'tab=ask&q=網購的東西不想要了，七天內可以退嗎？', en: 'tab=ask&q=Can I return something I bought online within seven days?' }, ai: [['law-chat', 'law-return']], wait: 9000 },
      { zh: '立法院近 8 千案，走到哪一步', en: 'Nearly 8,000 bills, each one’s stage', dark: true, hash: 'tab=bills', wait: 8000 },
      { zh: '22 縣市議會和代表會，影音都在', en: 'Every council, down to the townships', hash: 'tab=bills&f=council', args: council('hsq'), wait: 9000 }
    ]
  },
  // A real Taiwan broker on play money: real prices, fees, tax and rules, every market. Another stock each shot.
  securities: {
    app: 'securities', brand: 'stock', show: 'securities', prefix: 'securities', account: 'demo',
    shots: [
      { zh: '你的總資產，一眼看', en: 'Everything you own, at a glance', dark: true, wait: 12000 },
      { zh: '真實報價與 K 線', en: 'Real prices, real charts', page: 'stock', wait: 12000 },
      { zh: '全世界的市場，一個帳戶買', en: 'Every market, one account', dark: true, args: click('#tab-markets', wait(4000)), wait: 10000 },
      { zh: '市價、限價、停損，像真的券商', en: 'Market, limit and stop orders', args: click('#tab-markets', '[data-action=product][data-id=tw]', wait(2500), "js:[...document.querySelectorAll('[data-action=open][data-symbol=\"2317.TW\"]')].find(e => e.offsetParent).click()", wait(3000), '[data-action=trade][data-side=buy]', wait(1500)), wait: 12000 },
      { zh: '當沖、權證、期貨，資格都照真的', en: 'Day trading and warrants, real rules', dark: true, args: click('#tab-fx', '[data-action=tool][data-tool=access]', wait(1500)), wait: 10000 },
      { zh: '換匯照銀行牌價', en: 'Exchange at the bank’s rates', page: 'rates', wait: 12000 }
    ]
  }
};
