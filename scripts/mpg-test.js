/* OCTANE test suite. Boots the real app in jsdom, drives it the way a person
 * would, and checks the MPG engine against hand-worked answers. Nothing here
 * throws when it breaks in the app, which is why it needs asserting.
 *
 *   node scripts/mpg-test.js
 */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('C:/code/embervale/node_modules/jsdom');
const ROOT = path.join(__dirname, '..', 'mpg');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL  ' + m); } };
const near = (a, b, t = 1e-6) => a != null && b != null && Math.abs(a - b) <= t;
const tick = ms => new Promise(r => setTimeout(r, ms || 30));

function boot(storage) {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script src="(js\/[^"?]+)(?:\?[^"]*)?"><\/script>/g)].map(m => m[1]);
  html = html.replace(/<script src="js\/[^"]+"><\/script>\s*/g, '').replace(/<link rel="stylesheet"[^>]*>/g, '');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e && (e.detail || e.message) || e)));
  const dom = new JSDOM(html, { url: 'http://localhost/mpg/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.fetch = async () => ({ status: 503, ok: false, text: async () => '{}' });
  if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  for (const f of files) {
    const s = w.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, f), 'utf8');
    w.document.body.appendChild(s);
  }
  return { w, errors, files, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)] };
}
function type(w, el, v) { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); }

