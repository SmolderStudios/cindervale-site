/* OCTANE app shell: icons, top bar, tab bar, routing, sheets, toasts, the
 * click wiring, import/export, sample data, cloud backup buttons and boot.
 * Screens live in views.js, the fill-up form and scanner in form.js.
 * Loads last, so everything it calls at boot already exists.
 */
'use strict';

/* ------------------------------------------------------------------ icons --- */
var I = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  cam: '<path d="M3 8.5h3.5L8.5 5.5h7l2 3H21V19H3z"/><circle cx="12" cy="13.2" r="3.6"/>',
  img: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  dash: '<path d="M4 16.5a8 8 0 1 1 16 0"/><path d="M12 16.5l4.2-5"/><circle cx="12" cy="16.5" r="1.4"/>',
  log: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><circle cx="4.8" cy="6.5" r="1"/><circle cx="4.8" cy="12" r="1"/><circle cx="4.8" cy="17.5" r="1"/>',
  stats: '<path d="M5 19.5V12M10.5 19.5V5.5M16 19.5v-6M21 19.5H3"/>',
  trip: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8"/>',
  car: '<path d="M3.5 15l1.7-4.8A2 2 0 0 1 7.1 8.8h9.8a2 2 0 0 1 1.9 1.4L20.5 15v3h-17z"/><path d="M3.5 15h17"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="16.5" cy="18" r="1.6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.4 9.9 4.3 4.3 0 0 0 7 18.5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  dn: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  ul: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  pump: '<path d="M4.5 20V5.2A1.7 1.7 0 0 1 6.2 3.5h6.1A1.7 1.7 0 0 1 14 5.2V20M3 20h12.5M7 7.5h4.5v3.5H7z"/><path d="M14 10h1.8a1.5 1.5 0 0 1 1.5 1.5v5a1.4 1.4 0 0 0 2.8 0V8.6L17.3 6"/>',
  drop: '<path d="M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9.5 17h5v3.5h-5z"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.3v.2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M15.5 8.5v-3a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3"/>',
  sync: '<path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9"/><path d="M18.5 3.5v3.7h-3.7M5.5 20.5v-3.7h3.7"/>',
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  road: '<path d="M8 3L4 21M16 3l4 18M12 5v2.5M12 11v2.5M12 17v2.5"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5"/>',
  share: '<path d="M12 15V3.5M8 7.2l4-3.7 4 3.7M6.5 11H5v9.5h14V11h-1.5"/>',
  chart: '<path d="M4 18l5-6 4 3 7-8"/><path d="M4 4v16h16"/>',
};
function ic(name, cls) {
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[name] || '') + '</svg>';
}
/* The mark: a fuel gauge whose ring is the O. */
function logoSVG(cls) {
  var id = 'lg' + (++CH_ID);
  return '<svg class="' + (cls || '') + '" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4be1ff"/><stop offset="1" stop-color="#ff5ad9"/></linearGradient></defs>' +
    '<path d="M16.4 48.6A22 22 0 1 1 47.6 48.6" fill="none" stroke="url(#' + id + ')" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M32 33L43.4 20.4" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="33" r="4.5" fill="#fff"/>' +
    '<path d="M32 44.5s4.2 4.5 4.2 7.3a4.2 4.2 0 0 1-8.4 0c0-2.8 4.2-7.3 4.2-7.3z" fill="#4be1ff"/></svg>';
}

