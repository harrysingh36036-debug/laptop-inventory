# Laptop Inventory Tracker (Real-Time)

Track laptop locations across **7 physical retail stores** in real time across all
screens. A change made at Store 1 appears instantly on the screen at Store 5 —
no refresh needed.

## Tech stack

| Layer     | Technology                                          |
| --------- | --------------------------------------------------- |
| Backend   | Node.js, Express, **Socket.io** , Node built-in SQLite (`node:sqlite`) |
| Frontend  | React 18, Vite, Tailwind CSS                        |
| Auth      | JWT (`jsonwebtoken`) + bcrypt password hashing      |
| Real-time | Socket.io WebSockets (broadcast on every transfer)  |

## The 7 stores (seeded automatically)

1. Store 1: Main Flagship
2. Store 2: North Hub
3. Store 3: South Branch
4. Store 4: East Outlet
5. Store 5: West Showroom
6. Store 6: Downtown Express
7. Store 7: Central Warehouse

`backend/db.js` seeds these stores, plus a starter set of laptops, on first run.

---

## Project structure

```
laptop-inventory/
├── backend/
│   ├── server.js         # Express REST + Socket.io server
│   ├── db.js             # Schema, seed data, queries, atomic transfers, users
│   ├── package.json
│   └── inventory.db      # (auto-created SQLite file)
└── frontend/
    ├── src/
    │   ├── App.jsx       # data layer, filters, real-time listeners, auth
    │   ├── api.js        # REST client (+ JWT header handling)
    │   ├── socket.js     # shared Socket.io client (auth handshake)
    │   └── components/   # StoreFilter, Toolbar, LaptopTable, HistoryLog,
    │                     # InventoryModal, Login, AccountManager, Toast
    ├── vite.config.js    # proxies /api and /socket.io to the backend
    └── index.html
```

## Database schema

```sql
Stores        (id PK, store_name UNIQUE, created_at)
Laptops       (id PK, brand_model, serial_number UNIQUE, current_store_id FK→Stores,
               status CHECK(In Stock/In Transit/Sold), updated_at)
TransferLogs  (id PK, laptop_id FK→Laptops, from_store_id FK→Stores,
               to_store_id FK→Stores, changed_at)
Users         (id PK, username UNIQUE, password_hash, display_name,
               role CHECK(admin/manager/staff), created_at)
```

## How transfers stay real-time

1. Any user picks a store + clicks **Confirm Transfer**.
2. The React app POSTs `POST /api/laptops/:id/transfer` `{ toStoreId }`.
3. `transferLaptop()` performs an **atomic SQLite transaction**: it updates
   `Laptops.current_store_id` and inserts a row into `TransferLogs`.
