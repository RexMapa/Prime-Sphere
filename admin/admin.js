(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  // Small element builder. Text is always set with textContent, never as HTML.
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v; // only used for our own static SVG icons
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  var ICON = {
    up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>',
    down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>'
  };

  /* ---------- API ---------- */
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'X-Requested-With': 'fetch', Accept: 'application/json' };
    if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      credentials: 'same-origin',
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401 && !opts.allow401) { showLogin('Your session ended. Sign in again.'); }
        if (!r.ok) { var e = new Error(data.error || 'Request failed (' + r.status + ').'); e.status = r.status; throw e; }
        return data;
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

  /* ---------- Auth ---------- */
  var VIEWS = ['messages', 'bookings', 'chat', 'subscribers', 'content', 'stores', 'team'];
  var me = null; // { id, name, email, role, isOwner }
  function setMe(data) {
    me = data;
    $('#me-name').textContent = me.name || me.email;
    $('#me-avatar').textContent = (me.name || me.email || '?').trim().charAt(0).toUpperCase();
    $('#team-tab').hidden = me.role !== 'super';
  }
  function showLogin(msg) {
    if (typeof stopChatPolling === 'function') stopChatPolling();
    $('#boot').hidden = true;
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#login-msg').textContent = msg || '';
    $('#login-form [name="email"]').focus();
  }
  function showApp(data) {
    if (data && data.id) setMe(data);
    $('#boot').hidden = true;
    $('#login').hidden = true;
    $('#app').hidden = false;
    var h = location.hash.slice(1);
    if (h === 'team' && (!me || me.role !== 'super')) h = 'messages';
    setView(VIEWS.indexOf(h) > -1 ? h : 'messages');
    startUnreadWatch();
  }

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var btn = $('button[type="submit"]', f);
    var msg = $('#login-msg');
    if (!f.email.value.trim() || !f.password.value) { msg.textContent = 'Enter your email and password.'; return; }
    btn.disabled = true; btn.textContent = 'Signing in';
    msg.textContent = '';
    api('/api/auth?action=login', { method: 'POST', json: { email: f.email.value, password: f.password.value }, allow401: true })
      .then(function (d) { f.password.value = ''; chat.lastUnread = null; chat.selected = null; showApp(d); })
      .catch(function (err) { msg.textContent = err.message; f.password.select(); })
      .then(function () { btn.disabled = false; btn.textContent = 'Sign in'; });
  });

  $('#logout').addEventListener('click', function () {
    api('/api/auth?action=logout', { method: 'POST' }).catch(function () {}).then(function () { showLogin('You are signed out.'); });
  });

  /* ---------- Views ---------- */
  var currentView = 'messages';
  function setView(name) {
    currentView = name;
    $$('.tab').forEach(function (t) {
      if (t.getAttribute('data-view') === name) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    VIEWS.forEach(function (v) { $('#view-' + v).hidden = name !== v; });
    history.replaceState(null, '', '#' + name);
    stopChatPolling();
    if (name === 'messages') loadMessages();
    else if (name === 'bookings') loadBookings();
    else if (name === 'chat') startChatPolling();
    else if (name === 'content') loadContent();
    else if (name === 'team') loadTeam();
    else if (name === 'subscribers') loadSubscribers();
    else loadStores();
  }
  $$('.tab').forEach(function (t) { t.addEventListener('click', function () { setView(t.getAttribute('data-view')); }); });

  /* =========================================================
     Messages
     ========================================================= */
  var msgState = { status: 'active', q: '', items: [], selected: null };

  function fmtDate(iso, long) {
    var d = new Date(iso);
    var now = new Date();
    var opts = long
      ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
      : (d.toDateString() === now.toDateString() ? { hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short' });
    return d.toLocaleString(undefined, opts);
  }

  function loadMessages(silent) {
    var list = $('#msg-list');
    if (!silent && !msgState.items.length) list.replaceChildren(el('p', { class: 'list-empty', text: 'Loading messages' }));
    var qs = '?kind=message&status=' + encodeURIComponent(msgState.status) + (msgState.q ? '&q=' + encodeURIComponent(msgState.q) : '');
    $('#export-csv').href = '/api/admin/submissions' + qs + '&format=csv';
    return api('/api/admin/submissions' + qs).then(function (data) {
      var sig = qs + JSON.stringify(data);
      if (silent && sig === msgState.sig) return; // nothing changed since last check
      msgState.sig = sig;
      if (silent && msgState.items.length && data.submissions.some(function (m) { return m.status === 'new' && !msgState.items.some(function (x) { return x.id === m.id; }); })) toast('New message received.');
      msgState.items = data.submissions;
      var c = data.counts || {};
      var badge = $('#new-badge');
      badge.hidden = !c.new; badge.textContent = c.new || 0;
      $('[data-count="new"]').textContent = c.new ? c.new : '';
      $('[data-count="archived"]').textContent = c.archived ? c.archived : '';
      setBookingBadge(c.newBookings);
      renderMessages();
    }).catch(function (err) {
      if (err.status !== 401) list.replaceChildren(el('p', { class: 'list-empty', text: err.message }));
    });
  }

  function renderMessages() {
    var list = $('#msg-list');
    if (!msgState.items.length) {
      var emptyText = msgState.q ? 'No messages match "' + msgState.q + '".' :
        msgState.status === 'archived' ? 'No archived messages.' :
        msgState.status === 'new' ? 'No new messages. You are all caught up.' : 'No messages yet. New form submissions will show up here.';
      list.replaceChildren(el('p', { class: 'list-empty', text: emptyText }));
    } else {
      list.replaceChildren.apply(list, msgState.items.map(function (m) {
        return el('button', {
          type: 'button', class: 'msg-item', 'data-status': m.status, 'aria-current': String(msgState.selected === m.id),
          onclick: function () { selectMessage(m.id); }
        }, [
          el('span', { class: 'dot' + (m.status === 'new' ? '' : ' dot--off'), 'aria-label': m.status === 'new' ? 'New' : null }),
          el('span', { class: 'msg-name', text: m.firstName + ' ' + m.lastName + (m.company ? ', ' + m.company : '') }),
          el('span', { class: 'msg-date', text: fmtDate(m.createdAt) }),
          el('span', { class: 'msg-sub', text: [m.discuss.join(', '), m.budget].filter(Boolean).join(' · ') })
        ]);
      }));
    }
    var current = msgState.items.find(function (m) { return m.id === msgState.selected; });
    renderDetail(current || null);
  }

  function selectMessage(id) {
    msgState.selected = id;
    var m = msgState.items.find(function (x) { return x.id === id; });
    renderMessages();
    if (m && m.status === 'new') updateStatus(m, 'read', true);
    if (window.matchMedia('(max-width: 900px)').matches) window.scrollTo({ top: 0 });
  }

  function updateStatus(m, status, silent) {
    return api('/api/admin/submissions', { method: 'PATCH', json: { ids: [m.id], status: status } }).then(function () {
      if (!silent) toast(status === 'archived' ? 'Message archived.' : status === 'new' ? 'Marked as unread.' : 'Moved to inbox.');
      if (status === 'archived' && msgState.status !== 'archived' && msgState.status !== 'all') msgState.selected = null;
      return loadMessages();
    }).catch(function (err) { toast(err.message, true); });
  }

  function renderDetail(m) {
    var box = $('#msg-detail');
    var split = $('.split');
    split.classList.toggle('has-detail', !!m);
    if (!m) {
      box.replaceChildren(el('div', { class: 'empty-detail' }, [
        el('span', { html: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>' }),
        el('p', { text: msgState.items.length ? 'Select a message to read it.' : 'Nothing to show here.' })
      ]));
      return;
    }
    var name = m.firstName + ' ' + m.lastName;
    var subject = 'Re: your enquiry to PrimeSphere';
    var cell = function (label, value, wide) {
      return el('div', { class: 'detail-cell' + (wide ? ' detail-cell--wide' : '') }, [el('dt', { text: label }), el('dd', {}, [value])]);
    };
    var dash = function (v) { return v ? v : '-'; };

    box.replaceChildren(
      el('div', { class: 'detail-head' }, [
        el('button', { type: 'button', class: 'ghost-btn back-btn', onclick: function () { msgState.selected = null; renderMessages(); } }, [el('span', { html: ICON.back }), 'All messages']),
        el('div', { class: 'detail-top' }, [
          el('div', {}, [el('h2', { text: name }), el('p', { class: 'muted', text: fmtDate(m.createdAt, true) })]),
          el('span', { class: 'status-pill', 'data-s': m.status, text: m.status === 'new' ? 'New' : m.status === 'archived' ? 'Archived' : 'Read' })
        ]),
        el('div', { class: 'detail-actions' }, [
          el('a', { class: 'btn', href: 'mailto:' + m.email + '?subject=' + encodeURIComponent(subject), text: 'Reply by email' }),
          m.phone ? el('a', { class: 'ghost-btn', href: 'tel:' + m.phone.replace(/[^\d+]/g, ''), text: 'Call' }) : null,
          m.status !== 'new' ? el('button', { type: 'button', class: 'ghost-btn', text: 'Mark as unread', onclick: function () { updateStatus(m, 'new'); } }) : null,
          m.status !== 'archived'
            ? el('button', { type: 'button', class: 'ghost-btn', text: 'Archive', onclick: function () { updateStatus(m, 'archived'); } })
            : el('button', { type: 'button', class: 'ghost-btn', text: 'Move to inbox', onclick: function () { updateStatus(m, 'read'); } }),
          el('button', { type: 'button', class: 'ghost-btn ghost-btn--danger', text: 'Delete', onclick: function () { deleteMessage(m); } })
        ])
      ]),
      el('dl', { class: 'detail-grid', style: 'margin:0' }, [
        cell('Reply to', el('a', { href: 'mailto:' + m.email, text: m.email })),
        cell('Call me on', m.phone ? el('a', { href: 'tel:' + m.phone.replace(/[^\d+]/g, ''), text: m.phone }) : document.createTextNode('-')),
        cell('From', document.createTextNode(dash(m.company))),
        cell('Monthly budget', document.createTextNode(dash(m.budget))),
        cell("I'd like to discuss", el('div', { class: 'chips' }, m.discuss.map(function (d) { return el('span', { class: 'chip', text: d }); })), true),
        cell('I need help with', document.createTextNode(dash(m.helpWith)), true)
      ])
    );
  }

  function deleteMessage(m) {
    if (!confirm('Delete the message from ' + m.firstName + ' ' + m.lastName + '? This cannot be undone.')) return;
    api('/api/admin/submissions?id=' + m.id, { method: 'DELETE' }).then(function () {
      toast('Message deleted.');
      msgState.selected = null;
      loadMessages();
    }).catch(function (err) { toast(err.message, true); });
  }

  $$('.segment[data-status]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.segment[data-status]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      msgState.status = b.getAttribute('data-status');
      msgState.selected = null;
      loadMessages();
    });
  });
  var searchTimer;
  $('#msg-search').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { msgState.q = e.target.value.trim(); msgState.selected = null; loadMessages(); }, 300);
  });
  // Refresh the inbox when you come back to the tab.

  /* =========================================================
     Stores
     ========================================================= */
  var stores = [];

  var storesSig = '';
  function loadStores(silent) {
    var list = $('#store-list');
    if (!silent && !stores.length) list.replaceChildren(el('p', { class: 'list-empty', text: 'Loading stores' }));
    return api('/api/admin/stores').then(function (data) {
      var sig = JSON.stringify(data.stores);
      if (silent && sig === storesSig) return;
      storesSig = sig;
      stores = data.stores;
      renderStores();
    }).catch(function (err) {
      if (err.status !== 401) list.replaceChildren(el('p', { class: 'list-empty', text: err.message }));
    });
  }

  function renderStores() {
    var list = $('#store-list');
    var featured = stores.filter(function (s) { return s.featured && s.published; }).length;
    $('#featured-note').textContent = featured > 5
      ? featured + ' stores are featured, but the homepage shows only the first 5. Reorder or unfeature some.'
      : 'Featured stores show on the homepage (' + featured + ' of 5 used). Every visible store shows on the stores page.';

    if (!stores.length) {
      list.replaceChildren(el('p', { class: 'list-empty', text: 'No stores yet. Select "Add store" to add your first one.' }));
      return;
    }
    list.replaceChildren.apply(list, stores.map(function (s, i) {
      var first = s.pages[0] && s.pages[0].image;
      return el('div', { class: 'store-row' + (s.published ? '' : ' is-hidden') }, [
        el('div', { class: 'thumb' }, [first ? el('img', { src: first, alt: '', loading: 'lazy' }) : 'No image']),
        el('div', { class: 'store-meta' }, [
          el('strong', { text: s.name }),
          el('div', { class: 'tags' }, [
            s.category ? el('span', { class: 'tag', text: s.category }) : null,
            el('span', { class: 'tag', text: s.pages.length + (s.pages.length === 1 ? ' page' : ' pages') }),
            s.featured ? el('span', { class: 'tag tag--featured', text: 'Featured' }) : null,
            s.published ? null : el('span', { class: 'tag tag--hidden', text: 'Hidden' })
          ])
        ]),
        el('div', { class: 'row-actions' }, [
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move ' + s.name + ' up', disabled: i === 0, html: ICON.up, onclick: function () { move(i, -1); } }),
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move ' + s.name + ' down', disabled: i === stores.length - 1, html: ICON.down, onclick: function () { move(i, 1); } }),
          el('button', { type: 'button', class: 'ghost-btn', onclick: function () { openEditor(s); } }, [el('span', { html: ICON.edit }), 'Edit']),
          el('button', { type: 'button', class: 'icon-btn icon-btn--danger', 'aria-label': 'Delete ' + s.name, html: ICON.trash, onclick: function () { deleteStore(s); } })
        ])
      ]);
    }));
  }

  function move(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= stores.length) return;
    var tmp = stores[i]; stores[i] = stores[j]; stores[j] = tmp;
    renderStores();
    api('/api/admin/stores', { method: 'PATCH', json: { order: stores.map(function (s) { return s.id; }) } })
      .catch(function (err) { toast(err.message, true); loadStores(); });
  }

  function deleteStore(s) {
    if (!confirm('Delete "' + s.name + '"? Its uploaded screenshots are deleted too. This cannot be undone.')) return;
    api('/api/admin/stores?id=' + s.id, { method: 'DELETE' }).then(function () {
      toast('Store deleted.');
      loadStores();
    }).catch(function (err) { toast(err.message, true); });
  }

  /* ---------- Store editor ---------- */
  var editing = null;
  var QUICK = ['Homepage', 'Collection', 'Product', 'Cart', 'About', 'Checkout', 'Contact', 'Blog'];
  var form = $('#store-form');
  var rowsBox = $('#page-rows');

  function openEditor(s) {
    editing = s || null;
    $('#editor-title').textContent = s ? 'Edit store' : 'Add store';
    $('#store-msg').textContent = '';
    form.name.value = s ? s.name : '';
    form.category.value = s ? s.category : '';
    form.url.value = s ? s.url : '';
    form.published.checked = s ? s.published : true;
    form.featured.checked = s ? s.featured : false;

    var cats = {};
    stores.forEach(function (x) { if (x.category) cats[x.category] = 1; });
    $('#category-list').replaceChildren.apply($('#category-list'), Object.keys(cats).map(function (c) { return el('option', { value: c }); }));

    rowsBox.replaceChildren();
    var pages = s ? s.pages : [{ label: 'Homepage', image: '' }, { label: 'Collection', image: '' }, { label: 'Product', image: '' }];
    pages.forEach(function (p) { addPageRow(p.label, p.image); });
    refreshQuick();

    var d = $('#editor');
    d.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add('is-open'); }); });
    form.name.focus();
  }

  function closeEditor() {
    var busy = $$('.page-row', rowsBox).some(function (r) { return r.dataset.uploading === '1'; });
    if (busy && !confirm('A screenshot is still uploading. Close anyway?')) return;
    var d = $('#editor');
    d.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () { d.hidden = true; }, 350);
  }
  $$('[data-close-editor]').forEach(function (b) { b.addEventListener('click', closeEditor); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#editor').hidden) closeEditor(); });
  $('#add-store').addEventListener('click', function () { openEditor(null); });

  function refreshQuick() {
    var used = $$('.page-label', rowsBox).map(function (i) { return i.value.trim().toLowerCase(); });
    var box = $('#quick-pages');
    var buttons = QUICK.filter(function (q) { return used.indexOf(q.toLowerCase()) === -1; }).map(function (q) {
      return el('button', { type: 'button', text: '+ ' + q, onclick: function () { addPageRow(q, ''); refreshQuick(); } });
    });
    buttons.push(el('button', { type: 'button', text: '+ Custom page', onclick: function () { var r = addPageRow('', ''); $('.page-label', r).focus(); refreshQuick(); } }));
    box.replaceChildren.apply(box, buttons);
    renumber();
  }

  function renumber() {
    var rows = $$('.page-row', rowsBox);
    rows.forEach(function (r, i) {
      $('[data-act="up"]', r).disabled = i === 0;
      $('[data-act="down"]', r).disabled = i === rows.length - 1;
    });
  }

  function setThumb(row, url) {
    var t = $('.thumb', row);
    t.replaceChildren(url ? el('a', { href: url, target: '_blank', rel: 'noopener', 'aria-label': 'Open screenshot in a new tab', style: 'display:block;width:100%;height:100%' }, [el('img', { src: url, alt: '' })]) : document.createTextNode('No image'));
  }

  function addPageRow(label, image) {
    var status = el('span', { class: 'upload-status', text: image ? '' : 'No screenshot yet' });
    var bar = el('div', { class: 'progress', hidden: true }, [el('span')]);
    var urlInput = el('input', { type: 'url', class: 'page-image', placeholder: 'Or paste an image link (https://...)', value: image || '', 'aria-label': 'Image link' });
    var fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Upload screenshot' });
    var row = el('div', { class: 'page-row' }, [
      el('div', { class: 'thumb' }),
      el('div', { class: 'page-fields' }, [
        el('input', { type: 'text', class: 'page-label', maxlength: '40', placeholder: 'Page name, e.g. Product', value: label || '', 'aria-label': 'Page name', oninput: refreshQuick }),
        el('div', { class: 'upload-line' }, [
          el('label', { class: 'ghost-btn upload-btn' }, ['Upload screenshot', fileInput]),
          status
        ]),
        bar,
        urlInput
      ]),
      el('div', { class: 'page-actions' }, [
        el('button', { type: 'button', class: 'icon-btn', 'data-act': 'up', 'aria-label': 'Move page up', html: ICON.up, onclick: function () { if (row.previousElementSibling) rowsBox.insertBefore(row, row.previousElementSibling); renumber(); } }),
        el('button', { type: 'button', class: 'icon-btn', 'data-act': 'down', 'aria-label': 'Move page down', html: ICON.down, onclick: function () { if (row.nextElementSibling) rowsBox.insertBefore(row.nextElementSibling, row); renumber(); } }),
        el('button', { type: 'button', class: 'icon-btn icon-btn--danger', 'aria-label': 'Remove page', html: ICON.trash, onclick: function () { row.remove(); refreshQuick(); } })
      ])
    ]);
    setThumb(row, image);
    urlInput.addEventListener('change', function () { setThumb(row, urlInput.value.trim()); status.textContent = ''; });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files[0];
      fileInput.value = '';
      if (file) uploadInto(row, file, { status: status, bar: bar, urlInput: urlInput });
    });
    rowsBox.appendChild(row);
    renumber();
    return row;
  }

  /* ---------- Image upload (shrinks large screenshots first) ---------- */
  var MAX_BYTES = 4.2 * 1024 * 1024;
  var MAX_PIXELS = 16000000; // stays under Safari's canvas limit

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
      img.src = url;
    });
  }
  function toBlob(canvas, type, q) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, q); });
  }
  function prepareImage(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return Promise.reject(new Error('Upload a JPG, PNG or WebP image.'));
    return loadImage(file).then(function (res) {
      var img = res.img;
      var w = Math.min(1440, img.naturalWidth);
      var h = Math.round(img.naturalHeight * (w / img.naturalWidth));
      if (w * h > MAX_PIXELS) { var k = Math.sqrt(MAX_PIXELS / (w * h)); w = Math.floor(w * k); h = Math.floor(h * k); }
      if (file.size <= MAX_BYTES && w === img.naturalWidth) { URL.revokeObjectURL(res.url); return file; }
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(res.url);
      var tries = [0.86, 0.74, 0.6, 0.45];
      var attempt = function (i) {
        return toBlob(c, 'image/webp', tries[i]).then(function (b) {
          // Some browsers can't make WebP; fall back to JPEG.
          if (!b || b.type !== 'image/webp') return toBlob(c, 'image/jpeg', tries[i]);
          return b;
        }).then(function (b) {
          if (b && b.size <= MAX_BYTES) return b;
          if (i + 1 < tries.length) return attempt(i + 1);
          throw new Error('This screenshot is too large even after compressing. Try a shorter capture.');
        });
      };
      return attempt(0);
    });
  }
  // Shrinks (if needed) and uploads one image to Vercel Blob. Resolves with its URL.
  function uploadFile(file, folder, onProgress) {
    return prepareImage(file).then(function (blob) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/admin/upload?folder=' + folder + '&filename=' + encodeURIComponent(file.name));
        xhr.setRequestHeader('Content-Type', blob.type);
        xhr.setRequestHeader('X-Requested-With', 'fetch');
        xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = function () {
          var data = {};
          try { data = JSON.parse(xhr.responseText); } catch (e) {}
          if (xhr.status === 401) showLogin('Your session ended. Sign in again.');
          if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data.url);
          else reject(new Error(data.error || 'Upload failed (' + xhr.status + ').'));
        };
        xhr.onerror = function () { reject(new Error('Upload failed. Check your connection.')); };
        xhr.send(blob);
      });
    });
  }
  function uploadInto(row, file, ui, folder) {
    row.dataset.uploading = '1';
    ui.status.className = 'upload-status';
    ui.status.textContent = 'Preparing image';
    ui.bar.hidden = false;
    var fill = $('span', ui.bar);
    fill.style.width = '0%';
    uploadFile(file, folder || 'stores', function (pct) {
      fill.style.width = pct + '%';
      ui.status.textContent = 'Uploading ' + pct + '%';
    }).then(function (url) {
      ui.urlInput.value = url;
      setThumb(row, url);
      ui.status.className = 'upload-status is-ok';
      ui.status.textContent = 'Uploaded';
    }).catch(function (err) {
      ui.status.className = 'upload-status is-err';
      ui.status.textContent = err.message;
    }).then(function () {
      row.dataset.uploading = '';
      ui.bar.hidden = true;
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('#store-msg');
    msg.textContent = '';
    if ($$('.page-row', rowsBox).some(function (r) { return r.dataset.uploading === '1'; })) {
      msg.textContent = 'Wait for the screenshots to finish uploading.'; return;
    }
    if (!form.name.value.trim()) { msg.textContent = 'Enter a store name.'; form.name.focus(); return; }
    var pages = $$('.page-row', rowsBox).map(function (r) {
      return { label: $('.page-label', r).value.trim(), image: $('.page-image', r).value.trim() };
    }).filter(function (p) { return p.label || p.image; });
    var missing = pages.find(function (p) { return !p.image; });
    if (missing) { msg.textContent = 'Add a screenshot for the "' + (missing.label || 'unnamed') + '" page, or remove that page.'; return; }
    if (pages.some(function (p) { return !p.label; })) { msg.textContent = 'Every page needs a name, like Homepage or Product.'; return; }

    var payload = {
      name: form.name.value.trim(), category: form.category.value.trim(), url: form.url.value.trim(),
      published: form.published.checked, featured: form.featured.checked, pages: pages
    };
    if (editing) payload.id = editing.id;
    var btn = $('#save-store');
    btn.disabled = true; btn.textContent = 'Saving';
    api('/api/admin/stores', { method: editing ? 'PUT' : 'POST', json: payload }).then(function () {
      toast(editing ? 'Store updated. The website shows it within a minute.' : 'Store added. The website shows it within a minute.');
      closeEditor();
      loadStores();
    }).catch(function (err) { msg.textContent = err.message; })
      .then(function () { btn.disabled = false; btn.textContent = 'Save store'; });
  });


  /* =========================================================
     Bookings
     ========================================================= */
  var bk = { status: 'upcoming', q: '', items: [], selected: null };

  function setBookingBadge(n) {
    var b = $('#booking-badge');
    if (n == null) return;
    b.hidden = !n; b.textContent = n;
  }
  function bkDate(m, opts) {
    return new Date(m.startsAt).toLocaleString(undefined, Object.assign({ timeZone: m.timezone || undefined }, opts));
  }
  function zoneLabel(tz) {
    if (!tz) return '';
    var off = '';
    try { off = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(function (p) { return p.type === 'timeZoneName'; }).value; } catch (e) {}
    return tz.split('/').pop().replace(/_/g, ' ') + (off ? ' (' + off + ')' : '');
  }
  function clientTime(m, opts) {
    return new Date(m.startsAt).toLocaleString(undefined, Object.assign({ timeZone: m.visitorTz || m.timezone || undefined }, opts));
  }
  function bkStatusLabel(s) { return { new: 'New', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' }[s] || s; }

  function loadBookings(silent) {
    var list = $('#bk-list');
    if (!silent && !bk.items.length) list.replaceChildren(el('p', { class: 'list-empty', text: 'Loading bookings' }));
    var qs = '?kind=booking&status=' + bk.status + (bk.q ? '&q=' + encodeURIComponent(bk.q) : '');
    $('#bk-export').href = '/api/admin/submissions' + qs + '&format=csv';
    return api('/api/admin/submissions' + qs).then(function (d) {
      var sig = qs + JSON.stringify(d);
      if (silent && sig === bk.sig) return;
      bk.sig = sig;
      if (silent && bk.items.length && d.submissions.some(function (m) { return !bk.items.some(function (x) { return x.id === m.id; }); })) toast('New booking received.');
      bk.items = d.submissions;
      setBookingBadge(d.counts.newBookings);
      $('#bk-upcoming-count').textContent = d.counts.upcoming || '';
      renderBookings();
    }).catch(function (err) { if (err.status !== 401) list.replaceChildren(el('p', { class: 'list-empty', text: err.message })); });
  }

  function renderBookings() {
    var list = $('#bk-list');
    if (!bk.items.length) {
      list.replaceChildren(el('p', { class: 'list-empty', text: bk.q ? 'No bookings match "' + bk.q + '".' : bk.status === 'upcoming' ? 'No upcoming calls. New bookings from the contact page appear here.' : 'Nothing here yet.' }));
    } else {
      var nodes = [], lastDay = '';
      bk.items.forEach(function (m) {
        var day = bkDate(m, { weekday: 'long', day: 'numeric', month: 'long' });
        if (day !== lastDay) { nodes.push(el('div', { class: 'bk-day-head', text: day })); lastDay = day; }
        nodes.push(el('button', {
          type: 'button', class: 'msg-item', 'data-status': m.status === 'new' ? 'new' : 'read', 'aria-current': String(bk.selected === m.id),
          onclick: function () { bk.selected = m.id; renderBookings(); if (m.status === 'new') { /* stays new until you confirm */ } if (window.matchMedia('(max-width: 900px)').matches) window.scrollTo({ top: 0 }); }
        }, [
          el('span', { class: 'dot' + (m.status === 'new' ? '' : ' dot--off') }),
          el('span', { class: 'msg-name', text: m.firstName + ' ' + m.lastName + (m.company ? ', ' + m.company : '') }),
          el('span', { class: 'msg-date', text: bkDate(m, { hour: 'numeric', minute: '2-digit' }) }),
          el('span', { class: 'msg-sub', text: bkStatusLabel(m.status) + (m.visitorTz && m.visitorTz !== m.timezone ? ' · Client: ' + clientTime(m, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' ' + m.visitorTz.split('/').pop().replace(/_/g, ' ') : '') + ' · ' + m.discuss.join(', ') })
        ]));
      });
      list.replaceChildren.apply(list, nodes);
    }
    renderBookingDetail(bk.items.find(function (m) { return m.id === bk.selected; }) || null);
  }

  function gcal(m) {
    var f = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var s = new Date(m.startsAt), e = new Date(s.getTime() + (m.duration || 30) * 60000);
    var details = ['Booked from the PrimeSphere website.', 'Email: ' + m.email, 'Phone: ' + m.phone, m.company ? 'Company: ' + m.company : '', 'Topics: ' + m.discuss.join(', '), m.helpWith ? 'Notes: ' + m.helpWith : ''].filter(Boolean).join('\n');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Call: ' + m.firstName + ' ' + m.lastName) +
      '&dates=' + f(s) + '/' + f(e) + '&details=' + encodeURIComponent(details) + '&add=' + encodeURIComponent(m.email);
  }

  function renderBookingDetail(m) {
    var box = $('#bk-detail');
    $('.split--bk').classList.toggle('has-detail', !!m);
    if (!m) {
      box.replaceChildren(el('div', { class: 'empty-detail' }, [el('p', { text: bk.items.length ? 'Select a booking to see the details.' : 'Nothing to show here.' })]));
      return;
    }
    var start = new Date(m.startsAt);
    var longFmt = { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' };
    var endAt = new Date(start.getTime() + (m.duration || 30) * 60000);
    var range = function (tz) {
      return start.toLocaleString(undefined, Object.assign({ timeZone: tz }, longFmt)) + ' to ' + endAt.toLocaleTimeString(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    };
    var zoneRow = function (who, tz) {
      return el('div', { class: 'tz-row' }, [
        el('span', { class: 'tz-who', text: who }),
        el('strong', { text: range(tz) }),
        el('small', { text: zoneLabel(tz) })
      ]);
    };
    var cell = function (label, value, wide) { return el('div', { class: 'detail-cell' + (wide ? ' detail-cell--wide' : '') }, [el('dt', { text: label }), el('dd', {}, [value])]); };
    var txt = function (v) { return document.createTextNode(v || '-'); };
    var act = function (label, status, cls) { return el('button', { type: 'button', class: cls || 'ghost-btn', text: label, onclick: function () { setBookingStatus(m, status); } }); };
    var actions = [el('a', { class: 'btn', href: 'mailto:' + m.email + '?subject=' + encodeURIComponent('Your call with PrimeSphere on ' + bkDate(m, { weekday: 'long', day: 'numeric', month: 'long' })), text: 'Email' })];
    if (m.status === 'new') actions.push(act('Confirm', 'confirmed'));
    if (m.status !== 'cancelled' && m.status !== 'completed') actions.push(el('a', { class: 'ghost-btn', href: gcal(m), target: '_blank', rel: 'noopener', text: 'Add to Google Calendar' }));
    if (m.status !== 'completed' && m.status !== 'cancelled' && start < new Date()) actions.push(act('Mark completed', 'completed'));
    if (m.status !== 'cancelled') actions.push(act('Cancel call', 'cancelled', 'ghost-btn ghost-btn--danger'));
    else actions.push(act('Restore', 'confirmed'));
    actions.push(el('button', { type: 'button', class: 'ghost-btn ghost-btn--danger', text: 'Delete', onclick: function () { deleteBooking(m); } }));

    box.replaceChildren(
      el('div', { class: 'detail-head' }, [
        el('button', { type: 'button', class: 'ghost-btn back-btn', onclick: function () { bk.selected = null; renderBookings(); } }, [el('span', { html: ICON.back }), 'All bookings']),
        el('div', { class: 'detail-top' }, [
          el('div', {}, [el('h2', { text: m.firstName + ' ' + m.lastName }), el('p', { class: 'muted', text: 'Booked ' + fmtDate(m.createdAt, true) })]),
          el('span', { class: 'status-pill', 'data-s': m.status, text: bkStatusLabel(m.status) })
        ]),
        el('div', { class: 'bk-when' }, [
          el('div', { class: 'bk-date-box' }, [el('span', { text: bkDate(m, { month: 'short' }) }), el('b', { text: bkDate(m, { day: 'numeric' }) })]),
          el('div', { class: 'tz-rows' }, [
            zoneRow('Your time', m.timezone),
            zoneRow('Client time', m.visitorTz || m.timezone),
            el('small', { class: 'tz-len', text: (m.duration || 30) + ' minute call' + ((m.visitorTz || m.timezone) === m.timezone ? ' · client is in the same time zone' : '') })
          ])
        ]),
        el('div', { class: 'detail-actions' }, actions)
      ]),
      el('dl', { class: 'detail-grid', style: 'margin:0' }, [
        cell('Email', el('a', { href: 'mailto:' + m.email, text: m.email })),
        cell('Phone', m.phone ? el('a', { href: 'tel:' + m.phone.replace(/[^\d+]/g, ''), text: m.phone }) : txt('')),
        cell('Company', txt(m.company)),
        cell('Topics', el('div', { class: 'chips' }, m.discuss.map(function (d) { return el('span', { class: 'chip', text: d }); }))),
        cell('Notes', txt(m.helpWith), true)
      ])
    );
  }

  function setBookingStatus(m, status) {
    if (status === 'cancelled' && !confirm('Cancel the call with ' + m.firstName + '? The time becomes available to book again. Let them know by email.')) return;
    api('/api/admin/submissions', { method: 'PATCH', json: { ids: [m.id], status: status } }).then(function () {
      toast({ confirmed: 'Call confirmed.', completed: 'Marked as completed.', cancelled: 'Call cancelled. The time is open again.' }[status] || 'Updated.');
      loadBookings();
    }).catch(function (err) { toast(err.message, true); });
  }
  function deleteBooking(m) {
    if (!confirm('Delete the booking from ' + m.firstName + ' ' + m.lastName + '? This cannot be undone.')) return;
    api('/api/admin/submissions?id=' + m.id, { method: 'DELETE' }).then(function () {
      toast('Booking deleted.'); bk.selected = null; loadBookings();
    }).catch(function (err) { toast(err.message, true); });
  }
  $$('[data-bk-status]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('[data-bk-status]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      bk.status = b.getAttribute('data-bk-status'); bk.selected = null; loadBookings();
    });
  });
  var bkTimer;
  $('#bk-search').addEventListener('input', function (e) {
    clearTimeout(bkTimer);
    bkTimer = setTimeout(function () { bk.q = e.target.value.trim(); bk.selected = null; loadBookings(); }, 300);
  });

  /* =========================================================
     Content (homepage sections) + booking settings
     ========================================================= */
  var ICON_OPTIONS = [
    ['layout', 'Layout', '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'],
    ['code', 'Code', '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M9 10l-2 2 2 2M15 10l2 2-2 2"/>'],
    ['globe', 'Globe', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'],
    ['cart', 'Cart', '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11.5l2-8H6.2"/>'],
    ['megaphone', 'Ads', '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>'],
    ['search', 'SEO', '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'],
    ['pen', 'Design', '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'],
    ['chart', 'Growth', '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'],
    ['phone', 'Mobile', '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>'],
    ['mail', 'Email', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>']
  ];
  var TYPES = {
    project: {
      label: 'project', plural: 'Projects', help: 'Projects in the "See Our Recent Projects" section. The first 3 fit the homepage layout best.',
      fields: [
        { key: 'title', label: 'Project title*', type: 'text', max: 120, required: true, placeholder: 'e.g. Creative Logo Design' },
        { key: 'tags', label: 'Categories', type: 'text', max: 120, placeholder: 'e.g. Branding, Identity' },
        { key: 'image', label: 'Image', type: 'image', hint: 'Landscape works best, about 1200 x 800.' },
        { key: 'url', label: 'Link (optional)', type: 'url', placeholder: 'https://' }
      ],
      title: function (d) { return d.title; }, sub: function (d) { return d.tags; }, image: function (d) { return d.image; }
    },
    service: {
      label: 'service', plural: 'Services', help: 'Cards in the "Smart Development" section.',
      fields: [
        { key: 'title', label: 'Service name*', type: 'text', max: 80, required: true, placeholder: 'e.g. Shopify Development' },
        { key: 'icon', label: 'Icon', type: 'icon' },
        { key: 'items', label: 'What it includes', type: 'list', hint: 'One per line, up to 8.', placeholder: 'Theme builds\nStore migrations\nApp setup' },
        { key: 'url', label: '"Explore More" link (optional)', type: 'url', placeholder: 'Leave empty to link to the contact page' }
      ],
      title: function (d) { return d.title; }, sub: function (d) { return (d.items || []).join(', '); }, icon: function (d) { return d.icon; }
    },
    testimonial: {
      label: 'testimonial', plural: 'Testimonials', help: 'Quotes in the Clients Testimonials slider.',
      fields: [
        { key: 'quote', label: 'Quote*', type: 'textarea', max: 600, required: true, placeholder: 'What the client said' },
        { key: 'name', label: 'Client name*', type: 'text', max: 80, required: true },
        { key: 'role', label: 'Role and company', type: 'text', max: 120, placeholder: 'e.g. Founder, Bloom Co' },
        { key: 'avatar', label: 'Photo (optional)', type: 'image', hint: 'Square photo, shown as a small circle.' }
      ],
      title: function (d) { return d.name; }, sub: function (d) { return d.role; }, quote: function (d) { return d.quote; }, image: function (d) { return d.avatar; }
    },
    client: {
      label: 'client logo', plural: 'Client logos', help: 'Logos in the scrolling "Trusted by brands" strip. Transparent PNG or WebP logos look best.',
      fields: [
        { key: 'name', label: 'Client name*', type: 'text', max: 80, required: true, hint: 'Shown instead of the logo if no image is uploaded.' },
        { key: 'logo', label: 'Logo', type: 'image', hint: 'Light or white logos show best on the dark background.' },
        { key: 'url', label: 'Link (optional)', type: 'url', placeholder: 'https://' }
      ],
      title: function (d) { return d.name; }, sub: function (d) { return d.url; }, image: function (d) { return d.logo; }
    },
    post: {
      label: 'blog post', plural: 'Blog posts', help: 'Posts on the blog page. The 2 newest also show on the homepage.',
      fields: [
        { key: 'title', label: 'Title*', type: 'text', max: 160, required: true },
        { key: 'date', label: 'Publish date', type: 'date' },
        { key: 'summary', label: 'Summary', type: 'textarea', max: 400, hint: 'One or two sentences shown on the cards.' },
        { key: 'image', label: 'Cover image', type: 'image', hint: 'Landscape, about 1600 x 900.' },
        { key: 'body', label: 'Article', type: 'textarea', tall: true, max: 50000, hint: 'Separate paragraphs with a blank line. Start a line with # to make it a heading.' },
        { key: 'url', label: 'External link (optional)', type: 'url', placeholder: 'https://', hint: 'Adds a "Read the full article" button, for posts published elsewhere.' }
      ],
      title: function (d) { return d.title; }, sub: function (d) { return d.date; }, image: function (d) { return d.image; }
    }
  };
  var ct = { type: 'project', items: [], editing: null };

  function loadContent(silent) {
    var isSettings = ct.type === 'booking';
    if (silent && isSettings) return; // never overwrite the settings form while someone may be editing it
    $('#content-list').hidden = isSettings;
    $('#booking-settings').hidden = !isSettings;
    $('#content-add').hidden = isSettings;
    if (isSettings) { $('#content-help').textContent = 'When people can book calls from the contact page.'; return loadBookingSettings(); }
    var T = TYPES[ct.type];
    $('#content-help').textContent = T.help;
    $('#content-add-label').textContent = 'Add ' + T.label;
    var list = $('#content-list');
    if (!silent) list.replaceChildren(el('p', { class: 'list-empty', text: 'Loading' }));
    var type = ct.type;
    return api('/api/admin/content?type=' + type).then(function (d) {
      if (ct.type !== type) return;
      var sig = type + JSON.stringify(d.items);
      if (silent && sig === ct.sig) return;
      ct.sig = sig;
      ct.items = d.items; renderContent();
    }).catch(function (err) { if (err.status !== 401) list.replaceChildren(el('p', { class: 'list-empty', text: err.message })); });
  }

  function iconSvg(name, size) {
    var o = ICON_OPTIONS.find(function (x) { return x[0] === name; }) || ICON_OPTIONS[0];
    return '<svg width="' + (size || 28) + '" height="' + (size || 28) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + o[2] + '</svg>';
  }

  function renderContent() {
    var T = TYPES[ct.type], list = $('#content-list');
    if (!ct.items.length) { list.replaceChildren(el('p', { class: 'list-empty', text: 'Nothing here yet. Select "Add ' + T.label + '" to add one. Until you do, this section is hidden on the website.' })); return; }
    list.replaceChildren.apply(list, ct.items.map(function (it, i) {
      var d = it.data, img = T.image ? T.image(d) : '';
      var thumb = T.icon ? el('div', { class: 'thumb', html: iconSvg(T.icon(d)) }) : el('div', { class: 'thumb' }, [img ? el('img', { src: img, alt: '' }) : 'No image']);
      return el('div', { class: 'store-row' + (it.published ? '' : ' is-hidden') }, [
        thumb,
        el('div', { class: 'store-meta' }, [
          el('strong', { text: T.title(d) || '(untitled)' }),
          T.quote ? el('span', { class: 'content-quote', text: T.quote(d) }) : null,
          el('div', { class: 'tags' }, [
            T.sub(d) ? el('span', { class: 'tag', text: T.sub(d) }) : null,
            it.published ? null : el('span', { class: 'tag tag--hidden', text: 'Hidden' })
          ])
        ]),
        el('div', { class: 'row-actions' }, [
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0, html: ICON.up, onclick: function () { moveContent(i, -1); } }),
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move down', disabled: i === ct.items.length - 1, html: ICON.down, onclick: function () { moveContent(i, 1); } }),
          el('button', { type: 'button', class: 'ghost-btn', onclick: function () { openContentEditor(it); } }, [el('span', { html: ICON.edit }), 'Edit']),
          el('button', { type: 'button', class: 'icon-btn icon-btn--danger', 'aria-label': 'Delete', html: ICON.trash, onclick: function () { deleteContent(it); } })
        ])
      ]);
    }));
  }

  function moveContent(i, dir) {
    var k = i + dir;
    if (k < 0 || k >= ct.items.length) return;
    var t = ct.items[i]; ct.items[i] = ct.items[k]; ct.items[k] = t;
    renderContent();
    api('/api/admin/content', { method: 'PATCH', json: { order: ct.items.map(function (x) { return x.id; }) } }).catch(function (err) { toast(err.message, true); loadContent(); });
  }
  function deleteContent(it) {
    var T = TYPES[ct.type];
    if (!confirm('Delete this ' + T.label + '? This cannot be undone.')) return;
    api('/api/admin/content?id=' + it.id, { method: 'DELETE' }).then(function () { toast('Deleted.'); loadContent(); }).catch(function (err) { toast(err.message, true); });
  }

  $$('[data-ctype]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('[data-ctype]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      ct.type = b.getAttribute('data-ctype'); loadContent();
    });
  });
  $('#content-add').addEventListener('click', function () { openContentEditor(null); });

  /* ---------- Content editor ---------- */
  var cForm = $('#content-form');
  function buildField(f, value) {
    var id = 'cf-' + f.key;
    if (f.type === 'image') {
      var status = el('span', { class: 'upload-status', text: value ? '' : 'No image yet' });
      var bar = el('div', { class: 'progress', hidden: true }, [el('span')]);
      var urlInput = el('input', { type: 'url', class: 'page-image', 'data-key': f.key, placeholder: 'Or paste an image link (https://...)', value: value || '', 'aria-label': f.label + ' link' });
      var file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Upload ' + f.label });
      var row = el('div', { class: 'image-field' }, [
        el('div', { class: 'thumb' }),
        el('div', { class: 'page-fields' }, [
          el('div', { class: 'upload-line' }, [el('label', { class: 'ghost-btn upload-btn' }, ['Upload image', file]),
            el('button', { type: 'button', class: 'ghost-btn', text: 'Remove', onclick: function () { urlInput.value = ''; setThumb(row, ''); status.textContent = 'No image'; } }), status]),
          bar, urlInput
        ])
      ]);
      setThumb(row, value);
      urlInput.addEventListener('change', function () { setThumb(row, urlInput.value.trim()); });
      file.addEventListener('change', function () { var fl = file.files[0]; file.value = ''; if (fl) uploadInto(row, fl, { status: status, bar: bar, urlInput: urlInput }, 'content'); });
      return el('div', { class: 'field' }, [el('span', { text: f.label }), f.hint ? el('small', { text: f.hint }) : null, row]);
    }
    if (f.type === 'icon') {
      return el('fieldset', { class: 'field', style: 'border:0;padding:0;margin:0' }, [
        el('legend', { text: f.label, style: 'margin-bottom:6px' }),
        el('div', { class: 'icon-pick' }, ICON_OPTIONS.map(function (o) {
          return el('label', {}, [el('input', { type: 'radio', name: 'icon', value: o[0], checked: (value || 'layout') === o[0], 'data-key': 'icon' }), el('span', { html: iconSvg(o[0], 22) + '<em style="font-style:normal">' + o[1] + '</em>' })]);
        }))
      ]);
    }
    var input;
    if (f.type === 'textarea' || f.type === 'list') {
      input = el('textarea', { id: id, 'data-key': f.key, class: f.tall ? 'tall' : null, maxlength: f.max || null, placeholder: f.placeholder || '' });
      input.value = f.type === 'list' ? (value || []).join('\n') : (value || '');
    } else {
      input = el('input', { id: id, 'data-key': f.key, type: f.type === 'url' ? 'url' : f.type === 'date' ? 'date' : 'text', maxlength: f.max || null, placeholder: f.placeholder || '', value: value || '' });
      if (f.type === 'date') input.style.colorScheme = 'dark';
    }
    return el('label', { class: 'field', for: id }, [f.label, f.hint ? el('small', { text: f.hint }) : null, input]);
  }

  function openContentEditor(it) {
    var T = TYPES[ct.type];
    ct.editing = it;
    $('#content-editor-title').textContent = (it ? 'Edit ' : 'Add ') + T.label;
    $('#content-msg').textContent = '';
    var d = it ? it.data : (ct.type === 'post' ? { date: new Date().toISOString().slice(0, 10) } : {});
    var box = $('#content-fields');
    box.replaceChildren.apply(box, T.fields.map(function (f) { return buildField(f, d[f.key]); }).concat([
      el('label', { class: 'toggle' }, [el('input', { type: 'checkbox', id: 'cf-published', checked: it ? it.published : true }), el('span', { class: 'switch', 'aria-hidden': 'true' }),
        el('span', {}, [el('strong', { text: 'Show on website' }), el('small', { text: 'Turn off to hide it without deleting.' })])])
    ]));
    var dr = $('#content-editor');
    dr.hidden = false; document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { requestAnimationFrame(function () { dr.classList.add('is-open'); }); });
    var first = $('input[type="text"], textarea', box); if (first) first.focus();
  }
  function closeContentEditor() {
    if ($('.image-field[data-uploading="1"]') && !confirm('An image is still uploading. Close anyway?')) return;
    var dr = $('#content-editor');
    dr.classList.remove('is-open'); document.body.style.overflow = '';
    setTimeout(function () { dr.hidden = true; }, 350);
  }
  $$('[data-close-content]').forEach(function (b) { b.addEventListener('click', closeContentEditor); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#content-editor').hidden) closeContentEditor(); });

  cForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var T = TYPES[ct.type], msg = $('#content-msg');
    if ($('.image-field[data-uploading="1"]')) { msg.textContent = 'Wait for the image to finish uploading.'; return; }
    var data = {};
    T.fields.forEach(function (f) {
      if (f.type === 'icon') { var c = $('input[name="icon"]:checked', cForm); data.icon = c ? c.value : 'layout'; return; }
      var inp = $('[data-key="' + f.key + '"]', cForm);
      var v = inp ? inp.value.trim() : '';
      data[f.key] = f.type === 'list' ? v.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : v;
    });
    var missing = T.fields.find(function (f) { return f.required && !data[f.key]; });
    if (missing) { msg.textContent = 'Fill in ' + missing.label.replace('*', '').toLowerCase() + '.'; $('[data-key="' + missing.key + '"]', cForm).focus(); return; }
    var published = $('#cf-published').checked;
    var btn = $('#content-save'); btn.disabled = true; btn.textContent = 'Saving';
    var req = ct.editing
      ? api('/api/admin/content', { method: 'PUT', json: { id: ct.editing.id, data: data, published: published } })
      : api('/api/admin/content', { method: 'POST', json: { type: ct.type, data: data, published: published } });
    req.then(function () {
      toast('Saved. The website shows it within a minute.');
      closeContentEditor(); loadContent();
    }).catch(function (err) { msg.textContent = err.message; })
      .then(function () { btn.disabled = false; btn.textContent = 'Save'; });
  });

  /* ---------- Booking settings ---------- */
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var ZONES = ['Asia/Manila', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Dubai', 'Asia/Kolkata', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'Pacific/Auckland', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'UTC'];
  var bset = null;

  function loadBookingSettings() {
    var f = $('#booking-settings');
    f.replaceChildren(el('p', { class: 'muted', text: 'Loading settings' }));
    return api('/api/admin/content?settings=booking').then(function (d) { bset = d.booking; renderBookingSettings(); })
      .catch(function (err) { f.replaceChildren(el('p', { class: 'form-msg', text: err.message })); });
  }
  function fmtSlot(t) { var p = t.split(':').map(Number); var d = new Date(2000, 0, 1, p[0], p[1]); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }

  function renderBookingSettings() {
    var f = $('#booking-settings');
    var slotsBox = el('div', { class: 'slot-chips' });
    var drawSlots = function () {
      bset.slots.sort();
      slotsBox.replaceChildren.apply(slotsBox, bset.slots.length ? bset.slots.map(function (t) {
        return el('span', { class: 'slot-chip' }, [fmtSlot(t), el('button', { type: 'button', 'aria-label': 'Remove ' + fmtSlot(t), html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>', onclick: function () { bset.slots = bset.slots.filter(function (x) { return x !== t; }); drawSlots(); } })]);
      }) : [el('span', { class: 'muted', text: 'No times yet. Add at least one.' })]);
    };
    drawSlots();
    var newSlot = el('input', { type: 'time', value: '09:00', 'aria-label': 'New time slot', step: '900' });
    var zoneList = el('datalist', { id: 'zone-list' }, ZONES.map(function (z) { return el('option', { value: z }); }));
    var msg = el('p', { class: 'form-msg', role: 'alert' });
    var num = function (name, label, value, min, max, hint) {
      return el('label', { class: 'field' }, [label, el('input', { type: 'number', name: name, value: String(value), min: String(min), max: String(max) }), hint ? el('small', { text: hint }) : null]);
    };
    f.replaceChildren(
      el('label', { class: 'toggle' }, [el('input', { type: 'checkbox', name: 'enabled', checked: bset.enabled }), el('span', { class: 'switch', 'aria-hidden': 'true' }),
        el('span', {}, [el('strong', { text: 'Accept call bookings' }), el('small', { text: 'Turn off to pause booking. Visitors are asked to send a message instead.' })])]),
      el('label', { class: 'field' }, ['Your time zone', el('input', { type: 'text', name: 'timezone', value: bset.timezone, list: 'zone-list', placeholder: 'e.g. Asia/Manila' }), el('small', { text: 'Your time slots are in this time zone. Visitors see them converted to their own.' }), zoneList]),
      el('fieldset', { class: 'field', style: 'border:0;padding:0;margin:0' }, [el('legend', { text: 'Days you take calls', style: 'margin-bottom:8px' }),
        el('div', { class: 'day-pick' }, DAYS.map(function (dname, i) { return el('label', {}, [el('input', { type: 'checkbox', name: 'day', value: String(i), checked: bset.days.indexOf(i) > -1 }), el('span', { text: dname })]); }))]),
      el('div', { class: 'field' }, [el('span', { text: 'Start times' }), el('small', { text: 'Each time is one bookable call. Remove a time to stop offering it.' }), slotsBox,
        el('div', { class: 'add-slot' }, [newSlot, el('button', { type: 'button', class: 'ghost-btn', text: 'Add time', onclick: function () {
          var v = newSlot.value; if (!/^\d{2}:\d{2}$/.test(v)) return;
          if (bset.slots.indexOf(v) === -1) bset.slots.push(v); drawSlots();
        } })])]),
      el('div', { class: 'row-3' }, [
        el('label', { class: 'field' }, ['Call length', el('select', { name: 'duration' }, [15, 20, 30, 45, 60, 90].map(function (m) { return el('option', { value: String(m), selected: bset.duration === m, text: m + ' minutes' }); }))]),
        num('daysAhead', 'Book up to (days ahead)', bset.daysAhead, 1, 120),
        num('minNoticeHours', 'Minimum notice (hours)', bset.minNoticeHours, 0, 336)
      ]),
      el('div', { class: 'settings-foot' }, [msg, el('button', { type: 'submit', class: 'btn', text: 'Save settings' })])
    );
  }
  $('#booking-settings').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, msg = $('.form-msg', f), btn = $('button[type="submit"]', f);
    var payload = {
      enabled: f.enabled.checked, timezone: f.timezone.value.trim(),
      days: $$('input[name="day"]:checked', f).map(function (x) { return Number(x.value); }),
      slots: bset.slots, duration: Number(f.duration.value), daysAhead: Number(f.daysAhead.value), minNoticeHours: Number(f.minNoticeHours.value)
    };
    msg.textContent = '';
    btn.disabled = true; btn.textContent = 'Saving';
    api('/api/admin/content?settings=booking', { method: 'PUT', json: payload }).then(function (d) {
      bset = d.booking; renderBookingSettings(); toast('Booking settings saved.');
    }).catch(function (err) { msg.textContent = err.message; btn.disabled = false; btn.textContent = 'Save settings'; });
  });

  /* =========================================================
     Live chat
     ========================================================= */
  var chat = { status: 'open', sessions: [], selected: null, session: null, messages: [], lastUnread: null };
  var listTimer = null, threadTimer = null, watchTimer = null;
  var baseTitle = document.title;

  function shortId(id) { return 'Visitor ' + String(id).slice(0, 4).toUpperCase(); }
  function chatName(s) { return s.name || s.email || shortId(s.id); }

  // Soft two-note chime made with Web Audio (no sound file needed).
  var audioCtx = null;
  function chime() {
    if (!$('#chat-sound').checked) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + i * 0.14);
        g.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + i * 0.14 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + i * 0.14 + 0.3);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(audioCtx.currentTime + i * 0.14); o.stop(audioCtx.currentTime + i * 0.14 + 0.32);
      });
    } catch (e) {}
  }
  try { $('#chat-sound').checked = localStorage.getItem('ps_admin_sound') !== 'off'; } catch (e) {}
  $('#chat-sound').addEventListener('change', function (e) { try { localStorage.setItem('ps_admin_sound', e.target.checked ? 'on' : 'off'); } catch (x) {} });

  function setUnread(n, open, d) {
    var b = $('#chat-badge');
    b.hidden = !n; b.textContent = n;
    $('#chat-open-count').textContent = open ? open : '';
    if (d) {
      $('#chat-mine-count').textContent = d.mine ? d.mine : '';
      $('#chat-unassigned-count').textContent = d.unassigned ? d.unassigned : '';
    }
    document.title = n ? '(' + n + ') New chat message | ' + baseTitle : baseTitle;
    if (chat.lastUnread !== null && n > chat.lastUnread) chime();
    chat.lastUnread = n;
  }

  /* ---------- Live updates (no refresh needed) ----------
     Every few seconds while this tab is visible:
     - the open section reloads quietly and only redraws when something changed,
     - the tab badges (messages, bookings, chat) update on every section,
     - your own account is re-checked, so a new name or role shows up right away.
     Live chat has its own faster loop (every 3-4 seconds). */
  var LIVE_MS = 8000;
  var lastMsgNew = null;
  function anyDrawerOpen() {
    return ['#editor', '#content-editor', '#admin-editor', '#me-editor'].some(function (id) { var d = $(id); return d && !d.hidden; });
  }
  function refreshCurrentView() {
    if (anyDrawerOpen()) return; // don't redraw underneath a form someone is filling in
    if (currentView === 'messages') loadMessages(true);
    else if (currentView === 'bookings') loadBookings(true);
    else if (currentView === 'content') loadContent(true);
    else if (currentView === 'stores') loadStores(true);
    else if (currentView === 'team') loadTeam(true);
    else if (currentView === 'subscribers') loadSubscribers(true);
  }
  function refreshBadges() {
    if (currentView !== 'chat') api('/api/admin/chat?status=open').then(function (d) { setUnread(d.unread, d.open, d); }).catch(function () {});
    if (currentView !== 'messages' && currentView !== 'bookings') {
      api('/api/admin/submissions?kind=message&status=new').then(function (d) {
        var c = d.counts || {};
        var badge = $('#new-badge');
        badge.hidden = !c.new; badge.textContent = c.new || 0;
        if (lastMsgNew !== null && c.new > lastMsgNew) toast('New message received.');
        lastMsgNew = c.new;
        setBookingBadge(c.newBookings);
      }).catch(function () {});
    }
    if (currentView !== 'subscribers') {
      api('/api/newsletter?status=subscribed&q=__none__').then(function (d) { setSubBadge(d.counts); }).catch(function () {});
    }
    api('/api/auth', { allow401: false }).then(function (d) {
      if (!me || d.name !== me.name || d.role !== me.role) {
        var lostTeam = me && me.role === 'super' && d.role !== 'super';
        setMe(d);
        if (lostTeam && currentView === 'team') setView('messages');
      }
    }).catch(function () {});
  }
  function startUnreadWatch() {
    clearTimeout(watchTimer);
    var tick = function () {
      if ($('#app').hidden) return;
      if (!document.hidden) { refreshBadges(); refreshCurrentView(); }
      watchTimer = setTimeout(tick, LIVE_MS);
    };
    refreshBadges(); // the open section was just loaded by setView
    watchTimer = setTimeout(tick, LIVE_MS);
  }
  // Coming back to the tab: catch up straight away instead of waiting for the next tick.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || $('#app').hidden) return;
    refreshBadges();
    if (currentView === 'chat') startChatPolling(); else refreshCurrentView();
  });

  function startChatPolling() { loadChatList(); if (chat.selected) loadThread(true); }
  function stopChatPolling() { clearTimeout(listTimer); clearTimeout(threadTimer); }

  function loadChatList() {
    clearTimeout(listTimer);
    var list = $('#chat-list');
    if (!chat.sessions.length && !list.children.length) list.replaceChildren(el('p', { class: 'list-empty', text: 'Loading chats' }));
    api('/api/admin/chat?status=' + chat.status).then(function (d) {
      chat.sessions = d.sessions;
      setUnread(d.unread, d.open, d);
      renderChatList();
    }).catch(function (err) {
      if (err.status !== 401) list.replaceChildren(el('p', { class: 'list-empty', text: err.message }));
    }).then(function () {
      if (currentView === 'chat' && !$('#app').hidden) listTimer = setTimeout(loadChatList, document.hidden ? 20000 : 4000);
    });
  }

  function renderChatList() {
    var list = $('#chat-list');
    if (!chat.sessions.length) {
      var emptyText = {
        open: 'No open chats right now. When a visitor sends a message it appears here.',
        mine: "You aren't handling any chats. Take one from Unassigned.",
        unassigned: 'Every open chat has someone on it.'
      }[chat.status] || 'No chats here yet.';
      list.replaceChildren(el('p', { class: 'list-empty', text: emptyText }));
      return;
    }
    list.replaceChildren.apply(list, chat.sessions.map(function (s) {
      var current = chat.selected === s.id;
      return el('button', {
        type: 'button', class: 'msg-item chat-item', 'data-status': s.unread && !current ? 'new' : 'read', 'aria-current': String(current),
        onclick: function () { openChat(s.id); }
      }, [
        el('span', { class: 'dot' + (s.status === 'open' ? '' : ' dot--off'), title: s.status === 'open' ? 'Open' : 'Ended' }),
        el('span', { class: 'msg-name', text: chatName(s) }),
        el('span', { class: 'msg-date', text: fmtDate(s.lastMessageAt) }),
        el('span', { class: 'msg-sub' }, [
          el('span', { text: (s.previewSender === 'admin' ? (me && s.previewAdminId === me.id ? 'You: ' : 'Team: ') : '') + (s.preview || '') }),
          s.unread && !current ? el('span', { class: 'unread-pill', text: String(s.unread) }) : null,
          ownerTag(s),
          s.rating ? el('span', { text: s.rating === 'up' ? 'Rated good' : 'Rated bad' }) : null
        ])
      ]);
    }));
  }

  function ownerTag(s) {
    if (s.status !== 'open') return null;
    if (s.mine) return el('span', { class: 'owner-tag owner-tag--mine', text: 'You' });
    if (s.assignedId) return el('span', { class: 'owner-tag', text: s.assignedName || 'Taken' });
    return el('span', { class: 'owner-tag owner-tag--free', text: 'Unassigned' });
  }

  function openChat(id) {
    chat.selected = id; chat.messages = []; chat.session = null;
    renderChatList();
    loadThread(true);
    if (window.matchMedia('(max-width: 900px)').matches) window.scrollTo({ top: 0 });
  }

  function loadThread(full) {
    clearTimeout(threadTimer);
    var id = chat.selected;
    if (!id) return renderThread();
    var after = full ? 0 : (chat.messages.length ? chat.messages[chat.messages.length - 1].id : 0);
    api('/api/admin/chat?id=' + encodeURIComponent(id) + '&after=' + after).then(function (d) {
      if (chat.selected !== id) return;
      var changed = full || d.messages.length || !chat.session || d.session.status !== chat.session.status || d.session.email !== chat.session.email || d.session.rating !== chat.session.rating || d.session.assignedId !== chat.session.assignedId;
      chat.session = d.session;
      chat.messages = full ? d.messages : chat.messages.concat(d.messages.filter(function (m) { return !chat.messages.some(function (x) { return x.id === m.id; }); }));
      if (changed) renderThread(full);
    }).catch(function (err) {
      if (err.status === 404) { chat.selected = null; renderThread(); loadChatList(); }
    }).then(function () {
      if (currentView === 'chat' && chat.selected === id && !$('#app').hidden) threadTimer = setTimeout(function () { loadThread(false); }, document.hidden ? 15000 : 3000);
    });
  }

  function renderThread(scrollToEnd) {
    var box = $('#chat-thread');
    var split = $('.split--chat');
    var s = chat.session;
    split.classList.toggle('has-detail', !!chat.selected);
    if (!chat.selected || !s) {
      if (!chat.selected) box.replaceChildren(el('div', { class: 'empty-detail' }, [el('p', { text: 'Select a chat to reply.' })]));
      return;
    }
    var oldLog = $('.thread-log', box);
    var nearBottom = !oldLog || oldLog.scrollHeight - oldLog.scrollTop - oldLog.clientHeight < 120;
    var draft = $('#reply-box') ? $('#reply-box').value : '';
    var hadFocus = document.activeElement && document.activeElement.id === 'reply-box';

    var logEl = el('div', { class: 'thread-log', role: 'log', 'aria-live': 'polite' }, chat.messages.map(function (m) {
      if (m.sender === 'system') return el('p', { class: 't-system', text: m.body + ' · ' + fmtDate(m.createdAt) });
      if (m.sender === 'note') return el('p', { class: 't-system t-note', title: 'Only admins can see this', text: m.body + ' · ' + fmtDate(m.createdAt) });
      var mineMsg = m.sender === 'admin' && me && m.adminId === me.id;
      var who = m.sender === 'admin' ? (mineMsg ? 'You' : (m.name || 'Team')) : 'Visitor';
      return el('div', { class: 't-row t-row--' + m.sender + (m.sender === 'admin' && !mineMsg ? ' t-row--teammate' : '') }, [
        el('div', { class: 't-bubble' }, [
          el('span', { class: 'sr-only', text: who + ': ' }),
          el('span', { text: m.body }),
          el('time', { text: (m.sender === 'admin' && !mineMsg ? who + ' · ' : '') + fmtDate(m.createdAt), datetime: m.createdAt })
        ])
      ]);
    }));

    var foot;
    var isSuper = me && me.role === 'super';
    if (s.status === 'open' && !s.assignedId) {
      foot = [el('div', { class: 'thread-note thread-note--claim' }, [
        el('span', {}, [el('strong', { text: 'Nobody is handling this chat yet.' }), ' Take it to reply. Other admins will see that it\'s yours.']),
        el('button', { type: 'button', class: 'btn', text: 'Take this chat', onclick: function (e) { claimChat('claim', e.currentTarget); } })
      ])];
    } else if (s.status === 'open' && !s.mine) {
      foot = [el('div', { class: 'thread-note' }, [
        el('span', {}, [el('strong', { text: (s.assignedName || 'Another admin') + ' is handling this chat.' }), ' You can read it, but only they can reply.']),
        isSuper ? el('button', { type: 'button', class: 'ghost-btn', text: 'Take over', onclick: function (e) {
          if (confirm('Take over this chat from ' + (s.assignedName || 'the other admin') + '? They will no longer be able to reply.')) claimChat('takeover', e.currentTarget);
        } }) : null
      ])];
    } else if (s.status === 'open') {
      var ta = el('textarea', { id: 'reply-box', rows: '1', maxlength: '2000', placeholder: 'Type a reply', 'aria-label': 'Reply' });
      ta.value = draft;
      var sendB = el('button', { type: 'submit', class: 'btn', text: 'Send' });
      var formEl = el('form', { class: 'thread-compose' }, [ta, sendB]);
      var grow = function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
      ta.addEventListener('input', grow);
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); formEl.requestSubmit ? formEl.requestSubmit() : sendReply(ta, sendB); }
      });
      formEl.addEventListener('submit', function (e) { e.preventDefault(); sendReply(ta, sendB); });
      foot = [formEl, el('p', { class: 'thread-hint', text: 'Enter to send, Shift + Enter for a new line.' })];
      setTimeout(grow, 0);
    } else {
      foot = [el('div', { class: 'thread-note' }, [
        el('span', { text: 'This chat has ended. The visitor can start a new chat from the website.' }),
        canManage ? el('button', { type: 'button', class: 'ghost-btn', text: 'Reopen chat', onclick: function () { setChatStatus('open'); } }) : null
      ])];
    }

    var meta = [
      s.email ? el('a', { href: 'mailto:' + s.email, text: s.email }) : el('span', { text: 'No email given' }),
      s.page ? el('span', { text: 'Started on the ' + (s.page === '/' || s.page === '/index.html' ? 'homepage' : /stores/.test(s.page) ? 'stores page' : s.page + ' page') }) : null,
      el('span', { text: 'Started ' + fmtDate(s.createdAt, true) }),
      s.rating ? el('span', { text: s.rating === 'up' ? 'Rated: good' : 'Rated: bad' }) : null,
      s.status === 'open' ? el('span', { class: 'thread-owner' }, [ownerTag(s), s.assignedId && !s.mine ? ' is handling this' : s.mine ? ' are handling this' : '']) : null
    ];
    var canManage = !s.assignedId || s.mine || isSuper;
    box.replaceChildren.apply(box, [
      el('div', { class: 'thread-head' }, [
        el('div', {}, [
          el('button', { type: 'button', class: 'ghost-btn back-btn', style: 'margin-bottom:10px', onclick: function () { chat.selected = null; renderThread(); renderChatList(); } }, [el('span', { html: ICON.back }), 'All chats']),
          el('h2', { text: chatName(s) }),
          el('div', { class: 'thread-meta' }, meta)
        ]),
        el('div', { class: 'thread-actions' }, [
          s.email ? el('a', { class: 'ghost-btn', href: 'mailto:' + s.email + '?subject=' + encodeURIComponent('Following up on your chat with PrimeSphere'), text: 'Email visitor' }) : null,
          s.status === 'open' && s.assignedId && (s.mine || isSuper) ? el('button', { type: 'button', class: 'ghost-btn', text: s.mine ? 'Release' : 'Unassign', title: 'Put this chat back in Unassigned', onclick: releaseChat }) : null,
          s.status === 'open' && canManage ? el('button', { type: 'button', class: 'ghost-btn', text: 'End chat', onclick: function () { setChatStatus('closed'); } }) : null,
          canManage ? el('button', { type: 'button', class: 'ghost-btn ghost-btn--danger', text: 'Delete', onclick: deleteChat }) : null
        ])
      ]),
      logEl
    ].concat(foot));

    if (scrollToEnd || nearBottom) logEl.scrollTop = logEl.scrollHeight;
    else if (oldLog) logEl.scrollTop = oldLog.scrollTop;
    if (hadFocus || scrollToEnd) { var r = $('#reply-box'); if (r) { r.focus(); r.setSelectionRange(r.value.length, r.value.length); } }
  }

  var replying = false;
  function sendReply(ta, btn) {
    var text = ta.value.trim();
    if (!text || replying) return;
    replying = true; btn.disabled = true;
    api('/api/admin/chat', { method: 'POST', json: { id: chat.selected, message: text } }).then(function (d) {
      ta.value = '';
      chat.messages.push(d.message);
      renderThread(true);
      loadChatList();
    }).catch(function (err) { toast(err.message, true); if (err.status === 409) loadThread(true); })
      .then(function () { replying = false; var b = $('.thread-compose .btn'); if (b) b.disabled = false; });
  }

  function claimChat(action, btn) {
    if (btn) btn.disabled = true;
    api('/api/admin/chat', { method: 'PATCH', json: { id: chat.selected, action: action } }).then(function () {
      toast(action === 'takeover' ? 'You took over this chat.' : 'This chat is yours.');
    }).catch(function (err) { toast(err.message, true); })
      .then(function () { loadThread(true); loadChatList(); });
  }

  function releaseChat() {
    var s = chat.session;
    var q = s.mine ? 'Release this chat? It goes back to Unassigned so another admin can take it.' : 'Unassign ' + (s.assignedName || 'this admin') + ' from this chat?';
    if (!confirm(q)) return;
    api('/api/admin/chat', { method: 'PATCH', json: { id: chat.selected, action: 'release' } }).then(function () {
      toast('Chat released.');
    }).catch(function (err) { toast(err.message, true); })
      .then(function () { loadThread(true); loadChatList(); });
  }

  function setChatStatus(status) {
    if (status === 'closed' && !confirm('End this chat? The visitor will see that the chat has ended.')) return;
    api('/api/admin/chat', { method: 'PATCH', json: { id: chat.selected, status: status } }).then(function () {
      toast(status === 'closed' ? 'Chat ended.' : 'Chat reopened.');
      loadThread(true); loadChatList();
    }).catch(function (err) { toast(err.message, true); });
  }

  function deleteChat() {
    if (!confirm('Delete this chat and all its messages? This cannot be undone.')) return;
    api('/api/admin/chat?id=' + encodeURIComponent(chat.selected), { method: 'DELETE' }).then(function () {
      toast('Chat deleted.');
      chat.selected = null; chat.session = null; renderThread(); loadChatList();
    }).catch(function (err) { toast(err.message, true); });
  }

  $$('[data-chat-status]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('[data-chat-status]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      chat.status = b.getAttribute('data-chat-status');
      loadChatList();
    });
  });

  /* =========================================================
     Team (super admins)
     ========================================================= */
  var team = [], teamSig = '';
  function fmtAgo(iso) { return iso ? fmtDate(iso) : 'Never'; }
  function loadTeam(silent) {
    var list = $('#team-list');
    if (!silent && !team.length) list.replaceChildren(el('p', { class: 'list-empty', text: 'Loading team' }));
    return api('/api/admin/users').then(function (d) {
      var sig = JSON.stringify(d.admins);
      if (silent && sig === teamSig) return;
      teamSig = sig; team = d.admins; renderTeam();
    })
      .catch(function (err) { if (err.status !== 401) list.replaceChildren(el('p', { class: 'list-empty', text: err.message })); });
  }
  function renderTeam() {
    var list = $('#team-list');
    list.replaceChildren.apply(list, team.map(function (a) {
      var self = me && a.id === me.id;
      return el('div', { class: 'store-row team-row' + (a.active ? '' : ' is-hidden') }, [
        el('div', { class: 'avatar avatar--lg', 'aria-hidden': 'true', text: (a.name || a.email).charAt(0).toUpperCase() }),
        el('div', { class: 'store-meta' }, [
          el('strong', { text: (a.name || a.email) + (self ? ' (you)' : '') }),
          el('span', { class: 'muted', text: a.email }),
          el('div', { class: 'tags' }, [
            a.isOwner ? el('span', { class: 'tag tag--featured', text: 'Owner' }) : null,
            el('span', { class: 'tag' + (a.role === 'super' ? ' tag--super' : ''), text: a.role === 'super' ? 'Super admin' : 'Admin' }),
            a.active ? null : el('span', { class: 'tag tag--hidden', text: 'Disabled' }),
            el('span', { class: 'tag tag--plain', text: 'Last sign-in: ' + fmtAgo(a.lastLoginAt) })
          ])
        ]),
        el('div', { class: 'row-actions' }, [
          el('button', { type: 'button', class: 'ghost-btn', onclick: function () { openAdminEditor(a); } }, [el('span', { html: ICON.edit }), 'Edit']),
          !a.isOwner && !self ? el('button', { type: 'button', class: 'ghost-btn', text: a.active ? 'Disable' : 'Enable', onclick: function () { toggleAdmin(a); } }) : null,
          !a.isOwner && !self ? el('button', { type: 'button', class: 'icon-btn icon-btn--danger', 'aria-label': 'Delete ' + a.name, html: ICON.trash, onclick: function () { deleteAdmin(a); } }) : null
        ])
      ]);
    }));
  }
  function toggleAdmin(a) {
    if (a.active && !confirm('Disable ' + a.name + '? They are signed out right away and their open chats go back to Unassigned.')) return;
    api('/api/admin/users', { method: 'PATCH', json: { id: a.id, active: !a.active } }).then(function () {
      toast(a.active ? a.name + ' is disabled.' : a.name + ' can sign in again.'); loadTeam();
    }).catch(function (err) { toast(err.message, true); });
  }
  function deleteAdmin(a) {
    if (!confirm('Delete ' + a.name + "'s account? Their past chat replies stay, and their open chats go back to Unassigned.")) return;
    api('/api/admin/users?id=' + a.id, { method: 'DELETE' }).then(function () { toast('Admin deleted.'); loadTeam(); })
      .catch(function (err) { toast(err.message, true); });
  }

  var editingAdmin = null;
  function openDrawer(id, focusSel) {
    var d = $(id);
    d.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add('is-open'); var f = $(focusSel, d); if (f) f.focus(); }); });
  }
  function closeDrawer(id) {
    var d = $(id);
    d.classList.remove('is-open');
    setTimeout(function () { d.hidden = true; }, 350);
  }
  function openAdminEditor(a) {
    editingAdmin = a;
    var f = $('#admin-form');
    f.reset();
    $('#admin-msg').textContent = '';
    $('#admin-editor-title').textContent = a ? 'Edit ' + (a.name || 'admin') : 'Add admin';
    $('#admin-save').textContent = a ? 'Save changes' : 'Create admin';
    f.name.value = a ? a.name : '';
    f.email.value = a ? a.email : '';
    f.email.disabled = !!a;
    var self = a && me && a.id === me.id;
    f.password.disabled = !!(a && (a.isOwner || self));
    $('#admin-pw-label').textContent = a ? 'Set a new password' : 'Password*';
    $('#admin-pw-help').textContent = !a ? 'Share it with them privately. They can change it after signing in.'
      : a.isOwner ? 'The owner password is set by ADMIN_PASSWORD in Vercel.'
      : self ? 'Change your own password from My account.'
      : 'Leave blank to keep their current password. Setting a new one signs them out.';
    $$('input[name="role"]', f).forEach(function (r) { r.checked = r.value === (a ? a.role : 'admin'); r.disabled = !!(a && (a.isOwner || self)); });
    openDrawer('#admin-editor', '[name="name"]');
  }
  $('#add-admin').addEventListener('click', function () { openAdminEditor(null); });
  $$('[data-close-admin]').forEach(function (b) { b.addEventListener('click', function () { closeDrawer('#admin-editor'); }); });
  $('#admin-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, msg = $('#admin-msg'), btn = $('#admin-save');
    var role = ($('input[name="role"]:checked', f) || {}).value || 'admin';
    var payload;
    if (!f.name.value.trim()) { msg.textContent = 'Enter a name.'; return; }
    if (editingAdmin) {
      payload = { id: editingAdmin.id, name: f.name.value };
      if (!editingAdmin.isOwner && !(me && editingAdmin.id === me.id) && role !== editingAdmin.role) payload.role = role;
      if (f.password.value) payload.password = f.password.value;
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) { msg.textContent = 'Enter a valid email address.'; return; }
      payload = { name: f.name.value, email: f.email.value, password: f.password.value, role: role };
    }
    if (payload.password !== undefined && payload.password.length < 10) { msg.textContent = 'Passwords need at least 10 characters.'; return; }
    btn.disabled = true; msg.textContent = '';
    api('/api/admin/users', { method: editingAdmin ? 'PATCH' : 'POST', json: payload }).then(function (d) {
      toast(editingAdmin ? 'Saved.' : d.admin.name + ' can now sign in at /admin.');
      if (me && editingAdmin && editingAdmin.id === me.id) setMe(Object.assign({}, me, { name: d.admin.name }));
      closeDrawer('#admin-editor'); loadTeam();
    }).catch(function (err) { msg.textContent = err.message; })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- My account ---------- */
  $('#me-btn').addEventListener('click', function () {
    var f = $('#me-form');
    f.reset();
    $('#me-msg').textContent = '';
    $('#me-email').textContent = 'Signed in as ' + me.email + (me.role === 'super' ? ' · Super admin' : ' · Admin');
    f.name.value = me.name || '';
    $('#me-pw-block').hidden = !!me.isOwner;
    $('#me-owner-note').hidden = !me.isOwner;
    openDrawer('#me-editor', '[name="name"]');
  });
  $$('[data-close-me]').forEach(function (b) { b.addEventListener('click', function () { closeDrawer('#me-editor'); }); });
  $('#me-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, msg = $('#me-msg'), btn = $('#me-save');
    var name = f.name.value.trim();
    if (!name) { msg.textContent = 'Enter your name.'; return; }
    var wantsPw = !me.isOwner && (f.current.value || f.password.value);
    if (wantsPw && !f.current.value) { msg.textContent = 'Enter your current password.'; return; }
    if (wantsPw && f.password.value.length < 10) { msg.textContent = 'New passwords need at least 10 characters.'; return; }
    btn.disabled = true; msg.textContent = '';
    var steps = name !== me.name ? api('/api/auth?action=profile', { method: 'POST', json: { name: name } }) : Promise.resolve();
    steps.then(function () {
      if (wantsPw) return api('/api/auth?action=password', { method: 'POST', json: { current: f.current.value, password: f.password.value } });
    }).then(function () {
      setMe(Object.assign({}, me, { name: name }));
      toast(wantsPw ? 'Saved. Your password is updated.' : 'Saved.');
      closeDrawer('#me-editor');
      if (currentView === 'team') loadTeam();
    }).catch(function (err) { msg.textContent = err.message; })
      .then(function () { btn.disabled = false; });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('#admin-editor').hidden) closeDrawer('#admin-editor');
    if (!$('#me-editor').hidden) closeDrawer('#me-editor');
  });

  /* =========================================================
     Newsletter subscribers
     ========================================================= */
  var subs = { status: 'subscribed', q: '', items: [], counts: {}, sig: '' };
  var lastSubTotal = null;
  // The tab badge shows sign-ups since you last opened Subscribers (remembered in this browser).
  function seenSubs() { try { return Number(localStorage.getItem('ps_admin_subs_seen')) || 0; } catch (e) { return 0; } }
  function setSubBadge(c) {
    if (!c) return;
    var total = c.subscribed + c.unsubscribed;
    if (currentView === 'subscribers') { try { localStorage.setItem('ps_admin_subs_seen', String(total)); } catch (e) {} }
    var seen = seenSubs();
    if (!seen && total) { try { localStorage.setItem('ps_admin_subs_seen', String(total)); } catch (e) {} seen = total; }
    var n = Math.max(0, total - seen);
    var b = $('#sub-badge'); b.hidden = !n; b.textContent = n;
    if (lastSubTotal !== null && total > lastSubTotal) toast('New newsletter subscriber.');
    lastSubTotal = total;
  }
  function loadSubscribers(silent) {
    var list = $('#sub-list');
    if (!silent && !subs.items.length) list.replaceChildren(el('p', { class: 'list-empty', text: 'Loading subscribers' }));
    var qs = '?status=' + subs.status + (subs.q ? '&q=' + encodeURIComponent(subs.q) : '');
    $('#sub-export').href = '/api/newsletter' + qs + '&format=csv';
    return api('/api/newsletter' + qs).then(function (d) {
      var sig = qs + JSON.stringify(d);
      if (silent && sig === subs.sig) return;
      subs.sig = sig; subs.items = d.subscribers; subs.counts = d.counts;
      setSubBadge(d.counts);
      renderSubscribers();
    }).catch(function (err) { if (err.status !== 401) list.replaceChildren(el('p', { class: 'list-empty', text: err.message })); });
  }
  function renderSubscribers() {
    var c = subs.counts || {};
    $('#sub-count-subscribed').textContent = c.subscribed || '';
    $('#sub-count-unsubscribed').textContent = c.unsubscribed || '';
    var stat = function (num, label) { return el('div', { class: 'sub-stat' }, [el('strong', { text: String(num || 0) }), el('span', { text: label })]); };
    var st = $('#sub-stats');
    st.replaceChildren(stat(c.subscribed, 'Subscribed'), stat(c.thisWeek, 'New in the last 7 days'), stat(c.unsubscribed, 'Unsubscribed'));
    var list = $('#sub-list');
    if (!subs.items.length) {
      list.replaceChildren(el('p', { class: 'list-empty', text: subs.q ? 'No subscribers match "' + subs.q + '".' : subs.status === 'unsubscribed' ? 'Nobody has unsubscribed.' : 'No subscribers yet. Sign-ups from the newsletter form appear here.' }));
      return;
    }
    list.replaceChildren.apply(list, [el('div', { class: 'sub-row sub-row--head', 'aria-hidden': 'true' }, [
      el('span', { text: 'Email' }), el('span', { text: 'Signed up' }), el('span', { text: 'From page' }), el('span', { text: 'Status' }), el('span')
    ])].concat(subs.items.map(function (x) {
      var on = x.status === 'subscribed';
      return el('div', { class: 'sub-row' + (on ? '' : ' is-off') }, [
        el('a', { class: 'sub-email', href: 'mailto:' + x.email, text: x.email }),
        el('span', { class: 'sub-date', text: fmtDate(x.createdAt, true) }),
        el('span', { class: 'sub-src', text: x.source ? pageName(x.source) : '-' }),
        el('span', {}, [el('span', { class: 'tag' + (on ? ' tag--ok' : ' tag--hidden'), text: on ? 'Subscribed' : 'Unsubscribed' })]),
        el('div', { class: 'row-actions' }, [
          el('button', { type: 'button', class: 'ghost-btn ghost-btn--sm', text: on ? 'Unsubscribe' : 'Resubscribe', onclick: function () { setSub(x, on ? 'unsubscribed' : 'subscribed'); } }),
          el('button', { type: 'button', class: 'icon-btn icon-btn--danger', 'aria-label': 'Delete ' + x.email, html: ICON.trash, onclick: function () { deleteSub(x); } })
        ])
      ]);
    })));
  }
  function pageName(p) {
    if (p === '/' || p === '/index.html') return 'Homepage';
    return p.replace(/^\/|\.html$/g, '').replace(/[-/]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function setSub(x, status) {
    if (status === 'subscribed' && !confirm('Resubscribe ' + x.email + '? Only do this if they asked to rejoin the list.')) return;
    api('/api/newsletter', { method: 'PATCH', json: { ids: [x.id], status: status } }).then(function () {
      toast(status === 'subscribed' ? x.email + ' is subscribed again.' : x.email + ' is unsubscribed.'); loadSubscribers(true);
    }).catch(function (err) { toast(err.message, true); });
  }
  function deleteSub(x) {
    if (!confirm('Delete ' + x.email + ' from the list completely? Use Unsubscribe instead if you want to remember they opted out.')) return;
    api('/api/newsletter?id=' + x.id, { method: 'DELETE' }).then(function () { toast('Subscriber deleted.'); loadSubscribers(true); })
      .catch(function (err) { toast(err.message, true); });
  }
  $$('[data-sub-status]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('[data-sub-status]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      subs.status = b.getAttribute('data-sub-status'); subs.items = []; loadSubscribers();
    });
  });
  var subTimer;
  $('#sub-search').addEventListener('input', function (e) {
    clearTimeout(subTimer);
    subTimer = setTimeout(function () { subs.q = e.target.value.trim(); loadSubscribers(); }, 300);
  });

  /* ---------- Start ---------- */
  api('/api/auth', { allow401: true }).then(showApp).catch(function (err) {
    showLogin(err.status === 401 ? '' : err.message);
  });
})();
