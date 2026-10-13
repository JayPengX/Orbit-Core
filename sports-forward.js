// The old sports proxy's address (sports-proxy.pengzjay.workers.dev): every
// request handed to the main Worker, which serves /sports-proxy itself now
// (the owner, 2026-10-13: one proxy). Kept only for phones still on a kit
// from before the move; it goes once every device has moved on (the kit
// updates on its next opening).
//
// (Temporary, 2026-10-14: /yahoo-probe reads a Yahoo URL from here, a Worker
// with no placement, to compare with the main one in Taiwan. Comes out once
// the cause of Yahoo's 429s is known.)
export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    if (u.pathname === '/yahoo-probe') {
      const target = u.searchParams.get('url') || '';
      if (!/^https:\/\/query[12]\.finance\.yahoo\.com\//.test(target)) return new Response('', { status: 400 });
      const res = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      return new Response(`${res.status} ${request.cf?.colo || ''}`, { headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return env.ORBIT.fetch(request);
  }
};
