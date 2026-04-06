// Load Sortable in the background — doesn't block initial render.
// updateSortable() and standards drag-to-reorder await this before using Sortable.
const _sortableReady = new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js';
  s.onload = resolve; s.onerror = reject;
  document.head.appendChild(s);
});

const PERSONA_ENABLED = false; // set to false to disable persona & stats (saves API credits)
const PERSONA_HIDDEN_KEY = 'thecollection_persona_hidden';
function isPersonaHidden() { return localStorage.getItem(PERSONA_HIDDEN_KEY) === '1'; }
function setPersonaHidden(v) { localStorage.setItem(PERSONA_HIDDEN_KEY, v ? '1' : '0'); }

const VIEWS = ['collection','watchlist','maybe','meh','banned','anticipated'];
const dirtyViews = new Set(VIEWS);
function getGrid(v) { return document.getElementById('grid-' + v); }
function markDirty(v) { dirtyViews.add(v); }
function markClean(v) { dirtyViews.delete(v); }

let draggedCard          = null;
let droppedOnTab         = false;
let pendingStandardsSlot = null;

function getViewList(view)       { return view === 'collection' ? movies : ({ watchlist: loadWatchlist, maybe: loadMaybe, meh: loadMeh, banned: loadBanned }[view])(); }
function saveViewList(view, list){ if (view === 'collection') { movies.splice(0, movies.length, ...list); saveMovies(); } else ({ watchlist: saveWatchlist, maybe: saveMaybe, meh: saveMeh, banned: saveBanned }[view])(list); }

function moveBetweenViews(title, fromView, toView) {
  const src = getViewList(fromView);
  const idx  = src.findIndex(m => m.title === title);
  if (idx === -1) return;
  const [movie] = src.splice(idx, 1);
  saveViewList(fromView, src);
  movie.addedAt = Date.now();
  const dst = getViewList(toView);
  dst.unshift(movie);
  saveViewList(toView, dst);
  markDirty(fromView);
  markDirty(toView);
}

function showEmptyState(g) {
  const wrap = document.createElement('div');
  wrap.className = 'grid-empty';
  const img = document.createElement('img');
  img.src = 'empty.png';
  img.alt = '';
  img.draggable = false;
  const label = document.createElement('div');
  label.className = 'grid-empty-label';
  label.textContent = 'Nothing here yet';
  wrap.appendChild(img);
  wrap.appendChild(label);
  g.appendChild(wrap);
}

function drawCreasePart(ctx, pos, isHorizontal, w, h, strength, isHighlight, angle) {
  const len = (isHorizontal ? w : h) * 1.6;
  const hlOpacity = Math.min(1, 1.1 * strength);
  const shOpacity = Math.min(1, 0.75 * strength);
  const spread = Math.round(18 * strength);

  ctx.save();
  ctx.translate(isHorizontal ? w / 2 : pos, isHorizontal ? pos : h / 2);
  ctx.rotate(angle);

  if (isHorizontal) {
    if (isHighlight) {
      const hl = ctx.createLinearGradient(0, -5, 0, 2);
      hl.addColorStop(0, 'rgba(255,255,255,0)');
      hl.addColorStop(0.5, `rgba(255,255,255,${hlOpacity})`);
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.fillRect(-len / 2, -5, len, 7);
    } else {
      const sh = ctx.createLinearGradient(0, 1, 0, spread);
      sh.addColorStop(0, `rgba(0,0,0,${shOpacity})`);
      sh.addColorStop(0.4, `rgba(0,0,0,${shOpacity * 0.35})`);
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(-len / 2, 1, len, spread);
    }
  } else {
    if (isHighlight) {
      const hl = ctx.createLinearGradient(-5, 0, 2, 0);
      hl.addColorStop(0, 'rgba(255,255,255,0)');
      hl.addColorStop(0.5, `rgba(255,255,255,${hlOpacity})`);
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.fillRect(-5, -len / 2, 7, len);
    } else {
      const sh = ctx.createLinearGradient(1, 0, spread, 0);
      sh.addColorStop(0, `rgba(0,0,0,${shOpacity})`);
      sh.addColorStop(0.4, `rgba(0,0,0,${shOpacity * 0.35})`);
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(1, -len / 2, spread, len);
    }
  }

  ctx.restore();
}

function generateFoldTextures() {
  const w = 400, h = 600;

  const patterns = [
    { h: [1/3, 2/3], v: [1/2] },
    { h: [1/4, 1/2, 3/4], v: [1/2] },
  ];
  const pat = patterns[Math.floor(Math.random() * patterns.length)];

  // Pre-generate all random parameters so both canvases are spatially aligned
  const hPos = pat.h.map(t => h * t + (Math.random() - 0.5) * 6);
  const vPos = pat.v.map(t => w * t + (Math.random() - 0.5) * 6);
  const hBounds = [0, ...hPos, h];
  const vBounds = [0, ...vPos, w];

  const sectionData = hBounds.slice(0, -1).map(() =>
    vBounds.slice(0, -1).map(() => ({
      angle: Math.random() * Math.PI * 2,
      intensity: 0.12 + Math.random() * 0.14,
    }))
  );
  const hAngles = hPos.map(() => (Math.random() - 0.5) * 0.04);
  const vAngles = vPos.map(() => (Math.random() - 0.5) * 0.04);

  function buildCanvas(isHighlight) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Black = neutral for screen; white = neutral for multiply
    ctx.fillStyle = isHighlight ? '#000' : '#fff';
    ctx.fillRect(0, 0, w, h);

    // Grain (near-neutral for each respective blend mode)
    const id = ctx.createImageData(w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = isHighlight
        ? Math.floor(Math.random() * 22)
        : Math.floor(233 + Math.random() * 22);
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = Math.floor(Math.random() * 25 + 5);
    }
    ctx.putImageData(id, 0, 0);

    // Per-section diffraction: hl draws lit side, sh draws shadow side
    sectionData.forEach((row, ri) => row.forEach(({ angle, intensity }, ci) => {
      const x1 = vBounds[ci], y1 = hBounds[ri];
      const x2 = vBounds[ci + 1], y2 = hBounds[ri + 1];
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const r = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) * 0.5;
      const dx = Math.cos(angle) * r, dy = Math.sin(angle) * r;
      const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      if (isHighlight) {
        grad.addColorStop(0, `rgba(255,255,255,${intensity})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(0,0,0,${intensity})`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }));

    // Fold crease lines
    hPos.forEach((pos, i) => drawCreasePart(ctx, pos, true,  w, h, 1,   isHighlight, hAngles[i]));
    vPos.forEach((pos, i) => drawCreasePart(ctx, pos, false, w, h, 2.2, isHighlight, vAngles[i]));

    return canvas.toDataURL('image/png');
  }

  return { hl: buildCanvas(true), sh: buildCanvas(false) };
}

// ─────────────────────────────────────────────────────────────────────────────
// addTilt, addTexturesToPoster, appendCardRatings moved to components/card.js

const textureCache = new Map();
const TEXTURE_CACHE_MAX = 80;
const TEXTURE_STORE_PREFIX = 'thecollection_tex_';

// Deferred generation queue — drains one entry per idle slice so render is never blocked
const _texQueue = [];
let _texDraining = false;
const _scheduleIdle = typeof requestIdleCallback !== 'undefined'
  ? fn => requestIdleCallback(fn, { timeout: 3000 })
  : fn => setTimeout(fn, 0);

function _drainTexQueue() {
  const entry = _texQueue.shift();
  if (!entry) { _texDraining = false; return; }
  const { key, hlEl, shEl } = entry;
  // Skip if the card was removed from DOM before we got here
  if (!hlEl.isConnected) { _scheduleIdle(_drainTexQueue); return; }
  const textures = generateFoldTextures();
  if (textureCache.size >= TEXTURE_CACHE_MAX) textureCache.delete(textureCache.keys().next().value);
  textureCache.set(key, textures);
  try { localStorage.setItem(TEXTURE_STORE_PREFIX + key, JSON.stringify(textures)); } catch {}
  hlEl.style.backgroundImage = `url(${textures.hl})`;
  shEl.style.backgroundImage = `url(${textures.sh})`;
  if (_texQueue.length) _scheduleIdle(_drainTexQueue);
  else _texDraining = false;
}

function getWTWCountry() {
  return localStorage.getItem(WTW_COUNTRY_KEY)
    || navigator.language?.split('-')[1]?.toUpperCase()
    || 'US';
}

function getCachedProviders(tmdbId) {
  try {
    const raw = localStorage.getItem('thecollection_providers_' + tmdbId);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch { return null; }
}

function setCachedProviders(tmdbId, data) {
  try {
    localStorage.setItem('thecollection_providers_' + tmdbId, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

// getCachedTextures(key) — synchronous fast path (L1/L2 hit)
// getCachedTextures(key, hlEl, shEl) — deferred generation on L3 miss; returns null
function getCachedTextures(key, hlEl, shEl) {
  // L1: in-memory LRU
  if (textureCache.has(key)) {
    const val = textureCache.get(key);
    textureCache.delete(key);
    textureCache.set(key, val);
    return val;
  }
  // L2: localStorage (persists across page loads — generated once per movie)
  try {
    const stored = localStorage.getItem(TEXTURE_STORE_PREFIX + key);
    if (stored) {
      const textures = JSON.parse(stored);
      if (textureCache.size >= TEXTURE_CACHE_MAX) textureCache.delete(textureCache.keys().next().value);
      textureCache.set(key, textures);
      return textures;
    }
  } catch {}
  // L3: deferred if DOM elements supplied, synchronous otherwise
  if (hlEl && shEl) {
    _texQueue.push({ key, hlEl, shEl });
    if (!_texDraining) { _texDraining = true; _scheduleIdle(_drainTexQueue); }
    return null;
  }
  // Synchronous fallback (rec poster, NWW — single element, not bulk)
  if (textureCache.size >= TEXTURE_CACHE_MAX) textureCache.delete(textureCache.keys().next().value);
  const textures = generateFoldTextures();
  textureCache.set(key, textures);
  try { localStorage.setItem(TEXTURE_STORE_PREFIX + key, JSON.stringify(textures)); } catch {}
  return textures;
}

function renderStandardsSection() {
  const wrap = document.getElementById('standards-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  const standards = loadStandards();

  const header = document.createElement('div');
  header.className = 'standards-header';
  const title = document.createElement('span');
  title.className = 'standards-title';
  title.textContent = 'Reference Films';
  const count = document.createElement('span');
  count.className = 'standards-count';
  count.textContent = `${standards.length} / ${MAX_STANDARDS}`;
  const togglePersonaBtn = document.createElement('button');
  togglePersonaBtn.className = 'persona-hide-btn';
  togglePersonaBtn.textContent = isPersonaHidden() ? 'Show Persona' : 'Hide Persona';
  togglePersonaBtn.addEventListener('click', () => {
    setPersonaHidden(!isPersonaHidden());
    renderStandardsSection();
    renderPersonaSection();
  });
  header.appendChild(title);
  header.appendChild(count);
  if (PERSONA_ENABLED && standards.length > 0) header.appendChild(togglePersonaBtn);
  wrap.appendChild(header);

  const slots = document.createElement('div');
  slots.className = 'standards-slots';

  for (let i = 0; i < MAX_STANDARDS; i++) {
    const slot = document.createElement('div');
    slot.className = 'standards-slot';
    const movie = standards[i];

    if (movie) {
      slot.classList.add('filled');
      slot.dataset.title = movie.title;
      const img = document.createElement('img');
      img.src = movie.poster;
      img.alt = movie.title;
      img.title = `${movie.title} (${movie.year})`;
      img.draggable = false;
      slot.appendChild(img);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'standards-slot-remove';
      removeBtn.innerHTML = '✕';
      removeBtn.addEventListener('click', () => {
        const updated = loadStandards().filter(m => m.title !== movie.title);
        saveStandards(updated);
        // Move to front of collection so it appears first when returning
        const idx = movies.findIndex(m => m.title === movie.title);
        if (idx !== -1) {
          movies.unshift(movies.splice(idx, 1)[0]);
        } else {
          // Movie was dropped from movies[] by syncOrderFromDOM (pre-fix) — re-insert it
          movies.unshift({ title: movie.title, year: movie.year, director: movie.director, poster: movie.poster });
        }
        saveMovies();
        markDirty('collection');
        setGridView('collection');
        renderGridNav();
      });
      slot.appendChild(removeBtn);
    } else {
      slot.classList.add('empty');
      slot.innerHTML = '<span class="standards-slot-plus" style="pointer-events:none">★</span>';
    }

    slots.appendChild(slot);
  }

  wrap.appendChild(slots);

  // Drag-to-reorder within standards (Sortable loads async, attach when ready)
  _sortableReady.then(() => Sortable.create(slots, {
    draggable: '.standards-slot.filled',
    filter: '.standards-slot.empty',
    animation: 300,
    easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
    ghostClass: 'standards-slot-ghost',
    onEnd: () => {
      const ordered = [...slots.querySelectorAll('.standards-slot.filled')]
        .map(s => loadStandards().find(m => m.title === s.dataset.title))
        .filter(Boolean);
      // Append empties back at the end to keep slot count at MAX_STANDARDS
      saveStandards(ordered);
      renderPersonaSection();
    },
  }));

  // Track which slot is hovered during drag — actual save happens in SortableJS onEnd
  wrap.addEventListener('dragover', (e) => {
    if (!draggedCard) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const slot = e.target.closest('.standards-slot.empty');
    wrap.querySelectorAll('.standards-slot').forEach(s => s.classList.remove('drop-hover'));
    if (slot) {
      slot.classList.add('drop-hover');
      pendingStandardsSlot = slot;
    } else {
      pendingStandardsSlot = null;
    }
  });

  wrap.addEventListener('dragleave', (e) => {
    if (!wrap.contains(e.relatedTarget)) {
      wrap.querySelectorAll('.standards-slot').forEach(s => s.classList.remove('drop-hover'));
      // Do NOT clear pendingStandardsSlot here — dragleave fires before onEnd
      // and would erase the tracked slot before we can save it.
    }
  });
}

// ── Cinema Persona ───────────────────────────────────────────────────────────

const PERSONA_CACHE_KEY       = 'thecollection_persona_cache_v4';
const PERSONA_STATS_CACHE_KEY = 'thecollection_persona_stats_v2';
let personaIndex          = 0;
let personaBlobUrls       = [];
let personaRenderedForKey = null;

function getPersonaCacheKey(stds) {
  return stds.map(m => m.title).sort().join('|');
}

function getCollectionKey() {
  // Simple hash of the full collection for stats cache invalidation
  const str = movies.map(m => m.title).sort().join('|');
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = Math.imul(31, h) + str.charCodeAt(i) | 0; }
  return (h >>> 0).toString(36) + '_' + movies.length;
}

function loadPersonaCache() {
  try { return JSON.parse(localStorage.getItem(PERSONA_CACHE_KEY)) || null; } catch { return null; }
}

function savePersonaCache(key, data) {
  localStorage.setItem(PERSONA_CACHE_KEY, JSON.stringify({ key, data }));
}

function fetchPersonaImage(personas, idx) {
  if (personaBlobUrls[idx]) return; // already loaded or loading
  if (!isAiEnabled()) return;
  personaBlobUrls[idx] = 'loading';
  fetch('/api/persona-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: personas[idx].imagePrompt }),
  })
    .then(r => r.ok ? r.blob() : Promise.reject(r.status))
    .then(blob => {
      personaBlobUrls[idx] = URL.createObjectURL(blob);
      if (personaIndex === idx) applyPersonaImage();
    })
    .catch(err => { personaBlobUrls[idx] = null; console.warn('Persona image failed:', err); });
}

function applyPersonaImage() {
  const img = document.querySelector('.persona-room-img');
  if (!img) return;
  const url = personaBlobUrls[personaIndex];
  if (url && url !== 'loading') {
    img.classList.remove('loaded');
    img.src = url;
    img.onload = () => img.classList.add('loaded');
  }
}

function applyPersonaText(personas) {
  const p = personas[personaIndex];
  const overlay = document.querySelector('.persona-overlay');
  if (!overlay) return;
  overlay.style.opacity = '0';
  setTimeout(() => {
    overlay.querySelector('.persona-type').textContent        = p.type;
    overlay.querySelector('.persona-tagline').textContent    = `"${p.tagline}"`;
    overlay.querySelector('.persona-description').textContent = p.description;
    overlay.querySelector('.persona-label').textContent      = `Your Cinema Persona  ${personaIndex + 1} / ${personas.length}`;
    overlay.querySelectorAll('.persona-dot').forEach((d, i) => d.classList.toggle('active', i === personaIndex));
    overlay.style.opacity = '1';
    applyPersonaImage();
  }, 180);
}

function renderPersonaCard(wrap, personas) {
  personaBlobUrls = [];
  wrap.innerHTML = '';

  const p = personas[personaIndex];
  const card = document.createElement('div');
  card.className = 'persona-card';

  const imgWrap = document.createElement('div');
  imgWrap.className = 'persona-room-wrap';

  const img = document.createElement('img');
  img.className = 'persona-room-img';
  img.alt = '';
  img.draggable = false;

  // Nav arrows
  const btnPrev = document.createElement('button');
  btnPrev.className = 'persona-nav persona-nav-prev';
  btnPrev.innerHTML = '&#8592;';
  btnPrev.addEventListener('click', () => {
    personaIndex = (personaIndex - 1 + personas.length) % personas.length;
    applyPersonaText(personas);
    fetchPersonaImage(personas, personaIndex);
  });

  const btnNext = document.createElement('button');
  btnNext.className = 'persona-nav persona-nav-next';
  btnNext.innerHTML = '&#8594;';
  btnNext.addEventListener('click', () => {
    personaIndex = (personaIndex + 1) % personas.length;
    applyPersonaText(personas);
    fetchPersonaImage(personas, personaIndex);
  });

  const overlay = document.createElement('div');
  overlay.className = 'persona-overlay';
  overlay.style.transition = 'opacity 0.18s';

  const label = document.createElement('div');
  label.className = 'persona-label';
  label.textContent = `Your Cinema Persona  1 / ${personas.length}`;

  const type = document.createElement('div');
  type.className = 'persona-type';
  type.textContent = p.type;

  const tagline = document.createElement('div');
  tagline.className = 'persona-tagline';
  tagline.textContent = `"${p.tagline}"`;

  const desc = document.createElement('div');
  desc.className = 'persona-description';
  desc.textContent = p.description;

  // Dots
  const dots = document.createElement('div');
  dots.className = 'persona-dots';
  personas.forEach((_, i) => {
    const d = document.createElement('span');
    d.className = 'persona-dot' + (i === 0 ? ' active' : '');
    d.addEventListener('click', () => {
      personaIndex = i;
      applyPersonaText(personas);
      fetchPersonaImage(personas, personaIndex);
    });
    dots.appendChild(d);
  });

  const btnRefresh = document.createElement('button');
  btnRefresh.className = 'persona-refresh-btn';
  btnRefresh.title = 'Regenerate persona';
  btnRefresh.textContent = '↺';
  btnRefresh.addEventListener('click', () => renderPersonaSection(true));

  overlay.append(label, type, tagline, desc, dots);
  imgWrap.append(img, btnPrev, btnNext, overlay, btnRefresh);
  card.appendChild(imgWrap);
  wrap.appendChild(card);

  // Fetch all 4 images in parallel
  personas.forEach((_, i) => fetchPersonaImage(personas, i));

  // Stats panel
  const statsBar = document.createElement('div');
  statsBar.className = 'persona-stats-bar persona-stats-loading';
  statsBar.innerHTML = Array(4).fill('<div class="persona-stat-skel"></div>').join('');
  card.appendChild(statsBar);

  const statsKey = getCollectionKey();
  let statsCache;
  try { statsCache = JSON.parse(localStorage.getItem(PERSONA_STATS_CACHE_KEY)); } catch {}

  if (statsCache && statsCache.key === statsKey) {
    renderStatsBar(statsBar, statsCache.data);
  } else if (isAiEnabled()) {
    const films = movies.map(m => ({ title: m.title, year: m.year, director: m.director }));
    fetch('/api/persona-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ films }),
    })
      .then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(`${r.status}: ${t}`))))
      .then(data => {
        localStorage.setItem(PERSONA_STATS_CACHE_KEY, JSON.stringify({ key: statsKey, data }));
        renderStatsBar(statsBar, data);
      })
      .catch(err => {
        console.error('persona-stats error:', err);
        statsBar.classList.remove('persona-stats-loading');
        statsBar.innerHTML = '';
      });
  }
}

function renderStatsBar(bar, data) {
  const stats = [];

  if (data.topDirector) stats.push({ icon: '🎬', label: data.topDirector.name, sub: `${data.topDirector.films} films` });
  if (data.topActors?.length) data.topActors.slice(0, 2).forEach(a => stats.push({ icon: '🎭', label: a.name, sub: `${a.films} films` }));
  if (data.topDP)       stats.push({ icon: '📷', label: data.topDP.name, sub: `DP · ${data.topDP.films} films` });
  if (data.topComposer) stats.push({ icon: '🎼', label: data.topComposer.name, sub: `Score · ${data.topComposer.films} films` });
  if (data.topDecade)   stats.push({ icon: '📅', label: `${String(data.topDecade).slice(2)}s`, sub: 'top decade' });
  if (data.yearRange && data.span > 0) stats.push({ icon: '⏳', label: `${data.yearRange.from}–${data.yearRange.to}`, sub: `${data.span} year span` });

  bar.classList.remove('persona-stats-loading');
  if (!stats.length) { bar.innerHTML = `<div class="persona-stat-chip"><span class="persona-stat-icon">🎬</span><span class="persona-stat-label">Collection stats</span><span class="persona-stat-sub">${data.totalFilms} films</span></div>`; return; }

  bar.innerHTML = '';
  stats.forEach(({ icon, label, sub }) => {
    const chip = document.createElement('div');
    chip.className = 'persona-stat-chip';
    chip.innerHTML = `<span class="persona-stat-icon">${icon}</span><span class="persona-stat-label">${label}</span><span class="persona-stat-sub">${sub}</span>`;
    bar.appendChild(chip);
  });
}

function renderPersonaSection(force = false) {
  if (!PERSONA_ENABLED) return;
  const wrap = document.getElementById('persona-wrap');
  if (!wrap) return;

  if (isPersonaHidden()) { wrap.innerHTML = ''; return; }

  const standards = loadStandards();
  if (standards.length === 0) {
    if (personaRenderedForKey !== null) { wrap.innerHTML = ''; personaRenderedForKey = null; }
    return;
  }

  // Invalidate stats cache if collection changed
  try {
    const sc = JSON.parse(localStorage.getItem(PERSONA_STATS_CACHE_KEY));
    if (sc && sc.key !== getCollectionKey()) localStorage.removeItem(PERSONA_STATS_CACHE_KEY);
  } catch {}

  const cacheKey = getPersonaCacheKey(standards);

  // Don't re-render if already showing this exact set of reference films
  if (!force && cacheKey === personaRenderedForKey) return;

  personaIndex = 0;
  personaRenderedForKey = cacheKey;

  const cache = loadPersonaCache();
  if (!force && cache && cache.key === cacheKey) { renderPersonaCard(wrap, cache.data.personas); return; }

  // Without force, show a prompt card instead of auto-fetching
  if (!force) {
    if (!cache) {
      wrap.innerHTML = `
        <div class="persona-card persona-prompt">
          <button class="persona-generate-btn" id="persona-generate-btn">Generate Cinema Persona</button>
        </div>`;
      document.getElementById('persona-generate-btn').addEventListener('click', () => renderPersonaSection(true));
    } else {
      renderPersonaCard(wrap, cache.data.personas);
    }
    return;
  }

  // Loading skeleton
  wrap.innerHTML = `
    <div class="persona-card persona-loading">
      <div class="persona-room-wrap">
        <div class="persona-room-shimmer"></div>
        <div class="persona-overlay">
          <div class="persona-skel" style="width:120px;height:11px"></div>
          <div class="persona-skel" style="width:260px;height:28px;margin-top:8px"></div>
          <div class="persona-skel" style="width:340px;height:14px;margin-top:10px"></div>
          <div class="persona-skel" style="width:300px;height:14px;margin-top:6px"></div>
        </div>
      </div>
    </div>`;

  if (!isAiEnabled()) { wrap.innerHTML = ''; return; }
  fetch('/api/persona', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ standards }),
  })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => { savePersonaCache(cacheKey, data); renderPersonaCard(wrap, data.personas); })
    .catch(() => { wrap.innerHTML = ''; });
}

function toggleStandard(movie) {
  const stds = loadStandards();
  const idx = stds.findIndex(m => m.title === movie.title);
  if (idx !== -1) {
    stds.splice(idx, 1);
  } else {
    if (stds.length >= MAX_STANDARDS) return false;
    stds.push({ title: movie.title, year: movie.year, director: movie.director, poster: movie.poster });
  }
  saveStandards(stds);
  return true;
}

function render(list) {
  renderStandardsSection();
  renderPersonaSection();
  const g = getGrid('collection');
  g.innerHTML = '';
  const standardTitles = new Set(loadStandards().map(m => m.title));
  const nwData = loadNowWatching();
  const liveTitle = nwData ? nwData.title : null;
  const sessionedTitles = getSessionedTitles();
  const filteredList = list.filter(movie => !standardTitles.has(movie.title));
  const releasedMovies = filteredList.filter(m => !isFutureRelease(m));
  const upcomingMovies = filteredList.filter(m => isFutureRelease(m));
  [...releasedMovies, ...(upcomingMovies.length ? [null] : []), ...upcomingMovies].forEach(movie => {
    if (movie === null) { g.appendChild(makeReleaseDivider()); return; }
    const card = CardComponent.renderCard(movie, {
      view: 'collection',
      isLive: movie.title === liveTitle,
      hasSession: sessionedTitles.has(movie.title.toLowerCase()),
      onStarClick: () => {
        const ok = toggleStandard(movie);
        if (ok !== false) { render(sortedList(movies, 'collection')); applyGrain(); }
      },
    });
    g.appendChild(card);
  });
  if (!list.length) showEmptyState(g);
  markClean('collection');
}

