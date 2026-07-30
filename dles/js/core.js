/* ═══ CORE ══════════════════════════════════════════════════════════════
   Seeded RNG, game registry, DOM helpers and the widgets more than one
   game needs (letter grid + on-screen keyboard).

   THE SEED RULE: every game's build() must be a pure function of the RNG it
   is handed. Both players are given the same seed string by the server, so a
   puzzle that reaches for Math.random(), Date, or anything on `window` will
   silently deal the two players different boards.
═══════════════════════════════════════════════════════════════════════════ */
(function (G) {
  'use strict';

  var DLES = G.DLES = {};

  /* ── seeded RNG ────────────────────────────────────────────────────── */
  function hash32(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  DLES.hash32 = hash32;

  /* mulberry32 — small, fast, and identical in every JS engine */
  DLES.rng = function (seed) {
    var a = typeof seed === 'number' ? seed >>> 0 : hash32(String(seed));
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  DLES.int = function (r, n) { return Math.floor(r() * n); };
  DLES.pick = function (r, arr) { return arr[Math.floor(r() * arr.length)]; };
  DLES.shuffle = function (r, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  /* n distinct members of arr */
  DLES.sample = function (r, arr, n) { return DLES.shuffle(r, arr).slice(0, n); };

  /* ── DOM ───────────────────────────────────────────────────────────── */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  DLES.el = el;
  DLES.$ = function (s, root) { return (root || document).querySelector(s); };
  DLES.$$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  DLES.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); return n; };

  DLES.toast = function (msg, kind) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var t = el('div', 'toast' + (kind ? ' ' + kind : ''), msg);
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .3s'; t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 320);
    }, 2100);
    while (host.children.length > 4) host.firstChild.remove();
  };

  DLES.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  DLES.fmtTime = function (ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  /* Each game ships its own CSS next to its code; injected once, on load. */
  DLES.css = function (id, text) {
    if (document.getElementById('css-' + id)) return;
    var s = document.createElement('style');
    s.id = 'css-' + id; s.textContent = text;
    document.head.appendChild(s);
  };

  /* ── registry ──────────────────────────────────────────────────────── */
  DLES.GAMES = [];
  DLES.BY_ID = {};
  DLES.register = function (def) {
    if (DLES.BY_ID[def.id]) throw new Error('duplicate game id ' + def.id);
    DLES.BY_ID[def.id] = def;
    DLES.GAMES.push(def);
    return def;
  };

  /* ── shared: letter grid ───────────────────────────────────────────── */
  /* rows × cols of .tile, returns {node, tiles[r][c], set(r,c,ch,cls)} */
  DLES.letterGrid = function (rows, cols, size) {
    var node = el('div', 'tgrid');
    if (size) node.style.setProperty('--ts', size + 'px');
    var tiles = [];
    for (var r = 0; r < rows; r++) {
      var row = el('div', 'trow');
      var line = [];
      for (var c = 0; c < cols; c++) { var t = el('div', 'tile'); row.appendChild(t); line.push(t); }
      tiles.push(line); node.appendChild(row);
    }
    return {
      node: node,
      rows: DLES.$$('.trow', node),
      tiles: tiles,
      set: function (r, c, ch, cls) {
        var t = tiles[r][c]; if (!t) return;
        t.textContent = ch || '';
        t.className = 'tile' + (ch ? ' fill' : '') + (cls ? ' ' + cls : '');
      },
      shake: function (r) {
        var row = this.rows[r]; if (!row) return;
        row.classList.add('shake');
        setTimeout(function () { row.classList.remove('shake'); }, 420);
      },
      win: function (r) { if (this.rows[r]) this.rows[r].classList.add('win'); }
    };
  };

  /* ── shared: on-screen keyboard ────────────────────────────────────── */
  /* rows: array of strings; specials 'ENTER' / '⌫' are added by the caller.
     onKey(k) gets 'A'..'Z', 'ENTER', 'BACK' or whatever chars you pass. */
  DLES.keyboard = function (rows, onKey, opts) {
    opts = opts || {};
    var node = el('div', 'kb'), keys = {};
    rows.forEach(function (row, ri) {
      var rn = el('div', 'kbr');
      if (ri === rows.length - 1 && !opts.noEnter) {
        var e = el('button', 'key wide', 'Enter');
        e.addEventListener('click', function () { onKey('ENTER'); });
        rn.appendChild(e);
      }
      (typeof row === 'string' ? row.split('') : row).forEach(function (k) {
        var b = el('button', 'key', k === ' ' ? '␣' : DLES.esc(k));
        b.addEventListener('click', function () { onKey(k); });
        keys[k] = b; rn.appendChild(b);
      });
      if (ri === rows.length - 1 && !opts.noEnter) {
        var d = el('button', 'key wide', '⌫');
        d.addEventListener('click', function () { onKey('BACK'); });
        rn.appendChild(d);
      }
      node.appendChild(rn);
    });
    return {
      node: node, keys: keys,
      /* only ever upgrades a key's colour: b < y < g */
      mark: function (k, cls) {
        var b = keys[k]; if (!b) return;
        var rank = { '': 0, b: 1, y: 2, g: 3 };
        var cur = b.className.replace('key', '').trim();
        if ((rank[cls] || 0) > (rank[cur] || 0)) b.className = 'key ' + cls;
      },
      reset: function () { Object.keys(keys).forEach(function (k) { keys[k].className = 'key'; }); }
    };
  };
  DLES.QWERTY = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

  /* Physical keyboard → the same onKey handler. Returns an unbind fn. */
  DLES.bindKeys = function (onKey, allow) {
    function h(ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      var tgt = ev.target;
      if (tgt && /^(INPUT|TEXTAREA)$/.test(tgt.tagName)) return;
      var k = ev.key;
      if (k === 'Enter') { onKey('ENTER'); ev.preventDefault(); return; }
      if (k === 'Backspace') { onKey('BACK'); ev.preventDefault(); return; }
      if (k.length !== 1) return;
      var up = k.toUpperCase();
      if (allow && allow.indexOf(up) < 0) return;
      if (!allow && !/[A-Z]/.test(up)) return;
      onKey(up); ev.preventDefault();
    }
    document.addEventListener('keydown', h);
    return function () { document.removeEventListener('keydown', h); };
  };

  /* ── shared: wordle-style letter marking ───────────────────────────── */
  /* Returns 'g'|'y'|'b' per position, handling duplicate letters correctly:
     greens are claimed first, then yellows consume the remaining pool. */
  DLES.markGuess = function (guess, answer) {
    var n = guess.length, out = new Array(n), pool = {};
    var i, ch;
    for (i = 0; i < n; i++) {
      if (guess[i] === answer[i]) out[i] = 'g';
      else { ch = answer[i]; pool[ch] = (pool[ch] || 0) + 1; }
    }
    for (i = 0; i < n; i++) {
      if (out[i]) continue;
      ch = guess[i];
      if (pool[ch] > 0) { out[i] = 'y'; pool[ch]--; }
      else out[i] = 'b';
    }
    return out;
  };

  /* ── shared: reveal animation ──────────────────────────────────────── */
  DLES.revealRow = function (grid, r, letters, marks, done) {
    letters.forEach(function (ch, c) {
      setTimeout(function () {
        var t = grid.tiles[r][c];
        t.className = 'tile flip';
        setTimeout(function () { t.className = 'tile ' + marks[c]; t.textContent = ch; }, 230);
        if (c === letters.length - 1 && done) setTimeout(done, 260);
      }, c * 130);
    });
  };

  /* ── shared: haversine (globle) ────────────────────────────────────── */
  DLES.distKm = function (a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLon = (b.lng - a.lng) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
  };
  DLES.bearing = function (a, b) {
    var rad = Math.PI / 180;
    var y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
    var x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) -
            Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
    return (Math.atan2(y, x) / rad + 360) % 360;
  };
  DLES.arrow = function (deg) {
    return ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][Math.round(deg / 45) % 8];
  };

  /* ── shared: fuzzy name matching (globle / flagle / cluedle / phylo) ─ */
  DLES.norm = function (s) {
    return String(s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, '').replace(/\b(the|of|and)\b/g, '')
      .replace(/\s+/g, ' ').trim();
  };
  /* find(list, text, keyFn, aliasFn) → matching entry or null */
  DLES.findByName = function (list, text, keyFn, aliasFn) {
    var q = DLES.norm(text);
    if (!q) return null;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (DLES.norm(keyFn(it)) === q) return it;
      var al = aliasFn ? aliasFn(it) : null;
      if (al) for (var j = 0; j < al.length; j++) if (DLES.norm(al[j]) === q) return it;
    }
    return null;
  };

  /* ── shared: typeahead input ───────────────────────────────────────── */
  /* An <input> with a filtered dropdown. onPick(entry) fires on selection. */
  DLES.picker = function (list, keyFn, onPick, placeholder) {
    var wrap = el('div', 'inline-in');
    wrap.style.position = 'relative';
    var input = el('input');
    input.placeholder = placeholder || 'Type a name…';
    input.autocomplete = 'off'; input.spellcheck = false;
    var menu = el('div');
    menu.style.cssText = 'position:absolute;left:0;right:0;top:100%;margin-top:4px;z-index:20;' +
      'background:#150f0d;border:1px solid var(--line2);border-radius:10px;overflow:hidden;display:none;max-height:230px;overflow-y:auto';
    var go = el('button', 'btn', 'Guess');

    var shown = [];
    function render() {
      var q = DLES.norm(input.value);
      DLES.clear(menu);
      if (!q) { menu.style.display = 'none'; return; }
      shown = list.filter(function (it) { return DLES.norm(keyFn(it)).indexOf(q) >= 0; }).slice(0, 8);
      if (!shown.length) { menu.style.display = 'none'; return; }
      shown.forEach(function (it, i) {
        var r = el('button', '', DLES.esc(keyFn(it)));
        r.style.cssText = 'display:block;width:100%;text-align:left;padding:9px 12px;font-size:14px;border-bottom:1px solid var(--line)';
        r.addEventListener('mouseenter', function () { r.style.background = '#241a16'; });
        r.addEventListener('mouseleave', function () { r.style.background = ''; });
        r.addEventListener('click', function () { commit(it); });
        menu.appendChild(r);
      });
      menu.style.display = 'block';
    }
    function commit(it) {
      input.value = ''; menu.style.display = 'none'; shown = [];
      onPick(it);
    }
    function submit() {
      var hit = DLES.findByName(list, input.value, keyFn);
      if (!hit && shown.length) hit = shown[0];
      if (!hit) { DLES.toast('No match for “' + DLES.esc(input.value) + '”', 'bad'); return; }
      commit(hit);
    }
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { menu.style.display = 'none'; }
      e.stopPropagation();
    });
    go.addEventListener('click', submit);
    wrap.appendChild(input); wrap.appendChild(go); wrap.appendChild(menu);
    return { node: wrap, input: input, focus: function () { input.focus(); },
             disable: function () { input.disabled = true; go.disabled = true; menu.style.display = 'none'; } };
  };

  /* ── shared: reorderable list (chronology / rankdle) ───────────────── */
  /* Drag to reorder, or use the ▲▼ buttons — the buttons are the reliable
     path and exist so a fiddly drag never costs someone the round. */
  DLES.css('sortlist', [
    '.slist{display:flex;flex-direction:column;gap:8px;max-width:620px;margin:0 auto}',
    '.sitem{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:10px;',
    '  background:#0f0b09;border:1px solid var(--line);cursor:grab;transition:border-color .12s,opacity .12s}',
    '.sitem:hover{border-color:var(--line2)}',
    '.sitem.drag{opacity:.35}.sitem.over{border-color:var(--ember)}',
    '.sitem .rk{font:800 13px/1 var(--mono);color:var(--ink3);width:20px;flex:0 0 20px;text-align:center}',
    '.sitem .tx{flex:1;font-size:14px;line-height:1.35}',
    '.sitem .mv{display:flex;flex-direction:column;gap:2px}',
    '.sitem .mv button{width:26px;height:17px;border-radius:4px;background:#241a16;color:var(--ink2);font-size:9px;line-height:1}',
    '.sitem .mv button:hover{background:#33251f;color:var(--ink)}',
    '.sitem.right{border-color:var(--good);background:var(--goodDim)}',
    '.sitem.wrong{border-color:var(--bad);background:#1d1210}',
    '.sitem .an{font:700 12px/1 var(--mono);color:var(--ink2)}',
    '.slabels{display:flex;justify-content:space-between;max-width:620px;margin:0 auto 8px;',
    '  font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3)}'
  ].join(''));

  DLES.sortList = function (items, label) {
    var order = items.slice();
    var node = el('div', 'slist');
    var dragging = null;

    function move(i, d) {
      var j = i + d;
      if (j < 0 || j >= order.length) return;
      var t = order[i]; order[i] = order[j]; order[j] = t;
      draw();
    }

    function draw() {
      DLES.clear(node);
      order.forEach(function (it, i) {
        var row = el('div', 'sitem');
        row.draggable = true;
        row.appendChild(el('div', 'rk', String(i + 1)));
        row.appendChild(el('div', 'tx', DLES.esc(label(it))));
        var mv = el('div', 'mv');
        var up = el('button', '', '▲'), dn = el('button', '', '▼');
        up.addEventListener('click', function (e) { e.stopPropagation(); move(i, -1); });
        dn.addEventListener('click', function (e) { e.stopPropagation(); move(i, 1); });
        mv.appendChild(up); mv.appendChild(dn); row.appendChild(mv);

        row.addEventListener('dragstart', function (e) {
          dragging = i; row.classList.add('drag');
          try { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; } catch (x) {}
        });
        row.addEventListener('dragend', function () { dragging = null; draw(); });
        row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('over'); });
        row.addEventListener('dragleave', function () { row.classList.remove('over'); });
        row.addEventListener('drop', function (e) {
          e.preventDefault(); row.classList.remove('over');
          if (dragging == null || dragging === i) return;
          var it2 = order.splice(dragging, 1)[0];
          order.splice(i, 0, it2);
          dragging = null; draw();
        });
        node.appendChild(row);
      });
    }
    draw();
    return {
      node: node,
      order: function () { return order.slice(); },
      lock: function (marks, annotate) {
        DLES.$$('.sitem', node).forEach(function (row, i) {
          row.draggable = false;
          row.style.cursor = 'default';
          DLES.$$('.mv button', row).forEach(function (b) { b.disabled = true; b.style.opacity = '.3'; });
          if (marks) row.classList.add(marks[i] ? 'right' : 'wrong');
          if (annotate) row.appendChild(el('div', 'an', DLES.esc(annotate(order[i]))));
        });
      }
    };
  };

  /* pairwise-correct count for an ordering: how many of the C(n,2) pairs
     the player put the right way round */
  DLES.pairScore = function (order, keyFn) {
    var n = order.length, ok = 0, tot = 0;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      tot++;
      if (keyFn(order[i]) <= keyFn(order[j])) ok++;
    }
    return { correct: ok, total: tot };
  };

  /* ── icons ─────────────────────────────────────────────────────────── */
  var I = function (body) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>'; };
  DLES.ICONS = {
    wordle: I('<rect x="3" y="3" width="7" height="7" rx="1.5" fill="#5fa663" stroke="none"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="#c9a227" stroke="none"/>'),
    quordle: I('<rect x="2.5" y="2.5" width="8.5" height="8.5" rx="1.5"/><rect x="13" y="2.5" width="8.5" height="8.5" rx="1.5" fill="#5fa663" stroke="none"/><rect x="2.5" y="13" width="8.5" height="8.5" rx="1.5" fill="#c9a227" stroke="none"/><rect x="13" y="13" width="8.5" height="8.5" rx="1.5"/>'),
    connections: I('<circle cx="6.5" cy="6.5" r="3"/><circle cx="17.5" cy="6.5" r="3" fill="#c9a227" stroke="none"/><circle cx="6.5" cy="17.5" r="3" fill="#5b8ea6" stroke="none"/><circle cx="17.5" cy="17.5" r="3" fill="#8a6bb0" stroke="none"/><path d="M9.5 6.5h5M6.5 9.5v5M17.5 9.5v5M9.5 17.5h5"/>'),
    waffle: I('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'),
    nerdle: I('<path d="M4 7h6M7 4v6"/><path d="M14 6.5h6"/><path d="M4 17h6M14 15h6M14 19h6"/>'),
    mini: I('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="3" y="3" width="6" height="6" fill="currentColor" stroke="none" opacity=".25"/><rect x="15" y="15" width="6" height="6" fill="currentColor" stroke="none" opacity=".25"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18" opacity=".45"/>'),
    globle: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/>'),
    flagle: I('<path d="M5 21V4"/><path d="M5 4.5h13l-2.6 4L18 13H5z" fill="#e0873a" stroke="none"/><path d="M5 4.5h13l-2.6 4L18 13H5z"/>'),
    chrono: I('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.6 1.6M9 2.5h6"/>'),
    colourle: I('<path d="M12 3a9 9 0 1 0 0 18c1.3 0 2-.9 2-1.8 0-1.6-1.4-1.7-1.4-3 0-1 .8-1.7 1.9-1.7H17a4 4 0 0 0 4-4c0-4.1-4-7.5-9-7.5z"/><circle cx="8" cy="9.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="9.8" r="1.3" fill="currentColor" stroke="none"/>'),
    bee: I('<path d="M12 4.5c3 0 5 2.4 5 6.5s-2 8.5-5 8.5-5-4.4-5-8.5 2-6.5 5-6.5z"/><path d="M7.4 10h9.2M7.6 14h8.8"/><path d="M9 5.5 6 3M15 5.5 18 3"/>'),
    rankdle: I('<path d="M4 19h4V9H4zM10 19h4V4h-4zM16 19h4v-7h-4z"/>'),
    cluedle: I('<circle cx="11" cy="11" r="7"/><path d="M16.2 16.2 21 21"/><path d="M11 8v3.2M11 14h.01"/>'),
    travle: I('<circle cx="5" cy="18" r="2.2" fill="#5fa663" stroke="none"/><circle cx="19" cy="6" r="2.2" fill="#b4483f" stroke="none"/><path d="M6.6 16.4C9 13 8 10.5 11 10.5s3 3.5 6.4-2.9" stroke-dasharray="2.5 2"/><circle cx="11" cy="10.5" r="1.4"/>'),
    capitals: I('<path d="M4 20h16"/><path d="M6 20V9l6-4 6 4v11"/><path d="M10 20v-5h4v5"/><circle cx="12" cy="10.5" r="1.2"/>'),
    borders: I('<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>'),
    boxed: I('<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="4" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="4" r="1.1" fill="currentColor" stroke="none"/><circle cx="20" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="20" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="4" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="4" cy="15" r="1.1" fill="currentColor" stroke="none"/><path d="M9 4 20 15 4 9 15 20"/>'),
    weaver: I('<rect x="3" y="3" width="18" height="4.4" rx="1.4"/><rect x="3" y="9.8" width="18" height="4.4" rx="1.4"/><rect x="3" y="16.6" width="18" height="4.4" rx="1.4"/><path d="M8 7.4v2.4M16 14.2v2.4"/>'),
    threads: I('<circle cx="6" cy="6" r="1.7"/><circle cx="12" cy="10" r="1.7"/><circle cx="18" cy="7" r="1.7"/><circle cx="9" cy="17" r="1.7"/><circle cx="16" cy="18" r="1.7"/><path d="M7.4 7 10.7 9M13.4 9.4 16.6 8M11.6 11.7 9.7 15.4M10.6 17.3l3.8.5"/>'),
    codebreak: I('<circle cx="7" cy="7" r="3" fill="#c9a227" stroke="none"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3" fill="#5fa663" stroke="none"/>'),
    sudoku: I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18" opacity=".5"/><path d="M3 12h18" /><path d="M12 3v18"/>')
  };
  DLES.icon = function (id) { return DLES.ICONS[id] || I('<circle cx="12" cy="12" r="8"/>'); };

})(window);
