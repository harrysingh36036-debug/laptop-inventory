/**
 * gas-sync.js
 * Headless Google Sheets sync relay for the Supabase-backed app.
 *
 * Runs as a cron job (GitHub Actions schedule): reads the inventory data from
 * Supabase Postgres (via DATABASE_URL) and pushes it to the Google Apps
 * Script-backed spreadsheet using the same GAS web-app contract that
 * backend/sheets.js used (readTable / replaceTable / appendRow).
 *
 * Secrets are read from the environment only (never from the repo):
 *   DATABASE_URL    - Supabase pooler connection string
 *   GAS_WEBAPP_URL  - Apps Script web-app URL
 *   GAS_KEY         - CONFIG.key inside that Apps Script
 *
 * Exit codes: 0 = ok, 1 = fatal (missing env / GAS rejected / DB down)
 */

const { Client } = require('pg');

const GAS_URL = process.env.GAS_WEBAPP_URL || '';
const GAS_KEY = process.env.GAS_KEY || '';

// Sheet layouts: tab -> column headers. Must match the Apps Script
// CONFIG.tables exactly (see backend/sheets.js TABS).
const TABS = {
  Stores: ['id', 'store_name', 'created_at'],
  Brands: ['id', 'name', 'serial_prefix', 'created_at'],
  Laptops: ['id', 'brand', 'brand_model', 'processor_type', 'generation', 'storage_type',
    'purchased_from', 'graphics', 'graphics_type', 'graphics_model', 'purchase_rate',
    'extra_charges', 'serial_number', 'current_store_id', 'status', 'created_at', 'updated_at'],
  TransferLogs: ['id', 'laptop_id', 'from_store_id', 'to_store_id', 'changed_at'],
  Sales: ['id', 'laptop_id', 'serial_number', 'brand_model', 'store_id', 'sale_price',
    'cost_price', 'profit', 'sold_at', 'sold_by'],
  Users: ['id', 'username', 'password_hash', 'display_name', 'role', 'created_at'],
  Settings: ['key', 'value'],
  LoginLogs: ['id', 'user_id', 'username', 'ip', 'user_agent', 'logged_in']
};

// SQL queries per tab (Tables mirror the public schema).
const QUERIES = {
  Stores: 'SELECT id, store_name, created_at FROM public.stores ORDER BY id',
  Brands: 'SELECT id, name, serial_prefix, created_at FROM public.brands ORDER BY id',
  Laptops: `SELECT id, brand, brand_model, processor_type, generation,
      CASE WHEN storage_size IS NOT NULL AND btrim(storage_size) <> '' THEN btrim(storage_size) || ' ' || storage_type
           ELSE storage_type END AS storage_type,
      purchased_from, graphics, graphics_type, graphics_model, purchase_rate,
      extra_charges, serial_number, current_store_id, status, created_at, updated_at
    FROM public.laptops ORDER BY id`,
  TransferLogs: 'SELECT id, laptop_id, from_store_id, to_store_id, changed_at FROM public.transferlogs ORDER BY id',
  Sales: `SELECT id, laptop_id, serial_number, brand_model, store_id, sale_price,
    cost_price, profit, sold_at, sold_by FROM public.sales ORDER BY id`,
  Users: `SELECT p.id, p.username, '' AS password_hash, p.display_name, p.role, p.created_at
    FROM public.profiles p ORDER BY p.username`,
  Settings: 'SELECT key, value FROM public.settings ORDER BY key',
  LoginLogs: `SELECT id, user_id, username, ip, user_agent, logged_in
    FROM public.loginlogs ORDER BY id`
};

function fmt(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function toRow(headers, rec) {
  return headers.map((h) => fmt(rec[h]));
}

async function gasRpc(action, extra = {}) {
  if (!GAS_URL) throw new Error('GAS_WEBAPP_URL is not set');
  const url = new URL(GAS_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('payload', JSON.stringify(extra));
  url.searchParams.set('key', GAS_KEY);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow', signal: ac.signal });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(data.error || `gas ${action} failed (HTTP ${res.status})`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function pushTab(client, tab) {
  const headers = TABS[tab];
  const { rows } = await client.query(QUERIES[tab]);
  const body = rows.map((r) => toRow(headers, r));
  await gasRpc('replaceTable', { table: tab, headers, rows: body });
  return body.length;
}

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!GAS_URL || !GAS_KEY) throw new Error('GAS_WEBAPP_URL / GAS_KEY are not set');
  const client = new Client({ connectionString: process.env.DATABASE_URL.trim(), connectionTimeoutMillis: 15000, query_timeout: 30000 });
  await client.connect();
  let total = 0;
  const t0 = Date.now();
  for (const tab of Object.keys(TABS)) {
    const ts = Date.now();
    const n = await pushTab(client, tab);
    total += n;
    console.log(`[sync] ${tab}: ${n} rows (${Date.now() - ts}ms)`);
  }
  await client.end();
  console.log(`[sync] done, ${total} rows across ${Object.keys(TABS).length} tabs (${Date.now() - t0}ms)`);
}

// Hard watchdog: never let the runner hang (GH Actions default is 6h).
setTimeout(() => { console.error('[sync] watchdog: exceeded 10 min, exiting'); process.exit(1); }, 10 * 60 * 1000).unref();

run().then(
  () => process.exit(0),
  (e) => {
    console.error('[sync] FAILED:', e.message);
    process.exit(1);
  }
);