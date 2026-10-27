// ---- store-backup.js ----
// The Pass's whole store copied to R2 each night, beside D1 (doc-store.js
// keeps each document's versions inside D1; this is for D1 itself gone or
// broken). One gzipped JSON line a document, { coll, id, payload, updated }
// (the shape of Firestore's last copy), at private/store/<TW day>.jsonl.gz
// (`private/` is never served). Kept: the last 14 nights and the first of
// each month for a year. A document is put back from one with `fromBackup`.

export const BACKUP_PREFIX = 'private/store/';
const twDay = t => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
export const backupKey = day => `${BACKUP_PREFIX}${day}.jsonl.gz`;

// Which nights stay: the newest 14, and the first of each month for 12 months.
export function backupsToDrop(days, now) {
  const keep = new Set([...days].sort().reverse().slice(0, 14));
  const month = twDay(now).slice(0, 7);
  for (const d of days) if (d.endsWith('-01') && monthsBetween(d.slice(0, 7), month) < 12) keep.add(d);
  return days.filter(d => !keep.has(d));
}
const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

export async function listBackups(env) {
  const days = [];
  let cursor;
  do {
    const r = await env.DATA.list({ prefix: BACKUP_PREFIX, cursor });
    for (const o of r.objects) days.push({ day: o.key.slice(BACKUP_PREFIX.length, -'.jsonl.gz'.length), size: o.size, docs: Number(o.customMetadata?.docs) || 0 });
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return days.sort((a, b) => b.day.localeCompare(a.day));
}

// store: doc-store's calls ({ page(env, from, size) }). Once a night.
export async function backupStore(env, store, now = Date.now()) {
  if (!env.STORE || !env.DATA) return { skipped: true };
  const key = backupKey(twDay(now));
  if (await env.DATA.head(key)) return null;
  const gz = new CompressionStream('gzip');
  const out = new Response(gz.readable).arrayBuffer();
  const writer = gz.writable.getWriter();
  const enc = new TextEncoder();
  let docs = 0;
  let from = ['', ''];
  for (;;) {
    const rows = await store.page(env, from, 200);
    if (!rows.length) break;
    await writer.write(enc.encode(rows.map(r => `${JSON.stringify({ coll: r.coll, id: r.id, payload: r.payload, updated: r.updated })}\n`).join('')));
    docs += rows.length;
    from = [rows.at(-1).coll, rows.at(-1).id];
  }
  await writer.close();
  const body = await out;
  await env.DATA.put(key, body, { customMetadata: { docs: String(docs) } });
  const drop = backupsToDrop((await listBackups(env)).map(b => b.day), now);
  for (const d of drop) await env.DATA.delete(backupKey(d));
  return { key, docs, bytes: body.byteLength, dropped: drop.length };
}

// The documents of one night's copy that `pick(row)` wants.
export async function fromBackup(env, day, pick) {
  const obj = await env.DATA.get(backupKey(day));
  if (!obj) return null;
  const text = await new Response(obj.body.pipeThrough(new DecompressionStream('gzip'))).text();
  const hits = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (pick(row)) hits.push(row);
  }
  return hits;
}
