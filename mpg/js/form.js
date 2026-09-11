/* OCTANE fill-up form, photo scanner, result screen, and the small sheets
 * (car, odometer now, restore from the cloud).
 *
 * Rule that bit the Sweat Shop app and must not come back: never rebuild the
 * innerHTML of anything that holds a focused input. Typing only ever updates
 * the preview box and the one computed field.
 */
'use strict';

var FM = null;   // the open fill-up form
var RES = null;  // the result overlay

function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
function chip(act, k, label, on) { return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-act="' + act + ':' + k + '">' + label + '</button>'; }

/* The fill-up right before this one on the odometer. */
function prevFillFor(vid, fill) {
  var L = fillsOf(vid).filter(function (f) { return !fill || f.id !== fill.id; });
  if (!fill) return L[L.length - 1] || null;
  var before = L.filter(function (f) { return f.odo < fill.odo; });
  return before[before.length - 1] || null;
}

function fillStations() {
  var seen = {}, out = [];
  S.fills.slice().sort(function (a, b) { return b.ts - a.ts; }).forEach(function (f) {
    var k = (f.station || '').toLowerCase();
    if (k && !seen[k]) { seen[k] = 1; out.push(f.station); }
  });
  var dl = $('#stations');
  if (dl) dl.innerHTML = out.slice(0, 30).map(function (s) { return '<option value="' + esc(s) + '">'; }).join('');
}

/* ------------------------------------------------------------ the form --- */
function openFill(id) {
  var editing = id ? S.fills.filter(function (f) { return f.id === id; })[0] : null;
  var v = editing ? veh(editing.vid) : veh();
  if (!v) return;
  var prev = prevFillFor(v.id, editing);
  FM = {
    id: editing ? editing.id : null, vid: v.id, prev: prev,
    mode: editing || !prev ? 'odo' : (S.prefs.distMode[v.id] || 'odo'),
    order: [], warned: '', grade: editing ? (editing.grade || v.grade) : v.grade, drive: editing ? editing.drive : '',
    full: editing ? editing.full : true, missed: editing ? editing.missed : false, scanned: editing ? editing.scanned : false,
  };
  var f = editing || {};
  var body = (editing ? '' : scanBlock()) +
    '<div class="fgrid" style="margin-top:' + (editing ? 0 : 14) + 'px">' +
    fld('When', '<input type="datetime-local" id="f_ts" value="' + toLocalInput(f.ts || Date.now()) + '">') +
    (prev && !editing ? '<div class="seg" id="f_mode"><button type="button" data-act="fmode:odo" class="' + (FM.mode === 'odo' ? 'on' : '') + '">Odometer</button>' +
      '<button type="button" data-act="fmode:trip" class="' + (FM.mode === 'trip' ? 'on' : '') + '">Trip meter</button></div>' : '') +
    '<div id="f_distbox">' + distField(f.odo) + '</div>' +
    '<div class="g3">' +
    fld('Gallons', '<input id="f_gal" inputmode="decimal" autocomplete="off" placeholder="0.000" value="' + (f.gallons != null ? f.gallons : '') + '">', '', 'fw_gal') +
    fld('Price/gal', '<span class="pre">$</span><input id="f_ppg" inputmode="decimal" autocomplete="off" placeholder="0.000" value="' + (f.ppg ? f.ppg.toFixed(3) : '') + '">', 'hasp', 'fw_ppg') +
    fld('Total', '<span class="pre">$</span><input id="f_tot" inputmode="decimal" autocomplete="off" placeholder="0.00" value="' + (f.total != null ? f.total.toFixed(2) : '') + '">', 'hasp', 'fw_tot') +
    '</div><div class="hint" id="f_mhint">Enter any two. The third fills itself in.</div>' +
    togHTML('f_full', 'Filled to full', 'Pumped until it clicked off.', FM.full) +
    togHTML('f_missed', 'Missed logging a fill-up before this', 'This tank won\'t count toward MPG. The next one will.', FM.missed) +
    '<div class="fld"><span>Gas</span><div class="chips" id="f_grade">' + GRADES.map(function (g) { return chip('fgrade', g[0], g[1], FM.grade === g[0]); }).join('') + '</div></div>' +
    '<details class="more"' + (editing && (f.station || f.notes || f.drive || f.dash) ? ' open' : '') + '><summary>More details' + ic('down') + '</summary><div class="in">' +
    '<div class="fld"><span>How you drove on this tank</span><div class="chips" id="f_drive">' + DRIVES.map(function (d) { return chip('fdrive', d[0], d[1], FM.drive === d[0]); }).join('') + '</div></div>' +
    fld('Station', '<input id="f_station" list="stations" maxlength="60" autocomplete="off" placeholder="Shell on 5th" value="' + esc(f.station || '') + '">') +
    fld('Car\'s MPG readout', '<input id="f_dash" inputmode="decimal" autocomplete="off" placeholder="What the dash says" value="' + (f.dash || '') + '"><span class="u">mpg</span>') +
    fld('Notes', '<textarea id="f_notes" maxlength="400" placeholder="Road trip, new tires, AC on...">' + esc(f.notes || '') + '</textarea>') +
    '</div></details>' +
    (editing ? '<button type="button" class="btn danger block" data-act="fdel">' + ic('trash') + 'Delete this fill-up</button>' : '') +
    '</div>';
  var foot = '<div class="pv" id="f_pv"></div><button type="button" class="btn pri block" data-act="fsave" id="f_save">' + ic('check') + (editing ? 'Save changes' : 'Save fill-up') + '</button>';
  openSheet({ title: editing ? 'Edit fill-up' : 'Log a fill-up', body: body, foot: foot, sticky: true, onClose: function () { FM = null; UI.onTog = null; } });
  fillStations();
  bindFill();
  updateDistHint();
  updatePreview();
}

function scanBlock() {
  return '<div id="scanArea"><div class="scanrow">' +
    '<button type="button" class="scanbtn" data-act="fscan:pump">' + ic('scan') + 'SCAN PUMP<small>or a receipt</small></button>' +
    '<button type="button" class="scanbtn" data-act="fscan:odometer">' + ic('dash') + 'SCAN DASH<small>odometer or trip</small></button>' +
    '</div><button type="button" class="pickln" data-act="fpick">Use a photo you already took</button></div>';
}
function distField(odo) {
  if (FM.mode === 'trip') return fld('Trip meter', '<input id="f_trip" inputmode="decimal" autocomplete="off" placeholder="Miles since last fill-up"><span class="u">mi</span>') + '<div class="hint" id="f_dhint"></div>';
  return fld('Odometer', '<input id="f_odo" inputmode="numeric" autocomplete="off" placeholder="Miles on the odometer" value="' + (odo != null ? odo : '') + '"><span class="u">mi</span>') + '<div class="hint" id="f_dhint"></div>';
}

function bindFill() {
  bindDist();
  ['gal', 'ppg', 'tot'].forEach(function (k) {
    var inp = $('#f_' + k);
    inp.addEventListener('input', function () { $('#fw_' + k).classList.remove('scanned'); onMoney(k); });
  });
  $('#f_ts').addEventListener('change', updatePreview);
  UI.onTog = function (id, on) {
    if (!FM) return;
    if (id === 'f_full') FM.full = on;
    if (id === 'f_missed') FM.missed = on;
    FM.warned = '';
    updatePreview();
  };
}
function bindDist() {
  ['f_odo', 'f_trip'].forEach(function (id) {
    var inp = document.getElementById(id);
    if (inp) inp.addEventListener('input', function () { var w = inp.closest('.fld'); if (w) w.classList.remove('scanned'); FM.warned = ''; updateDistHint(); updatePreview(); });
  });
}

/* Any two of gallons / price / total give the third. The field you did not
   touch most recently is the one that gets worked out. */
function onMoney(k) {
  FM.order = FM.order.filter(function (x) { return x !== k; }).concat([k]);
  FM.warned = '';
  var v = { gal: numIn(val('f_gal')), ppg: numIn(val('f_ppg')), tot: numIn(val('f_tot')) };
  var last2 = FM.order.filter(function (x) { return v[x] > 0; }).slice(-2);
  ['gal', 'ppg', 'tot'].forEach(function (x) { $('#fw_' + x).classList.remove('auto'); });
  var hint = 'Enter any two. The third fills itself in.';
  if (last2.length === 2) {
    var third = ['gal', 'ppg', 'tot'].filter(function (x) { return last2.indexOf(x) < 0; })[0], out = null;
    if (third === 'tot') out = r2(v.gal * v.ppg);
    if (third === 'gal' && v.ppg) out = r3(v.tot / v.ppg);
    if (third === 'ppg' && v.gal) out = r3(v.tot / v.gal);
    if (out != null && isFinite(out) && out > 0) {
      $('#f_' + third).value = third === 'tot' ? out.toFixed(2) : out.toFixed(3);
      $('#fw_' + third).classList.add('auto');
      hint = { tot: 'Total', gal: 'Gallons', ppg: 'Price' }[third] + ' worked out from the other two.';
    }
  }
  $('#f_mhint').textContent = hint;
  updatePreview();
}
function draftOdo() {
  if (FM.mode === 'trip') { var t = numIn(val('f_trip')); return t != null && FM.prev ? r1(FM.prev.odo + t) : null; }
  return numIn(val('f_odo'));
}
function draftFill() {
  var g = numIn(val('f_gal')), p = numIn(val('f_ppg')), t = numIn(val('f_tot'));
  if (t == null && g && p) t = r2(g * p);
  if (!p && g && t) p = r3(t / g);
  return {
    id: FM.id || '__draft', vid: FM.vid, ts: fromLocalInput(val('f_ts')) || Date.now(), odo: draftOdo(),
    gallons: g, ppg: p || 0, total: t, full: FM.full, missed: FM.missed, grade: FM.grade, drive: FM.drive,
    station: val('f_station').trim(), notes: val('f_notes'), dash: numIn(val('f_dash')),
  };
}
function updateDistHint() {
  var h = $('#f_dhint');
  if (!h || !FM) return;
  var p = FM.prev, d = draftOdo();
  h.className = 'hint';
  if (!p) { h.innerHTML = 'Your first fill-up for this car. It sets the starting point.'; return; }
  if (d == null) { h.innerHTML = FM.mode === 'trip' ? 'Miles on the trip meter since your last fill-up.' : 'Last fill-up: <b>' + F.mi(p.odo) + '</b>'; return; }
  if (d <= p.odo) { h.className = 'hint err'; h.innerHTML = '<b>Lower than the fill-up before (' + F.mi(p.odo) + ').</b>'; return; }
  h.innerHTML = (FM.mode === 'trip' ? 'Odometer <b>' + F.mi(d) + '</b> · ' : '') + '<b>+' + F.mi(d - p.odo) + ' mi</b> since the fill-up before';
}

/* Run the real engine with this draft slotted in, so the preview can never
   disagree with what saving will show. */
function previewRow(d) {
  var saved = S.fills;
  S.fills = saved.filter(function (f) { return f.id !== d.id; }).concat([d]);
  try { return analyze(d.vid, true).rows.filter(function (r) { return r.f === d; })[0] || null; }
  finally { S.fills = saved; }
}
function updatePreview() {
  var el = $('#f_pv');
  if (!el || !FM) return;
  el.className = 'pv';
  var d = draftFill();
  if (d.odo == null || !(d.gallons > 0)) {
    el.innerHTML = '<div class="pt">' + (FM.prev ? 'Add the ' + (FM.mode === 'trip' ? 'trip miles' : 'odometer') + ' and gallons to see this tank\'s MPG.' : 'Add the odometer and gallons. This first one is your starting point.') + '</div>';
    return;
  }
  var r = previewRow(d);
  if (!r) { el.innerHTML = ''; return; }
  if (r.status === 'ok') {
    var avg = summarize(analyze(FM.vid)).mpg, dl = avg != null ? r.mpg - avg : null;
    el.innerHTML = '<div><div class="pl">This tank</div><div class="pm">' + F.mpg(r.mpg) + '<small>MPG</small></div></div><div class="ps">' +
      (dl != null ? deltaHTML(dl, true, function (x) { return x.toFixed(1); }) + ' vs your avg<br>' : '') + F.mi(r.miles) + ' mi · ' + F.cents(r.cpm) + '/mi</div>';
  } else el.innerHTML = '<div class="pt">' + statusText(r) + '</div>';
}
function formMsg(msg, kind) {
  var el = $('#f_pv');
  if (!el) return;
  el.className = 'pv ' + (kind === 'err' ? 'pv-err' : 'pv-warn');
  el.innerHTML = '<div class="pt">' + ic(kind === 'err' ? 'x' : 'warn') + msg + '</div>';
}

function saveFill() {
  if (!FM) return;
  var d = draftFill(), v = veh(FM.vid), errs = [], warns = [];
  var L = fillsOf(FM.vid).filter(function (f) { return f.id !== FM.id; });
  if (d.odo == null) errs.push(FM.mode === 'trip' ? 'Enter the trip miles.' : 'Enter the odometer.');
  if (!(d.gallons > 0)) errs.push('Enter the gallons.');
  if (d.total == null) errs.push('Enter the price per gallon or the total.');
  if (!errs.length) {
    var last = L[L.length - 1], before = L.filter(function (f) { return f.odo < d.odo; }).pop();
    if (L.some(function (f) { return f.odo === d.odo; })) errs.push('Another fill-up already has odometer ' + F.mi(d.odo) + '.');
    else if (!FM.id && last && d.odo < last.odo && d.ts >= last.ts) errs.push('The odometer is lower than your last fill-up (' + F.mi(last.odo) + '). Check it.');
    if (before && d.odo - before.odo > 2000) warns.push('That is ' + F.mi(d.odo - before.odo) + ' miles since the fill-up before. Tap save again if that is right.');
    if (d.gallons > v.tank * 1.15) warns.push('That is more than your ' + F.gal1(v.tank) + ' gal tank holds. Tap save again if that is right.');
    if (d.ppg && (d.ppg < 1 || d.ppg > 12)) warns.push('The price per gallon looks off. Tap save again if it is right.');
    if (d.ppg && !pumpAgrees(d.total, d.gallons, d.ppg)) warns.push(F.gal(d.gallons) + ' gal × ' + F.ppg(d.ppg) + ' is ' + F.usd(r2(d.gallons * d.ppg)) + ', not ' + F.usd(d.total) + '. Tap save again to keep it.');
  }
  if (errs.length) { formMsg(errs[0], 'err'); return; }
  var wk = warns.join('|');
  if (warns.length && FM.warned !== wk) { FM.warned = wk; formMsg(warns[0], 'warn'); return; }

  var now = Date.now(), old = FM.id ? S.fills.filter(function (f) { return f.id === FM.id; })[0] : null, id = FM.id || uid();
  /* A fill-up logged on the sample car is sample data too: it must not reach
     the cloud, and clearing the sample has to take it with it. */
  var rec = normFill(Object.assign({}, old || {}, d, { id: id, vid: FM.vid, scanned: FM.scanned, sample: !!v.sample, createdAt: old ? old.createdAt : now, updatedAt: now }));
  if (!rec) { formMsg('Something is missing. Check the numbers.', 'err'); return; }
  if (old) S.fills = S.fills.map(function (f) { return f.id === id ? rec : f; });
  else S.fills.push(rec);
  if (!old && FM.prev) S.prefs.distMode[FM.vid] = FM.mode;
  S.prefs.prefsAt = now;
  commit();
  closeSheet();
  UI.dialSeen = false;
  render();
  if (old) toast('Fill-up saved.');
  else showResult(id);
}

Object.assign(ACT, {
  fsave: saveFill,
  fscan: function (hint) { UI.scanHint = hint; $('#camIn').click(); },
  fpick: function () { UI.scanHint = ''; $('#picIn').click(); },
  fmode: function (m) {
    if (!FM || FM.mode === m) return;
    var cur = draftOdo();
    FM.mode = m;
    $$('#f_mode button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-act') === 'fmode:' + m); });
    $('#f_distbox').innerHTML = distField(null);
    if (cur != null && FM.prev) { if (m === 'trip') $('#f_trip').value = r1(cur - FM.prev.odo); else $('#f_odo').value = Math.round(cur); }
    bindDist();
    updateDistHint();
    updatePreview();
  },
  fgrade: function (g, b) { if (!FM) return; FM.grade = g; $$('#f_grade .chip').forEach(function (c) { c.classList.toggle('on', c === b); }); },
  fdrive: function (d, b) {
    if (!FM) return;
    FM.drive = FM.drive === d ? '' : d;
    $$('#f_drive .chip').forEach(function (c) { c.classList.toggle('on', c === b && FM.drive === d); });
  },
  fdel: function () {
    if (!FM || !FM.id) return;
    var f = S.fills.filter(function (x) { return x.id === FM.id; })[0];
    if (!f) return;
    var L = fillsOf(f.vid), next = L[L.indexOf(f) + 1];
    confirmSheet({
      title: 'Delete fill-up', ok: 'Delete', danger: true,
      text: 'Delete the fill-up from <b>' + F.dayY(f.ts) + '</b> (' + F.gal(f.gallons) + ' gal, ' + F.usd(f.total) + ')?',
      toggle: next && !next.missed ? ['Leave the next tank out of MPG', 'Keep this on if it was a real fill-up. Without its gallons the next tank would read too high.', true] : null,
    }).then(function (r) {
      if (!r) return;
      var snap = JSON.stringify(S.fills), now = Date.now();
      S.fills = S.fills.filter(function (x) { return x.id !== f.id; });
      S.deleted[f.id] = now;
      var marked = next && !next.missed && r.toggle;
      if (marked) S.fills = S.fills.map(function (x) { return x.id === next.id ? Object.assign({}, x, { missed: true, updatedAt: now }) : x; });
      commit();
      closeSheet();
      render();
      toast('Fill-up deleted.', 'Undo', function () {
        var t = Date.now();
        S.fills = JSON.parse(snap).map(function (x) { return (x.id === f.id || (marked && x.id === next.id)) ? Object.assign(x, { updatedAt: t }) : x; });
        delete S.deleted[f.id];
        commit();
        render();
      }, 6500);
    });
  },
});

