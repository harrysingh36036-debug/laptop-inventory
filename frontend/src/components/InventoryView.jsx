import { useEffect, useMemo, useRef, useState } from 'react';
import LaptopTable from './LaptopTable';
import { useLabels } from '../labels.jsx';

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
  sellStoreId = null,
  canManageCustomers = false,
  showSensitive = false,
  focusSerial,
  allLaptops,
  onTransfer,
  onEdit,
  onDelete,
  onSell
}) {
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const t = useLabels();
  const [brand, setBrand] = useState('');
  const [ramF, setRamF] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 9 : 16
  );
  const rowsRef = useRef(null);

  const activeStore = stores.find((s) => String(s.id) === String(storeId));

  useEffect(() => {
    setPage(1);
  }, [storeId, status, search, brand]);

  const ramValues = useMemo(() => {
    const s = new Set((laptops || []).map((l) => l?.ram).filter(Boolean));
    return [...s].sort((a, b) => parseFloat(a) - parseFloat(b));
  }, [laptops]);

  const filtered = useMemo(
    () => (laptops || []).filter((l) => !ramF || l?.ram === ramF),
    [laptops, ramF]
  );

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
    setPage(1);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = rowsRef.current?.querySelector(`[data-row="${target.id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.classList.add('ring-2', 'ring-accent', 'ring-offset-2');
        setTimeout(() => el?.classList.remove('ring-2', 'ring-accent', 'ring-offset-2'), 2000);
      }, 100);
    });
  }, [focusSerial]);

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

  const brandRows = useMemo(() => {
    const rows = filtered.filter((l) => !brand || (l.brand || 'Unbranded') === brand);
    const sortFns = {
      created_at: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
      brand: (a, b) => (a.brand || '').localeCompare(b.brand || ''),
      model: (a, b) => (a.brand_model || '').localeCompare(b.brand_model || ''),
      price: (a, b) => (Number(a.purchase_rate) || 0) - (Number(b.purchase_rate) || 0),
      serial: (a, b) => (a.serial_number || '').localeCompare(b.serial_number || ''),
      status: (a, b) => (a.status || '').localeCompare(b.status || ''),
    };
    const fn = sortFns[sortBy] || sortFns.created_at;
    rows.sort((a, b) => sortOrder === 'asc' ? fn(a, b) : fn(b, a));
    return rows;
  }, [filtered, brand, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(brandRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const statuses = ['In Stock', 'In Transit', 'Sold'];

  const storeCounts = useMemo(() => {
    const counts = { all: 0 };
    for (const l of allLaptops || laptops || []) {
      counts.all++;
      const sid = String(l.current_store_id || 'unassigned');
      counts[sid] = (counts[sid] || 0) + 1;
    }
    return counts;
  }, [allLaptops, laptops]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Left Sidebar - Store Filter */}
        <div className="w-64 shrink-0 border-r border-gray-200 bg-white p-4 hidden lg:block">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-500">
            Filter by Store
          </h3>
          <div className="space-y-1">
            <button
              onClick={() => setStoreId('')}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                !storeId
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>All Stores</span>
              <span className="text-xs text-gray-400">{storeCounts.all}</span>
            </button>
            {stores.map((s) => (
              <button
                key={s.id}
                onClick={() => setStoreId(String(s.id))}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  String(storeId) === String(s.id)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="truncate">{s.store_name}</span>
                <span className="text-xs text-gray-400">{storeCounts[String(s.id)] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-4 lg:p-6">
          {/* Status Filter Tabs */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Status:
            </span>
            <button
              onClick={() => setStatus('')}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                status === ''
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Any status
            </button>
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(status === s ? '' : s)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                  status === s
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Search and Controls */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by brand/model or serial..."
                className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="created_at">Date</option>
                <option value="brand">Brand</option>
                <option value="model">Model</option>
                <option value="price">Price</option>
                <option value="serial">Serial</option>
                <option value="status">Status</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50"
                title={`Sort ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              </button>
            </div>
            <span className="text-sm text-gray-500">{brandRows.length} laptops</span>
            <select
              value={ramF}
              onChange={(e) => setRamF(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All RAM</option>
              {ramValues.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {canEdit && (
              <button onClick={() => onEdit(null)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                + Update Inventory
              </button>
            )}
          </div>

          {/* Breadcrumb */}
          <div className="mb-4 flex items-center gap-2 text-xs">
            <button
              onClick={() => { setStoreId(''); setBrand(''); }}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${
                !storeId && !brand
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              All Stores
            </button>
            {activeStore && (
              <>
                <span className="text-gray-300">/</span>
                <button
                  onClick={() => setBrand('')}
                  className={`rounded-full px-3 py-1 font-medium transition-colors ${
                    brand ? 'text-gray-500 hover:text-gray-700' : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {activeStore.store_name}
                </button>
              </>
            )}
            {brand && (
              <>
                <span className="text-gray-300">/</span>
                <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">
                  {brand}
                </span>
              </>
            )}
            <span className="ml-auto text-gray-400">{brandRows.length} units</span>
          </div>

          {/* Table */}
          <div ref={rowsRef}>
            <LaptopTable
              laptops={brandRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
              stores={stores}
              canEdit={canEdit}
              canTransfer={canTransfer}
              canSell={canSell}
              sellStoreId={sellStoreId}
              canManageCustomers={canManageCustomers}
              showSensitive={showSensitive}
              onTransfer={onTransfer}
              onSell={onSell}
              onEdit={onEdit}
              onDelete={onDelete}
              rowId={(l) => l.id}
            />
          </div>

          {/* Pagination */}
          {brandRows.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
              <span>
                Rows per page:
                {[9, 16, 25].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPageSize(n)}
                    className={`ml-2 rounded px-2 py-1 font-medium transition-colors ${
                      pageSize === n
                        ? 'bg-blue-50 text-blue-700'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="rounded px-3 py-1 font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span className="font-mono">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="rounded px-3 py-1 font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}