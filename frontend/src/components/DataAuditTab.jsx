import { useEffect, useMemo, useState } from 'react';
import { getDeleteLogs, getSales } from '../api';
import { formatIstDateTime, inr } from '../utils';
import SearchBox from './SearchBox';

const ENTITY_COLORS = {
  laptop: 'bg-stock-risk/10 text-stock-risk border-stock-risk/20',
  sale: 'bg-accent-soft text-accent border-accent-line',
  repair: 'bg-amber-50 text-amber-700 border-amber-200',
  customer: 'bg-purple-50 text-purple-700 border-purple-200',
  brand: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  vendor: 'bg-sky-50 text-sky-700 border-sky-200',
  store: 'bg-rose-50 text-rose-700 border-rose-200',
};

const ENTITY_ICONS = {
  laptop: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  sale: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  repair: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
    </svg>
  ),
};

function EntityTypeBadge({ type }) {
  const color = ENTITY_COLORS[type] || 'bg-surface-2 text-ink-dim border-line';
  const icon = ENTITY_ICONS[type];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${color}`}>
      {icon}
      {type}
    </span>
  );
}

export default function DataAuditTab({ isAdmin, isSuperAdmin }) {
  const [logs, setLogs] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [logsData, salesData] = await Promise.all([
          getDeleteLogs().catch(() => []),
          getSales().catch(() => [])
        ]);
        if (!alive) return;
        setLogs(logsData);
        setSales(salesData);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const q = search.trim().toLowerCase();

  const entityTypes = useMemo(() => {
    const s = new Set(logs.map((l) => l.entity_type).filter(Boolean));
    return [...s].sort();
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (typeFilter && l.entity_type !== typeFilter) return false;
      if (q) {
        const hay = [l.entity_type, l.entity_label, l.remarks, l.deleted_by]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, q, typeFilter]);

  // Sold laptops that were returned (refund/exchange) — appear in delete_logs as 'sale'
  const returnedSales = useMemo(() => {
    return logs.filter((l) => l.entity_type === 'sale');
  }, [logs]);

  // Summary stats
  const stats = useMemo(() => {
    const byType = {};
    for (const l of logs) {
      byType[l.entity_type] = (byType[l.entity_type] || 0) + 1;
    }
    return byType;
  }, [logs]);

  if (loading) return <p className="text-sm text-ink-faint">Loading data…</p>;
  if (error) return <p className="text-sm text-stock-risk">{error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Audit Trail</p>
        <h2 className="mt-1.5 font-display text-xl font-semibold tracking-tight text-ink">Data Log</h2>
        <p className="mt-0.5 text-xs text-ink-faint">
          All deleted items, returns, and exchanges — every action is recorded.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(stats).map(([type, count]) => (
          <button
            key={type}
            onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
            className={`rounded-xl border p-3 text-left transition-all duration-150 ${
              typeFilter === type
                ? 'ring-2 ring-accent-line bg-accent-soft/20 border-accent-line'
                : 'border-line bg-surface hover:bg-surface-2/70'
            }`}
          >
            <div className="flex items-center gap-2">
              <EntityTypeBadge type={type} />
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-ink">{count}</p>
            <p className="text-[11px] text-ink-faint">deleted</p>
          </button>
        ))}
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-[10px] uppercase tracking-wide text-ink-faint">Total Sales</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-accent">{sales.length}</p>
          <p className="text-[11px] text-ink-faint">all time</p>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search by label, remarks, deleted by…"
          countLabel={`${filtered.length} log${filtered.length === 1 ? '' : 's'}`}
          className="w-full sm:max-w-md"
        />
        {entityTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTypeFilter('')}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === ''
                  ? 'border-accent-line bg-accent-soft text-accent'
                  : 'border-line bg-surface text-ink-dim hover:text-ink'
              }`}
            >
              All
            </button>
            {entityTypes.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(typeFilter === t ? '' : t)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  typeFilter === t
                    ? 'border-accent-line bg-accent-soft text-accent'
                    : 'border-line bg-surface text-ink-dim hover:text-ink'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Logs table */}
      <div className="panel overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Type</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Item</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Remarks</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Deleted By</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-ink-faint">
                    {q || typeFilter ? 'No logs match your filters.' : 'No delete logs yet.'}
                  </td>
                </tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="transition-colors duration-150 hover:bg-surface-2/60">
                  <td className="px-4 py-3"><EntityTypeBadge type={l.entity_type} /></td>
                  <td className="px-4 py-3 font-medium text-ink">{l.entity_label || `#${l.entity_id}`}</td>
                  <td className="px-4 py-3 text-ink-dim max-w-[200px] truncate">{l.remarks || '—'}</td>
                  <td className="px-4 py-3 text-ink-dim">{l.deleted_by || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-faint">{formatIstDateTime(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-[var(--hairline)]">
        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-faint">
            {q || typeFilter ? 'No logs match your filters.' : 'No delete logs yet.'}
          </div>
        )}
        {filtered.map((l) => (
          <div key={l.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <EntityTypeBadge type={l.entity_type} />
                <p className="mt-1.5 font-medium text-ink">{l.entity_label || `#${l.entity_id}`}</p>
              </div>
              <span className="font-mono text-[11px] text-ink-faint shrink-0">{formatIstDateTime(l.created_at)}</span>
            </div>
            {l.remarks && (
              <p className="mt-1.5 text-xs text-ink-dim">{l.remarks}</p>
            )}
            {l.deleted_by && (
              <p className="mt-1 text-[11px] text-ink-faint">by {l.deleted_by}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