const TMDB = 'https://image.tmdb.org/t/p/';
let currentRec = null;
let recLoading = false;
let recError   = null;
let sessionCost = 0;
let sessionSearches = 0;
let totalCost = 0; // initialized after TOTAL_COST_KEY is defined below
const sessionExcluded = new Set();
const REC_CACHE_KEY      = 'thecollection_rec_cache_v2';
const REC_MODEL_KEY      = 'thecollection_rec_model';
const REC_ENABLED_KEY    = 'thecollection_rec_enabled';
const STARTING_BAL_KEY   = 'thecollection_starting_balance';
const AI_ENABLED_KEY     = 'thecollection_ai_enabled';
const AI_BUFFER_KEY      = 'thecollection_ai_buffer';

function isRecEnabled() { return localStorage.getItem(REC_ENABLED_KEY) === '1'; }
function setRecEnabled(v) { localStorage.setItem(REC_ENABLED_KEY, v ? '1' : '0'); }
function isAiEnabled() { return localStorage.getItem(AI_ENABLED_KEY) === '1'; }
function setAiEnabled(v) { localStorage.setItem(AI_ENABLED_KEY, v ? '1' : '0'); }
function loadAiBuffer() { try { return JSON.parse(localStorage.getItem(AI_BUFFER_KEY) || '[]'); } catch { return []; } }
function saveAiBuffer(buf) { localStorage.setItem(AI_BUFFER_KEY, JSON.stringify(buf)); }

function getRecModel() {
  return localStorage.getItem(REC_MODEL_KEY) || 'sonnet';
}
function setRecModel(model) {
  localStorage.setItem(REC_MODEL_KEY, model);
}
const SHOWN_RECS_KEY  = 'thecollection_shown_recs_v1';
const MAX_SHOWN_RECS  = 20;

function loadShownRecs() {
  try { return JSON.parse(localStorage.getItem(SHOWN_RECS_KEY) || '[]'); } catch { return []; }
}
function saveShownRec(title) {
  try {
    const list = loadShownRecs().filter(t => t !== title.toLowerCase());
    list.unshift(title.toLowerCase());
    localStorage.setItem(SHOWN_RECS_KEY, JSON.stringify(list.slice(0, MAX_SHOWN_RECS)));
  } catch {}
}

function buildExcluded() {
  return new Set([
    ...movies.map(m => m.title.toLowerCase()),
    ...loadBanned().map(m => m.title.toLowerCase()),
    ...loadWatchlist().map(m => m.title.toLowerCase()),
    ...loadMaybe().map(m => m.title.toLowerCase()),
    ...loadMeh().map(m => m.title.toLowerCase()),
    ...loadStandards().map(m => m.title.toLowerCase()),
    ...[...sessionExcluded].map(t => t.toLowerCase()),
    ...loadShownRecs(),
  ]);
}

async function doFetchRec(excluded, attempt = 0) {
  if (attempt >= 3) throw new Error('max_retries');
  const res = await fetch('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      movies:    movies.map(({ title, year, director }) => ({ title, year, director })),
      excluded:  [...excluded],
      standards: loadStandards().map(({ title, year, director }) => ({ title, year, director })),
      banned:    loadBanned().map(({ title, year, director }) => ({ title, year, director })),
      model:     getRecModel(),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.error === 'out_of_credits') throw 'out_of_credits';
    if (body.error === 'invalid_rec') {
      if (body.title) sessionExcluded.add(body.title);
      return doFetchRec(buildExcluded(), attempt + 1);
    }
    throw new Error('api_error');
  }
  const rec = await res.json();
  if (rec?.title && excluded.has(rec.title.toLowerCase())) {
    sessionExcluded.add(rec.title);
    return doFetchRec(buildExcluded(), attempt + 1);
  }
  if (!rec?.title || !rec?.reason || rec.reason.toLowerCase().startsWith('placeholder')) {
    return doFetchRec(excluded, attempt + 1);
  }
  return rec;
}

// Prefetch: start API call immediately when user takes an action
let recPrefetchPromise = null;
let recFetchInFlight = false;
function prefetchNextRec() {
  recPrefetchPromise = doFetchRec(buildExcluded()).catch(() => null);
}

function loadRecCache() {
  try { return JSON.parse(localStorage.getItem(REC_CACHE_KEY)); } catch { return null; }
}
function saveRecCache(rec) {
  try { localStorage.setItem(REC_CACHE_KEY, JSON.stringify(rec)); } catch {}
}

async function fetchRecommendation() {
  // When AI master toggle or rec sub-toggle is off, show cached/disabled state
  if (!isAiEnabled() || !isRecEnabled()) {
    const cached = loadRecCache();
    if (cached?.title) {
      // Only exclude titles actually in user's lists, not shown-recs history
      const inLists = new Set([
        ...movies.map(m => m.title.toLowerCase()),
        ...loadBanned().map(m => m.title.toLowerCase()),
        ...loadWatchlist().map(m => m.title.toLowerCase()),
        ...loadMaybe().map(m => m.title.toLowerCase()),
        ...loadMeh().map(m => m.title.toLowerCase()),
      ]);
      if (!inLists.has(cached.title.toLowerCase())) currentRec = cached;
    }
    recLoading = false;
    renderRecommendation();
    return;
  }
  // Prevent concurrent fetches — if one is already in flight, ignore
  if (recFetchInFlight) return;
  recFetchInFlight = true;
  recError = null;

  // Show cached rec instantly if available and not already in any list
  const cached = loadRecCache();
  const excluded = buildExcluded();
  if (cached?.title && !excluded.has(cached.title.toLowerCase())) {
    currentRec = cached;
    recLoading = false;
    renderRecommendation();
  } else {
    currentRec = null;
    recLoading = true;
    renderRecommendation();
  }

  // Fetch fresh (use in-flight prefetch if available)
  try {
    const promise = recPrefetchPromise || doFetchRec(buildExcluded());
    recPrefetchPromise = null;
    const rec = await promise;
    const isPlaceholder = !rec?.title || rec?.reason === 'placeholder' || !rec?.reason;
    if (!isPlaceholder) {
      sessionExcluded.add(rec.title);
      saveShownRec(rec.title);
      rec._model = getRecModel();
      currentRec = rec;
      saveRecCache(rec);
      if (rec.api_cost != null) {
        sessionCost += rec.api_cost;
        sessionSearches++;
        totalCost += rec.api_cost;
        localStorage.setItem(TOTAL_COST_KEY, totalCost.toFixed(6)); schedulePush();
      }
    } else {
      recError = true;
    }
  } catch (e) {
    recError = e === 'out_of_credits' ? 'out_of_credits' : true;
  }

  recFetchInFlight = false;
  recLoading = false;
  renderRecommendation();
}


// Build the heading row once — never rebuilt, controls are stable DOM
function initRecHeading() {
  const wrap = document.getElementById('recommendation');

  const headingRow = document.createElement('div');
  headingRow.id = 'rec-heading-row';
  headingRow.className = 'rec-heading-row';

  const heading = document.createElement('div');
  heading.className = 'rec-heading';
  heading.innerHTML = '🎬 Something New To Watch Today?!';
  headingRow.appendChild(heading);

  // Enable checkbox — plain div wrapper avoids <label> browser quirks
  const enableWrap = document.createElement('div');
  enableWrap.className = 'rec-enable-label';
  const enabledCheckbox = document.createElement('input');
  enabledCheckbox.type = 'checkbox';
  enabledCheckbox.checked = isRecEnabled();
  enabledCheckbox.addEventListener('change', () => {
    setRecEnabled(enabledCheckbox.checked);
    renderRecommendation();
  });
  enableWrap.appendChild(enabledCheckbox);
  enableWrap.appendChild(document.createTextNode('Recommendations enabled'));
  headingRow.appendChild(enableWrap);

  // Model toggle
  const modelToggle = document.createElement('div');
  modelToggle.id = 'rec-model-toggle';
  modelToggle.className = 'rec-model-toggle';
  function refreshToggle() {
    const m = getRecModel();
    modelToggle.innerHTML = `
      <span class="rec-model-label ${m === 'sonnet' ? 'active' : ''}">Sonnet</span>
      <div class="rec-model-switch ${m === 'opus' ? 'on' : ''}">
        <div class="rec-model-knob"></div>
      </div>
      <span class="rec-model-label ${m === 'opus' ? 'active' : ''}">Opus</span>
    `;
  }
  refreshToggle();
  modelToggle.addEventListener('click', () => {
    const next = getRecModel() === 'sonnet' ? 'opus' : 'sonnet';
    setRecModel(next);
    refreshToggle();
    updateRecCostHint();
  });

  // Cost hint
  const costHint = document.createElement('span');
  costHint.id = 'rec-cost-hint';
  costHint.className = 'rec-cost-hint';

  const rightGroup = document.createElement('div');
  rightGroup.className = 'rec-right-group';
  rightGroup.appendChild(modelToggle);
  rightGroup.appendChild(costHint);
  headingRow.appendChild(rightGroup);
  wrap.appendChild(headingRow);

  // Stable content area — only this gets rebuilt by renderRecommendation()
  const contentArea = document.createElement('div');
  contentArea.id = 'rec-content-area';
  wrap.appendChild(contentArea);
}

function updateRecCostHint() {
  const hint = document.getElementById('rec-cost-hint');
  if (!hint) return;
  const currentModel = getRecModel();
  const perSearch = (currentRec?.api_cost != null && currentRec?._model === currentModel)
    ? `$${currentRec.api_cost.toFixed(4)}`
    : (currentModel === 'opus' ? '~$0.08' : '~$0.02');
  const parts = [`${perSearch} / search`];
  if (sessionSearches > 0) parts.push(`<span class="rec-cost-session">$${sessionCost.toFixed(4)} session (${sessionSearches})</span>`);
  if (totalCost > 0) parts.push(`<span class="rec-cost-total">$${totalCost.toFixed(4)} total</span>`);
  const startingBal = parseFloat(localStorage.getItem(STARTING_BAL_KEY) || '') || null;
  if (startingBal !== null) {
    const remaining = startingBal - totalCost;
    parts.push(`<span class="rec-cost-remaining ${remaining < 1 ? 'rec-cost-low' : ''}">$${remaining.toFixed(2)} remaining</span>`);
  }
  hint.innerHTML = parts.join(' &nbsp;·&nbsp; ');
}

function renderRecommendation() {
  const area = document.getElementById('rec-content-area');
  if (!area) return;
  area.innerHTML = '';
  updateRecCostHint();

  if (recLoading) {
    const loadingBanner = document.createElement('div');
    loadingBanner.className = 'rec-banner rec-banner-loading';
    loadingBanner.innerHTML = `
      <div class="rec-skel-content">
        <div class="rec-poster-col">
          <div class="rec-skel-poster"></div>
          <div class="rec-poster-buttons">
            <div class="rec-skel-bar" style="height:36px;border-radius:8px"></div>
            <div class="rec-skel-bar" style="height:36px;border-radius:8px;margin-top:6px"></div>
          </div>
        </div>
        <div class="rec-skel-info">
          <div class="rec-skel-bar" style="width:62%;height:52px;border-radius:6px"></div>
          <div class="rec-skel-bar" style="width:30%;height:13px;margin-top:12px"></div>
          <div class="rec-skel-bar" style="width:100%;height:12px;margin-top:20px"></div>
          <div class="rec-skel-bar" style="width:97%;height:12px;margin-top:7px"></div>
          <div class="rec-skel-bar" style="width:90%;height:12px;margin-top:7px"></div>
          <div class="rec-skel-bar" style="width:74%;height:12px;margin-top:7px"></div>
          <div class="rec-skel-bar" style="width:40%;height:10px;margin-top:18px"></div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <div class="rec-skel-bar" style="width:68px;height:24px;border-radius:6px"></div>
            <div class="rec-skel-bar" style="width:52px;height:24px;border-radius:6px"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:auto;padding-top:24px">
            <div class="rec-skel-bar" style="width:138px;height:36px;border-radius:8px"></div>
            <div class="rec-skel-bar" style="width:96px;height:36px;border-radius:8px"></div>
            <div class="rec-skel-bar" style="width:68px;height:36px;border-radius:8px"></div>
            <div class="rec-skel-bar" style="width:132px;height:36px;border-radius:8px"></div>
          </div>
        </div>
        <div class="rec-skel-stills">
          <div class="rec-skel-bar" style="width:540px;height:100%;border-radius:0;flex-shrink:0"></div>
          <div class="rec-skel-bar" style="width:540px;height:100%;border-radius:0;flex-shrink:0"></div>
        </div>
      </div>`;
    area.appendChild(loadingBanner);
    return;
  }

  if (recError) {
    const errorBanner = document.createElement('div');
    errorBanner.className = 'rec-banner rec-banner-error';
    const msg = document.createElement('span');
    msg.textContent = recError === 'out_of_credits'
      ? 'Out of API credits. Top up at console.anthropic.com to get recommendations.'
      : 'Could not load recommendation.';
    errorBanner.appendChild(msg);
    const retryBtn = document.createElement('button');
    retryBtn.className = 'rec-btn rec-btn-secondary';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', fetchRecommendation);
    errorBanner.appendChild(retryBtn);
    area.appendChild(errorBanner);
    return;
  }

  if (!currentRec) return;

  const rec = currentRec;

  const bg = document.createElement('div');
  bg.className = 'rec-bg';
  bg.style.backgroundImage = `url(${rec.poster})`;

  const overlay = document.createElement('div');
  overlay.className = 'rec-overlay';

  const content = document.createElement('div');
  content.className = 'rec-content';

  const textures = getCachedTextures(rec.title + '__rec');
  const posterWrap = document.createElement('div');
  posterWrap.className = 'rec-poster-wrap';

  const img = document.createElement('img');
  img.className = 'rec-poster';
  img.src = rec.poster;
  img.alt = rec.title;

  const hlDiv = document.createElement('div');
  hlDiv.className = 'poster-texture poster-texture-hl';
  hlDiv.style.backgroundImage = `url(${textures.hl})`;

  const shDiv = document.createElement('div');
  shDiv.className = 'poster-texture poster-texture-sh';
  shDiv.style.backgroundImage = `url(${textures.sh})`;

  posterWrap.appendChild(img);
  posterWrap.appendChild(hlDiv);
  posterWrap.appendChild(shDiv);

  const info = document.createElement('div');
  info.className = 'rec-info';

  const title = document.createElement('span');
  title.className = 'rec-title';
  title.textContent = rec.title;

  const meta = document.createElement('span');
  meta.className = 'rec-meta';
  meta.textContent = [rec.director, rec.year].filter(Boolean).join(', ');

  const reason = document.createElement('p');
  reason.className = 'rec-reason';
  reason.textContent = rec.reason;

  const writtenBy = document.createElement('span');
  writtenBy.className = 'rec-writers';
  if (rec.writers && rec.writers.length) {
    writtenBy.textContent = `Screenplay · ${rec.writers.join(', ')}`;
  }

  const ratings = document.createElement('div');
  ratings.className = 'rec-ratings';

  if (rec.imdb_rating && rec.imdb_id) {
    const imdbLink = document.createElement('a');
    imdbLink.className = 'rec-rating-link';
    imdbLink.href = `https://www.imdb.com/title/${rec.imdb_id}`;
    imdbLink.target = '_blank';
    imdbLink.rel = 'noopener noreferrer';
    imdbLink.innerHTML = `<span class="rec-rating-logo rec-rating-logo-imdb">IMDb</span><span class="rec-rating-score">⭐ ${rec.imdb_rating}</span>`;
    ratings.appendChild(imdbLink);
  }

  if (rec.rt_score) {
    const rtPct = parseInt(rec.rt_score);
    // Certified Fresh: 75%+ score (OMDB doesn't expose review count so we use score only)
    const RT_FRESH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20" height="20">
      <ellipse cx="50" cy="62" rx="32" ry="30" fill="#e8312a"/>
      <ellipse cx="50" cy="60" rx="30" ry="28" fill="#cc2200"/>
      <ellipse cx="44" cy="52" rx="10" ry="14" fill="rgba(255,255,255,0.18)" transform="rotate(-20,44,52)"/>
      <path d="M50 32 C50 32 46 18 38 14 C42 22 40 30 40 30" fill="#3a7d44"/>
      <path d="M50 32 C50 32 54 16 64 15 C58 24 56 30 56 30" fill="#4a9e55"/>
      <path d="M50 32 C48 28 44 26 40 30 C44 28 50 32 50 32 C50 32 56 28 60 30 C56 26 52 28 50 32Z" fill="#2d6e3a"/>
    </svg>`;
    const RT_CERTIFIED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20" height="20">
      <circle cx="50" cy="54" r="38" fill="#e8c52a"/>
      <circle cx="50" cy="54" r="30" fill="#e8312a"/>
      <ellipse cx="50" cy="52" rx="28" ry="27" fill="#cc2200"/>
      <ellipse cx="43" cy="43" rx="9" ry="12" fill="rgba(255,255,255,0.18)" transform="rotate(-20,43,43)"/>
      <path d="M50 26 C50 26 46 12 38 8 C42 16 40 24 40 24" fill="#3a7d44"/>
      <path d="M50 26 C50 26 54 10 64 9 C58 18 56 24 56 24" fill="#4a9e55"/>
      <path d="M50 26 C48 22 44 20 40 24 C44 22 50 26 50 26 C50 26 56 22 60 24 C56 20 52 22 50 26Z" fill="#2d6e3a"/>
      <path d="M28 68 Q50 76 72 68" stroke="#3a7d44" stroke-width="6" fill="none" stroke-linecap="round"/>
    </svg>`;
    const RT_ROTTEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="20" height="20">
      <path d="M50 20 C30 20 15 35 18 52 C20 62 15 70 20 78 C28 88 45 88 55 82 C65 76 80 78 85 68 C90 58 85 42 78 34 C70 24 60 20 50 20Z" fill="#8cb800"/>
      <path d="M50 22 C32 22 18 36 20 52 C22 62 17 69 22 77 C29 86 44 86 54 80 C63 74 78 76 83 67 C87 57 83 42 76 35 C68 26 59 22 50 22Z" fill="#a8d400"/>
      <ellipse cx="42" cy="45" rx="8" ry="11" fill="rgba(255,255,255,0.15)" transform="rotate(-15,42,45)"/>
    </svg>`;

    const rtIcon = rtPct >= 75 ? RT_CERTIFIED_SVG : rtPct >= 60 ? RT_FRESH_SVG : RT_ROTTEN_SVG;
    const rtLink = document.createElement('a');
    rtLink.className = 'rec-rating-link';
    rtLink.href = `https://www.rottentomatoes.com/search?search=${encodeURIComponent(rec.title)}`;
    rtLink.target = '_blank';
    rtLink.rel = 'noopener noreferrer';
    rtLink.innerHTML = `<span class="rec-rating-rt-icon">${rtIcon}</span><span class="rec-rating-score">${rec.rt_score}</span>`;
    ratings.appendChild(rtLink);
  }


  const ICON_CHECK   = `<svg viewBox="0 0 16 16" fill="none" width="14" height="14"><circle cx="8" cy="8" r="7" fill="rgba(60,200,100,0.25)"/><path d="M4.5 8.5l2.5 2.5 4.5-5" stroke="#3dc864" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_X       = `<svg viewBox="0 0 16 16" fill="none" width="14" height="14"><circle cx="8" cy="8" r="7" fill="rgba(255,80,80,0.2)"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="rgba(255,100,100,0.9)" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const ICON_REFRESH = `<svg viewBox="0 0 16 16" fill="none" width="14" height="14"><path d="M13 8A5 5 0 1 1 8 3a5 5 0 0 1 3.54 1.46L13 6" stroke="rgba(255,255,255,0.7)" stroke-width="1.6" stroke-linecap="round"/><path d="M13 3v3h-3" stroke="rgba(255,255,255,0.7)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_DICE    = `<svg viewBox="0 0 16 16" fill="none" width="14" height="14"><rect x="2" y="2" width="12" height="12" rx="2.5" stroke="rgba(180,140,255,0.85)" stroke-width="1.6"/><circle cx="5.5" cy="5.5" r="1" fill="rgba(180,140,255,0.85)"/><circle cx="10.5" cy="5.5" r="1" fill="rgba(180,140,255,0.85)"/><circle cx="8" cy="8" r="1" fill="rgba(180,140,255,0.85)"/><circle cx="5.5" cy="10.5" r="1" fill="rgba(180,140,255,0.85)"/><circle cx="10.5" cy="10.5" r="1" fill="rgba(180,140,255,0.85)"/></svg>`;

  const watchBtn = document.createElement('button');
  watchBtn.className = 'rec-btn rec-btn-watchlist';
  const alreadyWatchlisted = loadWatchlist().some(m => m.title === rec.title);
  watchBtn.innerHTML = `${ICON_CHECK}<span>${alreadyWatchlisted ? 'On watchlist' : 'Add to watchlist'}</span>`;
  watchBtn.addEventListener('click', () => {
    prefetchNextRec();
    const list = loadWatchlist();
    if (!list.some(m => m.title === rec.title)) {
      list.unshift({ title: rec.title, year: rec.year, director: rec.director, poster: rec.poster, addedAt: Date.now() });
      saveWatchlist(list);
    }
    setGridView('watchlist');
    fetchRecommendation();
  });

  const newBtn = document.createElement('button');
  newBtn.className = 'rec-btn rec-btn-secondary';
  newBtn.innerHTML = `${ICON_REFRESH}<span>One more try</span>`;
  newBtn.addEventListener('click', () => { prefetchNextRec(); fetchRecommendation(); });

  const banBtn = document.createElement('button');
  banBtn.className = 'rec-btn rec-btn-ban';
  banBtn.innerHTML = `${ICON_X}<span>Don't recommend</span>`;
  banBtn.addEventListener('click', () => {
    prefetchNextRec();
    saveSnapshot(`Before banning "${rec.title}"`);
    const list = loadBanned();
    list.unshift({ title: rec.title, year: rec.year, director: rec.director, poster: rec.poster, addedAt: Date.now() });
    saveBanned(list);
    renderGridNav();
    fetchRecommendation();
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'rec-btn rec-btn-primary';
  addBtn.textContent = 'Already Seen';
  addBtn.addEventListener('click', () => {
    prefetchNextRec();
    movies.unshift({ title: rec.title, year: rec.year, director: rec.director, poster: rec.poster, addedAt: Date.now() });
    saveMovies();
    render(movies);
    applyGrain();
    fetchRecommendation();
  });

  const maybeBtn = document.createElement('button');
  maybeBtn.className = 'rec-btn rec-btn-maybe';
  const alreadyMaybe = loadMaybe().some(m => m.title === rec.title);
  maybeBtn.innerHTML = `${ICON_DICE}<span>${alreadyMaybe ? 'In Wildcard' : 'Wildcard'}</span>`;
  maybeBtn.addEventListener('click', () => {
    prefetchNextRec();
    const list = loadMaybe();
    if (!list.some(m => m.title === rec.title)) {
      list.unshift({ title: rec.title, year: rec.year, director: rec.director, poster: rec.poster, addedAt: Date.now() });
      saveMaybe(list);
    }
    renderGridNav();
    fetchRecommendation();
  });

  const mehBtn = document.createElement('button');
  mehBtn.className = 'rec-btn rec-btn-meh';
  const alreadyMeh = loadMeh().some(m => m.title === rec.title);
  mehBtn.innerHTML = `<span>${alreadyMeh ? '😐 In Meh' : '😐 Meh'}</span>`;
  mehBtn.addEventListener('click', () => {
    prefetchNextRec();
    saveSnapshot(`Before adding "${rec.title}" to Meh`);
    const list = loadMeh();
    if (!list.some(m => m.title === rec.title)) {
      list.unshift({ title: rec.title, year: rec.year, director: rec.director, poster: rec.poster, addedAt: Date.now() });
      saveMeh(list);
    }
    renderGridNav();
    fetchRecommendation();
  });

  const posterButtons = document.createElement('div');
  posterButtons.className = 'rec-poster-buttons';
  posterButtons.appendChild(addBtn);
  posterButtons.appendChild(newBtn);

  const posterCol = document.createElement('div');
  posterCol.className = 'rec-poster-col';
  posterCol.appendChild(posterWrap);
  posterCol.appendChild(posterButtons);

  info.appendChild(title);
  info.appendChild(meta);
  info.appendChild(reason);
  info.appendChild(writtenBy);
  info.appendChild(ratings);

  const infoButtons = document.createElement('div');
  infoButtons.className = 'rec-info-buttons';
  infoButtons.appendChild(watchBtn);
  infoButtons.appendChild(maybeBtn);
  infoButtons.appendChild(mehBtn);
  infoButtons.appendChild(banBtn);
  info.appendChild(infoButtons);

  const stills = document.createElement('div');
  stills.className = 'rec-stills';
  (rec.stills || []).forEach(path => {
    const still = document.createElement('img');
    still.className = 'rec-still';
    still.src = `${TMDB}w780${path}`;
    still.alt = '';
    still.draggable = false;
    stills.appendChild(still);
  });

  content.appendChild(posterCol);
  content.appendChild(info);
  content.appendChild(stills);

  const banner = document.createElement('div');
  banner.className = 'rec-banner';
  if (!isAiEnabled() || !isRecEnabled()) banner.classList.add('rec-banner-disabled');
  banner.appendChild(bg);
  banner.appendChild(overlay);
  banner.appendChild(content);

  area.appendChild(banner);
  applyGrain();
}

// Persistence
const STORAGE_KEY    = 'thecollection_movies';
const BANNED_KEY     = 'thecollection_banned';
const WATCHLIST_KEY  = 'thecollection_watchlist';
const MAYBE_KEY      = 'thecollection_maybe';
const MEH_KEY        = 'thecollection_meh';
const SNAPSHOTS_KEY  = 'thecollection_snapshots';
const STANDARDS_KEY  = 'thecollection_standards';
const TOTAL_COST_KEY      = 'thecollection_total_cost';
const TASTE_SIGNALS_KEY     = 'thecollection_taste_signals';
const WATCH_LOG_KEY         = 'thecollection_watch_log';
const ANTICIPATED_KEY       = 'thecollection_anticipated';
const WTW_COUNTRY_KEY       = 'thecollection_wtw_country';
totalCost = parseFloat(localStorage.getItem(TOTAL_COST_KEY) || '0') || 0;

const diary = {
  layout:            document.getElementById('movies-layout'),
  panel:             document.getElementById('watch-diary-panel'),
  toggleBtn:         document.getElementById('watch-diary-toggle'),
  closeBtn:          document.getElementById('watch-diary-close'),
  confirmBackdrop:   document.getElementById('watch-diary-confirm-backdrop'),
  confirmCancel:     document.getElementById('watch-diary-confirm-cancel'),
  confirmDelete:     document.getElementById('watch-diary-confirm-delete'),
  tabs:              document.getElementById('watch-diary-tabs'),
  toolbar:           document.getElementById('watch-diary-toolbar'),
  tabLog:            document.getElementById('watch-diary-tab-log'),
  tabJournal:        document.getElementById('watch-diary-tab-journal'),
  reenrichBtn:       document.getElementById('watch-journal-reenrich-btn'),
  logPanel:          document.getElementById('watch-diary-log-panel'),
  journalPanel:      document.getElementById('watch-diary-journal-panel'),
  composer:          document.getElementById('nww-diary-composer'),
  composerToggle:    document.getElementById('nww-diary-composer-toggle'),
  form:              document.getElementById('nww-diary-form'),
  formGrid:          document.querySelector('#nww-diary-form .nww-diary-form-grid'),
  titleInput:        document.getElementById('nww-diary-title-input'),
  searchResults:     document.getElementById('nww-diary-search-results'),
  seasonField:       document.getElementById('nww-diary-season-field'),
  seasonInput:       document.getElementById('nww-diary-season-input'),
  singleEpisodeField: document.getElementById('nww-diary-single-episode-field'),
  singleEpisodeInput: document.getElementById('nww-diary-single-episode-input'),
  episodeFromField:  document.getElementById('nww-diary-episode-from-field'),
  episodeFromInput:  document.getElementById('nww-diary-episode-from-input'),
  episodeToField:    document.getElementById('nww-diary-episode-to-field'),
  episodeToInput:    document.getElementById('nww-diary-episode-to-input'),
  statusInput:       document.getElementById('nww-diary-status-input'),
  watchedAtInput:    document.getElementById('nww-diary-watched-at-input'),
  timestampInput:    document.getElementById('nww-diary-timestamp-input'),
  noteInput:         document.getElementById('nww-diary-note-input'),
  rewatchInput:      document.getElementById('nww-diary-rewatch-input'),
  submit:            document.getElementById('nww-diary-submit'),
  entries:           document.getElementById('nww-diary-entries'),
  entryTemplate:     document.getElementById('nww-diary-entry-template'),
  journalList:       document.getElementById('watch-journal-list'),
  isOpen: false,
  activeTab: 'log',
  selectedResult: null,
  searchDebounce: null,
  tvRequestToken: 0,
  reenrichInFlight: false,
  pendingDeleteId: null,
  composerOpen: false,
};

// ── Supabase sync ─────────────────────────────────────────────────────────────
// Hydrate localStorage from Supabase on load, then push changes back debounced.

let _syncDebounce = null;

async function supabasePush() {
  const token = await getAuthToken().catch(() => null);
  if (!token) return;
  const payload = {
    movies:     JSON.parse(localStorage.getItem(STORAGE_KEY)   || '[]'),
    watchlist:  JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'),
    maybe:      JSON.parse(localStorage.getItem(MAYBE_KEY)     || '[]'),
    meh:        JSON.parse(localStorage.getItem(MEH_KEY)       || '[]'),
    banned:     JSON.parse(localStorage.getItem(BANNED_KEY)    || '[]'),
    standards:  JSON.parse(localStorage.getItem(STANDARDS_KEY) || '[]'),
    watch_log:  JSON.parse(localStorage.getItem(WATCH_LOG_KEY)  || '[]'),
    total_cost: parseFloat(localStorage.getItem(TOTAL_COST_KEY) || '0') || 0,
  };
  fetch('/api/user-data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function schedulePush() {
  clearTimeout(_syncDebounce);
  _syncDebounce = setTimeout(supabasePush, 2000);
}

// Returns true if cloud data was written to localStorage (caller should re-render).
async function supabaseHydrate() {
  const token = await getAuthToken().catch(() => null);
  if (!token) return false;
  try {
    const res = await fetch('/api/user-data', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    let changed = false;
    const set = (key, val) => { if (val !== undefined) { localStorage.setItem(key, JSON.stringify(val)); changed = true; } };
    set(STORAGE_KEY,    data.movies);
    set(WATCHLIST_KEY,  data.watchlist);
    set(MAYBE_KEY,      data.maybe);
    set(MEH_KEY,        data.meh);
    set(BANNED_KEY,     data.banned);
    set(STANDARDS_KEY,  data.standards);
    set(WATCH_LOG_KEY,  data.watch_log);
    if (data.total_cost !== undefined) { localStorage.setItem(TOTAL_COST_KEY, String(data.total_cost)); changed = true; }
    return changed;
  } catch(e) { return false; }
}
const MAX_SNAPSHOTS  = 20;
const MAX_STANDARDS  = 12;

function loadStandards() { try { return JSON.parse(localStorage.getItem(STANDARDS_KEY) || '[]'); } catch(e) { return []; } }
function saveStandards(list) { localStorage.setItem(STANDARDS_KEY, JSON.stringify(list)); schedulePush(); }

function saveSnapshot(label = '') {
  const snap = {
    ts:        Date.now(),
    label:     label || new Date().toLocaleString(),
    movies:    JSON.parse(localStorage.getItem(STORAGE_KEY)   || '[]'),
    watchlist: JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'),
    maybe:     JSON.parse(localStorage.getItem(MAYBE_KEY)     || '[]'),
    meh:       JSON.parse(localStorage.getItem(MEH_KEY)       || '[]'),
    banned:    JSON.parse(localStorage.getItem(BANNED_KEY)    || '[]'),
    standards: JSON.parse(localStorage.getItem(STANDARDS_KEY) || '[]'),
    watch_log: JSON.parse(localStorage.getItem(WATCH_LOG_KEY) || '[]'),
    totalCost: totalCost,
  };
  const snapshots = loadSnapshots();
  snapshots.unshift(snap);
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)));
  fetch('/api/snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snap),
  }).then(r => { if (!r.ok) r.text().then(t => console.error('Snapshot API error:', t)); })
    .catch(e => console.error('Snapshot fetch failed:', e));
}

