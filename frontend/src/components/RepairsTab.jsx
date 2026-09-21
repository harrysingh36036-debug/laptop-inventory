import { useState } from 'react';
import { inr, formatTime } from '../utils';
import useStickyShadow, { stickyCol } from '../useStickyShadow';
const STATUS_STYLES = {
  Pending: 'border-red-200 bg-red-50 text-red-600',
  'In Progress': 'border-blue-200 bg-blue-50 text-blue-600',
  Repaired: 'border-green-200 bg-green-50 text-green-600'
};

function StatusChip({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[status] || 'border-gray-200 bg-gray-50 text-gray-600'}`}
    >
      {status}
    </span>
  );
}

export default function RepairsTab({
  repairs = [],
  canEditInventory = false,
  onAdd,
  onEdit,
  onDelete
}) {
  const [search, setSearch] = useState('');
  const { scrollRef, scrolled, onScroll } = useStickyShadow();

  const q = search.trim().toLowerCase();
  const filtered = q
    ? repairs.filter((r) =>
        [r.brand_model, r.serial_number, r.issue, r.vendor, r.status, r.created_by, r.store_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
    : repairs;

  const summary = repairs.reduce(
    (acc, r) => ({
      total: acc.total + 1,
      pending: acc.pending + (r.status === 'Pending' ? 1 : 0),
      in_progress: acc.in_progress + (r.status === 'In Progress' ? 1 : 0),
      repaired: acc.repaired + (r.status === 'Repaired' ? 1 : 0),
      total_cost: acc.total_cost + (Number(r.cost) || 0),
      total_charge: acc.total_charge + (Number(r.charge) || 0),
      total_profit: acc.total_profit + ((Number(r.charge) || 0) - (Number(r.cost) || 0))
    }),
    { total: 0, pending: 0, in_progress: 0, repaired: 0, total_cost: 0, total_charge: 0, total_profit: 0 }
  );

  const cards = [
    { label: 'Total Repairs', value: String(summary.total) },
    { label: 'Pending', value: String(summary.pending) },
    { label: 'In Progress', value: String(summary.in_progress) },
    { label: 'Repaired', value: String(summary.repaired) },
    { label: 'Item Cost Spent', value: inr(summary.total_cost) },
    { label: 'Charged to Customers', value: inr(summary.total_charge), accent: true },
    { label: 'Repair Profit', value: inr(summary.total_profit) }
  ];

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500';
  const td = 'px-4 py-3 align-middle';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repairs by laptop, serial, issue, vendor or status…"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <p className="mt-1 text-[10px] text-gray-500">{filtered.length} of {repairs.length} repairs</p>
        </div>
        {canEditInventory && (
          <button onClick={onAdd} className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">+ Add Repair</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-3 sm:p-5">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">{c.label}</p>
            <p className={`mt-1.5 font-mono text-xl sm:text-2xl font-medium tracking-tight sm:mt-2 ${c.accent ? 'text-blue-600' : 'text-gray-900'}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-gray-900">Repairs</h2>
        </div>
        <div ref={scrollRef} onScroll={onScroll} className="hidden lg:block overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className={th}>Serial</th>
                <th className={th}>Laptop</th>
                <th className={th}>Store</th>
                <th className={th}>Issue</th>
                <th className={th}>Repair Shop</th>
                <th className={th}>Item Cost</th>
                <th className={th}>Charged to CX</th>
                <th className={th}>Profit</th>
                <th className={th}>Status</th>
                <th className={th}>Updated</th>
                <th className={th}>Recorded By</th>
                {canEditInventory && <th className={stickyCol(th, scrolled)}>Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEditInventory ? 12 : 11} className="px-4 py-12 text-center text-sm text-gray-500">
                    {q ? 'No repairs match your search.' : 'No repairs recorded yet.'}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="transition-colors duration-150 hover:bg-gray-50">
                  <td className={td}>
                    <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{r.serial_number || '—'}</span>
                  </td>
                  <td className={`${td} font-medium text-gray-900`}>{r.brand_model || <span className="text-gray-500">—</span>}</td>
                  <td className={`${td} text-xs text-gray-600`}>{r.store_name || <span className="text-gray-500">—</span>}</td>
                  <td className={`${td} max-w-[240px] text-xs text-gray-600`}>
                    <p className="line-clamp-2" title={r.issue}>{r.issue}</p>
                    {r.notes && <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-1" title={r.notes}>{r.notes}</p>}
                  </td>
                  <td className={`${td} text-xs text-gray-600`}>{r.vendor || <span className="text-gray-500">—</span>}</td>
                  <td className={`${td} font-mono text-xs text-gray-600`}>{inr(r.cost)}</td>
                  <td className={`${td} font-mono text-xs text-gray-600`}>{inr(r.charge)}</td>
                  <td className={`${td} font-mono text-xs ${(Number(r.profit) || 0) > 0 ? 'text-green-600' : 'text-gray-500'}`}>{inr(r.profit)}</td>
                  <td className={td}><StatusChip status={r.status} /></td>
                  <td className={`${td} font-mono text-[11px] text-gray-500`}>{formatTime(r.updated_at || r.created_at)}</td>
                  <td className={`${td} text-xs text-gray-600`}>{r.created_by || '—'}</td>
                  {canEditInventory && (
                    <td className={stickyCol(td, scrolled)}>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button onClick={() => onEdit(r)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Edit</button>
                        <button onClick={() => onDelete(r)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100">Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: card list instead of wide table */}
      <div className="lg:hidden divide-y divide-gray-100">
        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-500">
            {q ? 'No repairs match your search.' : 'No repairs recorded yet.'}
          </div>
        )}
        {filtered.map((r) => (
          <div key={r.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{r.brand_model || '—'}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2">
                  {r.serial_number ? <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{r.serial_number}</span> : null}
                  <StatusChip status={r.status} />
                </p>
              </div>
              <p className="font-mono text-sm font-medium text-gray-900">{inr(r.charge)}</p>
            </div>
            {r.issue && <p className="mt-1.5 text-xs text-gray-600">{r.issue}</p>}
            {r.notes && <p className="mt-0.5 text-[11px] text-gray-500">{r.notes}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-600">
              {r.store_name && <span><span className="text-gray-500">Store:</span> {r.store_name}</span>}
              {r.vendor && <span><span className="text-gray-500">Shop:</span> {r.vendor}</span>}
              <span><span className="text-gray-500">Cost:</span> <span className="font-mono">{inr(r.cost)}</span></span>
              <span><span className="text-gray-500">Profit:</span> <span className={`font-mono ${(Number(r.profit) || 0) > 0 ? 'text-green-600' : 'text-gray-500'}`}>{inr(r.profit)}</span></span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-gray-500">
              <span>{formatTime(r.updated_at || r.created_at)}</span>
              {r.created_by && <span>by {r.created_by}</span>}
            </div>
            {canEditInventory && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button onClick={() => onEdit(r)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Edit</button>
                <button onClick={() => onDelete(r)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100">Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}