/* ---------------------------------------------------------------- scanner --- */
/* Phone photos are 12 MP. Shrink to 1600px on the long side first: plenty for
   the digits, and a fifth of the upload on a weak gas station signal. */
function shrinkImage(file, max, q) {
  return new Promise(function (res, rej) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * s));
      c.height = Math.max(1, Math.round(img.naturalHeight * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('image')); };
    img.src = url;
  });
}

function handleScanFile(file, hint) {
  if (!FM || !$('#scanArea')) return;
  shrinkImage(file, 1600, 0.85).then(function (dataUrl) {
    var area = $('#scanArea');
    if (!area || !FM) return;
    area.innerHTML = '<div class="scanbox"><img alt="" src="' + dataUrl + '"><div class="grd"></div><div class="laser"></div><div class="brk"></div><div class="st" id="scanSt">Reading your photo...</div></div>';
    var msgs = ['Finding the numbers...', 'Reading the digits...', 'Checking the math...', 'Taking a closer look...', 'Almost there...'], i = 0;
    var tick = setInterval(function () { var s = $('#scanSt'); if (s && i < msgs.length) s.textContent = msgs[i++]; }, 1400);
    var prev = FM.prev;
    return api('/scan', { method: 'POST', body: JSON.stringify({ image: dataUrl, hint: hint || '', prevOdo: prev ? prev.odo : 0 }) }, 45000)
      .then(function (res) { clearInterval(tick); scanDone(res, dataUrl, hint); })
      .catch(function () {
        clearInterval(tick);
        scanDone({ ok: false, j: { error: navigator.onLine === false ? 'No signal right now. Type the numbers in, it saves fine offline.' : 'Could not reach the scanner. Type the numbers in.' } }, dataUrl, hint);
      });
  }).catch(function () { scanShow(null, 'no', 'Could not open that photo. Try another one.'); });
}

