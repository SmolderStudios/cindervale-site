/* OCTANE core: helpers, saving, the MPG engine, cloud backup, trip math.
 *
 * cindervaleidle.com/mpg/ (cindervale-site repo). The photo scanner and the
 * cloud backup are the octane-api worker in cindervale-site/octane-worker/.
 *
 * How MPG is worked out, which is the whole point of the app:
 *   Fill to full and log it. Next time you fill to full, the gallons it took
 *   are the gallons you burned since the last full tank, and the odometer says
 *   how far you went. Partial fills get added to the next full one. A fill-up
 *   you forgot to log breaks the chain, so the tank it hides is left out rather
 *   than guessed. Averages are total miles over total gallons, never an average
 *   of per-tank numbers (that overweights short tanks).
 *
 * Top level uses var and function declarations on purpose: they land on window,
 * which is how the test harness reaches them. const would not.
 */
'use strict';

/* ================================================================ helpers === */
var API = 'https://octane-api.may23jordan.workers.dev';
var DAY = 864e5;
var GRADES = [['87', '87'], ['89', '89'], ['91', '91'], ['93', '93'], ['e85', 'E85'], ['diesel', 'Diesel']];
var DRIVES = [['city', 'City'], ['mixed', 'Mixed'], ['hwy', 'Highway']];
var COLORS = { cyan: '#4be1ff', magenta: '#ff5ad9', lime: '#b8ff47', amber: '#ffb72b', violet: '#aa8cff', red: '#ff6070' };
/* Chart marks. Checked with the dataviz palette validator against the panel
   surface #0a1320, dark mode: band, chroma, CVD separation and contrast all pass. */
var SERIES = ['#22a0d0', '#e0663a', '#b061e6'];
var RANGES = [['3m', '3M', 91], ['6m', '6M', 182], ['1y', '1Y', 365], ['all', 'All', 0]];

function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] || 0; return s; }
function median(a) {
  if (!a.length) return null;
  var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function numIn(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var n = parseFloat(String(v).replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : null;
}
function r1(n) { return Math.round(n * 10) / 10; }
function r2(n) { return Math.round(n * 100) / 100; }
function r3(n) { return Math.round(n * 1000) / 1000; }
function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }
function pad2(n) { return String(n).padStart(2, '0'); }
function toLocalInput(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function fromLocalInput(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null;
}
function monthKey(ts) { var d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); }
function monthStart(k) { return new Date(Math.floor(k / 12), k % 12, 1).getTime(); }

var F = {
  mpg: function (v) { return v == null || !isFinite(v) ? '--' : v.toFixed(1); },
  usd: function (v) { return v == null || !isFinite(v) ? '--' : '$' + v.toFixed(2); },
  usd0: function (v) { return v == null || !isFinite(v) ? '--' : '$' + Math.round(v).toLocaleString('en-US'); },
  ppg: function (v) { return v == null || !isFinite(v) ? '--' : '$' + v.toFixed(3); },
  gal: function (v) { return v == null || !isFinite(v) ? '--' : v.toFixed(3); },
  gal1: function (v) { return v == null || !isFinite(v) ? '--' : v.toFixed(1); },
  mi: function (v) { return v == null || !isFinite(v) ? '--' : Math.round(v).toLocaleString('en-US'); },
  cents: function (v) { return v == null || !isFinite(v) ? '--' : (v * 100).toFixed(1) + '¢'; },
  pct: function (v) { return v == null || !isFinite(v) ? '--' : Math.round(v * 100) + '%'; },
  day: function (ts) { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); },
  dayY: function (ts) { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); },
  wk: function (ts) { return new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); },
  mon: function (ts) { return new Date(ts).toLocaleDateString('en-US', { month: 'short' }); },
  monY: function (ts) { return new Date(ts).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); },
  time: function (ts) { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); },
  ago: function (ts) {
    var s = (Date.now() - ts) / 1000;
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    var d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : d + ' days ago';
  },
};

/* ========================================================== state + saving === */
/* localStorage alone is not durable on an iPhone: Safari treats it as cache and
   wipes it (seven day rule, storage pressure). Every save is mirrored into
   IndexedDB and boot adopts whichever copy is newer. Same fix as IRONGATE. */
