import { useEffect, useState } from 'react';
import { login, getStores, getLoginUsernames } from '../api';

const CACHE_KEY = 'laptop-inventory.usernames';

export default function Login({ onSuccess }) {
  const [form, setForm] = useState({ username: '', password: '', storeId: '' });
  const [stores, setStores] = useState([]);
  const [usernames, setUsernames] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [customUser, setCustomUser] = useState(false);

  useEffect(() => {
    getStores()
      .then(setStores)
      .catch(() => setStores([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    getLoginUsernames()
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setUsernames(list);
        if (list.length) localStorage.setItem(CACHE_KEY, JSON.stringify(list));
      })
      .catch(() => {
        if (cancelled) return;
        try {
          const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
          if (Array.isArray(cached) && cached.length) setUsernames(cached);
        } catch {
          /* ignore */
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.storeId) return setError('Please select the store you are signing in from.');
    setBusy(true);
    try {
      const res = await login(form);
      onSuccess(res.token, res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="panel p-8">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">Laptop Inventory</h1>
            <p className="mt-1 text-sm text-ink-dim">Sign in to your account</p>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="flabel">Username</label>
              <select
                value={customUser ? '__custom__' : form.username}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setCustomUser(true);
                  } else {
                    setCustomUser(false);
                    set('username')(e);
                  }
                }}
                autoComplete="username"
                required
                className="field mt-1.5"
              >
                <option value="">Select username…</option>
                {usernames.map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.display_name ? `${u.display_name} (${u.username})` : u.username}
                  </option>
                ))}
                <option value="__custom__">Type username…</option>
              </select>
              {customUser && (
                <input
                  value={form.username}
                  onChange={set('username')}
                  autoComplete="username"
                  placeholder="type username"
                  required
                  className="field mt-1.5"
                />
              )}
            </div>

            <div>
              <label className="flabel">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={set('password')}
                autoComplete="current-password"
                placeholder="••••••••"
                required
                minLength={6}
                className="field mt-1.5"
              />
            </div>

            <div>
              <label className="flabel">Which store are you at?</label>
              <select
                value={form.storeId}
                onChange={set('storeId')}
                className="field mt-1.5"
              >
                <option value="">Select store…</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.store_name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="rounded-lg border border-stock-risk/25 bg-stock-risk/10 px-3 py-2 text-sm text-stock-risk">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full btn-accent py-2.5 text-sm"
            >
              {busy ? 'Please wait…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-faint">
            Accounts are created by an administrator or manager. Contact them if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}