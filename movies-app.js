const PERSONA_ENABLED = false; // set to false to disable persona & stats (saves API credits)
const PERSONA_HIDDEN_KEY = 'thecollection_persona_hidden';
function isPersonaHidden() { return localStorage.getItem(PERSONA_HIDDEN_KEY) === '1'; }
function setPersonaHidden(v) { localStorage.setItem(PERSONA_HIDDEN_KEY, v ? '1' : '0'); }

const VIEWS = ['collection','watchlist','maybe','meh','banned'];
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

function addTilt(card) {
  const sheen = document.createElement('div');
  sheen.className = 'card-sheen';
  card.appendChild(sheen);

  let tiltFrame = null;
  card.addEventListener('mousemove', (e) => {
    if (tiltFrame) return;
    const cx = e.clientX, cy = e.clientY;
    tiltFrame = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      const x = (cx - rect.left) / rect.width - 0.5;
      const y = (cy - rect.top) / rect.height - 0.5;

      card.style.transition = 'transform 0.05s linear, box-shadow 0.05s linear';
      card.style.transform = `perspective(800px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) scale(1.02)`;
      card.style.boxShadow = `${-x * 10}px ${y * 10}px 24px rgba(0,0,0,0.2)`;

      sheen.style.opacity = '1';
      sheen.style.background = `radial-gradient(circle at ${(0.5 - x) * 100}% ${(0.5 - y) * 100}%, rgba(255,255,255,0.12) 0%, transparent 65%)`;
      tiltFrame = null;
    });
  });

  card.addEventListener('mouseleave', () => {
    card.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
    card.style.transform = '';
    card.style.boxShadow = '';
    sheen.style.opacity = '0';
  });
}

const textureCache = new Map();
const TEXTURE_CACHE_MAX = 80;
function getCachedTextures(key) {
  if (textureCache.has(key)) {
    const val = textureCache.get(key);
    textureCache.delete(key);
    textureCache.set(key, val);
    return val;
  }
  if (textureCache.size >= TEXTURE_CACHE_MAX) {
    textureCache.delete(textureCache.keys().next().value);
  }
  const textures = generateFoldTextures();
  textureCache.set(key, textures);
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

  // Drag-to-reorder within standards
  Sortable.create(slots, {
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
  });

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
  } else {
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
  list.filter(movie => !standardTitles.has(movie.title)).forEach(movie => {
    const card = document.createElement('div');
    card.className = 'card movie-card';
    card.dataset.title = movie.title;
    card.dataset.view = 'collection';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'poster-wrap';
    const img = document.createElement('img');
    img.className = 'card-image movie-poster';
    img.draggable = false;
    img.src = movie.poster;
    img.alt = movie.title;

    const textures = getCachedTextures(movie.title);

    const hlDiv = document.createElement('div');
    hlDiv.className = 'poster-texture poster-texture-hl';
    hlDiv.style.backgroundImage = `url(${textures.hl})`;

    const shDiv = document.createElement('div');
    shDiv.className = 'poster-texture poster-texture-sh';
    shDiv.style.backgroundImage = `url(${textures.sh})`;

    const starBtn = document.createElement('button');
    starBtn.className = 'card-star-btn';
    starBtn.title = 'Add to Reference Films';
    starBtn.innerHTML = '★';
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ok = toggleStandard(movie);
      if (ok !== false) { render(sortedList(movies, 'collection')); applyGrain(); }
    });

    imgWrap.appendChild(img);
    imgWrap.appendChild(hlDiv);
    imgWrap.appendChild(shDiv);
    imgWrap.appendChild(starBtn);

    const info = document.createElement('div');
    info.className = 'card-info';

    const title = document.createElement('span');
    title.className = 'card-name';
    title.textContent = movie.title;

    const meta = document.createElement('span');
    meta.className = 'card-trade';
    meta.textContent = `${movie.director}, ${movie.year}`;

    info.appendChild(title);
    info.appendChild(meta);
    appendCardRatings(info, movie);
    card.appendChild(imgWrap);
    card.appendChild(info);
    g.appendChild(card);

    addTilt(card);
  });
  if (!list.length) showEmptyState(g);
  markClean('collection');
}

