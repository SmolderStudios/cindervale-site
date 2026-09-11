/* OCTANE cloud backup, end to end against the LIVE worker.
 *
 * Phone A (real Chrome) turns backup on and logs a tank. Phone B (a second
 * Chrome, separate profile) restores with A's code and must see it. Then both
 * edit at once and the merge has to keep both edits. Cleans up after itself.
 *
 *   node scripts/mpg-cloud-e2e.js
 */
const path = require('path'), fs = require('fs'), http = require('http');
const KIT = 'C:/Users/Jordan/Desktop/Cindervale/tools/trailer-kit';
const puppeteer = require(path.join(KIT, 'node_modules/puppeteer-core'));
const CHROME = path.join(KIT, 'browsers/chrome/win64-151.0.7922.71/chrome-win64/chrome.exe');
const API = 'https://octane-api.may23jordan.workers.dev';
const SITE = path.join(__dirname, '..'), PORT = 5191;
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT);

async function phone() {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: 390, height: 844 });
  await p.goto(`http://localhost:${PORT}/mpg/`, { waitUntil: 'networkidle0' });
  return { b, p, errs };
}

(async () => {
  /* ---- the protocol itself ---- */
  const code = Array.from({ length: 24 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]).join('');
  const put = (rev, data) => fetch(API + '/backup/' + code, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev: rev, data }) });
  let r = await put(0, { v: 1, fills: [], vehicles: [], deleted: {} });
  ok(r.status === 200 && (await r.json()).rev === 1, 'first write creates rev 1');
  r = await put(0, { v: 1, fills: [], vehicles: [], deleted: {} });
  ok(r.status === 409, 'a second "first write" is refused as a conflict');
  r = await put(1, { v: 1, fills: [{ id: 'x' }], vehicles: [], deleted: {} });
  ok(r.status === 200 && (await r.json()).rev === 2, 'write on the current rev moves to rev 2');
  r = await put(1, { v: 1, fills: [], vehicles: [], deleted: {} });
  const j409 = await r.json();
  ok(r.status === 409 && j409.rev === 2 && j409.data.fills[0].id === 'x', 'a stale write gets 409 plus the newer copy to merge');
  r = await fetch(API + '/backup/' + code, { method: 'DELETE' });
  ok(r.status === 200 && (await fetch(API + '/backup/' + code)).status === 404, 'delete removes it');

  /* ---- two real phones through the app ---- */
  const A = await phone();
  await A.p.evaluate(() => {
    const now = Date.now();
    S.vehicles.push(normVehicle({ id: 'e2e-car', name: 'E2E', tank: 14, createdAt: now, updatedAt: now }));
    S.activeVid = 'e2e-car';
    S.fills.push(normFill({ id: 'e2e-1', vid: 'e2e-car', ts: now - 3 * 864e5, odo: 5000, gallons: 11, ppg: 3.5, full: true, updatedAt: now }));
    S.fills.push(normFill({ id: 'e2e-2', vid: 'e2e-car', ts: now - 864e5, odo: 5330, gallons: 11, ppg: 3.5, full: true, updatedAt: now }));
    commit();
    ACT.cloudon();
  });
  await wait(5000);
  const a1 = await A.p.evaluate(() => ({ code: S.cloud.code, rev: S.cloud.rev, err: S.cloud.err, dirty: S.cloud.dirty }));
  ok(/^[A-Z2-7]{24}$/.test(a1.code) && a1.rev >= 1 && !a1.err && !a1.dirty, 'phone A backed up: ' + JSON.stringify(a1));

  const B = await phone();
  await B.p.evaluate(code => { ACT.cloudrestore(); document.getElementById('r_code').value = code.replace(/(.{4})(?=.)/g, '$1-').toLowerCase(); ACT.rgo(); }, a1.code);
  await wait(4000);
  const b1 = await B.p.evaluate(() => ({ n: S.fills.length, car: veh() && veh().name, mpg: summarize(analyze()).mpg, on: S.cloud.on }));
  ok(b1.n === 2 && b1.car === 'E2E' && Math.abs(b1.mpg - 30) < 1e-9 && b1.on, 'phone B restored with a lowercase, dashed code: ' + JSON.stringify(b1));

  /* Both phones log a different fill-up before either syncs. */
  await A.p.evaluate(() => { const now = Date.now(); S.fills.push(normFill({ id: 'e2e-A', vid: 'e2e-car', ts: now, odo: 5660, gallons: 11, ppg: 3.6, full: true, updatedAt: now })); commit(); });
  await B.p.evaluate(() => { const now = Date.now(); S.fills.push(normFill({ id: 'e2e-B', vid: 'e2e-car', ts: now + 1000, odo: 5990, gallons: 11, ppg: 3.7, full: true, updatedAt: now })); commit(); });
  await Promise.all([A.p.evaluate(() => syncNow({ pull: true })), B.p.evaluate(() => syncNow({ pull: true }))]);
  await A.p.evaluate(() => syncNow({ pull: true }));
  await B.p.evaluate(() => syncNow({ pull: true }));
  const ids = async P => P.evaluate(() => S.fills.map(f => f.id).sort().join());
  const ia = await ids(A.p), ib = await ids(B.p);
  ok(ia === 'e2e-1,e2e-2,e2e-A,e2e-B' && ia === ib, 'simultaneous edits on two phones both survive: A=' + ia + ' B=' + ib);

  /* A delete on one phone reaches the other. */
  await A.p.evaluate(() => { S.fills = S.fills.filter(f => f.id !== 'e2e-A'); S.deleted['e2e-A'] = Date.now(); commit(); return syncNow({ pull: true }); });
  await B.p.evaluate(() => syncNow({ pull: true }));
  ok(!(await ids(B.p)).includes('e2e-A'), 'a delete on phone A reaches phone B');

  const writes = await A.p.evaluate(async () => { const r0 = S.cloud.rev; await syncNow({ pull: true }); return S.cloud.rev - r0; });
  ok(writes === 0, 'a sync with nothing new writes nothing');

  ok(A.errs.length === 0 && B.errs.length === 0, 'no page errors ' + A.errs.concat(B.errs).join(' | '));
  await fetch(API + '/backup/' + a1.code, { method: 'DELETE' });
  await A.b.close(); await B.b.close();
  server.close();
  console.log(fails ? `\n${fails} FAILURES` : '\ncloud backup ok');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
