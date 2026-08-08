import { useEffect, useState } from 'react';
import { getUsers, createUser, updateUser, deleteUser, bulkDeleteUsers, getLoginLogs } from '../api';

const ROLES = ['admin', 'manager', 'staff'];
const MANAGER_CREATABLE_ROLES = ['manager', 'staff'];
const EMPTY = { username: '', password: '', display_name: '', role: 'staff' };

const ROLE_PILL = {
  superadmin: 'border-accent-line bg-accent-soft text-accent',
  admin: 'border-line bg-surface-3 text-ink',
  manager: 'border-stock-transit/30 bg-stock-transit/10 text-stock-transit',
  staff: 'border-line bg-surface-2 text-ink-dim'
};

export default function AccountManager({ currentUser, onClose, onCurrentUserChanged }) {
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null); // null | { } | { user }
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]); // ids checked for bulk delete

  const MAX_ACCOUNTS = 8;

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const isSuperAdmin = currentUser?.role === 'superadmin';
  const isManager = currentUser?.role === 'manager';

  const [logins, setLogins] = useState(null); // null = not loaded
  const [loginsOpen, setLoginsOpen] = useState(false);

  const loadLogins = async () => {
    try {
      setLogins(await getLoginLogs());
    } catch (e) {
      setError(e.message);
    }
  };

  const load = async () => {
    try {
      const list = await getUsers();
      setUsers(list);
    } catch (e) {
      setError(e.message);
    }
  };

  // Who can a role edit? superadmin: anyone. admin: manager+staff. manager: staff.
  const canEditUser = (u) =>
    isSuperAdmin ||
    (currentUser?.role === 'admin' && u.role !== 'admin' && u.role !== 'superadmin');

  const canResetPassword = (u) =>
    isSuperAdmin || (currentUser?.role === 'admin' && u.role !== 'admin' && u.role !== 'superadmin');

  const canDeleteUser = (u) => isSuperAdmin ? u.id !== currentUser.id : (currentUser?.role === 'admin' && u.role !== 'admin' && u.role !== 'superadmin' && u.id !== currentUser.id);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (form) => {
    try {
      if (modal?.user) {
        const body = {
          username: form.username,
          display_name: form.display_name,
          role: form.role
        };
        if (form.password) body.password = form.password;
        const res = await updateUser(modal.user.id, body);
        if (modal.user.id === currentUser.id && res.token) {
          onCurrentUserChanged(res.user, res.token);
        }
      } else {
        await createUser(form);
      }
      setModal(null);
      await load();
      return '';
    } catch (e) {
      return e.message;
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete account "${u.username}"? This cannot be undone.`)) return;
    try {
      await deleteUser(u.id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const selectable = users.filter((u) => canDeleteUser(u));
  const allSelected = selectable.length > 0 && selectable.every((u) => selected.includes(u.id));

  const toggleAll = () => {
    setSelected(allSelected ? [] : selectable.map((u) => u.id));
  };

  const toggleOne = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const handleBulkDelete = async () => {
    const victims = users.filter((u) => selected.includes(u.id));
    if (victims.length === 0) return;
    if (!window.confirm(`Delete ${victims.length} account${victims.length > 1 ? 's' : ''} (${victims.map((u) => u.username).join(', ')})? This cannot be undone.`)) return;
    try {
      await bulkDeleteUsers(selected);
      setSelected([]);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const th = 'px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint';
  const td = 'px-4 py-3 align-middle';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">Account Manager</h2>
            <p className="text-sm text-ink-faint">Create and manage user accounts</p>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between px-6 py-4">
          <p className="text-sm text-ink-faint">
            <span className="font-semibold text-ink">{users.length}</span> of {MAX_ACCOUNTS} accounts
            {isAdmin && users.length > 0 && (
              <span className="ml-2 text-xs text-ink-faint">
                · {users.filter((u) => u.role === 'admin' || u.role === 'superadmin').length} admin
                · {users.filter((u) => u.role === 'manager').length} manager
                · {users.filter((u) => u.role === 'staff').length} staff
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => {
                  setLoginsOpen((o) => !o);
                  if (!logins) loadLogins();
                }}
                className="btn-ghost"
              >
                {loginsOpen ? 'Hide Login Activity' : 'Login Activity'}
              </button>
            )}
            {isAdmin && users.length < MAX_ACCOUNTS ? (
              <button onClick={() => setModal({})} className="btn-accent">
                + New Account
              </button>
            ) : (
              <span className="text-xs text-ink-faint">Account limit of {MAX_ACCOUNTS} reached.</span>
            )}
          </div>
        </div>
        {error && (
          <div className="mx-6 mb-4 rounded-lg border border-stock-risk/25 bg-stock-risk/10 px-3 py-2 text-sm text-stock-risk">
            {error}
          </div>
        )}

        {selected.length > 0 && (
          <div className="mx-6 mb-4 flex items-center justify-between rounded-xl border border-stock-risk/30 bg-stock-risk/10 px-4 py-2.5">
            <span className="text-sm text-stock-risk">
              {selected.length} account{selected.length > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelected([])} className="btn-ghost">
                Clear
              </button>
              <button onClick={handleBulkDelete} className="btn-danger">
                Delete Selected
              </button>
            </div>
          </div>
        )}

        {loginsOpen && (
          <div className="mx-6 mb-4 rounded-xl border border-line bg-surface-2/40 p-4">
            <h3 className="text-sm font-semibold text-ink">Login Activity</h3>
            <p className="mb-3 text-xs text-ink-faint">Who logged in and when.</p>
            {!logins ? (
              <p className="text-sm text-ink-faint">Loading…</p>
            ) : logins.length === 0 ? (
              <p className="text-sm text-ink-faint">No logins recorded yet.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-line bg-surface">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-ink-faint">
                    <tr>
                      <th className="px-3 py-2">Username</th>
                      <th className="px-3 py-2">IP</th>
                      <th className="px-3 py-2">Logged in</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--hairline)]">
                    {logins.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 font-medium text-ink-dim">{l.username}</td>
                        <td className="px-3 py-2 font-mono text-ink-faint">{l.ip || '—'}</td>
                        <td className="px-3 py-2 text-ink-faint">{l.logged_in}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="overflow-y-auto px-6 pb-6">
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2/50">
                <tr>
                  {isAdmin || isManager ? (
                    <th className={`${th} w-10`}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        disabled={selectable.length === 0}
                        aria-label="Select all accounts"
                        className="accent-[var(--accent)]"
                      />
                    </th>
                  ) : null}
                  <th className={th}>User</th>
                  <th className={th}>Username</th>
                  <th className={th}>Role</th>
                  <th className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hairline)]">
                {users.map((u) => (
                  <tr key={u.id} className="transition-colors duration-150 hover:bg-surface-2/60">
                    {isAdmin || isManager ? (
                      <td className={td}>
                        {canDeleteUser(u) ? (
                          <input
                            type="checkbox"
                            checked={selected.includes(u.id)}
                            onChange={() => toggleOne(u.id)}
                            aria-label={`Select ${u.username}`}
                            className="accent-[var(--accent)]"
                          />
                        ) : null}
                      </td>
                    ) : null}
                    <td className={`${td} font-medium text-ink`}>
                      {u.display_name || u.username}
                      {u.id === currentUser.id && (
                        <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                          You
                        </span>
                      )}
                    </td>
                    <td className={`${td} font-mono text-xs text-ink-dim`}>{u.username}</td>
                    <td className={td}>
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${ROLE_PILL[u.role] || ROLE_PILL.staff}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>
                      {(canEditUser(u) || canDeleteUser(u)) && (
                        <>
                          {canEditUser(u) && (
                            <button
                              onClick={() => setModal({ user: u })}
                              className="btn-ghost"
                            >
                              Edit
                            </button>
                          )}
                          {canDeleteUser(u) && (
                            <button
                              onClick={() => handleDelete(u)}
                              className="btn-danger ml-2"
                            >
                              Delete
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin || isManager ? 5 : 4} className="px-4 py-8 text-center text-ink-faint">
                      No accounts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

{modal && (
        <UserModal
          editing={modal.user}
          isSuperAdmin={isSuperAdmin}
          viewerRole={currentUser?.role}
          canResetPassword={modal.user ? canResetPassword(modal.user) : true}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function UserModal({ editing, onSave, onClose, viewerRole, isSuperAdmin, canResetPassword }) {
  const viewerIsManager = viewerRole === 'manager';
  const viewerIsAdmin = viewerRole === 'admin';
  const allowedRoles = viewerIsManager
    ? MANAGER_CREATABLE_ROLES
    : viewerIsAdmin
      ? ['manager', 'staff']
      : ROLES;
  const [form, setForm] = useState(editing
    ? {
        username: editing.username,
        password: '',
        display_name: editing.display_name || '',
        role: allowedRoles.includes(editing.role) ? editing.role : allowedRoles[0]
      }
    : { ...EMPTY, role: viewerIsManager || viewerIsAdmin ? allowedRoles[0] : EMPTY.role });
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.username.trim()) return setError('Username is required.');
    if (!editing && !form.password) return setError('Password is required for new accounts.');
    const err = await onSave(form);
    if (err) setError(err);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-pop animate-rise">
        <h3 className="font-display text-base font-semibold tracking-tight text-ink">
          {editing ? `Edit ${editing.username}` : 'Create Account'}
        </h3>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="flabel">Username</label>
            <input
              value={form.username}
              onChange={set('username')}
              placeholder="e.g. store5.manager"
              className="field mt-1.5 font-mono"
            />
          </div>
          <div>
            <label className="flabel">Display name</label>
            <input
              value={form.display_name}
              onChange={set('display_name')}
              placeholder="e.g. Jordan Miles"
              className="field mt-1.5"
            />
          </div>
          {canResetPassword && (
            <div>
              <label className="flabel">
                {editing ? 'New password (leave blank to keep)' : 'Password'}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder="at least 6 characters"
                minLength={6}
                className="field mt-1.5"
              />
              {editing && (
                <p className="mt-1 text-xs text-ink-faint">
                  {isSuperAdmin ? 'Master reset — works for every account.' : 'You can reset this password.'}
                </p>
              )}
            </div>
          )}
          {!canResetPassword && editing && (
            <div>
              <label className="flabel">Password</label>
              <input type="password" value="unchanged" disabled className="field mt-1.5 opacity-50" />
              <p className="mt-1 text-xs text-ink-faint">
                Password of {editing.username} can only be reset by the super admin.
              </p>
            </div>
          )}
          <div>
            <label className="flabel">Role</label>
            <select
              value={form.role}
              onChange={set('role')}
              className="field mt-1.5"
            >
              {allowedRoles.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-faint">
              Staff view inventory · Manager can edit/transfer ·{' '}
              {viewerIsManager
                ? 'Managers can manage staff, but password reset is only for admins & the super admin'
                : viewerIsAdmin
                  ? 'Admins manage manager & staff accounts only — the super admin owns admin accounts'
                  : 'The super admin manages every account.'}
            </p>
          </div>

          {error && (
            <p className="rounded-lg border border-stock-risk/25 bg-stock-risk/10 px-3 py-2 text-sm text-stock-risk">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-accent">
              {editing ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}