const CARD_RATINGS_KEY = 'thecollection_card_ratings';
function isCardRatingsEnabled() {
  return localStorage.getItem(CARD_RATINGS_KEY) !== 'false';
}

function appendCardRatings(info, movie) {
  // Always wrap title+meta in a left column so card-info (flex row) is consistent
  const left = document.createElement('div');
  left.className = 'card-info-left';
  while (info.firstChild) left.appendChild(info.firstChild);
  info.appendChild(left);

  if (!isCardRatingsEnabled()) return;
  if (!movie.imdb_rating && !movie.rt_score) return;

  const ratings = document.createElement('div');
  ratings.className = 'card-ratings';
  if (movie.imdb_rating) {
    const imdb = document.createElement('span');
    imdb.className = 'card-rating card-rating-imdb';
    imdb.textContent = `IMDb ${movie.imdb_rating}`;
    ratings.appendChild(imdb);
  }
  if (movie.rt_score) {
    const rt = document.createElement('span');
    rt.className = 'card-rating card-rating-rt';
    rt.textContent = `🍅 ${movie.rt_score}`;
    ratings.appendChild(rt);
  }
  info.appendChild(ratings);
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

function isRecEnabled() { return localStorage.getItem(REC_ENABLED_KEY) === '1'; }
function setRecEnabled(v) { localStorage.setItem(REC_ENABLED_KEY, v ? '1' : '0'); }

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
  // When disabled, just show cached item (no API call)
  if (!isRecEnabled()) {
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
        localStorage.setItem(TOTAL_COST_KEY, totalCost.toFixed(6));
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
  meta.textContent = `${rec.director}, ${rec.year}`;

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
  if (!isRecEnabled()) banner.classList.add('rec-banner-disabled');
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
const TOTAL_COST_KEY = 'thecollection_total_cost';
totalCost = parseFloat(localStorage.getItem(TOTAL_COST_KEY) || '0') || 0;
const MAX_SNAPSHOTS  = 20;
const MAX_STANDARDS  = 12;

function loadStandards() { try { return JSON.parse(localStorage.getItem(STANDARDS_KEY) || '[]'); } catch(e) { return []; } }
function saveStandards(list) { localStorage.setItem(STANDARDS_KEY, JSON.stringify(list)); }

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
}

function loadWatchlist() {
  try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'); } catch(e) { return []; }
}
function saveWatchlist(list) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  invalidateTabCounts();
  if (gridView !== 'watchlist') markDirty('watchlist');
}

function loadMaybe() {
  try { return JSON.parse(localStorage.getItem(MAYBE_KEY) || '[]'); } catch(e) { return []; }
}
function saveMaybe(list) {
  localStorage.setItem(MAYBE_KEY, JSON.stringify(list));
  invalidateTabCounts();
  if (gridView !== 'maybe') markDirty('maybe');
}

function loadMeh() {
  try { return JSON.parse(localStorage.getItem(MEH_KEY) || '[]'); } catch(e) { return []; }
}
function saveMeh(list) {
  localStorage.setItem(MEH_KEY, JSON.stringify(list));
  invalidateTabCounts();
  if (gridView !== 'meh') markDirty('meh');
}

const BAN_SVG_SM = '❌';
const BAN_SVG_LG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="56" height="56" fill="none"><circle cx="12" cy="12" r="9.5" stroke="rgba(255,50,50,0.92)" stroke-width="2.5"/><line x1="5.1" y1="5.1" x2="18.9" y2="18.9" stroke="rgba(255,50,50,0.92)" stroke-width="2.5" stroke-linecap="round"/></svg>';

