// How Orbit's emails look: one renderer, so the admin panel's preview is the
// mail that's sent (Jay 2026-11-14: "use our domain to send email … presets
// or format so sending is easy and look fancy"). The Worker renders from the
// same fields before it sends (eco-admin.js `mail-send`, importing this
// file; here, not in the kit, as no app sends mail); the alert mails are
// `alertMail` (mail-alerts.js).
//
// Mail clients keep only the oldest HTML: tables, inline styles, no scripts,
// a picture by its https address. Every look is one 600 px column that
// shrinks on a phone, with a plain-text copy beside it.
//
//   mailRender({ look, lang, accent, subject, headline, body, button, link, code, sign, from })
//     → { subject, html, text }
//   body: plain words; a blank line starts a paragraph, "- " a point,
//   **bold**, and an https address becomes a link. In 更新 (digest) each
//   "- 標題：說明" point is a card.

import { BRANDS, FAMILY } from '#kit/brand.mjs';
import { DOMAIN } from '#kit/domain.mjs';

const SITE = `https://orbit.${DOMAIN}`;
const LOGO = `${SITE}/app/icons/apple-touch-icon.png`;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Noto Sans TC','Microsoft JhengHei',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Songti TC','Noto Serif TC','PMingLiU',serif";

// The colours a mail can wear: Orbit's indigo and each app's own (kit/brand.mjs).
export const MAIL_ACCENTS = [
  { id: 'orbit', zh: 'Orbit', en: 'Orbit', color: '#4f46e5', ink: '#3730a3', to: FAMILY.from },
  // (An app wearing Orbit's own colour, Law, is left out: two of one swatch.)
  ...Object.entries(BRANDS).filter(([, b]) => b.color !== '#4f46e5').map(([id, b]) => ({ id, zh: b.short, en: b.short, color: b.color, ink: b.ink, to: b.to })),
  { id: 'night', zh: '夜色', en: 'Night', color: '#334155', ink: '#0f172a', to: '#020617' }
];
const accentOf = id => MAIL_ACCENTS.find(a => a.id === id) || MAIL_ACCENTS[0];

