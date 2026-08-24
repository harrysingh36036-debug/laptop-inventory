// Read-only client for the MongoDB migration read API (served by the
// automation repo, see https://github.com/harrysingh36036-debug/automation).
//
// The frontend reads Supabase first.  When records have been transferred to
// MongoDB (Supabase free tier exceeded 90% and old history was migrated), the
// lists come back empty — this client queries the read API instead so users
// keep seeing the transferred data.
//
// Env (both optional — set them only once the read API is deployed):
//   VITE_MONGO_READ_API_URL   e.g. https://<service>.onrender.com
//   VITE_MONGO_READ_API_KEY   matches READ_API_KEY on the read API server

const MONGO_URL = import.meta.env.VITE_MONGO_READ_API_URL || '';
const MONGO_KEY = import.meta.env.VITE_MONGO_READ_API_KEY || '';

export const isMongoConfigured = () => Boolean(MONGO_URL);

async function request(path, params = {}) {
  const url = new URL(MONGO_URL + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  const headers = {};
  if (MONGO_KEY) headers.Authorization = `Bearer ${MONGO_KEY}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(url.toString(), { method: 'GET', headers, signal: ac.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Mongo read API failed (HTTP ${res.status})`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export const mongoGetLaptops = (params = {}) =>
  request('/api/laptops', {
    q: params.search,
    status: params.status,
    store_id: params.storeId,
    limit: params.limit || 500
  });

export const mongoGetTransferLogs = (limit = 200) =>
  request('/api/transferlogs', { limit });

export const mongoGetSales = (storeId) =>
  request('/api/sales', { store_id: storeId });

export const mongoGetSalesSummary = () => request('/api/sales/summary');

export const mongoGetPurchases = () => request('/api/purchases');

export const mongoGetPurchasesSummary = () => request('/api/purchases/summary');

export const mongoGetRepairs = (status) =>
  request('/api/repairs', { status });

export const mongoGetRepairsSummary = () => request('/api/repairs/summary');

export const mongoGetStores = () => request('/api/stores');

export const mongoGetBrands = () => request('/api/brands');

export const mongoGetVendors = () => request('/api/vendors');

export const mongoGetCustomers = (query) => request('/api/customers', { q: query });