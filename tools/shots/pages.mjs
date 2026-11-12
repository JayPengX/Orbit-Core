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
// A row lifted by its grip mid-drag (kit reorder): the `n`th grip in `scope` held and moved down `by` px, never let go.
const lift = (scope, n = 0, by = 70) => `js:(()=>{const g=[...document.querySelectorAll('${scope} .q-grip')].filter(e=>e.offsetParent)[${n}];const r=g.getBoundingClientRect();const o={bubbles:true,cancelable:true,pointerId:7,pointerType:'mouse',button:0,clientX:r.x+r.width/2,clientY:r.y+r.height/2};g.dispatchEvent(new PointerEvent('pointerdown',o));setTimeout(()=>{dispatchEvent(new PointerEvent('pointermove',{...o,clientY:o.clientY+12}));dispatchEvent(new PointerEvent('pointermove',{...o,clientY:o.clientY+${by}}))},60)})()`;

// A finger swiped across `sel` by `dx` px (touch events, as a phone sends them): a day on in a day swipe.
const swipe = (sel, dx) => `js:(async()=>{const n=document.querySelector('${sel}');const r=n.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+Math.min(r.height/2,60);const t=X=>new Touch({identifier:1,target:n,clientX:X,clientY:y});const ev=(k,X)=>n.dispatchEvent(new TouchEvent(k,{bubbles:true,cancelable:true,touches:k==='touchend'?[]:[t(X)],changedTouches:[t(X)]}));ev('touchstart',x);for(let i=1;i<=8;i++){await new Promise(r=>setTimeout(r,16));ev('touchmove',x+(${dx})*i/8)}ev('touchend',x+(${dx}))})()`;

// The same, a finger on whatever is at the screen's foot (the page's empty space under a short day).
const swipeAt = dx => `js:(async()=>{const x=innerWidth*0.6,y=innerHeight-30;const n=document.elementFromPoint(x,y);window.__swipeAt=n&&(n.id||n.className||n.tagName);const t=X=>new Touch({identifier:1,target:n,clientX:X,clientY:y});const ev=(k,X)=>n.dispatchEvent(new TouchEvent(k,{bubbles:true,cancelable:true,touches:k==='touchend'?[]:[t(X)],changedTouches:[t(X)]}));ev('touchstart',x);for(let i=1;i<=8;i++){await new Promise(r=>setTimeout(r,16));ev('touchmove',x+(${dx})*i/8)}ev('touchend',x+(${dx}))})()`;

