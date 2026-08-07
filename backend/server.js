/**
 * server.js
 * Express REST API + Socket.io real-time layer.
 *
 * Run:  npm install && npm start   (from /backend)
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
// Load backend/.env no matter which directory the server is started from.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const storage = require('./storage');

const {
  getStores,
  getLaptops,
  getLaptop,
  transferLaptop,
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
  getLoginLogs,
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

// Allow the Vite dev server origin for both REST + WebSocket handshake.
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

// Serve the built React frontend (frontend/dist) in production so the whole
// app runs as a single process. Dev mode uses Vite on :5173 instead.
const path = require('path');
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(FRONTEND_DIST));

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
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUserById(payload.sub);
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
    transferLaptops: false,
    createStaff: false,
    renameStores: false,
    editLabels: false
  }
};

const PERMISSION_KEYS = Object.keys(DEFAULT_ROLE_PERMISSIONS.manager);

function getRolePermissions() {
  const raw = (getSettings() || {}).role_permissions;
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

function hasPerm(user, perm) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  return !!getRolePermissions()[user.role]?.[perm];
}

// -------------------------------- REST API ---------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', stores: getStores().length });
});

// -------------------------------- Auth routes ------------------------------
// Public self-registration is disabled. Accounts are created by an admin or a
// manager (staff accounts only) through the Account Manager.
app.post('/api/auth/register', (_req, res) => {
  res.status(403).json({ error: 'Self-registration is disabled. Ask an admin or manager to create your account.' });
});

app.post('/api/auth/login', (req, res) => {
  const user = getUserByUsername(req.body?.username);
  if (!user || !verifyPassword(user, req.body?.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  recordLogin(user.id, user.username, req.ip, req.headers['user-agent']);
  const safe = { id: user.id, username: user.username, display_name: user.display_name, role: user.role, created_at: user.created_at };
  res.json({ token: signToken(user), user: safe });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username, display_name: req.user.display_name, role: req.user.role, created_at: req.user.created_at } });
});

// ------------------------------ Account management -------------------------
// Super admins manage everyone. Admins manage admin/manager/staff but never
// see or touch superadmin accounts. Managers see staff + manager accounts only.
app.get('/api/users', authenticate, isAdminOrManager, (req, res) => {
  const users = getUsers();
  if (req.user.role === 'manager') return res.json(users.filter((u) => !['admin', 'superadmin'].includes(u.role)));
  if (req.user.role === 'admin') return res.json(users.filter((u) => u.role !== 'superadmin'));
  res.json(users);
});

app.get('/api/users/:id', authenticate, isAdminOrManager, (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  if ((req.user.role === 'manager' && ['admin', 'superadmin'].includes(user.role)) ||
      (req.user.role === 'admin' && user.role === 'superadmin')) {
    return res.status(403).json({ error: 'Insufficient permissions to view this account' });
  }
  res.json({ user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role, created_at: user.created_at } });
});

// Creates a staff, manager or admin account. Only a superadmin can create a
// superadmin (or any inferior role). Managers can create staff + managers.
app.post('/api/users', authenticate, isAdminOrManager, (req, res) => {
  const body = req.body || {};
  const role = body.role || 'staff';
  if (req.user.role === 'manager') {
    if (!hasPerm(req.user, 'createStaff')) return res.status(403).json({ error: 'Insufficient permissions' });
    if (['admin', 'superadmin'].includes(role)) return res.status(403).json({ error: 'Managers cannot create admin accounts' });
  }
  if (role === 'superadmin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only the super admin can create super admin accounts' });
  }
  const result = createUser({ ...body, role });
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.user);
});

// Updates a user. Superadmin can update anyone. Admin can update admin/manager/
// staff but never superadmin, and never promote anyone to superadmin. Managers
// can update staff + manager accounts, never admins.
app.put('/api/users/:id', authenticate, isAdminOrManager, (req, res) => {
  const id = Number(req.params.id);
  const target = getUserById(id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (req.user.role === 'manager') {
    if (!hasPerm(req.user, 'createStaff')) return res.status(403).json({ error: 'Insufficient permissions' });
    if (['admin', 'superadmin'].includes(target.role)) return res.status(403).json({ error: 'Admin accounts are hidden from managers' });
    if (['admin', 'superadmin'].includes(req.body?.role)) return res.status(403).json({ error: 'Managers cannot assign the admin role' });
  }
  if (req.user.role === 'admin') {
    if (target.role === 'superadmin') return res.status(403).json({ error: 'Admin cannot modify the super admin account' });
    if (req.body?.role === 'superadmin') return res.status(403).json({ error: 'Admin cannot assign the super admin role' });
  }

  const result = updateUser(id, req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  if (req.user.id === id) return res.json({ user: result.user, token: signToken(result.user) });
  res.json(result.user);
});

app.delete('/api/users/:id', authenticate, isAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  const target = getUserById(Number(req.params.id));
  if (req.user.role === 'admin' && target?.role === 'superadmin') {
    return res.status(403).json({ error: 'Admin cannot delete the super admin account' });
  }
  const result = deleteUser(Number(req.params.id));
  if (result.error) return res.status(404).json({ error: result.error });
  res.json(result);
});

// Login activity (admin only).
app.get('/api/auth/logins', authenticate, isAdmin, (req, res) => {
  res.json(getLoginLogs());
});

// Protect the inventory API. Viewing is allowed for all roles; writes are
// limited to managers and above.
app.get('/api/stores', authenticate, (_req, res) => {
  res.json(getStores());
});

// Query string filters: ?storeId=3 &status=In Stock &search=MacBook
app.get('/api/laptops', authenticate, (req, res) => {
  const filters = {
    storeId: req.query.storeId || undefined,
    status: req.query.status || undefined,
    search: req.query.search || undefined
  };
  res.json(getLaptops(filters));
});

app.get('/api/laptops/:id', authenticate, (req, res) => {
  const laptop = getLaptop(Number(req.params.id));
  if (!laptop) return res.status(404).json({ error: 'Laptop not found' });
  res.json(laptop);
});

// POST /api/laptops/:id/transfer  body: { toStoreId: 5 }
app.post('/api/laptops/:id/transfer', authenticate, (req, res) => {
  if (!hasPerm(req.user, 'transferLaptops')) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const laptopId = Number(req.params.id);
  const toStoreId = Number(req.body.toStoreId);

  if (!Number.isInteger(toStoreId)) {
    return res.status(400).json({ error: 'toStoreId is required' });
  }

  const result = transferLaptop(laptopId, toStoreId);
  if (result.error) return res.status(404).json({ error: result.error });

  // Broadcast to every connected client (all stores + all devices).
  broadcast('laptop:transferred', result);
  broadcast('log:new', result.laptop);
  return res.json(result);
});

app.get('/api/logs', authenticate, (_req, res) => {
  res.json(getTransferLogs());
});

// -------------------------------- Settings --------------------------------
// UI labels / app text (public for authenticated users, editable by admin).
app.get('/api/settings', authenticate, (_req, res) => {
  res.json(getSettings());
});

app.put('/api/settings', authenticate, isAdmin, (req, res) => {
  res.json(setSettings(req.body || {}));
});

// ------------------------- Role permissions --------------------------------
// Admin reads/writes the permission map that controls what managers and staff
// can do. Admin itself always has full access.
app.get('/api/permissions', authenticate, isAdmin, (_req, res) => {
  res.json(getRolePermissions());
});

app.put('/api/permissions', authenticate, isAdmin, (req, res) => {
  const body = req.body || {};
  const clean = {};
  for (const role of ['manager', 'staff']) {
    clean[role] = {};
    for (const key of PERMISSION_KEYS) {
      clean[role][key] = !!body[role]?.[key];
    }
  }
  setSettings({ role_permissions: JSON.stringify(clean) });
  broadcast('permissions:updated', clean);
  res.json(clean);
});

// ----------------------------- Store management -----------------------------
// Admins can add / rename / remove stores. Managers can only rename stores
// (when granted the renameStores permission).
app.post('/api/stores', authenticate, isAdmin, (req, res) => {
  const result = addStore(req.body?.store_name);
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('store:added', result.store);
  broadcast('settings:updated', getSettings());
  res.status(201).json(result.store);
});

app.put('/api/stores/:id', authenticate, (req, res) => {
  if (!hasPerm(req.user, 'renameStores')) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = renameStore(Number(req.params.id), req.body?.store_name);
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('store:renamed', result.store);
  broadcast('settings:updated', getSettings());
  res.json(result.store);
});

app.delete('/api/stores/:id', authenticate, isAdmin, (req, res) => {
  const result = deleteStore(Number(req.params.id));
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('store:deleted', { id: result.id });
  broadcast('settings:updated', getSettings());
  res.json(result);
});

// ----------------------------- Inventory CRUD ------------------------------

// ----------------------------- Brands --------------------------------------
// Managers (and above) can list add, update and delete brands.
app.get('/api/brands', authenticate, (_req, res) => {
  res.json(getBrands());
});

app.post('/api/brands', authenticate, isAdminOrManager, (req, res) => {
  const result = addBrand(req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('brands:updated');
  res.status(201).json(result.brand);
});

app.put('/api/brands/:id', authenticate, isAdminOrManager, (req, res) => {
  const result = updateBrand(Number(req.params.id), req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('brands:updated');
  res.json(result.brand);
});

app.delete('/api/brands/:id', authenticate, isAdminOrManager, (req, res) => {
  const result = deleteBrand(Number(req.params.id));
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('brands:updated');
  res.json(result);
});

// ----------------------------- Sales --------------------------------------
app.get('/api/sales', authenticate, (_req, res) => {
  res.json(getSales());
});

app.get('/api/sales/summary', authenticate, (_req, res) => {
  res.json(getSalesSummary());
});

// POST /api/laptops/:id/sell  body: { salePrice }
app.post('/api/laptops/:id/sell', authenticate, (req, res) => {
  if (!hasPerm(req.user, 'editInventory')) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = sellLaptop(Number(req.params.id), req.body?.salePrice, req.user.username);
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('sale:new', result.sale);
  res.status(201).json(result.sale);
});

// POST /api/laptops  body: { brand, brand_model, ..., quantity?, serial_prefix? }
app.post('/api/laptops', authenticate, (req, res) => {
  if (!hasPerm(req.user, 'editInventory')) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const body = req.body || {};
  // If a quantity > 1 is supplied, bulk-add that many units.
  if (body.quantity != null && Number(body.quantity) > 1) {
    const result = createLaptopsBulk(body, body.quantity);
    if (result.error) return res.status(400).json({ error: result.error, created: result.created });
    broadcast('laptop:bulk', result.laptops);
    return res.status(201).json(result);
  }
  const result = createLaptop(body);
  if (result.error) return res.status(400).json({ error: result.error });
  broadcast('laptop:created', result.laptop);
  res.status(201).json(result.laptop);
});

// PUT /api/laptops/:id  body: { brand_model?, current_store_id?, status? }
app.put('/api/laptops/:id', authenticate, (req, res) => {
  if (!hasPerm(req.user, 'editInventory')) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = updateLaptop(Number(req.params.id), req.body || {});
  if (result.error) return res.status(404).json({ error: result.error });
  broadcast('laptop:updated', result.laptop);
  res.json(result.laptop);
});

// DELETE /api/laptops/:id
app.delete('/api/laptops/:id', authenticate, (req, res) => {
  if (!hasPerm(req.user, 'editInventory')) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = deleteLaptop(Number(req.params.id));
  if (result.error) return res.status(404).json({ error: result.error });
  broadcast('laptop:deleted', { id: result.id });
  res.json(result);
});

// SPA fallback: any GET that isn't an API route gets index.html, so the React
// app handles routing and a direct hit on the root URL works.
const fs = require('fs');
app.get(/^\/(?!api|socket\.io).*/, (_req, res) => {
  const index = path.join(FRONTEND_DIST, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  return res.status(404).json({ error: 'Frontend not built. Run: cd frontend && npm run build' });
});

