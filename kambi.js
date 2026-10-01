// /kambi: the last score of Kambi matches Quadra Sportsbook has bets on.
//
// Kambi (the odds feed behind Play's Asian baseball, EuroLeague and K
// League) never says
// "final" in public, and a match's live data (event/{id}/livedata.json)
// disappears a few hours after it ends. A bet whose app isn't opened in
// that window could never be settled. So Sportsbook registers the matches
// its open bets are on, and this Worker's cron (every 10 minutes, see
// `scheduled` in worker.js) keeps each one's latest live data in
// Firestore until well after the match, marking it `gone` once Kambi drops
// it. Sportsbook reads that copy when Kambi's own is gone and decides the
// result from it the same way it does from the live one.
//
// deps (so this file stays testable): { json, errorJson, upstreamFailed,
// readJsonBody, INVALID_BODY, rateLimitResponse, fsGet, fsWrite, fsDelete,
// fsList(env, collection, pageSize) -> [{ id, payload }], fetchLive(id) ->
// { status, data }, now() }.
//
//   POST /kambi { events: [{ id, start }] }   watch these matches
//   GET  /kambi?ids=1,2,3                     { results: { id: entry } }
//
// An entry: { id, start, live (Kambi's liveData object, or null), seen (when
// it was last read), gone (Kambi no longer has it), checked, done }.

export const KAMBI_COLLECTION = 'kambi-results';
// One document listing every watched match and its start, so each cron run
// costs one read instead of listing the whole collection (the cron runs
// every 2 minutes: a match can drop out of Kambi's feed within minutes of
// ending, and a 10-minute cron missed some).
export const KAMBI_INDEX = '_index';
const KAMBI_LIVE = id => `https://eu-offering-api.kambicdn.com/offering/v2018/ub/event/${encodeURIComponent(id)}/livedata.json?lang=en_GB&market=GB`;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// A match is watched from its start until this long after (the 3-day
// refund in Sportsbook), and its entry kept a day beyond.
const WATCH_FOR = 3 * DAY;
const KEEP_FOR = 4 * DAY;
// At most this many Kambi reads per cron run (a Worker's subrequest budget),
// the least recently checked first.
export const CRON_BATCH = 20;
const MAX_IDS = 30;
// Per IP, in the Worker's rate-limit window (as eco.js's ECO_LIMITS).
const LIMITS = { read: 1200, write: 600 };

const validId = id => /^\d{6,12}$/.test(String(id));

