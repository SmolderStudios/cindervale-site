/* ═══ CAPITALS ══════════════════════════════════════════════════════════
   Ten capitals, four options each, no going back. Pure quickfire — the
   whole game is how fast you can be right.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var N = 10;

  D.css('capitals', [
    '.cpq{text-align:center;margin-bottom:6px;font-size:12px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3)}',
    '.cpcity{text-align:center;font:800 clamp(28px,6vw,44px)/1.15 var(--sans);margin-bottom:4px}',
    '.cpsub{text-align:center;font-size:13px;color:var(--ink3);margin-bottom:20px}',
    '.cpopts{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:560px;margin:0 auto}',
    '@media(max-width:520px){.cpopts{grid-template-columns:1fr}}',
    '.cpopt{padding:14px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);',
    '  font-weight:600;font-size:15px;transition:border-color .12s,background .12s}',
    '.cpopt:hover:not(:disabled){border-color:var(--ember)}',
    '.cpopt.right{background:var(--goodDim);border-color:var(--good)}',
    '.cpopt.wrong{background:var(--badDim);border-color:var(--bad)}',
    '.cpdots{display:flex;justify-content:center;gap:5px;margin-top:20px}',
    '.cpdots i{width:20px;height:5px;border-radius:99px;background:#2a201c;display:block}',
    '.cpdots i.ok{background:var(--good)}.cpdots i.no{background:var(--bad)}',
    '.cptally{text-align:center;font:700 14px/1 var(--mono);color:var(--ink2);margin-top:12px}'
  ].join(''));

  D.register({
    id: 'capitals',
    name: 'Capitals',
    blurb: 'Ten capitals, ten countries, fast.',
    tag: 'world',
    icon: D.icon('capitals'),

    build: function (rnd) {
      // Ask about countries people have heard of; offer decoys from the same
      // region so it is a geography question and not a vibe check.
      var pool = GEO.COUNTRIES.filter(function (c) { return c.pop > 2 || c.area > 300; });
      var picked = D.sample(rnd, pool, N);
      return {
        qs: picked.map(function (c) {
          var same = pool.filter(function (o) { return o.r === c.r && o.n !== c.n; });
          var wrongs = D.sample(rnd, same.length >= 3 ? same : pool.filter(function (o) { return o.n !== c.n; }), 3);
          var opts = D.shuffle(rnd, [c.n].concat(wrongs.map(function (o) { return o.n; })));
          return { cap: c.cap, country: c.n, region: c.r, opts: opts };
        })
      };
    },
    answerText: function (p) {
      return p.qs.map(function (q) { return q.cap + ' = ' + q.country; }).join(' · ');
    },

    mount: function (host, puzzle, api) {
      var i = 0, correct = 0, marks = [], over = false, locked = false;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint', 'Which country has this capital?'));
      var qn = D.el('div', 'cpq');
      var city = D.el('div', 'cpcity');
      var sub = D.el('div', 'cpsub');
      var opts = D.el('div', 'cpopts');
      var dots = D.el('div', 'cpdots');
      var tally = D.el('div', 'cptally');
      wrap.appendChild(qn); wrap.appendChild(city); wrap.appendChild(sub);
      wrap.appendChild(opts); wrap.appendChild(dots); wrap.appendChild(tally);
      host.appendChild(wrap);

      function draw() {
        var q = puzzle.qs[i];
        qn.textContent = 'Question ' + (i + 1) + ' of ' + N;
        city.textContent = q.cap;
        sub.textContent = q.region;
        D.clear(opts);
        q.opts.forEach(function (name) {
          var b = D.el('button', 'cpopt', D.esc(name));
          b.addEventListener('click', function () { answer(name, b, q); });
          opts.appendChild(b);
        });
        D.clear(dots);
        for (var k = 0; k < N; k++) {
          dots.appendChild(D.el('i', marks[k] === undefined ? '' : marks[k] ? 'ok' : 'no'));
        }
        tally.textContent = correct + ' / ' + i + ' so far';
      }

      function answer(name, btn, q) {
        if (locked || over) return;
        locked = true;
        var right = name === q.country;
        if (right) correct++;
        marks[i] = right;
        btn.classList.add(right ? 'right' : 'wrong');
        if (!right) {
          D.$$('.cpopt', opts).forEach(function (b) {
            if (b.textContent === q.country) b.classList.add('right');
          });
        }
        D.$$('.cpopt', opts).forEach(function (b) { b.disabled = true; });
        tally.textContent = correct + ' / ' + (i + 1) + ' so far';
        api.progress((i + 1) / N * 100, correct + '/' + (i + 1) + ' right');
        setTimeout(function () {
          locked = false;
          i++;
          if (i >= N) return finish();
          draw();
        }, right ? 330 : 900);
      }

      function finish() {
        over = true;
        D.clear(opts);
        city.textContent = correct + ' / ' + N;
        qn.textContent = 'Finished';
        sub.textContent = '';
        api.finish({ correct: correct, total: N });
      }

      draw();
      api.progress(0, '0/' + N);
      return { giveUp: function () { if (!over) { while (i < N) { marks[i] = false; i++; } finish(); } } };
    }
  });
})(window.DLES);
