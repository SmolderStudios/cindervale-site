/* ═══ NERDLE ════════════════════════════════════════════════════════════
   Wordle for arithmetic. Eight characters, six guesses, and every guess has
   to be an equation that actually balances.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var LEN = 8, MAX = 6;
  var OPS = ['+', '-', '*', '/'];

  D.css('nerdle', [
    '.nkb .key{min-width:44px;font-size:17px;font-family:var(--mono)}',
    '.nkb .key.op{background:#2c3b44}.nkb .key.op:hover{background:#3a4d58}',
    '.nwrap .tile{font-family:var(--mono);width:48px;height:52px;font-size:22px}',
    '@media(max-width:560px){.nwrap .tile{width:34px;height:40px;font-size:16px}.nkb .key{min-width:32px;height:44px;font-size:15px}}'
  ].join(''));

  /* ── equation engine ───────────────────────────────────────────────── */
  /* Exact integer arithmetic; any inexact division makes the expression
     invalid rather than silently producing a float. */
  function evalExpr(s) {
    var toks = s.match(/\d+|[+\-*/]/g);
    if (!toks || !toks.length) return null;
    var i, a = [], b = [];                    // terms and the +/- between them
    // pass 1: * and /
    var cur = null;
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (/^\d+$/.test(t)) {
        if (cur === null) cur = { v: parseInt(t, 10) };
        else if (cur.op === '*') cur.v *= parseInt(t, 10);
        else if (cur.op === '/') {
          var d = parseInt(t, 10);
          if (d === 0 || cur.v % d !== 0) return null;
          cur.v /= d;
        } else return null;
        cur.op = null;
      } else if (t === '*' || t === '/') {
        if (!cur || cur.op) return null;
        cur.op = t;
      } else {
        if (!cur || cur.op) return null;
        a.push(cur.v); b.push(t); cur = null;
      }
    }
    if (!cur || cur.op) return null;
    a.push(cur.v);
    var out = a[0];
    for (i = 0; i < b.length; i++) out = b[i] === '+' ? out + a[i + 1] : out - a[i + 1];
    return out;
  }

  function validEquation(s) {
    if (s.length !== LEN) return false;
    if (!/^[0-9+\-*/=]+$/.test(s)) return false;
    var parts = s.split('=');
    if (parts.length !== 2) return false;
    var L = parts[0], R = parts[1];
    if (!L || !R) return false;
    if (!/^\d+$/.test(R)) return false;                     // right side is a bare number
    if (/[+\-*/]{2}/.test(L)) return false;                 // no doubled operators
    if (/^[+*/]/.test(L) || /[+\-*/]$/.test(L)) return false;
    var nums = (L + '+' + R).match(/\d+/g) || [];
    for (var i = 0; i < nums.length; i++) if (nums[i].length > 1 && nums[i][0] === '0') return false;
    var v = evalExpr(L);
    return v !== null && v === parseInt(R, 10);
  }
  // exposed for the test harness
  D._nerdle = { evalExpr: evalExpr, valid: validEquation };

  /* Deterministic search for an 8-char equation with the given RNG. */
  function makeEquation(rnd) {
    for (var tries = 0; tries < 4000; tries++) {
      var three = rnd() < 0.34;
      var nums = [], ops = [];
      var count = three ? 3 : 2;
      for (var i = 0; i < count; i++) {
        var digits = 1 + D.int(rnd, three ? 2 : 3);
        var lo = digits === 1 ? 1 : Math.pow(10, digits - 1);
        nums.push(lo + D.int(rnd, Math.pow(10, digits) - lo));
      }
      for (i = 0; i < count - 1; i++) ops.push(D.pick(rnd, OPS));
      var lhs = String(nums[0]);
      for (i = 0; i < ops.length; i++) lhs += ops[i] + nums[i + 1];
      var v = evalExpr(lhs);
      if (v === null || v < 0) continue;
      var eq = lhs + '=' + v;
      if (eq.length !== LEN) continue;
      if (!validEquation(eq)) continue;
      // Reject the dullest possible puzzles (a+0, x*1 …)
      if (/(^|[+\-*/])(0|1)([+\-*/=]|$)/.test(lhs) && rnd() < 0.7) continue;
      return eq;
    }
    return '12+34=46';                              // never reached in practice
  }

  D.register({
    id: 'nerdle',
    name: 'Nerdle',
    blurb: 'Eight characters. Guess the equation.',
    tag: 'logic',
    icon: D.icon('nerdle'),

    build: function (rnd) { return { answer: makeEquation(rnd) }; },
    answerText: function (p) { return p.answer; },

    mount: function (host, puzzle, api) {
      var answer = puzzle.answer, row = 0, cur = '', over = false;

      var wrap = D.el('div', 'gpanel nwrap');
      wrap.appendChild(D.el('div', 'ghint',
        'Find the hidden equation. Every guess must be an equation that works — order of operations applies.'));
      var grid = D.letterGrid(MAX, LEN, 48);
      wrap.appendChild(grid.node);

      var kb = D.keyboard(['1234567890', ['+', '-', '*', '/', '=']], key);
      kb.node.classList.add('nkb');
      ['+', '-', '*', '/', '='].forEach(function (o) { if (kb.keys[o]) kb.keys[o].classList.add('op'); });
      wrap.appendChild(kb.node);
      host.appendChild(wrap);
      var unbind = D.bindKeys(key, '0123456789+-*/=');

      function draw() { for (var c = 0; c < LEN; c++) grid.set(row, c, cur[c] || ''); }

      function key(k) {
        if (over) return;
        if (k === 'BACK') { cur = cur.slice(0, -1); draw(); return; }
        if (k === 'ENTER') { submit(); return; }
        if ('0123456789+-*/='.indexOf(k) < 0 || cur.length >= LEN) return;
        cur += k; draw();
      }

      function submit() {
        if (cur.length < LEN) { grid.shake(row); return; }
        if (!validEquation(cur)) {
          grid.shake(row);
          D.toast(cur.indexOf('=') < 0 ? 'Needs an = sign' : "That equation doesn't balance", 'bad');
          return;
        }
        var marks = D.markGuess(cur, answer), letters = cur.split('');
        over = true;
        D.revealRow(grid, row, letters, marks, function () {
          letters.forEach(function (ch, i) { kb.mark(ch, marks[i]); });
          var won = cur === answer;
          row++; cur = '';
          if (won) { grid.win(row - 1); return finish(true); }
          if (row >= MAX) return finish(false);
          over = false;
          api.progress(row / MAX * 100, row + '/' + MAX + ' guesses');
        });
      }

      function finish(solved) {
        over = true; unbind();
        api.finish({ solved: solved, guesses: row });
      }

      api.progress(0, 'thinking…');
      return { destroy: unbind, giveUp: function () { finish(false); } };
    }
  });
})(window.DLES);