function scanDone(res, dataUrl, hint) {
  if (!FM) return;
  var j = res.j || {};
  if (!res.ok || !j.ok) { scanShow(dataUrl, 'no', esc(j.error || 'Could not read that photo.')); return; }
  var fl = j.fields || {}, got = applyScan(fl, j.kind), c = j.check, kind = 'chk', msg;
  var money = got.indexOf('gallons') >= 0 || got.indexOf('price') >= 0 || got.indexOf('total') >= 0;
  if (!got.length) { kind = 'no'; msg = 'Could not find the numbers in that photo. Get a little closer and try again, or type them in.'; }
  else if (!money) {
    var o = fl.odometer, p = FM.prev;
    if (o != null && p && o <= p.odo) msg = 'Read the odometer as <b>' + F.mi(o) + '</b>, but that is lower than your last fill-up (' + F.mi(p.odo) + '). Check it.';
    else { kind = 'ok'; msg = o != null ? 'Odometer <b>' + F.mi(o) + '</b>' + (p ? ', ' + F.mi(o - p.odo) + ' mi since your last fill-up' : '') + '. Check it matches the dash.' : 'Trip meter <b>' + fl.trip + '</b>. Check it matches the dash.'; }
  }
  else if (c === 'ok' || c === 'fixed') { kind = 'ok'; msg = '<b>Checked.</b> ' + F.gal(fl.gallons) + ' gal × ' + F.ppg(fl.price) + ' = ' + F.usd(fl.total) + ', same as the pump.'; }
  else if (c === 'check') msg = 'Read it, but the price has no tenth of a cent. Check the price.';
  else if (c === 'derived') msg = 'Only two of the three numbers were readable, so the third is worked out. Give them a quick check.';
  else if (c === 'mismatch') msg = 'These don\'t add up: ' + F.gal(fl.gallons) + ' × ' + F.ppg(fl.price) + ' is ' + F.usd(r2(fl.gallons * fl.price)) + ', not ' + F.usd(fl.total) + '. Fix the one that is off.';
  else msg = 'Filled in the ' + got.join(', ') + '. Check it matches.';
  scanShow(dataUrl, kind, msg);
}

