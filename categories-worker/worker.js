/* CATEGORIES duel server — Cloudflare Worker + Durable Object rooms.
   One Room DO per 4-letter lobby code, two seats.

   Unlike the deadspin relay this server is AUTHORITATIVE: each player's
   secret category lives only here and is never included in the other
   player's state frame until the game is over. A tampered client cannot
   read it because it was never sent. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I/L/O — unambiguous
const MAXTXT = 140;

const live = s => !!s && !!s.ws && s.ws.readyState === 1;
const clean = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

export class Room {
  constructor() {
    this.seats = [];          // up to 2: {ws,name,cat,picks:[]}
    this.reset(true);
  }

  reset(hard) {
    this.phase = 'setup';     // setup | play | over
    this.turn = 0;
    this.pending = null;      // {by,i,n} character awaiting a yes/no
    this.guess = null;        // {by,text} awaiting a verdict
    this.winner = null;
    this.rematch = new Set();
    for (const s of this.seats) { s.cat = null; s.picks = []; }
    if (hard) this.seats = [];
  }

  seatOf(ws) { return this.seats.find(s => s.ws === ws); }

  view(me) {
    const i = this.seats.indexOf(me);
    const opp = this.seats[1 - i];
    const over = this.phase === 'over';
    return {
      t: 'state',
      you: i,
      phase: this.phase,
      turn: this.turn,
      names: [this.seats[0]?.name || null, this.seats[1]?.name || null],
      online: [live(this.seats[0]), live(this.seats[1])],
      locked: [!!this.seats[0]?.cat, !!this.seats[1]?.cat],
      myCat: me.cat || null,
      // the whole point: only revealed once someone has won
      oppCat: over ? (opp?.cat || null) : null,
      picks: [this.seats[0]?.picks || [], this.seats[1]?.picks || []],
      pending: this.pending,
      guess: this.guess,
      winner: this.winner,
      rematch: this.seats.map(s => this.rematch.has(s)),
    };
  }

  push() {
    for (const s of this.seats) {
      if (!live(s)) continue;
      try { s.ws.send(JSON.stringify(this.view(s))); } catch (e) {}
    }
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (!url.pathname.endsWith('/ws')) return new Response('room', { headers: CORS });
    if (req.headers.get('Upgrade') !== 'websocket')
      return new Response('expected websocket', { status: 426, headers: CORS });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.handle(server, clean(url.searchParams.get('name'), 14) || 'Player');
    return new Response(null, { status: 101, webSocket: client });
  }

  handle(ws, name) {
    ws.accept();
    // Reclaim a seat whose socket dropped — free reconnects mid-game.
    // Prefer the seat with a matching name so a double drop can't swap sides.
    let seat = this.seats.find(s => !live(s) && s.name === name)
            || this.seats.find(s => !live(s));
    if (!seat) {
      if (this.seats.length >= 2) {
        try { ws.send(JSON.stringify({ t: 'full' })); ws.close(1000, 'full'); } catch (e) {}
        return;
      }
      seat = { ws: null, name, cat: null, picks: [] };
      this.seats.push(seat);
    }
    seat.ws = ws;
    seat.name = name;
    ws.addEventListener('message', ev => this.onMsg(ws, ev));
    ws.addEventListener('close', () => this.push());
    ws.addEventListener('error', () => this.push());
    this.push();
  }

  onMsg(ws, ev) {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    const me = this.seatOf(ws);
    if (!me) return;
    const i = this.seats.indexOf(me), opp = this.seats[1 - i];
    const mine = this.turn === i;

    switch (m.t) {
      case 'category': {
        if (this.phase !== 'setup') break;
        const txt = clean(m.text, MAXTXT);
        if (!txt) break;
        me.cat = txt;
        if (this.seats.length === 2 && this.seats.every(s => s.cat)) {
          this.phase = 'play';
          this.turn = Math.random() < 0.5 ? 0 : 1;
        }
        break;
      }

      case 'unlock':                       // take it back while still in setup
        if (this.phase === 'setup') me.cat = null;
        break;

      // On your turn you either probe with a character OR call the category.
      case 'pick': {
        if (this.phase !== 'play' || !mine || this.pending || this.guess) break;
        if (!Number.isInteger(m.i) || m.i < 0 || m.i > 9999) break;
        if (!live(opp)) break;
        this.pending = { by: i, i: m.i, n: clean(m.n, 60) };
        break;
      }

      case 'answer': {                     // only the probed player answers
        if (!this.pending || this.pending.by === i) break;
        this.seats[this.pending.by].picks.push({
          i: this.pending.i, n: this.pending.n, yes: !!m.yes,
        });
        this.pending = null;
        this.turn = 1 - this.turn;
        break;
      }

      case 'guess': {
        if (this.phase !== 'play' || !mine || this.pending || this.guess) break;
        const txt = clean(m.text, MAXTXT);
        if (!txt || !live(opp)) break;
        this.guess = { by: i, text: txt };
        break;
      }

      case 'judge': {                      // only the guessed-at player rules
        if (!this.guess || this.guess.by === i) break;
        if (m.ok) {
          this.winner = this.guess.by;
          this.phase = 'over';
        } else {
          this.guess = null;
          this.turn = 1 - this.turn;       // a wrong call burns your turn
        }
        break;
      }

      case 'rematch': {
        if (this.phase !== 'over') break;
        this.rematch.add(me);
        if (this.seats.length === 2 && this.seats.every(s => this.rematch.has(s))) {
          this.reset(false);
        }
        break;
      }

      case 'chat': {
        const txt = clean(m.text, MAXTXT);
        if (txt && live(opp)) {
          try { opp.ws.send(JSON.stringify({ t: 'chat', from: me.name, text: txt })); } catch (e) {}
          try { me.ws.send(JSON.stringify({ t: 'chat', from: me.name, text: txt, own: 1 })); } catch (e) {}
        }
        return;                             // no state change
      }

      default: return;
    }
    this.push();
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

    if (url.pathname === '/') return new Response('categories duel server', { headers: CORS });
    return new Response('not found', { status: 404, headers: CORS });
  },
};
