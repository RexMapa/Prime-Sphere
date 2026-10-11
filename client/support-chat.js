(function () {
  'use strict';
  window.PSSupportChat = function (options) {
    var panel = document.createElement('section'); panel.className = 'ps-support ' + (options.admin ? 'ps-support-admin' : 'ps-support-client');
    var header = document.createElement('button'); header.type = 'button'; header.className = 'ps-support-toggle'; header.textContent = options.admin ? 'Client support chat' : 'Chat with PrimeSphere';
    var body = document.createElement('div'); body.className = 'ps-support-body'; body.hidden = !options.admin;
    var log = document.createElement('div'); log.className = 'ps-support-log'; log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
    var form = document.createElement('form'); form.className = 'ps-support-form';
    var input = document.createElement('textarea'); input.rows = 2; input.maxLength = 2000; input.required = true; input.placeholder = 'Write a message…'; input.setAttribute('aria-label','Support message');
    var button = document.createElement('button'); button.type = 'submit'; button.textContent = 'Send';
    var error = document.createElement('p'); error.className = 'ps-support-error'; error.setAttribute('role','status');
    form.append(input, button); body.append(log, form, error); panel.append(header, body);
    var lastSignature = '', timer, stopped = false;
    function request(method, data) {
      return fetch(options.url, { method: method, credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Chat unavailable.'); return d; }); });
    }
    function poll() {
      if (stopped || !panel.isConnected) return;
      if (document.hidden) { timer = setTimeout(poll, 5000); return; }
      request('GET').then(function (data) {
        var incoming = data.messages.filter(function (m) { return m.sender === (options.admin ? 'client' : 'admin') && !m.seen; });
        if (incoming.length && !options.admin) body.hidden = false;
        header.textContent = (options.admin ? 'Client support chat' : 'Chat with PrimeSphere') + (incoming.length ? ' (' + incoming.length + ' new)' : '');
        header.setAttribute('aria-expanded', String(!body.hidden));
        var signature = JSON.stringify(data.messages);
        if (signature !== lastSignature) {
          lastSignature = signature; log.replaceChildren();
          if (!data.messages.length) { var empty = document.createElement('p'); empty.textContent = options.admin ? 'Send a message to help this client with their access request.' : 'Your account manager can help with your access requests here.'; log.append(empty); }
          data.messages.forEach(function (m) {
            var row = document.createElement('div'); row.className = 'ps-support-message ps-support-message-' + m.sender;
            var name = document.createElement('strong'); name.textContent = m.sender === 'system' ? 'Access help' : m.name || (m.sender === 'admin' ? 'PrimeSphere' : 'Client');
            var text = document.createElement('p'); text.textContent = m.body;
            var time = document.createElement('small'); time.textContent = new Date(m.createdAt).toLocaleString();
            row.append(name,text,time); log.append(row);
          }); log.scrollTop = log.scrollHeight;
        }
        if (!body.hidden && incoming.length) return request('POST', { action: 'read', through: data.messages[data.messages.length - 1].id });
      }).catch(function (err) { error.textContent = err.message; }).finally(function () { if (!stopped) timer = setTimeout(poll, 5000); });
    }
    header.addEventListener('click', function () { body.hidden = !body.hidden; header.setAttribute('aria-expanded', String(!body.hidden)); });
    header.setAttribute('aria-expanded', String(!body.hidden));
    form.addEventListener('submit', function (e) {
      e.preventDefault(); if (!input.value.trim()) return;
      button.disabled = true; error.textContent = '';
      request('POST', { message: input.value.trim() }).then(function () { input.value = ''; clearTimeout(timer); poll(); }).catch(function (err) { error.textContent = err.message; }).finally(function () { button.disabled = false; });
    });
    panel.start = function () { clearTimeout(timer); poll(); };
    panel.stop = function () { stopped = true; clearTimeout(timer); };
    return panel;
  };
})();
