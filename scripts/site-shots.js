/* Screenshots for cindervaleidle.com, taken from the real game on the current build.
 *
 *     node scripts/site-shots.js              every shot
 *     node scripts/site-shots.js thieving     just that one
 *
 * Writes straight into ../shots/, which is what index.html points at. The site's
 * slider shows these around 620px wide, so they are captured at deviceScaleFactor 2
 * and left at full size -- GitHub Pages serves them fine and they stay sharp on a
 * retina screen.
 *
 * Every shot is an ELEMENT capture, not a page capture. A full-page shot of an idle
 * game is mostly chrome: header, satchel, the ticker. Cropping to the panel is what
 * makes the difference between "here is a screenshot" and "here is the thing I am
 * telling you about".
 *
 * Borrows Chrome for Testing and the boot sequence from the trailer kit
 * (C:/Users/Jordan/Desktop/cindervale-trailer-kit), so that folder must stay put.
 * All http(s) is blocked during the run -- the game phones Discord for telemetry
 * and a screenshot session would otherwise show up as real players.
 */
'use strict';
const fs = require('fs'), path = require('path');
const KIT = 'C:/Users/Jordan/Desktop/cindervale-trailer-kit';
const puppeteer = require(KIT + '/node_modules/puppeteer-core');
const CHROME = KIT + '/browsers/chrome/win64-151.0.7922.71/chrome-win64/chrome.exe';
const GAME = 'file:///C:/code/embervale/cindervale.html';

