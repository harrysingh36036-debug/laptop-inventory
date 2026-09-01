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
const bcrypt = require('bcryptjs');

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

const ROLES = ['superadmin', 'admin', 'manager', 'staff'];
const VALID_STATUSES = ['In Stock', 'In Transit', 'Sold'];

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS Stores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Brands (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  serial_prefix TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Laptops (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  brand            TEXT NOT NULL,
  brand_model      TEXT NOT NULL,
  processor_type   TEXT,
  generation       TEXT,
  storage_type     TEXT,
  purchased_from   TEXT,
  graphics         TEXT,
  graphics_type    TEXT,
  graphics_model   TEXT,
  purchase_rate    REAL,
  extra_charges    REAL,
  serial_number    TEXT NOT NULL UNIQUE,
  current_store_id INTEGER,
  status           TEXT NOT NULL DEFAULT 'In Stock'
                   CHECK (status IN ('In Stock','In Transit','Sold')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
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

CREATE TABLE IF NOT EXISTS Sales (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  laptop_id     INTEGER,
  serial_number TEXT,
  brand_model   TEXT,
  store_id      INTEGER,
  sale_price    REAL NOT NULL,
  cost_price    REAL,
  profit        REAL,
  sold_at       TEXT NOT NULL DEFAULT (datetime('now')),
  sold_by       TEXT,
  FOREIGN KEY (laptop_id) REFERENCES Laptops(id),
  FOREIGN KEY (store_id)  REFERENCES Stores(id)
);

CREATE TABLE IF NOT EXISTS Users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'staff'
                CHECK (role IN ('superadmin','admin','manager','staff')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS LoginLogs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  username   TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  logged_in  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES Users(id)
);

CREATE TABLE IF NOT EXISTS Repairs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  laptop_id     INTEGER,
  serial_number TEXT,
  brand_model   TEXT,
  issue         TEXT NOT NULL,
  vendor        TEXT,
  cost          REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'Pending'
                CHECK (status IN ('Pending','In Progress','Repaired')),
  notes         TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (laptop_id) REFERENCES Laptops(id)
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

const seedBrands = () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM Brands').get().n;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO Brands (name, serial_prefix) VALUES (?, ?)');
  const brands = [
    ['HP', 'HP010'],
    ['Asus', 'AS010'],
    ['Dell', 'DL010']
  ];
  const tx = transaction(() => brands.forEach(([n, p]) => insert.run(n, p)));
  tx();
};

const seedLaptops = () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM Laptops').get().n;
  if (count > 0) return;

  const rows = [
    ['Apple', 'MacBook Pro 14', 'M3 Pro', '14"', 'SSD', 'Apple Store', 'yes', 'integrated', 'Apple GPU', 'HP010'],
    ['Apple', 'MacBook Air M3', 'M3', '13"', 'SSD', 'Apple Store', 'yes', 'integrated', 'Apple GPU', 'AS010'],
    ['Dell', 'XPS 15', 'Core i7-13700H', '13th', 'SSD', 'Dell Direct', 'yes', 'dedicated', 'RTX 4060', 'DL010'],
    ['Lenovo', 'ThinkPad X1', 'Core i5-1345U', '13th', 'SSD', 'Lenovo Direct', 'yes', 'integrated', 'Intel Iris', 'HP010'],
    ['HP', 'Spectre x360', 'Core i7-1255U', '12th', 'SSD', 'HP Online', 'yes', 'integrated', 'Intel Iris Xe', 'AS010'],
    ['Asus', 'ZenBook 16', 'Ryzen 7 7840H', 'AMD', 'SSD', 'Asus Store', 'yes', 'dedicated', 'RTX 3050', 'DL010'],
    ['Microsoft', 'Surface Laptop', 'Core i5-1235U', '12th', 'SSD', 'Microsoft Store', 'no', '', '', 'HP010']
  ];

  const insert = db.prepare(
    `INSERT INTO Laptops (brand, brand_model, processor_type, generation, storage_type, purchased_from, graphics, graphics_type, graphics_model, serial_number, current_store_id, status, updated_at)
     VALUES ($brand, $brand_model, $processor_type, $generation, $storage_type, $purchased_from, $graphics, $graphics_type, $graphics_model, $serial_number, $current_store_id, $status, datetime('now'))`
  );

  const tx = transaction(() =>
    rows.forEach((r, i) => {
      insert.run({
        brand: r[0],
        brand_model: `${r[0]} ${r[1]}`,
        processor_type: r[2],
        generation: r[3],
        storage_type: r[4],
        purchased_from: r[5],
        graphics: r[6],
        graphics_type: r[7],
        graphics_model: r[8],
        serial_number: `${r[9]}${String(i + 1).padStart(3, '0')}`,
        current_store_id: (i % 7) + 1,
        status: ['In Stock', 'In Stock', 'In Transit', 'Sold'][i % 4]
      });
    })
  );
  tx();
};

