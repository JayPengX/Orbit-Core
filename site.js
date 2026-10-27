// orbit-site: the family's apps on its own domain (kit/domain.mjs DOMAIN),
// https://<DOMAIN>/<Repo>/, the very paths GitHub Pages serves them at, so
// the kit's '../Shared-Proxy/kit/' and every link between apps hold as
// they are. Each file is GitHub Pages' own, read through: an app's push
// still deploys it (its Pages workflow), live on both addresses at once;
// nothing is copied, nothing to keep in step. Cloudflare's cache keeps what
// Pages says may be kept (its 10 minutes for files; the kit's and apps'
// files carry their hash, so an update is never held back).
// No domain yet: never deployed (deploy.yml), and nothing points here.
import { PAGES } from './kit/domain.mjs';
import { BRANDS } from './kit/brand.mjs';

// The folders served: every app, the kit and the family's home page, and the
// apps outside the brand list. Anything else at github.io isn't the family's.
export const FOLDERS = new Set([...Object.values(BRANDS).map(b => b.repo), 'Shared-Proxy', 'Shared-Data', 'Longshot', 'Orbit-Money']);

export async function site(request, fetcher = fetch) {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('', { status: 405, headers: { Allow: 'GET, HEAD' } });
  // The domain itself: the family's home page.
  if (url.pathname === '/' || url.pathname === '/index.html') return Response.redirect(`${url.origin}/Shared-Proxy/`, 302);
  const folder = url.pathname.split('/')[1];
  if (!FOLDERS.has(folder)) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  const headers = new Headers();
  for (const k of ['Accept', 'Accept-Encoding', 'Accept-Language', 'If-None-Match', 'If-Modified-Since', 'Range', 'User-Agent']) {
    const v = request.headers.get(k);
    if (v) headers.set(k, v);
  }
  const res = await fetcher(`${PAGES}${url.pathname}${url.search}`, { method: request.method, headers, redirect: 'manual' });
  const out = new Response(res.body, res);
  // Pages' own redirects (/Orbit-Law → /Orbit-Law/) stay on this domain.
  const loc = out.headers.get('Location');
  if (loc?.startsWith(PAGES)) out.headers.set('Location', url.origin + loc.slice(PAGES.length));
  return out;
}

export default { fetch: request => site(request) };
