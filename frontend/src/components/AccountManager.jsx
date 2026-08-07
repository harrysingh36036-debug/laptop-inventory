import { useEffect, useState } from 'react';
import { getUsers, createUser, updateUser, deleteUser, getLoginLogs } from '../api';

const ROLES = ['admin', 'manager', 'staff'];
const MANAGER_CREATABLE_ROLES = ['manager', 'staff'];
const EMPTY = { username: '', password: '', display_name: '', role: 'staff' };

export default function AccountManager({ currentUser, onClose, onCurrentUserChanged }) {
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null); // null | { } | { user }
  const [error, setError] = useState('');

  const isAdmin = currentUser?.role === 'admin';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Account Manager</h2>
            <p className="text-sm text-slate-500">Create and manage user accounts</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between px-6 py-4">
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-800">{users.length}</span> account{users.length === 1 ? '' : 's'}
            {isAdmin && users.length > 0 && (
              <span className="ml-2 text-xs text-slate-400">
                · {users.filter((u) => u.role === 'admin').length} admin
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
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                {loginsOpen ? 'Hide Login Activity' : 'Login Activity'}
              </button>
            )}
            <button
              onClick={() => setModal({})}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              + New Account
            </button>
          </div>
        </div>        {error && (
          <div className="mx-6 mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        {loginsOpen && (
          <div className="mx-6 mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Login Activity</h3>
            <p className="mb-3 text-xs text-slate-500">Who logged in and when.</p>
            {!logins ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : logins.length === 0 ? (
              <p className="text-sm text-slate-400">No logins recorded yet.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Username</th>
                      <th className="px-3 py-2">IP</th>
                      <th className="px-3 py-2">Logged in</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logins.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 font-medium text-slate-700">{l.username}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{l.ip || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{l.logged_in}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="overflow-y-auto px-6 pb-6">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {u.display_name || u.username}
                      {u.id === currentUser.id && (
                        <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                          You
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{u.username}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.role === 'admin'
                            ? 'bg-slate-900 text-white'
                            : u.role === 'manager'
                              ? 'bg-sky-100 text-sky-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(isAdmin || isManager) && (
                        <>
                          <button
                            onClick={() => setModal({ user: u })}
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          {isAdmin && u.id !== currentUser.id && (
                            <button
                              onClick={() => handleDelete(u)}
                              className="ml-2 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
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
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-800">
          {editing ? `Edit ${editing.username}` : 'Create Account'}
        </h3>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Username</label>
            <input
              value={form.username}
              onChange={set('username')}
              placeholder="e.g. store5.manager"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Display name</label>
            <input
              value={form.display_name}
              onChange={set('display_name')}
              placeholder="e.g. Jordan Miles"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              {editing ? 'New password (leave blank to keep)' : 'Password'}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="at least 6 characters"
              minLength={6}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Role</label>
            <select
              value={form.role}
              onChange={set('role')}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            >
              {allowedRoles.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              Staff view inventory · Manager can edit/transfer · {managerOnly ? 'Managers can create staff & managers, but not admins' : 'Admin manages accounts.'}
            </p>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              {editing ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}