// The shape of an ESPN site API answer, for finding fields:
//   node tools/espn.mjs basketball/nba/scoreboard dates=20260604
//   node tools/espn.mjs common/v3/sports/golf/pga/athletes/9478/overview
// A path starting with "common/" or "v2/" is taken from /apis/, else from
// /apis/site/v2/sports/.
import { execFileSync } from 'node:child_process';

const [path, query = ''] = process.argv.slice(2);
if (!path) throw new Error('usage: node tools/espn.mjs <path> [query]');
const url = /^(common|v2)\//.test(path) ? `https://site.api.espn.com/apis/${path}` : `https://site.api.espn.com/apis/site/v2/sports/${path}`;
const full = `${url}${query ? `?${query}` : ''}`;
const data = JSON.parse(execFileSync('curl', ['-s', '--compressed', '-m', '25', full], { maxBuffer: 64 * 1024 * 1024 }).toString());
const shape = (v, depth = 0) => {
  if (depth > 3) return Array.isArray(v) ? `[${v.length}]` : typeof v;
  if (Array.isArray(v)) return v.length ? [`${v.length} ×`, shape(v[0], depth + 1)] : [];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, depth + 1)]));
  return typeof v === 'string' && v.length > 60 ? `${v.slice(0, 60)}…` : v;
};
console.log(full);
console.log(JSON.stringify(shape(data), null, 1).slice(0, 12000));
