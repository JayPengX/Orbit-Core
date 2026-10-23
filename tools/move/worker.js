// One-off: the Pass's store and the family's data move from their Quadra
// names (D1 quadra-store, R2 quadra-data) to Orbit's (orbit-store,
// orbit-data). Run by .github/workflows/move.yml, which deploys this Worker,
// calls it until every row and file is across, and deletes it. Safe to run
// again: a row goes across only when it's newer, a file only when it differs.
// Collections named after Quadra take their new names on the way.
const COLL = { 'quadra-config': 'orbit-config', 'orbit-quadra': 'orbit-class' };
const SCHEMA = 'CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY (coll, id))';
const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    if (!env.MOVE_KEY || request.headers.get('Authorization') !== `Bearer ${env.MOVE_KEY}`) return json({ error: 'key' }, 401);
    const u = new URL(request.url);
    // The keys only (1000 a page): how many there are, and each page's cursor.
    if (u.pathname === '/list') {
      const page = await env.OLD_DATA.list({ cursor: u.searchParams.get('cursor') || undefined, limit: 1000 });
      return json({ n: page.objects.length, cursor: page.truncated ? page.cursor : null });
    }
    // One page copied, 50 at a time; a file already there (same etag) is skipped.
    if (u.pathname === '/r2') {
      const page = await env.OLD_DATA.list({ cursor: u.searchParams.get('cursor') || undefined, limit: Number(u.searchParams.get('limit')) || 250 });
      let copied = 0;
      const one = async o => {
        const there = await env.NEW_DATA.head(o.key);
        if (there && there.etag === o.etag) return;
        const obj = await env.OLD_DATA.get(o.key);
        if (!obj) return;
        await env.NEW_DATA.put(o.key, obj.body, { httpMetadata: obj.httpMetadata, customMetadata: obj.customMetadata });
        copied++;
      };
      for (let k = 0; k < page.objects.length; k += 50) await Promise.all(page.objects.slice(k, k + 50).map(one));
      return json({ seen: page.objects.length, copied, cursor: page.truncated ? page.cursor : null });
    }
    if (u.pathname === '/d1') {
      await env.NEW_STORE.prepare(SCHEMA).run();
      const after = JSON.parse(u.searchParams.get('after') || '["",""]');
      const { results } = await env.OLD_STORE.prepare('SELECT coll, id, payload, updated FROM docs WHERE (coll, id) > (?, ?) ORDER BY coll, id LIMIT 40').bind(after[0], after[1]).all();
      let copied = 0;
      for (const r of results) {
        const res = await env.NEW_STORE.prepare('INSERT INTO docs (coll, id, payload, updated) VALUES (?, ?, ?, ?) ON CONFLICT (coll, id) DO UPDATE SET payload = excluded.payload, updated = excluded.updated WHERE excluded.updated > docs.updated').bind(COLL[r.coll] || r.coll, r.id, r.payload, r.updated).run();
        copied += res.meta?.changes || 0;
      }
      const last = results.at(-1);
      return json({ seen: results.length, copied, after: results.length === 40 ? [last.coll, last.id] : null });
    }
    if (u.pathname === '/count') {
      const old = await env.OLD_STORE.prepare('SELECT COUNT(*) AS n FROM docs').first();
      const now = await env.NEW_STORE.prepare('SELECT COUNT(*) AS n FROM docs').first();
      return json({ oldRows: old.n, newRows: now.n });
    }
    return json({ error: 'path' }, 404);
  }
};
