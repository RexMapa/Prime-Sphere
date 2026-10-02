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
  if ('IntersectionObserver' in window && !reduceMotion) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        $$('[data-count]', en.target).forEach(countUp);
        obs.unobserve(en.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { obs.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
    $$('[data-count]').forEach(function (el) { el.textContent = el.getAttribute('data-count'); });
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
    if (reduceMotion) return;
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
    if (reduceMotion) return;
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
    function validate() {
      var ok = true;
      $$('input, textarea', form).forEach(function (el) {
        var msg = '';
        var v = el.value.trim();
        if (el.required && !v) msg = 'Enter your ' + el.closest('.field').firstChild.textContent.trim().toLowerCase() + '.';
        else if (el.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = 'Enter an email like name@company.com.';
        setError(el, msg);
        if (msg && ok) { el.focus(); ok = false; }
      });
      return ok;
    }
    $$('input, textarea', form).forEach(function (el) {
      el.addEventListener('input', function () { if (el.closest('.field').classList.contains('has-error')) setError(el, ''); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.className = 'form-status';
      status.textContent = '';
      if (!validate()) return;

      var data = new FormData(form);
      var endpoint = form.getAttribute('data-endpoint');

      if (!endpoint) {
        var to = form.getAttribute('data-email');
        var body = 'Name: ' + data.get('firstName') + ' ' + data.get('lastName') +
          '\nEmail: ' + data.get('email') + '\nPhone: ' + data.get('phone') + '\n\n' + data.get('message');
        window.location.href = 'mailto:' + to + '?subject=' + encodeURIComponent('New project enquiry') + '&body=' + encodeURIComponent(body);
        status.classList.add('is-ok');
        status.textContent = 'Your email app is opening with the message ready to send.';
        return;
      }

      submitBtn.classList.add('is-loading');
      submitBtn.firstChild.textContent = 'Sending ';
      fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error();
          form.reset();
          status.classList.add('is-ok');
          status.textContent = 'Message sent. We will reply within one business day.';
        })
        .catch(function () {
          status.classList.add('is-err');
          status.textContent = 'Message not sent. Check your connection and try again.';
        })
        .then(function () {
          submitBtn.classList.remove('is-loading');
          submitBtn.firstChild.textContent = 'Send Message ';
        });
    });
  }
})();
