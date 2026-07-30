/* ═══ PHYLO ═════════════════════════════════════════════════════════════
   Guess the hidden animal. Every guess tells you the deepest rank you and
   the answer share — kingdom, then phylum, class, order, family, genus.
   Ten guesses; a good player narrows by class, then order, then closes in.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';
  var MAX = 10;
  var RANKS = [
    { k: 'p', label: 'Phylum' },
    { k: 'c', label: 'Class' },
    { k: 'o', label: 'Order' },
    { k: 'f', label: 'Family' },
    { k: 'g', label: 'Genus' }
  ];

  D.css('phylo', [
    '.phrow{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;background:#0f0b09;border:1px solid var(--line)}',
    '.phrow .nm{flex:1;font-weight:600;font-size:14px}',
    '.phrow .rk{font:700 11px/1 var(--sans);letter-spacing:.07em;text-transform:uppercase;padding:4px 9px;border-radius:99px}',
    '.phrow .tx{font:600 12px/1 var(--mono);color:var(--ink2)}',
    '.phrow.hit{background:var(--goodDim);border-color:var(--good)}',
    '.phbar{display:flex;gap:4px;margin:14px auto 4px;max-width:520px}',
    '.phbar div{flex:1;text-align:center;padding:6px 2px;border-radius:6px;background:#0f0b09;',
    '  border:1px solid var(--line);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3)}',
    '.phbar div.on{border-color:var(--ember);color:var(--ember2);background:#241a13}'
  ].join(''));

  var SHADE = ['#2b3f56', '#31564e', '#4a6b3f', '#7d7a2a', '#a8722c', '#5fa663'];

  /* how deep the shared lineage runs: 0 = kingdom only … 5 = same genus */
  function depth(a, b) {
    var d = 0;
    for (var i = 0; i < RANKS.length; i++) {
      if (a[RANKS[i].k] === b[RANKS[i].k]) d = i + 1; else break;
    }
    return d;
  }

  D.register({
    id: 'phylo',
    name: 'Phylo',
    blurb: 'Find the animal by how closely it is related.',
    tag: 'trivia',
    icon: D.icon('phylo'),

    build: function (rnd) {
      var pool = PHYLO.filter(function (a) { return a.ok; });
      return { answer: D.pick(rnd, pool).n };
    },
    answerText: function (p) {
      var a = PHYLO.filter(function (x) { return x.n === p.answer; })[0];
      return a ? a.n + '  (' + a.c + ' › ' + a.o + ' › ' + a.f + ')' : p.answer;
    },

    mount: function (host, puzzle, api) {
      var target = PHYLO.filter(function (x) { return x.n === puzzle.answer; })[0];
      var guesses = 0, over = false, bestDepth = 0;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint',
        'Name any animal. You will be told the closest rank you share with the hidden one.'));

      var bar = D.el('div', 'phbar');
      var cells = RANKS.map(function (r) { var d = D.el('div', '', r.label); bar.appendChild(d); return d; });
      wrap.appendChild(bar);
      var closest = D.el('div', 'tiny dim');
      closest.style.cssText = 'text-align:center;margin-bottom:12px';
      wrap.appendChild(closest);

      var pick = D.picker(PHYLO, function (a) { return a.n; }, onGuess, 'Name an animal…');
      wrap.appendChild(pick.node);
      var log = D.el('div', 'log');
      wrap.appendChild(log);
      host.appendChild(wrap);

      function onGuess(a) {
        if (over) return;
        guesses++;
        var win = a.n === target.n;
        var d = win ? 6 : depth(a, target);
        bestDepth = Math.max(bestDepth, d);
        cells.forEach(function (c, i) { c.classList.toggle('on', i < bestDepth); });

        var row = D.el('div', 'phrow' + (win ? ' hit' : ''));
        row.appendChild(D.el('div', 'nm', D.esc(a.n)));
        if (win) {
          row.appendChild(D.el('div', 'tx', 'CORRECT'));
        } else {
          var tag = D.el('div', 'rk', d === 0 ? 'Kingdom only' : 'Same ' + RANKS[d - 1].label.toLowerCase());
          tag.style.background = SHADE[d]; tag.style.color = d >= 3 ? '#140d08' : '#dfeaf2';
          row.appendChild(tag);
          row.appendChild(D.el('div', 'tx', d === 0 ? 'Animalia' : a[RANKS[d - 1].k]));
        }
        log.insertBefore(row, log.firstChild);

        if (win) return finish(true);
        if (guesses >= MAX) return finish(false);
        closest.textContent = 'Closest so far: ' + (bestDepth ? RANKS[bestDepth - 1].label : 'kingdom') +
                              ' · ' + (MAX - guesses) + ' guesses left';
        api.progress(Math.max(guesses / MAX, bestDepth / 6) * 100,
                     guesses + '/' + MAX + ' · ' + (bestDepth ? RANKS[bestDepth - 1].label : 'kingdom'));
        pick.focus();
      }

      function finish(solved) {
        over = true; pick.disable();
        closest.textContent = solved ? 'Found in ' + guesses : 'It was ' + target.n;
        api.finish({ solved: solved, guesses: guesses });
      }

      closest.textContent = MAX + ' guesses';
      api.progress(0, 'no guesses yet');
      setTimeout(function () { pick.focus(); }, 60);
      return { giveUp: function () { if (!over) finish(false); } };
    }
  });
})(window.DLES);
