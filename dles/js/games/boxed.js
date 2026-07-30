/* ═══ LETTER BOXED ══════════════════════════════════════════════════════
   Twelve letters, three to a side. Words never take two letters in a row
   from the same side, each word starts on the last letter of the one before,
   and every letter has to be used. Fewer words is better.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var MAXW = 12;

  D.css('boxed', [
    '.bxbox{position:relative;width:min(320px,80vw);aspect-ratio:1;margin:8px auto 6px}',
    '.bxsq{position:absolute;inset:16%;border:2px solid var(--line2);border-radius:6px;background:#0d0908}',
    '.bxl{position:absolute;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;',
    '  display:grid;place-items:center;font:800 17px/1 var(--sans);text-transform:uppercase;',
    '  background:#2f251f;color:var(--ink);cursor:pointer;border:2px solid transparent;transition:.12s}',
    '.bxl:hover{background:#3d2f27}',
    '.bxl.used{background:var(--goodDim);border-color:var(--good);color:#cfe9cf}',
    '.bxl.cur{border-color:var(--ember);background:var(--ember);color:#1a0f06}',
    '.bxl.dead{opacity:.35;cursor:not-allowed}',
    '.bxline{position:absolute;inset:0;pointer-events:none}',
    '.bxword{text-align:center;font:800 24px/1.2 var(--sans);letter-spacing:.06em;text-transform:uppercase;min-height:30px;margin:10px 0}',
    '.bxlist{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:12px}',
    '.bxlist span{padding:4px 11px;border-radius:99px;background:var(--goodDim);border:1px solid var(--good);',
    '  font-size:13px;text-transform:uppercase;font-weight:600;letter-spacing:.04em}',
    '.bxbar{display:flex;gap:8px;justify-content:center;margin-top:10px}'
  ].join(''));

  /* Side index of a letter, or -1. */
  function sideOf(sides, ch) {
    for (var i = 0; i < 4; i++) if (sides[i].indexOf(ch) >= 0) return i;
    return -1;
  }

  /* Positions round the square: 3 letters per side, in viewBox units 0..100 */
  function layout() {
    var pts = [], i;
    for (i = 0; i < 3; i++) pts.push({ x: 25 + i * 25, y: 14 });     // top
    for (i = 0; i < 3; i++) pts.push({ x: 86, y: 25 + i * 25 });     // right
    for (i = 2; i >= 0; i--) pts.push({ x: 25 + i * 25, y: 86 });    // bottom
    for (i = 2; i >= 0; i--) pts.push({ x: 14, y: 25 + i * 25 });    // left
    return pts;
  }

  D.register({
    id: 'boxed',
    name: 'Letter Boxed',
    blurb: 'Use all twelve letters in as few words as you can.',
    tag: 'word',
    icon: D.icon('boxed'),

    build: function (rnd) {
      var b = D.pick(rnd, BOXES);
      return { sides: b.s.slice(), sol: b.sol.slice() };
    },
    answerText: function (p) {
      return 'Two words will do it — e.g. ' + p.sol.join(' → ').toUpperCase();
    },

    mount: function (host, puzzle, api) {
      var sides = puzzle.sides;
      var letters = [];
      sides.forEach(function (s) { s.split('').forEach(function (c) { letters.push(c); }); });
      var pts = layout();
      var cur = '', words = [], used = {}, over = false;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint',
        'Build words of three letters or more. You may never take two letters in a row from the same side, ' +
        'and each new word must start on the last letter of the one before. Use all twelve to win.'));

      var box = D.el('div', 'bxbox');
      var sq = D.el('div', 'bxsq');
      box.appendChild(sq);
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('class', 'bxline');
      box.appendChild(svg);
      var nodes = letters.map(function (ch, i) {
        var n = D.el('div', 'bxl', ch.toUpperCase());
        n.style.left = pts[i].x + '%';
        n.style.top = pts[i].y + '%';
        n.addEventListener('click', function () { type(ch); });
        box.appendChild(n);
        return n;
      });
      wrap.appendChild(box);

      var wordLine = D.el('div', 'bxword');
      wrap.appendChild(wordLine);

      var bar = D.el('div', 'bxbar');
      var bDel = D.el('button', 'btn sm gho', 'Delete');
      var bGo = D.el('button', 'btn sm pri', 'Enter word');
      bar.appendChild(bDel); bar.appendChild(bGo);
      wrap.appendChild(bar);

      var note = D.el('div', 'tiny dim');
      note.style.cssText = 'text-align:center;margin-top:10px';
      wrap.appendChild(note);
      var list = D.el('div', 'bxlist');
      wrap.appendChild(list);
      host.appendChild(wrap);

      var unbind = D.bindKeys(function (k) {
        if (k === 'ENTER') return submit();
        if (k === 'BACK') { cur = cur.slice(0, -1); paint(); return; }
        type(k.toLowerCase());
      });

      function lastLetter() {
        if (cur) return cur[cur.length - 1];
        if (words.length) return words[words.length - 1].slice(-1);
        return null;
      }

      function legal(ch) {
        if (sideOf(sides, ch) < 0) return false;
        var prev = lastLetter();
        if (!prev) return true;
        if (!cur) return ch === prev;                  // must continue from the last word
        return sideOf(sides, ch) !== sideOf(sides, prev);
      }

      function type(ch) {
        if (over) return;
        if (!legal(ch)) {
          var prev = lastLetter();
          D.toast(!cur && prev ? 'Start on ' + prev.toUpperCase()
                               : 'Not from the same side', 'bad');
          return;
        }
        cur += ch;
        paint();
      }

      function submit() {
        if (over || !cur) return;
        var w = cur;
        if (w.length < 3) { D.toast('Three letters minimum', 'bad'); return; }
        if (!WORDS.COMMONSET.has(w)) { D.toast('Not in the word list', 'bad'); return; }
        words.push(w);
        w.split('').forEach(function (c) { used[c] = 1; });
        cur = w.slice(-1);                              // next word starts here
        paint();
        var n = Object.keys(used).length;
        api.progress(Math.min(96, n / 12 * 100), n + '/12 letters · ' + words.length + ' words');
        if (n === 12) return finish(true);
        if (words.length >= MAXW) return finish(false);
      }

      bDel.addEventListener('click', function () { cur = cur.slice(0, -1); paint(); });
      bGo.addEventListener('click', submit);

      function paint() {
        wordLine.textContent = cur || '·';
        D.clear(list);
        words.forEach(function (w) { list.appendChild(D.el('span', '', w)); });
        var curSet = {};
        cur.split('').forEach(function (c) { curSet[c] = 1; });
        nodes.forEach(function (n, i) {
          var ch = letters[i];
          n.className = 'bxl' + (used[ch] || curSet[ch] ? ' used' : '') +
                        (cur && ch === cur[cur.length - 1] ? ' cur' : '') +
                        (!over && cur && !legal(ch) && ch !== cur[cur.length - 1] ? ' dead' : '');
        });
        D.clear(svg);
        // A bar along each edge, so which three letters share a side — the
        // one rule that matters — is readable at a glance.
        [[20, 14, 80, 14], [86, 20, 86, 80], [80, 86, 20, 86], [14, 80, 14, 20]].forEach(function (e) {
          var bar = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          bar.setAttribute('x1', e[0]); bar.setAttribute('y1', e[1]);
          bar.setAttribute('x2', e[2]); bar.setAttribute('y2', e[3]);
          bar.setAttribute('stroke', '#452f26'); bar.setAttribute('stroke-width', '5');
          bar.setAttribute('stroke-linecap', 'round');
          svg.appendChild(bar);
        });
        // trace the word being built
        for (var i = 1; i < cur.length; i++) {
          var a = letters.indexOf(cur[i - 1]), b = letters.indexOf(cur[i]);
          if (a < 0 || b < 0) continue;
          var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          ln.setAttribute('x1', pts[a].x); ln.setAttribute('y1', pts[a].y);
          ln.setAttribute('x2', pts[b].x); ln.setAttribute('y2', pts[b].y);
          ln.setAttribute('stroke', '#e0873a'); ln.setAttribute('stroke-width', '0.9');
          ln.setAttribute('opacity', '0.8');
          svg.appendChild(ln);
        }
        note.textContent = over ? '' :
          Object.keys(used).length + '/12 letters used · ' + words.length + ' word' +
          (words.length === 1 ? '' : 's');
      }

      function finish(solved) {
        over = true; unbind();
        bGo.disabled = bDel.disabled = true;
        paint();
        note.textContent = solved ? 'All twelve in ' + words.length + ' words' : 'Not all twelve letters used';
        api.finish({ solved: solved, words: words.length, used: Object.keys(used).length });
      }

      paint();
      api.progress(0, '0/12 letters');
      return { destroy: unbind, giveUp: function () { if (!over) finish(false); } };
    }
  });
})(window.DLES);
