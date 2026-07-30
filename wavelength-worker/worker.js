/* SPECTRUM server — Cloudflare Worker + Durable Object rooms.
   One Room DO per 4-letter lobby code, two seats.

   AUTHORITATIVE, like the categories server and unlike the deadspin relay.
   The round's hidden target lives only here. It is sent to the PSYCHIC's seat
   only, and to both seats once the round is revealed — so a guesser poking at
   devtools has nothing to read, because it was never sent to them.

   The card deck itself is NOT here: the host uploads a manifest of
   {categoryId: cardCount} at lobby time and the server picks {c,i} pairs out of
   that. Keeps ~450 spectrum pairs in exactly one file (the client) while the
   server still owns the draw. `dv` (deck version) is echoed back so a client
   running an older cached deck can tell the players to refresh. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I/L/O — unambiguous
const MAXTXT = 140;
const MAXCLUE = 60;
const SKIPS = 3;            // shared card swaps per game
const EDGE = 10;            // target never lands where a band would fall off
const BANDS = [[2.5, 4], [6, 3], [10, 2]];

const live = s => !!s && !!s.ws && s.ws.readyState === 1;
const clean = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const score = (guess, target) => {
  const d = Math.abs(guess - target);
  for (const [w, p] of BANDS) if (d <= w) return p;
  return 0;
};

export class Room {
  constructor() {
    this.seats = [];                    // up to 2: {ws,name}
    this.cfg = { cats: { gen: 1 }, rounds: 10, dv: 0 };
    this.reset(true);
  }

  reset(hard) {
    this.phase = 'lobby';               // lobby | clue | guess | reveal | over
    this.round = 0;
    this.psychic = 0;
    this.card = null;                   // {c,i}
    this.target = 0;
    this.clue = '';
    this.guess = null;
    this.aim = null;            // the guesser's needle while they are still moving it
    this.pts = 0;
    this.skips = SKIPS;
    this.total = 0;
    this.psy = [0, 0];                  // points scored while each seat gave the clue
    this.gs = [0, 0];                   // points scored while each seat guessed
    this.bull = 0;
    this.hist = [];
    this.used = new Set();
    if (hard) this.seats = [];
  }

  seatOf(ws) { return this.seats.find(s => s.ws === ws); }

  /* uniform over every card in every enabled category, without repeats */
  draw() {
    const pool = [];
    for (const c of Object.keys(this.cfg.cats)) {
      const n = this.cfg.cats[c];
      for (let i = 0; i < n; i++) if (!this.used.has(c + ':' + i)) pool.push({ c, i });
    }
    if (!pool.length) { this.used.clear(); return this.draw(); }
    const k = pool[Math.floor(Math.random() * pool.length)];
    this.used.add(k.c + ':' + k.i);
    return k;
  }

  newRound(first) {
    this.round = first ? 1 : this.round + 1;
    this.psychic = first ? (Math.random() < 0.5 ? 0 : 1) : 1 - this.psychic;
    this.card = this.draw();
    this.target = EDGE + Math.random() * (100 - 2 * EDGE);
    this.clue = '';
    this.guess = null;
    this.aim = null;
    this.pts = 0;
    this.phase = 'clue';
  }

  view(me) {
    const i = this.seats.indexOf(me);
    const shown = this.phase === 'reveal' || this.phase === 'over' || i === this.psychic;
    return {
      t: 'state',
      dv: this.cfg.dv,
      you: i,
      phase: this.phase,
      names: [this.seats[0]?.name || null, this.seats[1]?.name || null],
      online: [live(this.seats[0]), live(this.seats[1])],
      cfg: this.cfg,
      round: this.round,
      rounds: this.cfg.rounds,
      psychic: this.psychic,
      card: this.card,
      clue: this.clue,
      guess: this.guess,
      // where they are hovering right now — only meaningful mid-guess, and only
      // the psychic has any use for it
      aim: this.phase === 'guess' ? this.aim : null,
      // the whole point: a guesser is never sent the target mid-round
      target: this.phase === 'lobby' ? null : (shown ? this.target : null),
      pts: this.pts,
      skips: this.skips,
      total: this.total,
      psy: this.psy,
      gs: this.gs,
      bull: this.bull,
      hist: this.hist,
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
      seat = { ws: null, name };
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
    const host = i === 0;
    const lobby = this.phase === 'lobby' || this.phase === 'over';

    switch (m.t) {
      case 'cfg': {                       // host owns the settings
        if (!host || !lobby) break;
        const cats = {};
        if (m.cats && typeof m.cats === 'object') {
          for (const k of Object.keys(m.cats).slice(0, 64)) {
            const n = m.cats[k];
            if (/^[a-z0-9_]{1,16}$/.test(k) && Number.isInteger(n) && n > 0 && n <= 4000) cats[k] = n;
          }
        }
        if (!Object.keys(cats).length) break;
        const r = [5, 10, 15, 0].includes(m.rounds) ? m.rounds : 10;
        this.cfg = { cats, rounds: r, dv: Number.isInteger(m.dv) ? m.dv : 0 };
        break;
      }

      case 'start': {
        if (!host || !lobby) break;
        if (this.seats.length < 2 || !live(opp)) break;
        this.reset(false);
        this.newRound(true);
        break;
      }

      case 'clue': {
        if (this.phase !== 'clue' || i !== this.psychic) break;
        const txt = clean(m.text, MAXCLUE);
        if (!txt) break;
        this.clue = txt;
        this.phase = 'guess';
        break;
      }

      case 'skip': {                      // dealt an impossible spectrum
        if (this.phase !== 'clue' || i !== this.psychic || this.skips <= 0) break;
        this.skips--;
        this.card = this.draw();
        this.target = EDGE + Math.random() * (100 - 2 * EDGE);
        break;
      }

      /* Live needle. Relayed straight to the psychic instead of pushed as state:
         this arrives ~10x a second while they drag, and a full frame each time
         would be silly. Kept on the room too, so a psychic who reloads mid-guess
         still picks the needle up. */
      case 'aim': {
        if (this.phase !== 'guess' || i === this.psychic) break;
        const v = Number(m.v);
        if (!isFinite(v) || v < 0 || v > 100) break;
        this.aim = v;
        const p = this.seats[this.psychic];
        if (live(p)) { try { p.ws.send(JSON.stringify({ t: 'aim', v })); } catch (e) {} }
        return;                            // no state push
      }

      case 'guess': {
        if (this.phase !== 'guess' || i === this.psychic) break;
        const v = Number(m.v);
        if (!isFinite(v) || v < 0 || v > 100) break;
        this.guess = v;
        this.pts = score(v, this.target);
        this.total += this.pts;
        this.psy[this.psychic] += this.pts;
        this.gs[i] += this.pts;
        if (this.pts === 4) this.bull++;
        this.hist.unshift({
          n: this.round, c: this.card, clue: this.clue,
          g: v, t: this.target, p: this.pts, by: this.psychic,
        });
        if (this.hist.length > 40) this.hist.pop();
        this.phase = 'reveal';
        break;
      }

      case 'next': {                      // either player may advance
        if (this.phase !== 'reveal') break;
        if (this.cfg.rounds && this.round >= this.cfg.rounds) this.phase = 'over';
        else this.newRound(false);
        break;
      }

      case 'stop': {                       // end an endless run early
        if (this.phase === 'lobby' || this.phase === 'over') break;
        this.phase = 'over';
        break;
      }

      case 'again': {
        if (this.phase !== 'over') break;
        const cfg = this.cfg;
        this.reset(false);
        this.cfg = cfg;
        break;
      }

      case 'chat': {
        const txt = clean(m.text, MAXTXT);
        if (txt && live(opp)) {
          try { opp.ws.send(JSON.stringify({ t: 'chat', from: me.name, text: txt })); } catch (e) {}
          try { me.ws.send(JSON.stringify({ t: 'chat', from: me.name, text: txt, own: 1 })); } catch (e) {}
        }
        return;                            // no state change
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

    if (url.pathname === '/') return new Response('spectrum server', { headers: CORS });
    return new Response('not found', { status: 404, headers: CORS });
  },
};
