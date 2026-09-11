/* OCTANE screens, part 2: Stats and Trip cost. */
'use strict';

/* ---------------------------------------------------------------- stats --- */
function statTile(label, value, sub) {
  return '<div class="kpi"><div class="kl">' + label + '</div><div class="kr"><div class="kv">' + value + '</div></div><div class="kd">' + (sub || '') + '</div></div>';
}
function mpgTable(oks) {
  return tableHTML(['Date', 'Miles', 'Gallons', 'MPG', 'Per mile'], oks.slice().reverse().slice(0, 80).map(function (r) {
    return [F.dayY(r.f.ts), F.mi(r.miles), F.gal(r.gal), F.mpg(r.mpg) + (r.odd ? ' ?' : ''), F.cents(r.cpm)];
  }));
}
function priceTable(fills) {
  return tableHTML(['Date', 'Gas', 'Price', 'Gallons', 'Total'], fills.slice().reverse().slice(0, 80).map(function (f) {
    return [F.dayY(f.ts), gradeLabel(f.grade) || '--', F.ppg(f.ppg), F.gal(f.gallons), F.usd(f.total)];
  }));
}
function monthTable(months) {
  return tableHTML(['Month', 'Spent', 'Gallons', 'Miles', 'MPG'], months.slice().reverse().map(function (m) {
    return [F.monY(m.ts), F.usd(m.spent), F.gal1(m.gal), F.mi(m.miles), m.okGal ? F.mpg(m.okMiles / m.okGal) : '--'];
  }));
}
function recordsPanel(an) {
  var rc = records(an);
  if (!rc.best && !rc.cheap) return '';
  function rec(label, value, sub) { return '<div class="rec"><small>' + label + '</small><b>' + value + '</b><span>' + sub + '</span></div>'; }
  function where(f) { return F.dayY(f.ts) + (f.station ? ' · ' + esc(f.station) : ''); }
  return '<section class="pnl"><div class="ph"><span class="lbl">Records</span><span class="tag">all time</span></div><div class="rgrid">' +
    (rc.best ? rec('Best tank', F.mpg(rc.best.mpg) + ' MPG', F.dayY(rc.best.f.ts)) : '') +
    (rc.worst ? rec('Worst tank', F.mpg(rc.worst.mpg) + ' MPG', F.dayY(rc.worst.f.ts)) : '') +
    (rc.longest ? rec('Longest tank', F.mi(rc.longest.miles) + ' mi', F.dayY(rc.longest.f.ts)) : '') +
    (rc.biggest ? rec('Biggest fill-up', F.usd(rc.biggest.total), F.gal(rc.biggest.gallons) + ' gal') : '') +
    (rc.cheap ? rec('Cheapest gas', F.ppg(rc.cheap.ppg), where(rc.cheap)) : '') +
    (rc.pricey ? rec('Priciest gas', F.ppg(rc.pricey.ppg), where(rc.pricey)) : '') +
    '</div></section>';
}
function tanksWord(n) { return n + ' tank' + (n === 1 ? '' : 's'); }

