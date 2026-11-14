// /law-audio (law-audio.js): a 代表會's Drive recording passed through with its right type and the range asked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleLawAudio, audioType } from '../law-audio.js';

const ID = '1uKxYndgIxI9bTZJni3xDaROLjgMwodvd';
const drive = (status, h, body = 'abc') => async (url, init) => {
  drive.last = { url, init };
  return new Response(body, { status, headers: h });
};
const ask = (q, h = {}) => new Request(`https://api.example/law-audio?${q}`, { headers: h });

test('an .m4a Drive calls audio/mpeg goes out as audio/mp4, its range passed on', async () => {
  const f = drive(206, { 'Content-Type': 'audio/mpeg', 'Content-Disposition': `attachment; filename="${Buffer.from('115年9月23日.m4a').toString('latin1')}"`, 'Content-Range': 'bytes 0-1/36476941', 'Content-Length': '2' });
  const r = await handleLawAudio(ask(`drive=${ID}`, { Range: 'bytes=0-1', Referer: 'https://orbit.jaypengx.com/law/' }), {}, f);
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('Content-Type'), 'audio/mp4');
  assert.equal(r.headers.get('Content-Range'), 'bytes 0-1/36476941');
  assert.equal(r.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(drive.last.init.headers.Range, 'bytes=0-1');
  assert.match(drive.last.url, /id=1uKx.*confirm=t/);
});

test('not audio, a bad id, or a page not ours: turned away', async () => {
  const page = drive(200, { 'Content-Type': 'text/html' }, '<html>');
  assert.equal((await handleLawAudio(ask(`drive=${ID}`), {}, page)).status, 415);
  assert.equal((await handleLawAudio(ask('drive=../x'), {}, page)).status, 400);
  assert.equal((await handleLawAudio(ask(`drive=${ID}`, { Referer: 'https://evil.example/' }), {}, page)).status, 403);
});

test('audioType: by the file name first, else what was said when audio', () => {
  assert.equal(audioType("attachment; filename*=UTF-8''a.MP3", 'application/octet-stream'), 'audio/mpeg');
  assert.equal(audioType('', 'audio/x-m4a; x=1'), 'audio/x-m4a');
  assert.equal(audioType('attachment; filename="a.pdf"', 'application/pdf'), null);
});
