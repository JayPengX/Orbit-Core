// A new pass the way a person makes one (eco.js create, Jay 11-14: a new
// 基本 pass needs a verified email): the code mailed to an address first,
// then the pass made with it. `post`: body → the handler's { status, data }.
let n = 0;
export async function newPass(post, deps, app, addr = `p${++n}@example.com`) {
  const box = [];
  const { sendMail, mailReady } = deps;
  deps.sendMail = async (env, mail) => void box.push(mail);
  deps.mailReady = () => true;
  try {
    const start = await post({ op: 'create-start', app, addr });
    if (start.status !== 200) return start;
    return await post({ op: 'create', app, addr, code: box.at(-1)?.code });
  } finally {
    Object.assign(deps, { sendMail, mailReady });
  }
}