var SAVE_KEY = 'octane_v1', IDB_NAME = 'octane', IDB_STORE = 'save';
var S = null;
var UI = { view: 'dash', touched: false, ver: 0 };

function fresh() {
  return {
    v: 1, savedAt: 0, activeVid: null,
    vehicles: [], fills: [], deleted: {},
    prefs: { prefsAt: 0, range: 'all', distMode: {}, lastDrive: '', trip: { dist: '', round: false, people: 1, basis: 'avg', price: '', from: '', to: '' } },
    odoNow: {},
    cloud: { on: false, code: '', rev: 0, lastSync: 0, dirty: false, err: '' },
    seen: {},
  };
}

function normVehicle(v) {
  return {
    id: String(v.id), name: String(v.name || 'My car').trim().slice(0, 40) || 'My car',
    year: v.year ? String(v.year).replace(/\D/g, '').slice(0, 4) : '',
    make: String(v.make || '').slice(0, 30), model: String(v.model || '').slice(0, 30),
    tank: clamp(numIn(v.tank) || 15, 1, 300),
    grade: GRADES.some(function (g) { return g[0] === v.grade; }) ? v.grade : '87',
    odoCorr: clamp(numIn(v.odoCorr) || 0, -25, 25),
    color: COLORS[v.color] ? v.color : 'cyan',
    sample: !!v.sample, createdAt: +v.createdAt || Date.now(), updatedAt: +v.updatedAt || 0,
  };
}

function normFill(f) {
  var odo = numIn(f.odo), gal = numIn(f.gallons);
  if (odo == null || odo < 0 || gal == null || gal <= 0) return null;
  var ppg = numIn(f.ppg), total = numIn(f.total);
  if (total == null && ppg != null) total = r2(gal * ppg);
  if ((ppg == null || ppg <= 0) && total != null) ppg = r3(total / gal);
  if (total == null || total < 0) return null;
  return {
    id: String(f.id), vid: String(f.vid), ts: +f.ts || Date.now(),
    odo: odo, gallons: gal, ppg: ppg || 0, total: total,
    full: f.full !== false, missed: !!f.missed,
    grade: f.grade ? String(f.grade) : '', drive: ['city', 'mixed', 'hwy'].indexOf(f.drive) >= 0 ? f.drive : '',
    station: String(f.station || '').trim().slice(0, 60), notes: String(f.notes || '').slice(0, 400),
    dash: numIn(f.dash) || null, scanned: !!f.scanned, sample: !!f.sample,
    createdAt: +f.createdAt || Date.now(), updatedAt: +f.updatedAt || 0,
  };
}

/* Non-destructive: anything missing gets a default, nothing existing is dropped. */
function normalize(s) {
  var d = fresh();
  if (!s || typeof s !== 'object') return d;
  var o = Object.assign({}, d, s);
  o.vehicles = Array.isArray(s.vehicles) ? s.vehicles.filter(function (v) { return v && v.id; }).map(normVehicle) : [];
  o.fills = Array.isArray(s.fills) ? s.fills.filter(function (f) { return f && f.id && f.vid; }).map(normFill).filter(Boolean) : [];
  o.deleted = s.deleted && typeof s.deleted === 'object' ? Object.assign({}, s.deleted) : {};
  var cut = Date.now() - 200 * DAY;
  Object.keys(o.deleted).forEach(function (k) { if (!(o.deleted[k] > cut)) delete o.deleted[k]; });
  var sp = s.prefs || {};
  o.prefs = Object.assign({}, d.prefs, sp);
  o.prefs.trip = Object.assign({}, d.prefs.trip, sp.trip || {});
  o.prefs.distMode = Object.assign({}, sp.distMode || {});
  if (RANGES.every(function (r) { return r[0] !== o.prefs.range; })) o.prefs.range = 'all';
  o.odoNow = Object.assign({}, s.odoNow || {});
  o.cloud = Object.assign({}, d.cloud, s.cloud || {});
  o.seen = Object.assign({}, s.seen || {});
  if (!o.vehicles.some(function (v) { return v.id === o.activeVid; })) o.activeVid = o.vehicles[0] ? o.vehicles[0].id : null;
  return o;
}

