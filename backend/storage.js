/**
 * storage.js
 * Picks the active storage driver:
 *   - "gas"     when GAS_WEBAPP_URL is set (Google Apps Script web app)
 *   - "sheets"  when STORAGE_DRIVER=sheets  OR  SHEETS_SPREADSHEET_ID is set
 *   - "sqlite"  otherwise (default, no configuration needed)
 *
 * Both remote drivers expose the same API, so server.js is agnostic. If a
 * remote driver is requested but missing configuration, we fall back to SQLite
 * with a warning so the app always boots.
 */

const gasRequested = !!process.env.GAS_WEBAPP_URL;
const sheetsRequested =
  (process.env.STORAGE_DRIVER || '').toLowerCase() === 'sheets' || !!process.env.SHEETS_SPREADSHEET_ID;
const requested = gasRequested || sheetsRequested;

let impl;
let driver = 'sqlite';

if (requested) {
  try {
    impl = require('./sheets');
    driver = gasRequested ? 'gas' : 'sheets';
  } catch (err) {
    console.warn('[storage] Google driver failed to load, falling back to SQLite:', err.message);
    impl = require('./db');
  }
} else {
  impl = require('./db');
}

console.log(`[storage] driver: ${driver}`);

// Remote drivers need an async init; SQLite is ready immediately.
const init = () => (driver !== 'sqlite' ? impl.init() : Promise.resolve());
const startPolling = (cb) => (driver !== 'sqlite' ? impl.startPolling(cb) : null);

module.exports = { ...impl, driver, init, startPolling };