function loadSnapshots() {
  try { return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]'); } catch(e) { return []; }
}

function restoreSnapshot(snap) {
  localStorage.setItem(STORAGE_KEY,   JSON.stringify(snap.movies));
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(snap.watchlist));
  localStorage.setItem(MAYBE_KEY,     JSON.stringify(snap.maybe));
  localStorage.setItem(MEH_KEY,       JSON.stringify(snap.meh || []));
  localStorage.setItem(BANNED_KEY,    JSON.stringify(snap.banned));
  if (snap.standards) localStorage.setItem(STANDARDS_KEY, JSON.stringify(snap.standards));
  localStorage.setItem(WATCH_LOG_KEY, JSON.stringify(snap.watch_log || snap.watchLog || []));
  if (snap.totalCost != null) {
    totalCost = snap.totalCost;
    localStorage.setItem(TOTAL_COST_KEY, totalCost.toFixed(6));
  }
  movies.splice(0, movies.length, ...snap.movies);
  VIEWS.forEach(v => markDirty(v));
  setGridView(gridView);
  renderGridNav();
  renderStandardsSection();
  renderPersonaSection();
  renderWatchDiary();
}

function createWatchLogId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'watchlog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function loadWatchLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WATCH_LOG_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWatchLog(entries) {
  localStorage.setItem(WATCH_LOG_KEY, JSON.stringify(entries));
  schedulePush();
  renderWatchDiary();
}

function sortWatchLog(entries) {
  return entries.slice().sort((a, b) => {
    const aWatchTs = Date.parse(a.watchedAt || a.startedAt || a.createdAt || 0) || 0;
    const bWatchTs = Date.parse(b.watchedAt || b.startedAt || b.createdAt || 0) || 0;
    if (bWatchTs !== aWatchTs) return bWatchTs - aWatchTs;

    const aCreatedTs = Date.parse(a.startedAt || a.createdAt || a.updatedAt || 0) || 0;
    const bCreatedTs = Date.parse(b.startedAt || b.createdAt || b.updatedAt || 0) || 0;
    return bCreatedTs - aCreatedTs;
  });
}

function upsertWatchLogEntry(entry) {
  const entries = loadWatchLog();
  const index = entries.findIndex((item) => item.id === entry.id);
  const next = {
    ...entry,
    updatedAt: new Date().toISOString(),
  };
  if (index >= 0) entries[index] = next;
  else entries.unshift(next);
  saveWatchLog(sortWatchLog(entries));
  return next;
}

function deleteWatchLogEntry(id) {
  const next = loadWatchLog().filter((entry) => entry.id !== id);
  saveWatchLog(next);
}

function getActiveDiaryEntry(data) {
  if (!data || !data.diaryEntryId) return null;
  return loadWatchLog().find((entry) => entry.id === data.diaryEntryId) || null;
}

function ensureDiaryDraftFromSession(data) {
  if (!data) return null;
  const existing = getActiveDiaryEntry(data);
  if (existing) return existing;

  const entry = upsertWatchLogEntry({
    id: createWatchLogId(),
    title: data.title,
    year: data.year,
    director: data.director,
    poster: data.poster,
    startedAt: new Date().toISOString(),
    watchedAt: new Date().toISOString(),
    status: 'timestamp',
    timestampMs: 0,
    note: '',
    source: 'nww',
    rewatch: false,
  });
  data.diaryEntryId = entry.id;
  saveNowWatching(data);
  return entry;
}

function updateDiaryEntryFromSession(data, patch) {
  if (!data) return null;
  const base = ensureDiaryDraftFromSession(data);
  if (!base) return null;
  return upsertWatchLogEntry({
    ...base,
    title: data.title,
    year: data.year,
    director: data.director,
    poster: data.poster,
    watchedAt: patch.watchedAt || new Date().toISOString(),
    ...patch,
  });
}

function formatDiaryDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function loadTasteSignals() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASTE_SIGNALS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTasteSignals(signals) {
  localStorage.setItem(TASTE_SIGNALS_KEY, JSON.stringify(signals));
  renderSessionJournal();
  updateWatchDiaryToolbar();
  schedulePush();
}

function deleteTasteSignal(timestamp) {
  const next = loadTasteSignals().filter((signal) => signal.timestamp !== timestamp);
  saveTasteSignals(next);
}

function hasExtractedTasteSignals(llmSignals) {
  if (!llmSignals || typeof llmSignals !== 'object') return false;
  return Object.values(llmSignals).some((value) => Array.isArray(value) && value.length);
}

function canReenrichTasteSignal(signal) {
  return Array.isArray(signal?.chat_history)
    && signal.chat_history.length >= 2
    && !hasExtractedTasteSignals(signal.llm_signals);
}

function getReenrichableTasteSignals(signals = loadTasteSignals()) {
  return signals.filter(canReenrichTasteSignal);
}

async function requestTasteSignalExtraction(signal) {
  const res = await fetch('/api/companion-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'extract',
      title: signal.title,
      year: signal.year,
      director: signal.director,
      decision: signal.decision,
      chat_history: signal.chat_history || [],
      facts: signal.facts || [],
    }),
  });
  const json = res.ok ? await res.json() : null;
  return json?.signals || null;
}

function updateWatchDiaryToolbar() {
  const toolbar = diary.toolbar;
  const button = diary.reenrichBtn;
  if (!toolbar || !button) return;

  const count = diary.activeTab === 'journal' ? getReenrichableTasteSignals().length : 0;
  const show = diary.activeTab === 'journal' && count > 0;

  toolbar.hidden = !show;
  button.hidden = !show;
  button.disabled = diary.reenrichInFlight;
  button.textContent = diary.reenrichInFlight
    ? 'Re-enriching signals…'
    : `Re-enrich signals (${count})`;
}

async function reenrichMissingTasteSignals() {
  if (diary.reenrichInFlight) return;

  const signals = loadTasteSignals();
  const eligible = getReenrichableTasteSignals(signals);
  if (!eligible.length) {
    updateWatchDiaryToolbar();
    return;
  }

  diary.reenrichInFlight = true;
  updateWatchDiaryToolbar();

  let changed = false;
  for (const signal of eligible) {
    try {
      const extracted = await requestTasteSignalExtraction(signal);
      if (!extracted) continue;
      const entry = signals.find((item) => item.timestamp === signal.timestamp);
      if (!entry) continue;
      entry.llm_signals = extracted;
      changed = true;
    } catch {}
  }

  diary.reenrichInFlight = false;
  if (changed) {
    saveTasteSignals(signals);
  } else {
    updateWatchDiaryToolbar();
  }
}

