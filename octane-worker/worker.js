/* OCTANE API. Serves cindervaleidle.com/mpg/ (the MPG tracker).
 *
 *   POST   /scan           photo of a pump, receipt or odometer -> numbers
 *   GET    /backup/:code   cloud backup, read
 *   PUT    /backup/:code   cloud backup, write (compare-and-swap on rev)
 *   DELETE /backup/:code   cloud backup, remove
 *
 * The backup code is the only key. It is 24 random base32 characters made on
 * the phone, so it cannot be guessed, and nothing else identifies the owner.
 */

const ORIGINS = [/^https:\/\/(www\.)?cindervaleidle\.com$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

const MODELS = {
  gemma: { id: '@cf/google/gemma-4-26b-a4b-it', kind: 'chat', think: false },
  qwen: { id: '@cf/qwen/qwen3.8-27b', kind: 'chat', think: false },
  qwenthink: { id: '@cf/qwen/qwen3.8-27b', kind: 'chat', think: true },
  scout: { id: '@cf/meta/llama-4-scout-17b-16e-instruct', kind: 'legacy' },
  mistral: { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', kind: 'legacy' },
};
/* 'auto' = the fast model first, and the slow careful one only when the fast
   reading fails its own check. Measured on synthetic pump photos: gemma ~1.3s,
   qwen ~7.6s but read every one of them right. */
const FAST = 'gemma', CAREFUL = 'qwen';

const DAILY_SCAN_CAP = 400;          // whole site, per UTC day. Keeps the AI bill at pennies.
const MAX_IMAGE_CHARS = 3_000_000;   // ~2.2 MB of JPEG as base64
const MAX_BACKUP_CHARS = 1_900_000;  // D1 row limit is 2 MB

const SYSTEM = 'You read numbers off photos: gas pump displays, fuel receipts and car dashboards. You answer with JSON only.';
const PROMPT = `Read this photo. It shows a gas pump display, a fuel receipt, or a car's odometer / trip meter.

Return JSON with exactly these keys. Use null for anything you cannot clearly see. Never guess.
- "kind": "pump", "receipt", "odometer" or "other"
- "total": the total sale in dollars, like 45.23
- "gallons": the gallons pumped, like 12.345
- "price": the price per gallon for THIS sale, like 3.459
- "odometer": the odometer in whole miles, like 123456
- "trip": the trip meter reading, like 312.4
- "grade": the fuel grade of this sale if shown, like "87", "91", "diesel" or "E85"

Rules:
- A pump may list prices for several grades on buttons. "price" is the one for this sale and should be close to total divided by gallons.
- Seven segment digits: read each digit carefully. The decimal point is a small dot or square low beside a digit.
- Leading blank digits on a pump are not zeros.
- Numbers only, no $ signs or units.`;

const SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['pump', 'receipt', 'odometer', 'other'] },
    total: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    gallons: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    price: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    odometer: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    trip: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    grade: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['kind', 'total', 'gallons', 'price', 'odometer', 'trip', 'grade'],
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    try {
      if (url.pathname === '/' || url.pathname === '/health') return json(req, { ok: true, service: 'octane-api' });

      const ip = req.headers.get('CF-Connecting-IP') || 'local';
      if (env.LIMIT) {
        const { success } = await env.LIMIT.limit({ key: ip });
        if (!success) return json(req, { error: 'Too many requests. Wait a minute.' }, 429);
      }

      if (url.pathname === '/scan' && req.method === 'POST') return await scan(req, env);

      const m = url.pathname.match(/^\/backup\/([A-Z2-7]{24})$/);
      if (m && req.method === 'GET') return await backupGet(req, env, m[1]);
      if (m && req.method === 'PUT') return await backupPut(req, env, m[1]);
      if (m && req.method === 'DELETE') return await backupDelete(req, env, m[1]);

      return json(req, { error: 'not found' }, 404);
    } catch (e) {
      return json(req, { error: 'server error', detail: String((e && e.message) || e).slice(0, 300) }, 500);
    }
  },
};