(async () => {
  /* ---- house rules on the shipped files ---- */
  const shipped = ['index.html', 'sw.js', 'manifest.webmanifest', ...fs.readdirSync(path.join(ROOT, 'js')).map(f => 'js/' + f)];
  for (const f of shipped) ok(!/[\u2014\u2013]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f + ' contains an em or en dash');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const tags = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="(js\/[^"]+)"/g)].map(m => './' + m[1]);
  ok(tags.every(t => sw.includes("'" + t + "'")), 'every script tag is in the service worker shell (with the same ?v)');

  /* ---- first run ---- */
  let B = boot(), { w, $, $$, errors } = B, O = w.__oct;
  ok(!!O, 'test handle exists');
  ok($('#w_name') && $('#w_tank'), 'first run shows the welcome screen');
  $('#w_name').value = '240SX';
  $('#w_tank').value = '15.9';
  w.ACT.wstart();
  ok(O.S.vehicles.length === 1 && O.S.vehicles[0].tank === 15.9 && O.S.vehicles[0].name === '240SX', 'start tracking creates the car');
  ok(O.UI.view === 'dash' && $('.scanbtn') && $('#tabs .fab'), 'empty dash with scan buttons and the + button');

  /* ---- the engine, against hand-worked answers ---- */
  const vid = O.S.activeVid, D = 864e5, t0 = Date.now() - 60 * D;
  const mk = (i, odo, gal, total, extra) => Object.assign({ id: 'f' + i, vid, ts: t0 + i * 5 * D, odo, gallons: gal, ppg: +(total / gal).toFixed(3), total, full: true, createdAt: 1, updatedAt: 1 }, extra || {});
  O.S.fills = [mk(1, 1000, 10, 35), mk(2, 1300, 10, 35), mk(3, 1500, 5, 17.5, { full: false }), mk(4, 1600, 5, 17.5), mk(5, 1900, 9, 31.5, { missed: true }), mk(6, 2200, 10, 35)].map(O.normFill);
  O.UI.ver++;
  let an = O.analyze();
  const st = an.rows.map(r => r.status).join(',');
  ok(st === 'start,ok,partial,ok,missed,ok', 'statuses: ' + st);
  ok(near(an.rows[1].mpg, 30), 'full to full: 300 mi / 10 gal = 30');
  ok(near(an.rows[3].mpg, 30) && an.rows[3].span === 2 && an.rows[2].closedBy === an.rows[3], 'a partial fill rolls into the next full tank');
  ok(an.rows[4].mpg === undefined, 'a tank after a missed fill-up gets no MPG');
  ok(near(an.rows[5].miles, 300) && near(an.rows[5].mpg, 30), 'the chain restarts from the full fill after a missed one');
  let sm = O.summarize(an);
  ok(near(sm.mpg, 30) && sm.tanks === 3 && near(sm.cpm, 105 / 900), 'average and cost per mile over measured tanks');
  ok(near(sm.driven, 1200) && near(sm.spent, 171.5), 'miles driven and money spent count every fill-up');

  O.S.vehicles[0].odoCorr = 3; O.UI.ver++;
  an = O.analyze();
  ok(near(an.rows[1].miles, 309) && near(an.rows[1].mpg, 30.9), 'odometer correction scales every tank');
  O.S.vehicles[0].odoCorr = 0; O.UI.ver++;

  /* average of averages would say 30 here; the truth is 500/15 */
  const saved = O.S.fills;
  O.S.fills = [mk(11, 5000, 8, 28), mk(12, 5100, 5, 17.5), mk(13, 5500, 10, 35)].map(O.normFill); O.UI.ver++;
  ok(near(O.summarize(O.analyze()).mpg, 500 / 15), 'average is total miles over total gallons, not an average of tanks');
  O.S.fills = [mk(21, 100, 9, 30), mk(22, 100, 9, 30)].map(O.normFill); O.UI.ver++;
  ok(O.analyze().rows[1].status === 'bad', 'a repeated odometer is flagged, not measured');
  O.S.fills = saved; O.UI.ver++;

  O.S.odoNow[vid] = { odo: 2350, ts: Date.now() };
  an = O.analyze();
  let fu = O.fuelNow(an);
  ok(fu && near(fu.level, 15.9 - 150 / 30) && fu.how === 'odo', 'fuel now from a typed odometer: ' + (fu && fu.level));
  ok(near(O.habit(an), 1 - 10 / 15.9), 'fill-up habit from full-to-full tanks');
  const nf = O.nextFill(an, fu);
  ok(nf.miles > 0 && nf.days > 0 && !nf.due, 'next fill-up predicted');
  O.S.fills.push(O.normFill(mk(7, 2300, 2, 7, { full: false, ts: Date.now() - D })));
  O.S.odoNow[vid] = { odo: 2330, ts: Date.now() };
  O.UI.ver++;
  fu = O.fuelNow(O.analyze());
  ok(near(fu.level, 15.9 - 100 / 30 + 2 - 30 / 30), 'a partial fill after the last full tank is played forward: ' + fu.level);
  O.S.fills = O.S.fills.filter(f => f.id !== 'f7'); delete O.S.odoNow[vid]; O.UI.ver++;

  const tr = O.tripCalc({ dist: 600, round: false, mpg: 30, price: 3.5, people: 2, tank: 15 });
  ok(near(tr.gal, 20) && near(tr.cost, 70) && near(tr.per, 35) && tr.stops.length === 1 && near(tr.stops[0], 382.5), 'trip cost, split, and one stop at 15% left');
  const tr2 = O.tripCalc({ dist: 300, round: true, mpg: 30, price: 3.5, people: 1, tank: 15, fuelGal: 2 });
  ok(tr2.miles === 600 && tr2.stops.length === 2 && near(tr2.stops[0], 0), 'round trip from near empty says fill up before leaving');

  /* ---- cloud merge ---- */
  const A = { vehicles: [{ id: 'v', updatedAt: 5 }], fills: [{ id: 'a', updatedAt: 10, x: 1 }, { id: 'b', updatedAt: 10 }], deleted: {}, prefs: { prefsAt: 1 } };
  const Bk = { vehicles: [{ id: 'v', updatedAt: 6 }], fills: [{ id: 'a', updatedAt: 20, x: 2 }, { id: 'c', updatedAt: 5 }], deleted: { b: 15 }, prefs: { prefsAt: 2 } };
  const ids = m => m.fills.map(f => f.id + (f.x || '')).sort().join();
  ok(ids(O.mergeData(A, Bk)) === 'a2,c' && ids(O.mergeData(Bk, A)) === 'a2,c', 'merge: newest edit wins, deletes win, same answer either way');
  ok(O.mergeData({ fills: [{ id: 'b', updatedAt: 30 }], vehicles: [], deleted: {} }, { fills: [], vehicles: [], deleted: { b: 15 } }).fills.length === 1, 'an edit newer than a delete survives');
  ok(O.canon(O.payload()) === O.canon(JSON.parse(JSON.stringify(O.payload()))), 'canon() is stable through JSON, so syncs that change nothing push nothing');

  /* ---- sample data and every screen ---- */
  const smp = O.makeSample();
  ok(smp.fills.length > 30, 'sample data has ' + smp.fills.length + ' fill-ups');
  w.ACT.sample();
  an = O.analyze();
  const sms = O.summarize(an);
  ok(an.v.sample && an.oks.length > 20, 'sample data loads and becomes the active car');
  ok(sms.mpg > 26 && sms.mpg < 38, 'sample MPG is believable: ' + (sms.mpg && sms.mpg.toFixed(2)));
  ok(an.rows.some(r => r.status === 'partial') && an.rows.some(r => r.status === 'missed'), 'sample data includes a partial fill and a missed one');
  ok(!O.payload().fills.some(f => f.sample) && !O.payload().vehicles.some(v => v.sample), 'sample data never goes to the cloud');
  for (const v of ['dash', 'log', 'stats', 'trip', 'garage', 'settings']) {
    const n = errors.length;
    O.go(v);
    ok(errors.length === n && $('.wrap.v-' + v), 'screen renders: ' + v + (errors.length > n ? ' ' + errors.slice(n).join(' | ') : ''));
  }
  O.go('dash');
  ok($('#dial svg') && $$('.kpi').length === 4 && $('#dashTrend svg') && $('.meter i.on'), 'dash: dial, 4 tiles, trend chart, fuel meter');
  O.go('stats');
  ok(['#stTrend svg', '#stPrice svg', '#stSpend svg', '#stMiles svg'].every(s => $(s)), 'stats: all four charts drew');
  ok($$('details.tbl table').length >= 3, 'stats: every chart has a Numbers table');
  w.ACT.range('3m');
  ok(O.S.prefs.range === '3m' && $('.seg button.on').textContent === '3M', 'range filter');
  O.go('log');
  ok($$('.frow').length === an.list.length, 'log lists every fill-up');
  w.ACT.row(an.list[3].id);
  ok($('.frow.open .fdet'), 'tapping a row opens its details');
  O.go('trip');
  type(w, $('#t_dist'), '420');
  ok(/\$\d/.test($('#t_out').textContent) && $('#t_out .route'), 'trip cost and route bar show');
  w.ACT.tround('1');
  ok(/840/.test($('#t_out').textContent), 'round trip doubles the miles');
  w.ACT.unsample();
  ok(!O.S.vehicles.some(v => v.sample) && O.S.activeVid === vid, 'clearing sample data goes back to the real car');

  /* ---- the fill-up form ---- */
  O.openFill();
  ok($('.sheet #f_gal') && $('.sheet .scanbtn'), 'fill-up form opens with scan buttons');
  type(w, $('#f_odo'), '2500');
  type(w, $('#f_gal'), '10');
  type(w, $('#f_ppg'), '3.5');
  ok($('#f_tot').value === '35.00' && $('#fw_tot').classList.contains('auto'), 'total works itself out from gallons and price');
  ok(/30\.0/.test($('#f_pv').textContent), 'live preview shows this tank: ' + $('#f_pv').textContent);
  type(w, $('#f_tot'), '40');
  ok($('#f_gal').value === '11.429', 'editing the total recomputes the older field (gallons): ' + $('#f_gal').value);
  type(w, $('#f_gal'), '10');
  ok($('#f_ppg').value === '4.000', 'then price follows gallons and total: ' + $('#f_ppg').value);
  type(w, $('#f_ppg'), '3.5');
  const n0 = O.S.fills.length;
  O.saveFill();
  ok(O.S.fills.length === n0 + 1, 'fill-up saved');
  ok($('.res') && /30\.0/.test($('.res').textContent), 'result screen shows the tank');
  O.closeResult();
  ok(!$('.res') && !$('.sheet'), 'result closes back to the app');

  O.openFill();
  type(w, $('#f_odo'), '2400'); type(w, $('#f_gal'), '5'); type(w, $('#f_ppg'), '3');
  O.saveFill();
  ok(O.S.fills.length === n0 + 1 && $('#f_pv').classList.contains('pv-err'), 'an odometer lower than the last fill-up is refused');
  type(w, $('#f_odo'), '2800'); type(w, $('#f_gal'), '19'); type(w, $('#f_ppg'), '3');
  O.saveFill();
  ok(O.S.fills.length === n0 + 1 && $('#f_pv').classList.contains('pv-warn'), 'more than the tank holds asks first');
  O.saveFill();
  ok(O.S.fills.length === n0 + 2, 'a second tap saves it anyway');
  O.closeResult();

  const target = O.S.fills.find(f => f.odo === 2500 && f.vid === vid);
  O.openFill(target.id);
  w.ACT.fdel();
  await tick();
  $('#c_ok').click();
  await tick();
  const after = O.S.fills.find(f => f.odo === 2800);
  ok(!O.S.fills.find(f => f.id === target.id) && O.S.deleted[target.id] && after.missed, 'delete leaves a tombstone and leaves the next tank out');
  $('#toastAct').click();
  ok(O.S.fills.find(f => f.id === target.id) && !O.S.fills.find(f => f.odo === 2800).missed, 'undo puts it back');
  ok(O.S.fills.find(f => f.id === target.id).updatedAt > O.S.deleted[target.id] || !O.S.deleted[target.id], 'undo beats its own tombstone in a sync');

  O.openFill();
  const got = O.applyScan({ gallons: 11.482, price: 3.459, total: 39.72, odometer: 3100, trip: null, grade: 'PREMIUM' }, 'pump');
  ok(got.join() === 'gallons,price,total,odometer' && $('#f_gal').value === '11.482' && $('#f_odo').value === '3100', 'a scan fills the form');
  ok($('#f_grade .chip.on').textContent === '91' && $('#fw_gal').classList.contains('scanned'), 'scan picks the grade and flashes the fields');
  w.ACT.shclose();
  ok(!$('.sheet'), 'closing the form');

  /* ---- saving and loading ---- */
  O.commit();
  const raw = w.localStorage.getItem('octane_v1');
  ok(raw && JSON.parse(raw).fills.length === O.S.fills.length, 'commit writes localStorage');
  const B2 = boot({ octane_v1: raw });
  ok(B2.w.__oct.S.fills.length === O.S.fills.length && B2.w.__oct.UI.view === 'dash' && B2.errors.length === 0, 'reload restores everything');
  const B3 = boot({ octane_v1: '{"vehicles":"nope","fills":[{"id":1}]}' });
  ok(B3.w.__oct.S.vehicles.length === 0 && B3.errors.length === 0 && B3.$('#w_name'), 'a garbage save starts fresh instead of crashing');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
