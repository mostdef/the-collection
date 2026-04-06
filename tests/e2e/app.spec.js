// @ts-check
import { test, expect } from '@playwright/test';

// ── Seed data ─────────────────────────────────────────────────────────────────

const FILM_A = { title: 'Mulholland Drive', year: '2001', poster: '', director: 'David Lynch', addedAt: 1700000002000 };
const FILM_B = { title: 'Heat', year: '1995', poster: '', director: 'Michael Mann', addedAt: 1700000001000 };

/**
 * Clear all thecollection_ localStorage keys before the page initialises,
 * then seed the given keys. This runs before the app JS via addInitScript.
 *
 * Uses sessionStorage as a one-shot guard so the clear only fires on the
 * FIRST navigation per test — page.reload() inside the same test will not
 * wipe data that the test itself just wrote.
 *
 * Always sets thecollection_movies to [] (or the provided value) so the
 * static movies-data.js fallback collection is not used in tests.
 */
async function seed(page, data = {}) {
  const withMovies = Object.prototype.hasOwnProperty.call(data, 'thecollection_movies')
    ? data
    : { 'thecollection_movies': [], ...data };

  await page.addInitScript((d) => {
    if (sessionStorage.getItem('_pw_seeded')) return;
    sessionStorage.setItem('_pw_seeded', '1');
    Object.keys(localStorage)
      .filter(k => k.startsWith('thecollection_'))
      .forEach(k => localStorage.removeItem(k));
    for (const [k, v] of Object.entries(d)) {
      localStorage.setItem(k, JSON.stringify(v));
    }
  }, withMovies);
}

/** Mock all external and API requests so tests never make real network calls. */
function silenceExternals(page) {
  // Google Fonts — blocks load event if slow
  page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  page.route('https://fonts.gstatic.com/**',    r => r.fulfill({ body: Buffer.alloc(0) }));
  // Supabase CDN (auth.js loads it dynamically)
  page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  // Supabase config and data
  page.route('**/api/config', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ supabaseUrl: '', supabaseKey: '' }) }));
  page.route('https://*.supabase.co/**', r => r.fulfill({ contentType: 'application/json', body: '{}' }));
}

/** Silence API routes the tests don't care about and mock search/details. */
function stubApis(page) {
  silenceExternals(page);
  // Search results (q= queries from the search modal)
  page.route('**/api/search-movie*', (route, request) => {
    const url = new URL(request.url());
    if (url.searchParams.get('type') === 'upcoming') {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [], page: 1, total_pages: 1 }) });
    } else {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([
        { title: 'Stalker', year: '1979', poster: '', director: 'Andrei Tarkovsky', release_date: '1979-05-13' },
      ]) });
    }
  });
  page.route('**/api/movie-details**', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ director: 'Andrei Tarkovsky', director_wiki: null }),
  }));
  page.route('**/api/recommend**', r => r.fulfill({ contentType: 'application/json', body: '{}' }));
  page.route('**/api/persona**',   r => r.fulfill({ contentType: 'application/json', body: '{}' }));
}

/** Silence background API calls that aren't under test. */
function silenceApis(page) {
  silenceExternals(page);
  page.route('**/api/recommend**', r => r.fulfill({ contentType: 'application/json', body: '{}' }));
  page.route('**/api/persona**',   r => r.fulfill({ contentType: 'application/json', body: '{}' }));
  page.route('**/api/search-movie**', (route, request) => {
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [], page: 1, total_pages: 1 }) });
  });
}

// ── View routing ──────────────────────────────────────────────────────────────

