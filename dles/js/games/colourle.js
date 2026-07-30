/* ═══ COLOURLE ══════════════════════════════════════════════════════════
   The target swatch is right there in front of you — now say what it is in
   RGB. Six attempts, each one telling you which channels are too high or
   too low. Good colour intuition gets it in two; brute force needs five.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var MAX = 6, TOL = 12;                 // every channel within ±12 counts as a match

  D.css('colourle', [
    '.cotop{display:flex;gap:14px;align-items:stretch;justify-content:center;margin-bottom:18px}',
    '.cosw{width:130px;height:110px;border-radius:12px;border:1px solid var(--line2);position:relative;box-shadow:var(--sh)}',
    '.cosw b{position:absolute;left:0;right:0;bottom:6px;text-align:center;font:700 10px/1 var(--sans);',
    '  letter-spacing:.12em;text-transform:uppercase;color:rgba(0,0,0,.5);text-shadow:0 1px 0 rgba(255,255,255,.25)}',
    '.cosliders{display:flex;flex-direction:column;gap:11px;max-width:460px;margin:0 auto}',
    '.cosl{display:grid;grid-template-columns:20px 1fr 46px;gap:10px;align-items:center}',
    '.cosl label{font:800 13px/1 var(--mono);text-align:center}',
    '.cosl input[type=range]{width:100%;accent-color:var(--ember)}',
    '.cosl output{font:700 14px/1 var(--mono);text-align:right;color:var(--ink2)}',
    '.cochip{display:inline-flex;align-items:center;gap:4px;font:700 12px/1 var(--mono);padding:3px 7px;border-radius:6px}',
    '.cochip.hi{background:var(--badDim);color:#e79a92}.cochip.lo{background:var(--coolDim);color:#9fd0e6}',
    '.cochip.ok{background:var(--goodDim);color:#a8dfa9}',
    '.corow{display:flex;align-items:center;gap:10px;padding:8px 11px;border-radius:9px;background:#0f0b09;border:1px solid var(--line)}',
    '.corow .sq{width:30px;height:30px;border-radius:6px;border:1px solid rgba(255,255,255,.14);flex:0 0 30px}'
  ].join(''));

  var hex = function (r, g, b) {
    return '#' + [r, g, b].map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join('');
  };

  D.register({
    id: 'colourle',
    name: 'Colourle',
    blurb: 'Match the swatch in RGB.',
    tag: 'logic',
    icon: D.icon('colourle'),

    build: function (rnd) {
      // Avoid near-black and near-white: they make every channel obvious.
      var c = [0, 0, 0].map(function () { return 25 + D.int(rnd, 206); });
      // Push at least one channel away from the others so it isn't a grey.
      var i = D.int(rnd, 3);
      c[i] = c[i] < 128 ? Math.min(245, c[i] + 60) : Math.max(20, c[i] - 60);
      return { rgb: c };
    },
    answerText: function (p) { return 'rgb(' + p.rgb.join(', ') + ')  ' + hex(p.rgb[0], p.rgb[1], p.rgb[2]); },

    mount: function (host, puzzle, api) {
      var t = puzzle.rgb, tries = 0, over = false, best = 0;
      var val = [128, 128, 128];

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint',
        'Read the colour on the left and dial it in on the right. Every channel within ±' + TOL + ' wins the round.'));

      var top = D.el('div', 'cotop');
      var swT = D.el('div', 'cosw'); swT.style.background = hex(t[0], t[1], t[2]);
      swT.appendChild(D.el('b', '', 'target'));
      var swY = D.el('div', 'cosw'); swY.appendChild(D.el('b', '', 'yours'));
      top.appendChild(swT); top.appendChild(swY);
      wrap.appendChild(top);

      var sliders = D.el('div', 'cosliders');
      var outs = [];
      ['R', 'G', 'B'].forEach(function (ch, i) {
        var row = D.el('div', 'cosl');
        row.appendChild(D.el('label', '', ch));
        var s = document.createElement('input');
        s.type = 'range'; s.min = '0'; s.max = '255'; s.value = String(val[i]);
        s.addEventListener('input', function () { val[i] = +s.value; paint(); });
        row.appendChild(s);
        var o = D.el('output', '', String(val[i]));
        outs.push(o); row.appendChild(o);
        sliders.appendChild(row);
      });
      wrap.appendChild(sliders);

      var go = D.el('button', 'btn pri', 'Submit guess');
      go.style.cssText = 'width:100%;max-width:460px;margin:16px auto 0;display:block';
      go.addEventListener('click', submit);
      wrap.appendChild(go);

      var left = D.el('div', 'tiny dim');
      left.style.cssText = 'text-align:center;margin-top:10px';
      wrap.appendChild(left);
      var log = D.el('div', 'log');
      wrap.appendChild(log);
      host.appendChild(wrap);

      function paint() {
        swY.style.background = hex(val[0], val[1], val[2]);
        outs.forEach(function (o, i) { o.textContent = val[i]; });
      }

      function closeness(g) {
        var d = Math.sqrt(g.reduce(function (s, v, i) { return s + (v - t[i]) * (v - t[i]); }, 0));
        return Math.max(0, 1 - d / 300);
      }

      function submit() {
        if (over) return;
        tries++;
        var g = val.slice();
        var diffs = g.map(function (v, i) { return v - t[i]; });
        var win = diffs.every(function (d) { return Math.abs(d) <= TOL; });
        best = Math.max(best, closeness(g));

        var row = D.el('div', 'corow');
        var sq = D.el('i', 'sq'); sq.style.background = hex(g[0], g[1], g[2]);
        row.appendChild(sq);
        ['R', 'G', 'B'].forEach(function (ch, i) {
          var d = diffs[i], cls = Math.abs(d) <= TOL ? 'ok' : d > 0 ? 'hi' : 'lo';
          var txt = Math.abs(d) <= TOL ? ch + ' ✓' : ch + (d > 0 ? ' ↓' : ' ↑') + (Math.abs(d) > 60 ? '↕' : '');
          row.appendChild(D.el('span', 'cochip ' + cls, txt));
        });
        row.appendChild(D.el('span', 'tiny dim', Math.round(closeness(g) * 100) + '%'));
        log.insertBefore(row, log.firstChild);

        if (win) return finish(true);
        if (tries >= MAX) return finish(false);
        left.textContent = (MAX - tries) + ' guesses left · ↑ means go higher';
        api.progress(Math.max(tries / MAX, best) * 100, tries + '/' + MAX + ' · ' + Math.round(best * 100) + '% close');
      }

      function finish(solved) {
        over = true; go.disabled = true;
        left.textContent = solved ? 'Matched in ' + tries : 'Target was ' + hex(t[0], t[1], t[2]);
        api.finish({ solved: solved, guesses: tries, closeness: solved ? 1 : best });
      }

      paint();
      left.textContent = MAX + ' guesses left';
      api.progress(0, 'no guesses yet');
      return { giveUp: function () { if (!over) finish(false); } };
    }
  });
})(window.DLES);