VIEWS.stats = function () {
  var an = analyze(), t0 = rangeStart(S.prefs.range), sm = summarize(an, t0);
  var h = '<h1 class="pg">Stats</h1><div class="seg" style="margin-bottom:12px" role="group" aria-label="Time range">' + RANGES.map(function (r) {
    return '<button type="button" class="' + (S.prefs.range === r[0] ? 'on' : '') + '" data-act="range:' + r[0] + '">' + r[1] + '</button>';
  }).join('') + '</div>';
  if (an.v && an.v.sample) h += sampleBanner();
  if (!an.list.length) return h + '<section class="pnl"><div class="note">Log a couple of fill-ups and your stats show up here.</div></section>';

  h += '<div class="kpis">' +
    statTile('Average MPG', F.mpg(sm.mpg), tanksWord(sm.tanks)) +
    statTile('Cost per mile', F.cents(sm.cpm), 'gas only') +
    statTile('Spent on gas', F.usd0(sm.spent), sm.n + ' fill-up' + (sm.n === 1 ? '' : 's')) +
    statTile('Miles driven', F.mi(sm.driven), F.gal1(sm.bought) + ' gal bought') +
    statTile('Average price', F.ppg(sm.ppg), 'per gallon') +
    statTile('Best tank', sm.best ? F.mpg(sm.best.mpg) : '--', sm.best ? F.dayY(sm.best.f.ts) : '') +
    '</div>';

  var fills = an.list.filter(function (f) { return f.ts >= t0 && f.ppg > 0; }), months = monthly(an, t0);
  h += '<section class="pnl"><div class="ph"><span class="lbl">MPG by tank</span></div>' + legendHTML([['Each tank', SERIES[0], 'dot'], ['3-tank average', SERIES[1]]]) +
    '<div id="stTrend"></div>' + mpgTable(sm.oks) + '</section>';
  h += '<section class="pnl"><div class="ph"><span class="lbl">Gas price</span><span class="tag">per gallon</span></div><div id="stPrice"></div>' + priceTable(fills) + '</section>';
  h += '<section class="pnl"><div class="ph"><span class="lbl">Spent per month</span></div><div id="stSpend"></div>' + monthTable(months) + '</section>';
  h += '<section class="pnl"><div class="ph"><span class="lbl">Miles per month</span></div><div id="stMiles"></div></section>';

  var order = { city: 0, mixed: 1, hwy: 2 };
  var byDrive = groupMpg(an, 'drive', t0).sort(function (a, b) { return order[a.k] - order[b.k]; });
  if (byDrive.length >= 2) {
    h += '<section class="pnl"><div class="ph"><span class="lbl">MPG by driving</span></div>' + hbarsHTML(byDrive.map(function (g) {
      return { label: (DRIVES.filter(function (d) { return d[0] === g.k; })[0] || [0, g.k])[1], v: g.mpg, n: g.n };
    }), F.mpg, function (r) { return tanksWord(r.n); }) + '</section>';
  }
  var gOrder = GRADES.map(function (g) { return g[0]; });
  var byGrade = groupMpg(an, 'grade', t0).sort(function (a, b) { return gOrder.indexOf(a.k) - gOrder.indexOf(b.k); });
  if (byGrade.length >= 2) {
    h += '<section class="pnl"><div class="ph"><span class="lbl">MPG by gas</span></div>' + hbarsHTML(byGrade.map(function (g) {
      return { label: gradeLabel(g.k), v: g.mpg, n: g.n };
    }), F.mpg, function (r) { return tanksWord(r.n); }) + '<div class="hint">Grade is what went in at the start of each tank.</div></section>';
  }
  var dc = dashCheck(an, t0);
  if (dc) {
    var pct = Math.abs(dc.pct * 100).toFixed(1);
    h += '<section class="pnl"><div class="ph"><span class="lbl">Your car\'s MPG readout</span><span class="tag">' + tanksWord(dc.n) + '</span></div>' +
      '<div class="fuelhd"><b>' + (dc.pct >= 0 ? '+' : '-') + pct + '%</b><span>' + (dc.pct >= 0 ? 'reads high' : 'reads low') + '</span></div>' +
      '<div class="note">' + (dc.pct >= 0 ? 'The dash shows about ' + pct + '% more MPG than you really get.' : 'The dash shows about ' + pct + '% less MPG than you really get.') + '</div></section>';
  }
  h += recordsPanel(an);
  return h + howPanel();
};

MOUNT.stats = function () {
  var an = analyze();
  if (!an.list.length) return;
  var t0 = rangeStart(S.prefs.range), sm = summarize(an, t0), roll = rolling(an.oks, 3), oks = [], rl = [];
  an.oks.forEach(function (r, i) { if (r.f.ts >= t0) { oks.push(r); rl.push(roll[i]); } });
  lineChart($('#stTrend'), mpgSeriesOpts(oks, rl, sm.mpg, 200));

  var fills = an.list.filter(function (f) { return f.ts >= t0 && f.ppg > 0; });
  lineChart($('#stPrice'), {
    h: 170, label: 'Gas price per gallon', empty: 'No prices yet.',
    series: [{ name: 'Price per gallon', color: SERIES[0], dots: fills.length <= 40, area: true, pts: fills.map(function (f) { return { x: f.ts, y: f.ppg, f: f }; }) }],
    yFmt: function (v) { return '$' + v.toFixed(2); }, tipFmt: function (v) { return F.ppg(v); },
    tipExtra: function (p) { return p.f ? '<div class="tr"><span>' + (gradeLabel(p.f.grade) || '') + (p.f.station ? ' · ' + esc(p.f.station) : '') + '</span></div>' : ''; },
    endLabel: function (v) { return F.ppg(v); },
  });

  var months = monthly(an, t0);
  function monthRows(m) {
    return tipRow(SERIES[0], F.usd(m.spent), 'spent') + tipRow('transparent', F.gal1(m.gal), 'gallons') + tipRow('transparent', F.mi(m.miles), 'miles') + tipRow('transparent', String(m.n), 'fill-ups');
  }
  colChart($('#stSpend'), {
    h: 170, name: 'spent', label: 'Money spent on gas each month', color: SERIES[0],
    bars: months.map(function (m) { return { label: F.mon(m.ts), v: m.spent, head: F.monY(m.ts), rows: monthRows(m) }; }),
    yFmt: function (v) { return '$' + Math.round(v); }, valFmt: function (v) { return F.usd0(v); },
  });
  colChart($('#stMiles'), {
    h: 170, name: 'miles', label: 'Miles driven each month', color: SERIES[0],
    bars: months.map(function (m) { return { label: F.mon(m.ts), v: m.miles, head: F.monY(m.ts), rows: monthRows(m) }; }),
    yFmt: function (v) { return Math.round(v).toLocaleString('en-US'); }, valFmt: function (v) { return F.mi(v) + ' mi'; },
  });
};
ACT.range = function (r) { S.prefs.range = r; S.prefs.prefsAt = Date.now(); persist(); render(); };