/* ------------------------------------------------------------------ http --- */
function cors(req) {
  const o = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.some(r => r.test(o)) ? o : 'https://cindervaleidle.com',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(req) } });
}

let tablesReady = false;
async function ensureTables(env) {
  if (tablesReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS backups (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, saved_at INTEGER NOT NULL, data TEXT NOT NULL, prev TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS scans (day TEXT PRIMARY KEY, n INTEGER NOT NULL)'),
  ]);
  tablesReady = true;
}

/* ------------------------------------------------------------------ scan --- */
async function scan(req, env) {
  let body;
  try { body = await req.json(); } catch { return json(req, { error: 'bad request' }, 400); }
  const img = String(body.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(img)) return json(req, { error: 'no image' }, 400);
  if (img.length > MAX_IMAGE_CHARS) return json(req, { error: 'That photo is too big.' }, 413);

  await ensureTables(env);
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare('INSERT INTO scans (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1 RETURNING n').bind(day).first();
  if (row && row.n > DAILY_SCAN_CAP) return json(req, { error: 'Photo scanning is used up for today. Type the numbers in.' }, 429);

  const want = MODELS[body.model] ? body.model : 'auto';
  const hint = ['pump', 'receipt', 'odometer'].includes(body.hint) ? body.hint : '';
  const prevOdo = Math.max(0, Number(body.prevOdo) || 0);
  const t0 = Date.now();
  const reads = [];
  let result;

  if (want !== 'auto') {
    result = await read(env, want, img, hint);
    reads.push(result);
  } else {
    const a = await read(env, FAST, img, hint);
    reads.push(a);
    result = a;
    if (a.error || needsSecondLook(a, prevOdo)) {
      const b = await read(env, CAREFUL, img, hint);
      reads.push(b);
      result = a.error ? b : b.error ? a : vote(a, b, prevOdo);
    }
  }
  if (result.error) return json(req, { error: 'Could not read that photo. Try again or type it in.', detail: result.error }, 502);

  return json(req, {
    ok: true, models: reads.map(r => r.alias), ms: Date.now() - t0,
    kind: result.kind, fields: result.fields, check: result.status,
    debug: body.debug ? reads.map(r => ({ model: r.alias, status: r.status, text: r.text, usage: r.usage, error: r.error })) : undefined,
  });
}

async function read(env, alias, img, hint) {
  try {
    const { text, usage } = await runModel(env, MODELS[alias], img, hint);
    const raw = clean(parseJSON(text) || {});
    const rec = reconcile(raw);
    return { alias, text, usage, kind: raw.kind, raw, fields: rec.fields, status: rec.status };
  } catch (e) {
    return { alias, error: String((e && e.message) || e).slice(0, 300) };
  }
}

async function runModel(env, m, img, hint) {
  const text = PROMPT + (hint ? `\n\nThe person says this is a ${hint} photo.` : '');
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: m.kind === 'chat' ? { url: img, detail: 'high' } : { url: img } }] },
  ];
  if (m.kind === 'chat') {
    const base = { messages, max_tokens: m.think ? 3000 : 400, temperature: 0, chat_template_kwargs: { enable_thinking: !!m.think } };
    let r;
    try { r = await env.AI.run(m.id, { ...base, response_format: { type: 'json_schema', json_schema: { name: 'reading', schema: SCHEMA } } }); }
    catch (e) { r = await env.AI.run(m.id, base); }   // some builds reject schemas; the prompt still asks for JSON
    const c = r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
    return { text: typeof c === 'string' ? c : stringy(r && (r.response ?? r)), usage: r && r.usage };
  }
  let r;
  try { r = await env.AI.run(m.id, { messages, max_tokens: 400, temperature: 0, response_format: { type: 'json_schema', json_schema: SCHEMA } }); }
  catch (e) { r = await env.AI.run(m.id, { messages, max_tokens: 400, temperature: 0 }); }
  return { text: stringy(r && (r.response ?? r)), usage: r && r.usage };
}
const stringy = v => (typeof v === 'string' ? v : JSON.stringify(v));

