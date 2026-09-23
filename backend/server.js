/**
 * server.js
 * Express REST API + Socket.io real-time layer.
 *
 * Run:  npm install && npm start   (from /backend)
 *
 * NOTE: All storage methods are awaited. The SQLite driver (db.js) is
 * synchronous, but the Postgres driver (pgdb.js) is async — awaiting works
 * with both kinds since `await` on a plain value returns that value.
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
// Load backend/.env no matter which directory the server is started from.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const storage = require('./storage');

// Free self-hosted Web Push. Loads lazily so the API still boots when the
// optional `web-push` dependency or VAPID keys are missing.
let push = null;
try {
  push = require('./push');
} catch (err) {
  console.warn('[push] module unavailable — push routes disabled:', err.message);
  push = {
    getPublicKey: () => null,
    saveSubscription: () => ({ error: 'Push unavailable' }),
    removeSubscription: () => ({ error: 'Push unavailable' }),
    sendPush: async () => ({ sent: 0, skipped: 'push-unavailable' })
  };
}

const {
  getStores,
  getLaptops,
  getLaptop,
  getTransferLogs,
  createLaptop,
  createLaptopsBulk,
  updateLaptop,
  deleteLaptop,
  getBrands,
  addBrand,
  updateBrand,
  deleteBrand,
  getSales,
  getSalesSummary,
  sellLaptop,
  deleteSale,
  getRepairs,
  getRepair,
  createRepair,
  updateRepair,
  deleteRepair,
  getRepairsSummary,
  getRepairsByStore,
  getPurchases,
  getPurchasesSummary,
  getVendors,
  addVendor,
  updateVendor,
  deleteVendor,
  bulkDeleteVendors,
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  bulkDeleteCustomers,
  getPendingTransfers,
  initiateTransfer,
  acceptTransfer,
  rejectTransfer,
  cancelTransfer,
  recordDeleteLog,
  getDeleteLogs,
  getDailyReport,
  getDailyStoreSales,
  getInventoryStats,
  publicUserFull,
  getLoginUsernames,
  addStore,
  renameStore,
  deleteStore,
  getSettings,
  setSettings,
  createUser,
  getUserById,
  getUserByUsername,
  verifyPassword,
  recordLogin,
  getUsers,
  updateUser,
  deleteUser
} = storage;

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const app = express();
const server = http.createServer(app);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate limit: max 5 login attempts per minute per IP
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limit: max 100 requests per minute per IP for general API
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Allow the Vite dev server origin for both REST + WebSocket handshake.
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

// Serve the built React frontend (frontend/dist) in production so the whole
// app runs as a single process. Dev mode uses Vite on :5173 instead.
const path = require('path');
const fs = require('fs');
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(FRONTEND_DIST, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
  }
}));

const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] }
});

// --------------------------- Event broadcast helper ------------------------
function broadcast(event, payload) {
  io.emit(event, payload);
}

// ----------------------------- Auth middleware -----------------------------
function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Attach req.user from the Bearer token if valid. Never throws.
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Require a specific role. Role hierarchy: superadmin > admin > manager > staff.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

const ROLES = ['superadmin', 'admin', 'manager', 'staff'];
const isAdmin = requireRole('admin', 'superadmin');
const isSuperAdmin = requireRole('superadmin');
const isAdminOrManager = requireRole('admin', 'superadmin', 'manager');

// ---------------------------------------------------------------------------
// Role permissions (admin-configurable)
// - admin / superadmin can always do everything (bypasses the map)
// - manager / staff permissions are stored in Settings and editable by admin
// ---------------------------------------------------------------------------
const DEFAULT_ROLE_PERMISSIONS = {
  manager: {
    editInventory: true,
    transferLaptops: true,
    createStaff: true,
    renameStores: true,
    editLabels: false
  },
  staff: {
    editInventory: false,
    transferLaptops: true,
    createStaff: false,
    renameStores: false,
    editLabels: false
  }
};

const PERMISSION_KEYS = Object.keys(DEFAULT_ROLE_PERMISSIONS.manager);

async function getRolePermissions() {
  const settings = await getSettings();
  const raw = (settings || {}).role_permissions;
  if (!raw) return JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
  try {
    const parsed = JSON.parse(raw);
    const out = {};
    for (const role of ['manager', 'staff']) {
      out[role] = { ...DEFAULT_ROLE_PERMISSIONS[role], ...(parsed[role] || {}) };
    }
    return out;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
  }
}

async function hasPerm(user, perm) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  const perms = await getRolePermissions();
  return !!perms[user.role]?.[perm];
}

// -------------------------------- REST API ---------------------------------
app.get('/api/health', async (_req, res) => {
  const stores = await getStores();
  res.json({ status: 'ok', stores: stores.length });
});

// Apply general rate limit to all /api routes (except health and login)
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/auth/login') return next();
  return apiLimiter(req, res, next);
});

// -------------------------------- Auth routes ------------------------------
// Public self-registration is disabled. Accounts are created by an admin or a
// manager (staff accounts only) through the Account Manager.
app.post('/api/auth/register', (_req, res) => {
  res.status(403).json({ error: 'Self-registration is disabled. Ask an admin or manager to create your account.' });
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const user = await getUserByUsername(req.body?.username);
  if (!user || !verifyPassword(user, req.body?.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const full = publicUserFull(user);
  // Enforce "which locations this account may sign in from".
  const allowed = full.allowed_store_ids;
  const store = req.body?.storeId != null && req.body?.storeId !== '' ? Number(req.body.storeId) : null;
  if (allowed && (!store || !allowed.includes(store))) {
    return res.status(403).json({ error: 'This account is not allowed to sign in from this store.' });
  }
  await recordLogin(user.id, user.username, req.ip, req.headers['user-agent']);
  res.json({ token: signToken(user), user: full, force_password_change: !!user.force_password_change });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: publicUserFull(req.user) });
});

// Public (pre-login) helpers for the login screen.
app.get('/api/public/stores', async (_req, res) => {
  res.json(await getStores());
});

app.get('/api/public/usernames', async (_req, res) => {
  res.json(await getLoginUsernames());
});

// Confirm the requester's own password for destructive actions.
function needPassword(user, password) {
  if (!password || !verifyPassword(user, password)) return 'Password confirmation failed';
  return null;
}

// ------------------------------ Account management -------------------------
// Super admins manage everyone. Admins manage admin/manager/staff but never
// see or touch superadmin accounts. Managers see staff + manager accounts only.
app.get('/api/users', authenticate, isAdminOrManager, async (req, res) => {
  const users = await getUsers();
  if (req.user.role === 'manager') return res.json(users.filter((u) => !['admin', 'superadmin'].includes(u.role)));
  if (req.user.role === 'admin') return res.json(users.filter((u) => u.role !== 'superadmin'));
  res.json(users);
});

app.get('/api/users/:id', authenticate, isAdminOrManager, async (req, res) => {
  const user = await getUserById(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  if ((req.user.role === 'manager' && ['admin', 'superadmin'].includes(user.role)) ||
      (req.user.role === 'admin' && user.role === 'superadmin')) {
    return res.status(403).json({ error: 'Insufficient permissions to view this account' });
  }
  res.json({ user: publicUserFull(user) });
});

// Creates a staff, manager or admin account. Only a superadmin can create a
// superadmin (or any inferior role). Managers can create staff + managers.
app.post('/api/users', authenticate, isAdminOrManager, async (req, res) => {
  const body = req.body || {};
  const role = body.role || 'staff';
  if (req.user.role === 'manager') {
    if (!(await hasPerm(req.user, 'createStaff'))) return res.status(403).json({ error: 'Insufficient permissions' });
    if (['admin', 'superadmin'].includes(role)) return res.status(403).json({ error: 'Managers cannot create admin accounts' });
  }
  if (role === 'superadmin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only the super admin can create super admin accounts' });
  }
  const result = await createUser({ ...body, role });
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.user);
});

// Updates a user. Superadmin can update anyone. Admin can update admin/manager/
// staff but never superadmin, and never promote anyone to superadmin. Managers
// can update staff + manager accounts, never admins.
app.put('/api/users/:id', authenticate, isAdminOrManager, async (req, res) => {
  const id = Number(req.params.id);
  const target = await getUserById(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (req.user.role === 'manager') {
    if (!(await hasPerm(req.user, 'createStaff'))) return res.status(403).json({ error: 'Insufficient permissions' });
    if (['admin', 'superadmin'].includes(target.role)) return res.status(403).json({ error: 'Admin accounts are hidden from managers' });
    if (['admin', 'superadmin'].includes(req.body?.role)) return res.status(403).json({ error: 'Managers cannot assign the admin role' });
  }
  if (req.user.role === 'admin') {
    if (target.role === 'superadmin') return res.status(403).json({ error: 'Admin cannot modify the super admin account' });
    if (req.body?.role === 'superadmin') return res.status(403).json({ error: 'Admin cannot assign the super admin role' });
  }

  const result = await updateUser(id, req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  if (req.user.id === id) {
    const refreshed = await getUserById(id);
    return res.json({ user: publicUserFull(refreshed), token: signToken(refreshed) });
  }
  res.json(result.user);
});

app.delete('/api/users/:id', authenticate, isAdmin, async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  const pwErr = needPassword(req.user, req.body?.password);
  if (pwErr) return res.status(403).json({ error: pwErr });
  const target = await getUserById(Number(req.params.id));
  if (req.user.role === 'admin' && target?.role === 'superadmin') {
    return res.status(403).json({ error: 'Admin cannot delete the super admin account' });
  }
  const result = await deleteUser(Number(req.params.id));
  if (result.error) return res.status(404).json({ error: result.error });
  res.json(result);
});

// Protect the inventory API. Viewing is allowed for all roles; writes are
// limited to managers and above.
app.get('/api/stores', authenticate, async (_req, res) => {
  res.json(await getStores());
});

// Query string filters: ?storeId=3 &status=In Stock &search=MacBook
app.get('/api/laptops', authenticate, async (req, res) => {
  const filters = {
    storeId: req.query.storeId || undefined,
    status: req.query.status || undefined,
    search: req.query.search || undefined
  };
  res.json(await getLaptops(filters));
});

// --------------------- Transfer approval workflow ------------------------
// Request → (accept | reject | cancel). Every step broadcasts so all devices
// update instantly with no refresh.
app.get('/api/transfers/pending', authenticate, async (_req, res) => {
  res.json(await getPendingTransfers());
});

app.post('/api/transfers/initiate', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'transferLaptops'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await initiateTransfer(req.body?.laptopId, req.body?.toStoreId, req.user.username);
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('pending_transfers:updated');
  broadcast('laptop:updated', result.transfer && (await getLaptop(result.transfer.laptop_id)));
  push.sendPush({ title: 'New transfer request', body: `${result.transfer?.brand_model || 'A laptop'} → ${result.transfer?.to_store_name || ''}`.trim(), tag: 'transfer' }).catch(() => {});
  res.status(201).json(result.transfer);
});

app.post('/api/transfers/:id/accept', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'transferLaptops'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await acceptTransfer(req.params.id);
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('pending_transfers:updated');
  broadcast('laptop:transferred', result);
  push.sendPush({ title: 'Transfer accepted', body: `${result.laptop?.brand_model || 'A laptop'} moved to ${result.to?.store_name || ''}`.trim(), tag: 'transfer' }).catch(() => {});
  res.json({ ok: true });
});

app.post('/api/transfers/:id/reject', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'transferLaptops'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await rejectTransfer(req.params.id);
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('pending_transfers:updated');
  res.json({ ok: true });
});

app.post('/api/transfers/:id/cancel', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'transferLaptops'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await cancelTransfer(req.params.id);
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('pending_transfers:updated');
  res.json({ ok: true });
});

app.get('/api/logs', authenticate, async (_req, res) => {
  res.json(await getTransferLogs());
});

// ------------------------------ Web Push --------------------------------
// Free self-hosted push (VAPID). Devices subscribe from the PWA; the server
// fans out transfer/sale/repair alerts. Works even when the app is closed.
app.get('/api/push/vapid-public-key', (_req, res) => {
  res.json({ publicKey: push.getPublicKey() });
});

app.post('/api/push/subscribe', authenticate, (req, res) => {
  const result = push.saveSubscription(req.body?.subscription);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', authenticate, (req, res) => {
  const result = push.removeSubscription(req.body?.endpoint);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

app.post('/api/push/test', authenticate, isAdmin, async (req, res) => {
  const result = await push.sendPush({
    title: req.body?.title || 'Universal CRM',
    body: req.body?.body || 'Push notifications are working — you will hear a sound even when the app is closed.',
    tag: 'push-test'
  });
  res.json({ ok: true, ...result });
});

// -------------------------------- Settings --------------------------------
// UI labels / app text (public for authenticated users, editable by admin).
app.get('/api/settings', authenticate, async (_req, res) => {
  res.json(await getSettings());
});

app.put('/api/settings', authenticate, isAdmin, async (req, res) => {
  res.json(await setSettings(req.body || {}));
});

// ------------------------- Role permissions --------------------------------
// Admin reads/writes the permission map that controls what managers and staff
// can do. Admin itself always has full access.
app.get('/api/permissions', authenticate, isAdmin, async (_req, res) => {
  res.json(await getRolePermissions());
});

app.put('/api/permissions', authenticate, isAdmin, async (req, res) => {
  const body = req.body || {};
  const clean = {};
  for (const role of ['manager', 'staff']) {
    clean[role] = {};
    for (const key of PERMISSION_KEYS) {
      clean[role][key] = !!body[role]?.[key];
    }
  }
  await setSettings({ role_permissions: JSON.stringify(clean) });
  broadcast('permissions:updated', clean);
  res.json(clean);
});

// ----------------------------- Store management -----------------------------
// Admins can add / rename / remove stores. Managers can only rename stores
// (when granted the renameStores permission).
app.post('/api/stores', authenticate, isAdmin, async (req, res) => {
  const result = await addStore(req.body?.store_name);
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('store:added', result.store);
  broadcast('settings:updated', await getSettings());
  res.status(201).json(result.store);
});

app.put('/api/stores/:id', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'renameStores'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await renameStore(Number(req.params.id), req.body?.store_name);
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('store:renamed', result.store);
  broadcast('settings:updated', await getSettings());
  res.json(result.store);
});

app.delete('/api/stores/:id', authenticate, isAdmin, async (req, res) => {
  const result = await deleteStore(Number(req.params.id));
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('store:deleted', { id: result.id });
  broadcast('settings:updated', await getSettings());
  res.json(result);
});

// ----------------------------- Inventory CRUD ------------------------------

// ----------------------------- Brands --------------------------------------
// Managers (and above) can add, update, delete and list brands.
app.get('/api/brands', authenticate, async (_req, res) => {
  res.json(await getBrands());
});

app.post('/api/brands', authenticate, isAdminOrManager, async (req, res) => {
  const result = await addBrand(req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('brands:updated');
  res.status(201).json(result.brand);
});

app.put('/api/brands/:id', authenticate, isAdminOrManager, async (req, res) => {
  const result = await updateBrand(Number(req.params.id), req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('brands:updated');
  res.json(result.brand);
});

app.delete('/api/brands/:id', authenticate, isAdminOrManager, async (req, res) => {
  const pwErr = needPassword(req.user, req.body?.password);
  if (pwErr) return res.status(403).json({ error: pwErr });
  const doomed = await getBrand(Number(req.params.id));
  const result = await deleteBrand(Number(req.params.id));
  if (result.error) return res.status(400).json({ error: result.error });
  recordDeleteLog({ entity_type: 'brand', entity_id: req.params.id, entity_label: doomed?.name, remarks: req.body?.remarks, deleted_by: req.user.username });
  broadcast('brands:updated');
  res.json(result);
});

// ----------------------------- Sales --------------------------------------
app.get('/api/sales', authenticate, async (_req, res) => {
  res.json(await getSales());
});

app.get('/api/sales/summary', authenticate, async (_req, res) => {
  res.json(await getSalesSummary());
});

// POST /api/laptops/:id/sell  body: { salePrice, customerId?, paymentMethod?, paymentDetail? }
app.post('/api/laptops/:id/sell', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'editInventory'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await sellLaptop(Number(req.params.id), req.body?.salePrice, req.user.username, {
    customerId: req.body?.customerId,
    paymentMethod: req.body?.paymentMethod,
    paymentDetail: req.body?.paymentDetail
  });
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('sale:new', result.sale);
  push.sendPush({
    title: 'Laptop sold',
    body: `${result.sale?.brand_model || 'A laptop'} sold for ₹${Number(result.sale?.sale_price || 0).toLocaleString('en-IN')}`,
    tag: 'sale'
  }).catch(() => {});
  res.status(201).json(result.sale);
});

// DELETE /api/sales/:id  body: { password?, remarks? } — refund/exchange.
app.delete('/api/sales/:id', authenticate, isAdmin, async (req, res) => {
  const pwErr = needPassword(req.user, req.body?.password);
  if (pwErr) return res.status(403).json({ error: pwErr });
  const result = await deleteSale(Number(req.params.id));
  if (result.error) return res.status(404).json({ error: result.error });
  recordDeleteLog({ entity_type: 'sale', entity_id: req.params.id, entity_label: result.entity_label, remarks: req.body?.remarks, deleted_by: req.user.username });
  broadcast('data:reloaded', { at: Date.now() });
  res.json(result);
});

// POST /api/laptops  body: { brand, brand_model, ..., quantity?, serial_prefix? }
app.post('/api/laptops', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'editInventory'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const body = req.body || {};
  // If a quantity > 1 is supplied, bulk-add that many units.
  if (body.quantity != null && Number(body.quantity) > 1) {
    const result = await createLaptopsBulk(body, body.quantity);
    if (result.error) return res.status(400).json({ error: result.error, created: result.created });
    broadcast('laptop:bulk', result.laptops);
    return res.status(201).json(result);
  }
  const result = await createLaptop(body);
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('laptop:created', result.laptop);
  res.status(201).json(result.laptop);
});

// PUT /api/laptops/:id  body: { brand_model?, current_store_id?, status? }
app.put('/api/laptops/:id', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'editInventory'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await updateLaptop(Number(req.params.id), req.body || {});
  if (result.error) return res.status(404).json({ error: result.error });
  broadcast('laptop:updated', result.laptop);
  res.json(result.laptop);
});

// DELETE /api/laptops/:id  body: { password?, remarks? }
app.delete('/api/laptops/:id', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'editInventory'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const pwErr = needPassword(req.user, req.body?.password);
  if (pwErr) return res.status(403).json({ error: pwErr });
  const doomed = await getLaptop(Number(req.params.id));
  const result = await deleteLaptop(Number(req.params.id));
  if (result.error) return res.status(404).json({ error: result.error });
  recordDeleteLog({ entity_type: 'laptop', entity_id: req.params.id, entity_label: `${doomed?.brand_model || ''} ${doomed?.serial_number || ''}`.trim(), remarks: req.body?.remarks, deleted_by: req.user.username });
  broadcast('laptop:deleted', { id: result.id });
  res.json(result);
});

// ----------------------------- Purchases -----------------------------------
// Ledger over Laptops: every unit added to inventory is a purchase.
app.get('/api/purchases', authenticate, async (_req, res) => {
  res.json(await getPurchases());
});

app.get('/api/purchases/summary', authenticate, async (_req, res) => {
  res.json(await getPurchasesSummary());
});

// Purchases create real inventory units (single or bulk via quantity).
app.post('/api/purchases', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'editInventory'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const body = req.body || {};
  if (body.quantity != null && Number(body.quantity) > 1) {
    const result = await createLaptopsBulk(body, body.quantity);
    if (result.error) return res.status(400).json({ error: result.error });
    broadcast('laptop:bulk', result.laptops);
    return res.status(201).json(result.laptops);
  }
  const result = await createLaptop(body);
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('laptop:created', result.laptop);
  res.status(201).json(result.laptop);
});

app.put('/api/purchases/:id', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'editInventory'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await updateLaptop(Number(req.params.id), req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('laptop:updated', result.laptop);
  res.json(result.laptop);
});

app.delete('/api/purchases/:id', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'editInventory'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const pwErr = needPassword(req.user, req.body?.password);
  if (pwErr) return res.status(403).json({ error: pwErr });
  const doomed = await getLaptop(Number(req.params.id));
  const result = await deleteLaptop(Number(req.params.id));
  if (result.error) return res.status(404).json({ error: result.error });
  recordDeleteLog({ entity_type: 'laptop', entity_id: req.params.id, entity_label: `${doomed?.brand_model || ''} ${doomed?.serial_number || ''}`.trim(), remarks: req.body?.remarks, deleted_by: req.user.username });
  broadcast('laptop:deleted', { id: result.id });
  res.json(result);
});

// ----------------------------- Vendors -------------------------------------
app.get('/api/vendors', authenticate, async (_req, res) => {
  res.json(await getVendors());
});

app.post('/api/vendors', authenticate, isAdminOrManager, async (req, res) => {
  const result = await addVendor(req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.vendor);
});

app.put('/api/vendors/:id', authenticate, isAdminOrManager, async (req, res) => {
  const result = await updateVendor(Number(req.params.id), req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.vendor);
});

app.delete('/api/vendors/:id', authenticate, isAdminOrManager, async (req, res) => {
  const pwErr = needPassword(req.user, req.body?.password);
  if (pwErr) return res.status(403).json({ error: pwErr });
  const result = await deleteVendor(Number(req.params.id));
  if (result.error) return res.status(404).json({ error: result.error });
  recordDeleteLog({ entity_type: 'vendor', entity_id: req.params.id, entity_label: result.entity_label, remarks: req.body?.remarks, deleted_by: req.user.username });
  res.json(result);
});

app.post('/api/vendors/bulk-delete', authenticate, isAdminOrManager, async (req, res) => {
  const pwErr = needPassword(req.user, req.body?.password);
  if (pwErr) return res.status(403).json({ error: pwErr });
  const result = await bulkDeleteVendors(req.body?.ids);
  if (result.error) return res.status(400).json({ error: result.error });
  recordDeleteLog({ entity_type: 'vendor', entity_id: (req.body?.ids || [])[0], entity_label: `${result.deleted} vendor(s)`, remarks: req.body?.remarks, deleted_by: req.user.username });
  res.json(result);
});

// ---------------------------- Customers ------------------------------------
app.get('/api/customers', authenticate, async (_req, res) => {
  res.json(await getCustomers());
});

app.post('/api/customers', authenticate, async (req, res) => {
  const result = await addCustomer(req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result);
});

app.put('/api/customers/:id', authenticate, async (req, res) => {
  const result = await updateCustomer(Number(req.params.id), req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

app.delete('/api/customers/:id', authenticate, async (req, res) => {
  const pwErr = needPassword(req.user, req.body?.password);
  if (pwErr) return res.status(403).json({ error: pwErr });
  const result = await deleteCustomer(Number(req.params.id));
  if (result.error) return res.status(404).json({ error: result.error });
  recordDeleteLog({ entity_type: 'customer', entity_id: req.params.id, entity_label: result.entity_label, remarks: req.body?.remarks, deleted_by: req.user.username });
  res.json(result);
});

app.post('/api/customers/bulk-delete', authenticate, async (req, res) => {
  const pwErr = needPassword(req.user, req.body?.password);
  if (pwErr) return res.status(403).json({ error: pwErr });
  const result = await bulkDeleteCustomers(req.body?.ids);
  if (result.error) return res.status(400).json({ error: result.error });
  recordDeleteLog({ entity_type: 'customer', entity_id: (req.body?.ids || [])[0], entity_label: `${result.deleted} customer(s)`, remarks: req.body?.remarks, deleted_by: req.user.username });
  res.json(result);
});

// --------------------- Reports / stats / audit -----------------------------
app.get('/api/reports/daily', authenticate, async (req, res) => {
  const result = await getDailyReport(req.query?.date);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

app.get('/api/reports/daily-store-sales', authenticate, async (req, res) => {
  const result = await getDailyStoreSales(req.query?.date);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

app.get('/api/repairs/by-store', authenticate, async (_req, res) => {
  res.json(await getRepairsByStore());
});

app.get('/api/inventory/stats', authenticate, async (req, res) => {
  res.json(await getInventoryStats({ storeId: req.query?.storeId }));
});

app.get('/api/delete-logs', authenticate, isAdmin, async (_req, res) => {
  res.json(await getDeleteLogs());
});

// ----------------------------- Repairs -------------------------------------
app.get('/api/repairs', authenticate, async (_req, res) => {
  res.json(await getRepairs());
});

app.get('/api/repairs/summary', authenticate, async (_req, res) => {
  res.json(await getRepairsSummary());
});

// Writes (create/update/delete) use the editInventory permission, same as
// inventory edits and sells.
app.post('/api/repairs', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'editInventory'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await createRepair({ ...(req.body || {}), created_by: req.user.username });
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('repair:created', result.repair);
  broadcast('repairs:updated');
  push.sendPush({
    title: 'Repair logged',
    body: `Repair #${result.repair?.id || ''} recorded`.trim(),
    tag: 'repair'
  }).catch(() => {});
  res.status(201).json(result.repair);
});

app.put('/api/repairs/:id', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'editInventory'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await updateRepair(Number(req.params.id), req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('repair:updated', result.repair);
  broadcast('repairs:updated');
  res.json(result.repair);
});

app.delete('/api/repairs/:id', authenticate, async (req, res) => {
  if (!(await hasPerm(req.user, 'editInventory'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const pwErr = needPassword(req.user, req.body?.password);
  if (pwErr) return res.status(403).json({ error: pwErr });
  const doomed = await getRepair(Number(req.params.id));
  const result = await deleteRepair(Number(req.params.id));
  if (result.error) return res.status(404).json({ error: result.error });
  recordDeleteLog({ entity_type: 'repair', entity_id: req.params.id, entity_label: `${doomed?.brand_model || ''} ${doomed?.serial_number || ''}`.trim(), remarks: req.body?.remarks, deleted_by: req.user.username });
  broadcast('repair:deleted', { id: result.id });
  broadcast('repairs:updated');
  res.json(result);
});

// SPA fallback: only serve index.html for navigation requests
app.get(/^\/(?!api|socket\.io|assets\/).*\.\w+$/, (_req, res) => {
  res.status(404).end();
});
app.get(/^\/(?!api|socket\.io|__debug).*/, (_req, res) => {
  const index = path.join(FRONTEND_DIST, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  return res.status(404).json({ error: 'Frontend not built. Run: cd frontend && npm run build' });
});

