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

  /* Combat and sailing live in their OWN panels, not #centerPanel. updateModePanels()
     hides the skilling column when either mode is on, so entering the mode and then
     shooting the panel is the whole trick -- there is no route through viewTab. */
  combat: {
    sel: '#combatPanel', vw: 1180, maxH: 540,
    before: () => { state.cmbSubTab = 'mastery'; if (typeof enterCombat === 'function') enterCombat(); },
  },
  /* The arena, on the deepest zone with something worth fighting in it.
     Driven by CLICKING, not by setting state. Rounds went into poking state.zone and
     state.zoneMode directly and none of it survived to the shot: the panel re-renders
     on the game's own tick and rewrites both from whatever is selected, and the
     selected MONSTER is separate state again from the zone. Clicking goes through the
     same handlers the game already keeps consistent. */
  arena: {
    sel: '#combatPanel', vw: 1180, maxH: 540,
    before: () => { state.cmbSubTab = 'arena'; if (typeof enterCombat === 'function') enterCombat(); },
    clicks: ['[data-zmode="dungeons"]', '[data-zone="demon_sanctum"]', '.cmb-mon.boss'],
  },
  /* NO RAIDS SHOT. The Raids tab would not switch under automation: its handler
     bails on `if(state.zoneMode===m) return` and `if(combat.active) return`, and
     clearing both still left the panel on the arena. Four rounds went into it. The
     arena shot below carries the combat claim and the mastery shot carries the depth
     one, so raids is described in copy without a screenshot rather than shipping a
     picture of the arena captioned "raids". */
  slayer: {
    sel: '#combatPanel', vw: 1180, maxH: 540,
    before: () => {
      state.cmbSubTab = 'slayer';
      if (typeof enterCombat === 'function') enterCombat();
      renderCombat();
    },
  },
  sailing: {
    sel: '#sailPanel', vw: 1180, maxH: 540,
    before: () => {
      sailTab = 'voyage';
      if (typeof enterSailing === 'function') enterSailing();
      renderSail();
    },
  },
  shipyard: {
    sel: '#sailPanel', vw: 1180, maxH: 540,
    before: () => {
      sailTab = 'yard';
      if (typeof enterSailing === 'function') enterSailing();
      renderSail();
    },
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
    /* Combat and sailing panels render a locked/empty state unless the account has
       actually been there. devTrailerSetup covers most of it; these are the bits it
       does not. */
    state.combatXp = state.combatXp || {};
    ['attack','strength','defence','hitpoints','magic','ranged'].forEach(k => {
      state.combatXp[k] = XP_CUM[99];
    });
    state.monKills = state.monKills || {};
    if (typeof MONSTERS !== 'undefined') MONSTERS.forEach(m => { state.monKills[m.id] = 25; });
    if (typeof refreshCombatStats === 'function') refreshCombatStats();
    /* state.zone is a zone ID STRING, not an index -- renderCombat validates it
       against the CURRENT MODE's zone list and silently resets anything it does not
       recognise back to 'rat_warrens'. Two ways to trip that, and this shot hit both:
       a number instead of an id, and then ZONES[last] -- which is ashen_steppe, a
       HUNT zone, and so not in zonesForMode('dungeons') either. demon_sanctum is the
       last actual dungeon. */
    state.zone = 'demon_sanctum';
    state.zoneMode = 'dungeons';
    /* And stock the food shelf, or the panel says "No food or potions yet". */
    ['cooked_shark','cooked_swordfish','cooked_tuna'].forEach(i => {
      if (ITEMS[i]) state.items[i] = 120;
    });
    /* devTrailerSetup covers skilling and combat but not these two, so both panels
       were shooting as brand new accounts: "No active bounty / Slayer Level 1 / 0
       bounties done", and a Lashed Raft with 0 sailing xp on a chart of 26 islands. */
    state.slayer = Object.assign(state.slayer || {}, {
      xp: 210000, points: 940, tasksDone: 168, streak: 11, masterSel: 'general',
    });
    state.sail = state.sail || {};
    state.sail.xp = 3200000;
    /* Best hull, and every island charted, so the map is filled in rather than four
       lonely dots in one corner. */
    if (typeof SAIL_HULLS !== 'undefined') {
      const hulls = Array.isArray(SAIL_HULLS) ? SAIL_HULLS : Object.values(SAIL_HULLS);
      const best = hulls[hulls.length - 1];
      if (best && best.id) state.sail.hull = best.id;
    }
    if (typeof SAIL_ISLES !== 'undefined') {
      state.sail.found = state.sail.found || {};
      state.sail.seen = state.sail.seen || {};
      const isles = Array.isArray(SAIL_ISLES) ? SAIL_ISLES : Object.values(SAIL_ISLES);
      isles.forEach(i => { const k = i && (i.id || i); state.sail.found[k] = 1; state.sail.seen[k] = 1; });
    }
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
    /* Every shot starts from the skilling column. Without this, the first combat
       shot leaves combatMode true and updateModePanels() keeps #centerPanel hidden,
       so every later skilling shot silently captures nothing. */
    await p.evaluate(() => {
      if (typeof combatMode !== 'undefined') combatMode = false;
      if (typeof sailMode !== 'undefined') sailMode = false;
      if (typeof state !== 'undefined' && state) state.zoneMode = 'dungeons';
      /* The zone-mode buttons bail out early on `if(combat.active) return` -- the
         game will not swap the roster mid-fight. Selecting a monster in an earlier
         shot is enough to leave that flag set, and the Raids click then does nothing
         at all, silently, which is exactly how this looked like a state bug for
         three rounds. */
      if (typeof combat !== 'undefined' && combat) combat.active = false;
      if (typeof updateModePanels === 'function') updateModePanels();
    });
    await p.evaluate(s.before);
    /* An idle idle-game is a bad screenshot. Kick the named act off so the panel
       shows the running bar rather than "Nothing running". */
    if (s.run) await p.evaluate(r => { try { setAction(r[0], r[1]); } catch (e) {} }, s.run);
    await sleep(700);
    /* Clicks go through the game's own handlers, which keep zone / mode / monster
       consistent with each other -- which is exactly what setting them by hand did
       not do. Each one gets a moment to re-render before the next. */
    for (const q of (s.clicks || [])) {
      const hit = await p.evaluate(sel => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.click();
        return true;
      }, q);
      if (!hit) console.log('  .. ' + name + ': no element for ' + q);
      await sleep(420);
    }
    await sleep(260);
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
