/* ═══ GLOBLE ════════════════════════════════════════════════════════════
   Name the mystery country. Every guess answers with how far away it is
   and which way to go — hot/cold, but on a sphere.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var MAX = 12;

  D.css('globle', [
    '.glrow{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;',
    '  border:1px solid var(--line);font-size:14px;animation:fade .2s}',
    '.glrow .nm{flex:1;font-weight:600}',
    '.glrow .km{font-family:var(--mono);font-size:13px;opacity:.9}',
    '.glrow .ar{font-size:20px;line-height:1;width:22px;text-align:center}',
    '.glheat{width:8px;align-self:stretch;border-radius:99px;flex:0 0 8px}',
    '.glscale{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--ink3);margin-top:12px;justify-content:center}',
    '.glscale i{display:block;width:110px;height:7px;border-radius:99px;',
    '  background:linear-gradient(90deg,#2b3f56,#3d7f6a,#c9a227,#c2622c,#b4483f)}'
  ].join(''));

  /* 0 = other side of the planet, 1 = on top of it */
  function heat(km) { return Math.max(0, 1 - km / 13000); }
  function heatColor(h) {
    var stops = [[0, [43, 63, 86]], [.45, [61, 127, 106]], [.7, [201, 162, 39]], [.87, [194, 98, 44]], [1, [180, 72, 63]]];
    for (var i = 1; i < stops.length; i++) {
      if (h <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i], t = (h - a[0]) / (b[0] - a[0] || 1);
        return 'rgb(' + a[1].map(function (v, k) { return Math.round(v + (b[1][k] - v) * t); }).join(',') + ')';
      }
    }
    return 'rgb(180,72,63)';
  }

  D.register({
    id: 'globle',
    name: 'Globle',
    blurb: 'Guess the country. Hotter means closer.',
    tag: 'world',
    icon: D.icon('globle'),

    build: function (rnd) {
      // Weighted toward countries people can name — big population or big area.
      var pool = GEO.COUNTRIES.filter(function (c) { return c.pop > 4 || c.area > 300; });
      return { answer: D.pick(rnd, pool).n };
    },
    answerText: function (p) { return p.answer; },

    mount: function (host, puzzle, api) {
      var target = GEO.BY_NAME[puzzle.answer];
      var guesses = [], over = false;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint',
        'Name any country. You will be told how far it is from the target and which way to head.'));
      var pick = D.picker(GEO.COUNTRIES, function (c) { return c.n; }, onGuess, 'Name a country…');
      wrap.appendChild(pick.node);
      var scale = D.el('div', 'glscale');
      scale.innerHTML = '<span>far</span><i></i><span>here</span>';
      wrap.appendChild(scale);
      var log = D.el('div', 'log');
      wrap.appendChild(log);
      var left = D.el('div', 'tiny dim');
      left.style.cssText = 'text-align:center;margin-top:10px';
      wrap.appendChild(left);
      host.appendChild(wrap);

      function onGuess(c) {
        if (over) return;
        if (guesses.some(function (g) { return g.c.n === c.n; })) { D.toast('Already guessed', 'bad'); return; }
        var km = D.distKm(c, target);
        guesses.push({ c: c, km: km });
        var win = c.n === target.n;
        addRow(c, km, win);
        if (win) return finish(true);
        if (guesses.length >= MAX) return finish(false);
        api.progress(guesses.length / MAX * 100, guesses.length + ' guesses · ' + km.toLocaleString() + ' km');
        left.textContent = (MAX - guesses.length) + ' guesses left';
        pick.focus();
      }

      function addRow(c, km, win) {
        var h = win ? 1 : heat(km);
        var r = D.el('div', 'glrow');
        r.style.background = win ? 'var(--goodDim)' : '#0f0b09';
        if (win) r.style.borderColor = 'var(--good)';
        var bar = D.el('i', 'glheat');
        bar.style.background = win ? 'var(--good)' : heatColor(h);
        r.appendChild(bar);
        r.appendChild(D.el('div', 'nm', D.esc(c.n)));
        if (win) {
          r.appendChild(D.el('div', 'km', 'FOUND'));
        } else {
          r.appendChild(D.el('div', 'km', km.toLocaleString() + ' km'));
          r.appendChild(D.el('div', 'ar', D.arrow(D.bearing(c, target))));
        }
        log.insertBefore(r, log.firstChild);
      }

      function finish(solved) {
        over = true; pick.disable();
        left.textContent = solved ? '' : 'It was ' + target.n;
        api.finish({ solved: solved, guesses: guesses.length });
      }

      left.textContent = MAX + ' guesses left';
      api.progress(0, 'no guesses yet');
      setTimeout(function () { pick.focus(); }, 60);
      return { giveUp: function () { if (!over) finish(false); } };
    }
  });
})(window.DLES);
