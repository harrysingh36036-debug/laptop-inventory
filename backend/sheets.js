/**
 * sheets.js
 * Google Sheets storage adapter — lets Google Sheets act as the live database.
 *
 * How it works
 * ------------
 * 1. On startup the whole spreadsheet is read into an in-memory cache (fast
 *    synchronous reads, so the Express routes stay sync like the SQLite path).
 * 2. Every mutation updates the cache immediately AND schedules the matching
 *    cell/row write back to the sheet (serialized to avoid out-of-order writes).
 * 3. A poller re-reads the spreadsheet on an interval and, if someone edited
 *    it in Google directly, reloads the cache and fires `onChange` so the
 *    server can broadcast a reload to every connected client.
 *
 * Environment (see backend/.env.example):
 *   SHEETS_SPREADSHEET_ID          -> the spreadsheet id from its URL
 *   GOOGLE_SERVICE_ACCOUNT_JSON    -> full service-account JSON (or set
 *   GOOGLE_APPLICATION_CREDENTIALS -> path to the JSON key file)
 *   SHEETS_POLL_MS                 -> external-change poll interval (default 30s)
 *
 * Drive behavior:
 *   - `STORAGE_DRIVER=sheets` (or setting SHEETS_SPREADSHEET_ID) enables this.
 *   - storage.js falls back to SQLite when credentials are missing.
 */

const { google } = require('googleapis');
const bcrypt = require('bcryptjs');

const SPREADSHEET_ID = process.env.SHEETS_SPREADSHEET_ID;
const GAS_URL = process.env.GAS_WEBAPP_URL;
const GAS_KEY = process.env.GAS_KEY || '';
const POLL_MS = Number(process.env.SHEETS_POLL_MS || 30000);

// Transport: 'gas' uses a Google Apps Script web app as the live store;
// 'sheets' uses the Google Sheets API directly with a service account.
const MODE = GAS_URL ? 'gas' : 'sheets';

async function gasRpc(action, extra = {}) {
  if (!GAS_URL) throw new Error('GAS_WEBAPP_URL is not set');
  // Apps Script /exec 302-redirects to a googleusercontent echo URL that only
  // handles GET (POST bodies are dropped / rejected with 405), so all calls go
  // out as GET with the payload JSON-encoded in a query parameter.
  const url = new URL(GAS_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('payload', JSON.stringify(extra));
  url.searchParams.set('key', GAS_KEY);
  const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.error || 'gas request failed');
  return data;
}

