// The tests reach nothing off this machine (`node --import ./kit/no-net.mjs
// --test`, an app's `./.kit/no-net.mjs`): every fetch, http and https
// request to another host is refused as a network failure, so no test, here
// or in a deploy, can spend a real call of TDX's month, Google's or our
// Workers' (2026-11-06: a Transit test's stray reads reached the proxy).
// Never served (preload.mjs KIT_TOOLS).
import http from 'node:http';
import https from 'node:https';

const local = host => /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/.test(String(host || ''));
const hostOf = input => {
  try {
    return new URL(typeof input === 'string' ? input : input?.url || String(input)).hostname;
  } catch {
    return '';
  }
};
const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (!local(hostOf(input))) throw new TypeError(`no-net: the tests reach nothing off this machine (${hostOf(input)})`);
  return real(input, init);
};
for (const mod of [http, https])
  for (const name of ['request', 'get']) {
    const orig = mod[name];
    mod[name] = function (...args) {
      const o = args[0];
      const host = typeof o === 'string' || o instanceof URL ? hostOf(String(o)) : o?.hostname || o?.host;
      if (!local(host)) throw new Error(`no-net: the tests reach nothing off this machine (${host})`);
      return orig.apply(this, args);
    };
  }