/* ----------------------------------------------------------------- trip --- */
var ROUTE = { from: null, to: null, me: null, timer: 0, seq: 0, hits: {} };

function tripBases(an) {
  var sm = summarize(an), out = [];
  if (sm.mpg) out.push(['avg', 'My average', sm.mpg]);
  var r5 = recentMpg(an, 5);
  if (r5 && an.oks.length > 5) out.push(['last5', 'Last 5 tanks', r5]);
  var hw = groupMpg(an, 'drive').filter(function (g) { return g.k === 'hwy'; })[0];
  if (hw) out.push(['hwy', 'Highway', hw.mpg]);
  out.push(['custom', 'Custom', numIn(S.prefs.trip.customMpg)]);
  return out;
}
function tripBasis(an) {
  var b = tripBases(an), want = S.prefs.trip.basis;
  return b.filter(function (x) { return x[0] === want; })[0] || b[0];
}
function tripMpg(an) { return tripBasis(an)[2]; }

VIEWS.trip = function () {
  var an = analyze(), t = S.prefs.trip, lastF = an.list[an.list.length - 1], cur = tripBasis(an)[0];
  var h = '<h1 class="pg">Trip cost</h1>';
  h += '<section class="pnl"><div class="ph"><span class="lbl">Where to</span></div><div class="fgrid">' +
    fld('From', '<input id="t_from" autocomplete="off" placeholder="Where you start" value="' + esc(t.from || '') + '"><button type="button" class="locbtn" data-act="myloc" aria-label="Use my location">' + ic('target') + '</button>', 'hasbtn') +
    '<div id="t_fromS"></div>' +
    fld('To', '<input id="t_to" autocomplete="off" placeholder="City or address" value="' + esc(t.to || '') + '">') +
    '<div id="t_toS"></div>' +
    '<div class="hint" id="t_route">' + esc(t.routeText || 'Pick two places, or just type the miles.') + '</div>' +
    '<div class="g2">' + fld('Distance', '<input id="t_dist" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(t.dist || '') + '"><span class="u">mi</span>') +
    '<div class="fld"><span>Trip</span><div class="seg" id="t_round"><button type="button" data-act="tround:0" class="' + (t.round ? '' : 'on') + '">One way</button>' +
    '<button type="button" data-act="tround:1" class="' + (t.round ? 'on' : '') + '">Round</button></div></div></div></div></section>';
  h += '<section class="pnl"><div class="ph"><span class="lbl">Your numbers</span></div><div class="fgrid">' +
    '<div class="fld"><span>MPG to use</span><div class="chips" id="t_basis">' + tripBases(an).map(function (x) {
      return '<button type="button" class="chip' + (x[0] === cur ? ' on' : '') + '" data-act="tbasis:' + x[0] + '">' + x[1] +
        (x[0] !== 'custom' && x[2] ? ' <span class="mono" style="font-size:12px;opacity:.75">' + F.mpg(x[2]) + '</span>' : '') + '</button>';
    }).join('') + '</div></div>' +
    '<div id="t_custom"' + (cur === 'custom' ? '' : ' hidden') + '>' + fld('Your MPG', '<input id="t_mpg" inputmode="decimal" autocomplete="off" placeholder="25" value="' + esc(t.customMpg || '') + '"><span class="u">mpg</span>') + '</div>' +
    '<div class="g2">' + fld('Gas price', '<span class="pre">$</span><input id="t_price" inputmode="decimal" autocomplete="off" placeholder="' + (lastF ? lastF.ppg.toFixed(3) : '3.500') + '" value="' + esc(t.price || '') + '">', 'hasp') +
    '<div class="fld"><span>Split between</span><div class="stepper"><button type="button" data-act="tppl:-1" aria-label="Fewer people">&minus;</button><b id="t_ppl">' + (t.people || 1) + '</b>' +
    '<button type="button" data-act="tppl:1" aria-label="More people">+</button></div></div></div></div></section>';
  return h + '<section class="pnl" id="t_out"></section>';
};

MOUNT.trip = function (quiet) {
  if (quiet) { renderTripOut(); return; }
  var t = S.prefs.trip;
  function keep() { S.prefs.prefsAt = Date.now(); persist(); }
  $('#t_dist').addEventListener('input', function () {
    t.dist = this.value; t.routeText = '';
    $('#t_route').textContent = 'Pick two places, or just type the miles.';
    keep(); renderTripOut();
  });
  $('#t_price').addEventListener('input', function () { t.price = this.value; keep(); renderTripOut(); });
  $('#t_mpg').addEventListener('input', function () { t.customMpg = this.value; keep(); renderTripOut(); });
  ['from', 'to'].forEach(function (k) {
    $('#t_' + k).addEventListener('input', function () { t[k] = this.value; ROUTE[k] = null; keep(); suggest(k, this.value); });
  });
  renderTripOut();
};

ACT.tround = function (v) {
  S.prefs.trip.round = v === '1';
  $$('#t_round button').forEach(function (b, i) { b.classList.toggle('on', (i === 1) === S.prefs.trip.round); });
  persist(); renderTripOut();
};
ACT.tppl = function (d) {
  var t = S.prefs.trip;
  t.people = clamp((t.people || 1) + (+d), 1, 12);
  $('#t_ppl').textContent = t.people;
  persist(); renderTripOut();
};
ACT.tbasis = function (k, b) {
  S.prefs.trip.basis = k;
  $$('#t_basis .chip').forEach(function (c) { c.classList.toggle('on', c === b); });
  $('#t_custom').hidden = k !== 'custom';
  if (k === 'custom') $('#t_mpg').focus();
  persist(); renderTripOut();
};

function suggest(k, q) {
  clearTimeout(ROUTE.timer);
  var box = $('#t_' + k + 'S');
  if (!box) return;
  q = (q || '').trim();
  if (q.length < 3 || q === 'My location') { box.innerHTML = ''; return; }
  ROUTE.timer = setTimeout(function () {
    var seq = ++ROUTE.seq, near = ROUTE.me || ROUTE.from;
    var url = 'https://photon.komoot.io/api/?limit=5&lang=en&q=' + encodeURIComponent(q) + (near ? '&lat=' + near.lat.toFixed(3) + '&lon=' + near.lon.toFixed(3) : '');
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (seq !== ROUTE.seq) return;
      var items = (j.features || []).map(function (f) {
        var p = f.properties || {}, c = f.geometry && f.geometry.coordinates;
        var name = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || p.city || '';
        var sub = [p.city !== name ? p.city : '', p.state, p.country].filter(Boolean).join(', ');
        return c && name ? { lat: c[1], lon: c[0], name: name, sub: sub } : null;
      }).filter(Boolean);
      ROUTE.hits[k] = items;
      box.innerHTML = items.length ? '<div class="sugg">' + items.map(function (it, i) {
        return '<button type="button" data-act="pick:' + k + ':' + i + '">' + esc(it.name) + '<small>' + esc(it.sub) + '</small></button>';
      }).join('') + '</div>' : '';
    }).catch(function () { box.innerHTML = ''; });
  }, 380);
}
ACT.pick = function (arg) {
  var p = arg.split(':'), k = p[0], it = ROUTE.hits[k] && ROUTE.hits[k][+p[1]];
  if (!it) return;
  ROUTE[k] = it;
  S.prefs.trip[k] = it.name;
  $('#t_' + k).value = it.name;
  $('#t_' + k + 'S').innerHTML = '';
  persist();
  $('#t_' + k).blur();
  routeIt();
};
ACT.myloc = function () {
  if (!navigator.geolocation) { toast('Location is not available here.'); return; }
  $('#t_route').textContent = 'Finding you...';
  navigator.geolocation.getCurrentPosition(function (pos) {
    ROUTE.me = ROUTE.from = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'My location' };
    S.prefs.trip.from = 'My location';
    $('#t_from').value = 'My location';
    $('#t_fromS').innerHTML = '';
    persist();
    routeIt();
  }, function () { $('#t_route').textContent = 'Could not get your location. Type where you start.'; }, { timeout: 10000, maximumAge: 300000 });
};
function durText(h) {
  var hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh++; mm = 0; }
  return hh ? hh + ' h' + (mm ? ' ' + mm + ' min' : '') : mm + ' min';
}
function routeIt() {
  var a = ROUTE.from, b = ROUTE.to, el = $('#t_route');
  if (!el) return;
  if (!a || !b) { el.textContent = !a ? 'Now pick where you start.' : 'Now pick where you are going.'; return; }
  el.textContent = 'Finding the route...';
  fetch('https://router.project-osrm.org/route/v1/driving/' + a.lon + ',' + a.lat + ';' + b.lon + ',' + b.lat + '?overview=false')
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var rt = j.routes && j.routes[0];
      if (!rt) throw new Error('no route');
      var mi = rt.distance / 1609.344, t = S.prefs.trip;
      t.dist = String(Math.round(mi));
      $('#t_dist').value = t.dist;
      t.routeText = a.name + ' to ' + b.name + ' · ' + F.mi(mi) + ' mi · about ' + durText(rt.duration / 3600) + ' of driving';
      el.innerHTML = esc(t.routeText) + '<br><span style="opacity:.65">Route: OSRM. Places: Photon. Map data &copy; OpenStreetMap contributors.</span>';
      S.prefs.prefsAt = Date.now();
      persist();
      renderTripOut();
    })
    .catch(function () { el.textContent = 'Could not find a driving route. Type the miles instead.'; });
}

