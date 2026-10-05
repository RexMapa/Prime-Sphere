/* PrimeSphere client space: sign in, onboarding, approval, payment and dashboard.
   One page; what you see follows your account status from /api/auth?scope=client. */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  // Element builder. Text always goes in with textContent; "html" is only used for our own icons.
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  var svg = function (body, size, sw) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  };
  var ICON = {
    eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M17.9 17.9A10 10 0 0 1 12 19c-6.4 0-10-7-10-7a18 18 0 0 1 5.1-5.9M9.9 5.2A9 9 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2M14.1 14.2a3 3 0 0 1-4.2-4.2M2 2l20 20"/>'),
    arrow: svg('<path d="M5 12h14M13 5l7 7-7 7"/>', 18).replace('<svg', '<svg class="c-arrow"'),
    back: svg('<path d="M19 12H5M12 19l-7-7 7-7"/>', 18),
    check: svg('<path d="M20 6L9 17l-5-5"/>', 12, 3.2),
    alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>', 16),
    upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>', 24, 1.8),
    portal: svg('<path d="M7 17L17 7"/><path d="M8 7h9v9"/>', 18, 2.2),
    spin: svg('<path d="M21 12a9 9 0 1 1-6.2-8.6"/>', 18, 2.4).replace('<svg', '<svg class="spin"')
  };
  var FIELDS = window.PS_ONBOARDING || [];
  var PORTAL = 'https://portal.primespheres.online/';
  var POLL_MS = 5000;
  var state = { me: null, draft: {}, step: 0, missing: [], poll: null, shownStatus: null, saveTimer: null, file: null };

  $$('[data-year]').forEach(function (n) { n.textContent = new Date().getFullYear(); });

  /* ---------- API ---------- */
  function api(action, opts) {
    opts = opts || {};
    var url = '/api/auth?scope=client' + (action ? '&action=' + action : '');
    var headers = { 'X-Requested-With': 'fetch', Accept: 'application/json' };
    if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(url, {
      method: opts.method || (action ? 'POST' : 'GET'),
      headers: headers, credentials: 'same-origin',
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401 && !opts.allow401) { stopPoll(); showAuth('login', 'Your session ended. Sign in again.'); }
        if (!r.ok) { var e = new Error(d.error || 'Something went wrong (' + r.status + ').'); e.status = r.status; e.missing = d.missing; throw e; }
        return d;
      });
    });
  }

  var toastTimer;
  function toast(msg, isErr) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('is-err', !!isErr);
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, isErr ? 5000 : 2600);
  }

  /* ---------- Sign in ---------- */
  function showAuth(mode, msg) {
    $('#boot').hidden = true;
    $('#app').hidden = true;
    $('#auth').hidden = false;
    $('#login-form').hidden = mode !== 'login';
    $('#pw-form').hidden = mode !== 'password';
    document.title = (mode === 'password' ? 'Create your password' : 'Client sign in') + ' | PrimeSphere';
    if (mode === 'login') {
      setError('#login-error', msg || '');
      setTimeout(function () { $('#login-email').focus({ preventScroll: true }); }, 50);
    } else {
      setError('#pw-error', msg || '');
      setTimeout(function () { $('#pw-new').focus({ preventScroll: true }); }, 50);
    }
  }
  function setError(slot, msg) {
    var s = $(slot);
    s.replaceChildren();
    if (msg) s.appendChild(el('div', { class: 'ps-error' }, [el('span', { html: ICON.alert }), el('span', { text: msg })]));
  }
  $$('[data-eye]').forEach(function (b) {
    var input = document.getElementById(b.getAttribute('data-eye'));
    b.innerHTML = ICON.eye;
    b.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.innerHTML = show ? ICON.eyeOff : ICON.eye;
      b.setAttribute('aria-pressed', String(show));
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
  function busy(btn, on, label) {
    var l = $('.ps-submit-label', btn);
    btn.disabled = on;
    if (on) { btn.dataset.label = l.textContent; l.innerHTML = ICON.spin + ' <span>' + label + '</span>'; }
    else l.textContent = btn.dataset.label || l.textContent;
  }

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, btn = $('.ps-submit', f);
    if (!f.email.value.trim() || !f.password.value) { setError('#login-error', 'Enter your email and password.'); return; }
    setError('#login-error', '');
    busy(btn, true, 'Signing in');
    api('login', { json: { email: f.email.value, password: f.password.value }, allow401: true })
      .then(function (me) { f.password.value = ''; route(me); })
      .catch(function (err) { setError('#login-error', err.message); f.password.select(); })
      .then(function () { busy(btn, false); });
  });

  function pwScore(pw) {
    if (!pw) return 0;
    var s = 0;
    if (pw.length >= 10) s++;
    if (pw.length >= 14) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
    return pw.length < 10 ? Math.min(s, 1) || 1 : Math.max(s, 2);
  }
  $('#pw-new').addEventListener('input', function (e) {
    var sc = pwScore(e.target.value);
    $('#pw-meter').setAttribute('data-score', String(sc));
    var left = 10 - e.target.value.length;
    $('#pw-hint').textContent = !e.target.value ? 'Use 10 or more characters. A short sentence works well.'
      : left > 0 ? left + ' more character' + (left === 1 ? '' : 's') + ' to go.'
      : sc >= 4 ? 'Strong password.' : 'Good. Longer is even stronger.';
  });
  $('#pw-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, btn = $('.ps-submit', f);
    if (f.password.value.length < 10) { setError('#pw-error', 'Use at least 10 characters for your password.'); return; }
    if (f.password.value !== f.confirm.value) { setError('#pw-error', "The two passwords don't match."); f.confirm.select(); return; }
    setError('#pw-error', '');
    busy(btn, true, 'Saving');
    api('set-password', { json: { password: f.password.value } })
      .then(function (me) { f.reset(); $('#pw-meter').setAttribute('data-score', '0'); toast('Password saved.'); route(me); })
      .catch(function (err) { setError('#pw-error', err.message); })
      .then(function () { busy(btn, false); });
  });

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-logout]');
    if (!t) return;
    e.preventDefault();
    stopPoll();
    api('logout', { allow401: true }).catch(function () {}).then(function () {
      state.me = null; state.shownStatus = null;
      showAuth('login', '');
      toast('You are signed out.');
    });
  });

  /* ---------- Routing by status ---------- */
  var ORDER = ['onboarding', 'review', 'payment', 'payment_review', 'active'];
  function route(me) {
    var prev = state.shownStatus;
    state.me = me;
    if (me.mustChangePassword) { showAuth('password'); return; }
    $('#boot').hidden = true;
    $('#auth').hidden = true;
    $('#app').hidden = false;
    $('#avatar').textContent = (me.name || me.email || '?').trim().charAt(0).toUpperCase();
    $('#avatar').title = me.name + ' · ' + me.email;
    renderJourney(me.status);

    // Moving forward from a waiting screen gets a short "approved" moment first.
    if (prev === 'review' && me.status === 'payment') return celebrate('Onboarding approved', 'Your payment details are ready.', function () { show(me); });
    if (prev === 'payment_review' && me.status === 'active') return celebrate('Payment confirmed', 'Welcome to PrimeSphere.', function () { show(me); });
    if (prev === me.status && (me.status === 'review' || me.status === 'payment_review')) return; // still waiting, nothing to redraw
    show(me);
  }
  function show(me) {
    state.shownStatus = me.status;
    stopPoll();
    var s = me.status === 'invited' ? 'onboarding' : me.status;
    if (s === 'onboarding') renderOnboarding();
    else if (s === 'review') renderWait('review');
    else if (s === 'payment') renderPayment();
    else if (s === 'payment_review') renderWait('payment_review');
    else renderDashboard();
    if (s === 'review' || s === 'payment_review') startPoll(POLL_MS);
    else if (s === 'payment') startPoll(20000); // the payment request can be updated by our team
    window.scrollTo({ top: 0 });
  }
  function renderJourney(status) {
    var at = ORDER.indexOf(status === 'invited' ? 'onboarding' : status);
    $$('#journey li').forEach(function (li, i) {
      li.setAttribute('data-state', i < at ? 'done' : i === at ? 'now' : 'next');
      if (i === at) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  }

  function startPoll(ms) {
    stopPoll();
    var tick = function () {
      if (!document.hidden) {
        api('', { allow401: false }).then(function (me) {
          var changed = me.status !== state.me.status || JSON.stringify(me.invoice) !== JSON.stringify(state.me.invoice) || me.adminNote !== state.me.adminNote;
          if (!changed) return;
          if (me.status === state.me.status && me.status === 'payment') { state.me = me; renderPayment(true); return; }
          route(me);
        }).catch(function () {});
      }
      state.poll = setTimeout(tick, ms);
    };
    state.poll = setTimeout(tick, ms);
  }
  function stopPoll() { clearTimeout(state.poll); state.poll = null; }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !state.me || $('#app').hidden) return;
    var s = state.me.status;
    if (s === 'review' || s === 'payment_review' || s === 'payment') {
      api('').then(function (me) { if (me.status !== s) route(me); }).catch(function () {});
    }
  });

  function celebrate(title, text, next) {
    stopPoll();
    var o = el('div', { class: 'c-done', role: 'status' }, [
      el('div', { class: 'c-card c-done-card' }, [
        el('span', { html: '<svg width="76" height="76" viewBox="0 0 76 76" fill="none"><circle cx="38" cy="38" r="34" stroke="url(#cg)" stroke-width="3" pathLength="1"/><path d="M24 39l9 9 19-20" stroke="#4ED19A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/><defs><linearGradient id="cg" x1="0" y1="0" x2="76" y2="76"><stop stop-color="#7FD8FF"/><stop offset="1" stop-color="#4ED19A"/></linearGradient></defs></svg>' }),
        el('h2', { text: title }),
        el('p', { text: text })
      ])
    ]);
    document.body.appendChild(o);
    setTimeout(function () { o.style.transition = 'opacity .35s'; o.style.opacity = '0'; next(); setTimeout(function () { o.remove(); }, 380); }, 1700);
  }

  function screen(children) {
    var s = el('div', { class: 'c-screen' }, children);
    $('#main').replaceChildren(s);
    // After the first screen, later screens shouldn't wait for the splash.
    document.querySelector('.c-app').style.setProperty('--ps-d', '0s');
    return s;
  }
  function firstName() { return String((state.me.onboarding && state.me.onboarding.fullName) || state.me.name || '').trim().split(/\s+/)[0] || 'there'; }

  /* =========================================================
     Onboarding
     ========================================================= */
  function isEmpty(v) { return Array.isArray(v) ? !v.length : typeof v === 'boolean' ? !v : !v || !String(v).trim(); }
  function stepMissing(i) {
    return FIELDS[i].fields.filter(function (f) { return f.required && isEmpty(state.draft[f.key]); }).map(function (f) { return f.key; });
  }
  function progress() {
    var req = 0, done = 0;
    FIELDS.forEach(function (s) { s.fields.forEach(function (f) { if (f.required) { req++; if (!isEmpty(state.draft[f.key])) done++; } }); });
    return req ? Math.round(done / req * 100) : 0;
  }

  function renderOnboarding() {
    document.title = 'Onboarding | PrimeSphere';
    var me = state.me;
    state.draft = Object.assign({}, me.onboarding || {});
    if (!state.draft.fullName && me.name) state.draft.fullName = me.name;
    if (!state.draft.businessName && me.company) state.draft.businessName = me.company;
    if (!state.draft.billingEmail && me.email) state.draft.billingEmail = me.email;
    state.step = Math.min(state.step, FIELDS.length);

    var nav = el('ol', { id: 'steps' });
    var wrap = el('div', { class: 'c-onb' }, [
      el('aside', { class: 'c-card c-steps', 'aria-label': 'Onboarding steps' }, [
        nav,
        el('div', { class: 'c-steps-meter' }, [el('span', { id: 'meter-label' }), el('i', { id: 'meter' })])
      ]),
      el('section', { class: 'c-card c-form', id: 'form', 'aria-live': 'polite' })
    ]);
    screen([
      el('div', { class: 'c-head' }, [
        el('h1', { text: me.onboarding && Object.keys(me.onboarding).length > 2 ? 'Welcome back, ' + firstName() : 'Welcome, ' + firstName() }),
        el('p', { text: 'Tell us about you and your business so we can set everything up. It takes about 10 minutes, and your answers save as you go.' })
      ]),
      me.adminNote ? el('div', { class: 'c-banner c-banner--warn', role: 'note' }, [el('span', { html: ICON.alert }), el('div', {}, [el('strong', { text: 'Our team asked for a few changes' }), document.createTextNode(me.adminNote)])]) : null,
      wrap
    ]);
    drawSteps();
    drawPane('next');
  }

  function drawSteps() {
    var nav = $('#steps');
    var items = FIELDS.map(function (s, i) {
      var miss = state.missing.length && stepMissing(i).length;
      return el('li', {}, [el('button', {
        type: 'button', class: 'c-step-btn', 'aria-current': state.step === i ? 'step' : null,
        'data-done': String(!stepMissing(i).length && !miss), 'data-missing': String(!!miss),
        onclick: function () { go(i); }
      }, [el('b', { html: !stepMissing(i).length ? ICON.check : null, text: stepMissing(i).length ? String(i + 1) : null }), el('span', { text: s.title })])]);
    });
    items.push(el('li', {}, [el('button', {
      type: 'button', class: 'c-step-btn', 'aria-current': state.step === FIELDS.length ? 'step' : null,
      onclick: function () { go(FIELDS.length); }
    }, [el('b', { text: String(FIELDS.length + 1) }), el('span', { text: 'Review and submit' })])]));
    nav.replaceChildren.apply(nav, items);
    var p = progress();
    $('#meter-label').textContent = p + '% of required answers done';
    $('#meter').style.setProperty('--p', p + '%');
  }

  function go(i) {
    if (i === state.step) return;
    var dir = i > state.step ? 'next' : 'back';
    state.step = i;
    drawSteps();
    drawPane(dir);
    var f = $('#form');
    if (f.getBoundingClientRect().top < 70) window.scrollTo({ top: f.offsetTop - 90, behavior: 'smooth' });
  }

  function field(f) {
    var val = state.draft[f.key];
    var id = 'f-' + f.key;
    var wide = f.type === 'textarea' || f.type === 'multi' || f.type === 'choice' || f.type === 'agree';
    var set = function (v) { state.draft[f.key] = v; wrapEl.removeAttribute('data-invalid'); var er = $('.c-err', wrapEl); if (er) er.remove(); scheduleSave(); drawSteps(); };
    var control;
    if (f.type === 'textarea') {
      control = el('textarea', { id: id, class: 'c-input', rows: '4', maxlength: '4000', placeholder: f.placeholder || null, oninput: function (e) { set(e.target.value); } });
      control.value = val || '';
    } else if (f.type === 'select') {
      control = el('select', { id: id, class: 'c-input', onchange: function (e) { set(e.target.value); } },
        [el('option', { value: '', text: 'Choose one' })].concat(f.options.map(function (o) { return el('option', { value: o, text: o }); })));
      control.value = val || '';
    } else if (f.type === 'choice' || f.type === 'multi') {
      var multi = f.type === 'multi';
      var current = multi ? (Array.isArray(val) ? val : []) : val;
      control = el('div', { class: 'c-choices', role: multi ? 'group' : 'radiogroup', 'aria-labelledby': id + '-l' }, f.options.map(function (o) {
        var input = el('input', { type: multi ? 'checkbox' : 'radio', name: id, value: o, onchange: function () {
          if (multi) set($$('input:checked', control).map(function (x) { return x.value; }));
          else set(o);
        } });
        input.checked = multi ? current.indexOf(o) > -1 : current === o;
        return el('label', { class: 'c-chip', 'data-kind': multi ? 'check' : 'radio' }, [input, el('span', { class: 'c-tick', html: ICON.check }), el('span', { text: o })]);
      }));
    } else if (f.type === 'agree') {
      var cb = el('input', { type: 'checkbox', id: id, onchange: function (e) { set(e.target.checked); } });
      cb.checked = !!val;
      control = el('label', { class: 'c-agree', for: id }, [cb, el('span', { class: 'c-tick', html: ICON.check }), el('span', { text: f.label })]);
    } else {
      control = el('input', { id: id, class: 'c-input', type: f.type, maxlength: '400', placeholder: f.placeholder || null, autocomplete: f.autocomplete || 'off', oninput: function (e) { set(e.target.value); } });
      control.value = val || '';
    }
    var wrapEl = el('div', { class: 'c-field' + (wide ? ' c-field--wide' : ''), 'data-key': f.key }, [
      f.type === 'agree' ? null : el(f.type === 'choice' || f.type === 'multi' ? 'span' : 'label', { class: 'c-label', for: f.type === 'choice' || f.type === 'multi' ? null : id, id: id + '-l' }, [f.label, f.required ? el('em', { text: '*', 'aria-label': 'required' }) : null]),
      control,
      f.help ? el('span', { class: 'c-help', text: f.help }) : null
    ]);
    if (state.missing.indexOf(f.key) > -1 && isEmpty(val)) markInvalid(wrapEl);
    return wrapEl;
  }
  function markInvalid(w) {
    w.setAttribute('data-invalid', 'true');
    if (!$('.c-err', w)) w.appendChild(el('span', { class: 'c-err', text: 'This one is required.' }));
  }

  function drawPane(dir) {
    var form = $('#form');
    var last = state.step === FIELDS.length;
    var s = FIELDS[state.step];
    var pane = el('div', { class: 'c-pane', 'data-dir': dir }, [
      el('div', { class: 'c-form-head' }, [
        el('small', { text: 'Step ' + (state.step + 1) + ' of ' + (FIELDS.length + 1) }),
        el('h2', { text: last ? 'Review and submit' : s.title }),
        el('p', { text: last ? 'Check your answers. When everything looks right, set up your details and our team will review them.' : s.lead })
      ]),
      last ? reviewList() : el('div', { class: 'c-grid' }, s.fields.map(field)),
      el('div', { class: 'c-form-foot' }, [
        el('span', { class: 'c-save-state', id: 'save-state', 'data-s': 'saved' }, [el('i'), el('span', { text: 'All changes saved' })]),
        el('button', { type: 'button', class: 'c-btn-ghost', disabled: state.step === 0 ? true : null, onclick: function () { go(state.step - 1); } }, [el('span', { html: ICON.back }), 'Back']),
        last
          ? el('button', { type: 'button', class: 'c-btn c-btn--xl', id: 'submit-btn', onclick: submit }, ['Set up details', el('span', { html: ICON.arrow })])
          : el('button', { type: 'button', class: 'c-btn', onclick: next }, ['Continue', el('span', { html: ICON.arrow })])
      ]),
      el('div', { class: 'c-form-msg', id: 'form-msg', role: 'alert' })
    ]);
    form.replaceChildren(pane);
    var first = $('input:not([type=checkbox]):not([type=radio]), textarea, select', pane);
    if (first && dir === 'next' && state.step > 0 && !last) first.focus({ preventScroll: true });
  }

  function next() {
    var miss = stepMissing(state.step);
    if (miss.length) {
      state.missing = Array.from(new Set(state.missing.concat(miss)));
      miss.forEach(function (k) { var w = $('.c-field[data-key="' + k + '"]'); if (w) markInvalid(w); });
      var w0 = $('.c-field[data-key="' + miss[0] + '"]');
      if (w0) { w0.scrollIntoView({ behavior: 'smooth', block: 'center' }); var c = $('input, textarea, select', w0); if (c) c.focus({ preventScroll: true }); }
      drawSteps();
      return;
    }
    saveNow();
    go(state.step + 1);
  }

  function display(f, v) {
    if (f.type === 'agree') return v ? 'Confirmed' : '';
    if (Array.isArray(v)) return v.join(', ');
    return v ? String(v) : '';
  }
  function reviewList() {
    return el('div', { class: 'c-review' }, FIELDS.map(function (s, i) {
      return el('section', { class: 'c-review-sec' }, [
        el('header', {}, [el('h3', { text: s.title }), el('button', { type: 'button', text: 'Edit', onclick: function () { go(i); } })]),
        el('dl', {}, s.fields.map(function (f) {
          var txt = display(f, state.draft[f.key]);
          var missing = f.required && !txt;
          return el('div', {}, [
            el('dt', { text: f.type === 'agree' ? 'Confirmation' : f.label }),
            el('dd', { class: missing ? 'is-missing' : !txt ? 'is-empty' : null, text: missing ? 'Required, not answered yet' : txt || 'Not provided' })
          ]);
        }))
      ]);
    }));
  }

  /* Autosave: a draft goes to the server shortly after you stop typing. */
  function setSaveState(s, text) {
    var n = $('#save-state');
    if (!n) return;
    n.setAttribute('data-s', s);
    $('span', n).textContent = text;
  }
  function scheduleSave() {
    setSaveState('saving', 'Saving');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveNow, 900);
  }
  function saveNow() {
    clearTimeout(state.saveTimer);
    if (!state.me || state.me.status !== 'onboarding') return Promise.resolve();
    return api('save', { json: { onboarding: state.draft } })
      .then(function () { state.me.onboarding = Object.assign({}, state.draft); setSaveState('saved', 'All changes saved'); })
      .catch(function (err) { setSaveState('error', "Couldn't save. We'll try again."); if (err.status === 409) api('').then(route); });
  }
  window.addEventListener('beforeunload', function () {
    if (state.saveTimer && state.me && state.me.status === 'onboarding') {
      try { navigator.sendBeacon && fetch('/api/auth?scope=client&action=save', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ onboarding: state.draft }) }); } catch (e) {}
    }
  });

  function submit() {
    var allMissing = [];
    FIELDS.forEach(function (s, i) { allMissing = allMissing.concat(stepMissing(i)); });
    var msg = $('#form-msg');
    if (allMissing.length) {
      state.missing = allMissing;
      drawSteps();
      var firstStep = FIELDS.findIndex(function (s, i) { return stepMissing(i).length; });
      msg.replaceChildren(el('div', { class: 'ps-error' }, [el('span', { html: ICON.alert }), el('span', { text: 'A few required answers are missing. We marked the steps that need them.' })]));
      setTimeout(function () { go(firstStep); }, 900);
      return;
    }
    var btn = $('#submit-btn');
    btn.disabled = true;
    btn.innerHTML = ICON.spin + ' <span>Setting up</span>';
    clearTimeout(state.saveTimer);
    api('submit', { json: { onboarding: state.draft } })
      .then(function (me) { state.missing = []; state.step = 0; route(me); })
      .catch(function (err) {
        if (err.missing) { state.missing = err.missing; drawSteps(); }
        msg.replaceChildren(el('div', { class: 'ps-error' }, [el('span', { html: ICON.alert }), el('span', { text: err.message })]));
        btn.disabled = false;
        btn.replaceChildren(document.createTextNode('Set up details'), el('span', { html: ICON.arrow }));
      });
  }

  /* =========================================================
     Waiting for our team
     ========================================================= */
  function loader() {
    return el('div', { class: 'c-loader', 'aria-hidden': 'true' }, [
      el('span', { html: '<svg viewBox="0 0 220 220" fill="none"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1FBEF8" stop-opacity="0"/><stop offset=".5" stop-color="#1FBEF8"/><stop offset="1" stop-color="#0589ED" stop-opacity=".2"/></linearGradient></defs>' +
        '<g class="r1"><circle cx="110" cy="110" r="104" stroke="url(#lg1)" stroke-width="1.5"/><circle cx="214" cy="110" r="4" fill="#7FD8FF"/></g>' +
        '<g class="r2"><circle cx="110" cy="110" r="86" stroke="rgba(127,216,255,.25)" stroke-width="1" stroke-dasharray="2 6"/><circle cx="24" cy="110" r="3" fill="#1FBEF8"/></g>' +
        '<g class="r3"><circle cx="110" cy="110" r="95" stroke="#7FD8FF" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="60 540"/></g></svg>' }),
      el('div', { class: 'c-loader-glow' }),
      el('div', { class: 'c-loader-disc' }, [el('img', { src: '/assets/logo-mark-tight.png', alt: '', width: '172', height: '134' })])
    ]);
  }
  function track(atIndex) {
    var labels = ['Onboarding', 'Approval', 'Payment', 'Confirmation'];
    return el('ol', { class: 'c-track' }, labels.map(function (l, i) {
      return el('li', { 'data-state': i < atIndex ? 'done' : i === atIndex ? 'now' : 'next' }, [el('b', { html: i < atIndex ? ICON.check : null, text: i < atIndex ? null : String(i + 1) }), el('span', { text: l })]);
    }));
  }
  function since(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function renderWait(kind) {
    var review = kind === 'review';
    document.title = (review ? 'Under review' : 'Confirming payment') + ' | PrimeSphere';
    screen([
      el('section', { class: 'c-card c-wait' }, [
        loader(),
        el('h1', {}, [review ? 'Please wait, we are reviewing your details' : 'Please wait, we are confirming your payment', el('span', { class: 'c-dots', 'aria-hidden': 'true' })]),
        el('p', { text: review
          ? 'Thanks, ' + firstName() + '. Our team is checking your onboarding now. This page updates on its own as soon as it is approved, so you can leave it open or come back later.'
          : 'Thanks, ' + firstName() + '. We received your screenshot and are matching it with our records. Your dashboard opens here automatically once it is confirmed.' }),
        track(review ? 1 : 3),
        el('div', { class: 'c-live' }, [el('i'), el('span', { text: (review ? 'Submitted ' + since(state.me.submittedAt) : 'Sent ' + since(state.me.proofUploadedAt)) + ' · Checking for updates' })]),
        el('div', { class: 'c-wait-actions' }, [
          el('a', { class: 'c-btn-ghost', href: PORTAL, target: '_blank', rel: 'noopener' }, [el('span', { html: ICON.portal }), 'Go to portal']),
          !review && state.me.proofUrl ? el('button', { type: 'button', class: 'c-btn-ghost', text: 'View my screenshot', onclick: function () { lightbox(state.me.proofUrl); } }) : null
        ])
      ])
    ]);
  }

  /* =========================================================
     Payment
     ========================================================= */
  function money(amount, currency) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount); }
    catch (e) { return (currency || '') + ' ' + Number(amount).toFixed(2); }
  }
  function copyRow(value, label) {
    return el('div', { class: 'c-copy' }, [el('span', { text: value }), el('button', { type: 'button', text: 'Copy', 'aria-label': 'Copy ' + label, onclick: function (e) {
      var b = e.currentTarget;
      (navigator.clipboard ? navigator.clipboard.writeText(value) : Promise.reject()).then(function () {
        b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1400);
      }).catch(function () { toast('Copy failed. Select the text instead.', true); });
    } })]);
  }
  function renderPayment(keepFile) {
    document.title = 'Payment | PrimeSphere';
    var me = state.me, inv = me.invoice || { methods: [] };
    if (!keepFile) state.file = null;
    var amountParts = money(inv.amount, inv.currency);
    screen([
      el('div', { class: 'c-head' }, [
        el('h1', { text: 'You are approved, ' + firstName() }),
        el('p', { text: 'Scan one of the QR codes below to pay, then add a screenshot of your payment so we can confirm it.' })
      ]),
      me.adminNote ? el('div', { class: 'c-banner c-banner--warn', role: 'note' }, [el('span', { html: ICON.alert }), el('div', {}, [el('strong', { text: 'We could not confirm your last screenshot' }), document.createTextNode(me.adminNote)])]) : null,
      el('div', { class: 'c-pay' }, [
        el('section', { class: 'c-card c-due' }, [
          el('div', { class: 'c-due-top' }, [
            el('div', {}, [el('div', { class: 'c-due-label', text: 'Amount due' }), el('div', { class: 'c-due-amount' }, [amountParts, el('small', { text: inv.currency })])]),
            el('span', { class: 'c-pill c-pill--warn' }, [el('i'), 'Awaiting payment'])
          ]),
          inv.note ? el('div', { class: 'c-due-note' }, [el('b', { text: 'Note from our team' }), document.createTextNode(inv.note)]) : null,
          el('h3', { class: 'c-sub', text: inv.methods.length > 1 ? 'Pay with any of these' : 'Pay with this QR code' }),
          inv.methods.length ? el('div', { class: 'c-qrs' }, inv.methods.map(function (m) {
            return el('article', { class: 'c-qr' }, [
              el('button', { type: 'button', class: 'c-qr-img', 'aria-label': 'Enlarge ' + m.label + ' QR code', onclick: function () { lightbox(m.image); } }, [el('img', { src: m.image, alt: m.label + ' QR code', loading: 'lazy' })]),
              el('h4', { text: m.label }),
              m.accountName ? el('p', { text: m.accountName }) : null,
              m.accountNumber ? copyRow(m.accountNumber, m.label + ' account number') : null
            ]);
          })) : el('p', { class: 'c-help', text: 'Our team is updating the payment options. This page refreshes on its own.' })
        ]),
        proofCard()
      ])
    ]);
  }

  function proofCard() {
    var input = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, onchange: function (e) { if (e.target.files[0]) pick(e.target.files[0]); } });
    var drop = el('div', { class: 'c-drop', id: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Add a screenshot of your payment',
      onclick: function () { input.click(); },
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
      ondragover: function (e) { e.preventDefault(); drop.setAttribute('data-over', 'true'); },
      ondragleave: function () { drop.removeAttribute('data-over'); },
      ondrop: function (e) { e.preventDefault(); drop.removeAttribute('data-over'); var f = e.dataTransfer.files[0]; if (f) pick(f); }
    });
    var card = el('section', { class: 'c-card c-proof' }, [
      el('h2', { text: 'Proof of payment' }),
      el('p', { text: 'Paste, drop or choose a screenshot that shows the amount and reference number.' }),
      drop, input,
      el('div', { class: 'c-proof-actions' }, [
        el('div', { class: 'c-progress', id: 'up-progress', hidden: true }, [el('span')]),
        el('button', { type: 'button', class: 'c-btn', id: 'proof-send', disabled: true, onclick: sendProof }, ['Send proof of payment', el('span', { html: ICON.arrow })]),
        el('div', { id: 'proof-msg', role: 'alert' })
      ])
    ]);
    drawDrop(drop);
    return card;
  }
  function drawDrop(drop) {
    drop = drop || $('#drop');
    if (!drop) return;
    if (state.file) {
      drop.replaceChildren(
        el('div', { class: 'c-drop-preview' }, [el('img', { src: state.file.url, alt: 'Your payment screenshot' })]),
        el('span', { class: 'c-proof-change', text: 'Choose a different screenshot' })
      );
    } else {
      var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      drop.replaceChildren(
        el('span', { class: 'c-drop-icon', html: ICON.upload }),
        el('strong', { text: 'Paste your screenshot here' }),
        el('span', {}, ['Press ', el('span', { class: 'c-kbd', text: mac ? '⌘ V' : 'Ctrl V' }), ', drop a file, or click to choose one'])
      );
    }
    var b = $('#proof-send');
    if (b) b.disabled = !state.file;
  }
  function pick(file) {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast('Use a PNG, JPG or WebP image.', true); return; }
    if (state.file && state.file.url) URL.revokeObjectURL(state.file.url);
    state.file = { blob: file, url: URL.createObjectURL(file), name: file.name || 'screenshot' };
    $('#proof-msg') && $('#proof-msg').replaceChildren();
    drawDrop();
  }
  // Paste a screenshot straight from the clipboard while the payment screen is open.
  document.addEventListener('paste', function (e) {
    if (!state.me || state.me.status !== 'payment' || $('#app').hidden) return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
        var f = items[i].getAsFile();
        if (f) { e.preventDefault(); pick(f); toast('Screenshot added.'); $('#drop').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return;
      }
    }
  });

  // Big screenshots are scaled down in the browser so uploads stay quick and under the size limit.
  function shrink(file) {
    return new Promise(function (resolve) {
      if (file.size < 1.5 * 1024 * 1024) return resolve(file);
      var img = new Image();
      img.onload = function () {
        var max = 2200, scale = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { resolve(b && b.size < file.size ? b : file); }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { resolve(file); };
      img.src = state.file.url;
    });
  }
  function sendProof() {
    if (!state.file) return;
    var btn = $('#proof-send'), bar = $('#up-progress'), msg = $('#proof-msg');
    btn.disabled = true;
    btn.innerHTML = ICON.spin + ' <span>Sending</span>';
    bar.hidden = false;
    msg.replaceChildren();
    shrink(state.file.blob).then(function (blob) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/auth?scope=client&action=proof');
      xhr.setRequestHeader('X-Requested-With', 'fetch');
      xhr.setRequestHeader('Content-Type', blob.type || 'image/jpeg');
      xhr.withCredentials = true;
      xhr.upload.onprogress = function (e) { if (e.lengthComputable) $('span', bar).style.width = Math.round(e.loaded / e.total * 100) + '%'; };
      xhr.onload = function () {
        var d = {};
        try { d = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) {
          if (state.file) URL.revokeObjectURL(state.file.url);
          state.file = null;
          route(d);
        } else fail(d.error || 'Upload failed (' + xhr.status + ').');
      };
      xhr.onerror = function () { fail("Couldn't reach the server. Check your connection and try again."); };
      xhr.send(blob);
    });
    function fail(text) {
      msg.replaceChildren(el('div', { class: 'ps-error' }, [el('span', { html: ICON.alert }), el('span', { text: text })]));
      bar.hidden = true; $('span', bar).style.width = '0';
      btn.disabled = false;
      btn.replaceChildren(document.createTextNode('Send proof of payment'), el('span', { html: ICON.arrow }));
    }
  }

  function lightbox(src) {
    var lb = el('div', { class: 'c-lightbox', role: 'dialog', 'aria-label': 'Enlarged image', tabindex: '-1', onclick: function () { close(); } }, [el('img', { src: src, alt: '' })]);
    var close = function () { lb.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(lb);
    lb.focus();
  }

  /* =========================================================
     Dashboard (after payment is confirmed)
     ========================================================= */
  function renderDashboard() {
    document.title = 'Dashboard | PrimeSphere';
    var me = state.me, o = me.onboarding || {}, inv = me.invoice;
    var kv = function (rows) {
      return el('dl', { class: 'c-kv' }, rows.filter(function (r) { return r[1]; }).map(function (r) {
        return el('div', {}, [el('dt', { text: r[0] }), el('dd', {}, [typeof r[1] === 'string' ? document.createTextNode(r[1]) : r[1]])]);
      }));
    };
    var site = o.website ? el('a', { href: /^https?:\/\//.test(o.website) ? o.website : 'https://' + o.website, target: '_blank', rel: 'noopener', text: o.website.replace(/^https?:\/\//, ''), style: 'color:#5CCBFA' }) : null;
    screen([
      el('section', { class: 'c-card c-hero' }, [
        el('span', { class: 'c-hero-art', 'aria-hidden': 'true', html: '<svg viewBox="0 0 340 340" fill="none" width="340" height="340"><circle class="a1" cx="170" cy="170" r="150" stroke="rgba(127,216,255,.35)" stroke-dasharray="3 9"/><circle class="a2" cx="170" cy="170" r="112" stroke="rgba(31,190,248,.4)"/><circle cx="170" cy="170" r="70" fill="url(#hg)"/><defs><radialGradient id="hg"><stop stop-color="#1FBEF8" stop-opacity=".5"/><stop offset="1" stop-color="#0589ED" stop-opacity="0"/></radialGradient></defs></svg>' }),
        el('div', {}, [
          el('span', { class: 'c-pill c-pill--ok' }, [el('i'), 'Account active']),
          el('h1', { text: 'Welcome aboard, ' + firstName() }),
          el('p', { text: 'Your setup is complete and payment is confirmed. Day-to-day work, tasks, reporting and messages all happen in the member portal.' })
        ]),
        el('a', { class: 'c-portal-btn c-portal-btn--lg', href: PORTAL, target: '_blank', rel: 'noopener' }, [el('span', { html: ICON.portal }), 'Go to portal'])
      ]),
      el('div', { class: 'c-dash' }, [
        el('section', { class: 'c-card c-tile c-tile--wide' }, [
          el('h2', { text: 'What happens next' }),
          el('ol', { class: 'c-next' }, [
            el('li', {}, [el('div', {}, [el('strong', { text: 'Access instructions' }), el('span', { text: 'We will send step-by-step instructions for the accounts you said you can share.' })])]),
            el('li', {}, [el('div', {}, [el('strong', { text: 'Kick-off call' }), el('span', { text: 'Your account lead reaches out to book a call and agree the first priorities.' })])]),
            el('li', {}, [el('div', {}, [el('strong', { text: 'Work starts in the portal' }), el('span', { text: 'Follow tasks, approve work and see results at portal.primespheres.online.' })])])
          ])
        ]),
        el('section', { class: 'c-card c-tile' }, [
          el('h2', { text: 'Payment' }),
          inv ? el('div', { class: 'c-receipt-amount', text: money(inv.amount, inv.currency) }) : null,
          kv([['Confirmed', me.paidAt ? new Date(me.paidAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '']]),
          me.proofUrl ? el('button', { type: 'button', class: 'c-thumb', 'aria-label': 'View your payment screenshot', onclick: function () { lightbox(me.proofUrl); } }, [el('img', { src: me.proofUrl, alt: '' })]) : null
        ]),
        el('section', { class: 'c-card c-tile' }, [
          el('h2', { text: 'Your business' }),
          kv([['Business', o.businessName || me.company], ['Website', site], ['Industry', o.industry], ['Main contact', [o.fullName, o.role].filter(Boolean).join(', ')]])
        ]),
        el('section', { class: 'c-card c-tile c-tile--wide' }, [
          el('h2', { text: 'Your plan' }),
          kv([
            ['Services', Array.isArray(o.services) && o.services.length ? el('div', { class: 'c-tags' }, o.services.map(function (s) { return el('span', { class: 'c-tag', text: s }); })) : null],
            ['Main goal', o.primaryGoal],
            ['Start', o.startDate],
            ['What success looks like', o.goals]
          ])
        ])
      ])
    ]);
  }

  /* ---------- Start ---------- */
  api('', { allow401: true }).then(route).catch(function (err) {
    showAuth('login', err.status === 401 ? '' : err.message);
  });
})();
