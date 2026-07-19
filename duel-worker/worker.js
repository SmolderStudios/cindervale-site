/* DEADSPIN duel relay — Cloudflare Worker + Durable Object rooms.
   One Room DO per 4-letter lobby code; holds up to 2 WebSockets and
   relays an allowlisted set of messages between them. No storage,
   no accounts — rooms are ephemeral. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I/L/O — unambiguous
const RELAY = new Set(['state', 'hex', 'hexAck', 'played', 'death', 'give', 'beg']);

export class Room {
  constructor(state, env) {
    this.sockets = [];      // [{ws, name}]
    this.rematch = new Set();
  }

  alive() {
    this.sockets = this.sockets.filter(s => s.ws.readyState === 1);
    return this.sockets;
  }

  broadcast(obj) {
    const msg = JSON.stringify(obj);
    for (const s of this.alive()) { try { s.ws.send(msg); } catch (e) {} }
  }

  other(ws) {
    return this.alive().find(s => s.ws !== ws);
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (!url.pathname.endsWith('/ws')) return new Response('room', { headers: CORS });
    if (req.headers.get('Upgrade') !== 'websocket')
      return new Response('expected websocket', { status: 426, headers: CORS });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const name = (url.searchParams.get('name') || 'Player').slice(0, 14);
    this.handle(server, name);
    return new Response(null, { status: 101, webSocket: client });
  }

  handle(ws, name) {
    ws.accept();
    if (this.alive().length >= 2) {
      try { ws.send(JSON.stringify({ t: 'full' })); ws.close(1000, 'full'); } catch (e) {}
      return;
    }
    this.sockets.push({ ws, name });
    ws.addEventListener('message', ev => this.onMsg(ws, ev));
    ws.addEventListener('close', () => this.onGone(ws));
    ws.addEventListener('error', () => this.onGone(ws));
    this.broadcast({ t: 'roster', names: this.alive().map(s => s.name) });
    if (this.alive().length === 2) {
      this.rematch.clear();
      this.broadcast({ t: 'start', names: this.alive().map(s => s.name) });
    }
  }

  onMsg(ws, ev) {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'rematch') {
      this.rematch.add(ws);
      const o = this.other(ws);
      if (o) { try { o.ws.send(JSON.stringify({ t: 'rematchReq' })); } catch (e) {} }
      const live = this.alive();
      if (live.length === 2 && live.every(s => this.rematch.has(s.ws))) {
        this.rematch.clear();
        this.broadcast({ t: 'start', names: live.map(s => s.name) });
      }
      return;
    }
    if (!RELAY.has(m.t)) return;
    const o = this.other(ws);
    if (o) { try { o.ws.send(JSON.stringify(m)); } catch (e) {} }
  }

  onGone(ws) {
    this.rematch.delete(ws);
    const wasIn = this.sockets.some(s => s.ws === ws);
    this.sockets = this.sockets.filter(s => s.ws !== ws);
    if (wasIn) this.broadcast({ t: 'gone' });
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname === '/create') {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      return new Response(JSON.stringify({ code }), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,6})\/ws$/);
    if (m) {
      const id = env.ROOM.idFromName(m[1].toUpperCase());
      return env.ROOM.get(id).fetch(req);
    }

    if (url.pathname === '/') return new Response('deadspin duel relay', { headers: CORS });
    return new Response('not found', { status: 404, headers: CORS });
  },
};
