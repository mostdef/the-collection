require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const Anthropic = require('@anthropic-ai/sdk');

function loadTasteProfile() {
  try {
    const p = require('path').join(__dirname, '..', 'taste-profile.json');
    const profile = JSON.parse(require('fs').readFileSync(p, 'utf8'));
    const vs = profile.viewing_signals;
    let viewingSignals = null;
    if (vs && vs.session_count > 0) {
      const parts = [vs.summary];
      if (vs.liked_patterns?.length) parts.push(`Praised: ${vs.liked_patterns.join('; ')}`);
      if (vs.disliked_patterns?.length) parts.push(`Friction: ${vs.disliked_patterns.join('; ')}`);
      if (vs.engagement_style?.length) parts.push(`Engagement: ${vs.engagement_style.join('; ')}`);
      viewingSignals = parts.join('\n');
    }
    return { promptSection: profile.prompt_section || null, viewingSignals };
  } catch {
    return {};
  }
}

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/';

const tool = {
  name: 'recommend_titles',
  description: 'Recommend exactly 5 distinct titles that fit the collection. Return them ranked best-to-worst fit.',
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        minItems: 5,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Title name' },
            year: { type: 'integer', description: 'Release year or first-air year' },
            director: { type: 'string', description: 'Director for films or creator for TV' },
            media_type: { type: 'string', enum: ['movie', 'tv'], description: 'movie for films/documentaries, tv for TV series' },
            type_label: { type: 'string', description: 'Visible type tag: Movie, Documentary, or TV Series' },
            reason: { type: 'string', description: 'Why this fits the collection (1–2 sentences, references specific titles already in the list)' },
          },
          required: ['title', 'year', 'director', 'media_type', 'type_label', 'reason'],
        },
      },
    },
    required: ['candidates'],
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let getAuthenticatedUser;
  try { getAuthenticatedUser = require('./_auth'); } catch {}
  let user = null;
  if (getAuthenticatedUser) {
    user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }
  const gate = await require('./_ai-gate')(user);
  if (gate) return res.status(402).json(gate);

  const {
    movies = [],
    excluded = [],
    standards = [],
    banned = [],
    model = 'sonnet',
    recMovies = true,
    recTv = true,
  } = req.body || {};
  const modelId = model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6';

  if (!recMovies && !recTv) {
    return res.status(400).json({ error: 'no_media_types_enabled' });
  }

  const collectionList = movies.length
    ? movies.map((m, i) => `${i + 1}. "${m.title}" (${m.year || 'unknown'}, ${entryRoleLabel(m)} ${m.director || 'unknown'}) [${visibleTypeLabel(m)}]`).join('\n')
    : 'empty — recommend a widely acclaimed title';

  const standardsList = standards.length
    ? standards.map((m) => `"${m.title}" (${m.year || 'unknown'}, ${entryRoleLabel(m)} ${m.director || 'unknown'}) [${visibleTypeLabel(m)}]`).join(', ')
    : null;

  const excludedSet = new Set(excluded.map(normalizeCandidateKey));

  const directorCounts = {};
  movies.forEach((m) => {
    if (!m.director) return;
    m.director.split(/[,;]/).map((name) => name.trim()).filter(Boolean).forEach((name) => {
      directorCounts[name] = (directorCounts[name] || 0) + 1;
    });
  });
  const saturatedDirectors = Object.entries(directorCounts)
    .filter(([, count]) => count >= 3)
    .map(([name]) => name);

  const { promptSection, viewingSignals } = loadTasteProfile();

  const enabledTypes = [];
  if (recMovies) enabledTypes.push('movies and documentaries');
  if (recTv) enabledTypes.push('TV series');
  const allowedMediaInstruction = recMovies && recTv
    ? 'You may recommend feature films, documentaries, or TV series.'
    : recMovies
      ? 'You may recommend feature films or documentaries. Never recommend TV series.'
      : 'You may recommend TV series only. Never recommend films or documentaries.';

  const buildPrompt = (extraInstruction = '') => [
    `You are a film-and-television recommendation engine. Analyze this curated collection and recommend exactly 5 distinct titles the curator is missing.`,
    `Allowed recommendation types: ${enabledTypes.join(' + ')}. ${allowedMediaInstruction}`,
    standardsList ? `\n## REFERENCE TITLES\nThese define the curator's taste most precisely. Weight these heavily above all else:\n${standardsList}` : '',
    promptSection ? `\n## TASTE PROFILE\n${promptSection}` : '',
    viewingSignals ? `\n## VIEWING SIGNALS\n${viewingSignals}` : '',
    `\n## COLLECTION\nListed in curator's personal order — earlier titles carry more weight and reflect current taste more strongly:\n${collectionList}`,
    excluded.length ? `\n## EXCLUSION LIST\nDo NOT recommend any of these titles:\n${excluded.map((t) => `• ${t}`).join('\n')}` : '',
    saturatedDirectors.length ? `\n## SATURATED DIRECTORS / CREATORS\nAlready heavily represented (3+ titles each) — avoid recommending another work by them unless truly exceptional:\n${saturatedDirectors.join(', ')}` : '',
    banned.length ? `\n## REJECTED TITLES\nThe curator has explicitly rejected these. Do not recommend them, and avoid recommending very similar work:\n${banned.map((m) => `• "${m.title}" (${m.year || 'unknown'}, ${entryRoleLabel(m)} ${m.director || 'unknown'}) [${visibleTypeLabel(m)}]`).join('\n')}` : '',
    '\n## GUIDELINES\nThink laterally — shared cinematographers, writers, networks, eras, national cinemas, adjacent genres, and thematic echoes. Write reasons that reference specific titles already in the collection.',
    '\nReturn `type_label` as exactly one of: `Movie`, `Documentary`, or `TV Series`.',
    extraInstruction ? `\n## ADDITIONAL INSTRUCTION\n${extraInstruction}` : '',
  ].filter(Boolean).join('\n');

  const PRICE = {
    'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
    'claude-opus-4-6': { input: 15.0, output: 75.0 },
  };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let rec = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let round = 0; round < 2 && !rec; round++) {
    const temperature = round === 0 ? 0.8 : 0.95;
    const extraInstruction = round === 1
      ? 'Your previous candidates were unusable. Think more creatively across eras, countries, and formats while still fitting the collection.'
      : '';

    let message;
    try {
      message = await client.messages.create({
        model: modelId,
        max_tokens: 1024,
        temperature,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'recommend_titles' },
        messages: [{ role: 'user', content: buildPrompt(extraInstruction) }],
      });
    } catch (e) {
      console.error('Anthropic error:', e?.status, JSON.stringify(e?.error));
      const msg = e?.error?.error?.message || '';
      const isOutOfCredits = e?.status === 400 && msg.includes('credit balance is too low');
      return res.status(isOutOfCredits ? 402 : 500).json({ error: isOutOfCredits ? 'out_of_credits' : 'api_error', detail: msg });
    }

    totalInputTokens += message.usage?.input_tokens || 0;
    totalOutputTokens += message.usage?.output_tokens || 0;

    const toolBlock = message.content.find((b) => b.type === 'tool_use');
    const candidates = toolBlock?.input?.candidates || [];

    for (const candidate of candidates) {
      const mediaType = normalizeMediaType(candidate.media_type);
      const candidateKey = makeCandidateKey(candidate.title, mediaType);
      const isExcluded = excludedSet.has(candidateKey);
      const isPlaceholder = !candidate.reason || candidate.reason.toLowerCase().startsWith('placeholder');
      const isTypeDisabled = (mediaType === 'tv' && !recTv) || (mediaType === 'movie' && !recMovies);
      if (!isExcluded && !isPlaceholder && !isTypeDisabled) {
        rec = { ...candidate, media_type: mediaType };
        break;
      }
    }
  }

  const pricing = PRICE[modelId] || PRICE['claude-sonnet-4-6'];
  const apiCost = (totalInputTokens * pricing.input + totalOutputTokens * pricing.output) / 1_000_000;

  if (!rec) return res.status(422).json({ error: 'invalid_rec' });

  const tmdbHeaders = { Authorization: `Bearer ${process.env.TMDB_TOKEN}` };
  const mediaType = normalizeMediaType(rec.media_type);
  const searchPath = mediaType === 'tv' ? 'tv' : 'movie';
  const titleField = mediaType === 'tv' ? 'name' : 'title';
  const yearParam = mediaType === 'tv' ? 'first_air_date_year' : 'year';

  let searchRes = await fetch(
    `${TMDB_BASE}/search/${searchPath}?query=${encodeURIComponent(rec.title)}&${yearParam}=${rec.year || ''}&language=en-US`,
    { headers: tmdbHeaders }
  );
  let search = await searchRes.json();
  if (!search.results?.length) {
    searchRes = await fetch(
      `${TMDB_BASE}/search/${searchPath}?query=${encodeURIComponent(rec.title)}&language=en-US`,
      { headers: tmdbHeaders }
    );
    search = await searchRes.json();
  }
  const tmdbItem = search.results?.[0];
  const tmdbId = tmdbItem?.id;

  const [detailsRes, imagesRes, creditsRes] = await Promise.all([
    tmdbId ? fetch(`${TMDB_BASE}/${searchPath}/${tmdbId}?language=en-US`, { headers: tmdbHeaders }) : null,
    tmdbId ? fetch(`${TMDB_BASE}/${searchPath}/${tmdbId}/images?include_image_language=null`, { headers: tmdbHeaders }) : null,
    tmdbId ? fetch(`${TMDB_BASE}/${searchPath}/${tmdbId}/credits`, { headers: tmdbHeaders }) : null,
  ]);
  const details = detailsRes ? await detailsRes.json() : {};
  const images = imagesRes ? await imagesRes.json() : {};
  const credits = creditsRes ? await creditsRes.json() : {};

  const writers = mediaType === 'tv'
    ? (details.created_by || []).map((person) => person.name).slice(0, 2)
    : (credits.crew || [])
        .filter((person) => person.job === 'Screenplay' || person.job === 'Story' || person.job === 'Writer')
        .map((person) => person.name)
        .slice(0, 2);

  const imdbId = details.imdb_id || null;

  let imdbRating = null;
  let rtScore = null;
  if (imdbId && process.env.OMDB_KEY) {
    const omdbRes = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_KEY}`);
    const omdb = await omdbRes.json();
    if (omdb.Response === 'True') {
      imdbRating = omdb.imdbRating !== 'N/A' ? omdb.imdbRating : null;
      const rt = omdb.Ratings?.find((rating) => rating.Source === 'Rotten Tomatoes');
      rtScore = rt ? rt.Value : null;
    }
  }

  const poster = tmdbItem?.poster_path ? `${TMDB_IMG}w500${tmdbItem.poster_path}` : null;
  const stills = (images.backdrops || [])
    .filter((backdrop) => backdrop.iso_639_1 === null)
    .sort((a, b) => b.vote_average - a.vote_average)
    .slice(0, 5)
    .map((backdrop) => backdrop.file_path);

  const resolvedDirector = mediaType === 'tv'
    ? ((details.created_by || []).map((person) => person.name).join(', ') || rec.director || null)
    : ((credits.crew || []).find((person) => person.job === 'Director')?.name || rec.director || null);

  res.json({
    ...rec,
    title: tmdbItem?.[titleField] || rec.title,
    year: rec.year || extractYear(details.first_air_date || details.release_date),
    director: resolvedDirector,
    poster,
    stills,
    imdb_id: imdbId,
    imdb_rating: imdbRating,
    rt_score: rtScore,
    writers,
    tmdb_id: tmdbId || null,
    release_date: mediaType === 'tv' ? (details.first_air_date || null) : (details.release_date || null),
    api_cost: apiCost,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
  });
};

function normalizeMediaType(mediaType) {
  return mediaType === 'tv' ? 'tv' : 'movie';
}

function visibleTypeLabel(entry) {
  return normalizeMediaType(entry.media_type) === 'tv' ? 'TV Series' : 'Movie';
}

function entryRoleLabel(entry) {
  return normalizeMediaType(entry.media_type) === 'tv' ? 'creator' : 'dir.';
}

function makeCandidateKey(title, mediaType) {
  return `${normalizeMediaType(mediaType)}:${normalize(title)}`;
}

function normalizeCandidateKey(value) {
  if (!value) return '';
  const [prefix, rest] = String(value).includes(':') ? String(value).split(/:(.+)/) : ['movie', String(value)];
  return makeCandidateKey(rest, prefix);
}

function extractYear(dateString) {
  return dateString ? parseInt(dateString.slice(0, 4), 10) : null;
}

function normalize(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/^\s*the\s+/, '')
    .trim();
}
