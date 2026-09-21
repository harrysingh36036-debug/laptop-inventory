import { useState, useRef, useEffect } from 'react';

const NAV_ITEMS = [
  { key: 'dashboard', permKey: 'qbDashboard', label: 'Dashboard', color: 'bg-blue-600', icon: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm9 0a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5zm9 0a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1v-5z" />
    </svg>
  )},
  { key: 'inventory', permKey: 'qbInventory', label: 'Inventory', color: 'bg-blue-600', icon: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  )},
  { key: 'transfers', permKey: 'qbTransfers', label: 'Transfers', color: 'bg-amber-500', icon: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  )},
  { key: 'purchases', permKey: 'qbPurchases', label: 'Purchases', color: 'bg-emerald-600', icon: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17" />
    </svg>
  )},
  { key: 'repairs', permKey: 'qbRepairs', label: 'Repairs', color: 'bg-orange-500', icon: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.384 5.384a2 2 0 01-2.828-2.828l5.384-5.384m2.828 2.828L17 11m-5.58 4.17l2.828-2.828M14 7l3 3m0 0l-3 3m3-3H3" />
    </svg>
  )},
  { key: 'sales', permKey: 'qbSold', label: 'Sold', color: 'bg-rose-600', icon: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
    </svg>
  )},
  { key: 'customers', permKey: 'qbCustomers', label: 'Customers', color: 'bg-violet-600', icon: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z" />
    </svg>
  )},
  { key: 'stats', permKey: 'qbReports', label: 'Reports', color: 'bg-teal-600', icon: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )},
];

const ROLE_COLORS = {
  superadmin: 'bg-red-600',
  admin: 'bg-blue-600',
  manager: 'bg-emerald-600',
  staff: 'bg-gray-600'
};

export default function QuickBall({ currentTab, onNavigate, canManage = false, isAdmin = false, onOpenData, onLogout, onOpenSettings, perms, userRole, user }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const go = (key) => {
    setOpen(false);
    onNavigate(key);
  };

  const hasPermission = (permKey) => {
    if (isAdmin) return true;
    if (!perms || !userRole) return true;
    const rolePerms = perms[userRole];
    if (!rolePerms) return true;
    return rolePerms[permKey] !== false;
  };

  const visibleItems = NAV_ITEMS.filter((it) => hasPermission(it.permKey));

  return (
      <div ref={ref} className="quick-ball-container fixed z-50" style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom, 1.25rem))', right: 'max(1.25rem, env(safe-area-inset-right, 1.25rem))' }}>
      {open && (
        <div className="absolute bottom-16 right-0 max-h-[65vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-gray-200 p-2 w-52 animate-[slideUp_0.15s_ease-out]">
          <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${ROLE_COLORS[userRole] || 'bg-blue-600'}`}>
              {(user?.display_name || user?.username || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{user?.display_name || user?.username || 'User'}</p>
              <p className="truncate text-[11px] text-gray-500 capitalize">{userRole || 'staff'}</p>
            </div>
          </div>
          <div className="my-1 border-t border-gray-100"></div>
          {visibleItems.map((it) => (
            <button
              key={it.key}
              onClick={() => go(it.key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                currentTab === it.key ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${it.color}`}>
                {it.icon}
              </span>
              {it.label}
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={() => { setOpen(false); onOpenData?.(); }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                currentTab === 'data-audit' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-600">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              Data Log
            </button>
          )}
          <div className="my-2 border-t border-gray-100"></div>
          {(isAdmin || canManage) && (
            <button
              onClick={() => { setOpen(false); onOpenSettings?.(); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-gray-600 hover:bg-gray-50"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-600">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
              Settings
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onLogout?.(); }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-red-600 hover:bg-red-50"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-600">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </span>
            Sign Out
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${open ? 'rotate-45 scale-95' : 'hover:scale-105'} ${ROLE_COLORS[userRole] || 'bg-blue-600'}`}
      >
        <span className="text-lg font-bold text-white select-none">
          {(user?.display_name || user?.username || '?').slice(0, 1).toUpperCase()}
        </span>
      </button>
    </div>
  );
}