function scanShow(dataUrl, kind, msg) {
  var area = $('#scanArea');
  if (!area) return;
  area.innerHTML = (dataUrl ? '<div class="scanbox done"><img alt="Your photo" src="' + dataUrl + '"><div class="brk"></div></div>' : '') +
    '<div class="scanres ' + kind + '">' + ic(kind === 'ok' ? 'check' : kind === 'no' ? 'x' : 'warn') + '<span>' + msg + '</span></div>' +
    '<div class="brow" style="margin-top:10px"><button type="button" class="btn sm ghost" data-act="fscan:pump">' + ic('scan') + 'Pump</button>' +
    '<button type="button" class="btn sm ghost" data-act="fscan:odometer">' + ic('dash') + 'Dash</button>' +
    '<button type="button" class="btn sm ghost" data-act="fpick">' + ic('img') + 'Photo</button></div>';
}

function gradeFrom(s, v) {
  if (!s) return null;
  s = String(s).toLowerCase();
  if (/diesel/.test(s)) return 'diesel';
  if (/e-?85|flex/.test(s)) return 'e85';
  var m = s.match(/\b(8[5-9]|9[0-4])\b/);
  if (m) { var n = +m[1]; return n <= 87 ? '87' : n <= 89 ? '89' : n <= 91 ? '91' : '93'; }
  if (/prem|super|ultra|supreme|power/.test(s)) return v && (v.grade === '93' || v.grade === '91') ? v.grade : '91';
  if (/plus|mid|special/.test(s)) return '89';
  if (/unl|reg/.test(s)) return '87';
  return null;
}

