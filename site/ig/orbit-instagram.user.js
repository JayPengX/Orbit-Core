// ==UserScript==
// @name         Orbit Instagram
// @namespace    https://orbit.jaypengx.com/
// @version      1.0.0
// @description  Instagram with only your friends: their stories and posts, messages and search. No ads, Reels or suggestions.
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @run-at       document-start
// @inject-into  content
// @updateURL    https://orbit.jaypengx.com/Orbit-Core/ig/orbit-instagram.user.js
// @downloadURL  https://orbit.jaypengx.com/Orbit-Core/ig/orbit-instagram.user.js
// ==/UserScript==

// Runs in your own Safari (the Userscripts app) on instagram.com, after
// Instagram's own code: your login never leaves the phone, and the script only
// hides things and turns pages away, the way an ad blocker does. Nothing here
// likes, follows, posts or reads anything for you.
//
// What goes and how it's found, sturdiest first (Instagram scrambles its class
// names every few weeks, so no rule leans on them):
//   pages by address    /reels/ (the Reels tab, a profile's Reels tab)
//   the Explore grid    its posts are hidden; its search box stays
//   links by address    the Reels buttons in the tab bar and on profiles
//   posts in the feed   an ad (its "Sponsored" label), a suggestion (a Follow
//                       button on it: you don't follow that account), a reel
//   blocks by heading   "Suggested for you" rows of accounts, anywhere
// The labels Instagram writes are listed in each language it's likely set to.

(function () {
  'use strict';

  // Where a page goes instead, or null to stay.
  function redirectFor(path) {
    const p = String(path || '/').replace(/\/+$/, '') + '/';
    if (p.startsWith('/reels/')) return '/';
    // A profile's Reels tab: /<name>/reels/ → /<name>/.
    const own = p.match(/^\/([^/]+)\/reels\/$/);
    if (own) return `/${own[1]}/`;
    return null;
  }

  const SPONSORED = ['Sponsored', 'Paid partnership', '贊助', '贊助內容', '赞助内容', '广告', '廣告', '広告'];
  const FOLLOW = ['Follow', '追蹤', '关注', '關注', 'フォローする'];
  const SUGGESTED = ['Suggested for you', 'Suggested posts', 'Suggestions for you', 'Suggested reels', '為你推薦', '推薦給你', '推薦貼文', '为你推荐', '推荐帖子', 'おすすめ'];

  const norm = t => String(t || '').replace(/\s+/g, ' ').trim();

  // A feed post that isn't a friend's: an ad, a suggestion, or a reel.
  function unwantedPost(article) {
    for (const el of article.querySelectorAll('span, a, div[role="button"], button')) {
      if (el.children.length > 2) continue;
      const t = norm(el.textContent);
      if (!t || t.length > 30) continue;
      if (SPONSORED.includes(t)) return 'ad';
      if (SUGGESTED.includes(t)) return 'suggested';
      if (FOLLOW.includes(t) && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button')) return 'suggested';
    }
    if (article.querySelector('a[href*="/reel/"]')) return 'reel';
    return null;
  }

  // The block a "Suggested for you" heading belongs to: the nearest ancestor
  // that holds more than the heading, short of the feed or page itself.
  function suggestedBlock(heading) {
    let el = heading;
    for (let i = 0; i < 6 && el.parentElement; i++) {
      const up = el.parentElement;
      if (up.tagName === 'MAIN' || up.tagName === 'BODY' || (up.querySelector('article') && !el.querySelector('article'))) break;
      el = up;
      if (norm(el.textContent).length > norm(heading.textContent).length + 4) break;
    }
    return el;
  }

  const HIDE = 'data-orbit-hide';
  function hide(el, why) {
    if (el && !el.hasAttribute(HIDE)) el.setAttribute(HIDE, why);
  }

  // The Explore page and its search: recommended posts, not search results
  // (a hashtag's or a place's page, /explore/tags/…, /explore/locations/…).
  const exploreGrid = path => /^\/explore\/(search\/)?$/.test(path.replace(/\/*$/, '/'));

  function sweep(root, path) {
    // The Reels buttons (tab bar, side bar, a profile's tabs).
    for (const a of root.querySelectorAll('a[href]')) {
      const path = a.getAttribute('href').replace(/^https?:\/\/(www\.)?instagram\.com/, '').split('?')[0];
      if (/^\/reels\/?$/.test(path) || /^\/[^/]+\/reels\/?$/.test(path)) hide(a.closest('li') && a.closest('li').querySelectorAll('a').length === 1 ? a.closest('li') : a, 'reels-link');
    }
    for (const article of root.querySelectorAll('article')) {
      if (article.hasAttribute(HIDE) || article.closest('[role="dialog"]')) continue;
      const why = unwantedPost(article);
      if (why) hide(article, why);
    }
    for (const el of root.querySelectorAll('h2, h3, h4, span, div')) {
      if (el.children.length > 1) continue;
      const t = norm(el.textContent);
      if (t.length > 30 || !SUGGESTED.includes(t) || el.closest('article') || el.closest('[role="dialog"]')) continue;
      hide(suggestedBlock(el), 'suggested-block');
    }
    if (exploreGrid(path || '/')) {
      for (const a of root.querySelectorAll('main a[href^="/p/"], main a[href*="/reel/"]')) hide(a, 'explore');
    }
  }

  // Not inside a browser (the tests): hand the pieces over and stop.
  if (typeof document === 'undefined' || typeof location === 'undefined') {
    if (typeof globalThis !== 'undefined') globalThis.OrbitInstagram = { redirectFor, unwantedPost, sweep, exploreGrid };
    return;
  }

  function route() {
    const to = redirectFor(location.pathname);
    if (to && to !== location.pathname) location.replace(to + location.search);
  }
  route();

  // At document-start the page may not have an <html> yet: the style goes in
  // as soon as there is one.
  const style = document.createElement('style');
  style.textContent = `[${HIDE}]{display:none!important}`;

  // Instagram changes pages without loading them and redraws the feed as it
  // scrolls; both change the page, so on any change: check the address and
  // sweep, once a frame at most.
  let queued = false;
  let last = location.pathname;
  function tick() {
    queued = false;
    if (!style.isConnected && document.documentElement) (document.head || document.documentElement).appendChild(style);
    if (location.pathname !== last) { last = location.pathname; route(); }
    if (document.body) sweep(document.body, location.pathname);
  }
  function queue() {
    if (!queued) { queued = true; requestAnimationFrame(tick); }
  }
  addEventListener('popstate', queue);
  new MutationObserver(queue).observe(document, { childList: true, subtree: true });
  queue();
})();
