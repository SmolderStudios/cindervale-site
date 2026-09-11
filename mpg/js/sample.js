/* OCTANE sample data: fourteen months of a believable daily driver, so every
 * screen has something to show before the first real fill-up.
 *
 * It is simulated the honest way: a car burns fuel day by day at an MPG that
 * moves with the seasons and the kind of driving, and gets filled when the tank
 * runs low, so the logged gallons carry the same click-off noise real ones do.
 * A few partial fills and one forgotten fill-up are in there on purpose.
 * Everything is flagged sample:true, never syncs, and one tap clears it.
 */
'use strict';

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeSample(now) {
  now = now || Date.now();
  var rnd = mulberry32(240), vid = 'sample-car', tank = 13.2;
  var v = normVehicle({ id: vid, name: 'Sample car', year: '2019', make: 'Honda', model: 'Civic', tank: tank, grade: '87', color: 'cyan', sample: true, createdAt: now, updatedAt: now });
  var stations = ['Shell', 'Costco', 'Chevron', 'ARCO', '76', 'Circle K', 'Costco', 'Shell'];
  var t0 = now - 425 * DAY, t = t0, odo = 48210, level = tank, fills = [], n = 0, skipNext = false, forgot = false;
  function price(ts) {
    var d = (ts - t0) / DAY;
    var p = 3.38 + 0.36 * Math.sin(d / 365 * 2 * Math.PI - 1.2) + 0.12 * Math.sin(d / 70 * 2 * Math.PI) + (rnd() - 0.5) * 0.14;
    return Math.round(p * 100) / 100 + 0.009;
  }
  function trueMpg(ts, drive) {
    var m = new Date(ts).getMonth();
    var season = [0.9, 0.9, 0.94, 0.98, 1.01, 1.02, 1.0, 1.0, 1.01, 0.99, 0.95, 0.91][m];
    var style = drive === 'hwy' ? 1.14 : drive === 'city' ? 0.9 : 1;
    return 33.4 * season * style * (1 + (rnd() - 0.5) * 0.05);
  }
  function log(fill) { n++; fill.id = 'sample-' + n; fill.vid = vid; fill.sample = true; fill.createdAt = fill.ts; fill.updatedAt = fill.ts; fills.push(fill); }

  /* The first fill-up: starting point, filled to full. */
  log({ ts: t + 17 * 3600e3, odo: odo, gallons: 9.412, ppg: price(t), total: r2(9.412 * price(t)), full: true, grade: '87', station: 'Shell' });
  var drive = 'mixed', used = 0, usedMiles = 0, target = 0.12 + rnd() * 0.18;

  /* One stop at the pump. A few are partial on purpose, and the 24th one is
     never logged, so the next logged fill-up says "missed one". */
  function fillUp(day) {
    var p = price(day), ts = day + (7 + rnd() * 13) * 3600e3;
    var partial = fills.length === 9 || fills.length === 30 || fills.length === 41;
    var gallons = partial ? r3((15 + Math.round(rnd() * 3) * 5) / p) : r3(Math.min(tank - 0.02, Math.max(0.5, tank - level + (rnd() - 0.5) * 0.3)));
    level = partial ? Math.min(tank, level + gallons) : tank;
    if (fills.length === 23 && !forgot) { forgot = true; skipNext = true; used = 0; usedMiles = 0; target = 0.12 + rnd() * 0.18; return; }
    var f = {
      ts: ts, odo: Math.round(odo), gallons: gallons, ppg: p, total: r2(gallons * p), full: !partial,
      grade: rnd() < 0.08 ? '91' : '87', drive: drive, station: stations[Math.floor(rnd() * stations.length)],
    };
    if (skipNext) { f.missed = true; skipNext = false; }
    if (!partial && used > 0 && rnd() < 0.3) f.dash = r1(usedMiles / used * 1.055);
    if (rnd() < 0.06) f.notes = ['Road trip', 'New tires', 'AC on the whole way', 'Stuck in traffic all week'][Math.floor(rnd() * 4)];
    log(f);
    if (!partial) { used = 0; usedMiles = 0; drive = 'mixed'; }
    target = 0.12 + rnd() * 0.18;
  }

  while (t < now - 1.5 * DAY) {
    t += DAY;
    var miles = 34 * (0.45 + rnd() * 1.2);
    if (rnd() < 0.04) { drive = 'hwy'; miles += 160 + rnd() * 220; }
    else if (rnd() < 0.25) drive = rnd() < 0.5 ? 'city' : 'mixed';
    var mpg = trueMpg(t, drive);
    /* Drive in pieces: a long day stops for gas when the tank runs low instead
       of running it below empty (which made some tanks read 45 MPG). */
    while (miles > 0.01) {
      var go = Math.min(miles, Math.max(0, level - target * tank) * mpg);
      level -= go / mpg; used += go / mpg; usedMiles += go; odo += go; miles -= go;
      if (level > target * tank + 1e-6) break;
      fillUp(t);
    }
  }
  return { vehicle: v, fills: fills.map(normFill).filter(Boolean) };
}
