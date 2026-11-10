// The cities' own bus sites, one maker's GraphQL (臺中's
// citybus.taichung.gov.tw/ebus, 桃園's ebus.tycg.gov.tw/ebus, 高雄's
// ibus.tbkc.gov.tw/ibus): one estimate (a stop, a route, a way) in TDX's
// words, as the cities' own pages read it, and their notices as TDX's Bus
// Alert and News. Read one way by the proxy (transit-free.js: 臺中's, 桃園's)
// and by Orbit Transit's phone (its khbus.mjs: 高雄's site answers only
// Taiwan's own networks, never the proxy; ebnotice.mjs: the notices).

// A time as TDX writes it (Taiwan's, +08:00).
export const twNow = now => new Date(now + 8 * 3_600_000).toISOString().slice(0, 19) + '+08:00';

// 'HH:MM' on Taiwan's clock → that time as TDX writes it (a time long past
// is tomorrow's); '' when it isn't one.
export function twClock(text, now = Date.now()) {
  const m = String(text ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const tw = new Date(now + 8 * 3_600_000);
  let at = Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate(), Number(m[1]), Number(m[2])) - 8 * 3_600_000;
  if (at < now - 3 * 3_600_000) at += 86_400_000;
  return twNow(at);
}

// An estimate (`n`: comeTime, the next timetabled bus; etas, each bus coming:
// etaTime in minutes, busId, isLast; and as a city has them isOperationDay,
// isSuspended, clogType, isConstruction, isEvent) → TDX's StopStatus,
// EstimateTime (s), PlateNumb, IsLastBus, Estimates, NextBusTime: 今日未營運,
// 末班駛離, 施工改道 / 活動改道 / 取消停靠 (not stopping), the buses coming
// (the soonest first), else the next timetabled time.
export function ebusState(n, now = Date.now()) {
  const etas = (n?.etas || []).filter(e => Number.isFinite(e?.etaTime) && e.etaTime >= 0).sort((a, b) => a.etaTime - b.etaTime);
  const next = n?.comeTime ? twClock(n.comeTime, now) : '';
  const plan = next ? { NextBusTime: next } : {};
  if (n?.isOperationDay === false) return { StopStatus: 4 };
  if (n?.isSuspended) return { StopStatus: 3 };
  if ([-5, -6, -8].includes(n?.clogType) || n?.isConstruction || n?.isEvent) return { StopStatus: 2 };
  if (etas.length) return { StopStatus: 0, EstimateTime: etas[0].etaTime * 60, PlateNumb: etas[0].busId || '', IsLastBus: etas[0].isLast === true, Estimates: etas.map(e => ({ PlateNumb: e.busId || '', EstimateTime: e.etaTime * 60, IsLastBus: e.isLast === true })), ...plan };
  return { StopStatus: 1, ...plan };
}

// The sites' notices (clogMessages: a message a route, TDX's Bus Alert's
// ids and words; 臺中's every route in one ask, 2026-11-10: TDX's 110 rows)
// → TDX's Alert rows, a message once with every route it's on (Scope.Routes,
// RouteID the route's xno, TDX's).
export function ebAlertRows(nodes, at, dept = '') {
  const by = new Map();
  for (const n of nodes || []) {
    if (!n?.id || n.xno == null || !(n.title || n.description)) continue;
    const id = String(n.id);
    if (!by.has(id)) by.set(id, { AlertID: id, Title: String(n.title || '').trim(), Description: String(n.description || '').trim(), Department: dept, Status: 2, Scope: { Routes: [] }, UpdateTime: twNow(at) });
    const r = by.get(id).Scope.Routes;
    if (!r.some(x => x.RouteID === String(n.xno))) r.push({ RouteID: String(n.xno) });
  }
  return [...by.values()];
}
// The sites' 最新消息 (blogs: id, title, content as HTML, onShelfAt and
// offShelfAt days, createdAt) → TDX's News rows, those on the shelf on `day`
// (YYYY-MM-DD, Taiwan's); `blog`: the address a post's id goes after.
export function ebNewsRows(nodes, day, at, { dept = '', blog = '' } = {}) {
  return (nodes || [])
    .filter(n => n?.id && n.title && (!n.onShelfAt || n.onShelfAt <= day) && (!n.offShelfAt || n.offShelfAt >= day))
    .map(n => {
      const title = String(n.title).trim();
      const text = String(n.content || '').replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n\s*\n+/g, '\n').trim();
      return { NewsID: String(n.id), Title: title, Description: text || title, NewsCategory: 1, Department: dept, NewsURL: blog ? `${blog}${n.id}` : '', PublishTime: n.createdAt ? twNow(Date.parse(n.createdAt)) : undefined, StartTime: n.onShelfAt ? `${n.onShelfAt}T00:00:00+08:00` : undefined, EndTime: n.offShelfAt ? `${n.offShelfAt}T00:00:00+08:00` : undefined, UpdateTime: twNow(at) };
    });
}
// The asks for them: every route's notices at once (臺中's; 桃園's wants a route each), the posts.
export const EB_ALERTS_ASK = 'query { clogMessages { edges { node { id xno title description } } } }';
export const EB_NEWS_ASK = 'query { blogs(first: 60) { edges { node { id title content onShelfAt offShelfAt createdAt } } } }';