var _db = null, _dbTried = false;
function openDB() {
  if (_dbTried) return Promise.resolve(_db);
  _dbTried = true;
  return new Promise(function (res) {
    try {
      if (!window.indexedDB) return res(null);
      var r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(IDB_STORE)) r.result.createObjectStore(IDB_STORE); };
      r.onsuccess = function () { _db = r.result; res(_db); };
      r.onerror = function () { res(null); };
    } catch (e) { res(null); }
  });
}
function idbPut(json) {
  return openDB().then(function (db) {
    if (!db) return false;
    return new Promise(function (res) {
      try {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(json, 'state');
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { res(false); };
      } catch (e) { res(false); }
    });
  });
}
function idbGet() {
  return openDB().then(function (db) {
    return new Promise(function (res) {
      if (!db) return res(null);
      try {
        var r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get('state');
        r.onsuccess = function () { res(r.result || null); };
        r.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  });
}

function load() {
  var raw = null, p = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { }
  if (raw) { try { p = JSON.parse(raw); } catch (e) { } }
  S = normalize(p);
  return S;
}
/* Write both copies. Does not touch the cloud. */
function persist() {
  S.savedAt = Date.now();
  var json = JSON.stringify(S);
  try { localStorage.setItem(SAVE_KEY, json); } catch (e) { }
  return idbPut(json);
}
/* The data changed: save, mark it for the cloud, refresh caches. */
function commit() {
  UI.touched = true;
  UI.ver++;
  S.cloud.dirty = true;
  persist();
  if (typeof scheduleSync === 'function') scheduleSync();
}
/* Called once after first paint. Adopts the IndexedDB copy when it is newer,
   which is exactly the case where Safari threw localStorage away. */
function reconcileIDB() {
  return idbGet().then(function (json) {
    if (!json) { if (S.savedAt) persist(); return false; }
    var other = null;
    try { other = JSON.parse(json); } catch (e) { return false; }
    var mine = S.savedAt || 0, theirs = other.savedAt || 0;
    if (theirs > mine && !UI.touched) {
      S = normalize(other);
      UI.ver++;
      persist();
      return true;
    }
    if (theirs < mine) persist();
    return false;
  }).catch(function () { return false; });
}
function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(function () { return false; }); } catch (e) { }
  return Promise.resolve(false);
}

/* ============================================================== the engine === */
function veh(id) {
  var want = id || S.activeVid;
  for (var i = 0; i < S.vehicles.length; i++) if (S.vehicles[i].id === want) return S.vehicles[i];
  return null;
}
function fillsOf(vid) {
  return S.fills.filter(function (f) { return f.vid === vid; }).sort(function (a, b) { return a.odo - b.odo || a.ts - b.ts; });
}
function lastFill(vid) { var L = fillsOf(vid || S.activeVid); return L[L.length - 1] || null; }

var _an = { key: '', val: null };
/* Walk every fill-up in odometer order and work out each tank.
   status per row:
     start    first fill, or the first full fill after the chain broke
     ok       a full fill that closes a tank: miles, gallons, cost, mpg
     partial  not filled to full; its gallons roll into the next full fill
     missed   you said a fill-up before this one was never logged
     nochain  a partial with no full fill before it to measure from
     bad      odometer did not go up since the fill before */
function analyze(vid, noCache) {
  var v = veh(vid);
  var key = (v ? v.id : '') + '|' + UI.ver + '|' + S.fills.length + '|' + (v ? v.odoCorr : 0);
  if (!noCache && _an.key === key && _an.val) return _an.val;
  var list = v ? fillsOf(v.id) : [];
  var k = 1 + ((v && v.odoCorr) || 0) / 100;
  var rows = [], anchor = null, accG = 0, accC = 0, pend = [];
  function reset(f) { anchor = f && f.full ? f : null; accG = 0; accC = 0; pend = []; }
  list.forEach(function (f, i) {
    var prev = i ? list[i - 1] : null;
    var r = { f: f, prev: prev, dist: prev ? (f.odo - prev.odo) * k : null, days: prev ? (f.ts - prev.ts) / DAY : null };
    rows.push(r);
    if (!prev) { r.status = 'start'; reset(f); return; }
    if (f.odo <= prev.odo) { r.status = 'bad'; r.dist = null; reset(f); return; }
    if (f.missed) { r.status = 'missed'; reset(f); return; }
    if (!anchor) { r.status = f.full ? 'start' : 'nochain'; if (f.full) reset(f); return; }
    accG += f.gallons; accC += f.total;
    if (!f.full) { r.status = 'partial'; pend.push(r); return; }
    r.status = 'ok';
    r.anchor = anchor;
    r.miles = (f.odo - anchor.odo) * k;
    r.gal = accG; r.cost = accC;
    r.mpg = r.miles / r.gal;
    r.cpm = r.cost / r.miles;
    r.span = pend.length + 1;
    pend.forEach(function (p) { p.closedBy = r; });
    reset(f);
  });
  var oks = rows.filter(function (r) { return r.status === 'ok'; });
  var med = median(oks.map(function (r) { return r.mpg; }));
  oks.forEach(function (r) { r.odd = !!med && oks.length >= 4 && (r.mpg > med * 1.5 || r.mpg < med * 0.6); });
  var out = { v: v, list: list, rows: rows, oks: oks, k: k, med: med };
  if (!noCache) _an = { key: key, val: out };
  return out;
}

function mpgOf(rows) {
  var m = sum(rows.map(function (r) { return r.miles; })), g = sum(rows.map(function (r) { return r.gal; }));
  return g > 0 ? m / g : null;
}
function recentMpg(an, n) {
  n = n || 5;
  var clean = an.oks.filter(function (r) { return !r.odd; });
  return mpgOf(clean.slice(-n)) || mpgOf(an.oks.slice(-n));
}
function milesPerDay(an) {
  var L = an.list;
  if (L.length < 2) return 30;
  var last = L[L.length - 1], cut = last.ts - 90 * DAY, first = null;
  for (var i = 0; i < L.length; i++) if (L[i].ts >= cut) { first = L[i]; break; }
  if (!first || first === last) first = L[Math.max(0, L.length - 3)];
  var days = (last.ts - first.ts) / DAY;
  if (days < 3) { first = L[0]; days = (last.ts - first.ts) / DAY; }
  if (days < 1) return 30;
  return clamp((last.odo - first.odo) * an.k / days, 1, 900);
}
function rangeStart(id) {
  for (var i = 0; i < RANGES.length; i++) if (RANGES[i][0] === id) return RANGES[i][2] ? Date.now() - RANGES[i][2] * DAY : -Infinity;
  return -Infinity;
}

function summarize(an, t0) {
  var from = t0 == null ? -Infinity : t0;
  var rows = an.rows.filter(function (r) { return r.f.ts >= from; });
  var oks = rows.filter(function (r) { return r.status === 'ok'; });
  var clean = oks.filter(function (r) { return !r.odd; });
  var miles = sum(oks.map(function (r) { return r.miles; })), gal = sum(oks.map(function (r) { return r.gal; })), cost = sum(oks.map(function (r) { return r.cost; }));
  var spent = sum(rows.map(function (r) { return r.f.total; })), bought = sum(rows.map(function (r) { return r.f.gallons; }));
  var driven = sum(rows.map(function (r) { return r.dist || 0; }));
  var best = null, worst = null;
  clean.forEach(function (r) { if (!best || r.mpg > best.mpg) best = r; if (!worst || r.mpg < worst.mpg) worst = r; });
  return {
    rows: rows, oks: oks, n: rows.length, tanks: oks.length,
    miles: miles, gal: gal, cost: cost,
    mpg: gal > 0 ? miles / gal : null, cpm: miles > 0 ? cost / miles : null,
    spent: spent, bought: bought, ppg: bought > 0 ? spent / bought : null,
    driven: driven, best: best, worst: worst,
  };
}

/* How low you usually let it get before filling, as a share of the tank.
   On a full-to-full tank with no partials the gallons pumped = what was used. */
function habit(an) {
  var t = an.v && an.v.tank;
  if (!t) return 0.18;
  var xs = an.oks.filter(function (r) { return r.span === 1 && !r.odd; }).slice(-8)
    .map(function (r) { return 1 - r.gal / t; }).filter(function (x) { return x > -0.05 && x < 0.9; });
  return xs.length ? clamp(median(xs), 0.04, 0.6) : 0.18;
}

/* Fuel in the tank right now. Starts from the last full fill (a full fill means
   a full tank whatever the chain says), plays the later partial fills forward,
   then subtracts what you have driven since: from the odometer if you typed it
   on the dash, otherwise from your usual miles per day. */
function fuelNow(an, now) {
  now = now || Date.now();
  var v = an.v;
  if (!v || !an.rows.length) return null;
  var j = -1;
  for (var i = an.rows.length - 1; i >= 0; i--) if (an.rows[i].f.full) { j = i; break; }
  if (j < 0) return { unknown: 'nofull' };
  var mpg = recentMpg(an);
  if (!mpg) return { unknown: 'nompg' };
  var level = v.tank;
  for (var x = j + 1; x < an.rows.length; x++) {
    var r = an.rows[x];
    level = Math.max(0, level - (r.dist || 0) / mpg);
    level = Math.min(v.tank, level + r.f.gallons);
  }
  var last = an.rows[an.rows.length - 1].f;
  var on = S.odoNow[v.id], since, how;
  if (on && on.ts >= last.ts && on.odo >= last.odo) { since = (on.odo - last.odo) * an.k; how = 'odo'; }
  else { since = milesPerDay(an) * Math.max(0, (now - last.ts) / DAY); how = 'est'; }
  level = clamp(level - since / mpg, 0, v.tank);
  return { level: level, pct: level / v.tank, range: level * mpg, since: since, how: how, mpg: mpg, tank: v.tank, last: last };
}
function nextFill(an, fu, now) {
  now = now || Date.now();
  var h = habit(an);
  var miles = Math.max(0, (fu.level - h * fu.tank) * fu.mpg);
  var days = miles / milesPerDay(an);
  return { habit: h, miles: miles, days: days, ts: now + days * DAY, due: miles < 8 };
}

function monthly(an, t0) {
  var from = t0 == null ? -Infinity : t0;
  var rows = an.rows.filter(function (r) { return r.f.ts >= from; });
  if (!rows.length) return [];
  var ks = rows.map(function (r) { return monthKey(r.f.ts); });
  var kMin = Math.min.apply(null, ks), kMax = Math.max(monthKey(Date.now()), Math.max.apply(null, ks));
  kMin = Math.max(kMin, kMax - 23);
  var out = [];
  for (var k = kMin; k <= kMax; k++) out.push({ k: k, ts: monthStart(k), spent: 0, gal: 0, miles: 0, n: 0, okMiles: 0, okGal: 0 });
  rows.forEach(function (r) {
    var e = out[monthKey(r.f.ts) - kMin];
    if (!e) return;
    e.spent += r.f.total; e.gal += r.f.gallons; e.n++;
    if (r.dist) e.miles += r.dist;
    if (r.status === 'ok') { e.okMiles += r.miles; e.okGal += r.gal; }
  });
  return out;
}

/* MPG by what you did on the tank. Driving style is asked on the fill that ENDS
   a tank (how did you drive on it?). The grade burned is the one put in at the
   START of the tank, so grade comes from the anchor fill. */
function groupMpg(an, field, t0) {
  var from = t0 == null ? -Infinity : t0, m = {};
  an.oks.forEach(function (r) {
    if (r.f.ts < from || r.odd) return;
    var key = field === 'grade' ? (r.anchor && r.anchor.grade) : r.f[field];
    if (!key) return;
    if (!m[key]) m[key] = { miles: 0, gal: 0, n: 0 };
    m[key].miles += r.miles; m[key].gal += r.gal; m[key].n++;
  });
  return Object.keys(m).map(function (k) { return { k: k, mpg: m[k].miles / m[k].gal, n: m[k].n }; });
}

function records(an) {
  var oks = an.oks.filter(function (r) { return !r.odd; }), L = an.list;
  function by(arr, fn, dir) {
    var b = null;
    arr.forEach(function (x) { if (b === null || (dir > 0 ? fn(x) > fn(b) : fn(x) < fn(b))) b = x; });
    return b;
  }
  var priced = L.filter(function (f) { return f.ppg > 0; });
  return {
    best: by(oks, function (r) { return r.mpg; }, 1),
    worst: by(oks, function (r) { return r.mpg; }, -1),
    longest: by(oks, function (r) { return r.miles; }, 1),
    cheap: by(priced, function (f) { return f.ppg; }, -1),
    pricey: by(priced, function (f) { return f.ppg; }, 1),
    biggest: by(L, function (f) { return f.total; }, 1),
  };
}

/* How far the car's own MPG readout is from the real number. */
function dashCheck(an, t0) {
  var from = t0 == null ? -Infinity : t0;
  var xs = an.oks.filter(function (r) { return r.f.dash && r.f.ts >= from && !r.odd; })
    .map(function (r) { return (r.f.dash - r.mpg) / r.mpg; });
  return xs.length ? { n: xs.length, pct: sum(xs) / xs.length } : null;
}

/* Rolling average across the last n tanks, miles over gallons. */
function rolling(oks, n) {
  return oks.map(function (r, i) { return mpgOf(oks.slice(Math.max(0, i - n + 1), i + 1)); });
}

/* The total = gallons x price check, same rule as the worker. */
function pumpAgrees(t, g, p) { return Math.abs(g * p - t) <= 0.015; }

/* ============================================================== trip math === */
/* Cost and fuel stops for a drive. Starts from the fuel you have now (or a full
   tank if that is unknown) and stops for gas when a tank is down to 15%. */
function tripCalc(o) {
  var miles = (o.dist || 0) * (o.round ? 2 : 1);
  var mpg = o.mpg > 0 ? o.mpg : null;
  if (!miles || !mpg) return null;
  var gal = miles / mpg, cost = gal * (o.price || 0);
  var tank = o.tank || 15, reserve = tank * 0.15;
  var fullRange = (tank - reserve) * mpg;
  var startGal = o.fuelGal != null ? clamp(o.fuelGal, 0, tank) : tank;
  var pos = Math.max(0, (startGal - reserve) * mpg), stops = [];
  while (pos < miles && stops.length < 40) { stops.push(pos); pos += fullRange; }
  return { miles: miles, gal: gal, cost: cost, per: cost / Math.max(1, o.people || 1), stops: stops, fullRange: fullRange, startRange: Math.max(0, (startGal - reserve) * mpg) };
}

/* =========================================================== cloud backup === */
var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function newCode() {
  var a = new Uint8Array(24), s = '';
  (window.crypto || window.msCrypto).getRandomValues(a);
  for (var i = 0; i < 24; i++) s += B32[a[i] & 31];
  return s;
}
function fmtCode(c) { return (c || '').replace(/(.{4})(?=.)/g, '$1-'); }
function cleanCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I').replace(/8/g, 'B').replace(/9/g, 'G');
}

