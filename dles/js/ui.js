/* ═══ APP ═══════════════════════════════════════════════════════════════
   View routing, lobby, the round loop and the results screens.

   Online and solo share one code path: solo runs a tiny local stand-in that
   emits the same `state` frames the server does, so there is exactly one
   implementation of "mount a round, run the clock, show the result".
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';

  var $ = D.$, el = D.el;
  var APP = D.APP = {
    name: '', mode: null, state: null,
    sel: [], shuffleOrder: false,
    inst: null, puzzle: null, mounted: null, h2hKey: null,
    t0: 0, clock: null, lastProg: 0, finished: false
  };

  /* ── view routing ──────────────────────────────────────────────────── */
  function show(id) {
    D.$$('.view').forEach(function (v) { v.classList.toggle('on', v.id === id); });
    window.scrollTo(0, 0);
  }
  function overlay(html, onClose) {
    var ov = $('#ov');
    $('#ovBox').innerHTML = html;
    ov.classList.add('on');
    ov.onclick = function (e) { if (e.target === ov) { ov.classList.remove('on'); if (onClose) onClose(); } };
  }
  function closeOverlay() { $('#ov').classList.remove('on'); }

  /* ── boot ──────────────────────────────────────────────────────────── */
  try { APP.name = localStorage.getItem('dles_name') || ''; } catch (e) {}
  $('#inName').value = APP.name;
  var qsCode = new URLSearchParams(location.search).get('room');
  if (qsCode) $('#inCode').value = qsCode.toUpperCase();

  $('#inCode').addEventListener('input', function () {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  });

  function readName() {
    var n = $('#inName').value.replace(/\s+/g, ' ').trim().slice(0, 14);
    if (!n) { D.toast('Pick a name first', 'bad'); $('#inName').focus(); return null; }
    APP.name = n;
    try { localStorage.setItem('dles_name', n); } catch (e) {}
    return n;
  }

  $('#btnCreate').addEventListener('click', function () {
    if (!readName()) return;
    var b = this; b.disabled = true; b.textContent = 'Creating…';
    D.NET.create().then(function (code) {
      b.disabled = false; b.textContent = 'Create a room';
      connect(code, true);
    }).catch(function (e) {
      b.disabled = false; b.textContent = 'Create a room';
      D.toast('Could not reach the server — check the URL in Settings', 'bad');
      serverPrompt();
    });
  });

  $('#btnJoin').addEventListener('click', function () {
    if (!readName()) return;
    var code = $('#inCode').value.trim().toUpperCase();
    if (code.length < 4) { D.toast('Room codes are four characters', 'bad'); return; }
    connect(code);
  });

  $('#btnSolo').addEventListener('click', function () {
    if (!readName()) return;
    APP.mode = 'solo';
    Solo.start();
  });

  $('#btnLeave').addEventListener('click', function () {
    if (!confirm('Leave the room?')) return;
    teardown();
    D.NET.close();
    APP.mode = null; APP.state = null;
    $('#roomChip').classList.add('hide');
    $('#btnLeave').classList.add('hide');
    show('vLogin');
  });

  $('#btnStats').addEventListener('click', openStats);
  $('#btnStatsBack').addEventListener('click', function () {
    show(APP.mode ? lastGameView() : 'vLogin');
  });
  function lastGameView() {
    var p = APP.state && APP.state.phase;
    return p === 'play' ? 'vGame' : p === 'roundover' ? 'vRound' : p === 'over' ? 'vMatch' : 'vLobby';
  }

  function serverPrompt() {
    overlay(
      '<h3 style="margin-bottom:10px">Duel server</h3>' +
      '<p class="tiny muted" style="margin:0 0 12px">The lobby, scores and ratings live on a Cloudflare Worker. ' +
      'Point this at yours if you deployed it somewhere else.</p>' +
      '<label class="field"><span>Server URL</span><input id="svUrl" value="' + D.esc(D.NET.server()) + '"></label>' +
      '<button class="btn pri" id="svSave" style="width:100%">Save</button>');
    $('#svSave').addEventListener('click', function () {
      D.NET.setServer($('#svUrl').value.trim());
      closeOverlay();
      D.toast('Server saved');
    });
  }

  /* ── connect ───────────────────────────────────────────────────────── */
  function connect(code, isHost) {
    APP.mode = 'net';
    $('#roomCode').textContent = code;
    $('#roomChip').classList.remove('hide');
    $('#btnLeave').classList.remove('hide');
    dot('wait');
    D.NET.join(code, APP.name, {
      state: onState,
      status: function (s) { dot(s === 'open' ? 'on' : s === 'retry' ? 'wait' : 'off'); },
      note: function (t) { D.toast(t, 'bad'); },
      full: function () {
        D.toast('That room already has two players', 'bad');
        show('vLogin');
      }
    }, isHost);
  }
  function dot(kind) {
    var d = $('#netDot');
    d.className = 'dot ' + (kind === 'on' ? 'on' : kind === 'wait' ? 'wait' : 'off');
  }

  /* ── lobby ─────────────────────────────────────────────────────────── */
  function buildPicker() {
    var host = D.clear($('#gameSel'));
    D.GAMES.forEach(function (g) {
      var t = el('button', 'gtile');
      t.dataset.id = g.id;
      var head = el('div', 'gh');
      var ic = el('span', 'gi'); ic.innerHTML = g.icon;
      head.appendChild(ic); head.appendChild(el('span', 'gn', D.esc(g.name)));
      t.appendChild(head);
      t.appendChild(el('div', 'gb', D.esc(g.blurb)));
      t.appendChild(el('span', 'gtag', D.esc(g.tag)));
      t.appendChild(el('span', 'gk', '✓'));
      t.addEventListener('click', function () {
        var i = APP.sel.indexOf(g.id);
        if (i >= 0) APP.sel.splice(i, 1); else APP.sel.push(g.id);
        syncPicker(); pushConfig();
      });
      host.appendChild(t);
    });
  }

  function syncPicker() {
    /* Games the SERVER did not accept. Happens when the client has shipped a
       game the deployed worker has never heard of — previously they just
       disappeared from the match with no explanation. */
    var confirmed = (APP.mode === 'net' && APP.state && APP.state.games) ? APP.state.games : null;
    var rejected = confirmed
      ? APP.sel.filter(function (id) { return confirmed.indexOf(id) < 0; })
      : [];

    D.$$('#gameSel .gtile').forEach(function (t) {
      var on = APP.sel.indexOf(t.dataset.id) >= 0;
      t.classList.toggle('sel', on);
      t.classList.toggle('bad', on && rejected.indexOf(t.dataset.id) >= 0);
    });
    var live = APP.sel.length - rejected.length;
    $('#selCount').textContent = APP.mode === 'net' ? live : APP.sel.length;
    var isHost = APP.mode === 'solo' || (APP.state && APP.state.you === 0);
    var two = APP.mode === 'solo' || (APP.state && APP.state.online && APP.state.online[0] && APP.state.online[1]);
    var n = APP.mode === 'net' ? live : APP.sel.length;
    $('#btnStart').disabled = !n || !isHost || !two;
    $('#startHint').textContent = !APP.sel.length ? 'Pick at least one game'
      : rejected.length ? rejected.length + ' of these are not on the server yet — redeploy the worker'
      : !isHost ? 'Only the room host can start'
      : !two ? 'Waiting for your opponent to join'
      : n + (n === 1 ? ' round' : ' rounds') + ', best score each';
    D.$$('#orderSeg button').forEach(function (b) {
      b.classList.toggle('on', (b.dataset.order === 'shuffle') === APP.shuffleOrder);
    });
  }

  D.$$('[data-pick]').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.dataset.pick, ids = D.GAMES.map(function (g) { return g.id; });
      if (k === 'all') APP.sel = ids.slice();
      else if (k === 'none') APP.sel = [];
      else {
        var n = k === 'r3' ? 3 : 5;
        var r = D.rng(String(Date.now()) + Math.random());
        APP.sel = D.shuffle(r, ids).slice(0, n);
      }
      syncPicker(); pushConfig();
    });
  });
  D.$$('#orderSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      APP.shuffleOrder = b.dataset.order === 'shuffle';
      syncPicker(); pushConfig();
    });
  });

  function pushConfig() {
    if (APP.mode !== 'net') return;
    if (!APP.state || APP.state.you !== 0) return;
    D.NET.send({ t: 'config', games: APP.sel, shuffleOrder: APP.shuffleOrder });
  }

  $('#btnStart').addEventListener('click', function () {
    if (APP.mode === 'solo') return Solo.begin();
    pushConfig();
    D.NET.send({ t: 'start' });
  });

  function renderSeats(st) {
    var host = D.clear($('#seats'));
    function seat(i) {
      var name = st.names[i], on = st.online[i];
      var s = el('div', 'seat' + (i === st.you ? ' me' : '') + (name ? '' : ' empty'));
      var av = el('div', 'av', name ? D.esc(name[0].toUpperCase()) : '?');
      s.appendChild(av);
      var box = el('div');
      var nm = el('div', 'nm');
      nm.appendChild(document.createTextNode(name || 'Waiting…'));
      var d = el('i', 'dot ' + (on ? 'on' : 'off'));
      nm.appendChild(d);
      box.appendChild(nm);
      var bits = [];
      if (name && st.elos[i] != null) bits.push(st.elos[i] + ' ELO');
      if (name && i === st.you) bits.push('you');
      box.appendChild(el('div', 'el', name ? bits.join(' · ') : 'share the room code'));
      s.appendChild(box);
      return s;
    }
    host.appendChild(seat(0));
    host.appendChild(el('div', 'vs', 'VS'));
    host.appendChild(seat(1));
    var both = st.names[0] && st.names[1];
    $('#lobbyMsg').innerHTML = both
      ? 'Both here. ' + (st.you === 0 ? 'Pick the games and start when ready.' : 'Waiting for the host to start.')
      : 'Send your friend the room code <b class="mono" style="color:var(--ember2);letter-spacing:.2em">' +
        D.esc(st.code || D.NET.code || '') + '</b>' +
        ' — or this link: <span class="mono tiny">' + D.esc(roomLink()) + '</span>';
  }
  function roomLink() {
    return location.origin + location.pathname + '?room=' + (D.NET.code || '');
  }

  function loadH2H(st) {
    if (APP.mode !== 'net' || !st.names[0] || !st.names[1]) { $('#h2h').textContent = '—'; return; }
    D.NET.h2h(st.names[0], st.names[1]).then(function (r) {
      $('#h2h').innerHTML = '<b class="mono" style="font-size:19px;color:var(--ink)">' + r.a + ' – ' + r.b + '</b>' +
        '<div class="tiny dim" style="margin-top:4px">' + D.esc(st.names[0]) + ' vs ' + D.esc(st.names[1]) +
        (r.drawn ? ' · ' + r.drawn + ' drawn' : '') + '</div>';
    }).catch(function () { $('#h2h').textContent = 'No history yet'; });
  }

  /* ── state reconciliation ──────────────────────────────────────────── */
  function onState(st) {
    var prev = APP.state;
    APP.state = st;

    if (st.games && (!prev || prev.phase === 'lobby') && st.you !== 0) {
      APP.sel = st.games.slice();
      APP.shuffleOrder = !!st.shuffleOrder;
    }
    if (!prev) {
      APP.sel = st.games ? st.games.slice() : APP.sel;
      APP.shuffleOrder = !!st.shuffleOrder;
    }
    if (st.code) $('#roomCode').textContent = st.code;

    if (st.phase === 'lobby') {
      teardown();
      renderSeats(st); syncPicker();
      // Reload the head-to-head whenever the pair of names changes — the
      // second player usually arrives after the first lobby frame.
      var pairKey = (st.names[0] || '') + '|' + (st.names[1] || '');
      if (pairKey !== APP.h2hKey) { APP.h2hKey = pairKey; loadH2H(st); }
      show('vLobby');
      return;
    }

    if (st.phase === 'play') {
      var key = st.round + ':' + st.game;
      if (APP.mounted !== key) {
        var wasPlaying = prev && prev.phase === 'play';
        startRound(st, !wasPlaying || prev.round !== st.round);
      } else {
        paintOpp(st);
      }
      show('vGame');
      return;
    }

    if (st.phase === 'roundover') { teardown(); renderRound(st); show('vRound'); return; }
    if (st.phase === 'over') { teardown(); renderMatch(st); show('vMatch'); return; }
  }

  /* ── running a round ───────────────────────────────────────────────── */
  function startRound(st, withCountdown) {
    teardown();
    APP.mounted = st.round + ':' + st.game;
    var def = D.BY_ID[st.game];
    if (!def) { D.toast('Unknown game: ' + st.game, 'bad'); return; }

    $('#gTitle').innerHTML = def.icon + '<span>' + D.esc(def.name) + '</span>';
    $('#gRound').textContent = 'Round ' + (st.round + 1) + ' of ' + st.total;
    var spec = SCORING.SPEC[st.game];
    $('#gPar').textContent = spec.noSpeed ? 'no time bonus'
      : 'full speed bonus under ' + Math.round(spec.fast / 1000) + 's';
    $('#youName').textContent = st.names[st.you] || 'You';
    $('#oppName').textContent = st.names[1 - st.you] || 'Opponent';
    paintPips(st, $('#gPips'));
    $('#gTally').textContent = APP.mode === 'solo' ? 'Practice — nothing is banked'
      : st.wins[0] + ' – ' + st.wins[1];
    $('#btnGiveUp').disabled = false;

    function go() {
      var host = D.clear($('#gameHost'));
      APP.puzzle = def.build(D.rng(st.seed), st.seed);
      APP.finished = false;
      APP.t0 = Date.now();
      APP.lastProg = 0;
      APP.inst = def.mount(host, APP.puzzle, {
        seed: st.seed,
        solo: APP.mode === 'solo',
        elapsed: function () { return Date.now() - APP.t0; },
        progress: function (pct, note) {
          $('#youBar').style.width = Math.max(0, Math.min(100, pct)) + '%';
          $('#youNote').textContent = note || '';
          var now = Date.now();
          if (APP.mode === 'net' && now - APP.lastProg > 450) {
            APP.lastProg = now;
            D.NET.send({ t: 'prog', pct: pct, note: note });
          }
        },
        finish: function (metrics) {
          if (APP.finished) return;
          APP.finished = true;
          metrics = metrics || {};
          metrics.timeMs = Date.now() - APP.t0;
          $('#youBar').style.width = '100%';
          $('#youNote').textContent = 'finished · ' + D.fmtTime(metrics.timeMs);
          $('#btnGiveUp').disabled = true;
          stopClock();
          if (APP.mode === 'solo') Solo.done(metrics);
          else {
            D.NET.send({ t: 'prog', pct: 100, note: 'finished' });
            D.NET.send({ t: 'done', metrics: metrics });
            D.toast('Locked in — waiting for your opponent');
          }
        }
      });
      startClock();
      paintOpp(st);
    }

    if (withCountdown && APP.mode === 'net') countdown(go); else go();
  }

  function countdown(then) {
    var c = $('#count'), n = $('#countN'), v = 3;
    c.classList.add('on'); n.textContent = v;
    var iv = setInterval(function () {
      v--;
      if (v <= 0) {
        clearInterval(iv); c.classList.remove('on');
        then();
        return;
      }
      n.textContent = v;
      n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
    }, 800);
  }

  function startClock() {
    stopClock();
    APP.clock = setInterval(function () {
      $('#clock').textContent = D.fmtTime(Date.now() - APP.t0);
    }, 250);
    $('#clock').textContent = '0:00';
  }
  function stopClock() { clearInterval(APP.clock); APP.clock = null; }

  function paintOpp(st) {
    var o = 1 - st.you;
    var p = st.prog && st.prog[o];
    $('#oppBar').style.width = ((p && p.pct) || 0) + '%';
    $('#oppNote').textContent = st.done && st.done[o] ? 'finished' : ((p && p.note) || 'waiting…');
    $('#oppDot').className = 'dot ' + (st.online[o] ? 'on' : 'off');
  }

  function teardown() {
    stopClock();
    if (APP.inst && APP.inst.destroy) { try { APP.inst.destroy(); } catch (e) {} }
    APP.inst = null;
    APP.mounted = null;
  }

  $('#btnGiveUp').addEventListener('click', function () {
    if (!APP.inst || APP.finished) return;
    if (!confirm('Give up this round? It will be scored as it stands.')) return;
    if (APP.inst.giveUp) APP.inst.giveUp();
  });

  /* ── results ───────────────────────────────────────────────────────── */
  function paintPips(st, host) {
    D.clear(host);
    var res = st.results || [];
    for (var i = 0; i < st.total; i++) {
      var cls = 'pip';
      var r = res[i];
      if (r && r.res && r.res[0] && r.res[1]) {
        var a = r.res[0].score, b = r.res[1].score;
        cls += a === b ? ' d' : (a > b ? ' a' : ' b');
      }
      if (i === st.round) cls += ' cur';
      host.appendChild(el('div', cls));
    }
  }

  function resultRow(st, seatIdx, res, other) {
    var solo = other == null;                     // practice: nothing to lose to
    var win = !solo && res.score > other.score;
    var draw = !solo && res.score === other.score;
    var row = el('div', 'resrow ' + (solo || draw ? '' : win ? 'win' : 'lose'));
    var left = el('div');
    var who = el('div', 'who');
    who.appendChild(el('div', 'av', D.esc((res.name || '?')[0].toUpperCase())));
    who.appendChild(document.createTextNode(res.name || '—'));
    if (!solo) who.appendChild(el('span', 'badge ' + (draw ? 'd' : win ? 'w' : 'l'),
      draw ? 'draw' : win ? 'win' : 'loss'));
    left.appendChild(who);
    var chips = el('div', 'metrics');
    (res.gone ? ['left the room'] : SCORING.chips(st.game || (st.results && st.results[st.round] && st.results[st.round].game), res.metrics))
      .forEach(function (c) { chips.appendChild(el('span', '', D.esc(c))); });
    left.appendChild(chips);
    var brk = el('div', 'scorebreak');
    brk.appendChild(el('i', '', 'accuracy ' + (res.accPts != null ? res.accPts : 0)));
    brk.appendChild(el('i', '', 'speed ' + (res.speedPts != null ? res.speedPts : 0)));
    left.appendChild(brk);
    row.appendChild(left);
    row.appendChild(el('div', 'sc', String(res.score)));
    return row;
  }

  function renderRound(st) {
    var r = st.results[st.round];
    var def = D.BY_ID[r.game];
    $('#rTitle').textContent = 'Round ' + (st.round + 1) + ' of ' + st.total + ' · ' + (def ? def.name : r.game);
    var a = r.res[0], b = r.res[1];
    var mine = r.res[st.you], theirs = r.res[1 - st.you];
    $('#rVerdict').textContent = APP.mode === 'solo' ? 'Scored ' + mine.score
      : mine.score === theirs.score ? 'Round drawn'
      : mine.score > theirs.score ? 'You took the round' : st.names[1 - st.you] + ' took the round';

    var host = D.clear($('#rRows'));
    var ctx = { game: r.game };
    if (APP.mode === 'solo') {
      host.appendChild(resultRow(ctx, st.you, mine, null));
    } else {
      host.appendChild(resultRow(ctx, 0, a, b));
      host.appendChild(resultRow(ctx, 1, b, a));
    }
    $('#rAnswer').innerHTML = APP.puzzle && def && def.answerText
      ? 'Answer: <b style="color:var(--ink)">' + D.esc(def.answerText(APP.puzzle)) + '</b>' : '';
    paintPips(st, $('#rPips'));
    var last = st.round + 1 >= st.total;
    $('#btnNext').textContent = last ? 'See the final result' : 'Next game';
    $('#btnNext').disabled = false;
    $('#rWait').textContent = APP.mode === 'solo' ? ''
      : (st.next && st.next[1 - st.you] ? st.names[1 - st.you] + ' is ready' : '');
    if (APP.mode === 'net' && st.next && st.next[st.you]) {
      $('#btnNext').disabled = true;
      $('#btnNext').textContent = 'Waiting for ' + (st.names[1 - st.you] || 'opponent') + '…';
    }
  }

  $('#btnNext').addEventListener('click', function () {
    this.disabled = true;
    if (APP.mode === 'solo') Solo.next();
    else D.NET.send({ t: 'next' });
  });

  function renderMatch(st) {
    var mine = st.wins[st.you], theirs = st.wins[1 - st.you];
    $('#mVerdict').textContent = APP.mode === 'solo' ? 'Practice complete'
      : mine === theirs ? 'Dead heat' : mine > theirs ? 'You win' : (st.names[1 - st.you] || 'Opponent') + ' wins';

    var t = D.clear($('#mTally'));
    if (APP.mode === 'solo') {
      var total = st.results.reduce(function (s, r) { return s + (r.res[0] ? r.res[0].score : 0); }, 0);
      t.appendChild(el('div', 'n lead', String(total)));
      t.appendChild(el('div', 'mid', 'TOTAL POINTS'));
    } else {
      t.appendChild(el('div', 'n' + (st.wins[0] >= st.wins[1] ? ' lead' : ''), String(st.wins[0])));
      t.appendChild(el('div', 'mid', D.esc(st.names[0] || '') + '  vs  ' + D.esc(st.names[1] || '')));
      t.appendChild(el('div', 'n' + (st.wins[1] >= st.wins[0] ? ' lead' : ''), String(st.wins[1])));
    }

    var e = D.clear($('#mElo'));
    if (APP.mode === 'net' && st.eloDelta) {
      var d = st.eloDelta;
      [0, 1].forEach(function (i) {
        var box = el('span');
        box.style.cssText = 'display:inline-block;margin:0 12px';
        box.innerHTML = '<span class="tiny dim">' + D.esc(st.names[i] || '') + '</span><br>' +
          '<span class="elo">' + d.after[i] + '</span> ' +
          '<span class="delta ' + (d.d[i] >= 0 ? 'up' : 'dn') + '">' + (d.d[i] >= 0 ? '+' : '') + d.d[i] + '</span>';
        e.appendChild(box);
      });
    }

    var tbl = D.clear($('#mTable'));
    var head = el('tr');
    head.innerHTML = '<th>Round</th><th>Game</th>' +
      (APP.mode === 'solo' ? '<th class="num">Score</th>'
        : '<th class="num">' + D.esc(st.names[0] || 'P1') + '</th><th class="num">' + D.esc(st.names[1] || 'P2') + '</th>');
    tbl.appendChild(head);
    st.results.forEach(function (r, i) {
      var def = D.BY_ID[r.game];
      var tr = el('tr');
      tr.appendChild(el('td', '', String(i + 1)));
      tr.appendChild(el('td', '', D.esc(def ? def.name : r.game)));
      if (APP.mode === 'solo') {
        tr.appendChild(el('td', 'num', String(r.res[0] ? r.res[0].score : 0)));
      } else {
        var a = r.res[0] ? r.res[0].score : 0, b = r.res[1] ? r.res[1].score : 0;
        var ta = el('td', 'num', String(a)), tb = el('td', 'num', String(b));
        if (a > b) ta.style.color = 'var(--good)'; else if (b > a) tb.style.color = 'var(--good)';
        tr.appendChild(ta); tr.appendChild(tb);
      }
      tbl.appendChild(tr);
    });

    $('#btnRematch').textContent = APP.mode === 'solo' ? 'Play again' : 'Rematch';
    $('#btnRematch').disabled = false;
    $('#mWait').textContent = APP.mode === 'net' && st.rematch && st.rematch[1 - st.you]
      ? (st.names[1 - st.you] || 'Opponent') + ' wants a rematch' : '';
    if (APP.mode === 'net' && st.rematch && st.rematch[st.you]) {
      $('#btnRematch').disabled = true;
      $('#btnRematch').textContent = 'Waiting…';
    }
  }

  $('#btnRematch').addEventListener('click', function () {
    this.disabled = true;
    if (APP.mode === 'solo') Solo.begin();
    else D.NET.send({ t: 'rematch' });
  });
  $('#btnLobby').addEventListener('click', function () {
    if (APP.mode === 'solo') { Solo.toLobby(); return; }
    D.NET.send({ t: 'lobby' });
  });

  /* ── stats ─────────────────────────────────────────────────────────── */
  function openStats() {
    show('vStats');
    var lad = D.clear($('#ladder')), hist = D.clear($('#history')), gs = D.clear($('#gstats'));
    lad.innerHTML = '<tr><td class="dim">Loading…</td></tr>';
    D.NET.stats().then(function (s) {
      D.clear(lad);
      var h = el('tr');
      h.innerHTML = '<th>#</th><th>Player</th><th class="num">ELO</th><th class="num">W</th><th class="num">L</th><th class="num">D</th>';
      lad.appendChild(h);
      if (!s.ladder.length) lad.appendChild(rowSpan(6, 'No matches played yet.'));
      s.ladder.forEach(function (p, i) {
        var tr = el('tr');
        tr.innerHTML = '<td class="dim">' + (i + 1) + '</td><td><b>' + D.esc(p.name) + '</b></td>' +
          '<td class="num elo">' + p.elo + '</td><td class="num">' + p.won + '</td>' +
          '<td class="num">' + p.lost + '</td><td class="num">' + p.drawn + '</td>';
        lad.appendChild(tr);
      });

      D.clear(hist);
      var h2 = el('tr');
      h2.innerHTML = '<th>When</th><th>Match</th><th class="num">Score</th><th class="num">ELO</th>';
      hist.appendChild(h2);
      if (!s.recent.length) hist.appendChild(rowSpan(4, 'Nothing yet.'));
      s.recent.forEach(function (m) {
        var tr = el('tr');
        var games = [];
        try { games = JSON.parse(m.games) || []; } catch (e) {}
        tr.innerHTML = '<td class="dim tiny">' + ago(m.ts) + '</td>' +
          '<td><b>' + D.esc(m.p1) + '</b> vs <b>' + D.esc(m.p2) + '</b>' +
          '<div class="tiny dim">' + D.esc(games.map(function (g) {
            return D.BY_ID[g] ? D.BY_ID[g].name : g;
          }).join(', ')) + '</div></td>' +
          '<td class="num">' + m.s1 + ' – ' + m.s2 + '</td>' +
          '<td class="num tiny"><span class="delta ' + (m.d1 >= 0 ? 'up' : 'dn') + '">' + (m.d1 >= 0 ? '+' : '') + m.d1 + '</span>' +
          ' / <span class="delta ' + (m.d2 >= 0 ? 'up' : 'dn') + '">' + (m.d2 >= 0 ? '+' : '') + m.d2 + '</span></td>';
        hist.appendChild(tr);
      });

      D.clear(gs);
      var h3 = el('tr');
      h3.innerHTML = '<th>Game</th><th>Record holder</th><th class="num">Best score</th>';
      gs.appendChild(h3);
      if (!s.best.length) gs.appendChild(rowSpan(3, 'No rounds recorded yet.'));
      s.best.forEach(function (b) {
        var def = D.BY_ID[b.game];
        var tr = el('tr');
        tr.innerHTML = '<td>' + D.esc(def ? def.name : b.game) + '</td><td><b>' + D.esc(b.player || '—') + '</b></td>' +
          '<td class="num elo">' + b.score + '</td>';
        gs.appendChild(tr);
      });
    }).catch(function () {
      D.clear(lad);
      lad.appendChild(rowSpan(1, 'Could not reach the server.'));
    });
  }
  function rowSpan(n, text) {
    var tr = el('tr');
    var td = el('td', 'dim', D.esc(text));
    td.colSpan = n; tr.appendChild(td); return tr;
  }
  function ago(ts) {
    var s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  /* ── solo ──────────────────────────────────────────────────────────── */
  /* Emits the same state frames the server would, so everything above works
     unchanged. Nothing here is banked — solo never touches ELO. */
  var Solo = {
    st: null,
    start: function () {
      $('#roomChip').classList.add('hide');
      $('#btnLeave').classList.remove('hide');
      Solo.st = {
        t: 'state', phase: 'lobby', you: 0, code: 'SOLO',
        names: [APP.name, 'Practice'], elos: [null, null], online: [true, true],
        games: APP.sel.length ? APP.sel : ['wordle'], shuffleOrder: APP.shuffleOrder,
        round: 0, total: 0, wins: [0, 0], game: null, seed: null,
        prog: [null, null], done: [false, false], results: [], next: [false, false],
        rematch: [false, false], eloDelta: null
      };
      onState(Solo.st);
    },
    begin: function () {
      var order = APP.sel.slice();
      if (APP.shuffleOrder) order = D.shuffle(D.rng(String(Date.now())), order);
      Solo.order = order;
      Solo.seedBase = 'solo-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
      Solo.rounds = [];
      var st = Solo.st;
      st.round = 0; st.total = order.length; st.wins = [0, 0]; st.results = [];
      Solo.open();
    },
    open: function () {
      var st = Solo.st, g = Solo.order[st.round];
      Solo.rounds[st.round] = { game: g, res: [null, null] };
      st.phase = 'play'; st.game = g;
      st.seed = Solo.seedBase + ':' + st.round + ':' + g;
      st.prog = [null, null]; st.done = [false, false];
      st.results = Solo.rounds.slice(0, st.round);   // finished rounds keep their pips
      onState(st);
    },
    done: function (metrics) {
      var st = Solo.st, r = Solo.rounds[st.round];
      var sc = SCORING.score(r.game, metrics);
      r.res[0] = { name: APP.name, score: sc.total, accPts: sc.accPts, speedPts: sc.speedPts, metrics: metrics };
      st.phase = 'roundover';
      st.results = Solo.rounds.slice(0, st.round + 1);
      onState(st);
    },
    next: function () {
      var st = Solo.st;
      if (st.round + 1 >= Solo.order.length) {
        st.phase = 'over';
        st.results = Solo.rounds.slice();
        onState(st);
        return;
      }
      st.round++;
      Solo.open();
    },
    toLobby: function () {
      var st = Solo.st;
      st.phase = 'lobby'; st.results = []; st.round = 0; st.wins = [0, 0];
      onState(st);
    }
  };

  /* ── go ────────────────────────────────────────────────────────────── */
  buildPicker();
  APP.sel = ['wordle', 'connections', 'globle'];
  syncPicker();
  if (qsCode && APP.name) {
    // Deep link: join straight away when we already know who you are.
    connect(qsCode.toUpperCase());
  }
  window.addEventListener('beforeunload', function () { D.NET.close(); });
})(window.DLES);
