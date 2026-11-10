// ---- kit/ai.mjs: the family's AI on a phone, one way in every app ----
// The proxy's AI door (ai.js) by feature name, and the pieces every AI tap
// is drawn with, so 用說的記帳, 問我的帳, 檢查我的句子… look and behave alike:
//
//   aiCall(feature, input, { answers })   one ask: { out, ask, left } | { error, left? }
//   aiFlow(host, { feature, input, lists }) the whole exchange in `host`: a
//       thinking line, then the AI's question back (Jay 11-10) as chips to
//       tap (one of the person's own lists: its likeliest few, 其他 opens the
//       whole list; any question: 自己打 to answer in words), asked again
//       with the answers, until it answers → { out } | { error }
//   aiBar({ placeholder, onSend })        the box to type or dictate into, with its send button
//   pickList(items, { title, current })   the person's own list as a sheet (a search past 8) → id | null
//   picker(items, { value, onChange })    a field's value as a button that opens pickList (review rows)
//   askBox(ask, { lists })                a question with chips, AI's or code's own → { box, answer }
//   aiNote(text)                          the quiet line under what AI wrote ("AI 整理，送出前可以改")
//   aiSays(error, left)                   why an ask was turned away, in words
//
// Code first: an app parses what it can itself and calls these only for the rest.
import { h, sheet, search, cell, icons } from './ui.mjs';
import { workerJson } from './orbit.mjs';
import { W } from './lang.mjs';

export async function aiCall(feature, input, { answers = [], timeout = 40_000 } = {}) {
  const r = await workerJson('/ai', 'v=1', { body: JSON.stringify({ feature, input: { ...input, answers } }), timeout, errors: true });
  return r || { error: 'offline' };
}

// A picture for the AI (a photo, a screenshot): drawn upright at most `side`
// pixels on its long edge, as a JPEG: { mime_type, data } (base64), or null
// when it can't be drawn (a HEIC outside Safari, a PDF).
export async function aiPicture(file, { side = 1600, quality = 0.85 } = {}) {
  try {
    const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, side / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { mime_type: 'image/jpeg', data: c.toDataURL('image/jpeg', quality).split(',')[1] };
  } catch {
    return null;
  }
}
// A picture picked from the camera or the photos: the File, or null when
// none was (the sheet closed). One hidden input, made once.
let fileInput = null;
export function pickPicture({ camera = false } = {}) {
  return new Promise(resolve => {
    fileInput?.remove();
    fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true, ...(camera ? { capture: 'environment' } : {}) });
    fileInput.addEventListener('change', () => resolve(fileInput.files?.[0] || null), { once: true });
    fileInput.addEventListener('cancel', () => resolve(null), { once: true });
    document.body.append(fileInput);
    fileInput.click();
  });
}

export function aiSays(error, left = null) {
  if (error === 'cap') return W('今天這個 AI 的次數用完了，明天再試。', 'That’s all of this AI for today. Try again tomorrow.');
  if (error === 'signin') return W('登入 Orbit Pass 後才能用 AI。', 'Sign in with your Orbit Pass to use AI.');
  if (error === 'busy') return W('有點太快了，等幾秒再試。', 'A little fast. Try again in a few seconds.');
  if (error === 'paused') return W('AI 暫停中，稍後再試。', 'AI is paused for now. Try again later.');
  if (error === 'offline') return W('連不上網路，等一下再試。', 'You’re offline. Try again in a moment.');
  return W('AI 現在沒有回應，再試一次。', 'AI didn’t answer. Try again.') + (left != null && left <= 3 ? W(`（今天還剩 ${left} 次）`, ` (${left} left today)`) : '');
}

// The mark that says AI wrote or asks something: the kit's spark.
const mark = () => h('span', { class: 'q-ai-mark', 'aria-hidden': 'true', html: icons.spark });

export const aiNote = (text = W('AI 整理，存之前都可以改', 'Sorted by AI: change anything before saving')) => h('p', { class: 'q-ai-note' }, [mark(), h('span', { text })]);

// A thinking line: the spark breathing beside what it's doing.
export const aiThinking = (text = W('想一下…', 'Thinking…')) => h('div', { class: 'q-ai-think', role: 'status' }, [mark(), h('span', { text })]);

// The box to type or dictate into (the keyboard's own mic dictates): grows
// with what's written, Enter or the arrow sends (Shift+Enter: a new line).
export function aiBar({ placeholder = '', onSend = () => {}, value = '', label = placeholder, max = 400 } = {}) {
  const input = h('textarea', { rows: '1', placeholder, 'aria-label': label, maxlength: String(max), enterkeyhint: 'send', autocomplete: 'off' });
  input.value = value;
  const send = h('button', { type: 'button', class: 'q-ai-send', 'aria-label': W('送出', 'Send'), html: icons.send });
  const fit = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
    send.disabled = !input.value.trim();
  };
  const go = () => {
    const t = input.value.trim();
    if (!t || box.classList.contains('busy')) return;
    onSend(t);
  };
  input.addEventListener('input', fit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      go();
    }
  });
  send.addEventListener('click', go);
  const box = h('div', { class: 'q-ai-bar' }, [mark(), input, send]);
  requestAnimationFrame(fit);
  return Object.assign(box, {
    input,
    clear: () => ((input.value = ''), fit()),
    busy: on => (box.classList.toggle('busy', !!on), (input.readOnly = !!on))
  });
}

