// Made-up TDX answers in TDX's documented shapes, around 新竹車站, for
// tools/preview.mjs (until the TDX key is set no real answer can be saved):
// YouBike stations and bikes, bus stops and arrivals, a route's stops,
// 台鐵 / 高鐵 stations and a day's trains, a small 台北捷運. Not real data:
// every number is invented. Times follow the clock, so a preview always has
// trains to come.

const tw = t => new Date(t + 8 * 3_600_000).toISOString();
const hm = (t, add = 0) => tw(t + add * 60_000).slice(11, 16);
const today = t => tw(t).slice(0, 10);
const P = (lat, lon) => ({ PositionLat: lat, PositionLon: lon });
const N = s => ({ Zh_tw: s, En: '' });

const BIKES = [
  ['HSZ500101', 'YouBike2.0_新竹火車站(前站)', 24.8020, 120.9714, 40, 6, 2, 31],
  ['HSZ500102', 'YouBike2.0_新竹火車站(後站)', 24.8008, 120.9705, 30, 0, 0, 28],
  ['HSZ500103', 'YouBike2.0_東門城', 24.8040, 120.9688, 24, 3, 1, 20],
  ['HSZ500104', 'YouBike2.0_中正路/林森路口', 24.8030, 120.9670, 20, 12, 4, 4],
  ['HSZ500105', 'YouBike2.0_新竹轉運站', 24.8025, 120.9735, 36, 2, 0, 30],
  ['HSZ500106', 'YouBike2.0_巨城購物中心', 24.8096, 120.9746, 50, 18, 6, 22],
  ['HSZ500107', 'YouBike2.0_新竹公園', 24.7999, 120.9775, 26, 9, 0, 17],
  ['HSZ500108', 'YouBike2.0_北門街', 24.8075, 120.9657, 16, 1, 0, 15]
];
const BUS_ST = [
  ['HSZ10001', '10001', '新竹火車站', 24.8017, 120.9722, ['藍1', '2', '20', '81', '182'], 'N'],
  ['HSZ10002', '10002', '東門市場', 24.8043, 120.9699, ['藍1', '2', '15'], 'E'],
  ['HSZ10003', '10003', '新竹轉運站', 24.8027, 120.9739, ['5608', '1728', '綠1'], 'S'],
  ['HSZ10004', '10004', '中正林森路口', 24.8028, 120.9668, ['20', '81'], 'W'],
  // 新竹火車站's other signs: one more on the same side (its buses go north
  // too), one across the street (south): two sides, not three.
  ['HSZ10005', '10005', '新竹火車站', 24.80188, 120.97222, ['5608'], 'N'],
  ['HSZ10006', '10006', '新竹火車站', 24.80168, 120.97248, ['藍1', '15'], 'S']
];
const TRA = [
  ['1000', '臺北', 25.0478, 121.517, '0', '100臺北市中正區北平西路3號'],
  ['1180', '竹北', 24.8392, 121.0093, '2', '302新竹縣竹北市華興街'],
  ['1190', '北新竹', 24.809, 120.985, '3', '300新竹市東區'],
  ['1210', '新竹', 24.8016, 120.9716, '0', '300新竹市東區中華路二段445號'],
  ['1220', '三姓橋', 24.787, 120.95, '4', '300新竹市香山區'],
  ['1191', '千甲', 24.807, 121.005, '4', '300新竹市東區'],
  ['1192', '新莊', 24.789, 121.022, '4', '300新竹市東區'],
  ['1193', '竹中', 24.7836, 121.0372, '3', '310新竹縣竹東鎮'],
  ['1194', '六家', 24.808, 121.04, '3', '302新竹縣竹北市'],
  ['1201', '上員', 24.7719, 121.0574, '4', '310新竹縣竹東鎮'],
  ['1203', '竹東', 24.7366, 121.0937, '2', '310新竹縣竹東鎮'],
  ['1080', '桃園', 24.9893, 121.3137, '0', '330桃園市桃園區中正路1號'],
  ['1100', '中壢', 24.9536, 121.2257, '0', '320桃園市中壢區中和路139號']
];
const HSR = [
  ['0990', '南港', 25.0531, 121.6066, '臺北市'],
  ['1000', '台北', 25.0477, 121.5163, '臺北市'],
  ['1010', '板橋', 25.0144, 121.4635, '新北市'],
  ['1020', '桃園', 25.0128, 121.2147, '桃園市'],
  ['1030', '新竹', 24.8081, 121.0403, '新竹縣'],
  ['1035', '苗栗', 24.6054, 120.8254, '苗栗縣'],
  ['1040', '台中', 24.1121, 120.6160, '臺中市']
];