function renderTripOut() {
  var el = $('#t_out');
  if (!el) return;
  var an = analyze(), v = an.v, t = S.prefs.trip, lastF = an.list[an.list.length - 1];
  var price = numIn(t.price) || (lastF ? lastF.ppg : null), mpg = tripMpg(an), fu = fuelNow(an);
  var r = tripCalc({ dist: numIn(t.dist), round: !!t.round, mpg: mpg, price: price || 0, people: t.people || 1, tank: v.tank, fuelGal: fu && !fu.unknown ? fu.level : null });
  if (!r) {
    el.innerHTML = '<div class="nodata">' + (!mpg ? 'Pick Custom and enter an MPG, or log a couple of full tanks so OCTANE knows yours.' : 'Type a distance or pick two places to see what the gas costs.') + '</div>';
    return;
  }
  el.innerHTML = '<div class="trip-out"><div class="lbl" style="justify-content:center">Gas for this trip</div><div class="bignum">' + F.usd(r.cost) + '</div>' +
    '<div class="bigsub">' + (t.people > 1 ? F.usd(r.per) + ' each for ' + t.people + ' people · ' : '') + F.mpg(mpg) + ' MPG at ' + F.ppg(price) + '</div></div>' +
    '<div class="hstats" style="margin-top:14px">' + cell('Miles', F.mi(r.miles)) + cell('Gallons', F.gal1(r.gal)) + cell('Gas stops', String(r.stops.length)) + '</div>' +
    routeBar(r, !!t.round, fu);
}
function routeBar(r, round, fu) {
  function pct(x) { return clamp(x / r.miles * 100, 0, 100).toFixed(2); }
  var h = '<div class="route"><div class="rl"></div><div class="ep" style="left:0"></div><div class="ep end" style="left:100%"></div>';
  if (round) h += '<div class="rt" style="left:50%;top:4px">turn around</div>';
  r.stops.forEach(function (s, i) {
    h += '<div class="st" style="left:' + pct(s) + '%;animation-delay:' + i * 90 + 'ms">' + ic('pump') + '</div>';
    var p = s / r.miles;
    if (r.stops.length <= 4 && p > 0.12 && p < 0.88) h += '<div class="rt" style="left:' + pct(s) + '%">mi ' + F.mi(s) + '</div>';
  });
  h += '<div class="rt" style="left:0;transform:none">start</div><div class="rt" style="left:100%;transform:translateX(-100%)">' + F.mi(r.miles) + ' mi</div></div>';
  var note;
  if (!r.stops.length) note = 'No gas stops needed' + (fu && !fu.unknown ? ' with what is in the tank now.' : ' on a full tank.');
  else if (r.stops[0] < 1) note = 'Fill up before you leave, then about every ' + F.mi(r.fullRange) + ' mi.';
  else note = 'First stop around mile ' + F.mi(r.stops[0]) + (r.stops.length > 1 ? ', then about every ' + F.mi(r.fullRange) + ' mi.' : '.');
  return h + '<div class="hint" style="text-align:center">' + note + ' Stops leave 15% in the tank.</div>';
}