function formatDiaryDateInput(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getDiaryDayKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDiaryGroupDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatSignalDecision(decision) {
  return ({
    collection: 'Added to Collection',
    meh: 'Marked Meh',
    banned: "Don't Recommend",
  })[decision] || decision || 'Unknown';
}

function formatWatchDuration(signal) {
  const watched = signal.watch_duration_min;
  const runtime = signal.runtime_min;
  if (watched && runtime) return `Watched ${watched} of ${runtime} min`;
  if (watched) return `Watched ${watched} min`;
  return 'Duration unavailable';
}

function renderSignalTags(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return `<div class="watch-journal-tags">${items.map((item) => `<span class="watch-journal-tag">${item}</span>`).join('')}</div>`;
}

function formatDiaryTimestamp(ms) {
  return nwwFormatTime(ms || 0);
}

function parseDiaryTimestampInput(value) {
  return value ? nwwParseTime(value.trim()) : null;
}

function formatDiaryEpisodeCode(seasonNumber, episodeNumber) {
  if (!seasonNumber || !episodeNumber) return '';
  return `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
}

function formatDiaryEpisodeSpan(seasonNumber, fromEpisodeNumber, toEpisodeNumber = fromEpisodeNumber) {
  if (!seasonNumber || !fromEpisodeNumber) return '';
  if (!toEpisodeNumber || toEpisodeNumber === fromEpisodeNumber) {
    return formatDiaryEpisodeCode(seasonNumber, fromEpisodeNumber);
  }
  return `S${String(seasonNumber).padStart(2, '0')}E${String(fromEpisodeNumber).padStart(2, '0')}–E${String(toEpisodeNumber).padStart(2, '0')}`;
}

function resetDiarySeriesFields() {
  if (diary.formGrid) diary.formGrid.classList.remove('is-tv');
  if (diary.seasonInput) {
    diary.seasonInput.innerHTML = '<option value="">Choose season</option>';
    diary.seasonInput.disabled = true;
  }
  if (diary.singleEpisodeInput) diary.singleEpisodeInput.checked = false;
  if (diary.episodeFromInput) {
    diary.episodeFromInput.innerHTML = '<option value="">Choose start episode</option>';
    diary.episodeFromInput.disabled = true;
  }
  if (diary.episodeToInput) {
    diary.episodeToInput.innerHTML = '<option value="">Choose end episode</option>';
    diary.episodeToInput.disabled = true;
  }
  setDiaryEpisodeRangeVisibility();
}

function setDiarySeriesFieldsVisibility(isTv) {
  if (diary.formGrid) diary.formGrid.classList.toggle('is-tv', !!isTv);
  if (!isTv) {
    resetDiarySeriesFields();
    return;
  }
  if (diary.seasonInput) diary.seasonInput.disabled = false;
  setDiaryEpisodeRangeVisibility();
}

function setDiaryEpisodeRangeVisibility() {
  const isSingle = !!diary.singleEpisodeInput?.checked;
  diary.episodeToField?.classList.toggle('is-hidden', isSingle);
  if (diary.episodeToInput) diary.episodeToInput.disabled = isSingle || diary.episodeToInput.dataset.loading === 'true';
}

function getDiaryEpisodeOptionLabel(seasonNumber, episode) {
  return `${formatDiaryEpisodeCode(seasonNumber, episode.episode_number)} · ${episode.name || 'Untitled episode'}`;
}

async function loadDiaryTvEpisodes(tmdbId, seasonNumber, selectedFromEpisodeNumber = null, selectedToEpisodeNumber = null) {
  if (!diary.episodeFromInput || !diary.episodeToInput || !tmdbId || !seasonNumber) return;
  const token = ++diary.tvRequestToken;
  diary.episodeFromInput.disabled = true;
  diary.episodeToInput.disabled = true;
  diary.episodeToInput.dataset.loading = 'true';
  diary.episodeFromInput.innerHTML = '<option value="">Loading episodes…</option>';
  diary.episodeToInput.innerHTML = '<option value="">Loading episodes…</option>';
  try {
    const res = await fetch(`/api/tv-details?tmdb_id=${encodeURIComponent(tmdbId)}&season_number=${encodeURIComponent(seasonNumber)}`);
    if (!res.ok) throw new Error('episode_lookup_failed');
    const data = await res.json();
    if (token !== diary.tvRequestToken) return;
    const episodes = Array.isArray(data.episodes) ? data.episodes : [];
    diary.episodeFromInput.innerHTML = '<option value="">Choose start episode</option>';
    diary.episodeToInput.innerHTML = '<option value="">Choose end episode</option>';
    episodes.forEach((episode) => {
      const optionFrom = document.createElement('option');
      optionFrom.value = String(episode.episode_number);
      optionFrom.textContent = getDiaryEpisodeOptionLabel(seasonNumber, episode);
      optionFrom.dataset.episodeTitle = episode.name || '';
      diary.episodeFromInput.appendChild(optionFrom);

      const optionTo = optionFrom.cloneNode(true);
      diary.episodeToInput.appendChild(optionTo);
    });
    diary.episodeFromInput.disabled = false;
    diary.episodeToInput.dataset.loading = 'false';
    const defaultFrom = selectedFromEpisodeNumber || episodes[0]?.episode_number || null;
    const defaultTo = selectedToEpisodeNumber || episodes[episodes.length - 1]?.episode_number || defaultFrom;
    if (defaultFrom) diary.episodeFromInput.value = String(defaultFrom);
    if (defaultTo) diary.episodeToInput.value = String(defaultTo);
    setDiaryEpisodeRangeVisibility();
  } catch {
    if (token !== diary.tvRequestToken) return;
    diary.episodeFromInput.innerHTML = '<option value="">Could not load episodes</option>';
    diary.episodeToInput.innerHTML = '<option value="">Could not load episodes</option>';
    diary.episodeToInput.dataset.loading = 'false';
    setDiaryEpisodeRangeVisibility();
  }
}

async function loadDiaryTvSeasons(result, selectedSeasonNumber = null, selectedFromEpisodeNumber = null, selectedToEpisodeNumber = null) {
  if (!diary.seasonInput || !result?.tmdb_id) return;
  const token = ++diary.tvRequestToken;
  setDiarySeriesFieldsVisibility(true);
  diary.seasonInput.disabled = true;
  diary.seasonInput.innerHTML = '<option value="">Loading seasons…</option>';
  if (diary.episodeFromInput) {
    diary.episodeFromInput.innerHTML = '<option value="">Choose start episode</option>';
    diary.episodeFromInput.disabled = true;
  }
  if (diary.episodeToInput) {
    diary.episodeToInput.innerHTML = '<option value="">Choose end episode</option>';
    diary.episodeToInput.disabled = true;
  }
  try {
    const res = await fetch(`/api/tv-details?tmdb_id=${encodeURIComponent(result.tmdb_id)}`);
    if (!res.ok) throw new Error('season_lookup_failed');
    const data = await res.json();
    if (token !== diary.tvRequestToken) return;
    const seasons = Array.isArray(data.seasons) ? data.seasons.filter((season) => season.season_number > 0) : [];
    diary.seasonInput.innerHTML = '<option value="">Choose season</option>';
    seasons.forEach((season) => {
      const option = document.createElement('option');
      option.value = String(season.season_number);
      option.textContent = season.name || `Season ${season.season_number}`;
      diary.seasonInput.appendChild(option);
    });
    diary.seasonInput.disabled = false;
    const defaultSeasonNumber = selectedSeasonNumber || seasons[seasons.length - 1]?.season_number || null;
    if (defaultSeasonNumber) {
      diary.seasonInput.value = String(defaultSeasonNumber);
      await loadDiaryTvEpisodes(result.tmdb_id, defaultSeasonNumber, selectedFromEpisodeNumber, selectedToEpisodeNumber);
    }
  } catch {
    if (token !== diary.tvRequestToken) return;
    diary.seasonInput.innerHTML = '<option value="">Could not load seasons</option>';
  }
}

function setDiaryTimestampFieldVisibility() {
  if (!diary.statusInput || !diary.timestampInput) return;
  const showTimestamp = diary.statusInput.value !== 'finished';
  diary.timestampInput.disabled = !showTimestamp;
  const field = diary.timestampInput.closest('.nww-diary-field');
  field?.classList.toggle('is-disabled', !showTimestamp);
  field?.classList.toggle('is-hidden', !showTimestamp);
  if (!showTimestamp) diary.timestampInput.value = '';
}

function setWatchDiaryComposerOpen(open) {
  diary.composerOpen = open;
  if (diary.composer) diary.composer.hidden = !open;
  diary.composerToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (diary.composerToggle) diary.composerToggle.textContent = open ? 'Close record' : 'Add a record';
}

function resetWatchDiaryForm() {
  if (!diary.form) return;
  diary.form.reset();
  if (diary.watchedAtInput) diary.watchedAtInput.value = formatDiaryDateInput(new Date().toISOString());
  if (diary.statusInput) diary.statusInput.value = 'finished';
  if (diary.submit) diary.submit.textContent = 'Save entry';
  diary.selectedResult = null;
  resetDiarySeriesFields();
  closeDiarySearchResults();
  setDiaryTimestampFieldVisibility();
  setWatchDiaryComposerOpen(false);
}

function populateWatchDiaryFormFromSession(data) {
  if (!diary.form || !data) return;
  diary.titleInput.value = data.title || '';
  diary.watchedAtInput.value = formatDiaryDateInput(new Date().toISOString());
  diary.statusInput.value = 'timestamp';
  diary.timestampInput.value = formatDiaryTimestamp(nwwGetElapsed(data));
  diary.noteInput.value = '';
  diary.rewatchInput.checked = false;
  if (diary.submit) diary.submit.textContent = 'Save current entry';
  diary.selectedResult = {
    title: data.title,
    year: data.year || null,
    poster: data.poster || null,
    media_type: 'movie',
  };
  resetDiarySeriesFields();
  closeDiarySearchResults();
  setDiaryTimestampFieldVisibility();
  setWatchDiaryComposerOpen(true);
}

function renderWatchDiary() {
  const list = diary.entries;
  if (!list) return;

  const entries = sortWatchLog(loadWatchLog());
  if (!entries.length) {
    list.innerHTML = `
      <div class="nww-diary-empty">
        <div class="nww-diary-empty-title">No diary entries yet.</div>
        <div class="nww-diary-empty-copy">Use the form above or start a session with Watch Now to add your first entry.</div>
      </div>`;
    return;
  }

  list.innerHTML = '';
  const template = diary.entryTemplate;
  let lastDayKey = '';
  entries.forEach((entry) => {
    const dayValue = entry.watchedAt || entry.startedAt;
    const dayKey = getDiaryDayKey(dayValue);
    if (dayKey && dayKey !== lastDayKey) {
      const divider = document.createElement('div');
      divider.className = 'nww-diary-day-divider';
      divider.innerHTML = `<span>${formatDiaryGroupDate(dayValue)}</span>`;
      list.appendChild(divider);
      lastDayKey = dayKey;
    }
    const item = template
      ? template.content.firstElementChild.cloneNode(true)
      : document.createElement('article');
    if (!template) item.className = 'nww-diary-entry';
    item.dataset.watchLogId = entry.id;
    const posterEl = item.querySelector('.nww-diary-entry-poster');
    if (posterEl) {
      posterEl.innerHTML = entry.poster ? `<img src="${entry.poster}" alt="">` : '';
    }
    const titleText = entry.mediaType === 'tv_episode'
      ? `${entry.seriesTitle || entry.title || 'Untitled'}${entry.episodeTitle ? ` — ${entry.episodeTitle}` : ''}`
      : entry.title || 'Untitled';
    item.querySelector('.nww-diary-entry-film').textContent = titleText;
    item.querySelector('.nww-diary-entry-time').textContent = formatDiaryDate(entry.watchedAt || entry.startedAt);
    const statusText = entry.status === 'timestamp'
      ? 'Timestamp · ' + formatDiaryTimestamp(entry.timestampMs)
      : entry.status;
    item.querySelector('.nww-diary-entry-status').textContent = entry.rewatch ? `${statusText} · Rewatch` : statusText;
    const note = entry.note && entry.note.trim()
      ? entry.note.trim()
      : [
          (entry.mediaType === 'tv_episode' || entry.mediaType === 'tv')
            ? formatDiaryEpisodeSpan(
              entry.seasonNumber,
              entry.episodeStartNumber || entry.episodeNumber,
              entry.singleEpisode ? (entry.episodeStartNumber || entry.episodeNumber) : (entry.episodeEndNumber || entry.episodeStartNumber || entry.episodeNumber),
            )
            : null,
          entry.mediaType === 'tv' ? 'TV Series' : null,
          entry.year,
          entry.director,
        ].filter(Boolean).join(' · ');
    item.querySelector('.nww-diary-entry-note').textContent = note || 'No note yet.';
    item.querySelector('.nww-diary-entry-delete')?.setAttribute('data-watch-log-delete', entry.id);
    list.appendChild(item);
  });
}

function renderSessionJournal() {
  const list = diary.journalList;
  if (!list) return;

  const signals = loadTasteSignals();
  if (!signals.length) {
    list.innerHTML = `
      <div class="nww-diary-empty">
        <div class="nww-diary-empty-title">No session journal yet.</div>
        <div class="nww-diary-empty-copy">Finish a watch session and use the companion to start building reflective entries here.</div>
      </div>`;
    updateWatchDiaryToolbar();
    return;
  }

  list.innerHTML = '';
  signals.forEach((signal) => {
    const entry = document.createElement('details');
    entry.className = 'watch-journal-entry';
    entry.dataset.signalTimestamp = String(signal.timestamp);
    const poster = signal.poster ? `<img src="${signal.poster}" alt="">` : '';
    const factsCount = Array.isArray(signal.facts) ? signal.facts.length : 0;
    const chatTurns = signal.chat_turns || 0;
    const noCompanion = chatTurns === 0 && factsCount === 0;
    const llm = signal.llm_signals || {};
    const hasLlmSignals = hasExtractedTasteSignals(llm);
    const subtitlePills = [
      `<span class="watch-journal-pill watch-journal-pill--decision">${formatSignalDecision(signal.decision)}</span>`,
      `<span class="watch-journal-pill">${formatWatchDuration(signal)}</span>`,
      `<span class="watch-journal-pill">${noCompanion ? 'No companion' : `${chatTurns} chat turns · ${factsCount} facts`}</span>`,
    ].join('');

    entry.innerHTML = `
      <summary class="watch-journal-summary">
        <div class="watch-journal-poster">${poster}</div>
        <div class="watch-journal-meta">
          <div class="watch-journal-title">${signal.title || 'Untitled'}${signal.year ? ` <span class="watch-journal-year">(${signal.year})</span>` : ''}</div>
          <div class="watch-journal-time">${formatDiaryDate(signal.timestamp)}</div>
          <div class="watch-journal-stats">${subtitlePills}</div>
        </div>
        <div class="watch-journal-caret">⌄</div>
      </summary>
      <div class="watch-journal-body">
        <div class="watch-journal-section">
          <div class="watch-journal-label">Session</div>
          <div class="watch-journal-grid">
            <div class="watch-journal-kv">
              <div class="watch-journal-k">Decision</div>
              <div class="watch-journal-v">${formatSignalDecision(signal.decision)}</div>
            </div>
            <div class="watch-journal-kv">
              <div class="watch-journal-k">Duration</div>
              <div class="watch-journal-v">${formatWatchDuration(signal)}</div>
            </div>
            <div class="watch-journal-kv">
              <div class="watch-journal-k">Companion</div>
              <div class="watch-journal-v">${noCompanion ? 'No companion used' : `${chatTurns} chat turns`}</div>
            </div>
            <div class="watch-journal-kv">
              <div class="watch-journal-k">Facts delivered</div>
              <div class="watch-journal-v">${factsCount}</div>
            </div>
          </div>
        </div>
        <div class="watch-journal-section">
          <div class="watch-journal-actions">
            <button class="watch-journal-delete" type="button" data-signal-delete="${signal.timestamp}">Delete entry</button>
          </div>
        </div>
        <div class="watch-journal-section">
          <div class="watch-journal-label">Signals</div>
          ${hasLlmSignals ? `
            ${llm.liked?.length ? `<div class="watch-journal-note">Praised</div>${renderSignalTags(llm.liked)}` : ''}
            ${llm.disliked?.length ? `<div class="watch-journal-note">Friction</div>${renderSignalTags(llm.disliked)}` : ''}
            ${llm.themes_engaged?.length ? `<div class="watch-journal-note">Themes engaged</div>${renderSignalTags(llm.themes_engaged)}` : ''}
            ${llm.emotional_reactions?.length ? `<div class="watch-journal-note">Emotional reactions</div>${renderSignalTags(llm.emotional_reactions)}` : ''}
            ${llm.viewing_style_notes?.length ? `<div class="watch-journal-note">How you engaged</div>${renderSignalTags(llm.viewing_style_notes)}` : ''}
          ` : `<div class="watch-journal-note">${noCompanion ? 'No companion state for this session.' : 'Structural session metadata only. No extracted LLM signals yet.'}</div>`}
        </div>
      </div>
    `;
    list.appendChild(entry);
  });
  updateWatchDiaryToolbar();
}

function setWatchDiaryTab(tab) {
  diary.activeTab = tab;
  const isLog = tab === 'log';
  diary.tabLog?.classList.toggle('is-active', isLog);
  diary.tabJournal?.classList.toggle('is-active', !isLog);
  diary.tabLog?.setAttribute('aria-selected', isLog ? 'true' : 'false');
  diary.tabJournal?.setAttribute('aria-selected', isLog ? 'false' : 'true');
  diary.logPanel?.classList.toggle('is-active', isLog);
  diary.journalPanel?.classList.toggle('is-active', !isLog);
  if (diary.logPanel) diary.logPanel.hidden = !isLog;
  if (diary.journalPanel) diary.journalPanel.hidden = isLog;
  updateWatchDiaryToolbar();
}

function setWatchDiaryOpen(open) {
  diary.isOpen = open;
  diary.layout?.classList.toggle('watch-diary-open', open);
  diary.panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
  diary.toggleBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeWatchDiaryDeleteConfirm() {
  diary.pendingDeleteId = null;
  if (diary.confirmBackdrop) diary.confirmBackdrop.hidden = true;
}

function openWatchDiaryDeleteConfirm(id) {
  diary.pendingDeleteId = id;
  if (diary.confirmBackdrop) diary.confirmBackdrop.hidden = false;
  diary.confirmDelete?.focus();
}

function closeDiarySearchResults() {
  if (!diary.searchResults) return;
  diary.searchResults.classList.remove('is-open');
  diary.searchResults.innerHTML = '';
}

async function applyDiarySearchResult(result) {
  diary.selectedResult = result;
  if (diary.titleInput) diary.titleInput.value = result.title || '';
  if (result.media_type === 'tv') {
    await loadDiaryTvSeasons(result);
  } else {
    resetDiarySeriesFields();
  }
  closeDiarySearchResults();
}

function renderDiarySearchResults(results) {
  if (!diary.searchResults) return;
  if (!results.length) {
    diary.searchResults.innerHTML = '<div class="nww-diary-search-empty">No results</div>';
    diary.searchResults.classList.add('is-open');
    return;
  }

  diary.searchResults.innerHTML = '';
  results.forEach((result) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'nww-diary-search-row';
    row.innerHTML = `
      <div class="nww-diary-search-poster">${result.poster ? `<img src="${result.poster}" alt="">` : ''}</div>
      <div class="nww-diary-search-info">
        <div class="nww-diary-search-title">${result.title}</div>
        <div class="nww-diary-search-meta">${[result.year, result.tmdb_rating ? `TMDB ${result.tmdb_rating}` : null].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="nww-diary-search-type">${result.media_type === 'tv' ? 'TV' : 'Film'}</div>
    `;
    row.addEventListener('click', () => applyDiarySearchResult(result));
    diary.searchResults.appendChild(row);
  });
  diary.searchResults.classList.add('is-open');
}

// Undo toast
let undoTimer = null;
function showUndo(message, undoFn) {
  let toast = document.getElementById('undo-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'undo-toast';
    document.body.appendChild(toast);
  }
  if (undoTimer) clearTimeout(undoTimer);
  toast.innerHTML = '';
  const msg = document.createElement('span');
  msg.textContent = message;
  const btn = document.createElement('button');
  btn.textContent = 'Undo';
  btn.addEventListener('click', () => {
    undoFn();
    toast.classList.remove('visible');
  });
  toast.appendChild(msg);
  toast.appendChild(btn);
  toast.classList.add('visible');
  undoTimer = setTimeout(() => toast.classList.remove('visible'), 5000);
}

function loadBanned() {
  try { return JSON.parse(localStorage.getItem(BANNED_KEY) || '[]'); } catch(e) { return []; }
}
function saveBanned(list) {
  localStorage.setItem(BANNED_KEY, JSON.stringify(list));
  invalidateTabCounts();
  if (gridView !== 'banned') markDirty('banned');
  schedulePush();
}

function loadWatchlist() {
  try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'); } catch(e) { return []; }
}
function saveWatchlist(list) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  invalidateTabCounts();
  if (gridView !== 'watchlist') markDirty('watchlist');
  schedulePush();
}

function loadMaybe() {
  try { return JSON.parse(localStorage.getItem(MAYBE_KEY) || '[]'); } catch(e) { return []; }
}
function saveMaybe(list) {
  localStorage.setItem(MAYBE_KEY, JSON.stringify(list));
  invalidateTabCounts();
  if (gridView !== 'maybe') markDirty('maybe');
  schedulePush();
}

function loadMeh() {
  try { return JSON.parse(localStorage.getItem(MEH_KEY) || '[]'); } catch(e) { return []; }
}
function saveMeh(list) {
  localStorage.setItem(MEH_KEY, JSON.stringify(list));
  invalidateTabCounts();
  if (gridView !== 'meh') markDirty('meh');
  schedulePush();
}

function loadAnticipated() {
  try { return JSON.parse(localStorage.getItem(ANTICIPATED_KEY) || '[]'); } catch { return []; }
}
function saveAnticipated(list) {
  localStorage.setItem(ANTICIPATED_KEY, JSON.stringify(list));
  schedulePush();
}
function isFutureRelease(movie) {
  if (!movie.release_date) return false;
  return movie.release_date > new Date().toISOString().slice(0, 10);
}

function makeReleaseDivider() {
  const div = document.createElement('div');
  div.className = 'grid-release-divider';
  const label = document.createElement('span');
  label.textContent = 'Coming soon';
  div.appendChild(label);
  return div;
}

function daysUntil(releaseDate) {
  if (!releaseDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rel   = new Date(releaseDate + 'T00:00:00');
  return Math.round((rel - today) / 86400000);
}
function hasReleasedAnticipated() {
  return loadAnticipated().some(m => daysUntil(m.release_date) <= 0);
}

// Remove a title from all other lists so Anticipated is mutually exclusive
function removeFromOtherLists(title) {
  const norm = t => t.toLowerCase().trim();
  const n = norm(title);
  const m = movies.filter(f => norm(f.title) !== n);
  if (m.length !== movies.length) { movies = m; saveMovies(); }
  const wl = loadWatchlist().filter(f => norm(f.title) !== n);
  saveWatchlist(wl);
  const my = loadMaybe().filter(f => norm(f.title) !== n);
  saveMaybe(my);
  const mh = loadMeh().filter(f => norm(f.title) !== n);
  saveMeh(mh);
  const bn = loadBanned().filter(f => norm(f.title) !== n);
  saveBanned(bn);
}

const BAN_SVG_SM = '❌';
const BAN_SVG_LG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="56" height="56" fill="none"><circle cx="12" cy="12" r="9.5" stroke="rgba(255,50,50,0.92)" stroke-width="2.5"/><line x1="5.1" y1="5.1" x2="18.9" y2="18.9" stroke="rgba(255,50,50,0.92)" stroke-width="2.5" stroke-linecap="round"/></svg>';

let gridView = 'collection'; // 'collection' | 'watchlist' | 'maybe' | 'banned' | 'anticipated'
let sortableInstance;
let sortableView = null;
let currentSaveOrder = null;

const SORT_KEY = 'thecollection_sort';
let _sortModesCache = null;
function loadSortModes() {
  if (!_sortModesCache) {
    try { _sortModesCache = JSON.parse(localStorage.getItem(SORT_KEY) || '{}'); } catch(e) { _sortModesCache = {}; }
  }
  return _sortModesCache;
}
function getSortMode(view) {
  return loadSortModes()[view] || 'preference';
}
function setSortMode(view, mode) {
  const modes = loadSortModes();
  modes[view] = mode;
  localStorage.setItem(SORT_KEY, JSON.stringify(modes));
  markDirty(view);
}

function sortedList(list, view) {
  const mode = getSortMode(view);
  if (mode === 'date') {
    return [...list].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
  if (mode === 'rt') {
    return [...list].sort((a, b) => {
      const aScore = a.rt_score ? parseInt(a.rt_score) : -1;
      const bScore = b.rt_score ? parseInt(b.rt_score) : -1;
      return bScore - aScore;
    });
  }
  if (mode === 'imdb') {
    return [...list].sort((a, b) => {
      const aScore = a.imdb_rating ? parseFloat(a.imdb_rating) : -1;
      const bScore = b.imdb_rating ? parseFloat(b.imdb_rating) : -1;
      return bScore - aScore;
    });
  }
  return list; // preference = stored order
}

const NAV_ICONS = {
  collection:  '<img src="curtain.png" style="width:24px;height:24px;object-fit:contain;vertical-align:middle">',
  watchlist:   '🍿',
  maybe:       '<img src="wildcard.webp" style="width:24px;height:24px;object-fit:contain;vertical-align:middle">',
  meh:         '😐',
  banned:      '🪦',
  anticipated: '🎬',
};

async function updateSortable(view) {
  await _sortableReady;
  const el = getGrid(view);
  const locked = getSortMode(view) !== 'preference';
  el.classList.toggle('sort-locked', locked);

  if (sortableInstance && sortableView === view) {
    // Same grid — just toggle lock state, no teardown needed
    sortableInstance.option('disabled', locked);
  } else {
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = Sortable.create(el, {
      animation: 600,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      swapThreshold: 0.3,
      ghostClass: 'sortable-ghost',
      disabled: locked,
      onStart: (evt) => {
        draggedCard          = evt.item;
        droppedOnTab         = false;
        pendingStandardsSlot = null;
        document.querySelectorAll('.grid-nav-btn').forEach(btn => {
          if (btn.dataset.key !== gridView) btn.classList.add('drop-target');
        });
        if (gridView === 'collection') document.getElementById('standards-wrap')?.classList.add('drag-active');
      },
      onEnd: () => {
        document.querySelectorAll('.grid-nav-btn').forEach(btn => btn.classList.remove('drop-target', 'drop-hover'));
        document.getElementById('standards-wrap')?.classList.remove('drag-active');
        document.getElementById('standards-wrap')?.querySelectorAll('.standards-slot').forEach(s => s.classList.remove('drop-hover'));

        // Drop onto a standards slot
        if (pendingStandardsSlot && draggedCard) {
          const title = draggedCard.querySelector('.card-name').textContent;
          const film  = movies.find(m => m.title === title);
          if (film) {
            const stds = loadStandards();
            if (!stds.some(m => m.title === title) && stds.length < MAX_STANDARDS) {
              stds.push({ title: film.title, year: film.year, director: film.director, poster: film.poster });
              saveStandards(stds);
              markDirty('collection');
            }
          }
          pendingStandardsSlot = null;
          draggedCard  = null;
          droppedOnTab = false;
          setGridView(gridView);
          renderGridNav();
          return;
        }

        if (droppedOnTab) {
          droppedOnTab = false;
          draggedCard  = null;
          setGridView(gridView);
          renderGridNav();
          return;
        }
        draggedCard = null;
        if (currentSaveOrder) currentSaveOrder();
      },
    });
    sortableView = view;
  }

  // Always update currentSaveOrder for the active view
  if (view === 'collection') {
    currentSaveOrder = syncOrderFromDOM;
  } else if (view === 'watchlist') {
    currentSaveOrder = () => {
      const list = loadWatchlist();
      const newOrder = [];
      el.querySelectorAll('.movie-card').forEach(card => {
        const m = list.find(x => x.title === card.querySelector('.card-name').textContent);
        if (m) newOrder.push(m);
      });
      saveWatchlist(newOrder);
    };
  } else if (view === 'maybe') {
    currentSaveOrder = () => {
      const list = loadMaybe();
      const newOrder = [];
      el.querySelectorAll('.movie-card').forEach(card => {
        const m = list.find(x => x.title === card.querySelector('.card-name').textContent);
        if (m) newOrder.push(m);
      });
      saveMaybe(newOrder);
    };
  } else if (view === 'meh') {
    currentSaveOrder = () => {
      const list = loadMeh();
      const newOrder = [];
      el.querySelectorAll('.movie-card').forEach(card => {
        const m = list.find(x => x.title === card.querySelector('.card-name').textContent);
        if (m) newOrder.push(m);
      });
      saveMeh(newOrder);
    };
  } else if (view === 'banned') {
    currentSaveOrder = () => {
      const list = loadBanned();
      const newOrder = [];
      el.querySelectorAll('.movie-card').forEach(card => {
        const m = list.find(x => x.title === card.querySelector('.card-name').textContent);
        if (m) newOrder.push(m);
      });
      saveBanned(newOrder);
    };
  }
}

const VIEW_SLUGS = {
  collection: 'collection', watchlist: 'watchlist', maybe: 'wildcard',
  meh: 'meh', banned: 'dont-recommend', anticipated: 'anticipated',
};
const SLUG_TO_VIEW = Object.fromEntries(Object.entries(VIEW_SLUGS).map(([v, s]) => [s, v]));

function pushViewUrl(view) {
  const slug = VIEW_SLUGS[view] || view;
  const sort = getSortMode(view);
  const params = sort && sort !== 'preference' ? `?sort=${sort}` : '';
  const url = `/movies.html#${slug}${params}`;
  if (location.href !== location.origin + url) history.pushState({ view, sort }, '', url);
}

function pushModalUrl(view, movie) {
  const slug = VIEW_SLUGS[view] || view;
  const sort = getSortMode(view);
  const params = new URLSearchParams();
  if (sort && sort !== 'preference') params.set('sort', sort);
  params.set('film', movie.title);
  if (movie.year) params.set('year', String(movie.year));
  const url = `/movies.html#${slug}?${params}`;
  if (location.href !== location.origin + url) history.pushState({ view, film: movie.title }, '', url);
}

function stripModalUrl(view) {
  const slug = VIEW_SLUGS[view] || view;
  const sort = getSortMode(view);
  const params = sort && sort !== 'preference' ? `?sort=${sort}` : '';
  const url = `/movies.html#${slug}${params}`;
  if (location.href !== location.origin + url) history.replaceState({ view }, '', url);
}

function readViewUrl() {
  const hash = location.hash.replace('#', '').split('?')[0];
  const params = new URLSearchParams(location.hash.includes('?') ? location.hash.split('?')[1] : '');
  const view = SLUG_TO_VIEW[hash] || (VIEWS.includes(hash) ? hash : null);
  const sort = params.get('sort');
  const filmTitle = params.get('film');
  const film = filmTitle ? { title: filmTitle, year: params.get('year') || null } : null;
  return { view, sort, film };
}

function setGridView(view, { pushUrl = true } = {}) {
  gridView = view;
  if (pushUrl) pushViewUrl(view);
  VIEWS.forEach(v => { getGrid(v).style.display = v === view ? '' : 'none'; });
  const sw = document.getElementById('standards-wrap');
  if (sw) sw.style.display = view === 'collection' ? '' : 'none';
  const pw = document.getElementById('persona-wrap');
  if (pw) pw.style.display = view === 'collection' ? '' : 'none';
  if (dirtyViews.has(view)) {
    if (view === 'collection') render(sortedList(movies, 'collection'));
    else if (view === 'watchlist') renderWatchlistGrid();
    else if (view === 'maybe') renderMaybeGrid();
    else if (view === 'meh') renderMehGrid();
    else if (view === 'banned') renderBannedGrid();
    else if (view === 'anticipated') renderAnticipated();
    applyGrain();
  }
  if (view === 'anticipated') renderAnticipated();
  updateSortable(view);
  renderGridNav();
}

const NAV_TABS = [
  { key: 'collection', label: 'Collection'     },
  { key: 'watchlist',  label: 'To Watch'        },
  { key: 'maybe',      label: 'Wildcard'        },
  { key: 'meh',        label: 'Meh'             },
  { key: 'banned',     label: "Don't Recommend" },
];

let _tabCountCache = null;
function invalidateTabCounts() { _tabCountCache = null; }
function getTabCounts() {
  if (!_tabCountCache) {
    _tabCountCache = {
      collection:  movies.length,
      watchlist:   loadWatchlist().length,
      maybe:       loadMaybe().length,
      meh:         loadMeh().length,
      banned:      loadBanned().length,
      anticipated: loadAnticipated().length,
    };
  }
  return _tabCountCache;
}
function getTabCount(key) { return getTabCounts()[key] || 0; }

function buildNavButtons(container, compact = false) {
  // Build once, then only update on subsequent calls
  let tabRow = container.querySelector('.grid-nav-tabs');
  if (!tabRow) {
    tabRow = document.createElement('div');
    tabRow.className = 'grid-nav-tabs';

    const slider = document.createElement('div');
    slider.className = 'grid-nav-slider';
    tabRow.appendChild(slider);

    NAV_TABS.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.dataset.key = key;
      btn.className = 'grid-nav-btn' + (compact ? ' compact' : '');
      btn.addEventListener('click', () => {
        setGridView(key);
        const el = document.getElementById('grid-nav');
        const headerH = document.querySelector('header')?.offsetHeight || 0;
        const top = el.getBoundingClientRect().top + window.scrollY - headerH - 16;
        window.scrollTo({ top, behavior: 'smooth' });
      });
      btn.addEventListener('dragover', (e) => {
        if (!draggedCard || key === gridView) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        btn.classList.add('drop-hover');
      });
      btn.addEventListener('dragleave', () => btn.classList.remove('drop-hover'));
      btn.addEventListener('drop', (e) => {
        e.preventDefault();
        btn.classList.remove('drop-hover');
        if (!draggedCard || key === gridView) return;
        const title = draggedCard.querySelector('.card-name').textContent;
        droppedOnTab = true;
        moveBetweenViews(title, gridView, key);
      });
      tabRow.appendChild(btn);
    });

    // Anticipated — separated from main tabs with a visual divider
    const anticipatedSep = document.createElement('div');
    anticipatedSep.className = 'grid-nav-sep';
    tabRow.appendChild(anticipatedSep);

    const anticipatedBtn = document.createElement('button');
    anticipatedBtn.dataset.key = 'anticipated';
    anticipatedBtn.className = 'grid-nav-btn grid-nav-btn--anticipated' + (compact ? ' compact' : '');
    anticipatedBtn.addEventListener('click', () => {
      setGridView('anticipated');
      const el = document.getElementById('grid-nav');
      const headerH = document.querySelector('header')?.offsetHeight || 0;
      const top = el.getBoundingClientRect().top + window.scrollY - headerH - 16;
      window.scrollTo({ top, behavior: 'smooth' });
    });
    tabRow.appendChild(anticipatedBtn);

    const tabRowWrap = document.createElement('div');
    tabRowWrap.className = 'grid-nav-tab-row';
    tabRowWrap.appendChild(tabRow);

    const inner = document.createElement('div');
    inner.className = 'grid-nav-inner';
    inner.appendChild(tabRowWrap);
    container.appendChild(inner);
  }

  // Update active, counts, labels every time
  tabRow.querySelectorAll('.grid-nav-btn').forEach(btn => {
    const key = btn.dataset.key;
    const count = getTabCount(key);
    const active = gridView === key;
    const isAnticipated = key === 'anticipated';
    const released = isAnticipated && hasReleasedAnticipated();
    const allTabs = [...NAV_TABS, { key: 'anticipated', label: 'Anticipated' }];
    btn.className = [
      'grid-nav-btn',
      isAnticipated ? 'grid-nav-btn--anticipated' : '',
      active ? 'active' : '',
      released ? 'grid-nav-btn--alert' : '',
      compact ? 'compact' : '',
    ].filter(Boolean).join(' ');
    btn.innerHTML = `<span class="grid-nav-icon">${NAV_ICONS[key]}</span><span>${allTabs.find(t=>t.key===key)?.label}</span>${count ? `<span class="grid-nav-count">${count}</span>` : ''}${released ? '<span class="grid-nav-dot"></span>' : ''}`;
  });

  // Slide the indicator
  const activeBtn = tabRow.querySelector('.grid-nav-btn.active');
  const slider = tabRow.querySelector('.grid-nav-slider');
  if (activeBtn && slider) {
    const nextLeft = activeBtn.offsetLeft;
    const nextWidth = activeBtn.offsetWidth;

    if (!slider.dataset.init) {
      slider.style.transition = 'none';
      slider.style.transform = 'none';
      slider.style.left = nextLeft + 'px';
      slider.style.width = nextWidth + 'px';
      slider.dataset.init = '1';
      slider.dataset.left = String(nextLeft);
      slider.dataset.width = String(nextWidth);
      requestAnimationFrame(() => { slider.style.transition = ''; });
    } else {
      const prevLeft = Number(slider.dataset.left || nextLeft);
      const prevWidth = Number(slider.dataset.width || nextWidth);
      const scaleX = prevWidth > 0 ? prevWidth / nextWidth : 1;
      const translateX = prevLeft - nextLeft;

      slider.style.transition = 'none';
      slider.style.left = nextLeft + 'px';
      slider.style.width = nextWidth + 'px';
      slider.style.transformOrigin = 'left center';
      slider.style.transform = `translateX(${translateX}px) scaleX(${scaleX})`;
      slider.dataset.left = String(nextLeft);
      slider.dataset.width = String(nextWidth);

      requestAnimationFrame(() => {
        slider.style.transition = '';
        slider.style.transform = 'none';
      });
    }
  }

  if (!compact) {
    const inner = container.querySelector('.grid-nav-inner');
    let sortRow = inner.querySelector('.grid-sort-row');
    if (!sortRow) {
      sortRow = document.createElement('div');
      sortRow.className = 'grid-sort-row';

      const addBtn = document.createElement('button');
      addBtn.className = 'grid-add-btn';
      addBtn.innerHTML = '+ Add film';
      addBtn.addEventListener('click', () => openSearchModal(gridView));
      sortRow.appendChild(addBtn);

      const pills = document.createElement('div');
      pills.className = 'grid-sort-pills';
      [{ key: 'preference', label: 'Preference' }, { key: 'date', label: 'Date added' }, { key: 'rt', label: 'RT ↓' }, { key: 'imdb', label: 'IMDb ↓' }].forEach(({ key, label }) => {
        const btn = document.createElement('button');
        btn.dataset.sortKey = key;
        btn.textContent = label;
        btn.addEventListener('click', () => {
          setSortMode(gridView, key);
          setGridView(gridView);
        });
        pills.appendChild(btn);
      });
      sortRow.appendChild(pills);

      inner.appendChild(sortRow);
    }
    const mode = getSortMode(gridView);
    sortRow.querySelectorAll('[data-sort-key]').forEach(btn => {
      btn.className = 'grid-sort-btn' + (mode === btn.dataset.sortKey ? ' active' : '');
    });
  }
}

