/* OCTANE screens, part 1: shared bits, welcome, dash, log, garage, settings.
 * Stats and Trip are in stats.js. Each view returns HTML; its MOUNT function
 * runs after it is on the page (charts need real widths).
 */
'use strict';

var ACT = {}, VIEWS = {}, MOUNT = {};

/* --------------------------------------------------------------- shared --- */
function fld(label, inner, cls, id) {
  return '<label class="fld"' + (id ? ' id="' + id + '"' : '') + '><span>' + label + '</span><div class="inp' + (cls ? ' ' + cls : '') + '">' + inner + '</div></label>';
}
function togHTML(id, title, sub, on) {
  return '<button type="button" class="tog' + (on ? ' on' : '') + '" id="' + id + '" data-act="tog:' + id + '" aria-pressed="' + !!on + '"><span class="tt"><b>' + title + '</b>' +
    (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="sw"></span></button>';
}
/* Colour = direction x whether up is good. Always an arrow too, never colour alone. */
function deltaHTML(d, upGood, fmt) {
  if (d == null || !isFinite(d)) return '';
  if (Math.abs(d) < 0.0005) return '<span class="dlt muted">same</span>';
  var up = d > 0;
  return '<span class="dlt ' + (up === upGood ? 'good' : 'bad') + '">' + ic(up ? 'up' : 'dn') + fmt(Math.abs(d)) + '</span>';
}
function cell(label, value, extra) { return '<div class="hs"><small>' + label + '</small><b>' + value + '</b>' + (extra || '') + '</div>'; }
function step(n, text) { return '<div class="stp"><i>' + n + '</i><span>' + text + '</span></div>'; }
function statusBadge(r) {
  switch (r.status) {
    case 'start': return '<span class="badge acc">START</span>';
    case 'partial': case 'nochain': return '<span class="badge">PARTIAL</span>';
    case 'missed': return '<span class="badge warn">SKIPPED</span>';
    case 'bad': return '<span class="badge bad">CHECK ODO</span>';
    default: return r.odd ? '<span class="badge warn">CHECK</span>' : '';
  }
}
function statusText(r) {
  switch (r.status) {
    case 'start': return r.f.full ? 'Starting point. MPG shows after your next full fill-up.' : 'Starting point, but not a full tank. Fill to full next time to start measuring.';
    case 'partial': return r.closedBy ? 'Partial fill. Part of a tank that got ' + F.mpg(r.closedBy.mpg) + ' MPG.' : 'Partial fill. It gets added to your next full tank.';
    case 'nochain': return 'Partial fill with no full tank before it. Fill to full to start measuring again.';
    case 'missed': return 'A fill-up before this one never got logged, so this tank does not count. The next one will.';
    case 'bad': return 'The odometer is not higher than the fill-up before it. Check it.';
    case 'ok': return r.odd ? 'Way off your usual. Check the numbers, or turn on "missed a fill-up".' : F.mi(r.miles) + ' mi on this tank, ' + F.cents(r.cpm) + ' a mile.';
  }
  return '';
}
function sampleBanner() {
  return '<div class="scanres chk" style="margin:0 0 12px">' + ic('info') + '<span>This is sample data so you can look around. <button class="lnkb" data-act="unsample">Clear it</button> or <button class="lnkb" data-act="vadd">add your car</button>.</span></div>';
}
function howPanel() {
  return '<section class="pnl"><div class="ph"><span class="lbl">How MPG is worked out</span></div><div class="note">' +
    '<p style="margin:0 0 8px">Your MPG comes from the pump, not a guess. When you fill to full, the gallons it takes are exactly what you burned since your last full tank. The miles come from the odometer.</p>' +
    '<p style="margin:0 0 8px"><b>Partial fills</b> get added to the next full tank. <b>A missed fill-up</b> makes that tank impossible to measure, so it is left out instead of wrecking your average.</p>' +
    '<p style="margin:0">Averages are total miles divided by total gallons. Averaging each tank\'s MPG would count a short tank the same as a long one.</p></div></section>';
}
function mpgSeriesOpts(oks, roll, avg, h) {
  return {
    h: h || 190, label: 'MPG for each tank',
    series: [
      { name: 'This tank', color: SERIES[0], dots: true, area: true, glow: true, pts: oks.map(function (r) { return { x: r.f.ts, y: r.mpg, odd: r.odd, r: r }; }) },
      { name: '3-tank average', color: SERIES[1], pts: oks.map(function (r, i) { return { x: r.f.ts, y: roll[i] }; }).filter(function (p) { return p.y != null; }) },
    ],
    ref: avg, refTag: 'avg', refVal: avg ? F.mpg(avg) : '',
    yFmt: function (v) { return String(Math.round(v)); },
    tipFmt: function (v) { return F.mpg(v); },
    tipHead: function (p) { return F.dayY(p.x); },
    tipExtra: function (p) { return p.r ? '<div class="tr" style="margin-top:6px"><span>' + F.mi(p.r.miles) + ' mi · ' + F.gal(p.r.gal) + ' gal · ' + F.cents(p.r.cpm) + '/mi</span></div>' : ''; },
  };
}

/* -------------------------------------------------------------- welcome --- */
function viewWelcome() {
  var g = UI.wGrade || '87';
  return '<div class="welcome">' + logoSVG('logo') + '<h2>OCTANE</h2><p class="tag">Real MPG, tank by tank.</p></div>' +
    '<section class="pnl"><div class="ph"><span class="lbl">Your car</span></div><div class="fgrid">' +
    fld('Name', '<input id="w_name" maxlength="40" autocomplete="off" placeholder="240SX, work truck, daily">') +
    fld('Tank size', '<input id="w_tank" inputmode="decimal" autocomplete="off" placeholder="15"><span class="u">gal</span>') +
    '<div class="fld"><span>Usual gas</span><div class="chips" id="w_grade">' + GRADES.map(function (x) {
      return '<button type="button" class="chip' + (g === x[0] ? ' on' : '') + '" data-act="wgrade:' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div></div>' +
    '<div class="hint">Tank size is in the owner\'s manual. It runs the fuel gauge and the range.</div>' +
    '<button class="btn pri block" data-act="wstart">' + ic('bolt') + 'Start tracking</button></div></section>' +
    '<section class="pnl"><div class="ph"><span class="lbl">How it works</span></div><div class="steps">' +
    step(1, 'Fill up to full and log it. Snap the pump and the numbers fill themselves in.') +
    step(2, 'Next time you fill up, log it again. The gallons it took are what you burned.') +
    step(3, 'OCTANE works out your real MPG, what every mile costs, and when you will need gas next.') +
    '</div></section>' +
    '<div class="brow" style="margin-bottom:10px"><button class="btn ghost" data-act="sample">' + ic('chart') + 'Sample data</button><button class="btn ghost" data-act="cloudrestore">' + ic('cloud') + 'Restore</button></div>' +
    '<button class="btn ghost block" data-act="imp">' + ic('ul') + 'Import a backup file</button>';
}
ACT.wgrade = function (g, b) { UI.wGrade = g; $$('#w_grade .chip').forEach(function (c) { c.classList.toggle('on', c === b); }); };
ACT.wstart = function () {
  var name = $('#w_name').value.trim(), tank = numIn($('#w_tank').value);
  if (!tank || tank < 1 || tank > 300) { $('#w_tank').focus(); toast('Enter your tank size in gallons.'); return; }
  var now = Date.now();
  var v = normVehicle({ id: uid(), name: name || 'My car', tank: tank, grade: UI.wGrade || '87', color: 'cyan', createdAt: now, updatedAt: now });
  S.vehicles.push(v);
  S.activeVid = v.id;
  commit();
  go('dash');
};

/* ----------------------------------------------------------------- dash --- */
function dashEmpty(v) {
  return (v.sample ? sampleBanner() : '') +
    '<section class="pnl hero"><div class="ph"><span class="lbl">Real MPG</span><span class="tag">no fill-ups yet</span></div>' +
    '<div class="dial">' + dialSVG({ lo: 10, hi: 40, label: 'No data yet' }) + '<div class="ctr"><div class="bignum">--</div><div class="bigunit">MPG</div></div></div>' +
    '<div class="note" style="text-align:center">Fill up to full and log it. That is your starting point.</div></section>' +
    '<div class="scanrow" style="margin-bottom:12px"><button class="scanbtn" data-act="scan:pump">' + ic('scan') + 'SCAN PUMP<small>fill the form from a photo</small></button>' +
    '<button class="scanbtn" data-act="add">' + ic('edit') + 'TYPE IT IN<small>odometer and gallons</small></button></div>' +
    '<section class="pnl"><div class="ph"><span class="lbl">For real numbers</span></div><div class="steps">' +
    step(1, 'Fill until the pump clicks off. Don\'t top off.') +
    step(2, 'Log every fill-up, even the partial ones.') +
    step(3, 'Forgot to log one? Say so on the next fill-up and that tank gets left out instead of wrecking your average.') +
    '</div></section>';
}

function dialFor(an, sm, lastOk) {
  if (!sm.mpg) {
    return dialSVG({ lo: 10, hi: 40, label: 'MPG not measured yet' }) +
      '<div class="ctr"><div class="bignum">--</div><div class="bigunit">MPG</div><div class="bigsub">after your next full fill-up</div></div>';
  }
  var vals = an.oks.filter(function (r) { return !r.odd; }).map(function (r) { return r.mpg; }).concat([sm.mpg]);
  if (lastOk) vals.push(lastOk.mpg);
  var lo = Math.max(0, Math.floor(Math.min.apply(null, vals) * 0.8 / 5) * 5), hi = Math.ceil(Math.max.apply(null, vals) * 1.12 / 5) * 5;
  while (hi - lo < 15) { if (lo >= 5) lo -= 5; else hi += 5; }
  return dialSVG({ lo: lo, hi: hi, avg: sm.mpg, last: lastOk ? lastOk.mpg : null, best: sm.best ? sm.best.mpg : null, worst: sm.worst ? sm.worst.mpg : null, animate: !UI.dialSeen && !reducedMotion(), label: 'Average ' + F.mpg(sm.mpg) + ' MPG' }) +
    '<div class="ctr"><div class="bignum" id="heroNum">' + F.mpg(sm.mpg) + '</div><div class="bigunit">AVG MPG</div><div class="bigsub">' + F.mi(sm.miles) + ' mi measured</div></div>';
}

function heroStats(an, sm, lastOk) {
  var r5 = recentMpg(an, 5), d = lastOk && sm.mpg ? lastOk.mpg - sm.mpg : null;
  return '<div class="hstats">' +
    cell('<i class="key" style="background:var(--s2)"></i>Last tank', lastOk ? F.mpg(lastOk.mpg) : '--', lastOk ? '<i>' + deltaHTML(d, true, function (x) { return x.toFixed(1); }) + '</i>' : '') +
    cell('Last 5', r5 ? F.mpg(r5) : '--', '<i class="muted">tanks</i>') +
    cell('Best', sm.best ? F.mpg(sm.best.mpg) : '--', sm.best ? '<i class="muted">' + F.day(sm.best.f.ts) + '</i>' : '') +
    '</div>';
}

function whenText(nf) {
  if (nf.days < 1) return 'today';
  if (nf.days < 2) return 'tomorrow';
  return 'in about ' + Math.round(nf.days) + ' days (' + F.wk(nf.ts) + ')';
}
function fuelPanel(an) {
  var fu = fuelNow(an);
  var h = '<section class="pnl"><div class="ph"><span class="lbl">Fuel now</span><button class="lnk" data-act="odo">' + (fu && fu.how === 'odo' ? 'Update odometer' : 'Enter odometer') + ic('chev') + '</button></div>';
  if (!fu || fu.unknown) {
    return h + '<div class="note">' + (fu && fu.unknown === 'nofull' ? 'Fill to full once and log it, then OCTANE can track what is in the tank.' : 'Your tank level and range show up after your first measured tank.') + '</div></section>';
  }
  var nf = nextFill(an, fu), pct = fu.pct, segs = Math.round(pct * 20);
  var low = pct < 0.12, warnLvl = pct < 0.25;
  var col = low ? 'var(--bad)' : warnLvl ? 'var(--warn)' : 'var(--accent)';
  var segHTML = '';
  for (var i = 0; i < 20; i++) segHTML += '<i' + (i < segs ? ' class="on" style="animation-delay:' + i * 30 + 'ms"' : '') + '></i>';
  h += '<div class="fuelhd"><b>' + F.mi(fu.range) + '</b><span>miles left</span><span class="pct" style="color:' + col + '">' +
    (warnLvl ? '<span class="lowtag" style="color:' + col + '">' + ic('warn') + (low ? 'LOW' : 'GETTING LOW') + '</span> ' : '') + F.pct(pct) + '</span></div>' +
    '<div class="meter" style="--mc:' + col + '" role="img" aria-label="Tank about ' + F.pct(pct) + ' full">' + segHTML + '</div>' +
    '<div class="meterlab"><span>E</span><span>' + F.gal1(fu.level) + ' of ' + F.gal1(fu.tank) + ' gal</span><span>F</span></div>' +
    '<div class="fuelrow">' + ic('pump') + '<span>' + (nf.due ? '<b>Time for gas.</b> You usually fill up around here.' : 'Next fill-up <b>' + whenText(nf) + '</b>') + '</span></div>' +
    '<div class="hint">' + (fu.how === 'odo' ? 'Worked out from the odometer you entered.' : 'Estimated from your usual ' + F.mi(milesPerDay(an)) + ' mi a day. Enter the odometer to make it exact.') + '</div>';
  return h + '</section>';
}

function kpiTiles(an, sm) {
  var mk = monthKey(Date.now()), months = monthly(an), last12 = months.slice(-12);
  var cur = months.filter(function (m) { return m.k === mk; })[0] || { spent: 0, miles: 0, n: 0 };
  var prev = months.filter(function (m) { return m.k === mk - 1; })[0];
  var L = an.list, lastF = L[L.length - 1];
  var pp = L.slice(-4, -1).filter(function (f) { return f.ppg > 0; }).map(function (f) { return f.ppg; });
  var pAvg = pp.length ? sum(pp) / pp.length : null;
  var o5 = an.oks.slice(-5), cpm5 = o5.length ? sum(o5.map(function (r) { return r.cost; })) / sum(o5.map(function (r) { return r.miles; })) : null;
  var c = function (x) { return (x * 100).toFixed(1) + '¢'; };
  function tile(label, value, sub, spark) {
    return '<div class="kpi"><div class="kl">' + label + '</div><div class="kr"><div class="kv">' + value + '</div>' + (spark || '') + '</div><div class="kd">' + sub + '</div></div>';
  }
  var month = F.mon(Date.now());
  return '<div class="kpis">' +
    tile('Cost per mile', F.cents(sm.cpm), cpm5 && sm.cpm && an.oks.length > 5 ? deltaHTML(cpm5 - sm.cpm, false, c) + ' last 5 tanks' : 'gas only', sparkSVG(an.oks.slice(-12).map(function (r) { return r.cpm; }), 58, 24)) +
    tile('Spent in ' + month, F.usd0(cur.spent), prev ? F.usd0(prev.spent) + ' last month' : cur.n + ' fill-up' + (cur.n === 1 ? '' : 's'), sparkSVG(last12.map(function (m) { return m.spent; }), 58, 24)) +
    tile('Gas price', F.ppg(lastF.ppg), pAvg ? deltaHTML(lastF.ppg - pAvg, false, c) + ' vs before' : gradeLabel(lastF.grade), sparkSVG(L.slice(-12).map(function (f) { return f.ppg; }), 58, 24)) +
    tile('Miles in ' + month, F.mi(cur.miles), 'about ' + F.mi(milesPerDay(an)) + ' a day', sparkSVG(last12.map(function (m) { return m.miles; }), 58, 24)) +
    '</div>';
}

function lastFillPanel(r) {
  var f = r.f;
  var m = r.status === 'ok' ? '<b class="' + (r.odd ? 'warn' : '') + '">' + F.mpg(r.mpg) + '</b><small>MPG</small>' : statusBadge(r);
  return '<section class="pnl"><div class="ph"><span class="lbl">Last fill-up</span><button class="lnk" data-act="edit:' + f.id + '">Edit' + ic('chev') + '</button></div>' +
    '<div class="lf"><div class="t">' + F.wk(f.ts) + (f.station ? ' · ' + esc(f.station) : '') + '</div><div class="m">' + m + '</div>' +
    '<div class="s">' + F.gal(f.gallons) + ' gal @ ' + F.ppg(f.ppg) + ' · ' + F.usd(f.total) + '</div></div>' +
    '<div class="hint">' + statusText(r) + '</div></section>';
}

VIEWS.dash = function () {
  var an = analyze(), v = an.v;
  if (!an.list.length) return dashEmpty(v);
  var sm = summarize(an), lastOk = an.oks.length ? an.oks[an.oks.length - 1] : null, last = an.rows[an.rows.length - 1];
  var h = v.sample ? sampleBanner() : '';
  h += '<section class="pnl hero"><div class="ph"><span class="lbl">Real MPG</span><span class="tag">' +
    (sm.tanks ? sm.tanks + ' tank' + (sm.tanks === 1 ? '' : 's') + ' measured' : 'measuring tank 1') + '</span></div>' +
    '<div class="dial" id="dial">' + dialFor(an, sm, lastOk) + '</div>' + heroStats(an, sm, lastOk) + '</section>';
  h += fuelPanel(an);
  h += kpiTiles(an, sm);
  h += lastFillPanel(last);
  if (an.oks.length >= 2) {
    h += '<section class="pnl"><div class="ph"><span class="lbl">Your last tanks</span><button class="lnk" data-act="tab:stats">All stats' + ic('chev') + '</button></div>' +
      legendHTML([['Each tank', SERIES[0], 'dot'], ['3-tank average', SERIES[1]]]) + '<div id="dashTrend"></div></section>';
  }
  return h;
};
MOUNT.dash = function (quiet) {
  var an = analyze();
  if (!an.list.length) return;
  var sm = summarize(an), n = $('#heroNum');
  if (!quiet && !UI.dialSeen && n && sm.mpg) countUp(n, sm.mpg, 1, 1200);
  UI.dialSeen = true;
  var el = $('#dashTrend');
  if (el) lineChart(el, mpgSeriesOpts(an.oks.slice(-12), rolling(an.oks, 3).slice(-12), sm.mpg, 170));
};
ACT.odo = function () { openOdoNow(); };

/* ------------------------------------------------------------------ log --- */
function logRow(r, avg) {
  var f = r.f, open = UI.openRow === f.id, right;
  /* The number stays white. Only a tank 5% or more off your average gets a
     coloured arrow and the difference, so normal pump noise does not look
     like an alarm. */
  if (r.status === 'ok') {
    var d = avg ? r.mpg - avg : 0, big = avg && Math.abs(d) >= avg * 0.05;
    right = '<b>' + F.mpg(r.mpg) + '</b>' + (r.odd ? '<small class="warn">CHECK</small>'
      : big ? '<small>' + deltaHTML(d, true, function (x) { return x.toFixed(1); }) + '</small>' : '<small>MPG</small>');
  } else right = statusBadge(r);
  return '<div class="frow' + (open ? ' open' : '') + '" role="button" tabindex="0" data-act="row:' + f.id + '">' +
    '<div class="ft"><span>' + F.day(f.ts) + (f.station ? ' · ' + esc(f.station) : '') + '</span>' + (f.scanned ? '<span class="badge acc" title="Scanned">SCAN</span>' : '') + '</div>' +
    '<div class="fm">' + right + '</div>' +
    '<div class="fs">' + F.gal(f.gallons) + ' gal · ' + F.usd(f.total) + (r.dist ? ' · +' + F.mi(r.dist) + ' mi' : '') + '</div>' +
    (open ? rowDetail(r) : '') + '</div>';
}
function rowDetail(r) {
  var f = r.f;
  function d(label, v, full) { return '<div' + (full ? ' class="full"' : '') + '><small>' + label + '</small><b>' + v + '</b></div>'; }
  var drive = DRIVES.filter(function (x) { return x[0] === f.drive; })[0];
  return '<div class="fdet">' + d('Odometer', F.mi(f.odo)) + d('Price', F.ppg(f.ppg)) +
    (r.status === 'ok' ? d('This tank', F.mi(r.miles) + ' mi') + d('Per mile', F.cents(r.cpm)) : '') +
    (r.days != null ? d('Days since last', r1(r.days)) : '') + d('Gas', gradeLabel(f.grade) || '--') +
    (drive ? d('Driving', drive[1]) : '') + (f.full ? '' : d('Tank', 'Partial fill')) +
    (f.dash && r.status === 'ok' ? d('Car said', F.mpg(f.dash) + ' (' + (f.dash >= r.mpg ? '+' : '') + Math.round((f.dash - r.mpg) / r.mpg * 100) + '%)') : '') +
    (r.status !== 'ok' || r.odd ? d('Note', statusText(r), true) : '') + (f.notes ? d('Notes', esc(f.notes), true) : '') +
    '<div class="full"><button class="btn sm block" data-act="edit:' + f.id + '">' + ic('edit') + 'Edit this fill-up</button></div></div>';
}
VIEWS.log = function () {
  var an = analyze();
  var h = '<h1 class="pg">Fill-ups <span class="muted mono">' + an.list.length + '</span>' + (an.list.length ? '<button class="btn sm ghost act" data-act="csv">' + ic('dl') + 'CSV</button>' : '') + '</h1>';
  if (an.v && an.v.sample) h += sampleBanner();
  if (!an.list.length) return h + '<section class="pnl"><div class="note">No fill-ups yet. Tap <b>+</b> to log your first one.</div></section>';
  var avg = summarize(an).mpg, rows = an.rows.slice().reverse(), groups = [];
  rows.forEach(function (r) {
    var k = monthKey(r.f.ts), g = groups[groups.length - 1];
    if (!g || g.k !== k) groups.push(g = { k: k, rows: [] });
    g.rows.push(r);
  });
  groups.forEach(function (g) {
    var spent = sum(g.rows.map(function (r) { return r.f.total; })), gal = sum(g.rows.map(function (r) { return r.f.gallons; })), mi = sum(g.rows.map(function (r) { return r.dist || 0; }));
    h += '<div class="mhead"><b>' + F.monY(monthStart(g.k)) + '</b><span>' + F.usd(spent) + '</span><span>' + F.gal1(gal) + ' gal</span><span>' + F.mi(mi) + ' mi</span></div>' +
      g.rows.map(function (r) { return logRow(r, avg); }).join('');
  });
  return h;
};
ACT.row = function (id) { UI.openRow = UI.openRow === id ? null : id; render(); };
ACT.edit = function (id) { openFill(id); };

/* --------------------------------------------------------------- garage --- */
VIEWS.garage = function () {
  var h = '<h1 class="pg"><button class="ibtn" data-act="back" aria-label="Back">' + ic('back') + '</button>Your cars</h1>';
  S.vehicles.forEach(function (v) {
    var an = analyze(v.id, true), sm = summarize(an), on = v.id === S.activeVid;
    var sub = [v.year, v.make, v.model].filter(Boolean).join(' ') || (v.sample ? 'Sample data' : F.gal1(v.tank) + ' gal tank');
    h += '<section class="pnl" style="--accent:' + COLORS[v.color] + '"><div class="vrow"><span class="vdot"></span><div class="vt"><b>' + esc(v.name) + '</b><small>' + esc(sub) + '</small></div>' +
      (on ? '<span class="badge acc">DRIVING</span>' : '') + '</div>' +
      '<div class="hstats" style="margin-top:12px">' + cell('Avg MPG', F.mpg(sm.mpg)) + cell('Fill-ups', an.list.length) + cell('Tank', F.gal1(v.tank) + ' gal') + '</div>' +
      '<div class="brow" style="margin-top:12px">' + (on ? '' : '<button class="btn sm pri" data-act="veh:' + v.id + '">Switch to this car</button>') +
      '<button class="btn sm ghost" data-act="vedit:' + v.id + '">' + ic('edit') + 'Edit</button></div></section>';
  });
  return h + '<button class="btn block" data-act="vadd">' + ic('plus') + 'Add a car</button>';
};
ACT.veh = function (id) { S.activeVid = id; UI.ver++; UI.dialSeen = false; persist(); go('dash'); toast('Now tracking ' + veh().name + '.'); };
ACT.vadd = function () { openVehicle(); };
ACT.vedit = function (id) { openVehicle(id); };

/* ------------------------------------------------------------- settings --- */
function cloudPanel() {
  var c = S.cloud;
  if (!c.on) {
    return '<section class="pnl"><div class="ph"><span class="lbl">Cloud backup</span><span class="tag">off</span></div>' +
      '<div class="note">Keep a copy of your log online. If this phone gets wiped or you switch phones, one code brings everything back.</div>' +
      '<div class="brow" style="margin-top:12px"><button class="btn pri" data-act="cloudon">' + ic('cloud') + 'Turn on</button><button class="btn ghost" data-act="cloudrestore">I have a code</button></div></section>';
  }
  return '<section class="pnl"><div class="ph"><span class="lbl">Cloud backup</span><span class="tag" id="cloudTag">' + cloudStatusText() + '</span></div>' +
    '<div class="note">Your backup code. Keep it somewhere safe, like a note or a screenshot. It is the only way to bring this log onto another phone.</div>' +
    '<div class="codebox">' + fmtCode(c.code) + '</div>' +
    '<div class="brow"><button class="btn sm" data-act="copycode">' + ic('copy') + 'Copy</button><button class="btn sm" data-act="cloudnow">' + ic('sync') + 'Back up now</button><button class="btn sm ghost" data-act="cloudoff">Turn off</button></div></section>';
}
function installPanel() {
  if (isStandalone()) return '';
  var body = isIOS()
    ? 'Tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>. OCTANE then opens full screen, works with no signal, and Safari stops treating your log as clearable website data.'
    : DEFER_INSTALL ? 'Install OCTANE so it opens like an app and works with no signal.' : 'Use your browser menu and pick <b>Install app</b> or <b>Add to Home screen</b>. It opens full screen and works with no signal.';
  return '<section class="pnl"><div class="ph"><span class="lbl">Put it on your home screen</span></div><div class="note">' + body + '</div>' +
    (DEFER_INSTALL ? '<button class="btn pri block" style="margin-top:12px" data-act="install">' + ic('dl') + 'Install</button>' : '') + '</section>';
}
VIEWS.settings = function () {
  var h = '<h1 class="pg"><button class="ibtn" data-act="back" aria-label="Back">' + ic('back') + '</button>Backup and settings</h1>';
  h += '<section class="pnl"><div class="ph"><span class="lbl">On this phone</span></div><div class="note">Last saved <b>' + (S.savedAt ? F.ago(S.savedAt) : 'not yet') + '</b>. ' +
    'This phone keeps two copies of your log, so losing one does not lose it.' + (S.cloud.on ? '' : ' Turn on cloud backup too if you never want to type it all in again.') + '</div></section>';
  h += cloudPanel();
  h += installPanel();
  h += '<section class="pnl"><div class="ph"><span class="lbl">Your data</span></div><div class="fgrid">' +
    '<button class="btn block" data-act="csv">' + ic('dl') + 'Spreadsheet (CSV)</button>' +
    '<div class="brow"><button class="btn ghost" data-act="json">' + ic('dl') + 'Backup file</button><button class="btn ghost" data-act="imp">' + ic('ul') + 'Import</button></div>' +
    (S.vehicles.some(function (v) { return v.sample; }) ? '<button class="btn ghost block" data-act="unsample">' + ic('x') + 'Clear sample data</button>' : '<button class="btn ghost block" data-act="sample">' + ic('chart') + 'Load sample data</button>') +
    '<button class="btn danger block" data-act="wipe">' + ic('trash') + 'Erase everything</button></div></section>';
  h += howPanel();
  h += '<section class="pnl"><div class="ph"><span class="lbl">Privacy</span></div><div class="note">Your log lives on this phone. Photos you scan are sent to Cloudflare\'s AI to be read and are not kept. ' +
    'Cloud backup stores your log under your code and nothing else about you. Place search uses Photon and routes use OSRM, both built on OpenStreetMap.</div></section>';
  return h + '<div class="hint" style="text-align:center;margin:18px 0 6px">OCTANE &middot; Smolder Studios</div>';
};
