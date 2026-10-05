/* PrimeSphere intro splash. Load it in <head> right after splash.css (not deferred), so the
   overlay is on screen before the page paints. It plays once per tab session; later page
   loads skip it. The animation and its exit are pure CSS (splash.css), so it always clears. */
(function () {
  'use strict';
  var KEY = 'ps-splash-seen';
  var root = document.documentElement;
  try {
    if (sessionStorage.getItem(KEY)) { root.setAttribute('data-splash', 'done'); return; }
    sessionStorage.setItem(KEY, '1');
  } catch (e) { /* storage blocked: the intro just plays */ }

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TOP = 'PRIME'.split('');
  var BOTTOM = 'SPHERE'.split('');
  var COLORS = ['#8FDCFF', '#6FD2FF', '#4CC6FD', '#26B8FA', '#12A3F3', '#0589ED'];
  var STARS = [[8, 18, 0], [16, 72, 1.1], [24, 40, 0.4], [33, 86, 1.8], [44, 12, 0.9], [57, 78, 2.2], [66, 28, 0.2],
    [74, 64, 1.5], [83, 20, 0.7], [90, 52, 2], [12, 52, 2.5], [52, 92, 1.3], [94, 84, 0.5], [38, 62, 2.8]];

  // Two delays per letter: when it rises in, and when the glint passes over it.
  var letters = function (arr, start, glint, colors) {
    return arr.map(function (c, i) {
      return '<span class="ps-splash-letter" style="animation-delay:' + (start + i * 0.06).toFixed(2) + 's,' + (glint + i * 0.05).toFixed(2) + 's' + (colors ? ';color:' + colors[i] : '') + '">' + c + '</span>';
    }).join('');
  };
  var stars = STARS.map(function (s) {
    return '<span class="ps-splash-star" style="left:' + s[0] + '%;top:' + s[1] + '%;animation-delay:' + s[2] + 's"></span>';
  }).join('');

  var html =
    '<div class="ps-splash-half ps-splash-half--top"></div>' +
    '<div class="ps-splash-half ps-splash-half--bottom"></div>' +
    '<div class="ps-splash-stage"><div class="ps-splash-aurora"></div><div class="ps-splash-grid"></div>' + stars +
    '<div class="ps-splash-beam"></div><div class="ps-splash-vignette"></div></div>' +
    '<div class="ps-splash-content">' +
      '<div class="ps-splash-emblem">' +
        '<svg class="ps-splash-rings" viewBox="0 0 400 400" fill="none" aria-hidden="true">' +
          '<defs>' +
            '<linearGradient id="ps-ring-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1FBEF8" stop-opacity="0"/><stop offset="0.5" stop-color="#1FBEF8"/><stop offset="1" stop-color="#0589ED" stop-opacity="0.2"/></linearGradient>' +
            '<linearGradient id="ps-ring-b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0589ED" stop-opacity="0.1"/><stop offset="0.55" stop-color="#7FD8FF"/><stop offset="1" stop-color="#1FBEF8" stop-opacity="0"/></linearGradient>' +
          '</defs>' +
          '<circle class="ps-ring ps-ring-outer" cx="200" cy="200" r="186" stroke="url(#ps-ring-a)" stroke-width="1.5" pathLength="1"/>' +
          '<circle class="ps-ring ps-ring-inner" cx="200" cy="200" r="150" stroke="url(#ps-ring-b)" stroke-width="1.5" pathLength="1"/>' +
          '<circle class="ps-ring-dash" cx="200" cy="200" r="168" stroke="rgba(127,216,255,0.35)" stroke-width="1" pathLength="1"/>' +
          '<g class="ps-orbit ps-orbit-1"><circle cx="386" cy="200" r="4.5" fill="#7FD8FF"/></g>' +
          '<g class="ps-orbit ps-orbit-2"><circle cx="50" cy="200" r="3" fill="#1FBEF8"/></g>' +
        '</svg>' +
        '<div class="ps-splash-glow"></div>' +
        '<div class="ps-splash-flare"></div>' +
        '<div class="ps-splash-disc"><img src="/assets/logo-mark-tight.png" alt="" width="172" height="134"></div>' +
      '</div>' +
      '<div class="ps-splash-word"><span class="ps-splash-line">' + letters(TOP, 1.25, 2.3) + '</span>' +
        '<span class="ps-splash-line ps-splash-line-accent">' + letters(BOTTOM, 1.55, 2.55, COLORS) + '</span></div>' +
      '<div class="ps-splash-tagline"><i></i><span>Global opportunities, real results.</span><i></i></div>' +
      '<div class="ps-splash-progress"><span></span></div>' +
    '</div>';

  var splash = document.createElement('div');
  splash.className = 'ps-splash';
  splash.setAttribute('aria-hidden', 'true');
  splash.innerHTML = html;
  root.appendChild(splash); // <body> doesn't exist yet; <html> can hold the fixed overlay
  root.classList.add('ps-splash-on');

  setTimeout(function () {
    root.setAttribute('data-splash', 'done');
    root.classList.remove('ps-splash-on');
    if (splash.parentNode) splash.parentNode.removeChild(splash);
    try { window.dispatchEvent(new Event('ps:splash-done')); } catch (e) {}
  }, reduced ? 1400 : 4300);
})();
