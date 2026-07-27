/* Regenerate the Categories character roster.
 *
 *   node scripts/fetch-roster.js            # 300 characters (default)
 *   node scripts/fetch-roster.js 500        # a bigger roster
 *
 * Pulls the most-favourited anime characters from AniList's GraphQL API —
 * name, the anime they're best known for, and a portrait — then rewrites the
 * `const CHARS = [...]` block in categories.html in place. Nothing else in
 * the file is touched.
 *
 * AniList is used rather than MyAnimeList/Jikan because Jikan cold-misses as
 * 504 on most character URLs, which made a full roster pull take over an hour.
 */
const fs = require('fs');
const path = require('path');

const WANT = Math.max(1, parseInt(process.argv[2], 10) || 300);
const PER_PAGE = 50;
const GAP = 900;
const TARGET = path.join(__dirname, '..', 'categories.html');

const Q = `query($page:Int,$per:Int){
  Page(page:$page, perPage:$per){
    characters(sort:FAVOURITES_DESC){
      favourites
      name{ full first last }
      image{ large medium }
      media(sort:POPULARITY_DESC, type:ANIME, perPage:1){
        nodes{ title{ english romaji } }
      }
    }
  }
}`;

// AniList stores given/family names separately and `full` is given-first,
// which matches how English-speaking fans say almost every character. These
// are the ones where the family name is conventionally spoken first.
const OVERRIDE = {
  'Luffy Monkey':'Monkey D. Luffy', 'Zoro Roronoa':'Roronoa Zoro',
  'Ace Portgas':'Portgas D. Ace', 'Law Trafalgar':'Trafalgar Law',
  'Robin Nico':'Nico Robin', 'Chopper Tony Tony':'Tony Tony Chopper',
  'Hancock Boa':'Boa Hancock', 'Mihawk Dracule':'Dracule Mihawk',
  'Vivi Nefertari':'Nefertari Vivi', 'Sanji Vinsmoke':'Sanji',
  'Teach Marshall':'Marshall D. Teach', 'Roger Gol':'Gol D. Roger',
  'Garp Monkey':'Monkey D. Garp', 'Dragon Monkey':'Monkey D. Dragon',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function page(p, tries = 4) {
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: Q, variables: { page: p, per: PER_PAGE } }),
      });
      if (r.status === 429) { console.log('  rate limited, waiting a minute'); await sleep(62000); continue; }
      const j = await r.json();
      if (j.errors) { console.log('  ' + JSON.stringify(j.errors).slice(0, 160)); await sleep(2000); continue; }
      return j.data.Page.characters;
    } catch (e) { await sleep(2500); }
  }
  return null;
}

function fixName(n) {
  let full = (n.full || '').trim();
  if (n.last && /\bD\.$/.test(n.last.trim()) && n.first) full = n.last.trim() + ' ' + n.first.trim();
  return OVERRIDE[full] || full;
}

// ".../character/medium/b45627-CR68RyZmddGG.png" -> "b45627-CR68RyZmddGG.png"
const file = u => {
  const m = /\/character\/(?:medium|large)\/(.+)$/.exec(u || '');
  return m && !/^default/i.test(m[1]) ? m[1] : null;
};

(async () => {
  const out = [], seen = new Set();
  const maxPages = Math.ceil(WANT / PER_PAGE) + 4;   // headroom for skipped entries

  for (let p = 1; p <= maxPages && out.length < WANT; p++) {
    const list = await page(p);
    if (!list) { console.log(`!! page ${p} failed, continuing`); continue; }
    for (const c of list) {
      if (out.length >= WANT) break;
      const show = c.media.nodes[0];          // no anime credit -> manga-only, skip
      if (!show) continue;
      const title = show.title.english || show.title.romaji;
      const img = file(c.image.large) || file(c.image.medium);
      const name = fixName(c.name);
      if (!title || !img || !name) continue;
      const key = name.toLowerCase() + '|' + title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([name, title, img]);
    }
    console.log(`page ${p} — ${out.length}/${WANT}`);
    await sleep(GAP);
  }

  if (out.length < WANT * 0.5) {
    console.error(`only got ${out.length} of ${WANT} — refusing to overwrite categories.html`);
    process.exit(1);
  }

  out.sort((a, b) => a[0].localeCompare(b[0]));

  const html = fs.readFileSync(TARGET, 'utf8');
  const re = /(const CHARS = )\[[\s\S]*?\n\];/;
  if (!re.test(html)) {
    console.error('could not find the CHARS block in categories.html');
    process.exit(1);
  }
  const lit = '[\n' + out.map(c => JSON.stringify(c)).join(',\n') + '\n];';
  fs.writeFileSync(TARGET, html.replace(re, (_m, head) => head + lit));

  console.log(`\nwrote ${out.length} characters into categories.html`);
  console.log('distinct series: ' + new Set(out.map(c => c[1])).size);
})();