let gridView = 'collection'; // 'collection' | 'watchlist' | 'maybe' | 'banned'
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
  collection: '<img src="curtain.png" style="width:24px;height:24px;object-fit:contain;vertical-align:middle">',
  watchlist:  '🍿',
  maybe:      '<img src="wildcard.webp" style="width:24px;height:24px;object-fit:contain;vertical-align:middle">',
  meh:        '😐',
  banned:     '👻',
};

function updateSortable(view) {
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

function setGridView(view) {
  gridView = view;
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
    applyGrain();
  }
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
      collection: movies.length,
      watchlist:  loadWatchlist().length,
      maybe:      loadMaybe().length,
      meh:        loadMeh().length,
      banned:     loadBanned().length,
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
    btn.className = 'grid-nav-btn' + (active ? ' active' : '') + (compact ? ' compact' : '');
    btn.innerHTML = `<span class="grid-nav-icon">${NAV_ICONS[key]}</span><span>${NAV_TABS.find(t=>t.key===key).label}</span>${count ? `<span class="grid-nav-count">${count}</span>` : ''}`;
  });

  // Slide the indicator
  const activeBtn = tabRow.querySelector('.grid-nav-btn.active');
  const slider = tabRow.querySelector('.grid-nav-slider');
  if (activeBtn && slider) {
    if (!slider.dataset.init) {
      slider.style.transition = 'none';
      requestAnimationFrame(() => {
        slider.style.left  = activeBtn.offsetLeft + 'px';
        slider.style.width = activeBtn.offsetWidth + 'px';
        slider.dataset.init = '1';
        requestAnimationFrame(() => { slider.style.transition = ''; });
      });
    } else {
      requestAnimationFrame(() => {
        slider.style.left  = activeBtn.offsetLeft + 'px';
        slider.style.width = activeBtn.offsetWidth + 'px';
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

function addTexturesToPoster(posterWrap, key) {
  const textures = getCachedTextures(key);
  const hlDiv = document.createElement('div');
  hlDiv.className = 'poster-texture poster-texture-hl';
  hlDiv.style.backgroundImage = `url(${textures.hl})`;
  const shDiv = document.createElement('div');
  shDiv.className = 'poster-texture poster-texture-sh';
  shDiv.style.backgroundImage = `url(${textures.sh})`;
  posterWrap.appendChild(hlDiv);
  posterWrap.appendChild(shDiv);
}

function renderWatchlistGrid() {
  const g = getGrid('watchlist');
  const standardTitles = new Set(loadStandards().map(m => m.title));
  const list = sortedList(loadWatchlist(), 'watchlist').filter(m => !standardTitles.has(m.title));
  g.innerHTML = '';
  if (!list.length) { showEmptyState(g); markClean('watchlist'); return; }
  list.forEach(movie => {
    const card = document.createElement('div');
    card.className = 'card movie-card';
    card.dataset.title = movie.title;
    card.dataset.view = 'watchlist';

    const posterWrap = document.createElement('div');
    posterWrap.className = 'poster-wrap';

    const img = document.createElement('img');
    img.className = 'card-image movie-poster';
    img.draggable = false;
    img.src = movie.poster;
    img.alt = movie.title;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'card-remove-btn';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Remove from To Watch';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
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
    });

    posterWrap.appendChild(img);
    addTexturesToPoster(posterWrap, movie.title);
    posterWrap.appendChild(removeBtn);

    const info = document.createElement('div');
    info.className = 'card-info';

    const title = document.createElement('span');
    title.className = 'card-name';
    title.textContent = movie.title;

    const meta = document.createElement('span');
    meta.className = 'card-trade';
    meta.textContent = `${movie.director}, ${movie.year}`;

    info.appendChild(title);
    info.appendChild(meta);
    appendCardRatings(info, movie);
    card.appendChild(posterWrap);
    card.appendChild(info);

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
  banned.forEach(movie => {
    const card = document.createElement('div');
    card.className = 'card movie-card';
    card.dataset.title = movie.title;
    card.dataset.view = 'banned';

    const posterWrap = document.createElement('div');
    posterWrap.className = 'poster-wrap';

    const img = document.createElement('img');
    img.className = 'card-image movie-poster';
    img.draggable = false;
    img.src = movie.poster;
    img.alt = movie.title;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'card-remove-btn';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Remove from Don\'t Recommend';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
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
    });

    posterWrap.appendChild(img);
    addTexturesToPoster(posterWrap, movie.title);
    posterWrap.appendChild(removeBtn);

    const info = document.createElement('div');
    info.className = 'card-info';

    const title = document.createElement('span');
    title.className = 'card-name';
    title.textContent = movie.title;

    const meta = document.createElement('span');
    meta.className = 'card-trade';
    meta.textContent = `${movie.director}, ${movie.year}`;

    info.appendChild(title);
    info.appendChild(meta);
    appendCardRatings(info, movie);
    card.appendChild(posterWrap);
    card.appendChild(info);

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
  list.forEach(movie => {
    const card = document.createElement('div');
    card.className = 'card movie-card';
    card.dataset.title = movie.title;
    card.dataset.view = 'maybe';

    const posterWrap = document.createElement('div');
    posterWrap.className = 'poster-wrap';

    const img = document.createElement('img');
    img.className = 'card-image movie-poster';
    img.draggable = false;
    img.src = movie.poster;
    img.alt = movie.title;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'card-remove-btn';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Remove from Wildcard';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
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
    });

    posterWrap.appendChild(img);
    addTexturesToPoster(posterWrap, movie.title);
    posterWrap.appendChild(removeBtn);

    const info = document.createElement('div');
    info.className = 'card-info';

    const title = document.createElement('span');
    title.className = 'card-name';
    title.textContent = movie.title;

    const meta = document.createElement('span');
    meta.className = 'card-trade';
    meta.textContent = `${movie.director}, ${movie.year}`;

    info.appendChild(title);
    info.appendChild(meta);
    appendCardRatings(info, movie);
    card.appendChild(posterWrap);
    card.appendChild(info);

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
  list.forEach(movie => {
    const card = document.createElement('div');
    card.className = 'card movie-card';
    card.dataset.title = movie.title;
    card.dataset.view = 'meh';

    const posterWrap = document.createElement('div');
    posterWrap.className = 'poster-wrap';

    const img = document.createElement('img');
    img.className = 'card-image movie-poster';
    img.draggable = false;
    img.src = movie.poster;
    img.alt = movie.title;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'card-remove-btn';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Remove from Meh';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
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
    });

    posterWrap.appendChild(img);
    addTexturesToPoster(posterWrap, movie.title);
    posterWrap.appendChild(removeBtn);

    const info = document.createElement('div');
    info.className = 'card-info';

    const title = document.createElement('span');
    title.className = 'card-name';
    title.textContent = movie.title;

    const meta = document.createElement('span');
    meta.className = 'card-trade';
    meta.textContent = `${movie.director}, ${movie.year}`;

    info.appendChild(title);
    info.appendChild(meta);
    appendCardRatings(info, movie);
    card.appendChild(posterWrap);
    card.appendChild(info);

    g.appendChild(card);
  });
  applyGrain();
  markClean('meh');
}

function saveMovies() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));
  invalidateTabCounts();
  if (gridView !== 'collection') markDirty('collection');
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
  const newOrder = [];
  cards.forEach(card => {
    const title = card.querySelector('.card-name').textContent;
    const movie = movies.find(m => m.title === title);
    if (movie) newOrder.push(movie);
  });
  movies.splice(0, movies.length, ...newOrder);
  saveMovies();
}