/* ----------------------------------------------------------------- chrome --- */
function applyAccent() {
  var v = veh();
  document.documentElement.style.setProperty('--accent', COLORS[(v && v.color) || 'cyan']);
}
function renderTop() {
  var v = veh();
  $('#top').innerHTML = '<div class="brand">' + logoSVG() + '<span>OCTANE</span></div>' +
    (v ? '<button class="vsel" data-act="go:garage" aria-label="Change car"><span class="vdot"></span><span class="vn">' + esc(v.name) + '</span>' + ic('down') + '</button>' : '') +
    '<div class="grow"></div>' +
    '<button class="ibtn' + (S.cloud.on ? ' on' : '') + '" data-act="go:settings" aria-label="Backup and settings">' + ic('gear') + '<i class="sdot" id="sdot"></i></button>';
  onSyncState();
}
function renderTabs() {
  var t = $('#tabs');
  if (!S.vehicles.length) { t.innerHTML = ''; return; }
  function tab(v, icon, label) { return '<button class="tab' + (UI.view === v ? ' on' : '') + '" data-act="tab:' + v + '">' + ic(icon) + '<span>' + label + '</span></button>'; }
  t.innerHTML = '<div class="bar">' + tab('dash', 'dash', 'Dash') + tab('log', 'log', 'Log') +
    '<button class="fab" data-act="add" aria-label="Log a fill-up">' + ic('plus') + '</button>' +
    tab('stats', 'stats', 'Stats') + tab('trip', 'trip', 'Trip') + '</div>';
}
function onSyncState(changed) {
  var d = document.getElementById('sdot');
  if (d) d.className = 'sdot ' + (!S.cloud.on ? '' : SYNC.busy ? 'busy' : S.cloud.err ? 'err' : S.cloud.lastSync ? 'ok' : '');
  var tag = document.getElementById('cloudTag');
  if (tag) tag.textContent = cloudStatusText();
  if (changed) { if (sheetOpen() || RES) UI.pendingRender = true; else render(); }
}
function cloudStatusText() {
  var c = S.cloud;
  if (!c.on) return 'off';
  if (SYNC.busy) return 'backing up...';
  if (c.err === 'offline') return 'waiting for signal';
  if (c.err) return 'could not reach it';
  return c.lastSync ? 'backed up ' + F.ago(c.lastSync) : 'not yet';
}

/* ---------------------------------------------------------------- routing --- */
function go(v, push) {
  if (!VIEWS[v]) v = 'dash';
  UI.view = v;
  try { history[push ? 'pushState' : 'replaceState']({ v: v }, '', '#' + v); } catch (e) { }
  render();
  var el = $('#view');
  if (el) el.scrollTop = 0;
}
function render() {
  tipHide();
  applyAccent();
  renderTop();
  renderTabs();
  var el = $('#view');
  if (!S.vehicles.length) { el.innerHTML = '<div class="wrap">' + viewWelcome() + '</div>'; return; }
  if (!VIEWS[UI.view]) UI.view = 'dash';
  el.innerHTML = '<div class="wrap v-' + UI.view + '">' + VIEWS[UI.view]() + '</div>';
  if (MOUNT[UI.view]) MOUNT[UI.view]();
}

/* ----------------------------------------------------------------- sheets --- */
/* One history entry covers the whole sheet stack, so the Android back button
   closes the top sheet. Only ONE entry: browsers coalesce two history.back()
   calls made in the same tick, which would leave a stray skip behind and eat
   the next real back press. */
var SHEETS = [];
function openSheet(o) {
  var el = document.createElement('div');
  el.className = 'sheet' + (o.small ? ' small' : '');
  el.innerHTML = '<div class="sh" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '"><div class="sh-h"><h2>' + esc(o.title) + '</h2>' +
    '<button class="ibtn" data-act="shclose" aria-label="Close">' + ic('x') + '</button></div><div class="sh-b">' + o.body + '</div>' +
    (o.foot ? '<div class="sh-f">' + o.foot + '</div>' : '') + '</div>';
  if (!o.sticky) el.addEventListener('click', function (e) { if (e.target === el) closeSheet(); });
  document.body.appendChild(el);
  if (!SHEETS.length) { try { history.pushState({ sheet: 1, v: UI.view }, '', '#' + UI.view); } catch (e) { } }
  SHEETS.push({ el: el, o: o });
  tipHide();
  return el;
}
function closeSheet(fromPop) {
  var s = SHEETS.pop();
  if (!s) return false;
  s.el.remove();
  if (s.o.onClose) s.o.onClose();
  if (!SHEETS.length && !fromPop && history.state && history.state.sheet) { UI.skipPop = 1; try { history.back(); } catch (e) { UI.skipPop = 0; } }
  if (!SHEETS.length && !RES && UI.pendingRender) { UI.pendingRender = false; render(); }
  return true;
}
function sheetOpen() { return SHEETS.length > 0; }

