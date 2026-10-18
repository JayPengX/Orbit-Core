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
// holds `active` from before when it comes back, and the kit's claim on
// return doesn't say anything changed. So the Pass's copy counts as unread
// again (`stale`) whenever this app may have stopped being the live one: on
// coming back to the screen, at any change of `active`, and after a write the
// Worker refused. The next write reads it first.
//
// Loaded with import('#kit/pass-sync.mjs').catch(() => null): an older kit
// cached on a phone lacks it (that load stays on the phone's own copy).
//
//   const sync = passSync(q, { decode, apply, encode });   q: quadraSession(…)
//   await sync.first(await q.start(), { local })  the sign-in's reply
//   sync.watch()     stale (and read again) whenever this app may have stopped being live
//   sync.changed()   something here changed: written at the next sync
//   sync.sync()      read if stale, then write if changed (one at a time)
//   sync.stale()     the Pass's copy may have changed (called by `watch`)
//   sync.pulled / unreadable / dirty
//
// decode(payload) → a copy or null (unreadable); apply(copy) merges it into
// the app's state; encode() → the payload. Each may return a promise.
export function passSync(q, { decode, apply, encode }) {
  let pulled = false;
  let unreadable = false;
  let dirty = false;
  // Bumped by every `stale`: a read that started before it doesn't count.
  let era = 0;
  let chain = Promise.resolve();

  async function take(payload, at) {
    const theirs = payload ? await decode(payload) : null;
    if (payload && !theirs) {
      unreadable = true;
      return;
    }
    if (theirs) await apply(theirs);
    if (at === era) pulled = true;
  }
  async function push() {
    if (!q.active || unreadable) return;
    if (!pulled) {
      const at = era;
      const res = await q.read({ data: true });
      await take(res?.payload, at);
      if (unreadable || !pulled) return;
    }
    if (!dirty) return;
    dirty = false;
    try {
      await q.write({ payload: await encode() });
    } catch (error) {
      dirty = true;
      // Refused (another session is live): what it wrote is read first next time.
      if (error?.code === 'ECO_SESSION_MOVED') stale();
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
    get unreadable() {
      return unreadable;
    },
    get dirty() {
      return dirty;
    },
    // The sign-in's first reply (q.start()): its payload merged in; `local`:
    // the app opened on its own copy, which goes up if the pass's lacks
    // anything of it. Offline, the pass is read once it's back.
    async first(reply, { local = false } = {}) {
      if (!reply || reply.offline) {
        if (local) dirty = true;
        return;
      }
      await take(reply.payload, era);
      if (!unreadable && local && (await encode()) !== (reply.payload || '')) dirty = true;
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
      q.on?.('active', live => {
        stale();
        if (live) this.sync();
      });
      doc?.addEventListener?.('visibilitychange', () => {
        if (doc.visibilityState === 'visible') {
          stale();
          this.sync();
        }
      });
      return this;
    }
  };
}
