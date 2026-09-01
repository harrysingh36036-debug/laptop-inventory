import { useEffect, useMemo, useState } from 'react';
import StatusChip from './StatusChip';
import { getSalesSummary } from '../api';
import { inr } from '../utils';

const CARDS = [
  {
    key: 'inventory',
    title: 'Inventory',
    subtitle: 'Laptops in stock & on the way',
    target: 'inventory',
    icon: (
      <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    )
  },
  {
    key: 'purchase',
    title: 'Purchase',
    subtitle: 'Units bought & money invested',
    target: 'purchases',
    icon: (
      <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
  },
  {
    key: 'vendor-purchases',
    title: 'Vendor Purchase',
    subtitle: 'Laptops bought from vendors',
    target: 'vendor-laptops',
    icon: (
      <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h11v8H3V7zm11 3h4l3 3v2h-7V10zM6 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
      </svg>
    )
  },
  {
    key: 'repair',
    title: 'Repair',
    subtitle: 'Units at the workshop',
    target: 'repairs',
    icon: (
      <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
      </svg>
    )
  },
  {
    key: 'transfers',
    title: 'Transfer History',
    subtitle: 'Every movement between stores',
    target: 'transfers',
    icon: (
      <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    )
  },
  {
    key: 'sold',
    title: 'Sold',
    subtitle: 'Units sold & profit earned',
    target: 'sales',
    icon: (
      <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  {
    key: 'report',
    title: 'Report',
    subtitle: 'Brands, sales & stock analytics',
    target: 'stats',
    icon: (
      <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )
  },
  {
    key: 'customers',
    title: 'Customers',
    subtitle: 'Who bought which laptop',
    target: 'customers',
    full: true,
    icon: (
      <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-5a3 3 0 11-3-3 3 3 0 013 3zm-8 1a3 3 0 11-3-3 3 3 0 013 3z" />
      </svg>
    )
  }
];

export default function DashboardTab({ laptops = [], logs = [], customers = [], purchases = [], repairs = [], onNavigate, onFocusLaptop }) {
  const [soldCount, setSoldCount] = useState(0);
  const all = laptops;

  useEffect(() => {
    let active = true;
    getSalesSummary()
      .then((s) => {
        if (active && s) setSoldCount(Number(s.count) || 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // ---- Master search: text + filters (works on ALL laptops) ----------------
  const [q, setQ] = useState('');
  const [brandF, setBrandF] = useState('');
  const [ramF, setRamF] = useState('');
  const [storageF, setStorageF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const brands = useMemo(() => {
    const s = new Set((all || []).map((l) => l?.brand).filter(Boolean));
    return [...s].sort();
  }, [all]);

  const rams = useMemo(() => {
    const s = new Set((all || []).map((l) => l?.ram).filter(Boolean));
    return [...s].sort((a, b) => (Number.parseInt(a) || 0) - (Number.parseInt(b) || 0));
  }, [all]);

  const results = useMemo(() => {
    const text = q.trim().toLowerCase();
    const min = minPrice === '' ? null : Number(minPrice);
    const max = maxPrice === '' ? null : Number(maxPrice);
    return (all || []).filter((l) => {
      if (text) {
        const hay = [l?.brand, l?.brand_model, l?.serial_number, l?.processor_type, l?.ram, l?.generation, l?.storage_type, l?.storage_size, l?.current_store_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(text)) return false;
      }
      if (brandF && l?.brand !== brandF) return false;
      if (ramF && l?.ram !== ramF) return false;
      if (storageF && l?.storage_type !== storageF) return false;
      if (statusF && l?.status !== statusF) return false;
      const rate = Number(l?.purchase_rate) || 0;
      if (min != null && rate < min) return false;
      if (max != null && rate > max) return false;
      return true;
    });
  }, [all, q, brandF, ramF, storageF, statusF, minPrice, maxPrice]);

  const filtersActive =
    q.trim() !== '' || brandF !== '' || ramF !== '' || storageF !== '' || statusF !== '' || minPrice !== '' || maxPrice !== '';

  const clearFilters = () => {
    setQ('');
    setBrandF('');
    setRamF('');
    setStorageF('');
    setStatusF('');
    setMinPrice('');
    setMaxPrice('');
  };

  const inventoryLaptops = laptops.filter((l) => l?.current_store_id != null);
  const inStockCount = inventoryLaptops.filter((l) => l?.status === 'In Stock').length;
  const inTransitCount = inventoryLaptops.filter((l) => l?.status === 'In Transit').length;

  const purchaseValue = (purchases || []).reduce(
    (sum, p) => sum + (Number(p?.purchase_rate) || 0) * (Number(p?.quantity) || 1) + (Number(p?.extra_charges) || 0),
    0
  );
  const repairPending = (repairs || []).filter((r) => r?.status === 'Pending').length;
  const repairInProgress = (repairs || []).filter((r) => r?.status === 'In Progress').length;
  const repairActive = (repairs || []).filter((r) => r?.status !== 'Repaired').length;

  const counts = {
    inventory: { main: inventoryLaptops.length, sub: `${inStockCount} in stock · ${inTransitCount} in transit` },
    purchase: {
      main: purchases.length,
      sub: purchaseValue
        ? `₹${purchaseValue.toLocaleString('en-IN')} invested`
        : 'units bought & money invested'
    },
    'vendor-purchases': {
      main: laptops.filter((l) => l?.purchased_from && l?.current_store_id == null).length,
      sub: 'from registered vendors'
    },
    repair: {
      main: repairActive,
      sub: `${repairPending} pending · ${repairInProgress} in progress`
    },
    transfers: { main: logs.length, sub: 'store-to-store movements' },
    sold: { main: soldCount, sub: 'units sold' },
    report: { main: inStockCount, sub: 'ready to sell right now' },
    customers: { main: customers.length, sub: 'customers · view full purchase history' }
  };

  return (
    <div className="relative">
      <div className="px-1 py-2 sm:px-2">
        <div className="mb-7 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
            Live Operations
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Dashboard
          </h2>
          <p className="mt-1 text-sm text-ink-faint">
            Pick a module — everything updates in real time.
          </p>
        </div>

        {/* Master search */}
        <div className="mb-6 rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <div className="grid gap-3">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Master search — brand, model, serial, processor, RAM, configuration…"
                className="field pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={brandF} onChange={(e) => setBrandF(e.target.value)} className="field w-auto min-w-[130px] flex-1 sm:flex-none">
                <option value="">All brands</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <select value={ramF} onChange={(e) => setRamF(e.target.value)} className="field w-auto min-w-[110px] flex-1 sm:flex-none">
                <option value="">All RAM</option>
                {rams.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <select value={storageF} onChange={(e) => setStorageF(e.target.value)} className="field w-auto min-w-[110px] flex-1 sm:flex-none">
                <option value="">Any storage</option>
                <option value="SSD">SSD</option>
                <option value="HDD">HDD</option>
              </select>
              <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="field w-auto min-w-[120px] flex-1 sm:flex-none">
                <option value="">Any status</option>
                <option value="In Stock">In Stock</option>
                <option value="In Transit">In Transit</option>
                <option value="Sold">Sold</option>
              </select>
              <input
                type="number" step="any" value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="Min ₹ (any)"
                className="field w-auto min-w-[110px] flex-1 sm:flex-none"
              />
              <input
                type="number" step="any" value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Max ₹ (any)"
                className="field w-auto min-w-[110px] flex-1 sm:flex-none"
              />
              {filtersActive && (
                <button onClick={clearFilters} className="btn-ghost">
                  Clear
                </button>
              )}
            </div>
          </div>

          {filtersActive && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {results.length} match{results.length === 1 ? '' : 'es'} — click a result to open it in Inventory
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {results.slice(0, 24).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => onFocusLaptop?.(l)}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-left transition-colors duration-150 hover:border-accent-line hover:bg-accent-soft/20"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{l.brand_model}</span>
                      <span className="block truncate font-mono text-[11px] text-ink-faint">
                        {l.serial_number} · {l.current_store_name || 'Unassigned'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusChip status={l.status} />
                      <span className="font-mono text-[11px] text-ink-dim">
                        {l.purchase_rate != null ? inr(l.purchase_rate) : '—'}
                      </span>
                    </span>
                  </button>
                ))}
                {results.length > 24 && (
                  <p className="col-span-full text-xs text-ink-faint">
                    +{results.length - 24} more — narrow your search
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
          {CARDS.map((c) => (
            <button
              key={c.key}
              onClick={() => onNavigate(c.target)}
              className={`group relative overflow-hidden rounded-2xl border border-line bg-surface p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-line sm:p-6 ${
                c.full ? 'col-span-2 lg:col-span-4' : ''
              }`}
            >
              <div className="pointer-events-none relative">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent-line bg-accent-soft sm:h-12 sm:w-12">
                    {c.icon}
                  </div>
                </div>

                <p className="mt-4 font-display text-3xl font-semibold tracking-tight text-accent sm:mt-5 sm:text-4xl">
                  {counts[c.key].main.toLocaleString('en-IN')}
                </p>
                <h3 className="mt-1 text-sm font-semibold text-ink sm:text-base">{c.title}</h3>
                <p className="mt-0.5 hidden text-xs text-ink-faint sm:block">{counts[c.key].sub}</p>

                <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-accent sm:mt-5">
                  Open
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
