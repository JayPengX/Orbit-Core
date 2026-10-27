// Where the family lives: the one place the owner's own domain is set.
//
// Empty, everything is as it always was: the apps on GitHub Pages
// (jaypengx.github.io/<Repo>/) and the Workers on workers.dev. Set to the
// domain (a bare name, 'example.tw'), one push here moves the family:
//   https://orbit.<DOMAIN>/<slug>/  every Orbit app, by its short name
//                              (kit/brand.mjs; one origin, so the Pass's
//                              sign-in is shared; site.js reads its repo's
//                              Pages through, so an app's push still deploys it)
//   https://<DOMAIN>/          Jay's own homepage, and /showcase/
//   https://longshot.<DOMAIN>/ Longshot, on its own (its own origin)
//   https://api.<DOMAIN>       the proxy (orbit-workers-proxy)
//   <anything>@<DOMAIN>        Orbit Money's mail-in invoices
// deploy.yml attaches the hostnames to their Workers. GitHub Pages stays
// what site.js reads; workers.dev stays the proxy's address off the domain.
export const DOMAIN = 'jaypengx.com';

export const PAGES = 'https://jaypengx.github.io';
export const WORKERS_DEV = 'https://orbit-workers-proxy.pengzjay.workers.dev';

// The addresses for a domain ('' for none), as seen from a page on `host`.
export function homes(domain, host) {
  const d = String(domain || '').trim().toLowerCase();
  const h = String(host || '').toLowerCase();
  // On the domain: the apps' host, or the bare domain (the showcase loads the kit too).
  const on = Boolean(d) && (h === `orbit.${d}` || h === d);
  return {
    domain: d,
    // Where the apps live now: the address shared, put in a QR code or a notice.
    site: d ? `https://orbit.${d}` : PAGES,
    // Jay's own homepage (the showcase is its /showcase/).
    home: d ? `https://${d}` : PAGES,
    // The pages allowed to call the Workers (http.js).
    origins: d ? [PAGES, `https://orbit.${d}`, `https://${d}`] : [PAGES],
    // The proxy, as this page should reach it: api.<domain> from a page on the
    // domain; workers.dev from anywhere else (GitHub Pages, a local preview,
    // the Workers themselves).
    api: on ? `https://api.${d}` : WORKERS_DEV,
    // This page is on the domain.
    on,
    // A URL on the proxy, either address.
    isApi: url => {
      try {
        const h = new URL(url, globalThis.location?.href).hostname;
        return h.endsWith('.workers.dev') || (Boolean(d) && h === `api.${d}`);
      } catch {
        return false;
      }
    }
  };
}

const here = homes(DOMAIN, globalThis.location?.hostname);
export const SITE = here.site;
export const HOME = here.home;
export const ORIGINS = here.origins;
export const API = here.api;
export const onDomain = here.on;
export const isApi = here.isApi;
