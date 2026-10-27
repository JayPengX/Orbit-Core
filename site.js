// orbit-site: the family's apps on its own domain (kit/domain.mjs DOMAIN),
// each at its short name (kit/brand.mjs SHORT): https://<DOMAIN>/law/ is
// GitHub Pages' /Orbit-Law/, read through, so an app's push still deploys
// it (its Pages workflow), live on both addresses at once; nothing is
// copied, nothing to keep in step. The kit stays at /Orbit-Core/kit/ (the
// apps load it as '../Orbit-Core/kit/'), the family's data at
// /Shared-Data/. Nothing else: a repo's own name (/Orbit-Law/) isn't an address here.
// Cloudflare's cache keeps what Pages says may be kept (its 10 minutes for
// files; the kit's and apps' files carry their hash, so an update is never
// held back).
import { PAGES } from './kit/domain.mjs';
import { SHORT, shortPath } from './kit/brand.mjs';

// Orbit-Core was Shared-Proxy, and GitHub moved its Pages with it: pages and
// service workers a phone still keeps load '../Shared-Proxy/kit/', so that
// name reads Orbit-Core's Pages, for good.
const RENAMED = { 'Shared-Proxy': 'Orbit-Core' };
const AS_IS = new Set(['Orbit-Core', 'Shared-Data', ...Object.keys(RENAMED)]);
const renamed = path => path.replace(/^\/([^/]+)/, (m, r) => `/${RENAMED[r] || r}`);

export async function site(request, fetcher = fetch) {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('', { status: 405, headers: { Allow: 'GET, HEAD' } });
  // The domain itself: the family's page.
  if (url.pathname === '/' || url.pathname === '/index.html') return Response.redirect(`${url.origin}/pass/`, 302);
  const [, first = '', rest = ''] = /^\/([^/]*)(.*)$/.exec(url.pathname) || [];
  let path;
  if (Object.hasOwn(SHORT, first)) path = `/${SHORT[first]}${rest}`;
  else if (AS_IS.has(first)) path = url.pathname;
  else return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  path = renamed(path);
  const headers = new Headers();
  for (const k of ['Accept', 'Accept-Encoding', 'Accept-Language', 'If-None-Match', 'If-Modified-Since', 'Range', 'User-Agent']) {
    const v = request.headers.get(k);
    if (v) headers.set(k, v);
  }
  const res = await fetcher(`${PAGES}${path}${url.search}`, { method: request.method, headers, redirect: 'manual' });
  const out = new Response(res.body, res);
  // Pages' own redirects (/Orbit-Law → /Orbit-Law/) stay on this domain, at
  // the name asked for (/pass → /pass/, not the kit's /Orbit-Core/).
  const loc = out.headers.get('Location');
  if (loc?.startsWith(PAGES)) {
    const p = loc.slice(PAGES.length);
    const repo = Object.hasOwn(SHORT, first) ? renamed(`/${SHORT[first]}`) : '';
    const asked = repo && (p === repo || p.startsWith(`${repo}/`)) ? `/${first}${p.slice(repo.length)}` : null;
    out.headers.set('Location', url.origin + (asked || shortPath(p) || p));
  }
  return out;
}

export default { fetch: request => site(request) };
