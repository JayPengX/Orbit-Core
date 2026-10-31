// The pages worth a look in each app, by name, for tools/shots.mjs: how to
// reach each one (a #hash, taps, a scroll) on the real app with real data.
// Add a page here when you had to work out how to reach it, so the next
// thread doesn't. Every tap is written to work in both languages.
//
//   name: { hash: 'week', args: ['--click', '…', …] }   (args go to preview.mjs)
//   default: the pages shot when none are named ('tabs' = every tab in the tab bar)

// A button or tab whose own text is exactly one of these (a regex alternation).
export const tap = text => `js:[...document.querySelectorAll('button,[role=tab],[role=button],.q-ritem,a')].filter(e=>e.offsetParent&&/^(${text})$/.test(e.textContent.trim())).sort((a,b)=>a.textContent.length-b.textContent.length)[0].click()`;
// A card or row holding all of these texts (the shortest one: the row itself, not its list).
export const card = (...texts) => `js:[...document.querySelectorAll('.event-row,.q-card,.q-ritem,button,a')].filter(e=>e.offsetParent&&${JSON.stringify(texts)}.every(t=>new RegExp(t).test(e.textContent))).sort((a,b)=>a.textContent.length-b.textContent.length)[0].click()`;
export const wait = ms => `js:new Promise(r=>setTimeout(r,${ms}))`;
const click = (...sels) => sels.flatMap(s => ['--click', s]);

export const PAGES = {
  sports: {
    default: ['tabs'],
    'nba-game': { args: click('#tab-matches', '[data-league=nba]', "js:[...document.querySelectorAll('.q-chip.day.is-today')].find(e=>e.offsetParent)?.click()", "js:[...document.querySelectorAll('.event-row')].find(e=>e.offsetParent)?.click()", wait(4000)) },
    'f1-weekend': { args: click('#tab-matches', '[data-league=f1]', tap('Ended|已結束'), "js:document.querySelector('.wk-card.done')?.click()", wait(4000)) }
  },
  transit: {
    default: ['tabs', 'trip'],
    // A real trip from where the phone is (新竹車站) to 臺北車站: the plans card, then the first plan.
    trip: { args: ['--google-map', ...click("js:(()=>{const q=document.querySelector('#q');q.focus();q.value=document.documentElement.lang==='en'?'Taipei Main Station':'臺北車站';q.dispatchEvent(new Event('input',{bubbles:true}))})()", wait(8000), '.ot-res', "js:document.querySelector('[data-card=go]')?.click()", wait(8000), "js:document.querySelector('.ot-plan[data-plan=\"0\"]')?.click()", wait(5000))] },
    // 查時刻: a station's live board (高雄).
    board: { args: click('#tab-times', wait(3000), "js:(async()=>{document.querySelector('[data-pick=to]').click();await new Promise(r=>setTimeout(r,800));const q=document.querySelector('#s-q');q.value='高雄';q.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,800));document.querySelector('#s-body [data-st]').click()})()", wait(8000)) }
  },
  weather: {
    default: ['tabs'],
    rain: { args: click('.q-panel[data-open="rain"]', '[data-range="rain:10d"]') },
    air: { args: click('.q-panel[data-open="air"]') }
  },
  orbit: { default: ['tabs'] },
  money: {
    default: ['tabs'],
    invoices: { hash: 'more', args: click(tap('Invoices|發票對獎'), wait(2500)) },
    // 記一筆 on 數位, its subs and the + for one's own.
    'entry-digital': { args: click('[aria-label="記一筆"],[aria-label="Add an entry"]', wait(1200), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-ritem')].find(e=>/全部|Everything/.test(e.textContent))?.click()", wait(1500), tap('數位|Digital'), wait(800)) },
    // 新增固定收支 scrolled to its foot (開始, the date field that once poked out sideways).
    'repeat-new': { hash: 'more', args: click(tap('固定收支|Repeats'), wait(1200), tap('新增固定收支|New repeat'), wait(1200), "js:[...document.querySelectorAll('dialog.q-sheet[open]')].pop().scrollTop=9999", wait(600)) }
  },
  words: {
    default: ['tabs'],
    quiz: { args: click(tap('開始|Start'), wait(2000)) },
    word: { hash: 'word=track' }
  },
  beats: {
    default: ['tabs'],
    'now-playing': { args: click("js:[...document.querySelectorAll('button')].find(b=>b.offsetParent&&/play|播放/i.test(b.getAttribute('aria-label')||'')).click()", wait(8000), '.mp-main', wait(2000)) },
    // The rhythm game mid-play (autoplay, no fps text).
    game: { hash: 'create', args: ['--store', 'orbit-beats-game-auto=shot', ...click(card('Rhythm game|節奏遊戲'), wait(2000), "js:[...document.querySelectorAll('.gm-list > *')].find(e=>e.offsetParent).click()", wait(2500), "js:document.querySelectorAll('.gm-level')[2].click()", wait(14000))] }
  },
  law: {
    default: ['tabs'],
    article: { hash: 'law=B0000001&a=184' },
    votes: { args: click('#tab-bills', tap('Votes|表決'), wait(3000)) }
  },
  securities: {
    default: ['tabs'],
    stock: { args: click('[data-action=open][data-symbol="2330.TW"]', wait(3000), '[data-action=chart-style][data-v=candle]', '[data-action=range][data-range="6mo"]', wait(4000)) }
  },
  admin: { default: ['overview', 'accounts', 'money', 'health'], overview: { hash: 'overview' }, accounts: { hash: 'accounts' }, money: { hash: 'money' }, health: { hash: 'health' } }
};
