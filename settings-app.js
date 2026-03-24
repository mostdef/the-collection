const CARD_RATINGS_KEY   = 'thecollection_card_ratings';
const STORAGE_KEY        = 'thecollection_movies';
const WATCHLIST_KEY      = 'thecollection_watchlist';
const MAYBE_KEY          = 'thecollection_maybe';
const MEH_KEY            = 'thecollection_meh';
const BANNED_KEY         = 'thecollection_banned';
const STANDARDS_KEY      = 'thecollection_standards';
const TOTAL_COST_KEY     = 'thecollection_total_cost';
const STARTING_BAL_KEY   = 'thecollection_starting_balance';

function applySnapshot(snap) {
  localStorage.setItem(STORAGE_KEY,   JSON.stringify(snap.movies    || []));
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(snap.watchlist || []));
  localStorage.setItem(MAYBE_KEY,     JSON.stringify(snap.maybe     || []));
  localStorage.setItem(MEH_KEY,       JSON.stringify(snap.meh       || []));
  localStorage.setItem(BANNED_KEY,    JSON.stringify(snap.banned    || []));
  if (snap.standards) localStorage.setItem(STANDARDS_KEY, JSON.stringify(snap.standards));
  if (snap.totalCost != null) localStorage.setItem(TOTAL_COST_KEY, snap.totalCost.toFixed(6));
}

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function renderPreview(snap, container) {
  container.hidden = false;
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'snap-preview-header';
  header.innerHTML = `
    <div class="snap-preview-label">${snap.label || formatDate(snap.ts)}</div>
    <div class="snap-preview-counts">
      <span>🎬 ${(snap.movies || []).length} in collection</span>
      <span>🍿 ${(snap.watchlist || []).length} to watch</span>
      <span>🎲 ${(snap.maybe || []).length} wildcard</span>
      <span>👻 ${(snap.banned || []).length} don't recommend</span>
    </div>`;
  container.appendChild(header);

  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'snap-restore-btn';
  restoreBtn.textContent = 'Restore this snapshot';
  restoreBtn.addEventListener('click', () => {
    applySnapshot(snap);
    restoreBtn.textContent = 'Restored ✓';
    restoreBtn.disabled = true;
    setTimeout(() => { window.location.href = 'movies.html'; }, 800);
  });
  container.appendChild(restoreBtn);
}

// File upload
const dropZone  = document.getElementById('snapshot-drop-zone');
const fileInput = document.getElementById('snapshot-file');
const browseBtn = document.getElementById('snapshot-browse-btn');
const preview   = document.getElementById('snapshot-preview');

browseBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  readFile(file);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) readFile(file);
});

function readFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const snap = JSON.parse(e.target.result);
      if (!snap || typeof snap !== 'object') throw new Error();
      renderPreview(snap, preview);
    } catch {
      preview.hidden = false;
      preview.innerHTML = '<span class="snap-error">Invalid snapshot file.</span>';
    }
  };
  reader.readAsText(file);
}

// Load saved snapshots from server
async function loadServerSnapshots() {
  const list = document.getElementById('snapshot-list');
  try {
    const res = await fetch('/api/snapshot');
    const snaps = await res.json();
    list.innerHTML = '';
    if (!snaps.length) {
      list.innerHTML = '<span class="snapshot-list-empty">No snapshots yet.</span>';
      return;
    }
    snaps.forEach(snap => {
      const row = document.createElement('div');
      row.className = 'snap-row';

      const info = document.createElement('div');
      info.className = 'snap-row-info';
      info.innerHTML = `
        <span class="snap-row-label">${snap.label || formatDate(snap.ts)}</span>
        <span class="snap-row-counts">
          🎬 ${(snap.movies || []).length} &nbsp;
          🍿 ${(snap.watchlist || []).length} &nbsp;
          🎲 ${(snap.maybe || []).length} &nbsp;
          👻 ${(snap.banned || []).length}
        </span>`;

      const btn = document.createElement('button');
      btn.className = 'snap-row-btn';
      btn.textContent = 'Restore';
      btn.addEventListener('click', () => {
        applySnapshot(snap);
        btn.textContent = 'Restored ✓';
        btn.disabled = true;
        setTimeout(() => { window.location.href = 'movies.html'; }, 800);
      });

      row.appendChild(info);
      row.appendChild(btn);
      list.appendChild(row);
    });
  } catch {
    list.innerHTML = '<span class="snapshot-list-empty">Could not load snapshots.</span>';
  }
}

loadServerSnapshots();

// ── Cost tracking ────────────────────────────────────────────────────────────

function renderCostStats() {
  const totalTracked = parseFloat(localStorage.getItem(TOTAL_COST_KEY) || '0') || 0;
  const startingBal  = parseFloat(localStorage.getItem(STARTING_BAL_KEY) || '') || null;

  document.getElementById('cost-total-tracked').textContent = `$${totalTracked.toFixed(4)}`;

  if (startingBal !== null) {
    const remaining = startingBal - totalTracked;
    document.getElementById('cost-remaining-value').textContent = `$${remaining.toFixed(4)}`;
    document.getElementById('starting-balance-input').value = startingBal.toFixed(2);
  }
}

document.getElementById('save-balance-btn').addEventListener('click', () => {
  const val = parseFloat(document.getElementById('starting-balance-input').value);
  if (!isNaN(val) && val >= 0) {
    localStorage.setItem(STARTING_BAL_KEY, val.toFixed(6));
    renderCostStats();
    document.getElementById('save-balance-btn').textContent = 'Saved ✓';
    setTimeout(() => { document.getElementById('save-balance-btn').textContent = 'Save'; }, 1500);
  }
});

document.getElementById('clear-balance-btn').addEventListener('click', () => {
  localStorage.removeItem(STARTING_BAL_KEY);
  document.getElementById('starting-balance-input').value = '';
  document.getElementById('cost-remaining-value').textContent = '—';
});

document.getElementById('clear-total-btn').addEventListener('click', () => {
  localStorage.removeItem(TOTAL_COST_KEY);
  renderCostStats();
});

renderCostStats();

// ── Card display ──────────────────────────────────────────────────────────────
const cardRatingsToggle = document.getElementById('card-ratings-toggle');
cardRatingsToggle.checked = localStorage.getItem(CARD_RATINGS_KEY) !== 'false';
cardRatingsToggle.addEventListener('change', () => {
  localStorage.setItem(CARD_RATINGS_KEY, cardRatingsToggle.checked ? 'true' : 'false');
});

document.getElementById('save-snapshot-btn').addEventListener('click', async function () {
  this.textContent = 'Saving…';
  this.disabled = true;
  const snap = {
    ts:        Date.now(),
    label:     new Date().toLocaleString(),
    movies:    JSON.parse(localStorage.getItem(STORAGE_KEY)   || '[]'),
    watchlist: JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'),
    maybe:     JSON.parse(localStorage.getItem(MAYBE_KEY)     || '[]'),
    banned:    JSON.parse(localStorage.getItem(BANNED_KEY)    || '[]'),
  };
  try {
    const res = await fetch('/api/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snap),
    });
    if (res.ok) {
      this.textContent = 'Saved ✓';
      setTimeout(() => loadServerSnapshots(), 400);
    } else {
      this.textContent = 'Error — try again';
      this.disabled = false;
    }
  } catch {
    this.textContent = 'Error — try again';
    this.disabled = false;
  }
});
