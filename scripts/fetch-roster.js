/* Rebuild the Categories roster and its trait vocabulary.
 *
 *   node scripts/fetch-roster.js              # full run (~2 min, cached)
 *   node scripts/fetch-roster.js --fresh      # ignore the cache and refetch
 *
 * Rewrites the SHOWS / TRAITS / CHARS arrays in categories.html in place.
 * Nothing else in that file is touched.
 *
 * The roster is an explicit whitelist (SERIES below) rather than a popularity
 * scrape: a small cast everyone recognises beats a huge one full of characters
 * nobody can place, because a category is only fun if both players know the
 * faces. Add or remove a series by editing SERIES — `ids` are AniList media
 * ids, and every season/movie listed under one label merges into that label so
 * seasons don't fragment a cast.
 *
 * WHY ANILIST — Jikan/MyAnimeList cold-misses as HTTP 504 on most character
 * URLs, which made a full pull take over an hour with rows silently dropped.
 *
 * TRAITS come from AniList's structured gender/age/role fields plus keyword
 * mining of each character's own description. Rules that could not be made
 * precise were cut rather than shipped noisy — see NARROW.
 */
const fs = require('fs');
const path = require('path');

const FRESH = process.argv.includes('--fresh');
const TARGET = path.join(__dirname, '..', 'categories.html');
const CACHE = path.join(__dirname, '.roster-cache');
const FLOOR = 250;       // favourites a character needs to make the cut
const MIN_TAG = 5;       // drop traits too rare to be worth a filter chip
const GAP = 2100;        // AniList allows ~30 requests/min

// Every entry here is a series Jordan picked. `ids` merge into one label.
// Caps are deliberately tighter than the floor allows. Going 45 deep into
// Naruto drags in faces nobody outside the fandom can place, and a character
// nobody recognises is dead weight in a guessing game.
const SERIES = [
  { label: 'Naruto',              ids: [1735, 20],                     cap: 34 },
  { label: 'One Piece',           ids: [21],                           cap: 34 },
  { label: 'Bleach',              ids: [269, 116674],                  cap: 30 },
  { label: 'Attack on Titan',     ids: [16498, 20958, 99147, 110277],  cap: 26 },
  { label: 'One Punch Man',       ids: [21087, 97668, 153800],         cap: 14 },
  { label: 'Fullmetal Alchemist', ids: [5114],                         cap: 20 },
  { label: 'Seven Deadly Sins',   ids: [20789, 99539, 108928, 21385],  cap: 16 },
  { label: 'Sword Art Online',    ids: [11757, 20594, 100182, 108759], cap: 15 },
  { label: 'Code Geass',          ids: [1575, 2904],                   cap: 12 },
  { label: 'Solo Leveling',       ids: [151807, 176496],               cap: 12 },
  { label: 'Death Note',          ids: [1535],                         cap: 11 },
  // Pokémon earns its place through the starters — they're the only entries
  // that anchor "is it an animal" style categories. The rest (Meowth, Snorlax,
  // Jigglypuff…) fit nothing and were cut. Charmander and Mewtwo have no
  // AniList entry in the anime, so Charizard stands in for the fire starter.
  { label: 'Pokémon', ids: [527], cap: 99, only: [
      'Pikachu', 'Fushigidane', 'Zenigame', 'Lizardon', 'Satoshi',
  ] },
];

