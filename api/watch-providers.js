require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/';

const PROVIDER_HOMEPAGES = {
  // Global streaming
  8:    'https://www.netflix.com',
  337:  'https://www.disneyplus.com',
  9:    'https://www.primevideo.com',
  350:  'https://tv.apple.com',
  15:   'https://www.hulu.com',
  384:  'https://www.max.com',
  531:  'https://www.paramountplus.com',
  386:  'https://www.peacocktv.com',
  283:  'https://www.crunchyroll.com',
  190:  'https://mubi.com',
  257:  'https://mubi.com',
  123:  'https://www.fubo.tv',
  300:  'https://www.sho.com',
  // Global rent/buy
  2:    'https://tv.apple.com',
  3:    'https://play.google.com/store/movies',
  10:   'https://www.amazon.com/video',
  37:   'https://www.vudu.com',
  192:  'https://www.youtube.com/movies',
  // Polish streaming
  505:  'https://player.pl',
  1899: 'https://www.hbomax.com/pl/pl',
  1773: 'https://www.skyshowtime.com',
  // Polish rent/buy
  35:   'https://www.rakuten.tv',
  40:   'https://www.chili.com',
  2102: 'https://premierycanalplus.pl',
  2669: 'https://pilot.wp.pl',
};

const JW_QUERY = `
query Search($country: Country!, $language: Language!, $query: String!) {
  popularTitles(country: $country, language: $language, first: 10, filter: { searchQuery: $query, objectTypes: [MOVIE] }) {
    edges {
      node {
        id
        objectType
        ... on Movie {
          content(country: $country, language: $language) {
            title
            originalReleaseYear
            externalIds { tmdbId }
          }
          offers(country: $country, platform: WEB) {
            monetizationType
            standardWebURL
            package { packageId }
          }
        }
      }
    }
  }
}`;

async function fetchJustWatchUrls(title, year, tmdbId, country) {
  // JustWatch uses ISO 3166-1 alpha-2 for country, same as TMDB
  const language = 'en';
  try {
    const res = await fetch('https://apis.justwatch.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ query: JW_QUERY, variables: { country, language, query: title } }),
    });
    if (!res.ok) return {};
    const { data } = await res.json();
    const edges = data?.popularTitles?.edges || [];

    // Find by TMDB ID first, fall back to title+year match
    let match = edges.find(e => e.node?.content?.externalIds?.tmdbId === String(tmdbId));
    if (!match && year) {
      match = edges.find(e =>
        e.node?.content?.originalReleaseYear === year &&
        e.node?.content?.title?.toLowerCase().includes(title.toLowerCase().split(':')[0].trim())
      );
    }
    if (!match) return {};

    // Build map: "packageId:monetizationType" -> URL (packageId === TMDB provider_id)
    const urlMap = {};
    for (const offer of (match.node.offers || [])) {
      const key = `${offer.package.packageId}:${offer.monetizationType}`;
      if (!urlMap[key]) urlMap[key] = offer.standardWebURL;
    }
    return urlMap;
  } catch {
    return {};
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  let getAuthenticatedUser;
  try { getAuthenticatedUser = require('./_auth'); } catch {}
  if (getAuthenticatedUser) {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const { tmdb_id, country: countryParam } = req.query;
  if (!tmdb_id) return res.status(400).json({ error: 'tmdb_id is required' });

  const country = countryParam || 'US';
  const headers = { Authorization: `Bearer ${process.env.TMDB_TOKEN}` };

  let providersData, movieData;
  try {
    [providersData, movieData] = await Promise.all([
      fetch(`${TMDB_BASE}/movie/${tmdb_id}/watch/providers`, { headers }).then(r => r.json()),
      fetch(`${TMDB_BASE}/movie/${tmdb_id}?language=en-US`, { headers }).then(r => r.json()),
    ]);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch watch providers' });
  }

  const results = providersData.results || {};

  // Determine which country data to use, with US fallback
  let countryData = results[country];
  let fallback = false;
  if (!countryData && country !== 'US') {
    countryData = results['US'];
    fallback = !!countryData;
  }

  if (!countryData) {
    return res.json({ country, flatrate: [], rent: [], buy: [], fallback: false });
  }

  // Fetch JustWatch deep links; use the country we're actually showing data for
  const jwCountry = fallback ? 'US' : country;
  const jwTitle   = movieData.title || movieData.original_title || '';
  const jwYear    = movieData.release_date ? parseInt(movieData.release_date) : null;
  const jwUrls    = await fetchJustWatchUrls(jwTitle, jwYear, tmdb_id, jwCountry);

  // JustWatch packageId === TMDB provider_id — build direct map
  const providerUrls = {}; // { [provider_id]: { FLATRATE?, RENT?, BUY? } }
  for (const [key, url] of Object.entries(jwUrls)) {
    const [packageId, monetizationType] = key.split(':');
    const id = parseInt(packageId);
    if (!providerUrls[id]) providerUrls[id] = {};
    providerUrls[id][monetizationType] = url;
  }

  const mapProviders = (arr, monetizationType) =>
    (arr || []).map(p => {
      const jwForProvider = providerUrls[p.provider_id];
      const homepage =
        (jwForProvider && (jwForProvider[monetizationType] || Object.values(jwForProvider)[0])) ||
        PROVIDER_HOMEPAGES[p.provider_id] ||
        '#';
      return {
        id:       p.provider_id,
        name:     p.provider_name,
        logo:     `/api/image-proxy?url=${encodeURIComponent(`${TMDB_IMG}w154${p.logo_path}`)}`,
        homepage,
      };
    });

  res.json({
    country,
    flatrate: mapProviders(countryData.flatrate, 'FLATRATE'),
    rent:     mapProviders(countryData.rent,     'RENT'),
    buy:      mapProviders(countryData.buy,      'BUY'),
    fallback,
  });
};
