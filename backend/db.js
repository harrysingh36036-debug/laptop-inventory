/**
 * db.js
 * Central database setup using Node.js built-in SQLite (node:sqlite).
 * No native compilation needed on the target machine.
 * Creates tables, seeds the 7 stores + sample laptops, and exposes helpers.
 *
 * Requires Node.js 22.5+ (Node 24 recommended). Requires additional flag in
 * a few older versions: node --experimental-sqlite server.js
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Allow the data directory to live on a persistent volume (e.g. Railway).
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_PATH = path.join(DATA_DIR, 'inventory.db');
if (!require('fs').existsSync(DATA_DIR)) require('fs').mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
// Date helper matching SQLite's datetime('now') UTC format used in defaults.
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// node:sqlite has no .transaction() helper; provide one for atomicity.
function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS Stores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Laptops (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_model     TEXT NOT NULL,
  serial_number   TEXT NOT NULL UNIQUE,
  current_store_id INTEGER,
  status          TEXT NOT NULL DEFAULT 'In Stock'
                  CHECK (status IN ('In Stock','In Transit','Sold')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (current_store_id) REFERENCES Stores(id)
);

CREATE TABLE IF NOT EXISTS TransferLogs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  laptop_id     INTEGER NOT NULL,
  from_store_id INTEGER,
  to_store_id   INTEGER,
  changed_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (laptop_id)     REFERENCES Laptops(id),
  FOREIGN KEY (from_store_id) REFERENCES Stores(id),
  FOREIGN KEY (to_store_id)   REFERENCES Stores(id)
);

CREATE TABLE IF NOT EXISTS Users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'staff'
                CHECK (role IN ('admin','manager','staff')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
const seedStores = () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM stores').get().n;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO stores (store_name) VALUES (?)');
  const stores = [
    'Store 1: Main Flagship',
    'Store 2: North Hub',
    'Store 3: South Branch',
    'Store 4: East Outlet',
    'Store 5: West Showroom',
    'Store 6: Downtown Express',
    'Store 7: Central Warehouse'
  ];
  const tx = transaction(() => stores.forEach((n) => insert.run(n)));
  tx();
};

const seedLaptops = () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM Laptops').get().n;
  if (count > 0) return;

  const brands = [
    'Apple MacBook Pro 14',
    'Apple MacBook Air M3',
    'Dell XPS 15',
    'Lenovo ThinkPad X1',
    'HP Spectre x360',
    'Asus ZenBook 16',
    'Microsoft Surface Laptop'
  ];
  const insert = db.prepare(
    `INSERT INTO Laptops (brand_model, serial_number, current_store_id, status, updated_at)
     VALUES ($brand_model, $serial_number, $current_store_id, $status, datetime('now'))`
  );

  const rows = brands.map((brand, i) => ({
    brand_model: brand,
    serial_number: `SN-${String(1000 + i * 37).padStart(6, '0')}`,
    current_store_id: (i % 7) + 1, // spread across stores 1..7
    status: ['In Stock', 'In Stock', 'In Transit', 'Sold'][i % 4]
  }));

  const tx = transaction(() => rows.forEach((r) => insert.run(r)));
  tx();
};

seedStores();
seedLaptops();

// ---------------------------------------------------------------------------
// Query helpers (joins resolve store names for the client)
// ---------------------------------------------------------------------------
function getStores() {
  return db.prepare('SELECT id, store_name FROM stores ORDER BY id').all();
}

function getStore(id) {
  return db.prepare('SELECT id, store_name FROM stores WHERE id = ?').get(id);
}

function getLaptops(filters = {}) {
  const clauses = [];
  const params = {};

  if (filters.status) {
    clauses.push('l.status = $status');
    params.status = filters.status;
  }
  if (filters.storeId) {
    clauses.push('l.current_store_id = $storeId');
    params.storeId = filters.storeId;
  }
  if (filters.search) {
    clauses.push('(l.brand_model LIKE $search OR l.serial_number LIKE $search)');
    params.search = `%${filters.search}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT l.id, l.brand_model, l.serial_number, l.status, l.updated_at,
              l.current_store_id,
              s.store_name AS current_store_name
       FROM Laptops l
       LEFT JOIN Stores s ON s.id = l.current_store_id
       ${where}
       ORDER BY l.updated_at DESC`
    )
    .all(params);
}

function getLaptop(id) {
  return db
    .prepare(
      `SELECT l.id, l.brand_model, l.serial_number, l.status, l.updated_at,
              l.current_store_id,
              s.store_name AS current_store_name
       FROM Laptops l
       LEFT JOIN Stores s ON s.id = l.current_store_id
       WHERE l.id = ?`
    )
    .get(id);
}

/**
 * Transfer a laptop to a new store. Writes the update + audit log atomically.
 * Returns { laptop, from, to } or { error: '...' } on failure.
 */
