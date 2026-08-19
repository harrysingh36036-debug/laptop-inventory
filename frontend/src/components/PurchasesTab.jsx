import React, { useState } from 'react';
import { inr, formatTime } from '../utils';
import SearchBox from './SearchBox';

function maskAadhar(hash) {
  if (!hash || hash.length <= 6) return hash || '—';
  return `••••••${hash.slice(-6)}`;
}

export default function PurchasesTab({
  purchases = [],
  summary = null,
  canEditInventory = false,
  onAddPurchase,
  onEditPurchase,
  onDeletePurchase
}) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [revealedAadhars, setRevealedAadhars] = useState(new Set());

  const q = search.trim().toLowerCase();
  const filtered = q
    ? purchases.filter((p) =>
        [p.brand, p.brand_model, p.serial_number, p.purchased_from, p.status, p.current_store_name, p.graphics]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
    : purchases;

  const cards = [
    { label: 'Units Bought', value: String(summary?.total_units ?? 0) },
    { label: 'Total Spent', value: inr(summary?.total_value ?? 0), accent: true },
    {
      label: 'This Month',
      value: `${summary?.month_units ?? 0} units · ${inr(summary?.month_value ?? 0)}`,
      small: true
    }
  ];

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint';
  const td = 'px-4 py-3 align-middle';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search purchases by brand, serial, vendor or GPU…"
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
          <p className="text-xs text-ink-faint">Money spent buying systems — separate from inventory.</p>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Purchased On</th>
                <th className={th}>Item</th>
                <th className={th}>Serial</th>
                <th className={th}>GPU</th>
                <th className={th}>Vendor</th>
                <th className={th}>Rate</th>
                <th className={th}>Extra</th>
                <th className={th}>Qty</th>
                <th className={th}>Total Cost</th>
                {canEditInventory && <th className={`${th} text-right`}>Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEditInventory ? 10 : 9} className="px-4 py-12 text-center text-sm text-ink-faint">
                    {q ? 'No purchases match your search.' : 'No purchases recorded yet. Use "+ Record Purchase" to log money spent.'}
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const total = (Number(p.purchase_rate) || 0) * (Number(p.quantity) || 1) + (Number(p.extra_charges) || 0);
                return (
                  <React.Fragment key={p.id}>
                  <tr className="transition-colors duration-150 hover:bg-surface-2/60">
                    <td className={`${td} font-mono text-[11px] text-ink-faint`}>{formatTime(p.purchased_at || p.created_at)}</td>
                    <td className={`${td} font-medium text-ink`}>
                      {p.brand_model || '—'}
                      {p.brand && <p className="mt-0.5 text-[11px] text-ink-faint">{p.brand}</p>}
                      {p.comment && <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-ink-dim" title={p.comment}>{p.comment}</p>}
                    </td>
                    <td className={td}>
                      {p.serial_number ? <span className="mono-chip">{p.serial_number}</span> : <span className="text-ink-faint">—</span>}
                    </td>
                    <td className={`${td} text-xs text-ink-dim`}>{p.graphics || <span className="text-ink-faint">—</span>}</td>
                    <td className={`${td} text-xs text-ink-dim`}>{p.purchased_from || <span className="text-ink-faint">—</span>}</td>
                    <td className={`${td} font-mono text-xs text-ink-dim`}>{p.purchase_rate != null ? inr(p.purchase_rate) : '—'}</td>
                    <td className={`${td} font-mono text-xs text-ink-dim`}>{p.extra_charges ? inr(p.extra_charges) : '—'}</td>
                    <td className={`${td} font-mono text-xs text-ink-dim`}>×{p.quantity || 1}</td>
                    <td className={`${td} font-mono text-xs font-medium text-ink`}>{inr(total)}</td>
                    {canEditInventory && (
                      <td className={`${td} text-right`}>
                          <button
                            onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                            className="btn-ghost text-accent"
                            title="View purchase details"
                          >
                            <svg className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        <button onClick={() => onEditPurchase(p)} className="btn-ghost">Edit</button>
                        <button onClick={() => onDeletePurchase(p)} className="btn-ghost ml-2 text-stock-risk hover:bg-stock-risk/10">
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandedId === p.id && (
                    <tr className="bg-surface-2/50">
                      <td colSpan={canEditInventory ? 10 : 9} className="px-4 py-2 text-sm text-ink-dim">
                        <div className="p-3 rounded-lg border border-accent-line bg-accent-soft">
                          <p className="font-semibold text-ink mb-2">Purchase Details</p>
                          <div className="grid gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                            <p><span className="text-ink-faint">Aadhar:</span> <span className="font-mono text-ink">
                              {p.purchaser_aadhar && revealedAadhars.has(p.id)
                                ? p.purchaser_aadhar
                                : maskAadhar(p.purchaser_aadhar_hash)}
                                <button
                                  type="button"
                                  onClick={() => setRevealedAadhars((prev) => { const next = new Set(prev); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; })}
                                  className="ml-1.5 text-ink-faint hover:text-accent transition-colors inline align-middle"
                                  title={revealedAadhars.has(p.id) ? 'Hide Aadhar' : 'Show full Aadhar'}
                                >
                                  {revealedAadhars.has(p.id)
                                    ? <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                    : <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                                </button>
                            </span></p>
                            <p><span className="text-ink-faint">Name:</span> {p.purchaser_name || '—'}</p>
                            <p><span className="text-ink-faint">Phone:</span> {p.purchaser_phone || '—'}</p>
                            <p><span className="text-ink-faint">Store:</span> {p.current_store_name || '—'}</p>
                            <p><span className="text-ink-faint">Status:</span> {p.status || '—'}</p>
                          </div>
                          <button
                            onClick={() => setExpandedId(null)}
                            className="mt-3 text-accent underline cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: card list instead of wide table */}
      <div className="md:hidden divide-y divide-[var(--hairline)]">
        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-faint">
            {q ? 'No purchases match your search.' : 'No purchases recorded yet. Use "+ Record Purchase" to log money spent.'}
          </div>
        )}
        {filtered.map((p) => {
          const total = (Number(p.purchase_rate) || 0) * (Number(p.quantity) || 1) + (Number(p.extra_charges) || 0);
          const open = expandedId === p.id;
          return (
            <div key={p.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{p.brand_model || '—'}</p>
                  {p.brand && <p className="mt-0.5 text-[11px] text-ink-faint">{p.brand}</p>}
                  <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{formatTime(p.purchased_at || p.created_at)}</p>
                </div>
                <p className="font-mono text-sm font-medium text-ink">{inr(total)}</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {p.serial_number && <span className="mono-chip">{p.serial_number}</span>}
                {p.graphics && <span className="text-ink-dim">GPU: {p.graphics}</span>}
                {p.purchased_from && <span className="text-ink-dim">{p.purchased_from}</span>}
                {p.quantity > 1 && <span className="font-mono text-ink-dim">×{p.quantity}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-ink-dim">
                <span><span className="text-ink-faint">Rate:</span> <span className="font-mono">{inr(p.purchase_rate || 0)}</span></span>
                {p.extra_charges ? <span><span className="text-ink-faint">Extra:</span> <span className="font-mono">{inr(p.extra_charges)}</span></span> : null}
                <span><span className="text-ink-faint">Store:</span> {p.current_store_name || '—'}</span>
              </div>
              {p.comment && <p className="mt-1 text-[11px] text-ink-dim">{p.comment}</p>}
              {canEditInventory && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setExpandedId(open ? null : p.id)}
                    className="btn-ghost text-accent"
                    title="View purchase details"
                  >
                    <svg className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                  <button onClick={() => onEditPurchase(p)} className="btn-ghost">Edit</button>
                  <button onClick={() => onDeletePurchase(p)} className="btn-ghost ml-auto text-stock-risk hover:bg-stock-risk/10">
                    Delete
                  </button>
                </div>
              )}
              {open && (
                <div className="mt-2 rounded-lg border border-accent-line bg-accent-soft p-3 text-[11px] text-ink-dim">
                  <p className="font-semibold text-ink mb-1.5">Purchase Details</p>
                  <div className="grid gap-y-1">
                    <p><span className="text-ink-faint">Aadhar:</span> <span className="font-mono text-ink">
                      {p.purchaser_aadhar && revealedAadhars.has(p.id)
                        ? p.purchaser_aadhar
                        : maskAadhar(p.purchaser_aadhar_hash)}
                      {p.purchaser_aadhar && (
                        <button
                          type="button"
                          onClick={() => setRevealedAadhars((prev) => { const next = new Set(prev); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; })}
                          className="ml-1.5 text-ink-faint hover:text-accent transition-colors inline align-middle"
                          title={revealedAadhars.has(p.id) ? 'Hide Aadhar' : 'Show full Aadhar'}
                        >
                          {revealedAadhars.has(p.id)
                            ? <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                            : <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                        </button>
                      )}
                    </span></p>
                    <p><span className="text-ink-faint">Phone:</span> {p.purchaser_phone || '—'}</p>
                    <p><span className="text-ink-faint">Store:</span> {p.current_store_name || '—'}</p>
                    <p><span className="text-ink-faint">Status:</span> {p.status || '—'}</p>
                  </div>
                  <button onClick={() => setExpandedId(null)} className="mt-3 text-accent underline cursor-pointer">Close</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