function parseJSON(text) {
  if (!text) return null;
  const t = String(text).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(json)?/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

/* Coerce whatever the model said into numbers in sane ranges. */
function num(v, lo, hi, dp) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''));
  if (!isFinite(n) || n < lo || n > hi) return null;
  const k = Math.pow(10, dp);
  return Math.round(n * k) / k;
}
function clean(p) {
  const kind = ['pump', 'receipt', 'odometer', 'other'].includes(p.kind) ? p.kind : 'other';
  const grade = p.grade == null ? null : String(p.grade).trim().slice(0, 12) || null;
  return {
    kind,
    total: num(p.total, 0.01, 2000, 2),
    gallons: num(p.gallons, 0.01, 300, 3),
    price: num(p.price, 0.2, 20, 3),
    odometer: num(p.odometer, 0, 3000000, 0),
    trip: num(p.trip, 0, 5000, 1),
    grade,
  };
}

/* A pump works out total = gallons x price and rounds to the cent, so the three
   numbers check each other. 1.5 cents covers rounding the displayed gallons plus
   pumps that cut the total off instead of rounding it. A misread digit in the
   total or price almost never still adds up. */
const r2 = n => Math.round(n * 100) / 100, r3 = n => Math.round(n * 1000) / 1000;
const agrees = (t, g, p) => Math.abs(g * p - t) <= 0.015;
const good = s => s === 'ok' || s === 'fixed';
const RANK = { ok: 5, fixed: 4, check: 3, derived: 2, mismatch: 1, partial: 1, empty: 0 };
/* US pumps price to a tenth of a cent (3.459). A two-decimal price that still
   adds up is how a dropped last digit plus a misread total slips through. */
const tenths = p => Math.abs(p * 100 - Math.round(p * 100)) > 1e-6;

function reconcile(f) {
  const { total: T, gallons: G, price: P } = f;
  const out = { ...f };
  delete out.kind;
  if (T && G && P) {
    if (agrees(T, G, P)) return { fields: out, status: tenths(P) ? 'ok' : 'check' };
    /* The usual seven segment misread is a lost decimal point. Try moving one. */
    const shifts = [1, 0.1, 0.01, 0.001, 10, 100, 1000];
    let best = null;
    for (const a of shifts) for (const b of shifts) for (const c of shifts) {
      const t = T * a, g = G * b, p = P * c;
      if (t < 0.5 || t > 2000 || g < 0.05 || g > 300 || p < 0.5 || p > 20) continue;
      if (!agrees(t, g, p)) continue;
      const cost = (a !== 1) + (b !== 1) + (c !== 1);
      if (!best || cost < best.cost) best = { t, g, p, cost };
    }
    if (best && best.cost === 1) return { fields: { ...out, total: r2(best.t), gallons: r3(best.g), price: r3(best.p) }, status: tenths(best.p) ? 'fixed' : 'check' };
    return { fields: out, status: 'mismatch' };
  }
  if (T && G && !P) return { fields: { ...out, price: r3(T / G) }, status: 'derived' };
  if (T && P && !G) return { fields: { ...out, gallons: r3(T / P) }, status: 'derived' };
  if (G && P && !T) return { fields: { ...out, total: r2(G * P) }, status: 'derived' };
  return { fields: out, status: (T || G || P || f.odometer != null || f.trip != null) ? 'partial' : 'empty' };
}

function needsSecondLook(r, prevOdo) {
  const f = r.fields;
  const money = f.total != null || f.gallons != null || f.price != null;
  if (money && !good(r.status)) return true;
  if (f.odometer != null && prevOdo > 0 && (f.odometer <= prevOdo || f.odometer > prevOdo + 3000)) return true;
  if (!money && f.odometer == null && f.trip == null) return true;
  return false;
}

