// The nightly mirror's addresses (the family's data, R2, mirror/…): which
// hosts' reads it can hold, and where a read's copy is kept. Used by the
// kit (quadra.mjs re-exports both), the data proxy (sports.js answers a
// held read from its copy) and the builders.
export const MIRROR_HOSTS = new Set(['site.api.espn.com', 'sports.core.api.espn.com', 'api.jolpi.ca', 'www.formula1.com', 'asia-baseball.quadra']);
export function mirrorPath(url, trim = '') {
  const u = new URL(url);
  const q = u.search.length > 1 ? `/${encodeURIComponent(u.search.slice(1)).replace(/%/g, '~')}` : '';
  return `mirror/${trim || '_'}/${u.hostname}${u.pathname.replace(/\/+$/, '')}${q}.json`;
}
