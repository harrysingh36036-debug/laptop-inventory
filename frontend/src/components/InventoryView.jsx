import { useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from './Toolbar';
import LaptopTable from './LaptopTable';
import { useLabels } from '../labels.jsx';

// Inventory drill-down: master search + status → store tiles (with counts) →
// brand tiles (with counts) → models list of one brand. Keeps the app's
// existing filter/search/status state (server-side filtered `laptops` list).
export default function InventoryView({
  laptops,
  stores,
  storeId,
  setStoreId,
  status,
  setStatus,
  search,
  setSearch,
  canEdit,
  canTransfer,
  canSell,
  canManageCustomers = false,
  showSensitive = false,
  focusSerial,
  allLaptops,
  onTransfer,
  onEdit,
  onDelete,
  onSell
}) {
  const t = useLabels();
  const [brand, setBrand] = useState(''); // '' = brand tiles, value = models view
  const [lineF, setLineF] = useState(''); // product line dropdown filter
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 9 : 16
  );
  const rowsRef = useRef(null);

  const activeStore = stores.find((s) => String(s.id) === String(storeId));

  // Reset drill-down whenever the outer scope (store / status / search) changes.
  useEffect(() => {
    setPage(1);
  }, [storeId, status, search, brand]);

  // Product lines present in the current list, for the dropdown filter.
  const productLines = useMemo(() => {
    const s = new Set((laptops || []).map((l) => l?.product_line).filter(Boolean));
    return [...s].sort();
  }, [laptops]);

  // List after the product-line dropdown filter (drives tiles + model rows).
  const filtered = useMemo(
    () => (lineF ? (laptops || []).filter((l) => l?.product_line === lineF) : laptops || []),
    [laptops, lineF]
  );

  // Jump to a specific laptop (from dashboard master search).
  useEffect(() => {
    if (!focusSerial) return;
    const source = allLaptops?.length ? allLaptops : laptops;
    const target = (source || []).find(
      (l) => String(l.serial_number) === String(focusSerial)
    );
    if (!target) return;
    if (target.current_store_id != null && String(target.current_store_id) !== String(storeId)) {
      setStoreId(target.current_store_id);
    }
    setBrand(target.brand || '');
    setSearch('');
    requestAnimationFrame(() => {
      const el = rowsRef.current?.querySelector(`[data-row="${target.id}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSerial]);

  // ---- Brand tiles (grouped by brand from the active list) ----------------
  const brandGroups = useMemo(() => {
    const map = new Map();
    for (const l of filtered) {
      const b = l.brand || 'Unbranded';
      const g = map.get(b) || { brand: b, total: 0, inStock: 0 };
      g.total += 1;
      if (l.status === 'In Stock') g.inStock += 1;
      map.set(b, g);
    }
    return [...map.values()].sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand));
  }, [filtered]);

  const brandRows = useMemo(() => filtered.filter((l) => (l.brand || 'Unbranded') === brand), [filtered, brand]);

  const totalPages = Math.max(1, Math.ceil(brandRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const from = brandRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageRows = brandRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const tile = (active, onClick, children, extra = '') => (
    <button
      onClick={onClick}
      className={`panel group relative flex flex-col items-start gap-2 p-4 text-left transition-all duration-150 animate-rise ${extra} ${
        active ? 'ring-2 ring-accent-line bg-accent-soft/20' : 'hover:bg-surface-2/70'
      }`}
    >
      {children}
    </button>
  );

  return (
    <section className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Toolbar search={search} setSearch={setSearch} resultCount={laptops.length} />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={lineF}
            onChange={(e) => setLineF(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-dim focus:border-accent-line focus:outline-none"
            title="Filter by product line"
          >
            <option value="">All product lines</option>
            {productLines.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-dim focus:border-accent-line focus:outline-none"
          >
            <option value="">All statuses</option>
            {['In Stock', 'In Transit', 'Sold'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {canEdit && (
            <button onClick={() => onEdit(null)} className="btn-accent">
              {t.addInventoryButton || '+ Update Inventory'}
            </button>
          )}
        </div>
      </div>

      {/* Brand tiles with counts */}
      {!brand ? (
        /* ---- Brand tiles ---- */
        brandGroups.length === 0 ? (
          <div className="panel rounded-2xl p-12 text-center animate-rise">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-faint">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="mt-4 text-sm font-medium text-ink">
              {activeStore
                ? `No inventory in ${activeStore.store_name} yet`
                : (t.noLaptops || 'No laptops found')}
            </p>
            {activeStore && (
              <p className="mt-1 text-xs text-ink-faint">
                Add a laptop to this store or switch to another store to see its stock.
              </p>
            )}
          </div>
        ) : (
          <div>
            <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {activeStore ? activeStore.store_name : 'All stores'} · brands
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {brandGroups.map((g) =>
                tile(
                  false,
                  () => setBrand(g.brand),
                  <>
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{g.brand}</span>
                      <span className="mono-chip">{g.total}</span>
                    </span>
                    <span className="mt-1 text-[11px] text-ink-faint">
                      {g.inStock} in stock
                    </span>
                  </>
                )
              )}
            </div>
          </div>
        )
      ) : (
        /* ---- Models list for the selected brand ---- */
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => setStoreId('')}
              className="rounded-full border border-line bg-surface px-2.5 py-1 font-medium text-ink-dim hover:text-ink transition-colors"
            >
              All Stores
            </button>
            <span className="text-ink-faint">/</span>
            <button
              onClick={() => setBrand('')}
              className="rounded-full border border-line bg-surface px-2.5 py-1 font-medium text-ink-dim hover:text-ink transition-colors"
            >
              {activeStore ? activeStore.store_name : 'All Stores'}
            </button>
            <span className="text-ink-faint">/</span>
            <button className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 font-medium text-accent">
              {brand}
            </button>
            <span className="ml-auto font-mono text-ink-faint">
              {brandRows.length} unit{brandRows.length === 1 ? '' : 's'}
            </span>
          </div>

          <div ref={rowsRef}>
            <LaptopTable
              laptops={pageRows}
              stores={stores}
              canEdit={canEdit}
              canTransfer={canTransfer}
              canSell={canSell}
              canManageCustomers={canManageCustomers}
              showSensitive={showSensitive}
              onTransfer={onTransfer}
              onSell={onSell}
              onEdit={onEdit}
              onDelete={onDelete}
              rowId={(l) => l.id}
            />
          </div>

          {brandRows.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2 text-xs text-ink-dim">
                <span className="text-ink-faint">Rows per page</span>
                {[9, 16].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPageSize(n)}
                    className={`rounded-full border px-2.5 py-1 font-medium transition-colors ${
                      pageSize === n
                        ? 'border-accent-line bg-accent-soft text-accent'
                        : 'border-line bg-surface text-ink-dim hover:text-ink'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <span className="ml-2 font-mono text-ink-faint">
                  Showing {from}–{Math.min(brandRows.length, currentPage * pageSize)} of {brandRows.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span className="font-mono text-xs text-ink-dim">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}