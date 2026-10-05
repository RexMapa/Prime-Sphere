/* PrimeSphere premium layer (see premium.css). Everything here is progressive:
   if it fails or motion is reduced, the site works exactly as before. */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Atmosphere: drifting aurora and a faint grid behind every page ---------- */
  var atmos = document.createElement('div');
  atmos.className = 'ps-atmos';
  atmos.setAttribute('aria-hidden', 'true');
  atmos.innerHTML = '<i></i><i></i><i></i><b></b>';
  document.body.insertBefore(atmos, document.body.firstChild);

  /* ---------- Nav: a glow pill glides to the link you point at ---------- */
  var links = document.getElementById('nav-links');
  if (links) {
    var glide = document.createElement('span');
    glide.className = 'nav-glide';
    glide.setAttribute('aria-hidden', 'true');
    links.insertBefore(glide, links.firstChild);
    var items = $$(':scope > li', links).filter(function (li) { return !li.classList.contains('nav-client-item'); });
    var activeLi = items.filter(function (li) { return li.querySelector('a.is-active, a[aria-current="page"]'); })[0] || null;
    var moveTo = function (li) {
      if (!li || window.innerWidth <= 860) { glide.classList.remove('is-on'); return; }
      var a = li.querySelector('a');
      var target = li.classList.contains('nav-dd') ? li.querySelector('.nav-dd-head') : a;
      var lr = links.getBoundingClientRect(), tr = target.getBoundingClientRect();
      glide.style.width = tr.width + 'px';
      glide.style.transform = 'translateX(' + (tr.left - lr.left) + 'px)';
      glide.classList.add('is-on');
    };
    items.forEach(function (li) {
      li.addEventListener('mouseenter', function () { moveTo(li); });
      li.addEventListener('focusin', function () { moveTo(li); });
    });
    links.addEventListener('mouseleave', function () { moveTo(activeLi); });
    // The homepage marks a different link active as you scroll; follow it.
    if (window.MutationObserver) {
      new MutationObserver(function () {
        var now = items.filter(function (li) { return li.querySelector('a.is-active'); })[0] || activeLi;
        if (now !== activeLi) { activeLi = now; if (!links.matches(':hover')) moveTo(activeLi); }
      }).observe(links, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    var place = function () { glide.style.transition = 'none'; moveTo(activeLi); glide.offsetWidth; glide.style.transition = ''; };
    window.addEventListener('resize', place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place); else setTimeout(place, 300);
    setTimeout(place, 600);
  }

  /* ---------- Glass cards: a soft light follows the pointer ---------- */
  var SPOT = '.service, .blog-card, .case-card, .mvg-card, .svc-feature, .svc-other, .contact-card';
  if (fine && !reduce) {
    document.addEventListener('pointermove', function (e) {
      var card = e.target.closest && e.target.closest(SPOT);
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ---------- Stagger: cards in the same grid arrive one after another ---------- */
  var GRIDS = '.services, .stores, .project-grid, .blog-grid, .why-grid, .values-grid, .mvg-grid, .case-grid, .svc-features, .svc-others, .steps, .stats, .work-stats-grid, .testi-grid';
  function stagger(root) {
    $$(GRIDS, root).forEach(function (g) {
      var kids = Array.prototype.slice.call(g.children).filter(function (k) { return k.classList.contains('reveal') && !k.style.getPropertyValue('--d'); });
      kids.forEach(function (k, i) { k.style.setProperty('--d', Math.min(i * 0.08, 0.48).toFixed(2) + 's'); });
    });
  }
  stagger(document);
  // Stores, projects and posts are drawn from the API after load.
  if (window.MutationObserver) {
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; stagger(document); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- Magnetic calls to action ---------- */
  if (fine && !reduce) {
    $$('.orbit-btn, .hero .btn, .nav-cta, .work-cta .btn, .stores-more .btn').forEach(function (b) {
      b.classList.add('ps-magnet');
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) / r.width, y = (e.clientY - r.top - r.height / 2) / r.height;
        b.style.transform = 'translate(' + (x * 8).toFixed(1) + 'px,' + (y * 8).toFixed(1) + 'px)';
      });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
  }

  /* ---------- Page-to-page fade for links inside the site ---------- */
  if (!reduce) {
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      var url;
      try { url = new URL(a.href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin || /^(mailto|tel):/.test(a.href)) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page or a #section
      if (/^\/(api|admin)/.test(url.pathname)) return;
      e.preventDefault();
      document.documentElement.classList.add('ps-leaving');
      setTimeout(function () { location.href = url.href; }, 200);
    });
    // Coming back with the browser's back button: show the page again.
    window.addEventListener('pageshow', function (e) { if (e.persisted) document.documentElement.classList.remove('ps-leaving'); });
  }
})();