// Serialized write helpers that write a batch of rows starting at `startRow`
// (1-based) — used for seeding and settings. transport-agnostic.
async function bulkRows(tab, startRow, values) {
  if (MODE === 'gas') {
    for (let r = 0; r < values.length; r++) {
      await gasRpc('updateRowByIndex', { table: tab, rowIndex: startRow + r, values: values[r] });
    }
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A${startRow}:${lastCol(tab)}${startRow + values.length - 1}`,
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

// Sheet layouts: tab name -> column headers (index = column - 1)
const TABS = {
  Stores: ['id', 'store_name', 'created_at'],
  Laptops: ['id', 'brand_model', 'serial_number', 'current_store_id', 'status', 'updated_at'],
  TransferLogs: ['id', 'laptop_id', 'from_store_id', 'to_store_id', 'changed_at'],
  Users: ['id', 'username', 'password_hash', 'display_name', 'role', 'created_at'],
  Settings: ['key', 'value']
};

const VALID_STATUSES = ['In Stock', 'In Transit', 'Sold'];
const STORE_SEEDS = [
  'Store 1: Main Flagship', 'Store 2: North Hub', 'Store 3: South Branch',
  'Store 4: East Outlet', 'Store 5: West Showroom', 'Store 6: Downtown Express',
  'Store 7: Central Warehouse'
];
const LAPTOP_SEEDS = [
  ['Apple MacBook Pro 14', 'SN-001000', 'In Stock'],
  ['Apple MacBook Air M3', 'SN-001037', 'In Stock'],
  ['Dell XPS 15', 'SN-001074', 'In Transit'],
  ['Lenovo ThinkPad X1', 'SN-001111', 'Sold'],
  ['HP Spectre x360', 'SN-001148', 'In Stock'],
  ['Asus ZenBook 16', 'SN-001185', 'In Stock'],
  ['Microsoft Surface Laptop', 'SN-001222', 'In Transit']
];
const DEFAULT_SETTINGS = {
  appTitle: 'Laptop Inventory Tracker',
  appSubtitle: 'Real-time location tracking across 7 retail stores',
  filterByStore: 'Filter by Store',
  allStores: 'All Stores',
  statusLabel: 'Status',
  anyStatus: 'Any status',
  searchPlaceholder: 'Search by brand/model or serial number…',
  addInventoryButton: '+ Update Inventory',
  tableBrand: 'Brand / Model',
  tableSerial: 'Serial Number',
  tableStore: 'Current Store',
  tableStatus: 'Status',
  tableUpdated: 'Updated',
  tableChangeLocation: 'Change Location',
  tableActions: 'Actions',
  selectStore: 'Select store…',
  unassigned: 'Unassigned',
  viewOnly: 'View only',
  editButton: 'Edit',
  deleteButton: 'Delete',
  transferButton: 'Confirm Transfer',
  transferHistory: 'Transfer History',
  transferHistorySubtitle: 'Audit trail of every location change',
  addLaptopTitle: 'Add Laptop to Inventory',
  editLaptopTitle: 'Edit Laptop',
  noLaptops: 'No laptops match the current filters.'
};

// ---------------------------------------------------------------------------
// In-memory state (the "live" copy used by all sync reads)
// ---------------------------------------------------------------------------
let state = {
  stores: [],
  laptops: [],
  logs: [],
  users: [],
  settings: {}
};
// tab -> { id: sheetRowIndex }  (row indexes are 1-based, header is row 1)
let rowIndex = {};
// tab -> next free row (append cursor)
let nextRow = {};
let onChange = null;
let sheets = null;
let writeQueue = Promise.resolve();

// Serialized background writes keep writes ordered and don't block requests.
function schedule(fn) {
  writeQueue = writeQueue.then(fn).catch((e) => {
    console.error('[sheets] background write failed:', e.message);
  });
  return writeQueue;
}

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ---------------------------------------------------------------------------
// Auth + generic Sheets helpers
// ---------------------------------------------------------------------------
function buildAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (json) return new google.auth.JWT(JSON.parse(json).client_email, null, JSON.parse(json).private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  if (credsPath) {
    const creds = require(credsPath);
    return new google.auth.JWT(creds.client_email, null, creds.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
  }
  throw new Error('No Google credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.');
}

const col = (tab, name) => TABS[tab].indexOf(name) + 1; // 1-based column letter index
function colLetter(i) {
  let s = '';
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
const lastCol = (tab) => colLetter(TABS[tab].length);

async function readTab(tab) {
  let values;
  if (MODE === 'gas') {
    const d = await gasRpc('readTable', { table: tab });
    values = [d.table.headers, ...d.table.rows];
  } else {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tab}!A1:${lastCol(tab)}100000`
    });
    values = res.data.values || [];
  }
  return values.filter((row) => row.some((c) => c != null && c !== ''));
}

async function writeRow(tab, row, values) {
  if (MODE === 'gas') {
    await gasRpc('updateRowByIndex', { table: tab, rowIndex: row, values });
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A${row}:${lastCol(tab)}${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  });
}

async function appendRow(tab, values) {
  if (MODE === 'gas') {
    await gasRpc('appendRow', { table: tab, values });
    return;
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  });
}

