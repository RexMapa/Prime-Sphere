// PrimeSphere live chat widget. Messages are stored in Neon and answered from /admin.
(function () {
  'use strict';

  var API = '/api/chat';
  var STORE_KEY = 'ps_chat_v1';
  var GREETING = 'Hey! What would you like help with? Anything from Shopify builds to marketing and SEO questions, we can help with!';
  var POLL_OPEN = 3000;     // while the chat panel is open
  var POLL_CLOSED = 15000;  // while minimised, to show the unread badge

  var ICON_CHAT = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/></svg>';
  var ICON_DOWN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  var ICON_SEND = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>';
  var ICON_UP = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v11H3V10z"/><path d="M7 10l4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.1 21H7"/></svg>';
  var ICON_MORE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
  var ICON_PLUS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  var ICON_X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var ICON_DOWN_THUMB = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V3h4v11z"/><path d="M17 14l-4 8a3 3 0 0 1-3-3v-4H4.5a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.9 3H17"/></svg>';

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v; // static icons only
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  /* ---------- Saved state (survives page changes) ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }
  var state = load(); // { id, token, seen, open, emailAsked }
  var messages = [];
  var status = 'none';  // none | open | closed
  var rating = '';
  var hasEmail = false;
  var pollTimer = null;
  var sending = false;

  /* ---------- Build the widget ---------- */
  var launcher = el('button', { type: 'button', class: 'chat-launcher', 'aria-label': 'Open live chat', 'aria-expanded': 'false', 'aria-controls': 'chat-panel', html: ICON_CHAT });
  var badge = el('span', { class: 'chat-badge', hidden: true, 'aria-hidden': 'true' });
  launcher.appendChild(badge);

  var log = el('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Chat messages' });
  var input = el('textarea', { class: 'chat-input', rows: '1', maxlength: '2000', placeholder: 'Type your message', 'aria-label': 'Message' });
  var sendBtn = el('button', { type: 'submit', class: 'chat-send', 'aria-label': 'Send message', html: ICON_SEND });
  var errorLine = el('p', { class: 'chat-error', role: 'alert' });
  var endLink = el('button', { type: 'button', class: 'chat-end', text: 'End chat', hidden: true });
  // Header menu: start a new chat / end this chat
  var menuNew = el('button', { type: 'button', class: 'chat-menu-item', role: 'menuitem', html: ICON_PLUS }, ['Start a new chat']);
  var menuEnd = el('button', { type: 'button', class: 'chat-menu-item chat-menu-item--danger', role: 'menuitem', html: ICON_X }, ['End chat']);
  var menu = el('div', { class: 'chat-menu', id: 'chat-menu', role: 'menu', hidden: true }, [menuNew, menuEnd]);
  var menuBtn = el('button', { type: 'button', class: 'chat-min chat-more', 'aria-label': 'Chat options', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'chat-menu', hidden: true, html: ICON_MORE });

  // Inline confirmation (replaces the browser confirm() popup)
  var confirmText = el('p', { class: 'chat-confirm-text' });
  var confirmYes = el('button', { type: 'button', class: 'chat-confirm-yes' });
  var confirmNo = el('button', { type: 'button', class: 'chat-confirm-no', text: 'Cancel' });
  var confirmBar = el('div', { class: 'chat-confirm', role: 'alertdialog', 'aria-label': 'Confirm', hidden: true }, [
    confirmText, el('div', { class: 'chat-confirm-actions' }, [confirmNo, confirmYes])
  ]);

  var composer = el('form', { class: 'chat-composer' }, [
    el('div', { class: 'chat-compose-row' }, [input, sendBtn]),
    el('div', { class: 'chat-compose-foot' }, [errorLine, endLink])
  ]);

  var panel = el('section', { class: 'chat-panel', id: 'chat-panel', role: 'dialog', 'aria-label': 'Live chat', hidden: true }, [
    el('header', { class: 'chat-head' }, [
      el('div', {}, [
        el('h2', { text: 'Have a question?' }),
        el('p', { text: 'We usually reply in a few minutes' })
      ]),
      el('div', { class: 'chat-head-actions' }, [
        menuBtn,
        el('button', { type: 'button', class: 'chat-min', 'aria-label': 'Minimise chat', html: ICON_DOWN, onclick: function () { setOpen(false); } })
      ]),
      menu
    ]),
    log,
    confirmBar,
    composer
  ]);

  var root = el('div', { class: 'chat-root' }, [panel, launcher]);
  document.body.appendChild(root);
  document.body.classList.add('has-chat');

  /* ---------- API ---------- */
  function api(method, query, body) {
    var headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (state.id) { headers['X-Chat-Id'] = state.id; headers['X-Chat-Token'] = state.token; }
    return fetch(API + query, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) { var e = new Error(data.error || 'Message not sent. Check your connection and try again.'); e.status = r.status; throw e; }
          return data;
        });
      });
  }

  function resetSession() {
    clearTimeout(pollTimer);
    state = { open: state.open };
    messages = []; status = 'none'; rating = ''; hasEmail = false;
    save();
    hideConfirm(); showError('');
  }

  function startNewChat() {
    resetSession();
    render();
    input.value = ''; autosize();
    input.focus();
  }

  // Ends the current chat on the server. Resolves once it's closed.
  function endChat() {
    return api('POST', '?action=end').then(function () {
      status = 'closed';
      render();
      poll(); // pick up the saved system message and stop polling
    });
  }

  /* ---------- Rendering ---------- */
  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function bubble(m) {
    if (m.sender === 'system') return el('p', { class: 'chat-system', text: m.body });
    var mine = m.sender === 'visitor';
    return el('div', { class: 'chat-row ' + (mine ? 'chat-row--me' : 'chat-row--them') }, [
      mine ? null : el('span', { class: 'chat-avatar', 'aria-hidden': 'true' }, [el('img', { src: '/assets/logo-mark.png', alt: '' })]),
      el('div', { class: 'chat-bubble' }, [
        el('span', { class: 'sr-only', text: mine ? 'You: ' : (m.name ? m.name + ' from PrimeSphere: ' : 'PrimeSphere: ') }),
        el('span', { class: 'chat-text', text: m.body }),
        m.createdAt ? el('time', { text: (!mine && m.name ? m.name + ' · ' : '') + fmtTime(m.createdAt), datetime: m.createdAt }) : null
      ])
    ]);
  }

  function render() {
    var nodes = [bubble({ sender: 'admin', body: GREETING })];
    messages.forEach(function (m) { nodes.push(bubble(m)); });

    if (status === 'open' && !hasEmail && !state.emailSkipped && messages.some(function (m) { return m.sender === 'visitor'; })) {
      nodes.push(emailCard());
    }
    if (status === 'closed') {
      nodes.push(el('p', { class: 'chat-system chat-system--ended', text: 'Your chat has ended' }));
      nodes.push(feedbackCard());
      nodes.push(el('div', { class: 'chat-card chat-card--center' }, [
        el('p', { text: 'Got another question?' }),
        el('button', { type: 'button', class: 'chat-new-btn', html: ICON_PLUS, onclick: startNewChat }, ['Start a new chat'])
      ]));
    }
    var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.replaceChildren.apply(log, nodes);
    if (atBottom || sending) log.scrollTop = log.scrollHeight;

    var ended = status === 'closed';
    composer.hidden = ended;
    endLink.hidden = status !== 'open';
    menuBtn.hidden = !state.id;          // nothing to end or restart before the first message
    menuEnd.hidden = status !== 'open';
    if (!state.id) closeMenu();
  }

  /* ---------- Menu + confirm ---------- */
  function openMenu() {
    menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true');
    var first = menu.querySelector('.chat-menu-item:not([hidden])');
    if (first) first.focus();
  }
  function closeMenu() { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); });
  document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  menu.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); menuBtn.focus(); }
  });

  var confirmAction = null;
  function askConfirm(text, yesLabel, action) {
    closeMenu();
    confirmText.textContent = text;
    confirmYes.textContent = yesLabel;
    confirmAction = action;
    confirmBar.hidden = false;
    confirmYes.disabled = false;
    confirmNo.focus();
  }
  function hideConfirm() { confirmBar.hidden = true; confirmAction = null; }
  confirmNo.addEventListener('click', function () { hideConfirm(); input.focus(); });
  confirmBar.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); hideConfirm(); } });
  confirmYes.addEventListener('click', function () {
    if (!confirmAction) return;
    confirmYes.disabled = true;
    Promise.resolve(confirmAction()).then(hideConfirm, function (err) {
      confirmYes.disabled = false;
      hideConfirm();
      showError(err && err.message);
    });
  });

  menuEnd.addEventListener('click', function () {
    askConfirm('End this chat? You can still rate it and start a new one after.', 'End chat', endChat);
  });
  menuNew.addEventListener('click', function () {
    if (status === 'open') {
      askConfirm('Start a new chat? Your current chat will be ended.', 'Start new chat', function () {
        return endChat().then(startNewChat);
      });
    } else {
      startNewChat();
    }
  });

  function feedbackCard() {
    if (rating) return el('div', { class: 'chat-card' }, [el('p', { class: 'chat-card-label', text: 'Feedback' }), el('p', { text: 'Thanks for your feedback.' })]);
    var rate = function (r) {
      return function () {
        api('POST', '?action=rate', { rating: r }).then(function () { rating = r; render(); }).catch(function (e) { showError(e.message); });
      };
    };
    return el('div', { class: 'chat-card' }, [
      el('p', { class: 'chat-card-label', text: 'Feedback' }),
      el('p', { class: 'chat-card-title', text: 'Please rate your experience.' }),
      el('div', { class: 'chat-rate' }, [
        el('button', { type: 'button', 'aria-label': 'Good experience', html: ICON_UP, onclick: rate('up') }),
        el('button', { type: 'button', 'aria-label': 'Bad experience', html: ICON_DOWN_THUMB, onclick: rate('down') })
      ])
    ]);
  }

  function emailCard() {
    var field = el('input', { type: 'email', placeholder: 'you@company.com', 'aria-label': 'Your email', autocomplete: 'email' });
    var msg = el('p', { class: 'chat-card-msg' });
    var formEl = el('form', { class: 'chat-email', onsubmit: function (e) {
      e.preventDefault();
      var v = field.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { msg.textContent = 'Enter an email like name@company.com.'; return; }
      api('POST', '?action=profile', { email: v }).then(function () { hasEmail = true; render(); })
        .catch(function (err) { msg.textContent = err.message; });
    } }, [field, el('button', { type: 'submit', text: 'Save' })]);
    return el('div', { class: 'chat-card' }, [
      el('p', { class: 'chat-card-title', text: 'Leave your email in case you step away, and we will follow up there.' }),
      formEl, msg,
      el('button', { type: 'button', class: 'chat-link chat-link--muted', text: 'No thanks', onclick: function () { state.emailSkipped = true; save(); render(); } })
    ]);
  }

  function showError(t) { errorLine.textContent = t || ''; }

  function updateBadge() {
    var seen = state.seen || 0;
    var unread = messages.filter(function (m) { return m.sender === 'admin' && m.id > seen; }).length;
    badge.hidden = !unread || state.open;
    badge.textContent = unread;
  }
  function markSeen() {
    var last = lastId();
    if (last && last !== state.seen) { state.seen = last; save(); }
    updateBadge();
  }

  /* ---------- Polling ---------- */
  function lastId() {
    var ids = messages.filter(function (m) { return !m.pending; }).map(function (m) { return m.id; });
    return ids.length ? Math.max.apply(null, ids) : 0;
  }
  function poll() {
    clearTimeout(pollTimer);
    if (!state.id) return;
    var sid = state.id;
    api('GET', '?after=' + lastId()).then(function (data) {
      if (sid !== state.id) return; // a new chat was started while this was in flight
      var fresh = (data.messages || []).filter(function (m) { return !messages.some(function (x) { return x.id === m.id; }); });
      var changed = fresh.length || data.status !== status || data.rating !== rating || !!data.email !== hasEmail;
      messages = messages.concat(fresh);
      status = data.status; rating = data.rating; hasEmail = !!data.email;
      if (changed) render();
      if (state.open) markSeen(); else updateBadge();
      schedule();
    }).catch(function (err) {
      if (sid !== state.id) return;
      if (err.status === 401 || err.status === 404) { resetSession(); render(); return; }
      schedule(); // network blip, try again later
    });
  }
  function schedule() {
    clearTimeout(pollTimer);
    if (!state.id || status === 'closed' || document.hidden) return;
    pollTimer = setTimeout(poll, state.open ? POLL_OPEN : POLL_CLOSED);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); else clearTimeout(pollTimer); });

  /* ---------- Open / close ---------- */
  function setOpen(open) {
    state.open = open; save();
    launcher.setAttribute('aria-expanded', String(open));
    launcher.setAttribute('aria-label', open ? 'Close live chat' : 'Open live chat');
    root.classList.toggle('is-open', open);
    if (open) {
      panel.hidden = false;
      requestAnimationFrame(function () { panel.classList.add('is-in'); });
      render();
      log.scrollTop = log.scrollHeight;
      markSeen();
      if (status !== 'closed') input.focus();
      poll();
    } else {
      closeMenu();
      panel.classList.remove('is-in');
      setTimeout(function () { if (!state.open) panel.hidden = true; }, 250);
      launcher.focus();
      schedule();
    }
  }
  launcher.addEventListener('click', function () { setOpen(!state.open); });
  panel.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!menu.hidden) { closeMenu(); menuBtn.focus(); return; }
    if (!confirmBar.hidden) { hideConfirm(); return; }
    setOpen(false);
  });

  /* ---------- Sending ---------- */
  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; }
  input.addEventListener('input', function () { autosize(); showError(''); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); composer.requestSubmit ? composer.requestSubmit() : composer.dispatchEvent(new Event('submit')); }
  });
  composer.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || sending) return;
    sending = true; sendBtn.disabled = true; showError('');

    // Show it straight away; it's replaced by the saved copy when the server answers.
    var temp = { id: Infinity, sender: 'visitor', body: text, pending: true };
    messages.push(temp); render(); log.scrollTop = log.scrollHeight;
    input.value = ''; autosize();

    var req = state.id
      ? api('POST', '?action=send', { message: text }).then(function (d) { return [d.message]; })
      : api('POST', '?action=start', { message: text, page: location.pathname }).then(function (d) {
          state.id = d.id; state.token = d.token; save();
          status = d.status;
          return d.messages;
        });

    req.then(function (saved) {
      messages = messages.filter(function (m) { return m !== temp; });
      saved.forEach(function (m) { if (!messages.some(function (x) { return x.id === m.id; })) messages.push(m); });
      messages.sort(function (a, b) { return a.id - b.id; });
      render(); markSeen(); schedule();
    }).catch(function (err) {
      messages = messages.filter(function (m) { return m !== temp; });
      input.value = text; autosize();
      if (err.status === 409) { status = 'closed'; }
      if (err.status === 401 || err.status === 404) { resetSession(); }
      render();
      showError(err.message);
    }).then(function () { sending = false; sendBtn.disabled = false; });
  });

  endLink.addEventListener('click', function () {
    askConfirm('End this chat? You can still rate it and start a new one after.', 'End chat', endChat);
  });

  /* ---------- Start ---------- */
  render();
  if (state.id) poll();
  if (state.open) setOpen(true);
})();