const OUT = path.join(__dirname, '..', 'shots');
const only = (process.argv[2] || '').replace(/^--/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* name -> { sel, before, vw, maxH }.
 *   before  runs in the page right before the shot
 *   vw      viewport width for THIS shot, because the act grid is responsive:
 *           4 columns above 1240px, 3 below, 2 below 1000. At the full 1985 the
 *           grid comes out 4-wide and 5:1, which in a slider sized for landscape
 *           shrinks the numbers past reading. Narrower is taller is readable.
 *   maxH    cap the capture height. The Nightmarket panel is 1100+ CSS px tall
 *           end to end; the top of it is the part worth showing.
 */
const SHOTS = {
  thieving: {
    sel: '#centerPanel', vw: 1180, maxH: 560, run: ['thieving', 'th12'],
    before: () => { selectedSkill = 'thieving'; viewTab = 'acts'; renderAll(); },
  },
  guilds: {
    sel: '#centerPanel', vw: 1180, maxH: 500,
    before: () => { selectedSkill = 'thieving'; viewTab = 'guild'; _gdOpen = 'night'; renderAll(); },
  },
  /* Mining, not fishing. Fishing has eight acts, which lay out four across in two
     rows -- a 3:1 strip that letterboxes badly in a 16:10 stage. Mining's twelve fill
     three rows and land near the stage's own ratio. A narrower viewport does NOT
     help here: applyRootZoom scales the whole UI up to fit, so the panel keeps the
     full width and only gets bigger. */
  skilling: {
    sel: '#centerPanel', vw: 1180, maxH: 560, run: ['mining', 'mi8'],
    before: () => { selectedSkill = 'mining'; viewTab = 'acts'; renderAll(); },
  },
  trees: {
    sel: '#centerPanel', vw: 1180, maxH: 490,
    before: () => { selectedSkill = 'thieving'; viewTab = 'tree'; renderAll(); },
  },
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--hide-scrollbars', '--allow-file-access-from-files',
           '--font-render-hinting=none', '--force-color-profile=srgb'],
  });
  const p = await browser.newPage();
  await p.setViewport({ width: 1985, height: 1200, deviceScaleFactor: 2 });
  /* IS_DEMO sniffs /electron/i in the UA; without this the capture is the free demo,
     capped at level 10 with two zones. */
  await p.setUserAgent((await browser.userAgent()) + ' Electron/31.0.0');
  await p.setRequestInterception(true);
  p.on('request', r => (/^https?:/.test(r.url()) ? r.abort() : r.continue()));
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));

  await p.goto(GAME, { waitUntil: 'load' });
  await sleep(3200);

  /* Anything that dims or covers the panel. The Early Access modal fires twice --
     once on the menu, once after character creation. */
  const unmodal = () => p.evaluate(() => {
    ['mmEaModal', 'demoBuyModal', 'gameMenuModal', 'mmSettingsModal', 'mmCreditsModal']
      .forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('mm-hidden'); });
    if (typeof state !== 'undefined' && state) state.hintsOn = false;
    const hc = document.getElementById('hintCard'); if (hc) hc.remove();
    if (typeof ackAllDiscoveries === 'function') try { ackAllDiscoveries(); } catch (e) {}
    document.querySelectorAll('.toast').forEach(t => t.remove());
  });
  await unmodal();

  await p.evaluate(() => {
    _auditCount = 999; _signupSent = 99; window.startTutorial = function () {};
    mmDestinyMode = 'new'; mmDestinySlot = 1; mmDestinyName = 'Radcliff';
    mmSelType = 'normal'; mmSelClass = 'guardian'; mmConfirmDestiny();
  });
  await sleep(1600);
  await p.evaluate(() => { if (typeof endTutorial === 'function') try { endTutorial(); } catch (e) {} });
  await unmodal();

  /* A late-game account, so the panels are full rather than showing eight locked
     rows. devTrailerSetup is the dev button that already does most of this. */
  await p.evaluate(() => {
    document.getElementById('devTrailerSetup').click();
    state.onboard = { step: -1, done: true, hidden: false };
    state.hintsOn = false;
    state.satchelUpgrades = SATCHEL_MAX_EXPANSIONS;
    for (const k in SKILLS) state.xp[k] = XP_CUM[99];
    /* Thieving sells what it steals, so the Nightmarket counter needs stock or it
       renders the empty-satchel line in the shot meant to show it working. */
    Object.keys(ITEMS).filter(i => ITEMS[i].hot).forEach((i, n) => { state.items[i] = 3 + n; });
    state.gd = {}; state.gdTokens = 340;
    GUILDS.forEach(g => gdJoin(g.id));
    GUILDS.forEach(g => { state.gd[g.id].rep = 21000; });
    /* A level 99 account with every act at Mastery 0 and "Tree 0 / 98" reads as an
       account nobody has played -- which is the opposite of what a store shot is for.
       Give the acts some mastery and put points in the trees. */
    Object.keys(SKILLS).forEach(k => {
      SKILLS[k].acts.forEach((a, i) => {
        try { recordMastery(a.id, 900 + i * 260); } catch (e) {}
      });
    });
    if (typeof invalidateMasteryCache === 'function') invalidateMasteryCache();
    /* And spend the tree points. "98 to spend" with every node at 0/12 is a board
       nobody has touched. spendPoint enforces its own gates -- base nodes before
       grandmaster ones, level requirements -- so this just walks base nodes first
       and lets it refuse anything it should. */
    Object.keys(TREES).forEach(sk => {
      const order = TREES[sk].slice().sort((a, b) => (a.req || 0) - (b.req || 0));
      for (let pass = 0; pass < 3; pass++) {
        order.forEach(n => {
          for (let i = 0; i < (n.max || 1); i++) { try { spendPoint(sk, n.id); } catch (e) {} }
        });
      }
    });
  });
  await sleep(600);
  await unmodal();

  let vw = 0;
  for (const name of Object.keys(SHOTS)) {
    if (only && only !== name) continue;
    const s = SHOTS[name];
    if (s.vw && s.vw !== vw) {
      vw = s.vw;
      await p.setViewport({ width: vw, height: 1200, deviceScaleFactor: 2 });
      /* The game scales its whole root to the window (applyRootZoom); a resize with
         no relayout leaves the panel measuring at the old width. */
      await p.evaluate(() => { if (typeof applyRootZoom === 'function') applyRootZoom(); renderAll(); });
      await sleep(450);
    }
    await p.evaluate(s.before);
    /* An idle idle-game is a bad screenshot. Kick the named act off so the panel
       shows the running bar rather than "Nothing running". */
    if (s.run) await p.evaluate(r => { try { setAction(r[0], r[1]); } catch (e) {} }, s.run);
    await sleep(900);
    await unmodal();
    const el = await p.$(s.sel);
    if (!el) { console.log('  !! ' + name + ': ' + s.sel + ' not found'); continue; }
    const box = await el.boundingBox();
    if (!box) { console.log('  !! ' + name + ': not visible'); continue; }
    const dest = path.join(OUT, name + '.png');
    await p.screenshot({ path: dest, clip: {
      x: Math.round(box.x), y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(s.maxH ? Math.min(box.height, s.maxH) : box.height),
    } });
    const b = fs.readFileSync(dest);
    console.log('  ' + (name + '.png').padEnd(16) +
      b.readUInt32BE(16) + 'x' + b.readUInt32BE(20) + '  ' + (b.length / 1024 | 0) + ' KB');
  }

  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
