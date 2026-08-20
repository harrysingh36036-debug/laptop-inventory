import supabase from './supabaseClient';
import {
  isMongoConfigured,
  mongoGetLaptops,
  mongoGetTransferLogs,
  mongoGetSales,
  mongoGetSalesSummary,
  mongoGetPurchases,
  mongoGetPurchasesSummary,
  mongoGetRepairs,
  mongoGetRepairsSummary,
  mongoGetStores,
  mongoGetBrands,
  mongoGetVendors,
  mongoGetCustomers
} from './mongoApi';

// Thin Supabase client wrapper that exposes the same function signatures the
// React components already use, so the UI code needed no rewriting.
//
// Read fallback: when the Supabase free tier has exceeded 90% and the
// automation workflow migrated old history to MongoDB, Supabase reads return
// empty.  If the Mongo read API is configured, we merge its results in so the
// transferred data stays visible.  Supabase rows always win (live data).

const TOKEN_KEY = 'laptop_inventory_token';

const GAS_URL = import.meta.env.VITE_GAS_URL || '';
const GAS_KEY = import.meta.env.VITE_GAS_KEY || '';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

let signingOut = false;

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  // "Sign out" also ends the real Supabase session, not just our mirror.
  if (!token && !signingOut) {
    signingOut = true;
    supabase.auth.signOut().finally(() => {
      signingOut = false;
    });
  }
};

// Keep the token cache in sync with the real Supabase session (including the
// "already signed in" restored session on reload).
supabase.auth.onAuthStateChange((event, session) => {
  if (session && ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) {
    setToken(session.access_token);
  }
  if (event === 'SIGNED_OUT') setToken(null);
});

export function authHeaders(extra = {}) {
  return { ...extra };
}

// Throw a plain Error with the server/realtime message, matching the old REST
// client's behaviour so components keep rendering `e.message`.
function unwrap(error) {
  if (!error) return new Error('Request failed');
  const msg = error.message || error.error_description || 'Request failed';
  return new Error(msg);
}

// ------------------------------ Primitives --------------------------------
async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw unwrap(error);
  return data;
}

async function table(name) {
  const { data, error } = await supabase.from(name).select('*');
  if (error) throw unwrap(error);
  return data || [];
}

// Merge Supabase rows (live) with Mongo read-API rows (migrated history).
// Dedupes by id; a Supabase row always overrides the migrated copy.
function mergeById(primary, fallback) {
  if (!isMongoConfigured()) return primary || [];
  const map = new Map();
  for (const row of primary || []) {
    if (row && row.id != null) map.set(String(row.id), row);
  }
  for (const row of fallback || []) {
    if (row && row.id != null && !map.has(String(row.id))) map.set(String(row.id), row);
  }
  return Array.from(map.values());
}

// Return fallback only when Supabase returned nothing for this collection.
async function withMongoFallback(supabasePromise, mongoPromise) {
  const primary = await supabasePromise;
  if (isMongoConfigured() && (!primary || primary.length === 0)) {
    try {
      return mergeById(primary, await mongoPromise);
    } catch {
      return primary || [];
    }
  }
  return primary || [];
}

// Username -> email. Users sign in with a username in the UI, but Supabase
// authenticates against the derived address (always "@laptop.inventory").
function toEmail(username) {
  const value = String(username || '').trim();
  if (value.includes('@')) return value;
  return `${value}@laptop.inventory`;
}

function safeUser(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name || '',
    role: profile.role,
    home_store_id: profile.home_store_id ?? null,
    allowed_store_ids: profile.allowed_store_ids ?? null,
    created_at: profile.created_at
  };
}

async function profileForUserId(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, role, home_store_id, allowed_store_ids, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw unwrap(error);
  return data;
}

// NULL/empty = account may sign in from any store; otherwise only listed stores.
function allowedStores(profile) {
  const ids = profile?.allowed_store_ids;
  return Array.isArray(ids) && ids.length > 0 ? ids.map(Number) : null;
}

// ---------------------------------- Auth -----------------------------------
export const register = () => {
  throw new Error('Self-registration is disabled. Ask an admin or manager to create your account.');
};

