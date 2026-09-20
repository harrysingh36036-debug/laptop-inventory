import { useEffect, useMemo, useState } from 'react';
import StatusChip from './StatusChip';
import { getSalesSummary } from '../api';
import { inr } from '../utils';

const CARDS = [
  {
    key: 'inventory',
    title: 'Inventory',
    target: 'inventory',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    color: 'text-blue-600',
    bgColor: 'bg-blue-50'
  },
  {
    key: 'purchase',
    title: 'Purchases',
    target: 'purchases',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    color: 'text-purple-600',
    bgColor: 'bg-purple-50'
  },
  {
    key: 'vendor-purchases',
    title: 'Vendor Purchase',
    target: 'vendor-laptops',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h11v8H3V7zm11 3h4l3 3v2h-7V10zM6 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
      </svg>
    ),
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50'
  },
  {
    key: 'repair',
    title: 'Repairs',
    target: 'repairs',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
      </svg>
    ),
    color: 'text-red-600',
    bgColor: 'bg-red-50'
  },
  {
    key: 'sold',
    title: 'Sold',
    target: 'sales',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'text-amber-600',
    bgColor: 'bg-amber-50'
  },
  {
    key: 'transfers',
    title: 'Transfers',
    target: 'transfers',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
    color: 'text-teal-600',
    bgColor: 'bg-teal-50'
  }
];

import { useLabels } from '../labels.jsx';

