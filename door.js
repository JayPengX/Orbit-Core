// ---- door.js: who gets in when too many come at once ----
//
// Two things, both the owner's (admin 設定 › 入場):
//   - Priority passes (wallet `sec.priority`, set in the admin panel): a
//     session carries it as `p: 1` (eco.js sessionToken). It is never held
//     to a per-session limit (`limitOf`), always let in, and goes past the line.
//   - The door (the Durable Object `Door`, binding DOOR): it counts the people
//     using Orbit now (an account seen within SEEN_MS, its seat), lets new
//     ones in while there's room, and puts the rest in a line, first come
//     first in, with their place. Off unless the owner sets a most at once
//     (`max`, 0 = no limit), or the bill's guard says no newcomers
//     (pace.js `newcomers: false`, the guard's "basics first" level): then
//     the people in now keep their seats and newcomers wait for one to free up.
//
// Asked only when a session is handed out (eco.js signIn and refresh) and,
// at most every SEEN_PING_MS an account an isolate, when the heartbeat's read
// renews one (`seen`): never per data request. While the door is open the
// ask goes behind the answer (waitUntil), so an app's opening doesn't wait
// on it; only when busy or full is the answer waited for. A door that fails
// to answer lets everyone in (it never locks people out by breaking).
//
// The state the door is in (`open`, `busy` past BUSY_SHARE of the most,
// `full`) goes to KV (`door:state`) only when it changes; isolates read it
// at most once a minute (`doorOf`). Busy and full make the live refreshes
// slower for everyone (`doorSlow`, worker.js /config, with the guard's pace:
// the larger of the two, never both), so everyone in keeps a steady
// baseline; full also turns away reads on a session run out
// (READ_GRACE_MS) from someone without a seat (`graceShut`).

import { paceOf } from './pace.js';

export const DOOR_STATE_KEY = 'door:state';
// A seat is kept this long after its account was last seen (a session lives
// 20 minutes and the heartbeat's read renews it every 2).
export const SEEN_MS = 15 * 60_000;
export const SEEN_PING_MS = 6 * 60_000;
// A place in line is kept this long between asks (the kit asks every 20 s).
export const LINE_MS = 90_000;
export const BUSY_SHARE = 0.8;
export const ASK_AGAIN_S = 20;

// ---- The book: who is in, who waits (pure, for the tests) -------------------------

export function newBook() {
  return { seats: {}, pri: {}, line: [], max: 0, cap: 0, peak: { n: 0, at: 0 }, turned: 0, day: '' };
}

// Seats and places in line no longer kept.
export function prune(book, now) {
  for (const [id, at] of Object.entries(book.seats)) if (now - at > SEEN_MS) delete book.seats[id];
  for (const [id, at] of Object.entries(book.pri)) if (now - at > SEEN_MS) delete book.pri[id];
  book.line = book.line.filter(w => now - w.asked <= LINE_MS);
  return book;
}

// How many seats there are now: the owner's most (0: no limit), or, while
// the guard lets no newcomers in, the people in when it said so.
export function seatsOf(book) {
  const caps = [book.max, book.cap].filter(n => n > 0);
  return caps.length ? Math.min(...caps) : Infinity;
}

export function stateOf(book) {
  const n = Object.keys(book.seats).length;
  const seats = seatsOf(book);
  if (n >= seats || book.line.length) return 'full';
  if (Number.isFinite(seats) && n >= Math.ceil(seats * BUSY_SHARE)) return 'busy';
  return 'open';
}

const twDay = now => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

// Someone asks to come in: { ok: true } or { ok: false, place, of }.
// `closed`: the guard lets no newcomers in now.
export function ask(book, { id, pri = false, closed = false, now }) {
  prune(book, now);
  if (twDay(now) !== book.day) Object.assign(book, { day: twDay(now), peak: { n: 0, at: 0 }, turned: 0 });
  const seated = () => Object.keys(book.seats).length;
  // The guard closed the door: the seats are the people in now.
  if (closed && !book.cap) book.cap = Math.max(1, seated());
  if (!closed) book.cap = 0;
  if (pri) {
    book.pri[id] = now;
    delete book.seats[id];
    book.line = book.line.filter(w => w.id !== id);
    return { ok: true, pri: true };
  }
  if (book.seats[id]) {
    book.seats[id] = now;
    return { ok: true };
  }
  const seats = seatsOf(book);
  let at = book.line.findIndex(w => w.id === id);
  // Room, and first in line (or no line): in.
  if (seated() < seats && at <= 0 && (at === 0 || !book.line.length)) {
    if (at === 0) book.line.shift();
    book.seats[id] = now;
    const n = seated();
    if (n > book.peak.n) book.peak = { n, at: now };
    return { ok: true };
  }
  if (at < 0) {
    book.line.push({ id, since: now, asked: now });
    at = book.line.length - 1;
    book.turned++;
  } else book.line[at].asked = now;
  return { ok: false, place: at + 1, of: book.line.length };
}

// The heartbeat saw an account still here: its seat kept. One without a
// seat (it came in while the door's answer went behind) takes one if
// there's room; never past the line.
export function seen(book, { id, pri = false, now }) {
  if (pri) book.pri[id] = now;
  else if (book.seats[id]) book.seats[id] = now;
  else if (!book.line.length && Object.keys(book.seats).length < seatsOf(book)) book.seats[id] = now;
}

