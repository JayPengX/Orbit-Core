// Where the family lives: the one place the owner's own domain is set.
//   https://orbit.<DOMAIN>/<slug>/  every Orbit app, by its short name
//                              (kit/brand.mjs; one origin, so the Pass's
//                              sign-in is shared)
//   https://<DOMAIN>/          Jay's own homepage, and /showcase/
//   https://longshot.<DOMAIN>/ only a notice that Longshot has shut down (site.js)
//   https://api.<DOMAIN>       the proxy (orbit-workers-proxy)
//   <anything>@<DOMAIN>        Orbit Money's mail-in invoices
// deploy.yml attaches the hostnames to their Workers; workers.dev stays the
// proxy's address off the domain (a local preview, the Workers themselves).
export const DOMAIN = 'jaypengx.com';

export const WORKERS_DEV = 'https://orbit-workers-proxy.pengzjay.workers.dev';

// The addresses for a domain, as seen from a page on `host`.
export function homes(domain, host) {
  const d = String(domain || '').trim().toLowerCase();
  if (!d) throw new Error('no domain');
  const h = String(host || '').toLowerCase();
  // On the domain: the apps' host, or the bare domain (the showcase loads the kit too).
  const on = h === `orbit.${d}` || h === d;
  return {
    domain: d,
    // Where the apps live now: the address shared, put in a QR code or a notice.
    site: `https://orbit.${d}`,
    // Jay's own homepage (the showcase is its /showcase/).
    home: `https://${d}`,
    // The pages allowed to call the Workers (http.js).
    origins: [`https://orbit.${d}`, `https://${d}`],
    // The proxy, as this page should reach it: from a page on the domain, at
    // the page's own address under /api (a Cloudflare route to the proxy: no
    // second connection, no CORS preflight; api.<domain> still answers);
    // workers.dev from anywhere else (a local preview, the Workers themselves).
    api: on ? `https://${h}/api` : WORKERS_DEV,
    // This page is on the domain.
    on,
    // A URL on the proxy, either address.
    isApi: url => {
      try {
        const u = new URL(url, globalThis.location?.href);
        const h = u.hostname;
        return h.endsWith('.workers.dev') || h === `api.${d}` || ((h === `orbit.${d}` || h === d) && u.pathname.startsWith('/api/'));
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
