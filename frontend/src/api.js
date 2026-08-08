import supabase from './supabaseClient';

// Thin Supabase client wrapper that exposes the same function signatures the
// React components already use, so the UI code needed no rewriting.

const TOKEN_KEY = 'laptop_inventory_token';

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
    created_at: profile.created_at
  };
}

async function profileForUserId(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, role, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw unwrap(error);
  return data;
}

// ---------------------------------- Auth -----------------------------------
export const register = () => {
  throw new Error('Self-registration is disabled. Ask an admin or manager to create your account.');
};

export const login = async ({ username, password }) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toEmail(username),
    password
  });
  if (error) throw new Error(error.message || 'Invalid username or password');
  const user = await profileForUserId(data.user.id);
  const profile = safeUser(user);
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

// ------------------------------- Account mgmt ------------------------------
export const getUsers = () => rpc('app_get_users')

export const createUser = async (data) => {
  const result = await rpc('app_create_user', {
    p_username: data.username,
    p_password: data.password,
    p_display_name: data.display_name || '',
    p_role: data.role || 'staff'
  });
  return result.user;
};

export const updateUser = async (id, data) => {
  const result = await rpc('app_update_user', {
    p_id: id,
    p_username: data.username || null,
    p_password: data.password || null,
    p_display_name: data.display_name || null,
    p_role: data.role || null
  });
  const {
    data: { session }
  } = await supabase.auth.getSession();
  // app_update_user returns { user: {...} }: unwrap it like the old API did.
  return { user: result.user, token: session?.access_token || null };
};

export const deleteUser = (id) => rpc('app_delete_user', { p_id: id });
export const bulkDeleteUsers = (ids) => rpc('app_bulk_delete_users', { p_ids: ids });
export const getLoginLogs = () => rpc('app_get_login_logs');

// --------------------------------- Inventory -------------------------------
export const getStores = () => table('stores');

export const getLaptops = (params = {}) =>
  rpc('app_get_laptops', {
    p_store_id: params.storeId ? Number(params.storeId) : null,
    p_status: params.status || null,
    p_search: params.search || null
  });

export const getTransferLogs = (limit = 100) => rpc('app_get_transfer_logs', { p_limit: limit });

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

export const deleteLaptop = (id) => rpc('app_delete_laptop', { p_id: id });

export const sellLaptop = async (id, salePrice) =>
  rpc('app_sell_laptop', {
    p_laptop_id: id,
    p_sale_price: salePrice,
    p_sold_by: await currentUsername()
  });

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
export const getBrands = () => table('brands');
export const addBrand = (data) =>
  rpc('app_add_brand', { p_name: data.name, p_serial_prefix: data.serial_prefix || '' });
export const updateBrand = (id, data) =>
  rpc('app_update_brand', {
    p_id: id,
    p_name: data.name,
    p_serial_prefix: data.serial_prefix || ''
  });
export const deleteBrand = (id) => rpc('app_delete_brand', { p_id: id });

// ---------------------------------- Vendors --------------------------------
export const getVendors = () => table('vendors');
export const addVendor = (data) =>
  rpc('app_add_vendor', { p_name: data.name, p_contact: data.contact || '' });
export const updateVendor = (id, data) =>
  rpc('app_update_vendor', { p_id: id, p_name: data.name, p_contact: data.contact || '' });
export const deleteVendor = (id) => rpc('app_delete_vendor', { p_id: id });
export const bulkDeleteVendors = (ids) => rpc('app_bulk_delete_vendors', { p_ids: ids });

// ----------------------------------- Sales ---------------------------------
export const getSales = () => rpc('app_get_sales');
export const getSalesSummary = () => rpc('app_sales_summary');

// --------------------------------- Settings --------------------------------
export const getSettings = () => rpc('app_get_settings');
export const saveSettings = (patch) => rpc('app_set_settings', { p_patch: patch });

// --------------------------- Role permissions ------------------------------
export const getPermissions = async () => {
  const settings = await getSettings();
  const raw = settings?.role_permissions;
  const fallback = {
    admin: { editInventory: true, transferLaptops: true, createStaff: true, renameStores: true, editLabels: true, manageVendors: false },
    manager: { editInventory: true, transferLaptops: true, createStaff: true, renameStores: true, editLabels: false, manageVendors: false },
    staff: { editInventory: false, transferLaptops: false, createStaff: false, renameStores: false, editLabels: false, manageVendors: false }
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
export const deleteStore = (id) => rpc('app_delete_store', { p_store_id: id });