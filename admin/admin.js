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
  function showLogin(msg) {
    if (typeof stopChatPolling === 'function') stopChatPolling();
    $('#boot').hidden = true;
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#login-msg').textContent = msg || '';
    $('#login-form [name="email"]').focus();
  }
  function showApp() {
    $('#boot').hidden = true;
    $('#login').hidden = true;
    $('#app').hidden = false;
    var h = location.hash.slice(1);
    setView(['messages', 'chat', 'stores'].indexOf(h) > -1 ? h : 'messages');
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
    api('/api/auth/login', { method: 'POST', json: { email: f.email.value, password: f.password.value }, allow401: true })
      .then(function () { f.password.value = ''; showApp(); })
      .catch(function (err) { msg.textContent = err.message; f.password.select(); })
      .then(function () { btn.disabled = false; btn.textContent = 'Sign in'; });
  });

  $('#logout').addEventListener('click', function () {
    api('/api/auth/logout', { method: 'POST' }).catch(function () {}).then(function () { showLogin('You are signed out.'); });
  });

  /* ---------- Views ---------- */
  var currentView = 'messages';
  function setView(name) {
    currentView = name;
    $$('.tab').forEach(function (t) {
      if (t.getAttribute('data-view') === name) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    $('#view-messages').hidden = name !== 'messages';
    $('#view-chat').hidden = name !== 'chat';
    $('#view-stores').hidden = name !== 'stores';
    history.replaceState(null, '', '#' + name);
    stopChatPolling();
    if (name === 'messages') loadMessages();
    else if (name === 'chat') startChatPolling();
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

  function loadMessages() {
    var list = $('#msg-list');
    if (!msgState.items.length) list.replaceChildren(el('p', { class: 'list-empty', text: 'Loading messages' }));
    var qs = '?status=' + encodeURIComponent(msgState.status) + (msgState.q ? '&q=' + encodeURIComponent(msgState.q) : '');
    $('#export-csv').href = '/api/admin/submissions' + qs + '&format=csv';
    return api('/api/admin/submissions' + qs).then(function (data) {
      msgState.items = data.submissions;
      var c = data.counts || {};
      var badge = $('#new-badge');
      badge.hidden = !c.new; badge.textContent = c.new || 0;
      $('[data-count="new"]').textContent = c.new ? c.new : '';
      $('[data-count="archived"]').textContent = c.archived ? c.archived : '';
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

  $$('.segment').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.segment').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
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
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !$('#app').hidden && !$('#view-messages').hidden) loadMessages();
  });

  /* =========================================================
     Stores
     ========================================================= */
  var stores = [];

  function loadStores() {
    var list = $('#store-list');
    if (!stores.length) list.replaceChildren(el('p', { class: 'list-empty', text: 'Loading stores' }));
    return api('/api/admin/stores').then(function (data) {
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
  function uploadInto(row, file, ui) {
    row.dataset.uploading = '1';
    ui.status.className = 'upload-status';
    ui.status.textContent = 'Preparing image';
    ui.bar.hidden = false;
    var fill = $('span', ui.bar);
    fill.style.width = '0%';
    prepareImage(file).then(function (blob) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/admin/upload?filename=' + encodeURIComponent(file.name));
        xhr.setRequestHeader('Content-Type', blob.type);
        xhr.setRequestHeader('X-Requested-With', 'fetch');
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable) {
            var pct = Math.round((e.loaded / e.total) * 100);
            fill.style.width = pct + '%';
            ui.status.textContent = 'Uploading ' + pct + '%';
          }
        };
        xhr.onload = function () {
          var data = {};
          try { data = JSON.parse(xhr.responseText); } catch (e) {}
          if (xhr.status === 401) { showLogin('Your session ended. Sign in again.'); }
          if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data.url);
          else reject(new Error(data.error || 'Upload failed (' + xhr.status + ').'));
        };
        xhr.onerror = function () { reject(new Error('Upload failed. Check your connection.')); };
        xhr.send(blob);
      });
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

  function setUnread(n, open) {
    var b = $('#chat-badge');
    b.hidden = !n; b.textContent = n;
    $('#chat-open-count').textContent = open ? open : '';
    document.title = n ? '(' + n + ') New chat message | ' + baseTitle : baseTitle;
    if (chat.lastUnread !== null && n > chat.lastUnread) chime();
    chat.lastUnread = n;
  }

  // Badge + sound on every tab of the admin, checked every 15 seconds.
  function startUnreadWatch() {
    clearTimeout(watchTimer);
    var tick = function () {
      if ($('#app').hidden) return;
      if (currentView !== 'chat' && !document.hidden) {
        api('/api/admin/chat?status=open').then(function (d) { setUnread(d.unread, d.open); }).catch(function () {});
      }
      watchTimer = setTimeout(tick, 15000);
    };
    tick();
  }

  function startChatPolling() { loadChatList(); if (chat.selected) loadThread(true); }
  function stopChatPolling() { clearTimeout(listTimer); clearTimeout(threadTimer); }

  function loadChatList() {
    clearTimeout(listTimer);
    var list = $('#chat-list');
    if (!chat.sessions.length && !list.children.length) list.replaceChildren(el('p', { class: 'list-empty', text: 'Loading chats' }));
    api('/api/admin/chat?status=' + chat.status).then(function (d) {
      chat.sessions = d.sessions;
      setUnread(d.unread, d.open);
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
      list.replaceChildren(el('p', { class: 'list-empty', text: chat.status === 'open' ? 'No open chats right now. When a visitor sends a message it appears here.' : 'No chats here yet.' }));
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
          el('span', { text: (s.previewSender === 'admin' ? 'You: ' : '') + (s.preview || '') }),
          s.unread && !current ? el('span', { class: 'unread-pill', text: String(s.unread) }) : null,
          s.rating ? el('span', { text: s.rating === 'up' ? 'Rated good' : 'Rated bad' }) : null
        ])
      ]);
    }));
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
      var changed = full || d.messages.length || !chat.session || d.session.status !== chat.session.status || d.session.email !== chat.session.email || d.session.rating !== chat.session.rating;
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
      return el('div', { class: 't-row t-row--' + m.sender }, [
        el('div', { class: 't-bubble' }, [
          el('span', { class: 'sr-only', text: m.sender === 'admin' ? 'You: ' : 'Visitor: ' }),
          el('span', { text: m.body }),
          el('time', { text: fmtDate(m.createdAt), datetime: m.createdAt })
        ])
      ]);
    }));

    var foot;
    if (s.status === 'open') {
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
        el('button', { type: 'button', class: 'ghost-btn', text: 'Reopen chat', onclick: function () { setChatStatus('open'); } })
      ])];
    }

    var meta = [
      s.email ? el('a', { href: 'mailto:' + s.email, text: s.email }) : el('span', { text: 'No email given' }),
      s.page ? el('span', { text: 'Started on the ' + (s.page === '/' || s.page === '/index.html' ? 'homepage' : /stores/.test(s.page) ? 'stores page' : s.page + ' page') }) : null,
      el('span', { text: 'Started ' + fmtDate(s.createdAt, true) }),
      s.rating ? el('span', { text: s.rating === 'up' ? 'Rated: good' : 'Rated: bad' }) : null
    ];
    box.replaceChildren.apply(box, [
      el('div', { class: 'thread-head' }, [
        el('div', {}, [
          el('button', { type: 'button', class: 'ghost-btn back-btn', style: 'margin-bottom:10px', onclick: function () { chat.selected = null; renderThread(); renderChatList(); } }, [el('span', { html: ICON.back }), 'All chats']),
          el('h2', { text: chatName(s) }),
          el('div', { class: 'thread-meta' }, meta)
        ]),
        el('div', { class: 'thread-actions' }, [
          s.email ? el('a', { class: 'ghost-btn', href: 'mailto:' + s.email + '?subject=' + encodeURIComponent('Following up on your chat with PrimeSphere'), text: 'Email visitor' }) : null,
          s.status === 'open' ? el('button', { type: 'button', class: 'ghost-btn', text: 'End chat', onclick: function () { setChatStatus('closed'); } }) : null,
          el('button', { type: 'button', class: 'ghost-btn ghost-btn--danger', text: 'Delete', onclick: deleteChat })
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

  /* ---------- Start ---------- */
  api('/api/auth/me', { allow401: true }).then(showApp).catch(function (err) {
    showLogin(err.status === 401 ? '' : err.message);
  });
})();
