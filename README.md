# Laptop Inventory Tracker

Track laptop inventory across retail stores in real time. A change made at one
store appears instantly on every screen — no refresh needed.

**Live URL:** https://harrysingh36036-debug.github.io/laptop-inventory/

## Tech stack

| Layer     | Technology                                    |
| --------- | --------------------------------------------- |
| Frontend  | React 18, Vite, Tailwind CSS                  |
| Data      | Supabase (Postgres) + RPC stored functions    |
| Real-time | Supabase Realtime (postgres_changes)          |
| Hosting   | GitHub Pages (deployed from `main` via Actions) |

## Project structure

```
laptop-inventory/
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # data layer, filters, realtime listeners, auth
│   │   ├── api.js             # REST client for the Node backend (same signatures)
│   │   ├── socket.js          # socket.io live connection (emits legacy events)
│   │   ├── presence.js        # online-users presence over socket.io
│   │   └── components/        # StoreFilter, Toolbar, LaptopTable, HistoryLog,
│   │                          # InventoryModal, Login, tabs, modals, Toast
│   ├── vite.config.js
│   └── index.html
├── backend/
│   ├── server.js              # Express REST + socket.io + web push
│   ├── db.js                  # SQLite schema + data layer (auto-migrates)
│   ├── push.js                # free self-hosted web push (VAPID)
│   └── import-csv.js          # one-time CSV migration helper
└── .github/workflows/
    └── archive-to-sheets.yml  # optional Sheets archive
```

## Deploying (VPS)

Push to `main`, then on the VPS:

```bash
cd /var/www/laptop-inventory && git pull
cd backend && npm install
cd ../frontend && npm install && npm run build
pm2 restart laptop
```

Nginx serves `frontend/dist` and proxies `/api` + `/socket.io` to Node.

### First boot accounts

Set `ADMIN_PASSWORD` in `backend/.env` before the first start for known
credentials (both `superadmin` and `admin` get it, change on first login).
Otherwise random passwords are printed once to the server log
(`pm2 logs laptop`).

### Local development

```bash
cd backend && npm install && npm start   # http://localhost:4000
cd frontend && npm install && npm run dev # http://localhost:5173 (proxies /api)
```

No `frontend/.env` keys needed — the API is same-origin. Optional:

```
VITE_VAPID_PUBLIC_KEY=   # web-push public key (else fetched from /api/push/vapid-public-key)
```

## Migrating old data (CSV)

In the old app: Reports tab → download inventory / sales / transfers CSVs.
Then:

```bash
cd backend
node import-csv.js --replace inventory.csv sales.csv transfers.csv
```

`--merge` (default) keeps existing rows and skips duplicates.

## Database

SQLite (`backend/inventory.db`, override with `DATA_DIR`). Schema lives in
`backend/db.js` and auto-migrates with `ALTER TABLE` guards — no manual
migrations. `backend/clear-business-data.sql` is a legacy Supabase helper.

## Logging in

Sign in with a username. Supabase authenticates against a derived email
(`<username>@laptop.inventory`). Accounts are created by an admin.