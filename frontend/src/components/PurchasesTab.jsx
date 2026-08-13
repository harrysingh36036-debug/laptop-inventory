import { useState } from 'react';
import { inr, formatTime } from '../utils';
import SearchBox from './SearchBox';

export default function PurchasesTab({
  purchases = [],
  summary = null,
  canEditInventory = false,
  onAddPurchase,
  onEditLaptop
}) {
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const filtered = q
    ? purchases.filter((p) =>
        [p.brand_model, p.serial_number, p.purchased_from, p.status, p.current_store_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
    : purchases;

  const cards = [
    { label: 'Total Units Purchased', value: String(summary?.total_units ?? purchases.length) },
    { label: 'Total Invested', value: inr(summary?.total_value), accent: true },
    {
      label: 'This Month',
      value: `${summary?.month_units ?? 0} units · ${inr(summary?.month_value ?? 0)}`,
      small: true
    }
  ];

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint';
  const td = 'px-4 py-3 align-middle';

  return (
    <div className="space-y-6 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search purchases by laptop, serial, vendor or store…"
          countLabel={`${filtered.length} of ${purchases.length} purchases`}
          className="max-w-md"
        />
        {canEditInventory && (
          <button onClick={onAddPurchase} className="btn-accent">
            + Record Purchase
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-ink-faint">{c.label}</p>
            <p
              className={`mt-2 font-mono font-medium tracking-tight ${
                c.small ? 'text-lg text-ink' : 'text-2xl'
              } ${c.accent ? 'text-accent' : 'text-ink'}`}
            >
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-sm font-semibold tracking-tight text-ink">Purchase Ledger</h2>
          {canEditInventory && (
            <p className="text-xs text-ink-faint">Purchases are recorded through the Inventory form.</p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Purchased On</th>
                <th className={th}>Laptop</th>
                <th className={th}>Serial</th>
                <th className={th}>Vendor</th>
                <th className={th}>Rate</th>
                <th className={th}>Extra Charges</th>
                <th className={th}>Total Cost</th>
                <th className={th}>Store</th>
                <th className={th}>Status</th>
                {canEditInventory && <th className={`${th} text-right`}>Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEditInventory ? 10 : 9} className="px-4 py-12 text-center text-sm text-ink-faint">
                    {q ? 'No purchases match your search.' : 'No purchases recorded yet. Use "+ Update Inventory" to add units.'}
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const total = (Number(p.purchase_rate) || 0) + (Number(p.extra_charges) || 0);
                return (
                  <tr key={p.id} className="transition-colors duration-150 hover:bg-surface-2/60">
                    <td className={`${td} font-mono text-[11px] text-ink-faint`}>{formatTime(p.created_at)}</td>
                    <td className={`${td} font-medium text-ink`}>
                      {p.brand_model}
                      {p.brand && <p className="mt-0.5 text-[11px] text-ink-faint">{p.brand}</p>}
                    </td>
                    <td className={td}>
                      <span className="mono-chip">{p.serial_number}</span>
                    </td>
                    <td className={`${td} text-xs text-ink-dim`}>{p.purchased_from || <span className="text-ink-faint">—</span>}</td>
                    <td className={`${td} font-mono text-xs text-ink-dim`}>{p.purchase_rate != null ? inr(p.purchase_rate) : '—'}</td>
                    <td className={`${td} font-mono text-xs text-ink-dim`}>{p.extra_charges ? inr(p.extra_charges) : '—'}</td>
                    <td className={`${td} font-mono text-xs font-medium text-ink`}>{inr(total)}</td>
                    <td className={`${td} text-xs text-ink-dim`}>{p.current_store_name || <span className="text-ink-faint">—</span>}</td>
                    <td className={td}>
                      <span className="mono-chip">{p.status}</span>
                    </td>
                    {canEditInventory && (
                      <td className={`${td} text-right`}>
                        <button onClick={() => onEditLaptop(p)} className="btn-ghost">Edit</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
