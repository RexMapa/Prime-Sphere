(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Page load sequence ---------- */
  function onLoaded() { document.body.classList.add('is-loaded'); }
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

  /* ---------- Active nav link on scroll ---------- */
  var navAnchors = $$('.nav-links a');
  var sections = navAnchors.map(function (a) { return $(a.getAttribute('href')); }).filter(Boolean);
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
  function reveal(el) { if (revealObs) revealObs.observe(el); else el.classList.add('is-in'); }

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
  var quotes = $$('.quote');
  var q = 0, qTimer = null;
  function showQuote(i) {
    q = (i + quotes.length) % quotes.length;
    quotes.forEach(function (el, n) { el.classList.toggle('is-active', n === q); });
  }
  function qAuto() {
    if (reduceMotion || !quotes.length) return;
    clearInterval(qTimer);
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
  if (storeGrid) {
    var mode = storeGrid.getAttribute('data-stores');
    fetch('/api/stores' + (mode === 'featured' ? '?featured=1' : ''), { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        var stores = data.stores || [];
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
        }
        prepShots();
      })
      .catch(function () { prepShots(); });
  } else {
    prepShots();
  }

  /* ---------- Lightbox with page tabs ---------- */
  var lb = $('#lightbox');
  if (lb) {
    var lbImg = $('.lightbox-scroll img', lb);
    var lbScroll = $('.lightbox-scroll', lb);
    var lbTitle = $('#lightbox-title', lb);
    var lbVisit = $('.lightbox-visit', lb);
    var lbPanel = $('.lightbox-panel', lb);
    var lbTabs = $('.lightbox-tabs', lb);
    var lbIndex = 0, lastFocus = null, currentPage = 'Homepage';

    var visibleShots = function () {
      return $$('.store-shot').filter(function (s) { var st = s.closest('.store'); return !st || !st.hidden; });
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
      lbVisit.href = b.getAttribute('data-url') || '#';
    }
    function open(btn) {
      lastFocus = document.activeElement;
      currentPage = 'Homepage';
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
      var b = e.target.closest && e.target.closest('.store-shot');
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

  /* ---------- Contact form ---------- */
  var form = $('#contact-form');
  if (form) {
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
  }
})();