/* Sample data never goes to the cloud. */
function payload() {
  return {
    v: 1, deleted: S.deleted, prefs: S.prefs,
    vehicles: S.vehicles.filter(function (v) { return !v.sample; }),
    fills: S.fills.filter(function (f) { return !f.sample; }),
  };
}
/* A stable string for "is this the same data", so a sync that changes nothing
   does not look like a change and send two phones into a write ping-pong. */
function canon(p) {
  var n = normalize(Object.assign(fresh(), p || {}));
  function byId(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
  return JSON.stringify([
    n.vehicles.filter(function (v) { return !v.sample; }).sort(byId),
    n.fills.filter(function (f) { return !f.sample; }).sort(byId),
    Object.keys(n.deleted).sort().map(function (k) { return [k, n.deleted[k]]; }),
    n.prefs,
  ]);
}

/* Union by id, newest edit wins, deletions win over older edits. Safe to run
   in any order on any two copies, so two phones always end up agreeing. */
function mergeData(L, R) {
  if (!R) return L;
  if (!L) return R;
  var del = Object.assign({}, R.deleted || {});
  Object.keys(L.deleted || {}).forEach(function (k) { del[k] = Math.max(del[k] || 0, L.deleted[k]); });
  function pick(a, b) {
    var m = new Map();
    (a || []).forEach(function (x) { m.set(x.id, x); });
    (b || []).forEach(function (x) { var y = m.get(x.id); if (!y || (x.updatedAt || 0) > (y.updatedAt || 0)) m.set(x.id, x); });
    return Array.from(m.values()).filter(function (x) { return !(del[x.id] >= (x.updatedAt || 0)); });
  }
  var lp = L.prefs || {}, rp = R.prefs || {};
  return { v: 1, vehicles: pick(L.vehicles, R.vehicles), fills: pick(L.fills, R.fills), deleted: del, prefs: (rp.prefsAt || 0) > (lp.prefsAt || 0) ? rp : lp };
}
function applyPayload(p) {
  var keep = { cloud: S.cloud, odoNow: S.odoNow, seen: S.seen, activeVid: S.activeVid, savedAt: S.savedAt };
  var sampleV = S.vehicles.filter(function (v) { return v.sample; }), sampleF = S.fills.filter(function (f) { return f.sample; });
  var n = normalize(Object.assign({}, S, p));
  n.vehicles = n.vehicles.filter(function (v) { return !v.sample; }).concat(sampleV);
  n.fills = n.fills.filter(function (f) { return !f.sample; }).concat(sampleF);
  S = Object.assign(n, keep);
  if (!S.vehicles.some(function (v) { return v.id === S.activeVid; })) S.activeVid = S.vehicles[0] ? S.vehicles[0].id : null;
  UI.ver++;
}

function api(path, opt, ms) {
  opt = opt || {};
  var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 15000);
  return fetch(API + path, Object.assign({}, opt, { signal: ctl ? ctl.signal : undefined, headers: { 'Content-Type': 'application/json' } }))
    .then(function (r) {
      return r.text().then(function (txt) {
        var j = null;
        try { j = JSON.parse(txt); } catch (e) { }
        return { status: r.status, ok: r.ok, j: j };
      });
    })
    .finally(function () { clearTimeout(t); });
}

