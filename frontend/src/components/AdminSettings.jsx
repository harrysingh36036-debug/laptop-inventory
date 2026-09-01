import { useState } from 'react';
import { DEFAULT_LABELS } from '../labels.jsx';
import { getPermissions, savePermissions, getUsers, updateUser, createUser, deleteUser } from '../api';
import DangerConfirmModal from './DangerConfirmModal';
import ActiveAccountsTab from './ActiveAccountsTab';

// Description rows for the customizable button/label texts.
const LABEL_FIELDS = [
  ['appTitle', 'Dashboard title'],
  ['appSubtitle', 'Dashboard subtitle'],
  ['filterByStore', 'Store filter heading'],
  ['allStores', 'All-stores button'],
  ['statusLabel', 'Status filter heading'],
  ['anyStatus', 'Status dropdown "any" option'],
  ['searchPlaceholder', 'Search box placeholder'],
  ['addInventoryButton', 'Add-inventory button'],
  ['tableBrand', 'Column: brand/model'],
  ['tableSerial', 'Column: serial number'],
  ['tableStore', 'Column: store'],
  ['tableStatus', 'Column: status'],
  ['tableUpdated', 'Column: updated'],
  ['tableChangeLocation', 'Column: change location'],
  ['tableActions', 'Column: actions'],
  ['selectStore', 'Transfer dropdown placeholder'],
  ['unassigned', '"Unassigned" cell text'],
  ['viewOnly', 'View-only cell text'],
  ['editButton', 'Edit button'],
  ['deleteButton', 'Delete button'],
  ['transferButton', 'Confirm Transfer button'],
  ['transferHistory', 'History section title'],
  ['transferHistorySubtitle', 'History section subtitle'],
  ['addLaptopTitle', 'Add-modal title'],
  ['editLaptopTitle', 'Edit-modal title'],
  ['noLaptops', 'Empty-table message']
];

// Admin-configurable capabilities per role (the super admin decides for every
// role; admins always have the core rights, vendor control is grantable).
const PERMISSION_FIELDS = [
  ['editInventory', 'Add / edit / remove laptops'],
  ['transferLaptops', 'Transfer laptops between stores'],
  ['renameStores', 'Rename stores'],
  ['editLabels', 'Edit buttons & labels'],
  ['manageVendors', 'Manage vendors (add / edit / delete)'],
  ['manageCustomers', 'Manage customers (add / edit / delete)'],
  ['viewPII', 'View PII (customer name / phone / Aadhar)']
];

const DEFAULT_PERMISSIONS = {
  admin: {
    editInventory: true,
    transferLaptops: true,
    createStaff: true,
    renameStores: true,
    editLabels: true,
    manageVendors: false,
    manageCustomers: false,
    viewPII: true
  },
  manager: {
    editInventory: true,
    transferLaptops: true,
    createStaff: true,
    renameStores: true,
    editLabels: false,
    manageVendors: false,
    manageCustomers: false,
    viewPII: false
  },
  staff: {
    editInventory: false,
    transferLaptops: false,
    createStaff: false,
    renameStores: false,
    editLabels: false,
    manageVendors: false,
    manageCustomers: false,
    viewPII: false
  }
};

