/* ═══ SUDOKU MINI ═══════════════════════════════════════════════════════
   Six by six, digits 1–6, boxes two rows by three columns. Generated from
   the seed: a full solved grid is built by backtracking, then clues are
   removed one at a time and only kept off if the puzzle still has exactly
   ONE solution. Nothing here is ever guessable.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var N = 6, BR = 2, BC = 3;   // box is 2 rows × 3 cols

  D.css('sudoku', [
    '.sdgrid{display:grid;grid-template-columns:repeat(6,1fr);width:min(330px,84vw);margin:0 auto;',
    '  border:2px solid var(--ink3);border-radius:5px;overflow:hidden}',
    '.sdc{aspect-ratio:1;display:grid;place-items:center;background:#fdfbf7;color:#14100e;',
    '  font:700 clamp(17px,4.6vw,24px)/1 var(--sans);border:1px solid #cabcae;cursor:pointer}',
    '.sdc.bxr{border-right:2px solid #6c6055}',
    '.sdc.bxb{border-bottom:2px solid #6c6055}',
    '.sdc.clue{background:#ece3d6;color:#14100e;cursor:default}',
    '.sdc.cur{background:#f6d98a}',
    '.sdc.peer{background:#e6eef5}',
    '.sdc.cur.peer{background:#f6d98a}',
    '.sdc.bad{color:#b4483f}',
    '.sdc.same{background:#cfe4f2}',
    '.sdpad{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;width:min(330px,84vw);margin:14px auto 0}',
    '.sdpad button{padding:12px 0;border-radius:8px;background:#3a2c25;font:700 18px/1 var(--sans);color:var(--ink)}',
    '.sdpad button:hover{background:#4a382f}',
    '.sdbar{display:flex;gap:8px;justify-content:center;margin-top:12px}'
  ].join(''));

  function boxOf(r, c) { return Math.floor(r / BR) * BR + Math.floor(c / BC); }

  function okAt(g, r, c, v) {
    var i;
    for (i = 0; i < N; i++) if (i !== c && g[r * N + i] === v) return false;
    for (i = 0; i < N; i++) if (i !== r && g[i * N + c] === v) return false;
    var r0 = Math.floor(r / BR) * BR, c0 = Math.floor(c / BC) * BC;
    for (var a = r0; a < r0 + BR; a++) for (var b = c0; b < c0 + BC; b++) {
      if ((a !== r || b !== c) && g[a * N + b] === v) return false;
    }
    return true;
  }

  function fill(g, rnd, pos) {
    if (pos >= N * N) return true;
    var r = Math.floor(pos / N), c = pos % N;
    var order = D.shuffle(rnd, [1, 2, 3, 4, 5, 6]);
    for (var i = 0; i < order.length; i++) {
      if (!okAt(g, r, c, order[i])) continue;
      g[pos] = order[i];
      if (fill(g, rnd, pos + 1)) return true;
      g[pos] = 0;
    }
    return false;
  }

  /* Counts solutions, stopping at 2 — that is all "unique?" needs. */
  function countSolutions(g, cap) {
    var best = -1, i;
    for (i = 0; i < N * N; i++) if (!g[i]) { best = i; break; }
    if (best < 0) return 1;
    var r = Math.floor(best / N), c = best % N, total = 0;
    for (var v = 1; v <= N; v++) {
      if (!okAt(g, r, c, v)) continue;
      g[best] = v;
      total += countSolutions(g, cap);
      g[best] = 0;
      if (total >= cap) return total;
    }
    return total;
  }

  D.register({
    id: 'sudoku',
    name: 'Sudoku Mini',
    blurb: 'Six by six. One of each per row, column and box.',
    tag: 'logic',
    icon: D.icon('sudoku'),

    build: function (rnd) {
      var sol = new Array(N * N).fill(0);
      fill(sol, rnd, 0);
      var puz = sol.slice();
      var order = D.shuffle(rnd, sol.map(function (_, i) { return i; }));
      var removed = 0;
      for (var k = 0; k < order.length && removed < 22; k++) {
        var i = order[k], keep = puz[i];
        puz[i] = 0;
        if (countSolutions(puz.slice(), 2) !== 1) puz[i] = keep;   // ambiguity: put it back
        else removed++;
      }
      return { puzzle: puz, solution: sol };
    },
    answerText: function () { return 'one of each digit per row, column and 2×3 box'; },

    mount: function (host, puzzle, api) {
      var given = puzzle.puzzle, sol = puzzle.solution;
      var cells = given.slice();
      var wrong = 0, over = false, cur = -1;
      var blanks = given.filter(function (v) { return !v; }).length;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint',
        'Digits 1 to 6, once each per row, column and 2×3 box. A wrong digit costs a little but is not fatal.'));

      var grid = D.el('div', 'sdgrid');
      var nodes = [];
      for (var i = 0; i < N * N; i++) {
        var r = Math.floor(i / N), c = i % N;
        var n = D.el('div', 'sdc' + ((c % BC === BC - 1 && c !== N - 1) ? ' bxr' : '') +
                              ((r % BR === BR - 1 && r !== N - 1) ? ' bxb' : ''));
        (function (idx, node) { node.addEventListener('click', function () { select(idx); }); })(i, n);
        nodes.push(n); grid.appendChild(n);
      }
      wrap.appendChild(grid);

      var pad = D.el('div', 'sdpad');
      [1, 2, 3, 4, 5, 6].forEach(function (v) {
        var b = D.el('button', '', String(v));
        b.addEventListener('click', function () { put(v); });
        pad.appendChild(b);
      });
      wrap.appendChild(pad);
      var bar = D.el('div', 'sdbar');
      var bClear = D.el('button', 'btn sm gho', 'Erase');
      bar.appendChild(bClear);
      wrap.appendChild(bar);
      var note = D.el('div', 'tiny dim');
      note.style.cssText = 'text-align:center;margin-top:10px';
      wrap.appendChild(note);
      host.appendChild(wrap);

      bClear.addEventListener('click', function () { put(0); });

      var unbind = D.bindKeys(function (k) {
        if (k === 'BACK') return put(0);
        if (/^[1-6]$/.test(k)) return put(+k);
      }, '123456');

      function select(i) { if (!over && !given[i]) { cur = i; paint(); } }

      function put(v) {
        if (over || cur < 0 || given[cur]) return;
        if (v && cells[cur] !== v && v !== sol[cur]) wrong++;
        cells[cur] = v;
        paint();
        var filled = cells.filter(function (x, i) { return !given[i] && x; }).length;
        api.progress(filled / blanks * 100, filled + '/' + blanks + ' filled');
        if (cells.every(function (x, i) { return x === sol[i]; })) finish(true);
      }

      function paint() {
        var curR = cur >= 0 ? Math.floor(cur / N) : -1;
        var curC = cur >= 0 ? cur % N : -1;
        var curV = cur >= 0 ? cells[cur] : 0;
        nodes.forEach(function (n, i) {
          var r = Math.floor(i / N), c = i % N;
          var cls = 'sdc' + ((c % BC === BC - 1 && c !== N - 1) ? ' bxr' : '') +
                            ((r % BR === BR - 1 && r !== N - 1) ? ' bxb' : '');
          if (given[i]) cls += ' clue';
          if (cur >= 0 && (r === curR || c === curC || boxOf(r, c) === boxOf(curR, curC))) cls += ' peer';
          if (curV && cells[i] === curV && i !== cur) cls += ' same';
          if (i === cur) cls += ' cur';
          if (cells[i] && !given[i] && cells[i] !== sol[i]) cls += ' bad';
          n.className = cls;
          n.textContent = cells[i] || '';
        });
        note.textContent = over ? '' :
          cells.filter(function (x, i) { return !given[i] && x; }).length + '/' + blanks + ' filled' +
          (wrong ? ' · ' + wrong + (wrong === 1 ? ' mistake' : ' mistakes') : '');
      }

      function finish(solved) {
        if (over) return;
        over = true; unbind();
        var filled = cells.filter(function (x, i) { return !given[i] && x === sol[i]; }).length;
        if (!solved) { cells = sol.slice(); cur = -1; }
        paint();
        note.textContent = solved
          ? 'Solved' + (wrong ? ' with ' + wrong + (wrong === 1 ? ' mistake' : ' mistakes') : ' clean')
          : 'Answers shown';
        api.finish({ solved: solved, filled: filled, total: blanks, wrong: wrong });
      }

      paint();
      api.progress(0, '0/' + blanks + ' filled');
      return { destroy: unbind, giveUp: function () { if (!over) finish(false); } };
    }
  });
})(window.DLES);