var SYNC = { busy: false, timer: 0 };
function scheduleSync(ms) {
  if (!S.cloud.on || !S.cloud.code) return;
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(syncNow, ms == null ? 2500 : ms);
}
/* Pull, merge, push. A 409 means another phone wrote in between: loop pulls
   its copy, merges again and retries. */
function syncNow(opts) {
  opts = opts || {};
  if (!S.cloud.on || !S.cloud.code || SYNC.busy) return Promise.resolve(false);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { S.cloud.err = 'offline'; if (window.onSyncState) onSyncState(); return Promise.resolve(false); }
  SYNC.busy = true;
  if (window.onSyncState) onSyncState();
  var changed = false, code = S.cloud.code;
  function pull() {
    return api('/backup/' + code).then(function (g) {
      if (g.status === 200 && g.j) {
        if (g.j.rev !== S.cloud.rev) {
          var before = canon(payload());
          applyPayload(mergeData(payload(), g.j.data));
          S.cloud.rev = g.j.rev;
          var after = canon(payload());
          if (after !== before) changed = true;
          /* Only push if this phone has something the cloud copy lacks. */
          S.cloud.dirty = after !== canon(g.j.data);
        }
      } else if (g.status === 404) { S.cloud.rev = 0; S.cloud.dirty = true; }
      else throw new Error('pull ' + g.status);
    });
  }
  function push(tries) {
    if (!S.cloud.dirty) return Promise.resolve();
    return api('/backup/' + code, { method: 'PUT', body: JSON.stringify({ baseRev: S.cloud.rev, data: payload() }) }).then(function (p) {
      if (p.status === 409 && tries > 0) return pull().then(function () { return push(tries - 1); });
      if (!p.ok) throw new Error('push ' + p.status);
      S.cloud.rev = p.j.rev;
      S.cloud.dirty = false;
    });
  }
  var needPull = opts.pull || !S.cloud.rev || Date.now() - S.cloud.lastSync > 30000;
  return (needPull ? pull() : Promise.resolve())
    .then(function () { return push(3); })
    .then(function () { S.cloud.lastSync = Date.now(); S.cloud.err = ''; })
    .catch(function () { S.cloud.err = (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'error'; })
    .then(function () {
      SYNC.busy = false;
      persist();
      if (window.onSyncState) onSyncState(changed);
      return changed;
    });
}
