# Laptop Inventory — Design

Universal CRM (`universalcrm.in`): multi-store laptop inventory, transfers,
sales, repairs, vendors, customers, reports. Fully self-hosted — no Supabase,
no third-party services.

## Architecture

```
Browser (React SPA)
  │  same-origin /api + /socket.io
  ▼
Nginx ──► frontend/dist (static)
  │
  ├── /api/*        ──► Node.js :9634 (Express REST)
  └── /socket.io/*  ──► Node.js :9634 (Socket.io)
                            │
                            ▼
                       SQLite (backend/inventory.db)
```

Realtime: every mutation broadcasts a socket.io event; all connected devices
update in place — no page refresh. Web Push (VAPID) covers the app-closed case.

## Tech stack

| Layer    | Choice                                              |
|----------|-----------------------------------------------------|
| Frontend | React 18, Vite 5, Tailwind CSS 3, socket.io-client  |
| Backend  | Node 22+, Express 4, socket.io 4, node:sqlite       |
| Push     | web-push (VAPID), Service Worker `public/sw.js`     |
| Auth     | JWT (`jsonwebtoken` + `bcryptjs`), 7-day expiry     |
| Hardening| helmet, express-rate-limit (login 5/min, api 100/min)|
| Deploy   | Nginx (static + proxy), PM2 process `laptop`        |
| Exports  | jsPDF + autotable (reports), CSV downloads          |

## Data model (SQLite)

- **Stores** — id, store_name. Seeded with 7 stores.
- **Brands** — id, name (unique), serial_prefix (auto-serial generation).
- **Laptops** — the core unit. Spec fields (brand, product_line, brand_model,
  processor_type, ram, generation, storage_type/size, graphics*, charger,
  condition), commercial fields (purchase_rate, extra_charges,
  purchase_comment, purchased_from, source_type/id), purchaser PII
  (name/phone/aadhar + hash), `current_store_id`, `status`
  (`In Stock` | `In Transit` | `Sold`). Sold rows carry their latest sale
  inline (sold_at/by/price/customer) via query join.
- **PendingTransfers** — request → accept/reject/cancel workflow. Initiating
  sets the laptop `In Transit`; accept moves it + writes TransferLogs;
  reject/cancel restores `In Stock`.
- **TransferLogs** — audit of every move (from/to store, transferred_by).
- **Sales** — laptop_id, serial, model, store, prices (sale/cost/profit),
  customer (id/name/phone), payment method/detail, sold_at/by.
  Deleting a sale reverses it (laptop back to `In Stock`).
- **Repairs** — laptop link, issue, vendor, cost, charge, store, status
  (`Pending` | `In Progress` | `Repaired`).
- **Vendors / Customers** — name, contact/phone, email, address, notes.
- **Users** — username (unique, lowercase), password_hash, display_name,
  role, home_store_id, allowed_store_ids (JSON), force_password_change.
- **Settings** — key/value (UI labels, role_permissions JSON).
- **LoginLogs / DeleteLogs / PushSubscriptions** — sign-in audit,
  password-confirmed deletion audit, web-push endpoints.

Purchases are not a separate table: every inventory unit *is* a purchase
(the Purchases tab is a ledger view over Laptops).

## Roles & permissions

Hierarchy: `superadmin > admin > manager > staff`.

- Admins bypass all permission checks. Manager/staff capabilities
  (`editInventory`, `transferLaptops`, `createStaff`, `renameStores`,
  `editLabels`, `manageVendors`, `manageCustomers`, `viewPII`) are stored in
  Settings and editable by admins.
- Staff transfer only out of their home store; managers are scoped to it.
- Destructive actions (delete laptop/brand/vendor/customer/repair/sale/user)
  require confirming the requester's own password + optional remarks, and are
  written to DeleteLogs.
- Login enforces per-account allowed stores (`allowed_store_ids`).

## REST API (`/api`, JWT Bearer)

- `POST /api/auth/login {username,password,storeId}`, `GET /api/auth/me`
- `GET /api/public/stores`, `GET /api/public/usernames` (pre-login)
- Laptops: `GET /api/laptops?storeId&status&search`, `GET/POST /:id`,
  `PUT /:id`, `DELETE /:id`, `POST /:id/sell`, `POST /:id/transfer` (legacy)