function renderGridNav() {
  const nav = document.getElementById('grid-nav');
  if (nav) buildNavButtons(nav);
}

function renderWatchlistGrid() {
  const g = getGrid('watchlist');
  const standardTitles = new Set(loadStandards().map(m => m.title));
  const list = sortedList(loadWatchlist(), 'watchlist').filter(m => !standardTitles.has(m.title));
  g.innerHTML = '';
  if (!list.length) { showEmptyState(g); markClean('watchlist'); return; }
  const _nwWL = loadNowWatching(); const _liveTitleWL = _nwWL ? _nwWL.title : null;
  const _sessionedWL = getSessionedTitles();
  const _wlReleased = list.filter(m => !isFutureRelease(m));
  const _wlUpcoming = list.filter(m => isFutureRelease(m));
  [..._wlReleased, ...(_wlUpcoming.length ? [null] : []), ..._wlUpcoming].forEach(movie => {
    if (movie === null) { g.appendChild(makeReleaseDivider()); return; }
    const card = CardComponent.renderCard(movie, {
      view: 'watchlist',
      isLive: movie.title === _liveTitleWL,
      hasSession: _sessionedWL.has(movie.title.toLowerCase()),
      onRemove: () => {
        saveSnapshot(`Before removing "${movie.title}" from To Watch`);
        const prev = loadWatchlist();
        const updated = prev.filter(m => m.title !== movie.title);
        saveWatchlist(updated);
        renderWatchlistGrid();
        renderGridNav();
        showUndo(`Removed "${movie.title}" from To Watch`, () => {
          saveWatchlist(prev);
          renderWatchlistGrid();
          renderGridNav();
        });
      },
    });
    g.appendChild(card);
  });
  applyGrain();
  markClean('watchlist');
}

function renderBannedGrid() {
  const g = getGrid('banned');
  const standardTitles = new Set(loadStandards().map(m => m.title));
  const banned = sortedList(loadBanned(), 'banned').filter(m => !standardTitles.has(m.title));
  g.innerHTML = '';
  if (!banned.length) { showEmptyState(g); markClean('banned'); return; }
  const _nwBN = loadNowWatching(); const _liveTitleBN = _nwBN ? _nwBN.title : null;
  const _sessionedBN = getSessionedTitles();
  const _bnReleased = banned.filter(m => !isFutureRelease(m));
  const _bnUpcoming = banned.filter(m => isFutureRelease(m));
  [..._bnReleased, ...(_bnUpcoming.length ? [null] : []), ..._bnUpcoming].forEach(movie => {
    if (movie === null) { g.appendChild(makeReleaseDivider()); return; }
    const card = CardComponent.renderCard(movie, {
      view: 'banned',
      isLive: movie.title === _liveTitleBN,
      hasSession: _sessionedBN.has(movie.title.toLowerCase()),
      onRemove: () => {
        saveSnapshot(`Before removing "${movie.title}" from Don't Recommend`);
        const prev = loadBanned();
        const list = prev.filter(m => m.title !== movie.title);
        saveBanned(list);
        renderBannedGrid();
        renderGridNav();
        showUndo(`Removed "${movie.title}" from Don't Recommend`, () => {
          saveBanned(prev);
          renderBannedGrid();
          renderGridNav();
        });
      },
    });
    g.appendChild(card);
  });
  applyGrain();
  markClean('banned');
}

function renderMaybeGrid() {
  const g = getGrid('maybe');
  const standardTitles = new Set(loadStandards().map(m => m.title));
  const list = sortedList(loadMaybe(), 'maybe').filter(m => !standardTitles.has(m.title));
  g.innerHTML = '';
  if (!list.length) { showEmptyState(g); markClean('maybe'); return; }
  const _nwMB = loadNowWatching(); const _liveTitleMB = _nwMB ? _nwMB.title : null;
  const _sessionedMB = getSessionedTitles();
  const _mbReleased = list.filter(m => !isFutureRelease(m));
  const _mbUpcoming = list.filter(m => isFutureRelease(m));
  [..._mbReleased, ...(_mbUpcoming.length ? [null] : []), ..._mbUpcoming].forEach(movie => {
    if (movie === null) { g.appendChild(makeReleaseDivider()); return; }
    const card = CardComponent.renderCard(movie, {
      view: 'maybe',
      isLive: movie.title === _liveTitleMB,
      hasSession: _sessionedMB.has(movie.title.toLowerCase()),
      onRemove: () => {
        saveSnapshot(`Before removing "${movie.title}" from Wildcard`);
        const prev = loadMaybe();
        const updated = prev.filter(m => m.title !== movie.title);
        saveMaybe(updated);
        renderMaybeGrid();
        renderGridNav();
        showUndo(`Removed "${movie.title}" from Wildcard`, () => {
          saveMaybe(prev);
          renderMaybeGrid();
          renderGridNav();
        });
      },
    });
    g.appendChild(card);
  });
  applyGrain();
  markClean('maybe');
}

function renderMehGrid() {
  const g = getGrid('meh');
  const standardTitles = new Set(loadStandards().map(m => m.title));
  const list = sortedList(loadMeh(), 'meh').filter(m => !standardTitles.has(m.title));
  g.innerHTML = '';
  if (!list.length) { showEmptyState(g); markClean('meh'); return; }
  const _nwMH = loadNowWatching(); const _liveTitleMH = _nwMH ? _nwMH.title : null;
  const _sessionedMH = getSessionedTitles();
  const _mhReleased = list.filter(m => !isFutureRelease(m));
  const _mhUpcoming = list.filter(m => isFutureRelease(m));
  [..._mhReleased, ...(_mhUpcoming.length ? [null] : []), ..._mhUpcoming].forEach(movie => {
    if (movie === null) { g.appendChild(makeReleaseDivider()); return; }
    const card = CardComponent.renderCard(movie, {
      view: 'meh',
      isLive: movie.title === _liveTitleMH,
      hasSession: _sessionedMH.has(movie.title.toLowerCase()),
      onRemove: () => {
        saveSnapshot(`Before removing "${movie.title}" from Meh`);
        const prev = loadMeh();
        const updated = prev.filter(m => m.title !== movie.title);
        saveMeh(updated);
        renderMehGrid();
        renderGridNav();
        showUndo(`Removed "${movie.title}" from Meh`, () => {
          saveMeh(prev);
          renderMehGrid();
          renderGridNav();
        });
      },
    });
    g.appendChild(card);
  });
  applyGrain();
  markClean('meh');
}

let _upcomingPage = 0;
let _upcomingSuggestions = [];
let _upcomingLoading = false;
let _upcomingTotalPages = 1;

async function fetchUpcomingSuggestions(page = 1) {
  if (_upcomingLoading) return;
  if (page > _upcomingTotalPages) return;
  _upcomingLoading = true;
  try {
    const res = await fetch(`/api/search-movie?type=upcoming&page=${page}`);
    if (!res.ok) return;
    const json = await res.json();
    _upcomingTotalPages = json.total_pages || 1;
    const seenTitles = new Set(_upcomingSuggestions.map(m => m.title.toLowerCase()));
    const fresh = (json.results || []).filter(m => !seenTitles.has(m.title.toLowerCase()));
    _upcomingSuggestions = [..._upcomingSuggestions, ...fresh];
    _upcomingPage = page;
  } catch {} finally {
    _upcomingLoading = false;
    renderAnticipated();
  }
}

function renderAnticipated() {
  const g = getGrid('anticipated');
  const list = loadAnticipated().slice().sort((a, b) => {
    const da = daysUntil(a.release_date) ?? 9999;
    const db = daysUntil(b.release_date) ?? 9999;
    return da - db;
  });

  g.innerHTML = '';

  // ── Anticipated list (or empty state) ────────────────────────────────────
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'anticipated-empty';
    empty.innerHTML = `
      <p class="anticipated-empty-msg">Nothing anticipated yet.</p>
      <button class="grid-add-btn" id="anticipated-add-btn">+ Add film</button>
    `;
    g.appendChild(empty);
    empty.querySelector('#anticipated-add-btn').addEventListener('click', () => openSearchModal('anticipated'));
  } else {
    const addRow = document.createElement('div');
    addRow.className = 'grid-sort-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'grid-add-btn';
    addBtn.innerHTML = '+ Add film';
    addBtn.addEventListener('click', () => openSearchModal('anticipated'));
    addRow.appendChild(addBtn);
    g.appendChild(addRow);

    list.forEach(movie => {
      const days = daysUntil(movie.release_date);
      const released = days !== null && days <= 0;
      const card = CardComponent.renderCard(movie, {
        view: 'anticipated',
        onRemove: () => {
          const prev = loadAnticipated();
          saveAnticipated(prev.filter(m => m.title !== movie.title));
          invalidateTabCounts();
          renderAnticipated();
          renderGridNav();
        },
      });
      const countdown = document.createElement('div');
      countdown.className = 'anticipated-countdown' + (released ? ' anticipated-countdown--released' : '');
      countdown.textContent = released ? 'Out now'
        : days === 0 ? 'Premieres today!'
        : days === 1 ? 'Tomorrow'
        : `In ${days} days`;
      card.appendChild(countdown);
      if (released) card.classList.add('anticipated-card--released');
      g.appendChild(card);
    });
  }

  // ── Coming soon suggestions — always 5 slots ─────────────────────────────
  const _allUserTitles = new Set([
    ...list.map(a => a.title.toLowerCase()),
    ...loadBanned().map(m => m.title.toLowerCase()),
    ...loadMeh().map(m => m.title.toLowerCase()),
    ...movies.map(m => m.title.toLowerCase()),
    ...loadWatchlist().map(m => m.title.toLowerCase()),
    ...loadMaybe().map(m => m.title.toLowerCase()),
  ]);
  const visible = _upcomingSuggestions.filter(m => !_allUserTitles.has(m.title.toLowerCase()));
  const toShow  = visible.slice(0, 5);

  // Fetch more if we can't fill 5 slots yet
  if (_upcomingPage === 0 && !_upcomingLoading) {
    fetchUpcomingSuggestions(1);
  } else if (toShow.length < 5 && !_upcomingLoading && _upcomingPage < _upcomingTotalPages) {
    fetchUpcomingSuggestions(_upcomingPage + 1);
  }

  const sugRow = document.createElement('div');
  sugRow.className = 'anticipated-suggestions-row';

  const sugLabel = document.createElement('p');
  sugLabel.className = 'anticipated-suggestions-label';
  sugLabel.textContent = 'Coming soon';
  sugRow.appendChild(sugLabel);

  const sugGrid = document.createElement('div');
  sugGrid.className = 'anticipated-suggestions-grid';

  toShow.forEach(m => {
    const addToAnticipated = () => {
      const current = loadAnticipated();
      if (current.some(a => a.title.toLowerCase() === m.title.toLowerCase())) return;
      removeFromOtherLists(m.title);
      current.push({ title: m.title, year: m.year, poster: m.poster, release_date: m.release_date, addedAt: Date.now() });
      saveAnticipated(current);
      invalidateTabCounts();
      renderAnticipated();
      renderGridNav();
    };

    const card = CardComponent.renderCard(m, {
      view: 'anticipated',
      onRemove: () => {
        const banned = loadBanned();
        if (!banned.find(b => b.title.toLowerCase() === m.title.toLowerCase())) {
          banned.push({ title: m.title, year: m.year, poster: m.poster });
          saveBanned(banned);
          invalidateTabCounts();
        }
        _upcomingSuggestions = _upcomingSuggestions.filter(s => s.title !== m.title);
        renderAnticipated();
        renderGridNav();
      },
    });
    card.classList.add('anticipated-suggestion-card');
    card.setAttribute('tabindex', '0');

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-remove-btn, .anticipated-suggestion-add-btn')) return;
      openMovieModal(m, toShow, { anticipatedMode: true });
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        card.querySelector('.card-remove-btn')?.click();
      }
    });

    const badge = document.createElement('div');
    badge.className = 'anticipated-countdown';
    badge.textContent = formatReleaseDate(m.release_date);
    card.appendChild(badge);

    const addBtn = document.createElement('button');
    addBtn.className = 'anticipated-suggestion-add-btn';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); addToAnticipated(); });
    card.appendChild(addBtn);

    sugGrid.appendChild(card);
  });

  // Fill remaining slots with skeletons while loading
  const _emptySlots = 5 - toShow.length;
  for (let i = 0; i < _emptySlots; i++) {
    const slot = document.createElement('div');
    slot.className = 'anticipated-suggestion-slot' + (_upcomingLoading || _upcomingPage === 0 ? ' anticipated-suggestion-slot--loading' : '');
    sugGrid.appendChild(slot);
  }

  sugRow.appendChild(sugGrid);
  g.appendChild(sugRow);

  applyGrain();
  markClean('anticipated');
}

function formatReleaseDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function saveMovies() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));
  invalidateTabCounts();
  if (gridView !== 'collection') markDirty('collection');
  schedulePush();
}

function loadMovies() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    movies.splice(0, movies.length, ...parsed);
  } catch (e) {}
}

function syncOrderFromDOM() {
  const cards = getGrid('collection').querySelectorAll('.movie-card');
  // Standards are excluded from the grid but must stay in movies[]
  const standardTitles = new Set(loadStandards().map(m => m.title));
  const standardMovies = movies.filter(m => standardTitles.has(m.title));
  const newOrder = [];
  cards.forEach(card => {
    const title = card.querySelector('.card-name').textContent;
    const movie = movies.find(m => m.title === title);
    if (movie) newOrder.push(movie);
  });
  movies.splice(0, movies.length, ...newOrder, ...standardMovies);
  saveMovies();
}

// Controls
const GRAIN_KEY = 'thecollection_grain';
function loadGrainSettings() {
  try { return JSON.parse(localStorage.getItem(GRAIN_KEY)) || {}; } catch { return {}; }
}
function saveGrainSettings() {
  localStorage.setItem(GRAIN_KEY, JSON.stringify({ grainEnabled, grainLevel, darkBoost }));
}
const _g = loadGrainSettings();
let grainEnabled = _g.grainEnabled ?? true;
let grainLevel   = _g.grainLevel   ?? 0.04;
let darkBoost    = _g.darkBoost    ?? 100;

// ── URL routing ───────────────────────────────────────────────────────────────
window.addEventListener('popstate', () => {
  const { view, sort, film } = readViewUrl();
  const modalOpen = document.getElementById('movie-modal-backdrop').style.display !== 'none';
  if (film) {
    openMovieModalByTitle(film.title, film.year, { pushUrl: false });
  } else if (modalOpen) {
    // Back-navigated away from a modal URL — close without touching history
    document.getElementById('movie-modal-backdrop').style.display = 'none';
    document.body.style.overflow = '';
    modalAnticipatedMode = false;
    const notFoundBar = document.getElementById('mm-not-found-bar');
    if (notFoundBar) notFoundBar.hidden = true;
  }
  if (view && VIEWS.includes(view)) {
    if (sort) setSortMode(view, sort);
    setGridView(view, { pushUrl: false });
  }
});

// Render immediately from localStorage, then re-render if Supabase sync brings newer data.
(async function init() {
  loadMovies();

  // Restore view + sort from URL if present
  const { view: urlView, sort: urlSort, film: urlFilm } = readViewUrl();
  if (urlView && VIEWS.includes(urlView)) {
    if (urlSort) setSortMode(urlView, urlSort);
    gridView = urlView;
  }

  render(movies);
  setGridView(gridView);
  renderGridNav();
  renderWatchDiary();
  renderSessionJournal();
  resetWatchDiaryForm();
  setWatchDiaryTab('log');
  initRecHeading();
  fetchRecommendation();

  await initAuth().catch(() => {});
  const changed = await supabaseHydrate();
  if (changed) {
    loadMovies();
    setGridView(gridView);
    renderGridNav();
    renderWatchDiary();
    renderSessionJournal();
  }

  if (urlFilm) {
    requestAnimationFrame(() => openMovieModalByTitle(urlFilm.title, urlFilm.year, { pushUrl: false }));
  }
})();

diary.toggleBtn?.addEventListener('click', () => {
  setWatchDiaryOpen(!diary.isOpen);
});

diary.closeBtn?.addEventListener('click', () => {
  setWatchDiaryOpen(false);
});

diary.tabLog?.addEventListener('click', () => {
  setWatchDiaryTab('log');
});

diary.tabJournal?.addEventListener('click', () => {
  setWatchDiaryTab('journal');
});

diary.composerToggle?.addEventListener('click', () => {
  setWatchDiaryComposerOpen(!diary.composerOpen);
  if (diary.composerOpen) diary.titleInput?.focus();
});

diary.reenrichBtn?.addEventListener('click', () => {
  reenrichMissingTasteSignals();
});

diary.titleInput?.addEventListener('input', () => {
  clearTimeout(diary.searchDebounce);
  const q = diary.titleInput.value.trim();
  if (diary.selectedResult && diary.selectedResult.title !== q) {
    diary.selectedResult = null;
    resetDiarySeriesFields();
  }
  if (q.length < 2) {
    closeDiarySearchResults();
    return;
  }
  diary.searchDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`/api/search-movie?q=${encodeURIComponent(q)}&scope=all`);
      if (!res.ok) throw new Error('search_failed');
      const results = await res.json();
      renderDiarySearchResults(results);
    } catch {
      if (diary.searchResults) {
        diary.searchResults.innerHTML = '<div class="nww-diary-search-empty">Search failed</div>';
        diary.searchResults.classList.add('is-open');
      }
    }
  }, 220);
});

diary.titleInput?.addEventListener('focus', () => {
  if ((diary.titleInput.value || '').trim().length >= 2 && diary.searchResults?.children.length) {
    diary.searchResults.classList.add('is-open');
  }
});

diary.seasonInput?.addEventListener('change', () => {
  const selected = diary.selectedResult;
  const seasonNumber = parseInt(diary.seasonInput.value, 10) || null;
  if (!selected?.tmdb_id || !seasonNumber) {
    if (diary.episodeFromInput) {
      diary.episodeFromInput.innerHTML = '<option value="">Choose start episode</option>';
      diary.episodeFromInput.disabled = true;
    }
    if (diary.episodeToInput) {
      diary.episodeToInput.innerHTML = '<option value="">Choose end episode</option>';
      diary.episodeToInput.disabled = true;
    }
    return;
  }
  loadDiaryTvEpisodes(selected.tmdb_id, seasonNumber);
});

diary.singleEpisodeInput?.addEventListener('change', () => {
  if (!diary.singleEpisodeInput?.checked) {
    setDiaryEpisodeRangeVisibility();
    return;
  }
  if (diary.episodeFromInput?.value && diary.episodeToInput) {
    diary.episodeToInput.value = diary.episodeFromInput.value;
  }
  setDiaryEpisodeRangeVisibility();
});

diary.episodeFromInput?.addEventListener('change', () => {
  if (!diary.singleEpisodeInput?.checked || !diary.episodeToInput || !diary.episodeFromInput.value) return;
  diary.episodeToInput.value = diary.episodeFromInput.value;
});


const AUTOSAVE_LOCK_KEY = 'thecollection_autosave_ts';
const AUTOSAVE_INTERVAL = 10 * 60 * 1000;
setInterval(() => {
  const last = parseInt(localStorage.getItem(AUTOSAVE_LOCK_KEY) || '0');
  if (Date.now() - last < AUTOSAVE_INTERVAL - 5000) return; // another tab just saved
  localStorage.setItem(AUTOSAVE_LOCK_KEY, String(Date.now()));
  saveSnapshot('Auto-save · ' + new Date().toLocaleString());
}, AUTOSAVE_INTERVAL);

updateSortable('collection');

function applyGrain() {
  const opacity = grainEnabled ? grainLevel : 0;
  const multiplier = 1 + darkBoost / 100;
  document.documentElement.style.setProperty('--grain-hl', Math.min(1, opacity * multiplier));
  document.documentElement.style.setProperty('--grain-sh', opacity);
}

applyGrain();


// ── Movie Modal ───────────────────────────────────────────────────────────────

const modalDetailsCache = new Map();
let modalCurrentKey = null;
let modalList  = [];
let modalIndex = 0;
let modalAnticipatedMode = false;

function openMovieModal(movie, list = null, opts = {}) {
  if (list) {
    modalList  = list;
    modalIndex = list.findIndex(m => m.title === movie.title);
    if (modalIndex === -1) modalIndex = 0;
  }
  if ('anticipatedMode' in opts) modalAnticipatedMode = opts.anticipatedMode;
  const counter = document.getElementById('mm-nav-counter');
  if (counter) counter.textContent = modalList.length > 1 ? `${modalIndex + 1} / ${modalList.length}` : '';
  document.getElementById('mm-nav-prev').style.visibility = modalList.length > 1 ? '' : 'hidden';
  document.getElementById('mm-nav-next').style.visibility = modalList.length > 1 ? '' : 'hidden';

  const backdrop   = document.getElementById('movie-modal-backdrop');
  const body       = document.getElementById('movie-modal-body');
  const modalEl    = document.getElementById('movie-modal');
  backdrop.style.display = 'flex';
  if (opts.pushUrl !== false) pushModalUrl(gridView, movie);
  const notFoundBar = document.getElementById('mm-not-found-bar');
  if (notFoundBar) notFoundBar.hidden = true;
  document.body.style.overflow = 'hidden';

  // Golden glow when this film has an active watching session
  const isLive = !!mmGetActiveSession(movie.title);
  modalEl.classList.toggle('movie-modal--live', isLive);

  // Show loading state immediately with known data + interactive skeleton tabs
  const SKEL_DETAILS = `
    <div class="mm-genres">
      <div class="mm-loading-bar mm-skel-tag"></div>
      <div class="mm-loading-bar mm-skel-tag"></div>
      <div class="mm-loading-bar mm-skel-tag"></div>
    </div>
    <div class="mm-loading-bar mm-skel-tagline"></div>
    <div class="mm-loading-bar mm-skel-overview" style="margin-top:16px"></div>
    <div class="mm-loading-bar mm-skel-overview" style="width:95%"></div>
    <div class="mm-loading-bar mm-skel-overview" style="width:88%"></div>
    <div class="mm-loading-bar mm-skel-overview" style="width:80%"></div>
    <div class="mm-loading-bar mm-skel-overview" style="width:60%"></div>
    <div class="mm-section-label mm-skel-label"></div>
    <div class="mm-cast">
      ${Array(7).fill('<div class="mm-cast-item"><div class="mm-cast-photo mm-skel-circle"></div><div class="mm-loading-bar mm-skel-cast-name"></div><div class="mm-loading-bar mm-skel-cast-char"></div><div class="mm-loading-bar mm-skel-cast-char mm-skel-cast-char--2"></div></div>').join('')}
    </div>
    <div class="mm-section-label mm-skel-label"></div>
    <div class="mm-crew">
      ${Array(5).fill('<div class="mm-crew-row"><div class="mm-loading-bar mm-skel-crew-role"></div><div class="mm-loading-bar mm-skel-crew-name"></div></div>').join('')}
    </div>`;
  const SKEL_SESSION = `
    <div style="margin-top:12px">
      <div class="mm-loading-bar" style="height:36px;border-radius:8px;margin-bottom:12px"></div>
      <div class="mm-loading-bar" style="height:80px;border-radius:8px;margin-bottom:8px"></div>
      <div class="mm-loading-bar" style="height:80px;border-radius:8px;width:70%;margin-bottom:8px"></div>
      <div class="mm-loading-bar" style="height:80px;border-radius:8px;width:50%;margin-bottom:8px"></div>
      <div class="mm-loading-bar" style="height:36px;border-radius:8px;margin-top:16px"></div>
    </div>`;
  const SKEL_WTW = `
    <div style="margin-top:12px">
      <div class="mm-loading-bar" style="height:36px;width:260px;border-radius:6px;margin-bottom:28px"></div>
      <div class="mm-loading-bar" style="height:12px;width:60px;border-radius:3px;margin-bottom:12px"></div>
      <div style="display:flex;gap:8px;margin-bottom:28px">
        ${Array(4).fill('<div class="mm-loading-bar" style="width:80px;height:80px;border-radius:12px;flex-shrink:0"></div>').join('')}
      </div>
      <div class="mm-loading-bar" style="height:12px;width:80px;border-radius:3px;margin-bottom:12px"></div>
      <div style="display:flex;gap:8px">
        ${Array(3).fill('<div class="mm-loading-bar" style="width:80px;height:80px;border-radius:12px;flex-shrink:0"></div>').join('')}
      </div>
    </div>`;

  body.innerHTML = `
    <div class="mm-poster-col">
      <img class="mm-poster" src="${movie.poster}" alt="${movie.title}">
      <div class="mm-ratings">
        <div class="mm-loading-bar mm-skel-rating"></div>
        <div class="mm-loading-bar mm-skel-rating"></div>
      </div>
      ${modalAnticipatedMode ? '' : '<div class="mm-loading-bar mm-skel-watch-btn"></div>'}
    </div>
    <div class="mm-info">
      <div class="mm-info-header mm-info-header--no-shadow">
        <div class="mm-title-row"><div class="mm-title">${movie.title}</div></div>
        <div class="mm-meta">${[movie.director, movie.year].filter(Boolean).join(' · ')}</div>
        <div class="mm-tabs mm-tabs-skel" id="mm-skel-tabs">
          <button class="mm-tab mm-tab-active" data-skel="details">Details</button>
          ${modalAnticipatedMode ? '' : `<button class="mm-tab" data-skel="session">Session</button><button class="mm-tab" data-skel="wtw">Where to watch</button>`}
        </div>
      </div>
      <div class="mm-tab-content" id="mm-skel-content">${SKEL_DETAILS}</div>
    </div>`;

  // In anticipated mode, add action buttons immediately to the skeleton poster column
  if (modalAnticipatedMode) {
    const skelPosterCol = body.querySelector('.mm-poster-col');
    const makeAction = (cls, label, handler) => {
      const btn = document.createElement('button');
      btn.className = cls;
      btn.textContent = label;
      btn.addEventListener('click', handler);
      return btn;
    };
    skelPosterCol.append(
      makeAction('mm-watch-btn mm-anticipate-btn', 'Anticipate', () => {
        const current = loadAnticipated();
        if (!current.some(a => a.title.toLowerCase() === movie.title.toLowerCase())) {
          removeFromOtherLists(movie.title);
          current.push({ title: movie.title, year: movie.year, poster: movie.poster, release_date: movie.release_date || null, addedAt: Date.now() });
          saveAnticipated(current); invalidateTabCounts(); renderGridNav();
        }
        _upcomingSuggestions = _upcomingSuggestions.filter(s => s.title !== movie.title);
        closeMovieModal(); renderAnticipated();
      }),
      makeAction('mm-action-btn mm-action-btn--meh', 'Meh', () => {
        const list = loadMeh();
        if (!list.find(x => x.title === movie.title)) {
          removeFromOtherLists(movie.title);
          list.push({ title: movie.title, year: movie.year, poster: movie.poster });
          saveMeh(list); invalidateTabCounts(); renderGridNav();
        }
        _upcomingSuggestions = _upcomingSuggestions.filter(s => s.title !== movie.title);
        closeMovieModal(); renderAnticipated();
      }),
      makeAction('mm-action-btn mm-action-btn--ban', "Don't recommend", () => {
        const list = loadBanned();
        if (!list.find(x => x.title === movie.title)) {
          removeFromOtherLists(movie.title);
          list.push({ title: movie.title, year: movie.year, poster: movie.poster });
          saveBanned(list); invalidateTabCounts(); renderGridNav();
        }
        _upcomingSuggestions = _upcomingSuggestions.filter(s => s.title !== movie.title);
        closeMovieModal(); renderAnticipated();
      }),
    );
  }

  // Lock min-height to the Details skeleton's rendered height so other tabs don't shift the modal
  const skelContent = body.querySelector('#mm-skel-content');
  if (skelContent) skelContent.style.minHeight = skelContent.scrollHeight + 'px';

  // Wire skeleton tab switching
  body.querySelectorAll('[data-skel]').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('[data-skel]').forEach(b => b.classList.remove('mm-tab-active'));
      btn.classList.add('mm-tab-active');
      const content = body.querySelector('#mm-skel-content');
      if (content) content.innerHTML = { details: SKEL_DETAILS, session: SKEL_SESSION, wtw: SKEL_WTW }[btn.dataset.skel];
    });
  });

  const cacheKey = `${movie.title}__${movie.year}`;
  modalCurrentKey = cacheKey;

  function getActiveSkelTab() {
    const active = body.querySelector('[data-skel].mm-tab-active');
    return active ? active.dataset.skel : 'details';
  }

  if (modalDetailsCache.has(cacheKey)) {
    renderModalDetails(body, movie, modalDetailsCache.get(cacheKey), getActiveSkelTab(), modalAnticipatedMode);
    return;
  }

  const detailsParams = new URLSearchParams({ title: movie.title });
  if (movie.year) detailsParams.set('year', movie.year);
  if (movie.tmdb_id) detailsParams.set('tmdb_id', movie.tmdb_id);
  fetch(`/api/movie-details?${detailsParams}`)
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      modalDetailsCache.set(cacheKey, data);
      if (modalCurrentKey === cacheKey) renderModalDetails(body, movie, data, getActiveSkelTab(), modalAnticipatedMode);
    })
    .catch(() => {});
}