// Beats: six songs made on the built-in band and every one kept (about a minute).
// 做歌 with a 24 s drum take that has no silence in it (made here: kick, snare, hats over a
// low hum, 100 BPM, a two-bar riff and then a busier one), cut on its beat (lib/rhythm.mjs): its status and pieces.
const BEAT_TAKE = "js:(async()=>{const z=ms=>new Promise(r=>setTimeout(r,ms));await z(2500);const sr=44100,n=sr*24,x=new Float32Array(n),b=60/100;for(let i=0;i<n;i++)x[i]=0.02*Math.sin(i/sr*2*Math.PI*110);const hit=(t,f,d,a,nz)=>{const o=Math.round(t*sr);for(let i=0;i<d*sr&&o+i<n;i++){const e=Math.exp(-i/sr/(d/5));x[o+i]+=a*e*(nz?Math.random()*2-1:Math.sin(2*Math.PI*f*i/sr*(1+2*e)))}};for(let k=0;k<40;k++){const t=k*b;if(k%4==0||(k%8==6))hit(t,55,0.3,0.8);if(k%4==1||k%4==3)hit(t,0,0.15,0.5,1);if(k>=20&&k%2==0)hit(t+b/4,0,0.1,0.3,1);hit(t,0,0.04,0.15,1);hit(t+b/2,0,0.04,0.12,1)}const v=new DataView(new ArrayBuffer(44+n*2)),w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));w(0,'RIFF');v.setUint32(4,36+n*2,1);w(8,'WAVEfmt ');v.setUint32(16,16,1);v.setUint16(20,1,1);v.setUint16(22,1,1);v.setUint32(24,sr,1);v.setUint32(28,sr*2,1);v.setUint16(32,2,1);v.setUint16(34,16,1);w(36,'data');v.setUint32(40,n*2,1);for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.max(-1,Math.min(1,x[i]))*32767,1);const d=new DataTransfer();d.items.add(new File([v.buffer],'drum take.wav',{type:'audio/wav'}));const f=document.getElementById('file');f.files=d.files;f.dispatchEvent(new Event('change'));for(let i=0;i<60;i++){await z(500);if(document.querySelector('#status:not([hidden])')&&!/busy/.test(document.getElementById('status').className))break}await z(1500)})()";
const KEEP_SIX = "js:(async()=>{const z=ms=>new Promise(r=>setTimeout(r,ms));location.hash='make';await z(1500);document.getElementById('go').click();for(let i=0;i<150;i++){await z(1000);if(document.querySelectorAll('#out .act.heart').length>=6&&!document.getElementById('go').disabled)break}await z(1000);for(const b of document.querySelectorAll('#out .act.heart:not(.kept)')){b.click();await z(400)}await z(2500)})()";
export const PAGES = {
  sports: {
    default: ['tabs'],
    // (What tools/layout-check.mjs looks at beside every tab: the sheets that matter.)
    check: ['settings', 'epl-table', 'team-nba', 'player-nba', 'nba-game', 'f1-weekend'],
    // 追蹤's 設定: the leagues and follows as rows, each with its ✕ and grip; then one league lifted mid-drag (with --account fan).
    settings: { args: click('#tab-following', wait(3000), "js:document.querySelector('.set-open').click()", wait(2500)) },
    'settings-drag': { args: click('#tab-following', wait(3000), "js:document.querySelector('.set-open').click()", wait(2500), lift('dialog[open] .set-order'), wait(700)) },
    // 首頁's sport chips (with --account fan): 賽車 moves to a day F1 is on; then 全部 back on the day and place left (Jay 2026-11-05).
    'sport-jump': { args: click('js:window.scrollTo({top:400})', wait(800), tap('賽車|Racing'), wait(5000)) },
    'sport-back': { args: click('js:window.scrollTo({top:400})', wait(800), tap('賽車|Racing'), wait(5000), tap('全部|All'), wait(3000)) },
    // 賽事 on one league, each of its tabs (laid out wide on a tablet or a computer).
    'epl-table': { args: click('#tab-matches', '[data-league=epl]', wait(2500), tap('排名|Table'), wait(4000)) },
    // NBA 排名: the two conferences' tables (a pinned rank and name column, the stats beside it).
    'nba-table': { args: click('#tab-matches', '[data-league=nba]', wait(2500), tap('排名|Table|Standings'), wait(5000)) },
    // NBA 排名's race card (第一最快 1/28 才會確定), once read, and just after the tap (its day still being read: drawn waiting, never 第 N 場 first).
    'nba-race': { args: click('#tab-matches', '[data-league=nba]', wait(2500), tap('排名|Table|Standings'), wait(8000), "js:document.querySelector('.title-race')?.scrollIntoView({block:'center'})", wait(1200)) },
    'nba-race-early': { args: click('#tab-matches', '[data-league=nba]', wait(2500), tap('排名|Table|Standings'), "js:new Promise(ok=>{const go=()=>{const r=document.querySelector('.title-race');if(r){r.scrollIntoView({block:'center'});setTimeout(ok,60)}else setTimeout(go,20)};go()})") },
    // MLS 排名: the East's race card (a clinch said as results), then the West's foot (faded rows, the lock and their key).
    'mls-table': { args: click('#tab-matches', '[data-league=mls]', wait(2500), tap('排名|Table'), wait(9000), "js:document.querySelector('.title-race')?.scrollIntoView({block:'start'})", wait(1500)) },
    'mls-playoffs': { args: click('#tab-matches', '[data-league=mls]', wait(2500), tap('季後賽|Playoffs'), wait(6000)) },
    // MLS Round One, a best of three: the first series' sheet, its three games (Jay 2026-11-10).
    // 英超's 賽程 scrolled down on a full day (11/7), then a lighter one (11/3): the new day from the top, never a screen of black (Jay 2026-11-10).
    'epl-day-switch': { args: click('#tab-matches', '[data-league=epl]', wait(3000), "js:[...document.querySelectorAll('.q-chip.day')].filter(e=>e.offsetParent&&e.dataset.day==='2026-11-07').pop()?.click()", wait(4000), 'js:scrollTo(0,900)', wait(800), "js:[...document.querySelectorAll('.q-chip.day')].filter(e=>e.offsetParent&&e.dataset.day==='2026-11-03').pop()?.click()", wait(4000)) },
    'mls-series': { args: click('#tab-matches', '[data-league=mls]', wait(2500), tap('季後賽|Playoffs'), wait(6000), "js:[...document.querySelectorAll('.br-col')][1]?.querySelector('button.br-tie')?.click()", wait(2500)) },
    'mls-key': { args: click('#tab-matches', '[data-league=mls]', wait(2500), tap('排名|Table'), wait(9000), "js:[...document.querySelectorAll('.zone-legend')].pop()?.scrollIntoView({block:'center'})", wait(1500)) },
    'nba-leaders': { args: click('#tab-matches', '[data-league=nba]', wait(2500), tap('數據|Stats'), wait(5000)) },
    // 數據 of each kind of league (laid out wide: the stats down the side, the chosen one's ranking beside them).
    'f1-leaders': { args: click('#tab-matches', '[data-league=f1]', wait(3000), tap('數據|Stats'), wait(6000)) },
    'mlb-leaders': { args: click('#tab-matches', '[data-league=mlb]', wait(2500), tap('數據|Stats'), wait(6000)) },
    'epl-leaders': { args: click('#tab-matches', '[data-league=epl]', wait(2500), tap('數據|Stats'), wait(8000)) },
    'epl-team-stats': { args: click('#tab-matches', '[data-league=epl]', wait(2500), tap('數據|Stats'), wait(6000), tap('球隊|Teams'), wait(6000)) },
    'nba-team-stats': { args: click('#tab-matches', '[data-league=nba]', wait(2500), tap('數據|Stats'), wait(6000), tap('球隊|Teams'), wait(5000)) },
    // F1's teams by the drivers' numbers (Jay 2026-11-06: "like other sport should have team").
    'f1-team-stats': { args: click('#tab-matches', '[data-league=f1]', wait(3000), tap('數據|Stats'), wait(6000), tap('車隊|Teams'), wait(2000)) },
    'nba-bracket': { args: click('#tab-matches', '[data-league=nba]', wait(2500), tap('季後賽|Playoffs'), wait(5000)) },
    'f1-season': { args: click('#tab-matches', '[data-league=f1]', wait(4000)) },
    // 轉播's 愛爾達節目表 (full height whatever the day), then swiped a finger left across it: the next day.
    guide: { args: click('#tab-live', wait(6000), "js:document.querySelector('.guide-link .q-ritem').click()", wait(2500)) },
    'guide-swipe': { args: click('#tab-live', wait(6000), "js:document.querySelector('.guide-link .q-ritem').click()", wait(2500), swipe('dialog.q-sheet[open] .tv-guide', -160), wait(1200)) },
    // 轉播 scrolled to 我的比賽 (their own games by day: no row lit grey, Jay 2026-11-05; with --account fan).
    'tv-mine': { args: click('#tab-live', wait(8000), "js:document.querySelector('.mine-list')?.scrollIntoView({block:'start'})", wait(1500)) },
    // 首頁 once its day has been read (the lead game on top).
    'home-read': { args: click(wait(9000)) },
    // 首頁 scrolled down (what's under the first screen: 我的球隊, 我的聯賽).
    'home-lower': { args: click(wait(6000), 'js:scrollTo(0,700)', wait(1500)) },
    // 首頁 on the next day (its games to come, the lead one on top).
    'home-next': { args: click(wait(3000), "js:(()=>{const d=[...document.querySelectorAll('.q-chip.day')].filter(e=>e.offsetParent);d[d.findIndex(e=>e.classList.contains('is-today'))+1]?.click()})()", wait(7000)) },
    // 首頁 on yesterday (a day gone by: 已結束 beside 我的聯賽).
    'home-past': { args: click(wait(3000), "js:(()=>{const d=[...document.querySelectorAll('.q-chip.day')].filter(e=>e.offsetParent);d[d.findIndex(e=>e.classList.contains('is-today'))-1]?.click()})()", wait(9000)) },
    // 首頁's games over with who led each side (a light day's 已結束): today, else the nearest day before with one,
    // scrolled to the card (Jay 2026-11-06, iPad: the card one game, a tap off a face or name opens it).
    'home-recap': { args: click(wait(3000), "js:document.querySelector('.q-chip.day.is-today')?.click()", wait(9000), "js:(async()=>{for(let i=1;i<4&&!document.querySelector('.q-card.recap');i++){const d=[...document.querySelectorAll('.q-chip.day')].filter(e=>e.offsetParent);d[d.findIndex(e=>e.classList.contains('is-today'))-i]?.click();await new Promise(r=>setTimeout(r,8000))}document.querySelector('.q-card.recap')?.scrollIntoView({block:'center'})})()", wait(26000)) },
    // 首頁 swiped left on the empty page under a short day (Jay 2026-11-06, an iPad: only a card swiped): the next day.
    'home-swipe-empty': { args: click(wait(9000), swipeAt(-160), wait(2500)) },
    // 首頁 past ELTA's list (11/22: Newcastle v Arsenal, the Lakers): the guessed channel, said 預估 (with --account fan).
    // 賽事 on Saturday 11/7, 英超: the day's 推薦 (a soft grey row, ★ 推薦), the rest plain (no 追蹤 marks: a followed league's games are all theirs).
    'matches-picks': { args: click('#tab-matches', '[data-league=epl]', wait(2500), "js:document.querySelector('.q-day-bar [data-day=\"2026-11-07\"]')?.click()", wait(6000)) },
    // 賽事 on Sunday 11/8, every league (with --account fill): a followed league's pick (★ 推薦, lit grey) beside one only 填滿空檔 put in (outlined ☆ 推薦, unlit), scrolled to the first fill.
    'matches-fill': { args: click('#tab-matches', '.all-chip', wait(2500), "js:[...document.querySelectorAll('[data-day=\"2026-11-08\"]')].filter(e=>e.matches('.q-chip.day')&&e.offsetParent).pop()?.click()", wait(9000), "js:document.querySelector('.event-row.fill-pick')?.scrollIntoView({block:'center'})", wait(1200)) },
    // 首頁 on Sunday 11/8 (with --account fill): 我的比賽 with the games 填滿空檔 put in (a quiet line, a hollow star at its end), scrolled to the first.
    'home-fill': { args: click(wait(3000), "js:document.querySelector('.q-day-bar [data-day=\"2026-11-08\"]')?.click()", wait(9000), "js:document.querySelector('.event-row.filled')?.scrollIntoView({block:'center'})", wait(1200)) },
    // 首頁 on Sunday 11/8 (with --account leagues: F1, NBA, 英超, 美職足 followed, no teams): 已結束 as 推薦給你 then 其他比賽 (Jay 2026-11-10); then the second group's head.
    'home-ended': { args: click(wait(3000), "js:document.querySelector('.q-day-bar [data-day=\"2026-11-08\"]')?.click()", wait(9000), "js:document.querySelector('.ended-groups')?.scrollIntoView({block:'start'});scrollBy(0,-200)", wait(1200)) },
    'home-ended-rest': { args: click(wait(3000), "js:document.querySelector('.q-day-bar [data-day=\"2026-11-08\"]')?.click()", wait(9000), "js:[...document.querySelectorAll('.ended-groups > .ended-head')].pop()?.scrollIntoView({block:'center'})", wait(1200)) },
    'home-far': { args: click(wait(3000), "js:document.querySelector('.q-day-bar [data-day=\"2026-11-22\"]')?.click()", wait(9000)) },
    // That game's page: 台灣轉播 with the guess (依愛爾達往例預估), scrolled to it.
    'game-far': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('epl',['20261121']);const e=l.find(x=>/Arsenal/.test(x.away?.en||x.away?.name||''))||l.at(-1);(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/台灣轉播|Watch in Taiwan/.test(c.textContent))?.scrollIntoView({block:'center'})", wait(1500)) },
    // A game with own goals (MLS 11/1, Nashville 3–2 Red Bulls: Parker's and Bazán's): 勝率走勢 (an own goal the same dot as any goal), 關鍵時刻 with Nashville's badge (Jay 2026-11-06).
    'game-own-goals': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('mls',['20261101']);const e=l.find(x=>/Nashville/.test(x.home?.en||x.home?.name||''))||l[0];(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:document.querySelector('dialog.q-sheet[open] .wp')?.scrollIntoView({block:'start'})", wait(1500)) },
    // World Series game 5 (Brewers at Rays, 2026-10-28): Simpson's 9th-inning RBI double is the Rays' gain, never the Brewers' (Jay 2026-11-06); the chart, then 關鍵時刻.
    'game-ws5-moments': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('mlb',['20261028']);const e=l.find(x=>/Rays|光芒/.test((x.home?.en||'')+(x.home?.name||'')))||l[0];(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:document.querySelector('dialog.q-sheet[open] .wp')?.scrollIntoView({block:'start'})", wait(1200), "js:(()=>{const b=[...document.querySelectorAll('dialog.q-sheet[open] .wp-mo-go')].pop();b?.click()})()", wait(1500)) },
    // The same game's goal list (each own goal: Nashville's badge, the defender's small head under it), and 過程 at an own goal.
    'game-own-goals-list': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('mls',['20261101']);const e=l.find(x=>/Nashville/.test(x.home?.en||x.home?.name||''))||l[0];(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:document.querySelector('dialog.q-sheet[open] .lp-goals')?.scrollIntoView({block:'center'})", wait(1500)) },
    'game-own-goals-plays': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('mls',['20261101']);const e=l.find(x=>/Nashville/.test(x.home?.en||x.home?.name||''))||l[0];(await import('./sheets.js')).openMatch(e)})", wait(10000), tap('過程|Plays'), wait(3000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .play-face.og')].pop()?.scrollIntoView({block:'center'})", wait(1200)) },
    // A table scrolled to its tie lines (a tie on a zone's edge and what settled it), if any.
    // A team's page (the Lakers): 概況.
    // An MLS club's 接下來 crossing into next season (the 2027 賽季 line, Jay 2026-11-01): Inter Miami.
    'team-mls': { args: click("js:import('./sheets.js').then(m=>m.openTeam('mls','20232'))", wait(9000), "js:[...document.querySelectorAll('dialog.q-sheet[open] button,dialog.q-sheet[open] [role=tab]')].find(b=>/^(賽程|Games)$/.test(b.textContent.trim()))?.click()", wait(2500), "js:document.querySelector('dialog.q-sheet[open] .season-break')?.scrollIntoView({block:'center'})", wait(1500)) },
    // Nashville SC (MLS) on 概況, then 數據 (球隊數據's tiles in full rows, 數據領先, 隊內排行), then 數據 with 隊內排行's 助攻 chosen.
    'team-nash': { args: click("js:import('./sheets.js').then(m=>m.openTeam('mls','18986'))", wait(9000)) },
    'team-nash-stats': { args: click("js:import('./sheets.js').then(m=>m.openTeam('mls','18986'))", wait(9000), "js:[...document.querySelectorAll('dialog.q-sheet[open] button,dialog.q-sheet[open] [role=tab]')].find(b=>/^(數據|Stats)$/.test(b.textContent.trim()))?.click()", wait(4000)) },
    'team-nash-pick': { args: click("js:import('./sheets.js').then(m=>m.openTeam('mls','18986'))", wait(9000), "js:[...document.querySelectorAll('dialog.q-sheet[open] button,dialog.q-sheet[open] [role=tab]')].find(b=>/^(數據|Stats)$/.test(b.textContent.trim()))?.click()", wait(4000), "js:document.querySelector('dialog.q-sheet[open] .lb-team')?.scrollIntoView({block:'start'})", wait(800), "js:[...document.querySelectorAll('dialog.q-sheet[open] .lb-team button,dialog.q-sheet[open] .lb-team [role=tab]')].find(b=>/^(助攻|Assists)$/.test(b.textContent.trim()))?.click()", wait(5000)) },
    // A team's and a player's every tab (Jay 2026-11-06, an iPad: 本場 a sliver in the middle, 賽程 half empty, 陣容 out of order, 排名 narrow).
    // Julian Hall opened from Nashville 3–2 Red Bulls (11/1): 本場 first; then each tab. Nashville, the Brewers, the Lakers: each tab.
    ...Object.fromEntries(
      [['', ''], ['-overview', '概況|Overview'], ['-games', '賽程|Games'], ['-stats', '數據|Stats'], ['-bio', '資料|Bio']].map(([k, t]) => [
        `player-hall${k}`,
        { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('mls',['20261101']);const e=l.find(x=>/Nashville/.test(x.home?.en||x.home?.name||''))||l[0];(await import('./sheets.js')).openMatch(e)})", wait(8000), "js:import('./sheets.js').then(m=>m.openPlayer('mls','288041'))", wait(8000), ...(t ? [`js:[...document.querySelectorAll('dialog.q-sheet[open] button,dialog.q-sheet[open] [role=tab]')].filter(b=>b.offsetParent&&/^(${t})$/.test(b.textContent.trim())).pop()?.click()`, wait(3000)] : [])) }
      ])
    ),
    ...Object.fromEntries(
      [['nash', 'mls', '18986'], ['brewers', 'mlb', '8'], ['lakers', 'nba', '13'], ['arsenal', 'epl', '359']].flatMap(([n, l, id]) =>
        [['overview', ''], ['games', '賽程|Games'], ['stats', '數據|Stats'], ['roster', '陣容|Roster'], ['table', '排名|Table']].map(([k, t]) => [
          `tabs-${n}-${k}`,
          { args: click(`js:import('./sheets.js').then(m=>m.openTeam('${l}','${id}'))`, wait(9000), ...(t ? [`js:[...document.querySelectorAll('dialog.q-sheet[open] button,dialog.q-sheet[open] [role=tab]')].filter(b=>b.offsetParent&&/^(${t})$/.test(b.textContent.trim())).pop()?.click()`, wait(4000)] : [])) }
        ])
      )
    ),
    // Each league's player on each tab: Saka, Ohtani, LeBron, Leclerc.
    ...Object.fromEntries(
      [['saka', 'epl', '280555'], ['ohtani', 'mlb', '39832'], ['lebron', 'nba', '1966'], ['leclerc', 'f1', '5498']].flatMap(([n, l, id]) =>
        [['overview', ''], ['games', '賽程|Games'], ['stats', '數據|Stats'], ['bio', '資料|Bio']].map(([k, t]) => [
          `player-${n}-${k}`,
          { args: click(`js:import('./sheets.js').then(m=>m.openPlayer('${l}','${id}'))`, wait(9000), ...(t ? [`js:[...document.querySelectorAll('dialog.q-sheet[open] button,dialog.q-sheet[open] [role=tab]')].filter(b=>b.offsetParent&&/^(${t})$/.test(b.textContent.trim())).pop()?.click()`, wait(4000)] : [])) }
        ])
      )
    ),
    // A basketball player's season in depth (Sports' hoops.mjs, Jay 2026-11-09): Reaves' 每場得分 on 概況, then 數據's 投籃效率 and 分項數據.
    'player-hoops': { args: click("js:import('./sheets.js').then(m=>m.openPlayer('nba','4066457'))", wait(9000), "js:[...document.querySelectorAll('dialog.q-sheet[open]')].pop().querySelector('.hp-form')?.closest('.q-card').scrollIntoView({block:'start'})", wait(800)) },
    'player-hoops-stats': { args: click("js:import('./sheets.js').then(m=>m.openPlayer('nba','4066457'))", wait(9000), tap('數據|Stats'), wait(5000), "js:[...[...document.querySelectorAll('dialog.q-sheet[open]')].pop().querySelectorAll('.card-h')].find(c=>/投籃效率|Shooting/.test(c.textContent))?.scrollIntoView({block:'start'})", wait(800)) },
    'player-hoops-splits': { args: click("js:import('./sheets.js').then(m=>m.openPlayer('nba','4066457'))", wait(9000), tap('數據|Stats'), wait(5000), "js:[...document.querySelectorAll('dialog.q-sheet[open]')].pop().querySelector('.hp-highs')?.closest('.q-card').scrollIntoView({block:'start'})", wait(800)) },
    // A close game's last minute by stoppage (Lakers–Pistons 2026-11-08: a free-throw trip one row, its foul under it).
    'nba-plays-end': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba',['20261108']);const e=l.find(x=>/Pistons|Detroit/.test(x.home?.en||x.home?.name||''))||l[0];(await import('./sheets.js')).openMatch(e)})", wait(8000), tap('過程|Plays'), wait(4000), tap('第4節|Q4|4th'), wait(2500), "js:(d=>d.scrollTop=d.scrollHeight)([...document.querySelectorAll('dialog.q-sheet[open]')].pop())", wait(2500), "js:(d=>d.scrollTop=d.scrollHeight)([...document.querySelectorAll('dialog.q-sheet[open]')].pop())", wait(2500), "js:(d=>d.scrollTop=d.scrollHeight)([...document.querySelectorAll('dialog.q-sheet[open]')].pop())", wait(1500)) },
    // Leclerc (F1) on 資料: 生涯車隊 (Sauber's logo, 2018).
    'f1-driver-bio': { args: click("js:import('./sheets.js').then(m=>m.openPlayer('f1','5498'))", wait(9000), "js:[...document.querySelectorAll('dialog.q-sheet[open] button,dialog.q-sheet[open] [role=tab]')].find(b=>/^(資料|Bio)$/.test(b.textContent.trim()))?.click()", wait(4000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/生涯車隊|Teams/.test(c.textContent))?.scrollIntoView({block:'center'})", wait(1500)) },
    'team-nba': { args: click("js:import('./sheets.js').then(m=>m.openTeam('nba','13'))", wait(7000)) },
    // The Rockets' 概況 after 賽程 and back: 下一場 with both logos (Jay 2026-11-05: gone after the switch).
    'team-nba-back': { args: click("js:import('./sheets.js').then(m=>m.openTeam('nba','10'))", wait(8000), "js:[...document.querySelectorAll('dialog.q-sheet[open] button,dialog.q-sheet[open] [role=tab]')].find(b=>/^(賽程|Games)$/.test(b.textContent.trim()))?.click()", wait(2500), "js:[...document.querySelectorAll('dialog.q-sheet[open] button,dialog.q-sheet[open] [role=tab]')].find(b=>/^(概況|Overview)$/.test(b.textContent.trim()))?.click()", wait(2000)) },
    // A player ESPN lists with an all-star side (Carles Gil: MLS All-Stars), shown with his club (New England).
    'player-allstar': { args: click("js:import('./sheets.js').then(m=>m.openPlayer('mls','152168'))", wait(9000)) },
    // Raptors at Lakers, 2026-11-02: 勝率走勢's run told where it ended (Lakers 28-8 at 14-31, never at 6-9).
    'nba-run': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba',['20261101']);const e=l.find(x=>x.id==='401909906');(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/勝率走勢|Win probability/.test(c.textContent))?.scrollIntoView({block:'start'})", wait(1500)) },
    // Heat at Lakers, 2026-11-02 (G. Antetokounmpo, the longest name): the 得分王 card on top, then 數據's box score.
    // Thunder at Cavaliers, 2026-11-02 (S. Gilgeous-Alexander): the head's 追蹤, the 得分王 card; then 過程's plays.
    'nba-sga': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba',['20261102']);const e=l.find(x=>x.id==='401909907');(await import('./sheets.js')).openMatch(e)})", wait(10000)) },
    'nba-sga-plays': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba',['20261102']);const e=l.find(x=>x.id==='401909907');(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .match-tabs [role=tab],dialog.q-sheet[open] .match-tabs button')].find(b=>/^(過程|Plays)$/.test(b.textContent.trim()))?.click()", wait(4000)) },
    'nba-long-name': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba',['20261102']);const e=l.find(x=>x.id==='401909921');(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:document.querySelector('dialog.q-sheet[open] .lp-bb')?.scrollIntoView({block:'center'})", wait(1500)) },
    'nba-long-box': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba',['20261102']);const e=l.find(x=>x.id==='401909921');(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .match-tabs [role=tab],dialog.q-sheet[open] .match-tabs button')].find(b=>/^(數據|Stats)$/.test(b.textContent.trim()))?.click()", wait(3000), "js:[...document.querySelectorAll('dialog.q-sheet[open] button,dialog.q-sheet[open] [role=tab]')].find(b=>b.offsetParent&&/^(球員|Players)$/.test(b.textContent.trim()))?.click()", wait(2500), "js:document.querySelector('dialog.q-sheet[open] table.box')?.scrollIntoView({block:'start'})", wait(1500)) },
    'nba-game': { args: click('#tab-matches', '[data-league=nba]', "js:[...document.querySelectorAll('.q-chip.day.is-today')].find(e=>e.offsetParent)?.click()", "js:[...document.querySelectorAll('.event-row')].find(e=>e.offsetParent)?.click()", wait(4000)) },
    // Today's first NBA game (under 全部), scrolled to a card by its title: 勝率走勢 (the chart and 關鍵時刻), 本季對戰.
    // Today's first NBA game (under 全部) on each of its tabs: how a game's page lays out wide (Jay 2026-11-01).
    ...Object.fromEntries([['', ''], ['-stats', '數據|Stats'], ['-lineups', '陣容|Lineups'], ['-table', '排名|Standings'], ['-plays', '過程|Plays']].map(([k, t]) => [`nba-today${k}`, { args: click('#tab-matches', wait(3000), "js:document.querySelector('.all-league[data-league=nba] .event-row').click()", wait(9000), ...(t ? ["js:[...document.querySelectorAll('dialog.q-sheet[open] .match-tabs [role=tab],dialog.q-sheet[open] .match-tabs button')].find(b=>/^(" + t + ")$/.test(b.textContent.trim()))?.click()", wait(2500)] : [])) }])),
    // An NBA game to come (賽事 · NBA, the next day's first game) on each of its tabs: a game page before the start, laid out wide.
    ...Object.fromEntries([['', ''], ['-stats', '數據|Stats'], ['-lineups', '陣容|Lineups'], ['-table', '排名|Standings']].map(([k, t]) => [`nba-next${k}`, { args: click('#tab-matches', wait(3000), "js:[...document.querySelectorAll('[data-league=nba]')].find(e=>e.offsetParent)?.click()", wait(3000), "js:(()=>{const d=[...document.querySelectorAll('.q-chip.day')].filter(e=>e.offsetParent);d[d.findIndex(e=>e.classList.contains('is-today'))+1]?.click()})()", wait(3000), "js:[...document.querySelectorAll('.event-row')].find(e=>e.offsetParent&&!e.closest('[hidden]'))?.click()", wait(9000), ...(t ? ["js:[...document.querySelectorAll('dialog.q-sheet[open] .match-tabs [role=tab],dialog.q-sheet[open] .match-tabs button')].find(b=>/^(" + t + ")$/.test(b.textContent.trim()))?.click()", wait(2500)] : [])) }])),
    // Rockets at Wizards, 11/16 (12 days off on 11/04): 先發陣容 from each side's last game (上場先發, Jay 2026-11-04), then 陣容 with them first, then 數據's season-average tables (one even colour, pinned names and all).
    'nba-far': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba',['20261115']);const e=l.find(x=>/Rockets|火箭/.test((x.away?.en||'')+(x.away?.name||'')))||l[0];(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/先發陣容|Starting lineups/.test(c.textContent))?.scrollIntoView({block:'start'})", wait(1500)) },
    'nba-far-lineups': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba',['20261115']);const e=l.find(x=>/Rockets|火箭/.test((x.away?.en||'')+(x.away?.name||'')))||l[0];(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .match-tabs [role=tab],dialog.q-sheet[open] .match-tabs button')].find(b=>/^(陣容|Lineups)$/.test(b.textContent.trim()))?.click()", wait(4000)) },
    'nba-far-stats': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba',['20261115']);const e=l.find(x=>/Rockets|火箭/.test((x.away?.en||'')+(x.away?.name||'')))||l[0];(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .match-tabs [role=tab],dialog.q-sheet[open] .match-tabs button')].find(b=>/^(數據|Stats)$/.test(b.textContent.trim()))?.click()", wait(4000), "js:document.querySelector('dialog.q-sheet[open] .table-wrap')?.scrollIntoView({block:'start'})", wait(1500)) },
    'nba-chart': { args: click('#tab-matches', wait(3000), "js:document.querySelector('.all-league[data-league=nba] .event-row').click()", wait(9000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/勝率走勢|Win probability/.test(c.textContent))?.scrollIntoView({block:'start'})", wait(1500)) },
    'nba-series': { args: click('#tab-matches', wait(3000), "js:document.querySelector('.all-league[data-league=nba] .event-row').click()", wait(9000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/本季對戰|Season series/.test(c.textContent))?.scrollIntoView({block:'start'})", wait(1500)) },
    'nba-closing': { args: click('#tab-matches', wait(3000), "js:document.querySelector('.all-league[data-league=nba] .event-row').click()", wait(9000), "js:document.querySelector('dialog.q-sheet[open] .lp-scoring')?.scrollIntoView({block:'start'})", wait(1500)) },
    // A football game to come (the first MLS one two days on, under 全部): 先發陣容 and 勝率預測.
    'mls-game': { args: click('#tab-matches', "js:[...document.querySelectorAll('.q-chip.day')].filter(e=>e.offsetParent)[[...document.querySelectorAll('.q-chip.day')].filter(e=>e.offsetParent).findIndex(e=>e.classList.contains('is-today'))+2].click()", wait(4000), "js:document.querySelector('.all-league[data-league=mls] .event-row').click()", wait(12000)) },
    // Today's first European football game begun (or the first to come), scrolled to 近期交手 (the last meetings, a block each, their scores).
    'soccer-h2h': { args: click("js:(async()=>{const espn=await import('./lib/espn.mjs');for(const lg of ['seriea','epl','laliga','bundesliga','ligue1']){const l=await espn.scoreboard(lg).catch(()=>[]);const e=l.find(x=>x.status.state!=='pre')||l[0];if(e){(await import('./sheets.js')).openMatch(e);break}}})()", wait(10000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/近期交手|Head to head/.test(c.textContent))?.scrollIntoView({block:'start'})", wait(2500)) },
    // 曼聯 v 科芬特里城 (2026-12-05), scrolled to 近期交手: two meetings, the 2024 FA Cup semi's 3-3 a draw settled on penalties (PK).
    'h2h-pens': { args: click("js:(async()=>{const espn=await import('./lib/espn.mjs');const l=await espn.scoreboard('epl','20261205').catch(()=>[]);const e=l.find(x=>x.id==='401879210');if(e)(await import('./sheets.js')).openMatch(e)})()", wait(10000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/近期交手|Head to head/.test(c.textContent))?.scrollIntoView({block:'start'})", wait(2500)) },
    // 賽前看點 (Jay 11-11): a game to come's points over 兩隊比較, the Orbit AI head, a row per point (Mavericks at Timberwolves 11/12; Fulham at Man City 11/21).
    'preview-nba': { args: click("js:(async()=>{const espn=await import('./lib/espn.mjs');const l=await espn.scoreboard('nba','20261112').catch(()=>[]);const e=l.find(x=>x.id==='401909978');if(e)(await import('./sheets.js')).openMatch(e)})()", wait(9000), "js:document.querySelector('dialog.q-sheet[open] .pv-box, dialog.q-sheet[open] .compare')?.scrollIntoView({block:'center'})", wait(1200)) },
    'preview-epl': { args: click("js:(async()=>{const espn=await import('./lib/espn.mjs');const l=await espn.scoreboard('epl','20261121').catch(()=>[]);const e=l.find(x=>x.id==='401879233');if(e)(await import('./sheets.js')).openMatch(e)})()", wait(9000), "js:document.querySelector('dialog.q-sheet[open] .pv-box, dialog.q-sheet[open] .compare')?.scrollIntoView({block:'center'})", wait(1200)) },
    // A soccer game at half-time today (賽事 · 全部): its row's 中場休息 countdown, then its page's header (only while one is on).
    // A live NBA game's 場上球員 (the first NBA game on now); at a break its corner says so (2026-11-06).
    'nba-court': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba');const e=l.find(x=>x.status.state==='in')||l[0];(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/場上球員|On the court/.test(c.textContent))?.scrollIntoView({block:'center'})", wait(1500)) },
    // Its head (the score, crests and names; bigger on an iPad or a computer, 2026-11-06).
    'nba-head': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba');const e=l.find(x=>x.status.state==='in')||l[0];(await import('./sheets.js')).openMatch(e)})", wait(10000)) },
    // Its 數據's 球隊 (each group a tile on a wide sheet, 2026-11-06).
    'nba-stats': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba');const e=l.find(x=>x.status.state==='in')||l.find(x=>x.status.state==='post')||l[0];(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .match-tabs [role=tab],dialog.q-sheet[open] .match-tabs button')].find(b=>/^(數據|Stats)$/.test(b.textContent.trim()))?.click()", wait(3000), "js:document.querySelector('dialog.q-sheet[open] .stat-bars')?.scrollIntoView({block:'start'})", wait(1500)) },
    // Its 過程, flung far down (a fling outran the rows once: an empty band, 2026-11-06).
    'nba-plays-fling': { args: click("js:import('./lib/espn.mjs').then(async E=>{const l=await E.scoreboard('nba');const e=l.find(x=>x.status.state==='in')||l[0];(await import('./sheets.js')).openMatch(e)})", wait(10000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .match-tabs [role=tab],dialog.q-sheet[open] .match-tabs button')].find(b=>/^(過程|Plays)$/.test(b.textContent.trim()))?.click()", wait(3000), "js:(async()=>{const s=document.querySelector('dialog.q-sheet[open]');for(let i=0;i<12;i++){s.scrollTop+=900;await new Promise(r=>setTimeout(r,40))}})()", wait(150)) },
    'halftime-list': { args: click('#tab-matches', wait(4000), "js:[...document.querySelectorAll('.event-row')].find(e=>e.offsetParent&&/中場休息|Half-time/.test(e.textContent))?.scrollIntoView({block:'center'})", wait(4000)) },
    'halftime-game': { args: click('#tab-matches', wait(4000), "js:[...document.querySelectorAll('.event-row')].find(e=>e.offsetParent&&/中場休息|Half-time/.test(e.textContent))?.click()", wait(8000)) },
    // A basketball game in a timeout today (賽事 · 全部): its row's period and clock, then 暫停 and its countdown; then its page's header (the game clock, each side's timeouts left); timeout-game opens a basketball game on now when none is in a timeout.
    'timeout-list': { args: click('#tab-matches', wait(4000), "js:[...document.querySelectorAll('.event-row')].find(e=>e.offsetParent&&/暫停|Timeout/.test(e.textContent))?.scrollIntoView({block:'center'})", wait(3000)) },
    'timeout-game': { args: click('#tab-matches', wait(4000), "js:(r=>(r.find(e=>/暫停|Timeout/.test(e.textContent))||r.find(e=>/第\\d節|Q\\d/.test(e.textContent)))?.click())([...document.querySelectorAll('.event-row')].filter(e=>e.offsetParent))", wait(7000)) },
    'f1-weekend': { args: click('#tab-matches', '[data-league=f1]', tap('Ended|已結束'), "js:document.querySelector('.wk-card.done')?.click()", wait(4000)) },
    // F1's 賽程, 已結束: each weekend over, its race's winner.
    'f1-past': { args: click('#tab-matches', '[data-league=f1]', tap('Ended|已結束'), wait(3000)) },
    // The last race's 過程 (lap by lap), on the sheet of the weekend just over.
    'f1-story': { args: click('#tab-matches', '[data-league=f1]', tap('Ended|已結束'), "js:document.querySelector('.wk-card.done')?.click()", wait(6000), `js:[...document.querySelectorAll('dialog.q-sheet[open] .lb-views button')].find(b=>/^(過程|Story)$/.test(b.textContent.trim()))?.click()`, wait(3000), "js:document.querySelector('dialog.q-sheet[open] .f1-views')?.scrollIntoView({block:'start'})", wait(1000)) },
    // An F1 session on now: its live board (the flag, its reason and the
    // restart's countdown, race control, the tower), and each 數據 tab and
    // card. With no session on, a real one replayed at a moment
    // (tools/f1-replay.mjs, its args.txt after --): a red flag, a safety car.
    'f1-live': { args: click('#tab-matches', '[data-league=f1]', '.wk-card.live', wait(9000)) },
    // (Each view by its name: a race has 過程 second, a qualifying none.)
    ...Object.fromEntries([['story', '過程|Story'], ['track', '賽道|Track'], ['tyres', '輪胎|Tyres'], ['laps', '圈速|Laps'], ['points', '積分|Points']].map(([k, t]) => [`f1-live-${k}`, { args: click('#tab-matches', '[data-league=f1]', '.wk-card.live', wait(9000), `js:[...document.querySelectorAll('dialog.q-sheet[open] .lb-views button')].find(b=>/^(${t})$/.test(b.textContent.trim()))?.click()`, wait(3000), "js:document.querySelector('dialog.q-sheet[open] .f1-views')?.scrollIntoView({block:'start'})", wait(1000)) }])),
    ...Object.fromEntries([['chart', '勝率走勢|Win probability'], ['title', '冠軍之爭|Title fight']].map(([k, t]) => [`f1-live-${k}`, { args: click('#tab-matches', '[data-league=f1]', '.wk-card.live', wait(12000), `js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/${t}/.test(c.textContent))?.scrollIntoView({block:'start'})`, wait(1500)) }])),
    // The next race weekend's sheet scrolled to: 賽道 (the circuit drawn) and last year's podium.
    'f1-next': { args: click('#tab-matches', '[data-league=f1]', "js:document.querySelector('.wk-card:not(.done)')?.click()", wait(6000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/賽道|The circuit/.test(c.textContent))?.scrollIntoView({block:'start'})", wait(2500)) },
    // The race to come: its grid (a car not where it qualified says so; Mexico 2026).
    'f1-grid': { args: click('#tab-matches', '[data-league=f1]', "js:document.querySelector('.wk-card:not(.done)')?.click()", wait(6000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .wkt-stop')].pop()?.click()", wait(3000), "js:document.querySelector('dialog.q-sheet[open] .f1-field li:nth-child(3)')?.scrollIntoView({block:'start'})", wait(1500)) },
    'f1-podium': { args: click('#tab-matches', '[data-league=f1]', "js:document.querySelector('.wk-card:not(.done)')?.click()", wait(6000), "js:[...document.querySelectorAll('dialog.q-sheet[open] .q-card')].find(c=>/年這一站|Here in/.test(c.textContent))?.scrollIntoView({block:'end'})", wait(2500)) },
    // A driver who only ran a practice (an FP1 stand-in: Mexico 2026's Minì), his page.
    'f1-guest': { args: click("js:import('./sheets.js').then(m=>m.openPlayer('f1','5910'))", wait(9000)) },
    // A player's 資料 (profile, draft, every team, honours) and 數據 scrolled to its seasons, one per sport.
    ...Object.fromEntries(
      [['nba', '3945274'], ['mlb', '33192'], ['epl', '280555'], ['f1', '868'], ['epl', '265653', 'epl-loans'], ['epl', '259902', 'epl-abroad'], ['nba', '3202', 'nba-moved']].flatMap(([league, id, key = league]) => [
        [`player-${key}`, { args: click(`js:import('./sheets.js').then(m=>m.openPlayer('${league}','${id}'))`, wait(6000), tap('資料|Bio'), wait(6000), "js:[...document.querySelectorAll('dialog.q-sheet[open]')].pop().querySelector('.career-teams')?.closest('.q-card').scrollIntoView({block:'start'})", wait(600)) }],
        [`player-${key}-stats`, { args: click(`js:import('./sheets.js').then(m=>m.openPlayer('${league}','${id}'))`, wait(6000), tap('數據|Stats'), wait(6000), "js:[...document.querySelectorAll('dialog.q-sheet[open]')].pop().querySelector('.career-seasons')?.scrollIntoView({block:'start'})", wait(600)) }]
      ])
    )
  },
  transit: {
    // The Pass sheet scrolled to 連結 (a Home Screen app: links in the quick view or the Safari app, Jay 2026-11-10).
    'pass-links': { hash: '', args: click(wait(2500), "js:document.querySelector('.q-account')?.click()", wait(1500), "js:[...document.querySelectorAll('.q-sheet-h')].find(h=>/連結|Links/.test(h.textContent))?.scrollIntoView({block:'start'})", wait(600)) },
    default: ['tabs', 'trip'],
    // (What tools/layout-check.mjs looks at beside every tab: the sheets that matter.)
    check: ['plans', 'place', 'search', 'ticket'],
    // A real trip from where the phone is (新竹車站) to 臺北車站: the plans card, then the first plan.
    trip: { args: ['--google-map', ...click('#tab-map', wait(2500), "js:(()=>{const q=document.querySelector('#q');q.focus();q.value=document.documentElement.lang==='en'?'Taipei Main Station':'臺北車站';q.dispatchEvent(new Event('input',{bubbles:true}))})()", wait(8000), '.ot-res', "js:document.querySelector('[data-card=go]')?.click()", wait(8000), "js:document.querySelector('.ot-plan[data-plan=\"0\"]')?.click()", wait(5000))] },
    // The same trip's 路線 card, the ways listed (none opened).
    plans: { args: ['--google-map', ...click('#tab-map', wait(2500), "js:(()=>{const q=document.querySelector('#q');q.focus();q.value=document.documentElement.lang==='en'?'Taipei Main Station':'臺北車站';q.dispatchEvent(new Event('input',{bubbles:true}))})()", wait(8000), '.ot-res', "js:document.querySelector('[data-card=go]')?.click()", wait(9000))] },
    // A trip across counties, past TPASS (新竹車站 → 臺南車站): the plans card with each way's fare (our own trains priced too).
    'plans-far': { args: ['--google-map', ...click('#tab-map', wait(2500), "js:(()=>{const q=document.querySelector('#q');q.focus();q.value=document.documentElement.lang==='en'?'Tainan Station':'臺南車站';q.dispatchEvent(new Event('input',{bubbles:true}))})()", wait(8000), '.ot-res', "js:document.querySelector('[data-card=go]')?.click()", wait(12000))] },
    // 地圖 on Google's map as the site gets it: Google's places (restaurants, temples, the city hall) beside our stops and bikes.
    map: { args: ['--google-map', ...click('#tab-map', wait(7000))] },
    // A place's card (新竹市政府, found by search): its name, 路線, the YouBike near it.
    place: { args: ['--google-map', ...click('#tab-map', wait(2500), "js:(()=>{const q=document.querySelector('#q');q.focus();q.value=document.documentElement.lang==='en'?'Hsinchu City Government':'新竹市政府';q.dispatchEvent(new Event('input',{bubbles:true}))})()", wait(6000), '.ot-res', wait(5000))] },
    // 地圖's 搜尋地點, the field tapped (取消 beside it, your recents under it); then the keyboard put
    // away with nothing typed (取消 gone, the field the whole row).
    search: { args: click('#tab-map', wait(3000), "js:document.querySelector('#q').focus()", wait(1500)) },
    'search-done': { args: click('#tab-map', wait(3000), "js:document.querySelector('#q').focus()", wait(1200), "js:document.querySelector('#q').blur()", wait(1200)) },
    // 地圖's sheet raised to 建議 (with places pinned and --clock a working day's morning: 去公司).
    sugs: { args: click(wait(4000), ...[1, 2].flatMap(() => ["js:document.getElementById('ms-grab').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))", wait(1200)])) },
    // 交通 once its rides are read (with --account rides: a trip, a pinned bus, a pinned train), then scrolled to what's near.
    go: { hash: 'go', args: click(wait(9000)) },
    'go-lower': { hash: 'go', args: click(wait(8000), "js:(()=>{document.getElementById('panel-go')?.scrollTo(0,700);scrollTo(0,700)})()", wait(1500)) },
    // A pinned bus's route from 交通's row: its stops, where its buses are (進站中 on a stop's dot, one on its way between two).
    route: { hash: 'go', args: click(wait(9000), '[data-route]', wait(6000)) },
    // 查時刻 › 火車: 新竹 → 臺北's trains, each journey as one line.
    trains: { hash: 'times', args: click(wait(2500), '[data-view="train"]', wait(1000), "js:(async()=>{const pick=async(w,q)=>{document.querySelector(`[data-pick=${w}]`).click();await new Promise(r=>setTimeout(r,800));const i=document.querySelector('#s-q');i.value=q;i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,900));document.querySelector('#s-body [data-st]').click();await new Promise(r=>setTimeout(r,900))};await pick('from','新竹');await pick('to','臺北')})()", wait(8000)) },
    // 查時刻 › 火車: 新竹 → 臺中's trains, changes named between them (新烏日) and some one train straight through.
    'trains-change': { hash: 'times', args: click(wait(2500), '[data-view="train"]', wait(1000), "js:(async()=>{const pick=async(w,q)=>{document.querySelector(`[data-pick=${w}]`).click();await new Promise(r=>setTimeout(r,800));const i=document.querySelector('#s-q');i.value=q;i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,900));([...document.querySelectorAll('#s-body [data-st]')].find(b=>!/高鐵/.test(b.textContent))||document.querySelector('#s-body [data-st]')).click();await new Promise(r=>setTimeout(r,900))};await pick('from','新竹');await pick('to','臺中')})()", wait(8000)) },
    // 查時刻: 新竹 → 臺中, the second journey opened to its 用這班規劃路線 (指定車次, ticket.mjs).
    // 查時刻: 新竹 → 臺中, the second journey opened to its 用這班規劃路線 (指定車次, ticket.mjs).
    'ride-plan': { hash: 'times', args: click(wait(2500), '[data-view="train"]', wait(1000), "js:(async()=>{const pick=async(w,q)=>{document.querySelector(`[data-pick=${w}]`).click();await new Promise(r=>setTimeout(r,800));const i=document.querySelector('#s-q');i.value=q;i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,900));document.querySelector('#s-body [data-st]').click();await new Promise(r=>setTimeout(r,900))};await pick('from','新竹');await pick('to','臺中')})()", wait(8000), "js:document.querySelectorAll('.ot-jny')[1]?.click()", wait(1000), "js:document.querySelector('[data-ride-plan]')?.scrollIntoView({block:'center'})", wait(600)) },
    // 指定車次: that journey planned, then the time chip's 指定車次 sheet with tomorrow's 高鐵 0805 picked, then planned around it.
    ticket: { hash: 'times', args: click(wait(2500), '[data-view="train"]', wait(1000), "js:(async()=>{const pick=async(w,q)=>{document.querySelector(`[data-pick=${w}]`).click();await new Promise(r=>setTimeout(r,800));const i=document.querySelector('#s-q');i.value=q;i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,900));document.querySelector('#s-body [data-st]').click();await new Promise(r=>setTimeout(r,900))};await pick('from','新竹');await pick('to','臺中')})()", wait(8000), "js:document.querySelectorAll('.ot-jny')[1]?.click()", wait(800), "js:document.querySelector('[data-ride-plan]')?.click()", wait(6000), "js:document.querySelector('[data-when=menu]').click()", wait(1200), "js:document.querySelector('[data-pick-when=train]').click()", wait(1200), "js:document.querySelectorAll('.ot-ticket-sheet [data-day]')[1]?.click()", wait(1200), "js:(()=>{const i=document.querySelector('#tk-no');i.value='0805';i.dispatchEvent(new Event('input',{bubbles:true}))})()", wait(4000), "js:document.querySelector('[data-tk]')?.click()", wait(1200)) },
    'ticket-plan': { hash: 'times', args: click(wait(2500), '[data-view="train"]', wait(1000), "js:(async()=>{const pick=async(w,q)=>{document.querySelector(`[data-pick=${w}]`).click();await new Promise(r=>setTimeout(r,800));const i=document.querySelector('#s-q');i.value=q;i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,900));document.querySelector('#s-body [data-st]').click();await new Promise(r=>setTimeout(r,900))};await pick('from','新竹');await pick('to','臺中')})()", wait(8000), "js:document.querySelectorAll('.ot-jny')[1]?.click()", wait(800), "js:document.querySelector('[data-ride-plan]')?.click()", wait(6000), "js:document.querySelector('[data-when=menu]').click()", wait(1200), "js:document.querySelector('[data-pick-when=train]').click()", wait(1200), "js:document.querySelectorAll('.ot-ticket-sheet [data-day]')[1]?.click()", wait(1200), "js:(()=>{const i=document.querySelector('#tk-no');i.value='0805';i.dispatchEvent(new Event('input',{bubbles:true}))})()", wait(4000), "js:document.querySelector('[data-tk]')?.click()", wait(1200), "js:document.querySelector('[data-tk-go]')?.click()", wait(20000)) },
    // 查時刻 › 高鐵 新竹 → 台北: a journey opened, its 高鐵訂票.
    'hsr-book': { hash: 'times', args: click(wait(2500), '[data-view="train"]', wait(1000), "js:(async()=>{const pick=async(w,q)=>{document.querySelector(`[data-pick=${w}]`).click();await new Promise(r=>setTimeout(r,800));const i=document.querySelector('#s-q');i.value=q;i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,900));([...document.querySelectorAll('#s-body [data-st]')].find(b=>/hsr|高鐵/.test(b.outerHTML))||document.querySelector('#s-body [data-st]')).click();await new Promise(r=>setTimeout(r,900))};await pick('from','新竹');await pick('to','台北')})()", wait(8000), "js:document.querySelectorAll('.ot-jny')[0]?.click()", wait(1200), "js:document.querySelector('[data-book]')?.scrollIntoView({block:'center'})", wait(600)) },
    // 高鐵訂票 tapped: its sheet, the T Express app's way first, the website's beside it (Jay 2026-11-10).
    'hsr-book-sheet': { hash: 'times', args: click(wait(2500), '[data-view="train"]', wait(1000), "js:(async()=>{const pick=async(w,q)=>{document.querySelector(`[data-pick=${w}]`).click();await new Promise(r=>setTimeout(r,800));const i=document.querySelector('#s-q');i.value=q;i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,900));([...document.querySelectorAll('#s-body [data-st]')].find(b=>/hsr|高鐵/.test(b.outerHTML))||document.querySelector('#s-body [data-st]')).click();await new Promise(r=>setTimeout(r,900))};await pick('from','新竹');await pick('to','台北')})()", wait(8000), "js:document.querySelectorAll('.ot-jny')[0]?.click()", wait(1200), "js:document.querySelector('[data-book]')?.click()", wait(5000)) },
    // 查時刻's station picker with 台鐵 picked (only 台鐵's stations, no 高鐵 taps) and with 高鐵 picked
    // (its one line, 南港 to 左營, each station's 台鐵 under it; Jay 2026-11-10).
    'pick-tra': { hash: 'times', args: click(wait(2500), '[data-view="train"]', wait(1000), '[data-mode=tra]', wait(1500), '[data-pick=from]', wait(2500)) },
    'pick-hsr': { hash: 'times', args: click(wait(2500), '[data-view="train"]', wait(1000), '[data-mode=hsr]', wait(1500), '[data-pick=from]', wait(2500)) },
    // 六家 → 臺北 (台鐵), then 高鐵 picked: 高鐵新竹 → 高鐵台北 and their trains.
    'mode-hsr': { hash: 'times', args: click(wait(2500), '[data-view="train"]', wait(1000), "js:(async()=>{const pick=async(w,q)=>{document.querySelector(`[data-pick=${w}]`).click();await new Promise(r=>setTimeout(r,800));const i=document.querySelector('#s-q');i.value=q;i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,900));([...document.querySelectorAll('#s-body [data-st]')].find(b=>!/高鐵/.test(b.textContent))||document.querySelector('#s-body [data-st]')).click();await new Promise(r=>setTimeout(r,900))};await pick('from','六家');await pick('to','臺北')})()", wait(6000), '[data-mode=hsr]', wait(8000)) },
    // 查時刻 › 捷運: the metro map (台北 first), its line chips, the station card.
    metro: { hash: 'times', args: click(wait(2500), '[data-view="metro"]', wait(6000)) },
    // The metro map's 搜尋車站 with 中山 typed (every system's stations, codes under each); one found, its sheet over the map
    // (ringed on it); full screen; 高雄's map.
    'metro-find': { hash: 'times', args: click(wait(2500), '[data-view="metro"]', wait(5000), '[data-find]', wait(2500), "js:(()=>{const q=document.querySelector('#mf-q');q.value=document.documentElement.lang==='en'?'Zhongshan':'中山';q.dispatchEvent(new Event('input',{bubbles:true}))})()", wait(1200)) },
    'metro-station': { hash: 'times', args: click(wait(2500), '[data-view="metro"]', wait(5000), '[data-find]', wait(2500), "js:(()=>{const q=document.querySelector('#mf-q');q.value='BL12';q.dispatchEvent(new Event('input',{bubbles:true}))})()", wait(1000), '[data-mf]', wait(5000)) },
    'metro-full': { hash: 'times', args: click(wait(2500), '[data-view="metro"]', wait(5000), '[data-full]', wait(1500)) },
    'metro-kaohsiung': { hash: 'times', args: click(wait(2500), '[data-view="metro"]', wait(4000), '[data-map="kaohsiung"]', wait(5000)) },
    // 我的: trips, places, pins; then its 公車站牌 editor (groups, reorder, remove).
    me: { hash: 'me', args: click(wait(3000)) },
    stops: { hash: 'me', args: click(wait(3000), '[data-act="groups"]', wait(1500)) },
    // 查時刻: a station's live board (高雄).
    // 我的 › 公車站牌: groups and their stops, each with its bin and grip (with --account rides).
    groups: { hash: 'me', args: click(wait(2000), '[data-act=groups]', wait(1200)) },
    board: { args: click('#tab-times', wait(3000), "js:(async()=>{document.querySelector('[data-pick=to]').click();await new Promise(r=>setTimeout(r,800));const q=document.querySelector('#s-q');q.value='高雄';q.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,800));document.querySelector('#s-body [data-st]').click()})()", wait(8000)) }
  },
  weather: {
    default: ['tabs'],
    // (What tools/layout-check.mjs looks at beside every tab: the sheets that matter.)
    check: ['day', 'search'],
    // (The new 天氣's readings first, today's panels after, so a --before main diff finds both.)
    rain: { args: click('.ot-g[data-metric="rain"], .q-panel[data-open="rain"]', '[data-range="rain:10d"]') },
    air: { args: click('.ot-g[data-metric="air"], .q-panel[data-open="air"]') },
    // The day's sheet (the sky's card tapped), and the place search (the title).
    day: { args: click('.ot-hero[data-day], .wx-hero[data-day]', wait(1500)) },
    search: { args: click('.wx-title', wait(1200)) },
    // 天氣 further down: the readings, the advice and the ten days.
    lower: { args: click('js:window.scrollTo(0, 900)', wait(800)) },
    // 地點's 版面: the cards with their switches and grips, then one lifted mid-drag.
    layout: { args: click(wait(2500), tap('地點|Places'), wait(1500), "js:document.querySelector('[data-act=layout]').click()", wait(1200)) },
    'layout-drag': { args: click(wait(2500), tap('地點|Places'), wait(1500), "js:document.querySelector('[data-act=layout]').click()", wait(1200), lift('dialog[open]'), wait(700)) }
  },
  orbit: {
    default: ['tabs'],
    // (What tools/layout-check.mjs looks at beside every tab: the sheets that matter.)
    check: ['class', 'editor'],
    // 今天 one scroll down: the day's classes and the countdowns.
    lower: { args: click(wait(2000), 'js:scrollTo(0, innerHeight * 0.8)', wait(800)) },
    // (Class needs a timetable: --account demo, or -- --store classFocusData=….)
    class: { args: click('#cx-hero', wait(1200)) },
    // The card's foot (接著 / 下一節) tapped: the class it names, not the card's.
    next: { args: click("js:document.querySelector('.nv-foot, #cx-foot')?.click()", wait(1200)) },
    editor: { args: click('js:window.openEditor()', wait(1200)) },
    // A class's icon and colour: from its sheet's pencil, and from 編輯課表's class list.
    look: { args: click('#cx-hero', wait(1200), '.cx-pick-lead', wait(1200)) },
    'editor-classes': { args: click('js:window.openEditor()', wait(1200), "js:document.querySelector('#ed-parts > *').click()", wait(1000), "js:document.querySelector('#teacher-list .teacher-summary-text').click()", wait(800)) },
    'editor-look': { args: click('js:window.openEditor()', wait(1200), "js:document.querySelector('#teacher-list .tc-look').click()", wait(1200)) },
    key: { args: click("js:window.openTransferSheet('key')", wait(1200)) },
    photo: { args: click("js:window.openTransferSheet('photo')", wait(1200)) },
    swap: { hash: 'week', args: click('.cx-way.is-swap', wait(1200)) },
    flight: { hash: 'tools', args: click('.cx-fly-card', wait(2500)) },
    // 工具's 分享 card: 分享金鑰 and 加到行事曆.
    cal: { hash: 'tools', args: click(wait(1500), "js:document.querySelector('.cx-way.is-cal')?.scrollIntoView({block:'center'})", wait(800)) },
    sim: { args: click('js:window.openTestPanel()', wait(1200)) },
    // 待辦 and 學校公告 on 今天; a to-do's sheet; 工具's 學習: 讀書計畫 (planned in code, no AI here), 學校公告, its school picker.
    // (Seeded: -- --store classFocusData=… with todos and school, --store class.news.v1=….)
    todos: { args: click(wait(2000), "js:document.querySelector('#cx-todos')?.scrollIntoView({block:'start'})", wait(800)) },
    todo: { args: click(wait(2000), "js:document.querySelector('#cx-todos .cx-todo')?.click()", wait(1200)) },
    study: { hash: 'tools', args: click(wait(1500), '.cx-way.is-plan', wait(1500)) },
    plan: { hash: 'tools', args: click(wait(1500), '.cx-way.is-plan', wait(1500), 'dialog[open] .q-sheet-foot button', wait(6000)) },
    news: { hash: 'tools', args: click(wait(1500), '.cx-way.is-news', wait(1500)) },
    school: { hash: 'tools', args: click(wait(1500), '.cx-way.is-news', wait(1500), '.cx-news-school', wait(1500)) }
  },
  money: {
    default: ['tabs'],
    // (What tools/layout-check.mjs looks at beside every tab: the sheets that matter.)
    check: ['stats', 'entry', 'cats'],
    // 統計's card on each scale (日 週 月 年), a past month picked from its bars, the period's menu, 自訂期間.
    stats: { hash: 'stats', args: click(wait(800)) },
    'stats-day': { hash: 'stats', args: click(wait(800), "js:document.querySelectorAll('.mn-range button')[0].click()", wait(800)) },
    'stats-week': { hash: 'stats', args: click(wait(800), "js:document.querySelectorAll('.mn-range button')[1].click()", wait(800)) },
    'stats-year': { hash: 'stats', args: click(wait(800), "js:document.querySelectorAll('.mn-range button')[3].click()", wait(800)) },
    'stats-picked': { hash: 'stats', args: click(wait(800), "js:[...document.querySelectorAll('.mn-pbar')].at(-3)?.click()", wait(800)) },
    'stats-menu': { hash: 'stats', args: click(wait(800), "js:document.querySelector('.mn-hero-pick').click()", wait(600)) },
    'stats-custom': { hash: 'stats', args: click(wait(800), "js:document.querySelector('.mn-hero-pick').click()", wait(500), "js:[...document.querySelectorAll('.q-menu button')].pop().click()", wait(1200)) },
    // 記一筆 on 數位, its subs and the + for one's own.
    'entry-digital': { args: click('[aria-label="記一筆"],[aria-label="Add an entry"]', wait(1500), tap('數位|Digital'), wait(800)) },
    // 記一筆 on 轉帳: from, to, the amount, a fee, the day, a note.
    'entry-move': { args: click('[aria-label="記一筆"],[aria-label="Add an entry"]', wait(1500), tap('轉帳|Transfer'), wait(800)) },
    // 記一筆 on 餐飲: 早餐, 午餐, 晚餐, 飲料點心.
    'entry-food': { args: click('[aria-label="記一筆"],[aria-label="Add an entry"]', wait(1500), tap('餐飲|Food'), wait(800)) },
    // 記一筆 as it opens (its guess), then NT$25 typed: guessed again with the amount.
    entry: { args: click('[aria-label="記一筆"],[aria-label="Add an entry"]', wait(1500)) },
    'entry-typed': { args: click('[aria-label="記一筆"],[aria-label="Add an entry"]', wait(1500), "js:(i=>{i.value='25';i.dispatchEvent(new Event('input',{bubbles:true}));i.blur()})(document.querySelector('.mn-amount-in'))", wait(1000)) },
    // 更多 › 智慧帶入: what 記一筆 guesses from, and how often it was right.
    guessing: { hash: 'more', args: click(wait(800), "js:[...document.querySelectorAll('.mn-tool')].find(e=>/^(智慧帶入|Smart fill)/.test(e.textContent.trim())).click()", wait(1200)) },
    // 更多 › 分類: the twelve, each with its subs.
    cats: { hash: 'more', args: click(wait(800), "js:[...document.querySelectorAll('.mn-tool')].find(e=>/^(分類|Categories)/.test(e.textContent.trim())).click()", wait(1200)) },
    // 分類 with a category lifted mid-drag by its grip.
    'cats-drag': { hash: 'more', args: click(wait(800), "js:[...document.querySelectorAll('.mn-tool')].find(e=>/^(分類|Categories)/.test(e.textContent.trim())).click()", wait(1200), lift('dialog[open]', 1), wait(700)) },
    // 新增固定收支 scrolled to its foot (開始, the date field that once poked out sideways).
    'repeat-new': { hash: 'more', args: click("js:[...document.querySelectorAll('.mn-tool')].find(e=>/^(固定收支|Repeats)/.test(e.textContent.trim())).click()", wait(1200), tap('新增固定收支|New repeat'), wait(1200), "js:[...document.querySelectorAll('dialog.q-sheet[open]')].pop().scrollTop=9999", wait(600)) }
  },
  words: {
    default: ['tabs'],
    // (What tools/layout-check.mjs looks at beside every tab: the sheets that matter.)
    check: ['quiz', 'word', 'contest'],
    // 今天 one scroll down: where to pick up, the ways to practise, the rest.
    lower: { args: click(wait(2500), 'js:scrollTo(0, innerHeight * 0.8)', wait(800)) },
    quiz: { args: click('.hero .q-hc-btn', wait(2000)) },
    // A question answered (the first choice), its verdict and 下一題.
    answered: { args: click('.hero .q-hc-btn', wait(2000), "js:document.querySelector('.choice')?.click()", wait(800)) },
    // 練習模式's 句子填空: a round on the words' own examples, the first question answered.
    sentence: { args: click(wait(2500), "js:[...document.querySelectorAll('.mode-row, .mode-card')].find(e=>/句子填空|Sentences/.test(e.textContent)).click()", wait(600), "js:document.querySelector('.mode-go')?.click()", wait(1500), "js:document.querySelector('.choice')?.click()", wait(800)) },
    // 練習模式 in view, 選英文 picked (ticked, its 開始 under the list), then that 開始 tapped from down there: the round at the top.
    modes: { args: click(wait(2500), "js:document.querySelector('.mode-list')?.scrollIntoView({block:'center'})", wait(600), "js:[...document.querySelectorAll('.mode-row')].find(e=>/選英文|Pick the word/.test(e.textContent))?.click()", wait(800)) },
    'mode-start': { args: click(wait(2500), "js:document.querySelector('.mode-list')?.scrollIntoView({block:'center'})", wait(600), "js:[...document.querySelectorAll('.mode-row')].find(e=>/選英文|Pick the word/.test(e.textContent))?.click()", wait(600), "js:document.querySelector('.mode-go')?.click()", wait(1500)) },
    // 拼字比賽 handed in at once (every question blank): the results page.
    contest: { args: click(wait(3000), "js:[...document.querySelectorAll('.contest-card button.primary')][0].click()", wait(1500)) },
    word: { hash: 'word=track' },
    // 複習's flash cards (after a 選中文 round, the last choice each time: 答錯's deck), and 背新字's first card.
    flash: { args: click("js:(async()=>{const z=ms=>new Promise(r=>setTimeout(r,ms));await z(2500);[...document.querySelectorAll('.mode-row')].find(e=>/選中文|Meaning/.test(e.textContent)).click();await z(400);document.querySelector('.mode-go').click();for(let i=0;i<90;i++){await z(300);const c=[...document.querySelectorAll('.choice:not([disabled])')].pop();if(c){c.click();continue}const n=document.querySelector('.next-bar button');if(n){n.click();continue}break}await z(500);[...document.querySelectorAll('button')].find(b=>/^(完成|Done)$/.test(b.textContent.trim()))?.click();await z(800);location.hash='review';await z(1500);document.querySelector('#panel-review .hero .q-hc-btn').click();await z(1200)})()") },
    study: { args: click(wait(2500), "js:document.querySelector('.go-card, #panel-today .q-rowcard .q-ritem.chevron')?.click()", wait(1500)) },
    // A word's sheet once it has been answered (its 學習紀錄): a 句子填空 answered wrong, then that word's sheet.
    // 今天's lower shelves (單字卡, 最近練習的字, 今日單字) after one 選中文 round answered.
    shelves: { args: click("js:(async()=>{const z=ms=>new Promise(r=>setTimeout(r,ms));await z(2500);[...document.querySelectorAll('.mode-row, .mode-card')].find(e=>/選中文|Meaning/.test(e.textContent)).click();await z(400);document.querySelector('.mode-go').click();for(let i=0;i<90;i++){await z(300);const c=document.querySelector('.choice:not([disabled])');if(c){c.click();continue}const n=document.querySelector('.next-bar button');if(n){n.click();continue}break}await z(500);[...document.querySelectorAll('button')].find(b=>/^(完成|Done)$/.test(b.textContent.trim()))?.click();await z(1200);document.querySelector('.deck-rail,.recent-rail')?.closest('section')?.scrollIntoView();await z(800)})()") },
    'word-record': { args: click("js:(async()=>{const z=ms=>new Promise(r=>setTimeout(r,ms));await z(2500);[...document.querySelectorAll('.mode-row, .mode-card')].find(e=>/句子填空|Sentences/.test(e.textContent)).click();await z(400);document.querySelector('.mode-go').click();await z(1500);[...document.querySelectorAll('.choice')][1].click();await z(800);location.hash='word='+document.querySelector('.choice.right .choice-text').textContent;await z(1500);[...document.querySelectorAll('dialog[open]')].pop().querySelector('.word-body').lastElementChild.scrollIntoView();await z(600)})()") }
  },
  beats: {
    default: ['tabs'],
    // (What tools/layout-check.mjs looks at beside every tab: the sheets that matter.)
    check: ['studio', 'now-playing'],
    // 首頁 playing (the player card, its part lit), and further down. (Each also runs on the
    // home before Orbit's own look, 2026-11-03, for --before: its first ▶ and its mini bar.)
    'home-playing': { args: click("js:(document.querySelector('.bt-play')||[...document.querySelectorAll('button')].find(b=>b.offsetParent&&/play|播放/i.test(b.getAttribute('aria-label')||''))).click()", wait(12000)) },
    'home-lower': { args: click(wait(2500), "js:scrollTo(0, innerHeight * 0.85)", wait(1200)) },
    jam: { hash: 'jam', args: click(wait(4000)) },
    studio: { hash: 'studio', args: click(wait(3000)) },
    make: { hash: 'make', args: click(wait(3000)) },
    'make-beat': { hash: 'make', args: click(BEAT_TAKE) },
    // Now Playing, opened from the home's card (the mini bar steps aside while the card shows).
    'now-playing': { args: click("js:(document.querySelector('.bt-play')||[...document.querySelectorAll('button')].find(b=>b.offsetParent&&/play|播放/i.test(b.getAttribute('aria-label')||''))).click()", wait(8000), "js:(document.querySelector('.bt-head')||document.querySelector('.mp-main')).click()", wait(2000)) },
    // 資料庫 with songs kept: 做歌's 做 6 首歌 on the built-in band, every one ♡'d, then 資料庫
    // (library-songs: its 歌曲 opened; on a wide page, beside the rows).
    'library-kept': { args: click(KEEP_SIX, "js:document.getElementById('tab-library').click()", wait(2500)) },
    'library-songs': { args: click(KEEP_SIX, "js:document.getElementById('tab-library').click()", wait(2000), "js:[...document.querySelectorAll('#panel-library .q-cell')].find(c=>/歌曲|Songs/.test(c.textContent)).click()", wait(1500)) },
    // The rhythm game mid-play (autoplay, no fps text).
    game: { hash: 'create', args: ['--store', 'orbit-beats-game-auto=shot', ...click(card('Rhythm game|節奏遊戲'), wait(2000), "js:[...document.querySelectorAll('.gm-list > *')].find(e=>e.offsetParent).click()", wait(2500), "js:document.querySelectorAll('.gm-level')[2].click()", wait(14000))] }
  },
  law: {
    default: ['tabs'],
    // (What tools/layout-check.mjs looks at beside every tab: the sheets that matter.)
    check: ['article', 'ruling', 'bill-diff', 'card'],
    // 我的 with what a person follows (`--account follows`: two bills, two 立委, a law), and a 立委 and a bill tapped there: each a sheet over 我的.
    mine: { hash: 'tab=mine', args: click(wait(5000)) },
    'mine-person': { hash: 'tab=mine', args: click(wait(5000), '#mine-people .lw-track-head', wait(2500)) },
    'mine-bill': { hash: 'tab=mine', args: click(wait(5000), '#panel-mine a[href^="#item="]', wait(2500)) },
    // 首頁's 為你推薦 (the covers the kit's picks engine ranks), scrolled into view.
    foryou: { args: click(wait(3000), "js:[...document.querySelectorAll('.lw-covers')].pop()?.scrollIntoView({block:'center'})", wait(1200)) },
    // 首頁 one scroll down; after a search and a question (最近找過); with a search typed in its field.
    lower: { args: click(wait(6000), 'js:scrollTo(0, innerHeight * 0.8)', wait(800)) },
    recent: { args: click(wait(4000), "js:(i=>{i.value='勞基法 加班費';i.form.requestSubmit()})(document.querySelector('.nv-find-input'))", wait(2500), 'js:history.back()', wait(2500), "js:(i=>{i.value='房東不還押金怎麼辦';[...document.querySelectorAll('.nv-way')].pop().click()})(document.querySelector('.nv-find-input'))", wait(1500), 'js:history.back()', wait(2500)) },
    typed: { args: click(wait(4000), "js:(i=>{i.focus();i.value='房東不還押金'})(document.querySelector('.nv-find-input'))", wait(500)) },
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
    // 預算: the budget in 立法院 now; further down 追加預算 and 第二預備金 (a stuck one at 協商, reserve
    // reports deemed reviewed); a stuck budget's page (113年度追加預算) and a reserve report's.
    budget: { hash: 'tab=bills&f=budget', args: click(wait(3000)) },
    'budget-lower': { hash: 'tab=bills&f=budget', args: click(wait(3000), "js:[...document.querySelectorAll('.lw-sec h2')].find(h=>/追加預算|Supplementary/.test(h.textContent))?.scrollIntoView({block:'start'})", wait(800)) },
    'budget-stuck': { hash: 'tab=bills&f=budget&budget=113%E8%BF%BD%E5%8A%A0', args: click(wait(3500)) },
    'budget-reserve': { hash: 'tab=bills&f=budget&budget=112%E9%A0%90%E5%82%99%E9%87%91', args: click(wait(3500)) },
    // 議程: a day's sittings, live from the proxy's /law-live.
    agenda: { hash: 'tab=bills&f=agenda', args: click(wait(2500)) },
    'people-party': { hash: 'tab=bills&f=people', args: click(wait(2500), '[data-by=party]', wait(800)) },
    independent: { hash: 'who=837', args: click(wait(4000), "js:document.querySelector('.lw-person-line')?.scrollIntoView({block:'center'})", wait(600)) }
  },
  securities: {
    default: ['tabs'],
    // (What tools/layout-check.mjs looks at beside every tab: the sheets that matter.)
    check: ['stock', 'ticket', 'more'],
    // 台股 › 上市, the list; 台積電's page (candles, 6 months), its order ticket; the tool sheets.
    list: { args: click('#tab-markets', '[data-action=product][data-id=tw]', wait(3000)) },
    stock: { args: click('#tab-markets', '[data-action=product][data-id=tw]', wait(2500), "js:[...document.querySelectorAll('[data-action=open][data-symbol=\"2330.TW\"]')].find(e => e.offsetParent).click()", wait(3000), '[data-action=chart-style][data-v=candle]', '[data-action=range][data-range="6mo"]', wait(4000)) },
    ticket: { args: click('#tab-markets', '[data-action=product][data-id=tw]', wait(2500), "js:[...document.querySelectorAll('[data-action=open][data-symbol=\"2330.TW\"]')].find(e => e.offsetParent).click()", wait(3000), '[data-action=trade][data-side=buy]', wait(1500)) },
    // 持股's 更多 card (組成, 配息, 定期定額, 提醒, 掛單中 with its count), scrolled into view;
    // --account orders has one open order (a BTC sell at 200,000, placed in the preview).
    more: { args: click('#tab-portfolio', wait(2500), "js:document.querySelector('.pf-more')?.scrollIntoView({ block: 'center' })", wait(1200)) },
    alloc: { args: click('#tab-portfolio', '[data-action=tool][data-tool=alloc]', wait(1200)) },
    rates: { args: click('#tab-fx', '[data-action=tool][data-tool=rates]', wait(1500)) },
    td: { args: click('#tab-fx', '[data-action=tool][data-tool=td]', wait(1200)) },
    access: { args: click('#tab-fx', '[data-action=tool][data-tool=access]', wait(1200)) },
    truth: { args: click('#tab-fx', '[data-action=tool][data-tool=truth]', wait(1200)) },
    // 開戶與交易資格 › 槓反期貨 ETF 檢核表, scrolled to the end: its pinned 簽署檢核表 over the sheet's bottom edge.
    'li-check': { args: click('#tab-fx', '[data-action=tool][data-tool=access]', wait(1200), '[data-action=access-key][data-key=liFutures]', wait(1200), "js:document.querySelector('dialog[open]')?.scrollBy(0, 400)", wait(800)) },
    // (Wide screens show 統計分析 beside the activity: no button of its own there.)
    // 首頁 further down (with --account demo: what's held and starred, then the markets).
    'home-lower': { args: click(wait(3000), "js:scrollTo(0, innerHeight * 0.85)", wait(1200)) },
    // 紀錄's 交易明細 (days of records) and 委託 (open orders, then past ones; --account orders has one open).
    activity: { args: click('#tab-history', wait(2500)) },
    orders: { args: click('#tab-history', "js:document.querySelector('[data-action=hview][data-view=orders]')?.click()", wait(2500)) },
    stats: { args: click('#tab-history', "js:document.querySelector('[data-action=hview][data-view=stats]')?.click()", wait(2500)) }
  },
  admin: { default: ['overview', 'accounts', 'money', 'health'], overview: { hash: 'overview' }, accounts: { hash: 'accounts' }, money: { hash: 'money' }, health: { hash: 'health' }, dev: { hash: 'dev' }, account: { hash: 'accounts', args: click(wait(1500), card('beedc1a9'), wait(1500), "js:[...document.querySelectorAll('[data-act]')].find(b=>/優先/.test(b.textContent))?.click()", wait(800)) } }
};
