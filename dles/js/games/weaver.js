/* ═══ WEAVER ════════════════════════════════════════════════════════════
   Turn one four-letter word into another, changing a single letter at a
   time, and every rung has to be a real word. Par is the shortest ladder
   that exists, so hitting par is genuinely optimal play.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var MAX_STEPS = 14;
  var POOL = null;   // built on first mount from the shipped rung list

  D.css('weaver', [
    '.wvrungs{display:flex;flex-direction:column;align-items:center;gap:5px;margin:8px 0 4px}',
    '.wvrung{display:flex;gap:5px}',
    '.wvc{width:44px;height:48px;display:grid;place-items:center;border-radius:6px;',
    '  font:800 22px/1 var(--sans);text-transform:uppercase;background:#2a201c;color:var(--ink)}',
    '.wvrung.end .wvc{background:var(--good);color:#0b1a0c}',
    '.wvrung.start .wvc{background:#3b4a52;color:#dfeaf2}',
    '.wvrung.changed .wvc.hit{background:var(--ember);color:#1a0f06}',
    '.wvrung.typing .wvc{background:#0d0908;border:2px solid var(--line2)}',
    '.wvrung.typing .wvc.f{border-color:#61463a}',
    '.wvgap{color:var(--ink3);font-size:13px;line-height:1}',
    '@media(max-width:480px){.wvc{width:34px;height:38px;font-size:17px}}'
  ].join(''));

  D.register({
    id: 'weaver',
    name: 'Weaver',
    blurb: 'One letter at a time, word to word.',
    tag: 'word',
    icon: D.icon('weaver'),

    build: function (rnd) {
      var p = D.pick(rnd, WEAVERS);
      return { from: p.a, to: p.b, par: p.par };
    },
    answerText: function (p) {
      return p.from.toUpperCase() + ' → ' + p.to.toUpperCase() + ' in ' + p.par + ' steps';
    },

    mount: function (host, puzzle, api) {
      var chain = [puzzle.from], cur = '', over = false;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint',
        'Change exactly one letter each step, and every step must be a common four-letter word. ' +
        'It can be done in ' + puzzle.par + '.'));

      var rungs = D.el('div', 'wvrungs');
      wrap.appendChild(rungs);
      var note = D.el('div', 'tiny dim');
      note.style.cssText = 'text-align:center;margin:8px 0 2px';
      wrap.appendChild(note);

      var kb = D.keyboard(D.QWERTY, key);
      wrap.appendChild(kb.node);
      var back = D.el('button', 'btn sm gho', 'Undo step');
      back.style.cssText = 'display:block;margin:12px auto 0';
      back.addEventListener('click', function () {
        if (over || chain.length < 2) return;
        chain.pop(); cur = ''; draw();
      });
      wrap.appendChild(back);
      host.appendChild(wrap);
      var unbind = D.bindKeys(key);

      function rung(word, cls, prev) {
        var r = D.el('div', 'wvrung ' + cls);
        word.split('').forEach(function (ch, i) {
          var c = D.el('div', 'wvc' + (prev && prev[i] !== ch ? ' hit' : ''), ch);
          r.appendChild(c);
        });
        return r;
      }

      function draw() {
        D.clear(rungs);
        chain.forEach(function (w, i) {
          rungs.appendChild(rung(w, i === 0 ? 'start' : 'changed', i ? chain[i - 1] : null));
          if (i < chain.length - 1) rungs.appendChild(D.el('div', 'wvgap', '↓'));
        });
        if (!over) {
          rungs.appendChild(D.el('div', 'wvgap', '↓'));
          var t = D.el('div', 'wvrung typing');
          for (var i = 0; i < 4; i++) {
            t.appendChild(D.el('div', 'wvc' + (cur[i] ? ' f' : ''), cur[i] || ''));
          }
          rungs.appendChild(t);
        }
        rungs.appendChild(D.el('div', 'wvgap', over ? '' : '⋮'));
        rungs.appendChild(rung(puzzle.to, 'end'));
        note.textContent = over ? '' :
          (chain.length - 1) + ' step' + (chain.length === 2 ? '' : 's') + ' so far · par ' + puzzle.par;
        back.disabled = over || chain.length < 2;
      }

      function key(k) {
        if (over) return;
        if (k === 'BACK') { cur = cur.slice(0, -1); draw(); return; }
        if (k === 'ENTER') { submit(); return; }
        if (!/^[A-Z]$/.test(k) || cur.length >= 4) return;
        cur += k; draw();
      }

      function diff(a, b) {
        var d = 0;
        for (var i = 0; i < 4; i++) if (a[i] !== b[i]) d++;
        return d;
      }

      function submit() {
        if (cur.length < 4) return;
        var w = cur.toLowerCase(), last = chain[chain.length - 1];
        if (!POOL) POOL = new Set(WEAVER_POOL);
        if (!POOL.has(w)) {
          D.toast(WORDS.VALID4SET.has(w) ? 'Too obscure for this ladder' : 'Not a word', 'bad');
          return;
        }
        var d = diff(w, last);
        if (d === 0) { D.toast('That is where you already are', 'bad'); return; }
        if (d !== 1) { D.toast('Change exactly one letter', 'bad'); return; }
        if (chain.indexOf(w) >= 0) { D.toast('Already used that rung', 'bad'); return; }
        chain.push(w); cur = ''; draw();
        api.progress(Math.min(96, (chain.length - 1) / (puzzle.par + 2) * 100),
                     (chain.length - 1) + ' steps');
        if (w === puzzle.to) return finish(true);
        if (chain.length - 1 >= MAX_STEPS) return finish(false);
      }

      function finish(solved) {
        over = true; unbind();
        draw();
        note.textContent = solved
          ? 'Done in ' + (chain.length - 1) + (chain.length - 1 === puzzle.par ? ' — par' : '')
          : 'Gave up at ' + (chain.length - 1) + ' steps';
        api.finish({ solved: solved, steps: chain.length - 1, par: puzzle.par,
                     best: chain.length - 1 });
      }

      draw();
      api.progress(0, '0 steps');
      return { destroy: unbind, giveUp: function () { if (!over) finish(false); } };
    }
  });
})(window.DLES);
