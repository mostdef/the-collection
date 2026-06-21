require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  let getAuthenticatedUser;
  try { getAuthenticatedUser = require('./_auth'); } catch {}
  if (getAuthenticatedUser) {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const headers = { Authorization: `Bearer ${process.env.TMDB_TOKEN}` };

  // ── Upcoming suggestions (for Anticipated empty state) ─────────────────
  if (req.query.type === 'upcoming') {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const collected = [];
      const seenKeys = new Set();
      let totalPages = 999; // updated after first fetch

      // Each client page maps to a non-overlapping window of 6 TMDB pages
      // client page 1 → TMDB 1-6, page 2 → TMDB 7-12, etc.
      const tmdbStart = (page - 1) * 6 + 1;
      let fetchPage = tmdbStart;
      // Fetch pages until we have 30 future films (client filters against user's lists)
      while (collected.length < 30 && fetchPage <= Math.min(totalPages, tmdbStart + 5)) {
        const upRes = await fetch(
          `${TMDB_BASE}/movie/upcoming?language=en-US&page=${fetchPage}`,
          { headers }
        );
        const upcoming = await upRes.json();
        totalPages = upcoming.total_pages || 1;
        for (const m of (upcoming.results || [])) {
          const key = `movie:${m.id}`;
          if (m.release_date && m.release_date > today && !seenKeys.has(key)) {
            seenKeys.add(key);
            collected.push({ media_type: 'movie', raw: m, release_date: m.release_date });
          }
        }
        fetchPage++;
      }

      const tvStart = (page - 1) * 3 + 1;
      for (let tvPage = tvStart; tvPage < tvStart + 3; tvPage++) {
        const tvRes = await fetch(`${TMDB_BASE}/tv/on_the_air?language=en-US&page=${tvPage}`, { headers });
        const tvData = await tvRes.json();
        for (const series of (tvData.results || [])) {
          const key = `tv:${series.id}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          collected.push({ media_type: 'tv', raw: series, release_date: series.first_air_date || null });
        }
      }

      const detailed = await Promise.all(collected.slice(0, 45).map(async (entry) => {
        if (entry.media_type === 'movie') {
          const m = entry.raw;
          let director = null;
          try {
            const detRes = await fetch(`${TMDB_BASE}/movie/${m.id}?append_to_response=credits&language=en-US`, { headers });
            const det = await detRes.json();
            director = det.credits?.crew?.find(c => c.job === 'Director')?.name || null;
          } catch {}
          return {
            title: m.title,
            year: m.release_date ? parseInt(m.release_date) : null,
            poster: m.poster_path ? `${TMDB_IMG}w200${m.poster_path}` : null,
            tmdb_id: m.id,
            release_date: m.release_date,
            director,
            media_type: 'movie',
            upcoming_label: null,
          };
        }

        const series = entry.raw;
        try {
          const detRes = await fetch(`${TMDB_BASE}/tv/${series.id}?language=en-US`, { headers });
          const det = await detRes.json();
          const next = det.next_episode_to_air;
          if (!next?.air_date || next.air_date <= today) return null;
          return {
            title: det.name,
            year: det.first_air_date ? parseInt(det.first_air_date) : null,
            poster: det.poster_path ? `${TMDB_IMG}w200${det.poster_path}` : null,
            tmdb_id: det.id,
            release_date: next.air_date,
            director: (det.created_by || []).map((person) => person.name).join(', ') || null,
            media_type: 'tv',
            upcoming_label: next.season_number ? `Season ${next.season_number}` : 'Upcoming episode',
          };
        } catch {
          return null;
        }
      }));

      const results = detailed
        .filter(Boolean)
        .sort((a, b) => String(a.release_date || '').localeCompare(String(b.release_date || '')))
        .slice(0, 30);

      if (!results.length) {
        return res.json({ results: [], page, total_pages: 1 });
      }

      // Convert TMDB total_pages to client pages (each client page covers 6 TMDB pages)
      const clientTotalPages = Math.ceil(totalPages / 6);
      return res.json({ results, page, total_pages: clientTotalPages });
    } catch (e) {
      console.error('upcoming error:', e);
      return res.status(500).json({ error: 'api_error' });
    }
  }

  // ── Movie search ────────────────────────────────────────────────────────
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.status(400).end();

  if (req.query.scope === 'all') {
    const searchRes = await fetch(
      `${TMDB_BASE}/search/multi?query=${encodeURIComponent(q)}&language=en-US&page=1&include_adult=false`,
      { headers }
    );
    const search = await searchRes.json();
    const hits = (search.results || [])
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .slice(0, 10);

    return res.json(hits.map((item) => ({
      title: item.media_type === 'tv' ? item.name : item.title,
      year: item.media_type === 'tv'
        ? (item.first_air_date ? parseInt(item.first_air_date) : null)
        : (item.release_date ? parseInt(item.release_date) : null),
      release_date: item.media_type === 'tv'
        ? (item.first_air_date || null)
        : (item.release_date || null),
      poster: item.poster_path ? `${TMDB_IMG}w200${item.poster_path}` : null,
      tmdb_id: item.id,
      tmdb_rating: item.vote_count > 10 ? parseFloat(item.vote_average.toFixed(1)) : null,
      imdb_rating: null,
      rt_score: null,
      media_type: item.media_type,
      upcoming_label: null,
    })));
  }

  const searchRes = await fetch(
    `${TMDB_BASE}/search/movie?query=${encodeURIComponent(q)}&language=en-US&page=1`,
    { headers }
  );
  const search = await searchRes.json();
  const hits = (search.results || []).slice(0, 8);

  // Fetch OMDB ratings in parallel for top 5 (requires imdb_id from TMDB details)
  const withRatings = await Promise.all(
    hits.map(async (m, i) => {
      const base = {
        title:        m.title,
        year:         m.release_date ? parseInt(m.release_date) : null,
        release_date: m.release_date || null,
        poster:       m.poster_path ? `${TMDB_IMG}w200${m.poster_path}` : null,
        tmdb_id:      m.id,
        tmdb_rating:  m.vote_count > 10 ? parseFloat(m.vote_average.toFixed(1)) : null,
        imdb_rating:  null,
        rt_score:     null,
        media_type:   'movie',
        upcoming_label: null,
      };

      // Only fetch OMDB for first 5 to keep latency low
      if (i >= 5 || !process.env.OMDB_KEY) return base;

      try {
        const detRes = await fetch(`${TMDB_BASE}/movie/${m.id}?language=en-US`, { headers });
        const det    = await detRes.json();
        const imdbId = det.imdb_id;
        if (!imdbId) return base;

        const omdbRes = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_KEY}`);
        const omdb    = await omdbRes.json();
        if (omdb.Response === 'True') {
          const rt = omdb.Ratings?.find(r => r.Source === 'Rotten Tomatoes');
          base.imdb_rating = omdb.imdbRating !== 'N/A' ? omdb.imdbRating : null;
          base.rt_score    = rt ? rt.Value : null;
        }
      } catch {}

      return base;
    })
  );

  res.json(withRatings);
};