4. The server calls `io.emit('laptop:transferred', result)`.
5. Every connected client (every store's screen) receives the event and
   updates that row instantly, and prepends an entry to the History log.

---

## Run it locally

Prerequisite: **Node.js 22.5+** (Node 24 recommended; install from https://nodejs.org).
SQLite is Node's built-in `node:sqlite` module, so **no native compilation** (no
Python / Visual Studio tools) is required.

### 1. Backend

```bash
cd backend
npm install
npm start          # http://localhost:4000
# or: npm run dev  (auto-restart on file changes)
```

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Open `http://localhost:3000` in as many browser windows/tabs as you like and
watch transfers sync instantly across every window.

## Logging in

On first run, a default admin account is seeded:

| Username | Password   | Role  |
| -------- | ---------- | ----- |
| `admin`  | `admin123` | admin |

**Change the password right away** — in the app, click **Accounts** → **Edit**
on your own account.

### Roles

| Role    | Permissions                                                     |
| ------- | --------------------------------------------------------------- |
| staff   | View inventory, filters, and the real-time log (read-only)      |
| manager | Everything staff can, plus transfer laptops and edit inventory  |
| admin   | Everything a manager can, plus manage accounts (Accounts button)|

Self-registration (`Sign in → Register`) creates a **staff** account. Use the
**Accounts** manager (admins only) to create managers/admins.

### Verify the API (authenticated)

```bash
# Get a token
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

TOKEN=PASTE_TOKEN_HERE
curl http://localhost:4000/api/stores -H "Authorization: Bearer $TOKEN"
curl http://localhost:4000/api/laptops -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:4000/api/laptops/1/transfer \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"toStoreId":5}'
```

---

## API reference

All endpoints except `/api/auth/*` and `/api/health` require
`Authorization: Bearer <token>`. Write endpoints (transfer, add, edit, delete)
require a manager or admin role; `/api/users*` requires admin.

| Method | Endpoint                              | Description                                  |
| ------ | ------------------------------------- | -------------------------------------------- |
| GET    | `/api/health`                         | Service status                               |
| POST   | `/api/auth/register`                  | Create a staff account                        |
| POST   | `/api/auth/login`                     | Sign in → `{ token, user }`                   |
| GET    | `/api/auth/me`                        | Current user from token                       |
| GET    | `/api/users`                          | List accounts (admin)                         |
| GET    | `/api/users/:id`                      | Single account (admin)                        |
| POST   | `/api/users`                          | Create account `{ username, password, role }` (admin) |
| PUT    | `/api/users/:id`                      | Update account (admin)                        |
| DELETE | `/api/users/:id`                      | Delete account, not yourself (admin)          |
| GET    | `/api/stores`                         | List all 7 stores                             |
| GET    | `/api/laptops`                        | List laptops (`?storeId=&status=&search=`)   |
| GET    | `/api/laptops/:id`                    | Single laptop                                |
| POST   | `/api/laptops`                        | Add laptop `{ brand_model, serial_number, current_store_id, status }` |
| PUT    | `/api/laptops/:id`                    | Update laptop `{ brand_model?, current_store_id?, status? }` |
| DELETE | `/api/laptops/:id`                    | Remove laptop (broadcasts)                   |
| POST   | `/api/laptops/:id/transfer`           | Change store `{ toStoreId }` (broadcasts)    |
| GET    | `/api/logs`                           | Last 100 transfer log entries                |

Socket.io connections also authenticate via the handshake `auth.token`.

## Security considerations

- Passwords are hashed with **bcrypt** (no plaintext storage).
- Sessions use **JWT** with an HMAC secret (`JWT_SECRET` env var — set it in
  production).
- Inputs are **parameterized** (prepared statements) — no SQL injection.
- CORS is restricted to the frontend origin.
- To harden further for production: enable HTTPS, add rate limiting on
  `/api/auth/login`, set `JWT_SECRET`, and back up the SQLite file regularly.

## Google Sheets as the live database (optional)

You can make **Google Sheets** the actual database instead of SQLite. The app
reads the whole spreadsheet into memory at startup, writes every change back to
the sheet, and polls for edits made directly in Google (default every 30 s),
broadcasting a reload to all screens so staff still see updates in real time.

The sheet is auto-created with 5 tabs: `Stores`, `Laptops`, `TransferLogs`,
`Users`, `Settings` — plus the 7 seed stores, sample laptops, default labels and
the `admin` account.

### 1. Create the service account

1. Go to https://console.cloud.google.com → create a project (or reuse one).
2. Enable the **Google Sheets API**.
3. APIs & Services → Credentials → **Create Credentials → Service Account**.
4. Create a key for it → **Add Key → Create New Key → JSON** → download.
5. Create a Google Sheet, and **Share** it with the service account email
   (`...@....iam.gserviceaccount.com`) as **Editor**.

### 2. Configure the backend

Copy `backend/.env.example` to `backend/.env` and fill in:

```
STORAGE_DRIVER=sheets
SHEETS_SPREADSHEET_ID=<id from the sheet URL after /d/>
GOOGLE_SERVICE_ACCOUNT_JSON={ ...paste the whole key file as one line... }
```

> Alternative: put the key at a path and use `GOOGLE_APPLICATION_CREDENTIALS`.

### 3. Run

```
cd backend && npm install && npm start
```

Startup logs `[sheets] Google Sheets storage ready (...)`. Every transfer,
laptop CRUD, store rename and label change is now mirrored to your sheet — and
edits made in the sheet sync back to all logged-in screens within the poll
interval.

To switch back to SQLite, delete/rename `backend/.env` (or set
`STORAGE_DRIVER=sqlite`).