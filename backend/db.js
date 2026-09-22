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
  condition        TEXT DEFAULT 'Good',
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
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  username              TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  display_name          TEXT,
  role                  TEXT NOT NULL DEFAULT 'staff'
                        CHECK (role IN ('superadmin','admin','manager','staff')),
  force_password_change INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
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

CREATE TABLE IF NOT EXISTS Vendors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  contact    TEXT,
  address    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS PendingTransfers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  laptop_id     INTEGER NOT NULL,
  from_store_id INTEGER,
  to_store_id   INTEGER NOT NULL,
  initiated_by  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at    TEXT,
  FOREIGN KEY (laptop_id)     REFERENCES Laptops(id),
  FOREIGN KEY (from_store_id) REFERENCES Stores(id),
  FOREIGN KEY (to_store_id)   REFERENCES Stores(id)
);

CREATE TABLE IF NOT EXISTS DeleteLogs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT,
  entity_label TEXT,
  remarks      TEXT,
  deleted_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
// Migration: add condition column if missing (for existing DBs)
// ---------------------------------------------------------------------------
try { db.prepare("ALTER TABLE Laptops ADD COLUMN condition TEXT DEFAULT 'Good'").run(); } catch (_) {}
try { db.prepare("ALTER TABLE Users ADD COLUMN force_password_change INTEGER NOT NULL DEFAULT 0").run(); } catch (_) {}
// Column migrations for the Supabase-free app (existing DBs pick these up).
try { db.prepare('ALTER TABLE Laptops ADD COLUMN product_line TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Laptops ADD COLUMN ram TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Laptops ADD COLUMN storage_size TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Laptops ADD COLUMN charger TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Laptops ADD COLUMN purchase_comment TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Laptops ADD COLUMN purchaser_name TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Laptops ADD COLUMN purchaser_phone TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Laptops ADD COLUMN purchaser_aadhar TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Laptops ADD COLUMN purchaser_aadhar_hash TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Laptops ADD COLUMN source_type TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Laptops ADD COLUMN source_id INTEGER').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Users ADD COLUMN home_store_id INTEGER').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Users ADD COLUMN allowed_store_ids TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Repairs ADD COLUMN charge REAL NOT NULL DEFAULT 0').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Repairs ADD COLUMN store_id INTEGER').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Sales ADD COLUMN customer_id INTEGER').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Sales ADD COLUMN customer_name TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Sales ADD COLUMN customer_phone TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Sales ADD COLUMN payment_method TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE Sales ADD COLUMN payment_detail TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE TransferLogs ADD COLUMN transferred_by TEXT').run(); } catch (_) {}

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
    product_line: l.product_line || null,
    brand_model: l.brand_model,
    processor_type: l.processor_type,
    ram: l.ram || null,
    generation: l.generation,
    storage_type: l.storage_type,
    storage_size: l.storage_size || null,
    purchased_from: l.purchased_from,
    graphics: l.graphics,
    graphics_type: l.graphics_type,
    graphics_model: l.graphics_model,
    purchase_rate: l.purchase_rate,
    extra_charges: l.extra_charges,
    serial_number: l.serial_number,
    condition: l.condition || 'Good',
    charger: l.charger || null,
    purchase_comment: l.purchase_comment || null,
    purchaser_name: l.purchaser_name || null,
    purchaser_phone: l.purchaser_phone || null,
    purchaser_aadhar: l.purchaser_aadhar || null,
    purchaser_aadhar_hash: l.purchaser_aadhar_hash || null,
    source_type: l.source_type || null,
    source_id: l.source_id ?? null,
    current_store_id: l.current_store_id,
    status: l.status,
    created_at: l.created_at,
    updated_at: l.updated_at,
    current_store_name: l.current_store_name || storeName(l.current_store_id),
    store_name: l.current_store_name || storeName(l.current_store_id),
    sold_at: l.sold_at || null,
    sold_by: l.sold_by || null,
    sale_price: l.sale_price ?? null,
    sale_customer_name: l.sale_customer_name || null
  };
}

