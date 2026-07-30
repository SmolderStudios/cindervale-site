/* ═══ RANKDLE ═══════════════════════════════════════════════════════════
   Five things, one scale, smallest to largest. Same pairwise scoring as
   Chronology so being nearly right is worth something.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var N = 5;

  D.register({
    id: 'rankdle',
    name: 'Rankdle',
    blurb: 'Order five things by the numbers.',
    tag: 'trivia',
    icon: D.icon('rankdle'),

    build: function (rnd) {
      var set = D.pick(rnd, RANKSETS);
      // Distinct values only — a tie has no correct order to score against.
      var pool = D.shuffle(rnd, set.items), picked = [], seen = {};
      for (var i = 0; i < pool.length && picked.length < N; i++) {
        var v = pool[i][1];
        if (seen[v]) continue;
        seen[v] = 1; picked.push({ l: pool[i][0], v: v });
      }
      return { setName: set.name, unit: set.unit, hi: set.hi,
               setIdx: RANKSETS.indexOf(set), items: picked };
    },
    answerText: function (p) {
      var set = RANKSETS[p.setIdx];
      return p.items.slice().sort(function (a, b) { return a.v - b.v; })
        .map(function (x) { return x.l + ' (' + set.fmt(x.v) + (p.unit ? ' ' + p.unit : '') + ')'; }).join(' · ');
    },

    mount: function (host, puzzle, api) {
      var set = RANKSETS[puzzle.setIdx], over = false;
      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint', puzzle.setName + ' — smallest at the top, ' + puzzle.hi + ' at the bottom.'));
      var labels = D.el('div', 'slabels');
      labels.innerHTML = '<span>↑ smallest</span><span>' + D.esc(puzzle.hi) + ' ↓</span>';
      wrap.appendChild(labels);

      var list = D.sortList(puzzle.items, function (x) { return x.l; });
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
        var sc = D.pairScore(ord, function (x) { return x.v; });
        var sorted = ord.slice().sort(function (a, b) { return a.v - b.v; });
        var marks = ord.map(function (x, i) { return sorted[i] === x; });
        list.lock(marks, function (x) { return set.fmt(x.v) + (puzzle.unit ? ' ' + puzzle.unit : ''); });
        note.textContent = sc.correct + ' of ' + sc.total + ' pairs in the right order';
        api.finish({ correct: sc.correct, total: sc.total });
      }

      api.progress(10, 'ordering…');
      return { giveUp: function () { if (!over) submit(); } };
    }
  });
})(window.DLES);
