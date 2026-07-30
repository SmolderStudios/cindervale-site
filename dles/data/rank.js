/* ═══ RANKDLE DATASETS ══════════════════════════════════════════════════
   Each set: what you are ordering, the unit, and [label, value] pairs.
   `hi` is the label for the biggest end of the scale.
   Country population/area sets are built from data/geo.js at load so there
   is only one place those numbers live.
═══════════════════════════════════════════════════════════════════════════ */
(function () {
  var S = function (name, unit, hi, fmt, items) {
    return { name: name, unit: unit, hi: hi, fmt: fmt, items: items };
  };
  var round = function (v) { return v >= 100 ? Math.round(v).toLocaleString() : v.toString(); };

  var SETS = [
    S('Planets by diameter', 'km', 'largest', round, [
      ['Mercury', 4879], ['Venus', 12104], ['Earth', 12742], ['Mars', 6779],
      ['Jupiter', 139820], ['Saturn', 116460], ['Uranus', 50724], ['Neptune', 49244]
    ]),
    S('Planets by distance from the Sun', 'million km', 'furthest', round, [
      ['Mercury', 58], ['Venus', 108], ['Earth', 150], ['Mars', 228],
      ['Jupiter', 778], ['Saturn', 1432], ['Uranus', 2867], ['Neptune', 4515]
    ]),
    S('Animals by top speed', 'km/h', 'fastest', round, [
      ['Cheetah', 112], ['Pronghorn', 88], ['Lion', 80], ['Greyhound', 72],
      ['Horse', 88], ['Ostrich', 70], ['Grizzly bear', 56], ['Human (sprint)', 45],
      ['Elephant', 40], ['Domestic cat', 48], ['Black mamba', 20], ['Giant tortoise', 0.3]
    ]),
    S('Birds and insects by top speed', 'km/h', 'fastest', round, [
      ['Peregrine falcon (dive)', 320], ['Golden eagle (dive)', 240], ['Swift', 110],
      ['Hummingbird', 54], ['Dragonfly', 56], ['Honey bee', 25], ['Housefly', 8], ['Butterfly', 19]
    ]),
    S('Mountains by height', 'm', 'tallest', round, [
      ['Everest', 8849], ['K2', 8611], ['Kangchenjunga', 8586], ['Denali', 6190],
      ['Kilimanjaro', 5895], ['Elbrus', 5642], ['Mont Blanc', 4808], ['Matterhorn', 4478],
      ['Fuji', 3776], ['Ben Nevis', 1345], ['Table Mountain', 1086], ['Snowdon', 1085]
    ]),
    S('Rivers by length', 'km', 'longest', round, [
      ['Nile', 6650], ['Amazon', 6400], ['Yangtze', 6300], ['Mississippi', 3766],
      ['Yenisei', 5539], ['Danube', 2850], ['Rhine', 1230], ['Thames', 346],
      ['Seine', 777], ['Volga', 3531], ['Ganges', 2525], ['Mekong', 4350]
    ]),
    S('Elements by atomic number', '', 'heaviest', round, [
      ['Hydrogen', 1], ['Helium', 2], ['Carbon', 6], ['Nitrogen', 7], ['Oxygen', 8],
      ['Sodium', 11], ['Aluminium', 13], ['Silicon', 14], ['Iron', 26], ['Copper', 29],
      ['Silver', 47], ['Tin', 50], ['Gold', 79], ['Mercury', 80], ['Lead', 82], ['Uranium', 92]
    ]),
    S('Metals by melting point', '°C', 'highest', round, [
      ['Mercury', -39], ['Tin', 232], ['Lead', 327], ['Zinc', 420], ['Aluminium', 660],
      ['Silver', 962], ['Gold', 1064], ['Copper', 1085], ['Iron', 1538],
      ['Titanium', 1668], ['Platinum', 1768], ['Tungsten', 3422]
    ]),
    S('Buildings by height', 'm', 'tallest', round, [
      ['Burj Khalifa', 828], ['Shanghai Tower', 632], ['One World Trade Center', 541],
      ['Taipei 101', 508], ['Petronas Towers', 452], ['Empire State Building', 443],
      ['Eiffel Tower', 330], ['The Shard', 310], ['Chrysler Building', 319],
      ['Great Pyramid of Giza', 139], ['Big Ben tower', 96], ['Statue of Liberty', 93]
    ]),
    S('Oceans and seas by area', 'million km²', 'largest', function (v) { return v.toFixed(1); }, [
      ['Pacific Ocean', 165.2], ['Atlantic Ocean', 106.5], ['Indian Ocean', 70.6],
      ['Southern Ocean', 21.9], ['Arctic Ocean', 14.1], ['Mediterranean Sea', 2.5],
      ['Caribbean Sea', 2.8], ['South China Sea', 3.5], ['Bering Sea', 2.0],
      ['Black Sea', 0.44], ['North Sea', 0.75], ['Baltic Sea', 0.38]
    ]),
    S('Languages by native speakers', 'million', 'most spoken', round, [
      ['Mandarin Chinese', 940], ['Spanish', 485], ['English', 380], ['Hindi', 345],
      ['Bengali', 237], ['Portuguese', 236], ['Russian', 148], ['Japanese', 123],
      ['German', 76], ['French', 74], ['Korean', 82], ['Italian', 65]
    ]),
    S('Animals by lifespan', 'years', 'longest lived', round, [
      ['Mayfly', 1], ['Mouse', 2], ['Rabbit', 9], ['Dog', 13], ['Cat', 15],
      ['Lion', 14], ['Horse', 27], ['Chimpanzee', 40], ['Elephant', 65],
      ['Human', 80], ['Giant tortoise', 150], ['Bowhead whale', 200]
    ]),
    S('Musical instruments by pitch range (lowest note)', 'Hz', 'highest', round, [
      ['Double bass', 41], ['Cello', 65], ['Bassoon', 58], ['Viola', 131],
      ['Violin', 196], ['Flute', 262], ['Piccolo', 587], ['Trumpet', 165]
    ]),
    S('Everyday things by weight', 'grams', 'heaviest', round, [
      ['Paperclip', 1], ['AA battery', 24], ['Golf ball', 46], ['Tennis ball', 58],
      ['Smartphone', 190], ['Basketball', 620], ['House brick', 2500],
      ['Bowling ball', 7000], ['Car tyre', 10000]
    ])
  ];

  /* Two more sets pulled straight from the geography data. */
  function fromGeo() {
    if (!window.GEO) return;
    var big = GEO.COUNTRIES.filter(function (c) { return c.pop >= 5; });
    SETS.push(S('Countries by population', 'million', 'most populous', round,
      big.map(function (c) { return [c.n, c.pop]; })));
    SETS.push(S('Countries by land area', 'thousand km²', 'largest', round,
      GEO.COUNTRIES.filter(function (c) { return c.area >= 20; }).map(function (c) { return [c.n, c.area]; })));
  }
  fromGeo();

  window.RANKSETS = SETS;
})();
