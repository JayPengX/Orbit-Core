// The Quadra Pass sheet, the same in every app (accountSheet in quadra.mjs
// opens it; loaded the first time it's opened). Five tabs:
//   Pass   this account: the balance and statement, devices, notices, security
//   外觀   an avatar and a frame, free for everyone
//   真相   how Quadra's money moves and how the house earns, in real numbers
//          and this account's own record (truth.mjs)
//   App    every app, Quadra's and Orbit's, when it was last used, a way in
//   說明   every app's guide (help.mjs)
import { APPS, AVATARS, FRAMES, VIP, money, vipStatus, vipName, worthOf, WEALTH_RANKS, OVERDRAFT_RATE, ECONOMY, settingPatch, passAccount, appIcon, el as node } from '#kit/quadra.mjs';
import { PLAY, STOCK, houseKeep, roundTrip, record, overdraftYear, vipShare } from './truth.mjs';
import { LOAN, RELIEF, PAY_WEEK, schedule, totalApr, debtOf } from './loan.mjs';
import { HELP_ORDER, helpFor } from './help.mjs';
import { sheet } from './ui.mjs';

export const STRINGS = {
  zh: {
    passBalance: 'Quadra 餘額',
    monthIn: '本月收入',
    monthOut: '本月支出',
    passSince: '{date} 開戶 · 第 {n} 天',
    passDetails: '帳戶明細、通知與其他設定',
    looksTitle: '頭像與頭像框',
    lookOn: '戴著',
    avatarsTitle: '頭像',
    framesTitle: '頭像框',
    looksSub: '全部免費。戴上後，每個 Quadra App 的帳戶按鈕都看得到。',
    failed: '沒有成功，請再試一次',
    devicesTitle: '裝置與安全',
    addDevice: '新增裝置（取得裝置代碼）',
    deviceCode: '裝置代碼',
    deviceCodeHow: '在另一台裝置輸入這組代碼登入，10 分鐘內有效、只能用一次。',
    signOutOthers: '登出其他所有裝置',
    signOutOthersAsk: '登出其他所有裝置？',
    signOutOthersBody: '除了這台，所有裝置都會登出。',
    signOutOthersOk: '全部登出',
    signOutOthersDone: '其他裝置都已登出',
    rotate: '更換通行碼',
    rotateAsk: '換一組新的通行碼？',
    rotateBody: '舊通行碼立即失效，其他裝置會登出。新通行碼只顯示一次。',
    rotateOk: '換新通行碼',
    moreSettings: '通知、帳戶明細和其他設定',
    devicesSub: '通行碼只在建立或更換時顯示一次；裝置上只有可以撤銷的登入。',
    truthTitle: 'Quadra 的真相',
    truthLead: '這裡用真實的數字，和你自己的紀錄，說明錢從哪裡來、往哪裡去，以及莊家和券商怎麼從你身上賺錢。知道了，才是自己在做決定。',
    sidesTitle: '錢從哪裡來',
    sideGod: '系統發的',
    sideGodSub: '開戶金 {start} · 薪水 {pay} · 等級獎勵 {rank} · 其他 {other}',
    sideQuadra: '和 Quadra 的輸贏',
    sideQuadraSub: 'Play 稅前輸贏，扣利息和費用 {fees}',
    sideGov: '政府',
    sideGovSub: '繳稅 {paid} · 補助 {got}',
    sideYou: '你自己的成績',
    sideYouSub: '投資的漲跌、省下的',
    sideWorth: '你現在的身價',
    sideAtStake: '含投注中 {v}',
    sidesSub: '你的錢只有四方：系統發的（開戶金、每週固定 {pay} 薪水、財富等級獎勵），和 Quadra 的輸贏（可正可負），政府（收稅、發補助），和你自己的成績。',
    govTitle: '政府',
    govSub: '政府也在你的錢裡：中獎、交易、領股利都要繳稅，真的撐不下去時發急難紓困。',
    govPaid: '繳給政府',
    govGot: '政府給你',
    govNet: '淨額',
    gov_sports: '運彩中獎所得稅',
    govSub_sports: '每張彩金超過 {free} 扣 {tax}',
    gov_lottery: '彩券中獎稅',
    govSub_lottery: '每注超過 {free} 扣 {tax} 所得稅與 0.4% 印花稅',
    gov_trade: '證券交易稅',
    govSub_trade: '賣出才收：股票 0.3%、ETF 0.1%，海外市場的交易稅也在這',
    gov_withheld: '股利與利息扣繳',
    govSub_withheld: '美股股利預扣 30% 等，外國政府收的也算',
    gov_nhi: '二代健保補充保費',
    govSub_nhi: '單筆股利或利息達 NT$20,000 扣 2.11%',
    gov_relief: '急難紓困',
    govSub_relief: '身價低於 {under} 才能申請，一次 {amount}，每 {weeks} 週一次、一年最多 {year} 次',
    govFoot: '上面「和 Quadra 的輸贏」和「你自己的成績」都是稅前的數字，稅單獨算在政府這一方。Play 和 Securities 同步後才會更新。',
    edgeTitle: '莊家優勢',
    edgeSingle: '單場',
    edgeLegs: '{n} 關串關',
    edgeSingleSub: '賠率背後的機率加起來 {cut} 倍',
    yourBets: '你的投注回收率',
    yourBetsSub: '投注 {staked}，拿回 {won}',
    edgeFoot: '串關關數越多，莊家留得越多：抽成每關相乘。每張彩金超過 {free} 還要扣 {tax} 所得稅。跟台灣運彩一樣，下注後不能取消、不能提前兌現，也沒有加成或免費投注。',
    edgeSub: '每個賠率裡都藏著抽成：機率加起來超過 100%，多出來的就是莊家的。下面是每下注 NT$100，長期平均會被留下多少。',
    lotteryTitle: '彩券和刮刮樂',
    lotteryDraw: '電腦彩券（威力彩、大樂透、539…）',
    lotteryDrawSub: '一半拿去當獎金，另一半是彩券的收入和公益金',
    scratchAt: '{price} 刮刮樂',
    scratchKeeps: '每張平均留下 {v}',
    yourTickets: '你的彩券回收率',
    yourTicketsSub: '買了 {paid}，中了 {won}',
    lotteryFoot: '刮刮樂最常開出的是「中回本」（獎金等於票價）和只差一個的牌面，讓你覺得快中了、再買一張；越貴的卡回收率越高，是要讓你買貴的。',
    lotterySub: '每 NT$100 長期平均拿回多少。',
    freeTitle: 'VIP 回饋',
    vipSub: '投注 {min} 起；莊家每留下 NT$100，只還你 {per}',
    yourVip: '你本月的 VIP',
    yourVipSub: '本月投注 {stakes}，下個月回饋 {back}',
    freeFoot: 'VIP 每月歸零，月底差一點升級時，你會想多下一點。',
    freeSub: 'Play 唯一還會還你的錢：每月照投注量退一點。免費投注、加成、提前兌現和 Quadra Plus 都已取消，跟台灣運彩一樣。',
    stockTitle: '交易成本',
    tripCost: 'NT$100,000 台股買進再賣出',
    tripCostSub: '手續費 {fee} + 證交稅 {tax}，一來一回 {share}',
    tripDay: '同一天買進賣出（當沖）',
    tripDaySub: '證交稅減半為 {tax}，一來一回仍要 {share}；天天當沖，成本很快就比賺的多',
    tripMonth: '每週換股一次，一年的成本',
    tripMonthSub: '同樣 NT$100,000；不交易就是零',
    marginRate: '融資年利率',
    marginRateSub: '借錢投資，賺的時候放大，虧的時候也放大',
    overdraftRow: '透支一年的利息',
    overdraftSub: '每月 {month}，複利；2 天內沒補足再扣 {penalty} 違約金並賣出持股',
    yourOd: '你付過的透支利息',
    stockFoot: '頻繁交易的人通常輸給什麼都不做的人：成本每次都扣，報酬卻不一定。定期定額、長期持有，成本最低。',
    stockSub: '券商不管你賺賠，每一筆交易都收錢。',
    tricksTitle: '讓你一直玩的設計',
    tricksSub: '這些手法在真實的博弈、券商和訂閱服務都看得到，Quadra 也用了。',
    ranksTitle: '財富等級',
    ranksSub: '身價（錢包加上 Securities 的持股，扣掉信貸）第一次到達一個等級，系統送一次等級獎勵。開戶金 {start} 是起步，到 {next} 是下一級。',
    rankNext: '還差 {v} 到「{rank}」',
    rankPaid: '已送 {v}',
    rankCredited: '已達成，舊等級獎勵抵用',
    usedToday: '今天用過',
    usedDaysAgo: '{n} 天前用過',
    statusStock: '現金 {cash} · 持股 {held}',
    statusStakes: '本月投注 {v}',
    neverUsed: '還沒用過',
    guide: '說明',
    open: '打開',
    passGuide: 'Quadra Pass 說明',
    frame_bronze: '青銅',
    frame_silver: '白銀',
    frame_jade: '翡翠',
    frame_gold: '黃金',
    frame_neon: '霓虹',
    frame_aurora: '極光',
    frame_legend: '傳奇',
    frame_mythic: '神話',
    frame_sakura: '櫻花',
    frame_ocean: '深海',
    frame_ember: '餘燼',
    frame_mint: '薄荷',
    frame_sapphire: '藍寶石',
    frame_ruby: '紅寶石',
    frame_prism: '稜鏡',
    frame_celestial: '星穹',
    loanTitle: '信貸',
    loanSub: '缺錢時可以借，但借錢有成本：開辦費、利息，晚還還有違約金。',
    loanFee: '開辦費',
    loanFeeSub: '借多少都先收這筆',
    loanRate: '年利率',
    loanRateSub: '第一次 {start}；準時還款越久越低，最低 {best}',
    loanCost: '借 {amount}、{weeks} 週還完',
    loanCostSub: '每週還 {each}，多付右邊這些；總費用年百分率 {apr}',
    loanEarly: '提前清償',
    loanEarlySub: '{weeks} 週內還清，剩下的本金再收 {fee}',
    loanLate: '遲繳',
    loanLateSub: '連續 {misses} 週沒還就違約：薪水扣 {garnish}，{ban} 週內不能再借',
    loanCap: '最多能借',
    loanCapSub: '每週還款不能超過薪水 {pay} 的 {share}',
    yourLoan: '你還欠',
    loanFoot: '「每週只要」聽起來很少，乘上週數才是真正的價錢。',
    trick_installment: '「每週只要」',
    trickHow_installment: '信貸先講每週還多少，不先講總共多付多少；開辦費和利息加起來，看「總費用年百分率」才是真正的成本。',
    frame_pearl: '珍珠',
    frame_matcha: '抹茶',
    frame_milktea: '奶茶',
    frame_sunset: '夕陽',
    frame_midnight: '午夜',
    frame_forest: '森林',
    frame_candy: '糖果',
    frame_lava: '熔岩',
    frame_skylantern: '天燈',
    trick_vip: 'VIP 等級',
    trickHow_vip: '每月歸零的等級，讓你在月底為了升級多下注；回饋只是抽成的一小部分。',
    trick_nearmiss: '差一點就中',
    trickHow_nearmiss: '刮刮樂的牌面常有兩個一樣、只差一個就中的組合，真的刮刮樂也這樣排，讓你覺得運氣快來了。',
    trick_notify: '通知與連續天數',
    trickHow_notify: '每週發薪通知、連續紀錄，都是要你天天打開 App。Orbit Words 的單字連續天數也是，只是這次是為了讓你學會。',
    helpTitle: '說明',
    close: '關閉',
    openApp: '打開 {app}',
    avatarWorn: '頭像已換上',
    avatarOff: '已拿下頭像',
    frameWorn: '頭像框已換上',
    frameOff: '已拿下頭像框',
    tab_pass: 'Pass',
    tab_looks: '外觀',
    tab_truth: '真相',
    tab_apps: 'App',
    tab_help: '說明',
    here: '這裡',
    appsQuadraSub: '用錢的 App，共用一個 Quadra 餘額。',
    appsOrbitSub: '每天用得到的小工具：不用錢，用同一個 Quadra Pass。'
  },
  en: {
    passBalance: 'Quadra balance',
    monthIn: 'In this month',
    monthOut: 'Out this month',
    passSince: 'Opened {date} · day {n}',
    passDetails: 'Statement, notices and more settings',
    looksTitle: 'Avatar and frame',
    lookOn: 'Wearing',
    avatarsTitle: 'Avatars',
    framesTitle: 'Frames',
    looksSub: 'All free. Worn on your account button in every Quadra app.',
    failed: 'That didn’t work; please try again',
    devicesTitle: 'Devices and security',
    addDevice: 'Add a device (get a device code)',
    deviceCode: 'Device code',
    deviceCodeHow: 'Enter it on the other device to sign in: 10 minutes, once.',
    signOutOthers: 'Sign out every other device',
    signOutOthersAsk: 'Sign out every other device?',
    signOutOthersBody: 'Every device but this one is signed out.',
    signOutOthersOk: 'Sign them out',
    signOutOthersDone: 'Every other device is signed out',
    rotate: 'Change my pass',
    rotateAsk: 'Get a new pass?',
    rotateBody: 'The old pass stops working and other devices sign out. The new one is shown once.',
    rotateOk: 'Get a new pass',
    moreSettings: 'Notices, statement and other settings',
    devicesSub: 'Your pass is shown only when it’s made or changed; devices keep only sign-ins that can be revoked.',
    truthTitle: 'The truth about Quadra',
    truthLead: 'Real numbers and your own record: where your money comes from and goes, and how the house and the broker earn from you. Knowing it is how your choices become your own.',
    sidesTitle: 'Where your money comes from',
    sideGod: 'The system gave',
    sideGodSub: 'Opening {start} · pay {pay} · level rewards {rank} · other {other}',
    sideQuadra: 'You vs Quadra',
    sideQuadraSub: 'Play won or lost before tax, less interest and fees {fees}',
    sideGov: 'The government',
    sideGovSub: 'Taxes {paid} · help {got}',
    sideYou: 'Your own result',
    sideYouSub: 'Markets up and down, money saved',
    sideWorth: 'What you’re worth now',
    sideAtStake: 'incl. {v} at stake',
    sidesSub: 'Your money has four sides: what the system gave (the opening money, a fixed {pay} pay each week, wealth level rewards), you against Quadra (either way), the government (taxes and help), and your own result.',
    govTitle: 'The government',
    govSub: 'The government is in your money too: winnings, trades and dividends are taxed, and emergency relief is there when you really can’t get by.',
    govPaid: 'Paid to it',
    govGot: 'Given to you',
    govNet: 'Net',
    gov_sports: 'Sports lottery income tax',
    govSub_sports: '{tax} off each slip paying over {free}',
    gov_lottery: 'Lottery prize tax',
    govSub_lottery: '{tax} income tax and 0.4% stamp duty on each prize over {free}',
    gov_trade: 'Securities transaction tax',
    govSub_trade: 'Only on a sale: 0.3% on shares, 0.1% on ETFs, overseas trade taxes too',
    gov_withheld: 'Dividend and interest withholding',
    govSub_withheld: 'Such as 30% on US dividends: a foreign government’s counts too',
    gov_nhi: 'NHI supplementary premium',
    govSub_nhi: '2.11% off a single dividend or interest payment of NT$20,000 or more',
    gov_relief: 'Emergency relief',
    govSub_relief: 'Only when you’re worth under {under}: {amount}, once every {weeks} weeks, {year} times a year at most',
    govFoot: '“You vs Quadra” and your own result above are before tax; the taxes are the government’s side alone. They update when Play and Securities sync.',
    edgeTitle: 'The house edge',
    edgeSingle: 'A single',
    edgeLegs: 'A {n}-pick parlay',
    edgeSingleSub: 'The chances behind the odds add up to {cut}×',
    yourBets: 'What your bets paid back',
    yourBetsSub: 'Staked {staked}, back {won}',
    edgeFoot: 'The more picks on a parlay, the more the house keeps: the cut multiplies with every pick. A slip paying over {free} loses {tax} income tax. As at Taiwan Sports Lottery, a bet can’t be cancelled or cashed out, and there are no boosts or free bets.',
    edgeSub: 'Every price hides a cut: the chances behind the odds add up to more than 100%, and the extra is the house’s. Here’s what it keeps of every NT$100 staked, on average, over time.',
    lotteryTitle: 'Lottery and scratch cards',
    lotteryDraw: 'Number draws (Super Lotto, Lotto 6/49, 539…)',
    lotteryDrawSub: 'Half goes to prizes; the rest is the lottery’s takings and good causes',
    scratchAt: 'A {price} scratch card',
    scratchKeeps: 'Keeps {v} of each card on average',
    yourTickets: 'What your tickets paid back',
    yourTicketsSub: 'Spent {paid}, won {won}',
    lotteryFoot: 'The commonest scratch card wins are “your money back” (a prize the size of the price) and faces one short of a win, so another card feels due; dearer cards pay back more, to sell you the dearer ones.',
    lotterySub: 'What comes back of every NT$100, on average, over time.',
    freeTitle: 'VIP cashback',
    vipSub: 'From {min} staked; for every NT$100 the house keeps, {per} comes back',
    yourVip: 'Your VIP this month',
    yourVipSub: 'Staked {stakes} this month: {back} back next month',
    freeFoot: 'VIP tiers start again every month, so just short of the next one at the month’s end, you’ll want to bet a little more.',
    freeSub: 'The only money Play still gives back: a little of each month’s stakes. Free bets, boosts, cash out and Quadra Plus are gone, as at Taiwan Sports Lottery.',
    stockTitle: 'Trading costs',
    tripCost: 'NT$100,000 of a Taiwan stock, bought and sold',
    tripCostSub: 'Commission {fee} + transaction tax {tax}: {share} of it there and back',
    tripDay: 'Bought and sold the same day (day trade)',
    tripDaySub: 'Half the tax, {tax}, still {share} there and back; day trades every day soon cost more than they make',
    tripMonth: 'Switching stocks every week, for a year',
    tripMonthSub: 'The same NT$100,000; not trading costs nothing',
    marginRate: 'Margin interest a year',
    marginRateSub: 'Investing borrowed money makes gains bigger, and losses too',
    overdraftRow: 'A year of overdraft interest',
    overdraftSub: '{month} a month, compounded; not covered within 2 days, a {penalty} penalty and holdings sold',
    yourOd: 'Overdraft interest you’ve paid',
    stockFoot: 'People who trade often usually do worse than people who do nothing: the costs come off every time, the returns don’t. A monthly plan held for years costs least.',
    stockSub: 'The broker is paid on every trade, whether you win or lose.',
    tricksTitle: 'Designs that keep you playing',
    tricksSub: 'Real betting sites, brokers and subscriptions use these; so does Quadra.',
    ranksTitle: 'Wealth levels',
    ranksSub: 'The first time what you’re worth (your wallet and Securities holdings, less a loan) reaches a level, the system pays its reward once. The {start} you open with is the start; {next} is the next level.',
    rankNext: '{v} more to {rank}',
    rankPaid: '{v} paid',
    rankCredited: 'Reached; old level rewards counted',
    usedToday: 'Used today',
    usedDaysAgo: 'Used {n} days ago',
    statusStock: 'Cash {cash} · holdings {held}',
    statusStakes: 'Staked this month {v}',
    neverUsed: 'Not used yet',
    guide: 'Guide',
    open: 'Open',
    passGuide: 'The Quadra Pass guide',
    frame_bronze: 'Bronze',
    frame_silver: 'Silver',
    frame_jade: 'Jade',
    frame_gold: 'Gold',
    frame_neon: 'Neon',
    frame_aurora: 'Aurora',
    frame_legend: 'Legend',
    frame_mythic: 'Mythic',
    frame_sakura: 'Sakura',
    frame_ocean: 'Ocean',
    frame_ember: 'Ember',
    frame_mint: 'Mint',
    frame_sapphire: 'Sapphire',
    frame_ruby: 'Ruby',
    frame_prism: 'Prism',
    frame_celestial: 'Celestial',
    trick_installment: '“Only so much a week”',
    loanTitle: 'Loans',
    loanSub: 'You can borrow when short, but borrowing costs: a fee, interest, and penalties when late.',
    loanFee: 'Fee',
    loanFeeSub: 'Charged on any loan, whatever its size',
    loanRate: 'Yearly rate',
    loanRateSub: '{start} the first time; lower the longer you pay on time, down to {best}',
    loanCost: 'Borrow {amount} over {weeks} weeks',
    loanCostSub: '{each} a week, and this much more in all; APR with the fee {apr}',
    loanEarly: 'Paying off early',
    loanEarlySub: 'Within {weeks} weeks, {fee} of what’s left on top',
    loanLate: 'Paying late',
    loanLateSub: '{misses} weeks missed is a default: {garnish} of your pay taken, no loans for {ban} weeks',
    loanCap: 'Most you can borrow',
    loanCapSub: 'A weekly payment can’t be more than {share} of your {pay} pay',
    yourLoan: 'You still owe',
    loanFoot: '“Only so much a week” sounds small; times the weeks is the real price.',
    trickHow_installment: 'A loan leads with the weekly payment, not the total it costs; the fee and the interest together, the APR with fees, is the real price.',
    frame_pearl: 'Pearl',
    frame_matcha: 'Matcha',
    frame_milktea: 'Milk tea',
    frame_sunset: 'Sunset',
    frame_midnight: 'Midnight',
    frame_forest: 'Forest',
    frame_candy: 'Candy',
    frame_lava: 'Lava',
    frame_skylantern: 'Sky lantern',
    trick_vip: 'VIP tiers',
    trickHow_vip: 'Tiers that start again every month make you bet more at the month’s end to reach one; the cashback is a sliver of the cut.',
    trick_nearmiss: 'Near misses',
    trickHow_nearmiss: 'Scratch card faces often show two of a kind, one short of a win, as real cards do, so luck feels close.',
    trick_notify: 'Notices and streaks',
    trickHow_notify: 'The payday notice every week and streaks are there to have you open the app every day. Orbit Words’ streak is one too, only this time it’s to help you learn.',
    helpTitle: 'Help',
    close: 'Close',
    openApp: 'Open {app}',
    avatarWorn: 'Avatar on',
    avatarOff: 'Avatar off',
    frameWorn: 'Frame on',
    frameOff: 'Frame off',
    tab_pass: 'Pass',
    tab_looks: 'Looks',
    tab_truth: 'Truth',
    tab_apps: 'Apps',
    tab_help: 'Help',
    here: 'Here',
    appsQuadraSub: 'The apps that use money, sharing one Quadra balance.',
    appsOrbitSub: 'Everyday tools: no money, the same Quadra Pass.'
  }
};
const TABS = ['pass', 'looks', 'truth', 'apps', 'help'];