function transferLaptop(laptopId, toStoreId) {
  const laptop = db.prepare('SELECT * FROM Laptops WHERE id = ?').get(laptopId);
  if (!laptop) return { error: 'Laptop not found' };

  const toStore = getStore(toStoreId);
  if (!toStore) return { error: 'Destination store not found' };

  const fromStore = getStore(laptop.current_store_id);
  const fromStoreId = laptop.current_store_id ?? null;

  const tx = transaction(() => {
    db.prepare(
      "UPDATE Laptops SET current_store_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(toStoreId, laptopId);
    db.prepare(
      'INSERT INTO TransferLogs (laptop_id, from_store_id, to_store_id) VALUES (?, ?, ?)'
    ).run(laptopId, fromStoreId, toStoreId);
  });
  tx();

  return { ok: true, laptop: getLaptop(laptopId), from: fromStore, to: toStore };
}

function getTransferLogs(limit = 100) {
  return db
    .prepare(
      `SELECT tl.id, tl.laptop_id, tl.from_store_id, tl.to_store_id, tl.changed_at,
              l.brand_model, l.serial_number,
              fs.store_name AS from_store_name,
              ts.store_name AS to_store_name
       FROM TransferLogs tl
       JOIN Laptops l    ON l.id = tl.laptop_id
       LEFT JOIN Stores fs ON fs.id = tl.from_store_id
       LEFT JOIN Stores ts ON ts.id = tl.to_store_id
       ORDER BY tl.changed_at DESC
       LIMIT ?`
    )
    .all(limit);
}

const VALID_STATUSES = ['In Stock', 'In Transit', 'Sold'];

/**
 * Create a new laptop. Returns { laptop } or { error }.
 * data: { brand_model, serial_number, current_store_id, status }
 */
function createLaptop(data) {
  const brand = (data.brand_model || '').trim();
  const serial = (data.serial_number || '').trim();
  const status = data.status || 'In Stock';
  const storeId = data.current_store_id ? Number(data.current_store_id) : null;

  if (!brand) return { error: 'brand_model is required' };
  if (!serial) return { error: 'serial_number is required' };
  if (!VALID_STATUSES.includes(status)) return { error: 'Invalid status' };
  if (storeId != null && !getStore(storeId)) return { error: 'Store not found' };

  const exists = db.prepare('SELECT id FROM Laptops WHERE serial_number = ?').get(serial);
  if (exists) return { error: `Serial ${serial} already exists` };

  const info = db
    .prepare(
      "INSERT INTO Laptops (brand_model, serial_number, current_store_id, status, updated_at) VALUES (?, ?, ?, ?, datetime('now'))"
    )
    .run(brand, serial, storeId, status);

  return { laptop: getLaptop(info.lastInsertRowid) };
}

/**
 * Update a laptop's editable fields. Returns { laptop } or { error }.
 */
function updateLaptop(laptopId, data) {
  const laptop = db.prepare('SELECT * FROM Laptops WHERE id = ?').get(laptopId);
  if (!laptop) return { error: 'Laptop not found' };

  const brand = data.brand_model != null ? (data.brand_model || '').trim() : laptop.brand_model;
  const status = data.status != null ? data.status : laptop.status;
  const storeId =
    data.current_store_id != null ? Number(data.current_store_id) : laptop.current_store_id;

  if (!brand) return { error: 'brand_model cannot be empty' };
  if (!VALID_STATUSES.includes(status)) return { error: 'Invalid status' };
  if (storeId != null && !getStore(storeId)) return { error: 'Store not found' };

  db.prepare(
    "UPDATE Laptops SET brand_model = ?, current_store_id = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(brand, storeId, status, laptopId);

  return { laptop: getLaptop(laptopId) };
}

/**
 * Delete a laptop (and its transfer history). Returns { ok: true } or { error }.
 */
function deleteLaptop(laptopId) {
  const laptop = db.prepare('SELECT id FROM Laptops WHERE id = ?').get(laptopId);
  if (!laptop) return { error: 'Laptop not found' };

  const tx = transaction(() => {
    db.prepare('DELETE FROM TransferLogs WHERE laptop_id = ?').run(laptopId);
    db.prepare('DELETE FROM Laptops WHERE id = ?').run(laptopId);
  });
  tx();

  return { ok: true, id: laptopId };
}

// ---------------------------------------------------------------------------
// Users (auth) helpers
// ---------------------------------------------------------------------------
const bcrypt = require('bcryptjs');

// Safe user shape (never leaks the password hash).
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, display_name: u.display_name, role: u.role, created_at: u.created_at };
}

