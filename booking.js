// Contact page: tab switching + "Book a call" calendar.
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Tabs ---------- */
  var tabs = $$('.contact-tabs [role="tab"]');
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
    history.replaceState(null, '', tab.id === 'tab-booking' ? '#book' : '#message');
    if (tab.id === 'tab-booking') loadAvailability();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      selectTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length], true);
    });
  });
  function fromHash() {
    if (location.hash === '#book') selectTab($('#tab-booking'));
    else if (location.hash === '#message') selectTab($('#tab-message'));
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();

  /* ---------- Time zone helpers ---------- */
  var visitorTz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
  function tzOffset(ms, tz) {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
    var g = function (t) { return Number(parts.find(function (p) { return p.type === t; }).value); };
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms;
  }
  function zonedToUtc(date, time, tz) {
    var d = date.split('-').map(Number), t = time.split(':').map(Number);
    var guess = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]);
    var utc = guess - tzOffset(guess, tz);
    return new Date(guess - tzOffset(utc, tz));
  }
  function ymdIn(ms, tz) {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    return p; // YYYY-MM-DD
  }
  function addDays(ymd, n) {
    var d = ymd.split('-').map(Number);
    var x = new Date(Date.UTC(d[0], d[1] - 1, d[2] + n));
    return x.toISOString().slice(0, 10);
  }
  function weekday(ymd) { var d = ymd.split('-').map(Number); return new Date(Date.UTC(d[0], d[1] - 1, d[2])).getUTCDay(); }
  function fmtTime(date, tz) { return date.toLocaleTimeString(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }); }
  function fmtLong(date, tz) {
    return date.toLocaleString(undefined, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  }
  function tzName(tz) { return tz.replace(/_/g, ' ').split('/').pop(); }

  /* ---------- Availability ---------- */
  var cfg = null, taken = {}, days = {}, months = [], monthIndex = 0;
  var picked = { date: null, time: null, at: null };
  var loading = false, loaded = false;

  function loadAvailability(force) {
    if ((loaded && !force) || loading) return;
    loading = true;
    fetch('/api/contact?availability=1', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (d) {
        loaded = true;
        cfg = d.booking;
        taken = {};
        (d.taken || []).forEach(function (iso) { taken[new Date(iso).getTime()] = 1; });
        $('#booking-loading').hidden = true;
        if (!cfg.enabled) { $('#booking-paused').hidden = false; $('#booking-form').hidden = true; return; }
        $('#booking-form').hidden = false;
        buildDays();
        renderCalendar();
        if (picked.date && !(days[picked.date] || []).some(function (s) { return s.time === picked.time; })) { picked = { date: null, time: null, at: null }; }
        renderSlots();
      })
      .catch(function () {
        $('#booking-loading').textContent = 'Times could not be loaded. Check your connection and refresh the page, or send us a message instead.';
      })
      .then(function () { loading = false; });
  }

  // days[YYYY-MM-DD] = [{ time, at: Date }] for bookable slots (in our time zone's calendar)
  function buildDays() {
    days = {};
    var now = Date.now();
    var earliest = now + cfg.minNoticeHours * 3600e3;
    var latest = now + (cfg.daysAhead + 1) * 86400e3;
    var today = ymdIn(now, cfg.timezone);
    for (var i = 0; i <= cfg.daysAhead; i++) {
      var ymd = addDays(today, i);
      if (cfg.days.indexOf(weekday(ymd)) === -1) continue;
      var list = cfg.slots.map(function (t) { return { time: t, at: zonedToUtc(ymd, t, cfg.timezone) }; })
        .filter(function (s) { var ms = s.at.getTime(); return ms >= earliest && ms <= latest && !taken[ms]; });
      if (list.length) days[ymd] = list;
    }
    var first = today.slice(0, 7), last = addDays(today, cfg.daysAhead).slice(0, 7);
    months = [first];
    while (months[months.length - 1] < last) {
      var m = months[months.length - 1].split('-').map(Number);
      var nx = new Date(Date.UTC(m[0], m[1], 1)).toISOString().slice(0, 7);
      months.push(nx);
    }
    // start on the first month that has an open day
    var firstOpen = Object.keys(days).sort()[0];
    monthIndex = firstOpen ? Math.max(0, months.indexOf(firstOpen.slice(0, 7))) : 0;
    $('#tz-note').textContent = visitorTz === cfg.timezone
      ? 'Times are shown in your time zone (' + tzName(visitorTz) + '). Calls last ' + cfg.duration + ' minutes.'
      : 'Times are shown in your time zone (' + tzName(visitorTz) + '). Our team is in ' + tzName(cfg.timezone) + '. Calls last ' + cfg.duration + ' minutes.';
  }

  function renderCalendar() {
    var ym = months[monthIndex];
    var p = ym.split('-').map(Number);
    var first = new Date(Date.UTC(p[0], p[1] - 1, 1));
    $('#cal-title').textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    $('[data-cal="-1"]').disabled = monthIndex === 0;
    $('[data-cal="1"]').disabled = monthIndex === months.length - 1;
    var grid = $('#cal-grid');
    grid.replaceChildren();
    var lead = first.getUTCDay();
    var daysInMonth = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
    for (var i = 0; i < lead; i++) grid.appendChild(document.createElement('span'));
    for (var d = 1; d <= daysInMonth; d++) {
      var ymd = ym + '-' + String(d).padStart(2, '0');
      var open = !!days[ymd];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cal-day' + (open ? ' is-open' : '') + (picked.date === ymd ? ' is-picked' : '');
      b.textContent = d;
      b.disabled = !open;
      b.dataset.date = ymd;
      var label = new Date(Date.UTC(p[0], p[1] - 1, d)).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
      b.setAttribute('aria-label', label + (open ? ', ' + days[ymd].length + ' times available' : ', unavailable'));
      if (picked.date === ymd) b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', function () { pickDate(this.dataset.date); });
      grid.appendChild(b);
    }
    if (!Object.keys(days).length) {
      $('#slots-title').textContent = 'No times available right now';
      $('#slot-list').replaceChildren();
    }
  }
  $$('[data-cal]').forEach(function (b) {
    b.addEventListener('click', function () {
      monthIndex = Math.min(months.length - 1, Math.max(0, monthIndex + Number(b.getAttribute('data-cal'))));
      renderCalendar();
    });
  });

  function pickDate(ymd) {
    picked.date = ymd; picked.time = null; picked.at = null;
    $('#slot-error').textContent = '';
    renderCalendar(); renderSlots();
    var first = $('#slot-list button');
    if (first && window.matchMedia('(max-width: 760px)').matches) $('#slots-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSlots() {
    var list = $('#slot-list');
    list.replaceChildren();
    if (!picked.date) { $('#slots-title').textContent = Object.keys(days).length ? 'Choose a date first' : 'No times available right now'; updateSummary(); return; }
    var p = picked.date.split('-').map(Number);
    $('#slots-title').textContent = new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    (days[picked.date] || []).forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot' + (picked.time === s.time ? ' is-picked' : '');
      b.setAttribute('aria-pressed', String(picked.time === s.time));
      var local = fmtTime(s.at, visitorTz);
      // Show the visitor's day too if the time falls on a different calendar day for them
      var localDay = ymdIn(s.at.getTime(), visitorTz);
      if (localDay !== picked.date) local += ' (' + s.at.toLocaleDateString(undefined, { timeZone: visitorTz, weekday: 'short' }) + ')';
      b.appendChild(document.createTextNode(local));
      if (visitorTz !== cfg.timezone) {
        var sm = document.createElement('small');
        sm.textContent = fmtTime(s.at, cfg.timezone) + ' ' + tzName(cfg.timezone);
        b.appendChild(sm);
      }
      b.addEventListener('click', function () {
        picked.time = s.time; picked.at = s.at;
        $('#slot-error').textContent = '';
        renderSlots();
      });
      list.appendChild(b);
    });
    updateSummary();
  }

  function updateSummary() {
    $('#booking-summary').textContent = picked.at
      ? 'Your call: ' + fmtLong(picked.at, visitorTz) + ' (' + cfg.duration + ' min)'
      : 'No time selected yet.';
  }

  /* ---------- Submit ---------- */
  var form = $('#booking-form');
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
    if (!picked.at) { $('#slot-error').textContent = 'Choose a date and time for your call.'; $('#calendar').scrollIntoView({ behavior: 'smooth', block: 'center' }); ok = false; }
    $$('input[type="text"], input[type="email"], input[type="tel"]', form).forEach(function (el) {
      var v = el.value.trim(), msg = '';
      if (el.required && !v) msg = el.getAttribute('data-error') || ('Enter your ' + el.closest('.field').firstChild.textContent.replace('*', '').trim().toLowerCase() + '.');
      else if (el.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = 'Enter an email like name@company.com.';
      else if (el.type === 'tel' && v && v.replace(/\D/g, '').length < 7) msg = 'Enter a phone number with at least 7 digits.';
      setError(el, msg);
      if (msg && ok) { el.focus(); ok = false; }
    });
    var g = $('.chip-group', form);
    var any = $$('input:checked', g).length > 0;
    g.classList.toggle('has-error', !any);
    $('.field-error', g).textContent = any ? '' : g.getAttribute('data-required');
    if (!any && ok) { $('input', g).focus(); ok = false; }
    return ok;
  }
  $$('input, textarea', form).forEach(function (el) {
    el.addEventListener('input', function () { var f = el.closest('.field'); if (f && f.classList.contains('has-error') && el.type !== 'checkbox') setError(el, ''); });
    if (el.type === 'checkbox') el.addEventListener('change', function () { var g = el.closest('.chip-group'); g.classList.remove('has-error'); $('.field-error', g).textContent = ''; });
  });

  function gcalLink(at, minutes) {
    var fmt = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var end = new Date(at.getTime() + minutes * 60000);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent('Call with PrimeSphere') +
      '&dates=' + fmt(at) + '/' + fmt(end) +
      '&details=' + encodeURIComponent('Your call with the PrimeSphere team. We will send the meeting link by email.');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.className = 'form-status'; status.textContent = '';
    if (!validate()) return;
    var fd = new FormData(form);
    var payload = {
      kind: 'booking',
      firstName: fd.get('firstName'), lastName: fd.get('lastName'), email: fd.get('email'), phone: fd.get('phone'),
      company: fd.get('company'), discuss: fd.getAll('discuss'), helpWith: fd.get('helpWith'),
      date: picked.date, time: picked.time, visitorTz: visitorTz, website: fd.get('website')
    };
    submitBtn.disabled = true; submitBtn.firstChild.textContent = 'Booking ';
    fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var er = new Error(d.error || 'Booking failed. Try again.'); er.status = r.status; throw er; } return d; }); })
      .then(function (d) {
        var at = new Date(d.startsAt || picked.at);
        $('#done-when').textContent = fmtLong(at, visitorTz) + ' (' + (d.duration || cfg.duration) + ' minutes, your time)';
        $('#done-gcal').href = gcalLink(at, d.duration || cfg.duration);
        form.hidden = true;
        var done = $('#booking-done'); done.hidden = false; done.focus();
        form.reset(); picked = { date: null, time: null, at: null };
      })
      .catch(function (err) {
        status.classList.add('is-err');
        status.textContent = err.message === 'Failed to fetch' ? 'Booking failed. Check your connection and try again.' : err.message;
        if (err.status === 409) { picked.time = null; picked.at = null; loadAvailability(true); }
      })
      .then(function () { submitBtn.disabled = false; submitBtn.firstChild.textContent = 'Book Call '; });
  });

  $('#done-again').addEventListener('click', function () {
    $('#booking-done').hidden = true;
    form.hidden = false;
    loadAvailability(true);
  });
})();
