// How the admin panel judges the proxy's own parts, one rule for its 健康
// and for the alert mails (mail-alerts.js imports this file): a cron job
// late, a Worker's errors too many, an AI feature at its cap. Here, not in
// the kit: no app uses it (a kit module goes into every app's loader).

// Each cron job (ops.js beats): its name, and the minutes between runs before it's late.
export const JOBS = { notices: ['通知', 10], alerts: ['帳單警示', 30], 'mail-alerts': ['警示信', 30], f1: ['F1 圈速（週四到週一）', 10], 'weather-skill': ['天氣評分（每小時）', 120], capacity: ['容量（每 6 小時）', 420], 'build:watch': ['建置：精華連結（每小時）', 120], 'build:cutouts': ['建置：去背照片（每小時）', 120], 'build:daily': ['建置：每日（賽程、CPBL、照片、勝率）', 120], bikes: ['YouBike 保溫（每 2 分鐘）', 10], 'store-backup': ['每晚備份（04:30）', 26 * 60], 'build:f1kept': ['建置：F1 過去的賽段', 26 * 60], 'build:news': ['建置：新聞（每 10 分鐘）', 30], 'data-folders': ['R2 資料的檔案數（每 6 小時）', 7 * 60], radar: ['降雨雷達（每 10 分鐘）', 30], meter: ['用量計數（每 2 分鐘）', 10], 'kept-sweep': ['過期資料清理（每 6 小時）', 7 * 60], 'free-watch': ['免費額度檢查（每 3 小時）', 4 * 60], 'build:ai': ['建置：AI（每 10 分鐘）', 30], 'build:markets': ['建置：市場新聞（每 30 分鐘）', 90] };
// (A job not listed is never called late: the bus build runs weekly from GitHub now, and a
// job without a known rhythm read "late" at 2 hours, red on every sign-in, Jay 11-14.)
// F1's laps run Thursday to Monday, UTC (worker.js's F1_DAYS): the other days it rests, never late.
export const restsToday = (b, now) => b.job === 'f1' && ![0, 1, 4, 5, 6].includes(new Date(now).getUTCDay());
// Late: past its time (`times` its time, for a mail).
export const isLate = (b, now, times = 1) => !!JOBS[b.job] && !restsToday(b, now) && now - b.at > times * JOBS[b.job][1] * 60_000;
// A Worker's real errors (guard.js /errors): a phone that left before the answer
// (clientDisconnected, responseStreamDisconnected) is no fault of ours, and was most of the count.
const LEFT = new Set(['clientDisconnected', 'responseStreamDisconnected', 'success']);
export const realErrors = w => (w.by && Object.keys(w.by).length ? Object.entries(w.by).reduce((n, [st, k]) => n + (LEFT.has(st) ? 0 : k), 0) : w.errors || 0);
// Its share of failed requests: past 5% 'bad', past 1% 'slow'.
export const errRate = w => (w.requests ? realErrors(w) / w.requests : 0);
export const errTone = w => (errRate(w) > 0.05 ? 'bad' : errRate(w) > 0.01 ? 'slow' : '');
// An AI feature today against its cap (admin op usage's `ai`): 'off' paused, 'bad' at it, 'slow' past 80%.
export const aiTone = a => (!a.cap ? 'off' : a.days[6] >= a.cap ? 'bad' : a.days[6] >= a.cap * 0.8 ? 'slow' : '');
// A proxy route's server errors today (eco-admin errors' routes) against yesterday's: 'bad' at 100
// and past 3× yesterday's, 'slow' at 20 and past 2× (a steady few a day is its normal, not news).
export const routeTone = n => (n.today >= 100 && n.today > 3 * (n.yesterday || 0) ? 'bad' : n.today >= 20 && n.today > 2 * (n.yesterday || 0) ? 'slow' : '');
// Cloudflare's free amount (guard.js state): 'bad' once people feel it (the proxy stopped, slowed
// 2 steps, or 80% really used), 'warn' while only the forecast says so (the guard steps in at 60%
// really used, stops at 90%: a forecast is its job, not Jay's), '' else.
export const usedTop = g => Math.max(0, ...Object.values(g?.share || {}).filter(Number.isFinite));
export const paceTone = (g, pace = 0) => (!g ? '' : g.stopped || pace >= 2 || usedTop(g) >= 0.8 ? 'bad' : (g.paceTop || 0) >= 0.9 || pace || usedTop(g) >= 0.6 ? 'warn' : '');
