/**
 * storage.js
 * Picks the active storage driver:
 *   - "gas"     when GAS_WEBAPP_URL is set (Google Apps Script web app)
 *   - "sheets"  when STORAGE_DRIVER=sheets  OR  SHEETS_SPREADSHEET_ID is set
 *   - "sqlite"  when STORAGE_DRIVER=sqlite, or by default (no configuration)
 *
 * STORAGE_DRIVER=sqlite explicitly overrides GAS/Sheets so a deployment can
 * always force the reliable built-in SQLite store even when a remote driver's
 * env vars are present.
 */

const forced = (process.env.STORAGE_DRIVER || '').toLowerCase();
const gasRequested = !forced && !!process.env.GAS_WEBAPP_URL;
const sheetsRequested =
  !forced && ((process.env.STORAGE_DRIVER || '').toLowerCase() === 'sheets' || !!process.env.SHEETS_SPREADSHEET_ID);
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
