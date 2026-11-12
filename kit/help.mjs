// The help centre: how every app works, in one place: the Orbit Pass
// sheet's 說明 tab, in every app (pass.mjs). A page opens it with
// #help=<app>, or #help=<app>:<topic> for one topic.
//
// Every app's guide has the same shape, in the same words:
//   what    「X 是什麼」: its part in Orbit, in two or three lines (under its name)
//   the tour (TOURS, below): each tab and the screens worth knowing, each
//           its real screenshot and a line or two, in the tab bar's order
//   …       what's particular to it (a few topics, folded: 怎麼用)
//   money   「錢怎麼算」: how it touches the money (Securities' alone)
// (The Orbit Pass's own guide: what, install, looks, devices, one, net,
// notify, safe, money.)
//
// HELP[app][lang] = [[topic id, title, [paragraphs]], …]

import { APP_ORDER } from './brand.mjs';

export const HELP = {
  pass: {
    zh: [
      ['what', 'Orbit Pass 是什麼', [
        '你在每個 Orbit App 的帳號：Sports、Transit、Weather、Class、Money、News、Words、Beats、Law、Securities。每個 App 都用它登入，資料存在它裡面，換裝置也一樣。',
        '通行碼是 10 個字的代碼，由分享 Orbit 給你的人發給你。知道它就能用這個帳號，所以別給別人；它只顯示一次，請記在安全的地方。',
        '每個 App 右上角的頭像就是 Orbit Pass 的入口。'
      ]],
      ['install', '加入主畫面', [
        'iPhone、iPad 用 Safari：點分享鍵（iOS 26 先點網址列旁的 ⋯，再點「分享」），往下滑點「加入主畫面」，再點「加入」。iPhone 上的 Chrome 也可以：網址列右邊的分享鍵 →「加入主畫面」。',
        'Android 用 Chrome：點右上角 ⋮ →「安裝應用程式」或「加到主畫面」，選「安裝」，不要選「建立捷徑」。三星網際網路：右下角 ≡ →「新增頁面至」→「主螢幕」。',
        '在 LINE、Instagram、Facebook 裡點開的連結不能加入主畫面：先點右上角的選單，選「用瀏覽器開啟」，再照上面的步驟。',
        '電腦不用安裝，直接在瀏覽器打開。想要自己的視窗：Chrome、Edge 點網址列右邊的安裝圖示；Mac 的 Safari 選「檔案」→「加入 Dock」。',
        '加好以後，每次都從主畫面的圖示打開。Android 的圖示打開又回到加入的那一頁，表示加成了捷徑：刪掉它，重新加入並選「安裝」。'
      ]],
      ['looks', '頭像、頭像框與里程碑', [
        '免費的頭像和頭像框隨時換，點一下戴上，再點一下拿下。每個 App 的帳戶按鈕都看得到。',
        '里程碑每個 App 一個，分銅、銀、金三級，拿到就永久保留。拿到第一級就能戴上它的頭像和頭像框（一起戴上），升級後會換成銀色、金色。最上面是最接近的下一枚：要做什麼、還差多少。'
      ]],
      ['devices', '登入與裝置', [
        '新裝置：輸入通行碼，或在已登入的裝置按「新增裝置」拿 8 碼裝置代碼（10 分鐘內、只能用一次）。',
        '第一次用別人給你的通行碼登入時，會先請你換掉它，之後只有你知道。',
        '通行密鑰：在 Pass 分頁加入後，新裝置按「用通行密鑰登入」，用 Face ID、Touch ID 或 Windows Hello 就能登入；通行碼照樣能用。',
        '「在這台裝置登出」只清掉這台裝置的資料；都還在 Orbit Pass，登入就回來。'
      ]],
      ['one', '一個 App 一個地方', [
        '所有 App 可以同時開。同一個 App 在另一台裝置（或 Safari 和主畫面 App 之間）打開時，原本那個會暫停，按「在這裡繼續」拿回來，資料不會互相蓋掉。'
      ]],
      ['net', '沒有網路的時候', [
        'Sports、Transit、Securities 是即時的，沒網路時只顯示「沒有網路連線」，連上就回來。其他 App 沒網路也能打開上次的資料，連上後再同步。網路慢時先用手機上的資料，新的到了再換上。'
      ]],
      ['notify', '通知與除錯紀錄', [
        '「系統通知」一個開關管全部，下面每個 App 的每種通知各自開關。設定跟著 Orbit Pass，每台裝置都一樣。',
        '除錯紀錄：打開「記錄操作過程」，出問題時按「傳給 Orbit」（只傳出錯的地方，每週一整理給開發者），或「複製紀錄」「分享檔案」自己傳。紀錄裡沒有通行碼。'
      ]],
      ['safe', '安全', [
        '伺服器只存通行碼的雜湊值，裝置上只有會過期、可撤銷的登入。',
        '「帳戶安全」可以登出其他所有裝置，或更換通行碼（舊的立刻失效，新的只顯示一次）。忘了通行碼，就在還登入的裝置換一組。'
      ]],
      ['money', '錢在哪裡', [
        'Orbit Pass 不放錢。餘額、每週薪水、紓困、財富等級和明細都在 Orbit Securities 的「資金」分頁。'
      ]]
    ],
    en: [
      ['what', 'What the Orbit Pass is', [
        'Your account in every Orbit app: Sports, Transit, Weather, Class, Money, News, Words, Beats, Law and Securities. Each signs in with it and keeps its data on it, the same on any device.',
        'The pass is a 10-character code from whoever shared Orbit with you. Anyone who knows it can use the account, so keep it to yourself; it’s shown once, so write it down somewhere safe.',
        'The avatar at the top right of every app opens the Orbit Pass.'
      ]],
      ['install', 'Adding to the home screen', [
        'iPhone and iPad, in Safari: tap Share (on iOS 26, tap ⋯ beside the address bar, then “Share”), scroll down to “Add to Home Screen”, then tap “Add”. Chrome on iPhone works too: Share at the right of the address bar → “Add to Home Screen”.',
        'Android, in Chrome: tap ⋮ at the top right → “Install app” or “Add to Home screen”, and choose “Install”, not “Create shortcut”. Samsung Internet: ≡ at the bottom right → “Add page to” → “Home screen”.',
        'A link opened inside LINE, Instagram or Facebook can’t be added: tap the menu at the top right, choose “Open in browser”, then follow the steps above.',
        'On a computer there’s nothing to install: just use the browser. For a window of its own: in Chrome or Edge, tap the install icon at the right of the address bar; in Safari on a Mac, choose File → “Add to Dock”.',
        'Once added, always open it from its home-screen icon. On Android, an icon that brings back the “add” page was added as a shortcut: remove it and add it again with “Install”.'
      ]],
      ['looks', 'Avatars, frames and milestones', [
        'The free avatars and frames change any time: tap to wear, tap again to take off. They show on your account button in every app.',
        'One milestone per app, in bronze, silver and gold, each kept for good once reached. The first earns its avatar and frame (worn together), which turn silver and gold as you go. On top: the nearest next medal, what it asks and how far along you are.'
      ]],
      ['devices', 'Signing in and devices', [
        'On a new device, enter the pass, or choose “Add a device” on a signed-in one for an 8-character device code (10 minutes, once).',
        'The first time you sign in with a pass someone gave you, you’re asked to replace it, so only you know it.',
        'Passkeys: add one in the Pass tab, then on a new device choose “Sign in with a passkey” and use Face ID, Touch ID or Windows Hello. Your pass still works.',
        '“Sign out on this device” wipes only this device; it all stays on your Orbit Pass.'
      ]],
      ['one', 'Each app in one place', [
        'Every app can be open at once. Opening the same app somewhere else (another device, or Safari beside the home-screen app) pauses the first; “Continue here” takes it back, and nothing is overwritten.'
      ]],
      ['net', 'Without a connection', [
        'Sports, Transit and Securities are live, so offline they show only “No internet connection” and come back by themselves. The others open on what they kept and sync once you’re back. On a slow connection an app opens on what the phone has, then swaps in the new.'
      ]],
      ['notify', 'Notifications and the debug log', [
        'One switch, System notices, turns them all on or off; below it each app’s kinds have their own. They follow your Orbit Pass to every device.',
        'Debug log: turn on “Record what the app does”, then Copy or Share file when something goes wrong. It never holds your pass.'
      ]],
      ['safe', 'Security', [
        'The server keeps only a hash of the pass; devices keep only sign-ins that expire and can be revoked.',
        'Security can sign out every other device or change the pass (the old one stops at once, the new one is shown once). Forgot it? Change it on a device that’s still signed in.'
      ]],
      ['money', 'Where the money is', [
        'The Orbit Pass holds no money. Balance, weekly pay, relief, wealth levels and every entry are in Orbit Securities’ 資金 tab.'
      ]]
    ]
  },
  stock: {
    zh: [
      ['what', 'Orbit Securities 是什麼', [
        'Orbit 讓錢長大的地方：用錢包裡的新台幣投資全世界的股票、ETF、各國公債、共同基金、加密貨幣、黃金白銀存摺和外匯，價格是真實的市場價格，規則照真的券商。'
      ]],
      ['orders', '委託單', [
        '每筆委託都由 Orbit 的伺服器用它的即時報價成交；掛著的時候，要用的現金或股票會先保留。',
        '市價單：開盤時立刻成交（買在賣價、賣在買價）；休市時送出的，開盤後第一個報價成交，多保留 3%，沒用到的退回；台股市價和停損單照券商的算法，以漲停價保留現金、計算額度。限價單：買進到限價或更低、賣出到限價或更高才成交。停損／觸價單：價格穿過觸發價時用市價成交。',
        '限價和停損單預設「當日有效」，收盤還沒成交就失效；選「長效」保留 30 天。加密貨幣和外匯對永遠是長效。觸發時現金不夠，委託會被取消。',
        'App 關著也照算：伺服器用那段時間的價格，找出第一個碰到你價格的時間成交，記在那個時間。',
        '限價要符合各交易所的跳動單位（日股依 TOPIX500、ETF 交易單位各有一套），台股、韓股、陸股、日股要在漲跌幅內（台股 ±10%，新上市、上櫃股票前 5 個交易日不設漲跌幅；收盤後下的單照當天收盤價算）；港股只收限價單；陸股經滬深港通，科創板、創業板只能賣不能買；美股可下盤前（紐約 04:00–09:30）、盤後（到 18:00）當日限價單；台股整股（1,000 股的倍數）和零股（1–999 股）要分開下單，零股只能下限價單、9:10 開始撮合。每筆交易都看得到交割日（台股 T+2、美股 T+1）：賣出的錢馬上可以再買同一個市場，交割後才能換匯。'
      ]],
      ['plans', '定期定額與到價提醒', [
        '定期定額（📅）：每月 1 到 31 日選一天、每次至少 NT$100（那個月沒有這天就在月底買）。台股那天以盤中零股第一盤（09:10，2026/12/7 起 09:00）的限價成交，扣掉成本能買多少就買多少，每筆手續費 NT$1（2026 年底前，之後 0.1425%、最低 NT$1）；外幣標的只換需要的新台幣。那個月餘額不夠就跳過，連續 3 個月扣款失敗，定期定額就停止。股票、ETF 只有台股和美股能定期定額；美股每次至少 US$10，買到小數點後 4 位的碎股。',
        '到價提醒（🔔）：漲到或跌到某個價格時通知你，App 關著時伺服器也會檢查。成交、委託失效、維持率偏低和股利利息入帳也會通知；每一種都能在 Orbit Pass 的通知各自開關。'
      ]],
      ['fx', '換匯與外幣', [
        '每種貨幣有自己的錢包：美股用美元、日股用日圓…只有新台幣時，下單會直接換好剛好需要的金額。',
        '換匯用市場中間價再扣銀行價差（美元 0.2%、日圓歐元港幣 0.3%…）；週末外匯休市照樣能換，但價差加倍，跟真的銀行一樣。',
        '外匯對（例如 EUR/USD）可以像股票一樣買賣、放空和設提醒：不收手續費，買賣各 0.02% 價差。這跟「換匯」不同，換匯只是把錢換成另一種貨幣。'
      ]],
      ['more', '公債、融資、放空', [
        '公債有票面利率和到期日，價格跟殖利率反向；買進要付應計利息，配息照發行國預扣稅，到期自動還本。美國公債照即時殖利率曲線，其他國家用參考殖利率。',
        '買進時可以選「融資」：成交時券商借你一部分，買的股票就是擔保，賣出時先還融資（沒有單獨借現金這回事）。融資成數和券商一樣：台股上市 6 成、上櫃 5 成（借成交價金乘成數，未滿千元的部分不借），海外股票走複委託，只能用現金買賣，不能融資也不能放空；加密貨幣、基金、黃金存摺不能融資；公債 9 成、公司債 7 成。利息加在融資上，還款或賣出時一起付。持股會分開記「現股」和「融資」：融資買進的股票是券商的擔保品，只能融資賣出（賣得的錢先還融資）或用現金償還變成現股；賣出時先賣現股。融資到期、追繳沒補足或沒有信用帳戶時，券商只會處分融資的股票，不會動你的現股。融資的股票一樣有股東權益：配股配息、股東會、現金增資都有份。',
        '融資、融券和加密貨幣放空都要先開「信用帳戶」（資金 › 融資）：沒有信用帳戶時，手上的融資和放空會被券商處分。開戶條件：證券帳戶滿 3 個月、最近一年成交 10 筆以上、成交金額達額度的一半；額度 50 萬、100 萬、200 萬、300 萬、500 萬，50 萬以上還要財力證明（總資產達額度 3 成）。台股的融資、融券各用自己的額度。外匯對賣出不算借券，不用信用帳戶。',
        '融資、融券期限 6 個月，到期前一個月內可以按「展延」再延 6 個月；到期沒展延，融資的股票會被賣出、融券會被買回。融券：要繳賣出金額 9 成的保證金（未滿百元以百元計），賣出的錢也押在券商，買回時一起退；另收 0.08% 融券手續費，不收借券利息；保證金和押著的賣出款有年息 0.2%，買回時付給你。融券要用融券買進（或現券償還）了結；股東會、除權息前要依規定強制回補。加密貨幣放空：借券年費 3%，開倉後資產要有欠款的 150%。',
        '現股當沖：當天買進再賣出，證交稅減半（0.15%，到 2027 年底；只算當天買賣配對的股數，零股不適用）。證券帳戶滿 3 個月、最近一年成交 10 筆，或已開信用帳戶，就能當沖（先買後賣、先賣後買都一樣）；先賣後買有每日當沖額度（淨資產的 2 倍，最少 NT$50 萬、最多 NT$5,000 萬），收盤前一定要買回，沒買回會被自動買回。13:25 起整股進收盤前集合競價：只收限價單，13:30 以收盤價撮合一次。收盤後零股 13:40、整股 14:00 起到 14:30 下的台股單進「盤後交易」（零股盤後、整股盤後定價），14:30 以收盤價撮合一次，沒成交就取消；13:30 到開放前送出的會被退回。',
        '維持率收盤時低於 130% 會追繳，兩個營業日內要補到 166%，或繳足通知的補繳差額；到期還低於 130%，融資買進的持股全部賣出（斷頭）；低於 100% 馬上強制處理。'
      ]],
      ['save', '閒錢：活存、定存、借券', [
        '交割帳戶裡的新台幣有活存利息，年利率 0.8%，每天計息，6 月 21 日和 12 月 21 日入帳。',
        '定存：最少 NT$10,000，1、3、6、9 或 12 個月，臺灣銀行牌告固定利率（1 年 1.72%），到期本息回到現金，也可以設自動轉存。提前解約未滿 1 個月沒有利息，滿 1 個月以上按存滿的期別利率打 8 折。',
        '借券出借：整張、已交割、不是融資買進的台股或 ETF 可以借出去收借券費。年費率自己出價（0.01%～16%），有人借才成交：出價不高於市場行情（股票 1.2%、ETF 0.6%）就借得出去，高於行情沒人借。借券費每天按當天收盤價計算，還券時一次收（券商收 3 成）。借出去的股票不能賣，召回要 3 個營業日；每次借 6 個月，同意續借最多再續 2 次。',
        '單筆利息或借券費超過 NT$20,000 扣繳 10% 和 2.11% 二代健保。違約交割時銀行會先把定存解約抵債、券商召回借出的股票來賣。'
      ]],
      ['time', '回測（時光機）', [
        '在「紀錄」的「回測」試算：幾年前投入一筆錢（或每月定期定額）到某個知名基金或股票，現在會變多少、中間最大跌幅多少、最好和最差的一年，和放銀行比。標的頁也有連結。'
      ]],
      ['fees', '費用', [
        '台股手續費 0.1425%（最低 NT$20，折扣後也一樣；零股最低 NT$1），賣出另收 0.3% 證交稅（ETF 0.1%、債券 ETF 2026 年底前免稅、之後 0.1%，當沖 0.15% 到 2027 年底），元以下無條件捨去；美股、日股等海外市場照複委託常見網路費率；共同基金透過基金平台申購，收 1% 申購手續費，贖回不收費。股利照各國規定預扣稅。',
        '換匯用市場中間價加減銀行價差；週末外匯休市時價差加倍。融資按天計息。新手禮：第一筆交易免手續費（稅和規費照收）。'
      ]],
      ['money', '錢怎麼算', [
        '你的錢都在 Securities：新帳號開戶金 NT$200,000，每週一固定發薪 NT$10,000，跟薪水一樣，存多存少都一樣；那週第一次打開 App 時入帳，沒打開的週下次補發。系統發的錢只有這些：開戶金、週薪、財富等級獎勵和急難紓困，都以新台幣存入，算投入的本金，不算報酬。',
        '財富等級：身價（現金加持股）第一次到達一個等級時送一次獎勵：NT$30 萬小資族 NT$30,000、50 萬穩健 NT$50,000、百萬 NT$100,000、300 萬富裕 NT$250,000、千萬 NT$600,000、一億 NT$3,000,000。',
        '「真相」（資金 › 真相）用你自己的紀錄算錢從哪裡來：系統發的、政府（證交稅、股利扣繳和二代健保，減去急難紓困）、和你自己的成績；還有一筆交易真正的成本。',
        '股利照各國規定預扣稅，除息日持有就有，現金在發放日入帳（有公布的照公布日期，否則台股約 4 週後、美股約 1 週後，遇假日順延到下一個交易日）；在那之前列為「待入帳」，算在淨值裡但不能花。',
        '餘額變負的（透支）時不能再花錢，每月計息 1%，「一鍵賣出補足」會找出最少要賣哪些來補。就像交割款沒付，2 天內沒補足就是違約交割：扣 7% 違約金、自動賣出持股，5 年內不能融資、融券。'
      ]],
      ['relief', '急難紓困', [
        '現金和股票（成本）合計低於 NT$2,000、離發薪日超過 2 天，可以申請一次 NT$5,000。每 13 週一次、一年最多 3 次，會留在紀錄上。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Securities is', [
        'Where Orbit’s money grows: invest the NT$ in your wallet in stocks, ETFs, government bonds, mutual funds, crypto, gold and silver passbooks and forex worldwide, at real market prices and a real broker’s rules.'
      ]],
      ['orders', 'Orders', [
        'Every order is filled by Orbit’s server at its own live quote; while an order waits, the cash or shares it needs are held.',
        'Market: fills at once while the market is open (buying at the ask, selling at the bid); placed while it’s closed, at the first price after the open, holding 3% extra (the unused part comes back); a Taiwan market or stop order holds its cost and counts against limits at the day’s limit-up price, as brokers do. Limit: a buy fills at your price or lower, a sell at your price or higher. Stop: a market order once the price passes your stop.',
        'Limit and stop orders are day orders by default: not filled by the close, they lapse; GTC keeps one for 30 days. Crypto and currency pairs are always GTC. An order whose cash is no longer there when it triggers is dropped.',
        'Closed apps still count: the server walks the prices of the time away, fills at the first moment that reached your price, and dates it then.',
        'Limit prices must sit on each exchange’s tick (Tokyo’s by TOPIX500 and an ETF’s trading unit), and Taiwan’s, Korea’s, China’s and Tokyo’s within the day’s limits (Taiwan ±10%, none for a new listing’s first 5 trading days; placed after the close, from that day’s close); Hong Kong takes limit orders only; China goes through Stock Connect, its STAR and ChiNext shares sold only, never bought; US orders can go to the pre-market (New York 04:00–09:30) and post-market (to 18:00) as day limit orders; Taiwan whole lots (multiples of 1,000) and odd lots (1–999 shares) are separate orders, and odd lots take limit orders only and match from 9:10. Every trade shows when it settles (Taiwan T+2, US T+1): sale money buys again at once in its market, but can be exchanged only once settled.'
      ]],
      ['plans', 'Monthly plans and price alerts', [
        'Monthly plan (📅): at least NT$100 on a day from 1 to 31 (in a shorter month, its last day). A Taiwan one buys with a limit order at the odd-lot session’s first match (09:10, 09:00 from 2026-12-07), as much as the money covers after costs, at NT$1 a buy (until the end of 2026; then 0.1425%, at least NT$1); a foreign one exchanges only the NT$ it needs. A month without enough is skipped; three in a row end the plan. Stocks and ETFs by plan only in Taiwan and the US; a US one at least US$10 a buy, in fractional shares to 4 decimals.',
        'Price alert (🔔): tells you when a price rises or falls to yours, checked by the server while the app is closed. Fills, lapsed orders, low margin and dividends and interest are told too; each kind has its own switch in the Orbit Pass’s notifications.'
      ]],
      ['fx', 'Exchange and currencies', [
        'Each currency has its own wallet: US stocks in US$, Japanese in yen… With only NT$, an order exchanges just what it needs.',
        'Exchanges are at the mid-market rate less a bank’s spread (US$ 0.2%, yen, euro and HK$ 0.3%…); on weekends, while FX markets are shut, you can still exchange but the spread doubles, as at a real bank.',
        'Currency pairs (EUR/USD, say) trade like stocks, shorts and alerts included: no commission, a 0.02% spread each way. That’s apart from Exchange, which only changes money from one currency to another.'
      ]],
      ['more', 'Bonds, margin, short selling', [
        'Bonds have a coupon and a maturity, and their price moves against their yield; a purchase pays accrued interest, coupons are paid less the issuer’s withholding, and the face value is repaid at maturity. US Treasuries follow the live yield curve; other countries’ use reference yields.',
        'Buy on margin by choosing 融資 on the order: the broker lends part of it as it fills, the shares its collateral, and selling repays it first (there’s no borrowing cash on its own). How much is lent is a broker’s: Taiwan 60% listed, 50% OTC (of the trade’s value, the part under NT$1,000 not lent); foreign stocks go through 複委託, cash only: no margin and no short selling; none on crypto, funds or the gold passbook; government bonds 90%, corporate 70%. Interest is added to the loan and paid when it’s repaid or the shares are sold. A holding keeps its own shares (現股) and its margin shares (融資) apart: shares bought on margin are the broker’s collateral, sold only as a margin sale (the money repays the loan first) or turned into your own by repaying in cash; a sale sells your own first. When margin is due, a call isn’t met or there’s no credit account, the broker sells only the margin shares, never your own. Margin shares keep every shareholder right: dividends, meetings and rights issues.',
        'Margin, 融券 and crypto shorts need a credit account first (Money › Loans); without one, the broker closes any margin or shorts held. To open one: the account 3 months old, 10 trades in the last year, and that year’s turnover at least half the limit; limits of NT$500k, 1M, 2M, 3M or 5M, above 500k with proof of means (net worth 30% of the limit). Taiwan’s 融資 and 融券 each have their own limit. Selling a currency pair borrows nothing and needs no credit account.',
        'Taiwan margin (融資) and short sales (融券) run six months; within the last month, Extend adds six more. Past due without one, margin shares are sold and shorts bought back. A 融券 short puts up 90% of the sale as a deposit (rounded up to NT$100), and the sale money stays with the broker too, both returned on buying back; it costs a 0.08% fee and no borrow interest, and the deposit and sale money earn 0.2% a year, paid when you buy back. A 融券 position is closed by buying back (or delivering shares you hold), and must be covered before shareholder meetings and ex-dates by the rules. A crypto short: a 3% a year borrow fee, and assets of 150% of what’s owed after opening.',
        'Day trading (現股當沖): bought and sold the same day, the sell tax is halved (0.15%, until the end of 2027; only on the shares matched within the day, never odd lots). Either way round needs the account 3 months old with 10 trades in the last year, or a credit account; selling first has a daily day-trade limit (twice net worth, NT$500,000 to NT$50 million) and must be bought back before the close or it’s bought back for you. From 13:25 whole lots go into the closing call auction: limit orders only, matched once at 13:30 at the close. After the close, Taiwan orders placed from 13:40 (odd lots) or 14:00 (whole lots) until 14:30 go to after-hours trading, matched once at 14:30 at the close; unfilled ones are cancelled, and ones sent before their session opens are refused.',
        'If the maintenance ratio is under 130% at the close, it’s a margin call: two business days to bring it back to 166% or pay the amount called in full; still under 130% at the deadline, margin-bought holdings are sold; under 100% they’re sold at once.'
      ]],
      ['save', 'Idle money: cash, deposits, lending', [
        'NT$ in the settlement account earns 0.8% a year, accrued daily and paid on June 21 and December 21.',
        'Time deposits: NT$10,000 or more for 1, 3, 6, 9 or 12 months at Bank of Taiwan’s posted fixed rates (1.72% for a year); principal and interest come back to cash at maturity, or roll over if you choose. Closed early: no interest under a month, past that 80% of the rate for the term held.',
        'Lending shares: whole lots of settled Taiwan stocks or ETFs not bought on margin earn a lending fee at a yearly rate you ask (0.01% to 16%). It lends only when a borrower takes it: at or under the going rate (1.2% for stocks, 0.6% for ETFs) it lends, above it nobody borrows. The fee accrues each day on that day’s close and is paid when the shares come back (the broker keeps 30%). Lent shares can’t be sold and take 3 business days to recall; a loan runs 6 months, renewed at most twice if you agree.',
        'Interest or a fee over NT$20,000 at once has 10% tax and 2.11% health premium withheld. In a default the bank breaks your deposits against the debt and the broker recalls lent shares to sell.'
      ]],
      ['time', 'Backtest (time machine)', [
        'In History’s Backtest: what a lump sum (or a monthly plan) in a well-known fund or stock years ago would be worth now, its worst drop, its best and worst years, against a bank deposit. A holding’s sheet links to it too.'
      ]],
      ['fees', 'Fees', [
        'Taiwan commission is 0.1425% (at least NT$20 even after discounts; odd lots at least NT$1), plus 0.3% tax on sales (ETFs 0.1%, bond ETFs none until the end of 2026 and 0.1% after, day trades 0.15% until the end of 2027), rounded down to the dollar; overseas markets at common online sub-brokerage rates; mutual funds are bought through a fund platform at a 1% subscription fee, with nothing on redeeming. Dividends have each country’s withholding.',
        'Exchanges are at the mid-market rate plus or minus a bank’s spread, doubled while FX markets are shut. Margin interest accrues daily. Welcome offer: your first trade pays no commission (taxes and fees as usual).'
      ]],
      ['money', 'Money', [
        'Your money lives in Securities: a new account opens with NT$200,000, and every Monday pays a fixed NT$10,000, like a salary, the same however much you hold; it comes the first time that week you open the app, and a week you miss is paid when you’re back. The system gives money only as the opening money, the pay, wealth level rewards and emergency relief, all arriving as NT$ deposits, counted as money put in, not as return.',
        'Wealth levels: the first time what you’re worth (cash and holdings) reaches a level, its reward is paid once: NT$30,000 at NT$300,000, NT$50,000 at 500,000, NT$100,000 at a million, NT$250,000 at 3 million, NT$600,000 at 10 million and NT$3,000,000 at 100 million.',
        'Truth (Money › Truth) works out from your own record where your money came from: what the system gave, the government (transaction tax, dividend withholding and the NHI premium, less relief) and your own result; and what a trade really costs.',
        'Dividends have each country’s withholding: held on the ex-date, the cash arrives on the pay day (the announced one where known, else about 4 weeks later in Taiwan and a week in the US, moved past holidays to the next trading day); until then it’s listed as on the way, counted in net worth but not spendable.',
        'With the balance below zero (an overdraft) nothing more can be spent, it costs 1% a month, and Sell to cover finds the fewest sales that cover it. Like an unpaid settlement, not covered within 2 days it’s a default: a 7% penalty, holdings sold, and no margin or short selling for 5 years.'
      ]],
      ['relief', 'Emergency relief', [
        'With cash and stocks (at cost) together under NT$2,000 and payday more than 2 days away, you can get NT$5,000 once. Once every 13 weeks, 3 times a year at most, and it stays on your record.'
      ]]
    ]
  },
  match: {
    zh: [
      ['what', 'Orbit Sports 是什麼', [
        'Orbit 的運動 App：台灣看得到的每個聯賽（愛爾達 ELTA.tv 和 Apple TV）的比分、賽程、排名、球隊和球員，每場比賽的詳細數據，還有依你追蹤的排好的今天看什麼，一點就打開轉播。'
      ]],
      ['game', '比賽頁', [
        '比分、系列賽戰況和逐局（節、半場）比分；進行中有即時面板（壘包和球數、進球和紅牌、得分最多的球員）和勝率走勢，按住走勢看每個時刻，關鍵時刻標在線上。',
        '概況、數據、球員（box score，可以排序）、過程（每一球、每一回合）、先發和場上球員、陣容、傷兵、排名和比賽資訊。點任何球員打開他在這場的數據。',
        '結束的比賽有精華影片（YouTube 的官方影片）和重播：愛爾達的整場影片，或 48 小時內的頻道回看；MLS 開 Apple TV 那場比賽的頁面。'
      ]],
      ['follow', '追蹤與通知', [
        '「我的設定」（追蹤分頁）：運動依優先順序排（第一個最優先）、各運動的聯賽、追蹤的對象和喜歡的轉播語言（英文原音、中文、雙語）。球隊和選手在他們的頁面或比賽頁按「+ 追蹤」，追蹤球隊也會追蹤它的聯賽；單一場比賽按「追蹤這場」、F1 按「追蹤這一站」，開始後兩天自動移除。',
        '通知：追蹤的球隊開賽（有台灣轉播時）和終場比分、今日推薦每一場開賽和賽果、F1 的排位賽、衝刺賽和正賽開始，和衝刺賽、正賽的前三名；每一種都能在 Orbit Pass 的通知各自開關。',
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
      ['game', 'A game’s page', [
        'The score, the series and the line score; while it’s on, a live panel (bases and count, goals and red cards, the top scorers) and the win chance over time: hold it to read any moment, the key moments marked on its line.',
        'Summary, stats, players (box scores, sortable), plays (every pitch or possession), starters and who’s on now, line-ups, injuries, the table and the game’s details. Tap any player for his numbers in this game.',
        'A game over has its highlights (the official video on YouTube) and its replay: ELTA’s whole game, or its channel’s catch-up within 48 hours; for MLS, Apple TV’s page of that game.'
      ]],
      ['follow', 'Following and notices', [
        'My settings (in Following): your sports in order (the first counts most), each sport’s leagues, who you follow and the commentary you like (English, Chinese, both). Follow a team or player with + Follow on their page or a game’s, which follows its league too; Follow this game, or Follow this race weekend for F1, is let go two days after it starts.',
        'Notices: a followed team’s game starting (when it’s on TV here) and its final score, each of today’s picks starting and its result, and F1’s qualifying, sprint and race starting, and the sprint’s and race’s top three; each kind has its own switch in the Orbit Pass’s notifications.',
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
        'Orbit 的背單字 App：大考中心高中英文參考詞彙 6,169 字，每個字都有真人發音，記憶模型替你安排什麼時候複習。沒有網路也能用，進度每一步都存在手機上，連上網路再和 Orbit Pass 合併。'
      ]],
      ['words', '背單字', [
        '大考中心高中英文參考詞彙第 1 到 6 級，每個字都有真人發音錄音（Microsoft Jenny），不會打斷你正在聽的音樂。每一輪 10、20 或 30 個字，混合該複習的字和新字；答錯的字會在這一輪最後換個方向再問一次（選錯的從另一邊問，拼錯的改聽寫）。「背新字」一張一張看新字（發音、意思），背滿一批就考這批字，考完之後照記憶模型排複習。',
        '題目故意出得難，因為想得辛苦才記得住：錯的選項都是最容易選錯的字：拼法幾乎一樣的（adapt、adopt、adept）、意思很接近的、同詞性同長度的、常被搞混的，還有你以前搞混過的那個字；不會出兩個都對的選項。',
        '新字在一輪裡第一次出現是一題「檢查」：看字（聽發音）從四個意思選一個，下面有「不認識」，不用猜。一眼就答對算已經會，六週後才再問；答得穩三週後；答得慢幾天內再問；答錯就開始學。要考哪些新字，是照你的作答紀錄猜：你在哪個級別、哪種詞性、多長的字比較常錯，還有跟你最近答錯的字長得像的字，最可能不會的先考。',
        '「智慧」模式照這個字練到哪裡出題：還在學的，練兩個方向和聽音（選意思、選英文、聽音選字）；記穩了就考聽寫。填空和拼字母不在智慧模式裡，可以在「今天」的練習模式單獨選；片語不考聽寫。',
        '每個字有自己的記憶模型（FSRS，Anki 用的排程）：記得多穩（天數）和對你多難。算出還記得的機率掉到 90% 時，它就該複習；對你容易的字等到 80–85% 才考，時間留給弱點。隔越久還答對、用寫的答對、答得快，下次就隔越久；選擇題答對、答得慢，加得少；答錯會大幅縮短，這個字也會被記成比較難。記得超過 10 天算「精熟」。每一輪先考最可能忘的字，把你搞混過的字排在同一輪讓你分辨，長得像的字不會連著出；還在學的字太多時少加新字，沒什麼要複習時新字最多占一輪的六成。'
      ]],
      ['goal', '每日目標與等級', [
        '一天回答 20 題就達成今天的目標，連續天數 +1；開啟通知後，晚上 8 點還沒練習會提醒你（App 關著也會）。',
        '每答對一題 2 XP，第一次精熟一個字再加 15 XP。累計積分決定等級（Lv 2 要 100 XP、Lv 5 要 1,600、Lv 10 要 8,100、Lv 20 要 36,100），每幾級換一個稱號：新手、學徒、好手、高手、達人、大師、傳奇、神話。積分只是你的學習紀錄，不能換任何東西。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Words 不用錢，也不發錢：練單字永遠免費。帳戶和頭像在每個 App 右上角的 Orbit Pass 裡。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Words is', [
        'Orbit’s vocabulary app: the 6,169 words of Taiwan’s high-school English reference list, each recorded by a real voice, with a memory model deciding when each comes back. It works offline: progress is kept on the phone at every step and merged with your Orbit Pass once you’re online.'
      ]],
      ['words', 'Learning words', [
        'Levels 1 to 6 of the College Entrance Examination Center’s list, each word recorded by a real voice (Microsoft Jenny), played without stopping your music. A round is 10, 20 or 30 words, due ones and new ones mixed; a missed word comes back at the end of the round the other way round (picked wrong: from the other side; misspelt: dictated). Study new words shows them one at a time (sound, meaning); a full batch is then quizzed, and the quiz starts their schedule.',
        'Questions are hard on purpose, because effortful recall is what sticks: every wrong option is the likeliest slip: spelt almost the same (adapt, adopt, adept), close in meaning, the same part of speech and length, commonly confused, or a word you’ve mixed it up with before; two options are never both right.',
        'A new word’s first question in a round is a check: the word (and its sound) and four meanings, with I don’t know under them, so there’s no guessing. Right at a glance, it’s known and back in six weeks; steady, in three; slow, within days; missed, it’s learnt. Which new words come first is guessed from your answers: the levels, parts of speech and lengths you miss most, and look-alikes of your latest misses; the likeliest unknown first.',
        'Smart mode asks what a word is being trained in: while it’s learnt, both ways and by ear (meaning, English, by ear); once it’s held, dictation. Fill in and letters aren’t in smart mode; choose them from the ways to practise on Today. Phrases are never dictated.',
        'Every word has its own memory model (FSRS, Anki’s scheduler): how stable it is (in days) and how hard it is for you. When the chance you still remember it falls to 90% it’s due; words that are easy for you wait until 80–85%, so time goes to weak spots. Right after a long gap, typed, or fast pushes the next review further out; multiple choice or slow adds less; a miss cuts it sharply and marks the word harder. Over 10 days is mastered. Each round asks the words likeliest forgotten first, puts the words you’ve confused together so you can tell them apart, and never asks look-alikes back to back; with many words still being learnt it adds fewer new ones, and with little due new words take up to 60% of a round.'
      ]],
      ['goal', 'Daily goal and level', [
        'Answer 20 questions in a day to meet the goal and add a day to your streak; with notices on, you’re reminded at 8 pm if you haven’t practised yet (with the app closed too).',
        'Each right answer earns 2 XP and a word’s first mastery 15 more. Total XP sets your level (Lv 2 at 100 XP, Lv 5 at 1,600, Lv 10 at 8,100, Lv 20 at 36,100), with a new title every few levels: Rookie, Apprentice, Skilled, Expert, Master, Grandmaster, Legend, Mythic. XP is only a record of learning; it buys nothing.'
      ]],
      ['money', 'Money', [
        'Orbit Words uses no money and pays none: learning is always free. Your account and looks are in the Orbit Pass at the top right of every app.'
      ]]
    ]
  },
  orbit: {
    zh: [
      ['what', 'Orbit Class 是什麼', [
        'Orbit 的課表 App。打開就知道現在是哪一節、還剩幾分鐘、下一節是什麼。課表存在 Orbit Pass，登入的每台裝置都一樣；沒有網路也能看，改的地方連上網路再送出。'
      ]],
      ['swap', '調課', [
        '點一節課再按「調課」，或在「課表」按「新增調課」，選要對調的另一節（同一天、別天或別週都可以；選空堂就是把課搬過去，週六補課也可以）。隔週上的課，先在「課表」切到那一週再點。',
        '只換那兩天，其他週照舊；調過的課標著橘色「調課」，通知也跟著換。點那節或「課表」裡的調課可以取消。'
      ]],
      ['notify', '上課提醒與假日', [
        '下課鐘響時通知你下一節的課名、時間、老師和教室（第一節和午休後是上課前 5 分鐘），App 關著也會；開關在 Orbit Pass 的通知。',
        '國定假日和補假沒有課，也不會通知；「下一個上課日」會跳過它們。倒數活動打開「結束後自動刪除」，活動過了就自己刪掉。'
      ]],
      ['share', '分享課表', [
        '課表只有建立它的 Orbit Pass 能編輯。要分享時在「工具」按「產生分享金鑰」（24 小時內有效），對方在自己的 Orbit Class 輸入就得到一份自己的副本，可以自己改。',
        '另一台裝置在你之後改過課表時，以比較新的為準，這台的修改會先另外存起來並告訴你，不會蓋掉。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Class 不用錢。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Class is', [
        'Orbit’s class schedule app: open it to see the period now, the minutes left and what’s next. The schedule lives on your Orbit Pass, the same on every device you sign in on; it opens offline too, and an edit made then is sent once you’re back online.'
      ]],
      ['swap', 'Swapping classes', [
        'Tap a class and Swap, or Swap a class in Timetable, then pick the period to trade with (the same day, another day or another week; a free period moves the class there, a Saturday make-up too). For a class met every other week, switch Timetable to that week first.',
        'Only those two dates change, every other week as before; a swapped class carries an orange Swap tag, and its notice follows it. Tap it, or the swap in Timetable, to undo it.'
      ]],
      ['notify', 'Class reminders and holidays', [
        'At the bell you’re told the next class’s name, time, teacher and room (5 minutes before the first class and after lunch), with the app closed too; the switch is in the Orbit Pass’s notifications.',
        'Taiwan’s holidays and their make-up days off have no classes and no reminders, and the next school day skips them. A countdown with Delete when over clears itself once it has passed.'
      ]],
      ['share', 'Sharing a schedule', [
        'Only the Orbit Pass that made a schedule edits it. To share it, make a share key in Tools (valid 24 hours): entering it in their own Orbit Class gives a classmate their own copy to change as they like.',
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
      ['pins', '釘選地點與我的行程', [
        '在「地點」按「新增地點」：名稱、鄉鎮，和你在那裡的星期和時間；那段時間打開 App 會直接顯示那裡。打開「這是我的家」，沒有其他行程的時間就當作在家。按「編輯」改或排順序。',
        '「我的行程」每個小時取你那時在的地方的天氣，拼成一頁（例如平日 7 到 17 點在學校，其他時間在家）；手機發現你在別的地方，就用你真正在的地方。放假日不算學校的行程。'
      ]],
      ['notify', '設定與通知', [
        '「地點」的設定：早晨天氣的時間，和版面（卡片的順序、關掉不需要的）。',
        '早晨天氣：每天在設定的時間一句話（降雨、溫度、紫外線、空氣），以那時的釘選地點為準。降雨提醒：白天 2 小時內可能下雨時，一天最多一次。兩個開關都在 Orbit Pass 的通知。'
      ]],
      ['fresh', '資料多新', [
        'App 開著時每 15 分鐘更新；超過 30 分鐘沒更新會變淡並寫著是多久以前的。定位關掉或抓不到時用上次的位置。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Weather 不用錢。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Weather is', [
        'Orbit’s weather app: one answer. The Central Weather Administration’s, Google’s and the Ministry of Environment’s forecasts and real station readings, blended into one forecast for about a square kilometre: will it rain, take an umbrella, what to wear, UV and air quality. Offline, it opens on the last forecast.'
      ]],
      ['pins', 'Pinned places and My day', [
        'Add a place in Places: a name, a township, and the days and hours you’re there; opening the app in those hours shows it. Turn on This is my home, and any hour without another place counts as home. Edit changes or reorders them.',
        'My day stitches each hour’s weather from where you’ll be then (school 7 to 17 on weekdays, home the rest, say); when the phone finds you somewhere else, where you really are is used. Holidays don’t count school.'
      ]],
      ['notify', 'Settings and notices', [
        'Settings in Places: the morning brief’s time, and the layout (the cards’ order, hiding the ones you don’t need).',
        'Morning weather: one line each day at that time (rain, temperature, UV, air), for the pinned place you’re at then. Rain alert: rain likely within 2 hours in the daytime, once a day at most. Both switches are in the Orbit Pass’s notifications.'
      ]],
      ['fresh', 'How fresh it is', [
        'While open it refreshes every 15 minutes; past 30 minutes without one it fades and says how old it is. With location off or not found, the last place is used.'
      ]],
      ['money', 'Money', [
        'Orbit Weather uses no money.'
      ]]
    ]
  },
  money: {
    zh: [
      ['what', 'Orbit Money 是什麼', [
        '你自己的記帳本：每天花了多少、每個帳戶還有多少。記的是你真實的錢，和 Securities 的遊戲錢完全分開，不會互相影響。資料存在你的 Orbit Pass 裡，換手機也在。'
      ]],
      ['entry', '記一筆', [
        '按右下角的 ＋。種類（支出、收入、轉帳）、分類、細項和付款方式會照你的習慣先選好（時間、平日假日、你以前怎麼選）；金額點數字欄用手機的鍵盤輸入，或點建議的金額。日期和備註要的話再改。',
        '轉帳是錢在你自己的帳戶之間移動（提款、儲值悠遊卡、繳卡費），只有金額、從哪裡到哪裡、日期、手續費和備註，不算支出。固定收支（房租、薪水、訂閱）設一次，到日子自動記上。'
      ]],
      ['photo', '拍照記帳', [
        '在記一筆或「更多」按「拍照」，拍或選一張照片：收據、發票、帳單、外送或付款 App 的截圖、轉帳通知、價格標籤都可以。AI 會讀出金額、日期、店家、品項，猜好分類和付款方式，你看過、改好再儲存。',
        '如果已經記過同一筆（同樣金額、差不到一天），會問你要不要合併：收據的店家和品項併進原本那筆，不會記兩次。一張截圖裡有好幾筆，會一起列出來給你看過。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Money 只記你自己的帳，不用 Orbit 的錢，也不發錢。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Money is', [
        'Your own books: what you spend each day and what each account holds. It tracks your real money, kept apart from the play money in Securities. It lives on your Orbit Pass, the same on any phone.'
      ]],
      ['entry', 'Adding an entry', [
        'Tap the ＋ at the bottom. The kind (spent, income, transfer), category, sub and way to pay are picked for you from your habits (the hour, weekday or weekend, what you chose before); tap the amount to type it on the phone’s keys, or tap a suggested one. Change the day or add a note if you like.',
        'A transfer moves money between your own accounts (a withdrawal, an EasyCard top-up, a card bill): just the amount, from and to, the day, a fee and a note; it isn’t spending. Repeats (rent, salary, subscriptions) are set once and added on their day.'
      ]],
      ['photo', 'Entries from a photo', [
        'Tap Photo in a new entry or under More, then take or pick a picture: a receipt, an invoice, a bill, a delivery or payment app’s screenshot, a transfer notice, a price tag. AI reads the amount, day, store and items and guesses the category and way to pay, for you to check before saving.',
        'If the same one is already in (same amount, within a day), you’re asked whether to merge: the store and items go onto the entry you made, so nothing is counted twice. A screenshot with several shows them all for a look first.'
      ]],
      ['money', 'Money', [
        'Orbit Money only keeps your own books: it neither uses nor pays Orbit money.'
      ]]
    ]
  },
  news: {
    zh: [
      ['what', 'Orbit News 是什麼', [
        '把台灣和國際的新聞，依「同一件事」歸成一則：每則看得到有幾家媒體報、偏綠、中間、偏藍（國際是偏左、中間、偏右）各幾家，和各家的標題並排。點標題就到那家媒體的網站看全文。'
      ]],
      ['sides', '媒體的位置怎麼定', [
        '每家媒體在藍綠和統獨上的位置，依學術研究定：TEDS 調查裡各家觀眾的政黨傾向（Chiang & Shih）、報紙的研究（Kao、Chang & Fang 等）；比較新的網路媒體，依擁有者和公開立場判斷，標成「依據較弱」。國際媒體用 AllSides 的評等；它沒評的，不放進左中右。',
        '「媒體」分頁看得到每一家的位置和依據。位置說的是一家媒體整體的傾向，不是每一篇報導。'
      ]],
      ['oneside', '單邊', [
        '有三家以上報、超過兩小時，卻只有一邊的媒體在報（另一邊一家都沒有）的新聞。不一定是誰刻意不報，但值得看看另一邊少看到了什麼。'
      ]],
      ['read', '我的閱讀', [
        '你點開過哪些媒體，依偏綠、中間、偏藍算成一條，看自己平常讀的是不是都在同一邊。只記哪一家、哪一天，不記哪一篇；存在你的 Orbit Pass 裡。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit News 免費，不用 Orbit 的錢。'
      ]]
    ],
    en: [
      ['what', 'What Orbit News is', [
        'Taiwan’s and the world’s news, the same event from every outlet gathered into one story: how many outlets carry it, how many lean green, centre or blue (left, centre or right for English news), and their headlines side by side. A tap on a headline opens it on the outlet’s own site.'
      ]],
      ['sides', 'How outlets are placed', [
        'Each Taiwanese outlet’s place on blue–green and on unification–independence comes from research: its audience’s party in the TEDS surveys (Chiang & Shih), studies of the papers (Kao; Chang & Fang); newer web outlets by owner and stated stance, marked as weaker. English outlets use AllSides’ ratings; ones it hasn’t rated stay out of left, centre and right.',
        'The Outlets tab shows each one’s place and why. A place is an outlet’s lean as a whole, not each report’s.'
      ]],
      ['oneside', 'One side', [
        'Stories that three or more outlets carry, over two hours old, with every one on one side and none on the other. Not always a choice to leave it out, but worth seeing what the other side’s readers miss.'
      ]],
      ['read', 'Your reading', [
        'The outlets you opened, counted by side into one bar, to see whether what you read sits on one side. Only which outlet and which day, never which article; kept on your Orbit Pass.'
      ]],
      ['money', 'Money', [
        'Orbit News is free and uses no Orbit money.'
      ]]
    ]
  },
  beats: {
    zh: [
      ['what', 'Orbit Beats 是什麼', [
        'Orbit 的音樂 App：按播放，App 用自己的樂器現做一首首新歌，不會重複；也可以自己做：放進節拍片段排成歌、在樂器上編鼓和旋律、即興，或玩節奏遊戲。全部在手機上算，聲音不上傳，沒有網路也能用。'
      ]],
      ['add', '放進片段', [
        '一段錄音（片段之間有 0.2 秒以上的安靜，就在安靜處切開；沒有安靜的長錄音，依節拍一小節一小節切，或一下一下切）、一整包取樣，或用麥克風錄；WAV 最好，m4a、mp3 也可以。切出來的數量不對，到「切片」把「安靜門檻」調高（例如 -60 dB）。'
      ]],
      ['roles', '速度與角色', [
        '速度從片段聽出來；聽成一半或兩倍時按 ½ 或 ×2，也可以輸入或點拍子。每段的角色（Riff、樂句、貝斯、Hi-hat、過門、大鼓、808、小鼓、Tick、滾奏、不用）也是聽出來的，選單可以改，改過的不會被蓋掉。至少要有一段 Riff 或樂句。'
      ]],
      ['make', '做歌', [
        '20 種鼓的風格：四拍、嘻哈、Trap、半速、碎拍、House、Dembow、Afro、Drill、Boom Bap、Jersey、Amapiano、Lo-fi、放克、UK 車庫、D&B、雷鬼、Phonk、Baile、Techno。每首有段落圖（前奏、主歌、導歌、副歌、間奏、橋段、尾奏）。',
        '「⋯」：變奏一首、換個鼓、編排（段落上移、重複、換段落、改小節數或拿掉）、分享、下載 WAV、下載分軌、匯出 MIDI。播放器播完接下一首、單曲重複或重複這一段。',
        '「混音」預設打開；關掉的話，每段跟錄的一模一樣。'
      ]],
      ['pass', '存在 Orbit Pass 的', [
        '設定、每組片段的速度和你改過的角色，和每種風格收藏了幾首；打開「依你的口味」，做歌就偏向你喜歡的。聲音本身不離開手機。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Beats 免費，不碰錢。帳戶和頭像在右上角的 Orbit Pass 裡。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Beats is', [
        'Orbit’s music app: press play and it makes new songs on its own instruments, never the same twice. Or make your own: beat pieces arranged into songs, drums and melody in the studio, a jam, or the rhythm game. It all runs on the phone: no sound is uploaded, and it works offline.'
      ]],
      ['add', 'Adding pieces', [
        'One recording (split at its silences of 0.2 s or more; a long take with none is cut on its beat, bar by bar or hit by hit), a whole sample pack, or the microphone; WAV is best, m4a and mp3 work too. If the count is off, raise Silence below under Splitting (say to -60 dB).'
      ]],
      ['roles', 'Tempo and roles', [
        'The tempo is heard from the pieces; if it hears half or double, tap ½ or ×2, type it, or tap it in. Each piece’s role (riff, phrase, bass, hats, fill, kick, 808, snare, tick, roll, not used) is heard too; change it in its menu, and a role set by hand stays. At least one riff or phrase is needed.'
      ]],
      ['make', 'Making songs', [
        '20 drum styles: four, hip-hop, trap, half, broken, house, dembow, afro, drill, boom bap, Jersey, amapiano, lo-fi, funk, UK garage, D&B, reggae, phonk, baile funk, techno. Each song shows its sections (intro, verse, pre-hook, hook, break, bridge, outro).',
        '⋯: a variation, another groove, Arrange (move a section up, repeat it, change its kind or bars, or remove it), Share, Download WAV, Download stems, Export MIDI. The player goes on to the next song, repeats one, or repeats a section.',
        'Mix is on by default; off, every piece plays exactly as recorded.'
      ]],
      ['pass', 'On your Orbit Pass', [
        'Your settings, each set’s tempo and the roles you set, and how many songs you kept of each style; with Lean to your taste on, new songs lean to what you like. The sound itself never leaves the phone.'
      ]],
      ['money', 'Money', [
        'Orbit Beats is free and moves no money. The account and looks are in the Orbit Pass, top right.'
      ]]
    ]
  },
  transit: {
    zh: [
      ['what', 'Orbit Transit 是什麼', [
        'Orbit 的大眾運輸 App：全台公車、台鐵、高鐵、捷運和 YouBike，路線規劃、到站時間和導航都在一起。到站時間和規劃都是即時的，所以需要網路。'
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
        '導航中：該出發、要搭的公車快到了、火車快開、下一站要下車，都會通知到鎖定畫面。兩種通知都在 Orbit Pass 的通知各自開關。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Transit 不用錢；票價只是參考。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Transit is', [
        'Orbit’s public transport app: Taiwan’s buses, railways, high-speed rail, metros and YouBike, with trip plans, arrivals and navigation in one place. Arrivals and plans are live, so it needs the connection.'
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
        'Navigating: time to leave, your bus nearly here, your train about to leave, your stop next, all on the lock screen. Both kinds have their own switch in the Orbit Pass’s notifications.'
      ]],
      ['money', 'Money', [
        'Orbit Transit is free; fares are a guide.'
      ]]
    ]
  },
  law: {
    zh: [
      ['what', 'Orbit Law 是什麼', [
        '台灣的法律，三面連在一起：法規（每個條號都能點）、法院怎麼判（憲法法庭和最高法院）、立法院正在改什麼。資料每天從官方更新，打開過的沒網路也能看。不是法律意見；重要的事請問律師或主管機關。'
      ]],
      ['ask', '問法律', [
        '用白話問，例如「房東不還押金怎麼辦」。AI 先從法規、裁判和函釋裡找出相關的條文，只用找到的回答：先給結論，每一點都附出處，點出處直接看原文。可以接著問。',
        '你的城市（問法律裡選）會帶進地方自治法規。每人每天 30 次。'
      ]],
      ['read', '讀法規', [
        '一條條讀，目錄跳到章節；條文裡的「第幾條」「前項」「某某法第幾條」都是連結。每條的「白話解釋」用平常的話說它在講什麼。⋯ 裡有沿革（每次修了什麼）、施行日期、英文版和相關的判決。',
        '修過的條文會標出來，點開看修法前後對照。'
      ]],
      ['rulings', '裁判', [
        '憲法法庭的每號釋字和憲判字、最高法院和最高行政法院的判決，依法條連到它。每份裁判有 AI 說明：判了什麼、為什麼、影響誰，每一點都附段落。'
      ]],
      ['bills', '立法', [
        '法案一案一頁：走到哪一階段、誰提的、條文對照表（改了哪裡）、表決紀錄和各黨怎麼投。還有行政院的預告、立委（依縣市或政黨）、議程和立法院正在直播的。'
      ]],
      ['mine', '我的', [
        '收藏的法規、追蹤的法案和立委，有新的修法或進度會標出數字。'
      ]],
      ['money', '錢怎麼算', [
        'Orbit Law 不用錢。'
      ]]
    ],
    en: [
      ['what', 'What Orbit Law is', [
        'Taiwan’s law on three linked sides: the laws (every article a link), how the courts ruled (the Constitutional Court and the top courts), and what 立法院 is changing. Updated daily from the official sources; what you’ve opened reads offline. Not legal advice: for anything that matters, ask a lawyer or the agency.'
      ]],
      ['ask', 'Ask the law', [
        'Ask in plain words, say “my landlord won’t return the deposit”. The AI finds the articles, rulings and agency letters that apply and answers from them only: the verdict first, every point cited, a tap on a citation shows the text. Ask on from there.',
        'Your city (chosen in Ask) brings in its own local rules. 30 questions a day.'
      ]],
      ['read', 'Reading a law', [
        'Read it article by article, contents to jump; “Article 5”, “the preceding paragraph” and another law’s article are all links. Explain says what an article means in everyday words. ⋯ has its history (what each amendment changed), when it took effect, the English version and the rulings on it.',
        'Amended articles are marked; tap for before and after.'
      ]],
      ['rulings', 'Rulings', [
        'The Constitutional Court’s every interpretation and judgment, and the Supreme Court’s and Supreme Administrative Court’s rulings, linked from the articles. Each has an AI note: what was decided, why and whom it affects, every point citing its paragraphs.'
      ]],
      ['bills', 'Bills', [
        'A page a bill: its stage, who proposed it, the comparison table (what changes), the votes and how each party voted. Also the Executive Yuan’s draft notices, legislators by county or party, the agenda and what 立法院 streams now.'
      ]],
      ['mine', 'Mine', [
        'Starred laws, followed bills and legislators, with a count when something new happens.'
      ]],
      ['money', 'Money', [
        'Orbit Law is free.'
      ]]
    ]
  }
};

// The family's order (brand.mjs APP_ORDER), the apps with a guide.
export const HELP_ORDER = ['pass', ...APP_ORDER.filter(a => a in HELP)];

export function helpFor(app, lang = 'zh') {
  return HELP[app]?.[lang === 'en' ? 'en' : 'zh'] || [];
}


// ---- The tour ----------------------------------------------------------------------------
// Each app's screens, in its tab bar's order (and the few screens worth
// knowing beside them), each with its real screenshot (kit/img/help/<app>/
// <stop>.<lang>.<theme>.webp, retaken by tools/help-shots.mjs; their hashes
// in SHOTS at the end of this file) and a line or two on what it's for.
//   TOURS[app][lang] = [[stop id, title, [lines]], …]

export const TOURS = {
  pass: {
    zh: [
      ['first', '第一次登入', ['別人給你的通行碼，第一次登入時要先換成你自己的一組新通行碼（換好才打開 App）；接著可以加入通行密鑰（建議，用 Face ID 登入），也可以以後再說。']],
      ['pass', 'Pass', ['你的卡片（頭像、里程碑、帳號），點它換外觀；下面是這個 App 的設定、新增裝置、通知、除錯紀錄和帳戶安全。']],
      ['looks', '外觀', ['里程碑，和免費的頭像、頭像框。最上面是最接近的下一枚。']],
      ['apps', 'App', ['每個 Orbit App，上次什麼時候用，一點就打開。']]
    ],
    en: [
      ['first', 'First sign-in', ['A pass someone gave you is replaced with a new one of your own at its first sign-in (then the app opens); after that you can add a passkey (recommended: sign in with Face ID), or leave it for later.']],
      ['pass', 'Pass', ['Your card (avatar, milestones, account); tap it for your look. Below: this app’s settings, adding a device, notifications, the debug log and security.']],
      ['looks', 'Looks', ['Milestones, and the free avatars and frames. On top, the nearest next medal.']],
      ['apps', 'Apps', ['Every Orbit app, when you last used it, a tap to open it.']]
    ]
  },
  match: {
    zh: [
      ['home', '首頁', ['今天看什麼：正在進行的比賽在最上面，接著是依你的喜好排好、時間不撞的推薦，和你的球隊。', '上方選一天，或只看我的比賽、某個運動。']],
      ['matches', '賽事', ['依運動和聯賽找比賽，打開就在離現在最近的比賽日；賽程、排名、季後賽。', '最上面搜尋聯賽、球隊和球員；點任何一場看比賽頁。']],
      ['live', '轉播', ['什麼時候、在哪一台：下一場轉播、你追蹤的接下來 7 天，和愛爾達節目表。', '正在轉播的點「觀看」直接打開。']],
      ['following', '追蹤', ['你的球隊和選手現在怎麼樣：排名、近況、上一場和下一場。']]
    ],
    en: [
      ['home', 'Home', ['What to watch today: games on now first, then picks ordered by your taste that never clash, and your teams.', 'Pick a day on top, or just your games or one sport.']],
      ['matches', 'Matches', ['Games by sport and league, opening on the nearest match day; schedules, tables and playoffs.', 'Search leagues, teams and players at the top; tap any game for its page.']],
      ['live', 'TV', ['When and on which channel: the next broadcast, the next 7 days of what you follow, and ELTA’s full guide.', 'Tap Watch on a game on air to open it.']],
      ['following', 'Following', ['How your teams and drivers are doing: standing, form, the last game and the next.']]
    ]
  },
  transit: {
    zh: [
      ['map', '地圖', ['YouBike、公車站和台鐵、高鐵、捷運站都在地圖上，點一個看它的車或剩幾台。', '下面的卡片往上拉：搜尋、常用和附近。']],
      ['go', '交通', ['要去哪裡？我的路線（行程、釘選的公車和火車）下一班什麼時候到，和附近的公車。點一條就出發。']],
      ['times', '查時刻', ['火車站到站的每一班（自動找最快的轉乘）、票價和誤點；公車用號碼或站名找，看每一站現在的車；還有捷運。']],
      ['me', '我的', ['行程、地點、釘選的公車和火車，TPASS 和交通方式的偏好。']]
    ],
    en: [
      ['map', 'Map', ['YouBike docks, bus stops and every rail and metro station on the map; tap one for its next rides or bikes left.', 'Pull up the card below for search, favourites and what’s near.']],
      ['go', 'Transit', ['Where to? When the next ride comes on your routes (trips, pinned buses and trains), and the buses near you. Tap one to go.']],
      ['times', 'Times', ['Every train between two stations (the fastest change found for you), fares and delays; any bus by number or stop, with each stop’s buses now; and the metro.']],
      ['me', 'Me', ['Trips, places, pinned buses and trains, TPASS and how you like to travel.']]
    ]
  },
  weather: {
    zh: [
      ['now', '天氣', ['一個地點一頁：現在的天氣、你的行程每一站到時幾度、每小時，和今日數據（降雨、紫外線、空氣）。', '點標題換地點。']],
      ['day', '一天', ['點最上面的天氣，或 10 天預報的任一天：那天的逐時溫度、降雨和建議（帶傘、穿著、曬衣）。上方換一天。']],
      ['rain', '大圖', ['今日數據點一行看大圖：每小時或每天的降雨、紫外線和空氣，按住圖表滑動看數字。']],
      ['places', '地點', ['「我的行程」和釘選的地點，每個地方現在幾度；點一個打開它，也能新增或排順序。']]
    ],
    en: [
      ['now', 'Weather', ['One page a place: the weather now, how warm each stop of your day will be, the hours ahead and today’s readings (rain, UV, air).', 'Tap the title to change place.']],
      ['day', 'A day', ['Tap the weather at the top, or any of the ten days: that day hour by hour, its rain and what to bring or wear. Change day on top.']],
      ['rain', 'Charts', ['Tap a reading for its chart: rain, UV and air by the hour or the day; hold and slide for the numbers.']],
      ['places', 'Places', ['My day and your pinned places, each with its weather now; tap one to open it, or add and reorder them.']]
    ]
  },
  orbit: {
    zh: [
      ['today', '今天', ['現在這一節（或下一節）和還剩多久，今天的課排成一條線，還有幾節、幾點放學；下面選一天看那天的課，還有倒數活動。']],
      ['class', '一節課', ['點一節課：老師、每週幾節、下次什麼時候、一週排在哪幾節，和調課；點圖示換一個。']],
      ['week', '課表', ['整週的課表，單週、雙週切換；點星期幾看那天；下面是之後的調課。']],
      ['tools', '工具', ['編輯課表、專注飛行、AI 課表編輯（用一句話改）、拍照匯入和分享金鑰。']]
    ],
    en: [
      ['today', 'Today', ['The class on now (or next) and how long is left, the day’s classes on one line; pick a day below for its classes, and your countdowns.']],
      ['class', 'A class', ['Tap a class: its teacher, how many a week, when it’s next, where it sits in the week, and swapping it; tap its icon to change it.']],
      ['week', 'Week', ['The whole week, odd or even; tap a day to open it; swaps to come below.']],
      ['tools', 'Tools', ['Edit the timetable, focus flights, AI edits (one sentence), import from a photo and share keys.']]
    ]
  },
  money: {
    zh: [
      ['cal', '月曆', ['這個月花了多少（設了預算就是還能花多少）；每天格子下面是當天的支出，點一天看那天每一筆。']],
      ['entry', '記一筆', ['右下角的 ＋，每個分頁都有。種類、分類和付款方式依你的習慣先選好，金額點一下就填；也能拍照記帳。']],
      ['accts', '帳戶', ['現金、銀行、悠遊卡等儲值卡、電子支付和信用卡，各自的餘額和總資產。']],
      ['stats', '統計', ['週、月、年的支出和收入：每個分類和細項占多少、跟上一期比、最大筆、在哪裡花最多。']],
      ['more', '更多', ['拍照記帳、分類、智慧帶入（猜中幾成）、到期提醒、固定收支和匯出。']]
    ],
    en: [
      ['cal', 'Calendar', ['What this month cost (with a budget, what’s left to spend); each day’s spending under it, a tap for every entry that day.']],
      ['entry', 'Add an entry', ['The ＋ at the bottom, on every tab. Kind, category and way to pay are guessed from your habits, the amount a tap away; or log from a photo.']],
      ['accts', 'Accounts', ['Cash, banks, stored-value cards, e-wallets and credit cards, each balance and your net worth.']],
      ['stats', 'Stats', ['Spending and income by week, month or year: each category and sub’s share, against the period before, the largest, where you spent most.']],
      ['more', 'More', ['Photo entries, categories, smart fill (and how often it guesses right), reminders, repeats and export.']]
    ]
  },
  vocab: {
    zh: [
      ['today', '今天', ['今天的目標和連續天數，一鍵開始這一輪；下面是今日單字、繼續（新字、該複習、上次錯的）和練習模式。']],
      ['quiz', '一題', ['選中文、選英文、聽音選字、填空、拼字…答完馬上看對錯和這個字的意思。']],
      ['review', '複習', ['答錯、該複習、學習中、收藏的字分開列，寫著每個字錯在哪裡；用卡片翻一遍再測驗。']],
      ['list', '單字', ['全部的字，照級別和狀態篩選，英文或中文都能搜尋；點一個字看它的卡片。']],
      ['progress', '進度', ['等級和點數、正確率、最近 14 天、接下來要複習多少，和最常忘的字。']]
    ],
    en: [
      ['today', 'Today', ['Today’s goal and streak, one tap to start the round; then the word of the day, what to continue (new, due, missed) and the ways to practise.']],
      ['quiz', 'A question', ['Pick the meaning, the word, by ear, fill the gap, spell it… each answer shows at once with the word’s meaning.']],
      ['review', 'Review', ['Missed, due, learning and starred words apart, each with what went wrong; flip through them as cards, then a test.']],
      ['list', 'Words', ['Every word, by level and state, searched in English or Chinese; tap one for its card.']],
      ['progress', 'Progress', ['Level and points, accuracy, the last 14 days, what’s due next and the words you forget most.']]
    ]
  },
  beats: {
    zh: [
      ['home', '首頁', ['按播放就是 App 自己現做的歌，一首接一首；選心情（放鬆、熱血、律動、經典）或電台、類型。♡ 留下喜歡的。']],
      ['create', '創作', ['做歌、樂器、即興和節奏遊戲：用自己的片段做歌、在格子上編鼓和旋律、點打擊墊玩即興。']],
      ['game', '節奏遊戲', ['跟著歌點落下的音符，三種難度。']],
      ['library', '資料庫', ['留下的歌和收藏的片段，在這支手機上；搜尋、排序、改名、分享和下載。']]
    ],
    en: [
      ['home', 'Home', ['Press play for songs the app makes on the spot, one into the next; pick a mood (calm, hype, groove, classic), a station or a genre. ♡ keeps one.']],
      ['create', 'Create', ['Songs, Studio, Jam and the rhythm game: songs from your own pieces, drums and melody on a grid, pads to jam on.']],
      ['game', 'Rhythm game', ['Tap the notes as they fall to the song, at three levels.']],
      ['library', 'Library', ['Kept songs and clips, on this phone; search, sort, rename, share and download.']]
    ]
  },
  law: {
    zh: [
      ['home', '首頁', ['一個欄位：打字搜尋法規，或按「問法律」用白話問。下面是試試這樣問（之後是你最近找過的）、繼續閱讀、立法院今天的議程和直播，和生活情境。']],
      ['laws', '法規', ['搜尋法規名稱、簡稱、條文或生活問題，或依生活情境、類別一路找下去。']],
      ['article', '讀法條', ['每條法規可以讀全文、目錄和沿革；條文裡提到的條號都能點，按「白話解釋」看這條在說什麼。']],
      ['rulings', '裁判', ['憲法法庭和大法官的每一號、最高法院、最高行政法院和各級法院的判決，從法條就連得到；每份都有 AI 說明判了什麼、為什麼。']],
      ['bills', '立法', ['立法院的法案一階段一階段走到哪裡，還有議程、行政院的預告、表決、立委和總預算。']],
      ['ask', '問法律', ['旁邊的圓鈕：用白話問，AI 只用找到的條文回答，每一點都附出處可以點開核對。']]
    ],
    en: [
      ['home', 'Home', ['One field: type to search the laws, or Ask the law in plain words. Below: questions to try (later, your recent finds), where you were reading, 立法院’s agenda and streams today, and life situations.']],
      ['laws', 'Laws', ['Search law names, short names, text or an everyday problem, or browse by life situation and kind.']],
      ['article', 'Reading a law', ['Each law with its text, contents and history; every article it names is a link, and Explain says what one means.']],
      ['rulings', 'Rulings', ['Every Constitutional Court judgment and interpretation, and rulings of the top and lower courts, linked from the articles; an AI note on each says what was decided and why.']],
      ['bills', 'Bills', ['Bills in 立法院 stage by stage, plus the agenda, draft notices, votes, legislators and the budget.']],
      ['ask', 'Ask the law', ['The round button beside the tabs: ask in plain words; the AI answers only from the articles it found, each point cited for you to check.']]
    ]
  },
  stock: {
    zh: [
      ['home', '首頁', ['總資產和今天的漲跌，你持有和自選的，各市場今天怎麼走、漲跌幅排行和為你推薦。']],
      ['markets', '市場', ['搜尋（中文、英文或代號），和每種商品的完整清單：台股、期權、複委託、基金、債券、外匯、黃金、加密。']],
      ['stock', '標的頁', ['點任何一檔：走勢（線圖或 K 線）、公司資料、你的部位，和買進、賣出。']],
      ['portfolio', '資產', ['淨值與走勢、配置、持股、各幣別現金、股利利息、定期定額和到價提醒。']],
      ['fx', '資金', ['換匯、匯率看板、融資、信用帳戶、定存、借券；下面是你的帳戶：薪水、紓困、財富等級和「真相」。']],
      ['history', '紀錄', ['交易明細、委託、統計分析（報酬、費用與稅、和只買大盤比）和回測。']]
    ],
    en: [
      ['home', 'Home', ['Your total and today’s change, what you hold and watch, how each market moves today, the top movers and picks for you.']],
      ['markets', 'Markets', ['Search (Chinese, English or ticker) and every product’s whole list: Taiwan, futures and options, overseas, funds, bonds, forex, gold, crypto.']],
      ['stock', 'A symbol', ['Tap any one: its chart (line or candles), the company, your position, and buy or sell.']],
      ['portfolio', 'Portfolio', ['Net worth and its history, allocation, holdings, cash in each currency, income, monthly plans and price alerts.']],
      ['fx', 'Money', ['Exchange, the rates board, margin, the credit account, time deposits, lending shares; then your account: pay, relief, wealth levels and Truth.']],
      ['history', 'History', ['Activity, orders, stats (returns, costs and taxes, you against just buying the index) and the backtest.']]
    ]
  }
};

// The Pass's own line under its name (the apps' are brand.mjs `role`).
export const ROLE = { pass: { zh: '你在每個 Orbit App 的帳號', en: 'Your account in every Orbit app' } };

export function tourFor(app, lang = 'zh') {
  return TOURS[app]?.[lang === 'en' ? 'en' : 'zh'] || [];
}

// A stop's pictures, light and dark, in the page's language: null until it has them.
export function shotFor(app, stop, lang = 'zh') {
  // (Each picture's own hash, zh light, zh dark, en light, en dark: the service worker checks a ?v= file against it.)
  const v = SHOTS[`${app}/${stop}`]?.split(' ');
  if (v?.length !== 4) return null;
  const en = lang === 'en';
  const at = theme => `${new URL(`./img/help/${app}/${stop}.${en ? 'en' : 'zh'}.${theme}.webp`, import.meta.url).href}?v=${v[(en ? 2 : 0) + (theme === 'dark' ? 1 : 0)]}`;
  return { light: at('light'), dark: at('dark'), w: SHOT_SIZE[0], h: SHOT_SIZE[1] };
}

// ---- The screenshots' hashes (tools/help-shots.mjs writes this block) ----
export const SHOTS = {
  'beats/create': '9571bec7c9ee 0c149349d658 a53c25d1915d deb30fca2f36',
  'beats/game': '096cf6bf6400 579008264e67 f6a3f23bb727 08f4c498ba24',
  'beats/home': 'ec08f34b0c85 065ff4a55c2a 2b6b0ddc5bb7 ce69dee7cea4',
  'beats/library': 'bd0900bcc300 c0c763ea7bae 6e4bdcef19e3 aefdce24e860',
  'law/article': 'a658acf81b49 e3e499f95e45 7836222d6ea4 6baac5dfd3a1',
  'law/ask': '6c152896caf5 d45952fd5e1e 5ef60c0b9523 7bbfbdba3a52',
  'law/bills': '0aa4ded9b304 2df9b342ba50 3098c7d225e2 cb4de73a4419',
  'law/home': 'af75b972ff7d e6ea670b42e3 50f84920f585 1b349aec951e',
  'law/laws': '49483858cc81 15e669a62e1a be793f385685 b21dcf13016b',
  'law/rulings': '141504d037ed 218c9b3aed35 6fa85d028e34 df4f37b939b2',
  'match/following': 'f50b180e4580 7bc69092fa1a 398c8ea75c16 73c6731f7253',
  'match/home': 'bc424ab3e4b8 907acbdc161d 99b561dc632a afd96d541646',
  'match/live': '664e5641b02c 0706e390c114 cb85ffe82b79 42e214a85dcf',
  'match/matches': '714c2fcf2911 c754736139c6 101ac6014c0e 995bb855e1ed',
  'money/accts': '1f9237fc4127 acb09f288d9d d5f959cae71b 71a21c6c0c06',
  'money/cal': '4ac689a0f7c3 2adc82b2d31b e692a6963fa1 94d9a8d0a09f',
  'money/entry': '0c5d0d6177e7 2e204f41b1b6 832ebfba8879 ac815a746a6e',
  'money/more': '141b4955625d bff15cb47995 23fcdae6eebb 854531843a9d',
  'money/stats': '6c2817a3ee9f a66a25157eb9 f6a75e86ffa7 961f2786e2c8',
  'orbit/class': '0d5ec6006556 10f6e203ccae 575eb38b4d75 f66fe65b4a5f',
  'orbit/today': 'df9004310e17 ec862e7d897e 133140ac7c6b d59d25228264',
  'orbit/tools': '598835146624 824932e8ad4d 6bcfefbbcfb0 644446c1215c',
  'orbit/week': 'b8ac79106daf b46d443d1083 390d620645e9 7196ad48cb68',
  'pass/apps': 'ebb71f5949af d8d096baa232 57abd9ade33d acc0a766b6ce',
  'pass/first': '59111b5a6fa3 40ac465dc8a8 4fe17026b2fc 6c2f7f31524b',
  'pass/looks': '8e968219ba64 c478355a65a4 a43d1023104f 7377be49a3c2',
  'pass/pass': '601cec090c7f 7bbf7c5de2f8 d54cefa42676 30dd5ce15398',
  'stock/fx': '93d9775887f9 58905304a8ab 217757064191 902fc319786c',
  'stock/history': 'fe9d0b198557 65af37ffd8f8 ae29283a3f24 2d09cb535a47',
  'stock/home': '0b3b7c09d086 f50812625229 14343c90de80 87702acb84c9',
  'stock/markets': '783924830cfe dbb658823980 97a4d4263e4b 707446a052ce',
  'stock/portfolio': '1db5d135bf90 cf15b722dbdc f824d464f456 2417a45d9da3',
  'stock/stock': '19dfc22a6116 55b5f33781ed e6d8d4f01487 911155492127',
  'transit/go': 'c4d09eeb11f5 534dd99b6ed3 6b4bdfa73c80 22077136ed23',
  'transit/map': '207732541eeb a1fddeb16b11 757d5f6f41b5 42db1302cd07',
  'transit/me': '870b7009b272 3cd9a19025e1 68b29c97e2f7 c73b823cdb2f',
  'transit/times': '94fda0512696 0e3f095f449d 461ec92a2fea 31ccccfa6c0c',
  'vocab/list': '07ba28d1632a 98ce969586bb b9c7e57f6a61 599aa32b4345',
  'vocab/progress': '3c4f09023fee 5825da680312 03ffb5530bda 03ae2dbb7878',
  'vocab/quiz': '0cf9c4086180 517180bdef7a e6a78797108b 79db3cf07a6f',
  'vocab/review': '5b5e1403f516 ccf0b5f4c50c 946096ae4579 7696cbfa9c27',
  'vocab/today': '773156ed598a c5bc8689dc37 d8d33e992566 10c0de05d9de',
  'weather/day': '7567148cf1a0 a6ef37e74884 1aa3b301e6b1 9c03e19863bf',
  'weather/now': '3dd91a5b637e 4d65f9f78c8e 142a03155c6e 0f850a53d6c5',
  'weather/places': '48352a3b000d 3c4878aad27c 7c5ef2d80085 68e7f84ff84f',
  'weather/rain': '7261b41ae0be 8298f4be21a7 6c0e0fbcd640 b104fb073dd8'
};
export const SHOT_SIZE = [480, 578];
// ---- end of the screenshots' hashes ----
