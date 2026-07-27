/* Rebuild the Categories roster and its tag vocabulary.
 *
 *   node scripts/fetch-roster.js              # full run (~3 min, cached)
 *   node scripts/fetch-roster.js --fresh      # ignore the cache and refetch
 *
 * Rewrites the TRAITS / SERIES / CHARS arrays in categories.html in place.
 * Nothing else in that file is touched.
 *
 * WEIGHTING — the point of the pipeline. Characters are drawn per series, and
 * a character only makes the cut if enough AniList users have actually
 * favourited them (FLOOR). That single rule produces the shape we want without
 * hand-tuning: Naruto's 40th character still clears the bar because fans know
 * the whole cast, while a one-hit series contributes just its lead. Series
 * popularity only decides the order we fill from.
 *
 * WHY ANILIST — Jikan/MyAnimeList cold-misses as HTTP 504 on most character
 * URLs, which made a full pull take over an hour with rows silently dropped.
 *
 * TAGS come in two deliberately separate groups:
 *   TRAITS  describe the character — AniList's structured gender/age/role
 *           fields, plus keyword mining of that character's own description.
 *   SERIES  describe the show, straight from AniList's genre/tag data. NINJA
 *           and PIRATES live here on purpose: the series is about ninja, but
 *           not every character in it is one.
 * Rules that could not be made precise were cut rather than shipped noisy —
 * see NARROW and the note above SERIES_MAP.
 */
const fs = require('fs');
const path = require('path');

const FRESH = process.argv.includes('--fresh');
const TARGET = path.join(__dirname, '..', 'categories.html');
const CACHE = path.join(__dirname, '.roster-cache');

const SHOW_PAGES = 22;   // 10 shows per request, popularity order
const FLOOR = 400;       // favourites a character needs to make the cut
const CAP = 45;          // per-series ceiling so nothing runs away
const MIN_TAG = 6;       // drop tags too rare to be worth a filter chip
const GAP = 2100;        // AniList allows ~30 requests/min

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

const CAST = `edges{ role node{ id favourites gender age name{ full first last } image{ large } } }`;

/* ---------------------------------------------------------------- stage 1 */
const Q_SHOWS = `query($page:Int){ Page(page:$page, perPage:10){
  media(sort:POPULARITY_DESC, type:ANIME){
    id popularity title{ english romaji } genres tags{ name rank }
    characters(sort:FAVOURITES_DESC, perPage:25){ ${CAST} }
  } } }`;

const Q_DEEP = `query($ids:[Int],$cp:Int){ Page(page:1, perPage:20){
  media(id_in:$ids, type:ANIME){
    id characters(sort:FAVOURITES_DESC, page:$cp, perPage:25){ ${CAST} }
  } } }`;

async function fetchShows() {
  const all = [];
  for (let p = 1; p <= SHOW_PAGES; p++) {
    const d = await gql(Q_SHOWS, { page: p });
    await sleep(GAP);
    if (!d) { console.log(`  !! show page ${p} failed`); continue; }
    all.push(...d.Page.media);
    console.log(`  shows ${all.length}`);
  }
  if (!all.length) throw new Error('no shows returned');

  // AniList caps a nested cast at 25. Series whose 25th character is still
  // well loved get pages 2-3 so the big franchises reach their real depth.
  const byId = new Map(all.map(s => [s.id, s]));
  let deep = all.filter(s => s.characters.edges.length >= 25 &&
                             s.characters.edges[24].node.favourites >= FLOOR);
  for (let cp = 2; cp <= 3 && deep.length; cp++) {
    const ids = deep.map(s => s.id);
    for (let i = 0; i < ids.length; i += 20) {
      const d = await gql(Q_DEEP, { ids: ids.slice(i, i + 20), cp });
      await sleep(GAP);
      if (!d) continue;
      for (const m of d.Page.media) {
        const s = byId.get(m.id);
        if (!s) continue;
        const have = new Set(s.characters.edges.map(e => e.node.id));
        for (const e of m.characters.edges) if (!have.has(e.node.id)) s.characters.edges.push(e);
      }
    }
    deep = deep.filter(s => s.characters.edges[25 * cp - 1] &&
                            s.characters.edges[25 * cp - 1].node.favourites >= FLOOR);
    console.log(`  deepened to cast page ${cp} (${deep.length} series still qualify)`);
  }
  return all;
}

