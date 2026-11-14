// The Orbit Pass's recovery email in the browser (the Worker's pass-mail.js):
// the Pass sheet's 救援信箱 (added, changed, removed, each by a code mailed
// to it), the sign-in screen's 用信箱找回 (a code mailed to a linked address
// signs in; a new pass comes next, orbit.mjs freshGate), and the quiet tip
// that suggests one. Loaded when first needed (orbit.mjs mailKit).
import { errorText, ask, settingPatch } from './orbit.mjs';
import { icons, toast, h as node } from './ui.mjs';

const tr = lang => (zh, en) => (lang === 'en' ? en : zh);
const WAIT_S = 60;
const looksLikeAddr = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const mailOf = s => (s.wallet?.mail?.shown ? s.wallet.mail : null);

// Address, then the code mailed to it: one small form, in the sheet or on the
// sign-in screen (`gate`: its big fields). begin(addr) mails the code;
// finish(addr, code) uses it; sent(addr) is the line under the code.
function twoStep({ lang, gate = false, begin, finish, sent, go, addr: start = '' }) {
  const T = tr(lang);
  const error = node('p', { class: gate ? 'q-gate-error' : 'q-mail-error', role: 'alert' });
  const field = gate ? 'q-pass-input q-mail-input' : 'q-field';
  const addr = node('input', { class: field, type: 'email', name: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', placeholder: 'name@example.com', 'aria-label': T('電子郵件', 'Email'), value: start });
  const code = node('input', { class: `${field} q-mail-code num`, type: 'text', name: 'one-time-code', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]*', maxlength: '6', placeholder: '123456', 'aria-label': T('6 位數驗證碼', '6-digit code') });
  const sendBtn = node('button', { class: `q-btn primary${gate ? ' block' : ''}`, type: 'submit', text: T('寄送驗證碼', 'Send a code') });
  const okBtn = node('button', { class: `q-btn primary${gate ? ' block' : ''}`, type: 'submit', text: go });
  const again = node('button', { class: 'q-mail-link', type: 'button' });
  const other = node('button', { class: 'q-mail-link', type: 'button', text: T('換一個信箱', 'Use another address') });
  const line = node('p', { class: gate ? 'q-gate-note q-mail-sent' : 'q-mail-sent' });
  let to = '';
  let tick = 0;
  const wait = s => {
    clearInterval(tick);
    let left = s;
    const paint = () => {
      again.disabled = left > 0;
      again.textContent = left > 0 ? T(`重寄（${left}）`, `Send again (${left})`) : T('重寄', 'Send again');
      if (left-- <= 0) clearInterval(tick);
    };
    paint();
    tick = setInterval(() => (again.isConnected ? paint() : clearInterval(tick)), 1000);
  };
  const busy = (on, ...els) => els.forEach(b => (b.disabled = on));
  const stepA = node('form', { class: 'q-mail-step', method: 'post', action: '#' }, [addr, sendBtn]);
  const stepB = node('form', { class: 'q-mail-step', method: 'post', action: '#', hidden: true }, [line, code, okBtn, node('div', { class: 'q-mail-links' }, [again, other])]);
  const mail = async () => {
    const a = addr.value.trim();
    error.textContent = '';
    if (!looksLikeAddr(a)) return void (error.textContent = errorText({ code: 'ECO_MAIL_INVALID' }, lang));
    busy(true, sendBtn, again);
    try {
      await begin(a);
      to = a;
      line.textContent = sent(a);
      stepA.hidden = true;
      stepB.hidden = false;
      code.value = '';
      wait(WAIT_S);
      setTimeout(() => code.focus(), 50);
    } catch (e) {
      error.textContent = errorText(e, lang);
      if (e?.code === 'ECO_MAIL_WAIT') wait(WAIT_S);
      else again.disabled = false;
    } finally {
      sendBtn.disabled = false;
    }
  };
  const use = async () => {
    const c = code.value.replace(/\D/g, '');
    error.textContent = '';
    if (c.length !== 6) return void (error.textContent = errorText({ code: 'ECO_MAIL_CODE_WRONG' }, lang));
    busy(true, okBtn, code);
    try {
      await finish(to, c);
    } catch (e) {
      error.textContent = errorText(e, lang);
      busy(false, okBtn, code);
      code.select();
    }
  };
  stepA.addEventListener('submit', e => (e.preventDefault(), mail()));
  stepB.addEventListener('submit', e => (e.preventDefault(), use()));
  // (Six digits typed or filled in from the mail: used at once.)
  code.addEventListener('input', () => {
    code.value = code.value.replace(/\D/g, '').slice(0, 6);
    if (code.value.length === 6 && !okBtn.disabled) use();
  });
  again.addEventListener('click', mail);
  other.addEventListener('click', () => {
    clearInterval(tick);
    stepB.hidden = true;
    stepA.hidden = false;
    error.textContent = '';
    addr.focus();
  });
  const el = node('div', { class: `q-mail-form${gate ? ' q-mail-gate' : ''}` }, [stepA, stepB, error]);
  return { el, focus: () => setTimeout(() => addr.focus(), 50), stop: () => clearInterval(tick) };
}

// ---- The Pass sheet: 救援信箱 -----------------------------------------------------------

// The address (masked) with 更換 and 移除, or 加入救援信箱, in the Pass tab's
// head, box and sub (orbit.mjs mailSlot). `open`: the form shown at once
// (the tip's 加入).
export function mailRows(s, note, { head, box, sub, open = false }) {
  const lang = s.lang;
  const T = tr(lang);
  head.hidden = box.hidden = false;
  let form = null;
  const close = () => (form?.stop(), (form = null), paint());
  const openForm = () => {
    form = twoStep({
      lang,
      begin: addr => s.mailBegin(addr),
      finish: async (addr, code) => {
        await s.mailConfirm(code);
        form?.stop();
        form = null;
        note.textContent = T('已加入救援信箱。', 'Recovery email added.');
        paint();
      },
      sent: addr => T(`驗證碼已寄到 ${addr}，10 分鐘內有效。`, `A code is on its way to ${addr} (valid 10 minutes).`),
      go: T('確認', 'Confirm')
    });
    paint();
    form.focus();
  };
  const paint = () => {
    const m = mailOf(s);
    const cell = m
      ? node('div', { class: 'q-cell' }, [
          node('span', { class: 'q-cell-icon', style: '--q-cell-tint:var(--q-teal)', html: icons.mail || '' }),
          node('span', { class: 'q-cell-text' }, [node('span', { class: 'q-mail-addr', text: m.shown }), node('small', { text: T('救援信箱 · 已驗證', 'Recovery email · verified') })]),
          ...(form
            ? []
            : [
                node('button', { class: 'q-cell-act', type: 'button', text: T('更換', 'Change'), onclick: openForm }),
                node('button', {
                  class: 'q-cell-act danger',
                  type: 'button',
                  text: T('移除', 'Remove'),
                  onclick: async event => {
                    const b = event.currentTarget;
                    if (!(await ask({ lang, icon: '✉️', title: T('移除救援信箱？', 'Remove the recovery email?'), body: T('忘記通行碼時，就不能用信箱找回帳戶。', 'You won’t be able to get back in by email if you forget your pass.'), ok: T('移除', 'Remove'), danger: true }))) return;
                    b.disabled = true;
                    try {
                      await s.mailRemove();
                      note.textContent = T('已移除救援信箱。', 'Recovery email removed.');
                    } catch (e) {
                      b.disabled = false;
                      note.textContent = errorText(e, lang);
                    }
                  }
                })
              ])
        ])
      : null;
    // None yet: one row that says what it's for and adds one.
    const add = !m
      ? node('div', { class: 'q-cell' }, [
          node('span', { class: 'q-cell-icon', style: '--q-cell-tint:var(--q-teal)', html: icons.mail || '' }),
          node('span', { class: 'q-cell-text' }, [node('span', { text: T('救援信箱', 'Recovery email') }), node('small', { text: T('忘記通行碼時用來找回', 'If you forget your pass') })]),
          form ? null : node('button', { class: 'q-cell-act', type: 'button', text: T('加入', 'Add'), onclick: openForm })
        ].filter(Boolean))
      : null;
    const cancel = form ? node('button', { class: 'q-mail-link', type: 'button', text: T('取消', 'Cancel'), onclick: close }) : null;
    box.replaceChildren(...[cell, add, form?.el, cancel].filter(Boolean));
    sub.hidden = Boolean(m);
  };
  paint();
  s.on('wallet', () => box.isConnected && !form && paint());
  if (open) {
    openForm();
    setTimeout(() => (head.isConnected ? head : box).scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 300);
  }
}

// ---- The sign-in screen: 用信箱找回 -------------------------------------------------------

// The panel that takes the sign-in form's place: an address, then the code.
// done(res): signed in (res.fresh: a new pass comes next); back(): the form again.
export function recoverPanel(s, { done, back }) {
  const lang = s.lang;
  const T = tr(lang);
  const form = twoStep({
    lang,
    gate: true,
    begin: addr => s.mailRecoverBegin(addr),
    finish: async (addr, code) => done(await s.mailRecover(addr, code)),
    sent: addr => T(`如果 ${addr} 是 Orbit Pass 的救援信箱，驗證碼已經寄出，10 分鐘內有效。`, `If ${addr} is an Orbit Pass recovery email, a code is on its way (valid 10 minutes).`),
    go: T('登入', 'Sign in')
  });
  const el = node('div', { class: 'q-gate-form q-mail-recover' }, [
    node('p', { class: 'q-gate-label', text: T('用救援信箱找回帳戶', 'Get back in with your recovery email') }),
    form.el,
    node('button', { class: 'q-mail-link', type: 'button', text: T('返回用通行碼登入', 'Back to signing in with a pass'), onclick: () => (form.stop(), back()) })
  ]);
  return { el, focus: form.focus };
}

// ---- The tip: 加入救援信箱 -----------------------------------------------------------------
//
// Signed in with no recovery email: now and then (every 3 days at most on a
// device, never the open the passkey tip showed), a brief quiet tip from the
// top (orbit.mjs quietTip, the family's one nudge). 加入 opens the Pass
// sheet on 救援信箱; 不再顯示 stops it on every device (setting `mailAsk`).
export const MAIL_TIP_KEY = 'orbit.mailtip.at';
export const MAIL_TIP_EVERY = 3 * 86_400_000;
export function mailTipDue(s, { last = 0, now = Date.now() } = {}) {
  return Boolean(s.wallet) && !mailOf(s) && s.wallet.settings?.mailAsk?.value !== 'never' && !(now - last < MAIL_TIP_EVERY);
}
export function mailTip(s, { quietTip, accent, openSheet, readStore, writeStore }) {
  const T = tr(s.lang);
  let last = 0;
  try {
    last = Number(readStore(MAIL_TIP_KEY)) || 0;
  } catch {}
  if (!quietTip || !mailTipDue(s, { last })) return false;
  const shown = quietTip({
    accent,
    mark: node('span', { class: 'q-tip-mark', html: icons.mail || '' }),
    label: T('救援信箱', 'Recovery email'),
    title: T('加入救援信箱', 'Add a recovery email'),
    line: T('忘記通行碼時，用信箱就能找回帳戶。', 'Forget your pass? Get back in by email.'),
    go: T('加入', 'Add'),
    never: T('不再顯示', 'Don’t show again'),
    onGo: () => openSheet(),
    onNever: () => {
      s.write({ wallet: settingPatch('mailAsk', 'never') }).catch(() => {});
      toast(T('不會再提醒；可在 Orbit Pass › 救援信箱加入。', 'No more tips: add one any time in Orbit Pass › Recovery email.'));
    }
  });
  if (!shown) return false;
  try {
    writeStore(MAIL_TIP_KEY, String(Date.now()));
  } catch {}
  return true;
}