// AniList romanises these in a way English-speaking fans never use.
const NAME_OVERRIDE = {
  // One Piece — family name is spoken first
  'Luffy Monkey':'Monkey D. Luffy', 'Zoro Roronoa':'Roronoa Zoro',
  'Ace Portgas':'Portgas D. Ace', 'Law Trafalgar':'Trafalgar Law',
  'Robin Nico':'Nico Robin', 'Chopper Tony Tony':'Tony Tony Chopper',
  'Hancock Boa':'Boa Hancock', 'Mihawk Dracule':'Dracule Mihawk',
  'Vivi Nefertari':'Nefertari Vivi', 'Sanji Vinsmoke':'Sanji',
  'Teach Marshall':'Marshall D. Teach', 'Roger Gol':'Gol D. Roger',
  'Garp Monkey':'Monkey D. Garp', 'Dragon Monkey':'Monkey D. Dragon',
  // Solo Leveling — Korean names, fandom uses the family-first romanisation
  'Jin-U Seong':'Sung Jinwoo', 'Hae-In Cha':'Cha Hae-In', 'Ju-Hui Lee':'Lee Joohee',
  'Jin-A Seong':'Sung Jinah', 'Geon-Hui Go':'Go Gunhee', 'Jin-Ho Yu':'Yoo Jinho',
  'Yun-Ho Baek':'Baek Yoonho', 'Jin-Cheol U':'Woo Jinchul', 'Jong-In Choi':'Choi Jongin',
  'Hee-Jin Park':'Park Heejin', 'Chi-Yul Song':'Song Chiyul', 'Tae-Shik Kang':'Kang Taeshik',
  'Byeong-Gu Min':'Min Byunggu', 'Bo-Ra Lee':'Lee Bora', 'Song-I Han':'Han Song-Yi',
  // Pokémon — Japanese cast names
  'Satoshi':'Ash Ketchum', 'Kasumi':'Misty', 'Takeshi':'Brock',
  'Musashi':'Jessie', 'Kojirou':'James', 'Nyarth':'Meowth',
  'Fushigidane':'Bulbasaur', 'Zenigame':'Squirtle', 'Lizardon':'Charizard',
  'Kabigon':'Snorlax', 'Purin':'Jigglypuff', 'Koduck':'Psyduck',
  'Togepy':'Togepi', 'Laplace':'Lapras', 'Metamon':'Ditto',
  'Sakaki':'Giovanni', 'Shigeru Ookido':'Gary Oak', 'Yukinari Ookido':'Professor Oak',
};

// narrators, unnamed extras and anything without a portrait
const SKIP = /^(narrator|announcer|unknown|others?)$/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cached = (name, fn) => {
  const f = path.join(CACHE, name);
  if (!FRESH && fs.existsSync(f)) {
    console.log(`· ${name} (cached)`);
    return Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  return Promise.resolve(fn()).then(v => {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(v));
    return v;
  });
};

async function gql(query, variables, tries = 5) {
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      if (r.status === 429) {
        const w = Number(r.headers.get('retry-after') || 60) + 2;
        console.log(`  rate limited — waiting ${w}s`);
        await sleep(w * 1000); continue;
      }
      const j = await r.json();
      if (j.errors) { console.log('  ' + JSON.stringify(j.errors).slice(0, 140)); await sleep(3000); continue; }
      return j.data;
    } catch (e) { await sleep(3000); }
  }
  return null;
}

const Q_CAST = `query($id:Int,$p:Int){ Media(id:$id){
  characters(sort:FAVOURITES_DESC, page:$p, perPage:25){
    edges{ role node{ id favourites gender age name{ full first last } image{ large } } }
  } } }`;

async function fetchCasts() {
  const out = [];
  for (const s of SERIES) {
    const seen = new Set();
    const cast = [];
    for (const id of s.ids) {
      for (let p = 1; p <= 2; p++) {
        const d = await gql(Q_CAST, { id, p });
        await sleep(GAP);
        const edges = d && d.Media && d.Media.characters.edges;
        if (!edges || !edges.length) break;
        for (const e of edges) {
          if (seen.has(e.node.id)) continue;
          seen.add(e.node.id);
          cast.push({ role: e.role, ...e.node });
        }
        if (edges.length < 25) break;
      }
    }
    out.push({ label: s.label, cap: s.cap, only: s.only || null, cast });
    console.log(`  ${s.label}: ${cast.length} cast entries`);
  }
  return out;
}

const imgFile = u => {
  const m = /\/character\/(?:medium|large)\/(.+)$/.exec(u || '');
  return m && !/^default/i.test(m[1]) ? m[1] : null;
};
function fixName(n) {
  let full = (n.full || '').trim();
  if (n.last && /\bD\.$/.test(n.last.trim()) && n.first) full = n.last.trim() + ' ' + n.first.trim();
  return NAME_OVERRIDE[full] || full;
}