/* Put what the scanner read into the form and flash each field it touched. */
function applyScan(fl, kind) {
  var got = [];
  function put(id, v, txt) {
    var inp = document.getElementById(id);
    if (!inp || v == null) return false;
    inp.value = txt;
    var w = inp.closest('.fld');
    if (w) { w.classList.remove('scanned', 'auto'); void w.offsetWidth; w.classList.add('scanned'); }
    return true;
  }
  if (put('f_gal', fl.gallons, fl.gallons != null ? fl.gallons.toFixed(3) : '')) got.push('gallons');
  if (put('f_ppg', fl.price, fl.price != null ? fl.price.toFixed(3) : '')) got.push('price');
  if (put('f_tot', fl.total, fl.total != null ? fl.total.toFixed(2) : '')) got.push('total');
  if (fl.odometer != null) {
    if (FM.mode !== 'odo') ACT.fmode('odo');
    if (put('f_odo', fl.odometer, String(fl.odometer))) got.push('odometer');
  } else if (fl.trip != null && FM.prev && kind === 'odometer') {
    if (FM.mode !== 'trip') ACT.fmode('trip');
    if (put('f_trip', fl.trip, String(fl.trip))) got.push('trip miles');
  }
  var g = gradeFrom(fl.grade, veh(FM.vid));
  if (g) { FM.grade = g; $$('#f_grade .chip').forEach(function (c) { c.classList.toggle('on', c.getAttribute('data-act') === 'fgrade:' + g); }); }
  if (got.length) { FM.scanned = true; FM.order = []; FM.warned = ''; $('#f_mhint').textContent = 'Filled in from your photo.'; }
  updateDistHint();
  updatePreview();
  return got;
}