seedStores();
seedBrands();
seedLaptops();

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------
function getStores() {
  return db.prepare('SELECT id, store_name FROM stores ORDER BY id').all();
}

function getStore(id) {
  return db.prepare('SELECT id, store_name FROM stores WHERE id = ?').get(id);
}

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
  const logs = db.prepare('SELECT COUNT(*) AS n FROM TransferLogs WHERE from_store_id = ? OR to_store_id = ?').get(storeId, storeId).n;
  if (logs > 0) return { error: 'Cannot remove: store appears in transfer history.' };
  db.prepare('DELETE FROM Stores WHERE id = ?').run(storeId);
  return { ok: true, id: storeId };
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------
function getBrands() {
  return db.prepare('SELECT id, name, serial_prefix FROM Brands ORDER BY name').all();
}

function getBrand(id) {
  return db.prepare('SELECT id, name, serial_prefix FROM Brands WHERE id = ?').get(id);
}

function addBrand({ name, serial_prefix }) {
  const brandName = (name || '').trim();
  const prefix = (serial_prefix || '').trim();
  if (!brandName) return { error: 'name is required' };
  if (!prefix) return { error: 'serial_prefix is required' };
  const exists = db.prepare('SELECT id FROM Brands WHERE name = ?').get(brandName);
  if (exists) return { error: 'A brand with that name already exists' };
  const info = db.prepare('INSERT INTO Brands (name, serial_prefix) VALUES (?, ?)').run(brandName, prefix);
  return { brand: getBrand(info.lastInsertRowid) };
}

function updateBrand(id, { name, serial_prefix }) {
  const brand = getBrand(id);
  if (!brand) return { error: 'Brand not found' };
  const brandName = name != null ? (name || '').trim() : brand.name;
  const prefix = serial_prefix != null ? (serial_prefix || '').trim() : brand.serial_prefix;
  if (!brandName) return { error: 'name cannot be empty' };
  if (!prefix) return { error: 'serial_prefix cannot be empty' };
  const clash = db.prepare('SELECT id FROM Brands WHERE name = ? AND id != ?').get(brandName, id);
  if (clash) return { error: 'A brand with that name already exists' };
  db.prepare('UPDATE Brands SET name = ?, serial_prefix = ? WHERE id = ?').run(brandName, prefix, id);
  return { brand: getBrand(id) };
}

function deleteBrand(id) {
  const used = db.prepare('SELECT COUNT(*) AS n FROM Laptops WHERE brand = ?').get((getBrand(id) || {}).name)?.n;
  if (used > 0) return { error: 'Cannot remove: laptops exist with this brand. Move/delete them first.' };
  db.prepare('DELETE FROM Brands WHERE id = ?').run(id);
  return { ok: true, id };
}