/**
 * Seed a default admin account (admin / admin123) on first run so the app
 * is usable immediately. Change the password after first login.
 */
const seedAdmin = () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM Users').get().n;
  if (count > 0) return;
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    "INSERT INTO Users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)"
  ).run('admin', hash, 'System Administrator', 'admin');
};

const createUser = ({ username, password, display_name, role = 'staff' }) => {
  const name = (username || '').trim().toLowerCase();
  const display = (display_name || '').trim();
  if (!name) return { error: 'username is required' };
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) {
    return { error: 'Username must be 3-32 chars: letters, numbers, . _ -' };
  }
  if (!password || String(password).length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }
  if (!['admin', 'manager', 'staff'].includes(role)) return { error: 'Invalid role' };

  const exists = db.prepare('SELECT id FROM Users WHERE username = ?').get(name);
  if (exists) return { error: 'Username already taken' };

  const hash = bcrypt.hashSync(String(password), 10);
  const info = db
    .prepare('INSERT INTO Users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
    .run(name, hash, display || name, role);
  return { user: publicUser(getUserById(info.lastInsertRowid)) };
};

function getUserById(id) {
  return db.prepare('SELECT * FROM Users WHERE id = ?').get(id);
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM Users WHERE username = ?').get((username || '').trim().toLowerCase());
}

function verifyPassword(user, password) {
  return user && bcrypt.compareSync(String(password || ''), user.password_hash);
}

function getUsers() {
  return db.prepare('SELECT id, username, display_name, role, created_at FROM Users ORDER BY id').all();
}

/**
 * Update an account. Empty password = leave unchanged.
 * Returns { user } or { error }.
 */