/* ---------------------------------------------------------------- stage 2 */
// "Attack on Titan Final Season Part 2" -> "Attack on Titan"
const SUFFIX = [/\s+(Final\s+)?Season\s*\d*(\s+Part\s*\d+)?$/i, /\s+\d+(st|nd|rd|th)\s+Season$/i,
                /\s+Part\s*\d+$/i, /\s+Cour\s*\d+$/i, /\s+[IVX]{1,4}$/, /\s+\d+$/];
function normTitle(t) {
  let s = t.trim();
  for (let i = 0; i < 4; i++) {
    const before = s;
    for (const re of SUFFIX) s = s.replace(re, '').trim();
    s = s.replace(/[:\-–]\s*$/, '').trim();
    if (s === before) break;
  }
  return s || t.trim();
}

// AniList stores given/family names separately and `full` is given-first, which
// matches how English-speaking fans say almost every character. These are the
// ones where the family name is conventionally spoken first.
const NAME_OVERRIDE = {
  'Luffy Monkey':'Monkey D. Luffy', 'Zoro Roronoa':'Roronoa Zoro',
  'Ace Portgas':'Portgas D. Ace', 'Law Trafalgar':'Trafalgar Law',
  'Robin Nico':'Nico Robin', 'Chopper Tony Tony':'Tony Tony Chopper',
  'Hancock Boa':'Boa Hancock', 'Mihawk Dracule':'Dracule Mihawk',
  'Vivi Nefertari':'Nefertari Vivi', 'Sanji Vinsmoke':'Sanji',
  'Teach Marshall':'Marshall D. Teach', 'Roger Gol':'Gol D. Roger',
  'Garp Monkey':'Monkey D. Garp', 'Dragon Monkey':'Monkey D. Dragon',
};
function fixName(n) {
  let full = (n.full || '').trim();
  if (n.last && /\bD\.$/.test(n.last.trim()) && n.first) full = n.last.trim() + ' ' + n.first.trim();
  return NAME_OVERRIDE[full] || full;
}
const imgFile = u => {
  const m = /\/character\/(?:medium|large)\/(.+)$/.exec(u || '');
  return m && !/^default/i.test(m[1]) ? m[1] : null;
};

function pickRoster(shows) {
  const franchise = new Map();
  for (const s of shows) {
    const key = normTitle(s.title.english || s.title.romaji);
    const prev = franchise.get(key);
    if (!prev || s.popularity > prev.popularity) {
      franchise.set(key, { title: key, popularity: s.popularity, genres: s.genres, tags: s.tags });
    }
  }
  // Suffix stripping misses movies and named arcs ("Tokyo Ghoul √A", "... The
  // Movie: Mugen Train"). Fold any title whose alphanumeric form starts with a
  // more popular title's into that parent.
  const alnum = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byPop = [...franchise.values()].sort((a, b) => b.popularity - a.popularity);
  const merge = new Map();
  for (const f of byPop) {
    const a = alnum(f.title);
    let parent = f.title;
    for (const g of byPop) {
      if (g === f || g.popularity < f.popularity) continue;
      const b = alnum(g.title);
      if (b.length >= 6 && a.length > b.length && a.startsWith(b)) { parent = g.title; break; }
    }
    merge.set(f.title, parent);
  }
  for (const [child, parent] of merge) if (child !== parent) franchise.delete(child);

  const bucket = new Map();
  for (const s of shows) {
    const key = merge.get(normTitle(s.title.english || s.title.romaji));
    const b = bucket.get(key) || [];
    for (const e of s.characters.edges) b.push(e);
    bucket.set(key, b);
  }

  const picked = [], seen = new Set();
  for (const f of [...franchise.values()].sort((a, b) => b.popularity - a.popularity)) {
    const cast = (bucket.get(f.title) || [])
      .filter(e => e.node.favourites >= FLOOR)
      .sort((a, b) => b.node.favourites - a.node.favourites);
    let n = 0;
    for (const e of cast) {
      if (n >= CAP) break;
      const c = e.node, img = imgFile(c.image && c.image.large), name = fixName(c.name);
      if (seen.has(c.id) || !img || !name) continue;
      seen.add(c.id); n++;
      picked.push({ id: c.id, name, show: f.title, img, gender: c.gender, age: c.age,
                    role: e.role, genres: f.genres || [],
                    showTags: (f.tags || []).filter(t => t.rank >= 60).map(t => t.name) });
    }
  }
  return picked;
}

/* ---------------------------------------------------------------- stage 3 */
const Q_DESC = `query($ids:[Int]){ Page(page:1, perPage:50){ characters(id_in:$ids){ id description(asHtml:false) } } }`;