export const login = async ({ username, password, storeId }) => {
  const store = storeId ? Number(storeId) : null;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toEmail(username),
    password
  });
  if (error) throw new Error(error.message || 'Invalid username or password');
  const user = await profileForUserId(data.user.id);
  const profile = safeUser(user);
  // Enforce "which locations this account may sign in from" — admin-configured.
const allowed = allowedStores(user);
  if (allowed && (!store || !allowed.includes(store))) {
    await supabase.auth.signOut().catch(() => {});
    throw new Error('This account is not allowed to sign in from this store.');
  }
  setToken(data.session.access_token);
  return { token: data.session.access_token, user: profile };
};

export const getMe = async () => {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();
  if (error) throw unwrap(error);
  if (!session) throw new Error('Authentication required');
  const profile = safeUser(await profileForUserId(session.user.id));
  return { user: profile };
};

// ------------------------------- Inventory -------------------------------

// --------------------------------- Inventory -------------------------------
export const getStores = () => withMongoFallback(table('stores'), mongoGetStores());

// ------------------------------- Users (admin) -------------------------------
export const getUsers = () => rpc('app_get_users');
export const createUser = (data = {}) =>
  rpc('app_create_user', {
    p_username: data.username || '',
    p_password: data.password || '',
    p_display_name: data.display_name || '',
    p_role: data.role || 'staff',
    p_store_id: data.store_id === null || data.store_id === undefined || data.store_id === '' ? null : Number(data.store_id),
    p_allowed_store_ids: null
  });
export const updateUser = (id, data = {}) =>
  rpc('app_update_user', {
    p_id: id,
    p_role: data.role || null,
    p_store_id: data.store_id === null || data.store_id === undefined ? null : Number(data.store_id)
  });
export const deleteUser = (id, password = '', remarks = '') =>
  rpc('app_delete_user', { p_id: id, p_password: password, p_remarks: remarks });

export const getLaptops = async (params = {}) => {
  const rows = await withMongoFallback(
    rpc('app_get_laptops', {
      p_store_id: params.storeId ? Number(params.storeId) : null,
      p_status: params.status || null,
      p_search: params.search || null
    }),
    mongoGetLaptops(params)
  );
  if (rows && rows.length > 0) return rows;
  if (params.search && GAS_URL) return searchSheetsLaptops(params.search);
  return rows || [];
};

export const getTransferLogs = (limit = 100) =>
  withMongoFallback(rpc('app_get_transfer_logs', { p_limit: limit }), mongoGetTransferLogs(limit));

export const transferLaptop = (id, toStoreId) =>
  rpc('app_transfer_laptop', { p_laptop_id: id, p_to_store: toStoreId });

export const createLaptop = (data) => {
  const quantity = data.quantity != null ? Number(data.quantity) : 1;
  if (quantity > 1) return createLaptopsBulk(data, quantity);
  return rpc('app_create_laptop', { p_data: data });
};

export const createLaptopsBulk = (data, quantity) =>
  rpc('app_bulk_create_laptops', { p_data: data, p_quantity: quantity });

export const updateLaptop = (id, data) =>
  rpc('app_update_laptop', { p_id: id, p_data: data });

export const deleteLaptop = (id, password = '', remarks = '') =>
  rpc('app_delete_laptop', { p_id: id, p_password: password, p_remarks: remarks });

export const sellLaptop = async (id, salePrice, customerId = null) =>
  rpc('app_sell_laptop', {
    p_laptop_id: id,
    p_sale_price: salePrice,
    p_sold_by: await currentUsername(),
    p_customer_id: customerId,
    p_purchaser_aadhar_hash: null
  });

// Super admin only (enforced server-side).
export const deleteSale = (saleId, password = '', remarks = '') =>
  rpc('app_delete_sale', { p_sale_id: saleId, p_password: password, p_remarks: remarks });

// Current user's username, used as the "sold_by" audit value.
async function currentUsername() {
  try {
    const me = await getMe();
    return me.user?.username || '';
  } catch {
    return '';
  }
}