// ---- Small pieces ---------------------------------------------------------------------------

const el = (tag, props = {}, children = []) =>
  node(
    tag,
    props,
    [].concat(children).filter(c => c != null && c !== false)
  );
const put = (box, ...kids) => box.replaceChildren(...kids.filter(k => k != null && k !== false));
const section = (title, content, { sub = '', action = null } = {}) => el('section', { class: 'q-section' }, [el('div', { class: 'q-section-head' }, [el('h2', { text: title }), action]), sub ? el('p', { class: 'section-sub', text: sub }) : null, content]);
const bar = (value, max, cls = '') => el('div', { class: `meter ${cls}` }, [el('i', { style: `width:${Math.min(100, max ? (value / max) * 100 : 0)}%` })]);
let toastBox = null;
function toast(text, kind = '') {
  if (!toastBox) return;
  const box = el('div', { class: `toast ${kind}`, text });
  toastBox.append(box);
  setTimeout(() => box.remove(), 2600);
}
const svgUrl = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const pct = (x, digits = 1) => `${(Math.round(x * 100 * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.0+$/, '')}%`;
const row = (label, value, sub = '', cls = '') => el('div', { class: `t-row ${cls}` }, [el('span', { class: 't-label' }, [el('strong', { text: label }), sub ? el('small', { class: 'muted', text: sub }) : null]), el('strong', { class: 'num t-value', text: value })]);
const facts = (rows, foot = '') => el('div', { class: 'q-card list facts' }, [...rows.filter(Boolean), foot ? el('p', { class: 'facts-foot', text: foot }) : null]);