function updateUser(userId, { username, password, display_name, role } = {}) {
  const user = db.prepare('SELECT * FROM Users WHERE id = ?').get(userId);
  if (!user) return { error: 'User not found' };

  const name = username != null ? String(username).trim().toLowerCase() : user.username;
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) {
    return { error: 'Username must be 3-32 chars: letters, numbers, . _ -' };
  }
  if (role != null && !['admin', 'manager', 'staff'].includes(role)) return { error: 'Invalid role' };
  if (password != null && String(password) !== '' && String(password).length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }

  const clash = db.prepare('SELECT id FROM Users WHERE username = ? AND id != ?').get(name, userId);
  if (clash) return { error: 'Username already taken' };

  const display = display_name != null ? String(display_name).trim() : user.display_name;
  const finalRole = role != null ? role : user.role;
  const hash = password && String(password) !== '' ? bcrypt.hashSync(String(password), 10) : user.password_hash;

  db.prepare(
    'UPDATE Users SET username = ?, password_hash = ?, display_name = ?, role = ? WHERE id = ?'
  ).run(name, hash, display || name, finalRole, userId);
  return { user: publicUser(getUserById(userId)) };
}

function deleteUser(userId) {
  const user = db.prepare('SELECT id FROM Users WHERE id = ?').get(userId);
  if (!user) return { error: 'User not found' };
  db.prepare('DELETE FROM Users WHERE id = ?').run(userId);
  return { ok: true, id: userId };
}

// ---------------------------------------------------------------------------
// Store management (admin can rename / add / remove stores)
// ---------------------------------------------------------------------------
function addStore(storeName) {
  const name = (storeName || '').trim();
  if (!name) return { error: 'store_name is required' };
  const exists = db.prepare('SELECT id FROM Stores WHERE store_name = ?').get(name);
  if (exists) return { error: 'A store with that name already exists' };
  const info = db.prepare('INSERT INTO Stores (store_name) VALUES (?)').run(name);
  return { store: getStore(info.lastInsertRowid) };
}

function renameStore(storeId, storeName) {
  const store = getStore(storeId);
  if (!store) return { error: 'Store not found' };
  const name = (storeName || '').trim();
  if (!name) return { error: 'store_name cannot be empty' };
  const clash = db.prepare('SELECT id FROM Stores WHERE store_name = ? AND id != ?').get(name, storeId);
  if (clash) return { error: 'A store with that name already exists' };
  db.prepare('UPDATE Stores SET store_name = ? WHERE id = ?').run(name, storeId);
  return { store: getStore(storeId) };
}

function deleteStore(storeId) {
  const store = getStore(storeId);
  if (!store) return { error: 'Store not found' };
  const count = db.prepare('SELECT COUNT(*) AS n FROM Stores').get().n;
  if (count <= 1) return { error: 'Cannot remove the last store' };
  const assigned = db.prepare('SELECT COUNT(*) AS n FROM Laptops WHERE current_store_id = ?').get(storeId).n;
  if (assigned > 0) return { error: `Cannot remove: ${assigned} laptop(s) still assigned. Move them first.` };
  const logs = db.prepare(
    'SELECT COUNT(*) AS n FROM TransferLogs WHERE from_store_id = ? OR to_store_id = ?'
  ).get(storeId, storeId).n;
  if (logs > 0) return { error: 'Cannot remove: store appears in transfer history.' };
  db.prepare('DELETE FROM Stores WHERE id = ?').run(storeId);
  return { ok: true, id: storeId };
}

// ---------------------------------------------------------------------------
// Settings / UI customization (key-value store, admin-editable)
// ---------------------------------------------------------------------------
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

const seedSettings = () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM Settings').get().n;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO Settings (key, value) VALUES (?, ?)');
  const tx = transaction(() =>
    Object.entries(DEFAULT_SETTINGS).forEach(([k, v]) => insert.run(k, v))
  );
  tx();
};

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM Settings').all();
  const settings = { ...DEFAULT_SETTINGS };
  rows.forEach((r) => { settings[r.key] = r.value; });
  return settings;
}

function setSettings(patch = {}) {
  const upsert = db.prepare(
    'INSERT INTO Settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = transaction(() =>
    Object.entries(patch).forEach(([k, v]) => upsert.run(String(k), String(v ?? '')))
  );
  tx();
  return getSettings();
}

seedAdmin();
seedSettings();

module.exports = {
  db,
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