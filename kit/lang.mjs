// ---- kit/lang.mjs: the reader's language, the same in every app ----
// What each app kept its own copy of (Weather's lang.mjs, Words' and
// Securities' i18n.mjs): the language picked in any Orbit app (else the
// phone's), a word-pair helper for short labels, and `makeT` for an app's
// string tables.
//
//   import { lang, en, W, makeT } from '#kit/lang.mjs';
//   W('今天', 'Today');
//   const t = makeT({ zh: { hello: '你好 {name}' }, en: { hello: 'Hello {name}' } });
//   t('hello', { name: 'Amy' });

// The one language detector is orbit.mjs's (a saved choice, else the phone's; 'zh' or 'en').
import { detectLang } from '#kit/orbit.mjs';

// The language of this page. Under Node (the tests) Chinese, as the apps are written.
export const lang = typeof document === 'undefined' ? 'zh' : detectLang();
export const en = lang === 'en';

// The words in the reader's language: W('今天', 'Today').
export const W = (zh, english) => (en ? english : zh);

// An app's strings by key: makeT({ zh: {...}, en: {...} }, locale = the page's
// language) gives t(key, { name: value }). {name} in the text is filled in; a
// key missing in English falls back to Chinese, then to the key itself; a
// variable that isn't given is left empty.
export function makeT(strings, locale = lang) {
  const dict = strings?.[locale] || strings?.zh || {};
  return (key, vars = {}) => String(dict[key] ?? strings?.zh?.[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