// ---- The sheet ------------------------------------------------------------------------------

let open = null;
export function openPass(s, { extra = null, tab = 'pass', help = null } = {}) {
  const locale = s.lang === 'en' ? 'en' : 'zh';
  const dict = STRINGS[locale];
  const t = (key, vars = {}) => String(dict[key] ?? STRINGS.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  open?.dialog.close();
  let dialog = null;
  const body = el('div', { class: 'q-pass-body' });
  const tabs = el('div', { class: 'q-chips q-pass-tabs', role: 'tablist' });
  toastBox = el('div', { class: 'toasts q-pass-toasts', 'aria-live': 'polite' });
  // Looks chosen here, until the write that carries them comes back.
  const pending = {};
  const state = { tab: TABS.includes(tab) ? tab : 'pass', help: help || { app: s.app, topic: null }, locale, extra };
  let account = null;
  const close = () => sh.close();
  const ctx = {
    q: s,
    t,
    locale,
    get state() {
      return { wallet: s.wallet || {}, locale };
    },
    wornOf: key => (key in pending ? pending[key] : s.wallet?.settings?.[key]?.value?.id) ?? null,
    async wear(key, id) {
      pending[key] = id;
      paint();
      toast(t(id ? `${key}Worn` : `${key}Off`), 'good');
      try {
        await s.write({ wallet: settingPatch(key, id ? { id } : null) });
      } catch {
        toast(t('failed'));
      } finally {
        delete pending[key];
      }
    },
    openHelp: (app = s.app, topic = null) => show('help', { app, topic })
  };
  function show(next, helpAt = null) {
    state.tab = next;
    if (helpAt) state.help = helpAt;
    paint();
    dialog.scrollTop = 0;
  }
  function paint() {
    put(tabs, ...TABS.map(id => el('button', { class: 'q-chip', type: 'button', role: 'tab', 'aria-selected': String(state.tab === id), 'aria-pressed': String(state.tab === id), text: t(`tab_${id}`), onclick: () => show(id) })));
    account?.stop();
    account = null;
    if (state.tab === 'pass') {
      account = passAccount(s, { extra: state.extra, close });
      return put(body, ...account.nodes);
    }
    if (state.tab === 'looks') return put(body, looksSection(ctx));
    if (state.tab === 'truth') return renderTruth(body, ctx);
    if (state.tab === 'apps') return renderApps(body, ctx);
    renderHelp(body, ctx, state.help);
  }
  const onWallet = () => dialog?.open && !Object.keys(pending).length && state.tab !== 'pass' && state.tab !== 'help' && paint();
  s.on?.('wallet', onWallet);
  paint();
  // The kit's one sheet (ui.mjs): ✕, Escape, a tap outside and a swipe all close it the same way.
  const sh = sheet({
    title: el('span', { class: 'q-pass-title' }, [el('img', { src: svgUrl(appIcon('pass')), alt: '', width: 28, height: 28 }), document.createTextNode('Quadra Pass')]),
    label: 'Quadra Pass',
    cls: 'q-pass',
    closeLabel: t('close'),
    body: [tabs, body, toastBox],
    onClose() {
      account?.stop();
      if (open?.dialog === dialog) open = null;
      // The address loses the guide it was opened on.
      if (/(?:^|[#&])help=/.test(location.hash)) {
        try {
          history.replaceState(history.state, '', `${location.pathname}${location.search}`);
        } catch {}
      }
    }
  });
  dialog = sh.el;
  open = { dialog, show };
  return dialog;
}

// ---- Help -----------------------------------------------------------------------------------

function renderHelp(box, { q, t, locale }, { app, topic }) {
  const at = HELP_ORDER.includes(app) ? app : 'pass';
  const name = a => (a === 'pass' ? 'Quadra Pass' : APPS[a]?.short || a);
  const chips = el(
    'div',
    { class: 'q-chips small' },
    HELP_ORDER.map(a => el('button', { class: 'q-chip', type: 'button', 'aria-pressed': String(at === a), text: name(a), onclick: () => renderHelp(box, { q, t, locale }, { app: a, topic: null }) }))
  );
  const cards = helpFor(at, locale).map(([id, title, paras]) => el('article', { class: `q-card pad help-card${topic === id ? ' focus' : ''}`, id: `q-help-${id}` }, [el('h3', { text: title }), ...paras.map(p => el('p', { text: p }))]));
  const go = at !== 'pass' && at !== q.app && APPS[at] ? el('button', { class: 'q-btn primary block', type: 'button', text: t('openApp', { app: APPS[at].name }), onclick: () => q.go(at) }) : null;
  put(box, chips, el('div', { class: 'help-list' }, cards), go);
  // The app's own chip in view (Transit's is far along the row at 320 px).
  setTimeout(() => { const on = chips.querySelector('[aria-pressed="true"]'); if (on) chips.scrollLeft = on.offsetLeft - (chips.clientWidth - on.offsetWidth) / 2; }, 0);
  if (topic) setTimeout(() => box.querySelector(`#q-help-${topic}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
}

// Avatars and frames, free for everyone: a tap wears one, a second tap
// takes it off.
function looksSection({ t, wornOf, wear }) {
  const avatar = wornOf('avatar');
  const frame = wornOf('frame');
  const glyph = AVATARS.find(a => a.id === avatar)?.glyph || '🙂';
  const tile = (key, item, face) => {
    const on = wornOf(key) === item.id;
    const name = key === 'frame' ? t(`frame_${item.id}`) : item.glyph;
    return el('button', { class: `av-tile${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), 'aria-label': name, onclick: () => wear(key, on ? null : item.id) }, [face, el('small', { text: on ? t('lookOn') : key === 'frame' ? name : '' })]);
  };
  const faces = {
    avatar: a => el('span', { class: 'av-glyph', 'aria-hidden': 'true', text: a.glyph }),
    frame: f => el('span', { class: `fr-preview q-framed q-frame-${f.id}${frame === f.id ? ' on' : ''}`, 'aria-hidden': 'true', text: glyph })
  };
  const grid = (key, list) => el('div', { class: 'av-grid' }, list.map(x => tile(key, x, faces[key](x))));
  return section(
    t('looksTitle'),
    el('div', { class: 'q-card pad looks' }, [el('small', { class: 'lv-h', text: t('avatarsTitle') }), grid('avatar', AVATARS), el('small', { class: 'lv-h', text: t('framesTitle') }), grid('frame', FRAMES)]),
    { sub: t('looksSub') }
  );
}

// ---- Truth ----------------------------------------------------------------------------------

function renderTruth(box, { t, state }) {
  const w = state.wallet;
  const r = record(w);
  const s = r.sides;
  const legs = [1, 2, 3, 5, 7];
  const trip = roundTrip(100_000);
  const dayTrip = roundTrip(100_000, { dayTrade: true });
  const vip = vipStatus(w);
  put(
    box,
    el('div', { class: 'truth-hero' }, [el('strong', { text: t('truthTitle') }), el('p', { text: t('truthLead') })]),
    section(
      t('sidesTitle'),
      el('div', { class: 'q-card list sides' }, [
        sideRow('🌤️', t('sideGod'), money(s.given), t('sideGodSub', { start: money(s.gave.start), pay: money(s.gave.pay), rank: money(s.gave.rank), other: money(s.gave.other) })),
        // Against Quadra, either way: green when Play has paid out more than
        // was lost there and paid in fees, red when Quadra kept more.
        sideRow('🎲', t('sideQuadra'), money(s.quadra, { sign: true }), t('sideQuadraSub', { fees: money(s.fees) }), s.quadra >= 0 ? 'up' : 'down'),
        sideRow('🏛️', t('sideGov'), money(s.gov.net, { sign: true }), t('sideGovSub', { paid: money(s.gov.paidTotal), got: money(s.gov.gotTotal) }), s.gov.net >= 0 ? 'up' : 'down'),
        sideRow('🙋', t('sideYou'), money(s.own, { sign: true }), t('sideYouSub'), s.own >= 0 ? 'up' : 'down'),
        el('div', { class: 'side-total' }, [el('span', {}, [document.createTextNode(t('sideWorth')), s.atStake > 0 ? el('small', { class: 'muted', text: t('sideAtStake', { v: money(s.atStake) }) }) : null]), el('strong', { class: 'num', text: money(s.worth) })])
      ]),
      { sub: t('sidesSub', { pay: money(ECONOMY.weekly) }) }
    ),
    section(t('govTitle'), govCard(t, s.gov), { sub: t('govSub') }),
    section(t('loanTitle'), loanCard(t, w), { sub: t('loanSub') }),
    section(
      t('edgeTitle'),
      facts(
        [
          ...legs.map(n => row(n === 1 ? t('edgeSingle') : t('edgeLegs', { n }), pct(houseKeep(n)), n === 1 ? t('edgeSingleSub', { cut: PLAY.cut }) : '')),
          r.staked > 0 ? row(t('yourBets'), r.betBack == null ? '—' : pct(r.betBack), t('yourBetsSub', { staked: money(r.staked), won: money(r.won) }), r.won >= r.staked ? 'up' : 'down') : null
        ],
        t('edgeFoot', { tax: pct(PLAY.tax, 0), free: money(PLAY.taxFree) })
      ),
      { sub: t('edgeSub') }
    ),
    section(
      t('lotteryTitle'),
      facts(
        [
          row(t('lotteryDraw'), pct(PLAY.draw, 0), t('lotteryDrawSub')),
          ...PLAY.scratch.map(([price, back]) => row(t('scratchAt', { price: money(price) }), pct(back, 0), t('scratchKeeps', { v: money(Math.round(price * (1 - back))) }))),
          r.tickets > 0 ? row(t('yourTickets'), r.ticketBack == null ? '—' : pct(r.ticketBack), t('yourTicketsSub', { paid: money(r.tickets), won: money(r.prizes) }), r.prizes >= r.tickets ? 'up' : 'down') : null
        ],
        t('lotteryFoot')
      ),
      { sub: t('lotterySub') }
    ),
    section(
      t('freeTitle'),
      facts(
        [
          ...VIP.tiers.map(tier => row(vipName(tier, state.locale), pct(tier.back), t('vipSub', { min: money(tier.min), per: money(Math.round(vipShare(tier) * 100)) }))),
          vip.tier ? row(t('yourVip'), vipName(vip.tier, state.locale), t('yourVipSub', { stakes: money(vip.stakes), back: money(vip.back) })) : null
        ],
        t('freeFoot')
      ),
      { sub: t('freeSub') }
    ),
    section(
      t('stockTitle'),
      facts(
        [
          row(t('tripCost'), money(trip.total), t('tripCostSub', { fee: money(trip.fee), tax: money(trip.tax), share: pct(trip.share, 2) })),
          row(t('tripDay'), money(dayTrip.total), t('tripDaySub', { tax: pct(STOCK.dayTradeTax, 2), share: pct(dayTrip.share, 2) })),
          row(t('tripMonth'), money(trip.total * 4 * 12), t('tripMonthSub')),
          row(t('marginRate'), pct(STOCK.loanRate), t('marginRateSub')),
          row(t('overdraftRow'), pct(overdraftYear()), t('overdraftSub', { month: pct(OVERDRAFT_RATE, 0), penalty: pct(STOCK.penalty, 0) })),
          r.od > 0 ? row(t('yourOd'), money(r.od), '', 'down') : null
        ],
        t('stockFoot')
      ),
      { sub: t('stockSub') }
    ),
    section(
      t('tricksTitle'),
      el(
        'div',
        { class: 'q-card list tricks' },
        TRICKS.map(id => el('div', { class: 'trick' }, [el('strong', { text: t(`trick_${id}`) }), el('small', { class: 'muted', text: t(`trickHow_${id}`) })]))
      ),
      { sub: t('tricksSub') }
    ),
    section(t('ranksTitle'), ranksCard(t, w, state.locale), { sub: t('ranksSub', { start: money(ECONOMY.start), next: money(WEALTH_RANKS[1].min) }) })
  );
}
const TRICKS = ['installment', 'vip', 'nearmiss', 'notify'];
const sideRow = (icon, label, value, sub, cls = '') => el('div', { class: `side-row ${cls}` }, [el('span', { class: 'side-icon', 'aria-hidden': 'true', text: icon }), el('span', { class: 'side-text' }, [el('strong', { text: label }), el('small', { class: 'muted', text: sub })]), el('strong', { class: 'num', text: value })]);

// 政府: three tiles (paid, given, net), then every tax and payment with a bar
// for its share.
const GOV_ICONS = { sports: '🏟️', lottery: '🎟️', trade: '📈', withheld: '🌐', nhi: '🏥', relief: '🆘' };
function govCard(t, g) {
  const items = [...Object.entries(g.paid).map(([k, v]) => [k, v, 'paid']), ...Object.entries(g.got).map(([k, v]) => [k, v, 'got'])];
  const most = Math.max(1, ...items.map(([, v]) => v));
  return el('div', { class: 'q-card gov' }, [
    el('div', { class: 'stat-row three gov-tiles' }, [
      el('div', { class: 'stat gov-tile down' }, [el('strong', { class: 'num', text: money(g.paidTotal) }), el('small', { text: t('govPaid') })]),
      el('div', { class: 'stat gov-tile up' }, [el('strong', { class: 'num', text: money(g.gotTotal) }), el('small', { text: t('govGot') })]),
      el('div', { class: `stat gov-tile ${g.net >= 0 ? 'up' : 'down'}` }, [el('strong', { class: 'num', text: money(g.net, { sign: true }) }), el('small', { text: t('govNet') })])
    ]),
    ...items.map(([k, v, side]) =>
      el('div', { class: `gov-row ${side}${v ? '' : ' none'}` }, [
        el('span', { class: 'side-icon', 'aria-hidden': 'true', text: GOV_ICONS[k] }),
        el('span', { class: 'gov-text' }, [el('strong', { text: t(`gov_${k}`) }), el('small', { class: 'muted', text: t(`govSub_${k}`, GOV_SUB) }), bar(v, most, side === 'got' ? 'good' : 'bad')]),
        el('strong', { class: 'num', text: v ? `${side === 'got' ? '+' : '−'}${money(v)}` : money(0) })
      ])
    ),
    el('p', { class: 'facts-foot', text: t('govFoot') })
  ]);
}

// Every number in a tax's or 紓困's line, from the rules themselves.
const GOV_SUB = { free: money(PLAY.taxFree), tax: pct(PLAY.tax, 0), under: money(RELIEF.under), amount: money(RELIEF.amount), weeks: RELIEF.everyWeeks, year: RELIEF.perYear };

// 信貸: what borrowing costs, a typical loan worked through (NT$100,000 over
// a year at the first rate), and what this account still owes.
function loanCard(t, w) {
  const amount = LOAN.base;
  const weeks = LOAN.terms[0];
  const plan = schedule(amount, LOAN.apr.start, weeks);
  const paid = plan.rows.reduce((sum, r) => sum + r.amount, 0);
  const owed = debtOf(w);
  return facts(
    [
      row(t('loanFee'), money(LOAN.fee), t('loanFeeSub')),
      row(t('loanRate'), `${pct(LOAN.apr.best, 0)}–${pct(LOAN.apr.max, 0)}`, t('loanRateSub', { start: pct(LOAN.apr.start, 0), best: pct(LOAN.apr.best, 0) })),
      row(t('loanCost', { amount: money(amount), weeks }), money(paid - amount + LOAN.fee), t('loanCostSub', { each: money(plan.installment), extra: money(paid - amount + LOAN.fee), apr: pct(totalApr(amount, LOAN.apr.start, weeks), 1) })),
      row(t('loanEarly'), pct(LOAN.earlyFee, 0), t('loanEarlySub', { weeks: LOAN.earlyWeeks, fee: pct(LOAN.earlyFee, 0) })),
      row(t('loanLate'), `${LOAN.missesToDefault}×`, t('loanLateSub', { misses: LOAN.missesToDefault, garnish: `${Math.round(LOAN.garnish * 100)}%`, ban: LOAN.banWeeks })),
      row(t('loanCap'), money(LOAN.cap), t('loanCapSub', { share: pct(LOAN.shareOfPay, 0), pay: money(PAY_WEEK) })),
      owed > 0 ? row(t('yourLoan'), money(owed), '', 'down') : null
    ],
    t('loanFoot')
  );
}

// 財富等級: every level and its one-time reward, and where the account is.
function ranksCard(t, w, locale) {
  const worth = worthOf(w);
  let at = 0;
  while (at + 1 < WEALTH_RANKS.length && worth >= WEALTH_RANKS[at + 1].min) at++;
  const next = WEALTH_RANKS[at + 1];
  // What a level paid (less if the old levels' rewards counted towards it); undefined: not yet.
  const paidOf = id => (w?.entries || []).find(e => e.app === 'eco' && e.id === `eco:rank:${id}`)?.amount;
  const paid = id => paidOf(id) != null;
  return el('div', { class: 'q-card list ranks' }, [
    next ? el('div', { class: 'rank-progress' }, [el('small', { class: 'muted', text: t('rankNext', { v: money(next.min - worth), rank: next[locale === 'en' ? 'en' : 'zh'] }) }), bar(worth - WEALTH_RANKS[at].min, next.min - WEALTH_RANKS[at].min, 'accent')]) : null,
    ...WEALTH_RANKS.map((rk, i) =>
      el('div', { class: `rank-row${i === at ? ' current' : i < at ? ' passed' : ''}` }, [
        el('span', { class: 'rank-icon', text: rk.icon }),
        el('span', { class: 'rank-name' }, [el('strong', { text: rk[locale === 'en' ? 'en' : 'zh'] }), el('small', { class: 'num muted', text: rk.min ? money(rk.min) : '—' })]),
        rk.reward ? el('span', { class: `rank-reward num${paid(rk.id) ? ' paid' : ''}`, text: paid(rk.id) ? (paidOf(rk.id) > 0 ? t('rankPaid', { v: money(paidOf(rk.id)) }) : t('rankCredited')) : `+${money(rk.reward)}` }) : null
      ])
    )
  ]);
}

// ---- Apps -----------------------------------------------------------------------------------

const ago = (t, then) => {
  const days = Math.floor((Date.now() - then) / 86_400_000);
  return days <= 0 ? t('usedToday') : t('usedDaysAgo', { n: days });
};
// Every app, Quadra's then Orbit's: what it's for, when it was last used,
// a line of status for the money apps, its guide and a way in.
function renderApps(box, { q, t, locale, state, openHelp }) {
  const w = state.wallet;
  const status = {
    stock: () => (w.snap?.stock ? t('statusStock', { cash: money(w.snap.stock.cash || 0), held: money(w.snap.stock.holdings || 0) }) : ''),
    odds: () => {
      const v = vipStatus(w);
      return [t('statusStakes', { v: money(v.stakes) }), v.tier ? vipName(v.tier, locale) : ''].filter(Boolean).join(' · ');
    }
  };
  const card = ([id, a]) => {
    const last = w.apps?.[id]?.last;
    const here = id === q.app;
    return el('div', { class: `q-card pad app-card${here ? ' here' : ''}` }, [
      el('div', { class: 'app-top' }, [el('img', { class: 'app-logo', src: svgUrl(appIcon(id)), alt: '', width: 48, height: 48 }), el('div', { class: 'app-name' }, [el('strong', { text: a.name }), el('small', { class: 'muted', text: a.role[locale === 'en' ? 'en' : 'zh'] })]), el('small', { class: 'muted app-last', text: here ? t('here') : last ? ago(t, last) : t('neverUsed') })]),
      status[id]?.() ? el('p', { class: 'app-status num', text: status[id]() }) : null,
      el('div', { class: 'two-btn' }, [el('button', { class: 'q-btn', type: 'button', text: t('guide'), onclick: () => openHelp(id) }), here ? null : el('button', { class: 'q-btn primary', type: 'button', text: t('open'), onclick: () => q.go(id) })])
    ]);
  };
  const of = family => Object.entries(APPS).filter(([, a]) => a.family === family);
  put(box, section('Quadra', el('div', { class: 'app-list' }, of('quadra').map(card)), { sub: t('appsQuadraSub') }), section('Orbit', el('div', { class: 'app-list' }, of('orbit').map(card)), { sub: t('appsOrbitSub') }), el('button', { class: 'q-btn block ghost pass-guide', type: 'button', text: t('passGuide'), onclick: () => openHelp('pass') }));
}