function mmNormalizeTitle(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getSessionedTitles() {
  try {
    const signals = JSON.parse(localStorage.getItem(TASTE_SIGNALS_KEY) || '[]');
    return new Set(signals.map(s => (s.title || '').toLowerCase()).filter(Boolean));
  } catch { return new Set(); }
}

function mmGetSessions(title) {
  try {
    const signals = JSON.parse(localStorage.getItem(TASTE_SIGNALS_KEY) || '[]');
    return signals.filter(s => mmNormalizeTitle(s.title) === mmNormalizeTitle(title));
  } catch { return []; }
}

function mmGetActiveSession(title) {
  const data = loadNowWatching();
  if (!data) return null;
  if (mmNormalizeTitle(data.title) !== mmNormalizeTitle(title)) return null;
  return data;
}

function renderModalDetails(body, movie, data, initialTab = 'details', anticipatedMode = false) {
  // Backfill director into storage — always prefer fresh API data over stale stored value
  if (data.director && data.director !== movie.director) {
    const listKeys = ['movies', 'watchlist', 'maybe', 'meh', 'banned'];
    const loaders  = { movies: loadMovies, watchlist: loadWatchlist, maybe: loadMaybe, meh: loadMeh, banned: loadBanned };
    const savers   = { movies: saveMovies, watchlist: saveWatchlist, maybe: saveMaybe, meh: saveMeh, banned: saveBanned };
    listKeys.forEach(key => {
      const arr = loaders[key]();
      const entry = arr.find(x => x.title === movie.title);
      if (entry && !entry.director) {
        entry.director = data.director;
        savers[key](arr);
      }
    });
    movie.director = data.director;
  }

  ModalComponent.renderModal(body, movie, data, {
    initialTab,
    anticipatedMode,
    onAnticipate: (m) => {
      const current = loadAnticipated();
      if (!current.some(a => a.title.toLowerCase() === m.title.toLowerCase())) {
        removeFromOtherLists(m.title);
        current.push({ title: m.title, year: m.year, poster: m.poster, release_date: m.release_date || null, addedAt: Date.now() });
        saveAnticipated(current);
        invalidateTabCounts();
        renderGridNav();
      }
      _upcomingSuggestions = _upcomingSuggestions.filter(s => s.title !== m.title);
      closeMovieModal();
      renderAnticipated();
    },
    onMeh: (m) => {
      const list = loadMeh();
      if (!list.find(x => x.title === m.title)) {
        removeFromOtherLists(m.title);
        list.push({ title: m.title, year: m.year, poster: m.poster });
        saveMeh(list);
        invalidateTabCounts();
        renderGridNav();
      }
      _upcomingSuggestions = _upcomingSuggestions.filter(s => s.title !== m.title);
      closeMovieModal();
      renderAnticipated();
    },
    onBan: (m) => {
      const list = loadBanned();
      if (!list.find(x => x.title === m.title)) {
        removeFromOtherLists(m.title);
        list.push({ title: m.title, year: m.year, poster: m.poster });
        saveBanned(list);
        invalidateTabCounts();
        renderGridNav();
      }
      _upcomingSuggestions = _upcomingSuggestions.filter(s => s.title !== m.title);
      closeMovieModal();
      renderAnticipated();
    },
    onWatchTonight: (m) => watchTonight(m, gridView),
    getActiveSessions: () => loadNowWatching(),
    getPastSessions: () => {
      try { return JSON.parse(localStorage.getItem(TASTE_SIGNALS_KEY) || '[]'); } catch { return []; }
    },
    onSendChat: async (message, chatHistory) => {
      const res = await fetch('/api/companion-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: movie.title, year: movie.year, director: movie.director,
          runtime: data.runtime, elapsed_pct: 0,
          message, chat_history: chatHistory,
          spoilers_ok: false, model: getRecModel(),
        }),
      });
      return res.ok ? res.json() : { error: true };
    },
    onGenerateFact: async (m) => {
      const res = await fetch('/api/companion-facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: m.title, year: m.year, director: m.director,
          runtime: data.runtime, spoilers_ok: false, model: getRecModel(),
        }),
      });
      return res.ok ? res.json() : { facts: [] };
    },
    getCountry: () => getWTWCountry(),
    onCountryChange: (code) => { localStorage.setItem(WTW_COUNTRY_KEY, code); },
    onFetchProviders: async (tmdbId, country) => {
      if (!tmdbId) return null;
      const cached = getCachedProviders(tmdbId);
      if (cached && cached.country === country) return cached;
      try {
        const res = await fetch(`/api/watch-providers?tmdb_id=${tmdbId}&country=${country}&title=${encodeURIComponent(movie.title)}&year=${movie.year || ''}`);
        if (!res.ok) return null;
        const providerData = await res.json();
        setCachedProviders(tmdbId, providerData);
        return providerData;
      } catch { return null; }
    },
  });
}

function closeMovieModal() {
  document.getElementById('movie-modal-backdrop').style.display = 'none';
  document.body.style.overflow = '';
  modalAnticipatedMode = false;
  const notFoundBar = document.getElementById('mm-not-found-bar');
  if (notFoundBar) notFoundBar.hidden = true;
  stripModalUrl(gridView);
}

function openMovieModalByTitle(title, year, opts = {}) {
  const norm = t => (t || '').toLowerCase().trim();
  const normTitle = norm(title);
  const allMovies = [
    ...movies,
    ...loadWatchlist(),
    ...loadMaybe(),
    ...loadMeh(),
    ...loadBanned(),
    ...loadStandards(),
    ...loadAnticipated(),
  ];
  // Try title + year match first, then title-only fallback
  let found = year
    ? allMovies.find(m => norm(m.title) === normTitle && String(m.year) === String(year))
    : null;
  if (!found) found = allMovies.find(m => norm(m.title) === normTitle);

  if (found) {
    openMovieModal(found, null, opts);
  } else {
    // Ghost modal: film not in any list
    const ghost = { title, year: year || null, poster: null };
    openMovieModal(ghost, null, opts);
    // Show the not-found bar with add buttons
    const notFoundBar = document.getElementById('mm-not-found-bar');
    if (notFoundBar) {
      notFoundBar.hidden = false;
      initNotFoundBar(ghost, notFoundBar);
    }
  }
}

function initNotFoundBar(movie, bar) {
  // Wire add buttons — each removes from other lists, adds to target, hides bar
  bar.querySelectorAll('.mm-add-btn').forEach(btn => {
    // Clone to remove previous listeners
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      const list = fresh.dataset.list;
      const film = {
        title: movie.title,
        year: movie.year || null,
        poster: movie.poster || null,
        addedAt: Date.now(),
      };
      removeFromOtherLists(film.title);
      if (list === 'collection') {
        movies.unshift(film);
        saveMovies();
        markDirty('collection');
        setGridView('collection');
        renderGridNav();
      } else if (list === 'watchlist') {
        const wl = loadWatchlist();
        wl.unshift(film);
        saveWatchlist(wl);
        markDirty('watchlist');
        renderGridNav();
      } else if (list === 'maybe') {
        const my = loadMaybe();
        my.unshift(film);
        saveMaybe(my);
        markDirty('maybe');
        renderGridNav();
      } else if (list === 'meh') {
        const mh = loadMeh();
        mh.unshift(film);
        saveMeh(mh);
        markDirty('meh');
        renderGridNav();
      } else if (list === 'banned') {
        const bn = loadBanned();
        bn.unshift(film);
        saveBanned(bn);
        markDirty('banned');
        renderGridNav();
      }
      invalidateTabCounts();
      bar.hidden = true;
    });
  });
}

function modalNavigate(dir) {
  if (modalList.length < 2) return;
  modalIndex = (modalIndex + dir + modalList.length) % modalList.length;
  openMovieModal(modalList[modalIndex]);
}

document.getElementById('movie-modal-close').addEventListener('click', closeMovieModal);
document.getElementById('mm-nav-prev').addEventListener('click', () => modalNavigate(-1));
document.getElementById('mm-nav-next').addEventListener('click', () => modalNavigate(1));
document.getElementById('movie-modal-backdrop').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeMovieModal();
});
document.addEventListener('keydown', (e) => {
  const open = document.getElementById('movie-modal-backdrop').style.display !== 'none';
  if (!open) return;
  if (e.key === 'Escape')      closeMovieModal();
  if (e.key === 'ArrowLeft')   modalNavigate(-1);
  if (e.key === 'ArrowRight')  modalNavigate(1);
  const inInput = e.target.closest('input, textarea, [contenteditable]');
  if (!inInput && (e.key === '[' || e.key === ']')) {
    const tabs = [...document.querySelectorAll('#movie-modal-body .mm-tab')];
    const activeIdx = tabs.findIndex(t => t.classList.contains('mm-tab-active'));
    const next = (activeIdx + (e.key === ']' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next]?.click();
  }
});

// ── Now Watching Widget ──────────────────────────────────────────────────────

const NOW_WATCHING_KEY = 'thecollection_now_watching';

const nww = {
  el: document.getElementById('nww'),
  idleBtn: document.getElementById('nww-idle-btn'),
  pill: document.getElementById('nww-pill'),
  pillPoster: document.getElementById('nww-pill-poster'),
  pillTitle: document.getElementById('nww-pill-title'),
  pillTime: document.getElementById('nww-pill-time'),
  pillBarFill: document.getElementById('nww-pill-bar-fill'),
  panel: document.getElementById('nww-panel'),
  search: document.getElementById('nww-search'),
  searchInput: document.getElementById('nww-search-input'),
  quickPicks: document.getElementById('nww-quick-picks'),
  searchResults: document.getElementById('nww-search-results'),
  playing: document.getElementById('nww-playing'),
  poster: document.getElementById('nww-poster'),
  title: document.getElementById('nww-title'),
  meta: document.getElementById('nww-meta'),
  progressBar: document.getElementById('nww-progress-bar'),
  progressFill: document.getElementById('nww-progress-fill'),
  elapsed: document.getElementById('nww-elapsed'),
  runtime: document.getElementById('nww-runtime'),
  controls: document.getElementById('nww-controls'),
  pauseBtn: document.getElementById('nww-pause-btn'),
  doneBtn: document.getElementById('nww-done-btn'),
  abandonBtn: document.getElementById('nww-abandon-btn'),
  decisions: document.getElementById('nww-decisions'),
  decCollection: document.getElementById('nww-dec-collection'),
  decMeh: document.getElementById('nww-dec-meh'),
  decBan: document.getElementById('nww-dec-ban'),
  confirmation: document.getElementById('nww-confirmation'),
  // Companion
  companionPanel:     document.getElementById('nww-companion'),
  companionTitle:     document.getElementById('nww-companion-title'),
  companionSpoiler:   document.getElementById('nww-companion-spoiler'),
  companionClose:     document.getElementById('nww-companion-close'),
  companionOpenBtn:   document.getElementById('nww-companion-open-btn'),
  diaryPanel:         document.getElementById('nww-diary'),
  diaryOpenBtn:       document.getElementById('nww-diary-open-btn'),
  diaryCloseBtn:      document.getElementById('nww-diary-close'),
  diaryForm:          document.getElementById('nww-diary-form'),
  diaryTitleInput:    document.getElementById('nww-diary-title-input'),
  diaryStatusInput:   document.getElementById('nww-diary-status-input'),
  diaryWatchedAtInput: document.getElementById('nww-diary-watched-at-input'),
  diaryTimestampInput: document.getElementById('nww-diary-timestamp-input'),
  diaryNoteInput:     document.getElementById('nww-diary-note-input'),
  diaryRewatchInput:  document.getElementById('nww-diary-rewatch-input'),
  diarySubmit:        document.getElementById('nww-diary-submit'),
  diaryEntries:       document.getElementById('nww-diary-entries'),
  diaryEntryTemplate: document.getElementById('nww-diary-entry-template'),
  modelSonnet:        document.getElementById('nww-model-sonnet'),
  modelHaiku:         document.getElementById('nww-model-haiku'),
  factsList:          document.getElementById('nww-facts-list'),
  factsLoading:       document.getElementById('nww-facts-loading'),
  chatThread:         document.getElementById('nww-chat-thread'),
  chatInput:          document.getElementById('nww-chat-input'),
  chatSend:           document.getElementById('nww-chat-send'),
  companionFooter:    document.getElementById('nww-companion-footer'),
  interval: null,
  searchDebounce: null,
  state: 'idle', // idle | searching | playing | expanded | deciding
  playingView: 'controls',
  diaryOpen: false,
  transitionTimers: [],
  transitionToken: 0
};

function nwwFormatTime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function nwwParseTime(str) {
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 1) return parts[0] * 60000;
  return null;
}

function nwwMakeEditable(el, isRuntime) {
  el.style.cursor = 'pointer';
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const current = el.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.className = 'nww-time-edit';
    input.style.cssText = 'width:60px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff;font-size:11px;font-family:Inter,sans-serif;text-align:center;padding:1px 2px;font-variant-numeric:tabular-nums;';
    el.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const ms = nwwParseTime(input.value);
      input.replaceWith(el);
      if (ms === null) return;
      const data = loadNowWatching();
      if (!data) return;
      if (isRuntime) {
        data.runtime = ms / 60000;
      } else {
        data.accumulatedMs = ms;
        data.startedAt = Date.now();
        if (data.pausedAt) data.pausedAt = Date.now();
      }
      saveNowWatching(data);
      nwwUpdateDisplay();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); if (ev.key === 'Escape') { input.value = current; input.blur(); } });
  });
}

function nwwGetElapsed(data) {
  if (!data) return 0;
  if (data.pausedAt) return data.accumulatedMs;
  return data.accumulatedMs + (Date.now() - data.startedAt);
}

function loadNowWatching() {
  try { return JSON.parse(localStorage.getItem(NOW_WATCHING_KEY)); } catch { return null; }
}

function saveNowWatching(data) {
  localStorage.setItem(NOW_WATCHING_KEY, JSON.stringify(data));
}

function clearNowWatching() {
  localStorage.removeItem(NOW_WATCHING_KEY);
}

function nwwClearTransitionTimers() {
  nww.transitionTimers.forEach(clearTimeout);
  nww.transitionTimers = [];
}

function nwwResetTransientStyles() {
  nww.el.style.transition = '';
  nww.el.style.transform = '';
  nww.el.style.transformOrigin = '';
  nww.el.style.width = '';
  nww.el.style.height = '';
  nww.el.style.overflow = '';
  nww.el.classList.remove('nww--suppress-enter');
  nww.el.classList.remove('nww--pill-enter');
  nww.el.classList.remove('nww--diary-open');

  nww.panel.style.transition = '';
  nww.panel.style.opacity = '';
  nww.panel.style.transform = '';
  nww.panel.style.height = '';
  nww.panel.style.pointerEvents = '';
  nww.panel.style.removeProperty('animation');

  nww.pill.style.transition = '';
  nww.pill.style.opacity = '';
  nww.pill.style.transform = '';
  nww.pill.style.position = '';
  nww.pill.style.right = '';
  nww.pill.style.bottom = '';
  nww.pill.style.pointerEvents = '';
  nww.pill.style.zIndex = '';
  nww.pill.style.display = '';

  nww.companionPanel.style.animation = '';
  nww.companionOpenBtn.style.transition = '';
  nww.companionOpenBtn.style.opacity = '';
  nww.companionOpenBtn.style.transform = '';
  if (nww.diaryPanel) {
    nww.diaryPanel.style.animation = '';
    nww.diaryPanel.style.transition = '';
  }
  if (nww.diaryOpenBtn) {
    nww.diaryOpenBtn.style.transition = '';
    nww.diaryOpenBtn.style.opacity = '';
    nww.diaryOpenBtn.style.transform = '';
  }
  nww.diaryOpen = false;
}

function nwwCancelTransitions() {
  nww.transitionToken += 1;
  nwwClearTransitionTimers();
  nwwResetTransientStyles();
}

function nwwBeginTransition() {
  nwwCancelTransitions();
  return nww.transitionToken;
}

function nwwQueueTransition(token, delay, fn) {
  const timer = setTimeout(() => {
    nww.transitionTimers = nww.transitionTimers.filter(id => id !== timer);
    if (token !== nww.transitionToken) return;
    fn();
  }, delay);
  nww.transitionTimers.push(timer);
  return timer;
}

function nwwSetPlayingView(view) {
  nww.playingView = view;
  nww.controls.style.display = '';
  nww.decisions.style.display = '';
  nww.confirmation.style.display = '';
  nww.el.dataset.playingView = view;
}

function nwwSetState(state) {
  nww.state = state;
  nww.el.className = 'nww nww--' + state;
  nww.el.dataset.playingView = nww.playingView;
  if (nww.diaryOpen) nww.el.classList.add('nww--diary-open');
  // Add paused modifier when playing but paused
  const data = loadNowWatching();
  if (state === 'playing' && data && data.pausedAt) {
    nww.el.classList.add('nww--paused');
  }
}

function nwwUpdateDisplay() {
  const data = loadNowWatching();
  if (!data) return;
  const elapsedMs = nwwGetElapsed(data);
  const runtimeMs = (data.runtime || 0) * 60000;
  const pct = runtimeMs > 0 ? Math.min(100, (elapsedMs / runtimeMs) * 100) : 0;

  // Pill
  nww.pillTitle.textContent = data.title;
  nww.pillTime.textContent = nwwFormatTime(elapsedMs) + ' / ' + nwwFormatTime(runtimeMs);
  nww.pillBarFill.style.width = pct + '%';

  // Expanded panel
  nww.elapsed.textContent = nwwFormatTime(elapsedMs);
  nww.runtime.textContent = nwwFormatTime(runtimeMs);
  nww.progressFill.style.width = pct + '%';

  // Check completion
  if (runtimeMs > 0 && elapsedMs >= runtimeMs && nww.state === 'playing') {
    nww.el.classList.add('nww--complete');
    nwwSetState('expanded');
    nwwShowDecisions();
  }

  // Companion: deliver timed facts
  if (data.companion?.facts?.length) {
    nwwMaybeDeliverFact(elapsedMs, data);
  }
}

function nwwStartInterval() {
  nwwStopInterval();
  nww.interval = setInterval(nwwUpdateDisplay, 1000);
}

function nwwStopInterval() {
  if (nww.interval) { clearInterval(nww.interval); nww.interval = null; }
}

function nwwTriggerPillEnter() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (nww.state !== 'playing') return;

  nww.el.classList.remove('nww--pill-enter');

  requestAnimationFrame(() => {
    if (nww.state !== 'playing') return;
    nww.el.classList.add('nww--pill-enter');
    nww.pill.addEventListener('animationend', () => {
      nww.el.classList.remove('nww--pill-enter');
    }, { once: true });
  });
}

function nwwAnimateWidgetFlip(mutator, duration = 320, token = nww.transitionToken) {
  const first = nww.el.getBoundingClientRect();
  mutator();
  const last = nww.el.getBoundingClientRect();

  if (!first.width || !first.height || !last.width || !last.height) return;

  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / last.width;
  const sy = first.height / last.height;
  const originX = 100;
  const originY = 100;

  nww.el.style.transformOrigin = `${originX}% ${originY}%`;
  nww.el.style.transition = 'none';
  nww.el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  void nww.el.offsetHeight;
  nww.el.style.transition = `transform ${duration}ms cubic-bezier(0.23, 1, 0.32, 1)`;
  nww.el.style.transform = '';

  nwwQueueTransition(token, duration + 20, () => {
    nww.el.style.transition = '';
    nww.el.style.transform = '';
    nww.el.style.transformOrigin = '';
  });
}

function nwwCollapseToPill() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    nwwCancelTransitions();
    nwwSetState('playing');
    return;
  }
  const token = nwwBeginTransition();

  const pill = nww.pill;
  const panel = nww.panel;

  // Measure and lock container at current rendered size — whole pixels only
  const rect = nww.el.getBoundingClientRect();
  const lockedH = Math.round(rect.height);
  const lockedW = Math.round(rect.width);
  nww.el.style.overflow = 'hidden';
  nww.el.style.width = lockedW + 'px';
  nww.el.style.height = lockedH + 'px';
  void nww.el.offsetHeight;

  // Fade panel out and shrink container simultaneously
  panel.style.transition = 'opacity 0.15s ease-out';
  panel.style.opacity = '0';
  nww.el.style.transition = 'height 0.26s cubic-bezier(0.23, 1, 0.32, 1), width 0.26s cubic-bezier(0.23, 1, 0.32, 1)';
  nww.el.style.height = '48px';
  nww.el.style.width = '280px';

  // Once panel is invisible, switch state — pill emerges at top of still-shrinking container
  nwwQueueTransition(token, 150, () => {
    panel.style.transition = '';
    panel.style.animation = ''; // clear animation:none left from expand transition
    nwwSetState('playing');     // CSS: panel → display:none, pill → shown; golden border starts
    nwwTriggerPillEnter();
    panel.style.opacity = '';   // safe to clear now (panel is display:none)
    pill.style.opacity = '0';
    void pill.offsetHeight;
    pill.style.transition = 'opacity 0.12s cubic-bezier(0.23, 1, 0.32, 1)';
    pill.style.opacity = '1';
  });

  // Cleanup after container shrink completes
  nwwQueueTransition(token, 270, () => {
    nwwResetTransientStyles();
  });
}

function nwwPopulatePlaying(data) {
  nww.poster.src = data.poster || '';
  nww.poster.alt = data.title;
  // Apply fold texture to poster
  const wrap = document.getElementById('nww-poster-wrap');
  wrap.querySelectorAll('.poster-texture').forEach(el => el.remove());
  const texKey = 'nww_' + (data.title || '');
  const tex = getCachedTextures(texKey);
  const hlDiv = document.createElement('div');
  hlDiv.className = 'poster-texture poster-texture-hl';
  hlDiv.style.backgroundImage = `url(${tex.hl})`;
  const shDiv = document.createElement('div');
  shDiv.className = 'poster-texture poster-texture-sh';
  shDiv.style.backgroundImage = `url(${tex.sh})`;
  wrap.appendChild(hlDiv);
  wrap.appendChild(shDiv);
  nww.title.textContent = data.title;
  nww.meta.textContent = [data.director, data.year].filter(Boolean).join(' · ');
  nww.runtime.textContent = nwwFormatTime((data.runtime || 0) * 60000);
  nww.pillPoster.innerHTML = data.poster ? `<img src="${data.poster}" alt="">` : '';
  nww.pauseBtn.textContent = data.pausedAt ? 'Resume' : 'Pause';
  nww.confirmation.textContent = '';
  nwwSetPlayingView('controls');
  nww.el.classList.remove('nww--complete');
}

function nwwShowDecisions() {
  nwwSetPlayingView('decisions');
  nwwStopInterval();
}

