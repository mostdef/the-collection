# The Collection — Release Notes

---

## Latest — 2026-03-30

### Component Sandbox
- Extracted `CardComponent`, `ModalComponent`, `NWWComponent` as standalone IIFE modules in `components/`
- Added `sandbox/` — isolated component gallery with interactive controls and all permutations per component
- Sandbox accessible at `/sandbox/` in dev; blocked from production via `vercel.json`

### Performance
- Render from localStorage immediately on init — grid visible before auth or cloud sync completes
- Supabase SDK and SortableJS removed from critical path — loaded dynamically after first paint
- Added `defer` to all script tags for parallel downloads
- Fold textures persisted to localStorage — generated once per movie, loaded instantly on every subsequent reload

### UI Polish
- Golden travelling border on cards with an active watch session (`@property` conic-gradient animation)
- Session-in-progress indicator moved to title level in movie modal
- Tilt/hover effect applied consistently across all grid views (Watchlist, Wildcard, Meh, Banned)
- Director backfill for manually-added movies — resolved on next modal open
- Live card border upgraded: comet-shaped rotating gradient with layered bloom glow — fixed a long-standing CSS specificity bug that was silently suppressing the gradient
- Sandbox poster images cached in localStorage — loads instantly after first visit instead of fetching on every open
- Sandbox chrome updated to light theme to match the main app

---

## Latest — 2026-03-29

### Now Watching Widget
- Replaced the full-screen "Screening Tonight" overlay with a **floating bottom-right widget**
- Three visual states: idle button, collapsed pill with live timer, expanded panel with full controls
- **Real-time timer** with pause/resume, progress bar scrub, and clickable time editing (h:mm:ss)
- **Search with quick-picks**: start a session from the widget itself — shows 5 most recent watchlist items plus full search
- **Decision flow**: Collection / Meh / Don't Recommend buttons after watching, with 2-second auto-collapse confirmation
- **localStorage persistence**: survives page refresh, restores timer position and pause state
- **Mobile responsive**: full-width at <600px
- z-index 8000 (above movie modal, below search modal)

### Curator v2
- Taste profile restructured into two levels: **insights** (400–600 word extended analysis) and **prompt_section** (150–200 word lean injection)
- `prompt_section` uses **SEEK / AVOID / WEIGHT** bullet structure — patterns only, no redundant film names
- Curator agent now supports **incremental mode** (default: diffs against baseline snapshot) and **fresh mode** (full rebuild)
- `recommend.js` reads profile per-request instead of caching at module init — updates take effect immediately without redeploy

### Enricher Improvements
- Enricher now backfills **missing directors** alongside IMDb/RT ratings
- **Optimized API calls**: skips TMDB when `imdb_id` already exists, goes straight to OMDB
- "Add film" search now **auto-fetches director** from movie details API after adding

### Bug Fixes
- Fixed snapshot restore missing **meh**, **standards**, and **totalCost** fields
- Fixed auth middleware returning 401 when Supabase not configured (stub user fallback)
- Fixed incorrect IMDB IDs for Burning (Lee Chang-dong) and A Separation (Asghar Farhadi)

### Ideas & Planning
- Created Ideas.md for tracking future development ideas
- PRD: Taste Match — multi-user profile comparison (Issue #2)
- PRD: Quick-Pick Profile Creation for new users (Issue #3)
- PRD: Now Watching Companion — timed facts, conversation, signal extraction (Issue #4)

---

## v2.0.0 — 2026-03-22

### Rename & Rebrand
- Project renamed from Braintrust → The Curator → **The Collection**
- All localStorage keys migrated to `thecollection_` prefix
- Package name, Vercel project, HTML titles, folder path all updated

### Multi-User Prep (Supabase)
- Added Supabase Auth (magic link / passwordless email)
- Added dual-write storage layer (localStorage primary, server sync via debounce)
- All API endpoints gated with auth (graceful skip when unconfigured)
- Login page, auth.js client, storage.js sync layer, supabase-schema.sql

### Defaults
- Recommendation engine **OFF by default** (opt-in via Settings)
- Card ratings (IMDb/RT) **OFF by default** (opt-in via Settings)

### Curator Agent
- New agent that analyzes collection to extract cinematic taste signature
- Generates `taste-profile.json` injected into every recommendation prompt
- Covers: gravitational directors, dominant themes, preferred tones, formal tendencies, reject patterns

### Other Agents
- **Custodian**: code review, consistency, commits, release prep
- **Enricher**: batch IMDb/RT rating enrichment from TMDB + OMDB

---

## v1.4.0 — 2026-03-20

- Show IMDb & RT ratings on cards (toggleable, default off)
- Sort by RT score or IMDb rating per category
- Nav and UI polish

---

## v1.3.0 — 2026-03-19

- Recommendations toggle (enable/disable from Settings)
- Stable controls layout
- Rebranded to The Curator

---

## v1.2.0 — 2026-03-18

- Batch recommendations with retry logic
- API cost tracking displayed in Settings
- Model toggle (Sonnet / Opus)
- Grain texture persistence

---

## v1.1.0 — 2026-03-17

- Live AI recommendations replacing hand-curated pool
- Five categories: Collection, To Watch, Wildcard, Meh, Don't Recommend
- Category navigation with sliding indicator and counts
- Drag across categories
- Sort modes (preference / date added)
- Snapshots & Settings page
- Undo on card removal
- Performance: per-category DOM elements, dirty flags, texture caching

---

## v1.0.0 — 2026-03-14

- Initial release: movie poster grid with parallax tilt effect
- Drag-to-reorder
- Fold texture overlay with grain
- Playfair Display typography
