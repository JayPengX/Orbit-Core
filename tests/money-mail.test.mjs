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

// 財政部's own mail: the check of a new address, as Big5 HTML.
test("財政部's check of the address: its link and subject kept for the app; invoices mark the box received", async () => {
  const raw = [
    'From: =?UTF-8?B?6LKh5pS/6YOo?= <einvoice@einvoice.nat.gov.tw>',
    'Subject: =?UTF-8?B?6Zu75a2Q5L+h566x6amX6K2J?=',
    'Content-Type: multipart/alternative; boundary="b1"',
    '',
    '--b1',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    '<img src=3D"https://www.einvoice.nat.gov.tw/static/logo.png"><a href=3D"https://www.einvoice.nat.gov.tw/portal/verify?token=3Dabc&amp;id=3D9">=E9=A9=97=E8=AD=89</a>',
    '--b1--',
    ''
  ].join('\r\n');
  const { einvoiceNote } = await import('../money-mail.js');
  const note = einvoiceNote('einvoice@einvoice.nat.gov.tw', raw);
  assert.equal(note.subject, '電子信箱驗證');
  assert.equal(note.link, 'https://www.einvoice.nat.gov.tw/portal/verify?token=abc&id=9');
  assert.equal(einvoiceNote('me@gmail.com', raw), null);

  const deps = memory();
  const box = (await ask(deps, 'box')).address.split('@')[0];
  const message = (raw, from) => {
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    return { to: `${box}@mail.example`, from, rawSize: bytes.length, raw: new Response(bytes).body, setReject() {} };
  };
  await handleMoneyMail(message(raw, 'einvoice@einvoice.nat.gov.tw'), {}, deps);
  let r = await ask(deps, 'box');
  assert.equal(r.note.link, note.link);
  assert.equal(r.got, null);
  await handleMoneyMail(message(mail(), 'einvoice@einvoice.nat.gov.tw'), {}, deps);
  r = await ask(deps, 'box');
  assert.equal(r.got.n, 1);
  // A new address starts over.
  r = await ask(deps, 'new', 'POST');
  r = await ask(deps, 'box');
  assert.equal(r.got, null);
  assert.equal(r.note, null);
});

test("財政部's mail is copied on to the person's own inbox: same subject, words and files, from our domain", async () => {
  const { mailCopy, fwdOk } = await import('../money-mail.js');
  const raw = mail().replace('From: me@gmail.com', 'From: einvoice@einvoice.nat.gov.tw');
  const c = mailCopy(raw, '財政部 <einvoice@einvoice.nat.gov.tw>', 'me@gmail.com', 'mail.example');
  assert.equal(c.from.email, 'money@mail.example');
  assert.equal(c.from.name, 'Orbit Money');
  assert.equal(c.replyTo, 'einvoice@einvoice.nat.gov.tw');
  assert.equal(c.subject, '[轉寄] Fwd: 消費發票明細');
  assert.match(c.text, /^Orbit Money 幫你轉寄：einvoice@einvoice\.nat\.gov\.tw/);
  assert.match(c.text, /hello/);
  assert.equal(c.attachments.length, 1);
  assert.equal(c.attachments[0].filename, 'detail.csv');
  assert.match(new TextDecoder().decode(c.attachments[0].content), /AB12345678/);
  assert.ok(fwdOk('me@gmail.com', { MAIL_DOMAIN: 'mail.example' }));
  assert.ok(!fwdOk('abcdefghjk@mail.example', { MAIL_DOMAIN: 'mail.example' }));
  assert.ok(!fwdOk('nope', { MAIL_DOMAIN: 'mail.example' }));

  const deps = memory();
  const box = (await ask(deps, 'box')).address.split('@')[0];
  assert.equal((await ask(deps, 'fwd', 'POST', JSON.stringify({ to: `${box}@mail.example` }))).status, 400);
  assert.equal((await ask(deps, 'fwd', 'POST', JSON.stringify({ to: 'me@gmail.com' }))).fwd, 'me@gmail.com');
  const sent = [];
  const env = { MAIL_DOMAIN: 'mail.example', EMAIL: { send: async m => (sent.push(m), { messageId: 'x' }) } };
  const message = (from, r) => {
    const bytes = Uint8Array.from(r, ch => ch.charCodeAt(0));
    return { to: `${box}@mail.example`, from, rawSize: bytes.length, raw: new Response(bytes).body, setReject() {} };
  };
  await handleMoneyMail(message('einvoice@einvoice.nat.gov.tw', raw), env, deps);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'me@gmail.com');
  // Nobody else's mail is copied (a stranger can't use the box to reach the inbox).
  await handleMoneyMail(message('someone@else.com', mail()), env, deps);
  assert.equal(sent.length, 1);
  // A failed send is noted for the app; the invoices still land.
  env.EMAIL.send = async () => { throw Object.assign(new Error('x'), { code: 'E_SENDER_NOT_VERIFIED' }); };
  await handleMoneyMail(message('einvoice@einvoice.nat.gov.tw', raw), env, deps);
  const r = await ask(deps, 'box');
  assert.equal(r.sent.ok, false);
  assert.equal(r.sent.code, 'E_SENDER_NOT_VERIFIED');
  assert.equal(r.fwd, 'me@gmail.com');
});
