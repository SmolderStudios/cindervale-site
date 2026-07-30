/* ═══ CLUEDLE ═══════════════════════════════════════════════════════════
   Five clues, vaguest first. Guess early for the big score, or take another
   clue and settle for less. Wrong guesses cost a little on their own.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var MAXC = 5, MAXWRONG = 4;

  D.css('cluedle', [
    '.cdlist{display:flex;flex-direction:column;gap:9px;max-width:600px;margin:0 auto 16px}',
    '.cdclue{display:flex;gap:11px;padding:12px 14px;border-radius:10px;background:#0f0b09;',
    '  border:1px solid var(--line);font-size:15px;line-height:1.45;animation:fade .25s}',
    '.cdclue b{font:800 12px/1.6 var(--mono);color:var(--ember);flex:0 0 auto}',
    '.cdclue.next{background:transparent;border-style:dashed;color:var(--ink3);justify-content:center;font-size:13px}',
    '.cdworth{text-align:center;font-size:12px;color:var(--ink3);margin-bottom:12px}',
    '.cdworth b{color:var(--ember2);font-family:var(--mono)}'
  ].join(''));

  D.register({
    id: 'cluedle',
    name: 'Cluedle',
    blurb: 'Five clues. Guess as early as you dare.',
    tag: 'trivia',
    icon: D.icon('cluedle'),

    build: function (rnd) { return { idx: D.int(rnd, CLUES.length) }; },
    answerText: function (p) { return CLUES[p.idx][0]; },

    mount: function (host, puzzle, api) {
      var entry = CLUES[puzzle.idx];
      var answer = entry[0], aliases = entry[1] || [], clues = entry[2];
      var shown = 1, wrong = 0, over = false;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint', 'What am I? Guessing on clue 1 is worth about three times guessing on clue 5.'));
      var worth = D.el('div', 'cdworth');
      var list = D.el('div', 'cdlist');
      wrap.appendChild(worth); wrap.appendChild(list);

      var inWrap = D.el('div', 'inline-in');
      var input = document.createElement('input');
      input.placeholder = 'Your answer…'; input.autocomplete = 'off'; input.spellcheck = false;
      var bGuess = D.el('button', 'btn pri', 'Guess');
      inWrap.appendChild(input); inWrap.appendChild(bGuess);
      wrap.appendChild(inWrap);

      var bMore = D.el('button', 'btn gho');
      bMore.style.cssText = 'display:block;margin:12px auto 0';
      wrap.appendChild(bMore);
      var note = D.el('div', 'tiny dim');
      note.style.cssText = 'text-align:center;margin-top:10px';
      wrap.appendChild(note);
      host.appendChild(wrap);

      function draw() {
        D.clear(list);
        for (var i = 0; i < shown; i++) {
          var c = D.el('div', 'cdclue');
          c.appendChild(D.el('b', '', String(i + 1)));
          c.appendChild(D.el('div', '', D.esc(clues[i])));
          list.appendChild(c);
        }
        if (shown < MAXC && !over) list.appendChild(D.el('div', 'cdclue next', (MAXC - shown) + ' more clue' + (MAXC - shown > 1 ? 's' : '') + ' available'));
        var pct = Math.round((1 - (shown - 1) / (MAXC - 1) * .62) * 100);
        worth.innerHTML = 'Solving now is worth <b>' + pct + '%</b> of the accuracy points' +
          (wrong ? ' · <b>' + wrong + '</b> wrong guess' + (wrong > 1 ? 'es' : '') : '');
        bMore.textContent = shown >= MAXC ? 'No clues left' : 'Reveal clue ' + (shown + 1);
        bMore.disabled = over || shown >= MAXC;
      }

      function guess() {
        if (over) return;
        var q = D.norm(input.value);
        if (!q) return;
        var ok = D.norm(answer) === q || aliases.some(function (a) { return D.norm(a) === q; });
        // Let a long answer through on a solid partial ("everest" for "Mount Everest").
        if (!ok && q.length >= 4 && D.norm(answer).split(' ').indexOf(q) >= 0 &&
            D.norm(answer).split(' ').length > 1) ok = true;
        input.value = '';
        if (ok) return finish(true);
        wrong++;
        D.toast('Not it', 'bad');
        if (wrong >= MAXWRONG && shown >= MAXC) return finish(false);
        if (wrong >= MAXWRONG) { shown = MAXC; }
        draw();
        api.progress(Math.min(95, shown / MAXC * 60 + wrong * 8), 'clue ' + shown + ' · ' + wrong + ' wrong');
      }

      bGuess.addEventListener('click', guess);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); guess(); }
        e.stopPropagation();
      });
      bMore.addEventListener('click', function () {
        if (over || shown >= MAXC) return;
        shown++; draw();
        api.progress(shown / MAXC * 60, 'on clue ' + shown);
      });

      function finish(solved) {
        over = true;
        input.disabled = true; bGuess.disabled = true; bMore.disabled = true;
        note.textContent = solved ? 'Correct — ' + answer : 'It was ' + answer;
        draw();
        api.finish({ solved: solved, cluesUsed: shown, maxClues: MAXC, wrong: wrong });
      }

      draw();
      api.progress(0, 'on clue 1');
      setTimeout(function () { input.focus(); }, 60);
      return { giveUp: function () { if (!over) finish(false); } };
    }
  });
})(window.DLES);
