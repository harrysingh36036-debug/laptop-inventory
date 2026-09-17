import { useEffect, useState, useMemo } from 'react';
import { getUsers } from '../api';
import { getPresenceState, onPresenceChange } from '../presence';

function timeAgo(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString();
}

function RoleBadge({ role }) {
  const map = {
    superadmin: 'bg-purple-100 text-purple-700 border-purple-200',
    admin: 'bg-blue-50 text-blue-600 border-blue-200',
    manager: 'bg-amber-50 text-amber-700 border-amber-200',
    staff: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[role] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {role}
    </span>
  );
}

export default function ActiveAccountsTab({ stores = [], isSuperAdmin = false }) {
  const [users, setUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [presence, setPresence] = useState(() => getPresenceState());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all'); // all | online | offline
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    getUsers()
      .then((list) => {
        if (!alive) return;
        const visible = (list || []).filter((u) => isSuperAdmin || u.role !== 'superadmin');
        setUsers(visible);
      })
      .catch((e) => setErr(e.message || 'Failed to load accounts'))
      .finally(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, [isSuperAdmin]);

  useEffect(() => {
    const unsub = onPresenceChange((state) => setPresence({ ...state }));
    // poll as fallback: presenceState is only updated on sync/join/leave,
    // but we want "time ago" to tick.
    const t = setInterval(() => setPresence({ ...getPresenceState() }), 30000);
    return () => { unsub(); clearInterval(t); };
  }, []);

  const storeMap = useMemo(() => {
    const m = new Map();
    for (const s of stores || []) m.set(String(s.id), s.store_name);
    return m;
  }, [stores]);

  const onlineIds = useMemo(() => new Set(Object.keys(presence || {})), [presence]);

  // map presence details: userId -> presence payload (first)
  const presenceDetails = useMemo(() => {
    const m = new Map();
    for (const [key, arr] of Object.entries(presence || {})) {
      const first = Array.isArray(arr) && arr.length ? arr[0] : null;
      if (first) m.set(String(key), first);
    }
    return m;
  }, [presence]);

  const enriched = useMemo(() => {
    return (users || []).map((u) => {
      const id = String(u.id);
      const isOnline = onlineIds.has(id);
      const p = presenceDetails.get(id);
      return {
        ...u,
        _online: isOnline,
        _onlineAt: p?.online_at || null,
        _storeName: u.home_store_name || (u.home_store_id ? storeMap.get(String(u.home_store_id)) || '—' : '— No store —'),
      };
    });
  }, [users, onlineIds, presenceDetails, storeMap]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return enriched.filter((u) => {
      if (filter === 'online' && !u._online) return false;
      if (filter === 'offline' && u._online) return false;
      if (!term) return true;
      const hay = `${u.display_name || ''} ${u.username || ''} ${u.role || ''} ${u._storeName || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [enriched, q, filter]);

  const onlineCount = enriched.filter((u) => u._online).length;
  const total = enriched.length;
  const offlineCount = total - onlineCount;

  if (!loaded) {
    return <p className="mt-4 text-sm text-gray-500">Loading accounts…</p>;
  }

  return (
    <div className="mt-4 space-y-4 min-w-0 overflow-hidden">
      {err && (
        <p className="rounded-lg border border-red-600/25 bg-red-600/10 px-3 py-2 text-sm text-red-600">{err}</p>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50/40 px-2 py-2.5 text-center sm:px-3 sm:py-3">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[11px]">Total accounts</p>
          <p className="mt-1   text-lg font-bold text-gray-900 sm:text-xl">{total}</p>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-green-600/20 bg-green-600/10 px-2 py-2.5 text-center sm:px-3 sm:py-3">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-green-600 sm:text-[11px]">Active now</p>
          <p className="mt-1 flex items-center justify-center gap-1.5   text-lg font-bold text-green-600 sm:text-xl">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-600 opacity-30" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
            </span>
            {onlineCount}
          </p>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50/40 px-2 py-2.5 text-center sm:px-3 sm:py-3">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[11px]">Offline</p>
          <p className="mt-1   text-lg font-bold text-gray-600 sm:text-xl">{offlineCount}</p>
        </div>
      </div>

      {/* Live indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50/30 px-3 py-2">
        <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-gray-600">
          <span className={`h-2 w-2 shrink-0 rounded-full ${onlineCount > 0 ? 'bg-green-600 shadow-[0_0_0_4px_rgba(34,197,94,0.18)]' : 'bg-gray-400'}`} />
          <span className="min-w-0 break-words">Live presence · updates instantly via Realtime</span>
        </span>
        <span className="shrink-0 text-[11px] text-gray-500">{onlineCount} online · {offlineCount} offline</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <div className="relative flex-1 min-w-0 sm:min-w-[180px]">
          <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, username, role…"
            className="field pl-8"
          />
        </div>
        <div className="flex rounded-full border border-gray-200 bg-gray-50 p-1">
          {[
            ['all', 'All'],
            ['online', 'Active'],
            ['offline', 'Offline'],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === k ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/30 px-4 py-10 text-center">
          <p className="text-sm font-medium text-gray-600">No accounts match.</p>
          <p className="mt-1 text-xs text-gray-500">Try a different search or filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <div
              key={u.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors ${u._online ? 'border-green-600/20 bg-green-600/[0.06]' : 'border-gray-200 bg-gray-50/40'}`}
            >
              <div className="relative shrink-0">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full   text-xs font-bold ${u._online ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {(u.display_name || u.username || '?').slice(0, 1).toUpperCase()}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${u._online ? 'bg-green-600' : 'bg-gray-400'}`}
                  title={u._online ? 'Active now' : 'Offline'}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-gray-900">{u.display_name || u.username}</p>
                  <RoleBadge role={u.role} />
                  {u._online && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-600/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-600">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-600" />
                      Active
                    </span>
                  )}
                  {!u._online && (
                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Offline</span>
                  )}
                </div>
                <p className="truncate text-xs text-gray-500">
                  @{u.username}
                  <span className="mx-1">·</span>
                  {u._storeName}
                </p>
                <p className="text-[11px] text-gray-500">
                  {u._online ? `Active now · online ${timeAgo(u._onlineAt)}` : 'Not currently logged in'}
                  {u.created_at ? ` · Joined ${new Date(u.created_at).toLocaleDateString()}` : ''}
                </p>
              </div>

              <div className="hidden sm:flex shrink-0 flex-col items-end gap-1">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${u._online ? 'border-green-600/20 bg-white text-green-600' : 'border-gray-200 bg-white text-gray-500'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${u._online ? 'bg-green-600 animate-pulse' : 'bg-gray-400'}`} />
                  {u._online ? 'Logged in' : 'Logged out'}
                </span>
                {u._online && u._onlineAt && (
                  <span className="text-[10px] text-gray-500">{timeAgo(u._onlineAt)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-gray-500">
        “Active” means the account has this app open and connected to Realtime right now. Closing the tab or signing out marks it offline within ~10-15 seconds.
      </p>
    </div>
  );
}
