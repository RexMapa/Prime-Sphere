// Blog page: list of posts, or one post when the address has ?post=ID
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>';
  var safe = function (u) { return /^(https?:\/\/|\/(?!\/))/i.test(u || '') ? u : ''; };
  function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function fmtDate(d) {
    if (!d) return '';
    var p = d.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function image(src, label) {
    if (safe(src)) { var i = node('img'); i.src = safe(src); i.alt = ''; i.loading = 'lazy'; return i; }
    return node('div', 'ph', label);
  }
  var grid = $('#blog-grid');
  var article = $('#article');
  var id = Number(new URLSearchParams(location.search).get('post'));

  function showError(msg) { grid.replaceChildren(node('p', 'lede', msg)); }

  if (id) {
    grid.hidden = true;
    article.hidden = false;
    article.appendChild(node('p', 'lede', 'Loading post'));
    $('#back-label').textContent = 'All posts';
    $('.back-link').href = 'blog.html';
    fetch('/api/content?post=' + id, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Post not found.'); return d.post; }); })
      .then(function (p) {
        document.title = p.title + ' | PrimeSphere';
        var h = $('#blog-heading');
        h.replaceChildren(node('span', 'line'));
        var inner = node('span', null, p.title); h.firstChild.appendChild(inner);
        h.classList.add('is-article');
        $('#blog-lede').textContent = [fmtDate(p.date), p.summary].filter(Boolean).join(' · ');
        article.replaceChildren();
        if (safe(p.image)) { var fig = node('figure', 'article-cover'); fig.appendChild(image(p.image)); article.appendChild(fig); }
        var body = node('div', 'article-body');
        String(p.body || '').split(/\n\s*\n/).forEach(function (para) {
          para = para.trim();
          if (!para) return;
          if (/^#{1,3}\s/.test(para)) body.appendChild(node('h2', null, para.replace(/^#{1,3}\s/, '')));
          else { var pe = node('p', null, para); body.appendChild(pe); }
        });
        if (!body.children.length && p.summary) body.appendChild(node('p', null, p.summary));
        article.appendChild(body);
        if (safe(p.url)) {
          var a = node('a', 'btn'); a.href = safe(p.url); a.target = '_blank'; a.rel = 'noopener';
          a.textContent = 'Read the full article '; a.insertAdjacentHTML('beforeend', ARROW);
          article.appendChild(a);
        }
      })
      .catch(function (e) {
        article.replaceChildren(node('p', 'lede', e.message === 'Failed to fetch' ? 'This post could not be loaded. Check your connection and refresh.' : e.message));
      });
    return;
  }

  fetch('/api/content', { headers: { Accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (c) {
      var posts = c.post || [];
      if (!posts.length) return showError('No posts yet. Check back soon.');
      grid.replaceChildren();
      posts.forEach(function (p) {
        var card = node('a', 'blog-card');
        card.href = 'blog.html?post=' + p.id;
        var m = node('div', 'blog-card-media'); m.appendChild(image(p.image, 'Article image'));
        var b = node('div', 'blog-card-body');
        if (p.date) b.appendChild(node('span', 'blog-date', fmtDate(p.date)));
        b.appendChild(node('h2', null, p.title));
        if (p.summary) b.appendChild(node('p', null, p.summary));
        var more = node('span', 'text-link', 'Read the Article '); more.insertAdjacentHTML('beforeend', ARROW);
        b.appendChild(more);
        card.appendChild(m); card.appendChild(b);
        grid.appendChild(card);
      });
    })
    .catch(function () { showError('Posts could not be loaded. Check your connection and refresh.'); });
})();