// Generate the next serial for a brand's prefix (e.g. "HP010" -> "HP010001").
function generateSerial(prefix) {
  const prefixUpper = (prefix || '').toUpperCase();
  const match = db.prepare('SELECT serial_number FROM Laptops WHERE serial_number LIKE ?').all(`${prefixUpper}%`);
  let max = 0;
  match.forEach((m) => {
    const n = parseInt(m.serial_number.slice(prefixUpper.length), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  });
  return prefixUpper + String(max + 1).padStart(3, '0');
}

// ---------------------------------------------------------------------------
// Laptops
// ---------------------------------------------------------------------------
function storeName(id) {
  return (getStore(id) || {}).store_name;
}

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

const LAPTOP_SELECT = `
  SELECT l.*, s.store_name AS current_store_name
  FROM Laptops l LEFT JOIN Stores s ON s.id = l.current_store_id`;

function getLaptops(filters = {}) {
  const clauses = [];
  const params = {};
  if (filters.status) { clauses.push('l.status = $status'); params.status = filters.status; }
  if (filters.storeId) { clauses.push('l.current_store_id = $storeId'); params.storeId = filters.storeId; }
  if (filters.brand) { clauses.push('l.brand = $brand'); params.brand = filters.brand; }
  if (filters.search) {
    clauses.push('(l.brand LIKE $search OR l.brand_model LIKE $search OR l.serial_number LIKE $search)');
    params.search = `%${filters.search}%`;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`${LAPTOP_SELECT} ${where} ORDER BY l.updated_at DESC`).all(params).map(laptopRow);
}

function getLaptop(id) {
  const l = db.prepare(`${LAPTOP_SELECT} WHERE l.id = ?`).get(id);
  return laptopRow(l);
}

// Normalize incoming spec fields into a full laptop object.
function normalizeLaptop(data, partial = {}) {
  const brand = (data.brand != null ? String(data.brand).trim() : partial.brand);
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

// Validate a (normalized) laptop.
function validateLaptop(l) {
  if (!l.brand) return { error: 'brand is required' };
  if (!l.brand_model) return { error: 'brand_model is required' };
  if (!VALID_STATUSES.includes(l.status)) return { error: 'Invalid status' };
  if (l.current_store_id != null && !getStore(l.current_store_id)) return { error: 'Store not found' };
  return null;
}

function createLaptop(data, { silent = false } = {}) {
  const serial = (data.serial_number || '').trim();
  const l = normalizeLaptop(data);
  const err = validateLaptop(l);
  if (err) return err;
  if (!serial) return { error: 'serial_number is required' };
  const exists = db.prepare('SELECT id FROM Laptops WHERE serial_number = ?').get(serial);
  if (exists) return { error: `Serial ${serial} already exists` };
  const info = db.prepare(
    `INSERT INTO Laptops (brand, brand_model, processor_type, generation, storage_type, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status, updated_at)
     VALUES ($brand, $brand_model, $processor_type, $generation, $storage_type, $purchased_from, $graphics, $graphics_type, $graphics_model, $purchase_rate, $extra_charges, $serial_number, $current_store_id, $status, datetime('now'))`
  ).run({ ...l, serial_number: serial });
  return { laptop: getLaptop(info.lastInsertRowid) };
}

// Bulk add: create `quantity` units with the same spec and auto-generated serials.
function createLaptopsBulk(data, quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 1000) return { error: 'quantity must be an integer between 1 and 1000' };
  const brandRow = getBrands().find((b) => b.name.toLowerCase() === String(data.brand || '').trim().toLowerCase());
  const prefix = (data.serial_prefix || (brandRow && brandRow.serial_prefix) || '').trim();
  if (!prefix) return { error: 'Could not determine serial prefix. Add this brand first or provide a prefix.' };

  // Validate the spec once.
  const probe = validateLaptop(normalizeLaptop(data));
  if (probe) return probe;

  const results = [];
  let lastError = null;
  const tx = transaction(() => {
    for (let i = 0; i < qty; i++) {
      const serial = generateSerial(prefix);
      const r = createLaptop({ ...data, serial_number: serial });
      if (r.error) { lastError = r.error; break; }
      results.push(r.laptop);
    }
  });
  tx();
  if (lastError) return { error: lastError, created: results };
  return { laptops: results };
}

function updateLaptop(laptopId, data) {
  const laptop = db.prepare('SELECT * FROM Laptops WHERE id = ?').get(laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  const l = normalizeLaptop(data, laptop);
  const err = validateLaptop(l);
  if (err) return err;
  db.prepare(
    `UPDATE Laptops SET brand=$brand, brand_model=$brand_model, processor_type=$processor_type,
       generation=$generation, storage_type=$storage_type, purchased_from=$purchased_from,
       graphics=$graphics, graphics_type=$graphics_type, graphics_model=$graphics_model,
       purchase_rate=$purchase_rate, extra_charges=$extra_charges,
       current_store_id=$current_store_id, status=$status, updated_at=datetime('now') WHERE id=$id`
  ).run({ ...l, id: laptopId });
  return { laptop: getLaptop(laptopId) };
}

function deleteLaptop(laptopId) {
  const laptop = db.prepare('SELECT id FROM Laptops WHERE id = ?').get(laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  const tx = transaction(() => {
    db.prepare('DELETE FROM Sales WHERE laptop_id = ?').run(laptopId);
    db.prepare('DELETE FROM TransferLogs WHERE laptop_id = ?').run(laptopId);
    db.prepare('DELETE FROM Laptops WHERE id = ?').run(laptopId);
  });
  tx();
  return { ok: true, id: laptopId };
}

function transferLaptop(laptopId, toStoreId) {
  const laptop = db.prepare('SELECT * FROM Laptops WHERE id = ?').get(laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  const toStore = getStore(toStoreId);
  if (!toStore) return { error: 'Destination store not found' };
  const fromStore = getStore(laptop.current_store_id);
  const fromStoreId = laptop.current_store_id ?? null;
  const tx = transaction(() => {
    db.prepare("UPDATE Laptops SET current_store_id = ?, updated_at = datetime('now') WHERE id = ?").run(toStoreId, laptopId);
    db.prepare('INSERT INTO TransferLogs (laptop_id, from_store_id, to_store_id) VALUES (?, ?, ?)').run(laptopId, fromStoreId, toStoreId);
  });
  tx();
  return { ok: true, laptop: getLaptop(laptopId), from: fromStore, to: toStore };
}

function getTransferLogs(limit = 100) {
  return db.prepare(
    `SELECT tl.id, tl.laptop_id, tl.from_store_id, tl.to_store_id, tl.changed_at,
            l.brand_model, l.serial_number,
            fs.store_name AS from_store_name,
            ts.store_name AS to_store_name
     FROM TransferLogs tl
     JOIN Laptops l ON l.id = tl.laptop_id
     LEFT JOIN Stores fs ON fs.id = tl.from_store_id
     LEFT JOIN Stores ts ON ts.id = tl.to_store_id
     ORDER BY tl.changed_at DESC LIMIT ?`
  ).all(limit);
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------
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

// Sell a laptop: mark it Sold, record the sale. Profit = sale - (rate + extra).
function sellLaptop(laptopId, salePrice, soldBy) {
  const laptop = getLaptop(laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  if (laptop.status === 'Sold') return { error: 'Laptop is already sold' };
  const price = Number(salePrice);
  if (!Number.isFinite(price)) return { error: 'sale_price is required' };
  const cost = (laptop.purchase_rate || 0) + (laptop.extra_charges || 0);
  const profit = price - cost;

  const info = db.prepare(
    `INSERT INTO Sales (laptop_id, serial_number, brand_model, store_id, sale_price, cost_price, profit, sold_at, sold_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
  ).run(laptopId, laptop.serial_number, laptop.brand_model, laptop.current_store_id, price, cost, profit, soldBy || null);

  updateLaptop(laptopId, { status: 'Sold' });
  return { sale: saleRow(db.prepare('SELECT * FROM Sales WHERE id = ?').get(info.lastInsertRowid)) };
}

function getSales() {
  return db.prepare('SELECT * FROM Sales ORDER BY sold_at DESC').all().map(saleRow);
}

function getSalesSummary() {
  const rows = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(sale_price),0) AS total_sales, COALESCE(SUM(profit),0) AS total_profit, COALESCE(SUM(cost_price),0) AS total_cost FROM Sales').get();
  return rows;
}

// ---------------------------------------------------------------------------
// Repairs
// ---------------------------------------------------------------------------
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
    cost: r.cost,
    status: r.status,
    notes: r.notes,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}

function getRepairs() {
  return db.prepare('SELECT * FROM Repairs ORDER BY updated_at DESC, id DESC').all().map(repairRow);
}

function getRepair(id) {
  return repairRow(db.prepare('SELECT * FROM Repairs WHERE id = ?').get(id));
}

function createRepair(data) {
  const issue = (data.issue || '').trim();
  if (!issue) return { error: 'issue is required' };
  const info = db.prepare(
    `INSERT INTO Repairs (laptop_id, serial_number, brand_model, issue, vendor, cost, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.laptop_id != null && data.laptop_id !== '' ? Number(data.laptop_id) : null,
    (data.serial_number || '').trim() || null,
    (data.brand_model || '').trim() || null,
    issue,
    (data.vendor || '').trim() || null,
    data.cost != null && data.cost !== '' ? Number(data.cost) : 0,
    (data.notes || '').trim() || null,
    (data.created_by || '').trim() || null
  );
  return { repair: getRepair(info.lastInsertRowid) };
}

function updateRepair(id, data) {
  const repair = db.prepare('SELECT * FROM Repairs WHERE id = ?').get(id);
  if (!repair) return { error: 'Repair record not found' };
  const issue = data.issue != null ? String(data.issue).trim() : repair.issue;
  if (!issue) return { error: 'issue is required' };
  const status = data.status != null ? String(data.status).trim() : repair.status;
  if (!REPAIR_STATUSES.includes(status)) return { error: 'Invalid repair status' };
  db.prepare(
    `UPDATE Repairs SET laptop_id=?, serial_number=?, brand_model=?, issue=?, vendor=?, cost=?, status=?, notes=?, updated_at=datetime('now') WHERE id=?`
  ).run(
    data.laptop_id !== undefined && data.laptop_id !== null && data.laptop_id !== '' ? Number(data.laptop_id) : repair.laptop_id,
    data.serial_number !== undefined ? (String(data.serial_number).trim() || null) : repair.serial_number,
    data.brand_model !== undefined ? (String(data.brand_model).trim() || null) : repair.brand_model,
    issue,
    data.vendor !== undefined ? (String(data.vendor).trim() || null) : repair.vendor,
    data.cost !== undefined && data.cost !== null && data.cost !== '' ? Number(data.cost) : repair.cost,
    status,
    data.notes !== undefined ? (String(data.notes).trim() || null) : repair.notes,
    id
  );
  return { repair: getRepair(id) };
}

function deleteRepair(id) {
  const repair = db.prepare('SELECT id FROM Repairs WHERE id = ?').get(id);
  if (!repair) return { error: 'Repair record not found' };
  db.prepare('DELETE FROM Repairs WHERE id = ?').run(id);
  return { ok: true, id };
}

function getRepairsSummary() {
  const r = db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
            SUM(CASE WHEN status = 'Repaired' THEN 1 ELSE 0 END) AS repaired,
            COALESCE(SUM(COALESCE(cost, 0)), 0) AS total_cost
     FROM Repairs`
  ).get();
  return {
    total: r.total || 0,
    pending: r.pending || 0,
    in_progress: r.in_progress || 0,
    repaired: r.repaired || 0,
    total_cost: r.total_cost || 0
  };
}

// ---------------------------------------------------------------------------
// Purchases (ledger over Laptops)
// ---------------------------------------------------------------------------
function getPurchases() {
  return db.prepare(`${LAPTOP_SELECT} ORDER BY l.created_at DESC, l.id DESC`).all().map(laptopRow);
}

function getPurchasesSummary() {
  const r = db.prepare(
    `SELECT COUNT(*) AS total_units,
            COALESCE(SUM(COALESCE(purchase_rate, 0)), 0) AS total_rate,
            COALESCE(SUM(COALESCE(extra_charges, 0)), 0) AS total_charges,
            COALESCE(SUM(COALESCE(purchase_rate, 0) + COALESCE(extra_charges, 0)), 0) AS total_value
     FROM Laptops`
  ).get();
  const m = db.prepare(
    `SELECT COUNT(*) AS month_units,
            COALESCE(SUM(COALESCE(purchase_rate, 0) + COALESCE(extra_charges, 0)), 0) AS month_value
     FROM Laptops WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
  ).get();
  return {
    total_units: r.total_units || 0,
    total_rate: r.total_rate || 0,
    total_charges: r.total_charges || 0,
    total_value: r.total_value || 0,
    month_units: m.month_units || 0,
    month_value: m.month_value || 0
  };
}

// ---------------------------------------------------------------------------
// Users (auth)
// ---------------------------------------------------------------------------
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, display_name: u.display_name, role: u.role, created_at: u.created_at };
}

const seedUsers = () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM Users').get().n;
  if (count > 0) return;
  const tx = transaction(() => {
    db.prepare("INSERT INTO Users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)")
      .run('superadmin', bcrypt.hashSync('superadmin123', 10), 'Super Administrator', 'superadmin');
    db.prepare("INSERT INTO Users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)")
      .run('admin', bcrypt.hashSync('admin123', 10), 'System Administrator', 'admin');
  });
  tx();
};

function createUser({ username, password, display_name, role = 'staff' }) {
  const name = (username || '').trim().toLowerCase();
  const display = (display_name || '').trim();
  if (!name) return { error: 'username is required' };
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) return { error: 'Username must be 3-32 chars: letters, numbers, . _ -' };
  if (!password || String(password).length < 6) return { error: 'Password must be at least 6 characters' };
  if (!ROLES.includes(role)) return { error: 'Invalid role' };
  const exists = db.prepare('SELECT id FROM Users WHERE username = ?').get(name);
  if (exists) return { error: 'Username already taken' };
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare('INSERT INTO Users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)').run(name, hash, display || name, role);
  return { user: publicUser(getUserById(info.lastInsertRowid)) };
}

function getUserById(id) {
  return db.prepare('SELECT * FROM Users WHERE id = ?').get(id);
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM Users WHERE username = ?').get((username || '').trim().toLowerCase());
}

function verifyPassword(user, password) {
  return user && bcrypt.compareSync(String(password || ''), user.password_hash);
}

function recordLogin(userId, username, ip, userAgent) {
  db.prepare('INSERT INTO LoginLogs (user_id, username, ip, user_agent) VALUES (?, ?, ?, ?)').run(userId, username, ip, userAgent || null);
}

function getLoginLogs(limit = 200) {
  return db.prepare('SELECT id, user_id, username, ip, user_agent, logged_in FROM LoginLogs ORDER BY logged_in DESC LIMIT ?').all(limit);
}

function getUsers() {
  return db.prepare('SELECT id, username, display_name, role, created_at FROM Users ORDER BY id').all();
}

function updateUser(userId, { username, password, display_name, role } = {}) {
  const user = db.prepare('SELECT * FROM Users WHERE id = ?').get(userId);
  if (!user) return { error: 'User not found' };
  const name = username != null ? String(username).trim().toLowerCase() : user.username;
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) return { error: 'Username must be 3-32 chars: letters, numbers, . _ -' };
  if (role != null && !ROLES.includes(role)) return { error: 'Invalid role' };
  if (password != null && String(password) !== '' && String(password).length < 6) return { error: 'Password must be at least 6 characters' };
  const clash = db.prepare('SELECT id FROM Users WHERE username = ? AND id != ?').get(name, userId);
  if (clash) return { error: 'Username already taken' };
  const display = display_name != null ? String(display_name).trim() : user.display_name;
  const finalRole = role != null ? role : user.role;
  const hash = password && String(password) !== '' ? bcrypt.hashSync(String(password), 10) : user.password_hash;
  db.prepare('UPDATE Users SET username = ?, password_hash = ?, display_name = ?, role = ? WHERE id = ?').run(name, hash, display || name, finalRole, userId);
  return { user: publicUser(getUserById(userId)) };
}

function deleteUser(userId) {
  const user = db.prepare('SELECT id FROM Users WHERE id = ?').get(userId);
  if (!user) return { error: 'User not found' };
  db.prepare('DELETE FROM Users WHERE id = ?').run(userId);
  return { ok: true, id: userId };
}

// ---------------------------------------------------------------------------
// Settings / UI customization
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
  noLaptops: 'No laptops match the current filters.',
  quantityLabel: 'Quantity',
  salesTitle: 'Sales',
  salesSubtitle: 'Track sales, profit and totals'
};

const seedSettings = () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM Settings').get().n;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO Settings (key, value) VALUES (?, ?)');
  const tx = transaction(() => Object.entries(DEFAULT_SETTINGS).forEach(([k, v]) => insert.run(k, v)));
  tx();
};

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM Settings').all();
  const settings = { ...DEFAULT_SETTINGS };
  rows.forEach((r) => { settings[r.key] = r.value; });
  return settings;
}

function setSettings(patch = {}) {
  const upsert = db.prepare('INSERT INTO Settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = transaction(() => Object.entries(patch).forEach(([k, v]) => upsert.run(String(k), String(v ?? ''))));
  tx();
  return getSettings();
}

seedUsers();
seedSettings();

module.exports = {
  db,
  ROLES,
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
