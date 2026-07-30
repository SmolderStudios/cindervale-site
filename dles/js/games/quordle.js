/* ═══ QUORDLE ═══════════════════════════════════════════════════════════
   Four words at once, nine shared guesses. Every guess lands on all four
   boards, so the first two guesses are pure information-gathering.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var MAX = 9, LEN = 5, N = 4;

  D.css('quordle', [
    '.qwrap{display:grid;grid-template-columns:1fr 1fr;gap:14px;justify-content:center}',
    '.qboard{position:relative;padding:8px;border-radius:12px;background:#0f0b09;border:1px solid var(--line)}',
    '.qboard.done{border-color:var(--good);opacity:.62}',
    '.qboard .qtag{position:absolute;top:6px;right:9px;font:700 10px/1 var(--mono);color:var(--ink3);letter-spacing:.1em}',
    '.qboard.done .qtag{color:var(--good)}',
    '.qwrap .tile{width:34px;height:34px;font-size:15px;border-width:2px;border-radius:4px}',
    '.qwrap .tgrid{gap:3px}.qwrap .trow{gap:3px}',
    '@media(max-width:640px){.qwrap{gap:8px}.qwrap .tile{width:26px;height:26px;font-size:12px}}'
  ].join(''));

  D.register({
    id: 'quordle',
    name: 'Quordle',
    blurb: 'Four words at once, nine guesses.',
    tag: 'word',
    icon: D.icon('quordle'),

    build: function (rnd) {
      var pool = WORDS.ANSWERS5, picked = [], seen = {};
      while (picked.length < N) {
        var w = D.pick(rnd, pool);
        if (seen[w]) continue;
        seen[w] = 1; picked.push(w);
      }
      return { answers: picked };
    },

    answerText: function (p) { return p.answers.join(', ').toUpperCase(); },

    mount: function (host, puzzle, api) {
      var answers = puzzle.answers, row = 0, cur = '', busy = false, over = false;
      var solved = answers.map(function () { return false; });

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint', 'Nine guesses for four words. Every guess is played on all four boards.'));
      var boards = D.el('div', 'qwrap');
      var grids = answers.map(function (_, i) {
        var b = D.el('div', 'qboard');
        // Stays empty until the board is solved, then shows which guess did it.
        b.appendChild(D.el('div', 'qtag', ''));
        var g = D.letterGrid(MAX, LEN);
        b.appendChild(g.node); boards.appendChild(b);
        return { grid: g, box: b, tag: b.firstChild };
      });
      wrap.appendChild(boards);
      var kb = D.keyboard(D.QWERTY, key);
      wrap.appendChild(kb.node);
      host.appendChild(wrap);
      var unbind = D.bindKeys(key);

      function draw() {
        grids.forEach(function (b, i) {
          if (solved[i]) return;
          for (var c = 0; c < LEN; c++) b.grid.set(row, c, cur[c] || '');
        });
      }

      function key(k) {
        if (over || busy) return;
        if (k === 'BACK') { cur = cur.slice(0, -1); draw(); return; }
        if (k === 'ENTER') { submit(); return; }
        if (!/^[A-Z]$/.test(k) || cur.length >= LEN) return;
        cur += k; draw();
      }

      function submit() {
        if (cur.length < LEN) { grids.forEach(function (b, i) { if (!solved[i]) b.grid.shake(row); }); return; }
        var g = cur.toLowerCase();
        if (!WORDS.VALID5SET.has(g)) {
          grids.forEach(function (b, i) { if (!solved[i]) b.grid.shake(row); });
          D.toast('Not in the word list', 'bad'); return;
        }
        busy = true;
        var letters = cur.split('');
        var best = {};                                  // best mark per letter across boards
        answers.forEach(function (ans, i) {
          if (solved[i]) return;
          var marks = D.markGuess(g, ans);
          D.revealRow(grids[i].grid, row, letters, marks);
          letters.forEach(function (ch, j) {
            var rank = { b: 1, y: 2, g: 3 };
            if ((rank[marks[j]] || 0) > (rank[best[ch]] || 0)) best[ch] = marks[j];
          });
          if (g === ans) {
            solved[i] = true;
            grids[i].box.classList.add('done');
            grids[i].tag.textContent = (row + 1) + '/' + MAX;
            grids[i].grid.win(row);
          }
        });
        setTimeout(function () {
          Object.keys(best).forEach(function (ch) { kb.mark(ch, best[ch]); });
          row++; cur = ''; busy = false;
          var got = solved.filter(Boolean).length;
          if (got === N) return finish();
          if (row >= MAX) return finish();
          api.progress(Math.max(row / MAX, got / N) * 100, got + '/4 words · ' + row + '/' + MAX);
        }, LEN * 130 + 280);
      }

      function finish() {
        over = true; unbind();
        api.finish({ solvedCount: solved.filter(Boolean).length, guesses: row });
      }

      api.progress(0, 'thinking…');
      return { destroy: unbind, giveUp: finish };
    }
  });
})(window.DLES);