export default function DashboardTab({ laptops = [], logs = [], customers = [], purchases = [], repairs = [], onNavigate, onFocusLaptop, user, stores = [], onTransfer, canTransfer = false }) {
  const t = useLabels();
  const [soldCount, setSoldCount] = useState(0);
  const [transferModal, setTransferModal] = useState(null); // { laptop, toStoreId }
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

  const [q, setQ] = useState('');
  const [brandF, setBrandF] = useState('');
  const [ramF, setRamF] = useState('');
  const [storageF, setStorageF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showSort, setShowSort] = useState(false);
  const [showQuickBall, setShowQuickBall] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');

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
      if (selectedDate) {
        const d = new Date(l?.created_at);
        d.setMinutes(d.getMinutes() + 330);
        const laptopDate = d.toISOString().split('T')[0];
        if (laptopDate !== selectedDate) return false;
      }
      return true;
    }).sort((a, b) => {
      const sortFns = {
        created_at: (x, y) => new Date(x.created_at || 0) - new Date(y.created_at || 0),
        brand: (x, y) => (x.brand || '').localeCompare(y.brand || ''),
        model: (x, y) => (x.brand_model || '').localeCompare(y.brand_model || ''),
        price: (x, y) => (Number(x.purchase_rate) || 0) - (Number(y.purchase_rate) || 0),
        serial: (x, y) => (x.serial_number || '').localeCompare(y.serial_number || ''),
        status: (x, y) => (x.status || '').localeCompare(y.status || ''),
      };
      const fn = sortFns[sortBy] || sortFns.created_at;
      return sortOrder === 'asc' ? fn(a, b) : fn(b, a);
    });
  }, [all, q, brandF, ramF, storageF, statusF, minPrice, maxPrice, sortBy, sortOrder, selectedDate]);

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
    setSelectedDate('');
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
        : 'Units bought & money invested'
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
    sold: { main: soldCount, sub: 'units sold' }
  };

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-400 px-4 py-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-blue-100">Welcome back,</p>
            <h2 className="text-2xl font-bold">{user?.display_name || user?.username || 'User'}</h2>
            <p className="mt-1 text-sm text-blue-100">Here's what's happening today.</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 hover:bg-white/30 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-medium">{selectedDate ? new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : today}</span>
            </button>
            {showDatePicker && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Select Date</h3>
                  <button onClick={() => setShowDatePicker(false)} className="text-gray-400 hover:text-gray-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => { setSelectedDate(''); setShowDatePicker(false); }}
                    className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setShowDatePicker(false)}
                    className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          {CARDS.map((c) => (
            <button
              key={c.key}
              onClick={() => onNavigate(c.target)}
              className="rounded-xl border border-gray-100 bg-white p-3 text-left shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-lg ${c.bgColor} ${c.color}`}>
                {c.icon}
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {counts[c.key]?.main.toLocaleString('en-IN') || 0}
              </p>
              <p className="text-xs font-medium text-gray-500">{c.title}</p>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-xs text-green-500">↗</span>
                <span className="text-xs text-gray-400">—</span>
              </div>
            </button>
          ))}
        </div>

        {/* Search and Filters */}
        <div className="mb-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search brand, model, serial number..."
              className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />
            <button
              onClick={() => setShowSort(!showSort)}
              className={`rounded-lg p-1.5 ${showSort ? 'bg-teal-50 text-teal-600' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
          </div>

          {/* Sort Dropdown */}
          {showSort && (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">Sort by</span>
                <button onClick={() => setShowSort(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="created_at">Date Added</option>
                  <option value="brand">Brand</option>
                  <option value="model">Model</option>
                  <option value="price">Price</option>
                  <option value="serial">Serial No</option>
                  <option value="status">Status</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="desc">Newest First</option>
                  <option value="asc">Oldest First</option>
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <select
              value={brandF}
              onChange={(e) => setBrandF(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select
              value={ramF}
              onChange={(e) => setRamF(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All RAM</option>
              {rams.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select
              value={storageF}
              onChange={(e) => setStorageF(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Any Storage</option>
              <option value="SSD">SSD</option>
              <option value="HDD">HDD</option>
            </select>
            <select
              value={statusF}
              onChange={(e) => setStatusF(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Any Status</option>
              <option value="In Stock">In Stock</option>
              <option value="In Transit">In Transit</option>
              <option value="Sold">Sold</option>
            </select>
            <input
              type="number"
              step="any"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Min ₹"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="number"
              step="any"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max ₹"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {}}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              Search
            </button>
            {filtersActive && (
              <button
                onClick={clearFilters}
                className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-2 overflow-x-auto border-b border-gray-200 pb-2">
          <button
            onClick={() => setStatusF('')}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
              statusF === ''
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({all.length})
          </button>
          <button
            onClick={() => setStatusF('In Stock')}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
              statusF === 'In Stock'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500"></span>
            In Stock ({inStockCount})
          </button>
          <button
            onClick={() => setStatusF('Sold')}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
              statusF === 'Sold'
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500"></span>
            Sold ({soldCount})
          </button>
          <button
            onClick={() => setStatusF('In Repair')}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
              statusF === 'In Repair'
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500"></span>
            In Repair ({repairActive})
          </button>
        </div>

        {/* Laptop List */}
        <div className="space-y-3">
          {results.slice(0, 20).map((laptop) => (
            <div
              key={laptop.id}
              onClick={() => onFocusLaptop?.(laptop)}
              className="cursor-pointer rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:border-blue-200"
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {laptop.brand} {laptop.brand_model || ''}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {laptop.processor_type} · {laptop.ram} · {laptop.storage_size}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {laptop.serial_number}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {laptop.current_store_name || 'Unassigned'}
                  </p>
                </div>
                <div className="text-right">
                  <StatusChip status={laptop.status} />
                  <p className="mt-1 text-lg font-bold text-gray-900">
                    {laptop.purchase_rate != null ? inr(laptop.purchase_rate) : '—'}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
                <p className="text-xs text-gray-400">
                  {laptop.created_at ? new Date(laptop.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : ''}
                </p>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {canTransfer && (
                    <button
                      onClick={() => setTransferModal({ laptop, toStoreId: '' })}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-teal-50 hover:text-teal-600"
                      title="Transfer"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => onFocusLaptop?.(laptop)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transfer Modal */}
      {transferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Transfer Laptop</h3>
              <button onClick={() => setTransferModal(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-4 rounded-lg bg-gray-50 p-3">
              <p className="text-sm font-medium text-gray-900">{transferModal.laptop.brand} {transferModal.laptop.model}</p>
              <p className="text-xs text-gray-500">Serial: {transferModal.laptop.serial_number}</p>
              <p className="text-xs text-gray-500">Current Store: {transferModal.laptop.store_name || 'N/A'}</p>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">Transfer to Store</label>
              <select
                value={transferModal.toStoreId}
                onChange={(e) => setTransferModal({ ...transferModal, toStoreId: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">Select destination store</option>
                {stores.filter((s) => s.id !== transferModal.laptop.current_store_id).map((s) => (
                  <option key={s.id} value={s.id}>{s.store_name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setTransferModal(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (transferModal.toStoreId) {
                    onTransfer?.(transferModal.laptop.id, Number(transferModal.toStoreId));
                    setTransferModal(null);
                  }
                }}
                disabled={!transferModal.toStoreId}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}