- Transfers: `GET /api/transfers/pending`, `POST /initiate`,
  `POST /:id/accept|reject|cancel`
- `GET /api/logs` (transfer history)
- Brands, vendors (`+ bulk-delete`), customers (`+ bulk-delete`): full CRUD
- Sales: `GET /api/sales`, `GET /api/sales/summary`, `DELETE /api/sales/:id`
- Purchases: `GET /api/purchases[/summary]`, `POST/PUT/DELETE` (unit CRUD)
- Repairs: `GET /api/repairs[/summary]`, `GET /api/repairs/by-store`,
  `POST/PUT/DELETE`
- Reports: `GET /api/reports/daily?date`, `GET /api/reports/daily-store-sales?date`,
  `GET /api/inventory/stats?storeId`
- Admin: users CRUD, `GET /api/auth/logins`, settings `GET/PUT`,
  permissions `GET/PUT`, stores CRUD, `GET /api/delete-logs`
- Push: `GET /api/push/vapid-public-key`, `POST /api/push/subscribe|unsubscribe`,
  `POST /api/push/test` (admin)

## Realtime events (socket.io, JWT handshake)

`laptop:created|bulk|updated|deleted|transferred`, `log:new`, `sale:new`,
`repair:created|updated|deleted`, `repairs:updated`,
`pending_transfers:updated`, `brands:updated`, `store:added|renamed|deleted`,
`settings:updated`, `permissions:updated`, `data:reloaded`,
`presence:update` (online-users map for the Accounts tab).

The frontend `socket.js` is a thin socket.io-client wrapper; `App.jsx`
subscribes per event and patches state (plus toast + transfer sound).
`presence.js` exposes the same snapshot/subscribe API the UI uses.

## Push notifications (free, self-hosted)

- VAPID keypair (`VAPID_PUBLIC_KEY/PRIVATE_KEY/CONTACT` in `backend/.env`).
- Devices opt in via profile menu → Notifications (Service Worker
  subscription stored in `PushSubscriptions`).
- Server fans out on transfer/sale/repair events. Closed app → OS
  notification + sound; hidden tab → same via SW; open app → toast +
  `transfer-sound.mp3`.
- Requires HTTPS in production (browser secure-context rule).

## Frontend structure (`frontend/src`)

- `App.jsx` — auth bootstrap, data loading, socket listeners, tab routing,
  transfer-approval popup + sound, global toast.
- `api.js` — REST client (same-origin `/api`), token storage, audit hooks.
- Tabs: Dashboard, Inventory (`InventoryView` + `LaptopTable` desktop table /
  mobile cards), Transfers history, Purchases, Vendor Laptops, Repairs,
  Sales (+ receipt print), Customers, Reports (PDF/CSV), Data Log, Settings.
- `QuickBall.jsx` — floating menu (navigation, notifications toggle,
  settings, sign-out); `sw.js` + `push.js` — web-push client.

## Config & environments

| Var | Where | Purpose |
|-----|-------|---------|
| `PORT` | backend/.env | Node port (9634 on VPS) |
| `JWT_SECRET` | backend/.env | Must be strong in prod |
| `ADMIN_PASSWORD` | backend/.env | First-boot superadmin+admin password |
| `VAPID_*` | backend/.env | Push keys (private never in git) |
| `PUSH_WEBHOOK_SECRET` | backend/.env | Legacy hook guard (unused by UI) |
| `VITE_VAPID_PUBLIC_KEY` | frontend/.env | Optional; else fetched from API |
| `DATA_DIR` | env | SQLite directory (default: backend/) |

`.env` files are gitignored; `.env.example` files document the shape.

## Migration helpers (`backend/`)

- `import-csv.js` — imports Reports-tab CSV exports
  (`node import-csv.js [--merge|--replace] inventory.csv [sales.csv] [transfers.csv]`).
- `clear-business-data.sql` — legacy Supabase helper (not used by SQLite).