function pickRoster(groups) {
  const picked = [], used = new Set();
  for (const g of groups) {
    // cap/only come from the live SERIES config, never the cache — otherwise
    // editing the whitelist does nothing until someone remembers --fresh
    const cfg = SERIES.find(s => s.label === g.label) || g;
    let n = 0;
    const cast = g.cast.slice().sort((a, b) => b.favourites - a.favourites);
    for (const c of cast) {
      if (n >= cfg.cap) break;
      const raw = (c.name.full || '').trim();
      if (cfg.only && !cfg.only.includes(raw)) continue;   // hand-picked series
      if (!cfg.only && c.favourites < FLOOR) continue;
      if (SKIP.test(raw) || used.has(c.id)) continue;
      const img = imgFile(c.image && c.image.large);
      const name = fixName(c.name);
      if (!img || !name || SKIP.test(name)) continue;
      used.add(c.id); n++;
      picked.push({ id: c.id, name, show: g.label, img,
                    gender: c.gender, age: c.age, role: c.role });
    }
    console.log(`  ${g.label}: kept ${n}`);
  }
  return picked;
}

/* ---------------------------------------------------------------- traits */
const RULES = {
  FIRE:      /\b(pyrokinesis|pyrokinetic|flame[sd]?|flaming|fireball|fire (magic|style|breathing|release)|incinerat\w*|inferno)\b/,
  ICE:       /\b(cryokinesis|cryokinetic|ice (magic|style|release|powers?|user)|icy|frost\w*|freez\w*|glacial|blizzard)\b/,
  LIGHTNING: /\b(lightning|thunder\w*|electrokinesis|electricity)\b/,
  WIND:      /\b(wind (magic|style|release|user)|aerokinesis|tornado)\b/,
  WATER:     /\b(water (magic|style|release|user|manipulation)|hydrokinesis)\b/,
  MAGIC:     /\b(mage|wizard|witch|sorcer\w*|magician|spellcast\w*|grimoire|alchemist|alchemy)\b/,
  PSYCHIC:   /\b(psychic|telepath\w*|telekine\w*|esper|clairvoyan\w*)\b/,
  SWORD:     /\b(sword\w*|katana|blade\w*|rapier|nodachi|zanpakutou|zanpakuto|nichirin)\b/,
  GUNS:      /\b(gun|guns|gunman|pistol|revolver|rifle|sniper|firearm|shotgun|marksman)\b/,
  BOW:       /\b(archer|archery|bow and arrow|quiver|longbow)\b/,
  'MARTIAL ARTS': /\b(martial art\w*|hand[- ]to[- ]hand|karate|judo|taekwondo|boxer|boxing|kung fu)\b/,
  ROBOT:     /\b(android|robot\w*|automaton|artificial (intelligence|human|being))\b/,
  CYBORG:    /\b(cyborg|cybernetic\w*|prosthetic\w*|bionic|automail)\b/,
  VAMPIRE:   /\b(vampire\w*|vampiric|dhampir)\b/,
  DEMON:     /\b(demon\w*|hollow\b|arrancar|espada)\b/,
  DRAGON:    /\b(dragon\w*|wyvern)\b/,
  ELF:       /\b(elf|elves|elven|half[- ]elf)\b/,
  GLASSES:   /\b(glasses|spectacles|monocle)\b/,
  MASK:      /\b(mask\w*|masked)\b/,
  DOCTOR:    /\b(doctor|physician|surgeon|medic\b|nurse)\b/,
  CHEF:      /\b(chef|cook\b|culinary)\b/,
  SCIENTIST: /\b(scientist|researcher|inventor|chemist)\b/,
  DETECTIVE: /\b(detective|investigator|sleuth)\b/,
  ASSASSIN:  /\b(assassin\w*|hitman)\b/,
  NINJA:     /\b(ninja|shinobi|kunoichi|jounin|chuunin|genin|hokage|akatsuki)\b/,
  PIRATE:    /\b(pirate\w*|buccaneer)\b/,
  ROYALTY:   /\b(prince\b|princess|king\b|queen\b|emperor|empress)\b/,
  CAPTAIN:   /\b(captain\b|commander\b|admiral\b)\b/,
};

// Job and species words are only trustworthy near the top of an entry — the
// infobox and the "X is a ..." opener. Deeper in the biography the same words
// describe other people or are plain adjectives ("noble" meaning honourable),
// which is what made GOD / SOLDIER / VILLAIN unusable at any width.
const NARROW = new Set(['DOCTOR', 'CHEF', 'SCIENTIST', 'DETECTIVE', 'ASSASSIN', 'ROBOT',
  'CYBORG', 'VAMPIRE', 'ELF', 'DEMON', 'DRAGON', 'ROYALTY', 'CAPTAIN', 'NINJA', 'PIRATE']);