// Latest sale per laptop, so sold rows carry their sale info inline.
const LAPTOP_SELECT = `
  SELECT l.*, s.store_name AS current_store_name,
         sl.sold_at AS sold_at, sl.sold_by AS sold_by,
         sl.sale_price AS sale_price, sl.customer_name AS sale_customer_name
  FROM Laptops l
  LEFT JOIN Stores s ON s.id = l.current_store_id
  LEFT JOIN Sales sl ON sl.id = (
    SELECT id FROM Sales WHERE laptop_id = l.id ORDER BY sold_at DESC, id DESC LIMIT 1
  )`;

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
  const str = (v, fb) => (v != null ? String(v).trim() || null : (fb ?? null));
  const numOrNull = (v, fb) => (v != null && v !== '' ? Number(v) : (fb ?? null));
  return {
    brand: brand || '',
    product_line: str(data.product_line, partial.product_line),
    brand_model: (data.brand_model != null ? String(data.brand_model).trim() : partial.brand_model) || (brand || '') + (data.model || ''),
    processor_type: str(data.processor_type, partial.processor_type),
    ram: str(data.ram, partial.ram),
    generation: str(data.generation, partial.generation),
    storage_type: str(data.storage_type, partial.storage_type),
    storage_size: str(data.storage_size, partial.storage_size),
    purchased_from: str(data.purchased_from, partial.purchased_from),
    graphics: str(data.graphics, partial.graphics),
    graphics_type: str(data.graphics_type, partial.graphics_type),
    graphics_model: str(data.graphics_model, partial.graphics_model),
    purchase_rate: numOrNull(data.purchase_rate, partial.purchase_rate),
    extra_charges: numOrNull(data.extra_charges, partial.extra_charges),
    condition: (data.condition != null ? String(data.condition).trim() : null) || partial.condition || 'Good',
    charger: str(data.charger, partial.charger),
    purchase_comment: str(data.comment ?? data.purchase_comment, partial.purchase_comment),
    purchaser_name: str(data.purchaser_name, partial.purchaser_name),
    purchaser_phone: str(data.purchaser_phone, partial.purchaser_phone),
    purchaser_aadhar: str(data.purchaser_aadhar, partial.purchaser_aadhar),
    purchaser_aadhar_hash: str(data.purchaser_aadhar_hash, partial.purchaser_aadhar_hash),
    source_type: str(data.source_type, partial.source_type),
    source_id: data.source_id != null && data.source_id !== '' ? Number(data.source_id) : (partial.source_id ?? null),
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
  let serial = (data.serial_number || '').trim();
  const l = normalizeLaptop(data);
  const err = validateLaptop(l);
  if (err) return err;
  if (!serial) {
    // Single-add auto-generates from the brand prefix (mirrors bulk mode).
    const brandRow = getBrands().find((b) => b.name.toLowerCase() === String(l.brand || '').trim().toLowerCase());
    const prefix = ((data.serial_prefix || (brandRow && brandRow.serial_prefix)) || '').trim();
    if (!prefix) return { error: 'Serial Number is required (or use a brand with a serial prefix).' };
    serial = generateSerial(prefix);
  }
  const exists = db.prepare('SELECT id FROM Laptops WHERE serial_number = ?').get(serial);
  if (exists) return { error: `Serial ${serial} already exists` };
  const info = db.prepare(
    `INSERT INTO Laptops (brand, product_line, brand_model, processor_type, ram, generation, storage_type, storage_size, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, condition, charger, purchase_comment, purchaser_name, purchaser_phone, purchaser_aadhar, purchaser_aadhar_hash, source_type, source_id, current_store_id, status, updated_at)
     VALUES ($brand, $product_line, $brand_model, $processor_type, $ram, $generation, $storage_type, $storage_size, $purchased_from, $graphics, $graphics_type, $graphics_model, $purchase_rate, $extra_charges, $serial_number, $condition, $charger, $purchase_comment, $purchaser_name, $purchaser_phone, $purchaser_aadhar, $purchaser_aadhar_hash, $source_type, $source_id, $current_store_id, $status, datetime('now'))`
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
    `UPDATE Laptops SET brand=$brand, product_line=$product_line, brand_model=$brand_model, processor_type=$processor_type,
       ram=$ram, generation=$generation, storage_type=$storage_type, storage_size=$storage_size, purchased_from=$purchased_from,
       graphics=$graphics, graphics_type=$graphics_type, graphics_model=$graphics_model,
       purchase_rate=$purchase_rate, extra_charges=$extra_charges, condition=$condition, charger=$charger,
       purchase_comment=$purchase_comment, purchaser_name=$purchaser_name, purchaser_phone=$purchaser_phone,
       purchaser_aadhar=$purchaser_aadhar, purchaser_aadhar_hash=$purchaser_aadhar_hash,
       source_type=$source_type, source_id=$source_id,
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

function transferLaptop(laptopId, toStoreId, transferredBy = null) {
  const laptop = db.prepare('SELECT * FROM Laptops WHERE id = ?').get(laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  const toStore = getStore(toStoreId);
  if (!toStore) return { error: 'Destination store not found' };
  const fromStore = getStore(laptop.current_store_id);
  const fromStoreId = laptop.current_store_id ?? null;
  const tx = transaction(() => {
    db.prepare("UPDATE Laptops SET current_store_id = ?, status = 'In Stock', updated_at = datetime('now') WHERE id = ?").run(toStoreId, laptopId);
    db.prepare('INSERT INTO TransferLogs (laptop_id, from_store_id, to_store_id, transferred_by) VALUES (?, ?, ?, ?)').run(laptopId, fromStoreId, toStoreId, transferredBy);
  });
  tx();
  return { ok: true, laptop: getLaptop(laptopId), from: fromStore, to: toStore };
}

function getTransferLogs(limit = 100) {
  return db.prepare(
    `SELECT tl.id, tl.laptop_id, tl.from_store_id, tl.to_store_id, tl.changed_at, tl.transferred_by,
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
  const phone = s.customer_phone || null;
  return {
    id: s.id,
    laptop_id: s.laptop_id,
    serial_number: s.serial_number,
    brand_model: s.brand_model,
    store_id: s.store_id,
    store_name: storeName(s.store_id),
    customer_id: s.customer_id ?? null,
    customer_name: s.customer_name || null,
    customer_phone: phone,
    customer_phone_last4: phone ? String(phone).slice(-4) : null,
    payment_method: s.payment_method || null,
    payment_detail: s.payment_detail || null,
    sale_price: s.sale_price,
    cost_price: s.cost_price,
    profit: s.profit,
    sold_at: s.sold_at,
    sold_by: s.sold_by
  };
}

// Sell a laptop: mark it Sold, record the sale. Profit = sale - (rate + extra).
function sellLaptop(laptopId, salePrice, soldBy, opts = {}) {
  const laptop = getLaptop(laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  if (laptop.status === 'Sold') return { error: 'Laptop is already sold' };
  const price = Number(salePrice);
  if (!Number.isFinite(price)) return { error: 'sale_price is required' };
  const cost = (laptop.purchase_rate || 0) + (laptop.extra_charges || 0);
  const profit = price - cost;
  let customer = null;
  if (opts.customerId != null && opts.customerId !== '') {
    customer = db.prepare('SELECT * FROM Customers WHERE id = ?').get(Number(opts.customerId));
    if (!customer) return { error: 'Customer not found' };
  }

  const info = db.prepare(
    `INSERT INTO Sales (laptop_id, serial_number, brand_model, store_id, sale_price, cost_price, profit, sold_at, sold_by,
                        customer_id, customer_name, customer_phone, payment_method, payment_detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)`
  ).run(
    laptopId, laptop.serial_number, laptop.brand_model, laptop.current_store_id, price, cost, profit, soldBy || null,
    customer ? customer.id : null,
    customer ? customer.name : null,
    customer ? customer.phone : null,
    opts.paymentMethod || null,
    opts.paymentDetail || null
  );

  updateLaptop(laptopId, { status: 'Sold' });
  return { sale: saleRow(db.prepare('SELECT * FROM Sales WHERE id = ?').get(info.lastInsertRowid)) };
}

// Reverse a sale (refund/exchange): remove the sale row, laptop back to stock.
function deleteSale(saleId) {
  const sale = db.prepare('SELECT * FROM Sales WHERE id = ?').get(saleId);
  if (!sale) return { error: 'Sale not found' };
  const tx = transaction(() => {
    db.prepare('DELETE FROM Sales WHERE id = ?').run(saleId);
    if (sale.laptop_id) {
      db.prepare("UPDATE Laptops SET status = 'In Stock', updated_at = datetime('now') WHERE id = ?").run(sale.laptop_id);
    }
  });
  tx();
  return { ok: true, id: saleId, entity_label: `${sale.brand_model || ''} ${sale.serial_number || ''}`.trim() };
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
    charge: r.charge ?? 0,
    store_id: r.store_id ?? null,
    store_name: r.store_id != null ? storeName(r.store_id) : null,
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
    `INSERT INTO Repairs (laptop_id, serial_number, brand_model, issue, vendor, cost, charge, store_id, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.laptop_id != null && data.laptop_id !== '' ? Number(data.laptop_id) : null,
    (data.serial_number || '').trim() || null,
    (data.brand_model || '').trim() || null,
    issue,
    (data.vendor || '').trim() || null,
    data.cost != null && data.cost !== '' ? Number(data.cost) : 0,
    data.charge != null && data.charge !== '' ? Number(data.charge) : 0,
    data.store_id != null && data.store_id !== '' ? Number(data.store_id) : null,
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
    `UPDATE Repairs SET laptop_id=?, serial_number=?, brand_model=?, issue=?, vendor=?, cost=?, charge=?, store_id=?, status=?, notes=?, updated_at=datetime('now') WHERE id=?`
  ).run(
    data.laptop_id !== undefined && data.laptop_id !== null && data.laptop_id !== '' ? Number(data.laptop_id) : repair.laptop_id,
    data.serial_number !== undefined ? (String(data.serial_number).trim() || null) : repair.serial_number,
    data.brand_model !== undefined ? (String(data.brand_model).trim() || null) : repair.brand_model,
    issue,
    data.vendor !== undefined ? (String(data.vendor).trim() || null) : repair.vendor,
    data.cost !== undefined && data.cost !== null && data.cost !== '' ? Number(data.cost) : repair.cost,
    data.charge !== undefined && data.charge !== null && data.charge !== '' ? Number(data.charge) : (repair.charge ?? 0),
    data.store_id !== undefined && data.store_id !== null && data.store_id !== '' ? Number(data.store_id) : repair.store_id,
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
  return { id: u.id, username: u.username, display_name: u.display_name, role: u.role, force_password_change: !!u.force_password_change, created_at: u.created_at };
}

const crypto = require('crypto');

function generatePassword(len = 20) {
  return crypto.randomBytes(len).toString('base64url').slice(0, len);
}

const seedUsers = () => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM Users').get().n;
  if (count > 0) return;
  // Set ADMIN_PASSWORD in backend/.env on first boot for known credentials.
  const fixed = (process.env.ADMIN_PASSWORD || '').trim();
  const superadminPw = fixed || generatePassword();
  const adminPw = fixed || generatePassword();
  const tx = transaction(() => {
    db.prepare("INSERT INTO Users (username, password_hash, display_name, role, force_password_change) VALUES (?, ?, ?, ?, ?)")
      .run('superadmin', bcrypt.hashSync(superadminPw, 10), 'Super Administrator', 'superadmin', 1);
    db.prepare("INSERT INTO Users (username, password_hash, display_name, role, force_password_change) VALUES (?, ?, ?, ?, ?)")
      .run('admin', bcrypt.hashSync(adminPw, 10), 'System Administrator', 'admin', 1);
  });
  tx();
  console.log('------------------------------------------------------------');
  console.log('  DEFAULT ACCOUNTS CREATED (change password on first login)');
  console.log(`  superadmin / ${superadminPw}`);
  console.log(`  admin      / ${adminPw}`);
  console.log('------------------------------------------------------------');
};

function parseStoreId(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function createUser({ username, password, display_name, role = 'staff', home_store_id, allowed_store_ids } = {}) {
  const name = (username || '').trim().toLowerCase();
  const display = (display_name || '').trim();
  if (!name) return { error: 'username is required' };
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) return { error: 'Username must be 3-32 chars: letters, numbers, . _ -' };
  if (!password || String(password).length < 6) return { error: 'Password must be at least 6 characters' };
  if (!ROLES.includes(role)) return { error: 'Invalid role' };
  const exists = db.prepare('SELECT id FROM Users WHERE username = ?').get(name);
  if (exists) return { error: 'Username already taken' };
  const home = parseStoreId(home_store_id);
  if (home != null && !getStore(home)) return { error: 'Home store not found' };
  const allowed = Array.isArray(allowed_store_ids) && allowed_store_ids.length ? JSON.stringify(allowed_store_ids.map(Number)) : null;
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare('INSERT INTO Users (username, password_hash, display_name, role, home_store_id, allowed_store_ids) VALUES (?, ?, ?, ?, ?, ?)').run(name, hash, display || name, role, home, allowed);
  return { user: publicUserFull(getUserById(info.lastInsertRowid)) };
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
  return db.prepare('SELECT * FROM Users ORDER BY id').all().map(publicUserFull);
}

function updateUser(userId, { username, password, display_name, role, home_store_id, allowed_store_ids } = {}) {
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
  const clearForce = password && String(password) !== '' ? 0 : user.force_password_change;
  const home = home_store_id !== undefined ? parseStoreId(home_store_id) : user.home_store_id;
  if (home != null && !getStore(home)) return { error: 'Home store not found' };
  const allowed = allowed_store_ids !== undefined
    ? (Array.isArray(allowed_store_ids) && allowed_store_ids.length ? JSON.stringify(allowed_store_ids.map(Number)) : null)
    : user.allowed_store_ids;
  db.prepare('UPDATE Users SET username = ?, password_hash = ?, display_name = ?, role = ?, force_password_change = ?, home_store_id = ?, allowed_store_ids = ? WHERE id = ?').run(name, hash, display || name, finalRole, clearForce, home, allowed, userId);
  return { user: publicUserFull(getUserById(userId)) };
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

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------
function vendorRow(v) {
  if (!v) return undefined;
  return { id: v.id, name: v.name, contact: v.contact || null, address: v.address || null, created_at: v.created_at };
}

function getVendors() {
  return db.prepare('SELECT * FROM Vendors ORDER BY name').all().map(vendorRow);
}

function addVendor({ name, contact, address }) {
  const n = (name || '').trim();
  if (!n) return { error: 'name is required' };
  if (db.prepare('SELECT id FROM Vendors WHERE name = ?').get(n)) return { error: 'A vendor with that name already exists' };
  const info = db.prepare('INSERT INTO Vendors (name, contact, address) VALUES (?, ?, ?)').run(
    n, (contact || '').trim() || null, (address || '').trim() || null
  );
  return { vendor: vendorRow(db.prepare('SELECT * FROM Vendors WHERE id = ?').get(info.lastInsertRowid)) };
}

function updateVendor(id, { name, contact, address }) {
  const v = db.prepare('SELECT * FROM Vendors WHERE id = ?').get(id);
  if (!v) return { error: 'Vendor not found' };
  const n = name != null ? String(name).trim() : v.name;
  if (!n) return { error: 'name cannot be empty' };
  if (db.prepare('SELECT id FROM Vendors WHERE name = ? AND id != ?').get(n, id)) return { error: 'A vendor with that name already exists' };
  db.prepare('UPDATE Vendors SET name = ?, contact = ?, address = ? WHERE id = ?').run(
    n,
    contact !== undefined ? (String(contact).trim() || null) : v.contact,
    address !== undefined ? (String(address).trim() || null) : v.address,
    id
  );
  return { vendor: vendorRow(db.prepare('SELECT * FROM Vendors WHERE id = ?').get(id)) };
}

function deleteVendor(id) {
  const v = db.prepare('SELECT * FROM Vendors WHERE id = ?').get(id);
  if (!v) return { error: 'Vendor not found' };
  db.prepare('DELETE FROM Vendors WHERE id = ?').run(id);
  return { ok: true, id, entity_label: v.name };
}

function bulkDeleteVendors(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger);
  if (!list.length) return { error: 'No vendors selected' };
  const tx = transaction(() => list.forEach((vid) => db.prepare('DELETE FROM Vendors WHERE id = ?').run(vid)));
  tx();
  return { ok: true, deleted: list.length };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
function customerRow(c) {
  if (!c) return undefined;
  return { id: c.id, name: c.name, phone: c.phone || null, email: c.email || null, address: c.address || null, notes: c.notes || null, created_at: c.created_at };
}

function getCustomers() {
  return db.prepare('SELECT * FROM Customers ORDER BY name').all().map(customerRow);
}

function addCustomer({ name, phone, email, address, notes }) {
  const n = (name || '').trim();
  if (!n) return { error: 'name is required' };
  const info = db.prepare('INSERT INTO Customers (name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)').run(
    n,
    (phone || '').trim() || null,
    (email || '').trim() || null,
    (address || '').trim() || null,
    (notes || '').trim() || null
  );
  return customerRow(db.prepare('SELECT * FROM Customers WHERE id = ?').get(info.lastInsertRowid));
}

function updateCustomer(id, { name, phone, email, address, notes }) {
  const c = db.prepare('SELECT * FROM Customers WHERE id = ?').get(id);
  if (!c) return { error: 'Customer not found' };
  const n = name != null ? String(name).trim() : c.name;
  if (!n) return { error: 'name cannot be empty' };
  db.prepare('UPDATE Customers SET name = ?, phone = ?, email = ?, address = ?, notes = ? WHERE id = ?').run(
    n,
    phone !== undefined ? (String(phone).trim() || null) : c.phone,
    email !== undefined ? (String(email).trim() || null) : c.email,
    address !== undefined ? (String(address).trim() || null) : c.address,
    notes !== undefined ? (String(notes).trim() || null) : c.notes,
    id
  );
  return customerRow(db.prepare('SELECT * FROM Customers WHERE id = ?').get(id));
}

function deleteCustomer(id) {
  const c = db.prepare('SELECT * FROM Customers WHERE id = ?').get(id);
  if (!c) return { error: 'Customer not found' };
  db.prepare('DELETE FROM Customers WHERE id = ?').run(id);
  return { ok: true, id, entity_label: c.name };
}

function bulkDeleteCustomers(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger);
  if (!list.length) return { error: 'No customers selected' };
  const tx = transaction(() => list.forEach((cid) => db.prepare('DELETE FROM Customers WHERE id = ?').run(cid)));
  tx();
  return { ok: true, deleted: list.length };
}

// ---------------------------------------------------------------------------
// Pending transfers (request → accept / reject / cancel)
// ---------------------------------------------------------------------------
const PENDING_SELECT = `
  SELECT pt.*, l.brand, l.product_line, l.brand_model, l.processor_type, l.ram,
         l.generation, l.storage_size, l.storage_type, l.serial_number,
         fs.store_name AS from_store_name, ts.store_name AS to_store_name
  FROM PendingTransfers pt
  JOIN Laptops l ON l.id = pt.laptop_id
  LEFT JOIN Stores fs ON fs.id = pt.from_store_id
  LEFT JOIN Stores ts ON ts.id = pt.to_store_id`;

function getPendingTransfers() {
  return db.prepare(`${PENDING_SELECT} WHERE pt.status = 'pending' ORDER BY pt.created_at DESC, pt.id DESC`).all();
}

function initiateTransfer(laptopId, toStoreId, initiatedBy = null) {
  const laptop = db.prepare('SELECT * FROM Laptops WHERE id = ?').get(Number(laptopId));
  if (!laptop) return { error: 'Laptop not found' };
  if (laptop.status === 'Sold') return { error: 'Sold laptops cannot be transferred' };
  const toStore = getStore(Number(toStoreId));
  if (!toStore) return { error: 'Destination store not found' };
  if (Number(laptop.current_store_id) === Number(toStoreId)) return { error: 'Laptop is already in that store' };
  const dup = db.prepare("SELECT id FROM PendingTransfers WHERE laptop_id = ? AND status = 'pending'").get(laptop.id);
  if (dup) return { error: 'A transfer request is already pending for this laptop' };
  const info = db.prepare(
    'INSERT INTO PendingTransfers (laptop_id, from_store_id, to_store_id, initiated_by) VALUES (?, ?, ?, ?)'
  ).run(laptop.id, laptop.current_store_id, Number(toStoreId), initiatedBy);
  db.prepare("UPDATE Laptops SET status = 'In Transit', updated_at = datetime('now') WHERE id = ?").run(laptop.id);
  return { ok: true, transfer: db.prepare(`${PENDING_SELECT} WHERE pt.id = ?`).get(info.lastInsertRowid) };
}

function acceptTransfer(transferId) {
  const pt = db.prepare('SELECT * FROM PendingTransfers WHERE id = ?').get(Number(transferId));
  if (!pt || pt.status !== 'pending') return { error: 'Transfer request not found' };
  const moved = transferLaptop(pt.laptop_id, pt.to_store_id, pt.initiated_by);
  if (moved.error) return moved;
  db.prepare("UPDATE PendingTransfers SET status = 'accepted', decided_at = datetime('now') WHERE id = ?").run(pt.id);
  return { ok: true, laptop: moved.laptop, from: moved.from, to: moved.to };
}

function settlePendingTransfer(transferId, status) {
  const pt = db.prepare('SELECT * FROM PendingTransfers WHERE id = ?').get(Number(transferId));
  if (!pt || pt.status !== 'pending') return { error: 'Transfer request not found' };
  const tx = transaction(() => {
    db.prepare('UPDATE PendingTransfers SET status = ?, decided_at = datetime(\'now\') WHERE id = ?').run(status, pt.id);
    db.prepare("UPDATE Laptops SET status = 'In Stock', updated_at = datetime('now') WHERE id = ?").run(pt.laptop_id);
  });
  tx();
  return { ok: true, id: pt.id };
}

const rejectTransfer = (transferId) => settlePendingTransfer(transferId, 'rejected');
const cancelTransfer = (transferId) => settlePendingTransfer(transferId, 'cancelled');

// ---------------------------------------------------------------------------
// Delete logs (audit trail for password-confirmed deletions)
// ---------------------------------------------------------------------------
function recordDeleteLog({ entity_type, entity_id, entity_label, remarks, deleted_by }) {
  db.prepare(
    'INSERT INTO DeleteLogs (entity_type, entity_id, entity_label, remarks, deleted_by) VALUES (?, ?, ?, ?, ?)'
  ).run(entity_type, entity_id != null ? String(entity_id) : null, entity_label || null, remarks || null, deleted_by || null);
}

function getDeleteLogs(limit = 500) {
  return db.prepare('SELECT * FROM DeleteLogs ORDER BY created_at DESC, id DESC LIMIT ?').all(limit);
}

// ---------------------------------------------------------------------------
// Daily reports / store breakdowns
// ---------------------------------------------------------------------------
function getDailyReport(date) {
  const d = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: 'Invalid date (YYYY-MM-DD)' };
  const stores = getStores();
  return {
    date: d,
    stores: stores.map((s) => {
      const inRow = db.prepare("SELECT COUNT(*) AS n FROM Laptops WHERE current_store_id = ? AND status = 'In Stock'").get(s.id);
      const sold = db.prepare('SELECT COUNT(*) AS n FROM Sales WHERE store_id = ? AND date(sold_at) = date(?)').get(s.id, d);
      const outT = db.prepare('SELECT COUNT(*) AS n FROM TransferLogs WHERE from_store_id = ? AND date(changed_at) = date(?)').get(s.id, d);
      const inT = db.prepare('SELECT COUNT(*) AS n FROM TransferLogs WHERE to_store_id = ? AND date(changed_at) = date(?)').get(s.id, d);
      const soldN = sold.n || 0, outN = outT.n || 0;
      return {
        store_id: s.id,
        store_name: s.store_name,
        in_store: inRow.n || 0,
        sold_on: soldN,
        transferred_out_on: outN,
        transferred_in_on: inT.n || 0,
        out_total: soldN + outN
      };
    })
  };
}

function getDailyStoreSales(date) {
  const d = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: 'Invalid date (YYYY-MM-DD)' };
  const stores = getStores();
  return {
    date: d,
    stores: stores.map((s) => {
      const r = db.prepare(
        'SELECT COUNT(*) AS units, COALESCE(SUM(sale_price),0) AS amount, COALESCE(SUM(profit),0) AS profit FROM Sales WHERE store_id = ? AND date(sold_at) = date(?)'
      ).get(s.id, d);
      return { store_id: s.id, store_name: s.store_name, units: r.units || 0, amount: r.amount || 0, profit: r.profit || 0 };
    })
  };
}

function getRepairsByStore() {
  const stores = getStores();
  const rows = stores.map((s) => {
    const r = db.prepare(
      'SELECT COUNT(*) AS count, COALESCE(SUM(cost),0) AS total_cost, COALESCE(SUM(charge),0) AS total_charge FROM Repairs WHERE store_id = ?'
    ).get(s.id);
    return {
      store_id: s.id,
      store_name: s.store_name,
      count: r.count || 0,
      total_cost: r.total_cost || 0,
      total_charge: r.total_charge || 0,
      profit: (r.total_charge || 0) - (r.total_cost || 0)
    };
  });
  const r0 = db.prepare(
    'SELECT COUNT(*) AS count, COALESCE(SUM(cost),0) AS total_cost, COALESCE(SUM(charge),0) AS total_charge FROM Repairs WHERE store_id IS NULL'
  ).get();
  if (r0.count > 0) {
    rows.push({
      store_id: null, store_name: 'Unassigned', count: r0.count || 0,
      total_cost: r0.total_cost || 0, total_charge: r0.total_charge || 0,
      profit: (r0.total_charge || 0) - (r0.total_cost || 0)
    });
  }
  const t = rows.reduce((a, r) => ({ total_charge: a.total_charge + r.total_charge }), { total_charge: 0 });
  return { stores: rows, totals: t };
}

function getInventoryStats({ storeId } = {}) {
  const sid = storeId != null && storeId !== '' ? Number(storeId) : null;
  const scope = sid != null ? 'WHERE current_store_id = ?' : '';
  const args = sid != null ? [sid] : [];
  const t = db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'In Stock' THEN 1 ELSE 0 END) AS in_stock,
            SUM(CASE WHEN status = 'In Transit' THEN 1 ELSE 0 END) AS in_transit,
            SUM(CASE WHEN status = 'Sold' THEN 1 ELSE 0 END) AS sold
     FROM Laptops ${scope}`
  ).get(...args);
  const byBrand = db.prepare(
    `SELECT brand, COUNT(*) AS total,
            SUM(CASE WHEN status = 'In Stock' THEN 1 ELSE 0 END) AS in_stock,
            SUM(CASE WHEN status = 'In Transit' THEN 1 ELSE 0 END) AS in_transit,
            SUM(CASE WHEN status = 'Sold' THEN 1 ELSE 0 END) AS sold
     FROM Laptops ${scope} GROUP BY brand ORDER BY total DESC`
  ).all(...args);
  const byGeneration = db.prepare(
    `SELECT COALESCE(generation, 'Unknown') AS generation, COUNT(*) AS total FROM Laptops ${scope} GROUP BY generation ORDER BY total DESC`
  ).all(...args);
  const byConfig = db.prepare(
    `SELECT TRIM(COALESCE(processor_type,'') || ' ' || COALESCE(ram,'') || ' ' || COALESCE(storage_size,'')) AS config, COUNT(*) AS total
     FROM Laptops ${scope} GROUP BY config ORDER BY total DESC`
  ).all(...args).map((r) => ({ config: r.config.trim() || 'Unknown', total: r.total }));
  return {
    totals: { total: t.total || 0, in_stock: t.in_stock || 0, in_transit: t.in_transit || 0, sold: t.sold || 0 },
    by_brand: byBrand,
    by_generation: byGeneration,
    by_config: byConfig
  };
}

// ---------------------------------------------------------------------------
// Users: store scoping
// ---------------------------------------------------------------------------
function publicUserFull(u) {
  if (!u) return null;
  const base = publicUser(u);
  let allowed = null;
  try {
    const raw = u.allowed_store_ids;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) allowed = parsed.map(Number);
    }
  } catch { /* ignore */ }
  const homeId = u.home_store_id ?? null;
  return { ...base, home_store_id: homeId, home_store_name: homeId != null ? storeName(homeId) : null, allowed_store_ids: allowed };
}

function getLoginUsernames() {
  return db.prepare('SELECT username, display_name FROM Users ORDER BY username').all();
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
  deleteUser,
  publicUserFull,
  getLoginUsernames,
  deleteSale,
  getVendors,
  addVendor,
  updateVendor,
  deleteVendor,
  bulkDeleteVendors,
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  bulkDeleteCustomers,
  getPendingTransfers,
  initiateTransfer,
  acceptTransfer,
  rejectTransfer,
  cancelTransfer,
  recordDeleteLog,
  getDeleteLogs,
  getDailyReport,
  getDailyStoreSales,
  getRepairsByStore,
  getInventoryStats
};
