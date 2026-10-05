(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Page load sequence ---------- */
  // While the intro splash is up, the hero waits and plays as the curtain opens.
  var loadedOnce = false;
  function start() { if (loadedOnce) return; loadedOnce = true; document.body.classList.add('is-loaded'); }
  function onLoaded() {
    var root = document.documentElement;
    if (root.classList.contains('ps-splash-on') && !root.classList.contains('ps-splash-reveal')) {
      window.addEventListener('ps:splash-reveal', start, { once: true });
      setTimeout(start, 5000); // never wait forever
    } else start();
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(onLoaded);
    setTimeout(onLoaded, 1200); // fallback if fonts are slow
  } else {
    window.addEventListener('load', onLoaded);
  }

  /* ---------- Year ---------- */
  var y = $('#year'); if (y) y.textContent = new Date().getFullYear();

  /* ---------- Header, progress bar, back to top ---------- */
  var header = $('#header');
  var progress = $('.progress');
  var toTop = $('.to-top');
  var steps = $('.steps');
  var stepItems = $$('.step');

  function onScroll() {
    var sy = window.scrollY;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    header.classList.toggle('is-scrolled', sy > 20);
    progress.style.width = (max > 0 ? (sy / max) * 100 : 0) + '%';
    toTop.classList.toggle('is-visible', sy > 700);

    // Process timeline fill
    if (steps) {
      var r = steps.getBoundingClientRect();
      var mid = window.innerHeight * 0.6;
      var p = Math.min(1, Math.max(0, (mid - r.top) / r.height));
      steps.style.setProperty('--p', p.toFixed(3));
      stepItems.forEach(function (li) {
        li.classList.toggle('is-reached', li.getBoundingClientRect().top + 10 < mid);
      });
    }
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) { requestAnimationFrame(function () { onScroll(); ticking = false; }); ticking = true; }
  }, { passive: true });
  onScroll();

  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  /* ---------- Mobile menu ---------- */
  var toggle = $('.menu-toggle');
  var links = $('#nav-links');
  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    links.classList.toggle('is-open', open);
  }
  toggle.addEventListener('click', function () { setMenu(toggle.getAttribute('aria-expanded') !== 'true'); });
  $$('a', links).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  /* ---------- Services dropdown ---------- */
  $$('.nav-dd').forEach(function (dd) {
    var btn = $('.nav-dd-toggle', dd);
    function setDd(open) {
      dd.classList.toggle('is-open', open);
      dd.classList.toggle('is-closed', !open && dd.matches(':hover, :focus-within') && window.innerWidth > 860);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Hide services' : 'Show services');
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); setDd(!dd.classList.contains('is-open')); });
    dd.addEventListener('mouseleave', function () { dd.classList.remove('is-closed'); if (window.innerWidth > 860) setDd(false); });
    dd.addEventListener('focusout', function (e) { if (!dd.contains(e.relatedTarget)) { dd.classList.remove('is-closed'); if (window.innerWidth > 860) setDd(false); } });
    document.addEventListener('click', function (e) { if (!dd.contains(e.target) && window.innerWidth > 860) setDd(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dd.classList.contains('is-open')) { setDd(false); btn.focus(); }
    });
  });

  /* ---------- Active nav link on scroll ---------- */
  var navAnchors = $$('.nav-links a');
  // Only same-page links (#section) are highlighted on scroll
  var sections = navAnchors.map(function (a) {
    var h = a.getAttribute('href') || '';
    return /^#[\w-]+$/.test(h) ? document.getElementById(h.slice(1)) : null;
  }).filter(Boolean);
  if ('IntersectionObserver' in window) {
    var navObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var id = '#' + en.target.id;
          navAnchors.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === id); });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { navObs.observe(s); });
  }

  /* ---------- Scroll reveals + counters ---------- */
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    if (reduceMotion) { el.textContent = target; return; }
    var start = null, dur = 1600;
    function step(ts) {
      if (!start) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var revealEls = $$('.reveal, .reveal-img');
  var revealObs = null;
  if ('IntersectionObserver' in window && !reduceMotion) {
    revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        $$('[data-count]', en.target).forEach(countUp);
        revealObs.unobserve(en.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { revealObs.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
    $$('[data-count]').forEach(function (el) { el.textContent = el.getAttribute('data-count'); });
  }
  // During a live (background) update, redrawn cards appear instantly instead of animating in again.
  var instantReveal = false;
  function reveal(el) {
    if (instantReveal || !revealObs) { el.classList.add('is-in'); return; }
    revealObs.observe(el);
  }

  /* ---------- Hero slider ---------- */
  var slides = $$('.slide');
  var dots = $$('.slider-dots button');
  var current = 0, timer = null;
  function goTo(i) {
    current = (i + slides.length) % slides.length;
    slides.forEach(function (s, n) {
      s.classList.toggle('is-active', n === current);
      s.setAttribute('aria-hidden', String(n !== current));
    });
    dots.forEach(function (d, n) { d.setAttribute('aria-current', String(n === current)); });
  }
  function autoplay() {
    if (reduceMotion || !slides.length) return;
    clearInterval(timer);
    timer = setInterval(function () { goTo(current + 1); }, 5000);
  }
  dots.forEach(function (d, n) { d.addEventListener('click', function () { goTo(n); autoplay(); }); });
  var slider = $('.slider');
  if (slider) {
    slider.addEventListener('mouseenter', function () { clearInterval(timer); });
    slider.addEventListener('mouseleave', autoplay);
  }
  autoplay();

  /* ---------- Testimonials ---------- */
  var q = 0, qTimer = null;
  function showQuote(i) {
    var quotes = $$('.quote');
    if (!quotes.length) return;
    q = (i + quotes.length) % quotes.length;
    quotes.forEach(function (el, n) { el.classList.toggle('is-active', n === q); });
  }
  function qAuto() {
    clearInterval(qTimer);
    if (reduceMotion || $$('.quote').length < 2) return;
    qTimer = setInterval(function () { showQuote(q + 1); }, 7000);
  }
  $$('[data-testi]').forEach(function (b) {
    b.addEventListener('click', function () {
      showQuote(q + (b.getAttribute('data-testi') === 'next' ? 1 : -1));
      qAuto();
    });
  });
  qAuto();

  /* ---------- Infinite client logo marquee ---------- */
  var track = $('.marquee-track');
  if (track) {
    // Original logos = the slots that are not aria-hidden copies
    var originals = $$('.logo-slot', track).filter(function (el) { return el.getAttribute('aria-hidden') !== 'true'; })
      .map(function (el) { return el.cloneNode(true); });
    var SPEED = 60; // pixels per second

    function buildMarquee() {
      track.innerHTML = '';
      if (!originals.length) return; // nothing to scroll (avoids an endless loop)
      // 1. Fill one group until it is at least as wide as the screen
      var group = document.createDocumentFragment();
      var groupEls = [];
      var width = 0;
      var target = Math.max(window.innerWidth, 800);
      while (width < target || groupEls.length < originals.length) {
        originals.forEach(function (o) {
          var c = o.cloneNode(true);
          if (groupEls.length >= originals.length) c.setAttribute('aria-hidden', 'true');
          groupEls.push(c);
          track.appendChild(c);
        });
        width = track.scrollWidth;
        if (groupEls.length > 200) break;
      }
      // 2. Duplicate the whole group once; animating -50% then loops seamlessly
      groupEls.forEach(function (el) {
        var c = el.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        track.appendChild(c);
      });
      track.style.setProperty('--marquee-dur', (width / SPEED).toFixed(2) + 's');
    }
    buildMarquee();
    // Called after client logos load from the database
    window.__setMarqueeItems = function (items) { originals = items; buildMarquee(); };
    var mqTimer = null, lastW = window.innerWidth;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      clearTimeout(mqTimer);
      mqTimer = setTimeout(buildMarquee, 200);
    });
  }

  /* ---------- Shopify stores: loaded from the database ---------- */
  var SVG_ZOOM = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg>';
  var SVG_ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>';
  var slug = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other'; };
  var safeUrl = function (u) { return /^(https?:\/\/|\/(?!\/))/i.test(u || '') ? u : '#'; };

  // Builds one store card with DOM methods (no HTML strings from data, so names can't inject markup).
  function storeCard(s, i) {
    var pages = {};
    (s.pages || []).forEach(function (p) { pages[p.label] = p.image; });
    var first = (s.pages && s.pages[0]) ? s.pages[0].image : '';

    var art = document.createElement('article');
    art.className = 'store reveal';
    art.setAttribute('data-category', slug(s.category));
    if (i % 3) art.style.setProperty('--d', (i % 3) * 0.08 + 's');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'store-shot';
    btn.setAttribute('data-full', first);
    btn.setAttribute('data-title', s.name);
    btn.setAttribute('data-url', safeUrl(s.url));
    btn.setAttribute('data-pages', JSON.stringify(pages));
    btn.setAttribute('aria-label', 'View full screenshot of ' + s.name);
    if (first) {
      var img = document.createElement('img');
      img.src = first; img.alt = s.name + ' homepage'; img.loading = 'lazy';
      btn.appendChild(img);
    }
    var zoom = document.createElement('span');
    zoom.className = 'store-zoom'; zoom.setAttribute('aria-hidden', 'true');
    zoom.innerHTML = SVG_ZOOM; zoom.appendChild(document.createTextNode('View full site'));
    btn.appendChild(zoom);

    var info = document.createElement('div');
    info.className = 'store-info';
    var txt = document.createElement('div');
    var h3 = document.createElement('h3'); h3.textContent = s.name;
    var p = document.createElement('p'); p.textContent = s.category || '';
    txt.appendChild(h3); txt.appendChild(p);
    info.appendChild(txt);
    if (s.url) {
      var a = document.createElement('a');
      a.href = safeUrl(s.url); a.target = '_blank'; a.rel = 'noopener'; a.className = 'round-link';
      a.setAttribute('aria-label', 'Visit ' + s.name + ' (opens in a new tab)');
      a.innerHTML = SVG_ARROW;
      info.appendChild(a);
    }
    art.appendChild(btn); art.appendChild(info);
    return art;
  }

  // Hover scroll distance: move the screenshot so its bottom reaches the frame
  function setScrollDistance(btn) {
    var img = $('img', btn);
    if (!img || !img.naturalWidth) return;
    var frameH = btn.clientHeight - 26;
    var imgH = btn.clientWidth * (img.naturalHeight / img.naturalWidth);
    btn.style.setProperty('--scroll', '-' + Math.max(0, imgH - frameH).toFixed(0) + 'px');
  }
  function prepShots() {
    $$('.store-shot').forEach(function (btn) {
      var img = $('img', btn);
      if (!img) return;
      if (img.complete) setScrollDistance(btn); else img.addEventListener('load', function () { setScrollDistance(btn); }, { once: true });
    });
  }
  window.addEventListener('resize', function () { $$('.store-shot').forEach(setScrollDistance); });

  /* ---------- Filters (stores page), built from the store categories ---------- */
  function buildFilters(stores) {
    var bar = $('.filters');
    if (!bar) return;
    var seen = {};
    var cats = [];
    stores.forEach(function (s) {
      var k = slug(s.category);
      if (s.category && !seen[k]) { seen[k] = 1; cats.push({ key: k, label: s.category }); }
    });
    bar.innerHTML = '';
    [{ key: 'all', label: 'All' }].concat(cats).forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'filter';
      b.setAttribute('data-filter', c.key);
      b.setAttribute('aria-pressed', String(c.key === 'all'));
      b.textContent = c.label;
      bar.appendChild(b);
    });
    $('.filter-bar').hidden = stores.length === 0;
  }
  function setCount(n) {
    var el = $('.store-count');
    if (el) el.textContent = n + (n === 1 ? ' store' : ' stores');
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-filter]');
    if (!btn) return;
    var f = btn.getAttribute('data-filter');
    $$('[data-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
    var n = 0;
    $$('.store[data-category]').forEach(function (s) {
      var show = f === 'all' || s.getAttribute('data-category') === f;
      s.hidden = !show;
      if (show) {
        s.style.setProperty('--d', (n % 3) * 0.08 + 's');
        n++;
        s.classList.remove('is-in');
        requestAnimationFrame(function () { requestAnimationFrame(function () { s.classList.add('is-in'); }); });
      }
    });
    setCount(n);
  });

  // Load stores from /api/stores. If the API isn't reachable (e.g. opening the file locally),
  // the cards already written in the HTML stay as a fallback.
  var storeGrid = $('[data-stores]');
  var storesSig = '';
  function loadPublicStores(silent) {
    var mode = storeGrid.getAttribute('data-stores');
    return fetch('/api/stores' + (mode === 'featured' ? '?featured=1' : ''), { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        var stores = data.stores || [];
        var sig = JSON.stringify(stores);
        if (silent && sig === storesSig) return; // nothing changed
        storesSig = sig;
        var activeFilter = ($('[data-filter][aria-pressed="true"]') || {}).getAttribute ? $('[data-filter][aria-pressed="true"]').getAttribute('data-filter') : 'all';
        instantReveal = !!silent;
        storeGrid.innerHTML = '';
        stores.forEach(function (s, i) {
          var card = storeCard(s, i);
          storeGrid.appendChild(card);
          reveal(card);
        });
        var empty = $('.stores-empty');
        if (mode === 'featured') {
          var section = storeGrid.closest('section');
          if (section) section.hidden = stores.length === 0;
        } else {
          buildFilters(stores);
          setCount(stores.length);
          if (empty) empty.hidden = stores.length > 0;
          // Keep the visitor's category filter after a live update
          var keep = silent && activeFilter !== 'all' && $('[data-filter="' + activeFilter + '"]');
          if (keep) keep.click();
        }
        instantReveal = false;
        prepShots();
      })
      .catch(function () { instantReveal = false; if (!silent) prepShots(); });
  }
  if (storeGrid) loadPublicStores(false); else prepShots();

  /* ---------- Homepage sections loaded from /admin > Content ---------- */
  var SERVICE_ICONS = {
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    code: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M9 10l-2 2 2 2M15 10l2 2-2 2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11.5l2-8H6.2"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'
  };
  function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function media(src, alt, label) {
    if (src) { var i = node('img'); i.src = safeUrl(src); i.alt = alt || ''; i.loading = 'lazy'; return i; }
    return node('div', 'ph', label);
  }
  function arrowLink(href, label, cls) {
    var a = node('a', cls || 'round-link');
    a.href = safeUrl(href);
    if (/^https?:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
    a.setAttribute('aria-label', label);
    a.innerHTML = SVG_ARROW;
    return a;
  }
  function textLink(href, text) {
    var a = arrowLink(href, text, 'text-link');
    a.removeAttribute('aria-label');
    a.insertBefore(document.createTextNode(text + ' '), a.firstChild);
    return a;
  }

  function projectCard(p) {
    var art = node('article', 'project reveal');
    var m = node('div', 'project-media');
    var card = node('div', 'project-card');
    var t = node('div'); t.appendChild(node('h3', null, p.title)); t.appendChild(node('p', null, p.tags || ''));
    card.appendChild(t);
    if (p.image) {
      var pages = {};
      [['Overview', p.image], ['Results', p.image2], ['Details', p.image3]].forEach(function (x) { if (x[1]) pages[x[0]] = safeUrl(x[1]); });
      var b = node('button', 'project-shot'); b.type = 'button';
      b.setAttribute('data-full', safeUrl(p.image));
      b.setAttribute('data-title', p.title);
      b.setAttribute('data-url', p.url ? safeUrl(p.url) : '');
      b.setAttribute('data-pages', JSON.stringify(pages));
      b.setAttribute('aria-label', 'View ' + p.title);
      b.appendChild(media(p.image, p.title, 'Project image'));
      var z = node('span', 'store-zoom'); z.setAttribute('aria-hidden', 'true');
      z.innerHTML = SVG_ZOOM; z.appendChild(document.createTextNode('View project'));
      b.appendChild(z); m.appendChild(b);
      var open = node('button', 'round-link'); open.type = 'button'; open.setAttribute('aria-label', 'View ' + p.title);
      open.innerHTML = SVG_ARROW; open.addEventListener('click', function () { b.click(); });
      card.appendChild(open);
    } else {
      m.appendChild(media(p.image, p.title, 'Project image'));
      if (p.url) card.appendChild(arrowLink(p.url, 'View ' + p.title));
    }
    art.appendChild(m); art.appendChild(card);
    return art;
  }
  function renderProjects(grid, items) {
    var cols = $$('.work-col', grid);
    if (cols.length < 2) return;
    $$('.project', grid).forEach(function (n) { n.remove(); });
    var cta = $('.work-cta', cols[1]);
    // Homepage shows 3 projects: the ones marked "Show on homepage", or the first 3 if none are marked.
    var picked = items.filter(function (p) { return p.featured; });
    items = (picked.length ? picked : items).slice(0, 3);
    items.forEach(function (p, i) {
      var card = projectCard(p);
      // Layout: 1st and 2nd in the left column, 3rd on the right, then alternate.
      var right = i === 2 || (i > 2 && i % 2 === 1);
      if (right) cols[1].insertBefore(card, cta); else cols[0].appendChild(card);
      reveal(card);
    });
  }
  function renderServices(box, items) {
    box.replaceChildren();
    items.forEach(function (s, i) {
      var art = node('article', 'service reveal');
      if (i % 3) art.style.setProperty('--d', (i % 3) * 0.1 + 's');
      var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'service-icon'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '1.5'); icon.setAttribute('stroke-linecap', 'round'); icon.setAttribute('stroke-linejoin', 'round');
      icon.innerHTML = SERVICE_ICONS[s.icon] || SERVICE_ICONS.layout;
      art.appendChild(icon);
      art.appendChild(node('h3', null, s.title));
      var ul = node('ul');
      (s.items || []).forEach(function (x) { ul.appendChild(node('li', null, x)); });
      art.appendChild(ul);
      art.appendChild(textLink(s.url || '/contact', 'Explore More'));
      box.appendChild(art);
      reveal(art);
    });
  }
  function renderTestimonials(box, items) {
    var section = box.closest('section');
    if (!items.length) { if (section) section.hidden = true; return; }
    box.replaceChildren();
    items.forEach(function (t, i) {
      var fig = node('figure', 'quote' + (i === 0 ? ' is-active' : ''));
      fig.appendChild(node('blockquote', null, '\u201C' + t.quote + '\u201D'));
      var cap = node('figcaption');
      if (t.avatar) { var im = node('img', 'avatar'); im.src = safeUrl(t.avatar); im.alt = ''; cap.appendChild(im); }
      else cap.appendChild(node('span', 'avatar'));
      var who = node('div'); who.appendChild(node('strong', null, t.name)); who.appendChild(node('span', null, t.role || ''));
      cap.appendChild(who); fig.appendChild(cap); box.appendChild(fig);
    });
    q = 0;
    var ctrls = $('.testi-controls'); if (ctrls) ctrls.hidden = items.length < 2;
    qAuto();
  }
  function renderClients(items) {
    var section = $('.clients');
    if (!items.length) { if (section) section.hidden = true; return; }
    var els = items.map(function (c) {
      var slot = node(c.url ? 'a' : 'div', 'logo-slot' + (c.logo ? ' has-logo' : ''));
      if (c.url) { slot.href = safeUrl(c.url); slot.target = '_blank'; slot.rel = 'noopener'; }
      if (c.logo) { var im = node('img'); im.src = safeUrl(c.logo); im.alt = c.name; slot.appendChild(im); }
      else slot.textContent = c.name;
      return slot;
    });
    if (window.__setMarqueeItems) window.__setMarqueeItems(els);
  }
  // Meet Our Team: homepage shows up to data-limit members (the ones marked "Show on homepage",
  // or the first ones in list order); the About page shows everyone, with bios.
  var SOCIAL_ICONS = {
    linkedin: ['LinkedIn', '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>'],
    facebook: ['Facebook', '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>'],
    instagram: ['Instagram', '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>'],
    website: ['Website', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>']
  };
  function initials(name) {
    return String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
  }
  function memberCard(m, i, withBio) {
    var art = node('article', 'member reveal');
    art.style.setProperty('--d', (i % 4) * 0.08 + 's');
    var ph = node('div', 'member-photo');
    if (m.photo) {
      var im = node('img'); im.src = safeUrl(m.photo); im.loading = 'lazy'; im.decoding = 'async';
      im.alt = m.name + (m.role ? ', ' + m.role : '');
      ph.appendChild(im);
    } else {
      var ini = node('span', 'member-initials', initials(m.name)); ini.setAttribute('aria-hidden', 'true');
      ph.appendChild(ini);
    }
    ph.appendChild(node('span', 'member-shade'));
    var links = Object.keys(SOCIAL_ICONS).filter(function (k) { return m[k]; });
    if (links.length) {
      var ul = node('ul', 'member-social');
      links.forEach(function (k) {
        var li = node('li'), a = node('a');
        a.href = safeUrl(m[k]); a.target = '_blank'; a.rel = 'noopener';
        a.setAttribute('aria-label', m.name + ' on ' + SOCIAL_ICONS[k][0]);
        a.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SOCIAL_ICONS[k][1] + '</svg>';
        li.appendChild(a); ul.appendChild(li);
      });
      ph.appendChild(ul);
    }
    art.appendChild(ph);
    var info = node('div', 'member-info');
    info.appendChild(node('span', 'member-num', (i + 1 < 10 ? '0' : '') + (i + 1)));
    info.appendChild(node('h3', null, m.name));
    if (m.role) info.appendChild(node('p', 'member-role', m.role));
    if (withBio && m.bio) info.appendChild(node('p', 'member-bio', m.bio));
    art.appendChild(info);
    return art;
  }
  function renderTeam(box, items) {
    var section = box.closest('section');
    if (!items.length) { if (section) section.hidden = true; return; }
    if (section) section.hidden = false;
    var limit = parseInt(box.getAttribute('data-limit'), 10) || 0;
    var list = items;
    if (limit) {
      var picked = items.filter(function (m) { return m.featured; });
      list = (picked.length ? picked : items).slice(0, limit);
    }
    var withBio = box.getAttribute('data-bios') === '1';
    box.classList.toggle('team-grid--few', list.length < 3);
    box.replaceChildren();
    list.forEach(function (m, i) { var c = memberCard(m, i, withBio); box.appendChild(c); reveal(c); });
    var more = section && $('.team-more', section);
    if (more) more.hidden = list.length >= items.length;
    // Links to /about#team land before the section exists, so scroll once it is drawn.
    if (section && section.id && location.hash === '#' + section.id && !box.__scrolled) {
      box.__scrolled = true;
      requestAnimationFrame(function () { section.scrollIntoView({ block: 'start' }); });
    }
  }
  function postHref(p) { return '/blog?post=' + p.id; }
  function fmtPostDate(d) {
    if (!d) return '';
    var parts = d.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function renderPosts(box, items) {
    var section = box.closest('section');
    if (!items.length) { if (section) section.hidden = true; return; }
    box.replaceChildren();
    items.slice(0, 2).forEach(function (p, i) {
      var art = node('article', 'post' + (i % 2 ? ' post--rev' : ''));
      var m = node('a', 'post-media reveal-img'); m.href = safeUrl(postHref(p)); m.tabIndex = -1; m.setAttribute('aria-hidden', 'true');
      m.appendChild(media(p.image, '', 'Article image'));
      var body = node('div', 'post-body reveal');
      body.appendChild(node('span', 'eyebrow', 'Recent Article'));
      body.appendChild(node('h3', null, p.title));
      if (p.summary) body.appendChild(node('p', null, p.summary));
      body.appendChild(textLink(postHref(p), 'Read the Article'));
      if (i % 2) { art.appendChild(body); art.appendChild(m); } else { art.appendChild(m); art.appendChild(body); }
      box.appendChild(art);
      reveal(m); reveal(body);
    });
  }


  /* ---------- Work page ---------- */
  function renderWork(w) {
    $$('[data-w]').forEach(function (n) {
      var v = w[n.getAttribute('data-w')];
      if (v == null) return;
      n.textContent = v;
      var wrap = n.closest('.line') || n; wrap.hidden = !v;
    });
    $$('[data-w-href]').forEach(function (a) { var v = w[a.getAttribute('data-w-href')]; if (v) a.href = safeUrl(v); });
    var box = $('[data-w-stats]');
    if (box) {
      var sec = box.closest('section'); sec.hidden = !(w.stats || []).length;
      if ((w.stats || []).length) {
        box.replaceChildren();
        w.stats.forEach(function (x) { var d = node('div'); d.appendChild(node('b', null, x.value)); d.appendChild(node('span', null, x.label)); box.appendChild(d); });
      }
    }
  }
  function renderCases(box, items) {
    var section = box.closest('section'); if (section) section.hidden = !items.length;
    box.replaceChildren();
    items.forEach(function (c, i) {
      var art = node('article', 'case-card reveal');
      if (i % 2) art.style.setProperty('--d', '.1s');
      if (c.tag) art.appendChild(node('span', 'case-tag', c.tag));
      art.appendChild(node('h3', null, c.name));
      if (c.subtitle) art.appendChild(node('p', 'case-sub', c.subtitle));
      art.appendChild(node('div', 'case-big', c.big));
      if (c.bigCaption) art.appendChild(node('p', 'case-cap', c.bigCaption));
      if (c.barPercent > 0) {
        var bar = node('div', 'case-bar'), track = node('div'), fill = node('i');
        fill.style.width = c.barPercent + '%'; track.appendChild(fill); bar.appendChild(track);
        if (c.barLeft || c.barRight) { var lab = node('small'); lab.appendChild(node('span', null, c.barLeft || '')); lab.appendChild(node('span', null, c.barRight || '')); bar.appendChild(lab); }
        art.appendChild(bar);
      }
      if ((c.stats || []).length) {
        var st = node('div', 'case-stats');
        c.stats.forEach(function (line) {
          var p = String(line).split('|'), d = node('div');
          d.appendChild(node('b', null, p[0].trim())); d.appendChild(node('span', null, (p[1] || '').trim())); st.appendChild(d);
        });
        art.appendChild(st);
      }
      box.appendChild(art); reveal(art);
    });
  }
  function renderProjectGrid(box, items) {
    var section = box.closest('section'); if (section) section.hidden = !items.length;
    box.replaceChildren();
    items.forEach(function (p, i) {
      var card;
      if (p.image) {
        // Same card, hover scroll and popup as the Shopify stores
        var pages = [{ label: 'Overview', image: p.image }];
        if (p.image2) pages.push({ label: 'Results', image: p.image2 });
        if (p.image3) pages.push({ label: 'Details', image: p.image3 });
        card = storeCard({ name: p.title, category: p.tags || '', url: p.url || '', pages: pages }, i);
        card.removeAttribute('data-category');
      } else {
        card = projectCard(p);
      }
      box.appendChild(card); reveal(card);
    });
    prepShots();
  }

  // Each section is redrawn only when its own items change, so carousels and the logo strip
  // keep running smoothly between live updates.
  var contentSig = {};
  function changed(type, items) {
    var sig = JSON.stringify(items || []);
    if (contentSig[type] === sig) return false;
    contentSig[type] = sig;
    return true;
  }
  function unhide(box, items) {
    var section = box && box.closest('section');
    if (section && items.length) section.hidden = false;
  }
  function loadPublicContent(silent) {
    return fetch('/api/content', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (c) {
        instantReveal = !!silent;
        var g = $('[data-content="project"]'); if (g && changed('project', c.project)) renderProjects(g, c.project || []);
        var wk = $('[data-work-page]'); if (wk && c.work && changed('work', c.work)) renderWork(c.work);
        var cs = $('[data-content="case"]'); if (cs && changed('case', c.case)) renderCases(cs, c.case || []);
        var pg = $('[data-content="projectgrid"]'); if (pg && changed('projectgrid', c.project)) renderProjectGrid(pg, c.project || []);
        var s = $('[data-content="service"]'); if (s && changed('service', c.service)) renderServices(s, c.service || []);
        var t = $('[data-content="testimonial"]'); if (t && changed('testimonial', c.testimonial)) { unhide(t, c.testimonial || []); renderTestimonials(t, c.testimonial || []); }
        var cl = $('[data-content="client"]'); if (cl && changed('client', c.client)) { var sec = $('.clients'); if (sec && (c.client || []).length) sec.hidden = false; renderClients(c.client || []); }
        var tm = $('[data-content="member"]'); if (tm && changed('member', c.member)) renderTeam(tm, c.member || []);
        var p = $('[data-content="post"]'); if (p && changed('post', c.post)) { unhide(p, c.post || []); renderPosts(p, c.post || []); }
        instantReveal = false;
      })
      .catch(function () { instantReveal = false; /* keep what is on screen */ });
  }
  if ($('[data-content]')) loadPublicContent(false);

  /* ---------- Live updates (no refresh needed) ----------
     Stores and homepage sections re-check the server every 30 seconds while the tab is visible,
     and straight away when the visitor comes back to the tab. Nothing redraws unless it changed,
     and nothing redraws while the store preview is open. */
  var LIVE_MS = 30000;
  function liveUpdate() {
    if (document.hidden) return;
    var box = $('#lightbox');
    if (box && !box.hidden) return;
    if (storeGrid) loadPublicStores(true);
    if ($('[data-content]')) loadPublicContent(true);
  }
  if (storeGrid || $('[data-content]')) {
    setInterval(liveUpdate, LIVE_MS);
    document.addEventListener('visibilitychange', liveUpdate);
  }

  /* ---------- Newsletter sign-up (every page) ---------- */
  $$('[data-newsletter]').forEach(function (form) {
    var input = $('input[name="email"]', form);
    var btn = $('button[type="submit"]', form);
    var status = $('.newsletter-status', form);
    var label = btn.firstChild.textContent;
    function say(text, kind) {
      status.textContent = text;
      status.classList.toggle('is-ok', kind === 'ok');
      status.classList.toggle('is-err', kind === 'err');
    }
    input.addEventListener('input', function () { input.removeAttribute('aria-invalid'); if (status.classList.contains('is-err')) say(''); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        input.setAttribute('aria-invalid', 'true');
        say('Enter an email like name@company.com.', 'err');
        input.focus();
        return;
      }
      btn.disabled = true; btn.firstChild.textContent = 'Subscribing ';
      say('');
      fetch('/api/newsletter?action=subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email, page: location.pathname, website: form.website ? form.website.value : '' })
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'Something went wrong. Try again.'); return d; }); })
        .then(function (d) {
          var msg = d.status === 'already' ? "You're already subscribed. Thanks for being with us!"
            : d.status === 'resubscribed' ? "Welcome back! You're subscribed again."
            : "You're subscribed! Watch your inbox for our next email.";
          form.classList.add('is-done');
          say(msg, 'ok');
          input.value = '';
        })
        .catch(function (err) {
          say(err.message === 'Failed to fetch' ? 'Could not subscribe. Check your connection and try again.' : err.message, 'err');
        })
        .then(function () { btn.disabled = false; btn.firstChild.textContent = label; });
    });
  });

  /* ---------- Lightbox with page tabs ---------- */
  var lb = $('#lightbox');
  if (lb) {
    var lbImg = $('.lightbox-scroll img', lb);
    var lbScroll = $('.lightbox-scroll', lb);
    var lbTitle = $('#lightbox-title', lb);
    var lbVisit = $('.lightbox-visit', lb);
    var lbPanel = $('.lightbox-panel', lb);
    var lbTabs = $('.lightbox-tabs', lb);
    var lbIndex = 0, lastFocus = null, currentPage = 'Homepage', lbGroup = '.store-shot';

    var visibleShots = function () {
      return $$(lbGroup).filter(function (s) { var st = s.closest('.store'); return !st || !st.hidden; });
    };
    function pagesFor(b) {
      var pages = null;
      try { pages = JSON.parse(b.getAttribute('data-pages') || 'null'); } catch (e) { pages = null; }
      if (!pages || !Object.keys(pages).length) pages = { Homepage: b.getAttribute('data-full') };
      return pages;
    }
    function showPage(name, pages, title) {
      currentPage = name;
      lbImg.classList.remove('is-ready');
      lbImg.onload = function () { lbImg.classList.add('is-ready'); };
      lbImg.src = pages[name];
      lbImg.alt = name + ' screenshot of ' + title;
      if (lbImg.complete && lbImg.naturalWidth) lbImg.classList.add('is-ready');
      lbScroll.scrollTop = 0;
      $$('[role="tab"]', lbTabs).forEach(function (t) {
        var on = t.getAttribute('data-page') === name;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
    }
    function buildTabs(pages, title) {
      lbTabs.innerHTML = '';
      var names = Object.keys(pages);
      lbTabs.hidden = names.length < 2;
      names.forEach(function (name) {
        var t = document.createElement('button');
        t.type = 'button'; t.className = 'lightbox-tab';
        t.setAttribute('role', 'tab'); t.setAttribute('data-page', name);
        t.textContent = name;
        t.addEventListener('click', function () { showPage(name, pages, title); });
        lbTabs.appendChild(t);
      });
    }
    lbTabs.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var all = $$('[role="tab"]', lbTabs);
      var idx = all.indexOf(document.activeElement);
      var next = all[(idx + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
      next.focus(); next.click();
    });
    function load(i) {
      var list = visibleShots();
      if (!list.length) return;
      lbIndex = (i + list.length) % list.length;
      var b = list[lbIndex];
      var title = b.getAttribute('data-title');
      var pages = pagesFor(b);
      buildTabs(pages, title);
      // keep the same page type when switching stores, if that store has it
      showPage(pages[currentPage] ? currentPage : Object.keys(pages)[0], pages, title);
      lbTitle.textContent = title;
      var vu = b.getAttribute('data-url') || '';
      lbVisit.href = vu || '#'; lbVisit.hidden = !vu;
    }
    function open(btn) {
      lastFocus = document.activeElement;
      lbGroup = btn.classList.contains('project-shot') ? '.project-shot' : '.store-shot';
      currentPage = '';
      var r = btn.getBoundingClientRect();
      load(visibleShots().indexOf(btn));
      lb.hidden = false;
      document.body.classList.add('lightbox-open');
      requestAnimationFrame(function () {
        // Zoom out of the clicked card
        var pr = lbPanel.getBoundingClientRect();
        lbPanel.style.setProperty('--ox', (r.left + r.width / 2 - pr.left) + 'px');
        lbPanel.style.setProperty('--oy', (r.top + r.height / 2 - pr.top) + 'px');
        requestAnimationFrame(function () { lb.classList.add('is-open'); });
      });
      $('[data-close].lightbox-btn', lb).focus();
    }
    function close() {
      lb.classList.remove('is-open');
      document.body.classList.remove('lightbox-open');
      setTimeout(function () { lb.hidden = true; }, reduceMotion ? 0 : 400);
      if (lastFocus) lastFocus.focus();
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.store-shot, .project-shot');
      if (b) open(b);
    });
    $$('[data-close]', lb).forEach(function (el) { el.addEventListener('click', close); });
    $$('[data-nav]', lb).forEach(function (el) {
      el.addEventListener('click', function () { load(lbIndex + parseInt(el.getAttribute('data-nav'), 10)); });
    });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.target.closest && e.target.closest('.lightbox-tabs') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') load(lbIndex + 1);
      else if (e.key === 'ArrowLeft') load(lbIndex - 1);
      else if (e.key === 'Tab') {
        var f = $$('a[href], button, [tabindex="0"]', lb).filter(function (el) { return el.offsetParent !== null; });
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------- Subtle parallax on ghost words ---------- */
  if (!reduceMotion && window.matchMedia('(min-width: 861px)').matches) {
    var ghosts = $$('.about .ghost-word, .work-head .ghost-word');
    window.addEventListener('scroll', function () {
      ghosts.forEach(function (g) {
        var r = g.getBoundingClientRect();
        var off = (r.top - window.innerHeight / 2) * -0.08;
        g.style.transform = 'translateX(' + off.toFixed(1) + 'px)';
      });
    }, { passive: true });
  }

  /* ---------- Contact forms (homepage + contact page) ---------- */
  $$('.js-contact-form').forEach(function (form) {
    var status = $('.form-status', form);
    var submitBtn = $('button[type="submit"]', form);

    function setError(input, msg) {
      var field = input.closest('.field');
      field.classList.toggle('has-error', !!msg);
      $('.field-error', field).textContent = msg || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    function labelText(el) {
      return el.closest('.field').firstChild.textContent.replace('*', '').trim().toLowerCase();
    }
    function validate() {
      var ok = true;
      $$('input[type="text"], input[type="email"], input[type="tel"], textarea', form).forEach(function (el) {
        var msg = '';
        var v = el.value.trim();
        if (el.required && !v) msg = el.getAttribute('data-error') || ('Enter your ' + labelText(el) + '.');
        else if (el.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = 'Enter an email like name@company.com.';
        else if (el.type === 'tel' && v && v.replace(/\D/g, '').length < 7) msg = 'Enter a phone number with at least 7 digits.';
        setError(el, msg);
        if (msg && ok) { el.focus(); ok = false; }
      });
      $$('.chip-group', form).forEach(function (g) {
        var picked = $$('input:checked', g).length > 0;
        g.classList.toggle('has-error', !picked);
        $('.field-error', g).textContent = picked ? '' : g.getAttribute('data-required');
        if (!picked && ok) { $('input', g).focus(); ok = false; }
      });
      return ok;
    }
    $$('.chip-group input', form).forEach(function (el) {
      el.addEventListener('change', function () {
        var g = el.closest('.chip-group');
        g.classList.remove('has-error');
        $('.field-error', g).textContent = '';
      });
    });
    $$('input[type="text"], input[type="email"], input[type="tel"], textarea', form).forEach(function (el) {
      el.addEventListener('input', function () { if (el.closest('.field').classList.contains('has-error')) setError(el, ''); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.className = 'form-status';
      status.textContent = '';
      if (!validate()) return;

      var data = new FormData(form);
      var endpoint = form.getAttribute('data-endpoint');
      var payload = {
        firstName: data.get('firstName'), lastName: data.get('lastName'),
        company: data.get('company'), helpWith: data.get('helpWith'),
        discuss: data.getAll('discuss'), budget: data.get('budget'),
        email: data.get('email'), phone: data.get('phone'),
        website: data.get('website') // hidden spam trap
      };

      if (!endpoint) {
        var to = form.getAttribute('data-email');
        var body = 'Name: ' + payload.firstName + ' ' + payload.lastName +
          '\nFrom: ' + (payload.company || '-') +
          '\nI need help with: ' + (payload.helpWith || '-') +
          '\nI\'d like to discuss: ' + payload.discuss.join(', ') +
          '\nMonthly budget: ' + payload.budget +
          '\nReply to: ' + payload.email +
          '\nCall me on: ' + payload.phone;
        window.location.href = 'mailto:' + to + '?subject=' + encodeURIComponent('New project enquiry') + '&body=' + encodeURIComponent(body);
        status.classList.add('is-ok');
        status.textContent = 'Your email app is opening with the message ready to send.';
        return;
      }

      submitBtn.classList.add('is-loading');
      submitBtn.firstChild.textContent = 'Sending ';
      fetch(endpoint, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (res) {
            if (!r.ok) throw new Error(res.error || 'Message not sent. Check your connection and try again.');
          });
        })
        .then(function () {
          form.reset();
          status.classList.add('is-ok');
          status.textContent = 'Message sent. We will reply within one business day.';
        })
        .catch(function (err) {
          status.classList.add('is-err');
          status.textContent = err && err.message && err.message !== 'Failed to fetch' ? err.message : 'Message not sent. Check your connection and try again.';
        })
        .then(function () {
          submitBtn.classList.remove('is-loading');
          submitBtn.firstChild.textContent = 'Send Message ';
        });
    });
  });
})();
