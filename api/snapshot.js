const fs   = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'snapshots');

let getAuthenticatedUser;
try { getAuthenticatedUser = require('./_auth'); } catch {}

let supabase;
try { supabase = require('./_supabase'); } catch {}

module.exports = async function handler(req, res) {
  // ── Supabase path (when auth + supabase are available) ───────────────────────
  if (getAuthenticatedUser && supabase) {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'POST') {
      const snap = req.body;
      const { error } = await supabase
        .from('snapshots')
        .insert({ user_id: user.id, ts: snap.ts || Date.now(), label: snap.label, data: snap });
      if (error) {
        console.error('snapshot insert error:', error);
        return res.status(500).json({ error: 'db_error', detail: error.message, code: error.code });
      }
      return res.json({ ok: true });
    }

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('snapshots')
        .select('data')
        .eq('user_id', user.id)
        .order('ts', { ascending: false })
        .limit(50);
      if (error) {
        console.error('snapshot select error:', error);
        return res.status(500).json({ error: 'db_error', detail: error.message, code: error.code });
      }
      return res.json((data || []).map(row => row.data));
    }

    return res.status(405).end();
  }

  // ── Filesystem fallback (local dev / transition period) ───────────────────────
  if (req.method === 'POST') {
    const snap = req.body;
    const ts   = snap.ts || Date.now();
    const file = path.join(DIR, `${ts}.json`);
    fs.writeFileSync(file, JSON.stringify(snap, null, 2));
    return res.json({ ok: true, file: path.basename(file) });
  }

  if (req.method === 'GET') {
    const files = fs.readdirSync(DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();
    const snapshots = files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); }
      catch(e) { return null; }
    }).filter(Boolean);
    return res.json(snapshots);
  }

  res.status(405).end();
};
