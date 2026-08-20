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
│   │   ├── api.js             # Supabase RPC client wrapper
│   │   ├── socket.js          # Supabase Realtime bridge (emits legacy events)
│   │   ├── supabaseClient.js  # Supabase client
│   │   └── components/        # StoreFilter, Toolbar, LaptopTable, HistoryLog,
│   │                          # InventoryModal, Login, tabs, modals, Toast
│   ├── vite.config.js
│   └── index.html
├── supabase-*.sql             # schema/migration scripts (apply in the SQL editor)
└── .github/workflows/
    ├── deploy-pages.yml       # builds frontend → publishes GitHub Pages
    └── sync-to-sheets.yml     # optional Supabase → Google Sheets sync
```

## Deploying

Push to `main`. The `deploy-pages.yml` workflow builds `frontend/` (injecting the
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` secrets) and publishes the bundle
to GitHub Pages.

### Local development

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

Create `frontend/.env` with:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

## MongoDB overflow (when the free tier runs out)

Supabase free tier is capped at 500 MB. When usage crosses **90%**, the
[automation repo](https://github.com/harrysingh36036-debug/automation)
workflow moves the **oldest history** — sold laptops, transfer logs, sales,
purchases and repairs — into a free MongoDB Atlas cluster (verify → delete,
so nothing is lost).

The app keeps showing that migrated history. After migrating, Supabase reads
return empty, and `frontend/src/mongoApi.js` falls back to the automation
repo's read-only API and merges the transferred records back into the UI.

Optional env vars (set only once the read API is deployed):

```
VITE_MONGO_READ_API_URL=https://<service>.onrender.com
VITE_MONGO_READ_API_KEY=<your READ_API_KEY>
```

Active "In Stock" / "In Transit" inventory stays in Supabase, so live editing
and Realtime are unaffected. See the automation repo's README for secrets,
table mapping and the free read-API deployment.

## Database

The schema is defined by the `supabase-*.sql` migration files at the repo root.
Apply them in the Supabase SQL Editor in dependency order:

1. `supabase-migration.sql` — base tables, RLS, realtime, RPC foundation
2. `supabase-update.sql` — vendors, customers, inventory stats, user management
3. `supabase-v3-master.sql` — repairs charge, delete logs, password-verified deletes
4. `supabase-hardening.sql` — auth gate on read RPCs, tightened RLS
5. `supabase-laptops-spec-columns.sql` — spec columns + laptop CRUD helpers
6. `supabase-ui-features-batch.sql` — `app_get_laptops` full payload, create-user fix
7. `supabase-fix-pgcrypto.sql` — pgcrypto in public schema (update-user fix)
8. `supabase-purchase-ledger.sql` — standalone purchases money ledger
9. `supabase-sell-aadhar.sql` — aadhar capture at checkout
10. `supabase-manager-store-report.sql` — manager-scoped daily report
11. `supabase-repair-charge-store.sql` — repairs store + charge, store-wise report
12. `supabase-transferred-by.sql` — `transferlogs.transferred_by` column
13. `supabase-delete-user.sql` — user list + delete admin/manager/staff accounts

## Logging in

Sign in with a username. Supabase authenticates against a derived email
(`<username>@laptop.inventory`). Accounts are created by an admin.