async function fetchDescriptions(picked) {
  const out = {};
  const ids = picked.map(p => p.id);
  for (let i = 0; i < ids.length; i += 50) {
    const d = await gql(Q_DESC, { ids: ids.slice(i, i + 50) });
    await sleep(GAP);
    if (!d) { console.log(`  !! description batch ${i} failed`); continue; }
    for (const c of d.Page.characters) if (c.description) out[c.id] = c.description;
    console.log(`  descriptions ${Math.min(i + 50, ids.length)}/${ids.length}`);
  }
  return out;
}

/* ---------------------------------------------------------------- stage 4 */
const RULES = {
  FIRE:      /\b(pyrokinesis|pyrokinetic|flame[sd]?|flaming|fireball|fire (magic|style|breathing|release)|incinerat\w*|inferno)\b/,
  ICE:       /\b(cryokinesis|cryokinetic|ice (magic|style|release|powers?|user)|icy|frost\w*|freez\w*|glacial|blizzard)\b/,
  LIGHTNING: /\b(lightning|thunder\w*|electrokinesis|electricity)\b/,
  WIND:      /\b(wind (magic|style|release|user)|aerokinesis|tornado)\b/,
  WATER:     /\b(water (magic|style|release|user|manipulation)|hydrokinesis)\b/,
  MAGIC:     /\b(mage|wizard|witch|sorcer\w*|magician|spellcast\w*|grimoire)\b/,
  PSYCHIC:   /\b(psychic|telepath\w*|telekine\w*|esper|clairvoyan\w*)\b/,
  SWORD:     /\b(sword\w*|katana|blade\w*|rapier|nodachi|zanpakutou|zanpakuto|nichirin)\b/,
  GUNS:      /\b(gun|guns|gunman|pistol|revolver|rifle|sniper|firearm|shotgun|marksman)\b/,
  BOW:       /\b(archer|archery|bow and arrow|quiver|longbow)\b/,
  'MARTIAL ARTS': /\b(martial art\w*|hand[- ]to[- ]hand|karate|judo|taekwondo|boxer|boxing|kung fu)\b/,
  ROBOT:     /\b(android|robot\w*|automaton|artificial (intelligence|human|being))\b/,
  CYBORG:    /\b(cyborg|cybernetic\w*|prosthetic\w*|bionic)\b/,
  VAMPIRE:   /\b(vampire\w*|vampiric|dhampir)\b/,
  DRAGON:    /\b(dragon\w*|wyvern)\b/,
  ELF:       /\b(elf|elves|elven|half[- ]elf)\b/,
  ALIEN:     /\b(alien\w*|extraterrestrial)\b/,
  IMMORTAL:  /\b(immortal\w*|cannot die|undying|eternal life)\b/,
  GLASSES:   /\b(glasses|spectacles|monocle)\b/,
  MASK:      /\b(mask\w*|masked)\b/,
  DOCTOR:    /\b(doctor|physician|surgeon|medic\b|nurse)\b/,
  CHEF:      /\b(chef|cook\b|culinary)\b/,
  SCIENTIST: /\b(scientist|researcher|inventor|chemist)\b/,
  PILOT:     /\b(pilot\w*)\b/,
  DETECTIVE: /\b(detective|investigator|sleuth)\b/,
  ASSASSIN:  /\b(assassin\w*|hitman)\b/,
  SAMURAI:   /\b(samurai|ronin)\b/,
  IDOL:      /\b(idol\b|pop star)\b/,
};

// Job and species words are only trustworthy near the top of an entry — the
// infobox and the "X is a ..." opener. Deeper in the biography the same words
// describe other people or are plain adjectives ("noble" meaning honourable),
// which is what made CAPTAIN / ROYALTY / GOD / SOLDIER / VILLAIN unusable.
const NARROW = new Set(['DOCTOR', 'CHEF', 'SCIENTIST', 'PILOT', 'DETECTIVE', 'ASSASSIN',
  'SAMURAI', 'IDOL', 'ROBOT', 'CYBORG', 'VAMPIRE', 'ELF', 'ALIEN', 'IMMORTAL']);

