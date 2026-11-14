// How the admin panel judges the proxy's own parts, one rule for its 健康
// and for the alert mails (mail-alerts.js imports this file): a cron job
// late, a Worker's errors too many, an AI feature at its cap. Here, not in
// the kit: no app uses it (a kit module goes into every app's loader).

// Each cron job (ops.js beats): its name, and the minutes between runs before it's late.
export const JOBS = { notices: ['通知', 10], alerts: ['帳單警示', 30], 'mail-alerts': ['警示信', 30], f1: ['F1 圈速（週四到週一）', 10], 'weather-skill': ['天氣評分（每小時）', 120], capacity: ['容量（每 6 小時）', 420], 'build:watch': ['建置：精華連結（每小時）', 120], 'build:cutouts': ['建置：去背照片（每小時）', 120], 'build:buses': ['建置：公車（每小時）', 120], 'build:daily': ['建置：每日（賽程、CPBL、照片、勝率）', 120], bikes: ['YouBike 保溫（每 2 分鐘）', 10], 'store-backup': ['每晚備份（04:30）', 26 * 60], 'build:f1kept': ['建置：F1 過去的賽段', 26 * 60], 'build:news': ['建置：新聞（每 10 分鐘）', 30], 'data-folders': ['R2 資料的檔案數（每 6 小時）', 7 * 60], 'gift-clean': ['公開領取的夜間整理（03:50）', 26 * 60], radar: ['降雨雷達（每 10 分鐘）', 30], meter: ['用量計數（每 2 分鐘）', 10] };
// F1's laps run Thursday to Monday, UTC (worker.js's F1_DAYS): the other days it rests, never late.
export const restsToday = (b, now) => b.job === 'f1' && ![0, 1, 4, 5, 6].includes(new Date(now).getUTCDay());
// Late: past its time (`times` its time, for a mail).
export const isLate = (b, now, times = 1) => !restsToday(b, now) && now - b.at > times * (JOBS[b.job]?.[1] || 120) * 60_000;
// A Worker's share of failed requests (guard.js /errors): past 5% 'bad', past 0.5% 'slow'.
export const errRate = w => (w.requests ? w.errors / w.requests : 0);
export const errTone = w => (errRate(w) > 0.05 ? 'bad' : errRate(w) > 0.005 ? 'slow' : '');
// An AI feature today against its cap (admin op usage's `ai`): 'off' paused, 'bad' at it, 'slow' past 80%.
export const aiTone = a => (!a.cap ? 'off' : a.days[6] >= a.cap ? 'bad' : a.days[6] >= a.cap * 0.8 ? 'slow' : '');
