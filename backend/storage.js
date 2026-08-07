/**
 * storage.js
 * Picks the active storage driver:
 *   - "postgres" when DATABASE_URL is set (Supabase / Neon / Railway PG)
 *   - "gas"      when GAS_WEBAPP_URL is set (Google Apps Script web app)
 *   - "sheets"   when STORAGE_DRIVER=sheets  OR  SHEETS_SPREADSHEET_ID is set
 *   - "sqlite"   when STORAGE_DRIVER=sqlite, or by default (no configuration)
 *
 * STORAGE_DRIVER=sqlite explicitly overrides GAS/Sheets/Postgres so a
 * deployment can always force the reliable built-in SQLite store even when a
 * remote driver's env vars are present.
 */

const forced = (process.env.STORAGE_DRIVER || '').toLowerCase();
const postgresRequested = !forced && !!process.env.DATABASE_URL;
const gasRequested = !forced && !postgresRequested && !!process.env.GAS_WEBAPP_URL;
const sheetsRequested =
  !forced && !postgresRequested &&
  ((process.env.STORAGE_DRIVER || '').toLowerCase() === 'sheets' || !!process.env.SHEETS_SPREADSHEET_ID);
const requested = postgresRequested || gasRequested || sheetsRequested;

let impl;
let driver = 'sqlite';

if (requested) {
  if (postgresRequested) {
    try {
      impl = require('./pgdb');
      driver = 'postgres';
    } catch (err) {
      console.warn('[storage] Postgres driver failed to load, falling back to SQLite:', err.message);
      impl = require('./db');
    }
  } else {
    try {
      impl = require('./sheets');
      driver = gasRequested ? 'gas' : 'sheets';
    } catch (err) {
      console.warn('[storage] Google driver failed to load, falling back to SQLite:', err.message);
      impl = require('./db');
    }
  }
} else {
  impl = require('./db');
}

console.log(`[storage] driver: ${driver}`);

// Remote/SQL drivers need an async init; local SQLite is ready immediately.
const init = () => (driver !== 'sqlite' ? impl.init() : Promise.resolve());
const startPolling = (cb) => (driver !== 'sqlite' ? impl.startPolling(cb) : null);

module.exports = { ...impl, driver, init, startPolling };
