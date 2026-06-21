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

  let tmdbId = parseInt(req.query.tmdb_id, 10);
  const seasonNumber = parseInt(req.query.season_number, 10);
  const title = (req.query.title || '').trim();
  const year = req.query.year || '';

  const headers = { Authorization: `Bearer ${process.env.TMDB_TOKEN}` };

  try {
    if (!tmdbId) {
      if (!title) return res.status(400).json({ error: 'tmdb_id is required' });
      const searchRes = await fetch(
        `${TMDB_BASE}/search/tv?query=${encodeURIComponent(title)}&first_air_date_year=${encodeURIComponent(year)}&language=en-US`,
        { headers }
      );
      const search = await searchRes.json();
      tmdbId = search.results?.[0]?.id || null;
      if (!tmdbId && year) {
        const retryRes = await fetch(
          `${TMDB_BASE}/search/tv?query=${encodeURIComponent(title)}&language=en-US`,
          { headers }
        );
        const retry = await retryRes.json();
        tmdbId = retry.results?.[0]?.id || null;
      }
      if (!tmdbId) return res.status(404).json({ error: 'not_found' });
    }

    if (Number.isFinite(seasonNumber) && seasonNumber > 0) {
      const seasonRes = await fetch(
        `${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}?language=en-US`,
        { headers }
      );
      if (!seasonRes.ok) return res.status(seasonRes.status).json({ error: 'season_lookup_failed' });
      const season = await seasonRes.json();
      return res.json({
        season_number: season.season_number,
        name: season.name || null,
        air_date: season.air_date || null,
        poster: season.poster_path ? `${TMDB_IMG}w500${season.poster_path}` : null,
        episodes: (season.episodes || []).map((episode) => ({
          episode_number: episode.episode_number,
          name: episode.name,
          air_date: episode.air_date || null,
        })),
      });
    }

    const [detailsRes, creditsRes, externalIdsRes] = await Promise.all([
      fetch(`${TMDB_BASE}/tv/${tmdbId}?language=en-US`, { headers }),
      fetch(`${TMDB_BASE}/tv/${tmdbId}/credits?language=en-US`, { headers }),
      fetch(`${TMDB_BASE}/tv/${tmdbId}/external_ids`, { headers }),
    ]);
    if (!detailsRes.ok) return res.status(detailsRes.status).json({ error: 'series_lookup_failed' });

    const details = await detailsRes.json();
    const credits = creditsRes.ok ? await creditsRes.json() : {};
    const externalIds = externalIdsRes.ok ? await externalIdsRes.json() : {};

    const creators = (details.created_by || []).map((person) => ({
      name: person.name,
      tmdb_id: person.id,
      wiki: `https://en.wikipedia.org/wiki/${encodeURIComponent((person.name || '').replace(/ /g, '_'))}`,
    }));

    const topCast = (credits.cast || []).slice(0, 8);
    const peopleIds = [
      ...creators.map((person) => person.tmdb_id),
      ...topCast.map((person) => person.id),
    ];

    const wikidataIds = await Promise.all(peopleIds.map((personId) => fetchWikidataId(personId, headers)));
    const wikidataToWikiTitle = await fetchWikipediaTitles(wikidataIds.filter(Boolean));

    const wikiUrl = (wikidataId, fallbackName) => {
      const wikiTitle = wikidataId ? wikidataToWikiTitle[wikidataId] : null;
      const target = wikiTitle || fallbackName;
      if (!target) return null;
      return `https://en.wikipedia.org/wiki/${encodeURIComponent(target.replace(/ /g, '_'))}`;
    };

    const castOffset = creators.length;
    const cast = topCast.map((person, index) => ({
      name: person.name,
      character: person.character,
      photo: person.profile_path ? `${TMDB_IMG}w185${person.profile_path}` : null,
      wiki: wikiUrl(wikidataIds[castOffset + index], person.name),
    }));

    const creatorWithWiki = creators.map((person, index) => ({
      name: person.name,
      wiki: wikiUrl(wikidataIds[index], person.name),
    }));

    return res.json({
      tmdb_id: details.id,
      name: details.name,
      overview: details.overview || null,
      tagline: details.tagline || null,
      poster: details.poster_path ? `${TMDB_IMG}w500${details.poster_path}` : null,
      backdrop: details.backdrop_path ? `${TMDB_IMG}w780${details.backdrop_path}` : null,
      creator: creatorWithWiki.map((person) => person.name).join(', ') || null,
      creators: creatorWithWiki,
      creator_wiki: creatorWithWiki[0]?.wiki || null,
      networks: (details.networks || []).map((network) => network.name).filter(Boolean),
      status: details.status || null,
      genres: (details.genres || []).map((genre) => genre.name),
      number_of_seasons: details.number_of_seasons || null,
      number_of_episodes: details.number_of_episodes || null,
      first_air_date: details.first_air_date || null,
      last_air_date: details.last_air_date || null,
      release_date: details.first_air_date || null,
      next_episode_to_air: details.next_episode_to_air ? {
        air_date: details.next_episode_to_air.air_date || null,
        season_number: details.next_episode_to_air.season_number || null,
        episode_number: details.next_episode_to_air.episode_number || null,
        name: details.next_episode_to_air.name || null,
      } : null,
      seasons: (details.seasons || []).map((season) => ({
        season_number: season.season_number,
        name: season.name,
        air_date: season.air_date || null,
        episode_count: season.episode_count,
      })),
      imdb_id: externalIds.imdb_id || null,
      cast,
    });
  } catch (error) {
    console.error('tv-details error:', error);
    return res.status(500).json({ error: 'api_error' });
  }
};

async function fetchWikidataId(personId, headers) {
  try {
    const res = await fetch(`${TMDB_BASE}/person/${personId}/external_ids`, { headers });
    const data = await res.json();
    return data.wikidata_id || null;
  } catch {
    return null;
  }
}

async function fetchWikipediaTitles(validIds) {
  if (!validIds.length) return {};
  try {
    const res = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${validIds.join('|')}&props=sitelinks&sitefilter=enwiki&format=json`
    );
    const data = await res.json();
    const map = {};
    Object.entries(data.entities || {}).forEach(([qid, entity]) => {
      const title = entity.sitelinks?.enwiki?.title;
      if (title) map[qid] = title;
    });
    return map;
  } catch {
    return {};
  }
}
