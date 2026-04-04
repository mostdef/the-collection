# The Collection

A personal film curation tool for reflective movie watching. Not a streaming app or social network — a private archive for deepening understanding of your own taste through deliberate selection, real-time companionship while watching, and AI-assisted reflection.

---

## What it does

- **Curate** your collection across five categories: Collection, To Watch, Wildcard, Meh, Don't Recommend
- **Anticipated** — track unreleased films with a countdown to their theatrical premiere; notifies you when something you were waiting for has arrived
- **Reference films** — pin up to 12 standards that anchor your taste and inform recommendations
- **AI recommendations** powered by Claude, tuned to your taste profile
- **Now Watching widget** — track a live session with a real-time timer, pause/resume, and a film companion (timed facts + chat)
- **Companion** — spoiler-aware film notes and freeform chat during a watch session
- **Persona** — AI-generated taste portrait that evolves with your collection
- **Where to watch** — per-film tab showing streaming availability by country, with direct deep links to each platform
- **Snapshots** — point-in-time backups of your full collection state

---

## Stack

- Vanilla JS / HTML / CSS — no framework, no build step
- Vercel serverless functions for API routes
- Supabase for auth and cloud sync
- Claude (Anthropic) for recommendations, companion, and persona
- TMDB + OMDB for movie metadata and ratings

---

## Dev

```sh
vercel dev
```

Runs the app at `localhost:3000` with API functions and browser-sync live reload.

---

## Structure

```
movies.html          # Main app
movies-app.js        # All client-side logic
styles.css           # All styles
settings.html        # Settings page
components/          # Extracted UI components (Card, Modal, NWW)
sandbox/             # Component development sandbox (dev only)
api/                 # Vercel serverless functions
snapshots/           # Server-side snapshot storage
taste-profile.json   # Curator-generated taste profile
```

See `CLAUDE.md` for full architecture reference, localStorage keys, and development conventions.

---

## Release notes

See `RELEASE.md`.