// A day's trains around now: 六家線 shuttles, 內灣線, the trunk line north, 高鐵.
function traDay(now) {
  const base = now - ((now / 60_000) % 30) * 60_000;
  const trains = [];
  const add = (no, code, type, end, stops, start) => trains.push({ TrainInfo: { TrainNo: no, TrainTypeCode: code, TrainTypeName: N(type), TripHeadSign: `往${end}`, EndingStationName: N(end), SuspendedFlag: 0, BikeFlag: code === '6' ? 1 : 0, TripLine: 0 }, StopTimes: stops.map(([id, m]) => ({ StopSequence: 1, StationID: id, StationName: N(''), ArrivalTime: hm(start, m), DepartureTime: hm(start, m) })) });
  for (let k = -1; k < 8; k++) {
    const s = base + k * 30 * 60_000;
    add(`${1800 + k * 2 + 2}`, '6', '區間車', '六家', [['1210', 0], ['1190', 4], ['1191', 8], ['1192', 12], ['1193', 16], ['1194', 21]], s);
    add(`${1300 + k * 2 + 2}`, '6', '區間車', '竹東', [['1210', 10], ['1190', 14], ['1191', 18], ['1192', 22], ['1193', 26], ['1201', 31], ['1203', 37]], s);
    add(`${1200 + k * 2 + 1}`, '6', '區間車', '新竹', [['1203', 2], ['1201', 8], ['1193', 13], ['1192', 17], ['1191', 21], ['1190', 25], ['1210', 30]], s);
    add(`${150 + k * 2}`, '3', '自強(3000)', '臺北', [['1210', 12], ['1180', 19], ['1100', 42], ['1080', 52], ['1000', 82]], s);
    add(`${2100 + k * 2}`, '6', '區間車', '基隆', [['1220', 0], ['1210', 6], ['1190', 10], ['1180', 16], ['1100', 52], ['1080', 64], ['1000', 106]], s);
  }
  return { UpdateTime: tw(now), TrainDate: today(now), TrainTimetables: trains };
}
function hsrDay(now) {
  const base = now - ((now / 60_000) % 20) * 60_000;
  const out = [];
  for (let k = -1; k < 12; k++) {
    const s = base + k * 20 * 60_000;
    out.push({ TrainDate: today(now).replace(/-/g, ':'), DailyTrainInfo: { TrainNo: String(600 + k * 2 + 10).padStart(4, '0'), Direction: 1, EndingStationName: N('南港'), Note: N('') }, StopTimes: [['1040', 0], ['1035', 12], ['1030', 32], ['1020', 46], ['1010', 58], ['1000', 66], ['0990', 74]].map(([id, m], i) => ({ StopSequence: i + 1, StationID: id, StationName: N(''), ArrivalTime: hm(s, m), DepartureTime: hm(s, m + 1) })) });
  }
  return out;
}

