/**
 * sheets.js
 * Google storage adapter — Google Apps Script (GAS) or the Sheets API —
 * lets a Google Sheet act as the live database.
 *
 * How it works
 * ------------
 * 1. On startup the whole spreadsheet is read into an in-memory cache (fast
 *    synchronous reads, so the Express routes stay sync like the SQLite path).
 * 2. Every mutation updates the cache immediately AND schedules the matching
 *    row write back to the sheet (serialized to avoid out-of-order writes).
 * 3. A poller re-reads the spreadsheet on an interval and, if someone edited
 *    it in Google directly, reloads the cache and fires `onChange` so the
 *    server can broadcast a reload to every connected client.
 *
 * Environment (see backend/.env.example):
 *   GAS_WEBAPP_URL  -> Apps Script web-app URL (GAS mode; preferred)
 *   GAS_KEY         -> the CONFIG.key inside that Apps Script
 *   SHEETS_SPREADSHEET_ID -> spreadsheet id (Sheets-API mode)
 *   GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS
 *   SHEETS_POLL_MS  -> external-change poll interval (default 30s)
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

// Sheet layouts: tab name -> column headers (index = column - 1). Must match
// the Apps Script CONFIG.tables exactly.
const TABS = {
  Stores: ['id', 'store_name', 'created_at'],
  Brands: ['id', 'name', 'serial_prefix', 'created_at'],
  Laptops: ['id', 'brand', 'brand_model', 'processor_type', 'generation', 'storage_type',
    'purchased_from', 'graphics', 'graphics_type', 'graphics_model', 'purchase_rate',
    'extra_charges', 'serial_number', 'current_store_id', 'status', 'created_at', 'updated_at'],
  TransferLogs: ['id', 'laptop_id', 'from_store_id', 'to_store_id', 'changed_at'],
  Sales: ['id', 'laptop_id', 'serial_number', 'brand_model', 'store_id', 'sale_price',
    'cost_price', 'profit', 'sold_at', 'sold_by'],
  Repairs: ['id', 'laptop_id', 'serial_number', 'brand_model', 'issue', 'vendor', 'cost',
    'status', 'notes', 'created_by', 'created_at', 'updated_at'],
  Users: ['id', 'username', 'password_hash', 'display_name', 'role', 'created_at'],
  Settings: ['key', 'value'],
  LoginLogs: ['id', 'user_id', 'username', 'ip', 'user_agent', 'logged_in']
};

const ROLES = ['superadmin', 'admin', 'manager', 'staff'];
const VALID_STATUSES = ['In Stock', 'In Transit', 'Sold'];

const STORE_SEEDS = [
  'Store 1: Main Flagship', 'Store 2: North Hub', 'Store 3: South Branch',
  'Store 4: East Outlet', 'Store 5: West Showroom', 'Store 6: Downtown Express',
  'Store 7: Central Warehouse'
];
const BRAND_SEEDS = [
  ['HP', 'HP010'],
  ['Asus', 'AS010'],
  ['Dell', 'DL010']
];
// [brand, model, processor, generation, storage, vendor, graphics, gfx_type, gfx_model, prefix]
const LAPTOP_SEEDS = [
  ['Apple', 'MacBook Pro 14', 'M3 Pro', '14"', 'SSD', 'Apple Store', 'yes', 'integrated', 'Apple GPU', 'HP010'],
  ['Apple', 'MacBook Air M3', 'M3', '13"', 'SSD', 'Apple Store', 'yes', 'integrated', 'Apple GPU', 'AS010'],
  ['Dell', 'XPS 15', 'Core i7-13700H', '13th', 'SSD', 'Dell Direct', 'yes', 'dedicated', 'RTX 4060', 'DL010'],
  ['Lenovo', 'ThinkPad X1', 'Core i5-1345U', '13th', 'SSD', 'Lenovo Direct', 'yes', 'integrated', 'Intel Iris', 'HP010'],
  ['HP', 'Spectre x360', 'Core i7-1255U', '12th', 'SSD', 'HP Online', 'yes', 'integrated', 'Intel Iris Xe', 'AS010'],
  ['Asus', 'ZenBook 16', 'Ryzen 7 7840H', 'AMD', 'SSD', 'Asus Store', 'yes', 'dedicated', 'RTX 3050', 'DL010'],
  ['Microsoft', 'Surface Laptop', 'Core i5-1235U', '12th', 'SSD', 'Microsoft Store', 'no', '', '', 'HP010']
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
  noLaptops: 'No laptops match the current filters.',
  quantityLabel: 'Quantity',
  salesTitle: 'Sales',
  salesSubtitle: 'Track sales, profit and totals'
};

// ---------------------------------------------------------------------------
// In-memory state (the "live" copy used by all sync reads)
// ---------------------------------------------------------------------------
let state = {
  stores: [],
  brands: [],
  laptops: [],
  logs: [],
  sales: [],
  repairs: [],
  users: [],
  settings: {},
  logins: []
};
// tab -> { id: sheetRowIndex } (row indexes are 1-based, header is row 1)
let rowIndex = {};
// tab -> next free row (append cursor)
let nextRow = {};
let onChange = null;
let sheets = null;
let writeQueue = Promise.resolve();

function schedule(fn) {
  writeQueue = writeQueue.then(fn).catch((e) => {
    console.error('[sheets] background write failed:', e.message);
  });
  return writeQueue;
}

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ---------------------------------------------------------------------------
// Auth + generic sheet helpers
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

const col = (tab, name) => TABS[tab].indexOf(name) + 1;
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
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${tab}!A1:${lastCol(tab)}100000` });
    values = res.data.values || [];
  }
  return values.filter((row) => row.some((c) => c != null && c !== ''));
}

async function writeRow(tab, row, values) {
  if (MODE === 'gas') { await gasRpc('updateRowByIndex', { table: tab, rowIndex: row, values }); return; }
  await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${tab}!A${row}:${lastCol(tab)}${row}`, valueInputOption: 'RAW', requestBody: { values: [values] } });
}

async function appendRow(tab, values) {
  if (MODE === 'gas') { await gasRpc('appendRow', { table: tab, values }); return; }
  await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${tab}!A1`, valueInputOption: 'RAW', requestBody: { values: [values] } });
}

async function clearRow(tab, row) {
  if (MODE === 'gas') { await gasRpc('clearRowByIndex', { table: tab, rowIndex: row }); return; }
  await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `${tab}!A${row}:${lastCol(tab)}${row}` });
}

async function bulkRows(tab, startRow, values) {
  if (MODE === 'gas') {
    // Rewrite the whole table in ONE call instead of one call per row
    // (fast: seeding + settings saves drop from ~35 round-trips to 1).
    const withHeader = startRow === 1;
    await gasRpc('replaceTable', {
      table: tab,
      headers: withHeader ? values[0] : TABS[tab],
      rows: withHeader ? values.slice(1) : values
    });
    return;
  }
  await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${tab}!A${startRow}:${lastCol(tab)}${startRow + values.length - 1}`, valueInputOption: 'RAW', requestBody: { values } });
}

async function ensureSheetsExist() {
  if (MODE === 'gas') {
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
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: missing.map((t) => ({ addSheet: { properties: { title: t } } })) } });
  }
  for (const tab of Object.keys(TABS)) {
    const rows = await readTab(tab);
    if (rows.length === 0) await writeRow(tab, 1, TABS[tab]);
  }
}

// ---------------------------------------------------------------------------
// Loading + indexing
// ---------------------------------------------------------------------------
function toNumber(v) {
  if (v == null || v === '') return null;
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
        obj[h] = /(^id$|_id$|_rate$|_charges$|_price$|cost_price$|^profit$)/.test(h) ? toNumber(raw) : raw;
      });
      return obj;
    });
  });
}

async function refreshFromSheets() {
  if (!sheets && MODE === 'sheets') return null;
  const [stores, brands, laptops, logs, sales, repairs, users, settingValues, logins] = await Promise.all([
    parseRows('Stores'),
    parseRows('Brands'),
    parseRows('Laptops'),
    parseRows('TransferLogs'),
    parseRows('Sales'),
    parseRows('Repairs'),
    parseRows('Users'),
    readTab('Settings'),
    parseRows('LoginLogs')
  ]);
  const settings = { ...DEFAULT_SETTINGS };
  settingValues.slice(1).forEach(([k, v]) => { if (k) settings[k] = String(v ?? ''); });
  return { stores, brands, laptops, logs, sales, repairs, users, settings, logins };
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
  for (const tab of Object.keys(TABS)) { rowIndex[tab] = {}; nextRow[tab] = 2; }
  const map = (tab, rows) => {
    rows.forEach((r, i) => { if (r && r.id != null) { rowIndex[tab][r.id] = i + 2; nextRow[tab] = i + 3; } });
  };
  map('Stores', state.stores);
  map('Brands', state.brands);
  map('Laptops', state.laptops);
  map('TransferLogs', state.logs);
  map('Sales', state.sales);
  map('Repairs', state.repairs);
  map('Users', state.users);
  map('LoginLogs', state.logins);
}

function nextId(tab) {
  const rows = tab === 'Stores' ? state.stores : tab === 'Brands' ? state.brands : tab === 'Laptops' ? state.laptops : tab === 'TransferLogs' ? state.logs : tab === 'Sales' ? state.sales : tab === 'Repairs' ? state.repairs : state.users;
  return rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
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

// --- Brands -----------------------------------------------------------------
function getBrands() {
  return state.brands.map((b) => ({ id: b.id, name: b.name, serial_prefix: b.serial_prefix }));
}

function getBrand(id) {
  const b = state.brands.find((x) => x.id === id);
  return b ? { id: b.id, name: b.name, serial_prefix: b.serial_prefix } : undefined;
}

function addBrand({ name, serial_prefix }) {
  const brandName = (name || '').trim();
  const prefix = (serial_prefix || '').trim();
  if (!brandName) return { error: 'name is required' };
  if (!prefix) return { error: 'serial_prefix is required' };
  if (state.brands.some((b) => b.name === brandName)) return { error: 'A brand with that name already exists' };
  const id = nextId('Brands');
  state.brands.push({ id, name: brandName, serial_prefix: prefix, created_at: now() });
  rowIndex.Brands[id] = nextRow.Brands;
  nextRow.Brands++;
  schedule(() => appendRow('Brands', [id, brandName, prefix, now()]));
  return { brand: getBrand(id) };
}

function updateBrand(id, { name, serial_prefix }) {
  const brand = state.brands.find((x) => x.id === id);
  if (!brand) return { error: 'Brand not found' };
  const brandName = name != null ? (name || '').trim() : brand.name;
  const prefix = serial_prefix != null ? (serial_prefix || '').trim() : brand.serial_prefix;
  if (!brandName) return { error: 'name cannot be empty' };
  if (!prefix) return { error: 'serial_prefix cannot be empty' };
  if (state.brands.some((b) => b.name === brandName && b.id !== id)) return { error: 'A brand with that name already exists' };
  brand.name = brandName;
  brand.serial_prefix = prefix;
  schedule(() => writeRow('Brands', rowIndex.Brands[id], [brand.id, brandName, prefix, brand.created_at]));
  return { brand: getBrand(id) };
}

function deleteBrand(id) {
  const brand = getBrand(id);
  if (!brand) return { error: 'Brand not found' };
  const used = state.laptops.filter((l) => l.brand === brand.name).length;
  if (used > 0) return { error: 'Cannot remove: laptops exist with this brand. Move/delete them first.' };
  state.brands = state.brands.filter((x) => x.id !== id);
  delete rowIndex.Brands[id];
  schedule(() => clearRow('Brands', rowIndex.Brands[id] || nextRow.Brands));
  return { ok: true, id };
}

function generateSerial(prefix) {
  const prefixUpper = (prefix || '').toUpperCase();
  let max = 0;
  state.laptops.forEach((l) => {
    if (l.serial_number && l.serial_number.startsWith(prefixUpper)) {
      const n = parseInt(l.serial_number.slice(prefixUpper.length), 10);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  });
  return prefixUpper + String(max + 1).padStart(3, '0');
}

// --- Laptops ----------------------------------------------------------------
function laptopRow(l) {
  if (!l) return undefined;
  return {
    id: l.id,
    brand: l.brand,
    brand_model: l.brand_model,
    processor_type: l.processor_type,
    generation: l.generation,
    storage_type: l.storage_type,
    purchased_from: l.purchased_from,
    graphics: l.graphics,
    graphics_type: l.graphics_type,
    graphics_model: l.graphics_model,
    purchase_rate: l.purchase_rate,
    extra_charges: l.extra_charges,
    serial_number: l.serial_number,
    current_store_id: l.current_store_id,
    status: l.status,
    created_at: l.created_at,
    updated_at: l.updated_at,
    current_store_name: storeName(l.current_store_id)
  };
}

function getLaptops(filters = {}) {
  return state.laptops
    .map(laptopRow)
    .filter((l) => {
      if (filters.status && l.status !== filters.status) return false;
      if (filters.storeId && l.current_store_id !== Number(filters.storeId)) return false;
      if (filters.brand && l.brand !== filters.brand) return false;
      if (filters.search) {
        const q = String(filters.search).toLowerCase();
        if (!(String(l.brand).toLowerCase().includes(q) || String(l.brand_model).toLowerCase().includes(q) || String(l.serial_number).toLowerCase().includes(q))) return false;
      }
      return true;
    })
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

function getLaptop(id) {
  return laptopRow(state.laptops.find((x) => x.id === id));
}

function normalizeLaptop(data, partial = {}) {
  const brand = data.brand != null ? String(data.brand).trim() : partial.brand;
  return {
    brand: brand || '',
    brand_model: (data.brand_model != null ? String(data.brand_model).trim() : partial.brand_model) || (brand || '') + (data.model || ''),
    processor_type: data.processor_type != null ? String(data.processor_type).trim() : partial.processor_type,
    generation: data.generation != null ? String(data.generation).trim() : partial.generation,
    storage_type: data.storage_type != null ? String(data.storage_type).trim() : partial.storage_type,
    purchased_from: data.purchased_from != null ? String(data.purchased_from).trim() : partial.purchased_from,
    graphics: data.graphics != null ? String(data.graphics).trim() : partial.graphics,
    graphics_type: data.graphics_type != null ? String(data.graphics_type).trim() : partial.graphics_type,
    graphics_model: data.graphics_model != null ? String(data.graphics_model).trim() : partial.graphics_model,
    purchase_rate: data.purchase_rate != null && data.purchase_rate !== '' ? Number(data.purchase_rate) : (partial.purchase_rate ?? null),
    extra_charges: data.extra_charges != null && data.extra_charges !== '' ? Number(data.extra_charges) : (partial.extra_charges ?? null),
    status: data.status || partial.status || 'In Stock',
    current_store_id: data.current_store_id != null && data.current_store_id !== '' ? Number(data.current_store_id) : (partial.current_store_id ?? null)
  };
}

const laptopToRow = (l) => [
  l.id, l.brand, l.brand_model, l.processor_type, l.generation, l.storage_type,
  l.purchased_from, l.graphics, l.graphics_type, l.graphics_model, l.purchase_rate,
  l.extra_charges, l.serial_number, l.current_store_id, l.status, l.created_at, l.updated_at
];

function createLaptop(data) {
  const serial = (data.serial_number || '').trim();
  const l = normalizeLaptop(data);
  if (!l.brand) return { error: 'brand is required' };
  if (!l.brand_model) return { error: 'brand_model is required' };
  if (!VALID_STATUSES.includes(l.status)) return { error: 'Invalid status' };
  if (l.current_store_id != null && !getStore(l.current_store_id)) return { error: 'Store not found' };
  if (!serial) return { error: 'serial_number is required' };
  if (state.laptops.some((x) => x.serial_number === serial)) return { error: `Serial ${serial} already exists` };

  const id = nextId('Laptops');
  const laptop = { ...l, id, serial_number: serial, created_at: now(), updated_at: now() };
  state.laptops.unshift(laptop);
  rowIndex.Laptops[id] = nextRow.Laptops;
  nextRow.Laptops++;
  schedule(() => appendRow('Laptops', laptopToRow(laptop)));
  return { laptop: getLaptop(id) };
}

function createLaptopsBulk(data, quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 1000) return { error: 'quantity must be an integer between 1 and 1000' };
  const brandRow = getBrands().find((b) => b.name.toLowerCase() === String(data.brand || '').trim().toLowerCase());
  const prefix = (data.serial_prefix || (brandRow && brandRow.serial_prefix) || '').trim();
  if (!prefix) return { error: 'Could not determine serial prefix. Add this brand first or provide a prefix.' };

  const probe = normalizeLaptop(data);
  if (!probe.brand) return { error: 'brand is required' };
  if (!probe.brand_model) return { error: 'brand_model is required' };

  const laptops = [];
  let lastError = null;
  for (let i = 0; i < qty; i++) {
    const serial = generateSerial(prefix);
    const r = createLaptop({ ...data, serial_number: serial });
    if (r.error) { lastError = r.error; break; }
    laptops.push(r.laptop);
  }
  if (lastError) return { error: lastError, created: laptops.length };
  return { laptops };
}

function updateLaptop(laptopId, data) {
  const laptop = state.laptops.find((x) => x.id === laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  const l = normalizeLaptop(data, laptop);
  if (!l.brand) return { error: 'brand is required' };
  if (!l.brand_model) return { error: 'brand_model is required' };
  if (!VALID_STATUSES.includes(l.status)) return { error: 'Invalid status' };
  if (l.current_store_id != null && !getStore(l.current_store_id)) return { error: 'Store not found' };

  Object.assign(laptop, l, { updated_at: now() });
  schedule(() => writeRow('Laptops', rowIndex.Laptops[laptopId], laptopToRow(laptop)));
  return { laptop: getLaptop(laptopId) };
}

function deleteLaptop(laptopId) {
  const laptop = state.laptops.find((x) => x.id === laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  const logRow = rowIndex.Laptops[laptopId];
  state.laptops = state.laptops.filter((x) => x.id !== laptopId);
  state.sales = state.sales.filter((s) => s.laptop_id !== laptopId);
  delete rowIndex.Laptops[laptopId];
  schedule(() => clearRow('Laptops', logRow));
  return { ok: true, id: laptopId };
}

function transferLaptop(laptopId, toStoreId) {
  const laptop = state.laptops.find((x) => x.id === laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  const to = getStore(toStoreId);
  if (!to) return { error: 'Destination store not found' };
  const from = getStore(laptop.current_store_id);
  const fromId = laptop.current_store_id ?? null;

  laptop.current_store_id = toStoreId;
  laptop.updated_at = now();

  const logId = nextId('TransferLogs');
  state.logs.unshift({ id: logId, laptop_id: laptopId, from_store_id: fromId, to_store_id: toStoreId, changed_at: now() });
  rowIndex.TransferLogs[logId] = nextRow.TransferLogs;
  nextRow.TransferLogs++;

  schedule(() => writeRow('Laptops', rowIndex.Laptops[laptopId], laptopToRow(laptop)));
  schedule(() => appendRow('TransferLogs', [logId, laptopId, fromId, toStoreId, now()]));
  return { ok: true, laptop: getLaptop(laptopId), from, to };
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

// --- Sales ------------------------------------------------------------------
function saleRow(s) {
  if (!s) return undefined;
  return {
    id: s.id,
    laptop_id: s.laptop_id,
    serial_number: s.serial_number,
    brand_model: s.brand_model,
    store_id: s.store_id,
    store_name: storeName(s.store_id),
    sale_price: s.sale_price,
    cost_price: s.cost_price,
    profit: s.profit,
    sold_at: s.sold_at,
    sold_by: s.sold_by
  };
}

function sellLaptop(laptopId, salePrice, soldBy) {
  const laptop = getLaptop(laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  if (laptop.status === 'Sold') return { error: 'Laptop is already sold' };
  const price = Number(salePrice);
  if (!Number.isFinite(price) || price < 0) return { error: 'sale_price is required' };
  const cost = (laptop.purchase_rate || 0) + (laptop.extra_charges || 0);
  const profit = price - cost;

  const id = nextId('Sales');
  state.sales.unshift({ id, laptop_id: laptopId, serial_number: laptop.serial_number, brand_model: laptop.brand_model, store_id: laptop.current_store_id, sale_price: price, cost_price: cost, profit, sold_at: now(), sold_by: soldBy || null });
  rowIndex.Sales[id] = nextRow.Sales;
  nextRow.Sales++;

  updateLaptop(laptopId, { status: 'Sold' });
  schedule(() => appendRow('Sales', [id, laptopId, laptop.serial_number, laptop.brand_model, laptop.current_store_id, price, cost, profit, now(), soldBy || null]));
  return { sale: saleRow(state.sales.find((s) => s.id === id)) };
}

function getSales() {
  return state.sales.map(saleRow).sort((a, b) => (b.sold_at || '').localeCompare(a.sold_at || ''));
}

function getSalesSummary() {
  return state.sales.reduce(
    (acc, s) => ({ count: acc.count + 1, total_sales: acc.total_sales + (s.sale_price || 0), total_profit: acc.total_profit + (s.profit || 0), total_cost: acc.total_cost + (s.cost_price || 0) }),
    { count: 0, total_sales: 0, total_profit: 0, total_cost: 0 }
  );
}

// --- Repairs ----------------------------------------------------------------
const REPAIR_STATUSES = ['Pending', 'In Progress', 'Repaired'];

function repairRow(r) {
  if (!r) return undefined;
  return {
    id: r.id,
    laptop_id: r.laptop_id,
    serial_number: r.serial_number,
    brand_model: r.brand_model,
    issue: r.issue,
    vendor: r.vendor,
    cost: r.cost == null || r.cost === '' ? 0 : Number(r.cost),
    status: r.status || 'Pending',
    notes: r.notes,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}

const repairToRow = (r) => [
  r.id, r.laptop_id, r.serial_number, r.brand_model, r.issue, r.vendor, r.cost,
  r.status, r.notes, r.created_by, r.created_at, r.updated_at
];

function getRepairs() {
  return state.repairs
    .map(repairRow)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '') || b.id - a.id);
}

function getRepair(id) {
  return repairRow(state.repairs.find((x) => x.id === id));
}

function createRepair(data) {
  const issue = (data.issue || '').trim();
  if (!issue) return { error: 'issue is required' };
  const id = nextId('Repairs');
  const repair = {
    id,
    laptop_id: data.laptop_id != null && data.laptop_id !== '' ? Number(data.laptop_id) : null,
    serial_number: (data.serial_number || '').trim() || null,
    brand_model: (data.brand_model || '').trim() || null,
    issue,
    vendor: (data.vendor || '').trim() || null,
    cost: data.cost != null && data.cost !== '' ? Number(data.cost) : 0,
    status: 'Pending',
    notes: (data.notes || '').trim() || null,
    created_by: (data.created_by || '').trim() || null,
    created_at: now(),
    updated_at: now()
  };
  state.repairs.unshift(repair);
  rowIndex.Repairs[id] = nextRow.Repairs;
  nextRow.Repairs++;
  schedule(() => appendRow('Repairs', repairToRow(repair)));
  return { repair: getRepair(id) };
}

function updateRepair(id, data) {
  const repair = state.repairs.find((x) => x.id === id);
  if (!repair) return { error: 'Repair record not found' };
  const issue = data.issue != null ? String(data.issue).trim() : repair.issue;
  if (!issue) return { error: 'issue is required' };
  const status = data.status != null ? String(data.status).trim() : repair.status;
  if (!REPAIR_STATUSES.includes(status)) return { error: 'Invalid repair status' };
  repair.laptop_id = data.laptop_id !== undefined && data.laptop_id !== null && data.laptop_id !== '' ? Number(data.laptop_id) : repair.laptop_id;
  repair.serial_number = data.serial_number !== undefined ? (String(data.serial_number).trim() || null) : repair.serial_number;
  repair.brand_model = data.brand_model !== undefined ? (String(data.brand_model).trim() || null) : repair.brand_model;
  repair.issue = issue;
  repair.vendor = data.vendor !== undefined ? (String(data.vendor).trim() || null) : repair.vendor;
  repair.cost = data.cost !== undefined && data.cost !== null && data.cost !== '' ? Number(data.cost) : repair.cost;
  repair.status = status;
  repair.notes = data.notes !== undefined ? (String(data.notes).trim() || null) : repair.notes;
  repair.updated_at = now();
  schedule(() => writeRow('Repairs', rowIndex.Repairs[id], repairToRow(repair)));
  return { repair: getRepair(id) };
}

function deleteRepair(id) {
  const repair = state.repairs.find((x) => x.id === id);
  if (!repair) return { error: 'Repair record not found' };
  const row = rowIndex.Repairs[id];
  state.repairs = state.repairs.filter((x) => x.id !== id);
  delete rowIndex.Repairs[id];
  schedule(() => clearRow('Repairs', row));
  return { ok: true, id };
}

function getRepairsSummary() {
  return state.repairs.reduce(
    (acc, r) => ({
      total: acc.total + 1,
      pending: acc.pending + (r.status === 'Pending' ? 1 : 0),
      in_progress: acc.in_progress + (r.status === 'In Progress' ? 1 : 0),
      repaired: acc.repaired + (r.status === 'Repaired' ? 1 : 0),
      total_cost: acc.total_cost + (Number(r.cost) || 0)
    }),
    { total: 0, pending: 0, in_progress: 0, repaired: 0, total_cost: 0 }
  );
}

// --- Purchases (ledger over Laptops) ----------------------------------------
function getPurchases() {
  return state.laptops
    .map(laptopRow)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '') || b.id - a.id);
}

function getPurchasesSummary() {
  const nowMonth = now().slice(0, 7);
  const totals = state.laptops.reduce(
    (acc, l) => ({
      total_units: acc.total_units + 1,
      total_rate: acc.total_rate + (Number(l.purchase_rate) || 0),
      total_charges: acc.total_charges + (Number(l.extra_charges) || 0),
      month_units: acc.month_units + ((l.created_at || '').startsWith(nowMonth) ? 1 : 0),
      month_value: acc.month_value + ((l.created_at || '').startsWith(nowMonth) ? (Number(l.purchase_rate) || 0) + (Number(l.extra_charges) || 0) : 0)
    }),
    { total_units: 0, total_rate: 0, total_charges: 0, month_units: 0, month_value: 0 }
  );
  return {
    total_units: totals.total_units,
    total_rate: totals.total_rate,
    total_charges: totals.total_charges,
    total_value: totals.total_rate + totals.total_charges,
    month_units: totals.month_units,
    month_value: totals.month_value
  };
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
  if (!ROLES.includes(role)) return { error: 'Invalid role' };
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

const loginCounter = { n: 100 };

function recordLogin(userId, username, ip, userAgent) {
  const id = (loginCounter.n = loginCounter.n + 1);
  state.logins.unshift({ id, user_id: userId, username, ip, user_agent: userAgent || null, logged_in: now() });
  rowIndex.LoginLogs[id] = nextRow.LoginLogs;
  nextRow.LoginLogs++;
  schedule(() => appendRow('LoginLogs', [id, userId, username, ip, userAgent || null, now()]));
}

function getLoginLogs(limit = 200) {
  return state.logins
    .map((l) => ({ id: l.id, user_id: l.user_id, username: l.username, ip: l.ip, user_agent: l.user_agent, logged_in: l.logged_in }))
    .sort((a, b) => (b.logged_in || '').localeCompare(a.logged_in || ''))
    .slice(0, limit);
}

function getUsers() {
  return state.users.map(publicUser);
}

function updateUser(userId, { username, password, display_name, role } = {}) {
  const user = state.users.find((u) => u.id === userId);
  if (!user) return { error: 'User not found' };

  const name = username != null ? String(username).trim().toLowerCase() : user.username;
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) return { error: 'Username must be 3-32 chars: letters, numbers, . _ -' };
  if (role != null && !ROLES.includes(role)) return { error: 'Invalid role' };
  if (password != null && String(password) !== '' && String(password).length < 6) return { error: 'Password must be at least 6 characters' };
  if (state.users.some((u) => u.username === name && u.id !== userId)) return { error: 'Username already taken' };

  const display = display_name != null ? String(display_name).trim() : user.display_name;
  const finalRole = role != null ? role : user.role;
  const hash = password && String(password) !== '' ? bcrypt.hashSync(String(password), 10) : user.password_hash;

  user.username = name;
  user.display_name = display || name;
  user.role = finalRole;
  user.password_hash = hash;

  schedule(() => writeRow('Users', rowIndex.Users[userId], [user.id, name, hash, display || name, finalRole, user.created_at]));
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
  schedule(() => writeRow('Stores', rowIndex.Stores[storeId], [store.id, store.store_name, store.created_at]));
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

// ---------------------------------------------------------------------------
// Seeding + init + polling
// ---------------------------------------------------------------------------
async function seedIfEmpty() {
  const storeValues = await readTab('Stores');
  if (storeValues.length === 1) {
    const rows = STORE_SEEDS.map((n, i) => [i + 1, n, now()]);
    await bulkRows('Stores', 2, rows);
  }
  const brandValues = await readTab('Brands');
  if (brandValues.length === 1) {
    const rows = BRAND_SEEDS.map(([n, p], i) => [i + 1, n, p, now()]);
    await bulkRows('Brands', 2, rows);
  }
  const laptopValues = await readTab('Laptops');
  if (laptopValues.length === 1) {
    const rows = LAPTOP_SEEDS.map((r, i) => [i + 1, r[0], `${r[0]} ${r[1]}`, r[2], r[3], r[4], r[5], r[6], r[7], r[8], null, null, `${r[9]}${String(i + 1).padStart(3, '0')}`, (i % 7) + 1, ['In Stock', 'In Stock', 'In Transit', 'Sold'][i % 4], now(), now()]);
    await bulkRows('Laptops', 2, rows);
  }
  const settingValues = await readTab('Settings');
  if (settingValues.length === 1) {
    const rows = Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, v]);
    await bulkRows('Settings', 2, rows);
  }
  const userValues = await readTab('Users');
  if (userValues.length === 1) {
    await bulkRows('Users', 2, [
      [1, 'superadmin', bcrypt.hashSync('superadmin123', 10), 'Super Administrator', 'superadmin', now()],
      [2, 'admin', bcrypt.hashSync('admin123', 10), 'System Administrator', 'admin', now()]
    ]);
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
  _inject: (api) => { sheets = api || null; },
  getStores,
  getStore,
  addStore,
  renameStore,
  deleteStore,
  getBrands,
  getBrand,
  addBrand,
  updateBrand,
  deleteBrand,
  generateSerial,
  getLaptops,
  getLaptop,
  createLaptop,
  createLaptopsBulk,
  updateLaptop,
  deleteLaptop,
  transferLaptop,
  getTransferLogs,
  getSales,
  getSalesSummary,
  sellLaptop,
  getRepairs,
  getRepair,
  createRepair,
  updateRepair,
  deleteRepair,
  getRepairsSummary,
  getPurchases,
  getPurchasesSummary,
  getSettings,
  setSettings,
  createUser,
  getUserById,
  getUserByUsername,
  verifyPassword,
  recordLogin,
  getLoginLogs,
  getUsers,
  updateUser,
  deleteUser
};