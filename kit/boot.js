// Orbit's loading screen and first update check, shared by every app (a
// classic script, loaded right after <div id="loading"> so it runs before
// the app's modules): the kit's copy, synced as public/boot.js. Never edit
// an app's copy.
//
// - Draws the loading screen into #loading (logo, the app's name from
//   data-title, a progress line and what it's doing), so every app opens
//   the same way.
// - Checks version.json (the app's and the kit's) while the app's files
//   load: a newer deploy than this page (meta build-version) or a newer kit
//   is loaded straight away in one reload, before anything starts.
//   The kit's watchUpdates keeps the page current after.
// - When the app fails to start (an error, a script that didn't come, or
//   15 s with nothing more arriving), asks whether the network is there.
//   Offline: says so. Online, it's an update that didn't finish (GitHub's
//   CDN still on an old file under a new address): each of the page's
//   files is checked against its hash, only a wrong one fetched again, and
//   the page reloaded, up to 5 times, further apart; then it says the
//   update didn't finish, with reload (mends again) or open anyway. Nothing
//   right is dropped or downloaded again. The app says it started with
//   window.__fxStarted and hides #loading itself (the kit does).
(function () {
  // A phone or a tablet (an iPad says Macintosh, with touch), set before the
  // first paint (orbit.mjs reads html.q-touch).
  var ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) document.documentElement.classList.add('q-touch');
  // The Worker's connection (DNS, TCP, TLS: two or three round trips on a
  // phone's link) opened now, while the app's files load, not at its first ask.
  // (A page on the family's own domain reaches it at api.<domain>, domain.mjs API.)
  var pre = document.createElement('link');
  pre.rel = 'preconnect';
  pre.href = /^(jaypengx\.github\.io|localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'https://orbit-workers-proxy.pengzjay.workers.dev' : 'https://api.' + location.hostname;
  pre.crossOrigin = 'anonymous';
  document.head.appendChild(pre);
  // The Orbit language (orbit.mjs detectLang's rule: the one picked in any app, else the
  // phone's), and the page's lang set to it, so nothing shows the other language first.
  var saved = '';
  try {
    saved = localStorage.getItem('orbit.lang') || '';
  } catch (e) {}
  var langs = navigator.languages || [navigator.language || 'zh-TW'];
  var zh = saved === 'zh' || (saved !== 'en' && (langs.some(function (l) { return /^zh/i.test(l); }) || !langs.some(function (l) { return /^en/i.test(l); })));
  document.documentElement.lang = zh ? 'zh-Hant' : 'en';
  var box = document.getElementById('loading');
  if (!box) return;
  var L = function (a, b) {
    return zh ? a : b;
  };
  var title = box.getAttribute('data-title') || document.title;
  var logo = box.getAttribute('data-logo') || './favicon.svg';
  box.className = 'loading q-boot';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  box.innerHTML =
    '<div class="q-boot-box">' +
    '<img class="q-boot-logo" alt="" width="72" height="72">' +
    '<p class="q-boot-brand">' + 'ORBIT' + '</p>' +
    '<p class="q-boot-title"></p>' +
    '<div class="q-boot-bar" aria-hidden="true"><i></i></div>' +
    '<p class="q-boot-step"></p>' +
    '<div class="q-boot-error" hidden><p class="q-boot-error-text"></p>' +
    '<div class="q-boot-actions"><button type="button" class="q-btn primary" data-act="reload"></button><button type="button" class="q-btn" data-act="skip"></button></div></div>' +
    '</div>';
  var q = function (sel) {
    return box.querySelector(sel);
  };
  q('.q-boot-logo').src = logo;
  q('.q-boot-title').textContent = title;
  q('[data-act=reload]').textContent = L('重新整理', 'Reload');
  q('[data-act=skip]').textContent = L('直接開啟', 'Open anyway');
  q('[data-act=skip]').onclick = function () {
    // (Opened now: the kit doesn't hold it for pictures.)
    box.setAttribute('data-now', '1');
    box.hidden = true;
  };

  // The progress line follows what has really loaded: the app's own files
  // (counted as they arrive, against how many it took last time on this
  // device), then the steps the app names (window.__bootStep('…', part)).
  // Hiding #loading ends it.
  var shown = 0.04;
  var bar = q('.q-boot-bar i');
  var step = q('.q-boot-step');
  var paint = function () {
    bar.style.transform = 'scaleX(' + shown.toFixed(3) + ')';
  };
  paint();
  step.textContent = L('載入中…', 'Loading…');
  var countKey = 'orbit.bootFiles:' + location.pathname;
  var expected = 0;
  try {
    expected = Number(localStorage.getItem(countKey)) || 0;
  } catch (e) {}
  var files = function () {
    if (!window.performance || !performance.getEntriesByType) return 0;
    return performance.getEntriesByType('resource').filter(function (r) {
      return r.name.indexOf(location.origin) === 0 && !/version\.json/.test(r.name);
    }).length;
  };
  var stepPart = 0;
  var tick = function () {
    var done = files();
    // Files make up the first 70%; without last time's count, each file
    // closes part of the gap that's left.
    var part = expected ? 0.7 * Math.min(1, done / expected) : 0.7 * (1 - Math.pow(0.88, done));
    var next = Math.max(part, stepPart);
    if (next > shown) {
      shown = Math.min(0.98, next);
      paint();
    }
  };
  var counted = false;
  var timer = setInterval(function () {
    if (box.hidden) return clearInterval(timer);
    // The app's modules have run: that many files is what it takes.
    if (!counted && started()) {
      counted = true;
      var n = files();
      expected = n;
      try {
        if (n > 2) localStorage.setItem(countKey, String(n));
      } catch (e) {}
    }
    tick();
  }, 100);
  window.__bootStep = function (text, part) {
    if (text) step.textContent = text;
    if (part > stepPart) {
      stepPart = part;
      tick();
    }
  };

  var started = function () {
    return Boolean(window.__fxStarted);
  };
  // ---- Not started: an update that didn't finish, or no connection ----
  // Which one is asked, never guessed: version.json, past every cache.
  var reachable = function () {
    if (navigator.onLine === false || !window.fetch) return Promise.resolve(navigator.onLine !== false);
    var c = window.AbortController ? new AbortController() : null;
    setTimeout(function () {
      if (c) c.abort();
    }, 6000);
    return fetch('./version.json?t=' + Date.now(), { cache: 'no-store', signal: c && c.signal }).then(
      function () {
        return true;
      },
      function () {
        return false;
      }
    );
  };
  // Every file of the page addressed by its own hash (kit/hash.mjs): its
  // scripts, styles and preloads, the import map's kit files, and what has
  // loaded so far.
  var pageFiles = function () {
    var seen = {};
    var add = function (u) {
      try {
        var x = new URL(u, location.href);
        if (x.origin === location.origin && /^[0-9a-f]{12}$/.test(x.searchParams.get('v') || '')) seen[x.href] = true;
      } catch (e) {}
    };
    var els = document.querySelectorAll('script[src],link[href]');
    for (var i = 0; i < els.length; i++) add(els[i].src || els[i].href);
    var map = document.querySelector('script[type=importmap]');
    try {
      var imports = map ? JSON.parse(map.textContent).imports : {};
      for (var k in imports) add(imports[k]);
    } catch (e) {}
    if (window.performance && performance.getEntriesByType) performance.getEntriesByType('resource').forEach(function (r) {
      add(r.name);
    });
    return Object.keys(seen);
  };
  // A file is what its address names (the hash of what came).
  var hex = function (buf) {
    var b = new Uint8Array(buf);
    var out = '';
    for (var i = 0; i < 6; i++) out += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return out;
  };
  var isTrue = function (url, res) {
    if (!res || res.status !== 200) return Promise.resolve(false);
    if (!window.crypto || !crypto.subtle) return Promise.resolve(true);
    return res
      .arrayBuffer()
      .then(function (buf) {
        return crypto.subtle.digest('SHA-256', buf);
      })
      .then(function (d) {
        return hex(d) === new URL(url).searchParams.get('v');
      })
      .catch(function () {
        return false;
      });
  };
  // Each of the page's files checked (the service worker checks what it
  // keeps: this asks it again, a quick answer from the phone). One that's
  // wrong is asked again past the browser's cache, which may keep a wrong
  // copy 10 minutes; nothing right is downloaded again. Says how many are
  // still wrong (the CDN still answering the old file).
  var mend = function () {
    var urls = pageFiles();
    var one = function (u) {
      return fetch(u)
        .then(function (r) {
          return isTrue(u, r);
        })
        .catch(function () {
          return false;
        })
        .then(function (ok) {
          return ok || fetch(u, { cache: 'reload' }).then(function (r) {
            return isTrue(u, r);
          });
        })
        .catch(function () {
          return false;
        });
    };
    return Promise.all(urls.map(one)).then(function (oks) {
      return oks.filter(function (ok) {
        return !ok;
      }).length;
    });
  };
  // Tries this session for this page (its version): mended and reloaded
  // up to 5 times, further apart each time (the CDN keeps a file at most
  // 10 minutes; it's usually seconds).
  var healKey = 'orbit.bootHeal:' + location.pathname;
  var healWait = [0, 4000, 12000, 30000, 60000];
  var tried = function () {
    try {
      var was = String(sessionStorage.getItem(healKey) || '').split('#');
      return was[0] === String(document.querySelector('meta[name="build-version"]') && document.querySelector('meta[name="build-version"]').content) ? Number(was[1]) || 0 : 0;
    } catch (e) {
      return 9;
    }
  };
  var heal = function (force) {
    var n = force ? 0 : tried();
    if (n >= healWait.length) return false;
    try {
      var meta = document.querySelector('meta[name="build-version"]');
      sessionStorage.setItem(healKey, String(meta && meta.content) + '#' + (n + 1));
    } catch (e) {
      return false;
    }
    window.__bootUpdating = true;
    q('.q-boot-error').hidden = true;
    q('.q-boot-bar').hidden = false;
    step.hidden = false;
    step.textContent = L('正在完成更新…', 'Finishing the update…');
    setTimeout(function () {
      mend().then(function () {
        location.replace(location.pathname + '?v=' + Date.now() + location.hash);
      });
    }, healWait[n]);
    return true;
  };
  var show = function (text) {
    q('.q-boot-error-text').textContent = text;
    q('.q-boot-error').hidden = false;
    q('.q-boot-bar').hidden = true;
    step.hidden = true;
  };
  var failing = false;
  var fail = function (message) {
    if (box.hidden || failing || !q('.q-boot-error').hidden || window.__bootUpdating) return;
    if (message) return show(message);
    failing = true;
    reachable().then(function (online) {
      failing = false;
      if (box.hidden || window.__bootUpdating) return;
      if (!online) return show(L('沒有網路連線。連上後點重新整理。', 'No internet connection. Reload once you\'re back online.'));
      // Online: the app's files (an update that didn't finish), mended.
      if (heal()) return;
      show(L('更新沒有完成。請稍候再點重新整理。', "The update didn't finish. Wait a moment, then reload."));
    });
  };
  // Reload, after a failure: the files mended first, as many times as it's tapped.
  q('[data-act=reload]').onclick = function () {
    if (!heal(true)) location.reload();
  };
  // The names the apps' scripts already call (their own message, or none).
  var broke = function (message) {
    fail(typeof message === 'string' ? message : '');
  };
  window.__orbitFail = window.__fxFail = window.__oddsFail = window.__stockFail = broke;
  // Before it starts: an error in its code (an old file with a new one), or
  // one of its own scripts that didn't come (the service worker's 503 for a
  // file the CDN hasn't updated yet). (A picture, or another site's script
  // such as the map's, that didn't come is no failure.)
  window.addEventListener(
    'error',
    function (e) {
      if (started()) return;
      var t = e && e.target;
      if (t && t !== window && (t.tagName !== 'SCRIPT' || String(t.src).indexOf(location.origin) !== 0)) return;
      broke();
    },
    true
  );
  window.addEventListener('unhandledrejection', function (e) {
    if (!started() && /import|module|load failed/i.test(String(e && e.reason && (e.reason.message || e.reason)))) broke();
  });
  // Not started after 15 s: the way out, unless the app's files are still
  // arriving (a slow connection's first opening takes longer than that, and
  // a reload there only started it over). Then it waits while they come, up
  // to a minute.
  var seen = -1;
  var stuck = function () {
    if (started()) return;
    var now = files();
    if (now > seen && performance.now() < 60000) {
      seen = now;
      return setTimeout(stuck, 4000);
    }
    fail();
  };
  setTimeout(stuck, 15000);
  // A reload under way that never happened (the new page didn't come): the way out, after 30 s.
  var going = function () {
    setTimeout(function () {
      if (started() || box.hidden) return;
      window.__bootUpdating = false;
      fail();
    }, 30000);
  };

  // A newer deploy than this page (or a newer kit): load it now, before the
  // app starts, both in one reload (the kit's version and file hashes noted
  // for the loader, orbit.kit and orbit.kitFiles). A reload that came back
  // on the old page (the CDN a moment behind) is tried again, up to 3 times a
  // session.
  var meta = document.querySelector('meta[name="build-version"]');
  var current = meta && meta.content;
  if (!current || current === 'dev' || !window.fetch) return;
  var ctl = window.AbortController ? new AbortController() : null;
  setTimeout(function () {
    if (ctl) ctl.abort();
  }, 6000);
  var kit = window.ORBIT_KIT || {};
  var read = function (url) {
    return fetch(url + '?t=' + Date.now(), { cache: 'no-store', signal: ctl && ctl.signal })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (v) {
        return v && v.version ? v : null;
      })
      .catch(function () {
        return null;
      });
  };
  // (The kit's watch skips its own first check, this one just made, and
  // waits for its answer: __bootCheck says 'boot' when this reload is under
  // way, 'none' when both versions were read and nothing is newer, 'watch'
  // otherwise: a newer one found with the app already on screen, or a version
  // not read. Then the watch looks again at once, so the first opening after
  // a deploy gets it, not the next one.)
  window.__bootChecked = Date.now();
  window.__bootCheck = Promise.all([read('./version.json'), kit.base ? read(kit.base + 'version.json') : null]).then(function (got) {
    var latest = got[0] && got[0].version;
    var kitLatest = got[1] && got[1].version;
    var appNew = latest && latest !== current;
    // A kit newer than this page's (the first one seen on a device is only
    // noted: it's what loaded, or close to it, the hashes the app's deploy
    // baked in).
    var kitNew = kitLatest && kit.version && kit.noted !== false && kitLatest !== kit.version;
    // Noted for the next opening: the version and each file's hash (the
    // loader's addresses, so only the files that changed are fetched).
    if (kitLatest) {
      try {
        if (localStorage.getItem('orbit.kit') !== kitLatest) localStorage.setItem('orbit.kit', kitLatest);
        var files = got[1].files ? JSON.stringify({ version: kitLatest, files: got[1].files }) : null;
        if (files && localStorage.getItem('orbit.kitFiles') !== files) localStorage.setItem('orbit.kitFiles', files);
      } catch (e) {}
    }
    if (!appNew && !kitNew) return got[0] && (got[1] || !kit.base) ? 'none' : 'watch';
    // (An app already on screen leaves it to the watch; one still behind
    // this loading screen is reloaded now, before anything shows.)
    if (box.hidden) return 'watch';
    var flag = 'orbit.bootTo:' + location.pathname;
    var want = (appNew ? latest : current) + '|' + (kitLatest || '');
    var was = String(sessionStorage.getItem(flag) || '').split('#');
    var tries = was[0] === want ? Number(was[1]) || 0 : 0;
    if (tries >= 3) return 'none';
    sessionStorage.setItem(flag, want + '#' + (tries + 1));
    window.__bootUpdating = true;
    going();
    // (The files the phone kept stay: each is kept under its own hash, so
    // the new page fetches only what changed. They were all dropped here
    // first, and every update downloaded the whole app again.)
    if (appNew) location.replace(location.pathname + '?v=' + encodeURIComponent(latest) + (tries ? '&r=' + tries : '') + location.hash);
    else location.reload();
    return 'boot';
  });
})();
