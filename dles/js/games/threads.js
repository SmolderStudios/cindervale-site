/* ═══ THREADS ═══════════════════════════════════════════════════════════
   A themed word search. Four words from one category are hidden in the grid
   in straight lines — any of eight directions. Click the first and last
   letter of a word to claim it.

   The grid is built from the seeded RNG so both players hunt the identical
   board; the Connections category data is reused as the theme source.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var SIZE = 9;
  var DIRS = [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]];
  var ALPHA = 'AAABCDEEEFGHIIJKLMNNOOPQRSSTTUUVWXYZ';

  D.css('threads', [
    '.thgrid{display:grid;gap:3px;width:min(430px,90vw);margin:0 auto}',
    '.thc{aspect-ratio:1;display:grid;place-items:center;border-radius:5px;background:#241a16;',
    '  font:700 clamp(12px,3vw,17px)/1 var(--sans);color:var(--ink);cursor:pointer;',
    '  border:2px solid transparent;transition:background .1s}',
    '.thc:hover{background:#33251f}',
    '.thc.pick{border-color:var(--ember);background:#3a2a19}',
    '.thc.hit{background:var(--good);color:#0b1a0c}',
    '.thc.hint{background:#3b4a52;color:#dfeaf2}',
    '.ththeme{text-align:center;margin-bottom:12px}',
    '.ththeme b{display:block;font:800 19px/1.2 var(--sans);letter-spacing:.02em}',
    '.ththeme span{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3)}',
    '.thfound{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:14px}',
    '.thfound span{padding:5px 12px;border-radius:99px;font-size:13px;font-weight:600;letter-spacing:.03em;',
    '  background:#0f0b09;border:1px solid var(--line);color:var(--ink3)}',
    '.thfound span.got{background:var(--goodDim);border-color:var(--good);color:var(--ink)}'
  ].join(''));

  function place(rnd, words) {
    for (var attempt = 0; attempt < 300; attempt++) {
      var grid = [];
      for (var r = 0; r < SIZE; r++) grid.push(new Array(SIZE).fill(''));
      var spots = {}, ok = true;
      for (var w = 0; w < words.length && ok; w++) {
        var word = words[w], placed = false;
        var tries = D.shuffle(rnd, allStarts());
        for (var t = 0; t < tries.length && !placed; t++) {
          var s = tries[t];
          var cells = fit(grid, word, s.r, s.c, s.d);
          if (!cells) continue;
          cells.forEach(function (p, i) { grid[p[0]][p[1]] = word[i]; });
          spots[word] = cells;
          placed = true;
        }
        if (!placed) ok = false;
      }
      if (!ok) continue;
      for (var a = 0; a < SIZE; a++) for (var b = 0; b < SIZE; b++) {
        if (!grid[a][b]) grid[a][b] = ALPHA[D.int(rnd, ALPHA.length)];
      }
      return { grid: grid, spots: spots };
    }
    return null;
  }

  function allStarts() {
    var out = [];
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++)
      for (var d = 0; d < DIRS.length; d++) out.push({ r: r, c: c, d: d });
    return out;
  }

  /* Cells for `word` from (r,c) in direction d, or null if it runs off the
     board or clashes with a different letter already there. */
  function fit(grid, word, r, c, d) {
    var dr = DIRS[d][0], dc = DIRS[d][1], cells = [];
    for (var i = 0; i < word.length; i++) {
      var rr = r + dr * i, cc = c + dc * i;
      if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE) return null;
      var have = grid[rr][cc];
      if (have && have !== word[i]) return null;
      cells.push([rr, cc]);
    }
    return cells;
  }

  D.register({
    id: 'threads',
    name: 'Threads',
    blurb: 'Find four themed words hidden in the grid.',
    tag: 'word',
    icon: D.icon('threads'),

    build: function (rnd) {
      // Only categories whose words all fit the grid and are plain letters.
      var groups = [];
      CONNECTIONS.forEach(function (p) {
        p.c.forEach(function (g) {
          if (g[1].every(function (w) { return /^[A-Z]{4,8}$/.test(w); })) {
            groups.push({ theme: g[0], words: g[1] });
          }
        });
      });
      // Longest word first — it is the one most likely not to fit.
      for (var t = 0; t < 60; t++) {
        var g = D.pick(rnd, groups);
        var laid = place(rnd, g.words.slice().sort(function (a, b) { return b.length - a.length; }));
        if (laid) return { theme: g.theme, words: g.words, grid: laid.grid };
      }
      // Should never happen with a 9×9 and words of 4–8, but a puzzle that
      // cannot be dealt would break the round for both players.
      var fb = groups[0];
      var laid2 = place(D.rng('threads-fallback'), fb.words);
      return { theme: fb.theme, words: fb.words, grid: laid2.grid };
    },
    answerText: function (p) { return p.theme + ' — ' + p.words.join(', '); },

    mount: function (host, puzzle, api) {
      var grid = puzzle.grid, want = puzzle.words.slice();
      var found = [], wrong = 0, over = false, pickA = null;
      var hitCells = {};

      var wrap = D.el('div', 'gpanel');
      var head = D.el('div', 'ththeme');
      head.innerHTML = '<span>theme</span><b>' + D.esc(puzzle.theme) + '</b>';
      wrap.appendChild(head);
      wrap.appendChild(D.el('div', 'ghint',
        'Four words are hidden in straight lines — across, down or diagonally, forwards or backwards. ' +
        'Click the first letter, then the last.'));

      var g = D.el('div', 'thgrid');
      g.style.gridTemplateColumns = 'repeat(' + SIZE + ',1fr)';
      var cells = [];
      for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
        var n = D.el('div', 'thc', grid[r][c]);
        (function (rr, cc, node) {
          node.addEventListener('click', function () { tap(rr, cc); });
        })(r, c, n);
        cells.push(n); g.appendChild(n);
      }
      wrap.appendChild(g);
      var list = D.el('div', 'thfound');
      wrap.appendChild(list);
      var note = D.el('div', 'tiny dim');
      note.style.cssText = 'text-align:center;margin-top:10px';
      wrap.appendChild(note);
      host.appendChild(wrap);

      function at(r, c) { return cells[r * SIZE + c]; }

      function paint() {
        cells.forEach(function (n, i) {
          var key = Math.floor(i / SIZE) + ',' + (i % SIZE);
          n.className = 'thc' + (hitCells[key] ? ' hit' : '');
        });
        if (pickA) at(pickA[0], pickA[1]).classList.add('pick');
        D.clear(list);
        want.forEach(function (w) {
          list.appendChild(D.el('span', found.indexOf(w) >= 0 ? 'got' : '',
            found.indexOf(w) >= 0 ? w : '•'.repeat(w.length)));
        });
        note.textContent = over ? '' : found.length + '/' + want.length + ' found' +
          (wrong ? ' · ' + wrong + ' misses' : '');
      }

      /* Read the straight line between two cells, if they form one. */
      function lineBetween(a, b) {
        // Callers include the reveal pass, which probes off-board endpoints.
        if (a[0] < 0 || a[1] < 0 || a[0] >= SIZE || a[1] >= SIZE) return null;
        if (b[0] < 0 || b[1] < 0 || b[0] >= SIZE || b[1] >= SIZE) return null;
        var dr = b[0] - a[0], dc = b[1] - a[1];
        var len = Math.max(Math.abs(dr), Math.abs(dc));
        if (!len) return null;
        if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
        var sr = dr === 0 ? 0 : dr / Math.abs(dr);
        var sc = dc === 0 ? 0 : dc / Math.abs(dc);
        var out = [], word = '';
        for (var i = 0; i <= len; i++) {
          var rr = a[0] + sr * i, cc = a[1] + sc * i;
          out.push([rr, cc]); word += grid[rr][cc];
        }
        return { cells: out, word: word };
      }

      function tap(r, c) {
        if (over) return;
        if (!pickA) { pickA = [r, c]; paint(); return; }
        if (pickA[0] === r && pickA[1] === c) { pickA = null; paint(); return; }
        var line = lineBetween(pickA, [r, c]);
        pickA = null;
        if (!line) { D.toast('Not a straight line', 'bad'); paint(); return; }
        var hit = want.indexOf(line.word) >= 0 ? line.word : null;
        if (!hit) {
          var rev = line.word.split('').reverse().join('');
          if (want.indexOf(rev) >= 0) hit = rev;
        }
        if (!hit || found.indexOf(hit) >= 0) {
          if (hit) { D.toast('Already found', 'bad'); }
          else { wrong++; D.toast('Not one of them', 'bad'); }
          paint();
          return;
        }
        found.push(hit);
        line.cells.forEach(function (p) { hitCells[p[0] + ',' + p[1]] = 1; });
        paint();
        api.progress(found.length / want.length * 100, found.length + '/' + want.length + ' words');
        if (found.length === want.length) finish();
      }

      function finish() {
        if (over) return;
        over = true;
        // show whatever is left
        want.forEach(function (w) {
          if (found.indexOf(w) >= 0) return;
          for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
            for (var d = 0; d < DIRS.length; d++) {
              var line = lineBetween([r, c], [r + DIRS[d][0] * (w.length - 1), c + DIRS[d][1] * (w.length - 1)]);
              if (line && line.word === w) {
                line.cells.forEach(function (p) { at(p[0], p[1]).classList.add('hint'); });
                return;
              }
            }
          }
        });
        note.textContent = found.length + ' of ' + want.length + ' found';
        api.finish({ found: found.length, total: want.length, wrong: wrong });
      }

      paint();
      api.progress(0, '0/' + want.length + ' words');
      return { giveUp: finish };
    }
  });
})(window.DLES);
