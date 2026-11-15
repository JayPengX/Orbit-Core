// Every kind of notice (here alone, so the admin page reads them too without the kit's
// session: site/admin), by app: what it is and when it comes. Each can be
// turned off on its own; a kind that's off shows neither a banner nor a
// system notice, and the Worker drops it from what it sends while the app
// is closed.
export const NOTICE_KINDS = {
  match: [
    ['start', '比賽開打', 'A game starts', '你追蹤的球隊比賽開始時。', 'When a team you follow starts a game.'],
    ['end', '比賽結束', 'Final score', '你追蹤的球隊打完，附比分。', 'When a team you follow finishes a game, with the score.'],
    ['pick', '今日推薦開賽', 'Today’s picks start', '今日推薦的每一場開始時。', 'When each of today’s picks starts.'],
    ['pickend', '今日推薦賽果', 'Today’s picks: final', '今日推薦每場打完，附比分。', 'When each of today’s picks ends, with the score.']
  ],
  money: [
    ['renew', '到期提醒', 'Renewal reminder', 'TPASS、訂閱、會員到期或續訂前，在你選的日子和時間。', 'Before a pass, subscription or membership ends or renews, on the days and time you pick.']
  ],
  vocab: [
    ['streak', '連續練習快斷了', 'Streak ending', '今天還沒練習單字、連續天數今晚就要歸零時。', 'When you haven’t practised today and your streak ends tonight.']
  ],
  stock: [
    ['alert', '價格提醒', 'Price alert', '你設定的價格提醒到價時。', 'When a price alert you set is reached.'],
    ['fill', '委託成交', 'Order filled', '掛單或定期定額成交時，和定期定額扣款日當天。', 'When an order or a monthly plan is filled, and on a plan’s day.'],
    ['order', '委託未成交', 'Order not filled', '委託到期失效、被取消，或定期定額這個月跳過時。', 'When an order lapses or is dropped, or a monthly plan skips a month.'],
    ['margin', '維持率與斷頭', 'Margin call', '維持率偏低，或融資、放空被強制處理時。', 'When margin runs low, or a loan or short is force-closed.'],
    ['income', '股利與利息', 'Dividends and interest', '除息、股利入帳、債券配息和活存利息入帳時。', 'When a holding goes ex-dividend, and when dividends, coupons or interest arrive.']
  ],
  orbit: [['class', '上課提醒', 'Class reminder', '下課鐘響時提醒下一節；第一節和午休後是前 5 分鐘。', 'At the bell, for the next class; 5 minutes before the first and after lunch.']],
  weather: [
    ['brief', '早晨天氣', 'Morning weather', '每天早上一句話：降雨、溫度、紫外線、空氣。', 'Each morning in one line: rain, temperature, UV, air.'],
    ['rain', '降雨提醒', 'Rain alert', '白天 2 小時內可能下雨時，一天最多一次。', 'When rain is likely within 2 hours, once a day at most.']
  ],
  transit: [
    ['bus', '到站提醒', 'Bus alert', '你設定的公車快到站時，手機鎖著也會通知。', 'When a bus you set an alert for is nearly at your stop, even with the phone locked.'],
    ['nav', '導航提醒', 'Navigation', '導航中：該出發、要搭的公車快到了、火車快開、快到下車站，手機鎖著也會通知。', 'While navigating: time to leave, your bus nearly here, your train about to leave, your stop coming up, even with the phone locked.'],
    ['trip', '行程出發提醒', 'Time to leave', '存好的固定行程，出發前 10 分鐘。', 'Ten minutes before it’s time to leave for a saved trip.'],
    ['bike', 'YouBike 免費時間', 'YouBike free time', '騎了 25 分鐘，5 分鐘內還車再借，下一段仍免費。', 'After 25 minutes on a YouBike: return and re-rent within 5 minutes to keep riding free.']
  ]
};