const Q_DESC = `query($ids:[Int]){ Page(page:1, perPage:50){ characters(id_in:$ids){ id description(asHtml:false) } } }`;

async function fetchDescriptions(picked) {
  const out = {};
  const ids = picked.map(p => p.id);
  for (let i = 0; i < ids.length; i += 50) {
    const d = await gql(Q_DESC, { ids: ids.slice(i, i + 50) });
    await sleep(GAP);
    if (!d) continue;
    for (const c of d.Page.characters) if (c.description) out[c.id] = c.description;
    console.log(`  descriptions ${Math.min(i + 50, ids.length)}/${ids.length}`);
  }
  return out;
}

/* ---------------------------------------------------------------- facts
 * TRAITS above are mined from prose and are approximate — fine for filtering
 * the grid, useless as a category, because a missing trait means "the wiki
 * didn't say" rather than "no". A category answered from partial data lies:
 * Fanatio has no gender on AniList, so "is female" told players she wasn't.
 *
 * FACTS are the opposite: complete by construction or curated by hand, so a
 * "no" is genuinely a no. Only FACTS may back a category.
 *
 * Curated membership is listed by character name and validated against the
 * finished roster — a typo or a character who dropped out of the roster fails
 * the build rather than silently emptying a category.
 */

// Genuinely genderless or canonically unstated. Being on this list is a
// decision, not a data gap: "is female" answers no for them on purpose.
const GENDERLESS = [
  'Hange Zoe',            // Isayama has deliberately never confirmed it
  'Pikachu', 'Bulbasaur', 'Squirtle', 'Charizard',
];

const CURATED = {
  'STRAW HAT': ['Monkey D. Luffy', 'Roronoa Zoro', 'Sanji', 'Nico Robin', 'Nami',
    'Tony Tony Chopper', 'Usopp', 'Brook', 'Franky', 'Jinbe'],
  'AKATSUKI': ['Itachi Uchiha', 'Pain', 'Konan', 'Deidara', 'Sasori', 'Tobi'],
  'HOKAGE': ['Hashirama Senju', 'Tobirama Senju', 'Minato Namikaze', 'Tsunade Senju',
    'Kakashi Hatake', 'Naruto Uzumaki'],
  'GOTEI CAPTAIN': ['Genryuusai Yamamoto', 'Soi Fon', 'Retsu Unohana', 'Byakuya Kuchiki',
    'Kenpachi Zaraki', 'Mayuri Kurotsuchi', 'Toushirou Hitsugaya',
    'Jirou Souzousa Shunsui Kyouraku', 'Shinji Hirako', 'Sousuke Aizen',
    'Gin Ichimaru', 'Kisuke Urahara'],
  'SURVEY CORPS': ['Levi', 'Eren Yeager', 'Mikasa Ackerman', 'Armin Arlert', 'Hange Zoe',
    'Erwin Smith', 'Sasha Blouse', 'Jean Kirstein', 'Connie Springer',
    'Krista Lenz', 'Ymir', 'Petra Ral', 'Floch Forster'],
  'THE SEVEN SINS': ['Meliodas', 'Ban', 'King @ Seven Deadly Sins', 'Diane',
    'Gowther', 'Merlin', 'Escanor'],
  'ROYALTY': ['Lelouch Lamperouge', 'Nunnally Lamperouge', 'Euphemia li Britannia',
    'Cornelia li Britannia', 'Boa Hancock', 'Nefertari Vivi', 'Elizabeth Liones',
    'Arthur Pendragon', 'Zeldris'],
  // Not a human being. Soul Reapers count as human souls; Hollows and Arrancar
  // do not. Cyborgs with a human origin (Franky, Genos) stay human.
  'NOT HUMAN': ['Kurama', 'Akamaru', 'Tony Tony Chopper', 'Brook',
    'Zangetsu', 'Kon', 'Ulquiorra Cifer', 'Grimmjow Jaegerjaquez',
    'Nelliel Tu Oderschvank', 'Coyote Starrk', 'Nemu Kurotsuchi',
    'Boros-sama', 'Greed', 'Envy', 'Lust', 'King Bradley',
    'Hawk', 'Diane', 'King @ Seven Deadly Sins', 'Elaine', 'Gowther', 'Zeldris', 'Derieri',
    'Estarossa', 'Meliodas', 'Yui', 'Igris', 'Beru', 'Esil Radiru',
    'Ryuk', 'Rem', 'Pikachu', 'Bulbasaur', 'Squirtle', 'Charizard'],
  // Clear-cut antagonists only. Anyone the fandom argues about — Light, Greed,
  // Scar, Lelouch — is left off rather than guessed at.
  'VILLAIN': ['Madara Uchiha', 'Pain', 'Orochimaru', 'Tobi', 'Deidara', 'Sasori',
    'Zabuza Momochi', 'Doflamingo Donquixote', 'Crocodile',
    'Sousuke Aizen', 'Gin Ichimaru', 'Ulquiorra Cifer', 'Grimmjow Jaegerjaquez',
    'Reiner Braun', 'Bertolt Hoover', 'Annie Leonhart', 'Zeke', 'Kenny Ackerman',
    'Yelena', 'Garou', 'Boros-sama', 'Envy', 'Lust', 'King Bradley',
    'Solf Kimblee', 'Zeldris', 'Derieri', 'Estarossa', 'Quinella',
    'Akihiko Kayaba', 'Teru Mikami'],
};

