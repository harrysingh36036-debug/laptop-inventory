// Thin REST client. Endpoints are proxied to the backend by Vite.
const BASE = '/api';
const TOKEN_KEY = 'laptop_inventory_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

// Attach the current JWT (if any) to every request.
export function authHeaders(extra = {}) {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra };
}

async function request(path, options = {}) {
  const headers = authHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      // Session expired / invalid — clear it so the UI returns to login.
      setToken(null);
    }
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// ---------------------------------- Auth -----------------------------------
export const register = (data) =>
  request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
export const login = (data) =>
  request('/auth/login', { method: 'POST', body: JSON.stringify(data) });
export const getMe = () => request('/auth/me');

// ------------------------------- Account mgmt ------------------------------
export const getUsers = () => request('/users');
export const createUser = (data) => request('/users', { method: 'POST', body: JSON.stringify(data) });
export const updateUser = (id, data) =>
  request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteUser = (id) => request(`/users/${id}`, { method: 'DELETE' });
export const getLoginLogs = () => request('/auth/logins');

// --------------------------------- Inventory -------------------------------
export const getStores = () => request('/stores');
export const getLaptops = (params = {}) => {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== '')
  ).toString();
  return request(`/laptops${q ? `?${q}` : ''}`);
};
export const getTransferLogs = () => request('/logs');
export const transferLaptop = (id, toStoreId) =>
  request(`/laptops/${id}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ toStoreId })
  });
export const createLaptop = (data) =>
  request('/laptops', { method: 'POST', body: JSON.stringify(data) });
export const updateLaptop = (id, data) =>
  request(`/laptops/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteLaptop = (id) =>
  request(`/laptops/${id}`, { method: 'DELETE' });
export const sellLaptop = (id, salePrice) =>
  request(`/laptops/${id}/sell`, {
    method: 'POST',
    body: JSON.stringify({ salePrice })
  });

// ----------------------------------- Brands --------------------------------
export const getBrands = () => request('/brands');
export const addBrand = (data) =>
  request('/brands', { method: 'POST', body: JSON.stringify(data) });
export const updateBrand = (id, data) =>
  request(`/brands/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteBrand = (id) => request(`/brands/${id}`, { method: 'DELETE' });

// ----------------------------------- Sales ---------------------------------
export const getSales = () => request('/sales');
export const getSalesSummary = () => request('/sales/summary');

// --------------------------------- Settings --------------------------------
export const getSettings = () => request('/settings');
export const saveSettings = (patch) =>
  request('/settings', { method: 'PUT', body: JSON.stringify(patch) });

// --------------------------- Role permissions ------------------------------
export const getPermissions = () => request('/permissions');
export const savePermissions = (perms) =>
  request('/permissions', { method: 'PUT', body: JSON.stringify(perms) });

// ------------------------------- Store mgmt --------------------------------
export const addStore = (name) =>
  request('/stores', { method: 'POST', body: JSON.stringify({ store_name: name }) });
export const renameStore = (id, name) =>
  request(`/stores/${id}`, { method: 'PUT', body: JSON.stringify({ store_name: name }) });
export const deleteStore = (id) =>
  request(`/stores/${id}`, { method: 'DELETE' });