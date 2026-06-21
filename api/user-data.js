const getAuthenticatedUser = require('./_auth');
const supabaseAdmin        = require('./_supabase');

const FIELDS = ['movies', 'watchlist', 'maybe', 'meh', 'banned', 'standards', 'watch_log', 'total_cost', 'ai_enabled', 'spend_month', 'spend_cap', 'rec_movies', 'rec_tv'];

const DEFAULTS = {
  movies:      [],
  watchlist:   [],
  maybe:       [],
  meh:         [],
  banned:      [],
  standards:   [],
  watch_log:   [],
  total_cost:  0,
  ai_enabled:  true,
  spend_month: 0,
  spend_cap:   3.00,
  rec_movies:  true,
  rec_tv:      true,
};

module.exports = async function handler(req, res) {
  // --- GET: return user's collection data ---
  if (req.method === 'GET') {
    let user;
    try {
      user = await getAuthenticatedUser(req);
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabaseAdmin
      .from('user_data')
      .select('movies, watchlist, maybe, meh, banned, standards, watch_log, total_cost, ai_enabled, spend_month, spend_cap, rec_movies, rec_tv')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[user-data GET]', error);
      return res.status(500).json({ error: 'Server error' });
    }

    return res.json(data || DEFAULTS);
  }

  // --- PUT: save/update user's collection data ---
  if (req.method === 'PUT') {
    let user;
    try {
      user = await getAuthenticatedUser(req);
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body || {};

    // Build upsert row from allowed fields only
    const row = { user_id: user.id, updated_at: new Date().toISOString() };
    FIELDS.forEach(function (field) {
      if (field in body) row[field] = body[field];
    });

    const { error } = await supabaseAdmin
      .from('user_data')
      .upsert(row, { onConflict: 'user_id' });

    if (error) {
      console.error('[user-data PUT]', error);
      return res.status(500).json({ error: 'Server error' });
    }

    return res.json({ ok: true });
  }

  // --- PATCH: update a single preference field (e.g. ai_enabled) ---
  if (req.method === 'PATCH') {
    let user;
    try {
      user = await getAuthenticatedUser(req);
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const PATCHABLE = ['ai_enabled'];
    const body = req.body || {};
    const row = { updated_at: new Date().toISOString() };
    PATCHABLE.forEach(function (field) {
      if (field in body) row[field] = body[field];
    });
    if (Object.keys(row).length === 1) return res.status(400).json({ error: 'no_fields' });

    const { error } = await supabaseAdmin
      .from('user_data')
      .update(row)
      .eq('user_id', user.id);

    if (error) {
      console.error('[user-data PATCH]', error);
      return res.status(500).json({ error: 'Server error' });
    }

    return res.json({ ok: true });
  }

  res.status(405).end();
};
