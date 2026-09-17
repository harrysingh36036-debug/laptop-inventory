import React, { useState } from 'react';
import { inr, formatTime } from '../utils';

function maskAadhar(hash) {
  if (!hash || hash.length <= 6) return hash || '—';
  return `••••••${hash.slice(-6)}`;
}

export default function PurchasesTab({
  purchases = [],
  summary = null,
  canEditInventory = false,
  canViewPII = false,
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

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500';
  const td = 'px-4 py-3 align-middle';

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search purchases by brand, serial, vendor or GPU…"
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">{filtered.length} of {purchases.length}</span>
        </div>
        {canEditInventory && (
          <button onClick={onAddPurchase} className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 w-full sm:w-auto">
            + Record Purchase
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-3 sm:p-5">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">{c.label}</p>
            <p
              className={`mt-1.5 font-mono font-medium tracking-tight sm:mt-2 ${
                c.small ? 'text-sm sm:text-lg text-gray-900' : 'text-xl sm:text-2xl'
              } ${c.accent ? 'text-blue-600' : 'text-gray-900'}`}
            >
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-gray-900">Purchase Ledger</h2>
          <p className="text-xs text-gray-500">Money spent buying systems — separate from inventory.</p>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
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
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEditInventory ? 10 : 9} className="px-4 py-12 text-center text-sm text-gray-500">
                    {q ? 'No purchases match your search.' : 'No purchases recorded yet. Use "+ Record Purchase" to log money spent.'}
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const total = (Number(p.purchase_rate) || 0) * (Number(p.quantity) || 1) + (Number(p.extra_charges) || 0);
                return (
                  <React.Fragment key={p.id}>
                  <tr className="transition-colors duration-150 hover:bg-gray-50">
                    <td className={`${td} font-mono text-[11px] text-gray-500`}>{formatTime(p.purchased_at || p.created_at)}</td>
                    <td className={`${td} font-medium text-gray-900`}>
                      {p.brand_model || '—'}
                      {p.brand && <p className="mt-0.5 text-[11px] text-gray-500">{p.brand}</p>}
                      {p.comment && <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-gray-600" title={p.comment}>{p.comment}</p>}
                    </td>
                    <td className={td}>
                      {p.serial_number ? <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{p.serial_number}</span> : <span className="text-gray-500">—</span>}
                    </td>
                    <td className={`${td} text-xs text-gray-600`}>{p.graphics || <span className="text-gray-500">—</span>}</td>
                    <td className={`${td} text-xs text-gray-600`}>
                      {p.purchased_from || <span className="text-gray-500">—</span>}
                      {p.source_type && (
                        <span className="ml-1.5 rounded-full border border-gray-200 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-gray-500">
                          {p.source_type}
                        </span>
                      )}
                    </td>
                    <td className={`${td} font-mono text-xs text-gray-600`}>{p.purchase_rate != null ? inr(p.purchase_rate) : '—'}</td>
                    <td className={`${td} font-mono text-xs text-gray-600`}>{p.extra_charges ? inr(p.extra_charges) : '—'}</td>
                    <td className={`${td} font-mono text-xs text-gray-600`}>×{p.quantity || 1}</td>
                    <td className={`${td} font-mono text-xs font-medium text-gray-900`}>{inr(total)}</td>
                    {canEditInventory && (
                      <td className={`${td} text-right`}>
                          <button
                            onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-gray-100"
                            title="View purchase details"
                          >
                            <svg className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        <button onClick={() => onEditPurchase(p)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Edit</button>
                        <button onClick={() => onDeletePurchase(p)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 ml-2">
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandedId === p.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={canEditInventory ? 10 : 9} className="px-4 py-2 text-sm text-gray-600">
                        <div className="p-3 rounded-lg border border-blue-200 bg-blue-50">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-semibold text-gray-900">Purchase Details</p>
                            <button
                              onClick={() => setExpandedId(null)}
                              className="text-gray-500 hover:text-gray-900 transition-colors"
                              aria-label="Close purchase details"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {canViewPII ? (
                          <div className="grid gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                            <p><span className="text-gray-500">Aadhar:</span> <span className="font-mono text-gray-900">
                              {p.purchaser_aadhar && revealedAadhars.has(p.id)
                                ? p.purchaser_aadhar
                                : maskAadhar(p.purchaser_aadhar_hash)}
                                <button
                                  type="button"
                                  onClick={() => setRevealedAadhars((prev) => { const next = new Set(prev); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; })}
                                  className="ml-1.5 text-gray-500 hover:text-blue-600 transition-colors inline align-middle"
                                  title={revealedAadhars.has(p.id) ? 'Hide Aadhar' : 'Show full Aadhar'}
                                >
                                  {revealedAadhars.has(p.id)
                                    ? <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                    : <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                                </button>
                            </span></p>
                            <p><span className="text-gray-500">Name:</span> {p.purchaser_name || '—'}</p>
                            <p><span className="text-gray-500">Phone:</span> {p.purchaser_phone || '—'}</p>
                            <p><span className="text-gray-500">Store:</span> {p.current_store_name || '—'}</p>
                            <p><span className="text-gray-500">Status:</span> {p.status || '—'}</p>
                            <p><span className="text-gray-500">Condition:</span> {p.condition || 'Good'}</p>
                          </div>
                          ) : (
                            <p className="text-[11px] text-gray-500">
                              Customer name, phone and Aadhar are restricted. Ask an admin to grant you the "View PII" permission.
                            </p>
                          )}
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
      <div className="md:hidden divide-y divide-gray-100">
        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-500">
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
                  <p className="font-medium text-gray-900">{p.brand_model || '—'}</p>
                  {p.brand && <p className="mt-0.5 text-[11px] text-gray-500">{p.brand}</p>}
                  <p className="mt-0.5 font-mono text-[11px] text-gray-500">{formatTime(p.purchased_at || p.created_at)}</p>
                </div>
                <p className="font-mono text-sm font-medium text-gray-900">{inr(total)}</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {p.serial_number && <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{p.serial_number}</span>}
                {p.graphics && <span className="text-gray-600">GPU: {p.graphics}</span>}
                {p.purchased_from && <span className="text-gray-600">{p.purchased_from}</span>}
                {p.quantity > 1 && <span className="font-mono text-gray-600">×{p.quantity}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-600">
                <span><span className="text-gray-500">Rate:</span> <span className="font-mono">{inr(p.purchase_rate || 0)}</span></span>
                {p.extra_charges ? <span><span className="text-gray-500">Extra:</span> <span className="font-mono">{inr(p.extra_charges)}</span></span> : null}
                <span><span className="text-gray-500">Store:</span> {p.current_store_name || '—'}</span>
              </div>
              {p.comment && <p className="mt-1 text-[11px] text-gray-600">{p.comment}</p>}
              {canEditInventory && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setExpandedId(open ? null : p.id)}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-gray-100"
                    title="View purchase details"
                  >
                    <svg className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                  <button onClick={() => onEditPurchase(p)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Edit</button>
                  <button onClick={() => onDeletePurchase(p)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 ml-auto">
                    Delete
                  </button>
                </div>
              )}
              {open && (
                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-[11px] text-gray-600">
                  <p className="font-semibold text-gray-900 mb-1.5">Purchase Details</p>
                  <div className="grid gap-y-1">
                    <p><span className="text-gray-500">Aadhar:</span> <span className="font-mono text-gray-900">
                      {p.purchaser_aadhar && revealedAadhars.has(p.id)
                        ? p.purchaser_aadhar
                        : maskAadhar(p.purchaser_aadhar_hash)}
                      {p.purchaser_aadhar && (
                        <button
                          type="button"
                          onClick={() => setRevealedAadhars((prev) => { const next = new Set(prev); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; })}
                          className="ml-1.5 text-gray-500 hover:text-blue-600 transition-colors inline align-middle"
                          title={revealedAadhars.has(p.id) ? 'Hide Aadhar' : 'Show full Aadhar'}
                        >
                          {revealedAadhars.has(p.id)
                            ? <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                            : <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                        </button>
                      )}
                    </span></p>
                    <p><span className="text-gray-500">Phone:</span> {p.purchaser_phone || '—'}</p>
                    <p><span className="text-gray-500">Store:</span> {p.current_store_name || '—'}</p>
                    <p><span className="text-gray-500">Status:</span> {p.status || '—'}</p>
                  </div>
                  <button onClick={() => setExpandedId(null)} className="mt-3 text-blue-600 underline cursor-pointer">Close</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
