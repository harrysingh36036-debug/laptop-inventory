# Laptop Inventory — Handover Summary

## What the app does
A web app to track laptop inventory across stores. It supports multiple users
with **roles** and **permissions**, live transfer logging between stores, and the
owner/admin can see which accounts are used.

- **Live URL:** https://laptop-inventory-production.up.railway.app

## Access
- **Admin login:** username `admin`, password `admin123`
- There is currently **1 account only (admin)**. All previously created staff/manager
  accounts were lost (see "Important issue" below).
- Self-registration is disabled. Only an admin can create new accounts.

## Data storage
- The app uses a **SQLite database**.
- `STORAGE_DRIVER=sqlite`
- `DATA_DIR=/data`
- Important: persistence depends on the volume mounted at `/data`. If the volume is
  missing, the database is wiped on every redeploy.

## Roles
- **Admin** — full control: add/delete stores, create/edit/delete accounts, reset any
  password, configure permissions, view everything including login activity.
- **Manager** — can create staff + managers, reset their passwords, rename stores,
  other permissions as configured by admin. Never sees admin accounts.
- **Staff** — limited to the permissions granted by admin.

## Features
- Store management (admin add/delete, manager rename)
- Laptop inventory + transfers between stores
- Roles & Permissions tab (admin can toggle manager/staff permissions)
- Account Manager (create/edit accounts, reset passwords, delete)
- **Login Activity** button in Account Manager — shows who logged in and when
- Account counter shows total + breakdown (e.g. "1 account · 1 admin · 0 manager · 0 staff")

## 🔴 IMPORTANT ISSUE — accounts are being deleted
Accounts keep disappearing because the **persistent volume on Railway is broken/stuck**.
Railway's CLI has a stale reference to an old volume (`mountPath` had been `/app/backend`
instead of `/data`), so the database was writien to a non-persistent path and wiped on
every deploy.

This was corrected so the volume now mounts at `/data` (matching `DATA_DIR`), but the
volume still shows an internal `isPendingDeletion` flag, so Railway may still wipe data.

### What still needs to be done (owner MUST do this in the Railway dashboard)
1. Open the Railway project:
   https://railway.com/project/1de6be24-795a-4aaa-a749-095ecd5a6d18
2. Left sidebar → **Volumes**
3. You should see the volume mounted at `/data`.
4. **Delete this volume** (the old one is stuck and marked "pending deletion").
   If it is already deleted, that's fine.
5. Create a **new volume**:
   - Service: `laptop-inventory`
   - Mount path: **`/data`**
   - Size: 500 MB – 1 GB
   - Deploy.
6. After this, redeploy the app.

After a correct volume is attached at `/data`, accounts and data will **persist across
deploys** and will no longer be deleted.

## How to redeploy (after code changes)
- Frontend: build first → `npm run build` (in `frontend/`)
- Backend: syntax check → `node --check server.js` (in `backend/`)
- Deploy: `railway up` (from project root)

## Tech stack / repo
- Private GitHub repo: `harrysingh36036-debug/laptop-inventory`
- Backend: Node.js + Express + SQLite
- Frontend: React + Vite + Tailwind
- Hosted on Railway

## Next steps / backlog
1. **Fix the volume** (the critical issue above) so accounts don't get deleted.
2. Optionally: after login tracking is verified, consider migrating to a free cloud
   host (User mentioned Oracle Cloud free tier) for lifetime-free hosting.