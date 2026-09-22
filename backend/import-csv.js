/**
 * import-csv.js — one-time migration from the old Supabase app into SQLite.
 *
 * 1) In the OLD app: Reports tab → download inventory / sales / transfers CSVs.
 * 2) On the VPS:  node import-csv.js [--merge|--replace] inventory.csv [sales.csv] [transfers.csv]
 *
 * --merge   (default) keep existing rows, skip duplicate serials.
 * --replace wipe business data first (keeps stores, brands, users, settings).
 *
 * Respects DATA_DIR env like server.js.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const replace = args.includes('--replace');
const files = args.filter((a) => !a.startsWith('--'));
const [inventoryFile, salesFile, transfersFile] = files;

if (!inventoryFile) {
  console.error('Usage: node import-csv.js [--merge|--replace] inventory.csv [sales.csv] [transfers.csv]');
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.some((c) => String(c).trim() !== '')).map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

const { db } = require('./db');

if (replace) {
  console.log('Wiping business data (keeping stores, brands, users, settings)…');
  db.exec('DELETE FROM Sales');
  db.exec('DELETE FROM Repairs');
  db.exec('DELETE FROM TransferLogs');
  db.exec('DELETE FROM PendingTransfers');
  db.exec('DELETE FROM Laptops');
  db.exec('DELETE FROM Customers');
  db.exec('DELETE FROM DeleteLogs');
} else {
  const n = db.prepare('SELECT COUNT(*) AS n FROM Laptops').get().n;
  if (n > 0) console.log(`Merging into ${n} existing laptop(s) — duplicates skipped.`);
}

function ensureStore(name) {
  const n = (name || '').trim();
  if (!n) return null;
  let s = db.prepare('SELECT * FROM Stores WHERE store_name = ?').get(n);
  if (!s) {
    const info = db.prepare('INSERT INTO Stores (store_name) VALUES (?)').run(n);
    s = db.prepare('SELECT * FROM Stores WHERE id = ?').get(info.lastInsertRowid);
    console.log(`  + store: ${n}`);
  }
  return s.id;
}

function splitStorage(v) {
  const s = (v || '').trim();
  if (!s) return { size: null, type: null };
  const m = s.match(/^([\d.]+)\s*(.*)$/);
  if (m) return { size: m[1] || null, type: (m[2] || '').trim() || null };
  return { size: null, type: s };
}

const VALID = ['In Stock', 'In Transit', 'Sold'];
let invNew = 0, invSkip = 0;
{
  const rows = parseCsv(fs.readFileSync(path.resolve(inventoryFile), 'utf8'));
  console.log(`Inventory CSV: ${rows.length} row(s)`);
  const insert = db.prepare(
    `INSERT INTO Laptops (brand, product_line, brand_model, processor_type, ram, generation, storage_type, storage_size,
      purchased_from, purchase_rate, serial_number, condition, current_store_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Good', ?, ?, ?, ?)`
  );
  for (const r of rows) {
    const serial = r['Serial'] || r['serial'] || '';
    if (!serial) { invSkip++; continue; }
    if (db.prepare('SELECT id FROM Laptops WHERE serial_number = ?').get(serial)) { invSkip++; continue; }
    const st = splitStorage(r['Storage']);
    const status = VALID.includes(r['Status']) ? r['Status'] : 'In Stock';
    const storeId = ensureStore(r['Store']);
    const rate = r['Purchase Rate'] !== '' && r['Purchase Rate'] != null ? Number(String(r['Purchase Rate']).replace(/[^0-9.-]/g, '')) : null;
    insert.run(
      r['Brand'] || '', r['Product Line'] || null, r['Model'] || r['Brand'] || '',
      r['Processor'] || null, r['RAM'] || null, r['Generation'] || null,
      st.type, st.size, r['Vendor'] || null,
      Number.isFinite(rate) ? rate : null, serial, storeId, status,
      r['Created At'] || new Date().toISOString().slice(0, 19).replace('T', ' '),
      new Date().toISOString().slice(0, 19).replace('T', ' ')
    );
    invNew++;
  }
  console.log(`  imported ${invNew}, skipped ${invSkip}`);
}

let salesNew = 0, salesSkip = 0;
if (salesFile) {
  const rows = parseCsv(fs.readFileSync(path.resolve(salesFile), 'utf8'));
  console.log(`Sales CSV: ${rows.length} row(s)`);
  for (const r of rows) {
    const serial = r['Serial'] || '';
    const lap = serial ? db.prepare('SELECT * FROM Laptops WHERE serial_number = ?').get(serial) : null;
    if (!lap) { salesSkip++; continue; }
    if (db.prepare('SELECT id FROM Sales WHERE laptop_id = ?').get(lap.id)) { salesSkip++; continue; }
    const price = Number(String(r['Sale Price'] || '0').replace(/[^0-9.-]/g, '')) || 0;
    const cost = r['Cost'] !== '' && r['Cost'] != null ? Number(String(r['Cost']).replace(/[^0-9.-]/g, '')) : (lap.purchase_rate || 0);
    db.prepare(
      `INSERT INTO Sales (laptop_id, serial_number, brand_model, store_id, sale_price, cost_price, profit, sold_at, sold_by, customer_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      lap.id, lap.serial_number, r['Laptop'] || lap.brand_model,
      ensureStore(r['Store']) || lap.current_store_id, price, cost, price - cost,
      r['Sold At'] || new Date().toISOString().slice(0, 19).replace('T', ' '),
      r['Sold By'] || null, r['Customer'] || null
    );
    db.prepare("UPDATE Laptops SET status = 'Sold', updated_at = datetime('now') WHERE id = ?").run(lap.id);
    salesNew++;
  }
  console.log(`  imported ${salesNew}, skipped ${salesSkip}`);
}

let trNew = 0, trSkip = 0;
if (transfersFile) {
  const rows = parseCsv(fs.readFileSync(path.resolve(transfersFile), 'utf8'));
  console.log(`Transfers CSV: ${rows.length} row(s)`);
  for (const r of rows) {
    const serial = r['Serial'] || '';
    const lap = serial ? db.prepare('SELECT id FROM Laptops WHERE serial_number = ?').get(serial) : null;
    if (!lap) { trSkip++; continue; }
    db.prepare(
      'INSERT INTO TransferLogs (laptop_id, from_store_id, to_store_id, changed_at, transferred_by) VALUES (?, ?, ?, ?, ?)'
    ).run(
      lap.id, ensureStore(r['From Store']), ensureStore(r['To Store']),
      r['Date / Time'] || new Date().toISOString().slice(0, 19).replace('T', ' '),
      r['Transferred By'] || null
    );
    trNew++;
  }
  console.log(`  imported ${trNew}, skipped ${trSkip}`);
}

console.log('Done.');