// The looks: what each is for, the fields it shows, and words to start from.
export const MAIL_LOOKS = {
  announce: {
    zh: '公告',
    en: 'Announcement',
    about: { zh: '大標題的彩色橫幅，一顆按鈕', en: 'A bold coloured banner and one button' },
    fields: ['headline', 'body', 'button'],
    sample: {
      zh: { subject: 'Orbit 有新功能了', headline: '一個 App，所有 Orbit', body: '從今天起，所有 Orbit App 都在同一個 App 裡：一次登入，下面的分頁就能切換。\n\n- 行程和計時會跟著你換 App\n- 每個 App 都記得你停在哪裡\n\n加到主畫面，就像一般的 App。', button: '打開 Orbit', link: `${SITE}/app/` },
      en: { subject: 'Something new in Orbit', headline: 'Every Orbit app, in one', body: 'From today every Orbit app lives in one app: sign in once and switch with the tabs at the bottom.\n\n- Trips and timers follow you between apps\n- Each app remembers where you left it\n\nAdd it to your home screen like any app.', button: 'Open Orbit', link: `${SITE}/app/` }
    }
  },
  note: {
    zh: '短信',
    en: 'Personal note',
    about: { zh: '像一封親手寫的信，沒有橫幅', en: 'Like a handwritten letter, no banner' },
    fields: ['headline', 'body', 'sign'],
    sample: {
      zh: { subject: '謝謝你試用 Orbit', headline: '嗨，', body: '謝謝你這幾天幫我試 Orbit。你回報的問題我都修好了，有空再打開看看。\n\n有任何想法，直接回這封信就好。', sign: 'Jay' },
      en: { subject: 'Thanks for trying Orbit', headline: 'Hi,', body: 'Thank you for testing Orbit these past few days. Everything you reported is fixed, so have another look when you can.\n\nAny thoughts, just reply to this mail.', sign: 'Jay' }
    }
  },
  digest: {
    zh: '更新',
    en: 'Update digest',
    about: { zh: '這陣子的更新，一則一張卡片', en: 'Recent changes, one card each' },
    fields: ['headline', 'body', 'button'],
    sample: {
      zh: { subject: 'Orbit 這週的更新', headline: '這週的 Orbit', body: '這週改了這些：\n\n- Transit：公車到站更準，誤點直接標出來\n- Weather：接下來兩小時的雨，幾點下、幾點停\n- News：同一則新聞，各家怎麼報一眼看懂', button: '看看新的 Orbit', link: `${SITE}/app/` },
      en: { subject: 'Orbit this week', headline: 'This week in Orbit', body: 'What changed this week:\n\n- Transit: bus arrivals are closer, delays marked\n- Weather: the next two hours of rain, when it starts and stops\n- News: one story as every outlet tells it', button: 'See what’s new', link: `${SITE}/app/` }
    }
  },
  invite: {
    zh: '邀請',
    en: 'Invitation',
    about: { zh: '邀請加入，附 Orbit Pass', en: 'An invitation, with an Orbit Pass' },
    fields: ['headline', 'body', 'code', 'button'],
    sample: {
      zh: { subject: '邀請你加入 Orbit', headline: '邀請你加入 Orbit', body: '公車、天氣、課表、記帳、新聞，每天用得到的 App 都在這裡，一組通行碼全部通用。', code: '', button: '開始使用', link: `${SITE}/app/` },
      en: { subject: 'You’re invited to Orbit', headline: 'You’re invited to Orbit', body: 'Buses, weather, classes, money and news: the apps you use every day, one pass for all of them.', code: '', button: 'Get started', link: `${SITE}/app/` }
    }
  },
  thanks: {
    zh: '感謝',
    en: 'Thank you',
    about: { zh: '置中的大字，溫暖的底色', en: 'Big centred words on a warm card' },
    fields: ['headline', 'body', 'sign'],
    sample: {
      zh: { subject: '謝謝你', headline: '謝謝你！', body: '因為有你的回饋，Orbit 每天都變得更好一點。', sign: 'Jay 與 Orbit' },
      en: { subject: 'Thank you', headline: 'Thank you!', body: 'Your feedback makes Orbit a little better every day.', sign: 'Jay and Orbit' }
    }
  }
};

