/**
 * pgdb.js
 * Postgres driver for the laptop inventory app (Supabase / Neon / Railway PG).
 * Pure-JS via the `pg` package — no native build required.
 *
 * Mirrors the exact API contract of db.js / sheets.js so server.js can swap
 * storage drivers without changes. Auto-creates the schema and seeds default
 * data on first run.
 *
 * Requires DATABASE_URL in the environment (a libpq connection string).
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('pgdb: DATABASE_URL is required (Supabase/Neon/any Postgres connection string)');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: /sslmode=require/i.test(DATABASE_URL) || /(supabase|neon|railway)/i.test(DATABASE_URL)
    ? { rejectUnauthorized: false }
    : undefined
});

const ROLES = ['superadmin', 'admin', 'manager', 'staff'];
const VALID_STATUSES = ['In Stock', 'In Transit', 'Sold'];

// Postgres timestamp in the same UTC format SQLite uses: "YYYY-MM-DD HH:MM:SS"
const NOW = "(to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS'))";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS Stores (
  id         BIGSERIAL PRIMARY KEY,
  store_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS Brands (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  serial_prefix TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS Laptops (
  id               BIGSERIAL PRIMARY KEY,
  brand            TEXT NOT NULL,
  brand_model      TEXT NOT NULL,
  processor_type   TEXT,
  generation       TEXT,
  storage_type     TEXT,
  purchased_from   TEXT,
  graphics         TEXT,
  graphics_type    TEXT,
  graphics_model   TEXT,
  purchase_rate    NUMERIC,
  extra_charges    NUMERIC,
  serial_number    TEXT NOT NULL UNIQUE,
  current_store_id BIGINT,
  status           TEXT NOT NULL DEFAULT 'In Stock'
                   CHECK (status IN ('In Stock','In Transit','Sold')),
  created_at       TEXT NOT NULL DEFAULT ${NOW},
  updated_at       TEXT NOT NULL DEFAULT ${NOW},
  CONSTRAINT fk_store FOREIGN KEY (current_store_id) REFERENCES Stores(id)
);
CREATE TABLE IF NOT EXISTS TransferLogs (
  id            BIGSERIAL PRIMARY KEY,
  laptop_id     BIGINT NOT NULL,
  from_store_id BIGINT,
  to_store_id   BIGINT,
  changed_at    TEXT NOT NULL DEFAULT ${NOW},
  CONSTRAINT fk_tl_laptop FOREIGN KEY (laptop_id) REFERENCES Laptops(id),
  CONSTRAINT fk_tl_from  FOREIGN KEY (from_store_id) REFERENCES Stores(id),
  CONSTRAINT fk_tl_to    FOREIGN KEY (to_store_id) REFERENCES Stores(id)
);
CREATE TABLE IF NOT EXISTS Sales (
  id            BIGSERIAL PRIMARY KEY,
  laptop_id     BIGINT,
  serial_number TEXT,
  brand_model   TEXT,
  store_id      BIGINT,
  sale_price    NUMERIC NOT NULL,
  cost_price    NUMERIC,
  profit        NUMERIC,
  sold_at       TEXT NOT NULL DEFAULT ${NOW},
  sold_by       TEXT,
  CONSTRAINT fk_sale_laptop FOREIGN KEY (laptop_id) REFERENCES Laptops(id),
  CONSTRAINT fk_sale_store  FOREIGN KEY (store_id) REFERENCES Stores(id)
);
CREATE TABLE IF NOT EXISTS Users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'staff'
                CHECK (role IN ('superadmin','admin','manager','staff')),
  created_at    TEXT NOT NULL DEFAULT ${NOW}
);
CREATE TABLE IF NOT EXISTS Settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS LoginLogs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  username   TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  logged_in  TEXT NOT NULL DEFAULT ${NOW},
  CONSTRAINT fk_login_user FOREIGN KEY (user_id) REFERENCES Users(id)
);
CREATE TABLE IF NOT EXISTS Repairs (
  id            BIGSERIAL PRIMARY KEY,
  laptop_id     BIGINT,
  serial_number TEXT,
  brand_model   TEXT,
  issue         TEXT NOT NULL,
  vendor        TEXT,
  cost          NUMERIC NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'Pending'
                CHECK (status IN ('Pending','In Progress','Repaired')),
  notes         TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT ${NOW},
  updated_at    TEXT NOT NULL DEFAULT ${NOW},
  CONSTRAINT fk_repair_laptop FOREIGN KEY (laptop_id) REFERENCES Laptops(id) ON DELETE SET NULL
);
`;

const q = (sql, params = []) => pool.query(sql, params).then((r) => r.rows);

// Run a typed callback inside a single transaction (acquired client).
async function inTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Init: create schema + seed defaults (idempotent)
// ---------------------------------------------------------------------------
async function init() {
  await pool.query(SCHEMA);
  await seed();
}

async function seed() {
  // Stores
  const storeCount = (await q('SELECT COUNT(*)::int AS n FROM Stores'))[0].n;
  if (storeCount === 0) {
    const stores = [
      'Store 1: Main Flagship',
      'Store 2: North Hub',
      'Store 3: South Branch',
      'Store 4: East Outlet',
      'Store 5: West Showroom',
      'Store 6: Downtown Express',
      'Store 7: Central Warehouse'
    ];
    await inTx((c) =>
      Promise.all(stores.map((n) => c.query('INSERT INTO Stores (store_name) VALUES ($1) ON CONFLICT DO NOTHING', [n])))
    );
  }

  // Brands
  const brandCount = (await q('SELECT COUNT(*)::int AS n FROM Brands'))[0].n;
  if (brandCount === 0) {
    await Promise.all(
      [['HP', 'HP010'], ['Asus', 'AS010'], ['Dell', 'DL010']].map(([n, p]) =>
        q('INSERT INTO Brands (name, serial_prefix) VALUES ($1,$2) ON CONFLICT DO NOTHING', [n, p])
      )
    );
  }

  // Users (superadmin + admin)
  const userCount = (await q('SELECT COUNT(*)::int AS n FROM Users'))[0].n;
  if (userCount === 0) {
    await inTx(async (c) => {
      await c.query('INSERT INTO Users (username, password_hash, display_name, role) VALUES ($1,$2,$3,$4)', [
        'superadmin', bcrypt.hashSync('superadmin123', 10), 'Super Administrator', 'superadmin'
      ]);
      await c.query('INSERT INTO Users (username, password_hash, display_name, role) VALUES ($1,$2,$3,$4)', [
        'admin', bcrypt.hashSync('admin123', 10), 'System Administrator', 'admin'
      ]);
    });
  }
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------
async function getStores() {
  return q('SELECT id, store_name FROM Stores ORDER BY id');
}
async function getStore(id) {
  if (id == null) return undefined;
  const rows = await q('SELECT id, store_name FROM Stores WHERE id = $1', [id]);
  return rows[0];
}
async function storeName(id) {
  return (await getStore(id))?.store_name;
}

async function addStore(storeName) {
  const name = (storeName || '').trim();
  if (!name) return { error: 'store_name is required' };
  const exists = await q('SELECT id FROM Stores WHERE store_name = $1', [name]);
  if (exists.length) return { error: 'A store with that name already exists' };
  const r = await q('INSERT INTO Stores (store_name) VALUES ($1) RETURNING *', [name]);
  return { store: r[0] };
}

async function renameStore(storeId, storeName) {
  const store = await getStore(storeId);
  if (!store) return { error: 'Store not found' };
  const name = (storeName || '').trim();
  if (!name) return { error: 'store_name cannot be empty' };
  const clash = await q('SELECT id FROM Stores WHERE store_name = $1 AND id != $2', [name, storeId]);
  if (clash.length) return { error: 'A store with that name already exists' };
  await q('UPDATE Stores SET store_name = $1 WHERE id = $2', [name, storeId]);
  return { store: await getStore(storeId) };
}

async function deleteStore(storeId) {
  const store = await getStore(storeId);
  if (!store) return { error: 'Store not found' };
  const total = (await q('SELECT COUNT(*)::int AS n FROM Stores'))[0].n;
  if (total <= 1) return { error: 'Cannot remove the last store' };
  const assigned = (await q('SELECT COUNT(*)::int AS n FROM Laptops WHERE current_store_id = $1', [storeId]))[0].n;
  if (assigned > 0) return { error: `Cannot remove: ${assigned} laptop(s) still assigned. Move them first.` };
  const logs = (await q('SELECT COUNT(*)::int AS n FROM TransferLogs WHERE from_store_id = $1 OR to_store_id = $1', [storeId]))[0].n;
  if (logs > 0) return { error: 'Cannot remove: store appears in transfer history.' };
  await q('DELETE FROM Stores WHERE id = $1', [storeId]);
  return { ok: true, id: storeId };
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------
async function getBrands() {
  return q('SELECT id, name, serial_prefix FROM Brands ORDER BY name');
}
async function getBrand(id) {
  const r = await q('SELECT id, name, serial_prefix FROM Brands WHERE id = $1', [id]);
  return r[0];
}

async function addBrand({ name, serial_prefix }) {
  const brandName = (name || '').trim();
  const prefix = (serial_prefix || '').trim();
  if (!brandName) return { error: 'name is required' };
  if (!prefix) return { error: 'serial_prefix is required' };
  const exists = await q('SELECT id FROM Brands WHERE name = $1', [brandName]);
  if (exists.length) return { error: 'A brand with that name already exists' };
  const r = await q('INSERT INTO Brands (name, serial_prefix) VALUES ($1,$2) RETURNING *', [brandName, prefix]);
  return { brand: r[0] };
}

async function updateBrand(id, { name, serial_prefix }) {
  const brand = await getBrand(id);
  if (!brand) return { error: 'Brand not found' };
  const brandName = name != null ? (name || '').trim() : brand.name;
  const prefix = serial_prefix != null ? (serial_prefix || '').trim() : brand.serial_prefix;
  if (!brandName) return { error: 'name cannot be empty' };
  if (!prefix) return { error: 'serial_prefix cannot be empty' };
  const clash = await q('SELECT id FROM Brands WHERE name = $1 AND id != $2', [brandName, id]);
  if (clash.length) return { error: 'A brand with that name already exists' };
  await q('UPDATE Brands SET name = $1, serial_prefix = $2 WHERE id = $3', [brandName, prefix, id]);
  return { brand: await getBrand(id) };
}

async function deleteBrand(id) {
  const brand = await getBrand(id);
  if (!brand) return { error: 'Brand not found' };
  const used = (await q('SELECT COUNT(*)::int AS n FROM Laptops WHERE brand = $1', [brand.name]))[0].n;
  if (used > 0) return { error: 'Cannot remove: laptops exist with this brand. Move/delete them first.' };
  await q('DELETE FROM Brands WHERE id = $1', [id]);
  return { ok: true, id };
}

async function generateSerial(prefix) {
  const prefixUpper = (prefix || '').toUpperCase();
  const rows = await q('SELECT serial_number FROM Laptops WHERE serial_number LIKE $1', [`${prefixUpper}%`]);
  let max = 0;
  rows.forEach((m) => {
    const n = parseInt(String(m.serial_number).slice(prefixUpper.length), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  });
  return prefixUpper + String(max + 1).padStart(3, '0');
}

// ---------------------------------------------------------------------------
// Laptops
// ---------------------------------------------------------------------------
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
    purchase_rate: l.purchase_rate == null ? null : Number(l.purchase_rate),
    extra_charges: l.extra_charges == null ? null : Number(l.extra_charges),
    serial_number: l.serial_number,
    current_store_id: l.current_store_id,
    status: l.status,
    created_at: l.created_at,
    updated_at: l.updated_at
  };
}

// Rehydrate a laptop row + join store name.
async function getLaptop(id) {
  const r = await q(
    `SELECT l.*, s.store_name AS current_store_name
     FROM Laptops l LEFT JOIN Stores s ON s.id = l.current_store_id WHERE l.id = $1`,
    [id]
  );
  return r[0] ? { ...r[0], purchase_rate: r[0].purchase_rate == null ? null : Number(r[0].purchase_rate), extra_charges: r[0].extra_charges == null ? null : Number(r[0].extra_charges) } : undefined;
}

async function getLaptops(filters = {}) {
  const clauses = [];
  const params = [];
  let i = 1;
  if (filters.status) { clauses.push(`l.status = $${i++}`); params.push(filters.status); }
  if (filters.storeId) { clauses.push(`l.current_store_id = $${i++}`); params.push(filters.storeId); }
  if (filters.brand) { clauses.push(`l.brand = $${i++}`); params.push(filters.brand); }
  if (filters.search) {
    clauses.push(`(l.brand ILIKE $${i++} OR l.brand_model ILIKE $${i++} OR l.serial_number ILIKE $${i++})`);
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await q(
    `SELECT l.*, s.store_name AS current_store_name
     FROM Laptops l LEFT JOIN Stores s ON s.id = l.current_store_id
     ${where} ORDER BY l.updated_at DESC`,
    params
  );
  return rows.map((r) => ({ ...r, purchase_rate: r.purchase_rate == null ? null : Number(r.purchase_rate), extra_charges: r.extra_charges == null ? null : Number(r.extra_charges) }));
}

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

async function validateLaptop(l) {
  if (!l.brand) return { error: 'brand is required' };
  if (!l.brand_model) return { error: 'brand_model is required' };
  if (!VALID_STATUSES.includes(l.status)) return { error: 'Invalid status' };
  if (l.current_store_id != null && !(await getStore(l.current_store_id))) return { error: 'Store not found' };
  return null;
}

async function createLaptop(data, _opts = {}) {
  const serial = (data.serial_number || '').trim();
  const l = normalizeLaptop(data);
  const err = await validateLaptop(l);
  if (err) return err;
  if (!serial) return { error: 'serial_number is required' };
  const exists = await q('SELECT id FROM Laptops WHERE serial_number = $1', [serial]);
  if (exists.length) return { error: `Serial ${serial} already exists` };
  const r = await q(
    `INSERT INTO Laptops (brand, brand_model, processor_type, generation, storage_type, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, ${NOW}) RETURNING id`,
    [l.brand, l.brand_model, l.processor_type, l.generation, l.storage_type, l.purchased_from, l.graphics, l.graphics_type, l.graphics_model, l.purchase_rate, l.extra_charges, serial, l.current_store_id, l.status]
  );
  return { laptop: await getLaptop(r[0].id) };
}

async function createLaptopsBulk(data, quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 1000) return { error: 'quantity must be an integer between 1 and 1000' };
  const allBrands = await getBrands();
  const brandRow = allBrands.find((b) => b.name.toLowerCase() === String(data.brand || '').trim().toLowerCase());
  const prefix = (data.serial_prefix || (brandRow && brandRow.serial_prefix) || '').trim();
  if (!prefix) return { error: 'Could not determine serial prefix. Add this brand first or provide a prefix.' };

  const probe = await validateLaptop(normalizeLaptop(data));
  if (probe) return probe;

  const results = [];
  let lastError = null;
  await inTx(async (c) => {
    for (let i2 = 0; i2 < qty; i2++) {
      const serial = await generateSerial(prefix);
      const exists = await c.query('SELECT id FROM Laptops WHERE serial_number = $1', [serial]);
      if (exists.rows.length) { lastError = `Serial ${serial} already exists`; break; }
      const l = normalizeLaptop({ ...data, serial_number: serial });
      const err = await validateLaptop(l);
      if (err) { lastError = err.error; break; }
      const ins = await c.query(
        `INSERT INTO Laptops (brand, brand_model, processor_type, generation, storage_type, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, ${NOW}) RETURNING id`,
        [l.brand, l.brand_model, l.processor_type, l.generation, l.storage_type, l.purchased_from, l.graphics, l.graphics_type, l.graphics_model, l.purchase_rate, l.extra_charges, serial, l.current_store_id, l.status]
      );
      results.push(await getLaptop(ins.rows[0].id));
    }
  });
  if (lastError) return { error: lastError, created: results };
  return { laptops: results };
}

async function updateLaptop(laptopId, data) {
  const laptop = await q('SELECT * FROM Laptops WHERE id = $1', [laptopId]);
  if (!laptop.length) return { error: 'Laptop not found' };
  const l = normalizeLaptop(data, laptop[0]);
  const err = await validateLaptop(l);
  if (err) return err;
  await q(
    `UPDATE Laptops SET brand=$1, brand_model=$2, processor_type=$3, generation=$4, storage_type=$5,
       purchased_from=$6, graphics=$7, graphics_type=$8, graphics_model=$9, purchase_rate=$10, extra_charges=$11,
       current_store_id=$12, status=$13, updated_at=${NOW} WHERE id=$14`,
    [l.brand, l.brand_model, l.processor_type, l.generation, l.storage_type, l.purchased_from, l.graphics, l.graphics_type, l.graphics_model, l.purchase_rate, l.extra_charges, l.current_store_id, l.status, laptopId]
  );
  return { laptop: await getLaptop(laptopId) };
}

async function deleteLaptop(laptopId) {
  const laptop = await q('SELECT id FROM Laptops WHERE id = $1', [laptopId]);
  if (!laptop.length) return { error: 'Laptop not found' };
  await inTx(async (c) => {
    await c.query('DELETE FROM Sales WHERE laptop_id = $1', [laptopId]);
    await c.query('DELETE FROM TransferLogs WHERE laptop_id = $1', [laptopId]);
    await c.query('DELETE FROM Laptops WHERE id = $1', [laptopId]);
  });
  return { ok: true, id: laptopId };
}

async function transferLaptop(laptopId, toStoreId) {
  const laptop = await q('SELECT * FROM Laptops WHERE id = $1', [laptopId]);
  if (!laptop.length) return { error: 'Laptop not found' };
  const toStore = await getStore(toStoreId);
  if (!toStore) return { error: 'Destination store not found' };
  const fromStore = await getStore(laptop[0].current_store_id);
  const fromStoreId = laptop[0].current_store_id ?? null;
  await inTx(async (c) => {
    await c.query(`UPDATE Laptops SET current_store_id = $1, updated_at = ${NOW} WHERE id = $2`, [toStoreId, laptopId]);
    await c.query('INSERT INTO TransferLogs (laptop_id, from_store_id, to_store_id) VALUES ($1,$2,$3)', [laptopId, fromStoreId, toStoreId]);
  });
  return { ok: true, laptop: await getLaptop(laptopId), from: fromStore, to: toStore };
}

async function getTransferLogs(limit = 100) {
  return q(
    `SELECT tl.id, tl.laptop_id, tl.from_store_id, tl.to_store_id, tl.changed_at,
            l.brand_model, l.serial_number,
            fs.store_name AS from_store_name, ts.store_name AS to_store_name
     FROM TransferLogs tl
     JOIN Laptops l ON l.id = tl.laptop_id
     LEFT JOIN Stores fs ON fs.id = tl.from_store_id
     LEFT JOIN Stores ts ON ts.id = tl.to_store_id
     ORDER BY tl.changed_at DESC LIMIT $1`,
    [limit]
  );
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------
async function sellLaptop(laptopId, salePrice, soldBy) {
  const laptop = await getLaptop(laptopId);
  if (!laptop) return { error: 'Laptop not found' };
  if (laptop.status === 'Sold') return { error: 'Laptop is already sold' };
  const price = Number(salePrice);
  if (!Number.isFinite(price) || price < 0) return { error: 'sale_price is required' };
  const cost = (laptop.purchase_rate || 0) + (laptop.extra_charges || 0);
  const profit = price - cost;
  const r = await inTx(async (c) => {
    const ins = await c.query(
      `INSERT INTO Sales (laptop_id, serial_number, brand_model, store_id, sale_price, cost_price, profit, sold_at, sold_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7, ${NOW}, $8) RETURNING *`,
      [laptopId, laptop.serial_number, laptop.brand_model, laptop.current_store_id, price, cost, profit, soldBy || null]
    );
    await c.query(`UPDATE Laptops SET status = 'Sold', updated_at = ${NOW} WHERE id = $1`, [laptopId]);
    return ins.rows[0];
  });
  return { sale: { ...r, store_name: await storeName(r.store_id), sale_price: Number(r.sale_price), cost_price: Number(r.cost_price), profit: Number(r.profit) } };
}

async function getSales() {
  const rows = await q('SELECT * FROM Sales ORDER BY sold_at DESC');
  return Promise.all(rows.map(async (s) => ({
    id: s.id,
    laptop_id: s.laptop_id,
    serial_number: s.serial_number,
    brand_model: s.brand_model,
    store_id: s.store_id,
    store_name: await storeName(s.store_id),
    sale_price: Number(s.sale_price),
    cost_price: s.cost_price == null ? null : Number(s.cost_price),
    profit: s.profit == null ? null : Number(s.profit),
    sold_at: s.sold_at,
    sold_by: s.sold_by
  })));
}

async function getSalesSummary() {
  const r = (await q('SELECT COUNT(*)::int AS count, COALESCE(SUM(sale_price),0) AS total_sales, COALESCE(SUM(profit),0) AS total_profit, COALESCE(SUM(cost_price),0) AS total_cost FROM Sales'))[0];
  return {
    count: r.count,
    total_sales: Number(r.total_sales),
    total_profit: Number(r.total_profit),
    total_cost: Number(r.total_cost)
  };
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
    cost: r.cost == null ? 0 : Number(r.cost),
    status: r.status,
    notes: r.notes,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}

async function getRepairs() {
  const rows = await q('SELECT * FROM Repairs ORDER BY updated_at DESC, id DESC');
  return rows.map(repairRow);
}

async function getRepair(id) {
  const r = await q('SELECT * FROM Repairs WHERE id = $1', [id]);
  return repairRow(r[0]);
}

async function createRepair(data) {
  const issue = (data.issue || '').trim();
  if (!issue) return { error: 'issue is required' };
  const r = await q(
    `INSERT INTO Repairs (laptop_id, serial_number, brand_model, issue, vendor, cost, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      data.laptop_id != null && data.laptop_id !== '' ? Number(data.laptop_id) : null,
      (data.serial_number || '').trim() || null,
      (data.brand_model || '').trim() || null,
      issue,
      (data.vendor || '').trim() || null,
      data.cost != null && data.cost !== '' ? Number(data.cost) : 0,
      (data.notes || '').trim() || null,
      (data.created_by || '').trim() || null
    ]
  );
  return { repair: repairRow(r[0]) };
}

async function updateRepair(id, data) {
  const rows = await q('SELECT * FROM Repairs WHERE id = $1', [id]);
  if (!rows.length) return { error: 'Repair record not found' };
  const repair = rows[0];
  const issue = data.issue != null ? String(data.issue).trim() : repair.issue;
  if (!issue) return { error: 'issue is required' };
  const status = data.status != null ? String(data.status).trim() : repair.status;
  if (!REPAIR_STATUSES.includes(status)) return { error: 'Invalid repair status' };
  const r = await q(
    `UPDATE Repairs SET laptop_id=$1, serial_number=$2, brand_model=$3, issue=$4, vendor=$5, cost=$6, status=$7, notes=$8, updated_at=${NOW}
     WHERE id=$9 RETURNING *`,
    [
      data.laptop_id !== undefined && data.laptop_id !== null && data.laptop_id !== '' ? Number(data.laptop_id) : repair.laptop_id,
      data.serial_number !== undefined ? (String(data.serial_number).trim() || null) : repair.serial_number,
      data.brand_model !== undefined ? (String(data.brand_model).trim() || null) : repair.brand_model,
      issue,
      data.vendor !== undefined ? (String(data.vendor).trim() || null) : repair.vendor,
      data.cost !== undefined && data.cost !== null && data.cost !== '' ? Number(data.cost) : repair.cost,
      status,
      data.notes !== undefined ? (String(data.notes).trim() || null) : repair.notes,
      id
    ]
  );
  return { repair: repairRow(r[0]) };
}

async function deleteRepair(id) {
  const r = await q('SELECT id FROM Repairs WHERE id = $1', [id]);
  if (!r.length) return { error: 'Repair record not found' };
  await q('DELETE FROM Repairs WHERE id = $1', [id]);
  return { ok: true, id };
}

async function getRepairsSummary() {
  const r = (await q(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'In Progress')::int AS in_progress,
            COUNT(*) FILTER (WHERE status = 'Repaired')::int AS repaired,
            COALESCE(SUM(COALESCE(cost, 0)), 0) AS total_cost
     FROM Repairs`
  ))[0];
  return {
    total: r.total || 0,
    pending: r.pending || 0,
    in_progress: r.in_progress || 0,
    repaired: r.repaired || 0,
    total_cost: Number(r.total_cost) || 0
  };
}

// ---------------------------------------------------------------------------
// Purchases (ledger over Laptops)
// ---------------------------------------------------------------------------
async function getPurchases() {
  const rows = await q(
    `SELECT l.*, s.store_name AS current_store_name
     FROM Laptops l LEFT JOIN Stores s ON s.id = l.current_store_id
     ORDER BY l.created_at DESC, l.id DESC`
  );
  return rows.map((r) => ({ ...r, purchase_rate: r.purchase_rate == null ? null : Number(r.purchase_rate), extra_charges: r.extra_charges == null ? null : Number(r.extra_charges) }));
}

async function getPurchasesSummary() {
  const r = (await q(
    `SELECT COUNT(*)::int AS total_units,
            COALESCE(SUM(COALESCE(purchase_rate, 0)), 0) AS total_rate,
            COALESCE(SUM(COALESCE(extra_charges, 0)), 0) AS total_charges,
            COALESCE(SUM(COALESCE(purchase_rate, 0) + COALESCE(extra_charges, 0)), 0) AS total_value
     FROM Laptops`
  ))[0];
  const m = (await q(
    `SELECT COUNT(*)::int AS month_units,
            COALESCE(SUM(COALESCE(purchase_rate, 0) + COALESCE(extra_charges, 0)), 0) AS month_value
     FROM Laptops WHERE created_at >= to_char(date_trunc('month', now()), 'YYYY-MM-DD HH24:MI:SS')`
  ))[0];
  return {
    total_units: r.total_units || 0,
    total_rate: Number(r.total_rate) || 0,
    total_charges: Number(r.total_charges) || 0,
    total_value: Number(r.total_value) || 0,
    month_units: m.month_units || 0,
    month_value: Number(m.month_value) || 0
  };
}

// ---------------------------------------------------------------------------
// Users (auth)
// ---------------------------------------------------------------------------
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, display_name: u.display_name, role: u.role, created_at: u.created_at };
}

async function createUser({ username, password, display_name, role = 'staff' }) {
  const name = (username || '').trim().toLowerCase();
  const display = (display_name || '').trim();
  if (!name) return { error: 'username is required' };
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) return { error: 'Username must be 3-32 chars: letters, numbers, . _ -' };
  if (!password || String(password).length < 6) return { error: 'Password must be at least 6 characters' };
  if (!ROLES.includes(role)) return { error: 'Invalid role' };
  const exists = await q('SELECT id FROM Users WHERE username = $1', [name]);
  if (exists.length) return { error: 'Username already taken' };
  const hash = bcrypt.hashSync(String(password), 10);
  const r = await q('INSERT INTO Users (username, password_hash, display_name, role) VALUES ($1,$2,$3,$4) RETURNING *', [name, hash, display || name, role]);
  return { user: publicUser(r[0]) };
}

async function getUserById(id) {
  const r = await q('SELECT * FROM Users WHERE id = $1', [id]);
  return r[0];
}

async function getUserByUsername(username) {
  const r = await q('SELECT * FROM Users WHERE username = $1', [(username || '').trim().toLowerCase()]);
  return r[0];
}

async function verifyPassword(user, password) {
  return user && bcrypt.compareSync(String(password || ''), user.password_hash);
}

async function recordLogin(userId, username, ip, userAgent) {
  await q('INSERT INTO LoginLogs (user_id, username, ip, user_agent) VALUES ($1,$2,$3,$4)', [userId, username, ip, userAgent || null]);
}

async function getLoginLogs(limit = 200) {
  return q('SELECT id, user_id, username, ip, user_agent, logged_in FROM LoginLogs ORDER BY logged_in DESC LIMIT $1', [limit]);
}

async function getUsers() {
  return q('SELECT id, username, display_name, role, created_at FROM Users ORDER BY id');
}

async function updateUser(userId, { username, password, display_name, role } = {}) {
  const rows = await q('SELECT * FROM Users WHERE id = $1', [userId]);
  if (!rows.length) return { error: 'User not found' };
  const user = rows[0];
  const name = username != null ? String(username).trim().toLowerCase() : user.username;
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) return { error: 'Username must be 3-32 chars: letters, numbers, . _ -' };
  if (role != null && !ROLES.includes(role)) return { error: 'Invalid role' };
  if (password != null && String(password) !== '' && String(password).length < 6) return { error: 'Password must be at least 6 characters' };
  const clash = await q('SELECT id FROM Users WHERE username = $1 AND id != $2', [name, userId]);
  if (clash.length) return { error: 'Username already taken' };
  const display = display_name != null ? String(display_name).trim() : user.display_name;
  const finalRole = role != null ? role : user.role;
  const hash = password && String(password) !== '' ? bcrypt.hashSync(String(password), 10) : user.password_hash;
  await q('UPDATE Users SET username = $1, password_hash = $2, display_name = $3, role = $4 WHERE id = $5', [name, hash, display || name, finalRole, userId]);
  return { user: publicUser(await getUserById(userId)) };
}

async function deleteUser(userId) {
  const r = await q('SELECT id FROM Users WHERE id = $1', [userId]);
  if (!r.length) return { error: 'User not found' };
  await q('DELETE FROM Users WHERE id = $1', [userId]);
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

async function getSettings() {
  const rows = await q('SELECT key, value FROM Settings');
  const settings = { ...DEFAULT_SETTINGS };
  rows.forEach((r) => { settings[r.key] = r.value; });
  return settings;
}

async function setSettings(patch = {}) {
  await inTx(async (c) => {
    for (const [k, v] of Object.entries(patch)) {
      await c.query(
        'INSERT INTO Settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [String(k), String(v ?? '')]
      );
    }
  });
  return getSettings();
}

// Remote drivers: no-op polling (mirrors gas/sheets API).
const startPolling = () => null;

module.exports = {
  driver: 'postgres',
  init,
  startPolling,
  pool,
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