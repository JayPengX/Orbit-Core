// The page in one language: ?lang=en or ?lang=zh, else Orbit's (orbit.lang), else the browser's.
(() => {
  let l = new URLSearchParams(location.search).get('lang');
  if (l !== 'zh' && l !== 'en') {
    try {
      l = localStorage.getItem('orbit.lang');
    } catch {}
  }
  if (l !== 'zh' && l !== 'en') {
    const n = navigator.languages?.length ? navigator.languages : [navigator.language || 'zh-TW'];
    l = n.some(x => /^zh/i.test(x)) ? 'zh' : 'en';
  }
  document.documentElement.lang = l === 'en' ? 'en' : 'zh-Hant';
  for (const a of document.querySelectorAll('article[lang]')) a.hidden = (a.lang === 'en') !== (l === 'en');
  if (l === 'en') for (const a of document.querySelectorAll('.top [data-en]')) a.textContent = a.dataset.en;
  for (const a of document.querySelectorAll('[data-lang-link]')) a.href = `?lang=${l === 'en' ? 'zh' : 'en'}`;
  for (const a of document.querySelectorAll('[data-keep-lang]')) a.href += `?lang=${l}`;
  document.title = document.querySelector(`article:not([hidden]) h1`)?.textContent + ' · Orbit';
})();