// ----------------------------------- Brands --------------------------------
export const getBrands = () => withMongoFallback(table('brands'), mongoGetBrands());
export const addBrand = (data) =>
  rpc('app_add_brand', { p_name: data.name, p_serial_prefix: data.serial_prefix || '' });
export const updateBrand = (id, data) =>
  rpc('app_update_brand', {
    p_id: id,
    p_name: data.name,
    p_serial_prefix: data.serial_prefix || ''
  });
export const deleteBrand = (id, password = '', remarks = '') =>
  rpc('app_delete_brand', { p_id: id, p_password: password, p_remarks: remarks });

// ---------------------------------- Vendors --------------------------------
export const getVendors = () => withMongoFallback(table('vendors'), mongoGetVendors());
export const addVendor = (data) =>
  rpc('app_add_vendor', { p_name: data.name, p_contact: data.contact || '' });
export const updateVendor = (id, data) =>
  rpc('app_update_vendor', { p_id: id, p_name: data.name, p_contact: data.contact || '' });
export const deleteVendor = (id, password = '', remarks = '') =>
  rpc('app_delete_vendor', { p_id: id, p_password: password, p_remarks: remarks });
export const bulkDeleteVendors = (ids, password = '', remarks = '') =>
  rpc('app_bulk_delete_vendors', { p_ids: ids, p_password: password, p_remarks: remarks });

// ----------------------------------- Sales ---------------------------------
export const getSales = () =>
  withMongoFallback(rpc('app_get_sales'), mongoGetSales());
export const getSalesSummary = () =>
  withMongoFallback(rpc('app_sales_summary'), mongoGetSalesSummary());

// ---------------------------- Daily reports --------------------------------
export const getDailyReport = (date) => rpc('app_daily_report', { p_date: date });
export const getDailyStoreSales = (date) => rpc('app_daily_store_sales', { p_date: date });

// --------------------------------- Repairs ---------------------------------
export const getRepairs = () =>
  withMongoFallback(rpc('app_get_repairs'), mongoGetRepairs());
export const getRepairsSummary = () =>
  withMongoFallback(rpc('app_repairs_summary'), mongoGetRepairsSummary());
export const getRepairsByStore = () => rpc('app_repairs_by_store');
export const createRepair = (data) =>
  rpc('app_create_repair', {
    p_laptop_id: data.laptop_id ? Number(data.laptop_id) : null,
    p_serial_number: data.serial_number || '',
    p_brand_model: data.brand_model || '',
    p_issue: data.issue || '',
    p_vendor: data.vendor || '',
    p_cost: data.cost === '' || data.cost == null ? 0 : Number(data.cost),
    p_charge: data.charge === '' || data.charge == null ? 0 : Number(data.charge),
    p_store_id: data.store_id === '' || data.store_id == null ? null : Number(data.store_id),
    p_notes: data.notes || ''
  });
export const updateRepair = (id, data) =>
  rpc('app_update_repair', {
    p_id: id,
    p_laptop_id: data.laptop_id === undefined || data.laptop_id === null || data.laptop_id === '' ? null : Number(data.laptop_id),
    p_serial_number: data.serial_number ?? null,
    p_brand_model: data.brand_model ?? null,
    p_issue: data.issue ?? null,
    p_vendor: data.vendor ?? null,
    p_cost: data.cost === undefined || data.cost === null || data.cost === '' ? null : Number(data.cost),
    p_charge: data.charge === undefined || data.charge === null || data.charge === '' ? null : Number(data.charge),
    p_store_id: data.store_id === undefined || data.store_id === null || data.store_id === '' ? null : Number(data.store_id),
    p_status: data.status ?? null,
    p_notes: data.notes ?? null
  });
export const deleteRepair = (id, password = '', remarks = '') =>
  rpc('app_delete_repair', { p_id: id, p_password: password, p_remarks: remarks });

// -------------------------------- Purchases (ledger) --------------------------------
export const getPurchases = () =>
  withMongoFallback(rpc('app_get_purchases'), mongoGetPurchases());
export const getPurchasesSummary = () =>
  withMongoFallback(rpc('app_purchases_summary'), mongoGetPurchasesSummary());