test.describe('View routing', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
    silenceApis(page);
  });

  test('loads collection view by default', async ({ page }) => {
    await page.goto('/movies.html');
    await expect(page.locator('#grid-collection')).toBeVisible();
    await expect(page.locator('#grid-watchlist')).toBeHidden();
  });

  for (const [hash, gridId] of [
    ['collection',    '#grid-collection'],
    ['watchlist',     '#grid-watchlist'],
    ['wildcard',      '#grid-maybe'],
    ['meh',           '#grid-meh'],
    ['dont-recommend','#grid-banned'],
    ['anticipated',   '#grid-anticipated'],
  ]) {
    test(`#${hash} shows the right grid`, async ({ page }) => {
      await page.goto(`/movies.html#${hash}`);
      await expect(page.locator(gridId)).toBeVisible();
    });
  }

  test('clicking a nav tab updates the URL hash', async ({ page }) => {
    await page.goto('/movies.html');
    await page.locator('.grid-nav-btn', { hasText: 'To Watch' }).click();
    await expect(page).toHaveURL(/#watchlist/);
    await expect(page.locator('#grid-watchlist')).toBeVisible();
  });

  test('clicking a nav tab hides the previous grid', async ({ page }) => {
    await page.goto('/movies.html#collection');
    await page.locator('.grid-nav-btn', { hasText: 'To Watch' }).click();
    await expect(page.locator('#grid-collection')).toBeHidden();
  });

  test('browser back returns to the previous view', async ({ page }) => {
    await page.goto('/movies.html#collection');
    await page.locator('.grid-nav-btn', { hasText: 'To Watch' }).click();
    await expect(page).toHaveURL(/#watchlist/);
    await page.goBack();
    await expect(page).toHaveURL(/#collection/);
    await expect(page.locator('#grid-collection')).toBeVisible();
  });

  test('browser forward navigates forward again', async ({ page }) => {
    await page.goto('/movies.html#collection');
    await page.locator('.grid-nav-btn', { hasText: 'To Watch' }).click();
    await page.goBack();
    await page.goForward();
    await expect(page).toHaveURL(/#watchlist/);
    await expect(page.locator('#grid-watchlist')).toBeVisible();
  });
});

// ── Sort mode ─────────────────────────────────────────────────────────────────

test.describe('Sort mode', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
    silenceApis(page);
  });

  test('clicking a sort button adds sort to the URL', async ({ page }) => {
    await page.goto('/movies.html#collection');
    await page.locator('.grid-sort-btn', { hasText: /date/i }).click();
    await expect(page).toHaveURL(/sort=date/);
  });

  test('sort is restored from URL on load', async ({ page }) => {
    await page.goto('/movies.html#collection?sort=date');
    await expect(page.locator('.grid-sort-btn.active')).toContainText(/date/i);
  });

  test('non-default sort survives a page reload', async ({ page }) => {
    await page.goto('/movies.html#collection?sort=date');
    await page.reload();
    await expect(page).toHaveURL(/sort=date/);
    await expect(page.locator('.grid-sort-btn.active')).toContainText(/date/i);
  });
});

// ── Film state ────────────────────────────────────────────────────────────────

test.describe('Film state', () => {
  test.beforeEach(async ({ page }) => {
    silenceApis(page);
  });

  test('films in localStorage appear in the collection grid', async ({ page }) => {
    await seed(page, { 'thecollection_movies': [FILM_A, FILM_B] });
    await page.goto('/movies.html');
    await expect(page.locator('.movie-card')).toHaveCount(2);
  });

  test('film title is visible on its card', async ({ page }) => {
    await seed(page, { 'thecollection_movies': [FILM_A] });
    await page.goto('/movies.html');
    await expect(page.locator('.card-name', { hasText: FILM_A.title })).toBeVisible();
  });

  test('collection count badge reflects the number of stored films', async ({ page }) => {
    await seed(page, { 'thecollection_movies': [FILM_A, FILM_B] });
    await page.goto('/movies.html');
    const btn = page.locator('.grid-nav-btn', { hasText: 'Collection' });
    await expect(btn).toContainText('2');
  });

  test('watchlist count badge reflects the stored list', async ({ page }) => {
    await seed(page, { 'thecollection_watchlist': [FILM_A, FILM_B] });
    await page.goto('/movies.html');
    const btn = page.locator('.grid-nav-btn', { hasText: 'To Watch' });
    await expect(btn).toContainText('2');
  });

  test('films persist across a full page reload', async ({ page }) => {
    await seed(page, { 'thecollection_movies': [FILM_A] });
    await page.goto('/movies.html');
    await expect(page.locator('.movie-card')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('.movie-card')).toHaveCount(1);
  });

  test('a film in the collection does not appear in the watchlist grid', async ({ page }) => {
    await seed(page, {
      'thecollection_movies': [FILM_A],
      'thecollection_watchlist': [FILM_B],
    });
    await page.goto('/movies.html#watchlist');
    // Scope to the watchlist grid only — hidden grids still exist in the DOM
    await expect(page.locator('#grid-watchlist .card-name', { hasText: FILM_A.title })).toHaveCount(0);
    await expect(page.locator('#grid-watchlist .card-name', { hasText: FILM_B.title })).toBeVisible();
  });

  test('empty collection shows no cards', async ({ page }) => {
    await seed(page); // seed() always sets thecollection_movies: [] to override static data
    await page.goto('/movies.html');
    await expect(page.locator('#grid-collection .movie-card')).toHaveCount(0);
  });
});

