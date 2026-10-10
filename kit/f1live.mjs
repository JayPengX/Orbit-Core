// F1's own timing (the sports proxy's f1-live.js: the live feed at
// now.json, a finished session from F1's archive at session.json), read the
// same way by Orbit Sports and Quadra Play: which session a reading is,
// whether it's over (a qualifying only after its last part: each part ends
// with the chequered flag), and a session's order as an outcome Play's picks
// settle on the moment it's over (ESPN's results came minutes to hours later).
//
// Loaded with import() and a fallback (an older kit cached on a phone lacks it).

export const F1_LIVE = 'https://f1-live.quadra/now.json';
export const f1Archive = start => `https://f1-live.quadra/session.json?start=${encodeURIComponent(new Date(start).toISOString())}`;

// The feed's session is this one: its kind ('Race', 'Qualifying', 'Sprint',
// 'Sprint Qualifying', 'Practice') and a start within 3 hours of `start`.
export function sameSession(feed, kind, start) {
  const s = feed?.session;
  if (!s?.start) return false;
  const [h, m] = String(s.gmt || '0:0').split(':').map(Number);
  const at = Date.parse(`${s.start}Z`) - ((h || 0) * 60 + (m || 0)) * 60_000;
  const sprint = /sprint/i.test(s.name || '');
  const named =
    kind === 'Sprint'
      ? s.name === 'Sprint'
      : kind === 'Race'
        ? s.type === 'Race' && !sprint
        : kind === 'Sprint Qualifying'
          ? sprint && /qualifying|shootout/i.test(`${s.name} ${s.type}`)
          : s.type === kind && !sprint;
  return named && Math.abs(at - Date.parse(start)) < 3 * 3_600_000;
}
// How many parts a session runs in: a qualifying three, the rest one.
export const feedParts = feed => (/qualifying|shootout/i.test(`${feed?.session?.type || ''} ${feed?.session?.name || ''}`) ? Math.max(3, feed?.entries?.length || 0) : 1);
// Over: finalised, or the flag (or "Finished") after its last part.
export function feedOver(feed) {
  if (feed?.final) return true;
  const status = feed?.session?.status || '';
  if (/^(Finalised|Ends)$/i.test(status)) return true;
  const said = /^Finished$/i.test(status) || /CHEQUERED FLAG|END OF SESSION/i.test(feed?.message?.text || '');
  return said && (feed?.part || 1) >= feedParts(feed);
}
// The cars by place, by name ("George Russell").
export const feedOrder = feed => [...(feed?.cars || [])].filter(c => c.name).sort((a, b) => a.pos - b.pos).map(c => c.name);

// A session's outcome for picks on it: over, { status: 'final', winner,
// pole, podium, order }; on, { status: 'pending', state: 'in', … as it
// stands, lap }; else null (not this session, or not read). `getJson(url)`
// is the app's own (through the proxy).
export async function f1Outcome(getJson, kind, start, now = Date.now()) {
  if (!(Date.parse(start) <= now)) return null;
  const shape = (feed, status) => {
    const order = feedOrder(feed);
    if (!order.length) return null;
    return { status, ...(status === 'pending' ? { state: 'in' } : {}), winner: order[0], pole: kind === 'Qualifying' ? order[0] : undefined, podium: order.slice(0, 3), order, lap: feed.lap || null, part: feed.part || 0 };
  };
  const live = await Promise.resolve(getJson(F1_LIVE)).catch(() => null);
  if (live && sameSession(live, kind, start)) return shape(live, feedOver(live) ? 'final' : 'pending');
  // Not on the live feed (another session since): its archive, once it's there.
  if (now - Date.parse(start) > 30 * 60_000) {
    const kept = await Promise.resolve(getJson(f1Archive(start))).catch(() => null);
    if (kept?.cars?.length && kept.final) return shape(kept, 'final');
  }
  return null;
}