window.addEventListener('popstate', function () {
  if (UI.skipPop) { UI.skipPop = 0; return; }
  if (SHEETS.length) {
    closeSheet(true);
    if (SHEETS.length) { try { history.pushState({ sheet: 1, v: UI.view }, '', '#' + UI.view); } catch (e) { } }
    return;
  }
  if (RES) { closeResult(); return; }
  var v = (location.hash || '#dash').slice(1);
  UI.view = VIEWS[v] ? v : 'dash';
  render();
});

function confirmSheet(o) {
  return new Promise(function (res) {
    var done = false;
    var body = '<div class="note" style="font-size:14px">' + o.text + '</div>' +
      (o.toggle ? '<div style="margin-top:14px">' + togHTML('c_tog', o.toggle[0], o.toggle[1], o.toggle[2]) + '</div>' : '');
    var foot = '<div class="brow"><button class="btn ghost" data-act="shclose">Cancel</button><button class="btn ' + (o.danger ? 'danger' : 'pri') + '" id="c_ok">' + esc(o.ok || 'OK') + '</button></div>';
    var el = openSheet({ title: o.title, body: body, foot: foot, small: true, onClose: function () { if (!done) res(null); } });
    el.querySelector('#c_ok').onclick = function () {
      done = true;
      var t = el.querySelector('#c_tog');
      var v = t ? t.classList.contains('on') : true;
      closeSheet();
      res({ ok: true, toggle: v });
    };
  });
}

/* ------------------------------------------------------------------ toast --- */
var TOAST_T = 0;
function toast(msg, act, fn, ms) {
  var t = $('#toast');
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (act ? '<button id="toastAct">' + esc(act) + '</button>' : '');
  t.hidden = false;
  t.style.animation = 'none'; void t.offsetHeight; t.style.animation = '';
  if (act) $('#toastAct').onclick = function () { t.hidden = true; fn(); };
  clearTimeout(TOAST_T);
  TOAST_T = setTimeout(function () { t.hidden = true; }, ms || 3400);
}

function copyText(s) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return legacyCopy(s); });
  return Promise.resolve(legacyCopy(s));
}
function legacyCopy(s) {
  try {
    var ta = document.createElement('textarea');
    ta.value = s; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

/* ------------------------------------------------------------ file export --- */
/* On a phone the share sheet is the only good way to save a file (Save to
   Files on iOS). Desktop gets a normal download. */
function saveFile(name, text, type) {
  var blob = new Blob([text], { type: type });
  try {
    var file = new File([blob], name, { type: type });
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch(function () { });
      return;
    }
  } catch (e) { }
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function stamp() { return new Date().toISOString().slice(0, 10); }
function gradeLabel(g) { for (var i = 0; i < GRADES.length; i++) if (GRADES[i][0] === g) return GRADES[i][1]; return g || ''; }

function exportJSON() {
  var p = payload();
  var data = { app: 'octane', v: 1, exportedAt: Date.now(), vehicles: p.vehicles, fills: p.fills, deleted: p.deleted, prefs: p.prefs };
  saveFile('octane-backup-' + stamp() + '.json', JSON.stringify(data, null, 1), 'application/json');
}
function exportCSV() {
  var rows = [['Date', 'Car', 'Odometer', 'Miles since last', 'Gallons', 'Price per gallon', 'Total', 'Filled to full', 'Missed one before', 'Tank MPG', 'Cost per mile', 'Gas', 'Driving', 'Station', 'Car MPG readout', 'Notes']];
  S.vehicles.filter(function (v) { return !v.sample; }).forEach(function (v) {
    analyze(v.id, true).rows.forEach(function (r) {
      var f = r.f, d = new Date(f.ts);
      rows.push([d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()),
        v.name, f.odo, r.dist != null ? r1(r.dist) : '', f.gallons, f.ppg, f.total, f.full ? 'yes' : 'no', f.missed ? 'yes' : '',
        r.status === 'ok' ? r2(r.mpg) : '', r.status === 'ok' ? r3(r.cpm) : '', gradeLabel(f.grade), f.drive, f.station, f.dash || '', f.notes]);
    });
  });
  if (rows.length < 2) { toast('No fill-ups to export yet.'); return; }
  var csv = '﻿' + rows.map(function (r) {
    return r.map(function (c) { var s = String(c == null ? '' : c); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
  }).join('\r\n');
  saveFile('octane-fillups-' + stamp() + '.csv', csv, 'text/csv');
}
function importFile(file) {
  var rd = new FileReader();
  rd.onload = function () {
    var d = null;
    try { d = JSON.parse(rd.result); } catch (e) { }
    if (!d || !Array.isArray(d.fills) || !Array.isArray(d.vehicles)) { toast('That file is not an OCTANE backup.'); return; }
    confirmSheet({
      title: 'Import backup', ok: 'Import',
      text: 'Add <b>' + d.fills.length + ' fill-ups</b> and <b>' + d.vehicles.length + ' car' + (d.vehicles.length === 1 ? '' : 's') + '</b> from this file? Nothing you have now gets deleted.',
    }).then(function (r) {
      if (!r) return;
      applyPayload(mergeData(payload(), { vehicles: d.vehicles, fills: d.fills, deleted: d.deleted || {}, prefs: d.prefs || S.prefs }));
      if (!veh()) S.activeVid = S.vehicles[0] ? S.vehicles[0].id : null;
      commit();
      go('dash');
      toast('Backup imported.');
    });
  };
  rd.readAsText(file);
}

/* ------------------------------------------------------------ sample data --- */
function loadSample() {
  if (!S.vehicles.some(function (v) { return v.sample; })) {
    var smp = makeSample();
    S.vehicles.push(smp.vehicle);
    S.fills = S.fills.concat(smp.fills);
  }
  S.activeVid = 'sample-car';
  UI.ver++;
  persist();
  go('dash');
  toast('Sample data loaded. Clear it any time in Settings.');
}
function clearSample() {
  var ids = S.vehicles.filter(function (v) { return v.sample; }).map(function (v) { return v.id; });
  S.fills = S.fills.filter(function (f) { return !f.sample && ids.indexOf(f.vid) < 0; });
  S.vehicles = S.vehicles.filter(function (v) { return !v.sample; });
  if (!veh()) S.activeVid = S.vehicles[0] ? S.vehicles[0].id : null;
  UI.ver++;
  persist();
  go('dash');
  toast('Sample data cleared.');
}

/* ---------------------------------------------------------- install (PWA) --- */
var DEFER_INSTALL = null;
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); DEFER_INSTALL = e; });
function isStandalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