export default function AdminSettings({ stores, settings, onSaveSettings, onSaveStore, onDeleteStore, onClose, isAdmin = true, isSuperAdmin = false, currentUserId = null }) {
  const [labels, setLabels] = useState({ ...DEFAULT_LABELS, ...(settings || {}) });
  const [storeName, setStoreName] = useState('');
  const [edits, setEdits] = useState({}); // storeId -> draft name
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [delStore, setDelStore] = useState(null); // { id, name } scheduled for deletion

  const [tab, setTab] = useState('stores');

  const setLabel = (key) => (e) => setLabels((l) => ({ ...l, [key]: e.target.value }));
  const setEdit = (id) => (e) => setEdits((d) => ({ ...d, [id]: e.target.value }));

  const flash = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2500);
  };

  const saveLabels = async () => {
    setSaving(true);
    const err = await onSaveSettings(labels);
    setSaving(false);
    if (err) flash(err);
    else flash('Labels saved');
  };

  const addStore = async (e) => {
    e.preventDefault();
    if (!storeName.trim()) return;
    const err = await onSaveStore({ store_name: storeName.trim() });
    if (err) return flash(err);
    setStoreName('');
    flash('Store added');
  };

  const renameOne = async (id, value) => {
    if (!value?.trim()) return;
    const err = await onSaveStore({ id, store_name: value.trim() });
    if (err) return flash(err);
    setEdits((d) => { const n = { ...d }; delete n[id]; return n; });
    flash('Store renamed');
  };

  const removeOne = (id, name) => {
    setDelStore({ id, name });
  };

  const confirmDeleteStore = async (pwd, remarks) => {
    const s = delStore;
    if (!s) return '';
    const err = await onDeleteStore(s.id, pwd, remarks);
    if (err) return err;
    setDelStore(null);
    flash('Store removed');
    return '';
  };

  // ---- Permissions tab (admin only) --------------------------------------
  const [perms, setPerms] = useState(null);
  const [permsLoaded, setPermsLoaded] = useState(false);
  const [permsSaving, setPermsSaving] = useState(false);

  const loadPerms = async () => {
    try {
      const p = await getPermissions();
      setPerms({
        admin: { ...DEFAULT_PERMISSIONS.admin, ...(p.admin || {}) },
        manager: { ...DEFAULT_PERMISSIONS.manager, ...(p.manager || {}) },
        staff: { ...DEFAULT_PERMISSIONS.staff, ...(p.staff || {}) }
      });
    } catch (e) {
      flash(e.message);
    } finally {
      setPermsLoaded(true);
    }
  };

  const togglePerm = (role, key) =>
    setPerms((p) => ({ ...p, [role]: { ...p[role], [key]: !p[role][key] } }));

  const savePerms = async () => {
    if (!perms) return;
    setPermsSaving(true);
    try {
      await savePermissions(perms);
      flash('Permissions saved');
    } catch (e) {
      flash(e.message);
    } finally {
      setPermsSaving(false);
    }
  };

  const selectTab = (k) => {
    setTab(k);
    if (k === 'permissions' && !permsLoaded) loadPerms();
    if (k === 'users' && !usersLoaded) loadUsers();
    // Accounts tab fetches its own users live; no preload needed
  };

  // ---- Users tab (admin only) ---------------------------------------------
  const [users, setUsers] = useState([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [drafts, setDrafts] = useState({}); // userId -> { role, store_id }
  const [usersBusy, setUsersBusy] = useState(false);
  const [newUser, setNewUser] = useState({ display_name: '', username: '', password: '', role: 'staff', store_id: 0 });
  const [creating, setCreating] = useState(false);

  const setNew = (k) => (e) => setNewUser((d) => ({ ...d, [k]: e.target.value }));

  const createAccount = async (e) => {
    e.preventDefault();
    if (!newUser.username.trim() || !newUser.password) {
      flash('Username and password are required.');
      return;
    }
    setCreating(true);
    try {
      const res = await createUser({
        username: newUser.username.trim(),
        password: newUser.password,
        display_name: newUser.display_name.trim(),
        role: newUser.role,
        store_id: newUser.store_id === '' ? null : Number(newUser.store_id || 0)
      });
      flash(`${res?.user?.display_name || newUser.username} account created`);
      setNewUser({ display_name: '', username: '', password: '', role: 'staff', store_id: 0 });
      await loadUsers();
    } catch (err) {
      flash(err.message);
    } finally {
      setCreating(false);
    }
  };

  const loadUsers = async () => {
    try {
      const list = await getUsers();
      const visible = (list || []).filter((u) => isSuperAdmin || u.role !== 'superadmin');
      setUsers(visible);
      setDrafts(
        visible.reduce((m, u) => {
          m[u.id] = { role: u.role, store_id: u.home_store_id ?? 0 };
          return m;
        }, {})
      );
    } catch (e) {
      flash(e.message);
    } finally {
      setUsersLoaded(true);
    }
  };

  const setDraft = (id, k) => (e) => setDrafts((d) => ({ ...d, [id]: { ...d[id], [k]: e.target.value === '' ? '' : e.target.value } }));

  const saveUser = async (u) => {
    const d = drafts[u.id];
    if (!d) return;
    setUsersBusy(true);
    try {
      await updateUser(u.id, {
        role: d.role || u.role,
        store_id: d.store_id === '' ? 0 : Number(d.store_id || 0)
      });
      flash(`${u.display_name || u.username} updated`);
      await loadUsers();
    } catch (e) {
      flash(e.message);
    } finally {
      setUsersBusy(false);
    }
  };

  const [delUser, setDelUser] = useState(null);
  const [resetPwdUser, setResetPwdUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const removeOneUser = (u) => setDelUser(u);

  const confirmDeleteUser = async (pwd, remarks) => {
    const u = delUser;
    if (!u) return '';
    try {
      await deleteUser(u.id, pwd, remarks);
      setDelUser(null);
      flash(`${u.display_name || u.username} account deleted`);
      await loadUsers();
      return '';
    } catch (e) {
      return e.message;
    }
  };

  const resetPassword = async (u) => {
    if (!newPassword || newPassword.length < 6) {
      flash('Password must be at least 6 characters');
      return;
    }
    setUsersBusy(true);
    try {
      await updateUser(u.id, { password: newPassword });
      setResetPwdUser(null);
      setNewPassword('');
      flash(`Password updated for ${u.display_name || u.username}`);
    } catch (e) {
      flash(e.message);
    } finally {
      setUsersBusy(false);
    }
  };

  const TABS = [['stores', 'Stores']].concat(
    isAdmin ? [['labels', 'Buttons & Labels']] : [],
    (isAdmin || isSuperAdmin) ? [['permissions', 'Roles & Permissions']] : [],
    isAdmin ? [['users', 'Users']] : [],
    [['accounts', 'Accounts']]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-2xl border border-line bg-surface p-4 sm:p-6 shadow-pop">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">
            {isAdmin ? 'Admin Settings' : 'Store Management'}
          </h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {message && (
          <p className="mt-3 rounded-lg border border-stock-ok/25 bg-stock-ok/10 px-3 py-2 text-sm text-stock-ok">
            {message}
          </p>
        )}

        {/* Tabs - scrollable on phone so labels don't spill outside rounded box */}
        <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1 no-scrollbar">
          {TABS.map(([k, n]) => (
            <button
              key={k}
              onClick={() => selectTab(k)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 sm:flex-1 sm:whitespace-normal sm:text-sm ${
                tab === k ? 'bg-surface-3 text-ink' : 'text-ink-dim hover:text-ink'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {tab === 'stores' && (
          <div className="mt-4 space-y-4">
            {isAdmin && (
              <form onSubmit={addStore} className="flex gap-2">
                <input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="New store name…"
                  className="field flex-1"
                />
                <button type="submit" className="btn-accent">
                  Add Store
                </button>
              </form>
            )}

            <div className="space-y-2">
              {stores.map((s) => {
                const draft = edits[s.id] ?? s.store_name;
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <input
                      value={draft}
                      onChange={setEdit(s.id)}
                      className="field flex-1"
                    />
                    <button
                      onClick={() => renameOne(s.id, draft)}
                      disabled={draft.trim() === s.store_name}
                      className="btn-ghost disabled:opacity-40"
                    >
                      Rename
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => removeOne(s.id, s.store_name)}
                        className="btn-danger"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {!isAdmin && (
              <p className="text-xs text-ink-faint">
                Managers can rename stores. Adding or removing stores is restricted to admins.
              </p>
            )}
          </div>
        )}

        {tab === 'labels' && (
          <div className="mt-4 space-y-3">
            {LABEL_FIELDS.map(([key, hint]) => (
              <div key={key}>
                <label className="flabel">{hint}</label>
                <input
                  value={labels[key]}
                  onChange={setLabel(key)}
                  className="field mt-1.5"
                />
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <button onClick={saveLabels} disabled={saving} className="btn-accent disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Labels'}
              </button>
            </div>
          </div>
        )}

        {tab === 'permissions' && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-ink-faint">
              Grant or revoke each permission for admins, managers and staff. The super admin always has access to everything.
            </p>
            {!perms ? (
              <p className="text-sm text-ink-faint">Loading permissions…</p>
            ) : (
              <>
                {['admin', 'manager', 'staff'].map((role) => (
                  <div key={role} className="rounded-xl border border-line bg-surface-2/40 p-4">
                    <h3 className="text-sm font-semibold capitalize text-ink">{role}</h3>
                    <div className="mt-2 space-y-2">
                      {PERMISSION_FIELDS.map(([key, hint]) => (
                        <label
                          key={key}
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-dim transition-colors duration-150 hover:bg-surface-3 hover:text-ink"
                        >
                          <span>{hint}</span>
                          <input
                            type="checkbox"
                            checked={!!perms[role][key]}
                            onChange={() => togglePerm(role, key)}
                            className="h-4 w-4 rounded accent-accent"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-1">
                  <button onClick={savePerms} disabled={permsSaving} className="btn-accent disabled:opacity-50">
                    {permsSaving ? 'Saving…' : 'Save Permissions'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'users' && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-ink-faint">
              Assign each account its role and home store. A manager sees only their home store's daily report. Admins can create and delete manager, admin and staff accounts (never their own account); only the super admin can manage a super admin account.
            </p>

            <form onSubmit={createAccount} className="rounded-xl border border-line bg-surface-2/40 p-4">
              <h3 className="text-sm font-semibold text-ink">Create account</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="flabel">Display name</label>
                  <input value={newUser.display_name} onChange={setNew('display_name')} className="field mt-1.5" placeholder="e.g. Priya Sharma" />
                </div>
                <div>
                  <label className="flabel">Username <span className="text-stock-risk">*</span></label>
                  <input value={newUser.username} onChange={setNew('username')} className="field mt-1.5" placeholder="e.g. priya (3-32 chars)" autoComplete="off" />
                </div>
                <div>
                  <label className="flabel">Password <span className="text-stock-risk">*</span></label>
                  <input type="password" value={newUser.password} onChange={setNew('password')} className="field mt-1.5" placeholder="At least 6 characters" autoComplete="new-password" />
                </div>
                <div>
                  <label className="flabel">Role</label>
                  <select value={newUser.role} onChange={setNew('role')} className="field mt-1.5">
                    <option value="staff">staff</option>
                    <option value="manager">manager</option>
                    <option value="admin">admin</option>
                    {isSuperAdmin && <option value="superadmin">superadmin</option>}
                  </select>
                </div>
                <div className="sm:col-span-2 min-w-0">
                  <label className="flabel">Home store</label>
                  <select value={newUser.store_id} onChange={setNew('store_id')} className="field mt-1.5 w-full max-w-full sm:max-w-[280px]">
                    <option value={0}>— No store —</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.store_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button type="submit" disabled={creating} className="btn-accent disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </form>

            <p className="text-sm text-ink-faint">
              Existing accounts — change a role or home store, then press Save. Admins can also reset passwords.
            </p>
            {!usersLoaded ? (
              <p className="text-sm text-ink-faint">Loading users…</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-ink-faint">No accounts found.</p>
            ) : (
              <div className="space-y-2">
                {users.map((u) => {
                  const d = drafts[u.id] || {};
                  return (
                    <div key={u.id} className="rounded-xl border border-line bg-surface-2/40 p-4 overflow-hidden">
                      <div className="flex flex-col gap-3 min-w-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{u.display_name || u.username}</p>
                          <p className="truncate text-xs text-ink-faint">
                            @{u.username}
                            {u.home_store_name ? ` · ${u.home_store_name}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end min-w-0">
                          <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:min-w-[130px] sm:max-w-[160px] sm:flex-1">
                            <span className="flabel">Role</span>
                            <select
                              value={d.role ?? u.role}
                              onChange={setDraft(u.id, 'role')}
                              className="field w-full min-w-0"
                              disabled={u.role === 'superadmin' && !isSuperAdmin}
                            >
                              <option value="staff">staff</option>
                              <option value="manager">manager</option>
                              <option value="admin">admin</option>
                              {isSuperAdmin && <option value="superadmin">superadmin</option>}
                            </select>
                          </div>
                          <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:min-w-[160px] sm:max-w-[220px] sm:flex-1">
                            <span className="flabel">Home store</span>
                            <select
                              value={d.store_id ?? u.home_store_id ?? 0}
                              onChange={setDraft(u.id, 'store_id')}
                              className="field w-full min-w-0"
                            >
                              <option value={0}>— No store —</option>
                              {stores.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.store_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-0 sm:w-auto sm:pt-5">
                            <button
                              onClick={() => saveUser(u)}
                              disabled={usersBusy}
                              className="btn-accent disabled:opacity-50"
                            >
                              Save
                            </button>
                            {(isAdmin || isSuperAdmin) && (
                              <button
                                onClick={() => { setResetPwdUser(resetPwdUser?.id === u.id ? null : u); setNewPassword(''); }}
                                disabled={usersBusy}
                                className="btn-ghost disabled:opacity-50"
                              >
                                {resetPwdUser?.id === u.id ? 'Cancel' : 'Reset Password'}
                              </button>
                            )}
                            <button
                              onClick={() => removeOneUser(u)}
                              disabled={usersBusy || u.id === currentUserId}
                              className="btn-danger disabled:opacity-40"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                      {resetPwdUser?.id === u.id && (
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="New password (min 6 chars)"
                            className="field flex-1"
                            autoFocus
                          />
                          <button
                            onClick={() => resetPassword(u)}
                            disabled={usersBusy || !newPassword || newPassword.length < 6}
                            className="btn-accent disabled:opacity-50"
                          >
                            {usersBusy ? 'Saving…' : 'Set Password'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'accounts' && (
          <ActiveAccountsTab stores={stores} isSuperAdmin={isSuperAdmin} />
        )}
      </div>

      {delStore && (
        <DangerConfirmModal
          title="Remove this store?"
          warning={`"${delStore.name}" will be permanently removed as a store location. This cannot be undone.`}
          onConfirm={confirmDeleteStore}
          onClose={() => setDelStore(null)}
        />
      )}

      {delUser && (
        <DangerConfirmModal
          title="Delete this account?"
          warning={`"${delUser.display_name || delUser.username}" (@${delUser.username}, ${delUser.role}) will be permanently removed and will no longer be able to sign in. This cannot be undone.`}
          onConfirm={confirmDeleteUser}
          onClose={() => setDelUser(null)}
        />
      )}
    </div>
  );
}
