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

  const { title, year } = req.query;
  if (!title) return res.status(400).end();

  const headers = { Authorization: `Bearer ${process.env.TMDB_TOKEN}` };

  // Search
  const searchRes = await fetch(
    `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}&year=${year || ''}&language=en-US`,
    { headers }
  );
  const search = await searchRes.json();
  const tmdbId = search.results?.[0]?.id;
  if (!tmdbId) return res.status(404).json({ error: 'not_found' });

  // Fetch details + credits in parallel
  const [detailsRes, creditsRes] = await Promise.all([
    fetch(`${TMDB_BASE}/movie/${tmdbId}?language=en-US`, { headers }),
    fetch(`${TMDB_BASE}/movie/${tmdbId}/credits`, { headers }),
  ]);
  const details = await detailsRes.json();
  const credits = await creditsRes.json();

  // Fetch OMDB ratings
  let imdbRating = null, rtScore = null;
  const imdbId = details.imdb_id;
  if (imdbId && process.env.OMDB_KEY) {
    try {
      const omdbRes = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_KEY}`);
      const omdb = await omdbRes.json();
      if (omdb.Response === 'True') {
        imdbRating = omdb.imdbRating !== 'N/A' ? omdb.imdbRating : null;
        const rt = omdb.Ratings?.find(r => r.Source === 'Rotten Tomatoes');
        rtScore = rt ? rt.Value : null;
      }
    } catch {}
  }

  // Top cast (up to 8) + director + key crew people IDs
  const crew = credits.crew || [];
  const pick = (jobs) => crew.find(p => jobs.includes(p.job)) || null;
  const directorPerson = pick(['Director']);
  const keyCrewPeople = [
    { role: 'Cinematography', person: pick(['Director of Photography', 'Cinematography']) },
    { role: 'Original Music', person: pick(['Original Music Composer', 'Music', 'Composer']) },
    { role: 'Screenplay',     person: pick(['Screenplay', 'Story', 'Writer']) },
    { role: 'Editor',         person: pick(['Editor', 'Film Editor']) },
    { role: 'Producer',       person: pick(['Producer']) },
  ].filter(c => c.person);

  const topCast = (credits.cast || []).slice(0, 8);

  // Fetch Wikidata IDs for all people in parallel
  const fetchWikidataId = async (personId) => {
    try {
      const r = await fetch(`${TMDB_BASE}/person/${personId}/external_ids`, { headers });
      const d = await r.json();
      return d.wikidata_id || null;
    } catch { return null; }
  };

  const allPeople = [
    ...topCast.map(p => p.id),
    ...(directorPerson ? [directorPerson.id] : []),
    ...keyCrewPeople.map(c => c.person.id),
  ];
  const wikidataIds = await Promise.all(allPeople.map(fetchWikidataId));

  // One batch call to Wikidata to resolve Qxxx → English Wikipedia article title
  const validIds = wikidataIds.filter(Boolean);
  let wikidataToWikiTitle = {};
  if (validIds.length) {
    try {
      const wdRes = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${validIds.join('|')}&props=sitelinks&sitefilter=enwiki&format=json`
      );
      const wdData = await wdRes.json();
      for (const [qid, entity] of Object.entries(wdData.entities || {})) {
        const title = entity.sitelinks?.enwiki?.title;
        if (title) wikidataToWikiTitle[qid] = title;
      }
    } catch {}
  }

  const wikiUrl = (wikidataId, name) => {
    const title = wikidataId && wikidataToWikiTitle[wikidataId];
    return title
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
      : `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, '_'))}`;
  };

  const cast = topCast.map((p, i) => ({
    name:       p.name,
    character:  p.character,
    photo:      p.profile_path ? `${TMDB_IMG}w185${p.profile_path}` : null,
    wiki:       wikiUrl(wikidataIds[i], p.name),
  }));

  const directorWikiOffset = topCast.length;
  const directorWiki = directorPerson
    ? wikiUrl(wikidataIds[directorWikiOffset], directorPerson.name)
    : null;

  const keyCrew = keyCrewPeople.map(({ role, person }, i) => ({
    role,
    name: person.name,
    wiki: wikiUrl(wikidataIds[topCast.length + (directorPerson ? 1 : 0) + i], person.name),
  }));

  res.json({
    tmdb_id:      tmdbId,
    overview:     details.overview || null,
    tagline:      details.tagline  || null,
    runtime:      details.runtime  || null,
    genres:       (details.genres || []).map(g => g.name),
    poster:       search.results[0].poster_path ? `${TMDB_IMG}w500${search.results[0].poster_path}` : null,
    imdb_id:      imdbId || null,
    imdb_rating:   imdbRating,
    rt_score:      rtScore,
    director:      directorPerson?.name || null,
    director_wiki: directorWiki,
    cast,
    keyCrew,
  });
};
