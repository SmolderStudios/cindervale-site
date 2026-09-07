/* Render the _directions/ mockups to PNGs so they can be compared side by side.
 *
 *     node scripts/dir-preview.js
 *
 * One tall PNG per direction into _directions/_shots/. Direction B has a running
 * simulation in the hero, so it gets a few seconds to tick before the shot --
 * a screenshot at t=0 shows four empty bars, which is the opposite of the point.
 */
'use strict';
const fs = require('fs'), path = require('path');
const KIT = 'C:/Users/Jordan/Desktop/cindervale-trailer-kit';
const puppeteer = require(KIT + '/node_modules/puppeteer-core');
const CHROME = KIT + '/browsers/chrome/win64-151.0.7922.71/chrome-win64/chrome.exe';

const DIR = path.join(__dirname, '..', '_directions');
const OUT = path.join(DIR, '_shots');
const W = 1440;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2] || '';
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html'))
    .filter(f => !only || f.startsWith(only)).sort();
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--hide-scrollbars', '--allow-file-access-from-files', '--font-render-hinting=none'] });

  for (const f of files) {
    const p = await b.newPage();
    await p.setViewport({ width: W, height: 1000, deviceScaleFactor: 1 });
    await p.goto('file:///' + path.join(DIR, f).replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
    await p.evaluate(() => document.fonts.ready);
    /* Let the live panel in direction B actually run. */
    await sleep(4200);
    const H = await p.evaluate(() => document.body.scrollHeight);
    const dest = path.join(OUT, f.replace('.html', '.png'));
    await p.screenshot({ path: dest, clip: { x: 0, y: 0, width: W, height: Math.min(H, 4200) } });
    console.log('  ' + path.basename(dest).padEnd(20) + W + 'x' + Math.min(H, 2600));
    await p.close();
  }
  await b.close();
  console.log('\nout: ' + OUT);
})().catch(e => { console.error(e); process.exit(1); });
