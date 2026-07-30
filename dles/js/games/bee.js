/* ═══ SPELLING BEE ══════════════════════════════════════════════════════
   Seven letters, one of them compulsory, and a hard clock. The only game
   here scored purely on output — both players get the same 150 seconds, so
   speed is already baked in and there is no separate speed bonus.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var LIMIT = 150000;

  D.css('bee', [
    '.behive{position:relative;width:225px;height:210px;margin:6px auto 14px}',
    '.behex{position:absolute;width:70px;height:80px;display:grid;place-items:center;cursor:pointer;',
    '  font:800 25px/1 var(--sans);text-transform:uppercase;background:#2f251f;color:var(--ink);',
    '  clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);transition:background .12s,transform .08s}',
    '.behex:hover{background:#3d2f27}.behex:active{transform:scale(.94)}',
    '.behex.mid{background:var(--ember);color:#1a0f06}',
    '.behex.mid:hover{background:var(--ember2)}',
    '.beword{text-align:center;font:800 26px/1.2 var(--sans);letter-spacing:.06em;text-transform:uppercase;',
    '  min-height:32px;margin-bottom:10px;color:var(--ink)}',
    '.beword .mid{color:var(--ember)}',
    '.beword .bad{color:var(--ink3)}',
    '.bebtns{display:flex;gap:8px;justify-content:center;margin-bottom:14px}',
    '.bescore{display:flex;align-items:center;gap:12px;justify-content:center;margin-bottom:8px}',
    '.bescore b{font:800 30px/1 var(--mono);color:var(--ember2)}',
    '.befound{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-height:170px;overflow:auto;margin-top:12px}',
    '.befound span{font-size:12.5px;padding:3px 9px;border-radius:99px;background:#0f0b09;border:1px solid var(--line);text-transform:capitalize}',
    '.befound span.pan{border-color:var(--ember);color:var(--ember2)}',
    '.beclock{font:800 20px/1 var(--mono);text-align:center;color:var(--ember2);margin-bottom:6px}',
    '.beclock.low{color:var(--bad)}'
  ].join(''));

  function wordScore(w) {
    return (w.length === 4 ? 1 : w.length) + (new Set(w.split('')).size === 7 ? 7 : 0);
  }

  D.register({
    id: 'bee',
    name: 'Spelling Bee',
    blurb: 'Make words from seven letters. 150 seconds.',
    tag: 'word',
    icon: D.icon('bee'),

    build: function (rnd) {
      var i = D.int(rnd, BEES.length);
      // Ring order is part of the puzzle so both players see the same hive.
      return { idx: i, ring: D.shuffle(rnd, BEES[i].o.split('')) };
    },
    answerText: function (p) {
      var b = BEES[p.idx];
      var pans = b.w.filter(function (w) { return new Set(w.split('')).size === 7; });
      return b.w.length + ' words were possible · pangram' + (pans.length > 1 ? 's' : '') + ': ' + pans.join(', ');
    },

    mount: function (host, puzzle, api) {
      var bee = BEES[puzzle.idx];
      var mid = bee.c, ring = puzzle.ring.slice();
      var valid = new Set(bee.w);
      var found = [], points = 0, cur = '', over = false, gotPangram = false;
      var t0 = Date.now(), tick;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint',
        'Words of four letters or more, every one containing the middle letter. Letters may repeat.'));

      var clock = D.el('div', 'beclock', '2:30');
      wrap.appendChild(clock);
      var scoreRow = D.el('div', 'bescore');
      var scoreN = D.el('b', '', '0');
      scoreRow.appendChild(scoreN);
      var rank = D.el('span', 'tiny dim', '0 words');
      scoreRow.appendChild(rank);
      wrap.appendChild(scoreRow);

      var wordLine = D.el('div', 'beword');
      wrap.appendChild(wordLine);

      var hive = D.el('div', 'behive');
      /* Pointy-top hexes 70×80: horizontal step is the full width, the
         diagonal neighbours sit half a width across and 3/4 of a height up.
         Index 0 is the centre; the six around it follow the ring order. */
      var POS = [[85, 70], [50, 10], [120, 10], [155, 70], [120, 130], [50, 130], [15, 70]];
      var hexes = [];
      POS.forEach(function (p, i) {
        var letter = i === 0 ? mid : ring[i - 1];
        var h = D.el('div', 'behex' + (i === 0 ? ' mid' : ''), letter.toUpperCase());
        h.style.left = p[0] + 'px'; h.style.top = p[1] + 'px';
        h.addEventListener('click', function () { type(letter); });
        hexes.push(h); hive.appendChild(h);
      });
      wrap.appendChild(hive);

      var btns = D.el('div', 'bebtns');
      var bDel = D.el('button', 'btn sm gho', 'Delete');
      var bMix = D.el('button', 'btn sm gho', 'Shuffle');
      var bGo = D.el('button', 'btn sm pri', 'Enter');
      btns.appendChild(bDel); btns.appendChild(bMix); btns.appendChild(bGo);
      wrap.appendChild(btns);

      var foundBox = D.el('div', 'befound');
      wrap.appendChild(foundBox);
      host.appendChild(wrap);

      var unbind = D.bindKeys(function (k) {
        if (k === 'ENTER') return submit();
        if (k === 'BACK') { cur = cur.slice(0, -1); drawWord(); return; }
        type(k.toLowerCase());
      });

      function type(ch) {
        if (over) return;
        if (mid.indexOf(ch) < 0 && ring.indexOf(ch) < 0) { flashBad(); return; }
        if (cur.length >= 16) return;
        cur += ch; drawWord();
      }

      function flashBad() {
        wordLine.style.color = 'var(--bad)';
        setTimeout(function () { wordLine.style.color = ''; }, 180);
      }

      function drawWord() {
        D.clear(wordLine);
        if (!cur) { wordLine.appendChild(D.el('span', 'bad', '·')); return; }
        cur.split('').forEach(function (ch) {
          wordLine.appendChild(D.el('span', ch === mid ? 'mid' : '', ch));
        });
      }

      function submit() {
        if (over || !cur) return;
        var w = cur;
        cur = ''; drawWord();
        if (w.length < 4) { D.toast('Too short', 'bad'); return; }
        if (w.indexOf(mid) < 0) { D.toast('Missing the middle letter', 'bad'); return; }
        if (found.indexOf(w) >= 0) { D.toast('Already found', 'bad'); return; }
        if (!valid.has(w)) { D.toast('Not in the list', 'bad'); return; }
        var pts = wordScore(w);
        found.push(w); points += pts;
        var pan = new Set(w.split('')).size === 7;
        if (pan) { gotPangram = true; D.toast('Pangram! +' + pts, 'good'); }
        else D.toast('+' + pts, 'good');
        var chip = D.el('span', pan ? 'pan' : '', w);
        foundBox.insertBefore(chip, foundBox.firstChild);
        scoreN.textContent = points;
        rank.textContent = found.length + (found.length === 1 ? ' word' : ' words');
        api.progress(Math.min(99, points / (bee.m * .55) * 100), points + ' pts · ' + found.length + ' words');
      }

      bDel.addEventListener('click', function () { cur = cur.slice(0, -1); drawWord(); });
      bGo.addEventListener('click', submit);
      bMix.addEventListener('click', function () {
        for (var i = ring.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1)); var t = ring[i]; ring[i] = ring[j]; ring[j] = t;
        }
        hexes.forEach(function (h, i) { if (i > 0) h.textContent = ring[i - 1].toUpperCase(); });
        rewire();
      });
      function rewire() {
        hexes.forEach(function (h, i) {
          var clone = h.cloneNode(true);
          h.parentNode.replaceChild(clone, h);
          hexes[i] = clone;
          var letter = i === 0 ? mid : ring[i - 1];
          clone.addEventListener('click', function () { type(letter); });
        });
      }

      tick = setInterval(function () {
        var left = LIMIT - (Date.now() - t0);
        if (left <= 0) { clock.textContent = '0:00'; return finish(); }
        clock.textContent = D.fmtTime(left);
        clock.classList.toggle('low', left < 20000);
      }, 250);

      function finish() {
        if (over) return;
        over = true;
        clearInterval(tick); unbind();
        bGo.disabled = bDel.disabled = bMix.disabled = true;
        api.finish({ points: points, maxPoints: bee.m, words: found.length, pangram: gotPangram });
      }

      drawWord();
      api.progress(0, '0 pts');
      return { destroy: function () { clearInterval(tick); unbind(); }, giveUp: finish };
    }
  });
})(window.DLES);
