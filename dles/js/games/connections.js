/* ═══ CONNECTIONS ═══════════════════════════════════════════════════════
   Sixteen words, four hidden groups of four, four mistakes allowed.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var LIVES = 4;
  var COLS = ['#c9a227', '#6f9c62', '#5b8ea6', '#8a6bb0'];
  var INK = ['#1d1704', '#0b1a0c', '#08161c', '#150c22'];

  D.css('connections', [
    '.cngrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:560px;margin:0 auto}',
    '.cnw{aspect-ratio:1.35;display:grid;place-items:center;text-align:center;padding:4px;',
    '  border-radius:8px;background:#2a201c;border:1px solid #35271f;font-weight:700;',
    '  font-size:clamp(10px,2.3vw,14px);letter-spacing:.01em;line-height:1.15;transition:transform .08s,background .13s;word-break:break-word}',
    '.cnw:hover{background:#372a24}.cnw:active{transform:scale(.96)}',
    '.cnw.sel{background:var(--ink3);color:#120c0a}',
    '.cnsolved{grid-column:1/-1;border-radius:8px;padding:11px 8px;text-align:center;animation:fade .3s}',
    '.cnsolved b{display:block;font-size:12px;letter-spacing:.1em;text-transform:uppercase}',
    '.cnsolved i{font-style:normal;font-weight:700;font-size:14px;letter-spacing:.02em}',
    '.cnlives{display:flex;align-items:center;justify-content:center;gap:7px;margin:16px 0 12px;font-size:13px;color:var(--ink3)}',
    '.cnlives i{width:11px;height:11px;border-radius:50%;background:var(--ink3);display:block}',
    '.cnlives i.gone{background:#2a201c}',
    '.cnbtns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}'
  ].join(''));

  D.register({
    id: 'connections',
    name: 'Connections',
    blurb: 'Find the four hidden groups of four.',
    tag: 'word',
    icon: D.icon('connections'),

    build: function (rnd) {
      var p = D.pick(rnd, CONNECTIONS);
      var words = [];
      p.c.forEach(function (g, i) { g[1].forEach(function (w) { words.push({ w: w, g: i }); }); });
      return { cats: p.c.map(function (g) { return g[0]; }), order: D.shuffle(rnd, words) };
    },

    answerText: function (p) { return p.cats.join(' · '); },

    mount: function (host, puzzle, api) {
      var lives = LIVES, solvedGroups = [], over = false, earned = 0;
      var live = puzzle.order.slice();       // words still on the board
      var sel = [];

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint', 'Create four groups of four. Four mistakes and the round is over.'));
      var solvedBox = D.el('div', 'cngrid');
      solvedBox.style.marginBottom = '8px';
      var grid = D.el('div', 'cngrid');
      var lifeRow = D.el('div', 'cnlives');
      var btns = D.el('div', 'cnbtns');
      var bShuffle = D.el('button', 'btn gho sm', 'Shuffle');
      var bClear = D.el('button', 'btn gho sm', 'Deselect all');
      var bGo = D.el('button', 'btn pri sm', 'Submit');
      btns.appendChild(bShuffle); btns.appendChild(bClear); btns.appendChild(bGo);
      wrap.appendChild(solvedBox); wrap.appendChild(grid); wrap.appendChild(lifeRow); wrap.appendChild(btns);
      host.appendChild(wrap);

      function drawLives() {
        D.clear(lifeRow);
        lifeRow.appendChild(D.el('span', '', 'Mistakes remaining'));
        for (var i = 0; i < LIVES; i++) lifeRow.appendChild(D.el('i', i < lives ? '' : 'gone'));
      }

      function drawSolved() {
        D.clear(solvedBox);
        solvedGroups.forEach(function (gi) {
          var b = D.el('div', 'cnsolved');
          b.style.background = COLS[gi]; b.style.color = INK[gi];
          b.appendChild(D.el('b', '', D.esc(puzzle.cats[gi])));
          b.appendChild(D.el('i', '', puzzle.order.filter(function (x) { return x.g === gi; })
            .map(function (x) { return D.esc(x.w); }).join(', ')));
          solvedBox.appendChild(b);
        });
      }

      function draw() {
        D.clear(grid);
        live.forEach(function (item) {
          var b = D.el('button', 'cnw' + (sel.indexOf(item) >= 0 ? ' sel' : ''), D.esc(item.w));
          b.addEventListener('click', function () { toggle(item); });
          grid.appendChild(b);
        });
        bGo.disabled = over || sel.length !== 4;
      }

      function toggle(item) {
        if (over) return;
        var i = sel.indexOf(item);
        if (i >= 0) sel.splice(i, 1);
        else if (sel.length < 4) sel.push(item);
        draw();
      }

      bClear.addEventListener('click', function () { sel = []; draw(); });
      bShuffle.addEventListener('click', function () {
        // A local shuffle only — the seeded layout stays the shared one.
        for (var i = live.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1)); var t = live[i]; live[i] = live[j]; live[j] = t;
        }
        draw();
      });
      bGo.addEventListener('click', submit);

      function submit() {
        if (over || sel.length !== 4) return;
        var counts = {};
        sel.forEach(function (s) { counts[s.g] = (counts[s.g] || 0) + 1; });
        var best = Math.max.apply(null, Object.keys(counts).map(function (k) { return counts[k]; }));
        if (best === 4) {
          var gi = sel[0].g;
          solvedGroups.push(gi); earned++;
          live = live.filter(function (x) { return x.g !== gi; });
          sel = []; drawSolved(); draw();
          api.progress(earned / 4 * 100, earned + '/4 groups');
          if (earned === 4) return finish();
          return;
        }
        lives--;
        drawLives();
        D.toast(best === 3 ? 'One away…' : 'Not a group', 'bad');
        grid.classList.add('shake');
        setTimeout(function () { grid.classList.remove('shake'); }, 420);
        sel = []; draw();
        api.progress(Math.max(earned / 4 * 100, (LIVES - lives) * 12),
                     earned + '/4 · ' + lives + ' lives');
        if (lives <= 0) revealRest();
      }

      function revealRest() {
        [0, 1, 2, 3].forEach(function (gi) { if (solvedGroups.indexOf(gi) < 0) solvedGroups.push(gi); });
        live = []; drawSolved(); draw();
        finish();
      }

      /* `earned` is what the player found — revealing the rest on a loss
         must never look like a solve. */
      function finish() {
        if (over) return;
        over = true;
        bGo.disabled = true;
        api.finish({ groups: earned, mistakes: LIVES - lives });
      }

      drawLives(); draw();
      api.progress(0, '0/4 groups');
      return { giveUp: function () { if (!over) { lives = 0; revealRest(); } } };
    }
  });
})(window.DLES);
