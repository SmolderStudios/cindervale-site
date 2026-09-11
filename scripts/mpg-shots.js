/* OCTANE in real Chrome at iPhone size. Serves the site locally, drives the
 * app, screenshots every screen, runs one real scan through the live worker,
 * and proves the log survives Safari-style loss of localStorage.
 *
 *   node scripts/mpg-shots.js <outDir> [pumpPhoto.jpg]
 */
const path = require('path'), fs = require('fs'), http = require('http');
const KIT = 'C:/Users/Jordan/Desktop/Cindervale/tools/trailer-kit';
const puppeteer = require(path.join(KIT, 'node_modules/puppeteer-core'));
const CHROME = path.join(KIT, 'browsers/chrome/win64-151.0.7922.71/chrome-win64/chrome.exe');
const SITE = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(__dirname, '_mpgshots');
const PHOTO = process.argv[3];
const PORT = 5190;
fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT);

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const phone = async (h) => p.setViewport({ width: 390, height: h || 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const shot = async (name, h) => {
    await p.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
    if (h) { await phone(h); await wait(250); }
    await p.screenshot({ path: path.join(OUT, name + '.png') });
    if (h) await phone();
  };
  const tall = async () => p.evaluate(() => Math.ceil(document.querySelector('#view').scrollHeight + 120));

  await phone();
  await p.goto(`http://localhost:${PORT}/mpg/`, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.fonts && document.fonts.ready);
  await wait(400);
  ok(await p.$('#w_name'), 'first run shows the welcome screen');
  await shot('01-welcome', await tall());

  /* Sample data, every screen. */
  await p.evaluate(() => ACT.sample());
  await wait(600);
  await shot('02-dash', await tall());
  await p.evaluate(() => { const s = document.querySelector('#view'); s.scrollTop = 0; });

  await p.evaluate(() => { __oct.go('log'); ACT.row(__oct.analyze().list[__oct.analyze().list.length - 2].id); });
  await wait(300);
  await shot('03-log', 1500);

  await p.evaluate(() => __oct.go('stats'));
  await wait(500);
  await shot('04-stats', await tall());
  /* The viewport change redraws every chart (resize handler, 250ms debounce),
     so any element handle taken before it is stale. Wait, then look it up. */
  await wait(600);
  await p.evaluate(() => { document.querySelector('#stTrend').scrollIntoView({ block: 'center' }); });
  await wait(200);
  const trend = await p.$('#stTrend svg');
  const bx = trend && await trend.boundingBox();
  if (bx) {
    await p.mouse.move(bx.x + bx.width * 0.72, bx.y + bx.height * 0.5);
    await wait(250);
    const tip = await p.evaluate(() => { const t = document.querySelector('#tip'); return !t.hidden && t.textContent; });
    ok(!!tip, 'chart crosshair tooltip shows: ' + tip);
    await shot('05-stats-tooltip');
    await p.mouse.move(5, 5);
  } else ok(false, 'MPG chart is on the stats screen');

  await p.evaluate(() => __oct.go('trip'));
  await wait(200);
  await p.click('#t_dist', { clickCount: 3 });
  await p.type('#t_dist', '610');
  await p.evaluate(() => ACT.tppl('1'));
  await wait(300);
  ok(/\$\d/.test(await p.$eval('#t_out', e => e.textContent)), 'trip cost renders');
  await shot('06-trip', await tall());

  await p.evaluate(() => __oct.go('garage'));
  await wait(200);
  await shot('07-garage', await tall());
  await p.evaluate(() => __oct.go('settings'));
  await wait(200);
  await shot('08-settings', await tall());

  /* The fill-up form on the sample car, with a real scan if a photo was given. */
  await p.evaluate(() => { __oct.go('dash'); __oct.openFill(); });
  await wait(400);
  await shot('09-form');
  if (PHOTO) {
    const inp = await p.$('#camIn');
    await p.evaluate(() => { UI.scanHint = 'pump'; });
    const t0 = Date.now();
    await inp.uploadFile(PHOTO);
    await wait(700);
    await shot('10-scanning');
    await p.waitForSelector('#scanArea .scanres', { timeout: 60000 }).catch(() => null);
    const res = await p.evaluate(() => ({ msg: (document.querySelector('#scanArea .scanres') || {}).textContent, gal: document.querySelector('#f_gal').value, ppg: document.querySelector('#f_ppg').value, tot: document.querySelector('#f_tot').value }));
    ok(!!res.msg, 'live scan came back in ' + (Date.now() - t0) + 'ms: ' + JSON.stringify(res));
    await wait(1500);
    await shot('11-scanned');
  }
  /* Type a believable tank (the scanned test photo is only 6 gallons) and save,
     to see the result screen the way a normal fill-up shows it. */
  await p.evaluate(() => {
    const L = __oct.analyze().list, last = L[L.length - 1];
    const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input')); } };
    if (document.getElementById('f_odo')) set('f_odo', String(Math.round(last.odo + 352))); else set('f_trip', '352');
    set('f_tot', ''); set('f_gal', '10.412'); set('f_ppg', '3.459');
  });
  await wait(250);
  await shot('12-form-filled');
  await p.evaluate(() => { __oct.saveFill(); });
  await wait(250);
  await p.evaluate(() => { if (document.querySelector('.pv-warn')) __oct.saveFill(); });
  await wait(1900);
  ok(await p.$('.res'), 'result screen after saving');
  await shot('13-result');
  await p.evaluate(() => __oct.closeResult());

  /* Durability: the iPhone failure. Save, lose localStorage, reload. */
  await p.evaluate(() => { ACT.unsample(); });
  await p.evaluate(() => {
    const now = Date.now();
    const v = normVehicle({ id: 'dur-car', name: 'Durable', tank: 16, createdAt: now, updatedAt: now });
    S.vehicles.push(v); S.activeVid = v.id;
    S.fills.push(normFill({ id: 'dur-1', vid: v.id, ts: now - 864e5, odo: 1000, gallons: 12, ppg: 3.5, full: true, updatedAt: now }));
    S.fills.push(normFill({ id: 'dur-2', vid: v.id, ts: now, odo: 1360, gallons: 12, ppg: 3.5, full: true, updatedAt: now }));
    commit();
  });
  await wait(700);
  const both = await p.evaluate(async () => ({ ls: !!localStorage.getItem('octane_v1'), db: !!(await idbGet()) }));
  ok(both.ls && both.db, 'saved to localStorage and mirrored to IndexedDB');
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle0' });
  await wait(1200);
  const back = await p.evaluate(() => ({ n: S.fills.length, car: veh() && veh().name, mpg: summarize(analyze()).mpg, ls: !!localStorage.getItem('octane_v1') }));
  ok(back.n === 2, 'clearing sample data left no stray fill-ups behind (' + back.n + ' total)');
  ok(back.car === 'Durable' && Math.abs(back.mpg - 30) < 1e-9 && back.ls, 'log survives losing localStorage: ' + JSON.stringify(back));
  await shot('14-after-reload', await tall());

  ok(errs.length === 0, 'no page errors' + (errs.length ? ':\n    ' + errs.join('\n    ') : ''));
  await b.close();
  server.close();
  console.log(fails ? `\n${fails} FAILURES` : '\nall good');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
