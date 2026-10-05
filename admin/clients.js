/* Admin > Clients: invite clients, approve onboarding, send payment requests (QR codes + amount)
   and confirm payments. Uses the shared helpers admin.js exposes on window.PSAdmin. */
(function () {
  'use strict';
  var A = window.PSAdmin;
  if (!A) return;
  var $ = A.$, $$ = A.$$, el = A.el, api = A.api, toast = A.toast, ICON = A.ICON, fmtDate = A.fmtDate;
  var FIELDS = window.PS_ONBOARDING || [];
  var ENDPOINT = '/api/admin/users?scope=clients';
  var CURRENCIES = ['USD', 'PHP', 'AUD', 'EUR', 'GBP', 'CAD', 'SGD'];
  var STATUS = {
    invited: { label: 'Invited', tone: 'muted' },
    onboarding: { label: 'Onboarding', tone: 'info' },
    review: { label: 'Needs approval', tone: 'action' },
    payment: { label: 'Awaiting payment', tone: 'warn' },
    payment_review: { label: 'Confirm payment', tone: 'action' },
    active: { label: 'Active', tone: 'ok' }
  };
  var ORDER = ['invited', 'onboarding', 'review', 'payment', 'payment_review', 'active'];
  var S = { items: [], methods: [], counts: {}, filter: 'action', q: '', selected: null, sig: '', drafts: {} };

  var svg = function (b, s) { return '<svg width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + b + '</svg>'; };
  var IC = {
    check: svg('<path d="M20 6L9 17l-5-5"/>'),
    copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    key: svg('<circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>'),
    send: svg('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>'),
    undo: svg('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>')
  };

  function money(a, c) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: c || 'USD' }).format(a); }
    catch (e) { return (c || '') + ' ' + a; }
  }
  function pill(status) {
    var s = STATUS[status] || { label: status, tone: 'muted' };
    return el('span', { class: 'cl-pill', 'data-tone': s.tone, text: s.label });
  }
  function clientUrl() { return location.origin + '/client'; }
  function inviteText(c, pw) {
    return 'Hi ' + c.name.split(' ')[0] + ',\n\nWelcome to PrimeSphere! Your client space is ready.\n\n' +
      'Sign in: ' + clientUrl() + '\nEmail: ' + c.email + '\nTemporary password: ' + pw + '\n\n' +
      "You'll choose your own password when you sign in, then fill in a short onboarding form so we can get started.\n\nSee you inside,\nPrimeSphere";
  }
  function copy(text, done) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(done || 'Copied.'); })
      .catch(function () { toast('Copy failed. Select the text and copy it yourself.', true); });
  }
  function matches(c) {
    var f = S.filter;
    var okF = f === 'all' ? true : f === 'action' ? (c.status === 'review' || c.status === 'payment_review')
      : f === 'active' ? c.status === 'active' : (c.status !== 'active' && c.status !== 'review' && c.status !== 'payment_review');
    if (!okF) return false;
    if (!S.q) return true;
    var q = S.q.toLowerCase();
    return [c.name, c.email, c.company, c.onboarding && c.onboarding.businessName].some(function (v) { return v && String(v).toLowerCase().indexOf(q) > -1; });
  }

  /* ---------- Load ---------- */
  function setBadge(counts) {
    var b = $('#client-badge');
    var n = (counts && counts.needsAction) || 0;
    b.hidden = !n; b.textContent = n;
  }
  var lastAction = null;
  function load(silent) {
    var list = $('#cl-list');
    if (!silent && !S.items.length) list.replaceChildren(el('p', { class: 'list-empty', text: 'Loading clients' }));
    return api(ENDPOINT).then(function (d) {
      var sig = JSON.stringify(d);
      if (lastAction !== null && d.counts.needsAction > lastAction) toast('A client is waiting for you.');
      lastAction = d.counts.needsAction;
      setBadge(d.counts);
      if (silent && sig === S.sig) return;
      S.sig = sig; S.items = d.clients; S.methods = d.methods; S.counts = d.counts;
      if (!silent && S.filter === 'action' && !d.counts.needsAction && d.clients.length) setFilter('all', true);
      renderList();
      if (!$('#qr-editor').hidden) renderQrList();
    }).catch(function (err) { if (err.status !== 401) list.replaceChildren(el('p', { class: 'list-empty', text: err.message })); });
  }
  function badge() {
    api(ENDPOINT).then(function (d) {
      if (lastAction !== null && d.counts.needsAction > lastAction) toast('A client is waiting for you.');
      lastAction = d.counts.needsAction;
      setBadge(d.counts);
    }).catch(function () {});
  }

  function setFilter(f, quiet) {
    S.filter = f;
    $$('[data-cl-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-cl-filter') === f)); });
    if (!quiet) renderList();
  }
  $$('[data-cl-filter]').forEach(function (b) { b.addEventListener('click', function () { setFilter(b.getAttribute('data-cl-filter')); }); });
  var qTimer;
  $('#cl-search').addEventListener('input', function (e) { clearTimeout(qTimer); qTimer = setTimeout(function () { S.q = e.target.value.trim(); renderList(); }, 200); });

  /* ---------- List ---------- */
  function renderList() {
    var c = S.counts || {};
    $('#cl-count-action').textContent = c.needsAction || '';
    $('#cl-count-progress').textContent = ((c.invited || 0) + (c.onboarding || 0) + (c.payment || 0)) || '';
    $('#cl-count-active').textContent = c.active || '';
    var list = $('#cl-list');
    var items = S.items.filter(matches);
    if (!items.length) {
      var txt = S.q ? 'No clients match "' + S.q + '".'
        : S.filter === 'action' ? 'Nothing needs you right now. New onboarding and payment screenshots show up here.'
        : !S.items.length ? 'No clients yet. Select Invite client to add your first one.' : 'No clients here.';
      list.replaceChildren(el('p', { class: 'list-empty', text: txt }));
    } else {
      list.replaceChildren.apply(list, items.map(function (cl) {
        var biz = cl.company || (cl.onboarding && cl.onboarding.businessName) || '';
        var needs = cl.status === 'review' || cl.status === 'payment_review';
        return el('button', { type: 'button', class: 'msg-item cl-item', 'data-status': needs ? 'new' : 'read', 'aria-current': String(S.selected === cl.id), onclick: function () { select(cl.id); } }, [
          el('span', { class: 'dot' + (needs ? '' : ' dot--off') }),
          el('span', { class: 'msg-name', text: cl.name + (biz ? ', ' + biz : '') }),
          el('span', { class: 'msg-date', text: fmtDate(cl.updatedAt) }),
          el('span', { class: 'msg-sub cl-sub' }, [pill(cl.status), cl.active ? null : el('span', { class: 'cl-pill', 'data-tone': 'danger', text: 'Disabled' }), el('span', { text: cl.email })])
        ]);
      }));
    }
    renderDetail(S.items.find(function (x) { return x.id === S.selected; }) || null);
  }
  function select(id) {
    S.selected = id;
    renderList();
    if (window.matchMedia('(max-width: 900px)').matches) window.scrollTo({ top: 0 });
  }

  /* ---------- Detail ---------- */
  function renderDetail(c) {
    var box = $('#cl-detail');
    $('#cl-split').classList.toggle('has-detail', !!c);
    if (!c) {
      box.replaceChildren(el('div', { class: 'empty-detail' }, [
        el('span', { html: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>', 40) }),
        el('p', { text: S.items.length ? 'Select a client to see their details.' : 'Invite a client to get started.' })
      ]));
      return;
    }
    // Keep whatever the admin is typing in an action form while the list refreshes.
    var active = document.activeElement && box.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (active && box.dataset.cid === String(c.id) && box.dataset.status === c.status) return;
    box.dataset.cid = String(c.id); box.dataset.status = c.status;

    var o = c.onboarding || {};
    box.replaceChildren(
      el('div', { class: 'detail-head' }, [
        el('button', { type: 'button', class: 'ghost-btn back-btn', onclick: function () { S.selected = null; renderList(); } }, [el('span', { html: ICON.back }), 'All clients']),
        el('div', { class: 'detail-top' }, [
          el('div', {}, [
            el('h2', { text: c.name }),
            el('p', { class: 'muted' }, [el('a', { href: 'mailto:' + c.email, text: c.email }), c.company || o.businessName ? ' · ' + (c.company || o.businessName) : '']),
          ]),
          pill(c.status)
        ]),
        el('div', { class: 'detail-actions' }, [
          o.phone ? el('a', { class: 'ghost-btn', href: 'tel:' + String(o.phone).replace(/[^\d+]/g, ''), text: 'Call' }) : null,
          el('button', { type: 'button', class: 'ghost-btn', onclick: function () { resetPassword(c); } }, [el('span', { html: IC.key }), 'Reset password']),
          el('button', { type: 'button', class: 'ghost-btn', text: c.active ? 'Disable' : 'Enable', onclick: function () { toggle(c); } }),
          el('button', { type: 'button', class: 'ghost-btn ghost-btn--danger', text: 'Delete', onclick: function () { remove(c); } })
        ])
      ]),
      timeline(c),
      actionPanel(c),
      answers(c)
    );
  }

  function timeline(c) {
    var at = ORDER.indexOf(c.status); // 0 invited ... 5 active
    // Each step is done once the client is past it, and "now" while they're on it.
    var steps = [
      { label: 'Invited', when: c.createdAt, doneAt: 0 },
      { label: 'Onboarding', when: c.submittedAt, doneAt: 2 },
      { label: 'Approved', when: c.approvedAt, doneAt: 3 },
      { label: 'Proof sent', when: c.proofUploadedAt, doneAt: 4 },
      { label: 'Paid', when: c.paidAt, doneAt: 5 }
    ];
    return el('ol', { class: 'cl-timeline' }, steps.map(function (s, i) {
      var done = at >= s.doneAt;
      var now = !done && (i === 0 || at >= steps[i - 1].doneAt);
      return el('li', { 'data-state': done ? 'done' : now ? 'now' : 'next' }, [
        el('b', { html: done ? IC.check : null, text: done ? null : String(i + 1) }),
        el('span', { text: s.label }),
        s.when && done ? el('small', { text: fmtDate(s.when) }) : null
      ]);
    }));
  }

  function actionPanel(c) {
    var p = el('div', { class: 'cl-panel' });
    var inv = c.invoice;
    if (c.status === 'invited') {
      p.append(
        el('h3', { text: 'Waiting for their first sign-in' }),
        el('p', { class: 'muted', text: 'They have not set their own password yet. If they lost the invite, reset the password to get a new temporary one to share.' }),
        el('div', { class: 'cl-row' }, [el('button', { type: 'button', class: 'ghost-btn', onclick: function () { copy(clientUrl(), 'Sign-in link copied.'); } }, [el('span', { html: IC.copy }), 'Copy sign-in link'])])
      );
    } else if (c.status === 'onboarding') {
      var pct = percent(c.onboarding || {});
      p.append(
        el('h3', { text: 'Filling in onboarding' }),
        el('p', { class: 'muted', text: pct + '% of the required answers are done. You will see a dot here as soon as they submit.' }),
        el('div', { class: 'cl-meter' }, [el('i', { style: 'width:' + pct + '%' })]),
        c.adminNote ? el('div', { class: 'cl-note' }, [el('strong', { text: 'You asked for changes' }), document.createTextNode(c.adminNote)]) : null
      );
    } else if (c.status === 'review') {
      p.classList.add('cl-panel--action');
      p.append(el('h3', { text: 'Approve onboarding and request payment' }),
        el('p', { class: 'muted', text: 'Check their answers below. Pick the QR codes they can pay with and the amount due. They see it straight away.' }),
        invoiceForm(c, 'approve'),
        changesForm(c));
    } else if (c.status === 'payment') {
      p.append(
        el('h3', { text: 'Waiting for their payment' }),
        el('p', { class: 'muted', text: 'Sent ' + fmtDate(inv.sentAt, true) + (inv.sentBy ? ' by ' + inv.sentBy : '') + '. Their screenshot will show up here.' }),
        invoiceSummary(inv),
        c.adminNote ? el('div', { class: 'cl-note' }, [el('strong', { text: 'You rejected their last screenshot' }), document.createTextNode(c.adminNote)]) : null,
        el('details', { class: 'cl-more' }, [el('summary', { text: 'Edit payment request' }), invoiceForm(c, 'update-invoice')])
      );
    } else if (c.status === 'payment_review') {
      p.classList.add('cl-panel--action');
      p.append(
        el('h3', { text: 'Confirm the payment' }),
        el('p', { class: 'muted', text: 'Uploaded ' + fmtDate(c.proofUploadedAt, true) + '. Check it against your account before confirming.' }),
        el('div', { class: 'cl-proof' }, [
          el('a', { class: 'cl-proof-img', href: c.proofUrl, target: '_blank', rel: 'noopener', 'aria-label': 'Open the screenshot in a new tab' }, [el('img', { src: c.proofUrl, alt: 'Payment screenshot from ' + c.name })]),
          el('div', { class: 'cl-proof-side' }, [
            invoiceSummary(inv),
            el('button', { type: 'button', class: 'btn btn--ok', onclick: function (e) { confirmPay(c, e.currentTarget); } }, [el('span', { html: IC.check }), 'Payment received']),
            rejectForm(c)
          ])
        ])
      );
    } else if (c.status === 'active') {
      p.append(
        el('h3', { text: 'Active client' }),
        el('p', { class: 'muted', text: 'Payment confirmed ' + fmtDate(c.paidAt, true) + (c.confirmedBy ? ' by ' + c.confirmedBy : '') + '. They now see their dashboard and the portal link.' }),
        inv ? invoiceSummary(inv) : null,
        c.proofUrl ? el('a', { class: 'ghost-btn', href: c.proofUrl, target: '_blank', rel: 'noopener', text: 'View payment screenshot' }) : null
      );
    }
    return p;
  }

  function percent(o) {
    var req = 0, done = 0;
    FIELDS.forEach(function (s) { s.fields.forEach(function (f) {
      if (!f.required) return; req++;
      var v = o[f.key];
      if (Array.isArray(v) ? v.length : typeof v === 'boolean' ? v : v && String(v).trim()) done++;
    }); });
    return req ? Math.round(done / req * 100) : 0;
  }

  function invoiceSummary(inv) {
    if (!inv) return null;
    var picked = (inv.methodIds || []).map(function (id) { return S.methods.find(function (m) { return m.id === id; }); }).filter(Boolean);
    return el('dl', { class: 'cl-inv' }, [
      el('div', {}, [el('dt', { text: 'Amount' }), el('dd', { class: 'cl-amount', text: money(inv.amount, inv.currency) })]),
      el('div', {}, [el('dt', { text: 'Pay with' }), el('dd', {}, [el('div', { class: 'chips' }, picked.length ? picked.map(function (m) { return el('span', { class: 'chip', text: m.label }); }) : [el('span', { class: 'muted', text: 'QR code deleted' })])])]),
      inv.note ? el('div', { class: 'cl-inv-wide' }, [el('dt', { text: 'Note to client' }), el('dd', { text: inv.note })]) : null
    ]);
  }

  function invoiceForm(c, action) {
    var inv = c.invoice || {};
    var key = c.id + ':' + action;
    var d = S.drafts[key] || { methodIds: (inv.methodIds || []).slice(), amount: inv.amount || '', currency: inv.currency || 'USD', note: inv.note || '' };
    S.drafts[key] = d;
    var usable = S.methods.filter(function (m) { return m.active || d.methodIds.indexOf(m.id) > -1; });
    var form = el('form', { class: 'cl-form', novalidate: true });
    var qrBox = usable.length
      ? el('div', { class: 'cl-qr-pick', role: 'group', 'aria-label': 'QR codes the client can pay with' }, usable.map(function (m) {
          var cb = el('input', { type: 'checkbox', value: String(m.id), onchange: function () {
            d.methodIds = $$('.cl-qr-pick input:checked', form).map(function (x) { return Number(x.value); });
          } });
          cb.checked = d.methodIds.indexOf(m.id) > -1;
          return el('label', { class: 'cl-qr-opt' }, [cb, el('span', { class: 'cl-qr-thumb' }, [el('img', { src: m.image, alt: '' })]), el('span', { class: 'cl-qr-text' }, [el('strong', { text: m.label }), el('small', { text: m.accountNumber || m.accountName || '' })]), el('span', { class: 'cl-qr-tick', html: IC.check })]);
        }))
      : el('div', { class: 'cl-empty-qr' }, [el('p', { text: 'You have no payment QR codes yet.' }), el('button', { type: 'button', class: 'ghost-btn', text: 'Add a QR code', onclick: openQr })]);
    var amount = el('input', { type: 'text', inputmode: 'decimal', name: 'amount', placeholder: '0.00', value: d.amount ? String(d.amount) : '', oninput: function (e) { d.amount = e.target.value; } });
    var cur = el('select', { name: 'currency', onchange: function (e) { d.currency = e.target.value; } }, CURRENCIES.map(function (x) { return el('option', { value: x, text: x }); }));
    cur.value = d.currency;
    var note = el('textarea', { name: 'note', rows: '2', maxlength: '1000', placeholder: 'Optional, e.g. "First month of store management" or a reference to include', oninput: function (e) { d.note = e.target.value; } });
    note.value = d.note;
    var msg = el('p', { class: 'form-msg', role: 'alert' });
    var btn = el('button', { type: 'submit', class: 'btn' }, [el('span', { html: IC.send }), action === 'approve' ? 'Approve and send payment request' : 'Update payment request']);
    form.append(
      el('div', { class: 'cl-label-row' }, [el('span', { class: 'cl-label', text: 'QR codes to pay with' }), usable.length ? el('button', { type: 'button', class: 'muted-link', text: 'Manage QR codes', onclick: openQr }) : null]),
      qrBox,
      el('div', { class: 'cl-amount-row' }, [
        el('label', { class: 'field' }, ['Amount due*', amount]),
        el('label', { class: 'field' }, ['Currency', cur])
      ]),
      el('label', { class: 'field' }, ['Note to the client', note]),
      msg,
      el('div', { class: 'cl-row' }, [btn])
    );
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.textContent = '';
      if (!d.methodIds.length) { msg.textContent = 'Select at least one QR code.'; return; }
      if (!(Number(String(d.amount).replace(/,/g, '')) > 0)) { msg.textContent = 'Enter the amount the client needs to pay.'; amount.focus(); return; }
      if (action === 'approve' && !confirm('Approve ' + c.name + ' and ask them to pay ' + money(Number(String(d.amount).replace(/,/g, '')), d.currency) + '?')) return;
      btn.disabled = true;
      patch({ id: c.id, action: action, methodIds: d.methodIds, amount: d.amount, currency: d.currency, note: d.note })
        .then(function () { delete S.drafts[key]; toast(action === 'approve' ? 'Approved. ' + c.name.split(' ')[0] + ' can pay now.' : 'Payment request updated.'); })
        .catch(function (err) { msg.textContent = err.message; })
        .then(function () { btn.disabled = false; });
    });
    return form;
  }

  function noteForm(c, opts) {
    var wrap = el('details', { class: 'cl-more' }, [el('summary', { text: opts.summary })]);
    var ta = el('textarea', { rows: '3', maxlength: '1000', placeholder: opts.placeholder });
    var msg = el('p', { class: 'form-msg', role: 'alert' });
    var btn = el('button', { type: 'button', class: 'ghost-btn ghost-btn--danger' }, [el('span', { html: IC.undo }), opts.button]);
    btn.addEventListener('click', function () {
      if (!ta.value.trim()) { msg.textContent = opts.empty; ta.focus(); return; }
      btn.disabled = true;
      patch({ id: c.id, action: opts.action, note: ta.value }).then(function () { toast(opts.done); })
        .catch(function (err) { msg.textContent = err.message; }).then(function () { btn.disabled = false; });
    });
    wrap.append(el('div', { class: 'cl-form' }, [el('label', { class: 'field' }, [opts.label, ta]), msg, el('div', { class: 'cl-row' }, [btn])]));
    return wrap;
  }
  function changesForm(c) {
    return noteForm(c, { summary: 'Request changes instead', label: 'What should they change?', placeholder: 'They see this note at the top of their onboarding form.', button: 'Send back for changes', empty: 'Tell the client what to change.', action: 'changes', done: 'Sent back to the client for changes.' });
  }
  function rejectForm(c) {
    return noteForm(c, { summary: 'Payment not received?', label: 'What was wrong?', placeholder: 'e.g. The amount is short, or the screenshot is unreadable. They can upload a new one.', button: 'Reject screenshot', empty: 'Tell the client what was wrong.', action: 'reject-proof', done: 'Screenshot rejected. The client was asked for a new one.' });
  }
  function confirmPay(c, btn) {
    if (!confirm('Confirm you received ' + money(c.invoice.amount, c.invoice.currency) + ' from ' + c.name + '? Their dashboard opens right away.')) return;
    btn.disabled = true;
    patch({ id: c.id, action: 'confirm' }).then(function () { toast('Payment confirmed. ' + c.name.split(' ')[0] + ' is now active.'); })
      .catch(function (err) { toast(err.message, true); btn.disabled = false; });
  }

  function patch(body) {
    return api(ENDPOINT, { method: 'PATCH', json: body }).then(function (d) {
      var i = S.items.findIndex(function (x) { return x.id === d.client.id; });
      if (i > -1) S.items[i] = d.client;
      $('#cl-detail').dataset.status = '';
      return load().then(function () { return d; });
    });
  }

  function answers(c) {
    var o = c.onboarding || {};
    if (!Object.keys(o).length) return el('p', { class: 'muted cl-no-answers', text: 'No onboarding answers yet.' });
    return el('div', { class: 'cl-answers' }, [
      el('h3', { text: c.status === 'onboarding' || c.status === 'invited' ? 'Onboarding answers so far' : 'Onboarding answers' })
    ].concat(FIELDS.map(function (s) {
      return el('section', {}, [
        el('h4', { text: s.title }),
        el('dl', { class: 'detail-grid', style: 'margin:0' }, s.fields.filter(function (f) { return f.type !== 'agree'; }).map(function (f) {
          var v = o[f.key];
          var txt = Array.isArray(v) ? '' : v ? String(v) : '';
          var dd;
          if (Array.isArray(v) && v.length) dd = el('div', { class: 'chips' }, v.map(function (x) { return el('span', { class: 'chip', text: x }); }));
          else if (txt && f.type === 'url' && /^(https?:\/\/)?[^\s]+\.[^\s]+$/.test(txt)) dd = el('a', { href: /^https?:/.test(txt) ? txt : 'https://' + txt, target: '_blank', rel: 'noopener', text: txt });
          else if (txt && f.type === 'email') dd = el('a', { href: 'mailto:' + txt, text: txt });
          else dd = document.createTextNode(txt || '-');
          return el('div', { class: 'detail-cell' + (f.type === 'textarea' || f.type === 'multi' ? ' detail-cell--wide' : '') }, [el('dt', { text: f.label }), el('dd', {}, [dd])]);
        }))
      ]);
    })));
  }

  /* ---------- Account actions ---------- */
  function resetPassword(c) {
    if (!confirm('Give ' + c.name + ' a new temporary password? Their current password stops working and they choose a new one when they sign in.')) return;
    api(ENDPOINT, { method: 'PATCH', json: { id: c.id, action: 'reset-password' } }).then(function (d) {
      load();
      showCredentials(d.client, d.tempPassword, 'New temporary password');
    }).catch(function (err) { toast(err.message, true); });
  }
  function toggle(c) {
    if (c.active && !confirm('Disable ' + c.name + '? They are signed out and cannot sign in until you enable them again.')) return;
    patch({ id: c.id, action: c.active ? 'disable' : 'enable' }).then(function () { toast(c.active ? c.name + ' is disabled.' : c.name + ' can sign in again.'); })
      .catch(function (err) { toast(err.message, true); });
  }
  function remove(c) {
    if (!confirm('Delete ' + c.name + "'s client account, onboarding answers and payment screenshot? This can't be undone.")) return;
    api(ENDPOINT + '&id=' + c.id, { method: 'DELETE' }).then(function () { S.selected = null; toast('Client deleted.'); load(); })
      .catch(function (err) { toast(err.message, true); });
  }

  /* ---------- Invite drawer ---------- */
  var inviteBodyHtml = $('#invite-body').innerHTML;
  function openInvite() {
    $('#invite-body').innerHTML = inviteBodyHtml;
    $('#invite-title').textContent = 'Invite client';
    $('#invite-foot').replaceChildren(
      el('button', { type: 'button', class: 'ghost-btn', 'data-close-invite': true, text: 'Cancel' }),
      el('button', { type: 'submit', class: 'btn', id: 'invite-save', text: 'Create invite' })
    );
    A.openDrawer('#client-invite', '[name="name"]');
  }
  function showCredentials(c, pw, title) {
    if ($('#client-invite').hidden) A.openDrawer('#client-invite', '#invite-copy');
    $('#invite-title').textContent = title || 'Invite ready';
    var text = inviteText(c, pw);
    $('#invite-body').replaceChildren(
      el('div', { class: 'cl-cred' }, [
        el('span', { class: 'cl-cred-icon', html: svg('<path d="M20 6L9 17l-5-5"/>', 22) }),
        el('h3', { text: c.name + "'s account is ready" }),
        el('p', { class: 'muted', text: 'Share these details privately. The temporary password is shown only once.' })
      ]),
      el('dl', { class: 'cl-cred-list' }, [
        el('div', {}, [el('dt', { text: 'Sign-in page' }), el('dd', { text: clientUrl() })]),
        el('div', {}, [el('dt', { text: 'Email' }), el('dd', { text: c.email })]),
        el('div', {}, [el('dt', { text: 'Temporary password' }), el('dd', { class: 'cl-pw', text: pw })])
      ]),
      el('label', { class: 'field' }, ['Invite message', el('textarea', { rows: '9', readonly: true, class: 'cl-invite-text', text: text })])
    );
    $('#invite-foot').replaceChildren(
      el('button', { type: 'button', class: 'ghost-btn', 'data-close-invite': true, text: 'Done' }),
      el('a', { class: 'ghost-btn', href: 'mailto:' + c.email + '?subject=' + encodeURIComponent('Your PrimeSphere client space') + '&body=' + encodeURIComponent(text), text: 'Open in email' }),
      el('button', { type: 'button', class: 'btn', id: 'invite-copy', onclick: function () { copy(text, 'Invite copied.'); } }, [el('span', { html: IC.copy }), 'Copy invite'])
    );
  }
  $('#client-invite-open').addEventListener('click', openInvite);
  $('#client-invite').addEventListener('click', function (e) { if (e.target.closest('[data-close-invite]')) A.closeDrawer('#client-invite'); });
  $('#invite-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target.elements;
    var nameI = f.namedItem('name'), emailI = f.namedItem('email'), companyI = f.namedItem('company');
    if (!nameI || !emailI) return; // showing the credentials, nothing to submit
    var msg = $('#invite-msg'), btn = $('#invite-save');
    if (!nameI.value.trim()) { msg.textContent = "Enter the client's name."; nameI.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailI.value.trim())) { msg.textContent = 'Enter a valid email address.'; emailI.focus(); return; }
    btn.disabled = true; btn.textContent = 'Creating';
    api(ENDPOINT, { method: 'POST', json: { name: nameI.value, email: emailI.value, company: companyI ? companyI.value : '' } }).then(function (d) {
      S.selected = d.client.id;
      setFilter('all', true);
      load();
      showCredentials(d.client, d.tempPassword, 'Invite ready');
    }).catch(function (err) { msg.textContent = err.message; btn.disabled = false; btn.textContent = 'Create invite'; });
  });

  /* ---------- Payment QR codes drawer ---------- */
  var editingQr = null;
  function openQr() {
    resetQrForm();
    renderQrList();
    A.openDrawer('#qr-editor', '#qr-form [name="label"]');
    api('/api/admin/users?scope=payment-methods').then(function (d) { S.methods = d.methods; renderQrList(); }).catch(function () {});
  }
  $('#qr-open').addEventListener('click', openQr);
  $('#qr-editor').addEventListener('click', function (e) { if (e.target.closest('[data-close-qr]')) { A.closeDrawer('#qr-editor'); renderDetail(S.items.find(function (x) { return x.id === S.selected; }) || null); } });

  function renderQrList() {
    var list = $('#qr-list');
    if (!S.methods.length) { list.replaceChildren(el('p', { class: 'muted qr-empty', text: 'No QR codes yet. Add your first one below.' })); return; }
    list.replaceChildren.apply(list, S.methods.map(function (m, i) {
      return el('div', { class: 'qr-row' + (m.active ? '' : ' is-hidden') }, [
        el('a', { class: 'qr-thumb', href: m.image, target: '_blank', rel: 'noopener', 'aria-label': 'Open ' + m.label + ' QR code' }, [el('img', { src: m.image, alt: '' })]),
        el('div', { class: 'qr-meta' }, [
          el('strong', { text: m.label }),
          el('span', { class: 'muted', text: [m.accountName, m.accountNumber].filter(Boolean).join(' · ') || 'No account details' }),
          m.active ? null : el('span', { class: 'tag tag--hidden', text: 'Hidden' })
        ]),
        el('div', { class: 'row-actions' }, [
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', html: ICON.up, disabled: i === 0 ? true : null, onclick: function () { qrPatch({ id: m.id, move: 'up' }); } }),
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move down', html: ICON.down, disabled: i === S.methods.length - 1 ? true : null, onclick: function () { qrPatch({ id: m.id, move: 'down' }); } }),
          el('button', { type: 'button', class: 'ghost-btn', text: m.active ? 'Hide' : 'Show', onclick: function () { qrPatch({ id: m.id, active: !m.active }); } }),
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Edit ' + m.label, html: ICON.edit, onclick: function () { editQr(m); } }),
          el('button', { type: 'button', class: 'icon-btn icon-btn--danger', 'aria-label': 'Delete ' + m.label, html: ICON.trash, onclick: function () { deleteQr(m); } })
        ])
      ]);
    }));
  }
  function qrPatch(body) {
    return api('/api/admin/users?scope=payment-methods', { method: 'PATCH', json: body }).then(function () { return refreshMethods(); })
      .catch(function (err) { toast(err.message, true); });
  }
  function refreshMethods() {
    return api('/api/admin/users?scope=payment-methods').then(function (d) { S.methods = d.methods; renderQrList(); S.sig = ''; });
  }
  function deleteQr(m) {
    if (!confirm('Delete the ' + m.label + ' QR code? Clients who were asked to pay with it will no longer see it.')) return;
    api('/api/admin/users?scope=payment-methods&id=' + m.id, { method: 'DELETE' }).then(function () { toast('QR code deleted.'); if (editingQr && editingQr.id === m.id) resetQrForm(); return refreshMethods(); })
      .catch(function (err) { toast(err.message, true); });
  }
  function setPreview(url) {
    var img = $('#qr-preview');
    img.hidden = !url; if (url) img.src = url; else img.removeAttribute('src');
    $('#qr-drop-empty').hidden = !!url;
    $('#qr-form [name="image"]').value = url || '';
  }
  function resetQrForm() {
    editingQr = null;
    var f = $('#qr-form'); f.reset();
    setPreview('');
    $('#qr-form-title').textContent = 'Add a QR code';
    $('#qr-save').textContent = 'Add QR code';
    $('#qr-cancel').hidden = true;
    $('#qr-msg').textContent = ''; $('#qr-status').textContent = '';
  }
  function editQr(m) {
    editingQr = m;
    var f = $('#qr-form');
    f.label.value = m.label; f.accountName.value = m.accountName; f.accountNumber.value = m.accountNumber;
    setPreview(m.image);
    $('#qr-form-title').textContent = 'Edit ' + m.label;
    $('#qr-save').textContent = 'Save changes';
    $('#qr-cancel').hidden = false;
    f.label.focus();
  }
  $('#qr-cancel').addEventListener('click', resetQrForm);
  $('#qr-file').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var bar = $('#qr-progress'), st = $('#qr-status');
    bar.hidden = false; $('span', bar).style.width = '0%';
    st.className = 'upload-status'; st.textContent = 'Preparing image';
    A.uploadFile(file, 'payments', function (pct) { $('span', bar).style.width = pct + '%'; st.textContent = 'Uploading ' + pct + '%'; })
      .then(function (url) { setPreview(url); st.className = 'upload-status is-ok'; st.textContent = 'Image uploaded.'; })
      .catch(function (err) { st.className = 'upload-status is-err'; st.textContent = err.message; })
      .then(function () { bar.hidden = true; });
  });
  $('#qr-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, msg = $('#qr-msg'), btn = $('#qr-save');
    msg.textContent = '';
    if (!f.label.value.trim()) { msg.textContent = 'Name this QR code, for example GCash or BPI.'; f.label.focus(); return; }
    if (!f.image.value) { msg.textContent = 'Upload the QR code image.'; return; }
    var body = { label: f.label.value, accountName: f.accountName.value, accountNumber: f.accountNumber.value, image: f.image.value, active: editingQr ? editingQr.active : true };
    if (editingQr) body.id = editingQr.id;
    btn.disabled = true;
    api('/api/admin/users?scope=payment-methods', { method: editingQr ? 'PATCH' : 'POST', json: body })
      .then(function () { toast(editingQr ? 'QR code saved.' : 'QR code added.'); resetQrForm(); return refreshMethods(); })
      .catch(function (err) { msg.textContent = err.message; })
      .then(function () { btn.disabled = false; });
  });

  window.PSClients = { load: load, badge: badge };
})();