// The person's own list as a sheet: every item a row, a search past 8,
// the one in use ticked. → its id, or null when closed.
export function pickList(items, { title = W('選一個', 'Choose'), current = '' } = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const rows = h('div', { class: 'q-list q-pick-list' });
    const draw = (q = '') => {
      const k = q.trim().toLowerCase();
      const shown = items.filter(it => !k || String(it.name).toLowerCase().includes(k));
      rows.replaceChildren(
        ...(shown.length
          ? shown.map(it => cell({ icon: it.lead || null, tint: it.tint || '', title: it.name, sub: it.sub || '', onClick: () => (finish(it.id), s.close()), trailing: it.id === current ? h('span', { class: 'q-pick-on', 'aria-hidden': 'true', html: icons.check }) : null }))
          : [h('p', { class: 'q-list-foot', text: W('沒有符合的', 'Nothing matches') })])
      );
    };
    draw();
    const s = sheet({ title, detent: items.length > 8 ? 'large' : 'medium', body: [items.length > 8 ? search({ onInput: draw }) : null, rows], onClose: () => finish(null) });
  });
}

// A field's value as a button: tapped, the list opens; picked, onChange(id).
export function picker(items, { value = '', title, empty = W('未選', 'None'), onChange = () => {} } = {}) {
  const b = h('button', { type: 'button', class: 'q-picker' });
  const draw = () => {
    const it = items.find(x => x.id === value);
    b.replaceChildren(h('span', { class: it ? '' : 'q-picker-empty', text: it ? it.name : empty }), h('span', { class: 'q-picker-chev', 'aria-hidden': 'true', html: icons.chevron }));
  };
  b.addEventListener('click', async () => {
    const id = await pickList(items, { title, current: value });
    if (id == null) return;
    value = id;
    draw();
    onChange(id);
  });
  draw();
  return Object.assign(b, { set: v => ((value = v), draw()) });
}

// The AI's question back (or code's own, the same way): its words, a chip
// an option (a list's ids drawn by name), 其他 (the whole list) or 自己打
// (words). → { box, answer }: the box to put where the question goes, and
// the answer it gives once tapped, { q, a, id?, field? }.
export function askBox(ask, { lists = {}, titles = {} } = {}) {
  let resolve;
  const answer = new Promise(r => (resolve = r));
  const list = ask.field ? lists[ask.field] || [] : null;
  const nameOf = id => list?.find(x => x.id === id)?.name || id;
  const done = (a, id) => {
    box.classList.add('answered');
    box.querySelectorAll('button, textarea').forEach(b => (b.disabled = true));
    resolve({ q: ask.q, a, ...(id ? { id, field: ask.field } : {}) });
  };
  const said = id => `${nameOf(id)}（${ask.field} ${id}）`;
  const chips = h(
    'div',
    { class: 'q-chips q-ai-chips' },
    ask.options.map(o => h('button', { type: 'button', class: 'q-chip', onclick: e => (e.currentTarget.classList.add('on'), list ? done(said(o), o) : done(o)) }, [list ? nameOf(o) : o]))
  );
  const own = h('div', { class: 'q-ai-own', hidden: true });
  if (list) {
    if (list.length > ask.options.length)
      chips.append(
        h('button', {
          type: 'button',
          class: 'q-chip q-ai-more',
          onclick: async () => {
            const id = await pickList(list, { title: titles[ask.field] || ask.q });
            if (id != null) done(said(id), id);
          }
        }, [W('其他…', 'Other…')])
      );
  } else {
    const bar = aiBar({ placeholder: W('自己打', 'Type your answer'), onSend: t => done(t) });
    own.append(bar);
    chips.append(h('button', { type: 'button', class: 'q-chip q-ai-more', onclick: () => ((own.hidden = false), bar.input.focus()) }, [W('自己打', 'Type it')]));
  }
  const box = h('div', { class: 'q-ai-ask', role: 'group', 'aria-label': ask.q }, [h('p', { class: 'q-ai-q' }, [mark(), h('span', { text: ask.q })]), chips, own]);
  return { box, answer };
}

// The whole exchange drawn in `host`: thinking, each question and its
// answer kept in view, then the answer. → { out, answers } | { error, left }.
// lists: the person's own lists by field ({ cat: [{ id, name }] }); titles: each list's sheet title.
export async function aiFlow(host, { feature, input, lists = {}, titles = {}, thinking } = {}) {
  const answers = [];
  for (;;) {
    const wait = aiThinking(thinking);
    host.append(wait);
    const r = await aiCall(feature, input, { answers: answers.map(({ q, a }) => ({ q, a })) });
    wait.remove();
    if (r.error) return { error: r.error, left: r.left ?? null };
    if (!r.ask) return { out: r.out, answers, left: r.left };
    const { box, answer } = askBox(r.ask, { lists, titles });
    host.append(box);
    box.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    answers.push(await answer);
  }
}
