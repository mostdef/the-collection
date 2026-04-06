const fs   = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'snapshots');

let getAuthenticatedUser;
try { getAuthenticatedUser = require('./_auth'); } catch {}

let supabase;
try { supabase = require('./_supabase'); } catch {}

module.exports = async function handler(req, res) {
  // ── Supabase path (when auth + supabase are available and user is real) ─────
  if (getAuthenticatedUser && supabase) {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // 'local' is a stub returned when env vars are absent — fall through to filesystem
    if (user.id === 'local') return handleFilesystem(req, res);

    if (req.method === 'POST') {
      const snap = req.body;
      const ts = snap.ts || Date.now();
      if (isDuplicatePost(ts)) return res.json({ ok: true, duplicate: true });
      const { error } = await supabase
        .from('snapshots')
        .insert({ user_id: user.id, ts, label: snap.label, data: snap });
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

  handleFilesystem(req, res);
};

// ── Filesystem fallback (local dev without Supabase auth) ─────────────────────

// Dedup cache: prevent duplicate POSTs keyed by ts (in-memory, best-effort)
const _recentTs = new Set();
function isDuplicatePost(ts) {
  if (_recentTs.has(ts)) return true;
  _recentTs.add(ts);
  setTimeout(() => _recentTs.delete(ts), 2000);
  return false;
}

// Filesystem-based time-window lock: rejects any POST within 1s of the last one.
// Survives module re-instantiation because the lock lives on disk.
const LOCK_FILE = path.join(DIR, '.last-save');
function isRecentSave() {
  try {
    return Date.now() - parseInt(fs.readFileSync(LOCK_FILE, 'utf8')) < 1000;
  } catch { return false; }
}
function markSaved() {
  try { fs.writeFileSync(LOCK_FILE, String(Date.now())); } catch {}
}

function handleFilesystem(req, res) {
  if (req.method === 'POST') {
    const snap = req.body;
    const ts   = snap.ts || Date.now();
    const file = path.join(DIR, `${ts}.json`);
    if (isDuplicatePost(ts) || fs.existsSync(file) || isRecentSave()) {
      return res.json({ ok: true, duplicate: true });
    }
    markSaved();
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
}
