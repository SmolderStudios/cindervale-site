/* ═══ MINI CROSSWORD ════════════════════════════════════════════════════
   A 4×4 where every row and every column is a word. Reveals are allowed but
   each one costs accuracy, so the score separates "solved it" from "solved
   it with the answers".
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var N = 4, MAXREVEAL = 6;

  D.css('mini', [
    '.mnwrap{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:start}',
    '@media(max-width:620px){.mnwrap{grid-template-columns:1fr}}',
    '.mngrid{display:grid;grid-template-columns:repeat(4,1fr);gap:0;width:min(268px,74vw);',
    '  border:2px solid var(--ink3);border-radius:4px;overflow:hidden;margin:0 auto}',
    '.mncell{position:relative;aspect-ratio:1;background:#fdfbf7;border:1px solid #b9ab9c;',
    '  display:grid;place-items:center;font:700 clamp(18px,5vw,26px)/1 var(--sans);color:#14100e;',
    '  text-transform:uppercase;cursor:pointer}',
    '.mncell.cur{background:#f6d98a}',
    '.mncell.inword{background:#cfe4f2}',
    '.mncell.cur.inword{background:#f6d98a}',
    '.mncell.given{color:#1f5fa0}',
    '.mncell i{position:absolute;top:1px;left:2px;font:700 9px/1 var(--sans);color:#6c6055;font-style:normal}',
    '.mnclues{display:grid;grid-template-columns:1fr 1fr;gap:16px}',
    '@media(max-width:620px){.mnclues{grid-template-columns:1fr}}',
    '.mnclues h4{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3);margin-bottom:7px}',
    '.mnclue{display:flex;gap:8px;padding:5px 7px;border-radius:6px;font-size:13.5px;line-height:1.35;cursor:pointer}',
    '.mnclue b{color:var(--ember);font-family:var(--mono);font-size:12px;flex:0 0 auto}',
    '.mnclue.on{background:#241a13}',
    '.mnclue.got{color:var(--ink3)}',
    '.mnbar{display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap}'
  ].join(''));

  D.register({
    id: 'mini',
    name: 'Mini Crossword',
    blurb: 'A 4×4 where every line is a word.',
    tag: 'word',
    icon: D.icon('mini'),

    build: function (rnd) { return { idx: D.int(rnd, MINIS.length) }; },
    answerText: function (p) { return MINIS[p.idx].a.join(' / ').toUpperCase(); },

    mount: function (host, puzzle, api) {
      var g = MINIS[puzzle.idx];
      var sol = [];
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) sol.push(g.a[r][c]);
      var cur = sol.map(function () { return ''; });
      var given = sol.map(function () { return false; });
      var reveals = 0, over = false;
      var cr = 0, cc = 0, dir = 'a';           // cursor + direction

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint',
        'Every row and every column is a four-letter word. Click a square, type, and Tab flips between across and down.'));

      var layout = D.el('div', 'mnwrap');
      var gridBox = D.el('div');
      var grid = D.el('div', 'mngrid');
      var cells = [];
      for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
        var cell = D.el('div', 'mncell');
        if (c === 0) cell.appendChild(D.el('i', '', String(r + 1)));
        else if (r === 0) cell.appendChild(D.el('i', '', String(c + 1)));
        (function (rr, ccc, node) {
          node.addEventListener('click', function () {
            if (over) return;
            if (cr === rr && cc === ccc) dir = dir === 'a' ? 'd' : 'a';
            cr = rr; cc = ccc; paint();
          });
        })(r, c, cell);
        cells.push(cell); grid.appendChild(cell);
      }
      gridBox.appendChild(grid);

      var bar = D.el('div', 'mnbar');
      var bReveal = D.el('button', 'btn sm gho', 'Reveal this square');
      var bCheck = D.el('button', 'btn sm gho', 'Check');
      bar.appendChild(bReveal); bar.appendChild(bCheck);
      gridBox.appendChild(bar);
      var note = D.el('div', 'tiny dim');
      note.style.cssText = 'text-align:center;margin-top:10px';
      gridBox.appendChild(note);
      layout.appendChild(gridBox);

      var clues = D.el('div', 'mnclues');
      var acrossBox = D.el('div'), downBox = D.el('div');
      acrossBox.appendChild(D.el('h4', '', 'Across'));
      downBox.appendChild(D.el('h4', '', 'Down'));
      var clueNodes = { a: [], d: [] };
      ['a', 'd'].forEach(function (which) {
        var box = which === 'a' ? acrossBox : downBox;
        g[which].forEach(function (w, i) {
          var row = D.el('div', 'mnclue');
          row.appendChild(D.el('b', '', String(i + 1)));
          row.appendChild(D.el('span', '', D.esc(MINIWORDS[w] || '—')));
          row.addEventListener('click', function () {
            if (over) return;
            dir = which;
            if (which === 'a') { cr = i; cc = 0; } else { cr = 0; cc = i; }
            paint();
          });
          clueNodes[which].push(row); box.appendChild(row);
        });
      });
      clues.appendChild(acrossBox); clues.appendChild(downBox);
      layout.appendChild(clues);
      wrap.appendChild(layout);
      host.appendChild(wrap);

      var unbind = D.bindKeys(function (k) {
        if (over) return;
        if (k === 'BACK') {
          var i = cr * N + cc;
          if (cur[i] && !given[i]) { cur[i] = ''; }
          else step(-1);
          paint(); report(); return;
        }
        if (k === 'ENTER') { dir = dir === 'a' ? 'd' : 'a'; paint(); return; }
        if (!/^[A-Z]$/.test(k)) return;
        var idx = cr * N + cc;
        if (!given[idx]) cur[idx] = k.toLowerCase();
        step(1);
        paint(); report();
        if (complete()) finish(true);
      });
      // Tab flips direction; the arrow keys move the cursor.
      function nav(e) {
        if (over) return;
        var handled = true;
        if (e.key === 'Tab') { dir = dir === 'a' ? 'd' : 'a'; }
        else if (e.key === 'ArrowRight') { cc = Math.min(N - 1, cc + 1); dir = 'a'; }
        else if (e.key === 'ArrowLeft') { cc = Math.max(0, cc - 1); dir = 'a'; }
        else if (e.key === 'ArrowDown') { cr = Math.min(N - 1, cr + 1); dir = 'd'; }
        else if (e.key === 'ArrowUp') { cr = Math.max(0, cr - 1); dir = 'd'; }
        else handled = false;
        if (handled) { e.preventDefault(); paint(); }
      }
      document.addEventListener('keydown', nav);

      function step(d) {
        if (dir === 'a') cc = Math.max(0, Math.min(N - 1, cc + d));
        else cr = Math.max(0, Math.min(N - 1, cr + d));
      }
      function complete() { return cur.every(function (v, i) { return v === sol[i]; }); }
      function correctCount() { return cur.filter(function (v, i) { return v === sol[i]; }).length; }

      function paint() {
        cells.forEach(function (node, i) {
          var r = Math.floor(i / N), c = i % N;
          var inw = dir === 'a' ? r === cr : c === cc;
          node.className = 'mncell' + (i === cr * N + cc ? ' cur' : '') + (inw ? ' inword' : '') + (given[i] ? ' given' : '');
          var lab = node.querySelector('i');
          D.clear(node);
          if (lab) node.appendChild(lab);
          if (cur[i]) node.appendChild(document.createTextNode(cur[i]));
        });
        clueNodes.a.forEach(function (n, i) {
          n.classList.toggle('on', dir === 'a' && i === cr);
          n.classList.toggle('got', g.a[i].split('').every(function (ch, c) { return cur[i * N + c] === ch; }));
        });
        clueNodes.d.forEach(function (n, i) {
          n.classList.toggle('on', dir === 'd' && i === cc);
          n.classList.toggle('got', g.d[i].split('').every(function (ch, r) { return cur[r * N + i] === ch; }));
        });
        note.textContent = correctCount() + '/16 squares' + (reveals ? ' · ' + reveals + ' revealed' : '');
        bReveal.disabled = reveals >= MAXREVEAL;
      }
      function report() { api.progress(correctCount() / 16 * 100, correctCount() + '/16 squares'); }

      bReveal.addEventListener('click', function () {
        if (over || reveals >= MAXREVEAL) return;
        var i = cr * N + cc;
        if (cur[i] === sol[i]) { D.toast('That one is already right', 'bad'); return; }
        cur[i] = sol[i]; given[i] = true; reveals++;
        step(1); paint(); report();
        if (complete()) finish(true);
      });
      bCheck.addEventListener('click', function () {
        if (over) return;
        var wrong = cur.filter(function (v, i) { return v && v !== sol[i]; }).length;
        D.toast(wrong ? wrong + ' letter' + (wrong > 1 ? 's are' : ' is') + ' wrong' : 'Everything so far is right',
                wrong ? 'bad' : 'good');
      });

      function finish(solved) {
        if (over) return;
        over = true; unbind();
        document.removeEventListener('keydown', nav);
        bReveal.disabled = bCheck.disabled = true;
        var got = correctCount();               // count BEFORE filling the grid in
        if (!solved) { cur = sol.slice(); paint(); }
        note.textContent = solved ? 'Solved' + (reveals ? ' with ' + reveals + ' revealed' : '') : 'Answers shown';
        api.finish({ solved: solved, correct: got, total: 16, checks: reveals });
      }

      paint(); report();
      return {
        destroy: function () { unbind(); document.removeEventListener('keydown', nav); },
        giveUp: function () { if (!over) finish(false); }
      };
    }
  });
})(window.DLES);
