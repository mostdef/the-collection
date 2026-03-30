// sandbox/fixtures.js
// Call Fixtures.init() before rendering — fetches real TMDB poster URLs via the local API.

const POSTER_FALLBACK = (label = '') => {
  const colors = [['#1a1a2e','#16213e'],['#1a1a1a','#2d2d2d'],['#1e1a0e','#2d2500'],['#0e1a1a','#002d2d']];
  const [c1, c2] = colors[Math.abs(label.charCodeAt(0) || 0) % colors.length];
  const initials = label.split(' ').slice(0,2).map(w => w[0]||'').join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="445" viewBox="0 0 300 445">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
    <rect width="300" height="445" fill="url(#g)"/>
    <text x="150" y="230" font-family="serif" font-size="72" fill="rgba(255,255,255,0.12)" text-anchor="middle" dominant-baseline="middle">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const Fixtures = {
  movies: {
    standard:    { title: 'Once Upon a Time in America', year: '1984', director: 'Sergio Leone',  poster: POSTER_FALLBACK('Once Upon a Time in America') },
    noDirector:  { title: 'Burden of Dreams',            year: '1982', director: '',              poster: POSTER_FALLBACK('Burden of Dreams') },
    longTitle:   { title: 'The Discreet Charm of the Bourgeoisie', year: '1972', director: 'Luis Buñuel', poster: POSTER_FALLBACK('The Discreet Charm') },
    withRatings: { title: 'Thief',                       year: '1981', director: 'Michael Mann',  poster: POSTER_FALLBACK('Thief'), imdb_rating: '7.4', rt_score: '98%' },
  },
  sessions: {
    active: {
      title: 'Burden of Dreams', year: '1982',
      startedAt: Date.now() - 1000 * 60 * 32,
      elapsed: 1000 * 60 * 32,
      runtime: 97,
      companion: {
        open: true, spoilers: false,
        facts: [
          { pct: 10, text: 'Les Blank shot this documentary while Werner Herzog was simultaneously making Fitzcarraldo (1982).', delivered: true },
          { pct: 25, text: 'The production battled indigenous land disputes, Peruvian government permits, and warring local factions.', delivered: true },
          { pct: 45, text: 'Herzog delivered a monologue about the jungle that became one of cinema\'s most quoted director statements.', delivered: false },
        ],
        chat_history: [
          { role: 'user', content: 'Why does Herzog look so haunted in this?' },
          { role: 'assistant', content: 'He\'s being filmed mid-obsession — Fitzcarraldo was falling apart around him as Blank rolled. The camera catches something he couldn\'t perform: genuine uncertainty about whether any of it was worth it.' },
        ],
      },
    },
    past: {
      title: 'Once Upon a Time in America', year: '1984',
      facts: [
        { pct: 15, text: 'Leone spent 13 years developing the project, originally planning a 6-hour cut.', delivered: true },
        { pct: 40, text: 'Ennio Morricone composed the score before filming began — Leone directed to the music.', delivered: true },
      ],
      chat_history: [
        { role: 'user', content: 'Is the ending a dream?' },
        { role: 'assistant', content: 'Leone never confirmed it, but the opium den framing is deliberate — the entire film may be Noodles retreating into fantasy rather than confronting what he did.' },
      ],
      decision: 'collection',
    },
  },
  nwwStates: {
    idle: null,
    searching: { query: 'burg' },
    playing: { title: 'Burden of Dreams', year: '1982', director: 'Les Blank', poster: POSTER_FALLBACK('Burden of Dreams'), runtime: 97, elapsed: 1000 * 60 * 32, paused: false },
    companionOpen: null,
    deciding: { title: 'Burden of Dreams', year: '1982' },
  },

  // Call before first render — resolves real TMDB poster URLs via the local API.
  // Resolved URLs are cached in localStorage so subsequent loads are instant.
  // Falls back silently to the SVG placeholders if the API is unavailable.
  POSTER_CACHE_KEY: 'thecollection_sandbox_posters',

  init: async function () {
    // L2: restore from localStorage cache
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(Fixtures.POSTER_CACHE_KEY) || '{}'); } catch {}

    const entries = Object.entries(Fixtures.movies);
    const needsFetch = entries.filter(([, movie]) => !cache[movie.title]);

    if (needsFetch.length > 0) {
      await Promise.all(needsFetch.map(async ([, movie]) => {
        try {
          const res = await fetch(`/api/movie-details?title=${encodeURIComponent(movie.title)}&year=${encodeURIComponent(movie.year)}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.poster) cache[movie.title] = data.poster;
        } catch { /* API unavailable — keep SVG fallback */ }
      }));
      try { localStorage.setItem(Fixtures.POSTER_CACHE_KEY, JSON.stringify(cache)); } catch {}
    }

    // Apply cached/fetched posters
    for (const [, movie] of entries) {
      if (cache[movie.title]) movie.poster = cache[movie.title];
    }

    // Sync nwwStates.playing poster from the resolved movie fixture
    const playing = Fixtures.nwwStates.playing;
    if (playing) {
      const match = Object.values(Fixtures.movies).find(m => m.title === playing.title);
      if (match) playing.poster = match.poster;
    }
  },
};
