/* ═══ FLAGLE ════════════════════════════════════════════════════════════
   Guess the country from its flag, revealed one tile at a time. Every wrong
   guess also tells you how far away you were.

   Flags are DRAWN, not fetched — the renderer below turns the compact specs
   in data/geo.js into SVG at a 3:2 ratio (viewBox 0 0 90 60). A country whose
   flag needs a coat of arms simply isn't in the Flagle pool; a wrong-looking
   flag is worse than a missing one.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var MAX = 6, W = 90, H = 60;

  D.css('flagle', [
    '.flbox{position:relative;width:min(360px,86vw);margin:0 auto 4px;aspect-ratio:3/2;',
    '  border-radius:8px;overflow:hidden;border:1px solid var(--line2);box-shadow:var(--sh)}',
    '.flbox svg{display:block;width:100%;height:100%}',
    '.flcover{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr)}',
    '.flcover i{background:#1b1512;border:1px solid #0c0908;transition:opacity .45s}',
    '.flcover i.off{opacity:0}',
    '.flrow{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:9px;background:#0f0b09;border:1px solid var(--line);font-size:14px}',
    '.flrow .nm{flex:1;font-weight:600}.flrow .km{font-family:var(--mono);font-size:13px;color:var(--ink2)}',
    '.flrow.hit{background:var(--goodDim);border-color:var(--good)}'
  ].join(''));

  /* ── geometry helpers ──────────────────────────────────────────────── */
  function starPts(cx, cy, r, rot) {
    var p = [], i, a;
    rot = rot == null ? -90 : rot;
    for (i = 0; i < 10; i++) {
      a = (rot + i * 36) * Math.PI / 180;
      var rr = i % 2 ? r * 0.382 : r;
      p.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2));
    }
    return p.join(' ');
  }
  function star(cx, cy, r, fill, rot, extra) {
    return '<polygon points="' + starPts(cx, cy, r, rot) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function bands(cols, w, horiz) {
    var total = 0, i;
    w = w || cols.map(function () { return 1; });
    for (i = 0; i < cols.length; i++) total += w[i];
    var out = '', at = 0;
    for (i = 0; i < cols.length; i++) {
      var size = (horiz ? H : W) * w[i] / total;
      out += horiz
        ? '<rect x="0" y="' + at.toFixed(2) + '" width="' + W + '" height="' + (size + .4).toFixed(2) + '" fill="' + cols[i] + '"/>'
        : '<rect x="' + at.toFixed(2) + '" y="0" width="' + (size + .4).toFixed(2) + '" height="' + H + '" fill="' + cols[i] + '"/>';
      at += size;
    }
    return out;
  }
  var LEAF = 'M50 6 l6 12 c1 2 3 3 5 2 l9-5 -2 12 c0 2 1 3 3 3 l7-1 -4 10 c-1 2 0 3 1 4 l3 2 -18 14 c-2 2 -2 3 -1 5 l2 6 -18-3 c-2 0 -3 1 -3 3 l1 20 h-6 l1-20 c0-2 -1-3 -3-3 l-18 3 2-6 c1-2 1-3 -1-5 l-18-14 3-2 c1-1 2-2 1-4 l-4-10 7 1 c2 0 3-1 3-3 l-2-12 9 5 c2 1 4 0 5-2 z';

  function crescent(cx, cy, r, fill, gap) {
    // A disc with a second disc punched out of it, drawn as one even-odd path.
    var o = gap == null ? r * 0.28 : gap, ri = r * 0.82;
    return '<path fill-rule="evenodd" fill="' + fill + '" d="' +
      'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0 ' +
      'M' + (cx - ri + o) + ' ' + cy + 'a' + ri + ' ' + ri + ' 0 1 0 ' + (2 * ri) + ' 0a' + ri + ' ' + ri + ' 0 1 0 ' + (-2 * ri) + ' 0z"/>';
  }

  /* ── renderers ─────────────────────────────────────────────────────── */
  var R = {
    h: function (s) {
      var out = bands(s.c, s.w, true);
      if (s.star) out += star(W / 2, H / 2, 9, s.star);
      if (s.disc) out += '<circle cx="45" cy="30" r="11" fill="' + s.disc + '"/>' +
        '<path d="M45 21 45 39 M36.5 25 53.5 35 M53.5 25 36.5 35" stroke="#FCDD09" stroke-width="1.6"/>' +
        '<polygon points="' + starPts(45, 30, 8) + '" fill="none" stroke="#FCDD09" stroke-width="1.4"/>';
      if (s.stars2) out += star(30, 30, 6, s.stars2) + star(60, 30, 6, s.stars2);
      return out;
    },
    v: function (s) {
      var out = bands(s.c, s.w, false);
      if (s.star) out += star(W / 2, H / 2, 8, s.star);
      return out;
    },
    nordic: function (s) {
      var x = 30, vw = 9, hh = 9;
      var out = '<rect width="90" height="60" fill="' + s.b + '"/>';
      out += '<rect x="' + (x - vw / 2) + '" y="0" width="' + vw + '" height="60" fill="' + s.x + '"/>';
      out += '<rect x="0" y="' + (30 - hh / 2) + '" width="90" height="' + hh + '" fill="' + s.x + '"/>';
      if (s.i) {
        out += '<rect x="' + (x - 2.5) + '" y="0" width="5" height="60" fill="' + s.i + '"/>';
        out += '<rect x="0" y="27.5" width="90" height="5" fill="' + s.i + '"/>';
      }
      return out;
    },
    cross: function (s) {
      return '<rect width="90" height="60" fill="' + s.b + '"/>' +
        '<rect x="39" y="12" width="12" height="36" fill="' + s.x + '"/>' +
        '<rect x="27" y="24" width="36" height="12" fill="' + s.x + '"/>';
    },
    disc: function (s) {
      return '<rect width="90" height="60" fill="' + s.b + '"/>' +
        '<circle cx="' + ((s.cx || 0.5) * W) + '" cy="30" r="' + (s.r * H) + '" fill="' + s.d + '"/>';
    },
    star: function (s) {
      var out = '<rect width="90" height="60" fill="' + s.b + '"/>';
      out += s.s === 'none'
        ? '<polygon points="' + starPts(45, 30, 15) + '" fill="none" stroke="' + s.so + '" stroke-width="2.4"/>'
        : star(45, 30, 14, s.s);
      return out;
    },
    crescent: function (s) {
      return '<rect width="90" height="60" fill="' + s.b + '"/>' +
        crescent(38, 30, 12, s.c) + star(56, 30, 6, s.c);
    },
    tri: function (s) {
      var out = bands(s.c, s.w, true);
      out += '<polygon points="0,0 45,30 0,60" fill="' + s.tc + '"/>';
      if (s.star) out += star(14, 30, 5.5, s.star);
      return out;
    },
    barh: function (s) {
      return '<rect width="90" height="60" fill="' + s.bar + '"/>' + '<g transform="translate(24 0)">' +
        bands(s.c, null, true).replace(/width="90"/g, 'width="66"') + '</g>';
    },
    /* Four wedges with the diagonal band painted OVER them — drawing the band
       as a background instead leaves it a hairline where the wedges meet. */
    saltire: function (s) {
      return '<rect width="90" height="60" fill="' + s.s + '"/>' +
        '<polygon points="0,0 45,30 0,60" fill="' + s.b + '"/>' +
        '<polygon points="90,0 45,30 90,60" fill="' + s.b + '"/>' +
        '<path d="M0 0 L90 60 M90 0 L0 60" stroke="' + s.x + '" stroke-width="9"/>';
    },
    leaf: function (s) {
      return '<rect width="90" height="60" fill="' + s.c[0] + '"/>' +
        '<rect x="22.5" y="0" width="45" height="60" fill="' + s.c[1] + '"/>' +
        '<g transform="translate(45 30) scale(.46) translate(-50 -50)"><path d="' + LEAF + '" fill="' + s.c[0] + '"/></g>';
    },
    sun: function (s) {
      var out = bands(s.c, null, true);
      out += '<circle cx="45" cy="30" r="7" fill="#F6B40E" stroke="#85340A" stroke-width=".6"/>';
      for (var i = 0; i < 16; i++) {
        var a = i * 22.5 * Math.PI / 180;
        out += '<line x1="' + (45 + 8 * Math.cos(a)).toFixed(2) + '" y1="' + (30 + 8 * Math.sin(a)).toFixed(2) +
               '" x2="' + (45 + 11 * Math.cos(a)).toFixed(2) + '" y2="' + (30 + 11 * Math.sin(a)).toFixed(2) +
               '" stroke="#F6B40E" stroke-width="1.3"/>';
      }
      return out;
    },
    uk: function () { return UK(0, 0, 90, 60); },
    aunz: function (s) {
      var out = '<rect width="90" height="60" fill="#00247D"/>' +
        '<g transform="translate(0 0) scale(.5)">' + UK(0, 0, 90, 60) + '</g>';
      if (s.stars === 'au') {
        out += star(22, 46, 5, '#fff');                       // Commonwealth Star
        [[62, 14, 3], [74, 26, 3], [62, 44, 3], [55, 30, 2.4], [70, 40, 1.7]].forEach(function (p) {
          out += star(p[0], p[1], p[2], '#fff');
        });
      } else {
        [[64, 14], [76, 28], [64, 44], [56, 30]].forEach(function (p) {
          out += star(p[0], p[1], 3.6, '#fff') + star(p[0], p[1], 2.4, '#CC142B');
        });
      }
      return out;
    },
    usa: function () {
      var out = '<rect width="90" height="60" fill="#fff"/>', i;
      for (i = 0; i < 7; i++) out += '<rect x="0" y="' + (i * 2 * 60 / 13).toFixed(2) + '" width="90" height="' + (60 / 13).toFixed(2) + '" fill="#B22234"/>';
      out += '<rect width="36" height="' + (7 * 60 / 13).toFixed(2) + '" fill="#3C3B6E"/>';
      for (var row = 0; row < 9; row++) {
        var cnt = row % 2 ? 5 : 6;
        for (i = 0; i < cnt; i++) {
          var x = 36 / 12 * (row % 2 ? 2 + i * 2 : 1 + i * 2);
          var y = (7 * 60 / 13) / 10 * (row + 1);
          out += star(x, y, 1.35, '#fff');
        }
      }
      return out;
    },
    gr: function () {
      var out = '', i;
      for (i = 0; i < 9; i++) out += '<rect x="0" y="' + (i * 60 / 9).toFixed(2) + '" width="90" height="' + (60 / 9 + .4).toFixed(2) + '" fill="' + (i % 2 ? '#fff' : '#0D5EAF') + '"/>';
      out += '<rect width="' + (60 * 5 / 9).toFixed(2) + '" height="' + (60 * 5 / 9).toFixed(2) + '" fill="#0D5EAF"/>';
      var c = 60 * 5 / 9 / 2, t = 60 / 9;
      out += '<rect x="' + (c - t / 2) + '" y="0" width="' + t + '" height="' + (2 * c) + '" fill="#fff"/>';
      out += '<rect x="0" y="' + (c - t / 2) + '" width="' + (2 * c) + '" height="' + t + '" fill="#fff"/>';
      return out;
    },
    br: function () {
      var out = '<rect width="90" height="60" fill="#009C3B"/>';
      out += '<polygon points="45,7 84,30 45,53 6,30" fill="#FFDF00"/>';
      out += '<circle cx="45" cy="30" r="14" fill="#002776"/>';
      out += '<path d="M31.5 26.5 A22 22 0 0 1 58.5 26.5 L58.5 29 A22 22 0 0 0 31.5 29 Z" fill="#fff"/>';
      [[40, 35], [46, 37], [52, 34], [43, 24], [49, 22], [45, 30], [38, 30], [54, 30]].forEach(function (p, i) {
        out += star(p[0], p[1], i < 3 ? 1.5 : 1.1, '#fff');
      });
      return out;
    },
    za: function () {
      var out = '<rect width="90" height="60" fill="#fff"/>';
      out += '<path d="M0 0 H90 V22 H33 Z" fill="#E03C31"/>';
      out += '<path d="M0 60 H90 V38 H33 Z" fill="#001489"/>';
      out += '<path d="M0 0 L36 30 L0 60 V46 L18 30 L0 14 Z" fill="#007A4D"/>';
      out += '<path d="M0 6 L30 30 L0 54 V46 L18 30 L0 14 Z" fill="#FFB612"/>';
      out += '<path d="M0 14 L18 30 L0 46 Z" fill="#000"/>';
      out += '<path d="M31 24 H90 V22 H33 Z M31 36 H90 V38 H33 Z" fill="#fff"/>';
      return out;
    },
    kr: function () {
      var out = '<rect width="90" height="60" fill="#fff"/>';
      out += '<g transform="rotate(-33 45 30)">' +
        '<path d="M35 30a10 10 0 0 1 20 0a5 5 0 0 1-10 0a5 5 0 0 0-10 0" fill="#CD2E3A"/>' +
        '<path d="M35 30a10 10 0 0 0 20 0a5 5 0 0 0-10 0a5 5 0 0 1-10 0" fill="#0047A0"/>' +
        '</g>';
      var tri = function (x, y, rot, gaps) {
        var g = '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')">';
        for (var i = 0; i < 3; i++) {
          var yy = -3 + i * 3;
          if (gaps.indexOf(i) >= 0) {
            g += '<rect x="-6" y="' + yy + '" width="5" height="1.8" fill="#000"/>' +
                 '<rect x="1" y="' + yy + '" width="5" height="1.8" fill="#000"/>';
          } else g += '<rect x="-6" y="' + yy + '" width="12" height="1.8" fill="#000"/>';
        }
        return g + '</g>';
      };
      out += tri(15, 13, 56, []) + tri(75, 13, -56, [0, 2]) + tri(15, 47, -56, [1]) + tri(75, 47, 56, [0, 1, 2]);
      return out;
    },
    il: function () {
      var out = '<rect width="90" height="60" fill="#fff"/>';
      out += '<rect x="0" y="8" width="90" height="7" fill="#0038B8"/>';
      out += '<rect x="0" y="45" width="90" height="7" fill="#0038B8"/>';
      out += '<polygon points="45,20 53,34 37,34" fill="none" stroke="#0038B8" stroke-width="1.6"/>';
      out += '<polygon points="45,40 53,26 37,26" fill="none" stroke="#0038B8" stroke-width="1.6"/>';
      return out;
    },
    'in': function () {
      var out = bands(['#FF9933', '#fff', '#138808'], null, true);
      out += '<circle cx="45" cy="30" r="8" fill="none" stroke="#000080" stroke-width="1.1"/>';
      for (var i = 0; i < 24; i++) {
        var a = i * 15 * Math.PI / 180;
        out += '<line x1="45" y1="30" x2="' + (45 + 8 * Math.cos(a)).toFixed(2) + '" y2="' + (30 + 8 * Math.sin(a)).toFixed(2) + '" stroke="#000080" stroke-width=".45"/>';
      }
      out += '<circle cx="45" cy="30" r="1.6" fill="#000080"/>';
      return out;
    },
    prc: function () {
      var out = '<rect width="90" height="60" fill="#DE2910"/>';
      out += star(16, 15, 8.5, '#FFDE00');
      [[30, 5], [37, 11], [37, 20], [30, 26]].forEach(function (p) { out += star(p[0], p[1], 3, '#FFDE00'); });
      return out;
    },
    pt: function () {
      var out = bands(['#006600', '#FF0000'], [2, 3], false);
      out += '<circle cx="36" cy="30" r="10" fill="none" stroke="#FFE900" stroke-width="1.6"/>';
      out += '<ellipse cx="36" cy="30" rx="4.5" ry="10" fill="none" stroke="#FFE900" stroke-width="1"/>';
      out += '<line x1="26" y1="30" x2="46" y2="30" stroke="#FFE900" stroke-width="1"/>';
      out += '<rect x="32" y="25" width="8" height="10" rx="1.5" fill="#fff" stroke="#D00" stroke-width="1.2"/>';
      return out;
    },
    tn: function () {
      return '<rect width="90" height="60" fill="#E70013"/>' +
        '<circle cx="45" cy="30" r="15" fill="#fff"/>' +
        crescent(46, 30, 9, '#E70013') + star(50, 30, 4.4, '#E70013');
    },
    pk: function () {
      return '<rect width="90" height="60" fill="#01411C"/>' +
        '<rect x="0" y="0" width="22.5" height="60" fill="#fff"/>' +
        crescent(58, 30, 11, '#fff') + star(70, 22, 5, '#fff', -60);
    },
    dz: function () {
      return '<rect width="90" height="60" fill="#fff"/>' +
        '<rect x="0" y="0" width="45" height="60" fill="#006233"/>' +
        crescent(43, 30, 11, '#D21034') + star(55, 30, 5.5, '#D21034');
    },
    ph: function () {
      var out = '<rect width="90" height="60" fill="#0038A8"/>';
      out += '<rect x="0" y="30" width="90" height="30" fill="#CE1126"/>';
      out += '<polygon points="0,0 45,30 0,60" fill="#fff"/>';
      out += '<circle cx="14" cy="30" r="4" fill="#FCD116"/>';
      for (var i = 0; i < 8; i++) {
        var a = i * 45 * Math.PI / 180;
        out += '<line x1="' + (14 + 4.6 * Math.cos(a)).toFixed(2) + '" y1="' + (30 + 4.6 * Math.sin(a)).toFixed(2) +
               '" x2="' + (14 + 7.5 * Math.cos(a)).toFixed(2) + '" y2="' + (30 + 7.5 * Math.sin(a)).toFixed(2) +
               '" stroke="#FCD116" stroke-width="1.2"/>';
      }
      out += star(4, 5, 2.6, '#FCD116') + star(4, 55, 2.6, '#FCD116') + star(38, 30, 2.6, '#FCD116');
      return out;
    },
    ke: function () {
      var out = bands(['#000', '#fff', '#BB0000', '#fff', '#006600'], [6, 1, 6, 1, 6], true);
      // Spears first — they belong BEHIND the shield, not across it.
      out += '<g stroke="#f2f2f2" stroke-width="1.5" stroke-linecap="round">' +
             '<line x1="36" y1="6" x2="54" y2="54"/><line x1="54" y1="6" x2="36" y2="54"/></g>';
      out += '<g fill="#f2f2f2"><polygon points="36,6 34,10 38.5,10"/><polygon points="54,6 52,10 56.5,10"/></g>';
      out += '<ellipse cx="45" cy="30" rx="8.5" ry="14" fill="#BB0000" stroke="#f2f2f2" stroke-width="1.6"/>';
      out += '<ellipse cx="45" cy="30" rx="7.6" ry="6" fill="#000"/>';
      out += '<ellipse cx="45" cy="30" rx="3" ry="4.4" fill="#f2f2f2"/>';
      return out;
    }
  };

  function UK(x, y, w, h) {
    return '<g transform="translate(' + x + ' ' + y + ')">' +
      '<clipPath id="ukc"><rect width="' + w + '" height="' + h + '"/></clipPath>' +
      '<g clip-path="url(#ukc)">' +
      '<rect width="' + w + '" height="' + h + '" fill="#012169"/>' +
      '<path d="M0 0 L' + w + ' ' + h + ' M' + w + ' 0 L0 ' + h + '" stroke="#fff" stroke-width="13"/>' +
      '<path d="M0 0 L' + w + ' ' + h + ' M' + w + ' 0 L0 ' + h + '" stroke="#C8102E" stroke-width="5"/>' +
      '<path d="M' + (w / 2) + ' 0 V' + h + ' M0 ' + (h / 2) + ' H' + w + '" stroke="#fff" stroke-width="20"/>' +
      '<path d="M' + (w / 2) + ' 0 V' + h + ' M0 ' + (h / 2) + ' H' + w + '" stroke="#C8102E" stroke-width="12"/>' +
      '</g></g>';
  }

  function flagSVG(spec) {
    var fn = R[spec.t];
    var body = fn ? fn(spec) : '<rect width="90" height="60" fill="#333"/>';
    return '<svg viewBox="0 0 90 60" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' +
           body + '</svg>';
  }
  D.flagSVG = flagSVG;                    // used by the test harness

  /* ── game ──────────────────────────────────────────────────────────── */
  D.register({
    id: 'flagle',
    name: 'Flagle',
    blurb: 'Name the country from its flag.',
    tag: 'world',
    icon: D.icon('flagle'),

    build: function (rnd) { return { answer: D.pick(rnd, GEO.FLAGGED).n }; },
    answerText: function (p) { return p.answer; },

    mount: function (host, puzzle, api) {
      var target = GEO.BY_NAME[puzzle.answer];
      var spec = GEO.FLAGS[target.n];
      var guesses = 0, over = false;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint', 'Each wrong guess uncovers another piece of the flag.'));
      var box = D.el('div', 'flbox');
      box.innerHTML = flagSVG(spec);
      var cover = D.el('div', 'flcover');
      // Reveal order is fixed so both players see the same tiles at the same step.
      var order = [4, 0, 5, 2, 3, 1], cells = [];
      for (var i = 0; i < 6; i++) { var c = D.el('i'); cover.appendChild(c); cells.push(c); }
      box.appendChild(cover);
      wrap.appendChild(box);

      var left = D.el('div', 'tiny dim');
      left.style.cssText = 'text-align:center;margin:10px 0 12px';
      wrap.appendChild(left);

      var pick = D.picker(GEO.COUNTRIES, function (c) { return c.n; }, onGuess, 'Name the country…');
      wrap.appendChild(pick.node);
      var log = D.el('div', 'log');
      wrap.appendChild(log);
      host.appendChild(wrap);

      function onGuess(c) {
        if (over) return;
        guesses++;
        if (c.n === target.n) {
          cells.forEach(function (x) { x.classList.add('off'); });
          var r = D.el('div', 'flrow hit');
          r.appendChild(D.el('div', 'nm', D.esc(c.n)));
          r.appendChild(D.el('div', 'km', 'CORRECT'));
          log.insertBefore(r, log.firstChild);
          return finish(true);
        }
        cells[order[guesses - 1]].classList.add('off');
        var km = D.distKm(c, target);
        var row = D.el('div', 'flrow');
        row.appendChild(D.el('div', 'nm', D.esc(c.n)));
        row.appendChild(D.el('div', 'km', km.toLocaleString() + ' km ' + D.arrow(D.bearing(c, target))));
        log.insertBefore(row, log.firstChild);
        if (guesses >= MAX) { cells.forEach(function (x) { x.classList.add('off'); }); return finish(false); }
        left.textContent = (MAX - guesses) + ' guesses left';
        api.progress(guesses / MAX * 100, guesses + '/' + MAX + ' guesses');
        pick.focus();
      }

      function finish(solved) {
        over = true; pick.disable();
        left.textContent = solved ? 'Got it in ' + guesses : 'It was ' + target.n;
        api.finish({ solved: solved, guesses: guesses });
      }

      left.textContent = MAX + ' guesses left';
      api.progress(0, 'no guesses yet');
      setTimeout(function () { pick.focus(); }, 60);
      return { giveUp: function () { if (!over) { cells.forEach(function (x) { x.classList.add('off'); }); finish(false); } } };
    }
  });
})(window.DLES);
