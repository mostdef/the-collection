# The Collection — Project Guide

## Overview
A personal film curation tool for reflective movie watching practice. Not a streaming app or social network — a personal archive where a cinephile deepens understanding of their own taste through deliberate selection, real-time watching companionship, and AI-assisted reflection. Vanilla JS/HTML/CSS, no build system. Deployed on Vercel with serverless API functions.

**Design context**: See `.impeccable.md` for brand personality, aesthetic direction, and design principles. **When working on any UI feature, always read `.impeccable.md` first and apply the `/frontend-design` skill principles** — brand is Curated, Intimate, Cinematic. Every surface should feel tactile, personal, and polished.

**Dev:** `vercel dev` (runs browser-sync + API functions locally)

## File Structure
```
movies.html          # Main app page
movies-app.js        # All client-side logic (~2000+ lines)
movies-data.js       # Static reference data
settings.html        # Settings page
settings-app.js      # Settings logic (snapshots, cost tracking, card display)
styles.css           # All styles
taste-profile.json   # Curator-generated taste profile (inject into recommendations)
components/
  card.js            # CardComponent IIFE — renderCard, addTilt, addTexturesToPoster
  modal.js           # ModalComponent IIFE — renderModal, renderDetailsContent, renderSessionContent
  nww.js             # NWWComponent IIFE — renderIdle, renderPill, renderPlaying, renderCompanion, renderDeciding
sandbox/
  index.html         # Component gallery landing page
  card.html          # Card component sandbox (permutations + interactive controls)
  modal.html         # Modal component sandbox (permutations + interactive controls)
  nww.html           # NWW widget sandbox (permutations + interactive controls)
  fixtures.js        # Mock data for sandbox pages (Fixtures.movies, Fixtures.sessions, Fixtures.nwwStates)
api/
  recommend.js       # AI recommendations (Claude via Anthropic SDK)
  search-movie.js    # OMDB movie search
  movie-details.js   # OMDB movie details
  snapshot.js        # Server-side snapshot save/load (./snapshots/)
  upcoming.js        # TMDB /movie/upcoming wrapper — empty-state suggestions for Anticipated view
  persona.js         # Persona generation
  persona-image.js   # Persona image generation
  persona-stats.js   # Persona statistics
snapshots/           # Server-side snapshot JSON files
```

## Component Architecture

Components live in `components/` as IIFE modules (no build system). Each exposes pure rendering functions: **data in → DOM node out**, no localStorage reads, no globals except `getCachedTextures()` (defined in `movies-app.js`).

### CardComponent (`components/card.js`)
```js
CardComponent.renderCard(movie, { view, isLive, onRemove, onStarClick, onCardClick })
CardComponent.addTilt(card)
CardComponent.addTexturesToPoster(card, movie)
CardComponent.appendCardRatings(card, movie)
```

### ModalComponent (`components/modal.js`)
```js
ModalComponent.renderModal(container, movie, data, {
  initialTab,           // 'details' | 'session'
  onWatchTonight,       // fn
  getActiveSessions,    // () => session | null
  getPastSessions,      // () => array
})
```

### NWWComponent (`components/nww.js`)
```js
NWWComponent.renderIdle(container)
NWWComponent.renderPill(container, { title, poster, elapsed, runtime, barFill })
NWWComponent.renderPlaying(container, movie, { elapsed, runtime, progressPct, paused, onPause, onDone, onAbandon, onCompanionOpen })
NWWComponent.renderCompanion(container, { facts, chatHistory, spoilersOk, model, elapsedPct, onClose, onSpoilerToggle, onModelSwitch, onSendChat })
NWWComponent.renderDeciding(container, movie, { onCollection, onMeh, onBan })
```

### Sandbox
- Access at `/sandbox/` in dev
- `sandbox/fixtures.js` provides mock movies, sessions, and NWW states
- Each sandbox page is self-contained: stubs `getCachedTextures()`, inlines fonts, loads component file + `styles.css`
- Blocked from Vercel production via `vercel.json` route rule