loadMovies();
render(movies);
renderGridNav();
initRecHeading();
fetchRecommendation();


setInterval(() => saveSnapshot('Auto-save'), 10 * 60 * 1000);

updateSortable('collection');

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

function openMovieModal(movie, list = null) {
  if (list) {
    modalList  = list;
    modalIndex = list.findIndex(m => m.title === movie.title);
    if (modalIndex === -1) modalIndex = 0;
  }
  const counter = document.getElementById('mm-nav-counter');
  if (counter) counter.textContent = modalList.length > 1 ? `${modalIndex + 1} / ${modalList.length}` : '';
  document.getElementById('mm-nav-prev').style.visibility = modalList.length > 1 ? '' : 'hidden';
  document.getElementById('mm-nav-next').style.visibility = modalList.length > 1 ? '' : 'hidden';

  const backdrop = document.getElementById('movie-modal-backdrop');
  const body     = document.getElementById('movie-modal-body');
  backdrop.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Show loading state immediately with known data
  body.innerHTML = `
    <div class="mm-poster-col">
      <img class="mm-poster" src="${movie.poster}" alt="${movie.title}">
      <div class="mm-ratings">
        <div class="mm-loading-bar mm-skel-rating"></div>
        <div class="mm-loading-bar mm-skel-rating"></div>
      </div>
    </div>
    <div class="mm-info">
      <div class="mm-title">${movie.title}</div>
      <div class="mm-meta">${movie.director} · ${movie.year}</div>
      <div class="mm-genres">
        <div class="mm-loading-bar mm-skel-tag"></div>
        <div class="mm-loading-bar mm-skel-tag"></div>
        <div class="mm-loading-bar mm-skel-tag"></div>
      </div>
      <div class="mm-loading-bar mm-skel-tagline"></div>
      <div class="mm-loading-bar" style="margin-top:16px"></div>
      <div class="mm-loading-bar" style="width:95%;margin-top:6px"></div>
      <div class="mm-loading-bar" style="width:88%;margin-top:6px"></div>
      <div class="mm-loading-bar" style="width:80%;margin-top:6px"></div>
      <div class="mm-loading-bar" style="width:60%;margin-top:6px"></div>
      <div class="mm-section-label mm-skel-label"></div>
      <div class="mm-cast">
        ${Array(7).fill('<div class="mm-cast-item"><div class="mm-cast-photo mm-skel-circle"></div><div class="mm-loading-bar mm-skel-cast-name"></div><div class="mm-loading-bar mm-skel-cast-char"></div></div>').join('')}
      </div>
      <div class="mm-section-label mm-skel-label"></div>
      <div class="mm-crew">
        ${Array(4).fill('<div class="mm-crew-row"><div class="mm-loading-bar mm-skel-crew-role"></div><div class="mm-loading-bar mm-skel-crew-name"></div></div>').join('')}
      </div>
    </div>`;

  const cacheKey = `${movie.title}__${movie.year}`;
  modalCurrentKey = cacheKey;

  if (modalDetailsCache.has(cacheKey)) {
    renderModalDetails(body, movie, modalDetailsCache.get(cacheKey));
    return;
  }

  fetch(`/api/movie-details?title=${encodeURIComponent(movie.title)}&year=${movie.year}`)
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      modalDetailsCache.set(cacheKey, data);
      if (modalCurrentKey === cacheKey) renderModalDetails(body, movie, data);
    })
    .catch(() => {});
}

