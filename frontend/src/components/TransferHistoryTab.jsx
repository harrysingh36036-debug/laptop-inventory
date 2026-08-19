import { useEffect, useState, useMemo } from 'react';
import { getTransferLogs } from '../api';
import { formatTime } from '../utils';
import { useLabels } from '../labels.jsx';
import SearchBox from './SearchBox';

export default function TransferHistoryTab({ stores }) {
  const t = useLabels();
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 100;

  // --- Transfer filter state ---
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'single' | 'inter'
  const [singleStoreId, setSingleStoreId] = useState('');
  const [interFromStoreId, setInterFromStoreId] = useState('');
  const [interToStoreId, setInterToStoreId] = useState('');
  const [interDirection, setInterDirection] = useState('out'); // 'in' | 'out'

  // --- Date range filter state ---
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getTransferLogs(limit);
        if (alive) setLogs(data || []);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <p className="text-sm text-ink-faint">Loading transfer history…</p>;
  if (error) return <p className="text-sm text-stock-risk">{error}</p>;

  const storeName = (id) => stores.find((s) => s.id === id)?.store_name;

  // --- Parse a transfer log's changed_at into a YYYY-MM-DD string for date comparison ---
  const toDateKey = (iso) => {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  // --- Apply transfer filters + date range to logs ---
  const transferFiltered = useMemo(() => {
    // 1) Store / direction filter
    let result = logs;

    if (filterMode === 'single' && singleStoreId) {
      const sid = Number(singleStoreId);
      result = result.filter((l) => l.from_store_id === sid || l.to_store_id === sid);
    }

    if (filterMode === 'inter' && interFromStoreId && interToStoreId) {
      const fromId = Number(interFromStoreId);
      const toId = Number(interToStoreId);
      result = result.filter(
        (l) => l.from_store_id === fromId && l.to_store_id === toId
      );
    }

    // 2) Date range filter (applied on top of store filter)
    if (dateFrom) {
      result = result.filter((l) => toDateKey(l.changed_at) >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((l) => toDateKey(l.changed_at) <= dateTo);
    }

    return result;
  }, [logs, filterMode, singleStoreId, interFromStoreId, interToStoreId, interDirection, dateFrom, dateTo]);

  // --- Apply text search on top of transfer filter ---
  const q = search.trim().toLowerCase();
  const filtered = q
    ? transferFiltered.filter((l) =>
        [
          l.brand_model, l.serial_number, l.from_store_name, l.to_store_name, l.transferred_by,
          l.from_store_id && storeName(l.from_store_id), l.to_store_id && storeName(l.to_store_id)
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
    : transferFiltered;

  // --- Compute stats for summary cards ---
  const stats = useMemo(() => {
    const base = transferFiltered;
    const uniqueLaptops = new Set(base.map((l) => l.laptop_id)).size;

    if (filterMode === 'single' && singleStoreId) {
      const sid = Number(singleStoreId);
      const incoming = base.filter((l) => l.to_store_id === sid).length;
      const outgoing = base.filter((l) => l.from_store_id === sid).length;
      return {
        totalTransfers: base.length,
        uniqueLaptops,
        incoming,
        outgoing,
        storeLabel: storeName(sid) || 'Selected Store'
      };
    }

    return {
      totalTransfers: base.length,
      uniqueLaptops,
      incoming: null,
      outgoing: null,
      storeLabel: null
    };
  }, [transferFiltered, filterMode, singleStoreId]);

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint';
  const td = 'px-4 py-3 align-middle';

  // --- Filter controls section ---
  const renderFilterControls = () => (
    <div className="panel p-4 space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint shrink-0">
          View Transfers
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setFilterMode('all'); setSingleStoreId(''); setInterFromStoreId(''); setInterToStoreId(''); setDateFrom(''); setDateTo(''); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
              filterMode === 'all'
                ? 'border-accent-line bg-accent-soft text-accent'
                : 'border-line bg-surface text-ink-dim hover:bg-surface-2 hover:text-ink'
            }`}
          >
            All Stores
          </button>
          <button
            onClick={() => { setFilterMode('single'); setInterFromStoreId(''); setInterToStoreId(''); setDateFrom(''); setDateTo(''); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
              filterMode === 'single'
                ? 'border-accent-line bg-accent-soft text-accent'
                : 'border-line bg-surface text-ink-dim hover:bg-surface-2 hover:text-ink'
            }`}
          >
            Single Store
          </button>
          <button
            onClick={() => { setFilterMode('inter'); setSingleStoreId(''); setDateFrom(''); setDateTo(''); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
              filterMode === 'inter'
                ? 'border-accent-line bg-accent-soft text-accent'
                : 'border-line bg-surface text-ink-dim hover:bg-surface-2 hover:text-ink'
            }`}
          >
            Inter-Store
          </button>
        </div>
      </div>

      {filterMode === 'single' && (
        <div className="flex flex-wrap items-center gap-3 animate-fade">
          <label className="text-xs font-medium text-ink-dim">Select store:</label>
          <select
            value={singleStoreId}
            onChange={(e) => setSingleStoreId(e.target.value)}
            className="field w-auto min-w-[180px]"
          >
            <option value="">Choose a store…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.store_name}</option>
            ))}
          </select>
          {singleStoreId && (
            <span className="text-[11px] text-ink-faint">
              Showing all transfers involving {storeName(Number(singleStoreId))}
            </span>
          )}
        </div>
      )}

      {filterMode === 'inter' && (
        <div className="flex flex-wrap items-center gap-3 animate-fade">
          <label className="text-xs font-medium text-ink-dim">From store:</label>
          <select
            value={interFromStoreId}
            onChange={(e) => setInterFromStoreId(e.target.value)}
            className="field w-auto min-w-[160px]"
          >
            <option value="">Select origin…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.store_name}</option>
            ))}
          </select>

          <label className="text-xs font-medium text-ink-dim">To store:</label>
          <select
            value={interToStoreId}
            onChange={(e) => setInterToStoreId(e.target.value)}
            className="field w-auto min-w-[160px]"
          >
            <option value="">Select destination…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.store_name}</option>
            ))}
          </select>

          <label className="text-xs font-medium text-ink-dim">Direction:</label>
          <select
            value={interDirection}
            onChange={(e) => setInterDirection(e.target.value)}
            className="field w-auto min-w-[130px]"
          >
            <option value="out">Outgoing (From → To)</option>
            <option value="in">Incoming (From → To)</option>
          </select>

          {interFromStoreId && interToStoreId && (
            <span className="text-[11px] text-ink-faint">
              {interDirection === 'in' ? 'Incoming' : 'Outgoing'} transfers{' '}
              from {storeName(Number(interFromStoreId))} to {storeName(Number(interToStoreId))}
            </span>
          )}
        </div>
      )}

      {/* Date range row — always visible */}
      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-line animate-fade">
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint shrink-0">
          Date Range
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="field max-w-[170px]"
            placeholder="From"
          />
          <span className="text-xs text-ink-faint">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="field max-w-[170px]"
            placeholder="To"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="btn-ghost text-xs"
            >
              Clear dates
            </button>
          )}
        </div>
        {dateFrom || dateTo ? (
          <span className="text-[11px] text-ink-faint">
            Showing transfers{dateFrom ? ` from ${dateFrom}` : ''}{dateTo ? ` up to ${dateTo}` : ''}
          </span>
        ) : null}
      </div>
    </div>
  );

  // --- Summary cards based on filter mode ---
  const renderCards = () => {
    if (filterMode === 'single' && singleStoreId) {
      return (
        <div className="grid gap-4 sm:grid-cols-3">
          <div key="total" className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-ink-faint">Total Transfers</p>
            <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-ink">{stats.totalTransfers}</p>
            <p className="mt-1 text-[11px] text-ink-faint">All transfers involving {stats.storeLabel}</p>
          </div>
          <div key="in" className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-ink-faint">Incoming</p>
            <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-stock-ok">{stats.incoming}</p>
            <p className="mt-1 text-[11px] text-ink-faint">Laptops received at {stats.storeLabel}</p>
          </div>
          <div key="out" className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-ink-faint">Outgoing</p>
            <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-stock-risk">{stats.outgoing}</p>
            <p className="mt-1 text-[11px] text-ink-faint">Laptops sent from {stats.storeLabel}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div key="total" className="panel p-5">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Total Transfers</p>
          <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-ink">{stats.totalTransfers}</p>
          {filterMode === 'inter' && interFromStoreId && interToStoreId && (
            <p className="mt-1 text-[11px] text-ink-faint">
              Between {storeName(Number(interFromStoreId))} and {storeName(Number(interToStoreId))}
            </p>
          )}
        </div>
        <div key="unique" className="panel p-5">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Unique Laptops</p>
          <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-ink">{stats.uniqueLaptops}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Search transfers by laptop, serial, store or account…"
        countLabel={`${filtered.length} of ${transferFiltered.length} transfers`}
        className="max-w-md"
      />

      {/* Filter controls */}
      {renderFilterControls()}

      {/* Summary cards */}
      {renderCards()}

      {/* Transfer table (desktop) */}
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-sm font-semibold tracking-tight text-ink">Transfer History</h2>
          <span className="mono-chip text-[10px]">{filtered.length} moves</span>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Date / Time</th>
                <th className={th}>{t.tableBrand}</th>
                <th className={th}>{t.tableSerial}</th>
                <th className={th}>From Store</th>
                <th className={th}>To Store</th>
                <th className={th}>Transferred By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-ink-faint">
                    {q ? 'No transfers match your search.' : 'No transfers recorded yet. Move a laptop to a different store to see it here.'}
                  </td>
                </tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="transition-colors duration-150 hover:bg-surface-2/60">
                  <td className={`${td} font-mono text-[11px] text-ink-faint`}>
                    {formatTime(l.changed_at)}
                  </td>
                  <td className={td}>
                    <p className="font-medium text-ink">{l.brand_model}</p>
                  </td>
                  <td className={td}>
                    <span className="mono-chip">{l.serial_number}</span>
                  </td>
                  <td className={td}>
                    {l.from_store_name || (l.from_store_id && storeName(l.from_store_id)) || (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className={td}>
                    {l.to_store_name || (l.to_store_id && storeName(l.to_store_id)) || (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className={td}>
                    {l.transferred_by ? (
                      <span className="mono-chip">{l.transferred_by}</span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: stackable vertical cards — no horizontal scroll */}
        <div className="md:hidden divide-y divide-[var(--hairline)]">
          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-ink-faint">
              {q ? 'No transfers match your search.' : 'No transfers recorded yet. Move a laptop to a different store to see it here.'}
            </div>
          )}
          {filtered.map((l) => (
            <div key={l.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-ink">{l.brand_model}</p>
                <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                  {formatTime(l.changed_at)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="mono-chip">{l.serial_number}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-medium text-ink-dim">
                  {l.from_store_name || (l.from_store_id && storeName(l.from_store_id)) || '—'}
                </span>
                <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-medium text-ink-dim">
                  {l.to_store_name || (l.to_store_id && storeName(l.to_store_id)) || '—'}
                </span>
              </div>
              {l.transferred_by && (
                <p className="mt-1.5 text-[11px] text-ink-faint">
                  Transferred by <span className="font-medium text-ink-dim">{l.transferred_by}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