/* ---------------------------------------------------------- result screen --- */
function ringHTML(frac, inner) {
  return '<div class="ring"><svg viewBox="0 0 236 236"><circle cx="118" cy="118" r="104" fill="none" stroke="rgba(120,190,255,.1)" stroke-width="10"/>' +
    '<circle class="resarc" cx="118" cy="118" r="104" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" transform="rotate(-90 118 118)" ' +
    'stroke-dasharray="653.5" stroke-dashoffset="' + (653.5 * (1 - clamp(frac, 0.03, 1))).toFixed(1) + '" style="filter:drop-shadow(0 0 8px var(--accent))" data-frac="' + frac + '"/></svg>' +
    '<div class="c">' + inner + '</div></div>';
}
function showResult(id) {
  var an = analyze(), r = an.rows.filter(function (x) { return x.f.id === id; })[0];
  if (!r) return;
  var h, party = false;
  if (r.status === 'ok') {
    var before = an.oks.slice(0, an.oks.indexOf(r)).filter(function (o) { return !o.odd; }), avgB = mpgOf(before), badges = [];
    var bestB = before.length ? Math.max.apply(null, before.map(function (o) { return o.mpg; })) : 0;
    if (r.odd) badges.push(['warn', 'Way off your usual. Check the numbers.', '']);
    else {
      if (before.length >= 3 && r.mpg > bestB) { badges.push(['trophy', 'Best tank yet', 'gold']); party = true; }
      if (before.length >= 3 && r.miles > Math.max.apply(null, before.map(function (o) { return o.miles; }))) badges.push(['road', 'Longest tank yet', '']);
      if (avgB && r.mpg >= avgB * 1.02) badges.push(['up', F.mpg(r.mpg - avgB) + ' over your average', '']);
      var recent = an.list.filter(function (f) { return f.id !== id && f.ts < r.f.ts && f.ts > r.f.ts - 90 * DAY && f.ppg > 0; }).map(function (f) { return f.ppg; });
      if (recent.length >= 3 && r.f.ppg < Math.min.apply(null, recent)) badges.push(['drop', 'Cheapest gas in 90 days', '']);
    }
    var top = Math.max(r.mpg, avgB || 0, bestB) * 1.12;
    h = ringHTML(r.mpg / top, '<div class="rv" id="resNum">' + F.mpg(r.mpg) + '</div><div class="ru">MPG</div>') +
      '<h3>This tank</h3><div class="rl">' + F.mi(r.miles) + ' mi on ' + F.gal(r.gal) + ' gal<br>' + F.usd(r.cost) + ' of gas · ' + F.cents(r.cpm) + ' a mile' +
      (r.span > 1 ? '<br>includes ' + (r.span - 1) + ' partial fill' + (r.span > 2 ? 's' : '') : '') + (avgB ? '<br>your average before this: ' + F.mpg(avgB) : '') + '</div>' +
      (badges.length ? '<div class="rb">' + badges.map(function (b, i) { return '<span class="' + b[2] + '" style="animation-delay:' + (900 + i * 150) + 'ms">' + ic(b[0]) + esc(b[1]) + '</span>'; }).join('') + '</div>' : '');
    party = party || !r.odd;
  } else {
    var t = {
      start: ['drop', 'Starting point saved', 'Next time, fill to full and log it. That is your first real MPG.'],
      partial: ['drop', 'Partial fill saved', 'It gets added to your next full tank.'],
      nochain: ['drop', 'Partial fill saved', 'Fill to full next time to start measuring again.'],
      missed: ['warn', 'Saved', 'This tank is left out because a fill-up before it never got logged. The next one counts.'],
      bad: ['warn', 'Saved, but check it', 'The odometer is not higher than the fill-up before it.'],
    }[r.status] || ['check', 'Saved', ''];
    h = '<svg class="icoBig" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + I[t[0]] + '</svg>' +
      '<h3>' + t[1] + '</h3><div class="rl" style="font-family:var(--body);max-width:300px">' + t[2] + '</div>';
  }
  var el = document.createElement('div');
  el.className = 'res';
  el.innerHTML = h + '<button type="button" class="btn pri" data-act="resdone">' + ic('check') + 'Done</button>';
  el.addEventListener('click', function (e) { if (e.target === el) closeResult(); });
  document.body.appendChild(el);
  RES = el;
  if (r.status === 'ok') {
    countUp($('#resNum'), r.mpg, 1, 1300);
    var arc = el.querySelector('.resarc');
    if (arc && arc.animate) arc.animate([{ strokeDashoffset: 653.5 }, { strokeDashoffset: +arc.getAttribute('stroke-dashoffset') }], { duration: 1300, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (party) burst(el.querySelector('.ring'));
  }
}
function burst(host) {
  if (!host || !host.animate || reducedMotion()) return;
  for (var i = 0; i < 22; i++) {
    var d = document.createElement('i'), a = Math.random() * Math.PI * 2, dist = 110 + Math.random() * 90;
    d.className = 'burst';
    host.appendChild(d);
    d.animate([{ transform: 'translate(-50%,-50%)', opacity: 1 }, { transform: 'translate(calc(-50% + ' + Math.round(Math.cos(a) * dist) + 'px),calc(-50% + ' + Math.round(Math.sin(a) * dist) + 'px))', opacity: 0 }],
      { duration: 900 + Math.random() * 500, delay: 700 + Math.random() * 300, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'both' });
  }
}
function closeResult() {
  if (!RES) return;
  RES.remove();
  RES = null;
  if (UI.pendingRender && !sheetOpen()) { UI.pendingRender = false; render(); }
}
ACT.resdone = function () { closeResult(); };

/* -------------------------------------------------------------------- car --- */
function openVehicle(id) {
  var v = id ? veh(id) : null;
  var d = v || { name: '', tank: '', grade: '87', odoCorr: 0, color: Object.keys(COLORS)[S.vehicles.filter(function (x) { return !x.sample; }).length % 6], year: '', make: '', model: '' };
  UI.vColor = d.color; UI.vGrade = d.grade;
  var body = '<div class="fgrid">' +
    fld('Name', '<input id="v_name" maxlength="40" autocomplete="off" placeholder="240SX, work truck, daily" value="' + esc(d.name) + '">') +
    fld('Tank size', '<input id="v_tank" inputmode="decimal" autocomplete="off" placeholder="15" value="' + esc(d.tank) + '"><span class="u">gal</span>') +
    '<div class="fld"><span>Usual gas</span><div class="chips" id="v_grade">' + GRADES.map(function (g) { return chip('vgrade', g[0], g[1], d.grade === g[0]); }).join('') + '</div></div>' +
    '<div class="fld"><span>Color</span><div class="swatches" id="v_color">' + Object.keys(COLORS).map(function (k) {
      return '<button type="button" class="swatch' + (d.color === k ? ' on' : '') + '" style="background:' + COLORS[k] + '" data-act="vcolor:' + k + '" aria-label="' + k + '"></button>';
    }).join('') + '</div></div>' +
    '<details class="more"' + (d.year || d.make || d.odoCorr ? ' open' : '') + '><summary>More details' + ic('down') + '</summary><div class="in">' +
    '<div class="g3">' + fld('Year', '<input id="v_year" inputmode="numeric" maxlength="4" autocomplete="off" value="' + esc(d.year) + '">') +
    fld('Make', '<input id="v_make" maxlength="30" autocomplete="off" value="' + esc(d.make) + '">') +
    fld('Model', '<input id="v_model" maxlength="30" autocomplete="off" value="' + esc(d.model) + '">') + '</div>' +
    fld('Odometer correction', '<input id="v_corr" inputmode="decimal" autocomplete="off" placeholder="0" value="' + (d.odoCorr || '') + '"><span class="u">%</span>') +
    '<div class="hint">Only if your odometer is off, like after bigger tires. Reads 3% low? Put 3. Reads high? Put -3.</div></div></details>' +
    (v ? '<button type="button" class="btn danger block" data-act="vdel:' + v.id + '">' + ic('trash') + 'Delete this car</button>' : '') + '</div>';
  openSheet({ title: v ? 'Edit car' : 'Add a car', body: body, foot: '<button type="button" class="btn pri block" data-act="vsave:' + (v ? v.id : '') + '">' + ic('check') + (v ? 'Save' : 'Add car') + '</button>' });
}
Object.assign(ACT, {
  vgrade: function (g, b) { UI.vGrade = g; $$('#v_grade .chip').forEach(function (c) { c.classList.toggle('on', c === b); }); },
  vcolor: function (k, b) { UI.vColor = k; $$('#v_color .swatch').forEach(function (c) { c.classList.toggle('on', c === b); }); },
  vsave: function (id) {
    var tank = numIn(val('v_tank'));
    if (!tank || tank < 1 || tank > 300) { toast('Enter the tank size in gallons.'); $('#v_tank').focus(); return; }
    var now = Date.now(), old = id ? veh(id) : null;
    var v = normVehicle(Object.assign({}, old || { id: uid(), createdAt: now }, {
      name: val('v_name').trim() || 'My car', tank: tank, grade: UI.vGrade, color: UI.vColor, year: val('v_year'),
      make: val('v_make').trim(), model: val('v_model').trim(), odoCorr: numIn(val('v_corr')) || 0, updatedAt: now, sample: old ? old.sample : false,
    }));
    if (old) S.vehicles = S.vehicles.map(function (x) { return x.id === v.id ? v : x; });
    else { S.vehicles.push(v); S.activeVid = v.id; }
    commit();
    closeSheet();
    UI.dialSeen = false;
    if (old) render(); else go('dash');
    toast(old ? 'Saved.' : v.name + ' added. Log a fill-up to start.');
  },
  vdel: function (id) {
    var v = veh(id);
    if (!v) return;
    var n = S.fills.filter(function (f) { return f.vid === id; }).length;
    confirmSheet({
      title: 'Delete ' + v.name, ok: 'Delete', danger: true,
      text: 'This deletes <b>' + esc(v.name) + '</b> and its <b>' + n + ' fill-up' + (n === 1 ? '' : 's') + '</b>. ' + (S.cloud.on && !v.sample ? 'They come out of the cloud backup too.' : 'This cannot be undone.'),
    }).then(function (r) {
      if (!r) return;
      var now = Date.now();
      S.fills.forEach(function (f) { if (f.vid === id && !f.sample) S.deleted[f.id] = now; });
      if (!v.sample) S.deleted[id] = now;
      S.fills = S.fills.filter(function (f) { return f.vid !== id; });
      S.vehicles = S.vehicles.filter(function (x) { return x.id !== id; });
      if (S.activeVid === id) S.activeVid = S.vehicles[0] ? S.vehicles[0].id : null;
      commit();
      closeSheet();
      go(S.vehicles.length ? 'garage' : 'dash');
      toast(v.name + ' deleted.');
    });
  },
});

/* ---------------------------------------------------------- odometer now --- */
function openOdoNow() {
  var v = veh(), last = lastFill(v.id), on = S.odoNow[v.id];
  var keep = on && last && on.ts >= last.ts ? on.odo : '';
  openSheet({
    title: 'Odometer now', small: true,
    body: '<div class="fgrid">' + fld('Odometer right now', '<input id="o_odo" inputmode="numeric" autocomplete="off" placeholder="Miles on the odometer" value="' + keep + '"><span class="u">mi</span>') +
      '<div class="hint">' + (last ? 'Last fill-up was at <b>' + F.mi(last.odo) + '</b>. ' : '') + 'This makes the fuel left and range exact.</div></div>',
    foot: '<button type="button" class="btn pri block" data-act="osave">' + ic('check') + 'Update</button>',
  });
}
ACT.osave = function () {
  var v = veh(), last = lastFill(v.id), o = numIn(val('o_odo'));
  if (o == null) { toast('Enter the odometer.'); return; }
  if (last && o < last.odo) { toast('That is lower than your last fill-up (' + F.mi(last.odo) + ').'); return; }
  S.odoNow[v.id] = { odo: o, ts: Date.now() };
  persist();
  closeSheet();
  render();
};

/* --------------------------------------------------------------- restore --- */
function openRestore() {
  openSheet({
    title: 'Restore from the cloud', small: true,
    body: '<div class="fgrid">' + fld('Backup code', '<input id="r_code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH-JKLM-..." value="' +
      esc(S.cloud.code && !S.cloud.on ? fmtCode(S.cloud.code) : '') + '" style="font-family:var(--mono);font-size:16px">') +
      '<div class="hint">The code from Backup and settings on your other phone. Anything already on this phone stays and gets combined with it.</div></div>',
    foot: '<button type="button" class="btn pri block" data-act="rgo" id="r_go">' + ic('cloud') + 'Restore</button>',
  });
}
ACT.rgo = function () {
  var code = cleanCode(val('r_code')), b = $('#r_go');
  if (!/^[A-Z2-7]{24}$/.test(code)) { toast('That code does not look right. It has 24 letters and numbers.'); return; }
  b.disabled = true;
  b.innerHTML = ic('sync') + 'Restoring...';
  api('/backup/' + code).then(function (g) {
    if (g.status === 404) throw new Error('No backup with that code.');
    if (!g.ok || !g.j) throw new Error('Could not reach the backup. Try again with signal.');
    applyPayload(mergeData(payload(), g.j.data));
    S.cloud = { on: true, code: code, rev: g.j.rev, lastSync: Date.now(), dirty: canon(payload()) !== canon(g.j.data), err: '' };
    if (!veh()) S.activeVid = S.vehicles[0] ? S.vehicles[0].id : null;
    UI.ver++;
    persist();
    closeSheet();
    go('dash');
    toast('Restored ' + S.fills.filter(function (f) { return !f.sample; }).length + ' fill-ups.');
    if (S.cloud.dirty) syncNow();
  }).catch(function (e) {
    b.disabled = false;
    b.innerHTML = ic('cloud') + 'Restore';
    toast(e && e.message ? e.message : 'Could not restore.');
  });
};
