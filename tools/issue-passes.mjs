// Quadra Passes to hand out yourself (nobody can make one in an app any more).
//
//   node tools/issue-passes.mjs [count]        (300 by default)
//
// The first time, it makes your admin token: a random one, kept only on this
// computer (Desktop/Quadra 管理金鑰.txt, readable by you alone; the admin
// page, Shared-Proxy/admin/, takes it too), put on GitHub as the
// secret ECO_ADMIN_TOKEN, and deployed to the eco Worker (it waits for that).
// Then it asks the Worker for the passes, 100 at a time, and writes them to
// ~/Documents/Quadra Passes <date>.txt as they come: nothing goes in a repo,
// and the codes aren't printed here. Each pass is new, with no one signed in
// on it; whoever signs in with it first has it.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ECO_URL = 'https://orbit-workers-proxy.pengzjay.workers.dev/eco';
const REPO = 'JayPengX/Shared-Proxy';
const count = Math.max(1, Math.floor(Number(process.argv[2]) || 300));
const tokenFile = join(homedir(), 'Desktop', 'Quadra 管理金鑰.txt');
const sh = (cmd, args, input) => execFileSync(cmd, args, { input, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'inherit'] }).toString().trim();

let token = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim().split('\n')[0].trim() : '';
if (!token) {
  token = randomBytes(36).toString('base64url');
  writeFileSync(tokenFile, token, { mode: 0o600 });
  console.log(`Your admin token is in ${tokenFile} (only you can read it).`);
  sh('gh', ['secret', 'set', 'ECO_ADMIN_TOKEN', '-R', REPO], token);
  console.log('Put on GitHub as ECO_ADMIN_TOKEN; deploying it to the Worker…');
  sh('gh', ['workflow', 'run', 'deploy.yml', '-R', REPO]);
  await new Promise(r => setTimeout(r, 8000));
  const id = sh('gh', ['run', 'list', '-R', REPO, '-w', 'deploy.yml', '-L', '1', '--json', 'databaseId', '-q', '.[0].databaseId']);
  sh('gh', ['run', 'watch', id, '-R', REPO, '--exit-status']);
  console.log('Deployed.');
}

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '');
const out = join(homedir(), 'Documents', `Quadra Passes ${stamp}.txt`);
writeFileSync(out, `Quadra Passes, made ${new Date().toLocaleString('zh-TW')}\n\n`, { mode: 0o600 });
let made = 0;
while (made < count) {
  const ask = Math.min(100, count - made);
  const res = await fetch(ECO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://jaypengx.github.io' },
    body: JSON.stringify({ op: 'admin', token, action: 'issue', count: ask })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(data.passes)) {
    console.error(`Stopped after ${made}: the Worker answered ${res.status} ${JSON.stringify(data).slice(0, 160)}`);
    if (res.status === 403) console.error('(403: the token isn’t on the Worker yet; wait a minute for the deploy and run this again.)');
    process.exit(1);
  }
  appendFileSync(out, data.passes.map((p, i) => `${String(made + i + 1).padStart(3, ' ')}. ${p.slice(0, 5)}-${p.slice(5)}`).join('\n') + '\n');
  made += data.passes.length;
  console.log(`${made} / ${count}`);
}
console.log(`Done: ${made} passes in ${out}`);
