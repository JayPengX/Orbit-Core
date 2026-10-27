// Orbit Money's mail-in 載具 invoices (money-mail.js): the CSV found in a
// forwarded mail, Gmail's forwarding code, the box's items, the app's asks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mailInvoices, gmailCode, addItems, binary, handleMoneyMail, handleMoneyMailRequest, MAIL_COLLECTION } from '../money-mail.js';

const CSV = '表頭=M|載具名稱|載具號碼|發票日期|商店統編|商店店名|發票號碼|總金額|發票狀態|\r\nM|手機條碼|/ABC1234|20261005|16446274|全家|AB12345678|85|開立|\r\nD|AB12345678|85|拿鐵|\r\n';
const b64 = s => btoa(binary(new TextEncoder().encode(s))).replace(/.{76}/g, '$&\r\n');
const mail = (inner = CSV) =>
  [
    'From: me@gmail.com',
    'To: abcdefghjk@mail.example',
    'Subject: Fwd: 消費發票明細',
    'Content-Type: multipart/mixed; boundary="xx"',
    '',
    '--xx',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    'hello',
    '--xx',
    'Content-Type: application/octet-stream; name="=?UTF-8?B?5piO57SwLmNzdg==?="',
    'Content-Disposition: attachment;',
    ' filename="detail.csv"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(inner),
    '--xx--',
    ''
  ].join('\r\n');

test('the CSV attachment of a forwarded mail is read', () => {
  const [inv] = mailInvoices(mail());
  assert.equal(inv.no, 'AB12345678');
  assert.equal(inv.total, 85);
  assert.equal(inv.items[0].name, '拿鐵');
  assert.deepEqual(mailInvoices('From: a\r\nContent-Type: text/html\r\n\r\n<p>hi</p>'), []);
});

test("Gmail's forwarding confirmation code; nobody else's", () => {
  const raw = 'From: forwarding-noreply@google.com\r\nContent-Type: text/plain\r\n\r\nConfirmation code: 123456789\r\n';
  assert.equal(gmailCode('forwarding-noreply@google.com', raw), '123456789');
  assert.equal(gmailCode('me@gmail.com', raw), '');
});

test('items: newest copy of each invoice, oldest dropped past the cap', () => {
  const items = addItems([{ no: 'AB12345678', total: 1, at: 1 }], [{ no: 'AB12345678', total: 2 }, { no: 'CD12345678', total: 3 }], 5);
  assert.deepEqual(items.map(i => [i.no, i.total, i.at]), [['AB12345678', 2, 5], ['CD12345678', 3, 5]]);
});

// A store in memory, as eco.js's deps.
const memory = () => {
  const docs = new Map();
  let n = 0;
  return {
    docs,
    fsGet: async (env, c, id) => (docs.has(`${c}/${id}`) ? { exists: true, payload: docs.get(`${c}/${id}`).payload, updateTime: docs.get(`${c}/${id}`).u } : { exists: false }),
    fsWrite: async (env, c, id, payload, pre) => {
      const had = docs.get(`${c}/${id}`);
      if (pre?.exists === false && had) throw Object.assign(new Error('x'), { precondition: true });
      if (pre?.updateTime && had?.u !== pre.updateTime) throw Object.assign(new Error('x'), { precondition: true });
      docs.set(`${c}/${id}`, { payload, u: String(++n) });
    },
    fsDelete: async (env, c, id) => docs.delete(`${c}/${id}`)
  };
};
const ask = (deps, op, method = 'GET', body = null, session = { a: 'money', d: 'pass1' }) =>
  handleMoneyMailRequest(new Request(`https://w/money-mail?op=${op}`, { method, body }), { MAIL_DOMAIN: 'mail.example' }, {}, session, deps).then(r => r.json().then(j => ({ status: r.status, ...j })));

test('a box made on first ask; mail to it lands; taken items go; unknown boxes are turned away', async () => {
  const deps = memory();
  assert.equal((await ask(deps, 'box', 'GET', null, null)).status, 401);
  const first = await ask(deps, 'box');
  assert.match(first.address, /^[a-z0-9]{10}@mail\.example$/);
  assert.equal((await ask(deps, 'box')).address, first.address);
  const box = first.address.split('@')[0];
  const message = (to, raw = mail()) => {
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    return { to, from: 'me@gmail.com', rawSize: bytes.length, raw: new Response(bytes).body, rejected: '', setReject(r) { this.rejected = r; } };
  };
  const m = message(`${box}@mail.example`);
  assert.deepEqual(await handleMoneyMail(m, {}, deps), { owner: 'pass1', added: 1 });
  const got = await ask(deps, 'box');
  assert.equal(got.items.length, 1);
  assert.equal((await ask(deps, 'took', 'POST', JSON.stringify({ upto: got.items[0].at }))).items.length, 0);
  const stranger = message('zzzzzzzzzz@mail.example');
  await handleMoneyMail(stranger, {}, deps);
  assert.equal(stranger.rejected, 'No such mailbox');
  // A new address: the old one stops.
  const next = await ask(deps, 'new', 'POST');
  assert.notEqual(next.address, first.address);
  const old = message(`${box}@mail.example`);
  await handleMoneyMail(old, {}, deps);
  assert.equal(old.rejected, 'No such mailbox');
  assert.ok(deps.docs.has(`${MAIL_COLLECTION}/box_${next.address.split('@')[0]}`));
});
