import { useEffect, useState } from 'react';
import { getUsers, createUser, updateUser, deleteUser, getLoginLogs } from '../api';

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

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
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
      let list = await getUsers();
      // Managers must never see admin accounts (server enforces this too).
      if (isManager) list = list.filter((u) => u.role !== 'admin');
      setUsers(list);
    } catch (e) {
      setError(e.message);
    }
  };

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
            <span className="font-semibold text-ink">{users.length}</span> account{users.length === 1 ? '' : 's'}
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
            <button onClick={() => setModal({})} className="btn-accent">
              + New Account
            </button>
          </div>
        </div>
        {error && (
          <div className="mx-6 mb-4 rounded-lg border border-stock-risk/25 bg-stock-risk/10 px-3 py-2 text-sm text-stock-risk">
            {error}
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
                  <th className={th}>User</th>
                  <th className={th}>Username</th>
                  <th className={th}>Role</th>
                  <th className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hairline)]">
                {users.map((u) => (
                  <tr key={u.id} className="transition-colors duration-150 hover:bg-surface-2/60">
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
                      {(isAdmin || isManager) && (
                        <>
                          <button
                            onClick={() => setModal({ user: u })}
                            className="btn-ghost"
                          >
                            Edit
                          </button>
                          {isAdmin && u.id !== currentUser.id && (
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
                    <td colSpan={4} className="px-4 py-8 text-center text-ink-faint">
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
          managerOnly={isManager}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function UserModal({ editing, onSave, onClose, managerOnly }) {
  const allowedRoles = managerOnly ? MANAGER_CREATABLE_ROLES : ROLES;
  const [form, setForm] = useState(editing
    ? {
        username: editing.username,
        password: '',
        display_name: editing.display_name || '',
        role: managerOnly ? (editing.role === 'admin' ? 'staff' : editing.role) : editing.role
      }
    : { ...EMPTY, role: managerOnly ? 'staff' : EMPTY.role });
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
          </div>
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
              Staff view inventory · Manager can edit/transfer · {managerOnly ? 'Managers can create staff & managers, but not admins' : 'Admin manages accounts.'}
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