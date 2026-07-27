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
const FLOOR = 60;        // favourites a character needs to make the cut
const MIN_TAG = 5;       // drop traits too rare to be worth a filter chip
const GAP = 2100;        // AniList allows ~30 requests/min

// Every entry here is a series Jordan picked. `ids` merge into one label.
const SERIES = [
  { label: 'Naruto',              ids: [1735, 20],                     cap: 45 },
  { label: 'One Piece',           ids: [21],                           cap: 45 },
  { label: 'Bleach',              ids: [269, 116674],                  cap: 40 },
  { label: 'Attack on Titan',     ids: [16498, 20958, 99147, 110277],  cap: 35 },
  { label: 'One Punch Man',       ids: [21087, 97668, 153800],         cap: 25 },
  { label: 'Fullmetal Alchemist', ids: [5114],                         cap: 30 },
  { label: 'Seven Deadly Sins',   ids: [20789, 99539, 108928, 21385],  cap: 28 },
  { label: 'Sword Art Online',    ids: [11757, 20594, 100182, 108759], cap: 25 },
  { label: 'Code Geass',          ids: [1575, 2904],                   cap: 25 },
  { label: 'Solo Leveling',       ids: [151807, 176496],               cap: 20 },
  { label: 'Death Note',          ids: [1535],                         cap: 18 },
  // Pokémon is hand-picked: the starters Jordan named plus the handful of
  // creatures and trainers recognisable enough to anchor a category.
  // Charmander and Mewtwo have no AniList entry in the anime, so Charizard
  // stands in for the fire starter.
  { label: 'Pokémon', ids: [527], cap: 99, only: [
      'Pikachu', 'Fushigidane', 'Zenigame', 'Lizardon', 'Nyarth', 'Kabigon',
      'Purin', 'Koduck', 'Togepy', 'Laplace', 'Metamon', 'Butterfree',
      'Satoshi', 'Kasumi', 'Takeshi', 'Musashi', 'Kojirou', 'Sakaki',
      'Shigeru Ookido', 'Yukinari Ookido',
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
    let n = 0;
    const cast = g.cast.slice().sort((a, b) => b.favourites - a.favourites);
    for (const c of cast) {
      if (n >= g.cap) break;
      const raw = (c.name.full || '').trim();
      if (g.only && !g.only.includes(raw)) continue;      // hand-picked series
      if (!g.only && c.favourites < FLOOR) continue;
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

function tagAll(picked, desc) {
  return picked.map(p => {
    const t = prep(desc[p.id]), lead = t.slice(0, 400);
    const traits = new Set();
    if (p.gender === 'Male') traits.add('MALE');
    else if (p.gender === 'Female') traits.add('FEMALE');
    const at = ageTag(p.age); if (at) traits.add(at);
    if (p.role === 'MAIN') traits.add('MAIN CHARACTER');
    if (t) for (const [tag, re] of Object.entries(RULES)) {
      if (re.test(NARROW.has(tag) ? lead : t)) traits.add(tag);
    }
    return { name: p.name, show: p.show, img: p.img, traits: [...traits] };
  });
}

/* ---------------------------------------------------------------- emit */
function emit(tagged) {
  const tally = {};
  tagged.forEach(c => c.traits.forEach(t => { tally[t] = (tally[t] || 0) + 1; }));
  const traits = Object.keys(tally).filter(t => tally[t] >= MIN_TAG).sort();
  const ti = new Map(traits.map((t, i) => [t, i]));
  const shows = SERIES.map(s => s.label).filter(l => tagged.some(c => c.show === l));
  const si = new Map(shows.map((s, i) => [s, i]));

  const chars = tagged.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => [
    c.name, si.get(c.show), c.img,
    c.traits.filter(t => ti.has(t)).map(t => ti.get(t)).sort((a, b) => a - b),
  ]);

  const block =
    'const SHOWS = ' + JSON.stringify(shows) + ';\n' +
    'const TRAITS = ' + JSON.stringify(traits) + ';\n' +
    'const CHARS = [\n' + chars.map(c => JSON.stringify(c)).join(',\n') + '\n];';

  const html = fs.readFileSync(TARGET, 'utf8');
  if (!/const CHARS = \[[\s\S]*?\n\];/.test(html)) throw new Error('CHARS block not found in categories.html');
  const next = html
    .replace(/const SHOWS = \[[^\]]*\];\n/, '')
    .replace(/const TRAITS = \[[^\]]*\];\n/, '')
    .replace(/const SERIES = \[[^\]]*\];\n/, '')
    .replace(/const CHARS = \[[\s\S]*?\n\];/, block);
  fs.writeFileSync(TARGET, next);
  return { chars, traits, shows, tally };
}

(async () => {
  console.log('1/4  casts for the whitelisted series');
  const groups = await cached('casts.json', fetchCasts);

  console.log('2/4  picking the roster');
  const picked = pickRoster(groups);
  if (picked.length < 120) throw new Error(`only ${picked.length} characters — refusing to overwrite`);

  console.log('3/4  character descriptions');
  const desc = await cached('desc2.json', () => fetchDescriptions(picked));

  console.log('4/4  traits + writing categories.html');
  const { chars, traits, shows, tally } = emit(tagAll(picked, desc));

  const per = {};
  chars.forEach(c => { per[shows[c[1]]] = (per[shows[c[1]]] || 0) + 1; });
  console.log(`\n${chars.length} characters across ${shows.length} series`);
  console.log(Object.entries(per).sort((a, b) => b[1] - a[1]).map(([s, n]) => `  ${String(n).padStart(3)}  ${s}`).join('\n'));
  console.log(`\n${traits.length} traits:`);
  console.log(traits.map(t => `  ${String(tally[t]).padStart(3)}  ${t}`).join('\n'));
  if (!FRESH) console.log(`\n(cache in ${path.relative(process.cwd(), CACHE)} — rerun with --fresh to refetch)`);
})().catch(e => { console.error('\nFAILED: ' + e.message); process.exit(1); });
