// The quality gate's eyes in the page (tools/gate.mjs, through preview.mjs
// --gate): an init script, run before the app's own. It notes what the
// screen held the moment the loading screen lifted and every long stall of
// the main thread, and gives globalThis.__gate.check(): every fault a picky
// person sees on the screen now, as short lines by kind.
(() => {
  const t0 = performance.now();
  const gate = (globalThis.__gate = { longs: [], errors: [], lift: null });
  // Main-thread stalls: Chromium's long tasks, else a timer that came late.
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) gate.longs.push([Math.round(e.startTime), Math.round(e.duration)]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    let last = t0;
    const tick = () => {
      const now = performance.now();
      if (now - last > 100) gate.longs.push([Math.round(last), Math.round(now - last)]);
      last = now;
      setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  }
  // Sound started (new Audio() never joins the page) and speech spoken: a tap that plays counts.
  gate.sounds = 0;
  try {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...a) {
      gate.sounds++;
      return play.apply(this, a);
    };
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = u => (gate.sounds++, speak(u));
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) {
      gate.sounds++;
      return start.apply(this, a);
    };
  } catch {}
  addEventListener('error', e => gate.errors.push(String(e.message || e.error || 'error').slice(0, 160)));
  addEventListener('unhandledrejection', e => gate.errors.push(`rejection: ${String(e.reason?.message || e.reason).slice(0, 160)}`));

  const seen = el => {
    if (!el.isConnected || el.closest('[hidden], [aria-hidden="true"], #loading, svg, dialog:not([open])')) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight * 4) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const name = el => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].slice(0, 3).map(c => `.${c}`).join('')}`;
  const text = el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const SKELETON = '.q-skel, .skeleton, .skel, .shimmer, [class*="skeleton"], [class*="-skel"], [aria-busy="true"], .q-spinner, .spinner';
  const LOADING = /^(載入中|讀取中|更新中|Loading|Updating)[.…]*$/i;
  // What a screen holds: its readable text, pictures, and what's still loading.
  const screenNow = () => {
    let chars = 0;
    let pics = 0;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode()); ) {
      const p = n.parentElement;
      if (!p || !n.textContent.trim() || p.closest('#loading, #tabs, .q-tabbar, script, style')) continue;
      const r = p.getBoundingClientRect();
      if (r.width && r.top < innerHeight && r.bottom > 0 && getComputedStyle(p).visibility !== 'hidden') chars += n.textContent.trim().length;
    }
    let waiting = 0;
    for (const img of document.querySelectorAll('img')) {
      const r = img.getBoundingClientRect();
      if (!r.width || r.top >= innerHeight || r.bottom <= 0 || img.closest('#loading')) continue;
      pics++;
      if (!img.complete) waiting++;
    }
    const skels = [...document.querySelectorAll(SKELETON)].filter(seen).filter(el => el.getBoundingClientRect().top < innerHeight);
    const loading = [...document.querySelectorAll('body *')].filter(el => !el.children.length && LOADING.test(text(el)) && seen(el));
    return { t: Math.round(performance.now() - t0), chars, pics, waiting, skels: skels.slice(0, 4).map(name), loading: loading.slice(0, 3).map(el => `${name(el)} "${text(el)}"`) };
  };
  gate.screenNow = screenNow;
  // The lift: #loading hidden (Orbit Class: its booting class gone).
  const watch = setInterval(() => {
    const box = document.getElementById('loading');
    const classOpen = !box && document.body && !document.body.classList.contains('orbit-booting') && document.readyState !== 'loading' && document.querySelector('main, #app');
    if ((box && (box.hidden || getComputedStyle(box).display === 'none')) || classOpen) {
      clearInterval(watch);
      gate.lift = screenNow();
    }
  }, 25);

  // Every fault on the screen now.
  gate.check = () => {
    const out = { blank: [], pictures: [], overflow: [], wraps: [], cut: [], letters: [], slots: [], halfEmpty: [], bareEmpty: [], loading: [] };
    const all = [...document.querySelectorAll('body *')].filter(seen);
    const clippedBy = el => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    // Wider than the screen, or the page itself sliding sideways.
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if ((r.right > innerWidth + 1 || r.left < -1) && !clippedBy(el)) out.overflow.push(`${name(el)} [${Math.round(r.left)}–${Math.round(r.right)}]`);
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) out.overflow.push(`page ${document.documentElement.scrollWidth}px wide`);
    const lines = el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top / 4))).size;
    };
    for (const el of all) {
      const tx = text(el);
      if (!tx) continue;
      const cs = getComputedStyle(el);
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      // A title or a name (a heading, bold, or a *title / *name box) that broke onto a second line.
      const titled = /^H[1-4]$|^STRONG$|^B$/.test(el.tagName) || /title|name|head|label/i.test(el.className?.baseVal ?? el.className);
      if (titled && !el.children.length && tx.length <= 30 && cs.display !== 'inline' && lines(el) > 1) out.wraps.push(`${name(el)} "${tx.slice(0, 30)}"`);
      // An ellipsis or clipped edge on text the element holds itself.
      if (own && /hidden|clip/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) out.cut.push(`${name(el)} "${tx.slice(0, 30)}"`);
      // (A summary clamped to its lines is the design; a name clamped is a cut.)
      if (own && (titled || tx.length <= 40) && cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 2) out.cut.push(`${name(el)} clamped "${tx.slice(0, 30)}"`);
      // A logo, badge, face or flag drawn as letters: a small square box with
      // one to five letters (a ticker) and no picture in it.
      const r = el.getBoundingClientRect();
      const kind = /logo|badge|crest|avatar|face|flag|headshot|photo|team|mono/i.test(el.className?.baseVal ?? el.className);
      if ((kind || el.matches('.q-logo.text')) && r.width >= 14 && r.width <= 96 && Math.abs(r.width - r.height) <= r.width * 0.25 && /^[\p{L}\p{N}.-]{1,5}$/u.test(tx) && /\p{L}/u.test(tx) && !el.querySelector('img, svg, canvas, video') && !/url\(/.test(cs.backgroundImage)) out.letters.push(`${name(el)} "${tx}"`);
      // An empty state that is only a sentence.
      if (!el.children.length && tx.length < 70 && /^(目前|今天|今日|這裡|尚|還|此)?(沒有|無|暫無|尚無|還沒有|未有)|^(No|Nothing|None|Not yet)\b/i.test(tx) && !el.closest('.q-empty, button, [role=button], option, select, .q-toast, dialog, .q-sheet')) {
        const box = el.parentElement;
        if (!box.querySelector('svg, img, .q-tile') && box.getBoundingClientRect().height > 30) out.bareEmpty.push(`${name(el)} "${tx.slice(0, 40)}"`);
      }
      if (!el.children.length && LOADING.test(tx)) out.loading.push(`${name(el)} "${tx}"`);
    }
    for (const el of document.querySelectorAll(SKELETON)) if (seen(el)) out.loading.push(name(el));
    // Grids: a last row with a hole, and cards stretched far past what they hold.
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (!cs.display.includes('grid') || cs.gridAutoFlow.startsWith('column')) continue;
      const kids = [...el.children].filter(k => getComputedStyle(k).position !== 'absolute' && k.getBoundingClientRect().width);
      const cols = cs.gridTemplateColumns.split(/\s+(?![^(]*\))/).filter(Boolean).length;
      if (cols < 2 || cols > 4 || kids.length < 2 || kids.length > 16) continue;
      // (Only grids of like cards, every column the same width: not a row laid out as icon, text, value.)
      const widths = kids.map(k => k.getBoundingClientRect().width);
      if (Math.max(...widths) - Math.min(...widths) > 4 && kids.length <= cols) continue;
      if (cs.gridTemplateColumns.split(/\s+(?![^(]*\))/).map(parseFloat).some((w, _, a) => Math.abs(w - a[0]) > 2)) continue;
      const spans = kids.reduce((a, k) => a + (/span\s*(\d+)/.exec(getComputedStyle(k).gridColumnEnd)?.[1] * 1 || (getComputedStyle(k).gridColumnEnd === '-1' ? cols : 1)), 0);
      const tops = new Set(kids.map(k => Math.round(k.getBoundingClientRect().top)));
      const lastRow = kids.filter(k => Math.round(k.getBoundingClientRect().top) === Math.max(...tops));
      const used = lastRow.reduce((a, k) => a + k.getBoundingClientRect().width, 0);
      if (spans % cols && used < el.getBoundingClientRect().width * 0.8) out.slots.push(`${name(el)} ${kids.length} in ${cols} columns`);
      for (const k of kids) {
        const kr = k.getBoundingClientRect();
        if (kr.height < 90) continue;
        let bottom = kr.top;
        for (const d of k.querySelectorAll('*')) {
          const dr = d.getBoundingClientRect();
          if (dr.height && dr.bottom <= kr.bottom + 1 && d.childElementCount === 0) bottom = Math.max(bottom, dr.bottom);
        }
        const pad = parseFloat(getComputedStyle(k).paddingBottom) || 0;
        if ((bottom - kr.top + pad) / kr.height < 0.55) out.halfEmpty.push(`${name(k)} in ${name(el)} (${Math.round(bottom - kr.top)} of ${Math.round(kr.height)} px used)`);
      }
    }
    // A screen with nothing on it, and pictures that failed (an empty logo circle).
    if (screenNow().chars < 15) out.blank.push(`${location.hash || 'start'}: nothing on the screen`);
    for (const img of document.querySelectorAll('img')) if (seen(img) && img.complete && !img.naturalWidth && img.getBoundingClientRect().top < innerHeight * 2) out.pictures.push(`${name(img.parentElement)} ${String(img.getAttribute('src')).slice(0, 80)}`);
    for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].slice(0, 8);
    return out;
  };

  // The first-tap check: what a person can tap on the screen now (not the
  // tab bar, not what spends money, deletes, signs out or leaves the app),
  // each tagged data-gate for the tool to tap; and a print of the screen to
  // tell whether a tap did anything.
  const RISKY = /刪除|移除|清除|清空|登出|重設|重置|下注|投注|買進|賣出|買入|購買|付款|送出|確認|兌換|借款|還款|申請|領取|安裝|分享|複製|拍|掃描|相機|上傳|選擇檔案|錄音|錄製|撥打|檢舉|封鎖|Delete|Remove|Clear|Sign ?out|Log ?out|Reset|Bet\b|Buy|Sell|Pay|Submit|Confirm|Redeem|Borrow|Repay|Claim|Install|Share|Copy|Camera|Photo|Scan|Upload|Record|Call\b|Report|Block/i;
  const label = el => (el.getAttribute('aria-label') || text(el) || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  gate.buttons = (max = 24) => {
    const out = [];
    for (const el of document.querySelectorAll('button, [role=button], a[href^="#"], [data-open], summary')) {
      if (out.length >= max) break;
      // (What's already chosen, tapped again, rightly does nothing: a picked chip, the segment on, 我的位置 following.)
      if (el.matches('[aria-pressed=true], [aria-selected=true], [aria-current]:not([aria-current=false]), .active, .on, .selected')) continue;
      if (!seen(el) || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('#tabs, .q-tabbar, dialog, .q-sheet, [role=dialog]')) continue;
      const r = el.getBoundingClientRect();
      if (r.top > innerHeight - 70 || r.bottom < 0 || r.width < 12) continue;
      const l = label(el);
      if (!l || RISKY.test(l) || el.closest('a[target=_blank]')) continue;
      el.setAttribute('data-gate', String(out.length));
      out.push(l);
    }
    return out;
  };
  const media = () => [...document.querySelectorAll('audio, video')].map(m => `${m.currentSrc || m.src}|${m.paused}`).join(',') + (navigator.mediaSession?.metadata?.title || '');
  gate.print = () => ({
    dom: document.body.innerHTML.length + ':' + text(document.body).length + ':' + [...document.querySelectorAll('[aria-pressed], [aria-selected], [aria-expanded], [aria-checked], input')].map(e => e.getAttribute('aria-pressed') ?? e.getAttribute('aria-selected') ?? e.getAttribute('aria-expanded') ?? e.getAttribute('aria-checked') ?? e.checked ?? e.value).join(''),
    dialogs: document.querySelectorAll('dialog[open], [role=dialog]:not([hidden]), .q-menu, .q-toast').length,
    where: location.href + '|' + Math.round(scrollY) + '|' + document.querySelector('.q-tab[aria-selected=true]')?.dataset.tab,
    media: media() + '|' + gate.sounds,
    track: navigator.mediaSession?.metadata?.title || ''
  });
  gate.calm = () => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close?.();
    for (const m of document.querySelectorAll('.q-menu')) m.remove();
  };
})();