/* Two readings of one photo. Pick the total / gallons / price that add up,
   preferring digits both models agree on, then the careful model's. Only
   numbers a model actually READ go in the pool. A value one model worked out
   from its own two readings always adds up with them, so letting it in would
   stamp a wrong reading as checked. */
function vote(a, b, prevOdo) {
  const out = { ...b.fields };
  let status = b.status;
  const read = (r, k) => (r.status === 'fixed' ? r.fields[k] : r.raw[k]);
  const pool = k => [...new Set([read(b, k), read(a, k)].filter(v => v != null))];
  const T = pool('total'), G = pool('gallons'), P = pool('price');
  let best = null;
  for (const t of T) for (const g of G) for (const p of P) {
    if (!agrees(t, g, p)) continue;
    let score = 0;
    for (const [k, v] of [['total', t], ['gallons', g], ['price', p]]) {
      score += (read(a, k) === v && read(b, k) === v) ? 2 : read(b, k) === v ? 1 : 0.5;
    }
    if (!best || score > best.score) best = { t, g, p, score };
  }
  if (best) {
    out.total = best.t; out.gallons = best.g; out.price = best.p;
    status = tenths(best.p) ? 'ok' : 'check';
  } else {
    const pick = (RANK[a.status] || 0) > (RANK[b.status] || 0) ? a : b;
    out.total = pick.fields.total; out.gallons = pick.fields.gallons; out.price = pick.fields.price;
    status = pick.status;
  }

  const plausible = o => o != null && (!prevOdo || (o > prevOdo && o <= prevOdo + 3000));
  const oa = a.fields.odometer, ob = b.fields.odometer;
  out.odometer = oa === ob ? ob : plausible(ob) ? ob : plausible(oa) ? oa : (ob ?? oa);
  out.trip = b.fields.trip ?? a.fields.trip;
  out.grade = b.fields.grade ?? a.fields.grade;
  return { kind: b.kind !== 'other' ? b.kind : a.kind, fields: out, status };
}

/* ---------------------------------------------------------------- backup --- */
async function backupGet(req, env, id) {
  await ensureTables(env);
  const row = await env.DB.prepare('SELECT rev, saved_at, data FROM backups WHERE id = ?').bind(id).first();
  if (!row) return json(req, { error: 'No backup with that code.' }, 404);
  return json(req, { rev: row.rev, savedAt: row.saved_at, data: JSON.parse(row.data) });
}

async function backupPut(req, env, id) {
  const text = await req.text();
  if (text.length > MAX_BACKUP_CHARS) return json(req, { error: 'Backup too big.' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json(req, { error: 'bad request' }, 400); }
  if (!body || typeof body.data !== 'object' || body.data === null) return json(req, { error: 'bad request' }, 400);
  await ensureTables(env);

  const baseRev = Number(body.baseRev) || 0;
  const data = JSON.stringify(body.data);
  const now = Date.now();
  const res = baseRev === 0
    ? await env.DB.prepare('INSERT INTO backups (id, rev, saved_at, data) VALUES (?, 1, ?, ?) ON CONFLICT(id) DO NOTHING').bind(id, now, data).run()
    : await env.DB.prepare('UPDATE backups SET prev = data, data = ?, rev = rev + 1, saved_at = ? WHERE id = ? AND rev = ?').bind(data, now, id, baseRev).run();
  if (!res.meta || !res.meta.changes) {
    /* Another phone wrote first. Hand back its copy so this one can merge and retry. */
    const row = await env.DB.prepare('SELECT rev, saved_at, data FROM backups WHERE id = ?').bind(id).first();
    return json(req, { error: 'conflict', rev: row ? row.rev : 0, savedAt: row ? row.saved_at : 0, data: row ? JSON.parse(row.data) : null }, 409);
  }
  return json(req, { ok: true, rev: baseRev + 1, savedAt: now });
}

async function backupDelete(req, env, id) {
  await ensureTables(env);
  await env.DB.prepare('DELETE FROM backups WHERE id = ?').bind(id).run();
  return json(req, { ok: true });
}