## localStorage Keys
All keys prefixed `thecollection_`:
| Key | Contents |
|-----|----------|
| `thecollection_movies` | Main collection array |
| `thecollection_watchlist` | To Watch list |
| `thecollection_maybe` | Wildcard list |
| `thecollection_meh` | Meh list |
| `thecollection_banned` | Don't Recommend list |
| `thecollection_standards` | Reference films (up to 12) |
| `thecollection_total_cost` | Accumulated API spend |
| `thecollection_starting_balance` | User's Anthropic balance |
| `thecollection_card_ratings` | Toggle: show IMDb/RT on cards |
| `thecollection_sort_*` | Per-view sort modes |
| `thecollection_rec_cache` | Cached last recommendation |
| `thecollection_taste_signals` | Watch session outcome signals (array, newest first, max 50) |
| `thecollection_wtw_country` | User's selected country code for "Where to watch" (ISO 3166-1 alpha-2, e.g. `PL`) |
| `thecollection_providers_<tmdb_id>` | Cached watch provider data per film `{ data, ts }` — 24h TTL |
| `thecollection_anticipated` | Anticipated list — `[{ title, year, director, poster, release_date, addedAt }]` sorted chronologically on render |
| `thecollection_tex_<title>` | Persisted fold texture pair `{hl, sh}` as JPEG data URIs — generated once per movie, never regenerated unless cleared |

## Key Architecture Patterns

### Render Pipeline
- `markDirty(view)` — marks a view as needing re-render
- `setGridView(view)` — switches to view, triggers full update chain (render + updateSortable + applyGrain)
- `render(list)` — renders the collection grid + standards/persona sections
- **Always use `markDirty` + `setGridView` + `renderGridNav()` for updates that affect multiple parts of the UI**, never call `render()` directly for actions that change lists

### Caching
- `_sortModesCache` — invalidated on save
- `_tabCountCache` — invalidated via `invalidateTabCounts()` in all save functions (`saveMovies`, `saveBanned`, `saveWatchlist`, `saveMaybe`, `saveMeh`)
- `textureCache` — LRU Map, max 80 entries, keyed by movie title

### Performance
- `addTilt()` mousemove uses `requestAnimationFrame` throttle (`tiltFrame`)
- Grain applied via CSS custom properties `--grain-hl` / `--grain-sh` on `:root` (not per-element)
- Standards filtering uses `Set.has()` not `Array.some()`
- Search pre-builds `titleToView` Map to avoid N+1 localStorage reads
- Sortable.js reused via `sortableInstance.option('disabled', ...)` when view unchanged; only destroyed/recreated on view switch (`sortableView` tracks current view)

### Model Switching (Sonnet / Opus)
- `getRecModel()` returns current model
- `rec._model` stored on recommendation object at fetch time
- `updateRecCostHint()` only shows actual cost when `currentRec._model === currentModel` — otherwise shows estimate

### Snapshots
- `applySnapshot(snap)` in `settings-app.js` must restore **all 7 fields**: `movies`, `watchlist`, `maybe`, `meh`, `banned`, `standards`, `totalCost`
- Missing any field silently drops that data on restore

### Taste Profile
- `taste-profile.json` is generated by the curator agent (run manually when collection changes significantly — after ~10 new films)
- `api/recommend.js` loads it at module level and injects as `## TASTE PROFILE` block in `buildPrompt()`
- Re-run curator agent when recommendations feel stale or miss obvious patterns

## CSS Notes
- `.rec-model-label` base: `color: #ccc` (inactive state)
- `.rec-model-label.active`: `color: #444` (active state) — intentionally reversed from typical pattern
- `.poster-texture-hl`: `opacity: var(--grain-hl, 0.08)`
- `.poster-texture-sh`: `opacity: var(--grain-sh, 0.04)`
- `.grid-nav` uses `backdrop-filter: blur(12px)` (not 48px — scroll performance)

## Standards (Reference Films)
- Max 12 reference films
- Removing a standard: use `markDirty('collection')` + `setGridView('collection')` + `renderGridNav()` — the film should reappear in the collection grid
- Standards are excluded from collection grid via `Set` lookup against `loadStandards()`

## External APIs
- **Anthropic SDK** — recommendations, persona generation (model: sonnet or opus, user-switchable)
- **OMDB** — movie search and details

## Design Rules
- Always read `.impeccable.md` before touching any UI
- Run `/frontend-design` for any new component or visual feature
- Run `/delight` after implementing a new interactive element
- Typography: Playfair Display (display), Inter (body/UI), Oswald (labels/uppercase)
- Gold (`#ffd700`) is reserved for standards, achievements, and completion states
- Springy easing: `cubic-bezier(0.23, 1, 0.32, 1)` for all entrances
- Respect `prefers-reduced-motion` — always add to the reduced-motion block in styles.css

## Things to Avoid
- Don't call `render()` directly for user actions — use the `markDirty` + `setGridView` chain
- Don't use `Array.some()` for standards filtering — use `Set.has()`
- Don't add new localStorage keys without documenting them above
- Don't skip `invalidateTabCounts()` in any new save function
