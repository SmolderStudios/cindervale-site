/* ═══ SCORING ═══════════════════════════════════════════════════════════
   ONE copy of the scoring rules, loaded by both the browser client and the
   Cloudflare Worker (which imports this file, so the server number is always
   the number the player was shown).

   Every game reports a small bag of RAW metrics. The score is derived here —
   games never hand us a score directly, so a hacked client has to lie about
   something checkable (guesses, mistakes, elapsed time) rather than just
   claiming 1000.

       total = accuracy × (700 + 300 × speed)

   Speed is a MULTIPLIER on accuracy, not an independent pot. An earlier
   version added them, which meant giving up on the first second of Waffle
   banked ~340 points for nothing — the four free corner letters were enough
   accuracy to unlock the full speed bonus. Scaling by accuracy makes a fast
   bad round worth what it should be: almost nothing.

   Timed games (Spelling Bee) set noSpeed and scale accuracy to the full 1000
   instead, because there the clock already IS the game.
═══════════════════════════════════════════════════════════════════════════ */
(function (G) {
  'use strict';

  var ACC_MAX = 700, SPD_MAX = 300;

  var clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };

  /* Solved in `g` of `max` guesses → 1.0 down to `floor`. Unsolved → `partial`. */
  function byGuess(solved, g, max, floor, partial) {
    if (!solved) return partial || 0;
    if (max <= 1) return 1;
    var used = clamp(g, 1, max);
    return 1 - ((used - 1) / (max - 1)) * (1 - floor);
  }

  /* Mistake-limited games: every mistake costs an equal slice. */
  function byMistake(done, m, maxM, floor) {
    if (!done) return 0;
    return 1 - (clamp(m, 0, maxM) / maxM) * (1 - floor);
  }

  var n = function (v) { return typeof v === 'number' && isFinite(v) ? v : 0; };
  var b = function (v) { return !!v; };

  /* ── per-game rules ────────────────────────────────────────────────── */
  var SPEC = {
    wordle:   { fast: 40e3,  slow: 210e3,
      acc: function (m) { return byGuess(b(m.solved), n(m.guesses), 6, .34, .05 * (n(m.greens) / 5)); },
      chips: function (m) { return [b(m.solved) ? n(m.guesses) + '/6 guesses' : 'unsolved']; } },

    quordle: { fast: 110e3, slow: 430e3,
      acc: function (m) {
        var solved = clamp(n(m.solvedCount), 0, 4), all = solved === 4;
        var base = solved / 4 * .55;                       // credit per word solved
        return all ? .55 + .45 * byGuess(true, n(m.guesses), 9, .1) : base;
      },
      chips: function (m) { return [n(m.solvedCount) + '/4 words', n(m.guesses) + ' guesses']; } },

    connections: { fast: 60e3, slow: 320e3,
      acc: function (m) {
        var g = clamp(n(m.groups), 0, 4);
        if (g === 4) return byMistake(true, n(m.mistakes), 4, .38);
        return g / 4 * .3;
      },
      chips: function (m) { return [n(m.groups) + '/4 groups', n(m.mistakes) + ' mistakes']; } },

    /* Every generated waffle is exactly `par` swaps from solved, so solving
       in par is full marks and burning every spare swap still pays 0.45. */
    waffle: { fast: 45e3, slow: 250e3,
      acc: function (m) {
        var allowed = n(m.swapsAllowed) || 15, par = n(m.par) || 10;
        if (!b(m.solved)) return .3 * (n(m.correct) / 21);
        var spare = clamp(allowed - n(m.swapsUsed), 0, allowed);
        return .45 + .55 * clamp(spare / Math.max(1, allowed - par), 0, 1);
      },
      chips: function (m) { return [b(m.solved) ? n(m.swapsUsed) + ' swaps' : 'unsolved']; } },

    nerdle: { fast: 60e3, slow: 300e3,
      acc: function (m) { return byGuess(b(m.solved), n(m.guesses), 6, .34, 0); },
      chips: function (m) { return [b(m.solved) ? n(m.guesses) + '/6 guesses' : 'unsolved']; } },

    mini: { fast: 65e3, slow: 330e3,
      acc: function (m) {
        var tot = n(m.total) || 25;
        if (b(m.solved)) return 1 - clamp(n(m.checks), 0, 6) / 6 * .45;
        return .55 * (n(m.correct) / tot);
      },
      chips: function (m) { return [b(m.solved) ? 'solved' : n(m.correct) + '/' + n(m.total) + ' squares',
                                     n(m.checks) ? n(m.checks) + ' reveals' : 'no help']; } },

    globle: { fast: 45e3, slow: 260e3,
      acc: function (m) { return byGuess(b(m.solved), n(m.guesses), 12, .3, 0); },
      chips: function (m) { return [b(m.solved) ? n(m.guesses) + ' guesses' : 'unsolved']; } },

    flagle: { fast: 22e3, slow: 150e3,
      acc: function (m) { return byGuess(b(m.solved), n(m.guesses), 6, .3, 0); },
      chips: function (m) { return [b(m.solved) ? n(m.guesses) + '/6 guesses' : 'unsolved']; } },

    /* chrono + rankdle report PAIRWISE correctness, so a random ordering
       averages 0.5 — that has to pay nothing, or guessing would score. */
    chrono: { fast: 35e3, slow: 190e3,
      acc: function (m) {
        var tot = n(m.total) || 1, r = clamp(n(m.correct), 0, tot) / tot;
        return r >= 1 ? 1 : Math.max(0, (r - .5) / .5) * .85;
      },
      chips: function (m) { return [n(m.correct) + '/' + n(m.total) + ' pairs in order']; } },

    colourle: { fast: 40e3, slow: 210e3,
      acc: function (m) { return byGuess(b(m.solved), n(m.guesses), 6, .32, .35 * clamp(n(m.closeness), 0, 1)); },
      chips: function (m) { return [b(m.solved) ? n(m.guesses) + '/6 guesses'
                                                : Math.round(n(m.closeness) * 100) + '% close']; } },

    bee: { noSpeed: true,
      acc: function (m) {
        var max = n(m.maxPoints) || 1;
        // Finding every word is superhuman; 55% of the pot is already a great round.
        return clamp(n(m.points) / (max * .55), 0, 1);
      },
      chips: function (m) { return [n(m.words) + ' words', n(m.points) + ' pts',
                                     b(m.pangram) ? 'pangram!' : null].filter(Boolean); } },

    rankdle: { fast: 30e3, slow: 160e3,
      acc: function (m) {
        var tot = n(m.total) || 1, r = clamp(n(m.correct), 0, tot) / tot;
        return r >= 1 ? 1 : Math.max(0, (r - .5) / .5) * .85;
      },
      chips: function (m) { return [n(m.correct) + '/' + n(m.total) + ' pairs right']; } },

    cluedle: { fast: 30e3, slow: 190e3,
      acc: function (m) {
        if (!b(m.solved)) return 0;
        var mx = n(m.maxClues) || 5;
        return 1 - ((clamp(n(m.cluesUsed), 1, mx) - 1) / (mx - 1)) * .62
                 - clamp(n(m.wrong), 0, 4) * .06;
      },
      chips: function (m) { return [b(m.solved) ? n(m.cluesUsed) + ' clues' : 'unsolved',
                                     n(m.wrong) + ' wrong']; } },

    phylo: { fast: 45e3, slow: 250e3,
      acc: function (m) { return byGuess(b(m.solved), n(m.guesses), 10, .3, 0); },
      chips: function (m) { return [b(m.solved) ? n(m.guesses) + ' guesses' : 'unsolved']; } }
  };

  function speedPart(spec, timeMs) {
    var t = clamp(n(timeMs), 0, 1e9);
    if (t <= spec.fast) return 1;
    if (t >= spec.slow) return 0;
    return (spec.slow - t) / (spec.slow - spec.fast);
  }

  /* metrics → {total, accPts, speedPts, acc, speed} */
  function score(gameId, metrics) {
    var spec = SPEC[gameId], m = metrics || {};
    if (!spec) return { total: 0, accPts: 0, speedPts: 0, acc: 0, speed: 0 };
    var acc = clamp(spec.acc(m) || 0, 0, 1);
    if (spec.noSpeed) {
      return { total: Math.round(acc * 1000), accPts: Math.round(acc * 1000), speedPts: 0, acc: acc, speed: 0 };
    }
    var sp = acc > 0 ? speedPart(spec, m.timeMs) : 0;
    var a = Math.round(acc * ACC_MAX), s = Math.round(acc * sp * SPD_MAX);
    return { total: a + s, accPts: a, speedPts: s, acc: acc, speed: sp };
  }

  function chips(gameId, metrics) {
    var spec = SPEC[gameId];
    var out = spec && spec.chips ? spec.chips(metrics || {}) : [];
    var t = n((metrics || {}).timeMs);
    if (t > 0) out.push(fmtTime(t));
    return out;
  }

  function fmtTime(ms) {
    var s = Math.round(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ── ELO ───────────────────────────────────────────────────────────── */
  var K = 32;
  function expected(a, bR) { return 1 / (1 + Math.pow(10, (bR - a) / 400)); }
  /* outcome: 1 a wins, 0 b wins, .5 draw → [newA, newB] */
  function elo(a, bR, outcome) {
    var ea = expected(a, bR);
    var na = Math.round(a + K * (outcome - ea));
    var nb = Math.round(bR + K * ((1 - outcome) - (1 - ea)));
    return [na, nb];
  }

  var API = { score: score, chips: chips, elo: elo, expected: expected, SPEC: SPEC,
              fmtTime: fmtTime, ACC_MAX: ACC_MAX, SPD_MAX: SPD_MAX, K: K };

  G.SCORING = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
