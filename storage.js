// storage.js — client-side dual-write sync layer
// localStorage is primary (in-session speed); server is persistence layer (cross-device/session).
// Assumes auth.js is loaded first and exposes window.getAuthToken().

(function () {
  'use strict';

  const SYNC_KEYS = [
    'thecollection_movies',
    'thecollection_watchlist',
    'thecollection_maybe',
    'thecollection_meh',
    'thecollection_banned',
    'thecollection_standards',
    'thecollection_watch_log',
    'thecollection_total_cost',
    'thecollection_rec_movies',
    'thecollection_rec_tv',
  ];

  const API_URL = '/api/user-data';

  // --- helpers ---

  function authHeader() {
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    if (!token) return null;
    return { 'Authorization': 'Bearer ' + token };
  }

  function readAllSyncedKeys() {
    const payload = {};
    SYNC_KEYS.forEach(function (key) {
      const raw = localStorage.getItem(key);
      if (raw === null) return;
      // short name: strip prefix
      const field = key.replace('thecollection_', '');
      try {
        payload[field] = JSON.parse(raw);
      } catch (e) {
        payload[field] = raw;
      }
    });
    return payload;
  }

  // --- scheduleSyncToServer ---

  let _syncTimer = null;

  function scheduleSyncToServer() {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(function () {
      const headers = authHeader();
      if (!headers) return; // not authenticated — silently skip

      const payload = readAllSyncedKeys();

      fetch(API_URL, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify(payload),
      }).catch(function (err) {
        console.warn('[storage] sync to server failed (non-fatal):', err);
      });
    }, 2000);
  }

  // --- pullFromServer ---

  function pullFromServer() {
    const headers = authHeader();
    if (!headers) return Promise.resolve();

    return fetch(API_URL, { headers: headers })
      .then(function (res) {
        if (!res.ok) return;
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        SYNC_KEYS.forEach(function (key) {
          const field = key.replace('thecollection_', '');
          if (!(field in data)) return;
          const value = data[field];
          localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        });
      })
      .catch(function (err) {
        console.warn('[storage] pull from server failed (non-fatal):', err);
      });
  }

  // --- checkAndMigrateLocalData ---

  function checkAndMigrateLocalData() {
    if (localStorage.getItem('thecollection_migrated')) return;

    const headers = authHeader();
    if (!headers) return;

    fetch(API_URL, { headers: headers })
      .then(function (res) {
        if (!res.ok) return;
        return res.json();
      })
      .then(function (serverData) {
        if (!serverData) return;

        // Check if server has any real data
        const serverHasData = (serverData.movies && serverData.movies.length > 0) ||
          (serverData.watchlist && serverData.watchlist.length > 0) ||
          (serverData.standards && serverData.standards.length > 0) ||
          (serverData.watch_log && serverData.watch_log.length > 0);

        if (serverHasData) {
          // Server already has data — mark migrated and move on
          localStorage.setItem('thecollection_migrated', '1');
          return;
        }

        // Check if localStorage has data
        const moviesRaw = localStorage.getItem('thecollection_movies');
        let localMovies = [];
        try { localMovies = moviesRaw ? JSON.parse(moviesRaw) : []; } catch (e) {}

        const watchLogRaw = localStorage.getItem('thecollection_watch_log');
        let localWatchLog = [];
        try { localWatchLog = watchLogRaw ? JSON.parse(watchLogRaw) : []; } catch (e) {}

        if (!localMovies.length && !localWatchLog.length) {
          // Nothing local either — mark migrated
          localStorage.setItem('thecollection_migrated', '1');
          return;
        }

        // Local has data, server is empty — prompt user
        const confirmed = window.confirm(
          'Your collection exists locally but has not been saved to the server yet.\n\n' +
          'Upload your local data to the server now?'
        );

        if (confirmed) {
          const payload = readAllSyncedKeys();
          fetch(API_URL, {
            method: 'PUT',
            headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
            body: JSON.stringify(payload),
          })
            .then(function () {
              localStorage.setItem('thecollection_migrated', '1');
            })
            .catch(function (err) {
              console.warn('[storage] migration upload failed (non-fatal):', err);
            });
        } else {
          // User declined — mark migrated so we don't ask again
          localStorage.setItem('thecollection_migrated', '1');
        }
      })
      .catch(function (err) {
        console.warn('[storage] migration check failed (non-fatal):', err);
      });
  }

  // --- expose globals ---

  window.scheduleSyncToServer = scheduleSyncToServer;
  window.pullFromServer = pullFromServer;
  window.checkAndMigrateLocalData = checkAndMigrateLocalData;
})();