function renderModalDetails(body, movie, data) {
  body.innerHTML = '';

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
      imdbLink.innerHTML = `<span class="mm-rating-logo">IMDb</span><span>⭐ ${data.imdb_rating}</span>`;
      ratings.appendChild(imdbLink);
    }
    if (data.rt_score) {
      const pct = parseInt(data.rt_score);
      const fresh = pct >= 60;
      const rt = document.createElement('a');
      rt.className = 'mm-rating-badge mm-rating-rt';
      rt.href = `https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title)}`;
      rt.target = '_blank';
      rt.rel = 'noopener noreferrer';
      rt.innerHTML = `<span>${fresh ? '🍅' : '🤢'}</span><span>${data.rt_score}</span>`;
      ratings.appendChild(rt);
    }
    posterCol.appendChild(ratings);
  }

  const info = document.createElement('div');
  info.className = 'mm-info';

  // Header
  const title = document.createElement('div');
  title.className = 'mm-title';
  title.textContent = movie.title;

  const meta = document.createElement('div');
  meta.className = 'mm-meta';
  const parts = [movie.director, movie.year];
  if (data.runtime) parts.push(`${data.runtime} min`);
  meta.textContent = parts.join(' · ');

  info.append(title, meta);

  if (data.genres?.length) {
    const genres = document.createElement('div');
    genres.className = 'mm-genres';
    data.genres.forEach(g => {
      const tag = document.createElement('span');
      tag.className = 'mm-genre-tag';
      tag.textContent = g;
      genres.appendChild(tag);
    });
    info.appendChild(genres);
  }

  if (data.tagline) {
    const tagline = document.createElement('div');
    tagline.className = 'mm-tagline';
    tagline.textContent = `"${data.tagline}"`;
    info.appendChild(tagline);
  }

  if (data.overview) {
    const overview = document.createElement('p');
    overview.className = 'mm-overview';
    overview.textContent = data.overview;
    info.appendChild(overview);
  }

  // Cast
  if (data.cast?.length) {
    const castLabel = document.createElement('div');
    castLabel.className = 'mm-section-label';
    castLabel.textContent = 'Cast';
    info.appendChild(castLabel);

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
    info.appendChild(castRow);
  }

  // Key crew
  if (data.keyCrew?.length) {
    const crewLabel = document.createElement('div');
    crewLabel.className = 'mm-section-label';
    crewLabel.textContent = 'Key Crew';
    info.appendChild(crewLabel);

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
    info.appendChild(crewGrid);
  }

  body.append(posterCol, info);
}