export async function fetchKambiLive(id) {
  const res = await fetch(KAMBI_LIVE(id), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const parse = payload => {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

export async function handleKambiRequest(request, env, headers, ip, deps) {
  const { json, errorJson, upstreamFailed } = deps;
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return errorJson('MISSING_FIREBASE_CONFIG', 500, headers, request);
  try {
    if (request.method === 'GET') {
      const limited = await deps.rateLimitResponse(env, ip, 'kambi:read', LIMITS.read, headers, request);
      if (limited) return limited;
      const ids = [...new Set((new URL(request.url).searchParams.get('ids') || '').split(',').filter(validId))].slice(0, MAX_IDS);
      const results = {};
      await Promise.all(
        ids.map(async id => {
          const doc = await deps.fsGet(env, KAMBI_COLLECTION, id);
          const entry = doc.exists ? parse(doc.payload) : null;
          if (entry) results[id] = entry;
        })
      );
      return json({ results }, 200, headers);
    }
    if (request.method === 'POST') {
      const limited = await deps.rateLimitResponse(env, ip, 'kambi:write', LIMITS.write, headers, request);
      if (limited) return limited;
      const body = await deps.readJsonBody(request);
      if (body === deps.INVALID_BODY || !Array.isArray(body?.events)) return errorJson('INVALID_JSON', 400, headers, request);
      const now = deps.now();
      const events = body.events
        .filter(e => validId(e?.id) && Number.isFinite(Date.parse(e?.start)))
        .filter(e => Date.parse(e.start) > now - WATCH_FOR && Date.parse(e.start) < now + 2 * DAY)
        .slice(0, MAX_IDS);
      let added = 0;
      if (events.length) await addToIndex(env, deps, events);
      await Promise.all(
        events.map(async e => {
          const entry = { id: String(e.id), start: new Date(e.start).toISOString(), live: null, seen: 0, gone: false, checked: 0, done: false };
          try {
            // Only if it isn't watched yet: an existing entry keeps its score.
            await deps.fsWrite(env, KAMBI_COLLECTION, entry.id, JSON.stringify(entry), { exists: false });
            added++;
          } catch (error) {
            if (!error.precondition) throw error;
          }
        })
      );
      return json({ watching: events.length, added }, 200, headers);
    }
    return errorJson('SYNC_METHOD_NOT_ALLOWED', 405, headers, request);
  } catch (error) {
    return upstreamFailed(error, headers, request);
  }
}

async function readIndex(env, deps) {
  const doc = await deps.fsGet(env, KAMBI_COLLECTION, KAMBI_INDEX);
  const index = doc.exists ? parse(doc.payload) : null;
  return { index: index && typeof index.ids === 'object' ? index : null, updateTime: doc.updateTime, exists: doc.exists };
}

async function writeIndex(env, deps, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { index, updateTime, exists } = await readIndex(env, deps);
    const next = change(index || { ids: {} });
    try {
      await deps.fsWrite(env, KAMBI_COLLECTION, KAMBI_INDEX, JSON.stringify(next), exists ? { updateTime } : { exists: false });
      return next;
    } catch (error) {
      if (!error.precondition) throw error;
    }
  }
  return null;
}

const addToIndex = (env, deps, events) =>
  writeIndex(env, deps, index => {
    const ids = { ...index.ids };
    for (const e of events) if (!index.done?.[String(e.id)]) ids[String(e.id)] = new Date(e.start).toISOString();
    return { ...index, ids };
  });

// One cron run: reads the watched matches that have started and aren't
// done, the least recently checked first, and saves what changed.
export async function refreshKambiWatch(env, deps) {
  const now = deps.now();
  let { index } = await readIndex(env, deps);
  if (!index) {
    // No index yet (entries from before it): built once from the collection.
    const docs = await deps.fsList(env, KAMBI_COLLECTION, 300);
    const ids = {};
    for (const d of docs) {
      const e = d.id !== KAMBI_INDEX && parse(d.payload);
      if (e?.start && !e.done) ids[d.id] = e.start;
    }
    index = (await writeIndex(env, deps, () => ({ ids }))) || { ids };
  }
  // Long past, or not started: nothing to read.
  const dueIds = Object.entries(index.ids).filter(([, start]) => Date.parse(start) <= now && now - Date.parse(start) <= WATCH_FOR);
  const stale = Object.entries(index.ids).filter(([, start]) => now - Date.parse(start) > WATCH_FOR).map(([id]) => id);
  const entries = [];
  for (const [id] of dueIds) {
    const doc = await deps.fsGet(env, KAMBI_COLLECTION, id);
    const entry = doc.exists ? parse(doc.payload) : null;
    if (entry) entries.push({ doc: id, entry });
  }
  const old = [];
  const due = entries
    .filter(x => !x.entry.done)
    .sort((a, b) => (a.entry.checked || 0) - (b.entry.checked || 0))
    .slice(0, CRON_BATCH);
  const finished = entries.filter(x => x.entry.done).map(x => x.doc);
  let saved = 0;
  const doneNow = [];
  for (const { doc, entry } of due) {
    let next = { ...entry, checked: now };
    try {
      const { status, data } = await deps.fetchLive(entry.id);
      const live = Array.isArray(data?.liveData) ? data.liveData[0] : data?.liveData;
      if (status === 200 && live?.score) next = { ...next, live, seen: now, gone: false };
      else if (status === 404) {
        // Kambi has dropped it: the last score kept is the final one. Never
        // seen at all and long past its start: nothing more will come.
        if (entry.live) next = { ...next, gone: true, done: true };
        else if (now - Date.parse(entry.start) > 12 * HOUR) next = { ...next, done: true };
      }
    } catch {
      // Kambi unreachable this time: tried again next run.
    }
    if (next.done) doneNow.push(doc);
    // Only what changed is written (the score, or its end).
    if (next.seen === entry.seen && next.done === entry.done && next.gone === entry.gone && (entry.checked || 0) > now - 30 * 60_000) continue;
    try {
      await deps.fsWrite(env, KAMBI_COLLECTION, doc, JSON.stringify(next));
      saved++;
    } catch {}
  }
  // Finished and long-past matches leave the index (their entries stay a
  // while for the apps to read, and go with the next cleanup).
  const drop = new Set([...stale, ...finished, ...doneNow]);
  const expired = Object.entries(index.done || {}).filter(([, start]) => now - Date.parse(start) > KEEP_FOR).map(([id]) => id);
  if (drop.size || expired.length)
    await writeIndex(env, deps, idx => {
      const done = { ...(idx.done || {}) };
      for (const id of drop) if (idx.ids[id] && !stale.includes(id)) done[id] = idx.ids[id];
      for (const id of expired) delete done[id];
      return { ids: Object.fromEntries(Object.entries(idx.ids).filter(([id]) => !drop.has(id))), done };
    }).catch(() => {});
  for (const id of [...stale, ...expired]) await deps.fsDelete(env, KAMBI_COLLECTION, id).catch(() => {});
  old.push(...stale, ...expired);
  return { watched: Object.keys(index.ids).length, checked: due.length, saved, forgotten: old.length };
}
