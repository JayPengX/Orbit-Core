// The Quadra Pass sheet, the same in every app (accountSheet in quadra.mjs
// opens it; loaded the first time it's opened). Five tabs:
//   Pass   this account: the balance and statement, devices, notices, security
//   Plus   Quadra Plus (join, go yearly, stop renewing, what it gave back) and
//          a member's avatar and frame
//   真相   how Quadra's money moves and how the house earns, in real numbers
//          and this account's own record (truth.mjs)
//   App    every app, Quadra's and Orbit's, when it was last used, a way in
//   說明   every app's guide (help.mjs)
// It was Quadra Hub's; Hub is Orbit Words now, and only learns words.
import { APPS, FAMILIES, AVATARS, FRAMES, LOOK_STREAKS, lookOpen, plusStreak, PLUS, VIP, WELCOME, money, plusMember, plusCard, openPlus, plusPerks, plusReturns, plusTenure, freeBets, vipStatus, vipName, worthOf, WEALTH_RANKS, OVERDRAFT_RATE, ECONOMY, settingPatch, passAccount, appIcon, el as node } from '#kit/quadra.mjs';
import { PLAY, STOCK, houseKeep, boostedKeep, freeBetWorth, roundTrip, plusMath, record, overdraftYear, vipShare } from './truth.mjs';
import { HELP_ORDER, helpFor } from './help.mjs';

