(function () {
  'use strict';
  window.PSSupportChat = function (options) {
    var panel = document.createElement('section'); panel.className = 'ps-support ' + (options.admin ? 'ps-support-admin' : 'ps-support-client');
    var header = document.createElement('button'); header.type = 'button'; header.className = 'ps-support-toggle'; header.textContent = options.admin ? 'Client support chat' : 'Chat with PrimeSphere';
    var body = document.createElement('div'); body.className = 'ps-support-body'; body.hidden = !options.admin;
    var members = [];
    var threadOpen = !!options.admin;
    var selectedTopic = options.topic || 'general';
    var cachedMessages = [];
    var tabs = document.createElement('div'); tabs.className = 'ps-support-tabs'; tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','Request conversations');
    var team = document.createElement('div'); team.className = 'ps-support-team';
    var back = document.createElement('button'); back.type = 'button'; back.className = 'ps-support-back'; back.textContent = '‹ All chats'; back.hidden = true;
    back.addEventListener('click', function () { threadOpen = false; refreshView(); });
    body.append(team, back, tabs);
    var memberPage = 0, lastTeamRefresh = 0;
    function titleFor(id) {
      var member = members.find(function(m){return id === 'member-'+m.id;});
      var config = (window.PS_ACCESS_REQUESTS || []).find(function(c){return c.id===id;});
      return member ? member.name : config ? config.title : id.indexOf('member-')===0 ? 'Team conversation' : 'General';
    }
    function updateHeader() {
      var title = options.admin ? 'Client support chat' : threadOpen ? titleFor(selectedTopic) : 'Messages';
      var member = members.find(function(m){return selectedTopic==='member-'+m.id;});
      var recent = cachedMessages.filter(function(m){return (m.topic||'general')===selectedTopic;}).slice(-1)[0];
      var active = member ? !!member.online : recent && Date.now()-new Date(recent.createdAt).getTime()<300000;
      header.replaceChildren();
      var heading=document.createElement('strong'); heading.textContent=title; header.append(heading);
      if (!options.admin && threadOpen) { var status=document.createElement('small');status.className='ps-support-presence';status.dataset.online=String(!!active);status.textContent=member ? (active ? 'Online' : 'Offline') : (active ? 'Active conversation' : 'Inactive conversation');header.append(status); }
      header.setAttribute('aria-expanded',String(!body.hidden));
    }
    function drawMembers() {
      team.replaceChildren();
      var previous=document.createElement('button');previous.type='button';previous.className='ps-support-page';previous.textContent='‹';previous.setAttribute('aria-label','Previous team members');previous.disabled=memberPage===0;
      previous.onclick=function(){memberPage=Math.max(0,memberPage-1);drawMembers();};
      team.append(previous);
      var track=document.createElement('div');track.className='ps-support-member-track';
      members.slice(memberPage*3,memberPage*3+3).forEach(function(member){
        var memberButton=document.createElement('button');memberButton.type='button';
        var avatar=document.createElement('span');avatar.className='ps-support-avatar';avatar.dataset.online=String(!!member.online);avatar.textContent=member.name.trim().split(/\s+/).map(function(part){return part[0];}).slice(0,2).join('').toUpperCase();
        var label=document.createElement('span');label.textContent=member.name;
        memberButton.append(avatar,label);memberButton.onclick=function(){selectedTopic='member-'+member.id;threadOpen=true;lastSignature='';refreshView();clearTimeout(timer);poll();};track.append(memberButton);
      });
      team.append(track);
      var next=document.createElement('button');next.type='button';next.className='ps-support-page';next.textContent='›';next.setAttribute('aria-label','Next team members');next.disabled=(memberPage+1)*3>=members.length;
      next.onclick=function(){memberPage++;drawMembers();};team.append(next);
    }
    function loadTeam() {
      if(options.admin || Date.now()-lastTeamRefresh<30000)return;
      lastTeamRefresh=Date.now();
      fetch('/api/auth?scope=client&action=support-team',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(data){members=data.members||[];memberPage=Math.min(memberPage,Math.max(0,Math.ceil(members.length/3)-1));drawMembers();updateHeader();}).catch(function(){});
    }
    if(!options.admin){tabs.setAttribute('role','list');tabs.setAttribute('aria-label','Chats');}

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
          var response = await fetch(options.url + '&topic=' + encodeURIComponent(selectedTopic) + '&upload=1&filename=' + encodeURIComponent(file.name), { method:'POST', credentials:'same-origin', headers:{'X-Requested-With':'fetch','Content-Type':type}, body:file });
          var data = await response.json(); if (!response.ok) throw new Error(data.error || 'File upload failed.');
        }
        error.textContent = ''; clearTimeout(timer); poll();
      } catch (err) { error.textContent = err.message; }
      finally { attach.disabled = false; button.disabled = false; input.disabled = false; picker.value = ''; }
    });
    body.append(hint, picker);
    form.append(attach, input, button); body.append(log, form, error); panel.append(header, body);
    function refreshView() {
      updateHeader();
      if (options.admin) return;
      panel.classList.toggle('ps-support-inbox', !threadOpen);
      team.hidden = threadOpen; tabs.hidden = threadOpen; back.hidden = !threadOpen;
      log.hidden = !threadOpen; form.hidden = !threadOpen; hint.hidden = !threadOpen;
    }
    refreshView();
    var lastSignature = '', timer, stopped = false;
    function request(method, data) {
      return fetch(options.url + (method === 'GET' ? '' : '&topic=' + encodeURIComponent(selectedTopic)), { method: method, credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Chat unavailable.'); return d; }); });
    }
    function poll() {
      if (stopped || !panel.isConnected) return;
      if (document.hidden) { timer = setTimeout(poll, 5000); return; }
      loadTeam();
      request('GET').then(function (data) {
        cachedMessages = data.messages;
        var topics = [];
        (data.requests || options.requests || []).forEach(function (id) { if (topics.indexOf(id) < 0) topics.push(id); });
        data.messages.forEach(function (m) { if (topics.indexOf(m.topic || 'general') < 0) topics.push(m.topic || 'general'); });
        if (options.admin && selectedTopic !== 'general' && topics.indexOf(selectedTopic) < 0) topics.push(selectedTopic);
        if (options.singleTopic) topics = [selectedTopic];
        topics = topics.filter(function(id) { return id && id !== 'general'; });
        if (options.admin && (selectedTopic === 'general' || topics.indexOf(selectedTopic) < 0)) selectedTopic = topics[0] || '';
        button.disabled = !selectedTopic || selectedTopic === 'general';
        attach.disabled = button.disabled;
        input.disabled = button.disabled;
        tabs.replaceChildren();
        topics.forEach(function (id) {
          var config = (window.PS_ACCESS_REQUESTS || []).find(function (c) { return c.id === id; });
          var tab = document.createElement('button'); tab.type = 'button'; if(options.admin) tab.setAttribute('role','tab'); else tab.setAttribute('role','listitem');
          tab.setAttribute('aria-selected', String(selectedTopic === id));
          var unread = data.messages.filter(function (m) { return (m.topic || 'general') === id && m.sender === (options.admin ? 'client' : 'admin') && !m.seen; }).length;
          var member = members.find(function(m){return id === 'member-'+m.id;});
          var title = config ? config.title : member ? member.name : id.indexOf('member-')===0 ? 'Team conversation' : 'General';
          tab.textContent = options.admin ? title + (unread ? ' (' + unread + ')' : '') : ''; 
          if (!options.admin) {
            var preview = data.messages.filter(function(m){return (m.topic || 'general')===id;}).slice(-1)[0];
            var subtitle = document.createElement('small'); subtitle.textContent = preview ? (preview.body || (preview.attachment ? preview.attachment.name : 'Attachment')) : 'Help requested · Waiting for your account manager';
            var avatar=document.createElement('span');avatar.className='ps-support-list-avatar';avatar.textContent=title.trim().split(/\s+/).map(function(part){return part[0];}).slice(0,2).join('').toUpperCase();
            var copy=document.createElement('span');copy.className='ps-support-list-copy';
            var nameLabel=document.createElement('strong');nameLabel.textContent=title;copy.append(nameLabel,subtitle);tab.append(avatar,copy);
            if(unread){var count=document.createElement('span');count.className='ps-support-unread';count.textContent=unread;tab.append(count);}
          }
          tab.addEventListener('click', function () { selectedTopic = id; threadOpen = true; refreshView(); lastSignature = ''; clearTimeout(timer); poll(); });
          tabs.append(tab);
        });
        if (!topics.length && !options.admin) { var emptyList=document.createElement('p');emptyList.className='ps-support-empty';emptyList.textContent='No conversations yet. Choose a team member above to start.';tabs.append(emptyList); }
        var visible = data.messages.filter(function (m) { return (m.topic || 'general') === selectedTopic; });
        var incoming = data.messages.filter(function (m) { return m.topic && m.topic !== 'general' && m.sender === (options.admin ? 'client' : 'admin') && !m.seen; });
        if (incoming.length && !options.admin) body.hidden = false;
        updateHeader();
        header.setAttribute('aria-expanded', String(!body.hidden));
        var signature = selectedTopic + JSON.stringify(visible);
        if (signature !== lastSignature) {
          lastSignature = signature; log.replaceChildren();
          if (!visible.length) { var empty = document.createElement('p'); empty.textContent = options.admin ? 'Send a message to help this client with their access request.' : 'Your account manager can help with your access requests here.'; log.append(empty); }
          visible.forEach(function (m) {
            var row = document.createElement('div'); row.className = 'ps-support-message ps-support-message-' + m.sender + (m.sender === (options.admin ? 'admin' : 'client') ? ' ps-support-message-own' : '');
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
        if (!body.hidden && (options.admin || threadOpen) && visible.some(function (m) { return m.sender === (options.admin ? 'client' : 'admin') && !m.seen; })) return request('POST', { action: 'read', through: visible[visible.length - 1].id });
      }).catch(function (err) { error.textContent = err.message; }).finally(function () { if (!stopped) timer = setTimeout(poll, 5000); });
    }
    header.addEventListener('click', function () { body.hidden = !body.hidden; header.setAttribute('aria-expanded', String(!body.hidden)); });
    header.setAttribute('aria-expanded', String(!body.hidden));
    form.addEventListener('submit', function (e) {
      e.preventDefault(); if (!selectedTopic || selectedTopic === 'general' || !input.value.trim()) return;
      button.disabled = true; error.textContent = '';
      request('POST', { message: input.value.trim() }).then(function () { input.value = ''; clearTimeout(timer); poll(); }).catch(function (err) { error.textContent = err.message; }).finally(function () { button.disabled = false; });
    });
    panel.start = function () { clearTimeout(timer); poll(); };
    panel.stop = function () { stopped = true; clearTimeout(timer); };
    return panel;
  };
})();
