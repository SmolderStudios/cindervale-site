/* ═══ WORDLE ════════════════════════════════════════════════════════════
   Five letters, six guesses. The reference implementation for every other
   game in here — build() is pure, mount() owns the DOM, and the only things
   that leave are api.progress() and api.finish(rawMetrics).
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var MAX = 6, LEN = 5;

  D.register({
    id: 'wordle',
    name: 'Wordle',
    blurb: 'Five letters, six guesses.',
    tag: 'word',
    icon: D.icon('wordle'),

    build: function (rnd) {
      return { answer: D.pick(rnd, WORDS.ANSWERS5) };
    },

    answerText: function (p) { return p.answer.toUpperCase(); },

    mount: function (host, puzzle, api) {
      var answer = puzzle.answer, row = 0, cur = '', over = false;
      var greens = 0;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint', 'Guess the five-letter word. Green = right spot, yellow = wrong spot.'));
      var grid = D.letterGrid(MAX, LEN);
      wrap.appendChild(grid.node);
      var kb = D.keyboard(D.QWERTY, key);
      wrap.appendChild(kb.node);
      host.appendChild(wrap);

      var unbind = D.bindKeys(key);

      function draw() {
        for (var c = 0; c < LEN; c++) grid.set(row, c, cur[c] || '');
      }

      function key(k) {
        if (over) return;
        if (k === 'BACK') { cur = cur.slice(0, -1); draw(); return; }
        if (k === 'ENTER') { submit(); return; }
        if (!/^[A-Z]$/.test(k)) return;
        if (cur.length >= LEN) return;
        cur += k; draw();
      }

      function submit() {
        if (cur.length < LEN) { grid.shake(row); return; }
        var g = cur.toLowerCase();
        if (!WORDS.VALID5SET.has(g)) {
          grid.shake(row); D.toast('Not in the word list', 'bad'); return;
        }
        var marks = D.markGuess(g, answer);
        var letters = cur.split('');
        over = true;                                  // locked during the reveal
        D.revealRow(grid, row, letters, marks, function () {
          letters.forEach(function (ch, i) { kb.mark(ch, marks[i]); });
          var won = g === answer;
          greens = Math.max(greens, marks.filter(function (m) { return m === 'g'; }).length);
          row++; cur = '';
          if (won) { grid.win(row - 1); finish(true); return; }
          if (row >= MAX) { finish(false); return; }
          over = false;
          api.progress(row / MAX * 100, row + '/' + MAX + ' guesses');
        });
      }

      function finish(solved) {
        over = true; unbind();
        api.finish({ solved: solved, guesses: row, greens: solved ? LEN : greens });
      }

      api.progress(0, 'thinking…');
      return { destroy: unbind, giveUp: function () { finish(false); } };
    }
  });
})(window.DLES);