export const STRINGS = {
  zh: {
    passBalance: 'Quadra 餘額',
    monthIn: '本月收入',
    monthOut: '本月支出',
    passSince: '{date} 開戶 · 第 {n} 天',
    passDetails: '帳戶明細、通知與其他設定',
    plusMonth: '本月回饋',
    plusAll: '累計回饋',
    monthsN: '{n} 個月',
    plusTenure: '會員',
    plusBackNote: '回饋是免費投注的面額和串關加成多給的獎金：面額不等於你實際拿到的錢。',
    plusTitle: 'Quadra Plus',
    looksTitle: '頭像與頭像框',
    plusSub: 'Play 和 Securities 的會員方案；它怎麼替 Quadra 賺錢，「真相」算給你看。',
    plusManage: '管理',
    streakNeed: '再連續訂閱 {n} 個月就能戴上',
    lookOn: '戴著',
    lookStreak: '連續訂閱 {n} 個月',
    streakNow: '已連續訂閱 {n} 個月',
    streakSub: '連續訂閱解鎖限定頭像與頭像框；中斷一個月就從頭算。',
    looksLocked: '✦ Plus 會員專屬',
    looksLockedSub: '加入 Plus 就能自訂頭像和頭像框；會員停止時會隱藏，重新加入會回來。',
    avatarsTitle: '頭像',
    framesTitle: '頭像框',
    looksSub: '戴上後，每個 Quadra App 的帳戶按鈕都看得到。',
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
    truthLead: '這裡用真實的數字，和你自己的紀錄，說明錢從哪裡來、往哪裡去，以及莊家、券商和會員方案怎麼從你身上賺錢。知道了，才是自己在做決定。',
    sidesTitle: '錢從哪裡來',
    sideGod: '系統發的',
    sideGodSub: '開戶金 {start} · 薪水 {pay} · 等級獎勵 {rank} · 其他 {other}',
    sideQuadra: '和 Quadra 的輸贏',
    sideQuadraSub: 'Play 輸贏，扣月費和利息 {fees}',
    sideYou: '你自己的成績',
    sideYouSub: '投資的漲跌、省下的',
    sideWorth: '你現在的身價',
    sideAtStake: '含投注中 {v}',
    sidesSub: '你的錢只有三方：系統發的（開戶金、每月固定 {pay} 薪水、財富等級獎勵），和 Quadra 的輸贏（可正可負），和你自己的成績。',
    edgeTitle: '莊家優勢',
    edgeSingle: '單場',
    edgeLegs: '{n} 關串關',
    edgeSingleSub: '賠率背後的機率加起來 {cut} 倍',
    edgeBoost: '{n} 關串關加上串關加成',
    edgeBoostSub: '加成只加在獎金上，抽成卻每關相乘；Plus 會員 {plus}',
    yourBets: '你的投注回收率',
    yourBetsSub: '投注 {staked}，拿回 {won}',
    edgeFoot: '串關關數越多，莊家留得越多：所以 App 會用「加成」和「精選串關」推你多串幾關。中獎超過 {free} 還要扣 {tax} 的稅；提前兌現再扣 {keep}（Plus {plus}）。',
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
    freeTitle: '「免費」的東西',
    freeBet: '{v} 免費投注',
    freeBetSub: '平均只值這麼多（押在賠率 2.00 的單場）：贏了只拿獎金不拿本金，還要賠率 {min} 以上（串關看總賠率）',
    vipSub: '投注 {min} 起；莊家每留下 NT$100，只還你 {per}',
    yourVip: '你本月的 VIP',
    yourVipSub: '本月投注 {stakes}，下個月回饋 {back}',
    yourFree: '你收到的免費投注面額',
    yourFreeSub: '面額，不是實際價值',
    freeFoot: '免費投注 7 天內過期，逼你快點用；VIP 每月歸零，月底差一點升級時，你會想多下一點。',
    freeSub: '送你的東西都有條件，條件是為了讓你下更多注。',
    plusTruthTitle: 'Plus 為什麼存在',
    plusFee: '月費',
    plusFeeSub: '年繳每月 {yearly}，但一次付 12 個月',
    plusBets: '每週免費投注，每月實際價值',
    plusBetsSub: '面額每月 {face}；只有贏的獎金拿得回來',
    plusTrades: '手續費折扣要交易幾次才回本',
    timesN: '每月 {n} 次',
    plusTradesSub: '每次 NT$100,000 買進再賣出省 {saved}：省錢的前提是你常常交易',
    plusBoostRow: '串關加成 ×{x}，莊家少留',
    plusBoostSub: '3 關、賠率 8.00 的串關；莊家還是留下三成以上',
    yourPlus: '你付過的 Plus 月費',
    yourPlusSub: '回饋面額累計 {back}',
    plusFoot: '想想看：如果權益比月費值錢，Quadra 為什麼要賣？因為會員會比非會員多下注、多交易，多出來的抽成就是 Plus 的利潤。',
    plusTruthSub: 'Plus 的每一項權益都讓下注和交易更便宜或更大。會員下得越多、交易越多，Quadra 賺的抽成和手續費就越多，遠超過權益的成本。',
    stockTitle: '交易成本',
    tripCost: 'NT$100,000 台股買進再賣出',
    tripCostSub: '手續費 {fee} + 證交稅 {tax}，一來一回 {share}',
    tripPlus: 'Plus 會員同一筆',
    tripPlusSub: '證交稅照收，只有手續費打折',
    tripMonth: '每週換股一次，一年的成本',
    tripMonthSub: '同樣 NT$100,000；不交易就是零',
    marginRate: '融資年利率',
    marginRateSub: 'Plus {plus}：利率越低，越鼓勵你借錢投資，虧損也跟著放大',
    overdraftRow: '透支一年的利息',
    overdraftSub: '每月 {month}，複利；2 天內沒補足再扣 {penalty} 違約金並賣出持股',
    yourOd: '你付過的透支利息',
    stockFoot: '頻繁交易的人通常輸給什麼都不做的人：成本每次都扣，報酬卻不一定。定期定額、長期持有，成本最低。',
    stockSub: '券商不管你賺賠，每一筆交易都收錢。',
    tricksTitle: '讓你一直玩的設計',
    tricksSub: '這些手法在真實的博弈、券商和訂閱服務都看得到，Quadra 也用了。',
    ranksTitle: '財富等級',
    ranksSub: '身價（錢包加上 Securities 的持股）第一次到達一個等級，系統送一次等級獎勵。',
    rankNext: '還差 {v} 到「{rank}」',
    rankPaid: '已送 {v}',
    usedToday: '今天用過',
    usedDaysAgo: '{n} 天前用過',
    statusStock: '現金 {cash} · 持股 {held}',
    statusStakes: '本月投注 {v}',
    statusFree: '{n} 張免費投注',
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
    trick_trial: '免費試用會自動續訂',
    trickHow_trial: 'Plus 第一個月免費，之後每月自動扣 {fee}；很多人忘了取消。',
    trick_yearly: '年繳「省兩個月」',
    trickHow_yearly: '年繳 {year} 一次付清，取消也不退：省錢的代價是被綁住。',
    trick_leave: '取消時告訴你會失去什麼',
    trickHow_leave: '「之後沒有…」利用損失厭惡，讓你留下。',
    trick_expire: '期限',
    trickHow_expire: '免費投注 7 天就過期，讓你沒想清楚就先下注。',
    trick_minodds: '最低賠率',
    trickHow_minodds: '免費投注要求賠率 1.50 以上（串關看總賠率）：推你去押冷門、串更多關，莊家留得更多。',
    trick_boost: '串關加成',
    trickHow_boost: '「7 關 +20%」聽起來很多，但 7 關的抽成是單場的四倍以上。',
    trick_vip: 'VIP 等級',
    trickHow_vip: '每月歸零的等級，讓你在月底為了升級多下注；回饋只是抽成的一小部分。',
    trick_nearmiss: '差一點就中',
    trickHow_nearmiss: '刮刮樂的牌面常有兩個一樣、只差一個就中的組合，真的刮刮樂也這樣排，讓你覺得運氣快來了。',
    trick_notify: '通知與連續天數',
    trickHow_notify: '每週 {bet} 到帳通知、連續紀錄，都是要你天天打開 App。Orbit Words 的單字連續天數也是，只是這次是為了讓你學會。',
    rank_start: '起步',
    rank_saver: '小資族',
    rank_steady: '穩健',
    rank_comfort: '小康',
    rank_wealthy: '富裕',
    rank_rich: '有錢人',
    rank_multi: '千萬富翁',
    rank_tycoon: '億萬大亨',
    helpTitle: '說明',
    close: '關閉',
    openApp: '打開 {app}',
    avatarWorn: '頭像已換上',
    avatarOff: '已拿下頭像',
    frameWorn: '頭像框已換上',
    frameOff: '已拿下頭像框',
    tab_pass: 'Pass',
    tab_plus: 'Plus',
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
    plusMonth: 'Back this month',
    plusAll: 'Back in all',
    monthsN: '{n} months',
    plusTenure: 'Member',
    plusBackNote: 'What came back is free bets at face value and the extra parlay boost: face value isn’t money in your pocket.',
    plusTitle: 'Quadra Plus',
    looksTitle: 'Avatar and frame',
    plusSub: 'Play’s and Securities’ membership; how it earns Quadra money is worked out in Truth.',
    plusManage: 'Manage',
    streakNeed: '{n} more months in a row to wear this',
    lookOn: 'Wearing',
    lookStreak: '{n} months in a row',
    streakNow: '{n} months in a row',
    streakSub: 'Stay a member to unlock the rarest avatars and frames; a month missed starts the count again.',
    looksLocked: '✦ For Plus members',
    looksLockedSub: 'Join Plus to pick an avatar and a frame; they’re hidden when the membership stops, and back if you join again.',
    avatarsTitle: 'Avatars',
    framesTitle: 'Frames',
    looksSub: 'Worn on your account button in every Quadra app.',
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
    truthLead: 'Real numbers and your own record: where your money comes from and goes, and how the house, the broker and the membership earn from you. Knowing it is how your choices become your own.',
    sidesTitle: 'Where your money comes from',
    sideGod: 'The system gave',
    sideGodSub: 'Opening {start} · pay {pay} · level rewards {rank} · other {other}',
    sideQuadra: 'You vs Quadra',
    sideQuadraSub: 'Play won or lost, less fees {fees}',
    sideYou: 'Your own result',
    sideYouSub: 'Markets up and down, money saved',
    sideWorth: 'What you’re worth now',
    sideAtStake: 'incl. {v} at stake',
    sidesSub: 'Your money has three sides: what the system gave (the opening money, a fixed {pay} pay each month, wealth level rewards), you against Quadra (either way), and your own result.',
    edgeTitle: 'The house edge',
    edgeSingle: 'A single',
    edgeLegs: 'A {n}-pick parlay',
    edgeSingleSub: 'The chances behind the odds add up to {cut}×',
    edgeBoost: 'A {n}-pick parlay with the boost',
    edgeBoostSub: 'The boost adds to the winnings; the cut multiplies with every pick. Plus members: {plus}',
    yourBets: 'What your bets paid back',
    yourBetsSub: 'Staked {staked}, back {won}',
    edgeFoot: 'The more picks on a parlay, the more the house keeps, which is why the app pushes boosts and featured parlays. Winnings over {free} lose {tax} in tax; cash out keeps {keep} more ({plus} with Plus).',
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
    freeTitle: 'The “free” things',
    freeBet: 'A {v} free bet',
    freeBetSub: 'What it’s worth on average (on a single at 2.00): a win pays the winnings, not the stake, and the odds must be {min} or longer (a parlay’s all together)',
    vipSub: 'From {min} staked; for every NT$100 the house keeps, {per} comes back',
    yourVip: 'Your VIP this month',
    yourVipSub: 'Staked {stakes} this month: {back} back next month',
    yourFree: 'Free bets you were given',
    yourFreeSub: 'At face value, not what they’re worth',
    freeFoot: 'Free bets expire in 7 days, to hurry you; VIP tiers start again every month, so just short of the next one at the month’s end, you’ll want to bet a little more.',
    freeSub: 'Everything given away has terms, and the terms are there to make you bet more.',
    plusTruthTitle: 'Why Plus exists',
    plusFee: 'The fee',
    plusFeeSub: '{yearly} a month yearly, but twelve months paid at once',
    plusBets: 'The weekly free bets, really worth a month',
    plusBetsSub: '{face} a month at face value; only winnings come back',
    plusTrades: 'Trades for the commission discount to pay',
    timesN: '{n} a month',
    plusTradesSub: 'A NT$100,000 round trip saves {saved}: it only saves if you trade a lot',
    plusBoostRow: 'Parlay boost ×{x}: less kept by the house',
    plusBoostSub: 'A 3-pick parlay at 8.00; the house still keeps over 30%',
    yourPlus: 'Plus fees you’ve paid',
    yourPlusSub: '{back} back at face value',
    plusFoot: 'Ask yourself: if the perks were worth more than the fee, why would Quadra sell it? Because members bet and trade more than everyone else, and the extra cut is Plus’s profit.',
    plusTruthSub: 'Every Plus perk makes betting or trading cheaper or bigger. Members bet more and trade more, and the extra cuts and commissions Quadra earns are worth far more than the perks cost.',
    stockTitle: 'Trading costs',
    tripCost: 'NT$100,000 of a Taiwan stock, bought and sold',
    tripCostSub: 'Commission {fee} + transaction tax {tax}: {share} of it there and back',
    tripPlus: 'The same trade with Plus',
    tripPlusSub: 'The tax is the same; only the commission is cut',
    tripMonth: 'Switching stocks every week, for a year',
    tripMonthSub: 'The same NT$100,000; not trading costs nothing',
    marginRate: 'Margin interest a year',
    marginRateSub: 'Plus {plus}: the cheaper borrowing is, the more it invites investing with borrowed money, and losses grow with it',
    overdraftRow: 'A year of overdraft interest',
    overdraftSub: '{month} a month, compounded; not covered within 2 days, a {penalty} penalty and holdings sold',
    yourOd: 'Overdraft interest you’ve paid',
    stockFoot: 'People who trade often usually do worse than people who do nothing: the costs come off every time, the returns don’t. A monthly plan held for years costs least.',
    stockSub: 'The broker is paid on every trade, whether you win or lose.',
    tricksTitle: 'Designs that keep you playing',
    tricksSub: 'Real betting sites, brokers and subscriptions use these; so does Quadra.',
    ranksTitle: 'Wealth levels',
    ranksSub: 'The first time what you’re worth (your wallet and Securities holdings) reaches a level, the system pays its reward once.',
    rankNext: '{v} more to {rank}',
    rankPaid: '{v} paid',
    usedToday: 'Used today',
    usedDaysAgo: 'Used {n} days ago',
    statusStock: 'Cash {cash} · holdings {held}',
    statusStakes: 'Staked this month {v}',
    statusFree: '{n} free bets',
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
    trick_trial: 'A free trial that renews itself',
    trickHow_trial: 'Plus’s first month is free, then {fee} a month comes off by itself; plenty of people forget to cancel.',
    trick_yearly: 'Yearly, “two months free”',
    trickHow_yearly: '{year} paid at once and never refunded: the saving is the price of being tied in.',
    trick_leave: 'Telling you what you’ll lose',
    trickHow_leave: '“You lose…” on the way out uses loss aversion to keep you.',
    trick_expire: 'Deadlines',
    trickHow_expire: 'Free bets expire in 7 days, so you bet before you’ve thought it through.',
    trick_minodds: 'Minimum odds',
    trickHow_minodds: 'Free bets need odds of 1.50 or longer (a parlay’s all together): long shots and longer parlays, where the house keeps more.',
    trick_boost: 'The parlay boost',
    trickHow_boost: '“+20% on 7 picks” sounds like a lot; the cut on 7 picks is over four times a single’s.',
    trick_vip: 'VIP tiers',
    trickHow_vip: 'Tiers that start again every month make you bet more at the month’s end to reach one; the cashback is a sliver of the cut.',
    trick_nearmiss: 'Near misses',
    trickHow_nearmiss: 'Scratch card faces often show two of a kind, one short of a win, as real cards do, so luck feels close.',
    trick_notify: 'Notices and streaks',
    trickHow_notify: 'The {bet} “it’s here” notice every week and streaks are there to have you open the app every day. Orbit Words’ streak is one too, only this time it’s to help you learn.',
    rank_start: 'Starter',
    rank_saver: 'Saver',
    rank_steady: 'Steady',
    rank_comfort: 'Comfortable',
    rank_wealthy: 'Wealthy',
    rank_rich: 'Rich',
    rank_multi: 'Multi-millionaire',
    rank_tycoon: 'Tycoon',
    helpTitle: 'Help',
    close: 'Close',
    openApp: 'Open {app}',
    avatarWorn: 'Avatar on',
    avatarOff: 'Avatar off',
    frameWorn: 'Frame on',
    frameOff: 'Frame off',
    tab_pass: 'Pass',
    tab_plus: 'Plus',
    tab_truth: 'Truth',
    tab_apps: 'Apps',
    tab_help: 'Help',
    here: 'Here',
    appsQuadraSub: 'The apps that use money, sharing one Quadra balance.',
    appsOrbitSub: 'Everyday tools: no money, the same Quadra Pass.'
  }
};
const TABS = ['pass', 'plus', 'truth', 'apps', 'help'];

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
  const dialog = el('dialog', { class: 'q-sheet q-pass', 'aria-label': 'Quadra Pass' });
  const body = el('div', { class: 'q-pass-body' });
  const tabs = el('div', { class: 'q-chips q-pass-tabs', role: 'tablist' });
  toastBox = el('div', { class: 'toasts q-pass-toasts', 'aria-live': 'polite' });
  // Looks chosen here, until the write that carries them comes back.
  const pending = {};
  const state = { tab: TABS.includes(tab) ? tab : 'pass', help: help || { app: s.app, topic: null }, locale, extra };
  let account = null;
  const close = () => dialog.close();
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
    if (state.tab === 'plus') return put(body, plusSection(ctx), looksSection(ctx));
    if (state.tab === 'truth') return renderTruth(body, ctx);
    if (state.tab === 'apps') return renderApps(body, ctx);
    renderHelp(body, ctx, state.help);
  }
  dialog.append(el('div', { class: 'q-sheet-head' }, [el('div', { class: 'q-pass-title' }, [el('img', { src: svgUrl(appIcon('pass')), alt: '', width: 28, height: 28 }), el('h2', { text: 'Quadra Pass' })]), el('button', { class: 'q-close', type: 'button', 'aria-label': t('close'), text: '×', onclick: close })]), tabs, body, toastBox);
  const onWallet = () => dialog.open && !Object.keys(pending).length && state.tab !== 'pass' && state.tab !== 'help' && paint();
  s.on?.('wallet', onWallet);
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    account?.stop();
    dialog.remove();
    if (open?.dialog === dialog) open = null;
    // The address loses the guide it was opened on.
    if (/(?:^|[#&])help=/.test(location.hash)) {
      try {
        history.replaceState(history.state, '', `${location.pathname}${location.search}`);
      } catch {}
    }
  });
  dialog.addEventListener('click', e => e.target === dialog && close());
  paint();
  dialog.showModal();
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
  if (topic) setTimeout(() => box.querySelector(`#q-help-${topic}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
}

const plusSection = ({ q, t, locale }) => plusSectionOf(q, t, locale, q.wallet || {}, plusMember(q.wallet));
function plusSectionOf(q, t, locale, w, member) {
  const perks = plusPerks(locale);
  const group = (app, title) => el('div', { class: 'perk-group' }, [el('small', { class: 'perk-h', text: title }), ...perks.filter(p => p[0] === app).map(([, a, b]) => el('div', { class: 'perk' }, [el('span', { class: 'perk-mark', 'aria-hidden': 'true', text: '✦' }), el('span', {}, [el('strong', { text: a }), el('small', { class: 'muted', text: b })])]))]);
  const month = plusReturns(w);
  const all = plusReturns(w, Date.now(), { all: true });
  const back = member
    ? el('div', { class: 'q-card pad plus-back' }, [
        el('div', { class: 'stat-row three' }, [
          el('div', { class: 'stat' }, [el('strong', { class: 'num', text: money(month.total) }), el('small', { text: t('plusMonth') })]),
          el('div', { class: 'stat' }, [el('strong', { class: 'num', text: money(all.total) }), el('small', { text: t('plusAll') })]),
          el('div', { class: 'stat' }, [el('strong', { class: 'num', text: t('monthsN', { n: plusTenure(w) }) }), el('small', { text: t('plusTenure') })])
        ]),
        el('small', { class: 'muted', text: t('plusBackNote') })
      ])
    : null;
  return section(t('plusTitle'), el('div', { class: 'plus-box' }, [plusCard(q), back, el('div', { class: 'q-card pad perks' }, [group('odds', 'Quadra Play'), group('stock', 'Quadra Securities'), group('looks', t('looksTitle'))])]), {
    sub: t('plusSub'),
    action: el('button', { type: 'button', text: `${t('plusManage')} ›`, onclick: () => openPlus(q) })
  });
}

// Avatars and frames: a member wears one (or none); anyone else sees them
// locked, and a tap opens Plus. The rarest are for staying a member: each
// streak's own row, locked (with how many months are left) until it's held.
const looksSection = ({ q, t, wornOf, wear }) => looksSectionOf(q, t, q.wallet || {}, plusMember(q.wallet), wornOf, wear);
function looksSectionOf(q, t, w, member, wornOf, wear) {
  const avatar = wornOf('avatar');
  const frame = wornOf('frame');
  const glyph = AVATARS.find(a => a.id === avatar)?.glyph || '🙂';
  const streak = plusStreak(w);
  const pick = (key, item) => {
    if (!member) return openPlus(q);
    if (!lookOpen(w, item)) return toast(t('streakNeed', { n: item.streak - streak }));
    wear(key, item.id === wornOf(key) ? null : item.id);
  };
  const tile = (key, item, face) => {
    const open = lookOpen(w, item);
    const on = open && wornOf(key) === item.id;
    const label = on ? t('lookOn') : key === 'frame' ? t(`frame_${item.id}`) : '';
    return el('button', { class: `av-tile${on ? ' on' : ''}${open ? '' : ' locked'}`, type: 'button', 'aria-pressed': String(on), 'aria-label': [key === 'frame' ? t(`frame_${item.id}`) : item.glyph, item.streak && !open ? t('lookStreak', { n: item.streak }) : ''].filter(Boolean).join(' · '), onclick: () => pick(key, item) }, [face, el('small', { text: label })]);
  };
  const faces = {
    avatar: a => el('span', { class: 'av-glyph', 'aria-hidden': 'true', text: a.glyph }),
    frame: f => el('span', { class: `fr-preview q-framed q-frame-${f.id}${frame === f.id ? ' on' : ''}`, 'aria-hidden': 'true', text: glyph })
  };
  // Every look anyone member wears, then a row per streak.
  const rows = (key, list) => [
    el(
      'div',
      { class: 'av-grid' },
      list.filter(x => !x.streak).map(x => tile(key, x, faces[key](x)))
    ),
    ...LOOK_STREAKS.map(n => {
      const items = list.filter(x => x.streak === n);
      if (!items.length) return null;
      const held = member && streak >= n;
      return el('div', { class: 'av-tier' }, [
        el('small', { class: `av-tier-h${held ? ' held' : ''}`, text: `${held ? '✓' : '🔒'} ${t('lookStreak', { n })}` }),
        el(
          'div',
          { class: 'av-grid' },
          items.map(x => tile(key, x, faces[key](x)))
        )
      ]);
    })
  ];
  return section(
    t('looksTitle'),
    el('div', { class: 'q-card pad looks' }, [
      member ? el('p', { class: 'av-streak' }, [el('strong', { class: 'num', text: t('streakNow', { n: streak }) }), el('small', { class: 'muted', text: t('streakSub') })]) : el('button', { class: 'looks-lock', type: 'button', onclick: () => openPlus(q) }, [el('strong', { text: t('looksLocked') }), el('small', { text: t('looksLockedSub') })]),
      el('small', { class: 'lv-h', text: t('avatarsTitle') }),
      ...rows('avatar', AVATARS),
      el('small', { class: 'lv-h', text: t('framesTitle') }),
      ...rows('frame', FRAMES)
    ]),
    { sub: t('looksSub') }
  );
}

// ---- Truth ----------------------------------------------------------------------------------

function renderTruth(box, { t, state }) {
  const w = state.wallet;
  const r = record(w);
  const s = r.sides;
  const legs = [1, 2, 3, 5, 7];
  const plus = plusMath();
  const plusBoost = PLUS.odds.boost;
  // A 3-pick parlay at 2.00 each (8.00): what the boost gives back of the cut.
  const parlay = { legs: 3, odds: 8 };
  const trip = roundTrip(100_000);
  const tripPlus = roundTrip(100_000, true);
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
        sideRow('🏛️', t('sideQuadra'), money(s.quadra, { sign: true }), t('sideQuadraSub', { fees: money(s.fees) }), s.quadra >= 0 ? 'up' : 'down'),
        sideRow('🙋', t('sideYou'), money(s.own, { sign: true }), t('sideYouSub'), s.own >= 0 ? 'up' : 'down'),
        el('div', { class: 'side-total' }, [el('span', {}, [document.createTextNode(t('sideWorth')), s.atStake > 0 ? el('small', { class: 'muted', text: t('sideAtStake', { v: money(s.atStake) }) }) : null]), el('strong', { class: 'num', text: money(s.worth) })])
      ]),
      { sub: t('sidesSub', { pay: money(ECONOMY.monthly) }) }
    ),
    section(
      t('edgeTitle'),
      facts(
        [
          ...legs.map(n => row(n === 1 ? t('edgeSingle') : t('edgeLegs', { n }), pct(houseKeep(n)), n === 1 ? t('edgeSingleSub', { cut: PLAY.cut }) : '')),
          row(t('edgeBoost', { n: parlay.legs }), pct(boostedKeep(parlay.legs, parlay.odds)), t('edgeBoostSub', { plus: pct(boostedKeep(parlay.legs, parlay.odds, plusBoost)) })),
          r.staked > 0 ? row(t('yourBets'), r.betBack == null ? '—' : pct(r.betBack), t('yourBetsSub', { staked: money(r.staked), won: money(r.won) }), r.won >= r.staked ? 'up' : 'down') : null
        ],
        t('edgeFoot', { tax: pct(PLAY.tax), free: money(PLAY.taxFree), keep: pct(PLAY.cashOutKeep, 0), plus: pct(PLUS.odds.cashOutKeep, 0) })
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
          row(t('freeBet', { v: money(WELCOME.bet) }), money(freeBetWorth(WELCOME.bet)), t('freeBetSub', { min: PLAY.freeMinOdds.toFixed(2) })),
          ...VIP.tiers.map(tier => row(vipName(tier, state.locale), pct(tier.back), t('vipSub', { min: money(tier.min), per: money(Math.round(vipShare(tier) * 100)) }))),
          vip.tier ? row(t('yourVip'), vipName(vip.tier, state.locale), t('yourVipSub', { stakes: money(vip.stakes), back: money(vip.back) })) : null,
          r.freeBets > 0 ? row(t('yourFree'), money(r.freeBets), t('yourFreeSub')) : null
        ],
        t('freeFoot')
      ),
      { sub: t('freeSub') }
    ),
    section(
      t('plusTruthTitle'),
      facts(
        [
          row(t('plusFee'), money(plus.fee), t('plusFeeSub', { yearly: money(plus.yearly) })),
          row(t('plusBets'), money(plus.betsWorth), t('plusBetsSub', { face: money(plus.betsFace) })),
          row(t('plusTrades'), t('timesN', { n: plus.tradesToBreakEven }), t('plusTradesSub', { saved: money(plus.savedPerTrade) })),
          row(t('plusBoostRow', { x: plusBoost }), pct(boostedKeep(parlay.legs, parlay.odds) - boostedKeep(parlay.legs, parlay.odds, plusBoost)), t('plusBoostSub')),
          r.plusPaid > 0 ? row(t('yourPlus'), money(r.plusPaid), t('yourPlusSub', { back: money(plusReturns(w, Date.now(), { all: true }).total) })) : null
        ],
        t('plusFoot')
      ),
      { sub: t('plusTruthSub') }
    ),
    section(
      t('stockTitle'),
      facts(
        [
          row(t('tripCost'), money(trip.total), t('tripCostSub', { fee: money(trip.fee), tax: money(trip.tax), share: pct(trip.share, 2) })),
          row(t('tripPlus'), money(tripPlus.total), t('tripPlusSub')),
          row(t('tripMonth'), money(trip.total * 4 * 12), t('tripMonthSub')),
          row(t('marginRate'), pct(STOCK.loanRate), t('marginRateSub', { plus: pct(STOCK.loanRate - PLUS.stock.loanCut) })),
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
        TRICKS.map(id => el('div', { class: 'trick' }, [el('strong', { text: t(`trick_${id}`) }), el('small', { class: 'muted', text: t(`trickHow_${id}`, { fee: money(PLUS.fee), year: money(PLUS.year), bet: money(PLUS.odds.bonusBet) }) })]))
      ),
      { sub: t('tricksSub') }
    ),
    section(t('ranksTitle'), ranksCard(t, w), { sub: t('ranksSub') })
  );
}
const TRICKS = ['trial', 'yearly', 'leave', 'expire', 'minodds', 'boost', 'vip', 'nearmiss', 'notify'];
const sideRow = (icon, label, value, sub, cls = '') => el('div', { class: `side-row ${cls}` }, [el('span', { class: 'side-icon', 'aria-hidden': 'true', text: icon }), el('span', { class: 'side-text' }, [el('strong', { text: label }), el('small', { class: 'muted', text: sub })]), el('strong', { class: 'num', text: value })]);

// 財富等級: every level and its one-time reward, and where the account is.
function ranksCard(t, w) {
  const worth = worthOf(w);
  let at = 0;
  while (at + 1 < WEALTH_RANKS.length && worth >= WEALTH_RANKS[at + 1].min) at++;
  const next = WEALTH_RANKS[at + 1];
  const paid = id => (w?.entries || []).some(e => e.app === 'eco' && e.id === `eco:rank:${id}`);
  return el('div', { class: 'q-card list ranks' }, [
    next ? el('div', { class: 'rank-progress' }, [el('small', { class: 'muted', text: t('rankNext', { v: money(next.min - worth), rank: t(`rank_${next.id}`) }) }), bar(worth - WEALTH_RANKS[at].min, next.min - WEALTH_RANKS[at].min, 'accent')]) : null,
    ...WEALTH_RANKS.map((rk, i) =>
      el('div', { class: `rank-row${i === at ? ' current' : i < at ? ' passed' : ''}` }, [
        el('span', { class: 'rank-icon', text: rk.icon }),
        el('span', { class: 'rank-name' }, [el('strong', { text: t(`rank_${rk.id}`) }), el('small', { class: 'num muted', text: rk.min ? money(rk.min) : '—' })]),
        rk.reward ? el('span', { class: `rank-reward num${paid(rk.id) ? ' paid' : ''}`, text: paid(rk.id) ? t('rankPaid', { v: money(rk.reward) }) : `+${money(rk.reward)}` }) : null
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
      const bets = freeBets(w).length;
      return [t('statusStakes', { v: money(v.stakes) }), v.tier ? vipName(v.tier, locale) : '', bets ? t('statusFree', { n: bets }) : ''].filter(Boolean).join(' · ');
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
