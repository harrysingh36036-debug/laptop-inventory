import { emitAudit } from './audit';

// REST client for the self-hosted Node.js + SQLite backend (no Supabase).
// Same function signatures the React components already use, so UI code
// needed no rewriting. Same-origin `/api` works in dev (Vite proxy) and in
// production (Nginx proxies /api to the Node backend).

const TOKEN_KEY = 'laptop_inventory_token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

let cachedUser = null;

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  if (!token) cachedUser = null;
};

function qs(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function req(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error('Cannot reach the server. Check your connection.');
  }
  if (res.status === 401) {
    setToken(null);
    throw new Error('Session expired. Please sign in again.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

// Current user's username, used as the audit value. Cached from login/me to
// avoid an extra request on every mutation.
async function currentUsername() {
  try {
    if (cachedUser?.username) return cachedUser.username;
    const me = await getMe();
    return me.user?.username || '';
  } catch {
    return '';
  }
}

// ---------------------------------- Auth -----------------------------------
export const login = async ({ username, password, storeId }) => {
  const res = await req('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: { username, password, storeId: storeId === '' ? null : storeId }
  });
  setToken(res.token);
  cachedUser = res.user || null;
  return { token: res.token, user: res.user };
};

export const getMe = async () => {
  const res = await req('/api/auth/me');
  cachedUser = res.user || null;
  return { user: res.user };
};

// ------------------------------- Inventory -------------------------------
export const getStores = async () => {
  // Login screen calls this before signing in — use the public endpoint then.
  if (!getToken()) return req('/api/public/stores', { auth: false });
  return req('/api/stores');
};

// ------------------------------- Login (public) -------------------------------
// Returns [{ username, display_name }] for the login-page username dropdown.
export const getLoginUsernames = () => req('/api/public/usernames', { auth: false });

// ------------------------------- Users (admin) -------------------------------
export const getUsers = () => req('/api/users');
export const createUser = (data = {}) =>
  req('/api/users', {
    method: 'POST',
    body: {
      username: data.username || '',
      password: data.password || '',
      display_name: data.display_name || '',
      role: data.role || 'staff',
      home_store_id: data.store_id === null || data.store_id === undefined || data.store_id === '' || Number(data.store_id) === 0 ? null : Number(data.store_id),
      allowed_store_ids: data.allowed_store_ids ?? null
    }
  }).then((r) => r.user || r);
export const updateUser = (id, data = {}) =>
  req(`/api/users/${id}`, {
    method: 'PUT',
    body: {
      ...(data.username !== undefined ? { username: data.username } : {}),
      ...(data.password ? { password: data.password } : {}),
      ...(data.display_name !== undefined ? { display_name: data.display_name } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.store_id !== undefined ? { home_store_id: data.store_id === null || data.store_id === '' || Number(data.store_id) === 0 ? null : Number(data.store_id) } : {}),
      ...(data.allowed_store_ids !== undefined ? { allowed_store_ids: data.allowed_store_ids } : {})
    }
  }).then((r) => r.user || r);
export const deleteUser = (id, password = '', remarks = '') =>
  req(`/api/users/${id}`, { method: 'DELETE', body: { password, remarks } });

export const getLaptops = (params = {}) =>
  req(`/api/laptops${qs({ storeId: params.storeId || undefined, status: params.status || undefined, search: params.search || undefined })}`);

export const getTransferLogs = () => req('/api/logs');

// ---- Transfer approval workflow ----
export const initiateTransfer = (laptopId, toStoreId) =>
  req('/api/transfers/initiate', { method: 'POST', body: { laptopId, toStoreId } });
export const acceptTransfer = (transferId) =>
  req(`/api/transfers/${transferId}/accept`, { method: 'POST' });
export const rejectTransfer = (transferId) =>
  req(`/api/transfers/${transferId}/reject`, { method: 'POST' });
export const cancelTransfer = (transferId) =>
  req(`/api/transfers/${transferId}/cancel`, { method: 'POST' });
export const getPendingTransfers = () => req('/api/transfers/pending');

export const createLaptop = async (data) => {
  const quantity = data.quantity != null ? Number(data.quantity) : 1;
  if (quantity > 1) return createLaptopsBulk(data, quantity);
  const res = await req('/api/laptops', { method: 'POST', body: data });
  emitAudit({
    action: 'created',
    entity: 'laptop',
    entityId: res?.id || data.serial_number || '',
    entityLabel: `${data.brand_model || ''} ${data.serial_number || ''}`.trim(),
    username: await currentUsername()
  });
  return res;
};

export const createLaptopsBulk = async (data, quantity) => {
  const res = await req('/api/laptops', { method: 'POST', body: { ...data, quantity } });
  emitAudit({
    action: 'created',
    entity: 'laptop',
    entityId: '',
    entityLabel: `${data.brand_model || ''} × ${quantity}`,
    username: await currentUsername()
  });
  return res;
};

export const updateLaptop = async (id, data) => {
  const res = await req(`/api/laptops/${id}`, { method: 'PUT', body: data });
  emitAudit({
    action: 'edited',
    entity: 'laptop',
    entityId: id,
    entityLabel: `${data.brand_model || ''} ${data.serial_number || ''}`.trim(),
    changes: Object.entries(data).map(([field, newValue]) => ({ field, oldValue: null, newValue })),
    username: await currentUsername()
  });
  return res;
};

export const deleteLaptop = async (id, password = '', remarks = '') => {
  const res = await req(`/api/laptops/${id}`, { method: 'DELETE', body: { password, remarks } });
  emitAudit({
    action: 'deleted',
    entity: 'laptop',
    entityId: id,
    entityLabel: res?.entity_label || '',
    remarks,
    username: await currentUsername()
  });
  return res;
};

export const sellLaptop = async (id, salePrice, customerId = null, paymentMethod = null, paymentDetail = null) => {
  const res = await req(`/api/laptops/${id}/sell`, {
    method: 'POST',
    body: { salePrice, customerId, paymentMethod, paymentDetail }
  });
  emitAudit({
    action: 'sold',
    entity: 'laptop',
    entityId: id,
    entityLabel: res?.brand_model || '',
    username: await currentUsername()
  });
  return res;
};

// Super admin only (enforced server-side).
export const deleteSale = (saleId, password = '', remarks = '') =>
  req(`/api/sales/${saleId}`, { method: 'DELETE', body: { password, remarks } });

// ----------------------------------- Brands --------------------------------
export const getBrands = () => req('/api/brands');
export const addBrand = async (data) => {
  const res = await req('/api/brands', { method: 'POST', body: { name: data.name, serial_prefix: data.serial_prefix || '' } });
  emitAudit({ action: 'created', entity: 'brand', entityId: res?.id || '', entityLabel: data.name, username: await currentUsername() });
  return res;
};
export const updateBrand = async (id, data) => {
  const res = await req(`/api/brands/${id}`, {
    method: 'PUT',
    body: { name: data.name, serial_prefix: data.serial_prefix || '' }
  });
  emitAudit({
    action: 'edited',
    entity: 'brand',
    entityId: id,
    entityLabel: data.name,
    changes: Object.entries(data).map(([field, newValue]) => ({ field, oldValue: null, newValue })),
    username: await currentUsername()
  });
  return res;
};
export const deleteBrand = async (id, password = '', remarks = '') => {
  const res = await req(`/api/brands/${id}`, { method: 'DELETE', body: { password, remarks } });
  emitAudit({ action: 'deleted', entity: 'brand', entityId: id, entityLabel: res?.entity_label || '', remarks, username: await currentUsername() });
  return res;
};

// ---------------------------------- Vendors --------------------------------
export const getVendors = () => req('/api/vendors');
export const addVendor = async (data) => {
  const res = await req('/api/vendors', { method: 'POST', body: { name: data.name, contact: data.contact || '', address: data.address || '' } });
  emitAudit({ action: 'created', entity: 'vendor', entityId: res?.id || '', entityLabel: data.name, username: await currentUsername() });
  return res;
};
export const updateVendor = async (id, data) => {
  const res = await req(`/api/vendors/${id}`, {
    method: 'PUT',
    body: { name: data.name, contact: data.contact || '', address: data.address || '' }
  });
  emitAudit({
    action: 'edited',
    entity: 'vendor',
    entityId: id,
    entityLabel: data.name,
    changes: Object.entries(data).map(([field, newValue]) => ({ field, oldValue: null, newValue })),
    username: await currentUsername()
  });
  return res;
};
export const deleteVendor = async (id, password = '', remarks = '') => {
  const res = await req(`/api/vendors/${id}`, { method: 'DELETE', body: { password, remarks } });
  emitAudit({ action: 'deleted', entity: 'vendor', entityId: id, entityLabel: res?.entity_label || '', remarks, username: await currentUsername() });
  return res;
};
export const bulkDeleteVendors = async (ids, password = '', remarks = '') => {
  const res = await req('/api/vendors/bulk-delete', { method: 'POST', body: { ids, password, remarks } });
  emitAudit({ action: 'deleted', entity: 'vendor', entityId: ids[0] || '', entityLabel: `${res?.deleted || ids.length} vendor(s)`, remarks, username: await currentUsername() });
  return res;
};

// ----------------------------------- Sales ---------------------------------
export const getSales = () => req('/api/sales');
export const getSalesSummary = () => req('/api/sales/summary');

// ---------------------------- Daily reports --------------------------------
export const getDailyReport = (date) => req(`/api/reports/daily${qs({ date })}`);
export const getDailyStoreSales = (date) => req(`/api/reports/daily-store-sales${qs({ date })}`);

// --------------------------------- Repairs ---------------------------------
export const getRepairs = () => req('/api/repairs');
export const getRepairsSummary = () => req('/api/repairs/summary');
export const getRepairsByStore = () => req('/api/repairs/by-store');
export const createRepair = async (data) => {
  const res = await req('/api/repairs', {
    method: 'POST',
    body: {
      laptop_id: data.laptop_id ? Number(data.laptop_id) : null,
      serial_number: data.serial_number || '',
      brand_model: data.brand_model || '',
      issue: data.issue || '',
      vendor: data.vendor || '',
      cost: data.cost === '' || data.cost == null ? 0 : Number(data.cost),
      charge: data.charge === '' || data.charge == null ? 0 : Number(data.charge),
      store_id: data.store_id === '' || data.store_id == null ? null : Number(data.store_id),
      notes: data.notes || ''
    }
  });
  emitAudit({
    action: 'created',
    entity: 'repair',
    entityId: res?.id || '',
    entityLabel: `${data.brand_model || ''} ${data.serial_number || ''}`.trim(),
    username: await currentUsername()
  });
  return res;
};
export const updateRepair = async (id, data) => {
  const res = await req(`/api/repairs/${id}`, {
    method: 'PUT',
    body: {
      ...(data.laptop_id !== undefined ? { laptop_id: data.laptop_id === null || data.laptop_id === '' ? null : Number(data.laptop_id) } : {}),
      ...(data.serial_number !== undefined ? { serial_number: data.serial_number } : {}),
      ...(data.brand_model !== undefined ? { brand_model: data.brand_model } : {}),
      ...(data.issue !== undefined ? { issue: data.issue } : {}),
      ...(data.vendor !== undefined ? { vendor: data.vendor } : {}),
      ...(data.cost !== undefined ? { cost: data.cost === null || data.cost === '' ? null : Number(data.cost) } : {}),
      ...(data.charge !== undefined ? { charge: data.charge === null || data.charge === '' ? null : Number(data.charge) } : {}),
      ...(data.store_id !== undefined ? { store_id: data.store_id === null || data.store_id === '' ? null : Number(data.store_id) } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {})
    }
  });
  emitAudit({
    action: 'edited',
    entity: 'repair',
    entityId: id,
    entityLabel: `${data.brand_model || ''} ${data.serial_number || ''}`.trim(),
    changes: Object.entries(data).map(([field, newValue]) => ({ field, oldValue: null, newValue })),
    username: await currentUsername()
  });
  return res;
};
export const deleteRepair = async (id, password = '', remarks = '') => {
  const res = await req(`/api/repairs/${id}`, { method: 'DELETE', body: { password, remarks } });
  emitAudit({
    action: 'deleted',
    entity: 'repair',
    entityId: id,
    entityLabel: res?.entity_label || '',
    remarks,
    username: await currentUsername()
  });
  return res;
};

// -------------------------------- Purchases (ledger) --------------------------------
// Purchases are real inventory units: create/update/delete map to laptops.
export const getPurchases = () => req('/api/purchases');
export const getPurchasesSummary = () => req('/api/purchases/summary');
export const createPurchase = async (data) => {
  const quantity = data.quantity != null ? Number(data.quantity) : 1;
  const res = await req('/api/purchases', { method: 'POST', body: { ...data, quantity } });
  const one = Array.isArray(res) ? res[0] : res?.laptops?.[0] || res;
  emitAudit({
    action: 'created',
    entity: 'purchase',
    entityId: one?.id || '',
    entityLabel: `${data.brand_model || ''} ${data.serial_number || ''}`.trim(),
    username: await currentUsername()
  });
  return one;
};
export const updatePurchase = async (id, data) => {
  const res = await req(`/api/purchases/${id}`, { method: 'PUT', body: data });
  emitAudit({
    action: 'edited',
    entity: 'purchase',
    entityId: id,
    entityLabel: `${data.brand_model || ''} ${data.serial_number || ''}`.trim(),
    changes: Object.entries(data).map(([field, newValue]) => ({ field, oldValue: null, newValue })),
    username: await currentUsername()
  });
  return res;
};
export const deletePurchase = async (id, password = '', remarks = '') => {
  const res = await req(`/api/purchases/${id}`, { method: 'DELETE', body: { password, remarks } });
  emitAudit({
    action: 'deleted',
    entity: 'purchase',
    entityId: id,
    entityLabel: res?.entity_label || '',
    remarks,
    username: await currentUsername()
  });
  return res;
};

// --------------------------------- Customers -------------------------------
export const getCustomers = () => req('/api/customers');
export const addCustomer = async (data) => {
  const res = await req('/api/customers', {
    method: 'POST',
    body: { name: data.name, phone: data.phone || '', email: data.email || '', address: data.address || '', notes: data.notes || '' }
  });
  emitAudit({ action: 'created', entity: 'customer', entityId: res?.id || '', entityLabel: data.name, username: await currentUsername() });
  return res;
};
export const updateCustomer = async (id, data) => {
  const res = await req(`/api/customers/${id}`, {
    method: 'PUT',
    body: { name: data.name, phone: data.phone || '', email: data.email || '', address: data.address || '', notes: data.notes || '' }
  });
  emitAudit({
    action: 'edited',
    entity: 'customer',
    entityId: id,
    entityLabel: data.name,
    changes: Object.entries(data).map(([field, newValue]) => ({ field, oldValue: null, newValue })),
    username: await currentUsername()
  });
  return res;
};
export const deleteCustomer = async (id, password = '', remarks = '') => {
  const res = await req(`/api/customers/${id}`, { method: 'DELETE', body: { password, remarks } });
  emitAudit({ action: 'deleted', entity: 'customer', entityId: id, entityLabel: res?.entity_label || '', remarks, username: await currentUsername() });
  return res;
};
export const bulkDeleteCustomers = async (ids, password = '', remarks = '') => {
  const res = await req('/api/customers/bulk-delete', { method: 'POST', body: { ids, password, remarks } });
  emitAudit({ action: 'deleted', entity: 'customer', entityId: ids[0] || '', entityLabel: `${res?.deleted || ids.length} customer(s)`, remarks, username: await currentUsername() });
  return res;
};

// --------------------------------- Settings --------------------------------
export const getSettings = () => req('/api/settings');
export const saveSettings = async (patch) => {
  const res = await req('/api/settings', { method: 'PUT', body: patch });
  emitAudit({
    action: 'settings',
    entity: 'settings',
    entityId: '',
    entityLabel: Object.keys(patch || {}).join(', ') || 'settings',
    changes: Object.entries(patch || {}).map(([field, newValue]) => ({ field, oldValue: null, newValue })),
    username: await currentUsername()
  });
  return res;
};

// --------------------------------- Stats ----------------------------------
export const getInventoryStats = (params = {}) =>
  req(`/api/inventory/stats${qs({ storeId: params.storeId || undefined })}`);

// --------------------------- Role permissions ------------------------------
export const getPermissions = async () => {
  const settings = await getSettings();
  const raw = settings?.role_permissions;
  const fallback = {
    admin: { editInventory: true, transferLaptops: true, createStaff: true, renameStores: true, editLabels: true, manageVendors: false, manageCustomers: false, viewPII: true },
    manager: { editInventory: true, transferLaptops: true, createStaff: true, renameStores: true, editLabels: false, manageVendors: false, manageCustomers: false, viewPII: false },
    staff: { editInventory: false, transferLaptops: true, createStaff: false, renameStores: false, editLabels: false, manageVendors: false, manageCustomers: false, viewPII: false }
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
  req('/api/permissions', { method: 'PUT', body: perms });

// ------------------------------- Store mgmt --------------------------------
export const addStore = async (name) => {
  const res = await req('/api/stores', { method: 'POST', body: { store_name: name } });
  emitAudit({ action: 'created', entity: 'store', entityId: res?.id || '', entityLabel: name, username: await currentUsername() });
  return res;
};
export const renameStore = async (id, name) => {
  const res = await req(`/api/stores/${id}`, { method: 'PUT', body: { store_name: name } });
  emitAudit({ action: 'edited', entity: 'store', entityId: id, entityLabel: name, changes: [{ field: 'store_name', oldValue: null, newValue: name }], username: await currentUsername() });
  return res;
};
export const deleteStore = async (id, password = '', remarks = '') => {
  const res = await req(`/api/stores/${id}`, { method: 'DELETE', body: { password, remarks } });
  emitAudit({ action: 'deleted', entity: 'store', entityId: id, entityLabel: res?.entity_label || '', remarks, username: await currentUsername() });
  return res;
};

// ---- Delete logs (audit trail) -------------------------------------------
export const getDeleteLogs = () => req('/api/delete-logs');