// ── Coming soon divider ───────────────────────────────────────────────────────

test.describe('Coming soon divider', () => {
  const FUTURE_FILM = { title: 'Upcoming Film', year: '2099', poster: '', director: '', release_date: '2099-01-01', addedAt: Date.now() };
  const PAST_FILM   = { title: 'Released Film', year: '2000', poster: '', director: '', release_date: '2000-01-01', addedAt: Date.now() - 1000 };

  test.beforeEach(async ({ page }) => {
    silenceApis(page);
  });

  test('a future-release film in the collection shows the Coming soon divider', async ({ page }) => {
    await seed(page, { 'thecollection_movies': [FUTURE_FILM, PAST_FILM] });
    await page.goto('/movies.html#collection');
    await expect(page.locator('.grid-release-divider')).toBeVisible();
  });

  test('no divider when all films are released', async ({ page }) => {
    await seed(page, { 'thecollection_movies': [PAST_FILM] });
    await page.goto('/movies.html#collection');
    await expect(page.locator('.grid-release-divider')).toHaveCount(0);
  });
});

// ── Search and add ────────────────────────────────────────────────────────────

test.describe('Search and add', () => {
  // Only stub APIs — individual tests call seed() with the state they need,
  // because the sessionStorage guard means only the FIRST seed() per test wins.
  test.beforeEach(({ page }) => {
    stubApis(page);
  });

  test('clicking "+ Add film" opens the search modal', async ({ page }) => {
    await seed(page);
    await page.goto('/movies.html');
    await page.locator('.grid-add-btn').first().click();
    await expect(page.locator('#search-modal-backdrop')).toBeVisible();
  });

  test('typing a query shows search results', async ({ page }) => {
    await seed(page);
    await page.goto('/movies.html');
    await page.locator('.grid-add-btn').first().click();
    await page.fill('#search-input', 'Stalker');
    await expect(page.locator('.search-result-row')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.search-result-title')).toContainText('Stalker');
  });

  test('adding a film closes the modal and shows the card', async ({ page }) => {
    await seed(page);
    await page.goto('/movies.html');
    await page.locator('.grid-add-btn').first().click();
    await page.fill('#search-input', 'Stalker');
    await expect(page.locator('.search-result-row')).toBeVisible({ timeout: 3000 });
    await page.locator('.search-add-btn').click();
    await expect(page.locator('#search-modal-backdrop')).toBeHidden();
    await expect(page.locator('#grid-collection .movie-card')).toHaveCount(1);
    await expect(page.locator('.card-name', { hasText: 'Stalker' })).toBeVisible();
  });

  test('added film persists across reload', async ({ page }) => {
    await seed(page);
    await page.goto('/movies.html');
    await page.locator('.grid-add-btn').first().click();
    await page.fill('#search-input', 'Stalker');
    await expect(page.locator('.search-result-row')).toBeVisible({ timeout: 3000 });
    await page.locator('.search-add-btn').click();
    await expect(page.locator('#grid-collection .movie-card')).toHaveCount(1);
    // Reload: sessionStorage guard ensures localStorage is NOT wiped again
    await page.reload();
    await expect(page.locator('.card-name', { hasText: 'Stalker' })).toBeVisible();
  });

  test('film already in a list shows a disabled "In Collection" button', async ({ page }) => {
    await seed(page, { 'thecollection_movies': [{ title: 'Stalker', year: '1979', poster: '', addedAt: Date.now() }] });
    await page.goto('/movies.html');
    await page.locator('.grid-add-btn').first().click();
    await page.fill('#search-input', 'Stalker');
    await expect(page.locator('.search-result-row')).toBeVisible({ timeout: 3000 });
    const btn = page.locator('.search-add-btn');
    await expect(btn).toBeDisabled();
    await expect(btn).toContainText('In Collection');
  });

  test('Escape closes the search modal', async ({ page }) => {
    await seed(page);
    await page.goto('/movies.html');
    await page.locator('.grid-add-btn').first().click();
    await expect(page.locator('#search-modal-backdrop')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-modal-backdrop')).toBeHidden();
  });

  test('clicking the backdrop closes the search modal', async ({ page }) => {
    await seed(page);
    await page.goto('/movies.html');
    await page.locator('.grid-add-btn').first().click();
    await expect(page.locator('#search-modal-backdrop')).toBeVisible();
    await page.locator('#search-modal-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#search-modal-backdrop')).toBeHidden();
  });
});

// ── Add to a non-collection view ──────────────────────────────────────────────

test.describe('Add film to watchlist', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
    stubApis(page);
  });

  test('film added via watchlist view appears in watchlist grid', async ({ page }) => {
    await page.goto('/movies.html#watchlist');
    await page.locator('.grid-add-btn').first().click();
    await page.fill('#search-input', 'Stalker');
    await expect(page.locator('.search-result-row')).toBeVisible({ timeout: 3000 });
    await page.locator('.search-add-btn').click();
    await expect(page.locator('#grid-watchlist .movie-card')).toHaveCount(1);
  });

  test('film added to watchlist does not appear in collection', async ({ page }) => {
    await page.goto('/movies.html#watchlist');
    await page.locator('.grid-add-btn').first().click();
    await page.fill('#search-input', 'Stalker');
    await expect(page.locator('.search-result-row')).toBeVisible({ timeout: 3000 });
    await page.locator('.search-add-btn').click();
    await page.locator('.grid-nav-btn', { hasText: 'Collection' }).click();
    // Collection was seeded empty, so only 0 cards should appear there
    await expect(page.locator('#grid-collection .card-name', { hasText: 'Stalker' })).toHaveCount(0);
  });
});

