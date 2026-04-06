// components/modal.js
// Pure rendering functions for the movie detail modal.
// No state, no fetch calls — receives data and callbacks, emits DOM.

const ModalComponent = (() => {

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function mmNormalizeTitle(t) {
    return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // options.getActiveSessions() → now-watching data object | null
  function mmGetActiveSession(title, options) {
    if (typeof options.getActiveSessions === 'function') {
      const data = options.getActiveSessions();
      if (!data) return null;
      if (mmNormalizeTitle(data.title) !== mmNormalizeTitle(title)) return null;
      return data;
    }
    return null;
  }

  // options.getPastSessions() → array of session signal objects
  function mmGetSessions(title, options) {
    if (typeof options.getPastSessions === 'function') {
      const signals = options.getPastSessions();
      return (signals || []).filter(s => mmNormalizeTitle(s.title) === mmNormalizeTitle(title));
    }
    return [];
  }

  // ── Collapsible section helper ───────────────────────────────────────────────

  function makeSection(container, labelText, buildFn, { marginTop = '24px' } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'mm-section';
    wrap.style.marginTop = marginTop;

    const toggle = document.createElement('button');
    toggle.className = 'mm-section-label mm-section-toggle';
    toggle.innerHTML = `<span>${labelText}</span><svg class="mm-section-chevron" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"/></svg>`;

    const body = document.createElement('div');
    body.className = 'mm-section-body';
    buildFn(body);

    toggle.addEventListener('click', () => {
      const collapsed = wrap.classList.toggle('mm-section--collapsed');
      body.hidden = collapsed;
    });

    wrap.append(toggle, body);
    container.appendChild(wrap);
  }

  // ── Tab: Details ────────────────────────────────────────────────────────────

  function renderDetailsContent(container, movie, data) {
    if (data.genres?.length) {
      const genres = document.createElement('div');
      genres.className = 'mm-genres';
      data.genres.forEach(g => {
        const tag = document.createElement('span');
        tag.className = 'mm-genre-tag';
        tag.textContent = g;
        genres.appendChild(tag);
      });
      container.appendChild(genres);
    }

    if (data.tagline) {
      const tagline = document.createElement('div');
      tagline.className = 'mm-tagline';
      tagline.textContent = `"${data.tagline}"`;
      container.appendChild(tagline);
    }

    if (data.overview) {
      const overview = document.createElement('p');
      overview.className = 'mm-overview';
      overview.textContent = data.overview;
      container.appendChild(overview);
    }

    if (data.cast?.length) {
      const castLabel = document.createElement('div');
      castLabel.className = 'mm-section-label';
      castLabel.textContent = 'Cast';
      container.appendChild(castLabel);

      const castRow = document.createElement('div');
      castRow.className = 'mm-cast';
      data.cast.forEach(person => {
        const item = document.createElement('a');
        item.className = 'mm-cast-item';
        item.href = person.wiki;
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
        const photo = document.createElement('div');
        photo.className = 'mm-cast-photo';
        if (person.photo) {
          const img = document.createElement('img');
          img.src = person.photo;
          img.alt = person.name;
          photo.appendChild(img);
        } else {
          photo.classList.add('mm-cast-photo-blank');
          photo.textContent = person.name[0];
        }
        const name = document.createElement('div');
        name.className = 'mm-cast-name';
        name.textContent = person.name;
        const character = document.createElement('div');
        character.className = 'mm-cast-character';
        character.textContent = person.character;
        item.append(photo, name, character);
        castRow.appendChild(item);
      });
      container.appendChild(castRow);
    }

    if (data.keyCrew?.length) {
      const crewLabel = document.createElement('div');
      crewLabel.className = 'mm-section-label';
      crewLabel.textContent = 'Key Crew';
      container.appendChild(crewLabel);

      const crewGrid = document.createElement('div');
      crewGrid.className = 'mm-crew';
      data.keyCrew.forEach(({ role, name, wiki }) => {
        const row = document.createElement('a');
        row.className = 'mm-crew-row';
        row.href = wiki;
        row.target = '_blank';
        row.rel = 'noopener noreferrer';
        row.innerHTML = `<span class="mm-crew-role">${role}</span><span class="mm-crew-name">${name}</span>`;
        crewGrid.appendChild(row);
      });
      container.appendChild(crewGrid);
    }
  }

  // ── Empty session: interactive chat + fact generation ───────────────────────

  function mmRenderEmptySession(container, movie, options) {
    const { onSendChat, onGenerateFact, mmSession } = options;

    // Facts area
    const factsArea = document.createElement('div');
    factsArea.className = 'mm-es-facts';

    function renderFacts() {
      factsArea.innerHTML = '';
      if (mmSession.factsLoading) {
        const loading = document.createElement('div');
        loading.className = 'mm-es-facts-loading';
        loading.textContent = 'Generating film notes…';
        factsArea.appendChild(loading);
        return;
      }
      mmSession.facts.forEach(f => {
        const card = document.createElement('div');
        card.className = 'mm-session-fact';
        card.innerHTML = `<div class="mm-session-fact-pct">~${f.pct}% in</div><div class="mm-session-fact-text">${f.text}</div>`;
        factsArea.appendChild(card);
      });
    }
    renderFacts();

    // Chat thread
    const thread = document.createElement('div');
    thread.className = 'mm-es-thread';

    function appendBubble(role, text, isError) {
      const bubble = document.createElement('div');
      bubble.className = `mm-session-msg mm-session-msg-${role}${isError ? ' mm-msg-error' : ''}`;
      bubble.textContent = text;
      thread.appendChild(bubble);
      thread.scrollTop = thread.scrollHeight;
      return bubble;
    }

    function appendTyping() {
      const el = document.createElement('div');
      el.className = 'mm-session-msg mm-session-msg-assistant mm-es-typing';
      el.innerHTML = '<span></span><span></span><span></span>';
      thread.appendChild(el);
      thread.scrollTop = thread.scrollHeight;
      return el;
    }

    // Restore existing chat history from mmSession
    mmSession.chatHistory.forEach(msg => appendBubble(msg.role, msg.content));

    // Toolbar: generate fact button
    const toolbar = document.createElement('div');
    toolbar.className = 'mm-es-toolbar';

    if (onGenerateFact) {
      const factBtn = document.createElement('button');
      factBtn.className = 'mm-es-fact-btn';
      factBtn.textContent = 'Generate film notes';
      factBtn.addEventListener('click', async () => {
        if (mmSession.factsLoading) return;
        mmSession.factsLoading = true;
        factBtn.disabled = true;
        renderFacts();
        try {
          const res = await onGenerateFact(movie);
          mmSession.facts = res.facts || [];
        } catch {
          mmSession.facts = [];
        }
        mmSession.factsLoading = false;
        factBtn.disabled = false;
        renderFacts();
      });
      toolbar.appendChild(factBtn);
    }

    // Chat input
    const inputRow = document.createElement('div');
    inputRow.className = 'mm-es-input-row';

    const input = document.createElement('textarea');
    input.className = 'mm-es-input';
    input.placeholder = 'Ask about this film…';
    input.rows = 1;

    const sendBtn = document.createElement('button');
    sendBtn.className = 'mm-es-send-btn';
    sendBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8H2M9 3l5 5-5 5"/></svg>';

    async function sendMessage() {
      if (!onSendChat) return;
      const msg = input.value.trim();
      if (!msg) return;
      input.value = '';
      input.style.height = '';
      sendBtn.disabled = true;
      appendBubble('user', msg);
      mmSession.chatHistory.push({ role: 'user', content: msg });
      const typing = appendTyping();
      try {
        const res = await onSendChat(msg, mmSession.chatHistory.slice(0, -1));
        typing.remove();
        if (res.error) {
          appendBubble('assistant', 'Something went wrong — try again.', true);
        } else {
          appendBubble('assistant', res.reply);
          mmSession.chatHistory.push({ role: 'assistant', content: res.reply });
        }
      } catch {
        typing.remove();
        appendBubble('assistant', 'Something went wrong — try again.', true);
      }
      sendBtn.disabled = false;
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      if (e.key === 'Escape') e.stopPropagation();
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    inputRow.append(input, sendBtn);

    container.append(factsArea, toolbar, thread, inputRow);
  }

  // ── Tab: Session ────────────────────────────────────────────────────────────

  function renderSessionContent(container, movie, options) {
    const activeSession = mmGetActiveSession(movie.title, options);
    const sessions = mmGetSessions(movie.title, options);

    // Use active session data if available, else most recent completed signal
    const sessionData = activeSession?.companion
      ? { facts: (activeSession.companion.facts || []).filter(f => f.delivered), chat_history: activeSession.companion.chat_history || [], timestamp: activeSession.startedAt, decision: null }
      : sessions[0] || null;

    const facts = sessionData?.facts || [];
    const chatHistory = sessionData?.chat_history || [];

    if (!sessionData) {
      mmRenderEmptySession(container, movie, options);
      return;
    }

    if (facts.length === 0 && chatHistory.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mm-session-empty';
      empty.textContent = activeSession
        ? 'Companion is active — film notes will appear here as you watch.'
        : 'No notes or conversation recorded for this session.';
      container.appendChild(empty);
      return;
    }

    // Facts
    if (facts.length > 0) {
      makeSection(container, 'Film notes from this session', body => {
        facts.forEach(f => {
          const card = document.createElement('div');
          card.className = 'mm-session-fact';
          card.innerHTML = `<div class="mm-session-fact-pct">~${f.pct}% in</div><div class="mm-session-fact-text">${f.text}</div>`;
          body.appendChild(card);
        });
      }, { marginTop: '0' });
    }

    // Chat history
    if (chatHistory.length > 0) {
      makeSection(container, 'Conversation', body => {
        const thread = document.createElement('div');
        thread.className = 'mm-session-thread';
        chatHistory.forEach(msg => {
          const bubble = document.createElement('div');
          bubble.className = `mm-session-msg mm-session-msg-${msg.role}`;
          bubble.textContent = msg.content;
          thread.appendChild(bubble);
        });
        body.appendChild(thread);
      }, { marginTop: facts.length > 0 ? '28px' : '0' });
    }

    // Past sessions count
    if (sessions.length > 1) {
      const pastLabel = document.createElement('div');
      pastLabel.className = 'mm-section-label';
      pastLabel.style.marginTop = '28px';
      pastLabel.textContent = `${sessions.length} sessions total`;
      container.appendChild(pastLabel);
    }
  }

  // ── Tab: Where to watch ─────────────────────────────────────────────────────

  const WTW_COUNTRIES = [
    { code: 'US', flag: '🇺🇸', label: 'United States' },
    { code: 'GB', flag: '🇬🇧', label: 'United Kingdom' },
    { code: 'DE', flag: '🇩🇪', label: 'Germany' },
    { code: 'FR', flag: '🇫🇷', label: 'France' },
    { code: 'PL', flag: '🇵🇱', label: 'Poland' },
    { code: 'IT', flag: '🇮🇹', label: 'Italy' },
    { code: 'ES', flag: '🇪🇸', label: 'Spain' },
    { code: 'AU', flag: '🇦🇺', label: 'Australia' },
    { code: 'CA', flag: '🇨🇦', label: 'Canada' },
    { code: 'NL', flag: '🇳🇱', label: 'Netherlands' },
    { code: 'SE', flag: '🇸🇪', label: 'Sweden' },
    { code: 'NO', flag: '🇳🇴', label: 'Norway' },
    { code: 'DK', flag: '🇩🇰', label: 'Denmark' },
    { code: 'FI', flag: '🇫🇮', label: 'Finland' },
    { code: 'BR', flag: '🇧🇷', label: 'Brazil' },
    { code: 'JP', flag: '🇯🇵', label: 'Japan' },
    { code: 'KR', flag: '🇰🇷', label: 'South Korea' },
    { code: 'IN', flag: '🇮🇳', label: 'India' },
    { code: 'MX', flag: '🇲🇽', label: 'Mexico' },
    { code: 'AR', flag: '🇦🇷', label: 'Argentina' },
  ];

  function renderWatchProvidersContent(container, tmdbId, options) {
    const { getCountry, onCountryChange, onFetchProviders, wtwPrefetch } = options;
    const country = getCountry ? getCountry() : 'US';

    container.innerHTML = '';

    // ── Header row: Stream label (left) + country selector (right) ──
    const headerRow = document.createElement('div');
    headerRow.className = 'mm-wtw-header-row';

    const streamLabel = document.createElement('div');
    streamLabel.className = 'mm-wtw-section-label mm-wtw-stream-label';
    streamLabel.textContent = 'Stream';

    const countryRow = document.createElement('div');
    countryRow.className = 'mm-wtw-country-row';
    const countryLabel = document.createElement('span');
    countryLabel.textContent = 'Showing availability in';
    const countrySelect = document.createElement('select');
    countrySelect.className = 'mm-wtw-country-select';
    WTW_COUNTRIES.forEach(({ code, flag, label }) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${flag} ${label}`;
      if (code === country) opt.selected = true;
      countrySelect.appendChild(opt);
    });
    countrySelect.addEventListener('change', () => {
      if (typeof onCountryChange === 'function') onCountryChange(countrySelect.value);
      renderWatchProvidersContent(container, tmdbId, { ...options, wtwPrefetch: null });
    });
    countryRow.append(countryLabel, countrySelect);
    headerRow.append(streamLabel, countryRow);
    container.appendChild(headerRow);

    // ── Provider data ──
    if (!onFetchProviders || !tmdbId) {
      const empty = document.createElement('div');
      empty.className = 'mm-wtw-empty';
      empty.textContent = 'Streaming data unavailable.';
      container.appendChild(empty);
      return;
    }

    // Use the pre-fetched promise if available, otherwise fetch now
    const fetchPromise = wtwPrefetch || onFetchProviders(tmdbId, country);

    const loading = document.createElement('div');
    loading.className = 'mm-wtw-loading';
    loading.textContent = 'Loading…';
    container.appendChild(loading);

    fetchPromise.then(data => {
      loading.remove();

      if (!data) {
        const err = document.createElement('div');
        err.className = 'mm-wtw-empty';
        err.textContent = 'Could not load streaming data.';
        container.appendChild(err);
        return;
      }

      const { flatrate = [], rent = [], buy = [], fallback } = data;

      if (fallback) {
        const notice = document.createElement('p');
        notice.className = 'mm-wtw-fallback-notice';
        notice.textContent = 'No data for your region — showing US availability.';
        container.appendChild(notice);
      }

      const buildLogoGrid = (providers) => {
        const grid = document.createElement('div');
        grid.className = 'mm-wtw-logos';
        providers.forEach(({ name, logo, homepage }) => {
          const link = document.createElement('a');
          link.className = 'mm-wtw-provider';
          link.href = homepage || '#';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.title = name;
          const img = document.createElement('img');
          img.src = logo;
          img.alt = name;
          img.width = 80;
          img.height = 80;
          link.appendChild(img);
          grid.appendChild(link);
        });
        return grid;
      };

      if (flatrate.length) {
        const section = document.createElement('div');
        section.className = 'mm-wtw-section';
        section.append(buildLogoGrid(flatrate));
        container.appendChild(section);
      } else {
        // Hide the stream label in the header if there's nothing to stream
        const sl = container.querySelector('.mm-wtw-stream-label');
        if (sl) sl.hidden = true;
      }

      // Rent + Buy merged into one section, deduped by name
      const rentBuy = [...rent];
      buy.forEach(b => { if (!rentBuy.find(r => r.name === b.name)) rentBuy.push(b); });
      if (rentBuy.length) {
        const section = document.createElement('div');
        section.className = 'mm-wtw-section';
        const label = document.createElement('div');
        label.className = 'mm-wtw-section-label';
        label.textContent = 'Rent & Buy';
        section.append(label, buildLogoGrid(rentBuy));
        container.appendChild(section);
      }

      if (!flatrate.length && !hasRentBuy) {
        const empty = document.createElement('div');
        empty.className = 'mm-wtw-empty';
        empty.textContent = 'Not available to stream in this region.';
        container.appendChild(empty);
      }
    });
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  /**
   * Render fully-loaded modal content into `container`.
   *
   * @param {HTMLElement} container  - The modal body element (will be cleared)
   * @param {Object}      movie      - { title, year, director, poster }
   * @param {Object}      data       - API response { genres, tagline, overview, imdb_rating,
   *                                   rt_score, runtime, cast, keyCrew, poster, imdb_id, director }
   * @param {Object}      options
   * @param {string}      [options.initialTab='details']        - 'details' | 'session'
   * @param {Function}    [options.onWatchTonight]              - called when Watch Tonight clicked
   * @param {Function}    [options.getActiveSessions]           - () => now-watching data | null
   * @param {Function}    [options.getPastSessions]             - () => array of past signals
   * @param {Function}    [options.onSendChat]                  - async (message, chatHistory) => { reply } | null
   * @param {Function}    [options.onGenerateFact]              - async (movie) => { facts: [{pct,text}] } | null
   * @param {Function}    [options.getCountry]                  - () => ISO country code string
   * @param {Function}    [options.onCountryChange]             - (code) => void
   * @param {Function}    [options.onFetchProviders]            - async (tmdbId, country) => provider data | null
   */
  function renderModal(container, movie, data, options = {}) {
    const {
      initialTab = 'details',
      onWatchTonight = null,
      getActiveSessions = () => null,
      getPastSessions = () => [],
      onSendChat = null,
      onGenerateFact = null,
      getCountry = () => 'US',
      onCountryChange = null,
      onFetchProviders = null,
      // Anticipated mode: replaces Watch Tonight with Anticipate/Meh/Don't Recommend actions
      anticipatedMode = false,
      onAnticipate = null,
      onMeh = null,
      onBan = null,
    } = options;

    // In-memory session state — persists across tab switches for this modal's lifetime
    const mmSession = { chatHistory: [], facts: [], factsLoading: false };

    const resolvedOptions = { getActiveSessions, getPastSessions, onSendChat, onGenerateFact, mmSession, getCountry, onCountryChange, onFetchProviders };

    container.innerHTML = '';

    // ── Poster column ──────────────────────────────────────────────────────────
    const posterCol = document.createElement('div');
    posterCol.className = 'mm-poster-col';

    const poster = document.createElement('img');
    poster.className = 'mm-poster';
    poster.src = data.poster || movie.poster;
    poster.alt = movie.title;
    posterCol.appendChild(poster);

    if (data.imdb_rating || data.rt_score) {
      const ratings = document.createElement('div');
      ratings.className = 'mm-ratings';
      if (data.imdb_rating) {
        const imdbLink = document.createElement('a');
        imdbLink.className = 'mm-rating-badge mm-rating-imdb';
        imdbLink.href = data.imdb_id ? `https://www.imdb.com/title/${data.imdb_id}` : '#';
        imdbLink.target = '_blank';
        imdbLink.rel = 'noopener noreferrer';
        imdbLink.innerHTML = `<span class="mm-rating-logo">IMDb</span><span>${data.imdb_rating}</span>`;
        ratings.appendChild(imdbLink);
      }
      if (data.rt_score) {
        const pct = parseInt(data.rt_score);
        const fresh = pct >= 60;
        const rt = document.createElement('a');
        rt.className = `mm-rating-badge mm-rating-rt ${fresh ? 'mm-rating-rt--fresh' : 'mm-rating-rt--rotten'}`;
        rt.href = `https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title)}`;
        rt.target = '_blank';
        rt.rel = 'noopener noreferrer';
        rt.innerHTML = `<span>${fresh ? '🍅' : '🤢'}</span><span>${data.rt_score}</span>`;
        ratings.appendChild(rt);
      }
      posterCol.appendChild(ratings);
    }

    if (anticipatedMode) {
      const anticipateBtn = document.createElement('button');
      anticipateBtn.className = 'mm-watch-btn mm-anticipate-btn';
      anticipateBtn.textContent = 'Anticipate';
      anticipateBtn.addEventListener('click', () => { if (typeof onAnticipate === 'function') onAnticipate(movie); });

      const mehBtn = document.createElement('button');
      mehBtn.className = 'mm-action-btn mm-action-btn--meh';
      mehBtn.textContent = 'Meh';
      mehBtn.addEventListener('click', () => { if (typeof onMeh === 'function') onMeh(movie); });

      const banBtn = document.createElement('button');
      banBtn.className = 'mm-action-btn mm-action-btn--ban';
      banBtn.textContent = "Don't recommend";
      banBtn.addEventListener('click', () => { if (typeof onBan === 'function') onBan(movie); });

      posterCol.append(anticipateBtn, mehBtn, banBtn);
    } else {
      const watchBtn = document.createElement('button');
      watchBtn.className = 'mm-watch-btn';
      watchBtn.textContent = 'Watch Tonight';
      watchBtn.addEventListener('click', () => {
        if (typeof onWatchTonight === 'function') onWatchTonight(movie);
      });
      posterCol.appendChild(watchBtn);
    }

    // ── Info column ────────────────────────────────────────────────────────────
    const info = document.createElement('div');
    info.className = 'mm-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'mm-title';
    titleEl.textContent = movie.title;

    const meta = document.createElement('div');
    meta.className = 'mm-meta';
    const resolvedDirector = data.director || movie.director || '';
    if (resolvedDirector) {
      const dirLink = document.createElement('a');
      dirLink.className = 'mm-director-link';
      dirLink.textContent = resolvedDirector;
      dirLink.href = data.director_wiki || `https://en.wikipedia.org/wiki/${encodeURIComponent(resolvedDirector.replace(/ /g, '_'))}`;
      dirLink.target = '_blank';
      dirLink.rel = 'noopener noreferrer';
      meta.appendChild(dirLink);
    }
    const metaParts = [movie.year, data.runtime ? `${data.runtime} min` : null].filter(Boolean);
    if (metaParts.length) {
      const sep = document.createTextNode((resolvedDirector ? ' · ' : '') + metaParts.join(' · '));
      meta.appendChild(sep);
    }

    const sessions = mmGetSessions(movie.title, resolvedOptions);
    const activeSession = mmGetActiveSession(movie.title, resolvedOptions);

    const titleRow = document.createElement('div');
    titleRow.className = 'mm-title-row';
    titleRow.appendChild(titleEl);
    if (activeSession) {
      const liveBadge = document.createElement('span');
      liveBadge.className = 'mm-live-badge';
      liveBadge.textContent = '● Session in progress';
      titleRow.appendChild(liveBadge);
    }
    // ── Sticky header (title + meta + tabs) ───────────────────────────────────
    const infoHeader = document.createElement('div');
    infoHeader.className = 'mm-info-header';
    infoHeader.append(titleRow, meta);

    const hasSession = sessions.length > 0 || !!activeSession;

    const tabBar = document.createElement('div');
    tabBar.className = 'mm-tabs';

    const detailsTab = document.createElement('button');
    detailsTab.className = 'mm-tab mm-tab-active';
    detailsTab.textContent = 'Details';

    const sessionTab = document.createElement('button');
    sessionTab.className = 'mm-tab';
    sessionTab.innerHTML = hasSession ? 'Session <span class="mm-tab-dot"></span>' : 'Session';

    const wtwTab = document.createElement('button');
    wtwTab.className = 'mm-tab';
    wtwTab.textContent = 'Where to watch';

    if (anticipatedMode) {
      tabBar.append(detailsTab);
    } else {
      tabBar.append(detailsTab, sessionTab, wtwTab);
    }
    infoHeader.appendChild(tabBar);
    info.appendChild(infoHeader);

    // ── Tab content ────────────────────────────────────────────────────────────
    const tabContent = document.createElement('div');
    tabContent.className = 'mm-tab-content';
    info.appendChild(tabContent);

    let detailsContentHeight = 0;

    // Pre-fetch provider data immediately so the tab renders instantly on click
    let wtwPrefetch = null;
    if (onFetchProviders && data.tmdb_id) {
      const country = getCountry ? getCountry() : 'US';
      wtwPrefetch = onFetchProviders(data.tmdb_id, country);
    }

    function showTab(which) {
      detailsTab.classList.toggle('mm-tab-active', which === 'details');
      sessionTab.classList.toggle('mm-tab-active', which === 'session');
      wtwTab.classList.toggle('mm-tab-active', which === 'wtw');
      infoHeader.classList.add('mm-info-header--no-shadow');
      tabContent.innerHTML = '';
      if (which === 'details') {
        renderDetailsContent(tabContent, movie, data);
        detailsContentHeight = tabContent.scrollHeight;
        tabContent.style.minHeight = '';
      } else if (which === 'wtw') {
        if (detailsContentHeight > 0) tabContent.style.minHeight = detailsContentHeight + 'px';
        renderWatchProvidersContent(tabContent, data.tmdb_id, { ...resolvedOptions, wtwPrefetch });
      } else {
        if (detailsContentHeight > 0) tabContent.style.minHeight = detailsContentHeight + 'px';
        renderSessionContent(tabContent, movie, resolvedOptions);
      }
    }

    detailsTab.addEventListener('click', () => showTab('details'));
    sessionTab.addEventListener('click', () => showTab('session'));
    wtwTab.addEventListener('click', () => showTab('wtw'));

    container.append(posterCol, info);

    // Always render Details first to capture its height, then switch to the desired tab.
    // All synchronous — no visible flash before first paint.
    showTab('details');
    if (initialTab !== 'details') showTab(initialTab);
  }

  return { renderModal, renderDetailsContent, renderSessionContent, mmNormalizeTitle, mmGetSessions, mmGetActiveSession };
})();