const prep = d => (d || '')
  .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')   // links — the label names another character
  .replace(/~!|!~/g, ' ')                 // spoiler markers, keep the content
  .replace(/__|\*\*|\*/g, ' ')
  .replace(/\bdevil fruit\b/gi, ' df ')   // One Piece: must not read as "devil"
  .replace(/\s+/g, ' ').toLowerCase();

function ageTag(a) {
  const m = /(\d+)/.exec(String(a || ''));
  if (!m) return null;
  const n = +m[1];
  return n > 200 ? 'ANCIENT' : n < 13 ? 'CHILD' : n < 20 ? 'TEEN' : n < 60 ? 'ADULT' : 'ELDER';
}

/* AniList leaves gender null for ~3% of the roster, which is what made
   "is female" answer wrong for Fanatio. Fall back to the pronouns her own
   entry uses; if they point one way and only one way, that settles it. */
function resolveGender(p, raw) {
  if (p.gender === 'Male') return 'MALE';
  if (p.gender === 'Female') return 'FEMALE';
  if (GENDERLESS.includes(p.name)) return null;
  const he = (raw.match(/\b(he|his|him)\b/gi) || []).length;
  const she = (raw.match(/\b(she|her|hers)\b/gi) || []).length;
  if (he > 0 && she === 0) return 'MALE';
  if (she > 0 && he === 0) return 'FEMALE';
  return undefined;                      // unresolved — the build will complain
}

function tagAll(picked, desc) {
  const unresolved = [];
  const out = picked.map(p => {
    const raw = desc[p.id] || '';
    const t = prep(raw), lead = t.slice(0, 400);

    const traits = new Set();                       // approximate — filters only
    const at = ageTag(p.age); if (at) traits.add(at);
    if (t) for (const [tag, re] of Object.entries(RULES)) {
      if (re.test(NARROW.has(tag) ? lead : t)) traits.add(tag);
    }

    const facts = new Set();                        // complete — categories only
    const g = resolveGender(p, raw);
    if (g === undefined) unresolved.push(p.name + ' [' + p.show + ']');
    else if (g) facts.add(g);
    facts.add(p.role === 'MAIN' ? 'MAIN CHARACTER' : 'SUPPORTING CHARACTER');

    return { name: p.name, show: p.show, img: p.img, fav: p.fav,
             traits: [...traits], facts: [...facts] };
  });

  if (unresolved.length) {
    throw new Error('no gender resolved for: ' + unresolved.join(', ') +
      '\nAdd them to GENDERLESS if that is deliberate, or to NAME_OVERRIDE if the name is off.');
  }

  // Curated memberships, validated against the finished roster. Names are not
  // unique — "King" is both a Seven Deadly Sin and an OPM hero — so an
  // ambiguous entry has to say which, as "King @ Seven Deadly Sins".
  const byName = new Map();
  for (const c of out) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name).push(c);
  }
  const problems = [];
  for (const [fact, names] of Object.entries(CURATED)) {
    for (const entry of names) {
      const [n, show] = entry.split(' @ ').map(s => s.trim());
      const hits = (byName.get(n) || []).filter(c => !show || c.show === show);
      if (!hits.length) { problems.push(`${fact} -> "${entry}" is not in the roster`); continue; }
      if (hits.length > 1) {
        problems.push(`${fact} -> "${entry}" is ambiguous (${hits.map(h => h.show).join(', ')}) — ` +
          `write it as "${n} @ ${hits[0].show}"`);
        continue;
      }
      hits[0].facts.push(fact);
    }
  }
  if (problems.length) {
    throw new Error('CURATED needs fixing:\n  ' + problems.join('\n  ') +
      '\nMissing names were probably trimmed by the caps — drop them or raise the cap.');
  }
  return out;
}