function closeMovieModal() {
  document.getElementById('movie-modal-backdrop').style.display = 'none';
  document.body.style.overflow = '';
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
});

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
};
const VIEW_SAVERS = {
  collection: l => { movies.splice(0, movies.length, ...l); saveMovies(); },
  watchlist: saveWatchlist, maybe: saveMaybe, meh: saveMeh, banned: saveBanned,
};
const VIEW_RENDERERS = {
  collection: () => render(sortedList(movies, 'collection')),
  watchlist: renderWatchlistGrid, maybe: renderMaybeGrid, meh: renderMehGrid, banned: renderBannedGrid,
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
  Object.keys(VIEW_LOADERS).forEach(v => {
    VIEW_LOADERS[v]().forEach(x => { if (!titleToView.has(x.title)) titleToView.set(x.title, v); });
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

    const VIEW_LABELS = { collection: 'Collection', watchlist: 'To Watch', maybe: 'Wildcard', meh: 'Meh', banned: "Don't Recommend" };
    const existingView = titleToView.get(m.title);

    const addBtn = document.createElement('button');
    addBtn.className = 'search-add-btn';

    if (existingView) {
      addBtn.textContent = `In ${VIEW_LABELS[existingView]}`;
      addBtn.disabled = true;
      addBtn.classList.add('search-add-btn-exists');
    } else {
      addBtn.textContent = 'Add';
    }

    const doAdd = () => {
      const view = searchTargetView;
      const list = VIEW_LOADERS[view]();
      if (list.some(x => x.title === m.title)) { closeSearchModal(); return; }
      list.unshift({ title: m.title, year: m.year, director: '', poster: m.poster || '', addedAt: Date.now() });
      VIEW_SAVERS[view](list);
      VIEW_RENDERERS[view]();
      renderGridNav();
      applyGrain();
      closeSearchModal();
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
