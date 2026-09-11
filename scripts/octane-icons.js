/* Renders the OCTANE app icons (home screen, manifest, favicon) with the
 * trailer kit's Chrome. The mark is the same SVG the app draws in its top bar.
 *
 *   node scripts/octane-icons.js [previewDir]
 */
const path = require('path');
const KIT = 'C:/Users/Jordan/Desktop/Cindervale/tools/trailer-kit';
const puppeteer = require(path.join(KIT, 'node_modules/puppeteer-core'));
const CHROME = path.join(KIT, 'browsers/chrome/win64-151.0.7922.71/chrome-win64/chrome.exe');
const OUT = path.join(__dirname, '..', 'mpg');
const PREVIEW = process.argv[2];

const mark = px => `<svg width="${px}" height="${px}" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4be1ff"/><stop offset="1" stop-color="#ff5ad9"/></linearGradient></defs>
  <path d="M16.4 48.6A22 22 0 1 1 47.6 48.6" fill="none" stroke="url(#g)" stroke-width="6" stroke-linecap="round"/>
  <path d="M32 33L43.4 20.4" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="33" r="4.5" fill="#fff"/>
  <path d="M32 44.5s4.2 4.5 4.2 7.3a4.2 4.2 0 0 1-8.4 0c0-2.8 4.2-7.3 4.2-7.3z" fill="#4be1ff"/></svg>`;

const page = (size, frac) => `<html><body style="margin:0;width:${size}px;height:${size}px;overflow:hidden;position:relative;display:grid;place-items:center;
  background:radial-gradient(circle at 50% 36%,#143a63 0%,#081629 44%,#03060b 82%)">
  <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(75,225,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(75,225,255,.08) 1px,transparent 1px);
    background-size:${size / 12}px ${size / 12}px;-webkit-mask-image:radial-gradient(circle at 50% 50%,#000 25%,transparent 72%)"></div>
  <div style="position:relative;transform:translateY(${size * 0.02}px);filter:drop-shadow(0 0 ${size * 0.025}px rgba(75,225,255,.8)) drop-shadow(0 0 ${size * 0.07}px rgba(75,225,255,.35))">${mark(Math.round(size * frac))}</div>
</body></html>`;

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  const jobs = [['icon-512.png', 512, 0.68], ['icon-192.png', 192, 0.68], ['icon-180.png', 180, 0.64], ['icon-maskable.png', 512, 0.52]];
  if (PREVIEW) jobs.push([path.join(PREVIEW, 'octane-icon-preview.png'), 1024, 0.68]);
  for (const [name, size, frac] of jobs) {
    await p.setViewport({ width: size, height: size });
    await p.setContent(page(size, frac), { waitUntil: 'load' });
    await p.screenshot({ path: path.isAbsolute(name) ? name : path.join(OUT, name) });
    console.log('wrote', name);
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
