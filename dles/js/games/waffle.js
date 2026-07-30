/* ═══ WAFFLE ════════════════════════════════════════════════════════════
   Six words already on the board, all their letters in the wrong places.
   Swap pairs until every word reads correctly. Every puzzle is exactly ten
   swaps from solved and you get fifteen, so the score is really "how much
   did you waste".
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';

  /* The 21 playable cells, in the same reading order the generator used. */
  var CELLS = [];
  for (var r = 0; r < 5; r++) for (var c = 0; c < 5; c++) if (r % 2 === 0 || c % 2 === 0) CELLS.push([r, c]);
  var INDEX = {};
  CELLS.forEach(function (p, i) { INDEX[p[0] + ',' + p[1]] = i; });

  /* The six words, as lists of cell indices. */
  var LINES = [];
  [0, 2, 4].forEach(function (row) {
    LINES.push([0, 1, 2, 3, 4].map(function (c) { return INDEX[row + ',' + c]; }));
  });
  [0, 2, 4].forEach(function (col) {
    LINES.push([0, 1, 2, 3, 4].map(function (r) { return INDEX[r + ',' + col]; }));
  });

  D.css('waffle', [
    '.wfgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;width:min(340px,84vw);margin:0 auto}',
    '.wfc{aspect-ratio:1;display:grid;place-items:center;border-radius:8px;font:800 clamp(16px,4.6vw,24px)/1 var(--sans);',
    '  text-transform:uppercase;background:#2a201c;color:var(--ink);border:2px solid transparent;transition:transform .09s,background .2s}',
    '.wfc.blank{background:transparent;cursor:default}',
    '.wfc.g{background:var(--good);color:#0b1a0c}',
    '.wfc.y{background:var(--warn);color:#1d1704}',
    '.wfc.b{background:#2a201c;color:var(--ink2)}',
    '.wfc.pickd{border-color:var(--ember);transform:scale(.92)}',
    '.wfc:not(.blank):hover{border-color:var(--line2)}',
    '.wfswaps{display:flex;justify-content:center;gap:5px;margin:18px 0 6px}',
    '.wfswaps i{width:14px;height:8px;border-radius:99px;background:var(--ember);display:block}',
    '.wfswaps i.used{background:#2a201c}'
  ].join(''));

  D.register({
    id: 'waffle',
    name: 'Waffle',
    blurb: 'Swap letters until six words appear.',
    tag: 'word',
    icon: D.icon('waffle'),

    build: function (rnd) {
      var p = D.pick(rnd, WAFFLES.list);
      return { words: p.w, scramble: p.s, par: WAFFLES.par, allowed: WAFFLES.allowed };
    },
    answerText: function (p) {
      return p.words.slice(0, 3).join(' / ').toUpperCase() + '  ·  ' + p.words.slice(3).join(' / ').toUpperCase();
    },

    mount: function (host, puzzle, api) {
      var sol = solutionLetters(puzzle.words);
      var cur = puzzle.scramble.split('');
      var swaps = 0, sel = null, over = false;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint',
        'Click two letters to swap them. Green is home, yellow belongs in that word somewhere else. ' +
        puzzle.allowed + ' swaps — it can be done in ' + puzzle.par + '.'));

      var grid = D.el('div', 'wfgrid');
      var cellNodes = [];
      for (var r = 0; r < 5; r++) for (var c = 0; c < 5; c++) {
        var i = INDEX[r + ',' + c];
        if (i == null) { grid.appendChild(D.el('div', 'wfc blank')); continue; }
        var n = D.el('div', 'wfc');
        (function (idx, node) { node.addEventListener('click', function () { tap(idx); }); })(i, n);
        cellNodes[i] = n; grid.appendChild(n);
      }
      wrap.appendChild(grid);

      var swapRow = D.el('div', 'wfswaps');
      wrap.appendChild(swapRow);
      var note = D.el('div', 'tiny dim');
      note.style.cssText = 'text-align:center';
      wrap.appendChild(note);
      host.appendChild(wrap);

      function tap(i) {
        if (over) return;
        if (marksNow()[i] === 'g' && sel === null) { D.toast('That one is already home', 'bad'); return; }
        if (sel === null) { sel = i; paint(); return; }
        if (sel === i) { sel = null; paint(); return; }
        var t = cur[sel]; cur[sel] = cur[i]; cur[i] = t;
        sel = null; swaps++;
        paint();
        var right = correctCount();
        api.progress(Math.min(99, right / 21 * 100), right + '/21 letters · ' + swaps + ' swaps');
        if (right === 21) return finish(true);
        if (swaps >= puzzle.allowed) return finish(false);
      }

      /* Wordle marking per word; a cell shared by two words takes the better. */
      function marksNow() {
        var out = new Array(21).fill('b');
        var rank = { b: 1, y: 2, g: 3 };
        LINES.forEach(function (line, li) {
          var guess = line.map(function (i) { return cur[i]; }).join('');
          var mk = D.markGuess(guess, puzzle.words[li]);
          line.forEach(function (i, k) {
            if (rank[mk[k]] > rank[out[i]]) out[i] = mk[k];
          });
        });
        return out;
      }
      function correctCount() {
        var n = 0;
        for (var i = 0; i < 21; i++) if (cur[i] === sol[i]) n++;
        return n;
      }

      function paint() {
        var mk = marksNow();
        cellNodes.forEach(function (node, i) {
          node.textContent = cur[i];
          node.className = 'wfc ' + mk[i] + (sel === i ? ' pickd' : '');
        });
        D.clear(swapRow);
        for (var i = 0; i < puzzle.allowed; i++) swapRow.appendChild(D.el('i', i < puzzle.allowed - swaps ? '' : 'used'));
        note.textContent = (puzzle.allowed - swaps) + ' swaps left';
      }

      function finish(solved) {
        over = true; sel = null; paint();
        note.textContent = solved ? 'Solved in ' + swaps + ' swaps' : 'Out of swaps';
        if (!solved) {
          cellNodes.forEach(function (node, i) { node.textContent = sol[i]; node.className = 'wfc b'; });
        }
        api.finish({ solved: solved, swapsUsed: swaps, swapsAllowed: puzzle.allowed,
                     par: puzzle.par, correct: correctCount() });
      }

      paint();
      api.progress(0, correctCount() + '/21 letters');
      return { giveUp: function () { if (!over) { swaps = puzzle.allowed; finish(false); } } };
    }
  });

  function solutionLetters(words) {
    var m = {};
    words.slice(0, 3).forEach(function (w, i) {
      for (var c = 0; c < 5; c++) m[(i * 2) + ',' + c] = w[c];
    });
    words.slice(3).forEach(function (w, i) {
      for (var r = 0; r < 5; r++) m[r + ',' + (i * 2)] = w[r];
    });
    return CELLS.map(function (p) { return m[p[0] + ',' + p[1]]; });
  }
  D._waffleSolution = solutionLetters;
})(window.DLES);
