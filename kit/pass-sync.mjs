// An app's payload on the Quadra Pass, kept in step with the phone's own
// copy: the Pass's copy is read and merged in before anything is written
// over it, every time it may have changed since (never an older copy over a
// newer one; a copy that can't be read is never written over). One for
// every app with a payload (Orbit Words, Orbit Weather, Orbit Slips); the
// app brings only its own decode, merge and encode.
//
// Only one app on one device is live on a Pass at a time (the Worker refuses
// a write from any other), but an app sent to the background isn't told when
// another device (or the same app elsewhere) took over and wrote: it still
// holds `active` from before when it comes back. So the Pass's copy counts
// as unread again (`stale`) whenever this app may have stopped being the
// live one: on coming back to the screen, at any change of `active`, and
// after any write that didn't go through (refused, or lost on the way: it
// may have landed). A read that started before the last `stale` is merged
// in but doesn't count as read (`era`). The next write reads it first.
//
// Each read brings the whole payload (up to a few hundred KB; the Pass has
// no "only if changed" read), so a return reads it once, not more:
// - away under BRIEF_MS (a look at another app), read since and nothing
//   staled meanwhile: not read at all. Only the app's own live session
//   writes its payload, so it can only have changed if another device
//   opened the app and saved in those seconds.
// - otherwise read once the kit's claim on return has landed (its `claim`
//   event; an older kit's `wallet`), or CLAIM_WAIT_MS on without one: a read
//   before the claim saw "not live" and was read again when it came back.
// - a copy the same as the one last merged or written here (its updateTime)
//   isn't decoded, merged or redrawn again.
//
// Loaded with import('#kit/pass-sync.mjs').catch(() => null): an older kit
// cached on a phone lacks it (that load stays on the app's own copy).
//
//   const sync = passSync(q, { decode, apply, encode });   q: quadraSession(…)
//   await sync.first(await q.start(), { local })  the sign-in's reply
//   sync.watch()     stale (and read again) whenever this app may have stopped being live
//   sync.changed()   something here changed: written at the next sync
//   sync.sync()      read if stale, then write if changed (one at a time)
//   sync.stale()     the Pass's copy may have changed (called by `watch`)
//   sync.pulled      read since the last `stale`
//   sync.known       any copy of the Pass's read since the page opened (a
//                    phone with nothing of its own that couldn't read it
//                    says so, never "nothing yet")
//   sync.unreadable / dirty
//
// decode(payload) → a copy or null (unreadable); apply(copy) merges it into
// the app's state; encode() → the payload. Each may return a promise.
// `now` (optional): the clock, for tests.
export const BRIEF_MS = 10_000;
// The claim's reply waited for at most this long (offline: no reply).
export const CLAIM_WAIT_MS = 3_000;

export function passSync(q, { decode, apply, encode, now = Date.now }) {
  let pulled = false;
  let known = false;
  let unreadable = false;
  let dirty = false;
  // The Pass copy's updateTime last merged or written here ('' unknown).
  let seen = '';
  // Bumped by every `stale`: a read that started before it doesn't count.
  let era = 0;
  let chain = Promise.resolve();

  async function take(payload, at, time = '') {
    if (time && time === seen) {
      known = true;
      if (at === era) pulled = true;
      return;
    }
    const theirs = payload ? await decode(payload) : null;
    if (payload && !theirs) {
      unreadable = true;
      return;
    }
    if (theirs) {
      await apply(theirs);
      // The merge kept something of this phone's: it goes up, not only at the next edit.
      if ((await encode()) !== payload) dirty = true;
    }
    known = true;
    seen = time || '';
    if (at === era) pulled = true;
  }
  async function push() {
    if (!q.active || unreadable) return;
    if (!pulled) {
      const at = era;
      const res = await q.read({ data: true });
      if (typeof res?.payload !== 'string') return;
      await take(res.payload, at, res.updateTime);
      if (unreadable || !pulled) return;
    }
    if (!dirty) return;
    dirty = false;
    try {
      seen = (await q.write({ payload: await encode() }))?.updateTime || '';
    } catch (error) {
      dirty = true;
      // Refused (another session live) or lost: the Pass's copy is read first next time.
      stale();
      throw error;
    }
  }
  function stale() {
    era++;
    pulled = false;
  }
  return {
    get pulled() {
      return pulled;
    },
    get known() {
      return known;
    },
    get unreadable() {
      return unreadable;
    },
    get dirty() {
      return dirty;
    },
    // The sign-in's first reply (q.start()): its payload merged in; `local`:
    // the app opened on its own copy, which goes up if the Pass's lacks
    // anything of it. Offline, the Pass is read once it's back.
    async first(reply, { local = false } = {}) {
      if (!reply || reply.offline || typeof reply.payload !== 'string') {
        if (local) dirty = true;
        return;
      }
      await take(reply.payload, era, reply.updateTime);
      if (!unreadable && local && (await encode()) !== reply.payload) dirty = true;
      if (dirty) this.sync();
    },
    changed() {
      dirty = true;
    },
    stale,
    sync() {
      chain = chain.then(push).catch(() => {});
      return chain;
    },
    // Stale (and read again) whenever this app may have stopped being the live one.
    watch(doc = globalThis.document) {
      let hiddenAt = 0;
      let eraHidden = -1;
      let wait = null;
      const go = () => {
        clearTimeout(wait?.timer);
        wait = null;
        this.sync();
      };
      q.on?.('active', live => {
        stale();
        if (live) this.sync();
      });
      // The kit's claim on return came back (an older kit: its wallet).
      q.on?.('claim', () => wait && go());
      q.on?.('wallet', () => wait && go());
      doc?.addEventListener?.('visibilitychange', () => {
        if (doc.visibilityState === 'hidden') {
          hiddenAt = now();
          eraHidden = pulled ? era : -1;
          return;
        }
        if (eraHidden === era && pulled && now() - hiddenAt < BRIEF_MS) return;
        stale();
        clearTimeout(wait?.timer);
        wait = { timer: setTimeout(go, CLAIM_WAIT_MS) };
        wait.timer.unref?.();
      });
      return this;
    }
  };
}
