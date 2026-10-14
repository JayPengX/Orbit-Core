// Photos' addresses alone (no page, no storage): ESPN's headshot by id and the
// small size of a picture. photos.mjs re-exports them; Play's players (in the
// Worker too, play-players.mjs) use them from here.
import { CATALOG } from '#kit/catalog.mjs';

export const CDN = 'https://a.espncdn.com/i/headshots';
// ESPN's headshot at the size a phone shows it (its image service: a full
// one is about 250 KB, this about 25 KB). Any other picture as it is.
// TheSportsDB's cutouts the same way: its /small (about 50 KB; the full one is about 250 KB).
export const smallPhoto = url =>
  typeof url !== 'string' ? url
  : url.startsWith(`${CDN}/`) ? `https://a.espncdn.com/combiner/i?img=${url.slice('https://a.espncdn.com'.length)}&w=256`
  : /^https:\/\/r2\.thesportsdb\.com\/images\/media\/player\/cutout\/[^/]+\.png$/.test(url) ? `${url}/small`
  : url;
// ESPN's headshot folders by league (racing: this season's, see freshHeadshot).
const ESPN_FOLDER = { f1: 'rpm', nba: 'nba', wnba: 'wnba', mlb: 'mlb', nfl: 'nfl', nhl: 'nhl' };
// A rookie or two-way player ESPN has no pro headshot for yet keeps his
// college one (Rafael Castro, Lakers, 2026-10: mens-college-basketball):
// tried after the pro one.
const ESPN_COLLEGE = { nba: 'mens-college-basketball', wnba: 'womens-college-basketball', nfl: 'college-football' };
export function espnCollegeHeadshot(league, id) {
  return ESPN_COLLEGE[league] && id && /^\d+$/.test(String(id)) ? `${CDN}/${ESPN_COLLEGE[league]}/players/full/${id}.png` : null;
}
export function espnHeadshot(league, id) {
  if (!id || !/^\d+$/.test(String(id))) return null;
  const folder = ESPN_FOLDER[league] || (CATALOG[league]?.data === 'espn' && CATALOG[league]?.sport === 'soccer' ? 'soccer' : null);
  return folder ? `${CDN}/${folder}/players/full/${id}.png` : null;
}
