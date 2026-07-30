/* ═══ CHRONOLOGY ════════════════════════════════════════════════════════
   Six events, one shot at putting them oldest-first. Scored on how many
   PAIRS you got the right way round, so a near-miss still beats a shuffle.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var N = 6;

  D.register({
    id: 'chrono',
    name: 'Chronology',
    blurb: 'Put six events in order, oldest first.',
    tag: 'trivia',
    icon: D.icon('chrono'),

    build: function (rnd) {
      // Distinct years only — two events in the same year would make the
      // "correct" order arbitrary and the feedback a lie.
      var pool = D.shuffle(rnd, EVENTS), picked = [], years = {};
      for (var i = 0; i < pool.length && picked.length < N; i++) {
        var y = pool[i][0];
        if (years[y]) continue;
        years[y] = 1; picked.push({ y: y, t: pool[i][1] });
      }
      return { events: D.shuffle(rnd, picked) };
    },
    answerText: function (p) {
      return p.events.slice().sort(function (a, b) { return a.y - b.y; })
        .map(function (e) { return fmtYear(e.y); }).join(' → ');
    },

    mount: function (host, puzzle, api) {
      var over = false;
      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint', 'Drag (or use ▲▼) to order these from oldest at the top to most recent at the bottom. One submission only.'));
      var labels = D.el('div', 'slabels');
      labels.innerHTML = '<span>↑ oldest</span><span>most recent ↓</span>';
      wrap.appendChild(labels);

      var list = D.sortList(puzzle.events, function (e) { return e.t; });
      wrap.appendChild(list.node);

      var go = D.el('button', 'btn pri', 'Lock in this order');
      go.style.cssText = 'display:block;width:100%;max-width:620px;margin:16px auto 0';
      go.addEventListener('click', submit);
      wrap.appendChild(go);
      var note = D.el('div', 'tiny dim');
      note.style.cssText = 'text-align:center;margin-top:10px';
      wrap.appendChild(note);
      host.appendChild(wrap);

      function submit() {
        if (over) return;
        over = true; go.disabled = true;
        var ord = list.order();
        var sc = D.pairScore(ord, function (e) { return e.y; });
        var sorted = ord.slice().sort(function (a, b) { return a.y - b.y; });
        var marks = ord.map(function (e, i) { return sorted[i] === e; });
        list.lock(marks, function (e) { return fmtYear(e.y); });
        note.textContent = sc.correct + ' of ' + sc.total + ' pairs in the right order';
        api.finish({ correct: sc.correct, total: sc.total });
      }

      api.progress(10, 'ordering…');
      return { giveUp: function () { if (!over) submit(); } };
    }
  });

  function fmtYear(y) { return y < 0 ? Math.abs(y) + ' BC' : String(y); }
})(window.DLES);
