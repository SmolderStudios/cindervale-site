/* ═══ NEIGHBOURS ════════════════════════════════════════════════════════
   Name every country that shares a land border with the target. Targets are
   only ever countries whose neighbour list is COMPLETE in this dataset — see
   GEO.PARTIAL — because "name them all" has to be answerable.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';

  D.css('borders', [
    '.bdtarget{text-align:center;margin-bottom:6px}',
    '.bdtarget b{display:block;font:800 clamp(26px,5.5vw,40px)/1.15 var(--sans)}',
    '.bdtarget span{font-size:12px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3)}',
    '.bdslots{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:18px 0}',
    '.bdslot{min-width:120px;padding:10px 14px;border-radius:9px;border:1px dashed var(--line2);',
    '  text-align:center;font-size:13.5px;color:var(--ink3);background:#0d0908}',
    '.bdslot.got{border-style:solid;border-color:var(--good);background:var(--goodDim);color:var(--ink);font-weight:600}',
    '.bdslot.miss{border-style:solid;border-color:var(--bad);background:#1d1210;color:var(--ink2)}',
    '.bdcount{text-align:center;font:700 13px/1 var(--mono);color:var(--ink2);margin-bottom:4px}'
  ].join(''));

  D.register({
    id: 'borders',
    name: 'Neighbours',
    blurb: 'Name every country it borders.',
    tag: 'world',
    icon: D.icon('borders'),

    build: function (rnd) {
      var pool = GEO.COUNTRIES.filter(function (c) {
        var n = (GEO.NEIGHBOURS[c.n] || []).length;
        return n >= 3 && n <= 8 && !GEO.isPartial(c.n) && (c.pop > 2 || c.area > 200);
      });
      return { target: D.pick(rnd, pool).n };
    },
    answerText: function (p) { return (GEO.NEIGHBOURS[p.target] || []).join(', '); },

    mount: function (host, puzzle, api) {
      var want = (GEO.NEIGHBOURS[puzzle.target] || []).slice();
      var found = [], wrong = 0, over = false;

      var wrap = D.el('div', 'gpanel');
      wrap.appendChild(D.el('div', 'ghint',
        'Name every country sharing a land border with it. Wrong guesses cost a little.'));
      var head = D.el('div', 'bdtarget');
      head.innerHTML = '<span>neighbours of</span><b>' + D.esc(puzzle.target) + '</b>';
      wrap.appendChild(head);
      var count = D.el('div', 'bdcount');
      wrap.appendChild(count);
      var slots = D.el('div', 'bdslots');
      wrap.appendChild(slots);

      var pick = D.picker(GEO.COUNTRIES, function (c) { return c.n; }, onGuess, 'Name a neighbour…');
      wrap.appendChild(pick.node);
      var note = D.el('div', 'tiny dim');
      note.style.cssText = 'text-align:center;margin-top:10px';
      wrap.appendChild(note);
      var done = D.el('button', 'btn gho sm', 'That is all of them');
      done.style.cssText = 'display:block;margin:12px auto 0';
      done.addEventListener('click', function () { if (!over) finish(); });
      wrap.appendChild(done);
      host.appendChild(wrap);

      function draw() {
        D.clear(slots);
        want.forEach(function (n) {
          var got = found.indexOf(n) >= 0;
          slots.appendChild(D.el('div', 'bdslot' + (got ? ' got' : over ? ' miss' : ''),
            got || over ? D.esc(n) : '?'));
        });
        count.textContent = found.length + ' of ' + want.length +
          (wrong ? '  ·  ' + wrong + ' wrong' : '');
      }

      function onGuess(c) {
        if (over) return;
        if (found.indexOf(c.n) >= 0) { D.toast('Already got that one', 'bad'); return; }
        if (want.indexOf(c.n) < 0) {
          wrong++;
          D.toast(c.n + ' does not border ' + puzzle.target, 'bad');
          draw();
          api.progress(found.length / want.length * 100, found.length + '/' + want.length);
          pick.focus();
          return;
        }
        found.push(c.n);
        draw();
        api.progress(found.length / want.length * 100, found.length + '/' + want.length);
        if (found.length === want.length) return finish();
        pick.focus();
      }

      function finish() {
        over = true; pick.disable(); done.disabled = true;
        draw();
        note.textContent = found.length === want.length
          ? 'All ' + want.length + ' found'
          : 'Missed ' + (want.length - found.length);
        api.finish({ found: found.length, total: want.length, wrong: wrong });
      }

      draw();
      api.progress(0, '0/' + want.length);
      setTimeout(function () { pick.focus(); }, 60);
      return { giveUp: function () { if (!over) finish(); } };
    }
  });
})(window.DLES);