const WORDS = {
  zh: { sent: `寄自 ${DOMAIN}`, why: '你會收到這封信，是因為寄件人把你的信箱加進了收件人。', pass: '你的 Orbit Pass', alerts: 'Orbit 管理警示', open: '打開管理面板', allOk: '全部恢復正常', fixed: '已恢復', still: '還沒好', settings: '在管理面板 › 工具 › 郵件 可以關掉或改信箱。' },
  en: { sent: `Sent from ${DOMAIN}`, why: 'You got this because the sender added your address.', pass: 'Your Orbit Pass', alerts: 'Orbit admin alerts', open: 'Open the admin panel', allOk: 'All clear', fixed: 'Recovered', still: 'Still on', settings: 'Turn these off or change the address in admin › 工具 › 郵件.' }
};

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// A line's own markup, escaped first: **bold** and https links.
function inline(s, color) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/https:\/\/[^\s<]+[^\s<.,，。)）]/g, u => `<a href="${u}" style="color:${color};text-decoration:underline">${u}</a>`);
}
// Plain words → blocks: [{ p: [lines] } | { list: [items] }].
export function blocksOf(body) {
  const out = [];
  for (const chunk of String(body || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map(l => l.trimEnd()).filter(l => l.trim());
    if (!lines.length) continue;
    let para = [];
    let list = null;
    const flush = () => {
      if (para.length) out.push({ p: para });
      if (list) out.push({ list });
      para = [];
      list = null;
    };
    for (const l of lines) {
      const m = /^\s*[-•・*]\s+(.*)$/.exec(l);
      if (m) {
        if (para.length) (out.push({ p: para }), (para = []));
        (list ||= []).push(m[1]);
      } else {
        if (list) (out.push({ list }), (list = null));
        para.push(l.trim());
      }
    }
    flush();
  }
  return out;
}
// A digest point's title and words ("標題：說明", "Title: words").
const splitItem = s => {
  const m = /^(.{1,40}?)[：:]\s*(.+)$/.exec(s);
  return m ? [m[1], m[2]] : ['', s];
};

const P = (html, style = '') => `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;${style}">${html}</p>`;
function bodyHtml(blocks, a, { look, font = FONT, color = '#1f2937' } = {}) {
  return blocks
    .map((b, i) => {
      if (b.p) return P(b.p.map(l => inline(l, a.ink)).join('<br>'), `font-family:${font};color:${color}`);
      if (look === 'digest')
        return b.list
          .map((it, n) => {
            const [t, w] = splitItem(it);
            return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;border-collapse:separate"><tr><td width="36" valign="top" style="padding:14px 0 14px 14px;background:#f6f7fb;border-radius:14px 0 0 14px"><div style="width:26px;height:26px;border-radius:13px;background:${a.color};color:#fff;font:700 13px/26px ${FONT};text-align:center">${n + 1}</div></td><td style="padding:14px 16px 14px 12px;background:#f6f7fb;border-radius:0 14px 14px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:#1f2937">${t ? `<strong style="color:#0f172a">${inline(t, a.ink)}</strong><br>` : ''}${inline(w, a.ink)}</td></tr></table>`;
          })
          .join('') + (i < blocks.length - 1 ? '<div style="height:6px"></div>' : '');
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${b.list.map(it => `<tr><td valign="top" style="padding:0 10px 8px 2px"><div style="width:7px;height:7px;border-radius:4px;background:${a.color};margin-top:10px"></div></td><td style="padding:0 0 8px;font-family:${font};font-size:16px;line-height:1.7;color:${color}">${inline(it, a.ink)}</td></tr>`).join('')}</table>`;
    })
    .join('');
}
const button = (label, link, a, center = false) =>
  label && /^https:\/\//.test(link || '')
    ? `<table role="presentation" cellpadding="0" cellspacing="0" ${center ? 'align="center" ' : ''}style="margin:8px ${center ? 'auto' : '0'} 6px"><tr><td style="border-radius:999px;background:${a.ink}" bgcolor="${a.ink}"><a href="${esc(link)}" style="display:inline-block;padding:13px 26px;font:600 15px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)} →</a></td></tr></table>`
    : '';
const brandRow = (dark = true) =>
  `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:10px"><img src="${LOGO}" width="32" height="32" alt="" style="display:block;border:0;border-radius:9px"></td><td style="font:700 17px/1 ${FONT};letter-spacing:.2px;color:${dark ? '#ffffff' : '#0f172a'}">Orbit</td></tr></table>`;
// The page around a look: the grey ground, the card, the footer.
function frame({ lang, preheader, inner, foot }) {
  return `<!doctype html><html lang="${lang === 'en' ? 'en' : 'zh-Hant'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title></title><style>@media (max-width:620px){.q-pad{padding-left:22px!important;padding-right:22px!important}.q-h1{font-size:26px!important}}a{color:inherit}</style></head><body style="margin:0;padding:0;background:#eef0f7;-webkit-text-size-adjust:100%"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef0f7" style="background:#eef0f7"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e3e6f0">${inner}</table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td align="center" style="padding:18px 20px 6px;font:12px/1.6 ${FONT};color:#8a90a6">${foot}</td></tr></table></td></tr></table></body></html>`;
}
const band = (a, html, pad = '30px 36px 34px') => `<tr><td class="q-pad" bgcolor="${a.color}" style="padding:${pad};background:${a.color};background-image:linear-gradient(135deg,${a.color} 0%,${a.to} 100%)">${html}</td></tr>`;
const cell = (html, pad = '30px 36px 28px') => `<tr><td class="q-pad" style="padding:${pad}">${html}</td></tr>`;
const eyebrow = (s, color) => `<div style="font:700 12px/1 ${FONT};letter-spacing:1.6px;text-transform:uppercase;color:${color};margin:0 0 12px">${esc(s)}</div>`;
const h1 = (s, color, extra = '') => `<h1 class="q-h1" style="margin:0;font:800 30px/1.25 ${FONT};letter-spacing:-.3px;color:${color};${extra}">${esc(s)}</h1>`;

// Plain words of the same mail (every client shows one or the other).
function textOf({ headline, blocks, button: label, link, code, sign, foot }) {
  const out = [];
  if (headline) out.push(headline, '');
  for (const b of blocks) out.push(...(b.p ? b.p : b.list.map(i => `• ${i}`)), '');
  if (code) out.push(code, '');
  if (label && link) out.push(`${label}: ${link}`, '');
  if (sign) out.push(`— ${sign}`, '');
  out.push('--', foot);
  return out.join('\n').replace(/\*\*(.+?)\*\*/g, '$1');
}

export function mailRender(input = {}) {
  const look = MAIL_LOOKS[input.look] ? input.look : 'announce';
  const lang = input.lang === 'en' ? 'en' : 'zh';
  const W = WORDS[lang];
  const a = accentOf(input.accent);
  const headline = String(input.headline || '').trim();
  const blocks = blocksOf(input.body);
  const sign = String(input.sign || '').trim();
  const code = String(input.code || '').trim();
  const subject = String(input.subject || headline || MAIL_LOOKS[look][lang]).trim().slice(0, 200);
  const first = blocks.find(b => b.p)?.p.join(' ') || '';
  const foot = `${W.sent} · ${W.why}`;
  let inner;
  if (look === 'note') {
    inner =
      `<tr><td style="height:5px;background:${a.color};background-image:linear-gradient(90deg,${a.color},${a.to})"></td></tr>` +
      cell(`${brandRow(false)}<div style="height:26px"></div>${headline ? P(esc(headline), `font-family:${SERIF};font-size:19px;color:#0f172a`) : ''}${bodyHtml(blocks, a, { font: SERIF, color: '#27303f' })}${sign ? `<p style="margin:26px 0 0;font:italic 20px/1.4 ${SERIF};color:${a.ink}">— ${esc(sign)}</p>` : ''}`, '30px 40px 36px');
  } else if (look === 'thanks') {
    inner =
      band(a, `<div align="center">${brandRow()}</div>`, '22px 36px') +
      cell(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:30px 24px;background:#fff7ed;border-radius:18px"><div style="font:400 44px/1 ${FONT};color:${a.color};margin:0 0 10px">♥</div>${h1(headline, '#0f172a', 'text-align:center')}<div style="height:14px"></div>${bodyHtml(blocks, a).replace(/<p style="/g, '<p style="text-align:center;')}${sign ? `<p style="margin:6px 0 0;font:600 15px/1.4 ${FONT};color:${a.ink};text-align:center">— ${esc(sign)}</p>` : ''}</td></tr></table>`);
  } else {
    const kind = { announce: lang === 'en' ? 'Announcement' : '公告', digest: lang === 'en' ? 'Update' : '更新', invite: lang === 'en' ? 'Invitation' : '邀請' }[look];
    const codeBox = code ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td align="center" style="padding:18px;border:2px dashed ${a.color};border-radius:16px;background:#f8f9ff"><div style="font:600 12px/1 ${FONT};letter-spacing:1px;color:#6b7280;margin:0 0 10px">${esc(W.pass)}</div><div style="font:700 26px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:3px;color:#0f172a">${esc(code)}</div></td></tr></table>` : '';
    inner = band(a, `${brandRow()}<div style="height:30px"></div>${eyebrow(kind, 'rgba(255,255,255,.78)')}${h1(headline || subject, '#ffffff')}`) + cell(`${bodyHtml(blocks, a, { look })}${look === 'invite' ? codeBox : ''}${button(input.button, input.link, a, look === 'invite')}`);
  }
  return {
    subject,
    html: frame({ lang, preheader: first.slice(0, 120), inner, foot: esc(foot) }),
    text: textOf({ headline, blocks, button: input.button, link: input.link, code, sign, foot })
  };
}

// ---- The admin panel's alerts (mail-alerts.js) ----
const TONE = { bad: { dot: '#dc2626', bg: '#fef2f2', zh: '要處理', en: 'Needs you' }, warn: { dot: '#d97706', bg: '#fffbeb', zh: '注意', en: 'Heads-up' }, ok: { dot: '#16a34a', bg: '#f0fdf4', zh: '已恢復', en: 'Recovered' } };
// issues: [{ tone: 'bad'|'warn', title, detail, go, again }], fixed: [{ title }].
export function alertMail({ issues = [], fixed = [], admin = `${SITE}/Orbit-Core/admin/`, lang = 'zh', test = false } = {}) {
  const W = WORDS[lang === 'en' ? 'en' : 'zh'];
  const zh = lang !== 'en';
  const bad = issues.filter(i => i.tone === 'bad').length;
  const tone = bad ? 'bad' : issues.length ? 'warn' : 'ok';
  const a = { color: { bad: '#b91c1c', warn: '#b45309', ok: '#15803d' }[tone], to: '#0f172a', ink: '#1e293b' };
  const names = issues.map(i => i.title);
  const subject = test
    ? zh ? 'Orbit 警示信：測試' : 'Orbit alerts: a test'
    : issues.length
      ? `Orbit${zh ? '：' : ': '}${names.slice(0, 2).join(zh ? '、' : ', ')}${names.length > 2 ? (zh ? ` 等 ${names.length} 項` : ` and ${names.length - 2} more`) : ''}`
      : zh ? 'Orbit：全部恢復正常' : 'Orbit: all clear';
  const head = test ? (zh ? '警示信會寄到這裡' : 'Alerts arrive here') : issues.length ? (zh ? `${issues.length} 件事要注意` : `${issues.length} thing${issues.length > 1 ? 's' : ''} to look at`) : W.allOk;
  const row = (t, i) => {
    const T = TONE[t];
    const link = i.go ? `${admin}#${i.go}` : admin;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;border-collapse:separate"><tr><td width="6" style="background:${T.dot};border-radius:12px 0 0 12px"></td><td style="padding:14px 16px;background:${T.bg};border-radius:0 12px 12px 0;font-family:${FONT}"><div style="font:700 11px/1 ${FONT};letter-spacing:.8px;color:${T.dot};margin:0 0 6px">${esc(zh ? (i.again ? W.still : T.zh) : i.again ? W.still : T.en)}</div><a href="${esc(link)}" style="font:700 16px/1.4 ${FONT};color:#0f172a;text-decoration:none">${esc(i.title)}</a>${i.detail ? `<div style="font:14px/1.6 ${FONT};color:#475569;margin-top:4px">${esc(i.detail)}</div>` : ''}</td></tr></table>`;
  };
  const list = issues.map(i => row(i.tone, i)).join('') + fixed.map(i => row('ok', i)).join('');
  const testWords = zh ? '這是一封測試信。之後管理面板有要你知道的事（帳單或額度暴衝、排程一直失敗、外部來源壞掉、錯誤變多、AI 餘額快沒了），就會寄到這個信箱；同一件事一天最多寄一次，半夜先存著，早上 7 點一起寄。' : 'This is a test. From now on, whatever the admin panel needs you to know (a bill or quota spike, a job that keeps failing, a source that broke, errors piling up, AI money running low) comes to this address; the same thing at most once a day, and night-time news waits for 7 AM.';
  const inner =
    band(a, `${brandRow()}<div style="height:26px"></div>${eyebrow(W.alerts, 'rgba(255,255,255,.8)')}${h1(head, '#ffffff', 'font-size:26px')}`, '26px 32px 30px') +
    cell(`${test ? P(esc(testWords), `font-family:${FONT};color:#1f2937`) : ''}${list}${button(W.open, admin, a)}`, '24px 32px 28px');
  const text = [head, '', ...(test ? [testWords, ''] : []), ...issues.map(i => `${i.tone === 'bad' ? '●' : '○'} ${i.title}${i.detail ? ` — ${i.detail}` : ''}`), ...fixed.map(i => `✓ ${i.title} (${W.fixed})`), '', `${W.open}: ${admin}`, '', '--', `${W.sent} · ${W.settings}`].join('\n');
  return { subject, html: frame({ lang, preheader: issues.map(i => i.title).join(' · ') || head, inner, foot: `${esc(W.sent)} · ${esc(W.settings)}` }), text };
}
