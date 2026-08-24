/**
 * archive-to-sheets.js
 * Monthly archival: moves records older than ARCHIVE_AGE_DAYS (default 25) from
 * Supabase into Google Sheets ("Archive*" tabs), then removes them from the live
 * tables so the inventory app stays lean. Run as a GitHub Actions scheduled job.
 *
 * Ordering matters for referential integrity (Sales + TransferLogs reference
 * Laptops), so sold laptops are archived last and any of their still-live child
 * records are archived together with them.
 *
 * Secrets are read from the environment only (never from the repo):
 *   DATABASE_URL       Supabase pooler connection string
 *   GAS_WEBAPP_URL     Apps Script web-app URL
 *   GAS_KEY            CONFIG.key inside that Apps Script
 *   ARCHIVE_AGE_DAYS   records older than this many days are archived (default 25)
 *
 * Requires the `appendRows` action in the Apps Script (backend/sheets-search.gs).
 * Archive tabs are auto-created with a header row on first use.
 *
 * Exit codes: 0 = ok, 1 = fatal (missing env / GAS rejected / DB down)
 */

const { Client } = require('pg');
const dns = require('dns').promises;

const GAS_URL = process.env.GAS_WEBAPP_URL || '';
const GAS_KEY = process.env.GAS_KEY || '';
const AGE_DAYS = Number(process.env.ARCHIVE_AGE_DAYS || 25);

// Archive tab layouts: tab name -> column headers (must match the DB columns).
const TABS = {
  Sales: ['id', 'laptop_id', 'serial_number', 'brand_model', 'store_id', 'sale_price',
    'cost_price', 'profit', 'sold_by', 'sold_at', 'customer_id'],
  TransferLogs: ['id', 'laptop_id', 'from_store_id', 'to_store_id', 'transferred_by', 'changed_at'],
  Repairs: ['id', 'laptop_id', 'serial_number', 'brand_model', 'issue', 'vendor', 'cost',
    'charge', 'status', 'notes', 'created_by', 'created_at', 'updated_at'],
  Purchases: ['id', 'purchased_at', 'brand', 'brand_model', 'serial_number', 'processor',
    'generation', 'ram', 'storage', 'graphics', 'purchased_from', 'purchase_rate',
    'extra_charges', 'quantity', 'current_store_id', 'status', 'created_by', 'created_at'],
  Laptops: ['id', 'brand', 'brand_model', 'product_line', 'processor_type', 'generation',
    'storage_type', 'storage_size', 'ram', 'charger', 'purchased_from', 'graphics',
    'graphics_type', 'graphics_model', 'purchase_rate', 'extra_charges', 'serial_number',
    'current_store_id', 'status', 'purchase_comment', 'purchaser_aadhar_hash',
    'created_at', 'updated_at']
};

// Sold laptops older than the cutoff (these are archived and removed).
const OLD_SOLD_LAPTOPS = `SELECT id FROM public.laptops WHERE status = 'Sold' AND updated_at < $1`;

// Child records: either older than the cutoff, or tied to a laptop being archived
// (so no orphan references are left behind).
const OLD_SALES = `SELECT * FROM public.sales WHERE sold_at < $1 OR laptop_id = ANY($2)`;
const OLD_TRANSFERS = `SELECT * FROM public.transferlogs WHERE changed_at < $1 OR laptop_id = ANY($2)`;
const OLD_REPAIRS = `SELECT * FROM public.repairs WHERE updated_at < $1`;
const OLD_PURCHASES = `SELECT * FROM public.purchases WHERE purchased_at < $1`;

const DEL_SALES = `DELETE FROM public.sales WHERE sold_at < $1 OR laptop_id = ANY($2)`;
const DEL_TRANSFERS = `DELETE FROM public.transferlogs WHERE changed_at < $1 OR laptop_id = ANY($2)`;
const DEL_REPAIRS = `DELETE FROM public.repairs WHERE updated_at < $1`;
const DEL_PURCHASES = `DELETE FROM public.purchases WHERE purchased_at < $1`;
const DEL_LAPTOPS = `DELETE FROM public.laptops WHERE status = 'Sold' AND updated_at < $1`;