/* ---------------------------------------------------------------- emit */
function emit(tagged) {
  const tally = {};
  tagged.forEach(c => c.traits.forEach(t => { tally[t] = (tally[t] || 0) + 1; }));
  const traits = Object.keys(tally).filter(t => tally[t] >= MIN_TAG).sort();
  const ti = new Map(traits.map((t, i) => [t, i]));

  const ftally = {};
  tagged.forEach(c => c.facts.forEach(t => { ftally[t] = (ftally[t] || 0) + 1; }));
  const facts = Object.keys(ftally).sort();
  const fi = new Map(facts.map((t, i) => [t, i]));

  const shows = SERIES.map(s => s.label).filter(l => tagged.some(c => c.show === l));
  const si = new Map(shows.map((s, i) => [s, i]));

  // Popularity rank across the whole roster — complete, so it can back a
  // category. Stamped on the object, not keyed by name: names repeat.
  tagged.slice().sort((a, b) => b.fav - a.fav).forEach((c, i) => { c.rank = i; });

  const chars = tagged.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => [
    c.name, si.get(c.show), c.img,
    c.traits.filter(t => ti.has(t)).map(t => ti.get(t)).sort((a, b) => a - b),
    c.facts.map(t => fi.get(t)).sort((a, b) => a - b),
    c.rank,
  ]);

  const block =
    'const SHOWS = ' + JSON.stringify(shows) + ';\n' +
    'const TRAITS = ' + JSON.stringify(traits) + ';\n' +
    'const FACTS = ' + JSON.stringify(facts) + ';\n' +
    'const CHARS = [\n' + chars.map(c => JSON.stringify(c)).join(',\n') + '\n];';

  // Replace everything between the markers wholesale. Matching the individual
  // declarations used to leave stale copies behind when the shape changed.
  const html = fs.readFileSync(TARGET, 'utf8');
  const A = '/* ROSTER-START', B = '/* ROSTER-END */';
  const i = html.indexOf(A), j = html.indexOf(B);
  if (i < 0 || j < 0 || j < i) throw new Error('ROSTER-START/ROSTER-END markers not found in categories.html');
  const head = html.slice(0, html.indexOf('\n', i) + 1);
  const next = head + block + '\n' + html.slice(j);
  fs.writeFileSync(TARGET, next);
  return { chars, traits, facts, shows, tally, ftally };
}

(async () => {
  console.log('1/4  casts for the whitelisted series');
  const groups = await cached('casts.json', fetchCasts);

  console.log('2/4  picking the roster');
  const picked = pickRoster(groups);
  if (picked.length < 120) throw new Error(`only ${picked.length} characters — refusing to overwrite`);

  console.log('3/4  character descriptions');
  const desc = await cached('desc2.json', () => fetchDescriptions(picked));

  console.log('4/4  traits + facts + writing categories.html');
  const { chars, traits, facts, shows, tally, ftally } = emit(tagAll(picked, desc));

  const per = {};
  chars.forEach(c => { per[shows[c[1]]] = (per[shows[c[1]]] || 0) + 1; });
  console.log(`\n${chars.length} characters across ${shows.length} series`);
  console.log(Object.entries(per).sort((a, b) => b[1] - a[1]).map(([s, n]) => `  ${String(n).padStart(3)}  ${s}`).join('\n'));
  console.log(`\n${facts.length} facts (complete — these back the categories):`);
  console.log(facts.map(t => `  ${String(ftally[t]).padStart(3)}  ${t}`).join('\n'));
  console.log(`\n${traits.length} traits (approximate — grid filters only):`);
  console.log(traits.map(t => `  ${String(tally[t]).padStart(3)}  ${t}`).join('\n'));
  if (!FRESH) console.log(`\n(cache in ${path.relative(process.cwd(), CACHE)} — rerun with --fresh to refetch)`);
})().catch(e => { console.error('\nFAILED: ' + e.message); process.exit(1); });
