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
    // Today's first NBA game (under 全部), scrolled to a card by its title: 勝率走勢 (the chart and 關鍵時刻), 本季對戰.
    'nba-chart': { args: click('#tab-matches', wait(3000), "js:document.querySelector('.all-league[data-league=nba] .event-row').click()", wait(9000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/勝率走勢|Win probability/.test(c.textContent))?.scrollIntoView({block:'start'})", wait(1500)) },
    'nba-series': { args: click('#tab-matches', wait(3000), "js:document.querySelector('.all-league[data-league=nba] .event-row').click()", wait(9000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/本季對戰|Season series/.test(c.textContent))?.scrollIntoView({block:'start'})", wait(1500)) },
    'nba-closing': { args: click('#tab-matches', wait(3000), "js:document.querySelector('.all-league[data-league=nba] .event-row').click()", wait(9000), "js:document.querySelector('dialog.q-sheet[open] .lp-scoring')?.scrollIntoView({block:'start'})", wait(1500)) },
    // A football game to come (the first MLS one two days on, under 全部): 先發陣容 and 勝率預測.
    'mls-game': { args: click('#tab-matches', "js:[...document.querySelectorAll('.q-chip.day')].filter(e=>e.offsetParent)[[...document.querySelectorAll('.q-chip.day')].filter(e=>e.offsetParent).findIndex(e=>e.classList.contains('is-today'))+2].click()", wait(4000), "js:document.querySelector('.all-league[data-league=mls] .event-row').click()", wait(12000)) },
    'f1-weekend': { args: click('#tab-matches', '[data-league=f1]', tap('Ended|已結束'), "js:document.querySelector('.wk-card.done')?.click()", wait(4000)) },
    // The next race weekend's sheet scrolled to: 賽道 (the circuit drawn) and last year's podium.
    'f1-next': { args: click('#tab-matches', '[data-league=f1]', "js:document.querySelector('.wk-card:not(.done)')?.click()", wait(6000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/賽道|The circuit/.test(c.textContent))?.scrollIntoView({block:'start'})", wait(2500)) },
    'f1-podium': { args: click('#tab-matches', '[data-league=f1]', "js:document.querySelector('.wk-card:not(.done)')?.click()", wait(6000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/年這一站|Here in/.test(c.textContent))?.scrollIntoView({block:'end'})", wait(2500)) },
    // A driver who only ran a practice (an FP1 stand-in: Mexico 2026's Minì), his page.
    'f1-guest': { args: click("js:import('./sheets.js').then(m=>m.openPlayer('f1','5910'))", wait(9000)) },
    // A player's 資料 (profile, draft, every team, honours) and 數據 scrolled to its seasons, one per sport.
    ...Object.fromEntries(
      [['nba', '3945274'], ['mlb', '33192'], ['epl', '280555'], ['f1', '868'], ['epl', '265653', 'epl-loans'], ['epl', '259902', 'epl-abroad']].flatMap(([league, id, key = league]) => [
        [`player-${key}`, { args: click(`js:import('./sheets.js').then(m=>m.openPlayer('${league}','${id}'))`, wait(6000), tap('資料|Bio'), wait(6000), "js:[...document.querySelectorAll('dialog.q-sheet[open]')].pop().querySelector('.career-teams')?.closest('.q-card').scrollIntoView({block:'start'})", wait(600)) }],
        [`player-${key}-stats`, { args: click(`js:import('./sheets.js').then(m=>m.openPlayer('${league}','${id}'))`, wait(6000), tap('數據|Stats'), wait(6000), "js:[...document.querySelectorAll('dialog.q-sheet[open]')].pop().querySelector('.career-seasons')?.scrollIntoView({block:'start'})", wait(600)) }]
      ])
    )
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
    // 記一筆 on 數位, its subs and the + for one's own.
    'entry-digital': { args: click('[aria-label="記一筆"],[aria-label="Add an entry"]', wait(1200), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-ritem')].find(e=>/全部|Everything/.test(e.textContent))?.click()", wait(1500), tap('數位|Digital'), wait(800)) },
    // 新增固定收支 scrolled to its foot (開始, the date field that once poked out sideways).
    'repeat-new': { hash: 'more', args: click(tap('固定收支|Repeats'), wait(1200), tap('新增固定收支|New repeat'), wait(1200), "js:[...document.querySelectorAll('dialog.q-sheet[open]')].pop().scrollTop=9999", wait(600)) }
  },
  words: {
    default: ['tabs'],
    quiz: { args: click(tap('開始|Start'), wait(2000)) },
    // 練習模式's 句子填空: a round on the words' own examples, the first question answered.
    sentence: { args: click(wait(2500), "js:[...document.querySelectorAll('.mode-card')].find(e=>/句子填空|Sentences/.test(e.textContent)).click()", wait(1500), "js:document.querySelector('.choice')?.click()", wait(800)) },
    // 拼字比賽 handed in at once (every question blank): the results page.
    contest: { args: click(wait(3000), "js:[...document.querySelectorAll('.contest-card button.primary')][0].click()", wait(1500)) },
    word: { hash: 'word=track' },
    // A word's sheet once it has been answered (its 學習紀錄): a 句子填空 answered wrong, then that word's sheet.
    // 今天's lower shelves (單字卡, 最近練習的字, 今日單字) after one 選中文 round answered.
    shelves: { args: click("js:(async()=>{const z=ms=>new Promise(r=>setTimeout(r,ms));await z(2500);[...document.querySelectorAll('.mode-card')].find(e=>/選中文|Meaning/.test(e.textContent)).click();for(let i=0;i<90;i++){await z(300);const c=document.querySelector('.choice:not([disabled])');if(c){c.click();continue}const n=document.querySelector('.next-bar button');if(n){n.click();continue}break}await z(500);[...document.querySelectorAll('button')].find(b=>/^(完成|Done)$/.test(b.textContent.trim()))?.click();await z(1200);document.querySelector('.deck-rail,.recent-rail')?.closest('section')?.scrollIntoView();await z(800)})()") },
    'word-record': { args: click("js:(async()=>{const z=ms=>new Promise(r=>setTimeout(r,ms));await z(2500);[...document.querySelectorAll('.mode-card')].find(e=>/句子填空|Sentences/.test(e.textContent)).click();await z(1500);[...document.querySelectorAll('.choice')][1].click();await z(800);location.hash='word='+document.querySelector('.choice.right .choice-text').textContent;await z(1500);[...document.querySelectorAll('dialog[open]')].pop().querySelector('.word-body').lastElementChild.scrollIntoView();await z(600)})()") }
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
    // 法規 search: a law named (憲法), the start of one's name (憲法增), the start of a short name (勞基).
    'search-named': { hash: 'tab=laws&q=憲法' },
    'search-partial': { hash: 'tab=laws&q=憲法增' },
    'search-short': { hash: 'tab=laws&q=勞基' },
    // A law's card with a bill in 協商 and 憲法法庭 rulings about it (預算法), and a 沿革 timeline.
    card: { hash: 'law=T0020001' },
    history: { hash: 'law=N0030020', args: click('.lw-tool[aria-label="更多"], .lw-tool[aria-label="More"]', 'button.q-cell:has-text("沿革"), button.q-cell:has-text("History")', wait(800)) },
    votes: { args: click('#tab-bills', tap('Votes|表決'), wait(3000)) },
    // 問法律's 對話紀錄 sheet (empty on a fresh phone: chats live only on the phone).
    chats: { hash: 'tab=ask', args: click('.lw-ask-tools .lw-tool', wait(800)) },
    // A ruling (115年憲判字第7號): its top, its 理由 opened and scrolled to, and its AI (判了什麼, 為什麼, 影響到誰).
    ruling: { hash: 'r=j115-7', args: click(wait(4000)) },
    'ruling-reasons': { hash: 'r=j115-7', args: click(wait(4000), "js:(d=>{d.open=true;d.scrollIntoView({block:'start'})})([...document.querySelectorAll('dialog.q-sheet[open] .lw-cons-reason')].pop())", wait(800)) },
    'ruling-ai': { hash: 'r=j115-7', args: click(wait(4000), '.lw-ruling-ai', wait(25000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .lw-para')].pop()?.click()", wait(600)) },
    // Plain text read as its structure: a 憲判字's reasons (壹、 headings, 【N】), a bill's 對照表
    // (款 hung, every 款 number kept), an article's 目, 施行日期, a draft's 總說明 and rows.
    'ruling-text': { hash: 'r=j111-10', args: click('details.lw-cons-reason summary', wait(600), "js:document.querySelectorAll('.lw-cons-reason .lw-rule-h')[1]?.scrollIntoView({block:'center'})", wait(800)) },
    'bill-diff': { hash: 'item=11-01192', args: click(wait(3000), "js:document.querySelector('.lw-item-diff')?.scrollIntoView({block:'start'})", wait(800)) },
    'article-items': { hash: 'law=G0340003&a=4-5' },
    'in-force': { hash: 'law=B0000001', args: click('.lw-tool[aria-label="更多"], .lw-tool[aria-label="More"]', 'button.q-cell:has-text("施行日期"), button.q-cell:has-text("In force")', wait(800)) },
    draft: { args: click('#tab-bills', tap('預告|Drafts'), wait(2000), "js:document.querySelector('a.lw-bill.notice')?.click()", wait(3000), "js:document.querySelector('.lw-notice-about')?.click()", "js:document.querySelector('.lw-notice-about')?.scrollIntoView({block:'start'})", wait(800)) },
    // 立委 by 縣市 (the default), by party, and an independent in the 國民黨 caucus (陳超明).
    people: { hash: 'tab=bills&f=people', args: click(wait(2500)) },
    'people-party': { hash: 'tab=bills&f=people', args: click(wait(2500), '[data-by=party]', wait(800)) },
    independent: { hash: 'who=837', args: click(wait(4000), "js:document.querySelector('.lw-person-line')?.scrollIntoView({block:'center'})", wait(600)) }
  },
  securities: {
    default: ['tabs'],
    stock: { args: click('[data-action=open][data-symbol="2330.TW"]', wait(3000), '[data-action=chart-style][data-v=candle]', '[data-action=range][data-range="6mo"]', wait(4000)) }
  },
  admin: { default: ['overview', 'accounts', 'money', 'health'], overview: { hash: 'overview' }, accounts: { hash: 'accounts' }, money: { hash: 'money' }, health: { hash: 'health' } }
};
