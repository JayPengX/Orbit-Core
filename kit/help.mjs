// The help centre: how every app works, in one place: the Quadra Pass
// sheet's 說明 tab, in every app (pass.mjs). A page opens it with
// #help=<app> (helpUrl in quadra.mjs), or #help=<app>:<topic> for one topic.
//
// Every app's guide has the same shape, in the same words:
//   what    「X 是什麼」: its part in Quadra, in two or three lines
//   tabs    「每個分頁」: one line per tab, in the tab bar's order
//   …       what's particular to it (a few topics)
//   money   「錢怎麼算」: how it touches the one Quadra wallet
// (The Quadra Pass's own guide: what, tabs, devices, one, net, notify, safe,
// plus, vip, money.)
//
// HELP[app][lang] = [[topic id, title, [paragraphs]], …]

export const HELP_ORDER = ['pass', 'stock', 'odds', 'match', 'vocab', 'orbit', 'weather', 'transit', 'slip', 'beats'];

export const HELP = {
  pass: {
    zh: [
      ['what', 'Quadra Pass 是什麼', [
        'Quadra Pass 是你在所有 App 的帳號：Quadra 的 Securities、Play，和 Orbit 的 Class、Weather、Transit、Sports、Words。每個 App 都用它登入，資料都存在它裡面，每台裝置都一樣。',
        '通行碼是一組 10 個字的代碼，由分享 Quadra 給你的人發給你，App 裡不能自己建立。它就是帳號的鑰匙：知道它的人就能用，所以不要給別人。它只在拿到或更換時顯示一次，裝置上不會保存，請記在安全的地方。',
        '每個 App 右上角的帳戶按鈕（人像，Plus 會員是自己的頭像）打開 Quadra Pass。'
      ]],
      ['tabs', '每個分頁', [
        'Pass：Quadra 餘額、開戶日、本月收入與支出、下次發薪和最近明細；下面是這個 App 自己的設定（有的話）、新增裝置、通知、除錯紀錄和帳戶安全。',
        'Plus：加入或管理 Quadra Plus、它回饋了多少，和會員的頭像與頭像框。',
        '真相：用真實的數字和你自己的紀錄，算錢從哪裡來、莊家和券商怎麼賺；最下面是財富等級。',
        'App：每個 Quadra 和 Orbit 的 App、上次什麼時候用、它的說明，和打開它。',
        '說明：每個 App 怎麼用，就是這裡。'
      ]],
      ['devices', '登入與裝置', [
        '在新裝置登入：輸入通行碼，或在已登入的裝置打開 Pass，按「新增裝置」取得 8 碼裝置代碼（10 分鐘內、只能用一次）。',
        '從一個 App 打開另一個（例如 Quadra Pass 的「App」分頁）會自動帶著登入。',
        '「在這台裝置登出」會清除這台裝置上的所有資料；資料都還在 Quadra Pass，再登入就回來。'
      ]],
      ['one', '一次只用一個 App', [
        '同一個通行碼一次只在一個 App、一台裝置上使用。打開另一個 App（或另一台裝置），原本那個會暫停並顯示在哪裡使用中，按「在這裡繼續」就能拿回來，資料不會互相蓋掉。'
      ]],
      ['net', '沒有網路的時候', [
        'Words、Weather 和 Class 沒有網路也能打開：背單字、上次的天氣預報和你的課表都在手機上，連上網路後再同步。底部會顯示「沒有網路連線」。',
        'Securities、Play、Transit 和 Sports 的內容都是即時的（報價、賠率、公車到站、比分），舊的資料會讓人誤會，所以沒有網路時只顯示「沒有網路連線」和「重試」，連上網路就自動回來。',
        '網路很慢時，App 會先用手機上的資料打開，底部顯示「網路連線很慢」，新資料到了就更新。'
      ]],
      ['notify', '通知與除錯紀錄', [
        '「系統通知」一個開關管全部，下面依 App 分開，每種通知各自開關（比賽開打、投注單結算、成交、上課、降雨、公車到站…）。設定跟著 Quadra Pass，每個 App、每台裝置都一樣；App 開著時，通知顯示在畫面上方。',
        '除錯紀錄：打開「記錄操作過程」，App 會記下它做了什麼；遇到問題時按「複製紀錄」或「分享檔案」傳出去。紀錄裡沒有通行碼。關閉時只留每件事的最後一次。'
      ]],
      ['safe', '安全', [
        '伺服器只保存通行碼的雜湊值；裝置上只有會過期、可以撤銷的登入憑證，不會有通行碼本身。',
        'Pass 的「帳戶安全」可以「登出其他所有裝置」（這台保持登入），或「更換通行碼」：舊的立刻失效、其他裝置登出，新的只顯示一次，要輸入它的最後 5 個字確認記好了。忘記通行碼時，在還登入的裝置更換一組就好。'
      ]],
      ['plus', 'Quadra Plus 會員', [
        '一個會員，用在 Play 和 Securities。月繳 NT$490：第一次加入的那個月免費，之後再加入，當月按剩下的天數計費。年繳 NT$4,900 一次付 12 個月，每月約 NT$408、省 NT$980。從 Quadra 餘額扣款，在 Quadra Pass 的「Plus」加入；會員的帳戶按鈕有金色 ✦。',
        'Play：每週一張 NT$200 免費投注（那一週打開任何 App 就入帳，沒打開的週不補）、3 關以上每個贏的組合串關加成 ×1.5、提前兌現只扣 2%（一般 3%）。Securities：所有市場手續費 2.8 折、換匯點差減半、新的融資利率少 1%。所有權益都讓下注和交易更便宜或更大；它怎麼替 Quadra 賺錢，「真相」算給你看。',
        '頭像與頭像框：會員在「Plus」挑選，每個 App 的帳戶按鈕都看得到；連續訂閱 3、6、12 個月解鎖限定款，中斷一個月就從頭算。會員停止時會隱藏，重新加入會回來。',
        '每月 1 日從餘額扣款，沒打開 App 的月份也照扣（下次打開時補扣）；年繳每年續約一次，餘額不夠一年就改成按月扣。餘額不足扣款失敗，會員就停止，要重新加入。每週免費投注入帳和續訂前三天都會通知你。「Plus」頁顯示本月和累計回饋了多少（面額）。',
        '想停：「Plus」›「管理」›「管理會員」›「取消自動續訂」，權益用到期滿；已付不退費，價格含 5% 營業稅。免費投注照運彩業者的規則：賠率 1.50 以上（串關看總賠率）、不能提前兌現、7 天內用完，贏了只拿獎金、不退本金。'
      ]],
      ['vip', 'VIP 投注回饋與新手禮', [
        'VIP 不用加入也不用付費：每個月在 Play 的投注（運彩、彩券、刮刮樂，退款不算）決定當月等級，下個月第一次打開任何 App 時回饋當月投注額的一部分：銅卡 NT$10,000 起 0.5%、銀卡 NT$50,000 起 0.8%、金卡 NT$150,000 起 1.2%、黑卡 NT$500,000 起 1.5%。Play 首頁的餘額卡上看得到本月等級和離下一級還差多少。',
        '新手禮：在 Play 第一次用自己的錢下注後，送一張 NT$200 免費投注（7 天內有效）；在 Securities 的第一筆交易免手續費（稅和規費照收）。'
      ]],
      ['money', '錢怎麼算', [
        '所有 App 共用一個新台幣錢包。新帳號開戶金 NT$30,000；每個月 1 日固定發薪 NT$6,000，跟薪水一樣，存多存少都一樣。系統發的錢只有這些：開戶金、月薪、財富等級獎勵（身價第一次到達一個等級時送一次，小資族 NT$1,000 到億萬大亨 NT$30,000），和 Play 的 VIP 回饋。月薪在那個月第一次打開任何 App 時入帳，沒打開的月份下次補發。',
        '「真相」把你的錢分成三方：系統發的、和 Quadra 的輸贏（Play 的輸贏，扣掉 Plus 月費和透支利息），和你自己的成績（投資的漲跌）。',
        '餘額可以是負的（透支），每月計息 1%。就像交割款沒付，2 天內沒補足就是違約交割：扣透支金額 7% 的違約金、自動賣出持股補足，而且 5 年內不能融資、融券。自己先賣就沒事。融資借來的錢只能留在 Securities 買賣，不能拿去 Play 或補透支。',
        'Securities 投資、Play 下注和買彩券；Orbit 的 App 都不用錢。錢只存在 Quadra Pass，不能在帳號之間轉。'
      ]]
    ],
    en: [
      ['what', 'What the Quadra Pass is', [
        'The Quadra Pass is your account in every app: Quadra’s Securities and Play, and Orbit’s Class, Weather, Transit, Sports and Words. Each signs in with it and keeps its data on it, the same on every device.',
        'The pass is a 10-character code, given to you by whoever shared Quadra with you: it can’t be made in an app. It’s the key to the account: anyone who knows it can use it, so keep it to yourself. It’s shown only when you get it or change it and never kept on a device: write it down somewhere safe.',
        'The account button at the top right of every app (a person, or a Plus member’s own avatar) opens the Quadra Pass.'
      ]],
      ['tabs', 'Each tab', [
        'Pass: the Quadra balance, when it was opened, this month’s money in and out, the next pay and the latest entries; below them this app’s own settings (if it has any), adding a device, notifications, the debug log and security.',
        'Plus: join or manage Quadra Plus, what it gave back, and a member’s avatar and frame.',
        'Truth: where the money comes from and how the house and the broker earn, in real numbers and your own record; wealth levels at the foot.',
        'App: every Quadra and Orbit app, when you last used it, its guide and a way in.',
        'Help: how every app works, here.'
      ]],
      ['devices', 'Signing in and devices', [
        'On a new device, enter the pass, or on a signed-in device open Pass and choose “Add a device” for an 8-character device code (10 minutes, once).',
        'Opening one app from another (from the Quadra Pass’s App tab, say) arrives signed in.',
        '“Sign out on this device” wipes everything on this device; it all stays on your Quadra Pass and comes back when you sign in.'
      ]],
      ['one', 'One app at a time', [
        'A pass is used in one app on one device at a time. Opening another app (or device) pauses the first, which says where it’s in use; “Continue here” takes it back, so nothing overwrites anything.'
      ]],
      ['net', 'Without a connection', [
        'Words, Weather and Class open with no connection: your words, the last forecast and your timetable are on the phone, and sync once you’re back online. A note at the bottom says “No internet connection”.',
        'Securities, Play, Transit and Sports are live (prices, odds, buses, scores), and old figures would mislead, so with no connection they show only “No internet connection” and Try again, and come back by themselves once you’re online.',
        'On a slow connection an app opens on what the phone has, says “Slow internet connection” at the bottom, and updates as the new data arrives.'
      ]],
      ['notify', 'Notifications and the debug log', [
        'One switch, System notices, turns them all on or off; below it each app’s kinds have their own switches (a game starts, a slip settled, an order filled, a class, rain, a bus nearly here…). The settings follow your Quadra Pass, the same in every app and on every device; while an app is open, a notice shows at the top of the screen.',
        'Debug log: turn on “Record what the app does” and the app notes what it did; when something goes wrong, Copy or Share file to send it. It never holds your pass. Off, it keeps only the last of each thing.'
      ]],
      ['safe', 'Security', [
        'The server keeps only a hash of the pass; devices keep only sign-ins that expire and can be revoked, never the pass itself.',
        'Pass’s Security can sign out every other device (this one stays in) or change the pass: the old one stops at once and other devices sign out, and the new one is shown once, closed only when you type its last 5 characters. Forgot it? Change it from a device that’s still signed in.'
      ]],
      ['plus', 'Quadra Plus', [
        'One membership for Play and Securities. Monthly is NT$490: the first month you ever join is free, and joining again later charges this month by the days left. Yearly is NT$4,900 for 12 months at once, about NT$408 a month, NT$980 less. It comes from the Quadra balance; join in the Quadra Pass’s Plus tab, and a member’s account button has a gold ✦.',
        'Play: a NT$200 free bet each week (it arrives the week you open any app; a week you miss isn’t made up), the parlay boost ×1.5 on every winning combination of 3 picks or more, and cash out keeps 2% instead of 3%. Securities: commission at 28% of the usual rate in every market, half the FX spread, and new margin loans 1 point cheaper. Every perk makes betting or trading cheaper or bigger; how it earns Quadra money is worked out in Truth.',
        'Avatars and frames: a member picks them in Plus, shown on the account button in every app; 3, 6 and 12 months in a row unlock the rarest, and a month missed starts the count again. They’re hidden when the membership stops and come back when you join again.',
        'It’s charged from your balance on the 1st of every month, including months you didn’t open an app (charged when you’re back); yearly renews once a year, by the month if the balance can’t cover a year. If the balance can’t cover a charge, it fails and the membership stops until you join again. You’re told when each weekly free bet arrives and three days before a renewal. The Plus tab shows what it gave back this month and in all (face value).',
        'To stop: Plus › Manage › Manage membership › Stop renewing; the perks last to the end of what’s paid. Nothing is refunded, and prices include 5% VAT. Free bets follow a sportsbook’s terms: odds of 1.50 or more (a parlay’s taken together), no cash out, used within 7 days, and a win pays the winnings, not the stake.'
      ]],
      ['vip', 'VIP cashback and welcome offers', [
        'VIP is free and needs no sign-up: what you stake in Play in a month (bets, lottery and scratch cards; refunds don’t count) sets that month’s tier, and a share of it comes back the first time you open any app the next month: Bronze from NT$10,000 0.5%, Silver from NT$50,000 0.8%, Gold from NT$150,000 1.2%, Black from NT$500,000 1.5%. Play’s balance card shows this month’s tier and what’s left to the next.',
        'Welcome offers: your first bet in Play with your own money brings a NT$200 free bet (7 days), and your first trade in Securities pays no commission (taxes and fees as usual).'
      ]],
      ['money', 'Money', [
        'Every app shares one NT$ wallet. A new pass opens with NT$30,000; the 1st of every month pays a fixed NT$6,000, like a salary: the same however much you hold. The system gives money only as the opening money, the pay, wealth level rewards (paid once, the first time what you’re worth reaches a level: NT$1,000 for Saver up to NT$30,000 for Tycoon) and Play’s VIP cashback. The pay comes the first time that month you open any app; a month you miss is paid when you’re back.',
        'Truth splits your money three ways: what the system gave, your result against Quadra (Play’s wins and losses, less Plus fees and overdraft interest), and your own result (your investments).',
        'The balance can go below zero (an overdraft) at 1% a month. Like an unpaid settlement, if it isn’t covered within 2 days it’s a default: a 7% penalty on what’s owed, holdings sold for it, and no margin or short selling for 5 years. Sell something first and none of that happens. Money borrowed on margin stays in Securities for trading: it can’t be bet in Play or cover an overdraft.',
        'Securities invests, Play bets and sells lottery tickets; the Orbit apps don’t use money. Money lives on the Quadra Pass only and can’t move between passes.'
      ]]
    ]
  },
  stock: {
    zh: [
      ['what', 'Quadra Securities 是什麼', [
        'Quadra 讓錢長大的地方：用錢包裡的新台幣投資全世界的股票、ETF、各國公債、共同基金、加密貨幣、黃金白銀存摺和外匯，價格是真實的市場價格，規則照真的券商。'
      ]],
      ['tabs', '每個分頁', [
        '「首頁」：總資產和今日漲跌、為你推薦、漲跌幅前五名、全球市場，各分類清單（先列 15 檔）和搜尋（中文、英文或代號）；點任何標的看走勢、公司資料和下單。',
        '「資產」：淨值與走勢、配置、持股、現金與各幣別錢包、股利利息收入、定期定額和到價提醒。',
        '「換匯・融資」：換匯（你付出／你會收到，兩邊都能輸入）、匯率看板、融資（已借、維持率、借款和還款）、理財（定存、借券出借）。',
        '「紀錄」：交易明細、委託、統計分析（報酬、費用與稅、和只買大盤比），和回測。',
        '右上角：說明、重新整理和你的 Quadra Pass；漲跌的顏色在 Quadra Pass 的 Pass 分頁設定。'
      ]],
      ['orders', '委託單', [
        '每筆委託都由 Quadra 的伺服器用它的即時報價成交；掛著的時候，要用的現金或股票會先保留。',
        '市價單：開盤時立刻成交（買在賣價、賣在買價）；休市時送出的，開盤後第一個報價成交，多保留 3%，沒用到的退回；台股市價和停損單照券商的算法，以漲停價保留現金、計算額度。限價單：買進到限價或更低、賣出到限價或更高才成交。停損／觸價單：價格穿過觸發價時用市價成交。',
        '限價和停損單預設「當日有效」，收盤還沒成交就失效；選「長效」保留 30 天。加密貨幣和外匯對永遠是長效。觸發時現金不夠，委託會被取消。',
        'App 關著也照算：伺服器用那段時間的價格，找出第一個碰到你價格的時間成交，記在那個時間。',
        '台股、美股的限價要符合跳動單位，台股限價要在漲跌幅 ±10% 內；台股整股（1,000 股的倍數）和零股（1–999 股）要分開下單，零股只能下限價單、9:10 開始撮合。每筆交易都看得到交割日（台股 T+2、美股 T+1）：賣出的錢馬上可以再買同一個市場，交割後才能換匯。'
      ]],
      ['plans', '定期定額與到價提醒', [
        '定期定額（📅）：每月第幾天買多少新台幣。那天 00:00 之後的第一個價格成交，扣掉成本能買多少就買多少；外幣標的只換需要的新台幣。那個月餘額不夠就跳過，記在紀錄裡。',
        '到價提醒（🔔）：漲到或跌到某個價格時通知你，App 關著時伺服器也會檢查。成交、委託失效、維持率偏低和股利利息入帳也會通知；每一種都能在 Quadra Pass 的通知各自開關。'
      ]],
      ['fx', '換匯與外幣', [
        '每種貨幣有自己的錢包：美股用美元、日股用日圓…只有新台幣時，下單會直接換好剛好需要的金額。',
        '換匯用市場中間價再扣銀行價差（美元 0.2%、日圓歐元港幣 0.3%…）；週末外匯休市照樣能換，但價差加倍，跟真的銀行一樣。',
        '外匯對（例如 EUR/USD）可以像股票一樣買賣、放空和設提醒：不收手續費，買賣各 0.02% 價差。這跟「換匯」不同，換匯只是把錢換成另一種貨幣。'
      ]],
      ['more', '公債、融資、放空', [
        '公債有票面利率和到期日，價格跟殖利率反向；買進要付應計利息，配息照發行國預扣稅，到期自動還本。美國公債照即時殖利率曲線，其他國家用參考殖利率。',
        '買進時可以選「融資」：成交時券商借你一部分，買的股票就是擔保，賣出時先還融資（沒有單獨借現金這回事）。融資成數和券商一樣：台股上市 6 成、上櫃 5 成（借成交價金乘成數，未滿千元的部分不借），其他市場 5 成（美國 Reg T），陸股、印度股、加密貨幣、基金、黃金存摺不能融資；公債 9 成、公司債 7 成。利息加在融資上，還款或賣出時一起付。持股會分開記「現股」和「融資」：融資買進的股票是券商的擔保品，只能融資賣出（賣得的錢先還融資）或用現金償還變成現股；賣出時先賣現股。融資到期、追繳沒補足或沒有信用帳戶時，券商只會處分融資的股票，不會動你的現股。融資的股票一樣有股東權益：配股配息、股東會、現金增資都有份。',
        '融資和借券放空（任何市場）都要先開「信用帳戶」（換匯・融資 › 融資）：沒有信用帳戶時，手上的融資和放空會被券商處分。開戶條件：證券帳戶滿 3 個月、最近一年成交 10 筆以上、成交金額達額度的一半；額度 50 萬、100 萬、200 萬、300 萬、500 萬，50 萬以上還要財力證明（總資產達額度 3 成）。台股的融資、融券各用自己的額度。外匯對賣出不算借券，不用信用帳戶。',
        '融資、融券期限 6 個月，到期前一個月內可以按「展延」再延 6 個月；到期沒展延，融資的股票會被賣出、融券會被買回。融券：要繳賣出金額 9 成的保證金（未滿百元以百元計），賣出的錢也押在券商，買回時一起退；另收 0.08% 融券手續費，不收借券利息；保證金和押著的賣出款有年息 0.2%，買回時付給你。融券要用融券買進（或現券償還）了結；股東會、除權息前要依規定強制回補。其他市場的放空照國外券商：借券年費 3%，開倉後資產要有欠款的 150%，期間的股利由你付。',
        '現股當沖：當天買進再賣出，證交稅減半（0.15%）。證券帳戶滿 3 個月、最近一年成交 10 筆，或已開信用帳戶，就能當沖（先買後賣、先賣後買都一樣）；先賣後買有每日當沖額度（淨資產的 2 倍，最少 NT$50 萬、最多 NT$5,000 萬），收盤前一定要買回，沒買回會被自動買回。13:25 起整股進收盤前集合競價：只收限價單，13:30 以收盤價撮合一次。收盤後零股 13:40、整股 14:00 起到 14:30 下的台股單進「盤後交易」（零股盤後、整股盤後定價），14:30 以收盤價撮合一次，沒成交就取消；13:30 到開放前送出的會被退回。',
        '維持率收盤時低於 130% 會追繳，兩個營業日內要補到 166%，或繳足通知的補繳差額；到期還低於 130%，融資買進的持股全部賣出（斷頭）；低於 100% 馬上強制處理。'
      ]],
      ['save', '閒錢：活存、定存、借券', [
        '交割帳戶裡的新台幣有活存利息，年利率 0.8%，每天計息，6 月 21 日和 12 月 21 日入帳。',
        '定存：最少 NT$10,000，1、3、6、9 或 12 個月，臺灣銀行牌告固定利率（1 年 1.72%），到期本息回到現金，也可以設自動轉存。提前解約未滿 1 個月沒有利息，滿 1 個月以上按存滿的期別利率打 8 折。',
        '借券出借：整張、已交割、不是融資買進的台股或 ETF 可以借出去收借券費（股票年 1.2%、ETF 0.6%，券商收 3 成），借出去的股票不能賣，召回要 3 個營業日，最長 180 天。',
        '單筆利息或借券費超過 NT$20,000 扣繳 10% 和 2.11% 二代健保。違約交割時銀行會先把定存解約抵債、券商召回借出的股票來賣。'
      ]],
      ['time', '回測（時光機）', [
        '在「紀錄」的「回測」試算：幾年前投入一筆錢（或每月定期定額）到某個知名基金或股票，現在會變多少、中間最大跌幅多少、最好和最差的一年，和放銀行比。標的頁也有連結。'
      ]],
      ['fees', '費用', [
        '台股手續費 0.1425%（最低 NT$20，折扣後也一樣；零股最低 NT$1），賣出另收 0.3% 證交稅（ETF 0.1%、債券 ETF 免、當沖 0.15%），元以下無條件捨去；美股、日股等海外市場照複委託常見網路費率；共同基金透過基金平台申購，收 1% 申購手續費，贖回不收費。股利照各國規定預扣稅。',
        '換匯用市場中間價加減銀行價差；週末外匯休市時價差加倍。融資按天計息。新手禮：第一筆交易免手續費（稅和規費照收）。',
        'Quadra Plus 會員手續費（含基金申購手續費）2.8 折、點差減半、融資利率少 1%：交易越多、借越多，省越多，這正是它要你做的事。'
      ]],
      ['money', '錢怎麼算', [
        'Securities 的新台幣就是 Quadra 餘額：買進時從錢包出去，賣出時回來。月薪和其他 App 的錢都會以新台幣存入，算投入的本金，不算報酬。',
        '股利照各國規定預扣稅，除息日持有就有，現金在發放日入帳（有公布的照公布日期，否則台股約 4 週後、美股約 1 週後，遇假日順延到下一個交易日）；在那之前列為「待入帳」，算在淨值裡但不能花。',
        '餘額變負的（透支）時不能再花錢，「一鍵賣出補足」會找出最少要賣哪些來補。'
      ]]
    ],
    en: [
      ['what', 'What Quadra Securities is', [
        'Where Quadra’s money grows: invest the NT$ in your wallet in stocks, ETFs, government bonds, mutual funds, crypto, gold and silver passbooks and forex worldwide, at real market prices and a real broker’s rules.'
      ]],
      ['tabs', 'The tabs', [
        'Home: your total and today’s change, for you, the top five up and down, world markets, lists by kind (15 at first) and search (Chinese, English or ticker); tap anything for its chart, company facts and the order ticket.',
        'Portfolio: net worth and its history, allocation, holdings, cash and each currency’s wallet, income, monthly plans and price alerts.',
        'FX & loans: exchange (you pay / you get, type either), the rates board, loans (borrowed, the ratio, borrowing and repaying) and savings (time deposits, lending shares).',
        'History: activity, orders, stats (returns, costs and taxes, you against just buying an index) and the backtest.',
        'Top right: help, refresh and your Quadra Pass; the colours for up and down are set in its Pass tab.'
      ]],
      ['orders', 'Orders', [
        'Every order is filled by Quadra’s server at its own live quote; while an order waits, the cash or shares it needs are held.',
        'Market: fills at once while the market is open (buying at the ask, selling at the bid); placed while it’s closed, at the first price after the open, holding 3% extra (the unused part comes back); a Taiwan market or stop order holds its cost and counts against limits at the day’s limit-up price, as brokers do. Limit: a buy fills at your price or lower, a sell at your price or higher. Stop: a market order once the price passes your stop.',
        'Limit and stop orders are day orders by default: not filled by the close, they lapse; GTC keeps one for 30 days. Crypto and currency pairs are always GTC. An order whose cash is no longer there when it triggers is dropped.',
        'Closed apps still count: the server walks the prices of the time away, fills at the first moment that reached your price, and dates it then.',
        'Taiwan and US limit prices must sit on the exchange’s tick, and Taiwan’s within the day’s ±10%; Taiwan whole lots (multiples of 1,000) and odd lots (1–999 shares) are separate orders, and odd lots take limit orders only and match from 9:10. Every trade shows when it settles (Taiwan T+2, US T+1): sale money buys again at once in its market, but can be exchanged only once settled.'
      ]],
      ['plans', 'Monthly plans and price alerts', [
        'Monthly plan (📅): NT$ an amount on a day of every month. It buys at the first price after 00:00 that day, as much as the money covers after costs; a foreign one exchanges only the NT$ it needs. A month without enough is skipped and recorded.',
        'Price alert (🔔): tells you when a price rises or falls to yours, checked by the server while the app is closed. Fills, lapsed orders, low margin and dividends and interest are told too; each kind has its own switch in the Quadra Pass’s notifications.'
      ]],
      ['fx', 'Exchange and currencies', [
        'Each currency has its own wallet: US stocks in US$, Japanese in yen… With only NT$, an order exchanges just what it needs.',
        'Exchanges are at the mid-market rate less a bank’s spread (US$ 0.2%, yen, euro and HK$ 0.3%…); on weekends, while FX markets are shut, you can still exchange but the spread doubles, as at a real bank.',
        'Currency pairs (EUR/USD, say) trade like stocks, shorts and alerts included: no commission, a 0.02% spread each way. That’s apart from Exchange, which only changes money from one currency to another.'
      ]],
      ['more', 'Bonds, margin, short selling', [
        'Bonds have a coupon and a maturity, and their price moves against their yield; a purchase pays accrued interest, coupons are paid less the issuer’s withholding, and the face value is repaid at maturity. US Treasuries follow the live yield curve; other countries’ use reference yields.',
        'Buy on margin by choosing 融資 on the order: the broker lends part of it as it fills, the shares its collateral, and selling repays it first (there’s no borrowing cash on its own). How much is lent is a broker’s: Taiwan 60% listed, 50% OTC (of the trade’s value, the part under NT$1,000 not lent); 50% elsewhere (US Reg T); none on A-shares, Indian stocks, crypto, funds or the gold passbook; government bonds 90%, corporate 70%. Interest is added to the loan and paid when it’s repaid or the shares are sold. A holding keeps its own shares (現股) and its margin shares (融資) apart: shares bought on margin are the broker’s collateral, sold only as a margin sale (the money repays the loan first) or turned into your own by repaying in cash; a sale sells your own first. When margin is due, a call isn’t met or there’s no credit account, the broker sells only the margin shares, never your own. Margin shares keep every shareholder right: dividends, meetings and rights issues.',
        'Margin and borrowed shorts (any market) need a credit account first (FX & loans › Loans); without one, the broker closes any margin or shorts held. To open one: the account 3 months old, 10 trades in the last year, and that year’s turnover at least half the limit; limits of NT$500k, 1M, 2M, 3M or 5M, above 500k with proof of means (net worth 30% of the limit). Taiwan’s 融資 and 融券 each have their own limit. Selling a currency pair borrows nothing and needs no credit account.',
        'Taiwan margin (融資) and short sales (融券) run six months; within the last month, Extend adds six more. Past due without one, margin shares are sold and shorts bought back. A 融券 short puts up 90% of the sale as a deposit (rounded up to NT$100), and the sale money stays with the broker too, both returned on buying back; it costs a 0.08% fee and no borrow interest, and the deposit and sale money earn 0.2% a year, paid when you buy back. A 融券 position is closed by buying back (or delivering shares you hold), and must be covered before shareholder meetings and ex-dates by the rules. Shorts elsewhere follow a foreign broker: a 3% a year borrow fee, assets of 150% of what’s owed after opening, and dividends paid meanwhile charged to you.',
        'Day trading (現股當沖): bought and sold the same day, the sell tax is halved (0.15%). Either way round needs the account 3 months old with 10 trades in the last year, or a credit account; selling first has a daily day-trade limit (twice net worth, NT$500,000 to NT$50 million) and must be bought back before the close or it’s bought back for you. From 13:25 whole lots go into the closing call auction: limit orders only, matched once at 13:30 at the close. After the close, Taiwan orders placed from 13:40 (odd lots) or 14:00 (whole lots) until 14:30 go to after-hours trading, matched once at 14:30 at the close; unfilled ones are cancelled, and ones sent before their session opens are refused.',
        'If the maintenance ratio is under 130% at the close, it’s a margin call: two business days to bring it back to 166% or pay the amount called in full; still under 130% at the deadline, margin-bought holdings are sold; under 100% they’re sold at once.'
      ]],
      ['save', 'Idle money: cash, deposits, lending', [
        'NT$ in the settlement account earns 0.8% a year, accrued daily and paid on June 21 and December 21.',
        'Time deposits: NT$10,000 or more for 1, 3, 6, 9 or 12 months at Bank of Taiwan’s posted fixed rates (1.72% for a year); principal and interest come back to cash at maturity, or roll over if you choose. Closed early: no interest under a month, past that 80% of the rate for the term held.',
        'Lending shares: whole lots of settled Taiwan stocks or ETFs not bought on margin earn a lending fee (1.2% a year for stocks, 0.6% for ETFs; the broker keeps 30%); lent shares can’t be sold, take 3 business days to recall, and come back after 180 days at most.',
        'Interest or a fee over NT$20,000 at once has 10% tax and 2.11% health premium withheld. In a default the bank breaks your deposits against the debt and the broker recalls lent shares to sell.'
      ]],
      ['time', 'Backtest (time machine)', [
        'In History’s Backtest: what a lump sum (or a monthly plan) in a well-known fund or stock years ago would be worth now, its worst drop, its best and worst years, against a bank deposit. A holding’s sheet links to it too.'
      ]],
      ['fees', 'Fees', [
        'Taiwan commission is 0.1425% (at least NT$20 even after discounts; odd lots at least NT$1), plus 0.3% tax on sales (ETFs 0.1%, bond ETFs none, day trades 0.15%), rounded down to the dollar; overseas markets at common online sub-brokerage rates; mutual funds are bought through a fund platform at a 1% subscription fee, with nothing on redeeming. Dividends have each country’s withholding.',
        'Exchanges are at the mid-market rate plus or minus a bank’s spread, doubled while FX markets are shut. Margin interest accrues daily. Welcome offer: your first trade pays no commission (taxes and fees as usual).',
        'Quadra Plus members pay 28% of the commission (fund subscription fees too), half the FX spread and margin 1 point cheaper: the more you trade and borrow, the more you save, which is exactly what it wants you to do.'
      ]],
      ['money', 'Money', [
        'Securities’ NT$ is the Quadra balance: buying spends from it, selling returns to it. The monthly pay and the other apps’ money arrive as NT$ deposits, counted as money put in, not as return.',
        'Dividends have each country’s withholding: held on the ex-date, the cash arrives on the pay day (the announced one where known, else about 4 weeks later in Taiwan and a week in the US, moved past holidays to the next trading day); until then it’s listed as on the way, counted in net worth but not spendable.',
        'With the balance below zero (an overdraft) nothing more can be spent, and Sell to cover finds the fewest sales that cover it.'
      ]]
    ]
  },
  odds: {
    zh: [
      ['what', 'Quadra Play 是什麼', [
        'Quadra 玩樂的地方：照台灣運動彩券的玩法、賠率和規則下注，還有台灣彩券的電腦彩券和刮刮樂。棒球、籃球、足球、美式足球、冰球和 F1，每場比賽、冠軍盤和球員都有。',
        '運彩賠率由 DraftKings、Kambi、Polymarket 的價格去掉抽成，再照運彩實際的抽成定價；還沒有人開盤的比賽由 Quadra 自己估。彩券用台灣彩券的真實開獎號碼。'
      ]],
      ['tabs', '每個分頁', [
        '「首頁」：餘額（投注中的金額、現在的兌現價值和本月 VIP）、場中焦點、為你推薦（照你在 Orbit Sports 追蹤的球隊和聯賽，前三個可以一次串成一張）、焦點賽事、你的投注和彩券頭獎。',
        '「賽事」：選運動、聯賽和日期（台灣時間），或搜尋球隊和聯賽；點賠率加入投注單，點比賽看它的所有玩法（分頁、球員、更多）。冠軍盤和 F1 各一張。',
        '「彩券」：11 種電腦彩券和 12 種刮刮樂。',
        '「紀錄」：投注單（進行中、等待開賽、已結算）、彩券、戰績和統計分析。',
        '投注單不是分頁：有選項時，分頁列上方會出現投注單列（幾個選項、金額、最多拿回多少），點開確認送出。'
      ]],
      ['bet', '怎麼下注', [
        '投注單照運彩的規則：一關（每個選項各一張，預設）、全部過關、過關組合（過 2 關…全過）。最多 12 個選項，串關同一場只能選一個；每張 NT$100–100,000，彩金上限 NT$2,000 萬，每個組合獎金超過 NT$5,000 扣 20% 所得稅和 0.4% 印花稅。',
        '送出前會告訴你花多少、最多拿回多少；照當下的賠率成交，賠率變了會停下來說。場中投注等 5 秒，用那時的賠率再確認一次，跟真的運彩一樣。',
        '🔒 是不開放的選項；「限2關」「限3關」只能放在夠多場的串關裡。',
        '比賽結束由伺服器自動結算並通知你，App 關著也一樣；延期或取消的比賽算賠率 1.00，開賽 3 天後還沒結果的算無效。'
      ]],
      ['lottery', '彩券', [
        '威力彩、大樂透、今彩539、3星彩、4星彩、38／39／49樂合彩、賓果賓果、雙贏彩和大福彩，照台灣彩券的規則和真實開獎對獎；晚上開獎的在開獎前半小時停售。雙贏彩和大福彩已經停賣，號碼取當晚 20:30 那期賓果賓果算出來。威力彩前兩獎和大樂透前四獎照那期每注實際派彩，和真的中獎人一起分。',
        '刮刮樂 12 種（NT$100 到 2,000 各兩種），獎金表照台灣彩券 2026 年的卡；買的時候就決定中多少，刮開就知道。',
        '選號時快選補滿，+1／+5／+10 再加幾注；購買列一直在下面。中獎自動入帳並通知你。'
      ]],
      ['boost', '串關加成、提前兌現、免費投注', [
        '串關加成：3 個選項以上每個贏的組合多給獎金，3 個 +5%、4 個 +8%、5 個 +12%、6 個 +15%、7 個以上 +20%（Plus 會員 ×1.5）。',
        '提前兌現：比賽還沒結束也能先把投注單換成現金。每個還沒結果的選項先扣莊家的差價（賽前 4%、場中 6%），整張再扣 3%（Plus 2%）；串越多、越早兌現拿得越少，兌現永遠不會比留著值錢。某個選項現在沒有報價、同一場有兩個未定的選項，或用了免費投注時，不能兌現。',
        '免費投注：Plus 會員每週一張和新手禮，在投注單上點一下就用在這張單（單場或一組串關），賠率要 1.50 以上（串關看總賠率），贏了只拿獎金、不退本金，7 天內有效。'
      ]],
      ['money', '錢怎麼算', [
        '下注和買彩券從 Quadra 餘額扣款；派彩、兌現和彩券獎金都由伺服器入帳，並通知你。彩券獎金照規定每注計算：單注超過 NT$5,000 扣 20% 所得稅和 0.4% 印花稅。',
        '每個月的投注決定 VIP 等級，下個月回饋一部分，詳見 Quadra Pass 的說明。'
      ]]
    ],
    en: [
      ['what', 'What Quadra Play is', [
        'Quadra’s place to play: bets with Taiwan Sports Lottery’s markets, odds and rules, and Taiwan Lottery’s draw games and scratch cards. Baseball, basketball, soccer, American football, hockey and F1: every game, outrights and players.',
        'Odds come from DraftKings’, Kambi’s and Polymarket’s prices with their margins taken out, then priced at the cuts the sports lottery really takes; a game nobody prices yet is priced by Quadra itself. The lottery uses Taiwan Lottery’s real draws.'
      ]],
      ['tabs', 'The tabs', [
        'Home: your balance (what’s in open bets, what they’d cash out for and this month’s VIP), live now, for you (from the teams and leagues you follow in Orbit Sports; its top three as one parlay), featured games, your bets and the lottery jackpots.',
        'Games: pick a sport, league and day (Taiwan time), or search teams and leagues; tap a price to add it to the slip, a game for all its markets (by tab, players, more). Outrights and F1 have a board each.',
        'Lottery: 11 draw games and 12 scratch cards.',
        'History: slips (in play, waiting, settled), tickets, wins and stats.',
        'The slip isn’t a tab: with picks on it, a bar above the tab bar shows how many, the stake and the most it pays; tap it to confirm and place.'
      ]],
      ['bet', 'Placing a bet', [
        'The slip follows the sports lottery: singles (one ticket a pick, the default), an all-in parlay, or systems (2 of N … all). Up to 12 picks, one per game in a parlay; NT$100–100,000 a ticket, a NT$20 million cap, and 20% income tax plus 0.4% stamp duty on any combination paying over NT$5,000.',
        'Before it’s placed you’re told the cost and the most it pays; it’s bought at the odds shown, and a price that moved stops it and says so. A live bet waits 5 seconds and is priced again then, as at a real sportsbook.',
        '🔒 marks a market that isn’t open; 限2關 and 限3關 picks go only in a parlay of that many games.',
        'The server settles each slip when its games are over and tells you, with the app closed too; a postponed or cancelled game counts at 1.00, and one still without a result three days after its start is void.'
      ]],
      ['lottery', 'Lottery', [
        'Super Lotto 威力彩, Lotto 6/49 大樂透, Daily Cash 539, 3D and 4D, 38/39/49 樂合彩, BINGO BINGO, 雙贏彩 and 大福彩, checked against Taiwan Lottery’s rules and real draws; evening draws stop selling half an hour before. 雙贏彩 and 大福彩 are no longer sold, so their numbers come from that night’s 20:30 BINGO draw. 威力彩’s top two prizes and 大樂透’s top four pay what that draw paid per winner, shared with the real winners.',
        '12 scratch cards (two at each price, NT$100 to 2,000), their prize tables Taiwan Lottery’s 2026 cards; the prize is fixed when a card is bought, and scratching shows it.',
        'Quick pick fills a line, +1/+5/+10 add more, and the buy bar stays in view. Wins are paid in automatically and you’re told.'
      ]],
      ['boost', 'Parlay boost, cash out, free bets', [
        'The parlay boost adds to every winning combination of 3 picks or more: 3 picks +5%, 4 +8%, 5 +12%, 6 +15%, 7 or more +20% (×1.5 for Quadra Plus).',
        'Cash out turns a slip into cash before its games end. Each undecided pick first gives up the house’s margin (4% before its game, 6% in play), then 3% of the whole is kept (2% for Plus): the more picks and the earlier, the less it pays, and cashing out is never worth more than holding on. It pauses while a pick has no price, two undecided picks are on one game, or the slip used a free bet.',
        'Free bets (Plus’s weekly one and the welcome offer): one tap on the slip uses it on that slip (singles of one pick or one parlay), at odds of 1.50 or more (a parlay’s together); a win pays the winnings, not the stake; 7 days to use it.'
      ]],
      ['money', 'Money', [
        'Bets and tickets come out of the Quadra balance; payouts, cash outs and prizes are paid in by the server, and you’re told. Lottery prizes are taxed bet by bet, by law: each bet paying over NT$5,000 has 20% income tax and 0.4% stamp duty withheld.',
        'What you stake each month sets your VIP tier, and part of it comes back the month after: see the Quadra Pass’s guide.'
      ]]
    ]
  },
  match: {
    zh: [
      ['what', 'Orbit Sports 是什麼', [
        'Orbit 的運動 App：台灣看得到的每個聯賽（愛爾達 ELTA.tv 和 Apple TV）的比分、賽程、排名、球隊和球員，每場比賽的詳細數據，還有依你追蹤的排好的今天看什麼，一點就打開轉播。'
      ]],
      ['tabs', '每個分頁', [
        '「首頁」：今天看什麼。正在進行的比賽在最上面，接著是依你的喜好排好、時間不撞的「今日推薦」和更多推薦，再來是你的球隊今天的比賽；可以選一天（一個月前到六週後，📅 選任何一天），或只看追蹤、我的球隊或某個運動。',
        '「賽事」：依運動和聯賽找比賽，打開就在離現在最近的比賽日；賽程、排名、季後賽／淘汰賽；最上面搜尋聯賽、球隊和球員（中文英文都可以）。F1 每站一張卡。',
        '「轉播」：什麼時候、在哪一台。正在轉播的比賽（點「觀看」直接開愛爾達或 Apple TV）、你追蹤的接下來 7 天的轉播、接下來 24 小時的其他比賽、剛結束的，和愛爾達完整轉播表。',
        '「追蹤」：你追蹤的比賽、球隊和選手現在怎麼樣：排名、近況、上一場和下一場；「我的設定」也在這裡。',
        '右上角：說明、重新整理和你的 Quadra Pass；再點一次目前的分頁會回到頂端。'
      ]],
      ['game', '比賽頁', [
        '比分、系列賽戰況和逐局（節、半場）比分；進行中有即時面板（壘包和球數、進球和紅牌、得分最多的球員）和勝率走勢，按住走勢看每個時刻，關鍵時刻標在線上。',
        '概況、數據、球員（box score，可以排序）、過程（每一球、每一回合）、先發和場上球員、陣容、傷兵、排名和比賽資訊。點任何球員打開他在這場的數據。',
        '結束的比賽有精華影片（YouTube 的官方影片）和重播：愛爾達的整場影片，或 48 小時內的頻道回看；MLS 開 Apple TV 那場比賽的頁面。'
      ]],
      ['follow', '追蹤與通知', [
        '「我的設定」（追蹤分頁）：運動依優先順序排（第一個最優先）、各運動的聯賽、追蹤的對象和喜歡的轉播語言（英文原音、中文、雙語）。球隊和選手在他們的頁面或比賽頁按「+ 追蹤」，追蹤球隊也會追蹤它的聯賽；單一場比賽按「追蹤這場」、F1 按「追蹤這一站」，開始後兩天自動移除。',
        '通知：追蹤的球隊開賽（有台灣轉播時）和終場比分、今日推薦每一場開賽和賽果、F1 的排位賽、衝刺賽和正賽開始，和衝刺賽、正賽的前三名；每一種都能在 Quadra Pass 的通知各自開關。',
        '球隊頁和比賽概況有傷兵報告（NBA、WNBA、NFL、NHL、MLB）：誰受傷、狀態、預計何時回歸；球員頁有 🩹 標記。F1 比賽中的賽事幹事訊息會翻成中文。'
      ]],
      ['picks', '今日推薦', [
        '只推薦在台灣有轉播的比賽：依你追蹤的運動順序、你的球隊、兩隊的排名和實力差距、比賽的重要性（榜首對決、季後賽、決賽）、愛爾達當時主推的那場，和你平常看什麼，挑出時間不撞的一組，附上推薦的原因。',
        '一天從 05:00 到午夜。0 點到 5 點的比賽不會進今日推薦（你的球隊和追蹤的比賽例外）：你追蹤的聯賽每一場都列在其他推薦裡，其他聯賽只列值得熬夜的（季後賽、決賽、系列賽）。'
      ]],
      ['watch', '台灣轉播', [
        'Orbit Sports 只列在台灣看得到的聯賽：愛爾達 ELTA.tv（MLB、中職部分場次、NBA 部分場次、英超、義甲、德甲、法甲、蘇超、足總盃、歐冠、歐霸、歐協聯、國家聯賽、F1 每一節）和 Apple TV（MLS 每一場）。',
        '每場比賽標出頻道和語言（英文原音、中文、雙語），比賽進行中有「觀看」。轉播權會變動，以各平台公告為準。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Sports 不用錢：看比賽、追蹤都免費。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Sports is', [
        'Orbit’s sports app: every league you can watch in Taiwan (ELTA.tv and Apple TV), with scores, schedules, tables, teams and players, every game in detail, a day planned around what you follow, and one tap to watch.'
      ]],
      ['tabs', 'The tabs', [
        'Home: what to watch today. Games on now come first, then today’s picks (ranked for you, no clashes) and more picks, then your teams’ games today; pick a day (a month back to six weeks ahead, 📅 for any), or only what you follow, your teams or one sport.',
        'Matches: find games by sport and league, opening on the game day nearest now; schedule, tables, playoffs or knockouts; search leagues, teams and players at the top (Chinese or English). F1 has a card per weekend.',
        'On TV: when and where. What’s on now (Watch opens ELTA or Apple TV), your follows’ games in the next 7 days, the next 24 hours’ other games, games just ended, and ELTA’s whole guide.',
        'Following: how the matches, teams and drivers you follow are doing: table place, form, last and next game; My settings lives here too.',
        'Top right: help, refresh and your Quadra Pass; tap the open tab again to go back to its top.'
      ]],
      ['game', 'A game’s page', [
        'The score, the series and the line score; while it’s on, a live panel (bases and count, goals and red cards, the top scorers) and the win chance over time: hold it to read any moment, the key moments marked on its line.',
        'Summary, stats, players (box scores, sortable), plays (every pitch or possession), starters and who’s on now, line-ups, injuries, the table and the game’s details. Tap any player for his numbers in this game.',
        'A game over has its highlights (the official video on YouTube) and its replay: ELTA’s whole game, or its channel’s catch-up within 48 hours; for MLS, Apple TV’s page of that game.'
      ]],
      ['follow', 'Following and notices', [
        'My settings (in Following): your sports in order (the first counts most), each sport’s leagues, who you follow and the commentary you like (English, Chinese, both). Follow a team or player with + Follow on their page or a game’s, which follows its league too; Follow this game, or Follow this race weekend for F1, is let go two days after it starts.',
        'Notices: a followed team’s game starting (when it’s on TV here) and its final score, each of today’s picks starting and its result, and F1’s qualifying, sprint and race starting, and the sprint’s and race’s top three; each kind has its own switch in the Quadra Pass’s notifications.',
        'Team pages and a game’s summary have the injury report (NBA, WNBA, NFL, NHL, MLB): who, their status and when they’re expected back; a player’s page has a 🩹 tag. F1 race control messages are translated into Chinese.'
      ]],
      ['picks', 'Today’s picks', [
        'Only games on TV in Taiwan are picked: by your sports’ order, your teams, both sides’ places and how even they are, what’s at stake (a top-of-the-table game, playoffs, a final), ELTA’s featured game at that hour and what you usually watch, chosen so none clash, each with its reasons.',
        'A day runs from 05:00 to midnight. A game between midnight and 5 is never one of today’s picks (unless it’s your team’s or a game you follow): every game of your own leagues is among the other picks, and of other leagues only one worth staying up for (a playoff, a final, a series game).'
      ]],
      ['watch', 'Watching in Taiwan', [
        'Orbit Sports lists only leagues you can watch in Taiwan: ELTA.tv (MLB, some CPBL and NBA games, the Premier League, Serie A, the Bundesliga, Ligue 1, the Scottish Premiership, the FA Cup, the Champions, Europa and Conference Leagues, the Nations League, every F1 session) and Apple TV (every MLS game).',
        'Each game shows its channel and commentary (English, Chinese or both), and Watch while it’s on. Rights change; each service’s own listings decide.'
      ]],
      ['money', 'Money', [
        'Orbit Sports uses no money: watching and following are free.'
      ]]
    ]
  },
  vocab: {
    zh: [
      ['what', 'Orbit Words 是什麼', [
        'Orbit 的背單字 App：大考中心高中英文參考詞彙 6,169 字，每個字都有真人發音，記憶模型替你安排什麼時候複習。沒有網路也能用，進度每一步都存在手機上，連上網路再和 Quadra Pass 合併。'
      ]],
      ['tabs', '每個分頁', [
        '「今天」：今天的目標、連續天數、等級，該複習、還沒學和已精熟的字數，一鍵開始這一輪；背新字、上次答錯的字用卡片看一遍，還有今日單字。',
        '「練習」：選級別、學習方式（智慧、選意思、選英文、聽音選字、拼字母、填空、聽寫）和發音的語速。',
        '「複習」：答錯、該複習、學習中、收藏的字分開列，寫著每個字錯在哪裡（拼錯的地方、選成或聽成哪個字、不認識），可以搜尋和排序；「卡片複習」一張一張翻（點一下翻面、左右滑換張），看完再測驗這批字，測驗才會更新記憶模型。',
        '「單字」：全部的字，照級別、新字／學習中／精熟／收藏篩選，英文或中文都能搜尋。',
        '「進度」：各級別學到哪裡、正確率和每題花的時間、最近 14 天、接下來 7 天要複習多少、學會的字記得多久、記憶模型怎麼配合你，還有最常忘的字。',
        '點任何一個字都會打開它的卡片：完整意思、記憶小撇步、你搞混過和常被搞混的字、你拼錯的樣子、作答紀錄和現在還記得的機率；按 ☆ 收藏，或按「我會了」不再考。'
      ]],
      ['words', '背單字', [
        '大考中心高中英文參考詞彙第 1 到 6 級，每個字都有真人發音錄音（Microsoft Jenny），不會打斷你正在聽的音樂。每一輪 10、20 或 30 個字，混合該複習的字和新字；答錯的字會在這一輪最後換個方向再問一次（選錯的從另一邊問，拼錯的改聽寫）。「背新字」一張一張看新字（發音、意思），背滿一批就考這批字，考完之後照記憶模型排複習。',
        '題目故意出得難，因為想得辛苦才記得住：錯的選項都是最容易選錯的字：拼法幾乎一樣的（adapt、adopt、adept）、意思很接近的、同詞性同長度的、常被搞混的，還有你以前搞混過的那個字；不會出兩個都對的選項。',
        '新字在一輪裡第一次出現是一題「檢查」：看字（聽發音）從四個意思選一個，下面有「不認識」，不用猜。一眼就答對算已經會，六週後才再問；答得穩三週後；答得慢幾天內再問；答錯就開始學。要考哪些新字，是照你的作答紀錄猜：你在哪個級別、哪種詞性、多長的字比較常錯，還有跟你最近答錯的字長得像的字，最可能不會的先考。',
        '「智慧」模式照這個字練到哪裡出題：還在學的，練兩個方向和聽音（選意思、選英文、聽音選字）；記穩了就考聽寫。填空和拼字母不在智慧模式裡，可以在「練習」單獨選；片語不考聽寫。',
        '每個字有自己的記憶模型（FSRS，Anki 用的排程）：記得多穩（天數）和對你多難。算出還記得的機率掉到 90% 時，它就該複習；對你容易的字等到 80–85% 才考，時間留給弱點。隔越久還答對、用寫的答對、答得快，下次就隔越久；選擇題答對、答得慢，加得少；答錯會大幅縮短，這個字也會被記成比較難。記得超過 10 天算「精熟」。每一輪先考最可能忘的字，把你搞混過的字排在同一輪讓你分辨，長得像的字不會連著出；還在學的字太多時少加新字，沒什麼要複習時新字最多占一輪的六成。'
      ]],
      ['goal', '每日目標與等級', [
        '一天回答 20 題就達成今天的目標，連續天數 +1；開啟通知後，晚上 8 點還沒練習會提醒你（App 關著也會）。',
        '每答對一題 2 XP，第一次精熟一個字再加 15 XP。累計積分決定等級（Lv 2 要 100 XP、Lv 5 要 1,600、Lv 10 要 8,100、Lv 20 要 36,100），每幾級換一個稱號：新手、學徒、好手、高手、達人、大師、傳奇、神話。積分只是你的學習紀錄，不能換任何東西。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Words 不用錢，也不發錢：練單字永遠免費。帳戶、Quadra Plus、頭像和錢的真相，都在每個 App 右上角的 Quadra Pass 裡。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Words is', [
        'Orbit’s vocabulary app: the 6,169 words of Taiwan’s high-school English reference list, each recorded by a real voice, with a memory model deciding when each comes back. It works offline: progress is kept on the phone at every step and merged with your Quadra Pass once you’re online.'
      ]],
      ['tabs', 'The tabs', [
        'Today: the day’s goal, your streak and level, how many words are due, new and mastered, and a round a tap away; new words to study as cards, last time’s missed words as cards, and the word of the day.',
        'Practice: the levels, the way to learn (smart, meaning, English, by ear, letters, fill in, dictation) and the voice’s speed.',
        'Review: missed, due, learning and bookmarked words apart, each saying how it went wrong (where it was misspelt, the word it was taken for, not known), searchable and sortable; flash cards one at a time (tap to flip, swipe for the next), then a test on the deck, which is what updates the memory model.',
        'Words: every word, filtered by level and new / learning / mastered / bookmarked, searchable in English or Chinese.',
        'Progress: each level’s progress, accuracy and seconds an answer, the last 14 days, reviews due in the next 7, how long learnt words stay remembered, how the model fits you, and the words you forget most.',
        'Tap any word for its card: the whole meaning, a way to remember it, the words you mixed it up with and the ones it’s often confused with, how you misspelt it, your answers and the chance you still know it; ☆ bookmarks it, I know this puts it away.'
      ]],
      ['words', 'Learning words', [
        'Levels 1 to 6 of the College Entrance Examination Center’s list, each word recorded by a real voice (Microsoft Jenny), played without stopping your music. A round is 10, 20 or 30 words, due ones and new ones mixed; a missed word comes back at the end of the round the other way round (picked wrong: from the other side; misspelt: dictated). Study new words shows them one at a time (sound, meaning); a full batch is then quizzed, and the quiz starts their schedule.',
        'Questions are hard on purpose, because effortful recall is what sticks: every wrong option is the likeliest slip: spelt almost the same (adapt, adopt, adept), close in meaning, the same part of speech and length, commonly confused, or a word you’ve mixed it up with before; two options are never both right.',
        'A new word’s first question in a round is a check: the word (and its sound) and four meanings, with I don’t know under them, so there’s no guessing. Right at a glance, it’s known and back in six weeks; steady, in three; slow, within days; missed, it’s learnt. Which new words come first is guessed from your answers: the levels, parts of speech and lengths you miss most, and look-alikes of your latest misses; the likeliest unknown first.',
        'Smart mode asks what a word is being trained in: while it’s learnt, both ways and by ear (meaning, English, by ear); once it’s held, dictation. Fill in and letters aren’t in smart mode; choose them in Practice. Phrases are never dictated.',
        'Every word has its own memory model (FSRS, Anki’s scheduler): how stable it is (in days) and how hard it is for you. When the chance you still remember it falls to 90% it’s due; words that are easy for you wait until 80–85%, so time goes to weak spots. Right after a long gap, typed, or fast pushes the next review further out; multiple choice or slow adds less; a miss cuts it sharply and marks the word harder. Over 10 days is mastered. Each round asks the words likeliest forgotten first, puts the words you’ve confused together so you can tell them apart, and never asks look-alikes back to back; with many words still being learnt it adds fewer new ones, and with little due new words take up to 60% of a round.'
      ]],
      ['goal', 'Daily goal and level', [
        'Answer 20 questions in a day to meet the goal and add a day to your streak; with notices on, you’re reminded at 8 pm if you haven’t practised yet (with the app closed too).',
        'Each right answer earns 2 XP and a word’s first mastery 15 more. Total XP sets your level (Lv 2 at 100 XP, Lv 5 at 1,600, Lv 10 at 8,100, Lv 20 at 36,100), with a new title every few levels: Rookie, Apprentice, Skilled, Expert, Master, Grandmaster, Legend, Mythic. XP is only a record of learning; it buys nothing.'
      ]],
      ['money', 'Money', [
        'Orbit Words uses no money and pays none: learning is always free. Your account, Quadra Plus, looks and the truth about money are in the Quadra Pass at the top right of every app.'
      ]]
    ]
  },
  orbit: {
    zh: [
      ['what', 'Orbit Class 是什麼', [
        'Orbit 的課表 App。打開就知道現在是哪一節、還剩幾分鐘、下一節是什麼。課表存在 Quadra Pass，登入的每台裝置都一樣；沒有網路也能看，改的地方連上網路再送出。'
      ]],
      ['tabs', '每個分頁', [
        '「今天」：目前這一節（午休、打掃也算）、倒數和下一節；下面是今天的全部課程，點一節看詳細資料（一週哪幾天、第幾節上這門課）。今天的課上完了，就換成下一個上課日的課。倒數活動也在這裡，左右滑動換一個。',
        '「課表」：選星期看那天的課，上方切換單週或雙週（附日期），隔週上的課兩週都看得到；下面是之後的調課。',
        '「工具」：整週課表和「編輯課表」（課程、老師、時間和倒數活動）；AI 課表編輯（用一句話修改）和拍照匯入；分享金鑰。'
      ]],
      ['swap', '調課', [
        '點一節課再按「調課」，或在「課表」按「新增調課」，選要對調的另一節（同一天、別天或別週都可以；選空堂就是把課搬過去，週六補課也可以）。隔週上的課，先在「課表」切到那一週再點。',
        '只換那兩天，其他週照舊；調過的課標著橘色「調課」，通知也跟著換。點那節或「課表」裡的調課可以取消。'
      ]],
      ['notify', '上課提醒與假日', [
        '每堂課開始前 5 分鐘通知你課名、時間、老師和教室，App 關著也會；開關在 Quadra Pass 的通知。',
        '國定假日和補假沒有課，也不會通知；「下一個上課日」會跳過它們。倒數活動打開「結束後自動刪除」，活動過了就自己刪掉。'
      ]],
      ['share', '分享課表', [
        '課表只有建立它的 Quadra Pass 能編輯。要分享時在「工具」按「產生分享金鑰」（24 小時內有效），對方在自己的 Orbit Class 輸入就得到一份自己的副本，可以自己改。',
        '另一台裝置在你之後改過課表時，以比較新的為準，這台的修改會先另外存起來並告訴你，不會蓋掉。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Class 不用錢。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Class is', [
        'Orbit’s class schedule app: open it to see the period now, the minutes left and what’s next. The schedule lives on your Quadra Pass, the same on every device you sign in on; it opens offline too, and an edit made then is sent once you’re back online.'
      ]],
      ['tabs', 'The tabs', [
        'Today: the period now (lunch and cleaning too), its countdown and the next; below, the whole day, a tap on a class for its details (which days and periods it meets). Once the day’s classes are over, it shows the next school day’s. Countdowns are here too: swipe between them.',
        'Timetable: pick a weekday for its classes, odd or even week at the top (with dates), so a class met every other week shows in both; the swaps to come below.',
        'Tools: the whole week and Edit timetable (classes, teachers, times and countdowns); AI timetable edit (change it in a sentence) and photo import; share keys.'
      ]],
      ['swap', 'Swapping classes', [
        'Tap a class and Swap, or Swap a class in Timetable, then pick the period to trade with (the same day, another day or another week; a free period moves the class there, a Saturday make-up too). For a class met every other week, switch Timetable to that week first.',
        'Only those two dates change, every other week as before; a swapped class carries an orange Swap tag, and its notice follows it. Tap it, or the swap in Timetable, to undo it.'
      ]],
      ['notify', 'Class reminders and holidays', [
        'Five minutes before each class you’re told its name, time, teacher and room, with the app closed too; the switch is in the Quadra Pass’s notifications.',
        'Taiwan’s holidays and their make-up days off have no classes and no reminders, and the next school day skips them. A countdown with Delete when over clears itself once it has passed.'
      ]],
      ['share', 'Sharing a schedule', [
        'Only the Quadra Pass that made a schedule edits it. To share it, make a share key in Tools (valid 24 hours): entering it in their own Orbit Class gives a classmate their own copy to change as they like.',
        'If another device changed the schedule after you, the newer one stands: the change made here is set aside on the device and you’re told, never written over it.'
      ]],
      ['money', 'Money', [
        'Orbit Class uses no money.'
      ]]
    ]
  },
  weather: {
    zh: [
      ['what', 'Orbit Weather 是什麼', [
        'Orbit 的天氣 App：一個答案的天氣。中央氣象署、Google 和環境部的預報和測站的實測，合成一份約 1 公里的預報：會不會下雨、要不要帶傘、穿什麼、紫外線和空氣品質。沒有網路時打開上次的預報。'
      ]],
      ['tabs', '畫面', [
        '每個地點一頁，左右滑動整頁（或點上面的地點）切換「我的行程」、目前位置和各個釘選地點。',
        '一頁由上到下：鄉鎮、現在的天氣、今天最高最低和體感、一句話；接下來 24 小時（每 3 小時）；紫外線、降雨機率、空氣品質三張小卡；建議（帶傘、防曬、穿什麼、口罩、熱、這一週）；10 天預報；更多資訊（風、氣壓、濕度、能見度、日出日落、最近測站的實測）。',
        '點最上面的天氣看今天，點 10 天預報的任一天看那一天的逐時溫度、降雨和紫外線，左右滑動換一天。三張小卡打開是大圖，上方切換今天（晚上 6 點後是今晚到隔天早上）、明天和之後每一天。按住圖表滑動看每小時（或每天）的數字。',
        'App 開著時資料滿 15 分鐘就更新；超過 30 分鐘沒更新會變淡並寫著是多久以前的。定位關掉或抓不到時顯示上次的位置，按「定位」重新抓。'
      ]],
      ['pins', '釘選地點與我的行程', [
        '地點列最後的「+ 釘選」新增地點：名稱、鄉鎮，和你在那裡的星期和時間；那段時間打開 App 會直接顯示那裡。打開「這是我的家」，沒有其他行程的時間就當作在家。釘選地點的頁面最下面可以編輯。',
        '「我的行程」每個小時取你那時在的地方的天氣，拼成一頁（例如平日 7 到 17 點在學校，其他時間在家）；手機發現你在別的地方，就用你真正在的地方。放假日不算學校的行程。'
      ]],
      ['notify', '設定與通知', [
        '右上角的 ⚙︎：卡片的順序、關掉不需要的卡片，和早晨天氣的時間。',
        '早晨天氣：每天在設定的時間一句話（降雨、溫度、紫外線、空氣），以那時的釘選地點為準。降雨提醒：白天 2 小時內可能下雨時，一天最多一次。兩個開關都在 Quadra Pass 的通知。'
      ]],
      ['money', '錢怎麼算', ['Orbit Weather 不用錢。']]
    ],
    en: [
      ['what', 'What Orbit Weather is', [
        'Orbit’s weather app: one answer. The Central Weather Administration’s, Google’s and the Ministry of Environment’s forecasts and real station readings, blended into one forecast for about a square kilometre: will it rain, take an umbrella, what to wear, UV and air quality. Offline, it opens on the last forecast.'
      ]],
      ['tabs', 'The screen', [
        'Each place is a page: swipe the whole page (or tap a place at the top) between My day, where you are and each pinned place.',
        'A page from the top: the township, the weather now, today’s high and low with feels-like, one sentence; the next 24 hours (every 3); UV, rain and air cards; advice (umbrella, sunscreen, what to wear, mask, heat, the week); 10 days; more (wind, pressure, humidity, visibility, sunrise and sunset, the nearest station’s reading).',
        'Tap the weather at the top for today, or any of the 10 days for that day’s hourly temperature, rain and UV, swiping to the next day. The three cards open into big charts, with today (from 6 pm tonight into the morning), tomorrow and each day after at the top. Hold a chart and slide for each hour (or day).',
        'While the app is open the forecast refreshes once it’s 15 minutes old; over 30 minutes old it fades and says how old it is. With location off or not found, the last place is shown: Locate asks again.'
      ]],
      ['pins', 'Pinned places and My day', [
        '+ Pin at the end of the places adds one: a name, a township, and the days and hours you’re there; opening the app in those hours shows it. Turn on This is my home, and any hour without another place counts as home. A pinned place’s page has Edit at its foot.',
        'My day stitches each hour’s weather from where you’ll be then (school 7 to 17 on weekdays, home the rest, say); when the phone finds you somewhere else, where you really are is used. Holidays don’t count school.'
      ]],
      ['notify', 'Settings and notices', [
        '⚙︎ at the top right: the cards’ order, hiding the ones you don’t need, and the morning brief’s time.',
        'Morning weather: one line each day at that time (rain, temperature, UV, air), for the pinned place you’re at then. Rain alert: rain likely within 2 hours in the daytime, once a day at most. Both switches are in the Quadra Pass’s notifications.'
      ]],
      ['money', 'Money', ['Orbit Weather uses no money.']]
    ]
  },
  slip: {
    zh: [
      ['what', 'Orbit Slips 是什麼', [
        'Orbit 的運彩追蹤：你在台灣運彩買的注單，比賽即時跟著看。每張注單顯示每場的比分、這張現在還會中的機率、現在值多少，和彩券拿走多少。注單存在 Quadra Pass，換手機也在；沒有網路時用手機上的副本。'
      ]],
      ['add', '新增注單', [
        '「拍注單自動填入」：拍注單或截圖，Gemini 讀出每一場、玩法和賠率，對到真的比賽後填進下面，確認後再儲存；對不到的會列出來讓你手動加。每個帳戶一天可以掃 30 張。',
        '手動新增：選聯盟和日期（昨天到後天），點比賽選玩法（不讓分、讓分、大小、單雙），每一邊都標出運彩大概的賠率；輸入注單上的賠率，會算出公平價和彩券的抽成。過關方式（單場、N串1、N串M）和每組金額填好就能儲存。'
      ]],
      ['live', '比賽中', [
        '每場的圓圈：現在會中是綠色、不會中是紅色，進行中會跳動；結束後打勾、打叉或退回。每張注單：全中可得（稅後）、現在價值（從現在起平均拿回多少）、有派彩的機率，和開賽前的機率做比較。',
        '「看數字」打開三張收據：全中的話（或已結算的派彩）稅前派彩、所得稅 20% 和印花稅 0.4% 一行一行列出；開賽前的機會；長期平均拿回多少。'
      ]],
      ['math', '機率怎麼算', [
        '每場比賽的比分模型，用 DraftKings 的收盤盤口（經 ESPN，抽水拿掉）去配：足球和冰球用 Poisson 進球，其他用分差和總分的常態分布。比賽中把剩下的時間按比例算，加上現在的比分。沒有盤口的比賽，用注單賠率扣掉運彩量到的抽成估計（標「估」）。',
        '派彩照台灣運彩的規則：每個組合超過 NT$5,000 預扣 20.4%；全部打平或比賽取消算 1.00。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Slips 不賣彩券，也不碰錢：只是幫你看已經買的注單。帳戶、Quadra Plus 和錢的真相，都在右上角的 Quadra Pass 裡。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Slips is', [
        'Orbit’s tracker for the tickets you bought at Taiwan Sports Lottery, followed live: each ticket shows its games’ scores, the chance it still lands, what it’s worth now and what the lottery takes. Tickets are kept on your Quadra Pass, so a new phone has them; offline, the copy on the phone.'
      ]],
      ['add', 'Adding a ticket', [
        'Scan a ticket: a photo or screenshot, read by Gemini; each game, market and price is matched to a real game and filled in for you to check before saving; any it can’t place are listed to add by hand. 30 scans a day an account.',
        'By hand: pick the league and day (yesterday to the day after tomorrow), tap a game and its market (moneyline, spread, total, odd/even); each side shows the lottery’s likely price; type the ticket’s odds to see the fair price and the cut. Set the kind (single, N-leg parlay, system) and the stake per combination, and save.'
      ]],
      ['live', 'While it plays', [
        'Each pick’s ring: green when it would win now, red when not, pulsing while live; a tick, a cross or a return once decided. Each ticket: the payout if all land (after tax), what it’s worth now (the average payout from here), the chance of any payout, against where it stood before the games.',
        'The numbers opens three receipts: the payout if all land (or what it paid), with the 20% income tax and 0.4% stamp duty line by line; the chances before the games; and the long-run average.'
      ]],
      ['math', 'How the chances are worked out', [
        'Each game’s score model is fitted to DraftKings’ closing lines (through ESPN, the margin taken out): Poisson goals for soccer and hockey, a normal margin and total for the rest. In play, the rest of the game is scaled to the time left, plus the score. A game with no market uses the ticket’s odds less the lottery’s measured cut (marked est.).',
        'Payouts follow Taiwan Sports Lottery’s rules: 20.4% withheld on any combination over NT$5,000; a push or a game called off counts 1.00.'
      ]],
      ['money', 'Money', [
        'Orbit Slips sells nothing and moves no money: it only follows tickets you’ve bought. The account, Quadra Plus and the truth about the money are in the Quadra Pass, top right.'
      ]]
    ]
  },
  beats: {
    zh: [
      ['what', 'Orbit Beats 是什麼', [
        'Orbit 的節拍作曲：給它一組節拍片段（鼓、貝斯、旋律、Loop），它聽出速度和每段的角色，排成一首首新歌。全部在手機上算，什麼都不上傳；沒有網路也能用。'
      ]],
      ['tabs', '每個分頁', [
        '「做歌」：放片段，選情境（放鬆、熱血、律動、經典）或鼓的風格、首數，做出來的歌在這裡播。',
        '「樂器」：用 App 自己的樂器做片段：鼓組（或打擊樂）或旋律，1、2 或 4 小節。鼓再點一下是重音、第三下拿掉；旋律可以一次放和弦。搖擺、復原、把第一小節複製到每一小節；「自動編」幫你起個頭。按「加進片段」，歌就用它；「♡ 收藏」留在收藏的片段裡，也能匯出 MIDI。',
        '「即興」：每段片段一個打擊墊，配上用你的鼓打的節奏。Loop 從下一小節開始，再點一下停；單擊的對到你選的格子（16 分、8 分、拍或自由）。按「● 錄一段」，錄下來的就是一首歌，在「做歌」裡。',
        '「歌單」：按 ♡ 留下的歌，在這支手機上；找歌名、節奏或調，四種排序，改名、分享、刪除，看到的一次下載成 zip。'
      ]],
      ['add', '放進片段', [
        '一段錄音（片段之間留 0.2 秒以上的安靜，會自動切開）、一整包取樣，或用麥克風錄；WAV 最好，m4a、mp3 也可以。切出來的數量不對，到「切片」把「安靜門檻」調高（例如 -60 dB）。'
      ]],
      ['roles', '速度與角色', [
        '速度從片段聽出來；聽成一半或兩倍時按 ½ 或 ×2，也可以輸入或點拍子。每段的角色（Riff、樂句、貝斯、Hi-hat、過門、大鼓、808、小鼓、Tick、滾奏、不用）也是聽出來的，選單可以改，改過的不會被蓋掉。至少要有一段 Riff 或樂句。'
      ]],
      ['make', '做歌', [
        '20 種鼓的風格：四拍、嘻哈、Trap、半速、碎拍、House、Dembow、Afro、Drill、Boom Bap、Jersey、Amapiano、Lo-fi、放克、UK 車庫、D&B、雷鬼、Phonk、Baile、Techno。每首有段落圖（前奏、主歌、導歌、副歌、間奏、橋段、尾奏）。',
        '「⋯」：變奏一首、換個鼓、編排（段落上移、重複、換段落、改小節數或拿掉）、分享、下載 WAV、下載分軌、匯出 MIDI。播放器播完接下一首、單曲重複或重複這一段。',
        '「混音」預設打開；關掉的話，每段跟錄的一模一樣。'
      ]],
      ['pass', '存在 Quadra Pass 的', [
        '設定、每組片段的速度和你改過的角色，和每種風格收藏了幾首；打開「依你的口味」，做歌就偏向你喜歡的。聲音本身不離開手機。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Beats 免費，不碰錢。帳戶、Quadra Plus 和錢的真相，都在右上角的 Quadra Pass 裡。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Beats is', [
        'Orbit’s beat maker: give it a set of beat pieces (drums, bass, melodies, loops) and it hears the tempo and what each piece is, then arranges them into new songs. It all runs on the phone: nothing is uploaded, and it works offline.'
      ]],
      ['tabs', 'The tabs', [
        'Make: add pieces, pick a mood (Chill, Hype, Groove, Classic) or the drum styles and how many, and play the songs made.',
        'Studio: pieces on the app’s own instruments: drums (or percussion) or melody, 1, 2 or 4 bars. Tap a drum again to accent it, a third time to take it out; melody notes can go in as chords. Swing, undo, bar 1 copied over every bar; Write one gives you a start. Add to pieces and the songs use it; ♡ Keep puts it in Kept clips, and it exports as MIDI too.',
        'Jam: a pad for each piece, over a groove played on your own drums. A loop starts on the next bar and stops when tapped again; a one-shot lands on the grid you pick (16th, 8th, beat or free). Tap ● Record, and the take becomes a song in Make.',
        'Library: the songs kept with ♡, on this phone; find one by name, groove or key, four orders, rename, share, remove, and download what’s shown in a zip.'
      ]],
      ['add', 'Adding pieces', [
        'One recording (0.2 s or more of silence between pieces, split for you), a whole sample pack, or the microphone; WAV is best, m4a and mp3 work too. If the count is off, raise Silence below under Splitting (say to -60 dB).'
      ]],
      ['roles', 'Tempo and roles', [
        'The tempo is heard from the pieces; if it hears half or double, tap ½ or ×2, type it, or tap it in. Each piece’s role (riff, phrase, bass, hats, fill, kick, 808, snare, tick, roll, not used) is heard too; change it in its menu, and a role set by hand stays. At least one riff or phrase is needed.'
      ]],
      ['make', 'Making songs', [
        '20 drum styles: four, hip-hop, trap, half, broken, house, dembow, afro, drill, boom bap, Jersey, amapiano, lo-fi, funk, UK garage, D&B, reggae, phonk, baile funk, techno. Each song shows its sections (intro, verse, pre-hook, hook, break, bridge, outro).',
        '⋯: a variation, another groove, Arrange (move a section up, repeat it, change its kind or bars, or remove it), Share, Download WAV, Download stems, Export MIDI. The player goes on to the next song, repeats one, or repeats a section.',
        'Mix is on by default; off, every piece plays exactly as recorded.'
      ]],
      ['pass', 'On your Quadra Pass', [
        'Your settings, each set’s tempo and the roles you set, and how many songs you kept of each style; with Lean to your taste on, new songs lean to what you like. The sound itself never leaves the phone.'
      ]],
      ['money', 'Money', [
        'Orbit Beats is free and moves no money. The account, Quadra Plus and the truth about the money are in the Quadra Pass, top right.'
      ]]
    ]
  },
  transit: {
    zh: [
      ['what', 'Orbit Transit 是什麼', [
        'Orbit 的大眾運輸 App：全台公車、台鐵、高鐵、捷運和 YouBike，路線規劃、到站時間和導航都在一起。到站時間和規劃都是即時的，所以需要網路。'
      ]],
      ['tabs', '每個分頁', [
        '「地圖」：YouBike 站（下面一排是離你最近的五站）、每個公車站和台鐵、高鐵、捷運站；點任何一個看它的車、班次或剩幾台。找地點（連鎖店從離你最近的分店排起）或點地圖上的地方，按「路線」規劃怎麼去。釘選的地點（家、公司⋯）也標在地圖上，點一下就能規劃去那裡。',
        '「交通」：常用和釘選的行程接下來怎麼走（點一下就導航），釘選的公車、火車和地點；每條公車都寫著下一班什麼時候到（沒有車在路上時，是時刻表的下一班）。',
        '「查時刻」：台鐵、高鐵站到站（自動找最快的轉乘），附票價和今天的誤點；公車用號碼或站名找，每條路線都寫著離你最近那一站的下一班，點開看每一站現在的車，或任一天的時刻表。都可以 ☆ 釘選。',
        '「我的」：地點、行程（可以設時間、每週固定幾天，回程自動有）、釘選的公車和火車（可以分組）、交通方式的偏好（不搭哪些、每 30 分鐘換 YouBike、TPASS、導航時走路騎車交給 Google 地圖還是 Apple 地圖），和各城市的捷運路網圖。'
      ]],
      ['plan', '規劃路線', [
        '出發地可以換成釘選地點、搜尋的地點，或在地圖上選；可以設「出發時間」或「抵達時間」。每個方案都照公車實際的到站時間排好：你趕得上的那一班，後面的轉乘跟著調整，會錯過的火車會標出來。',
        '台鐵、高鐵自動找最快的轉乘站；捷運、YouBike（全程騎、騎到車站、或下車後騎）都會一起比。YouBike 照站的位置規劃，從騎車開始的行程不會選現在沒有車的站。只用你在「我的」允許的交通方式；TPASS 涵蓋的算免費。按 ☆ 把行程存起來。'
      ]],
      ['nav', '導航', [
        '地圖畫出整趟路線，畫面停在你走到的那一段：走路、騎車和等車時拉近看，坐上車看到下車的地方；你到了哪一段，就自動跳到哪一段（中途才開始也一樣）。下面列著每一步，點後面的一步可以先看。',
        '公車、火車那一步倒數到秒，寫著車還有幾站；坐上車後列出還有幾站和到每一站的時間，下一站要下車時會提醒你。點倒數可以改搭別班，沒趕上會自動換下一班；要準時到的行程趕不上時，會找同時間到的別條路。',
        'YouBike 站到了沒車或沒位，按一下改到附近的站。走路、騎車那一段可以交給 Google 地圖或 Apple 地圖看路線。上下兩張卡片點中間的短條（或往上、往下滑）可以收合，地圖就大一點。',
        '⋯ 裡的「編輯行程」可以加一站、拿掉一站或改目的地；坐在車上改，會讓你繼續坐，只換下車站。坐過站會從下一站接著規劃；好像已經下車了，會問你要不要從這裡重新規劃。',
        '導航不會占住整個 App：分頁都還在，它縮成一條。把 App 滑掉再打開會接著導航，到了就自己結束。'
      ]],
      ['alerts', '到站提醒與通知', [
        '到站提醒（🔔）：例如「5608 離我的站 5 分鐘時告訴我」，到時通知你，手機鎖著也會。',
        '導航中：該出發、要搭的公車快到了、火車快開、下一站要下車，都會通知到鎖定畫面。兩種通知都在 Quadra Pass 的通知各自開關。'
      ]],
      ['money', '錢怎麼算', ['Orbit Transit 不用錢；票價只是參考。']]
    ],
    en: [
      ['what', 'What Orbit Transit is', [
        'Orbit’s public transport app: Taiwan’s buses, railways, high-speed rail, metros and YouBike, with trip plans, arrivals and navigation in one place. Arrivals and plans are live, so it needs the connection.'
      ]],
      ['tabs', 'The tabs', [
        'Map: YouBike stations (the five nearest you along the bottom), every bus stop, and railway, high-speed rail and metro stations; tap any for its buses, trains or bikes. Find a place (a chain’s branches nearest you first) or tap one on the map, then Route to plan the way there. Your pinned places (home, work…) are on the map too; tap one to plan a trip there.',
        'Transit: your saved and pinned trips’ next ways to go (a tap navigates), and your pinned buses, trains and places; every bus says when its next one comes (the timetable’s next when none is on its way).',
        'Times: railway and high-speed rail station to station (changing wherever it’s faster), with fares and today’s delays; buses by number or stop name, each route with its next bus at its stop nearest you, opening to every stop’s buses now or any day’s timetable. ☆ pins any of them.',
        'Me: places, trips (at a time, on set weekdays; the way back comes by itself), pinned buses and trains (in groups), how you like to travel (what not to take, swapping YouBike every 30 minutes, TPASS, whether walks and rides go to Google Maps or Apple Maps), and each city’s metro map.'
      ]],
      ['plan', 'Planning a trip', [
        'Start from where you are, a pinned place, a search or a spot on the map, leaving or arriving by a time. Every plan is timed by the buses’ real arrivals: the bus you’d really catch, the rest moved with it, a train you’d now miss marked.',
        'Rail finds the fastest place to change; the metro and YouBike (all the way, to a station, or on from one) are weighed too. YouBike is planned by where stations are, but a trip that starts on a bike never picks a station with none there now. Only the ways you allow in Me are used, and what TPASS covers counts as free. ☆ saves a trip.'
      ]],
      ['nav', 'Navigation', [
        'The map draws the whole trip and shows the step you’re at: close up on a walk, a bike or waiting at the stop, to where you get off once on board; it moves to the next step by itself (started half way too). Every step is listed below; tap one ahead to look at it.',
        'A bus or train step counts down to the second and says how many stops away it is; on board, the stops still to go and when you’ll reach each, with a nudge when yours is next. Tap the countdown to take another departure; miss one and it moves to the next; on a trip to be there by a time, if you won’t make it, it looks for another way in time.',
        'A YouBike station empty or full when you get there: one tap moves you to one nearby. A walk or ride can be handed to Google Maps or Apple Maps. Tap a card’s grip (or swipe it) to fold it for more map.',
        '⋯ → 編輯行程 adds a stop, takes one off or changes where you’re going; on a bus or train you stay on it and only where you get off changes. Stayed on past your stop, it carries on from the next one; off the ride, it asks whether to plan again from where you are.',
        'It never takes the app over: the tabs stay, and it folds to a bar. Swipe the app away and it picks up where it was; it ends by itself when you arrive.'
      ]],
      ['alerts', 'Bus alerts and notices', [
        'Bus alert (🔔): “tell me when the 5608 is 5 minutes from my stop”, even with the phone locked.',
        'Navigating: time to leave, your bus nearly here, your train about to leave, your stop next, all on the lock screen. Both kinds have their own switch in the Quadra Pass’s notifications.'
      ]],
      ['money', 'Money', ['Orbit Transit is free; fares are a guide.']]
    ]
  }
};

export function helpFor(app, lang = 'zh') {
  return HELP[app]?.[lang === 'en' ? 'en' : 'zh'] || [];
}
// '#help=stock:orders' → { app: 'stock', topic: 'orders' }.
export function parseHelpHash(hash) {
  const m = /(?:^|[#&])help=([a-z]+)(?::([a-z0-9]+))?/.exec(String(hash || ''));
  return m && HELP[m[1]] ? { app: m[1], topic: m[2] || null } : null;
}