export function report(book, now) {
  prune(book, now);
  const seats = seatsOf(book);
  return {
    state: stateOf(book),
    n: Object.keys(book.seats).length,
    pri: Object.keys(book.pri).length,
    line: book.line.length,
    max: book.max,
    seats: Number.isFinite(seats) ? seats : 0,
    closed: book.cap > 0,
    peak: book.peak,
    turned: book.turned,
    at: now
  };
}

// ---- The Durable Object ------------------------------------------------------------
//
// One for the whole family (idFromName('door')). The book lives in memory and
// is written to its storage at most every 30 s (and at once when the owner
// sets the most); a DO woken again reads it back.

export class Door {
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
    this.book = null;
    this.savedAt = 0;
    this.told = null;
  }
  async load() {
    if (!this.book) this.book = { ...newBook(), ...((await this.storage.get('book')) || {}) };
    return this.book;
  }
  async save(now, force = false) {
    if (!force && now - this.savedAt < 30_000) return;
    this.savedAt = now;
    await this.storage.put('book', this.book);
  }
  // The state, to KV, only when it changed.
  async tell(now) {
    const state = stateOf(this.book);
    if (state === this.told) return;
    this.told = state;
    try {
      await this.env?.RATE_LIMIT_KV?.put(DOOR_STATE_KEY, JSON.stringify({ state, at: now }));
    } catch {}
  }
  async fetch(request) {
    const now = Date.now();
    const book = await this.load();
    const url = new URL(request.url);
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    let out;
    if (url.pathname === '/ask') out = ask(book, { id: String(body.id || ''), pri: Boolean(body.pri), closed: Boolean(body.closed), now });
    else if (url.pathname === '/seen') {
      seen(book, { id: String(body.id || ''), pri: Boolean(body.pri), now });
      out = { ok: true };
    } else if (url.pathname === '/set') {
      book.max = Math.max(0, Math.min(100_000, Math.floor(Number(body.max) || 0)));
      await this.save(now, true);
      out = report(book, now);
    } else out = report(book, now);
    await this.save(now);
    await this.tell(now);
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
  }
}

// ---- The Worker's side --------------------------------------------------------------

const stub = env => env.DOOR.get(env.DOOR.idFromName('door'));
const post = (env, path, body) => stub(env).fetch(`https://door${path}`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

let memo = { at: 0, v: null };
// The door's state as KV last heard it ({ state }), read once a minute an isolate.
export async function doorOf(env, now = Date.now()) {
  if (memo.v && now - memo.at < 60_000) return memo.v;
  let got = null;
  try {
    got = env.RATE_LIMIT_KV ? await env.RATE_LIMIT_KV.get(DOOR_STATE_KEY, { type: 'json', cacheTtl: 60 }) : null;
  } catch {}
  memo = { at: now, v: { state: ['open', 'busy', 'full'].includes(got?.state) ? got.state : 'open' } };
  return memo.v;
}
export const forgetDoor = () => {
  memo = { at: 0, v: null };
  pinged.clear();
};

// Whether the guard lets newcomers in (pace.js `newcomers`; an older pace
// without it: not at the leanest level).
export const newcomersOk = pace => (pace?.newcomers === undefined ? !(pace?.pace >= 3) : pace.newcomers !== false);

// Someone is handed a session (eco.js): { ok: true } or { ok: false, place, of }.
// `waitUntil`: the request's, for the ask behind the answer while the door is open.
export async function admit(env, { id, pri = false, waitUntil = null } = {}) {
  if (!env?.DOOR || !id) return { ok: true };
  const closed = !newcomersOk(await paceOf(env));
  const { state } = await doorOf(env);
  const asking = post(env, '/ask', { id, pri, closed });
  if (pri || (state === 'open' && !closed)) {
    pinged.set(id, Date.now());
    const quiet = asking.catch(() => {});
    if (waitUntil) waitUntil(quiet);
    return { ok: true };
  }
  try {
    const out = await asking;
    if (out?.ok !== false) pinged.set(id, Date.now());
    return out?.ok === false ? out : { ok: true };
  } catch {
    return { ok: true };
  }
}

// The heartbeat renewed a session: the seat kept (at most every SEEN_PING_MS
// an account in this isolate).
const pinged = new Map();
export function seenNow(env, { id, pri = false, waitUntil = null, now = Date.now() } = {}) {
  if (!env?.DOOR || !id || now - (pinged.get(id) || 0) < SEEN_PING_MS) return;
  if (pinged.size > 20_000) pinged.clear();
  pinged.set(id, now);
  const p = post(env, '/seen', { id, pri }).catch(() => {});
  if (waitUntil) waitUntil(p);
}

// The admin panel: the door now, and the most set.
export const doorReport = env => (env?.DOOR ? stub(env).fetch('https://door/now').then(r => r.json()) : Promise.resolve(null));
export const doorSet = (env, max) => (env?.DOOR ? post(env, '/set', { max }) : Promise.resolve(null));

// How many times slower the live refreshes are while busy or full.
export const doorSlow = state => (state === 'full' ? 3 : state === 'busy' ? 2 : 1);

// The limit a session is held to: none for a priority pass.
export const limitOf = (session, limit) => (session?.p ? Infinity : limit);

// A read on a session run out (READ_GRACE_MS), while the door is full, from
// someone without a priority pass: turned away (a seat needs a fresh session).
export async function graceShut(env, session, now = Date.now()) {
  if (!session || session.p || session.dev || !(session.e <= now)) return false;
  return (await doorOf(env, now)).state === 'full';
}

// The answer to someone turned away: 503, their place in line.
export const fullBody = out => ({ error: { code: 'ORBIT_FULL', message: 'ORBIT_FULL', place: out?.place || 0, of: out?.of || 0, again: ASK_AGAIN_S } });
