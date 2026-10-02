// Every upstream weather.js calls, answered from the saved answers here
// (Taipei 101, 2026-10-02 evening): the tests' and tools/preview.mjs's.
// Google's hours come as ten pages of 24, chained by token like Google's.
import { readFileSync } from 'node:fs';

export const fx = name => JSON.parse(readFileSync(new URL(`./${name}.json`, import.meta.url), 'utf8'));
export const FIXTURE_NOW = Date.parse('2026-10-02T11:46:00Z');
const answer = (status, body) => ({ ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

export function upstream(log = [], { shift = 0 } = {}) {
  const hours = fx('google-hours');
  const move = t => new Date(Date.parse(t) + shift).toISOString();
  const page = n => ({ forecastHours: hours.forecastHours.map(h => ({ ...h, interval: { startTime: move(new Date(Date.parse(h.interval.startTime) + (n - 1) * 86_400_000).toISOString()) } })), nextPageToken: n < 10 ? `p${n + 1}` : '' });
  const oneStation = (file, id) => {
    const j = fx(file);
    return { ...j, records: { ...j.records, Station: j.records.Station.filter(s => s.StationId === id) } };
  };
  return async (url, init) => {
    const u = new URL(url);
    log.push((u.host.startsWith('airquality') ? 'air:' : '') + u.pathname + (u.searchParams.get('pageToken') ? '#' + u.searchParams.get('pageToken') : ''));
    if (u.host === 'weather.googleapis.com') {
      if (u.pathname.endsWith('currentConditions:lookup')) return answer(200, { ...fx('google-current'), currentTime: move(fx('google-current').currentTime) });
      if (u.pathname.endsWith('hours:lookup')) return answer(200, page(Number((u.searchParams.get('pageToken') || 'p1').slice(1))));
      if (u.pathname.endsWith('days:lookup')) return answer(200, fx('google-days'));
    }
    if (u.host === 'airquality.googleapis.com' && init?.method === 'POST') {
      // Google's air hours, from the hour the request starts at.
      const start = Date.parse(JSON.parse(init.body).period.startTime);
      const j = fx('google-air');
      const t0 = Date.parse(j.hourlyForecasts[0].dateTime);
      return answer(200, { ...j, hourlyForecasts: j.hourlyForecasts.map(h => ({ ...h, dateTime: new Date(Date.parse(h.dateTime) - t0 + start).toISOString() })) });
    }
    if (u.host === 'opendata.cwa.gov.tw') {
      const id = u.pathname.split('/').pop();
      if (id === 'F-D0047-061') return answer(200, fx('cwa-town-3d'));
      if (id === 'F-D0047-063') return answer(200, fx('cwa-town-1w'));
      if (id === 'O-A0001-001') return answer(200, oneStation('cwa-stations', u.searchParams.get('StationId')));
      if (id === 'O-A0003-001') return answer(200, oneStation('cwa-manned', u.searchParams.get('StationId')));
      if (id === 'O-A0002-001') return answer(200, oneStation('cwa-rain', u.searchParams.get('StationId')));
      if (id === 'W-C0033-001') return answer(200, fx('cwa-warn'));
    }
    if (u.host === 'data.moenv.gov.tw') {
      if (u.pathname.endsWith('aqx_p_432')) return answer(200, fx('moenv-aqi'));
      if (u.pathname.endsWith('aqf_p_01')) return answer(200, fx('moenv-aqf'));
    }
    return answer(404, 'no fixture for ' + url);
  };
}
