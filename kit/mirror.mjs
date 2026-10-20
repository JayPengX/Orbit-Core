export function mirrorPath(url, trim = '') {
  const u = new URL(url);
  const q = u.search.length > 1 ? `/${encodeURIComponent(u.search.slice(1)).replace(/%/g, '~')}` : '';
  return `mirror/${trim || '_'}/${u.hostname}${u.pathname.replace(/\/+$/, '')}${q}.json`;
}
