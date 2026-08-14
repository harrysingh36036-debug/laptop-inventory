import { useState } from 'react';
import { inr, formatTime } from '../utils';
import SearchBox from './SearchBox';

const STATUS_STYLES = {
  Pending: 'border-stock-risk/25 bg-stock-risk/10 text-stock-risk',
  'In Progress': 'border-accent-line bg-accent-soft text-accent',
  Repaired: 'border-stock-ok/25 bg-stock-ok/10 text-stock-ok'
};

function StatusChip({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[status] || 'border-line bg-surface-2 text-ink-dim'}`}
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

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint';
  const td = 'px-4 py-3 align-middle';

  return (
    <div className="space-y-6 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search repairs by laptop, serial, issue, vendor or status…"
          countLabel={`${filtered.length} of ${repairs.length} repairs`}
          className="max-w-md"
        />
        {canEditInventory && (
          <button onClick={onAdd} className="btn-accent">+ Add Repair</button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-ink-faint">{c.label}</p>
            <p className={`mt-2 font-mono text-2xl font-medium tracking-tight ${c.accent ? 'text-accent' : 'text-ink'}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-sm font-semibold tracking-tight text-ink">Repairs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
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
                {canEditInventory && <th className={`${th} text-right`}>Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEditInventory ? 12 : 11} className="px-4 py-12 text-center text-sm text-ink-faint">
                    {q ? 'No repairs match your search.' : 'No repairs recorded yet.'}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="transition-colors duration-150 hover:bg-surface-2/60">
                  <td className={td}>
                    <span className="mono-chip">{r.serial_number || '—'}</span>
                  </td>
                  <td className={`${td} font-medium text-ink`}>{r.brand_model || <span className="text-ink-faint">—</span>}</td>
                  <td className={`${td} text-xs text-ink-dim`}>{r.store_name || <span className="text-ink-faint">—</span>}</td>
                  <td className={`${td} max-w-[240px] text-xs text-ink-dim`}>
                    <p className="line-clamp-2" title={r.issue}>{r.issue}</p>
                    {r.notes && <p className="mt-0.5 text-[11px] text-ink-faint line-clamp-1" title={r.notes}>{r.notes}</p>}
                  </td>
                  <td className={`${td} text-xs text-ink-dim`}>{r.vendor || <span className="text-ink-faint">—</span>}</td>
                  <td className={`${td} font-mono text-xs text-ink-dim`}>{inr(r.cost)}</td>
                  <td className={`${td} font-mono text-xs text-ink-dim`}>{inr(r.charge)}</td>
                  <td className={`${td} font-mono text-xs ${(Number(r.profit) || 0) > 0 ? 'text-stock-ok' : 'text-ink-faint'}`}>{inr(r.profit)}</td>
                  <td className={td}><StatusChip status={r.status} /></td>
                  <td className={`${td} font-mono text-[11px] text-ink-faint`}>{formatTime(r.updated_at || r.created_at)}</td>
                  <td className={`${td} text-xs text-ink-dim`}>{r.created_by || '—'}</td>
                  {canEditInventory && (
                    <td className={`${td} text-right`}>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button onClick={() => onEdit(r)} className="btn-ghost">Edit</button>
                        <button onClick={() => onDelete(r)} className="btn-danger">Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}