// ── NWW widget ────────────────────────────────────────────────────────────────

test.describe('Now Watching widget', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
    silenceApis(page);
  });

  test('idle button is visible on load', async ({ page }) => {
    await page.goto('/movies.html');
    await expect(page.locator('#nww-idle-btn')).toBeVisible();
  });

  test('clicking idle button opens the NWW panel', async ({ page }) => {
    await page.goto('/movies.html');
    await page.locator('#nww-idle-btn').click();
    await expect(page.locator('#nww-panel')).toBeVisible();
  });
});

// ── Anticipated list ──────────────────────────────────────────────────────────

test.describe('Anticipated', () => {
  const ANT_FILM = { title: 'Dune Part Three', year: '2026', poster: '', director: '', release_date: '2026-12-01', addedAt: Date.now() };

  test.beforeEach(async ({ page }) => {
    silenceApis(page);
  });

  test('anticipated films appear in the anticipated grid', async ({ page }) => {
    await seed(page, { 'thecollection_anticipated': [ANT_FILM] });
    await page.goto('/movies.html#anticipated');
    await expect(page.locator('#grid-anticipated .movie-card')).toHaveCount(1);
    await expect(page.locator('.card-name', { hasText: ANT_FILM.title })).toBeVisible();
  });

  test('anticipated count shown in nav badge', async ({ page }) => {
    await seed(page, { 'thecollection_anticipated': [ANT_FILM] });
    await page.goto('/movies.html');
    const btn = page.locator('.grid-nav-btn--anticipated');
    await expect(btn).toContainText('1');
  });

  test('anticipated film is not counted in collection', async ({ page }) => {
    await seed(page, { 'thecollection_anticipated': [ANT_FILM] });
    await page.goto('/movies.html');
    const collectionBtn = page.locator('.grid-nav-btn', { hasText: 'Collection' });
    await expect(collectionBtn).not.toContainText('1');
  });
});
