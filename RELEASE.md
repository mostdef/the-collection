# The Collection — Release Notes

---

## Latest — 2026-04-06

### URL Routing
- Every list is now directly linkable: `/movies.html#collection`, `#watchlist`, `#wildcard`, `#meh`, `#dont-recommend`, `#anticipated`
- Active sort is preserved in the URL as `?sort=date` (or `rt`, `imdb`) — sharing or bookmarking a link restores both the view and the sort
- Browser back/forward navigate between views as expected

### Coming Soon Strip
- Strip in the Anticipated view always maintains exactly 5 slots; empty slots show a subtle loading placeholder while new films are being fetched
- Movies already routed to any list (Collection, To Watch, Meh, Don't Recommend, etc.) are filtered out from the strip immediately
- Fetch strategy now explores non-overlapping batches of TMDB pages, so each request brings genuinely new suggestions rather than re-fetching the same films
- Directors are now included on all suggestion cards

### Upcoming Films — Release Date Split
- Any list (Collection, To Watch, Wildcard, Meh, Don't Recommend) now shows a "Coming soon" divider separating films that haven't been released yet from the rest

### Anticipated Modal
- Action buttons (Anticipate / Meh / Don't recommend) are available immediately when the modal opens, without waiting for the details fetch to complete

### Countdown Badge
- Release countdown on Anticipated cards now overlays the top of the poster instead of sitting below it

### Director Link
- Director name in the modal header is now a clickable Wikipedia link, resolved via the same Wikidata lookup used for cast and crew
- Director is always sourced from the freshest API data; stale stored values are corrected automatically

### Snapshot Reliability
- Fixed an issue where manually saving a snapshot could create two identical entries
- Filesystem-based time-window lock prevents duplicate writes even when the request is processed more than once

---

## Latest — 2026-04-05

### Where to Watch
- New tab in the film modal showing where a film can be streamed, rented, or bought in your region
- Logos link directly to the film on each platform — not just the homepage
- Country selector covers 20 regions; defaults to your browser locale and remembers your choice
- Falls back to US availability when your region has no data
- Provider data is cached for 24 hours so repeat visits are instant
- Tab and skeleton loader are available immediately on modal open, before data arrives

---

## Latest — 2026-04-04

### Now Watching — Pill Animations
- Pill lifts slightly on hover and compresses on press — subtle tactile feedback
- Entry animation fires exactly once when transitioning to player view, gated behind a one-shot class so window resize and layout recalculations can't restart it
- Fixed a blink that occurred when the pill transitioned to the player view: the entry animation was previously bound to the steady-state selector, causing it to replay on any layout change

### Now Watching — Widget Stability
- Fixed the widget randomly disappearing after a few interactions — stale animation callbacks were racing each other and leaving the widget visually hidden after state changes
- Panel visibility now driven by a single state attribute instead of scattered inline style writes, eliminating the race condition
- Collapsing to pill now correctly clears companion state so the widget can't restore in the wrong layout after reload

### Card Hover Effect
- Tilt effect now responds immediately on mouseenter, not just mousemove
- RAF loop properly cancelled on mouseleave — no more residual frame after cursor exits
- Restored a regression where the `mousemove` tilt calculation had been stripped, leaving cards with only a CSS class hover instead of the full 3D perspective tilt

### Bug Fixes
- Restored rotating gradient border on live cards and the pill — broken by `transform-style: preserve-3d` being incorrectly added to `.movie-card`, which caused browsers to silently ignore `overflow: hidden` and break `background-clip: border-box`

### Anticipated
- New list for tracking films before they are released — separate from the main five lists because these films cannot be watched yet
- Add any upcoming film via search; TMDB fills in the theatrical release date automatically
- Each card shows a countdown: "In N days", "Tomorrow", "Premieres today!", or "Out now"
- Films are sorted chronologically, soonest premiere first
- When a film's release date passes it stays in Anticipated and the nav button gains a dot and border — a quiet signal that something you were waiting for has arrived
- Empty state shows five upcoming releases from TMDB with a load-more option for when nothing is compelling
- Mutually exclusive with all other lists — a film cannot be anticipated and already in To Watch at the same time

### Companion — LLM Signal Extraction
- After a watch session with ≥2 chat turns, the conversation is analyzed in the background to extract structured signals: what you praised, what created friction, themes you engaged with, and how you tend to engage with films
- Signals are written back to the taste history automatically — no action required
- Curator agent updated to read and aggregate viewing signals across sessions, blending them into the taste profile and recommendation prompt

---

## Latest — 2026-03-31

### Now Watching — Companion Open Animation
- Playing panel now expands vertically to 620px first, then the companion slides in from the left — two-phase sequence eliminates any abrupt width jump
- Companion entrance: slides in from left with scale(0.94) → scale(1) and fade, duration 380ms
- Companion exit: contracts back left with matching scale + fade, duration 220ms (exits faster than it enters)
- Playing panel nudges left as companion pushes in, then springs back — reinforces the spatial relationship
- Open Companion button fades and scales down before companion appears; cleaned up after Phase 2 completes
- Width container expands 320px → 700px in Phase 2 only, preventing any flash at class-add time
- Companion close handler unwinds in reverse: companion slides out, container contracts, panel springs right
- All animations respect `prefers-reduced-motion`

### Now Watching — Companion Delight
- Chat send button brightens to full gold when there is text in the input, dims when empty
- Chat input focus shows a warm gold glow ring
- Typing indicator dots are amber instead of white
- Incoming assistant responses flash a brief golden border shimmer before settling
- Fact timestamps show a small `◼` film-frame mark before the percentage
- Spoiler toggle pops with a subtle scale on activation

### Modal — Loading Skeleton
- Skeleton now precisely matches the real modal layout: correct heights for rating badges, watch button, tagline, overview lines, cast photos, and section labels
- Cast character names now show two stacked bars to account for wrapping (e.g. long character names no longer cause a height jump on load)
- Crew skeleton increased to 5 items to match the P75 of real film data — prevents a full extra row appearing after load
- Fixed structural mismatch where skeleton was flat while real component has a sticky header + scrollable content wrapper — eliminated a 12px shift on every modal open

### Modal — Tab Switching
- Fixed Session tab height: the height of the Details tab is now locked in before switching, so the Session tab always matches it — previously only worked after switching back and forth once
- Added keyboard shortcut `[` / `]` to switch between Details and Session tabs without reaching for the mouse
- Pressing `]` on the last tab wraps around to the first (and vice versa for `[`)

### Now Watching — Animations
- Pill → panel: the widget now expands from the bottom-right corner with a scale + fade entrance instead of appearing instantly
- Panel → pill: the panel exits with a matching scale + fade before the pill animates back in
- Panel → companion: the widget container expands from 320px to 700px over 320ms as the companion panel slides in from the right — no more layout jump
- Companion → panel: the companion slides out to the right while the container contracts simultaneously; class is removed only after both animations complete
- Open Companion button fades and scales down before being hidden when the companion opens
- All transitions respect `prefers-reduced-motion`

### Now Watching — Companion Polish
- Chat send button brightens to full gold when there is text in the input, and dims when the field is empty
- Chat input focus shows a warm gold glow ring instead of a plain border change
- Typing indicator dots are now amber instead of white — consistent with the companion's gold palette
- Incoming assistant responses flash a brief golden border shimmer before settling
- Fact timestamps now show a small `◼` film-frame mark before the percentage — reinforces the cinematic tone
- Spoiler toggle pops with a subtle scale on activation

### Session Indicator
- Cards for films you've previously watched during a session now show a small dot on the poster — a quiet signal that you have history with this film

### Admin Dashboard
- New userbase dashboard accessible from Settings → Admin — shows account-level activity for operational visibility

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

### Bug Fixes
- Snapshots now work correctly after Supabase migration — local dev falls back to filesystem, production uses the database with proper auth

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
