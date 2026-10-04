// Homepage countdown offer. Settings come from /api/promo (managed in Admin > Content > Countdown offer).
(function () {
  'use strict';
  var C = 2 * Math.PI * 52, UNITS = [['Days', 7], ['Hours', 24], ['Minutes', 60], ['Seconds', 60]];

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function svgNS(tag, attrs) { var n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }

  fetch('/api/promo').then(function (r) { return r.json(); }).then(function (d) {
    if (!d.promo) return;
    var p = d.promo, end = Date.parse(p.endsAt), skew = (d.now || Date.now()) - Date.now();
    var anchor = document.getElementById('about'); if (!anchor) return;

    var sec = el('section', 'promo'); sec.id = 'offer'; sec.setAttribute('aria-label', 'Limited time offer');
    var wrap = el('div', 'wrap promo-inner');
    if (p.badge) wrap.appendChild(el('p', 'promo-badge', p.badge));
    wrap.appendChild(el('h2', 'promo-title', p.title));
    if (p.subtitle) wrap.appendChild(el('p', 'promo-sub', p.subtitle));

    var row = el('div', 'promo-timer'); row.setAttribute('role', 'timer');
    var vals = [], arcs = [];
    UNITS.forEach(function (u, i) {
      var cell = el('div', 'promo-cell');
      var svg = svgNS('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true' });
      var defs = svgNS('defs', {}), g = svgNS('linearGradient', { id: 'pg' + i, x1: '0', y1: '0', x2: '1', y2: '1' });
      g.appendChild(svgNS('stop', { offset: '0', 'stop-color': '#22E3A0' })); g.appendChild(svgNS('stop', { offset: '1', 'stop-color': '#1E90FF' }));
      defs.appendChild(g); svg.appendChild(defs);
      svg.appendChild(svgNS('circle', { cx: 60, cy: 60, r: 52, class: 'promo-track' }));
      var arc = svgNS('circle', { cx: 60, cy: 60, r: 52, class: 'promo-arc', stroke: 'url(#pg' + i + ')', 'stroke-dasharray': C, 'stroke-dashoffset': C, transform: 'rotate(-90 60 60)' });
      svg.appendChild(arc); arcs.push(arc);
      var v = el('span', 'promo-num', '00'); vals.push(v);
      cell.appendChild(svg); cell.appendChild(v); cell.appendChild(el('span', 'promo-label', u[0]));
      row.appendChild(cell);
    });
    wrap.appendChild(row);
    if (p.ctaText && p.ctaUrl) { var a = el('a', 'btn promo-cta', p.ctaText); a.href = p.ctaUrl; wrap.appendChild(a); }
    sec.appendChild(wrap);
    anchor.parentNode.insertBefore(sec, anchor);

    var timer;
    function tick() {
      var left = Math.max(0, end - (Date.now() + skew));
      if (left <= 0) { clearInterval(timer); sec.remove(); return; }
      var s = Math.floor(left / 1000), parts = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
      parts.forEach(function (n, i) {
        var next = String(n).padStart(2, '0'); if (vals[i].textContent !== next) vals[i].textContent = next;
        arcs[i].setAttribute('stroke-dashoffset', C * (1 - Math.min(1, n / UNITS[i][1])));
      });
    }
    tick(); timer = setInterval(tick, 1000);
  }).catch(function () {});
})();
