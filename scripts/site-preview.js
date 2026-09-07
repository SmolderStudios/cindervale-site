/* Render cindervaleidle.com to PNGs so a change can be looked at before it is pushed.
 *
 *     node scripts/site-preview.js            desktop, whole page in strips
 *     node scripts/site-preview.js mobile     375px wide
 *
 * Writes to scripts/_preview/ (gitignored -- it is a look, not an asset). The page
 * reveals sections on scroll via IntersectionObserver, so this scrolls the whole
 * document first and then forces .reveal.in on everything; a plain fullPage
 * screenshot catches half the page still at opacity 0.
 */
'use strict';
const fs = require('fs'), path = require('path');
const KIT = 'C:/Users/Jordan/Desktop/cindervale-trailer-kit';
const puppeteer = require(KIT + '/node_modules/puppeteer-core');
const CHROME = KIT + '/browsers/chrome/win64-151.0.7922.71/chrome-win64/chrome.exe';

const SITE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, '_preview');
const mobile = (process.argv[2] || '').indexOf('mob') === 0;
const W = mobile ? 375 : 1440;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--hide-scrollbars', '--allow-file-access-from-files', '--font-render-hinting=none'] });
  const p = await b.newPage();
  await p.setViewport({ width: W, height: 1000, deviceScaleFactor: 1 });
  await p.goto(SITE, { waitUntil: 'networkidle0' });
  await sleep(900);

  /* Walk the page so every observer fires, then belt-and-braces the class on. */
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    document.querySelectorAll('.reveal').forEach(e => e.classList.add('in'));
    /* The slider auto-advances on a CSS animation; freeze it on slide 1. */
    document.querySelectorAll('.fs-fill').forEach(e => e.classList.remove('run'));
  });
  await sleep(700);

  const H = await p.evaluate(() => document.body.scrollHeight);
  const STRIP = 1600;
  for (let i = 0, y = 0; y < H; i++, y += STRIP) {
    const h = Math.min(STRIP, H - y);
    await p.screenshot({ path: path.join(OUT, 'p' + String(i + 1).padStart(2, '0') + '.png'),
      clip: { x: 0, y, width: W, height: h } });
  }
  console.log('page is ' + H + 'px tall; ' + fs.readdirSync(OUT).length + ' strips in ' + OUT);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
