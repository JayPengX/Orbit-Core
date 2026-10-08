// The help centre: how every app works, in one place: the Quadra Pass
// sheet's 說明 tab, in every app (pass.mjs). A page opens it with
// #help=<app> (helpUrl in quadra.mjs), or #help=<app>:<topic> for one topic.
//
// Every app's guide has the same shape, in the same words:
//   what    「X 是什麼」: its part in Quadra, in two or three lines
//   tabs    「每個分頁」: one line per tab, in the tab bar's order
//   …       what's particular to it (a few topics)
//   money   「錢怎麼算」: how it touches the one Quadra wallet
// (The Quadra Pass's own guide: what, account, one, safe, plus, vip, money.)
//
// HELP[app][lang] = [[topic id, title, [paragraphs]], …]

export const HELP_ORDER = ['pass', 'stock', 'odds', 'match', 'vocab', 'orbit', 'weather', 'transit'];

export const HELP = {
  pass: {
    zh: [
      ['what', 'Quadra Pass 是什麼', [
        'Quadra Pass 是你在所有 App 的帳號：Quadra 的 Securities、Play，和 Orbit 的 Class、Weather、Transit、Sports、Words。每個 App 都用它登入，資料都存在它裡面。',
        '通行碼是一組 10 個字的代碼，就是這個帳號的鑰匙：知道它的人就能用，所以不要給別人。它只在建立或更換時顯示一次，裝置上不會保存，請記在安全的地方。',
        '在新裝置登入：輸入通行碼，或在已登入的裝置打開帳戶，按「新增裝置」取得 8 碼裝置代碼（10 分鐘內、只能用一次）。'
      ]],
      ['account', '帳戶明細', [
        '每個 App 右上角的人像按鈕打開帳戶：帳號、開戶日期、Quadra 餘額、這個月的收入與支出，以及最近的明細（每一筆是哪個 App、做了什麼）。',
        '帳戶裡也能切換 App、新增裝置、開關通知和管理安全設定。'
      ]],
      ['one', '一次只用一個 App', [
        '同一個通行碼一次只在一個 App、一台裝置上使用。打開另一個 App（或另一台裝置），原本那個會暫停並顯示「在別處使用中」，按一下就能拿回來，資料不會互相蓋掉。',
        '從一個 App 跳到另一個（例如 Orbit Sports 的「到 Play 下注」）會自動帶著登入。'
      ]],
      ['safe', '安全', [
        '伺服器只保存通行碼的雜湊值；裝置上只有會過期、可以撤銷的登入憑證，不會有通行碼本身。',
        '帳戶裡可以「登出其他所有裝置」（這台保持登入），或「更換通行碼」（新的只顯示一次，舊的立刻失效）。忘記通行碼時，在還登入的裝置更換一組就好。'
      ]],
      ['plus', 'Quadra Plus 會員', [
        '一個會員，用在 Play 和 Securities：月繳 NT$490（第一次加入的那個月免費），或年繳 NT$4,900，等於每月約 NT$408、省下兩個月。從 Quadra 餘額扣款，在帳戶裡加入或管理；會員的帳戶按鈕有金色星星。',
        'Plus 是 Play 和 Securities 的會員方案，所有權益都讓下注和交易更便宜或更大：Play 每週一送 NT$200 免費投注（每月約 NT$867）、3 關以上串關加成 ×1.5、提前兌現只扣 2%（一般 5%）；Securities 手續費 2.8 折、換匯點差減半、融資利率少 1%。另外會員可以在 Quadra Pass 的「Plus」自訂頭像和頭像框，所有 App 的帳戶按鈕都看得到。它怎麼替 Quadra 賺錢，Quadra Pass 的「真相」算給你看。會員卡上會顯示本月和加入以來回饋了多少。每週免費投注入帳時會通知你；續訂前三天（第一個免費月也一樣）會提醒扣款金額，想停就到 Quadra Pass › Plus › 管理會員。每月 1 日從餘額自動扣款，沒打開 App 也照扣；餘額不足扣款失敗，會員就停止，要重新加入。取消後用到期滿，已付不退費，價格含 5% 營業稅。免費投注照運彩業者的規則：每個選項賠率 1.50 以上、不能提前兌現、7 天內用完。',
        '月繳隨時可以取消，已付的月份照常享有權益；年繳到期自動續約，也可以在「管理會員」取消續約。'
      ]],
      ['vip', 'VIP 投注回饋與新手禮', [
        'VIP 不用加入也不用付費：每個月在 Play 的投注（運彩、彩券、刮刮樂，退款不算）決定當月等級，下個月第一次打開 App 時回饋當月投注額的一部分：🥉 銅卡 NT$10,000 起 0.5%、🥈 銀卡 NT$50,000 起 0.8%、🥇 金卡 NT$150,000 起 1.2%、◆ 黑卡 NT$500,000 起 1.5%。Play 首頁的餘額卡上看得到本月等級和離下一級還差多少。',
        '新手禮：在 Play 第一次用自己的錢下注後，送一張 NT$200 免費投注（7 天內有效）；在 Securities 的第一筆交易免手續費（稅和規費照收）。'
      ]],
      ['money', '錢怎麼算', [
        '所有 App 共用一個新台幣錢包。新帳號開戶金 NT$30,000；每個月 1 日固定發薪 NT$6,000，跟薪水一樣，存多存少都一樣。系統發的錢只有三種：開戶金、月薪，和財富等級獎勵（身價第一次到達一個等級時送一次，小資族 NT$1,000 到億萬大亨 NT$30,000）。月薪在那個月第一次打開任何 App 時入帳，沒打開的月份下次補發。Quadra Pass 的「真相」把你的錢分成三方：系統發的、Quadra 收走的（Play 的莊家優勢、Plus、透支利息），和你自己的成績。',
        '餘額可以是負的（透支），每月計息 1%。就像交割款沒付，2 天內沒補足就是違約交割：扣透支金額 7% 的違約金、自動賣出持股補足，而且 5 年內不能融資、融券。自己先賣就沒事。融資借來的錢只能留在 Securities 買賣，不能拿去 Play 或補透支。',
        'Securities 投資、Play 下注和買彩券；Orbit 的 App 都不用錢。錢只存在 Quadra Pass，不能在帳號之間轉。'
      ]]
    ],
    en: [
      ['what', 'What the Quadra Pass is', [
        'The Quadra Pass is your account in every app: Quadra’s Securities and Play, and Orbit’s Class, Weather, Transit, Sports and Words. Each signs in with it and keeps its data on it.',
        'The pass is a 10-character code, the key to the account: anyone who knows it can use it, so keep it to yourself. It’s shown only when it’s made or changed and never kept on a device: write it down somewhere safe.',
        'On a new device, enter the pass, or on a signed-in device open the account and choose “Add a device” for an 8-character device code (10 minutes, once).'
      ]],
      ['account', 'Account details', [
        'The person button at the top right of every app opens the account: its number, when it was opened, the Quadra balance, this month’s money in and out, and the latest entries (which app, what for).',
        'The account also switches apps, adds devices, turns notices on and off and holds the security settings.'
      ]],
      ['one', 'One app at a time', [
        'A pass is used in one app on one device at a time. Opening another app (or device) pauses the first, which says it’s in use elsewhere; one tap takes it back, so nothing overwrites anything.',
        'Going from one app to another (Bet in Play from Orbit Sports, say) arrives signed in.'
      ]],
      ['safe', 'Security', [
        'The server keeps only a hash of the pass; devices keep only sign-ins that expire and can be revoked, never the pass itself.',
        'The account can sign out every other device (this one stays in) or change the pass (the new one is shown once, the old one stops at once). Forgot it? Change it from a device that’s still signed in.'
      ]],
      ['plus', 'Quadra Plus', [
        'One membership for Play and Securities: NT$490 a month (the first month you ever join is free), or NT$4,900 a year, about NT$408 a month with two months free. It comes from the Quadra balance; join or manage it in the account, and a member’s account button has a gold star.',
        'Plus is Play’s and Securities’ membership, and every perk makes betting or trading cheaper or bigger. Play: a NT$200 free bet every Monday (about NT$867 a month), the parlay boost ×1.5 on 3 picks or more, and cash out keeps 2% instead of 5%. Securities: commission at 28% of the usual rate, half the FX spread, and margin loans 1 point cheaper. Members can also pick an avatar and a frame in the Quadra Pass’s Plus tab, shown on the account button in every app. How it earns Quadra money is worked out in the Quadra Pass’s Truth tab. The Plus card shows what it gave back this month and since you joined. You’re told when each weekly free bet arrives, and three days before a renewal (the free month too) what it will charge; to stop, go to Quadra Pass › Plus › Manage membership. It’s charged from your balance on the 1st of every month, whether or not you open an app; if the balance can’t cover it the charge fails and the membership stops until you join again. Cancelling keeps what’s paid, nothing is refunded, and prices include 5% VAT. Free bets follow a sportsbook’s terms: odds of 1.50 or more on every pick, no cash out, used within 7 days.',
        'Monthly stops whenever you like, keeping the perks for months paid; yearly renews each year, and renewal can be turned off under Manage membership.'
      ]],
      ['vip', 'VIP cashback and welcome offers', [
        'VIP is free and needs no sign-up: what you stake in Play in a month (bets, lottery and scratch cards; refunds don’t count) sets that month’s tier, and a share of it comes back the first time you open an app the next month: 🥉 Bronze from NT$10,000 0.5%, 🥈 Silver from NT$50,000 0.8%, 🥇 Gold from NT$150,000 1.2%, ◆ Black from NT$500,000 1.5%. Play’s balance card shows this month’s tier and what’s left to the next.',
        'Welcome offers: your first bet in Play with your own money brings a NT$200 free bet (7 days), and your first trade in Securities pays no commission (taxes and fees as usual).'
      ]],
      ['money', 'Money', [
        'Every app shares one NT$ wallet. A new pass opens with NT$30,000; the 1st of every month pays a fixed NT$6,000, like a salary: the same however much you hold. The system gives money three ways only: the opening money, the pay, and wealth level rewards (paid once, the first time what you’re worth reaches a level: NT$1,000 for Saver up to NT$30,000 for Tycoon). The pay comes the first time that month you open any app; a month you miss is paid when you’re back. The Quadra Pass’s Truth tab splits your money three ways: what the system gave, what Quadra took (Play’s house edge, Plus, overdraft interest), and your own result.',
        'The balance can go below zero (an overdraft) at 1% a month. Like an unpaid settlement, if it isn’t covered within 2 days it’s a default: a 7% penalty on what’s owed, holdings sold for it, and no margin or short selling for 5 years. Sell something first and none of that happens. Money borrowed on margin stays in Securities for trading: it can’t be bet in Play or cover an overdraft.',
        'Securities invests, Play bets and sells lottery tickets; the Orbit apps don’t use money. Money lives on the Quadra Pass only and can’t move between passes.'
      ]]
    ]
  },
  stock: {
    zh: [
      ['what', 'Quadra Securities 是什麼', [
        'Quadra 讓錢長大的地方：用錢包裡的新台幣投資全世界的股票、ETF、各國公債、共同基金、加密貨幣、黃金白銀存摺和外匯，價格都是真實市場價格。'
      ]],
      ['tabs', '每個分頁', [
        '「首頁」：帳戶摘要、為你推薦、漲跌幅並排、各分類清單（每張 15 檔）和搜尋；點任何標的看走勢、公司資料和下單。',
        '「資產」：淨值與走勢、配置、持股、現金與各幣別錢包、股利利息收入、定期定額和到價提醒。',
        '「換匯・融資」：四個畫面：換匯（你付出／你會收到，兩邊都能輸入）、匯率看板、融資（已借、維持率、還款）、理財（定存、借券出借）。',
        '定存：最少 NT$10,000，1 到 12 個月，臺灣銀行牌告固定利率（1 年 1.72%），到期本息回到現金，也可以設自動轉存。提前解約未滿 1 個月沒有利息，滿 1 個月以上按存滿的期別利率打 8 折。借券出借：整張、已交割、不是融資買進的台股或 ETF 可以借出去收借券費（股票年 1.2%、ETF 0.6%，券商收 3 成），借出去的股票不能賣，召回要 3 個營業日。單筆利息或借券費超過 NT$20,000 扣繳 10% 和 2.11% 二代健保。違約交割時銀行會先把定存解約抵債、券商召回借出的股票來賣。',
        '「紀錄」：每筆交易與異動、委託單、投資統計，以及「時光機」。'
      ]],
      ['orders', '委託單', [
        '市價單：開盤時立刻用現價成交；休市時送出的在開盤後第一個報價成交，會多保留 3%，沒用到的退回。',
        '限價單：買進到限價或更低、賣出到限價或更高才成交，沒成交前一直有效。停損／觸價單：價格穿過觸發價時用市價成交。',
        '頁面關著也照算：下次打開時，用你不在期間的歷史價格找出第一個碰到你價格的時間成交。'
      ]],
      ['fx', '換匯與外幣', [
        '每種貨幣有自己的錢包：美股用美元、日股用日圓…只有新台幣時，下單會直接換好剛好需要的金額。',
        '換匯用市場中間價再扣銀行價差；週末外匯休市照樣能換，但價差加倍，跟真的銀行一樣。'
      ]],
      ['more', '公債、融資、放空', [
        '公債有票面利率和到期日，價格跟殖利率反向；買進要付應計利息，到期自動還本。',
        '買進時可以選「融資」：成交時券商借你一部分，買的股票就是擔保，賣出時先還融資（沒有單獨借現金這回事）。融資成數和券商一樣：台股上市 6 成、上櫃 5 成，其他市場 5 成（美國 Reg T），陸股、印度股、加密貨幣、基金、黃金存摺不能融資；公債 9 成、公司債 7 成。利息加在融資上，還款或賣出時一起付。持股會分開記「現股」和「融資」：融資買進的股票是券商的擔保品，只能融資賣出（賣得的錢先還融資）或用現金償還變成現股；賣出時先賣現股。融資到期、追繳沒補足或沒有信用帳戶時，券商只會處分融資的股票，不會動你的現股。融資的股票一樣有股東權益：配股配息、股東會、現金增資都有份。',
        '融資和借券放空（任何市場）都要先開「信用帳戶」（換匯・融資 › 融資）：沒有信用帳戶時，手上的融資和放空會被券商處分。開戶條件：證券帳戶滿 3 個月、最近一年成交 10 筆以上、成交金額達額度的一半；額度 50 萬、100 萬、200 萬、300 萬、500 萬，50 萬以上還要財力證明（總資產達額度 3 成）。台股的融資、融券各用自己的額度。外匯對（例如 EUR/USD）賣出不算借券，不用信用帳戶。',
        '融資、融券期限 6 個月，到期前一個月內可以按「展延」再延 6 個月；到期沒展延，融資的股票會被賣出、融券會被買回。融券：要繳賣出金額 9 成的保證金，賣出的錢也押在券商，買回時一起退；另收 0.08% 融券手續費，不收借券利息。融券要用融券買進（或現券償還）了結；股東會、除權息前要依規定強制回補。其他市場的放空照國外券商：借券年費 3%，開倉要 150% 擔保。',
        '現股當沖：當天買進再賣出，證交稅減半（0.15%）。先賣後買要證券帳戶滿一年、最近一年成交 10 筆，收盤前一定要買回，沒買回會被自動買回。收盤後到 14:30 下的台股單進「盤後交易」（整股盤後定價、零股盤後），14:30 以收盤價撮合一次，沒成交就取消；盤中零股 9:10 開始。',
        '維持率收盤時低於 130% 會追繳，兩個營業日內要補到 166%；到期還低於 130%，融資買進的持股全部賣出（斷頭）；低於 100% 馬上強制處理。'
      ]],
      ['time', '時光機', [
        '在「紀錄」試算：幾年前投入一筆錢（或每月定期定額）到某個標的，現在會變多少，中間最大跌幅多少。'
      ]],
      ['fees', '費用', [
        '台股手續費 0.1425%（最低 NT$20，折扣後也一樣；零股最低 NT$1），賣出另收 0.3% 證交稅（ETF 0.1%、當沖 0.15%），元以下無條件捨去；每筆交易都看得到交割日（台股 T+2）；美股、日股等海外市場照複委託常見網路費率；共同基金透過基金平台申購，收 1% 申購手續費，贖回不收費。股利照各國規定預扣稅。',
        '換匯用市場中間價加減銀行價差；週末外匯休市時價差加倍。融資按天計息。',
        'Quadra Plus 會員手續費（含基金申購手續費）2.8 折、點差減半、融資利率少 1%：交易越多、借越多，省越多，這正是它要你做的事。'
      ]],
      ['money', '錢怎麼算', [
        'Securities 的新台幣就是 Quadra 餘額：買進時從錢包出去，賣出時回來。手續費和稅照各市場真實規定（台股最低 NT$20，海外是複委託常見網路費率）；股利照各國規定預扣稅，除息日取得權利，幾週後現金入帳。',
        '定期定額和股利再投入，讓錢一點一點長大。'
      ]]
    ],
    en: [
      ['what', 'What Quadra Securities is', [
        'Where Quadra’s money grows: invest the NT$ in your wallet in stocks, ETFs, government bonds, mutual funds, crypto, gold and silver passbooks and forex worldwide, at real market prices.'
      ]],
      ['tabs', 'The tabs', [
        'Home: your account at a glance, for you, gainers and losers side by side, lists by kind (15 each) and search; tap anything for its chart, company facts and the order ticket.',
        'Portfolio: net worth and its history, allocation, holdings, cash and each currency’s wallet, income, monthly plans and price alerts.',
        'FX & loans: four views: exchange (you pay / you get, type either), the rates board, loans (borrowed, the ratio, repaying) and savings (time deposits, lending shares).',
        'Time deposits: NT$10,000 or more for 1 to 12 months at Bank of Taiwan’s posted fixed rates (1.72% for a year); principal and interest come back to cash at maturity, or roll over if you choose. Closed early: no interest under a month, past that 80% of the rate for the term held. Lending shares: whole lots of settled Taiwan stocks or ETFs not bought on margin earn a lending fee (1.2% a year for stocks, 0.6% for ETFs; the broker keeps 30%); lent shares can’t be sold and take 3 business days to recall. Interest or a fee over NT$20,000 at once has 10% tax and 2.11% health premium withheld. In a default the bank breaks your deposits against the debt and the broker recalls lent shares to sell.',
        'History: every trade and change, orders, stats, and the time machine.'
      ]],
      ['orders', 'Orders', [
        'Market: fills at once while the market is open; placed while it’s closed, at the first price after the open, holding 3% extra (the unused part comes back).',
        'Limit: a buy fills at your price or lower, a sell at your price or higher, until filled or cancelled. Stop: a market order once the price passes your stop.',
        'Closed pages still count: next time, the price history of the time away finds the first moment that reached your price.'
      ]],
      ['fx', 'Exchange and currencies', [
        'Each currency has its own wallet: US stocks in US$, Japanese in yen… With only NT$, an order exchanges just what it needs.',
        'Exchange is the mid-market rate less the bank’s spread; at weekends it still works, at double the spread, like a real bank.'
      ]],
      ['more', 'Bonds, margin, shorting', [
        'Bonds have a coupon and a maturity, and their price moves against yields; buying pays accrued interest, and they repay at maturity.',
        'Buy on margin by choosing 融資 on the order: the broker lends part of it as it fills, the shares its collateral, and selling repays it first (there’s no borrowing cash on its own). How much is lent is a broker’s: Taiwan 60% listed, 50% OTC; 50% elsewhere (US Reg T); none on A-shares, Indian stocks, crypto, funds or the gold passbook; government bonds 90%, corporate 70%. Interest is added to the loan and paid when it’s repaid or the shares are sold. A holding keeps its own shares (現股) and its margin shares (融資) apart: shares bought on margin are the broker’s collateral, sold only as a margin sale (the money repays the loan first) or turned into your own by repaying in cash; a sale sells your own first. When margin is due, a call isn’t met or there’s no credit account, the broker sells only the margin shares, never your own. Margin shares keep every shareholder right: dividends, meetings and rights issues.',
        'Margin and short selling, in any market, need a credit account (FX & loans › Loans); without one, the broker closes any margin or short you hold. To open one: the brokerage account open 3 months, 10 trades in the last year, and that year’s turnover at least half the limit. Limits are NT$500k, 1M, 2M, 3M and 5M; above 500k a broker asks for proof of means (30% of the limit). In Taiwan, margin and shorts each have the limit. Selling a currency pair (EUR/USD) borrows nothing and needs no credit account.',
        'Margin and shorts run 6 months; in the last month Extend adds 6 more, otherwise they’re closed when due. A Taiwan short (融券) puts up 90% of the sale, and the sale money is held too, both back when bought back; a 0.08% handling fee, no borrowing interest. Elsewhere shorts work as abroad: a 3% yearly borrowing fee and 150% cover to open.',
        'Day trading in Taiwan: bought and sold the same day pays half the tax (0.15%). Selling first needs the account open a year with 10 trades in the last year, and must be bought back by the close, or it’s bought back for you. Orders after the 13:30 close and before 14:30 go to the after-hours sessions: matched once at 14:30 at the close, or cancelled. Odd lots trade from 09:10.',
        'Under a 130% ratio at the close, the broker calls: two business days to get back to 166%; still under 130% at the deadline, everything bought on margin is sold; under 100% it closes positions at once.'
      ]],
      ['time', 'Time machine', [
        'Under History: what a lump sum (or a monthly plan) put into anything years ago would be worth now, and its worst drop on the way.'
      ]],
      ['fees', 'Fees', [
        'Taiwan trades pay 0.1425% commission (NT$20 at least) and a sale 0.3% tax; US, Japanese and other markets a Taiwan broker’s usual online rate; mutual funds go through a fund platform, 1% to buy and nothing to sell. Dividends have each country’s withholding.',
        'Exchange is the mid-market rate plus or minus the bank’s spread, doubled at weekends while FX markets are shut. Margin loans charge interest daily.',
        'Quadra Plus members pay 28% of the usual commission (fund fees too) and half the spread, and borrow 1 point cheaper: the more you trade and borrow, the more it saves, which is what it’s for.'
      ]],
      ['money', 'Money', [
        'Securities’ NT$ is the Quadra balance: buying takes from the wallet, selling brings it back. Fees and taxes follow each market’s real rules (Taiwan at least NT$20; abroad a Taiwan broker’s usual online rate); dividends have each country’s withholding, earned on the ex-date, paid weeks later.',
        'Monthly plans and reinvested dividends grow money a little at a time.'
      ]]
    ]
  },
  odds: {
    zh: [
      ['what', 'Quadra Play 是什麼', [
        'Quadra 玩樂的地方：台灣運動彩券和台灣彩券的玩法。各種運動的比賽、冠軍盤、F1 玩法，還有電腦彩券和刮刮樂。',
        '運彩賠率由 DraftKings、Polymarket 等市場價格估算；彩券用台灣彩券的真實開獎號碼。'
      ]],
      ['tabs', '每個分頁', [
        '「首頁」：餘額、各大聯賽的焦點比賽和賠率、你的投注（可以提前兌現）和彩券頭獎。',
        '「賽事」：每個運動、每場還沒開始的比賽和冠軍盤；點選項加入投注單。',
        '「彩券」：每種電腦彩券和刮刮樂，快選或自選。',
        '「投注單」：單場或串關，確認後送出。',
        '「紀錄」：投注和彩券的結果、統計分析。'
      ]],
      ['bet', '怎麼下注', [
        '點選項加到投注單，單場或串關，按「投注」送出。比賽結束自動結算；延期或取消的比賽會退款。結算時會通知你。'
      ]],
      ['lottery', '彩券', [
        '大樂透、威力彩、今彩539、3星彩、4星彩、38／39／49樂合彩、BINGO BINGO、雙贏彩、大福彩，和 6 種刮刮樂。每張遊戲卡都能「快選 1 注」，打開可以自選或快選 5 注。中獎自動入帳並通知你。'
      ]],
      ['boost', '串關加成與提前兌現', [
        '串關加成：3 場以上的串關全過時多給獎金，3 場 +5%、4 場 +8%、5 場 +12%、6 場 +15%、7 場以上 +20%（Plus 會員 ×1.5）。',
        '提前兌現：比賽還沒結束也能先把投注單換成現金。金額是這張單現在的公平價值（依莊家目前估的機率，不含賠率裡的抽成），再扣 5%（Plus 扣 2%）；所以沒什麼變化時兌現會比繼續持有少一點，只有選項真的變得更可能贏時才會比本金多。',
        '首頁的「精選串關」幫你挑好大聯賽的熱門組合，一鍵加到投注單。',
        '免費投注：Plus 會員每週的免費投注和新手禮，在投注單上點一下就用在這張單（串關或單一選項），不扣本金，贏了拿獎金（不含本金），7 天內有效；不能提前兌現。'
      ]],
      ['money', '錢怎麼算', [
        '下注和買彩券從錢包扣款，中獎自動入帳並通知你。彩券中獎超過 NT$5,000 照規定扣 20% 所得稅和 0.4% 印花稅。'
      ]]
    ],
    en: [
      ['what', 'What Quadra Play is', [
        'Quadra’s place to play: the Taiwan Sports Lottery’s and Taiwan Lottery’s games. Matches in many sports, futures, F1 markets, number games and scratch cards.',
        'Odds are estimated from DraftKings, Polymarket and other markets; the lottery uses Taiwan Lottery’s real draws.'
      ]],
      ['tabs', 'The tabs', [
        'Home: the balance, featured big-league games with prices, your bets (with cash out) and the lottery jackpots.',
        'Games: every sport, every match not yet started and the futures; tap a pick to add it to the slip.',
        'Lottery: every number game and scratch card, quick pick or your own numbers.',
        'Slip: singles or a parlay, placed when you confirm.',
        'History: bet and ticket results, and stats.'
      ]],
      ['bet', 'Placing bets', [
        'Tap picks onto the slip, as singles or a parlay, and place it. Bets settle after the game (with a notice); postponed or cancelled games are refunded.'
      ]],
      ['lottery', 'Lottery', [
        'Lotto 6/49, Super Lotto, Daily Cash 539, 3 and 4 Digits, the 38, 39 and 49 M games, BINGO BINGO, Lotto 12/24 and more, and 6 scratch cards. Every card has a one-tap quick pick; open one to pick numbers or quick pick 5. Winnings are paid automatically, with a notice.'
      ]],
      ['boost', 'Parlay boost and cash out', [
        'Parlay boost: a winning parlay of 3 or more legs pays extra: +5% for 3, +8% for 4, +12% for 5, +15% for 6, +20% for 7 or more (×1.5 for Plus members).',
        'Cash out: turn a slip into cash before the games end. It’s priced at the slip’s fair worth now (the house’s current chances, without the margin in the odds) less 5% (2% with Plus): while little has changed it pays a bit less than holding, and more than the stake only when the picks have really got likelier.',
        'Featured parlays on the home screen put together big-league picks, added to the slip in one tap.',
        'Free bets: Plus’s weekly one and the welcome offer; tap one on the slip to use it on that slip (a parlay or one pick). Nothing comes off your balance, a win pays the winnings (not the stake), and it lasts 7 days; no cash out.'
      ]],
      ['money', 'Money', [
        'Bets and tickets come out of the wallet, and winnings go straight back in, with a notice. Lottery prizes over NT$5,000 have 20% tax and 0.4% stamp duty taken, as the rules say.'
      ]]
    ]
  },
  match: {
    zh: [
      ['what', 'Orbit Sports 是什麼', [
        'Quadra 的運動資料中心：所有運動的比分、賽程、排名、球隊和球員，每場比賽的詳細數據，還有依你追蹤的運動排好的推薦。Play 有開賣的比賽有「到 Play 下注」。'
      ]],
      ['tabs', '每個分頁', [
        '「首頁」：今天看什麼。正在進行的比賽在最上面，接著是依你的喜好排好、不撞時間的推薦，再來是其他比賽；可以選一天（前三天到下週），或只看你的球隊、某個運動。',
        '「賽事」：依運動和聯賽找比賽，打開就在離現在最近的比賽日；還有排名、季後賽對戰表，和搜尋聯賽、球隊、球員。F1 顯示整季每一站。',
        '「轉播」：什麼時候、在哪一台。正在轉播的比賽（點「觀看」直接開愛爾達或 Apple TV），你追蹤的球隊、選手和比賽接下來 7 天的轉播，接下來 24 小時的其他比賽，和愛爾達完整轉播表。',
        '「追蹤」：你的球隊和選手現在怎麼樣：排名、近五場、上一場和下一場；單獨追蹤的比賽也在這裡。',
        '右上角：說明、重新整理和你的 Quadra Pass；再點一次目前的分頁會回到頂端。'
      ]],
      ['follow', '追蹤', [
        '依喜好順序選運動和聯賽（第一個最優先），在首頁的「我的設定」；球隊在比賽或球隊頁按「+ 追蹤」，F1 車手和車隊在他們的頁面追蹤，單一場比賽或一站 F1 在比賽頁追蹤。追蹤的球隊開賽和完賽會通知你；Play 的推薦也用你的追蹤。',
        '球隊頁有傷兵報告（NBA、WNBA、NFL、NHL、MLB，ESPN 即時更新）：誰受傷、狀態、預計何時回歸。F1 比賽中的賽事幹事訊息會翻成中文，點車手可看他的頁面。'
      ]],
      ['watch', '台灣轉播', [
        'Orbit Sports 只列在台灣看得到的聯賽：愛爾達 ELTA.tv 和 Apple TV（MLS）。每場比賽標出頻道和語言（英文原音、中文、雙語），比賽進行中有「觀看」。轉播權會變動，以各平台公告為準。'
      ]],
      ['play', '到 Play 下注', [
        'Play 有開賣的比賽，旁邊有「投注」（進行中是「場中」）小按鈕，比賽頁有「到 Play 下注」：一點就到 Play 的那場比賽，已經登入。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Sports 不用錢：看比賽、追蹤都免費。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Sports is', [
        'Quadra’s sports data centre: every sport’s scores, schedules, tables, teams and players, each match’s details, and picks ranked by what you follow. Matches Play sells have Bet in Play.'
      ]],
      ['tabs', 'The tabs', [
        'Home: what to watch. Games on now at the top, then a no-clash plan ranked for you, then the rest; pick a day (three back to a week ahead), or only your teams or one sport.',
        'Matches: by sport and league, opening on the game day nearest to now; tables, playoff brackets, and search for leagues, teams and players. F1 shows its whole season.',
        'On TV: when and where. What’s on now (Watch opens ELTA.tv or Apple TV), your teams’, players’ and matches’ games on TV in the next 7 days, everything else in the next 24 hours, and ELTA’s full guide.',
        'Following: how your teams and players are doing: their place, form, last and next game; matches you follow one by one too.',
        'Top right: help, refresh and your Quadra Pass; tap the open tab again to go back to its top.'
      ]],
      ['follow', 'Following', [
        'Pick sports and leagues in order of priority (the first counts most) under My settings on Home; follow teams with “+ Follow” on a match or team page, F1 drivers and teams on their page, and one match or F1 weekend on its page. A followed team’s start and final score come as notices, and Play’s picks use your follows too.',
        'Team pages have the injury report (NBA, WNBA, NFL, NHL, MLB, live from ESPN): who’s hurt, their status and when they’re due back. In a live F1 session, tap a driver in a race control message to open them.'
      ]],
      ['watch', 'Watching in Taiwan', [
        'Orbit Sports lists the leagues you can watch in Taiwan: ELTA.tv, and Apple TV for MLS. Each game shows its channel and commentary (English, Chinese, dual), and Watch while it’s on. Rights change; each service’s own listings are the final word.'
      ]],
      ['play', 'Betting in Play', [
        'Games Play sells have a small Bet chip (Live while in play), and a game page has “Bet in Play”: one tap opens that game in Play, signed in.'
      ]],
      ['money', 'Money', [
        'Orbit Sports is free: watching and following cost nothing.'
      ]]
    ]
  },
  vocab: {
    zh: [
      ['what', 'Orbit Words 是什麼', [
        'Orbit 的背單字 App：大考中心高中英文 6,000 字，每個字都有真人發音，記憶模型替你安排什麼時候複習。'
      ]],
      ['tabs', '每個分頁', [
        '「今天」：今天的目標、連續天數、等級，該複習和還沒學的字數，一鍵開始這一輪；背新字、上次答錯的字用卡片看一遍，還有今日單字。',
        '「練習」：選級別、學習方式和發音的語速，開始一輪。',
        '「複習」：答錯、該複習、學習中、收藏的字分開列，可以搜尋和排序；「卡片複習」一張一張翻（點一下翻面、左右滑換張），看完再測驗這批字，測驗才會更新記憶模型。',
        '「單字」：6,000 字全部列出，照級別、新字／學習中／精熟／收藏篩選，英文或中文都能搜尋。',
        '「進度」：各級別學到哪裡、正確率和每題花的時間、最近 14 天、接下來幾天要複習多少、記憶模型怎麼配合你，還有最常忘的字。',
        '點任何一個字都會打開它的卡片：完整意思、記憶小撇步、你搞混過和常被搞混的字、你拼錯的樣子、作答紀錄和現在還記得的機率；按 ☆ 收藏，或按「我會了」不再考。'
      ]],
      ['words', '背單字', [
        '大考中心高中英文參考詞彙第 1 到 6 級，共 6,170 字，每個字都有真人發音錄音（Microsoft Jenny）。每一輪 10、20 或 30 個字，混合該複習的字和新字；答錯的字會在這一輪最後再問一次。「背新字」一張一張看新字（發音、意思），背滿一批（一輪的字數）就考這批字，考完之後照記憶模型排複習。',
        '題目故意出得難，因為想得辛苦才記得住：錯的選項都是最容易選錯的字：拼法幾乎一樣的（adapt、adopt、adept）、意思很接近的、同詞性同長度的，還有你以前搞混過的那個字；不會出兩個都對的選項。',
        '「智慧」模式一輪裡輪流出每一種題型：新字多半是認（選意思、選英文、聽音選字），也會拼字母和填空；越熟越要自己寫出來（填空、聽寫）；常忘的字直接考難的。新字不會考聽寫。',
        '每個字有自己的記憶模型（FSRS，Anki 用的排程）：記得多穩（天數）和對你多難。算出還記得的機率掉到 90% 時，它就該複習；對你容易的字等到 80–85% 才考，時間留給弱點。新字在一輪裡第一次出現是一題「檢查」（填空，藏一半字母）：直接答對就算已經會，幾週內都不會再考，只有答錯的才要學。要考哪些新字，也是照你的作答紀錄猜：你在哪個級別、哪種詞性、多長的字比較常錯，還有跟你最近答錯的字長得像的字，最可能不會的先考，會的字就不浪費時間。隔越久還答對、用寫的答對、答得快，下次就隔越久；選擇題答對、答得慢，加得少；答錯會大幅縮短，這個字也會被記成比較難。記得超過 10 天算「精熟」。每一輪先考最弱的字（最可能忘、常錯、對你比較難的），把你搞混過的字排在同一輪讓你分辨，長得像的字不會連著出；還在學的字太多時，就先不加新字。'
      ]],
      ['goal', '每日目標與等級', [
        '一天回答 20 題就達成今天的目標，連續天數 +1；開啟通知後，晚上 8 點還沒達成會提醒你。',
        '每答對一題 2 XP，第一次精熟一個字再加 15 XP。累計積分決定等級（Lv 2 要 100 XP、Lv 5 要 1,600、Lv 10 要 8,100、Lv 20 要 36,100），每幾級換一個稱號：新手、學徒、好手、高手、達人、大師、傳奇、神話。積分只是你的學習紀錄，不能換任何東西。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Words 不用錢，也不發錢：練單字永遠免費。帳戶、Quadra Plus、頭像和錢的真相，都在每個 App 右上角的 Quadra Pass 裡。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Words is', [
        'Orbit’s app for English words: the 6,000-word high-school list, every word recorded, and a memory model that decides when each comes back.'
      ]],
      ['tabs', 'The tabs', [
        'Today: the day’s goal, your streak and level, what’s due and not yet learnt with a round one tap away, new words to study, last time’s misses as flash cards, and the word of the day.',
        'Practice: pick levels, a way to learn and the speed of the sound, and start a round.',
        'Review: missed, due, learning and saved words, each searchable and sortable. Flash cards: flip (tap) and swipe through them, then test the deck; only the test updates the memory model.',
        'Words: all 6,000 words by level and state (new, learning, mastered, saved), searched in English or Chinese.',
        'Progress: each level, your accuracy and time per answer, the last 14 days, the reviews coming, how the memory model fits you, and the words you forget most.',
        'Tap any word for its sheet: the whole meaning, a way to remember it, words it’s mixed up with, how you misspelt it, your record and the chance you still know it; ☆ saves it, “I know it” puts it away.'
      ]],
      ['words', 'Words', [
        'The high-school English reference list, levels 1 to 6: 6,170 words, each recorded (Microsoft’s Jenny voice). A round is 10, 20 or 30 words, reviews and new ones mixed; a missed word comes back once at the end of the round. Study new words shows them card by card (sound and meaning); a full batch (a round’s size) unlocks a quiz on just those words, and from then on they’re scheduled like the rest.',
        'Questions are hard on purpose, because what takes effort to recall is what you remember: every wrong option is the one you’re most likely to pick: spelt almost the same (adapt, adopt, adept), close in meaning, the same part of speech and length, and the word you’ve mixed it up with before. Two options are never both right.',
        'Smart mode takes every kind of question in turn in a round: a new word mostly to recognise (its meaning, from its meaning, by ear), unscrambled or with letters missing too; the better you know it, the more you write it (missing letters, dictation); a word you keep forgetting goes straight to the hard kinds. A new word is never dictated.',
        'Each word has its own memory model (FSRS, the scheduler Anki uses): how long it stays remembered and how hard it is for you. It comes back when the chance you still know it falls to 90%; a word that’s easy for you waits until 80–85%, so the time goes to your weak spots. A new word’s first question in a round is a check (a cloze with half its letters gone): right straight away, it’s known and won’t come back for weeks; only what you miss is learnt. Which new words come next is guessed from your answers too: the levels, parts of speech and word lengths you miss more, and words spelt like ones you just missed, likeliest-missed first, so no time goes on words you know. Recalled after a longer gap, written rather than picked, or answered quickly, it comes back later; picked or slow, a little later; missed, much sooner, and it counts as harder from then on. Remembered for more than 10 days is mastered. A round leads with your weakest words (likeliest forgotten, often missed, hard for you), puts words you’ve mixed up side by side, never asks two look-alikes in a row, and holds back new words while too many are still being learnt.'
      ]],
      ['goal', 'Daily goal and levels', [
        'Answer 20 questions in a day to meet the day’s goal and grow your streak; with notices on, you’re reminded at 8 pm if you haven’t.',
        '2 XP a right answer, 15 XP more the first time a word is mastered. Points make your level (level 2 at 100 XP, 5 at 1,600, 10 at 8,100, 20 at 36,100), with a title every few levels: Rookie, Apprentice, Skilled, Expert, Master, Grandmaster, Legend, Mythic. Points are your record of learning; they buy nothing.'
      ]],
      ['money', 'Money', [
        'Orbit Words uses no money and pays none: learning is always free. Your account, Quadra Plus, looks and the truth about money are in the Quadra Pass at the top right of every app.'
      ]]
    ]
  },
  orbit: {
    zh: [
      ['what', 'Orbit Class 是什麼', [
        'Orbit 的課表 App。打開就知道現在是哪一節、還剩幾分鐘、下一節是什麼。課表存在 Quadra Pass，登入的每台裝置都一樣。'
      ]],
      ['tabs', '畫面', [
        '主畫面：目前這一節、倒數和下一節；下面是今天的全部課程，點一節看詳細資料。',
        '設定面板：新增或修改課表，也可以拍課表照片讓 AI 匯入，或用一句話請 AI 修改；外觀和備份也在這裡。'
      ]],
      ['share', '分享課表', [
        '課表只有建立它的 Quadra Pass 能編輯。要分享時按「產生分享金鑰」（24 小時內有效），對方在自己的 Orbit Class 輸入就得到一份自己的副本。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Class 不用錢。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Class is', [
        'Orbit’s class schedule app: open it to see the period now, the minutes left and what’s next. The schedule lives on your Quadra Pass, the same on every device you sign in on.'
      ]],
      ['tabs', 'The screens', [
        'The main screen: the current period, its countdown and the next; below, the whole day, each period tappable for details.',
        'The settings panel: add or change the schedule, import it from a photo with AI or change it in a sentence; appearance and backups too.'
      ]],
      ['share', 'Sharing a schedule', [
        'Only the Quadra Pass that made a schedule edits it. To share it, make a share key (valid 24 hours): entering it in their own Orbit Class gives a classmate their own copy.'
      ]],
      ['money', 'Money', [
        'Orbit Class is free.'
      ]]
    ]
  },
  weather: {
    zh: [
      ['what', 'Orbit Weather 是什麼', [
        'Orbit 的天氣 App：一個答案的天氣。中央氣象署、Google 和環境部的資料合成一份約 1 公里的預報：會不會下雨、要不要帶傘、穿什麼、紫外線和空氣品質。'
      ]],
      ['tabs', '畫面', [
        '每個釘選的地點是一頁，左右滑動切換；「我的行程」照你每個小時會在哪裡，拼出一路上的天氣。',
        '點一天看那天的建議和逐時圖表；降雨、紫外線、空氣的小卡打開是大圖。'
      ]],
      ['money', '錢怎麼算', ['Orbit Weather 不用錢。']]
    ],
    en: [
      ['what', 'What Orbit Weather is', [
        'Orbit’s weather app: one answer. Taiwan’s CWA, Google and MOENV blended into one forecast for about a kilometre around you: rain, an umbrella or not, what to wear, UV and the air.'
      ]],
      ['tabs', 'The screens', [
        'Each pinned place is a page; swipe between them. My route stitches the weather where you’ll be each hour.',
        'Tap a day for its advice and hourly charts; the rain, UV and air cards open a big graph.'
      ]],
      ['money', 'Money', ['Orbit Weather is free.']]
    ]
  },
  transit: {
    zh: [
      ['what', 'Orbit Transit 是什麼', [
        'Orbit 的大眾運輸 App：全台公車、台鐵、高鐵、捷運和 YouBike，路線規劃、到站時間和導航都在一起。'
      ]],
      ['tabs', '每個分頁', [
        '「地圖」：找地點、規劃路線，照公車實際到站時間排出最好走的方案，一路導航。',
        '「交通」：附近站牌和每班公車的到站、路線和時刻表。',
        '「查時刻」：火車、高鐵和捷運的時刻與票價。',
        '「我的」：常用和固定的行程、TPASS 和交通方式的偏好。'
      ]],
      ['money', '錢怎麼算', ['Orbit Transit 不用錢；票價只是參考。']]
    ],
    en: [
      ['what', 'What Orbit Transit is', [
        'Orbit’s public transport app: Taiwan’s buses, railways, high-speed rail, metros and YouBike, with trip plans, arrivals and navigation in one place.'
      ]],
      ['tabs', 'The tabs', [
        'Map: find a place, plan a trip ranked by the buses’ real times, and be guided along it.',
        'Transit: nearby stops with every bus due, routes and timetables.',
        'Times: trains, high-speed rail and metros, with fares.',
        'Me: saved and recurring trips, TPASS and the ways you like to travel.'
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