// 台北捷運, a few stations.
const TRTC = [
  ['BL12', '台北車站', 25.0461, 121.5175], ['BL13', '善導寺', 25.0448, 121.5233], ['BL14', '忠孝新生', 25.0423, 121.5329], ['BL15', '忠孝復興', 25.0415, 121.5438], ['BL16', '忠孝敦化', 25.0414, 121.5508], ['BL17', '國父紀念館', 25.0413, 121.5577], ['BL18', '市政府', 25.0411, 121.5651], ['BL11', '西門', 25.0421, 121.5082], ['BL10', '龍山寺', 25.0353, 121.5000],
  ['R10', '台北車站', 25.0464, 121.517], ['R09', '台大醫院', 25.0417, 121.5163], ['R08', '中正紀念堂', 25.0328, 121.5181], ['R07', '東門', 25.0337, 121.5288], ['R06', '大安森林公園', 25.0335, 121.5357], ['R05', '大安', 25.0330, 121.5436], ['R04', '信義安和', 25.0332, 121.5527], ['R03', '台北101/世貿', 25.0330, 121.5631], ['R11', '中山', 25.0528, 121.5204], ['R12', '雙連', 25.0577, 121.5208], ['R13', '民權西路', 25.0627, 121.5196],
  ['G12', '西門', 25.0421, 121.5083], ['G13', '北門', 25.0496, 121.5103], ['G14', '中山', 25.0526, 121.5206], ['G15', '松江南京', 25.0518, 121.5329], ['G16', '南京復興', 25.0521, 121.5439], ['G10', '中正紀念堂', 25.0326, 121.5181], ['G11', '小南門', 25.0363, 121.5110],
  ['BR10', '忠孝復興', 25.0417, 121.5437], ['BR09', '大安', 25.0332, 121.5437], ['BR11', '南京復興', 25.0522, 121.5441], ['BR12', '中山國中', 25.0609, 121.5442]
];
const LINES = [['BL', '板南線', '#0070bd', ['BL10', 'BL11', 'BL12', 'BL13', 'BL14', 'BL15', 'BL16', 'BL17', 'BL18']], ['R', '淡水信義線', '#e3002c', ['R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'R11', 'R12', 'R13']], ['G', '松山新店線', '#008659', ['G10', 'G11', 'G12', 'G13', 'G14', 'G15', 'G16']], ['BR', '文湖線', '#c48c31', ['BR09', 'BR10', 'BR11', 'BR12']]];

const ok = body => ({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });

export function upstream() {
  return async url => {
    const now = Date.now();
    if (url.includes('openid-connect/token')) return ok({ access_token: 'preview', expires_in: 86400 });
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname.replace('/api/', ''));
    if (/Bike\/Station/.test(p)) return ok(BIKES.map(([uid, name, lat, lon, cap]) => ({ StationUID: uid, StationID: uid.slice(3), StationName: N(name), StationPosition: P(lat, lon), BikesCapacity: cap, ServiceType: 2 })));
    if (/Bike\/Availability/.test(p)) return ok(BIKES.map(([uid, , , , , g, el, ret]) => ({ StationUID: uid, ServiceStatus: 1, AvailableRentBikes: g + el, AvailableReturnBikes: ret, AvailableRentBikesDetail: { GeneralBikes: g, ElectricBikes: el }, UpdateTime: tw(now - 40_000) })));
    if (/Bus\/Station\/NearBy/.test(p)) return ok(BUS_ST.map(([uid, id, name, lat, lon, routes, b]) => ({ StationUID: uid, StationID: id, StationName: N(name), StationPosition: P(lat, lon), LocationCityCode: 'HSZ', Bearing: b, Stops: routes.map(r => ({ StopUID: `${uid}-${r}`, RouteName: N(r), RouteUID: `HSZ${r}` })) })));
    if (/Bus\/EstimatedTimeOfArrival\/(City\/\w+\/PassThrough|NearBy)/.test(p)) {
      const st = BUS_ST.find(s => p.endsWith(s[1])) || BUS_ST[0];
      return ok(st[5].map((r, i) => ({ StopUID: `${st[0]}-${r}`, RouteUID: `HSZ${r}`, RouteName: N(r), Direction: i % 2, EstimateTime: i === 3 ? null : [45, 260, 620, null, 1380][i] ?? 900, StopStatus: i === 3 ? 1 : 0, NextBusTime: i === 3 ? tw(now + 25 * 60_000) : null, Estimates: [{ EstimateTime: 1500 + i * 120 }] })));
    }
    if (/Bus\/Route\/City/.test(p)) return ok([['藍1', '新竹火車站', '竹北'], ['2', '新竹火車站', '關東橋'], ['20', '新竹火車站', '南寮'], ['81', '新竹火車站', '香山'], ['182', '新竹火車站', '交大'], ['15', '新竹火車站', '新莊'], ['綠1', '新竹轉運站', '南寮']].map(([n, a, b]) => ({ RouteUID: `HSZ${n}`, RouteID: n, RouteName: N(n), DepartureStopNameZh: a, DestinationStopNameZh: b, BusRouteType: 11 })));
    // A route's timetable: weekdays every 20 minutes 06:00–22:00, weekends every 40 from 07:00 to 21:00.
    if (/Bus\/Schedule/.test(p)) {
      const names = ['新竹火車站', '東門市場', '中央路口', '巨城購物中心', '民族路口', '新竹高中', '竹北火車站'];
      const days = on => Object.fromEntries(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => [d, on(i) ? 1 : 0]));
      const at = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const trips = (dir, from, to, every, on) => {
        const out = [];
        for (let m = from; m <= to; m += every) out.push({ TripID: `${dir}-${m}`, ServiceDay: days(on), StopTimes: (dir ? [...names].reverse() : names).map((n, i) => ({ StopSequence: i + 1, StopUID: `HSZS${dir}${i}`, StopName: N(n), ArrivalTime: at(m + i * 4), DepartureTime: at(m + i * 4) })) });
        return out;
      };
      return ok([0, 1].map(dir => ({ RouteUID: 'HSZ藍1', RouteName: N('藍1'), SubRouteUID: `HSZ藍1${dir}`, Direction: dir, Timetables: [...trips(dir, 360, 1320, 20, d => d >= 1 && d <= 5), ...trips(dir, 420, 1260, 40, d => d === 0 || d === 6)] })));
    }
    if (/Bus\/StopOfRoute/.test(p)) {
      const names = ['新竹火車站', '東門市場', '中央路口', '巨城購物中心', '民族路口', '新竹高中', '竹北火車站'];
      return ok([0, 1].map(dir => ({ RouteUID: 'HSZ藍1', RouteName: N('藍1'), SubRouteUID: `HSZ藍1${dir}`, SubRouteName: N('藍1'), Direction: dir, Stops: (dir ? [...names].reverse() : names).map((n, i) => ({ StopUID: `HSZS${dir}${i}`, StopID: `${dir}${i}`, StopName: N(n), StopSequence: i + 1, StopPosition: P(24.802 + i * 0.006, 120.972 + i * 0.006), StationID: `${10001 + i}` })) })));
    }
    if (/Bus\/EstimatedTimeOfArrival/.test(p)) {
      const out = [];
      for (const dir of [0, 1]) for (let i = 0; i < 7; i++) out.push({ StopUID: `HSZS${dir}${i}`, RouteUID: 'HSZ藍1', RouteName: N('藍1'), Direction: dir, EstimateTime: [90, 240, 420, 600, 30, 180, 720][(i + dir * 3) % 7], StopStatus: 0, Estimates: [] });
      // Group stops asked by StopUID: answer each with a time.
      const asked = [...(u.searchParams.get('$filter') || '').matchAll(/StopUID eq '([^']+)'/g)].map(m => m[1]);
      for (const [k, uid] of asked.entries()) if (!out.some(x => x.StopUID === uid)) out.push({ StopUID: uid, EstimateTime: [130, 480, 900][k % 3], StopStatus: 0, Estimates: [{ EstimateTime: 1700 }] });
      return ok(out);
    }
    if (p.includes('TRA/Station') && !p.includes('LiveBoard')) return ok({ UpdateTime: tw(now), Stations: TRA.map(([id, n, lat, lon, cls, addr]) => ({ StationUID: `TRA-${id}`, StationID: id, StationName: N(n), StationPosition: P(lat, lon), StationClass: cls, StationAddress: addr })) });
    if (p.includes('THSR/Station')) return ok(HSR.map(([id, n, lat, lon, city]) => ({ StationUID: `THSR-${id}`, StationID: id, StationName: N(n), StationPosition: P(lat, lon), LocationCity: city, StationAddress: `${city}` })));
    if (p.includes('TRA/DailyTrainTimetable')) return ok(traDay(now));
    if (p.includes('THSR/DailyTimetable')) return ok(hsrDay(now));
    if (p.includes('TRA/StationLiveBoard')) return ok({ StationLiveBoards: [['152', '自強(3000)', '臺北', 6, 0, '2A'], ['2104', '區間車', '基隆', 11, 3, '1'], ['1804', '區間車', '六家', 14, 0, '3'], ['1306', '區間車', '竹東', 24, 0, '3']].map(([no, ty, end, m, d, pf]) => ({ TrainNo: no, TrainTypeName: N(ty), EndingStationName: N(end), Direction: 1, ScheduleDepartureTime: `${hm(now, m)}:00`, DelayTime: d, Platform: pf, RunningStatus: d ? 1 : 0 })) });
    if (p.includes('TRA/TrainLiveBoard')) return ok({ TrainLiveBoards: [{ TrainNo: '2104', DelayTime: 3 }] });
    if (p.includes('TRA/ODFare')) return ok({ ODFares: [{ TrainType: 3, Fares: [{ TicketType: 1, FareClass: 1, Price: 177 }] }, { TrainType: 6, Fares: [{ TicketType: 1, FareClass: 1, Price: 114 }] }] });
    if (p.includes('THSR/ODFare')) return ok([{ Fares: [{ TicketType: 1, FareClass: 1, CabinClass: 1, Price: 290 }, { TicketType: 1, FareClass: 1, CabinClass: 3, Price: 280 }] }]);
    if (/Metro\/Station\/TRTC(\?|$)/.test(p)) return ok(TRTC.map(([id, n, lat, lon]) => ({ StationUID: `TRTC-${id}`, StationID: id, StationName: N(n), StationPosition: P(lat, lon), LocationCity: '臺北市' })));
    if (/Metro\/StationOfLine\/TRTC(\?|$)/.test(p)) return ok(LINES.map(([id, , , seq]) => ({ LineID: id, LineNo: id, Stations: seq.map((s, i) => ({ Sequence: i + 1, StationID: s, StationName: N('') })) })));
    if (/Metro\/StationOfRoute\/TRTC(\?|$)/.test(p)) return ok(LINES.map(([id, , , seq]) => ({ LineID: id, RouteID: `${id}-1`, Direction: 0, Stations: seq.map((s, i) => ({ Sequence: i + 1, StationID: s })) })));
    if (/Metro\/Line\/TRTC(\?|$)/.test(p)) return ok(LINES.map(([id, n, c]) => ({ LineID: id, LineNo: id, LineName: N(n), LineColor: c, IsBranch: false })));
    if (/Metro\/LiveBoard\/TRTC(\?|$)/.test(p)) return ok([{ StationID: 'BL12', DestinationStationName: N('南港展覽館'), EstimateTime: 2, ServiceStatus: 0 }, { StationID: 'BL12', DestinationStationName: N('頂埔'), EstimateTime: 4, ServiceStatus: 0 }]);
    if (/Metro\//.test(p)) return ok([]);
    // TDX's planner, in HERE's public-transit shape: a walk, the 藍1 bus, a walk.
    if (p.includes('maas/routing')) {
      const [olat, olon] = u.searchParams.get('origin').split(',').map(Number);
      const [dlat, dlon] = u.searchParams.get('destination').split(',').map(Number);
      const t = m => `${tw(now + m * 60_000).slice(0, 19)}+08:00`;
      const sec = (type, mode, a, b, from, to, extra = {}) => ({ type, transport: { mode, ...extra }, departure: { time: t(a), place: from }, arrival: { time: t(b), place: to } });
      const stopA = { name: '新竹火車站', location: { lat: 24.8017, lng: 120.9722 } };
      const stopB = { name: '巨城購物中心', location: { lat: 24.8094, lng: 120.9742 } };
      return ok({ result: 'success', data: { routes: [
        { sections: [sec('pedestrian', 'pedestrian', 0, 4, { location: { lat: olat, lng: olon } }, stopA), sec('transit', 'bus', 6, 14, stopA, stopB, { name: '藍1', shortName: '藍1', headsign: '竹北火車站' }), sec('pedestrian', 'pedestrian', 14, 18, stopB, { location: { lat: dlat, lng: dlon } })] }
      ] } });
    }
    return { ok: false, status: 404, text: async () => '[]', json: async () => [] };
  };
}
