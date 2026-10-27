// orbit-site: the family on its own domain (kit/domain.mjs DOMAIN), read
// through from GitHub Pages, so a repo's push still deploys it (its Pages
// workflow) and nothing is copied or kept in step. Three hosts:
//   orbit.<DOMAIN>     every Orbit app at its short name (kit/brand.mjs
//                      SHORT): /law/ is Pages' /Orbit-Law/; / opens the
//                      family page (/pass/). One origin, one Pass sign-in.
//   <DOMAIN>           Jay's homepage (Orbit-Showcase's public/home/) at /,
//                      the showcase at /showcase/.
//   longshot.<DOMAIN>  Longshot alone, at its root (its own origin).
// The kit stays at /Orbit-Core/kit/ wherever a page loads it from
// ('../Orbit-Core/kit/'), the family's data at /Shared-Data/. Nothing else:
// a repo's own name (/Orbit-Law/) isn't an address here.
// Cloudflare's cache keeps what Pages says may be kept (its 10 minutes for
// files; the kit's and apps' files carry their hash, so an update is never
// held back).
import { PAGES } from './kit/domain.mjs';
import { SHORT } from './kit/brand.mjs';

// Orbit-Core was Shared-Proxy, and GitHub moved its Pages with it: pages and
// service workers a phone still keeps load '../Shared-Proxy/kit/', so that
// name reads Orbit-Core's Pages, for good.
const RENAMED = { 'Shared-Proxy': 'Orbit-Core' };
const renamed = path => path.replace(/^\/([^/]+)/, (m, r) => `/${RENAMED[r] || r}`);
const AS_IS = ['Orbit-Core', 'Shared-Data', ...Object.keys(RENAMED)].map(r => [`/${r}`, `/${r}`]);

// Each host's folders: [the path asked, the path on Pages].
const APPS = [...Object.entries(SHORT).map(([slug, repo]) => [`/${slug}`, `/${repo}`]), ...AS_IS];
const BARE = [['/showcase', '/Orbit-Showcase'], ...AS_IS];
const LONGSHOT = [['', '/Longshot']];
const HOME = '/Orbit-Showcase/home/';

const under = (path, base) => path === base || path.startsWith(`${base}/`) || base === '';
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

export async function site(request, fetcher = fetch) {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const sub = url.hostname.split('.')[0];
  const mounts = sub === 'orbit' ? APPS : sub === 'longshot' ? LONGSHOT : BARE;
  const root = url.pathname === '/' || url.pathname === '/index.html';
  // orbit.<domain> itself: the family's page.
  if (root && mounts === APPS) return Response.redirect(`${url.origin}/pass/`, 302);
  let mount = mounts.find(([asked]) => under(url.pathname, asked));
  let path;
  if (root && mounts === BARE) path = HOME;
  else if (mount) path = renamed(mount[1] + url.pathname.slice(mount[0].length));
  else return notFound();
  const headers = new Headers();
  for (const k of ['Accept', 'Accept-Encoding', 'Accept-Language', 'If-None-Match', 'If-Modified-Since', 'Range', 'User-Agent']) {
    const v = request.headers.get(k);
    if (v) headers.set(k, v);
  }
  const res = await fetcher(`${PAGES}${path}${url.search}`, { method: request.method, headers, redirect: 'manual' });
  const out = new Response(res.body, res);
  // Pages' own redirects (/Orbit-Law → /Orbit-Law/) stay on this host, at
  // the name asked for (/pass → /pass/, not the kit's /Orbit-Core/).
  const loc = out.headers.get('Location');
  if (loc?.startsWith(PAGES)) {
    const p = loc.slice(PAGES.length);
    const back = [mount, ...mounts].filter(Boolean).find(([, pages]) => under(p, renamed(pages)));
    out.headers.set('Location', url.origin + (back ? back[0] + p.slice(renamed(back[1]).length) || '/' : p));
  }
  return out;
}

export default { fetch: request => site(request) };