const SERIES_MAP = {
  SCHOOL:['School'], MILITARY:['Military'], SPORTS:['Sports'], MECHA:['Mecha'],
  ISEKAI:['Isekai'], SPACE:['Space'], HISTORICAL:['Historical'],
  'POST-APOCALYPTIC':['Post-Apocalyptic','Dystopian'], HORROR:['Horror'],
  ROMANCE:['Romance'], MYSTERY:['Mystery'], CRIME:['Crime'],
  PSYCHOLOGICAL:['Psychological'], 'SLICE OF LIFE':['Slice of Life'],
  WAR:['War'], SURVIVAL:['Survival'], NINJA:['Ninja'], PIRATES:['Pirates'],
  DEMONS:['Demons'], GODS:['Gods'], MYTHOLOGY:['Mythology'], WITCHES:['Witch'],
  'MONSTER GIRLS':['Monster Girl'], POLICE:['Police'], YAKUZA:['Yakuza'],
  'TIME TRAVEL':['Time Manipulation'], 'ROYAL COURT':['Royal Affairs'],
  RURAL:['Rural'], CYBERPUNK:['Cyberpunk'], ZOMBIES:['Zombie'], 'SCI-FI':['Sci-Fi'],
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

function tagAll(picked, desc) {
  return picked.map(p => {
    const t = prep(desc[p.id]), lead = t.slice(0, 400);
    const traits = new Set(), series = new Set();

    if (p.gender === 'Male') traits.add('MALE');
    else if (p.gender === 'Female') traits.add('FEMALE');
    const at = ageTag(p.age); if (at) traits.add(at);
    if (p.role === 'MAIN') traits.add('MAIN CHARACTER');
    if (t) for (const [tag, re] of Object.entries(RULES)) {
      if (re.test(NARROW.has(tag) ? lead : t)) traits.add(tag);
    }
    const world = new Set([...(p.genres || []), ...(p.showTags || [])]);
    for (const [tag, keys] of Object.entries(SERIES_MAP)) if (keys.some(k => world.has(k))) series.add(tag);

    return { name: p.name, show: p.show, img: p.img, traits: [...traits], series: [...series] };
  });
}

/* ---------------------------------------------------------------- stage 5 */
function emit(tagged) {
  const tally = key => {
    const m = {};
    tagged.forEach(c => c[key].forEach(t => { m[t] = (m[t] || 0) + 1; }));
    return m;
  };
  const keep = key => {
    const m = tally(key);
    return Object.keys(m).filter(t => m[t] >= MIN_TAG).sort();
  };
  const traits = keep('traits'), series = keep('series');
  const ti = new Map(traits.map((t, i) => [t, i])), si = new Map(series.map((t, i) => [t, i]));

  const chars = tagged.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => [
    c.name, c.show, c.img,
    c.traits.filter(t => ti.has(t)).map(t => ti.get(t)).sort((a, b) => a - b),
    c.series.filter(t => si.has(t)).map(t => si.get(t)).sort((a, b) => a - b),
  ]);

  const block =
    'const TRAITS = ' + JSON.stringify(traits) + ';\n' +
    'const SERIES = ' + JSON.stringify(series) + ';\n' +
    'const CHARS = [\n' + chars.map(c => JSON.stringify(c)).join(',\n') + '\n];';

  const html = fs.readFileSync(TARGET, 'utf8');
  if (!/const CHARS = \[[\s\S]*?\n\];/.test(html)) throw new Error('CHARS block not found in categories.html');
  const next = html
    .replace(/const TRAITS = \[[^\]]*\];\n/, '')
    .replace(/const SERIES = \[[^\]]*\];\n/, '')
    .replace(/const CHARS = \[[\s\S]*?\n\];/, block);
  fs.writeFileSync(TARGET, next);
  return { chars, traits, series };
}

/* ---------------------------------------------------------------- run */
(async () => {
  console.log('1/4  popular series + casts');
  const shows = await cached('shows.json', fetchShows);

  console.log('2/4  weighting the roster');
  const picked = pickRoster(shows);
  if (picked.length < 400) throw new Error(`only ${picked.length} characters — refusing to overwrite`);

  console.log('3/4  character descriptions');
  const desc = await cached('desc.json', () => fetchDescriptions(picked));

  console.log('4/4  tagging + writing categories.html');
  const { chars, traits, series } = emit(tagAll(picked, desc));

  const per = {};
  chars.forEach(c => { per[c[1]] = (per[c[1]] || 0) + 1; });
  const ranked = Object.entries(per).sort((a, b) => b[1] - a[1]);
  console.log(`\n${chars.length} characters across ${ranked.length} series`);
  console.log(`${traits.length} traits, ${series.length} series tags`);
  console.log('deepest: ' + ranked.slice(0, 6).map(([t, n]) => `${t} ${n}`).join(', '));
  if (!FRESH) console.log(`\n(cache in ${path.relative(process.cwd(), CACHE)} — rerun with --fresh to refetch)`);
})().catch(e => { console.error('\nFAILED: ' + e.message); process.exit(1); });
