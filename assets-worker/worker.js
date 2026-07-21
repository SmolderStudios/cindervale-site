/* SLOTROOM asset board — shared checklist status.
   A tiny Cloudflare Worker over a D1 table so every viewer sees the same
   Not-started / Working / Delivered state instead of per-browser localStorage.
   Strongly consistent (single-region D1), so a click shows up for everyone
   on their next poll. Public + open by design — it's a 2-person work board;
   the worst anyone can do is flip a checkbox on a dev asset list. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // GET /status -> { file: status, ... }  (only non-default entries)
    if (url.pathname === '/status' && req.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT file, status FROM status').all();
      const map = {};
      for (const r of results || []) map[r.file] = r.status;
      return json(map);
    }

    // POST /status  { file, status }  -> upsert one item
    if (url.pathname === '/status' && req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
      const file = String(body.file || '');
      const status = Math.max(0, Math.min(2, parseInt(body.status, 10) || 0));
      if (!/^[a-z0-9_]{1,64}$/i.test(file)) return json({ error: 'bad file' }, 400);
      await env.DB.prepare(
        `INSERT INTO status (file, status, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(file) DO UPDATE SET status = ?2, updated_at = ?3`
      ).bind(file, status, Date.now()).run();
      return json({ ok: true, file, status });
    }

    // POST /reset -> clear everything (used by the "reset" button)
    if (url.pathname === '/reset' && req.method === 'POST') {
      await env.DB.prepare('DELETE FROM status').run();
      return json({ ok: true, cleared: true });
    }

    return json({ error: 'not found' }, 404);
  },
};
