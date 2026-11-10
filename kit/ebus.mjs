// The cities' own bus sites, one maker's GraphQL (臺中's
// citybus.taichung.gov.tw/ebus, 桃園's ebus.tycg.gov.tw/ebus, 高雄's
// ibus.tbkc.gov.tw/ibus): one estimate (a stop, a route, a way) in TDX's
// words, as the cities' own pages read it. Read one way by the proxy
// (transit-free.js: 臺中's, 桃園's) and by Orbit Transit's phone (its
// khbus.mjs: 高雄's site answers only Taiwan's own networks, never the proxy).

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