/* ---------------------------------------------------------------- actions --- */
Object.assign(ACT, {
  tab: function (v) { go(v); },
  go: function (v) { go(v, v === 'garage' || v === 'settings'); },
  back: function () { if (history.state && history.state.v && history.length > 1) history.back(); else go('dash'); },
  shclose: function () { closeSheet(); },
  tog: function (id, b) { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); if (UI.onTog) UI.onTog(id, b.classList.contains('on')); },
  add: function () { openFill(); },
  /* Quick scan from the dash: the camera has to open inside the tap itself or
     Safari blocks it, so click the input first and open the form after. */
  scan: function (hint) { UI.scanHint = hint || 'pump'; $('#camIn').click(); if (!FM) openFill(); },
  csv: exportCSV,
  json: exportJSON,
  imp: function () { $('#impIn').click(); },
  sample: loadSample,
  unsample: clearSample,
  install: function () { if (DEFER_INSTALL) { DEFER_INSTALL.prompt(); DEFER_INSTALL = null; } },
  wipe: function () {
    confirmSheet({
      title: 'Erase everything', ok: 'Erase', danger: true,
      text: 'This deletes every car and fill-up on this phone. ' + (S.cloud.on ? 'Your cloud backup stays, so your code can bring it all back.' : 'There is no cloud backup, so this cannot be undone.'),
    }).then(function (r) {
      if (!r) return;
      var code = S.cloud.code;
      S = fresh();
      S.cloud.code = code;
      UI.ver++;
      persist();
      go('dash');
      toast('Everything erased.');
    });
  },
  cloudon: function () {
    S.cloud = { on: true, code: newCode(), rev: 0, lastSync: 0, dirty: true, err: '' };
    persist();
    render();
    syncNow({ pull: true }).then(function () {
      toast(S.cloud.err ? 'Backup is on. It uploads when you have signal.' : 'Backed up. Save your code somewhere safe.');
      if (UI.view === 'settings' && !sheetOpen()) render();
    });
  },
  cloudoff: function () {
    confirmSheet({
      title: 'Turn off cloud backup', ok: 'Turn off', danger: true,
      text: 'This phone stops backing up.', toggle: ['Also delete the online copy', 'Your code stops working.', false],
    }).then(function (r) {
      if (!r) return;
      var code = S.cloud.code;
      if (r.toggle) api('/backup/' + code, { method: 'DELETE' }).catch(function () { });
      S.cloud.on = false; S.cloud.rev = 0; S.cloud.err = '';
      if (r.toggle) S.cloud.code = '';
      persist();
      render();
      toast('Cloud backup is off.');
    });
  },
  cloudnow: function () {
    syncNow({ pull: true }).then(function () {
      toast(S.cloud.err ? 'Could not reach the backup. Try again with signal.' : 'Backed up.');
      if (UI.view === 'settings' && !sheetOpen()) render();
    });
  },
  copycode: function () { copyText(fmtCode(S.cloud.code)).then(function (ok) { toast(ok ? 'Code copied.' : 'Could not copy. Write it down.'); }); },
  cloudrestore: function () { openRestore(); },
});