function fmt(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

async function connectWithRetry(connectionString, maxRetries = 5) {
  const url = new URL(connectionString);
  const host = url.hostname;
  
  console.log(`[archive] Database host: ${host}`);
  
  // Pre-check DNS resolution
  try {
    const resolved = await dns.lookup(host);
    console.log(`[archive] DNS resolved ${host} to ${resolved.address}`);
  } catch (dnsError) {
    console.error(`[archive] WARNING: DNS resolution failed for ${host}: ${dnsError.message}`);
    console.error('[archive] Proceeding anyway - connection may still work or fail with more details');
  }
  
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 20000,  // Increased from 15s to 20s
      query_timeout: 60000,
      statement_timeout: 60000
    });
    try {
      await client.connect();
      if (attempt > 1) console.log(`[archive] database connection succeeded on attempt ${attempt}`);
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      if (attempt === maxRetries) break;
      const delay = Math.min(2 ** (attempt - 1) * 1000, 10000); // Cap at 10s
      console.log(`[archive] database connection attempt ${attempt} failed: ${error.message}; retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function gasAppendRows(table, headers, rows) {
  if (!GAS_URL) throw new Error('GAS_WEBAPP_URL is not set');
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const url = new URL(GAS_URL);
    url.searchParams.set('action', 'appendRows');
    url.searchParams.set('table', table);
    url.searchParams.set('headers', JSON.stringify(headers));
    url.searchParams.set('values', JSON.stringify(chunk));
    url.searchParams.set('key', GAS_KEY);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60000);
    try {
      const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow', signal: ac.signal });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || `gas appendRows failed (HTTP ${res.status})`);
    } finally {
      clearTimeout(timer);
    }
  }
}

// Append the selected rows to the archive tab, then delete them from Supabase.
// Append happens first so a failed append never deletes data.
async function archiveStep(client, { selectSql, params, deleteSql, delParams, tab, headers }) {
  const { rows } = await client.query(selectSql, params);
  if (!rows.length) {
    console.log(`[archive] ${tab}: 0 rows`);
    return 0;
  }
  const body = rows.map((r) => headers.map((h) => fmt(r[h])));
  await gasAppendRows(tab, headers, body);
  const del = await client.query(deleteSql, delParams);
  console.log(`[archive] ${tab}: ${rows.length} rows`);
  return del.rowCount;
}

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!GAS_URL || !GAS_KEY) throw new Error('GAS_WEBAPP_URL / GAS_KEY are not set');
  const client = await connectWithRetry(process.env.DATABASE_URL.trim());

  const cutoff = new Date(Date.now() - AGE_DAYS * 86400000);
  const t0 = Date.now();

  await client.query('BEGIN');
  try {
    const sold = await client.query(OLD_SOLD_LAPTOPS, [cutoff.toISOString()]);
    const ids = sold.rows.map((r) => r.id);
    const params = [cutoff.toISOString(), ids];

    let total = 0;
    total += await archiveStep(client, { selectSql: OLD_SALES, params, deleteSql: DEL_SALES, delParams: params, tab: 'ArchiveSales', headers: TABS.Sales });
    total += await archiveStep(client, { selectSql: OLD_TRANSFERS, params, deleteSql: DEL_TRANSFERS, delParams: params, tab: 'ArchiveTransferLogs', headers: TABS.TransferLogs });
    const cutoffOnly = [cutoff.toISOString()];
    total += await archiveStep(client, { selectSql: OLD_REPAIRS, params: cutoffOnly, deleteSql: DEL_REPAIRS, delParams: cutoffOnly, tab: 'ArchiveRepairs', headers: TABS.Repairs });
    total += await archiveStep(client, { selectSql: OLD_PURCHASES, params: cutoffOnly, deleteSql: DEL_PURCHASES, delParams: cutoffOnly, tab: 'ArchivePurchases', headers: TABS.Purchases });
    total += await archiveStep(client, { selectSql: OLD_SOLD_LAPTOPS, params: [cutoff.toISOString()], deleteSql: DEL_LAPTOPS, delParams: [cutoff.toISOString()], tab: 'ArchiveLaptops', headers: TABS.Laptops });

    await client.query('COMMIT');
    console.log(`[archive] done, ${total} rows archived (cutoff: ${cutoff.toISOString()}) in ${Date.now() - t0}ms`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

// Hard watchdog: never let the runner hang (GH Actions default is 6h).
setTimeout(() => { console.error('[archive] watchdog: exceeded 10 min, exiting'); process.exit(1); }, 10 * 60 * 1000).unref();

run().then(
  () => process.exit(0),
  (e) => {
    console.error('[archive] FAILED:', e.message);
    process.exit(1);
  }
);
