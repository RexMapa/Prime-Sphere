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
  var detectedTz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
  var visitorTz = detectedTz;
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
  function tzOffsetLabel(tz) {
    try {
      var part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(function (p) { return p.type === 'timeZoneName'; });
      return part ? part.value.replace('GMT', 'GMT') : '';
    } catch (e) { return ''; }
  }
  function tzMinutes(tz) { return Math.round(tzOffset(Date.now(), tz) / 60000); }

  /* ---------- Time zone picker ---------- */
  var FALLBACK_ZONES = ['Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Toronto', 'America/Sao_Paulo', 'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Athens', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Manila', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Seoul', 'Asia/Tokyo', 'Australia/Perth', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'UTC'];
  var tzSelect = $('#tz-select');
  (function fillZones() {
    var zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch (e) { zones = FALLBACK_ZONES.slice(); }
    if (zones.indexOf(detectedTz) === -1) zones.push(detectedTz);
    if (zones.indexOf('UTC') === -1) zones.push('UTC');
    var items = zones.map(function (z) {
      var label;
      try { label = tzName(z) + (z.indexOf('/') > -1 ? ', ' + z.split('/')[0].replace(/_/g, ' ') : ''); } catch (e) { label = z; }
      return { z: z, mins: tzMinutes(z), label: label };
    }).sort(function (a, b) { return a.mins - b.mins || a.label.localeCompare(b.label); });
    tzSelect.replaceChildren.apply(tzSelect, items.map(function (it) {
      var o = document.createElement('option');
      o.value = it.z;
      o.textContent = '(' + tzOffsetLabel(it.z) + ') ' + it.label + (it.z === detectedTz ? '  (detected)' : '');
      if (it.z === detectedTz) o.selected = true;
      return o;
    }));
  })();
  tzSelect.addEventListener('change', function () {
    visitorTz = tzSelect.value;
    if (!cfg) return;
    var keep = picked.slot ? picked.slot.at.getTime() : null;
    buildDays();
    picked = { date: null, slot: null, at: null };
    // keep the same moment selected if it is still available
    if (keep) Object.keys(days).some(function (d) {
      return days[d].some(function (sl) { if (sl.at.getTime() === keep) { picked = { date: d, slot: sl, at: sl.at }; return true; } });
    });
    if (picked.date) monthIndex = Math.max(0, months.indexOf(picked.date.slice(0, 7)));
    renderCalendar(); renderSlots();
  });

  /* ---------- Availability ---------- */
  var cfg = null, taken = {}, days = {}, months = [], monthIndex = 0;
  var picked = { date: null, slot: null, at: null };  // date = visitor's calendar day
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
        if (picked.at && !(days[picked.date] || []).some(function (sl) { return sl.at.getTime() === picked.at.getTime(); })) { picked = { date: null, slot: null, at: null }; }
        renderSlots();
      })
      .catch(function () {
        $('#booking-loading').textContent = 'Times could not be loaded. Check your connection and refresh the page, or send us a message instead.';
      })
      .then(function () { loading = false; });
  }

  // days[visitor YYYY-MM-DD] = [{ date, time, at }] where date/time are in OUR time zone (what the server expects)
  function buildDays() {
    days = {};
    var now = Date.now();
    var earliest = now + cfg.minNoticeHours * 3600e3;
    var latest = now + (cfg.daysAhead + 1) * 86400e3;
    var today = ymdIn(now, cfg.timezone);
    for (var i = 0; i <= cfg.daysAhead; i++) {
      var ymd = addDays(today, i);
      if (cfg.days.indexOf(weekday(ymd)) === -1) continue;
      cfg.slots.forEach(function (t) {
        var at = zonedToUtc(ymd, t, cfg.timezone), ms = at.getTime();
        if (ms < earliest || ms > latest || taken[ms]) return;
        var local = ymdIn(ms, visitorTz);
        (days[local] = days[local] || []).push({ date: ymd, time: t, at: at });
      });
    }
    Object.keys(days).forEach(function (k) { days[k].sort(function (a, b) { return a.at - b.at; }); });
    var keys = Object.keys(days).sort();
    var first = (keys[0] || ymdIn(now, visitorTz)).slice(0, 7);
    var last = (keys[keys.length - 1] || first).slice(0, 7);
    months = [first];
    while (months[months.length - 1] < last) {
      var m = months[months.length - 1].split('-').map(Number);
      months.push(new Date(Date.UTC(m[0], m[1], 1)).toISOString().slice(0, 7));
    }
    monthIndex = 0;
    var same = tzMinutes(visitorTz) === tzMinutes(cfg.timezone);
    $('#tz-note').textContent = same
      ? 'Times are shown in ' + tzName(visitorTz) + ' time, the same as our team in ' + tzName(cfg.timezone) + '. Calls last ' + cfg.duration + ' minutes.'
      : 'Times are shown in ' + tzName(visitorTz) + ' time, with ' + tzName(cfg.timezone) + ' time (our team) underneath. Calls last ' + cfg.duration + ' minutes.';
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
    picked.date = ymd; picked.slot = null; picked.at = null;
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
    var showOurs = tzMinutes(visitorTz) !== tzMinutes(cfg.timezone);
    (days[picked.date] || []).forEach(function (sl) {
      var on = picked.at && picked.at.getTime() === sl.at.getTime();
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot' + (on ? ' is-picked' : '');
      b.setAttribute('aria-pressed', String(!!on));
      b.appendChild(document.createTextNode(fmtTime(sl.at, visitorTz)));
      if (showOurs) {
        var sm = document.createElement('small');
        var ourDay = sl.date !== picked.date ? sl.at.toLocaleDateString(undefined, { timeZone: cfg.timezone, weekday: 'short' }) + ' ' : '';
        sm.textContent = ourDay + fmtTime(sl.at, cfg.timezone) + ' ' + tzName(cfg.timezone);
        b.appendChild(sm);
      }
      b.addEventListener('click', function () {
        picked.slot = sl; picked.at = sl.at;
        $('#slot-error').textContent = '';
        renderSlots();
      });
      list.appendChild(b);
    });
    updateSummary();
  }

  function updateSummary() {
    $('#booking-summary').textContent = picked.at
      ? 'Your call: ' + fmtLong(picked.at, visitorTz) + ' ' + tzName(visitorTz) + ' time (' + cfg.duration + ' min)'
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
      date: picked.slot ? picked.slot.date : '', time: picked.slot ? picked.slot.time : '', visitorTz: visitorTz, website: fd.get('website')
    };
    submitBtn.disabled = true; submitBtn.firstChild.textContent = 'Booking ';
    fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var er = new Error(d.error || 'Booking failed. Try again.'); er.status = r.status; throw er; } return d; }); })
      .then(function (d) {
        var at = new Date(d.startsAt || picked.at);
        $('#done-when').textContent = fmtLong(at, visitorTz) + ' ' + tzName(visitorTz) + ' time (' + (d.duration || cfg.duration) + ' minutes)';
        $('#done-gcal').href = gcalLink(at, d.duration || cfg.duration);
        form.hidden = true;
        var done = $('#booking-done'); done.hidden = false; done.focus();
        form.reset(); tzSelect.value = visitorTz; picked = { date: null, slot: null, at: null };
      })
      .catch(function (err) {
        status.classList.add('is-err');
        status.textContent = err.message === 'Failed to fetch' ? 'Booking failed. Check your connection and try again.' : err.message;
        if (err.status === 409) { picked.slot = null; picked.at = null; loadAvailability(true); }
      })
      .then(function () { submitBtn.disabled = false; submitBtn.firstChild.textContent = 'Book Call '; });
  });

  $('#done-again').addEventListener('click', function () {
    $('#booking-done').hidden = true;
    form.hidden = false;
    loadAvailability(true);
  });
})();
