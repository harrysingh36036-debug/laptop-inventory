import supabase from './supabaseClient';
import { getSettings } from './api';

// Supabase Realtime bridge. Subscribes to the published tables and re-emits
// changes using the same event names the components already listen to, so
// the UI's real-time handlers didn't need rewriting.

const listeners = new Map(); // event -> Set of callbacks

function _on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
}
function _off(event, cb) {
  const set = listeners.get(event);
  if (!set) return;
  if (cb) set.delete(cb);
  else set.clear();
}
function _emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const cb of [...set]) {
    try {
      cb(payload);
    } catch {
      /* listener errors are isolated */
    }
  }
}

// Small emitter-compatible object so App.jsx's socket.on/off keeps working.
export const socket = {
  on: _on,
  off: _off,
  emit: _emit,
  connect() {
    ensureConnected();
  },
  disconnect() {
    if (channel) supabase.removeChannel(channel);
    channel = null;
    status = 'disconnected';
    _emit('disconnect');
  },
  auth: {}
};

export function setSocketAuth() {
  // Supabase uses its own auth; nothing to pass to a handshake.
}

// React to sign in/out so a logged-out client stops receiving (and a logged-in
// one receives) private table changes.
supabase.auth.onAuthStateChange(() => disconnectConnected());

// Lazily populated store map: id -> store_name (for joining laptop rows).
let storesCache = new Map();
async function ensureStores() {
  const { data, error } = await supabase.from('stores').select('id, store_name');
  if (error) return;
  storesCache = new Map((data || []).map((s) => [Number(s.id), s.store_name]));
}
function storeName(id) {
  const sn = storesCache.get(Number(id));
  return sn !== undefined ? sn : null;
}

// Current local user's role, used to mirror the RPC's admin-only aadhar masking.
let localRole = null;
export function setLocalRole(role) {
  localRole = role;
}

// Whether the local user may see PII (name / phone / Aadhar) on realtime rows.
// Mirrors the server-side viewPII permission; admins always pass true.
let localCanViewPII = false;
export function setLocalPII(canSee) {
  localCanViewPII = !!canSee;
}

function num(v) {
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
}

function laptopFromRow(row) {
  return {
    id: Number(row.id),
    brand: row.brand,
    brand_model: row.brand_model,
    product_line: row.product_line,
    processor_type: row.processor_type,
    ram: row.ram,
    generation: row.generation,
    storage_type: row.storage_type,
    storage_size: row.storage_size,
    purchased_from: row.purchased_from,
    graphics: row.graphics,
    graphics_type: row.graphics_type,
    graphics_model: row.graphics_model,
    purchase_rate: num(row.purchase_rate),
    extra_charges: num(row.extra_charges),
    serial_number: row.serial_number,
    current_store_id: num(row.current_store_id),
    current_store_name: row.current_store_id != null ? storeName(row.current_store_id) : null,
    status: row.status,
    charger: row.charger,
    purchase_comment: row.purchase_comment,
    purchaser_aadhar_hash: localCanViewPII ? row.purchaser_aadhar_hash : null,
    purchaser_aadhar: localCanViewPII ? row.purchaser_aadhar : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function handleChange(table, event, row) {
  if (table === 'stores') {
    ensureStores().then(() => {
      const store = { id: Number(row.id), store_name: row.store_name };
      if (event === 'insert') _emit('store:added', store);
      else if (event === 'update') _emit('store:renamed', store);
      else if (event === 'delete') _emit('store:deleted', { id: Number(row.id) });
    });
    return;
  }

  if (table === 'laptops') {
    ensureStores().then(() => {
      if (event === 'insert') _emit('laptop:created', laptopFromRow(row));
      else if (event === 'update') _emit('laptop:updated', laptopFromRow(row));
      else if (event === 'delete') _emit('laptop:deleted', { id: Number(row.id) });
    });
    return;
  }

  if (table === 'transferlogs' && event === 'insert') {
    ensureStores().then(async () => {
      const from = storeName(row.from_store_id);
      const to = storeName(row.to_store_id);
      const laptop = { id: Number(row.laptop_id) };
      const { data: lrow } = await supabase
        .from('laptops')
        .select('id, brand_model, serial_number')
        .eq('id', row.laptop_id)
        .maybeSingle();
      if (lrow) {
        laptop.brand_model = lrow.brand_model;
        laptop.serial_number = lrow.serial_number;
      }
      _emit('laptop:transferred', {
        laptop,
        from: { store_name: from },
        to: { store_name: to },
        transferred_by: row.transferred_by
      });
    });
    return;
  }

  if (table === 'sales' && event === 'insert') {
    _emit('sale:new', {
      id: Number(row.id),
      laptop_id: Number(row.laptop_id),
      serial_number: row.serial_number,
      brand_model: row.brand_model,
      sale_price: num(row.sale_price),
      sold_by: row.sold_by,
      sold_at: row.sold_at
    });
    return;
  }

  if (table === 'sales' && event === 'delete') {
    _emit('sale:deleted', { id: Number(row.id) });
    return;
  }

  if (table === 'brands') {
    _emit('brands:updated');
    return;
  }

  if (table === 'repairs') {
    _emit('repairs:updated');
    return;
  }

  if (table === 'settings') {
    getSettings().then((settings) => {
      _emit('settings:updated', settings);
      if (row.key === 'role_permissions') _emit('permissions:updated');
    });
    return;
  }

  if (table === 'profiles') {
    // Permission-bearing profile rows change when role changes; listeners that
    // cache stores/settings can reload.
    _emit('data:reloaded');
  }
}

function onPostgresChange(payload) {
  const table = payload.table;
  const event = payload.eventType === 'INSERT' ? 'insert' : payload.eventType === 'UPDATE' ? 'update' : 'delete';
  const row = payload.new || payload.old;
  if (!row) return;
  handleChange(table, event, row);
}

// Create + subscribe the realtime channel. Auto-reconnects internally.
let channel = null;
let status = 'disconnected';

function disconnectConnected() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
  status = 'disconnected';
}

function ensureConnected() {
  if (channel) {
    if (status === 'SUBSCRIBED') _emit('connect');
    return;
  }
  const ch = supabase
    .channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, onPostgresChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'laptops' }, onPostgresChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transferlogs' }, onPostgresChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, onPostgresChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'repairs' }, onPostgresChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, onPostgresChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, onPostgresChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, onPostgresChange);
  channel = ch;
  ch.subscribe((state) => {
    status = state;
    if (state === 'SUBSCRIBED') _emit('connect');
    if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') _emit('disconnect');
  });
}