async function clearRow(tab, row) {
  if (MODE === 'gas') {
    await gasRpc('clearRowByIndex', { table: tab, rowIndex: row });
    return;
  }
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A${row}:${lastCol(tab)}${row}`
  });
}

async function ensureSheetsExist() {
  if (MODE === 'gas') {
    // The Apps Script auto-creates tabs + headers on every call.
    for (const tab of Object.keys(TABS)) {
      const rows = await readTab(tab);
      if (rows.length === 0) await writeRow(tab, 1, TABS[tab]);
    }
    return;
  }
  const info = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = new Set((info.data.sheets || []).map((s) => s.properties.title));
  const missing = Object.keys(TABS).filter((t) => !existing.has(t));
  if (missing.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: missing.map((t) => ({ addSheet: { properties: { title: t } } })) }
    });
  }
  for (const tab of Object.keys(TABS)) {
    const rows = await readTab(tab);
    if (rows.length === 0) await writeRow(tab, 1, TABS[tab]); // header row
  }
}

// ---------------------------------------------------------------------------
// Loading + indexing
// ---------------------------------------------------------------------------
function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseRows(tab) {
  return readTab(tab).then((values) => {
    const headers = TABS[tab];
    return values.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        const raw = row[i] == null ? null : String(row[i]).trim();
        obj[h] = h === 'id' || h.endsWith('_id') ? toNumber(raw) : raw;
      });
      return obj;
    });
  });
}

async function refreshFromSheets() {
  if (!sheets) return null;
  const [stores, laptops, logs, users, settingValues] = await Promise.all([
    parseRows('Stores'),
    parseRows('Laptops'),
    parseRows('TransferLogs'),
    parseRows('Users'),
    readTab('Settings')
  ]);
  const settings = { ...DEFAULT_SETTINGS };
  settingValues.slice(1).forEach(([k, v]) => { if (k) settings[k] = String(v ?? ''); });
  return { stores, laptops, logs, users, settings };
}

async function fullReload() {
  const s = await refreshFromSheets();
  if (!s) return;
  state = s;
  rebuildIndexes();
}

function rebuildIndexes() {
  rowIndex = {};
  nextRow = {};
  for (const tab of Object.keys(TABS)) {
    rowIndex[tab] = {};
    nextRow[tab] = 2; // data starts at row 2
  }
  const map = (tab, rows) => {
    rows.forEach((r, i) => { rowIndex[tab][r.id] = i + 2; nextRow[tab] = i + 3; });
  };
  map('Stores', state.stores);
  map('Laptops', state.laptops);
  map('TransferLogs', state.logs);
  map('Users', state.users);
}

// ---------------------------------------------------------------------------
// Storage API (synchronous, backed by the in-memory cache)
// ---------------------------------------------------------------------------
function getStores() {
  return state.stores.map((s) => ({ id: s.id, store_name: s.store_name }));
}

function getStore(id) {
  const s = state.stores.find((x) => x.id === id);
  return s ? { id: s.id, store_name: s.store_name } : undefined;
}

const storeName = (id) => (getStore(id) || {}).store_name;

function getLaptops(filters = {}) {
  return state.laptops
    .map((l) => ({
      id: l.id,
      brand_model: l.brand_model,
      serial_number: l.serial_number,
      current_store_id: l.current_store_id,
      status: l.status,
      updated_at: l.updated_at,
      current_store_name: storeName(l.current_store_id)
    }))
    .filter((l) => {
      if (filters.status && l.status !== filters.status) return false;
      if (filters.storeId && l.current_store_id !== Number(filters.storeId)) return false;
      if (filters.search) {
        const q = String(filters.search).toLowerCase();
        if (!(String(l.brand_model).toLowerCase().includes(q) || String(l.serial_number).toLowerCase().includes(q))) return false;
      }
      return true;
    })
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

function getLaptop(id) {
  const l = state.laptops.find((x) => x.id === id);
  if (!l) return undefined;
  return {
    id: l.id,
    brand_model: l.brand_model,
    serial_number: l.serial_number,
    current_store_id: l.current_store_id,
    status: l.status,
    updated_at: l.updated_at,
    current_store_name: storeName(l.current_store_id)
  };
}

function transferLaptop(laptopId, toStoreId) {
  const laptop = state.laptops.find((x) => x.id === laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  const to = getStore(toStoreId);
  if (!to) return { error: 'Destination store not found' };
  const from = getStore(laptop.current_store_id);
  const fromId = laptop.current_store_id ?? null;

  // update cache
  laptop.current_store_id = toStoreId;
  laptop.updated_at = now();

  // audit log entry
  const logId = nextId('TransferLogs');
  state.logs.unshift({ id: logId, laptop_id: laptopId, from_store_id: fromId, to_store_id: toStoreId, changed_at: now() });
  rowIndex.TransferLogs[logId] = nextRow.TransferLogs;
  nextRow.TransferLogs++;

  // persist to the sheet
  const row = rowIndex.Laptops[laptopId];
  schedule(() => writeRow('Laptops', row, [laptop.id, laptop.brand_model, laptop.serial_number, laptop.current_store_id, laptop.status, laptop.updated_at]));
  const logRow = [logId, laptopId, fromId, toStoreId, now()];
  schedule(() => appendRow('TransferLogs', logRow));

  return { ok: true, laptop: getLaptop(laptopId), from, to };
}

function nextId(tab) {
  const rows = tab === 'Stores' ? state.stores : tab === 'Laptops' ? state.laptops : tab === 'TransferLogs' ? state.logs : state.users;
  return rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
}

function getTransferLogs(limit = 100) {
  return state.logs
    .map((l) => ({
      id: l.id,
      laptop_id: l.laptop_id,
      from_store_id: l.from_store_id,
      to_store_id: l.to_store_id,
      changed_at: l.changed_at,
      brand_model: (state.laptops.find((x) => x.id === l.laptop_id) || {}).brand_model,
      serial_number: (state.laptops.find((x) => x.id === l.laptop_id) || {}).serial_number,
      from_store_name: storeName(l.from_store_id),
      to_store_name: storeName(l.to_store_id)
    }))
    .sort((a, b) => (b.changed_at || '').localeCompare(a.changed_at || ''))
    .slice(0, limit);
}

function createLaptop(data) {
  const brand = (data.brand_model || '').trim();
  const serial = (data.serial_number || '').trim();
  const status = data.status || 'In Stock';
  const storeId = data.current_store_id ? Number(data.current_store_id) : null;

  if (!brand) return { error: 'brand_model is required' };
  if (!serial) return { error: 'serial_number is required' };
  if (!VALID_STATUSES.includes(status)) return { error: 'Invalid status' };
  if (storeId != null && !getStore(storeId)) return { error: 'Store not found' };
  if (state.laptops.some((l) => l.serial_number === serial)) return { error: `Serial ${serial} already exists` };

  const id = nextId('Laptops');
  const laptop = { id, brand_model: brand, serial_number: serial, current_store_id: storeId, status, updated_at: now() };
  state.laptops.unshift(laptop);
  rowIndex.Laptops[id] = nextRow.Laptops;
  nextRow.Laptops++;

  schedule(() => appendRow('Laptops', [id, brand, serial, storeId, status, laptop.updated_at]));
  return { laptop: getLaptop(id) };
}

function updateLaptop(laptopId, data) {
  const laptop = state.laptops.find((x) => x.id === laptopId);
  if (!laptop) return { error: 'Laptop not found' };

  const brand = data.brand_model != null ? (data.brand_model || '').trim() : laptop.brand_model;
  const status = data.status != null ? data.status : laptop.status;
  const storeId = data.current_store_id != null ? Number(data.current_store_id) : laptop.current_store_id;

  if (!brand) return { error: 'brand_model cannot be empty' };
  if (!VALID_STATUSES.includes(status)) return { error: 'Invalid status' };
  if (storeId != null && !getStore(storeId)) return { error: 'Store not found' };

  laptop.brand_model = brand;
  laptop.status = status;
  laptop.current_store_id = storeId;
  laptop.updated_at = now();

  const row = rowIndex.Laptops[laptopId];
  schedule(() => writeRow('Laptops', row, [laptop.id, brand, serialNo(laptop), storeId, status, laptop.updated_at]));
  return { laptop: getLaptop(laptopId) };
}

const serialNo = (l) => l.serial_number;

function deleteLaptop(laptopId) {
  const laptop = state.laptops.find((x) => x.id === laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  const row = rowIndex.Laptops[laptopId];
  state.laptops = state.laptops.filter((x) => x.id !== laptopId);
  delete rowIndex.Laptops[laptopId];
  // Note: transfer history is kept (it is an audit trail) even if the laptop is removed.
  schedule(() => clearRow('Laptops', row));
  return { ok: true, id: laptopId };
}

// --- Stores -----------------------------------------------------------------
function addStore(storeName) {
  const name = (storeName || '').trim();
  if (!name) return { error: 'store_name is required' };
  if (state.stores.some((s) => s.store_name === name)) return { error: 'A store with that name already exists' };
  const id = nextId('Stores');
  state.stores.push({ id, store_name: name, created_at: now() });
  rowIndex.Stores[id] = nextRow.Stores;
  nextRow.Stores++;
  schedule(() => appendRow('Stores', [id, name, now()]));
  return { store: getStore(id) };
}

function renameStore(storeId, storeName) {
  const store = state.stores.find((x) => x.id === storeId);
  if (!store) return { error: 'Store not found' };
  const name = (storeName || '').trim();
  if (!name) return { error: 'store_name cannot be empty' };
  if (state.stores.some((s) => s.store_name === name && s.id !== storeId)) return { error: 'A store with that name already exists' };
  store.store_name = name;
  const row = rowIndex.Stores[storeId];
  schedule(() => writeRow('Stores', row, [store.id, store.store_name, store.created_at]));
  return { store: getStore(storeId) };
}

function deleteStore(storeId) {
  const store = state.stores.find((x) => x.id === storeId);
  if (!store) return { error: 'Store not found' };
  if (state.stores.length <= 1) return { error: 'Cannot remove the last store' };
  const assigned = state.laptops.filter((l) => l.current_store_id === storeId).length;
  if (assigned > 0) return { error: `Cannot remove: ${assigned} laptop(s) still assigned. Move them first.` };
  const logs = state.logs.some((l) => l.from_store_id === storeId || l.to_store_id === storeId);
  if (logs) return { error: 'Cannot remove: store appears in transfer history.' };
  const row = rowIndex.Stores[storeId];
  state.stores = state.stores.filter((x) => x.id !== storeId);
  delete rowIndex.Stores[storeId];
  schedule(() => clearRow('Stores', row));
  return { ok: true, id: storeId };
}

// --- Settings ---------------------------------------------------------------
function getSettings() {
  return { ...state.settings };
}

function setSettings(patch = {}) {
  Object.entries(patch).forEach(([k, v]) => { state.settings[k] = String(v ?? ''); });
  const rows = [TABS.Settings, ...Object.entries(state.settings)];
  schedule(() => bulkRows('Settings', 1, rows));
  return getSettings();
}

// --- Users ------------------------------------------------------------------
function publicUser(u) {
  return u ? { id: u.id, username: u.username, display_name: u.display_name, role: u.role, created_at: u.created_at } : null;
}

function createUser({ username, password, display_name, role = 'staff' }) {
  const name = (username || '').trim().toLowerCase();
  const display = (display_name || '').trim();
  if (!name) return { error: 'username is required' };
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) return { error: 'Username must be 3-32 chars: letters, numbers, . _ -' };
  if (!password || String(password).length < 6) return { error: 'Password must be at least 6 characters' };
  if (!['admin', 'manager', 'staff'].includes(role)) return { error: 'Invalid role' };
  if (state.users.some((u) => u.username === name)) return { error: 'Username already taken' };

  const id = nextId('Users');
  const user = { id, username: name, password_hash: bcrypt.hashSync(String(password), 10), display_name: display || name, role, created_at: now() };
  state.users.push(user);
  rowIndex.Users[id] = nextRow.Users;
  nextRow.Users++;
  schedule(() => appendRow('Users', [id, name, user.password_hash, display || name, role, user.created_at]));
  return { user: publicUser(user) };
}

function getUserById(id) {
  return state.users.find((u) => u.id === id);
}

function getUserByUsername(username) {
  const n = (username || '').trim().toLowerCase();
  return state.users.find((u) => u.username === n);
}

function verifyPassword(user, password) {
  return user && bcrypt.compareSync(String(password || ''), user.password_hash);
}

function getUsers() {
  return state.users.map(publicUser);
}

function updateUser(userId, { username, password, display_name, role } = {}) {
  const user = state.users.find((u) => u.id === userId);
  if (!user) return { error: 'User not found' };

  const name = username != null ? String(username).trim().toLowerCase() : user.username;
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) return { error: 'Username must be 3-32 chars: letters, numbers, . _ -' };
  if (role != null && !['admin', 'manager', 'staff'].includes(role)) return { error: 'Invalid role' };
  if (password != null && String(password) !== '' && String(password).length < 6) return { error: 'Password must be at least 6 characters' };
  if (state.users.some((u) => u.username === name && u.id !== userId)) return { error: 'Username already taken' };

  const display = display_name != null ? String(display_name).trim() : user.display_name;
  const finalRole = role != null ? role : user.role;
  const hash = password && String(password) !== '' ? bcrypt.hashSync(String(password), 10) : user.password_hash;

  user.username = name;
  user.display_name = display || name;
  user.role = finalRole;
  user.password_hash = hash;

  const row = rowIndex.Users[userId];
  schedule(() => writeRow('Users', row, [user.id, name, hash, display || name, finalRole, user.created_at]));
  return { user: publicUser(user) };
}

function deleteUser(userId) {
  const user = state.users.find((u) => u.id === userId);
  if (!user) return { error: 'User not found' };
  const row = rowIndex.Users[userId];
  state.users = state.users.filter((u) => u.id !== userId);
  delete rowIndex.Users[userId];
  schedule(() => clearRow('Users', row));
  return { ok: true, id: userId };
}

// ---------------------------------------------------------------------------
// Seeding + init + polling
// ---------------------------------------------------------------------------
async function seedIfEmpty() {
  const storeValues = await readTab('Stores');
  if (storeValues.length === 1) {
    const rows = STORE_SEEDS.map((n, i) => [i + 1, n, now()]);
    await bulkRows('Stores', 2, rows);
  }
  const settingValues = await readTab('Settings');
  if (settingValues.length === 1) {
    const rows = Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, v]);
    await bulkRows('Settings', 2, rows);
  }
  const laptopValues = await readTab('Laptops');
  if (laptopValues.length === 1) {
    const rows = LAPTOP_SEEDS.map(([brand, serial, status], i) => [i + 1, brand, serial, (i % 7) + 1, status, now()]);
    await bulkRows('Laptops', 2, rows);
  }
  const userValues = await readTab('Users');
  if (userValues.length === 1) {
    await bulkRows('Users', 2, [[1, 'admin', bcrypt.hashSync('admin123', 10), 'System Administrator', 'admin', now()]]);
  }
}

async function init() {
  if (MODE === 'gas') {
    await ensureSheetsExist();
    await seedIfEmpty();
    await fullReload();
    console.log('[gas] Apps Script storage ready (' + GAS_URL + ')');
    return;
  }
  if (!SPREADSHEET_ID) throw new Error('SHEETS_SPREADSHEET_ID is not set');
  // allow a fake API to be injected (unit tests); otherwise build the real client
  if (!sheets) sheets = google.sheets({ version: 'v4', auth: buildAuth() });
  await ensureSheetsExist();
  await seedIfEmpty();
  await fullReload();
  console.log('[sheets] Google Sheets storage ready (spreadsheet ' + SPREADSHEET_ID + ')');
}

function startPolling(cb) {
  onChange = cb;
  const timer = setInterval(async () => {
    try {
      const fresh = await refreshFromSheets();
      if (fresh) {
        const before = JSON.stringify({ ...state });
        state = fresh;
        rebuildIndexes();
        if (JSON.stringify({ ...state }) !== before) {
          console.log('[sheets] external change detected, reloading cache');
          if (onChange) onChange();
        }
      }
    } catch (e) {
      console.error('[sheets] poll error:', e.message);
    }
  }, POLL_MS);
  if (timer.unref) timer.unref();
}

module.exports = {
  driver: MODE === 'gas' ? 'gas' : 'sheets',
  init,
  startPolling,
  // Test-only hook to inject a fake Sheets API client.
  _inject: (api) => { sheets = api || null; },
  getStores,
  getStore,
  getLaptops,
  getLaptop,
  transferLaptop,
  getTransferLogs,
  createLaptop,
  updateLaptop,
  deleteLaptop,
  addStore,
  renameStore,
  deleteStore,
  getSettings,
  setSettings,
  createUser,
  getUserById,
  getUserByUsername,
  verifyPassword,
  getUsers,
  updateUser,
  deleteUser
};