/* ═══ CODEBREAK ═════════════════════════════════════════════════════════
   Mastermind. Four slots, six colours, repeats allowed, eight guesses.
   Filled dot = right colour in the right place; hollow = right colour in
   the wrong place. The pegs are never in slot order — that is the game.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var SLOTS = 4, MAX = 8;
  var COLS = [
    { k: 'r', c: '#c1443c', n: 'red' },
    { k: 'o', c: '#d98431', n: 'amber' },
    { k: 'y', c: '#cbb03a', n: 'yellow' },
    { k: 'g', c: '#5fa663', n: 'green' },
    { k: 'b', c: '#4f87a8', n: 'blue' },
    { k: 'p', c: '#8a6bb0', n: 'purple' }
  ];

  D.css('codebreak', [
    '.cbrows{display:flex;flex-direction:column;gap:6px;align-items:center;margin-bottom:16px}',
    '.cbrow{display:flex;align-items:center;gap:12px;padding:6px 12px;border-radius:10px;background:#0f0b09;border:1px solid var(--line)}',
    '.cbrow.cur{border-color:var(--emberDim);background:#171010}',
    '.cbrow .no{font:700 11px/1 var(--mono);color:var(--ink3);width:14px}',
    '.cbpegs{display:flex;gap:6px}',
    '.cbpeg{width:32px;height:32px;border-radius:50%;border:2px solid rgba(0,0,0,.45);',
    '  box-shadow:inset 0 -3px 6px rgba(0,0,0,.35),0 1px 0 rgba(255,255,255,.08)}',
    '.cbpeg.empty{background:#1c1512;border:2px dashed #3a2c25;box-shadow:none}',
    '.cbmarks{display:grid;grid-template-columns:1fr 1fr;gap:3px;width:26px}',
    '.cbmark{width:10px;height:10px;border-radius:50%;background:#241a16}',
    '.cbmark.exact{background:var(--ink);box-shadow:0 0 0 1px #000}',
    '.cbmark.near{background:transparent;border:2px solid var(--ink2)}',
    '.cbpick{display:flex;gap:8px;justify-content:center;margin-bottom:12px;flex-wrap:wrap}',
    '.cbswatch{width:44px;height:44px;border-radius:50%;border:2px solid rgba(0,0,0,.45);cursor:pointer;',
    '  box-shadow:inset 0 -4px 8px rgba(0,0,0,.35);transition:transform .08s}',
    '.cbswatch:hover{transform:scale(1.08)}',
    '.cbbar{display:flex;gap:8px;justify-content:center}'
  ].join(''));

  /* Exact = right colour right slot; near = right colour wrong slot, with
     each peg in the answer counted at most once. */
  function judge(guess, answer) {
    var exact = 0, near = 0, pool = {}, left = [];
    var i;
    for (i = 0; i < SLOTS; i++) {
      if (guess[i] === answer[i]) exact++;
      else { pool[answer[i]] = (pool[answer[i]] || 0) + 1; left.push(guess[i]); }
    }
    for (i = 0; i < left.length; i++) {
      if (pool[left[i]] > 0) { near++; pool[left[i]]--; }
    }
    return { exact: exact, near: near };
  }
  D._codebreak = { judge: judge };

  D.register({
    id: 'codebreak',
    name: 'Codebreak',
    blurb: 'Crack the four-colour code in eight guesses.',
    tag: 'logic',
    icon: D.icon('codebreak'),

    build: function (rnd) {
      var code = [];
      for (var i = 0; i < SLOTS; i++) code.push(D.pick(rnd, COLS).k);
      return { code: code.join('') };
    },
    answerText: function (p) {
      return p.code.split('').map(function (k) {
        return COLS.filter(function (c) { return c.k === k; })[0].n;
      }).join(' · ');
    },

    mount: function (host, puzzle, api) {
      var answer = puzzle.code, rows = [], cur = [], over = false;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint',
        'A filled dot means a colour is in the right place. A hollow one means right colour, wrong place. ' +
        'The dots are not in slot order.'));

      var rowBox = D.el('div', 'cbrows');
      wrap.appendChild(rowBox);
      var pickBox = D.el('div', 'cbpick');
      COLS.forEach(function (c) {
        var s = D.el('button', 'cbswatch');
        s.style.background = c.c;
        s.title = c.n;
        s.addEventListener('click', function () { add(c.k); });
        pickBox.appendChild(s);
      });
      wrap.appendChild(pickBox);
      var bar = D.el('div', 'cbbar');
      var bDel = D.el('button', 'btn sm gho', 'Delete');
      var bGo = D.el('button', 'btn sm pri', 'Submit');
      bar.appendChild(bDel); bar.appendChild(bGo);
      wrap.appendChild(bar);
      var note = D.el('div', 'tiny dim');
      note.style.cssText = 'text-align:center;margin-top:10px';
      wrap.appendChild(note);
      host.appendChild(wrap);

      var unbind = D.bindKeys(function (k) {
        if (k === 'ENTER') return submit();
        if (k === 'BACK') { cur.pop(); draw(); return; }
        var n = '123456'.indexOf(k);
        if (n >= 0) add(COLS[n].k);
      }, '123456');

      function colOf(k) { return COLS.filter(function (c) { return c.k === k; })[0]; }

      function add(k) {
        if (over || cur.length >= SLOTS) return;
        cur.push(k); draw();
      }

      function pegRow(keys, marks, cls) {
        var row = D.el('div', 'cbrow' + (cls ? ' ' + cls : ''));
        row.appendChild(D.el('div', 'no', String(rows.length + (cls === 'cur' ? 1 : 0))));
        var pegs = D.el('div', 'cbpegs');
        for (var i = 0; i < SLOTS; i++) {
          var p = D.el('div', 'cbpeg' + (keys[i] ? '' : ' empty'));
          if (keys[i]) p.style.background = colOf(keys[i]).c;
          pegs.appendChild(p);
        }
        row.appendChild(pegs);
        var mk = D.el('div', 'cbmarks');
        if (marks) {
          for (var j = 0; j < SLOTS; j++) {
            mk.appendChild(D.el('div', 'cbmark' + (j < marks.exact ? ' exact'
              : j < marks.exact + marks.near ? ' near' : '')));
          }
        }
        row.appendChild(mk);
        return row;
      }

      function draw() {
        D.clear(rowBox);
        rows.forEach(function (r, i) {
          var row = pegRow(r.keys, r.marks);
          row.firstChild.textContent = String(i + 1);
          rowBox.appendChild(row);
        });
        if (!over && rows.length < MAX) {
          var live = pegRow(cur, null, 'cur');
          live.firstChild.textContent = String(rows.length + 1);
          rowBox.appendChild(live);
        }
        bGo.disabled = over || cur.length !== SLOTS;
        note.textContent = over ? '' : (MAX - rows.length) + ' guesses left';
      }

      function submit() {
        if (over || cur.length !== SLOTS) return;
        var g = cur.join('');
        var m = judge(g, answer);
        rows.push({ keys: cur.slice(), marks: m });
        cur = []; draw();
        if (m.exact === SLOTS) return finish(true);
        if (rows.length >= MAX) return finish(false);
        api.progress(rows.length / MAX * 100, rows.length + '/' + MAX + ' · ' + m.exact + ' exact');
      }

      bDel.addEventListener('click', function () { cur.pop(); draw(); });
      bGo.addEventListener('click', submit);

      function finish(solved) {
        over = true; unbind();
        bGo.disabled = bDel.disabled = true;
        if (!solved) {
          rows.push({ keys: answer.split(''), marks: { exact: SLOTS, near: 0 } });
        }
        draw();
        note.textContent = solved ? 'Cracked in ' + rows.length : 'The code is on the last row';
        api.finish({ solved: solved, guesses: solved ? rows.length : MAX });
      }

      draw();
      api.progress(0, '0/' + MAX);
      return { destroy: unbind, giveUp: function () { if (!over) finish(false); } };
    }
  });
})(window.DLES);