export const createPurchase = (data) => rpc('app_create_purchase', { p_data: data });
export const updatePurchase = (id, data) => rpc('app_update_purchase', { p_id: id, p_data: data });
export const deletePurchase = (id, password = '', remarks = '') =>
  rpc('app_delete_purchase', { p_id: id, p_password: password, p_remarks: remarks });

// --------------------------------- Customers -------------------------------
export const getCustomers = () =>
  withMongoFallback(rpc('app_get_customers'), mongoGetCustomers());
export const addCustomer = (data) =>
  rpc('app_add_customer', {
    p_name: data.name,
    p_phone: data.phone || '',
    p_email: data.email || '',
    p_address: data.address || '',
    p_notes: data.notes || ''
  });
export const updateCustomer = (id, data) =>
  rpc('app_update_customer', {
    p_id: id,
    p_name: data.name,
    p_phone: data.phone || '',
    p_email: data.email || '',
    p_address: data.address || '',
    p_notes: data.notes || ''
  });
export const deleteCustomer = (id, password = '', remarks = '') =>
  rpc('app_delete_customer', { p_id: id, p_password: password, p_remarks: remarks });
export const bulkDeleteCustomers = (ids, password = '', remarks = '') =>
  rpc('app_bulk_delete_customers', { p_ids: ids, p_password: password, p_remarks: remarks });

// --------------------------------- Settings --------------------------------
export const getSettings = () => rpc('app_get_settings');
export const saveSettings = (patch) => rpc('app_set_settings', { p_patch: patch });

// --------------------------------- Stats ----------------------------------
export const getInventoryStats = (params = {}) =>
  rpc('app_inventory_stats', {
    p_store_id: params.storeId ? Number(params.storeId) : null,
    p_status: params.status || null
  });

// --------------------------- Role permissions ------------------------------
export const getPermissions = async () => {
  const settings = await getSettings();
  const raw = settings?.role_permissions;
  const fallback = {
    admin: { editInventory: true, transferLaptops: true, createStaff: true, renameStores: true, editLabels: true, manageVendors: false, manageCustomers: false, viewPII: true },
    manager: { editInventory: true, transferLaptops: true, createStaff: true, renameStores: true, editLabels: false, manageVendors: false, manageCustomers: false, viewPII: false },
    staff: { editInventory: false, transferLaptops: false, createStaff: false, renameStores: false, editLabels: false, manageVendors: false, manageCustomers: false, viewPII: false }
  };
  try {
    const parsed = JSON.parse(raw || '{}');
    return {
      admin: { ...fallback.admin, ...(parsed.admin || {}) },
      manager: { ...fallback.manager, ...(parsed.manager || {}) },
      staff: { ...fallback.staff, ...(parsed.staff || {}) }
    };
  } catch {
    return fallback;
  }
};

export const savePermissions = (perms) =>
  rpc('app_set_settings', { p_patch: { role_permissions: JSON.stringify(perms) } });

// ------------------------------- Store mgmt --------------------------------
export const addStore = (name) => rpc('app_add_store', { p_store_name: name });
export const renameStore = (id, name) => rpc('app_rename_store', { p_store_id: id, p_store_name: name });
export const deleteStore = (id, password = '', remarks = '') =>
  rpc('app_delete_store', { p_store_id: id, p_password: password, p_remarks: remarks });

// ------------------------------ Sheets fallback ----------------------------
// When the DB search returns nothing, fall back to a case-insensitive scan of
// the archived Google Sheet (Laptops tab) via the Apps Script web app.
async function searchSheetsLaptops(query, limit = 50) {
  const url = new URL(GAS_URL);
  url.searchParams.set('action', 'search');
  url.searchParams.set('table', 'Laptops');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('key', GAS_KEY);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(url.toString(), { signal: ac.signal });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(data.error || 'sheets search failed');
    const headers = data.headers || [];
    const rows = data.rows || [];
    return rows.map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] == null ? null : row[i];
      });
      return obj;
    });
  } finally {
    clearTimeout(timer);
  }
}