// Debug: check what's in the dist folder
app.get('/__debug', (_req, res) => {
  const exists = fs.existsSync(FRONTEND_DIST);
  const files = exists ? fs.readdirSync(FRONTEND_DIST) : [];
  const assets = exists && fs.existsSync(path.join(FRONTEND_DIST, 'assets'))
    ? fs.readdirSync(path.join(FRONTEND_DIST, 'assets'))
    : [];
  res.json({ FRONTEND_DIST, exists, files, assets });
});

// -------------------------------- Socket.io --------------------------------
// Clients authenticate the socket handshake with the same JWT.
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(payload.sub);
    if (!user) return next(new Error('Account no longer exists'));
    socket.user = { id: user.id, username: user.username, role: user.role, display_name: user.display_name, home_store_id: user.home_store_id ?? null };
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

// Live presence: who is online right now. Same shape the Accounts tab expects:
// { [userId]: [{ user_id, username, display_name, role, home_store_id, online_at }] }
const onlineUsers = new Map(); // socketId -> user payload
function presenceState() {
  const state = {};
  for (const u of onlineUsers.values()) {
    const key = String(u.id);
    state[key] = state[key] || [];
    if (!state[key].some((e) => e.socketId === u.socketId)) state[key].push(u);
  }
  return state;
}
function broadcastPresence() {
  io.emit('presence:update', presenceState());
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id} (${socket.user.username})`);
  onlineUsers.set(socket.id, {
    socketId: socket.id,
    user_id: String(socket.user.id),
    id: String(socket.user.id),
    username: socket.user.username,
    display_name: socket.user.display_name || socket.user.username,
    role: socket.user.role,
    home_store_id: socket.user.home_store_id ?? null,
    online_at: new Date().toISOString()
  });
  broadcastPresence();
  socket.emit('presence:update', presenceState());

  // Pull the current snapshot (clients joining late ask for it).
  socket.on('presence:get', (ack) => {
    if (typeof ack === 'function') ack(presenceState());
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    onlineUsers.delete(socket.id);
    broadcastPresence();
  });
});

// Boot the storage driver (Sheets/Postgres load async; SQLite is ready), then
// start listening.
(async () => {
  try {
    await storage.init();
  } catch (err) {
    console.error('[storage] init failed:', err.message);
    console.error('If using Sheets, check SHEETS_SPREADSHEET_ID + Google credentials.');
    process.exit(1);
  }
  // Poll Google Sheets for external edits; broadcast reloads to all clients.
  storage.startPolling(() => broadcast('data:reloaded', { at: Date.now() }));
  server.listen(PORT, () => {
    console.log(`[Laptop Inventory] API + WebSocket running on http://localhost:${PORT} (storage: ${storage.driver})`);
    console.log(`Allowing client origin: ${CLIENT_ORIGIN}`);
  });
})();