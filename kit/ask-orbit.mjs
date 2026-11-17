// ---- kit/ask-orbit.mjs: an app's question in its address (#ask=<words>) ----
// 問 Orbit on the Pass sheet is gone (Jay 11-17: no AI chat box in every app);
// this is read by apps still on an older build, until they drop it.
// In an app: the question a link brought (`#ask=<words>`), taken out of the
// address so a reload doesn't ask again; '' when none.
export function takeAsk(loc = globalThis.location) {
  const hash = String(loc?.hash || '').replace(/^#/, '');
  if (!hash) return '';
  const parts = hash.split('&');
  const i = parts.findIndex(p => p.startsWith('ask='));
  if (i < 0) return '';
  let text = '';
  try {
    text = decodeURIComponent(parts[i].slice(4).replace(/\+/g, ' ')).trim().slice(0, 200);
  } catch {}
  parts.splice(i, 1);
  try {
    globalThis.history?.replaceState(globalThis.history.state, '', `${loc.pathname}${loc.search}${parts.length ? `#${parts.join('&')}` : ''}`);
  } catch {}
  return text;
}
