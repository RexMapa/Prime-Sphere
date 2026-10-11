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
    var picker = document.createElement('input'); picker.type = 'file'; picker.hidden = true; picker.multiple = true;
    picker.accept = '.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov,.mp3,.m4a,.wav,.ogg,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx';
    var attach = document.createElement('button'); attach.type = 'button'; attach.className = 'ps-support-attach'; attach.textContent = 'Attach'; attach.setAttribute('aria-label','Attach images, videos, audio or documents');
    var hint = document.createElement('p'); hint.className = 'ps-support-file-hint'; hint.textContent = 'Images, video, audio and documents · Up to 4 MB per file';
    attach.addEventListener('click', function () { picker.click(); });
    picker.addEventListener('change', async function () {
      var files = Array.from(picker.files || []); if (!files.length) return;
      if (files.length > 10 || files.some(function (file) { return !file.size || file.size > 4 * 1024 * 1024; })) { error.textContent = 'Choose up to 10 files, each non-empty and no larger than 4 MB.'; picker.value = ''; return; }
      attach.disabled = true; button.disabled = true; input.disabled = true;
      var types = { jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',pdf:'application/pdf',txt:'text/plain',csv:'text/csv',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
      try {
        for (var i = 0; i < files.length; i++) {
          var file = files[i]; error.textContent = 'Sending file ' + (i + 1) + ' of ' + files.length + '…';
          var type = file.type || types[file.name.split('.').pop().toLowerCase()] || 'application/octet-stream';
          var response = await fetch(options.url + '&upload=1&filename=' + encodeURIComponent(file.name), { method:'POST', credentials:'same-origin', headers:{'X-Requested-With':'fetch','Content-Type':type}, body:file });
          var data = await response.json(); if (!response.ok) throw new Error(data.error || 'File upload failed.');
        }
        error.textContent = ''; clearTimeout(timer); poll();
      } catch (err) { error.textContent = err.message; }
      finally { attach.disabled = false; button.disabled = false; input.disabled = false; picker.value = ''; }
    });
    body.append(hint, picker);
    form.append(attach, input, button); body.append(log, form, error); panel.append(header, body);
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
            row.append(name,text);
            if (m.attachment && /^https:\/\//.test(m.attachment.url)) {
              var file = m.attachment;
              var media;
              if (file.type.indexOf('image/') === 0) { media = document.createElement('img'); media.alt = file.name; media.loading = 'lazy'; }
              else if (file.type.indexOf('video/') === 0) { media = document.createElement('video'); media.controls = true; media.preload = 'metadata'; }
              else if (file.type.indexOf('audio/') === 0) { media = document.createElement('audio'); media.controls = true; media.preload = 'metadata'; }
              if (media) { media.src = file.url; media.className = 'ps-support-media'; row.append(media); }
              var link = document.createElement('a'); link.href = file.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = file.name + ' · ' + Math.ceil(file.size / 1024) + ' KB'; link.className = 'ps-support-file-link'; row.append(link);
            }
            row.append(time); log.append(row);
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