function nwwActivate(movie, sourceView) {
  nwwCancelTransitions();
  const runtimeMin = movie.runtime || 0;
  const data = {
    title: movie.title, year: movie.year, director: movie.director,
    poster: movie.poster, runtime: runtimeMin,
    sourceView: sourceView || 'search',
    startedAt: Date.now(), pausedAt: null, accumulatedMs: 0
  };
  data.companion = nwwDefaultCompanion();
  ensureDiaryDraftFromSession(data);
  saveNowWatching(data);
  nwwPopulatePlaying(data);
  nwwSetState('playing');
  nwwTriggerPillEnter();
  nwwUpdateDisplay();
  nwwStartInterval();
  populateWatchDiaryFormFromSession(data);

  // Fetch runtime if not known
  if (!runtimeMin && movie.title) {
    fetch(`/api/movie-details?title=${encodeURIComponent(movie.title)}&year=${encodeURIComponent(movie.year || '')}`)
      .then(r => r.json())
      .then(d => {
        if (d.runtime) {
          const nwData = loadNowWatching();
          if (nwData && nwData.title === movie.title) {
            nwData.runtime = parseInt(d.runtime) || 0;
            saveNowWatching(nwData);
            nwwUpdateDisplay();
          }
        }
      }).catch(() => {});
  }
}

// ── Companion ─────────────────────────────────────────────────────────────────

function nwwDefaultCompanion() {
  return {
    open: false,
    facts_fetched: false,
    facts_loading: false,
    facts: [],
    chat_history: [],
    session_cost: 0,
    spoilers_ok: false,
    model_mode: 'sonnet',
  };
}

function nwwRenderFactDots(facts) {
  nww.progressBar.querySelectorAll('.nww-fact-dot').forEach(d => d.remove());
  if (!facts?.length) return;
  facts.forEach(f => {
    const dot = document.createElement('div');
    dot.className = 'nww-fact-dot' + (f.delivered ? ' nww-fact-dot-delivered' : '');
    dot.style.left = f.pct + '%';
    nww.progressBar.appendChild(dot);
  });
}

function nwwSetCompanionOpen(open) {
  nww.el.classList.toggle('nww--companion-open', open);
  const data = loadNowWatching();
  if (data) {
    if (!data.companion) data.companion = nwwDefaultCompanion();
    data.companion.open = open;
    saveNowWatching(data);
  }
}

function nwwSetDiaryOpen(open) {
  nww.diaryOpen = open;
  nww.el.classList.toggle('nww--diary-open', open);
  if (nww.diaryPanel) nww.diaryPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (nww.diaryOpenBtn) nww.diaryOpenBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function nwwOpenDiary() {
  if (nww.state !== 'expanded' && nww.state !== 'deciding') return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (nww.el.classList.contains('nww--companion-open')) {
    nwwSetCompanionOpen(false);
    nwwRenderCompanion(loadNowWatching());
  }
  if (reducedMotion) {
    nwwCancelTransitions();
    nwwSetDiaryOpen(true);
    return;
  }

  const token = nwwBeginTransition();
  const btn = nww.diaryOpenBtn;
  if (btn) {
    btn.style.transition = 'opacity 0.12s ease-in, transform 0.12s cubic-bezier(0.23, 1, 0.32, 1)';
    btn.style.opacity = '0';
    btn.style.transform = 'scale(0.94) translateY(2px)';
  }

  nww.panel.style.setProperty('animation', 'none', 'important');
  const startH = nww.panel.getBoundingClientRect().height;
  nww.panel.style.height = startH + 'px';
  nww.panel.style.transition = 'height 0.28s cubic-bezier(0.23, 1, 0.32, 1)';
  void nww.panel.offsetHeight;
  nww.panel.style.height = '640px';

  nwwQueueTransition(token, 290, () => {
    nww.panel.style.transition = '';

    nwwAnimateWidgetFlip(() => {
      nwwSetDiaryOpen(true);
    }, 380, token);

    nww.panel.style.setProperty('animation', 'nww-panel-diary-shift-left 0.34s cubic-bezier(0.23, 1, 0.32, 1) both', 'important');
    nww.panel.addEventListener('animationend', () => {
      nww.panel.style.removeProperty('animation');
      nww.panel.style.height = '';
    }, { once: true });
  });

  nwwQueueTransition(token, 180, () => {
    if (!btn) return;
    btn.style.transition = '';
    btn.style.opacity = '';
    btn.style.transform = '';
  });
}

function nwwCloseDiary() {
  if (!nww.diaryOpen) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    nwwCancelTransitions();
    nwwSetDiaryOpen(false);
    return;
  }

  const token = nwwBeginTransition();
  if (nww.diaryPanel) {
    nww.diaryPanel.style.animation = 'nww-diary-drop-out 0.22s cubic-bezier(0.23, 1, 0.32, 1) both';
  }
  nww.panel.style.setProperty('animation', 'nww-panel-diary-shift-right 0.28s cubic-bezier(0.23, 1, 0.32, 1) both', 'important');
  nww.panel.addEventListener('animationend', () => nww.panel.style.removeProperty('animation'), { once: true });

  nwwQueueTransition(token, 220, () => {
    nww.panel.style.height = nww.panel.getBoundingClientRect().height + 'px';
    nwwAnimateWidgetFlip(() => {
      nwwSetDiaryOpen(false);
    }, 320, token);

    nwwQueueTransition(token, 20, () => {
      if (nww.diaryPanel) nww.diaryPanel.style.animation = '';
      nww.panel.style.transition = 'height 0.28s cubic-bezier(0.23, 1, 0.32, 1)';
      nww.panel.style.height = '412px';
      nwwQueueTransition(token, 300, () => {
        nww.panel.style.transition = '';
        nww.panel.style.height = '';
      });
    });
  });
}

function nwwCompanionUpdateFooter(sessionCost) {
  if (sessionCost > 0) {
    nww.companionFooter.textContent = `Session: $${sessionCost.toFixed(4)}`;
  } else {
    nww.companionFooter.textContent = '';
  }
}

function nwwCompanionUpdateModelBtns(modelMode) {
  nww.modelSonnet.classList.toggle('active', modelMode !== 'haiku');
  nww.modelHaiku.classList.toggle('active', modelMode === 'haiku');
}

function nwwRenderCompanion(data) {
  if (!data) {
    nww.chatThread.innerHTML = '';
    nww.factsList.innerHTML = '<div class="nww-facts-loading" id="nww-facts-loading"><div class="nww-facts-skeleton"></div><div class="nww-facts-skeleton"></div></div>';
    nww.factsLoading = document.getElementById('nww-facts-loading');
    nww.companionFooter.textContent = '';
    return;
  }
  const c = data.companion || nwwDefaultCompanion();
  nww.companionSpoiler.checked = c.spoilers_ok;
  nwwCompanionUpdateModelBtns(c.model_mode);

  // Render all facts (delivered = visible, undelivered = dimmed)
  nww.factsList.innerHTML = '';
  nwwRenderFactDots(c.facts);
  if (c.facts.length) {
    c.facts.forEach(f => nwwAppendFact(f, false));
  } else if (!c.facts_fetched) {
    nww.factsList.innerHTML = '<div class="nww-facts-loading" id="nww-facts-loading"><div class="nww-facts-skeleton"></div><div class="nww-facts-skeleton"></div></div>';
    nww.factsLoading = document.getElementById('nww-facts-loading');
  }

  // Render chat history
  nww.chatThread.innerHTML = '';
  (c.chat_history || []).forEach(msg => nwwAppendChatBubble(msg.role, msg.content, false));

  nwwCompanionUpdateFooter(c.session_cost || 0);
  nww.chatThread.scrollTop = nww.chatThread.scrollHeight;
}

function nwwAppendFact(fact, highlight = false) {
  const card = document.createElement('div');
  card.dataset.pct = fact.pct;
  card.className = 'nww-fact-card' + (highlight ? ' nww-fact-new' : (!fact.delivered ? ' nww-fact-upcoming' : ''));
  card.innerHTML = `<div class="nww-fact-pct">~${fact.pct}% in</div><div class="nww-fact-text">${fact.text}</div>`;
  nww.factsList.appendChild(card);
}

function nwwAppendChatBubble(role, content, animate = true) {
  const msg = document.createElement('div');
  msg.className = `nww-msg nww-msg-${role}${!animate ? ' no-anim' : ''}${role === 'assistant' && animate ? ' nww-msg-assistant-new' : ''}`;
  const bubble = document.createElement('div');
  bubble.className = 'nww-msg-bubble';
  bubble.textContent = content;
  msg.appendChild(bubble);
  nww.chatThread.appendChild(msg);
  nww.chatThread.scrollTop = nww.chatThread.scrollHeight;
  return msg;
}

function nwwAppendTyping() {
  const msg = document.createElement('div');
  msg.className = 'nww-msg nww-msg-assistant nww-msg-loading';
  msg.innerHTML = '<div class="nww-msg-bubble"><div class="nww-typing"><div class="nww-typing-dot"></div><div class="nww-typing-dot"></div><div class="nww-typing-dot"></div></div></div>';
  nww.chatThread.appendChild(msg);
  nww.chatThread.scrollTop = nww.chatThread.scrollHeight;
  return msg;
}

async function nwwFetchFacts(data) {
  if (!isAiEnabled()) return;
  if (!data.companion) data.companion = nwwDefaultCompanion();
  data.companion.facts_loading = true;
  saveNowWatching(data);

  // Show skeleton if companion is open
  if (data.companion.open && !nww.factsList.querySelector('.nww-facts-skeleton')) {
    nww.factsList.innerHTML = '<div class="nww-facts-loading" id="nww-facts-loading"><div class="nww-facts-skeleton"></div><div class="nww-facts-skeleton"></div></div>';
    nww.factsLoading = document.getElementById('nww-facts-loading');
  }

  try {
    const res = await fetch('/api/companion-facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.title,
        year: data.year,
        director: data.director,
        runtime: data.runtime,
        model: data.companion.model_mode || 'sonnet',
        spoilers_ok: data.companion.spoilers_ok,
      }),
    });
    const json = await res.json();

    const nwData = loadNowWatching();
    if (!nwData || nwData.title !== data.title) return; // session changed

    nwData.companion.facts = (json.facts || []).map(f => ({ ...f, delivered: false }));
    nwData.companion.facts_fetched = true;
    nwData.companion.facts_loading = false;
    if (json.api_cost) {
      nwData.companion.session_cost = (nwData.companion.session_cost || 0) + json.api_cost;
      totalCost += json.api_cost;
      localStorage.setItem(TOTAL_COST_KEY, totalCost.toFixed(6));
      schedulePush();
      updateRecCostHint();
    }
    saveNowWatching(nwData);

    // Deliver any facts already passed
    const elapsedMs = nwwGetElapsed(nwData);
    const runtimeMs = (nwData.runtime || 0) * 60000;
    if (runtimeMs > 0) {
      const pct = (elapsedMs / runtimeMs) * 100;
      nwData.companion.facts.forEach(f => {
        if (pct >= f.pct) f.delivered = true;
      });
      saveNowWatching(nwData);
    }

    if (nwData.companion.open) {
      nww.factsList.innerHTML = '';
      nwData.companion.facts.forEach(f => nwwAppendFact(f, false));
      nwwRenderFactDots(nwData.companion.facts);
      nwwCompanionUpdateFooter(nwData.companion.session_cost);
    }
  } catch {
    const nwData = loadNowWatching();
    if (nwData?.companion) {
      nwData.companion.facts_loading = false;
      saveNowWatching(nwData);
    }
    if (nww.el.classList.contains('nww--companion-open')) {
      nww.factsList.innerHTML = '<div class="nww-facts-error">Couldn\'t load film notes. <button class="nww-facts-retry" id="nww-facts-retry">Retry</button></div>';
      document.getElementById('nww-facts-retry')?.addEventListener('click', () => {
        const d = loadNowWatching();
        if (d) nwwFetchFacts(d);
      });
    }
  }
}

function nwwMaybeDeliverFact(elapsedMs, data) {
  const c = data.companion;
  if (!c?.facts?.length) return;
  const runtimeMs = (data.runtime || 0) * 60000;
  if (runtimeMs === 0) return;
  const pct = (elapsedMs / runtimeMs) * 100;

  const next = c.facts.find(f => !f.delivered && pct >= f.pct);
  if (!next) return;

  next.delivered = true;
  saveNowWatching(data);

  // Update the timeline dot regardless of panel state
  const dot = nww.progressBar.querySelector(`.nww-fact-dot[style*="left: ${next.pct}%"]`);
  if (dot) dot.classList.add('nww-fact-dot-delivered');

  if (c.open) {
    // Find the existing dimmed card and activate it
    const card = nww.factsList.querySelector(`[data-pct="${next.pct}"]`);
    if (card) {
      card.classList.remove('nww-fact-upcoming');
      card.classList.add('nww-fact-new');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } else {
    // Pulse pill to signal new fact
    nww.pill.classList.remove('nww-pill-fact-pulse');
    nww.pill.offsetWidth; // reflow
    nww.pill.classList.add('nww-pill-fact-pulse');
    nww.pill.addEventListener('animationend', () => nww.pill.classList.remove('nww-pill-fact-pulse'), { once: true });
  }
}

async function nwwSendChat(message) {
  if (!isAiEnabled()) return;
  const data = loadNowWatching();
  if (!data?.companion) return;

  nww.chatInput.value = '';
  nww.chatInput.closest('.nww-chat-input-area')?.classList.remove('has-content');
  nww.chatSend.disabled = true;
  nwwAppendChatBubble('user', message);
  const typingEl = nwwAppendTyping();

  const elapsedMs = nwwGetElapsed(data);
  const runtimeMs = (data.runtime || 0) * 60000;
  const elapsed_pct = runtimeMs > 0 ? (elapsedMs / runtimeMs) * 100 : 0;

  try {
    const res = await fetch('/api/companion-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.title,
        year: data.year,
        director: data.director,
        runtime: data.runtime,
        elapsed_pct,
        message,
        chat_history: data.companion.chat_history || [],
        spoilers_ok: data.companion.spoilers_ok,
        model: data.companion.model_mode || 'sonnet',
      }),
    });
    const json = await res.json();

    typingEl.remove();

    if (json.error) {
      const errEl = nwwAppendChatBubble('assistant', 'Something went wrong — try again.', true);
      errEl.classList.add('nww-msg-error');
    } else {
      nwwAppendChatBubble('assistant', json.reply);

      const nwData = loadNowWatching();
      if (nwData?.companion) {
        nwData.companion.chat_history = [
          ...(nwData.companion.chat_history || []),
          { role: 'user', content: message },
          { role: 'assistant', content: json.reply },
        ].slice(-24); // keep last 12 pairs
        if (json.api_cost) {
          nwData.companion.session_cost = (nwData.companion.session_cost || 0) + json.api_cost;
          totalCost += json.api_cost;
          localStorage.setItem(TOTAL_COST_KEY, totalCost.toFixed(6));
          schedulePush();
          updateRecCostHint();
          nwwCompanionUpdateFooter(nwData.companion.session_cost);
        }
        saveNowWatching(nwData);
      }
    }
  } catch {
    typingEl.remove();
    const errEl = nwwAppendChatBubble('assistant', 'Something went wrong — try again.', true);
    errEl.classList.add('nww-msg-error');
  }

  nww.chatSend.disabled = !isAiEnabled();
  if (isAiEnabled()) nww.chatInput.focus();
}

function nwwExtractTasteSignal(data, decision) {
  const elapsedMs = nwwGetElapsed(data);
  const runtimeMs = (data.runtime || 0) * 60000;
  const elapsed_pct = runtimeMs > 0 ? Math.round((elapsedMs / runtimeMs) * 100) : null;
  const chatHistory = data.companion?.chat_history || [];
  const signal = {
    timestamp:          Date.now(),
    title:              data.title,
    year:               data.year,
    director:           data.director,
    poster:             data.poster || null,
    decision,
    elapsed_pct,
    runtime_min:        data.runtime || null,
    watch_duration_min: Math.round(elapsedMs / 60000),
    abandoned:          decision === 'banned' && elapsed_pct !== null && elapsed_pct < 50,
    chat_turns:         Math.floor(chatHistory.length / 2),
    source_view:        data.sourceView,
    facts:              (data.companion?.facts || []).filter(f => f.delivered),
    chat_history:       chatHistory,
    llm_signals:        null, // populated asynchronously by /api/companion-extract
  };
  try {
    const signals = JSON.parse(localStorage.getItem(TASTE_SIGNALS_KEY) || '[]');
    signals.unshift(signal);
    if (signals.length > 50) signals.length = 50;
    localStorage.setItem(TASTE_SIGNALS_KEY, JSON.stringify(signals));
    renderSessionJournal();
    schedulePush();
  } catch {}

  // Fire-and-forget LLM extraction — only when there's a conversation to analyze
  if (chatHistory.length >= 2) {
    if (!isAiEnabled()) {
      // Buffer for drain when AI is re-enabled
      try {
        const buf = loadAiBuffer();
        buf.unshift({
          title:        data.title,
          year:         data.year,
          director:     data.director,
          decision,
          chat_history: chatHistory,
          facts:        data.companion?.facts || [],
          timestamp:    signal.timestamp,
        });
        saveAiBuffer(buf.slice(0, 50));
      } catch {}
    } else {
      requestTasteSignalExtraction({
        title: data.title,
        year: data.year,
        director: data.director,
        decision,
        chat_history: chatHistory,
        facts: data.companion?.facts || [],
      })
        .then((signalsPayload) => {
          if (!signalsPayload) return;
          try {
            const signals = JSON.parse(localStorage.getItem(TASTE_SIGNALS_KEY) || '[]');
            const entry = signals.find(s => s.title === data.title && s.timestamp === signal.timestamp);
            if (entry) {
              entry.llm_signals = signalsPayload;
              localStorage.setItem(TASTE_SIGNALS_KEY, JSON.stringify(signals));
              renderSessionJournal();
              schedulePush();
            }
          } catch {}
        })
        .catch(() => {}); // non-critical — never fail the decision flow
    }
  }
}

// Companion event listeners
nww.companionOpenBtn.addEventListener('click', () => {
  const data = loadNowWatching();
  if (!data) return;
  if (!data.companion) {
    data.companion = nwwDefaultCompanion();
    saveNowWatching(data);
  }
  if (nww.diaryOpen) nwwSetDiaryOpen(false);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    nwwCancelTransitions();
    nwwSetCompanionOpen(true);
    nwwRenderCompanion(loadNowWatching());
    if (!data.companion.facts_fetched && !data.companion.facts_loading) nwwFetchFacts(loadNowWatching());
    return;
  }
  const token = nwwBeginTransition();

  // Button exit
  const btn = nww.companionOpenBtn;
  btn.style.transition = 'opacity 0.12s ease-in, transform 0.12s cubic-bezier(0.23, 1, 0.32, 1)';
  btn.style.opacity = '0';
  btn.style.transform = 'scale(0.94) translateY(2px)';

  const startH = nww.panel.getBoundingClientRect().height;
  nww.panel.style.height = startH + 'px';
  nww.panel.style.transition = 'height 0.28s cubic-bezier(0.23, 1, 0.32, 1)';
  void nww.panel.offsetHeight;
  nww.panel.style.height = '620px';

  nwwQueueTransition(token, 290, () => {
    nww.panel.style.transition = '';

    nwwAnimateWidgetFlip(() => {
      nwwSetCompanionOpen(true);
      nwwRenderCompanion(loadNowWatching());
    }, 380, token);

    nww.panel.style.setProperty('animation', 'nww-panel-companion-shift-left 0.34s cubic-bezier(0.23, 1, 0.32, 1) both', 'important');
    nww.panel.addEventListener('animationend', () => {
      nww.panel.style.removeProperty('animation');
      nww.panel.style.height = '';
    }, { once: true });

    if (!data.companion.facts_fetched && !data.companion.facts_loading) nwwFetchFacts(loadNowWatching());
  });

  nwwQueueTransition(token, 180, () => {
    btn.style.transition = '';
    btn.style.opacity = '';
    btn.style.transform = '';
  });
});

nww.companionClose.addEventListener('click', () => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    nwwCancelTransitions();
    nwwSetCompanionOpen(false);
    return;
  }
  const token = nwwBeginTransition();

  nww.companionPanel.style.animation = 'nww-companion-drop-out 0.22s cubic-bezier(0.23, 1, 0.32, 1) both';
  nww.panel.style.setProperty('animation', 'nww-panel-companion-shift-right 0.28s cubic-bezier(0.23, 1, 0.32, 1) both', 'important');
  nww.panel.addEventListener('animationend', () => nww.panel.style.removeProperty('animation'), { once: true });

  nwwQueueTransition(token, 220, () => {
    nww.panel.style.height = nww.panel.getBoundingClientRect().height + 'px';
    nwwAnimateWidgetFlip(() => {
      nwwSetCompanionOpen(false);
    }, 320, token);

    nwwQueueTransition(token, 20, () => {
      nww.companionPanel.style.animation = '';
      nww.panel.style.transition = 'height 0.28s cubic-bezier(0.23, 1, 0.32, 1)';
      nww.panel.style.height = '412px';
      nwwQueueTransition(token, 300, () => {
        nww.panel.style.transition = '';
        nww.panel.style.height = '';
      });
    });
  });
});

nww.diaryOpenBtn?.addEventListener('click', () => {
  if (nww.diaryOpen) nwwCloseDiary();
  else nwwOpenDiary();
});

nww.diaryCloseBtn?.addEventListener('click', () => {
  nwwCloseDiary();
});

diary.statusInput?.addEventListener('change', () => {
  setDiaryTimestampFieldVisibility();
});

diary.form?.addEventListener('submit', (e) => {
  e.preventDefault();

  const title = diary.titleInput?.value.trim() || '';
  const status = diary.statusInput?.value || 'finished';
  const watchedAtRaw = diary.watchedAtInput?.value;
  const note = diary.noteInput?.value.trim() || '';
  const rewatch = !!diary.rewatchInput?.checked;
  const timestampMs = status === 'timestamp'
    ? parseDiaryTimestampInput(diary.timestampInput?.value || '')
    : null;

  if (!title) {
    diary.titleInput?.focus();
    return;
  }
  if (status === 'timestamp' && timestampMs === null) {
    diary.timestampInput?.focus();
    return;
  }

  const watchedAt = watchedAtRaw
    ? new Date(watchedAtRaw).toISOString()
    : new Date().toISOString();
  const selected = diary.selectedResult && diary.selectedResult.title === title
    ? diary.selectedResult
    : null;
  const seasonNumber = parseInt(diary.seasonInput?.value || '', 10) || null;
  const singleEpisode = !!diary.singleEpisodeInput?.checked;
  const episodeStartNumber = parseInt(diary.episodeFromInput?.value || '', 10) || null;
  const episodeEndNumber = parseInt((singleEpisode ? diary.episodeFromInput?.value : diary.episodeToInput?.value) || '', 10) || null;
  const episodeTitle = singleEpisode && episodeStartNumber
    ? diary.episodeFromInput?.selectedOptions?.[0]?.dataset?.episodeTitle || ''
    : '';
  const active = loadNowWatching();
  const canUpdateActive = active && active.diaryEntryId && active.title === title;

  if (selected?.media_type === 'tv' && seasonNumber && !episodeStartNumber) {
    diary.episodeFromInput?.focus();
    return;
  }
  if (selected?.media_type === 'tv' && !singleEpisode && episodeStartNumber && !episodeEndNumber) {
    diary.episodeToInput?.focus();
    return;
  }
  if (selected?.media_type === 'tv' && episodeStartNumber && episodeEndNumber && episodeEndNumber < episodeStartNumber) {
    diary.episodeToInput?.focus();
    return;
  }

  if (canUpdateActive) {
    updateDiaryEntryFromSession(active, {
      status,
      watchedAt,
      note,
      rewatch,
      timestampMs: status === 'timestamp' ? timestampMs : null,
    });
    populateWatchDiaryFormFromSession(active);
    diary.watchedAtInput.value = watchedAtRaw || formatDiaryDateInput(watchedAt);
    diary.statusInput.value = status;
    diary.noteInput.value = note;
    diary.rewatchInput.checked = rewatch;
    diary.timestampInput.value = status === 'timestamp' ? formatDiaryTimestamp(timestampMs) : '';
    setDiaryTimestampFieldVisibility();
    return;
  }

  upsertWatchLogEntry({
    id: createWatchLogId(),
    title: selected?.media_type === 'tv' && singleEpisode ? (episodeTitle || title) : title,
    seriesTitle: selected?.media_type === 'tv' ? title : null,
    year: selected?.year || null,
    poster: selected?.poster || null,
    mediaType: selected?.media_type === 'tv'
      ? (singleEpisode ? 'tv_episode' : 'tv')
      : 'movie',
    tmdbId: selected?.tmdb_id || null,
    seasonNumber: selected?.media_type === 'tv' ? seasonNumber : null,
    episodeNumber: selected?.media_type === 'tv' && singleEpisode ? episodeStartNumber : null,
    episodeStartNumber: selected?.media_type === 'tv' ? episodeStartNumber : null,
    episodeEndNumber: selected?.media_type === 'tv' ? episodeEndNumber : null,
    singleEpisode: selected?.media_type === 'tv' ? singleEpisode : false,
    episodeTitle: selected?.media_type === 'tv' && singleEpisode ? (episodeTitle || null) : null,
    watchedAt,
    startedAt: watchedAt,
    status,
    timestampMs: status === 'timestamp' ? timestampMs : null,
    note,
    rewatch,
    source: 'manual',
  });
  resetWatchDiaryForm();
});

diary.entries?.addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('[data-watch-log-delete]');
  if (!deleteBtn) return;
  const id = deleteBtn.getAttribute('data-watch-log-delete');
  if (!id) return;
  openWatchDiaryDeleteConfirm(id);
});

diary.journalList?.addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('[data-signal-delete]');
  if (!deleteBtn) return;
  e.preventDefault();
  e.stopPropagation();
  const timestamp = Number(deleteBtn.getAttribute('data-signal-delete'));
  if (!Number.isFinite(timestamp)) return;
  deleteTasteSignal(timestamp);
});

diary.confirmCancel?.addEventListener('click', () => {
  closeWatchDiaryDeleteConfirm();
});

diary.confirmBackdrop?.addEventListener('click', (e) => {
  if (e.target === diary.confirmBackdrop) closeWatchDiaryDeleteConfirm();
});