document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('[data-act]');
  if (!b) return;
  var a = b.getAttribute('data-act'), i = a.indexOf(':');
  var name = i < 0 ? a : a.slice(0, i), arg = i < 0 ? '' : a.slice(i + 1);
  if (ACT[name]) { e.preventDefault(); ACT[name](arg, b, e); }
});
document.addEventListener('keydown', function (e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('role') === 'button' && e.target.hasAttribute('data-act')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape') { if (RES) closeResult(); else if (sheetOpen()) closeSheet(); }
});

function onPhotoPicked(e) {
  var f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (!FM) openFill();
  handleScanFile(f, UI.scanHint || '');
}

/* ------------------------------------------------------------------- boot --- */
function boot() {
  load();
  var h = (location.hash || '').slice(1);
  UI.view = VIEWS[h] ? h : 'dash';
  try { history.replaceState({ v: UI.view }, '', '#' + UI.view); } catch (e) { }
  render();
  $('#camIn').addEventListener('change', onPhotoPicked);
  $('#picIn').addEventListener('change', onPhotoPicked);
  $('#impIn').addEventListener('change', function (e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) importFile(f); });
  $('#view').addEventListener('scroll', function () { tipHide(); }, { passive: true });

  reconcileIDB().then(function (changed) { if (changed) { if (sheetOpen() || RES) UI.pendingRender = true; else render(); } });
  requestPersist();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () { });
  setTimeout(function () { syncNow({ pull: true }); }, 900);

  /* On a phone nobody closes an app, they swipe away. Save on the way out. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { persist(); if (S.cloud.on && S.cloud.dirty) syncNow(); return; }
    if (S.cloud.on && Date.now() - S.cloud.lastSync > 60000) syncNow({ pull: true });
    if (!sheetOpen() && !RES) render();
  });
  window.addEventListener('pagehide', function () { persist(); });
  window.addEventListener('online', function () { if (S.cloud.on) syncNow(); });
  window.addEventListener('resize', debounce(function () { if (!sheetOpen() && S.vehicles.length && MOUNT[UI.view]) MOUNT[UI.view](true); }, 250));
}

window.__oct = {
  get S() { return S; }, set S(v) { S = v; }, UI: UI,
  analyze: analyze, summarize: summarize, fuelNow: fuelNow, nextFill: nextFill, habit: habit, milesPerDay: milesPerDay,
  monthly: monthly, groupMpg: groupMpg, records: records, dashCheck: dashCheck, rolling: rolling, tripCalc: tripCalc,
  mergeData: mergeData, canon: canon, payload: payload, applyPayload: applyPayload, normalize: normalize, normFill: normFill,
  makeSample: makeSample, render: render, go: go, commit: commit, persist: persist, load: load, idbGet: idbGet,
  openFill: openFill, saveFill: saveFill, showResult: showResult, closeResult: closeResult, handleScanFile: handleScanFile,
  applyScan: applyScan, openVehicle: openVehicle, loadSample: loadSample, clearSample: clearSample, syncNow: syncNow, fmtCode: fmtCode,
  cleanCode: cleanCode, ACT: ACT,
};

boot();
