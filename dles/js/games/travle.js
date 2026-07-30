/* ═══ TRAVLE ════════════════════════════════════════════════════════════
   Cross the world by land. From the start country, name a country it
   borders, then one that borders THAT, until you arrive. Par is the shortest
   possible route, and every extra stop costs.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var MAX_WRONG = 5;

  D.css('travle', [
    '.tvends{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:14px}',
    '.tvend{padding:9px 15px;border-radius:10px;background:#0f0b09;border:1px solid var(--line);text-align:center}',
    '.tvend b{display:block;font-size:15px}',
    '.tvend span{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3)}',
    '.tvend.from{border-color:var(--goodDim)}.tvend.to{border-color:var(--badDim)}',
    '.tvarrow{color:var(--ink3);font-size:20px}',
    '.tvchain{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:14px 0 4px}',
    '.tvhop{display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:99px;',
    '  background:#241a16;border:1px solid var(--line2);font-size:13.5px;font-weight:600}',
    '.tvhop.start{background:var(--goodDim);border-color:var(--good)}',
    '.tvhop.here{border-color:var(--ember);background:#2f2114}',
    '.tvhop.done{background:var(--goodDim);border-color:var(--good)}',
    '.tvsep{color:var(--ink3);align-self:center}',
    '.tvlives{display:flex;justify-content:center;gap:6px;margin:12px 0 6px}',
    '.tvlives i{width:10px;height:10px;border-radius:50%;background:var(--ember);display:block}',
    '.tvlives i.gone{background:#2a201c}'
  ].join(''));

  D.register({
    id: 'travle',
    name: 'Travle',
    blurb: 'Cross the world one land border at a time.',
    tag: 'world',
    icon: D.icon('travle'),

    build: function (rnd) {
      // Endpoints must be on the same landmass and a real trek apart.
      var pool = GEO.COUNTRIES.filter(function (c) {
        return (GEO.NEIGHBOURS[c.n] || []).length > 0 && (c.pop > 3 || c.area > 200);
      });
      for (var t = 0; t < 400; t++) {
        var a = D.pick(rnd, pool), b = D.pick(rnd, pool);
        if (a.n === b.n) continue;
        var route = GEO.route(a.n, b.n);
        if (!route) continue;
        var par = route.length - 1;
        if (par < 3 || par > 7) continue;
        return { from: a.n, to: b.n, par: par };
      }
      return { from: 'Portugal', to: 'Poland', par: GEO.route('Portugal', 'Poland').length - 1 };
    },
    answerText: function (p) {
      var r = GEO.route(p.from, p.to) || [];
      return r.join(' → ') + '  (' + p.par + ' stops)';
    },

    mount: function (host, puzzle, api) {
      var chain = [puzzle.from], wrong = 0, over = false, best = 0;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint',
        'Name a country that shares a land border with where you are now, and keep going until you arrive. ' +
        'It can be done in ' + puzzle.par + ' stops.'));

      var ends = D.el('div', 'tvends');
      var from = D.el('div', 'tvend from');
      from.innerHTML = '<span>from</span><b>' + D.esc(puzzle.from) + '</b>';
      var to = D.el('div', 'tvend to');
      to.innerHTML = '<span>to</span><b>' + D.esc(puzzle.to) + '</b>';
      ends.appendChild(from); ends.appendChild(D.el('div', 'tvarrow', '→')); ends.appendChild(to);
      wrap.appendChild(ends);

      var chainBox = D.el('div', 'tvchain');
      wrap.appendChild(chainBox);
      var lives = D.el('div', 'tvlives');
      wrap.appendChild(lives);
      var note = D.el('div', 'tiny dim');
      note.style.cssText = 'text-align:center;margin-bottom:10px';
      wrap.appendChild(note);

      var pick = D.picker(GEO.COUNTRIES, function (c) { return c.n; }, onGuess, 'Next country…');
      wrap.appendChild(pick.node);
      var back = D.el('button', 'btn sm gho', 'Step back');
      back.style.cssText = 'display:block;margin:12px auto 0';
      back.addEventListener('click', function () {
        if (over || chain.length < 2) return;
        chain.pop(); draw();
      });
      wrap.appendChild(back);
      host.appendChild(wrap);

      function here() { return chain[chain.length - 1]; }

      function draw() {
        D.clear(chainBox);
        chain.forEach(function (n, i) {
          if (i) chainBox.appendChild(D.el('span', 'tvsep', '›'));
          var cls = 'tvhop' + (i === 0 ? ' start' : '') +
                    (i === chain.length - 1 ? (n === puzzle.to ? ' done' : ' here') : '');
          chainBox.appendChild(D.el('div', cls, D.esc(n)));
        });
        D.clear(lives);
        for (var i = 0; i < MAX_WRONG; i++) lives.appendChild(D.el('i', i < MAX_WRONG - wrong ? '' : 'gone'));
        var left = GEO.route(here(), puzzle.to);
        var n = chain.length - 1;
        note.textContent = over ? '' :
          'At ' + here() + ' · ' + n + (n === 1 ? ' stop' : ' stops') + ' so far' +
          (left ? ' · ' + (left.length - 1) + ' more would do it' : '');
        back.disabled = over || chain.length < 2;
      }

      function onGuess(c) {
        if (over) return;
        if (chain.indexOf(c.n) >= 0) { D.toast('Already on the route', 'bad'); return; }
        var nb = GEO.NEIGHBOURS[here()] || [];
        if (nb.indexOf(c.n) < 0) {
          wrong++;
          D.toast(c.n + ' does not border ' + here(), 'bad');
          draw();
          if (wrong >= MAX_WRONG) return finish(false);
          api.progress(progress(), (chain.length - 1) + ' stops · ' + (MAX_WRONG - wrong) + ' left');
          pick.focus();
          return;
        }
        chain.push(c.n);
        best = Math.max(best, chain.length - 1);
        draw();
        if (c.n === puzzle.to) return finish(true);
        api.progress(progress(), 'at ' + c.n);
        pick.focus();
      }

      function progress() {
        var left = GEO.route(here(), puzzle.to);
        if (!left) return 50;
        var total = puzzle.par;
        return Math.min(96, Math.max(0, (total - (left.length - 1)) / total) * 100);
      }

      function finish(solved) {
        over = true; pick.disable(); back.disabled = true;
        draw();
        note.textContent = solved
          ? 'Arrived in ' + (chain.length - 1) + ' stops' + (chain.length - 1 === puzzle.par ? ' — the shortest possible' : '')
          : 'Out of wrong turns';
        api.finish({ solved: solved, steps: chain.length - 1, par: puzzle.par, wrong: wrong, best: best });
      }

      draw();
      api.progress(0, 'at ' + puzzle.from);
      setTimeout(function () { pick.focus(); }, 60);
      return { giveUp: function () { if (!over) finish(false); } };
    }
  });
})(window.DLES);