// -------------------------------- Socket.io --------------------------------
// Clients authenticate the socket handshake with the same JWT.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUserById(payload.sub);
    if (!user) return next(new Error('Account no longer exists'));
    socket.user = { id: user.id, username: user.username, role: user.role };
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id} (${socket.user.username})`);

  socket.on('laptop:transfer', (data, ack) => {
    if (!hasPerm(socket.user, 'transferLaptops')) return typeof ack === 'function' && ack({ error: 'Insufficient permissions' });
    const result = transferLaptop(Number(data?.laptopId), Number(data?.toStoreId));
    if (result.error && typeof ack === 'function') return ack({ error: result.error });
    // Reflect the change back to all clients (including the requesting one).
    broadcast('laptop:transferred', result);
    if (typeof ack === 'function') ack(result);
  });

  socket.on('laptop:create', (data, ack) => {
    if (!hasPerm(socket.user, 'editInventory')) return typeof ack === 'function' && ack({ error: 'Insufficient permissions' });
    const result = createLaptop(data || {});
    if (result.error && typeof ack === 'function') return ack({ error: result.error });
    broadcast('laptop:created', result.laptop);
    if (typeof ack === 'function') ack(result);
  });

  socket.on('laptop:update', (data, ack) => {
    if (!hasPerm(socket.user, 'editInventory')) return typeof ack === 'function' && ack({ error: 'Insufficient permissions' });
    const result = updateLaptop(Number(data?.id), data?.fields || {});
    if (result.error && typeof ack === 'function') return ack({ error: result.error });
    broadcast('laptop:updated', result.laptop);
    if (typeof ack === 'function') ack(result);
  });

  socket.on('laptop:delete', (data, ack) => {
    if (!hasPerm(socket.user, 'editInventory')) return typeof ack === 'function' && ack({ error: 'Insufficient permissions' });
    const result = deleteLaptop(Number(data?.id));
    if (result.error && typeof ack === 'function') return ack({ error: result.error });
    broadcast('laptop:deleted', { id: result.id });
    if (typeof ack === 'function') ack(result);
  });

  const isAdminUser = socket.user && socket.user.role === 'admin';

  socket.on('settings:save', (data, ack) => {
    if (!isAdminUser) return typeof ack === 'function' && ack({ error: 'Insufficient permissions' });
    const settings = setSettings(data || {});
    broadcast('settings:updated', settings);
    if (typeof ack === 'function') ack({ ok: true, settings });
  });

  socket.on('store:add', (data, ack) => {
    if (!isAdminUser) return typeof ack === 'function' && ack({ error: 'Insufficient permissions' });
    const result = addStore(data?.store_name);
    if (result.error && typeof ack === 'function') return ack({ error: result.error });
    broadcast('store:added', result.store);
    if (typeof ack === 'function') ack(result);
  });

  socket.on('store:rename', (data, ack) => {
    if (!hasPerm(socket.user, 'renameStores')) return typeof ack === 'function' && ack({ error: 'Insufficient permissions' });
    const result = renameStore(Number(data?.id), data?.store_name);
    if (result.error && typeof ack === 'function') return ack({ error: result.error });
    broadcast('store:renamed', result.store);
    if (typeof ack === 'function') ack(result);
  });

  socket.on('store:delete', (data, ack) => {
    if (!isAdminUser) return typeof ack === 'function' && ack({ error: 'Insufficient permissions' });
    const result = deleteStore(Number(data?.id));
    if (result.error && typeof ack === 'function') return ack({ error: result.error });
    broadcast('store:deleted', { id: result.id });
    if (typeof ack === 'function') ack(result);
  });

  socket.on('disconnect', () => console.log(`Client disconnected: ${socket.id}`));
});

// Boot the storage driver (Sheets loads asynchronously), then start listening.
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