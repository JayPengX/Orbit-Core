// orbit-site: the family's hosts on its own domain (kit/domain.mjs DOMAIN),
// as Workers custom domains (deploy.yml attaches them: Cloudflare keeps their
// DNS records and certificates). What a page is served is never read here:
// each repo publishes its site to Cloudflare itself (deploy/cf-site.mjs), on
// routes, which win over a custom domain on the same host:
//   orbit.<DOMAIN>     every app at its short name (orbit-<slug>), the
//                      family page, the kit and the rest (orbit-pass)
//   <DOMAIN>           Jay's homepage and /showcase/ (orbit-home), the kit
//   longshot.<DOMAIN>  no route: this Worker, Longshot's shutdown notice at
//                      every address (Longshot closed 2026-10-31;
//                      site-closed.js)
// Whatever reaches this Worker on another host (no route claims it, which
// shouldn't happen) is not found.
import { NOTICE, SW } from './site-closed.js';

// Longshot, shut down: the notice wherever a phone asks, and a service worker
// that removes the old app from a phone still keeping it.
const closed = path => path === '/sw.js'
  ? new Response(SW, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } })
  : new Response(NOTICE, { status: path === '/' || path === '/index.html' ? 200 : 410, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });

export async function site(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('', { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (url.hostname.split('.')[0] === 'longshot') return closed(url.pathname);
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
}

export default { fetch: request => site(request) };
