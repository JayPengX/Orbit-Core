// A read with a deadline it can't miss: its own timer aborts it and gives up
// on it, whatever fetch does with the abort. `work` gets the signal and reads
// the body too (2026-10-12: NBA's months hung on the runner past
// AbortSignal.timeout, never settling; the run waited on them for hours).
export function within(ms, work) {
  const c = new AbortController();
  let timer;
  return Promise.race([
    Promise.resolve().then(() => work(c.signal)),
    new Promise((_, no) => {
      timer = setTimeout(() => {
        const error = Object.assign(new Error(`no answer in ${ms / 1000} s`), { name: 'TimeoutError' });
        c.abort(error);
        no(error);
      }, ms);
    })
  ]).finally(() => clearTimeout(timer));
}
