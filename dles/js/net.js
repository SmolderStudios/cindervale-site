/* ═══ NET ═══════════════════════════════════════════════════════════════
   Thin WebSocket client for the duel server. It reconnects on its own and
   re-announces the same name, because the room reclaims a dropped seat by
   name — so a dead wifi moment costs you the round's clock, not the match.
═══════════════════════════════════════════════════════════════════════════ */
(function (D) {
  'use strict';

  var DEFAULT = 'https://dles-duel.may23jordan.workers.dev';

  function base() {
    var q = new URLSearchParams(location.search).get('server');
    if (q) { try { localStorage.setItem('dles_server', q); } catch (e) {} return q.replace(/\/$/, ''); }
    var s = null;
    try { s = localStorage.getItem('dles_server'); } catch (e) {}
    return (s || DEFAULT).replace(/\/$/, '');
  }

  var NET = D.NET = {
    ws: null, code: null, name: null, on: {},
    tries: 0, closedByUs: false, timer: null,
    /* Bumped on every join() and every open(). A socket's own handlers carry
       the generation they were created in and go silent once it moves on —
       without this, an old socket's `close` event triggers a reconnect for
       the session that replaced it, and the server then answers "room full"
       to a client that is already sitting in the room. */
    gen: 0,

    server: base,
    setServer: function (u) { try { localStorage.setItem('dles_server', u.replace(/\/$/, '')); } catch (e) {} },

    api: function (path) {
      return fetch(base() + path, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    },

    create: function () { return NET.api('/create').then(function (j) { return j.code; }); },
    stats: function () { return NET.api('/stats'); },
    h2h: function (a, b) {
      return NET.api('/h2h?a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b));
    },

    /* isHost: this client created the room, so it should claim seat 0 even if
       the other player's connection is served first. */
    join: function (code, name, handlers, isHost) {
      NET.close();
      NET.code = String(code).toUpperCase();
      NET.name = name;
      NET.isHost = !!isHost;
      NET.on = handlers || {};
      NET.closedByUs = false;
      NET.tries = 0;
      NET.gen++;                       // orphan anything still attached
      NET.open();
    },

    open: function () {
      var gen = ++NET.gen;
      var url = base().replace(/^http/, 'ws') + '/room/' + NET.code + '/ws?name=' + encodeURIComponent(NET.name) +
                (NET.isHost ? '&host=1' : '');
      var ws;
      try { ws = new WebSocket(url); } catch (e) { return NET.retry(); }
      NET.ws = ws;
      var stale = function () { return gen !== NET.gen; };

      ws.onopen = function () {
        if (stale()) { try { ws.close(); } catch (e) {} return; }
        NET.tries = 0;
        if (NET.on.status) NET.on.status('open');
      };
      ws.onmessage = function (ev) {
        if (stale()) return;
        var m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'full') { NET.closedByUs = true; if (NET.on.full) NET.on.full(); return; }
        if (m.t === 'state' && NET.on.state) return NET.on.state(m);
        if (m.t === 'chat' && NET.on.chat) return NET.on.chat(m);
        if (m.t === 'note' && NET.on.note) return NET.on.note(m.text);
      };
      ws.onclose = function () {
        if (stale()) return;
        if (NET.on.status) NET.on.status('closed');
        if (!NET.closedByUs) NET.retry();
      };
      ws.onerror = function () { /* onclose always follows */ };
    },

    retry: function () {
      if (NET.closedByUs) return;
      NET.tries++;
      if (NET.on.status) NET.on.status('retry');
      var wait = Math.min(8000, 600 * Math.pow(1.7, NET.tries - 1));
      clearTimeout(NET.timer);
      NET.timer = setTimeout(function () { NET.open(); }, wait);
    },

    send: function (obj) {
      if (!NET.ws || NET.ws.readyState !== 1) return false;
      try { NET.ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
    },

    close: function () {
      NET.closedByUs = true;
      NET.gen++;
      clearTimeout(NET.timer);
      if (NET.ws) { try { NET.ws.close(); } catch (e) {} }
      NET.ws = null;
    },

    connected: function () { return !!NET.ws && NET.ws.readyState === 1; }
  };
})(window.DLES);