diary.confirmDelete?.addEventListener('click', () => {
  const id = diary.pendingDeleteId;
  if (!id) {
    closeWatchDiaryDeleteConfirm();
    return;
  }
  deleteWatchLogEntry(id);

  const active = loadNowWatching();
  if (active?.diaryEntryId === id) {
    delete active.diaryEntryId;
    saveNowWatching(active);
    populateWatchDiaryFormFromSession(active);
  }
  closeWatchDiaryDeleteConfirm();
});

document.addEventListener('click', (e) => {
  if (!diary.searchResults || !diary.titleInput) return;
  if (!diary.searchResults.contains(e.target) && e.target !== diary.titleInput) {
    closeDiarySearchResults();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !diary.confirmBackdrop?.hidden) {
    closeWatchDiaryDeleteConfirm();
  }
});

nww.companionSpoiler.addEventListener('change', () => {
  const data = loadNowWatching();
  if (!data?.companion) return;
  data.companion.spoilers_ok = nww.companionSpoiler.checked;
  saveNowWatching(data);
});

[nww.modelSonnet, nww.modelHaiku].forEach(btn => {
  btn.addEventListener('click', () => {
    const data = loadNowWatching();
    if (!data?.companion) return;
    data.companion.model_mode = btn.dataset.model;
    saveNowWatching(data);
    nwwCompanionUpdateModelBtns(data.companion.model_mode);
  });
});

nww.chatSend.addEventListener('click', () => {
  const msg = nww.chatInput.value.trim();
  if (msg) nwwSendChat(msg);
});

nww.chatInput.addEventListener('input', () => {
  const area = nww.chatInput.closest('.nww-chat-input-area');
  if (area) area.classList.toggle('has-content', nww.chatInput.value.trim().length > 0);
});

nww.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    const msg = nww.chatInput.value.trim();
    if (msg) nwwSendChat(msg);
  }
  if (e.key === 'Escape') {
    e.stopPropagation(); // prevent widget collapse
  }
});

// ─────────────────────────────────────────────────────────────────────────────

function nwwToIdle() {
  nwwCancelTransitions();
  nwwStopInterval();
  clearNowWatching();
  resetWatchDiaryForm();
  nwwSetPlayingView('controls');
  nwwSetState('idle');
  nww.el.classList.remove('nww--complete', 'nww--companion-open', 'nww--diary-open');
  nwwRenderCompanion(null);
  markDirty(gridView);
  setGridView(gridView);
}

function nwwCommitDecision(target, diaryStatus = 'finished') {
  const data = loadNowWatching();
  if (!data) return;
  const src = data.sourceView;
  const title = data.title;

  // Clear session before re-rendering so the live border is gone immediately
  nwwStopInterval();
  updateDiaryEntryFromSession(data, {
    status: diaryStatus,
    timestampMs: diaryStatus === 'timestamp' ? nwwGetElapsed(data) : null,
    watchedAt: new Date().toISOString(),
  });
  nwwExtractTasteSignal(data, target);
  clearNowWatching();

  if (src === 'search') {
    // Film not in any list — insert directly
    const entry = { title: data.title, year: data.year, director: data.director, poster: data.poster, addedAt: Date.now() };
    const targetSavers = {
      collection: () => { movies.unshift(entry); saveMovies(); },
      meh: () => { const l = loadMeh(); l.unshift(entry); saveMeh(l); },
      banned: () => { const l = loadBanned(); l.unshift(entry); saveBanned(l); }
    };
    if (targetSavers[target]) targetSavers[target]();
    invalidateTabCounts();
    markDirty(target);
    setGridView(gridView);
    renderGridNav();
  } else {
    // Film already in a list — use moveBetweenViews
    if (target === 'collection' && src !== 'collection') moveBetweenViews(title, src, 'collection');
    else if (target === 'meh' && src !== 'meh') moveBetweenViews(title, src, 'meh');
    else if (target === 'banned' && src !== 'banned') moveBetweenViews(title, src, 'banned');
    setGridView(gridView);
    renderGridNav();
  }

  // Show confirmation
  const labels = { collection: 'Collection', meh: 'Meh', banned: "Don't Recommend" };
  nww.confirmation.textContent = 'Added to ' + (labels[target] || target);
  nww.confirmation.style.animation = 'none';
  nww.confirmation.offsetHeight; // force reflow to restart animation
  nww.confirmation.style.animation = '';
  nwwSetPlayingView('confirmation');
  nwwSetState('deciding');

  setTimeout(nwwToIdle, 2000);
}

// Quick picks: 5 most recent watchlist items
function nwwRenderQuickPicks() {
  nww.quickPicks.innerHTML = '';
  const wl = loadWatchlist();
  const picks = wl.slice(0, 5);
  if (!picks.length) return;
  picks.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.className = 'nww-quick-pick';
    btn.innerHTML = `
      <div class="nww-quick-pick-poster">${m.poster ? `<img src="${m.poster}" alt="">` : ''}</div>
      <div class="nww-quick-pick-info">
        <span class="nww-quick-pick-title">${m.title}</span>
        <span class="nww-quick-pick-year">${m.year || ''}</span>
      </div>`;
    btn.style.animationDelay = (i * 40) + 'ms';
    btn.addEventListener('click', () => nwwSelectSearchResult(m, 'watchlist'));
    nww.quickPicks.appendChild(btn);
  });
}

function nwwSelectSearchResult(movie, sourceView) {
  nwwActivate(movie, sourceView || 'search');
}

// Widget search
let nwwSearchDebounce = null;
nww.searchInput.addEventListener('input', () => {
  clearTimeout(nwwSearchDebounce);
  const q = nww.searchInput.value.trim();
  if (q.length < 2) { nww.searchResults.innerHTML = ''; return; }
  nww.searchResults.innerHTML = '<div class="nww-search-empty">Searching…</div>';
  nwwSearchDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`/api/search-movie?q=${encodeURIComponent(q)}`);
      const hits = await res.json();
      nww.searchResults.innerHTML = '';
      if (!hits.length) {
        nww.searchResults.innerHTML = '<div class="nww-search-empty">No results</div>';
        return;
      }
      hits.slice(0, 6).forEach(m => {
        const row = document.createElement('button');
        row.className = 'nww-search-row';
        row.innerHTML = `
          <div class="nww-quick-pick-poster">${m.poster ? `<img src="${m.poster}" alt="">` : ''}</div>
          <div class="nww-quick-pick-info">
            <span class="nww-quick-pick-title">${m.title}</span>
            <span class="nww-quick-pick-year">${m.year || ''}</span>
          </div>`;
        row.addEventListener('click', () => nwwSelectSearchResult(m, 'search'));
        nww.searchResults.appendChild(row);
      });
    } catch {
      nww.searchResults.innerHTML = '<div class="nww-search-empty">Search failed</div>';
    }
  }, 300);
});

// Event listeners
nww.idleBtn.addEventListener('click', () => {
  nwwCancelTransitions();
  nwwRenderQuickPicks();
  nww.searchInput.value = '';
  nww.searchResults.innerHTML = '';
  nwwSetState('searching');
  setTimeout(() => nww.searchInput.focus(), 50);
});

nww.pill.addEventListener('click', () => {
  const data = loadNowWatching();
  if (!data) return;
  nwwPopulatePlaying(data);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    nwwCancelTransitions();
    nwwSetState('expanded');
    nwwUpdateDisplay();
    return;
  }
  const token = nwwBeginTransition();

  const pill = nww.pill;
  const first = nww.el.getBoundingClientRect();

  nww.el.classList.add('nww--suppress-enter');
  nwwSetState('expanded');
  nwwUpdateDisplay();

  const panel = nww.panel;
  const last = nww.el.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / last.width;
  const sy = first.height / last.height;
  const originX = 100;
  const originY = 100;

  pill.style.display = 'flex';
  pill.style.position = 'absolute';
  pill.style.right = '0';
  pill.style.bottom = '0';
  pill.style.opacity = '1';
  pill.style.pointerEvents = 'none';
  pill.style.zIndex = '2';

  panel.style.opacity = '0';
  panel.style.transform = 'translateY(12px) scale(0.97)';
  panel.style.pointerEvents = 'none';
  panel.style.setProperty('animation', 'none', 'important');

  nww.el.style.overflow = 'visible';
  nww.el.style.transformOrigin = `${originX}% ${originY}%`;
  nww.el.style.transition = 'none';
  nww.el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  void nww.el.offsetHeight;

  nww.el.style.transition = 'transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)';
  nww.el.style.transform = '';
  pill.style.transition = 'opacity 0.18s ease-out, transform 0.18s cubic-bezier(0.23, 1, 0.32, 1)';
  pill.style.opacity = '0';
  pill.style.transform = 'scale(0.96)';
  panel.style.transition = 'opacity 0.28s cubic-bezier(0.23, 1, 0.32, 1), transform 0.28s cubic-bezier(0.23, 1, 0.32, 1)';
  panel.style.opacity = '1';
  panel.style.transform = 'translateY(0) scale(1)';

  nwwQueueTransition(token, 300, () => {
    pill.style.opacity = '0';
    nwwResetTransientStyles();
  });
});

nww.pauseBtn.addEventListener('click', () => {
  const data = loadNowWatching();
  if (!data) return;
  if (data.pausedAt) {
    // Resume
    data.accumulatedMs += Date.now() - data.pausedAt;
    data.startedAt = Date.now();
    data.pausedAt = null;
    nww.pauseBtn.textContent = 'Pause';
    nww.el.classList.remove('nww--paused');
    saveNowWatching(data);
    nwwStartInterval();
  } else {
    // Pause
    data.accumulatedMs = nwwGetElapsed(data);
    data.pausedAt = Date.now();
    data.startedAt = Date.now();
    nww.pauseBtn.textContent = 'Resume';
    nww.el.classList.add('nww--paused');
    saveNowWatching(data);
    updateDiaryEntryFromSession(data, {
      status: 'timestamp',
      timestampMs: data.accumulatedMs,
      watchedAt: new Date().toISOString(),
    });
    nwwStopInterval();
    nwwUpdateDisplay();
  }
});

nww.doneBtn.addEventListener('click', () => {
  nwwSetState('deciding');
  nwwShowDecisions();
  nwwUpdateDisplay();
});

nww.abandonBtn.addEventListener('click', () => nwwCommitDecision('banned', 'abandoned'));

nww.decCollection.addEventListener('click', () => nwwCommitDecision('collection'));
nww.decMeh.addEventListener('click', () => nwwCommitDecision('meh'));
nww.decBan.addEventListener('click', () => nwwCommitDecision('banned'));

nwwMakeEditable(nww.elapsed, false);
nwwMakeEditable(nww.runtime, true);

// Scrub: click on progress bar to jump
nww.progressBar.addEventListener('click', (e) => {
  const data = loadNowWatching();
  if (!data || !data.runtime) return;
  const rect = nww.progressBar.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const runtimeMs = data.runtime * 60000;
  data.accumulatedMs = Math.round(pct * runtimeMs);
  data.startedAt = Date.now();
  if (data.pausedAt) data.pausedAt = Date.now();
  saveNowWatching(data);
  nwwUpdateDisplay();
});

// Click outside panel to collapse
document.addEventListener('click', (e) => {
  if (nww.state === 'expanded' || nww.state === 'searching') {
    if (!nww.el.contains(e.target)) {
      const data = loadNowWatching();
      if (data && nww.state === 'expanded') {
        nwwCollapseToPill();
      } else if (nww.state === 'searching') {
        nwwSetState('idle');
      }
    }
  }
});

// watchTonight: called from movie modal's Watch Tonight button
function watchTonight(movie, sourceView) {
  closeMovieModal();
  const runtimeMin = movie.runtime || 0;
  nwwActivate({ ...movie, runtime: runtimeMin }, sourceView);

  // Always fetch runtime to ensure we have it
  if (movie.title) {
    fetch(`/api/movie-details?title=${encodeURIComponent(movie.title)}&year=${encodeURIComponent(movie.year || '')}`)
      .then(r => r.json())
      .then(d => {
        if (d.runtime) {
          const nwData = loadNowWatching();
          if (nwData && nwData.title === movie.title) {
            nwData.runtime = parseInt(d.runtime) || nwData.runtime;
            saveNowWatching(nwData);
            nwwUpdateDisplay();
          }
        }
      }).catch(() => {});
  }
}

// Restore on page load
(function nwwRestore() {
  const data = loadNowWatching();
  if (!data) return;
  nwwCancelTransitions();
  nwwPopulatePlaying(data);
  const elapsedMs = nwwGetElapsed(data);
  const runtimeMs = (data.runtime || 0) * 60000;

  if (runtimeMs > 0 && elapsedMs >= runtimeMs) {
    nww.el.classList.add('nww--complete');
    nwwSetState('expanded');
    nwwShowDecisions();
  } else if (data.pausedAt) {
    nwwSetState('playing');
    nww.el.classList.add('nww--paused');
    nwwUpdateDisplay();
  } else {
    nwwSetState('playing');
    nwwUpdateDisplay();
    nwwStartInterval();
  }

  // Restore companion if it was open
  if (data.companion?.open) {
    nww.el.classList.add('nww--companion-open');
    nwwRenderCompanion(data);
    // Re-fetch facts if loading was interrupted
    if (!data.companion.facts_fetched) {
      if (data.companion.facts_loading) {
        data.companion.facts_loading = false;
        saveNowWatching(data);
      }
      nwwFetchFacts(loadNowWatching());
    }
  }
})();

// ── Context menu ─────────────────────────────────────────────────────────────
const CTX_VIEW_LABELS = { collection: 'Collection', watchlist: 'To Watch', maybe: 'Wildcard', meh: 'Meh', banned: 'Banned' };

const ctxMenu = document.createElement('div');
ctxMenu.className = 'ctx-menu';
document.body.appendChild(ctxMenu);

function buildCtxMenu(view, cardMode = true) {
  const moveItems = cardMode
    ? `<button class="ctx-item" data-action="top">Move to top</button>
       <button class="ctx-item" data-action="bottom">Move to bottom</button>
       <div class="ctx-divider"></div>
       ${Object.entries(CTX_VIEW_LABELS)
         .filter(([v]) => v !== view && v !== 'collection')
         .map(([v, label]) => `<button class="ctx-item" data-action="moveto" data-to="${v}">Move to ${label}</button>`)
         .join('')}
       <div class="ctx-divider"></div>`
    : '';
  ctxMenu.innerHTML = moveItems +
    `<button class="ctx-item" data-action="search">Add film to ${CTX_VIEW_LABELS[view]}…</button>`;
}

let ctxTarget = null;

function hideCtxMenu() {
  ctxMenu.style.display = 'none';
  ctxTarget = null;
}

function reorderView(title, view, direction) {
  const loaders = { collection: () => movies, watchlist: loadWatchlist, maybe: loadMaybe, meh: loadMeh, banned: loadBanned };
  const savers  = {
    collection: l => { movies.splice(0, movies.length, ...l); saveMovies(); },
    watchlist: saveWatchlist, maybe: saveMaybe, meh: saveMeh, banned: saveBanned,
  };
  const renderers = {
    collection: () => render(sortedList(movies, 'collection')),
    watchlist: renderWatchlistGrid, maybe: renderMaybeGrid, meh: renderMehGrid, banned: renderBannedGrid,
  };
  const list = loaders[view]();
  const idx = list.findIndex(m => m.title === title);
  if (idx === -1) return;
  const [item] = list.splice(idx, 1);
  direction === 'top' ? list.unshift(item) : list.push(item);
  savers[view](list);
  renderers[view]();
  applyGrain();
}

document.querySelector('main').addEventListener('contextmenu', (e) => {
  const card = e.target.closest('.movie-card');
  const grid = e.target.closest('.grid[id]');

  if (card && card.dataset.title && card.dataset.view) {
    e.preventDefault();
    ctxTarget = card;
    buildCtxMenu(card.dataset.view, true);
  } else if (grid) {
    const view = grid.id.replace('grid-', '');
    if (!CTX_VIEW_LABELS[view]) return;
    e.preventDefault();
    ctxTarget = { dataset: { view } };
    buildCtxMenu(view, false);
  } else {
    return;
  }

  const menuH = ctxMenu.querySelectorAll('.ctx-item').length * 34 + 16;
  const x = Math.min(e.clientX, window.innerWidth - 200);
  const y = Math.min(e.clientY, window.innerHeight - menuH);
  ctxMenu.style.cssText = `display:block;left:${x}px;top:${y}px`;
});

ctxMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('.ctx-item');
  if (!btn || !ctxTarget) return;
  const { title, view } = ctxTarget.dataset;
  if (btn.dataset.action === 'moveto') {
    const toView = btn.dataset.to;
    moveBetweenViews(title, view, toView);
    const renderers = {
      collection: () => render(sortedList(movies, 'collection')),
      watchlist: renderWatchlistGrid, maybe: renderMaybeGrid, meh: renderMehGrid, banned: renderBannedGrid,
    };
    renderers[view]?.();
    renderers[toView]?.();
    renderGridNav();
    applyGrain();
  } else if (btn.dataset.action === 'search') {
    openSearchModal(view);
  } else {
    reorderView(title, view, btn.dataset.action);
  }
  hideCtxMenu();
});

document.addEventListener('click', hideCtxMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtxMenu(); });
document.addEventListener('scroll', hideCtxMenu, true);

// Delegate card clicks across all grids
document.querySelector('main').addEventListener('click', (e) => {
  const card = e.target.closest('.movie-card');
  if (!card) return;
  if (e.target.closest('.card-remove-btn, .card-star-btn')) return;
  const titleEl = card.querySelector('.card-name');
  if (!titleEl) return;
  const title = titleEl.textContent;
  const view = card.dataset.view || 'collection';
  const listMap = { collection: () => movies, watchlist: loadWatchlist, maybe: loadMaybe, meh: loadMeh, banned: loadBanned };
  const list = sortedList((listMap[view] || (() => movies))(), view);
  const movie = list.find(m => m.title === title);
  if (movie) openMovieModal(movie, list);
});

// ── Film search modal ─────────────────────────────────────────────────────────
let searchTargetView = null;
let searchDebounce   = null;

const searchBackdrop = document.getElementById('search-modal-backdrop');
const searchInput    = document.getElementById('search-input');
const searchResults  = document.getElementById('search-results');

const VIEW_LOADERS = {
  collection: () => movies,
  watchlist: loadWatchlist, maybe: loadMaybe, meh: loadMeh, banned: loadBanned,
  anticipated: loadAnticipated,
};
const VIEW_SAVERS = {
  collection: l => { movies.splice(0, movies.length, ...l); saveMovies(); },
  watchlist: saveWatchlist, maybe: saveMaybe, meh: saveMeh, banned: saveBanned,
  anticipated: saveAnticipated,
};
const VIEW_RENDERERS = {
  collection: () => render(sortedList(movies, 'collection')),
  watchlist: renderWatchlistGrid, maybe: renderMaybeGrid, meh: renderMehGrid, banned: renderBannedGrid,
  anticipated: renderAnticipated,
};

function openSearchModal(view) {
  searchTargetView = view;
  searchInput.value = '';
  searchResults.innerHTML = '';
  searchBackdrop.style.display = 'flex';
  setTimeout(() => searchInput.focus(), 50);
}

function closeSearchModal() {
  searchBackdrop.style.display = 'none';
  searchTargetView = null;
  clearTimeout(searchDebounce);
}

function renderSearchResults(hits) {
  searchResults.innerHTML = '';
  if (!hits.length) {
    searchResults.innerHTML = '<div class="search-empty">No results</div>';
    return;
  }
  // Build title→view map once for O(1) lookups instead of loading all lists per row
  const titleToView = new Map();
  [...Object.keys(VIEW_LOADERS), 'anticipated'].forEach(v => {
    (VIEW_LOADERS[v] ? VIEW_LOADERS[v]() : loadAnticipated()).forEach(x => {
      if (!titleToView.has(x.title)) titleToView.set(x.title, v);
    });
  });
  hits.forEach(m => {
    const row = document.createElement('div');
    row.className = 'search-result-row';

    const poster = document.createElement('div');
    poster.className = 'search-result-poster';
    if (m.poster) {
      const img = document.createElement('img');
      img.src = m.poster;
      img.alt = m.title;
      poster.appendChild(img);
    }

    const info = document.createElement('div');
    info.className = 'search-result-info';
    info.innerHTML = `<span class="search-result-title">${m.title}</span><span class="search-result-year">${m.year || ''}</span>`;

    const ratings = document.createElement('div');
    ratings.className = 'search-result-ratings';
    if (m.imdb_rating) {
      ratings.innerHTML += `<span class="search-rating-badge search-rating-imdb">IMDb ${m.imdb_rating}</span>`;
    } else if (m.tmdb_rating) {
      ratings.innerHTML += `<span class="search-rating-badge search-rating-tmdb">★ ${m.tmdb_rating}</span>`;
    }
    if (m.rt_score) {
      ratings.innerHTML += `<span class="search-rating-badge search-rating-rt">🍅 ${m.rt_score}</span>`;
    }

    const VIEW_LABELS = { collection: 'Collection', watchlist: 'To Watch', maybe: 'Wildcard', meh: 'Meh', banned: "Don't Recommend", anticipated: 'Anticipated' };
    const existingView = titleToView.get(m.title);

    const addBtn = document.createElement('button');
    addBtn.className = 'search-add-btn';

    if (existingView) {
      addBtn.textContent = `In ${VIEW_LABELS[existingView] || existingView}`;
      addBtn.disabled = true;
      addBtn.classList.add('search-add-btn-exists');
    } else {
      addBtn.textContent = 'Add';
    }

    const doAdd = () => {
      const view = searchTargetView;
      if (view === 'anticipated') {
        const ant = loadAnticipated();
        if (ant.some(x => x.title === m.title)) { closeSearchModal(); return; }
        removeFromOtherLists(m.title);
        ant.unshift({
          title:        m.title,
          year:         m.year,
          director:     '',
          poster:       m.poster || '',
          release_date: m.release_date || null,
          addedAt:      Date.now(),
        });
        saveAnticipated(ant);
        invalidateTabCounts();
        renderAnticipated();
        renderGridNav();
        applyGrain();
        closeSearchModal();
        // Backfill director
        fetch(`/api/movie-details?title=${encodeURIComponent(m.title)}&year=${encodeURIComponent(m.year || '')}`)
          .then(r => r.json())
          .then(d => {
            if (!d.director) return;
            const curr = loadAnticipated();
            const entry = curr.find(x => x.title === m.title);
            if (entry && !entry.director) { entry.director = d.director; saveAnticipated(curr); renderAnticipated(); }
          }).catch(() => {});
        return;
      }
      const list = VIEW_LOADERS[view]();
      if (list.some(x => x.title === m.title)) { closeSearchModal(); return; }
      list.unshift({ title: m.title, year: m.year, director: '', poster: m.poster || '', addedAt: Date.now() });
      VIEW_SAVERS[view](list);
      VIEW_RENDERERS[view]();
      renderGridNav();
      applyGrain();
      closeSearchModal();
      // Backfill director from movie details API
      fetch(`/api/movie-details?title=${encodeURIComponent(m.title)}&year=${encodeURIComponent(m.year || '')}`)
        .then(r => r.json())
        .then(d => {
          if (!d.director) return;
          const curr = VIEW_LOADERS[view]();
          const entry = curr.find(x => x.title === m.title);
          if (entry && !entry.director) {
            entry.director = d.director;
            VIEW_SAVERS[view](curr);
            VIEW_RENDERERS[view]();
            applyGrain();
          }
        }).catch(() => {});
    };

    if (!existingView) addBtn.addEventListener('click', doAdd);

    row.appendChild(poster);
    row.appendChild(info);
    row.appendChild(ratings);
    row.appendChild(addBtn);

    searchResults.appendChild(row);
  });
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();
  if (q.length < 2) { searchResults.innerHTML = ''; return; }
  searchResults.innerHTML = '<div class="search-empty">Searching…</div>';
  searchDebounce = setTimeout(async () => {
    try {
      const res  = await fetch(`/api/search-movie?q=${encodeURIComponent(q)}`);
      const hits = await res.json();
      renderSearchResults(hits);
    } catch {
      searchResults.innerHTML = '<div class="search-empty">Search failed</div>';
    }
  }, 300);
});

document.getElementById('search-modal-close').addEventListener('click', closeSearchModal);
searchBackdrop.addEventListener('click', (e) => { if (e.target === searchBackdrop) closeSearchModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && searchBackdrop.style.display !== 'none') closeSearchModal();
});

// ── AI master toggle ──────────────────────────────────────────────────────────

async function drainAiBuffer() {
  const buf = loadAiBuffer();
  if (!buf.length) return;
  saveAiBuffer([]); // clear immediately — partial drain on page close is acceptable
  for (const item of buf) {
    if (!canReenrichTasteSignal(item)) continue;
    try {
      const signalsPayload = await requestTasteSignalExtraction(item);
      if (!signalsPayload) continue;
      const signals = JSON.parse(localStorage.getItem(TASTE_SIGNALS_KEY) || '[]');
      const entry = signals.find(s => s.title === item.title && s.timestamp === item.timestamp);
      if (entry) {
        entry.llm_signals = signalsPayload;
        localStorage.setItem(TASTE_SIGNALS_KEY, JSON.stringify(signals));
        renderSessionJournal();
        schedulePush();
      }
    } catch {} // non-critical
  }
}

function applyAiToggleState() {
  const on = isAiEnabled();

  // Dim rec sub-controls when AI is off
  const headingRow = document.getElementById('rec-heading-row');
  if (headingRow) headingRow.classList.toggle('rec-heading-row--ai-off', !on);

  // Re-render recommendation area to reflect new gate state
  renderRecommendation();

  // Companion send button + input
  nww.chatSend.disabled = !on;
  nww.chatInput.disabled = !on;
  nww.chatInput.placeholder = on ? 'Ask anything about this film…' : 'AI is disabled';
}

function initAiToggle() {
  const checkbox = document.getElementById('nav-ai-checkbox');
  if (!checkbox) return;
  checkbox.checked = isAiEnabled();
  checkbox.addEventListener('change', () => {
    setAiEnabled(checkbox.checked);
    applyAiToggleState();
    if (checkbox.checked) drainAiBuffer();
  });
  applyAiToggleState();
}

initAiToggle();
