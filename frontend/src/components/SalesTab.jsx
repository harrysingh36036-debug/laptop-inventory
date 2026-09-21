import { useEffect, useMemo, useState } from 'react';
import { getSales, getSalesSummary, deleteSale } from '../api';
import { formatTime, inr, getIstToday } from '../utils';
import { socket } from '../socket';
import useStickyShadow, { stickyCol } from '../useStickyShadow';

import DangerConfirmModal from './DangerConfirmModal';
import ReturnSaleModal from './ReturnSaleModal';

function csvEscape(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}
export function downloadSalesCsv(sales, stores) {
  const rows = [
    ['Sale ID', 'Laptop ID', 'Brand Model', 'Serial Number', 'Store', 'Sale Price', 'Cost Price', 'Profit', 'Customer', 'Phone (last 4)', 'Sold By', 'Sold At']
  ];
  (sales || []).forEach((s) =>
    rows.push([
      s.id, s.laptop_id, s.brand_model, s.serial_number,
      stores.find((st) => st.id === s.store_id)?.store_name || s.store_id,
      s.sale_price, s.cost_price, s.profit,
      s.customer_name || (s.customer_id ? `#${s.customer_id}` : ''),
      s.customer_phone_last4 || '', s.sold_by, s.sold_at
    ])
  );
  const blob = new Blob([rows.map((r) => r.map(csvEscape).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales-report-${getIstToday()}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  // eslint-disable-next-line no-param-reassign
  a.parentNode && a.parentNode.removeChild(a);
}

// Printable sales receipt (browser print).
export function printSaleReceipt(s, storeName, sellerName, customerPhone) {
  const w = window.open('', '_blank', 'width=520,height=700');
  if (!w) return;
  const total = Number(s.sale_price) || 0;
  const phoneDisplay = customerPhone
    ? ` <span class="muted">${escapeHtml(customerPhone)}</span>`
    : (s.customer_phone_last4 ? ` <span class="muted">•••• ${escapeHtml(s.customer_phone_last4)}</span>` : '');
  w.document.write(`<!doctype html><html><head><title>Receipt ${s.serial_number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; color: #1a1d24; padding: 24px; }
  .receipt { max-width: 460px; margin: 0 auto; border: 1px dashed #cbd2dc; border-radius: 12px; padding: 24px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .muted { color: #6b7280; font-size: 12px; }
  .row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #eef1f6; font-size: 13px; }
  .row b { font-weight: 600; }
  .total { display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; margin-top: 10px; }
  .footer { margin-top: 18px; text-align: center; font-size: 11px; color: #9aa3b2; }
</style></head><body><div class="receipt">
  <h1>Sales Receipt</h1>
  <p class="muted">${escapeHtml(storeName || '')} · ${escapeHtml(String(s.sold_at || '').slice(0, 10))}</p>
  <br/>
  <div class="row"><span>Model</span><b>${escapeHtml(s.brand_model || '')}</b></div>
  <div class="row"><span>Serial</span><b>${escapeHtml(s.serial_number || '')}</b></div>
  <div class="row"><span>Customer</span><b>${escapeHtml(s.customer_name || '—')}${phoneDisplay}</b></div>
  <div class="row"><span>Sold by</span><b>${escapeHtml(s.sold_by || sellerName || '')}</b></div>
  <div class="row"><span>Time</span><b>${escapeHtml(formatTime(s.sold_at))}</b></div>
  <div class="total"><span>Amount (₹)</span><span>${Number(total).toLocaleString('en-IN')}</span></div>
  <p class="footer">Thank you for your purchase!</p>
</div></body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default function SalesTab({ stores, isSuperAdmin = false, isAdmin = false, canSeeCustomer = false, userRole = '', homeStoreId = null, onNotify }) {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [storeF, setStoreF] = useState(''); // '' = all stores, else store id
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [danger, setDanger] = useState(null); // { sale }
  const [returnModal, setReturnModal] = useState(null); // { sale }
  const [revealedPhones, setRevealedPhones] = useState(new Set());
  const { scrollRef, scrolled, onScroll } = useStickyShadow();

  const storeName = (id) => stores.find((s) => s.id === id)?.store_name;

  // Store-wise boxes derived from the full sales list.
  const storeBoxes = useMemo(() => {
    const map = new Map();
    for (const s of sales) {
      const key = String(s.store_id ?? 'none');
      const g = map.get(key) || { store_id: s.store_id, units: 0, amount: 0, profit: 0 };
      g.units += 1;
      g.amount += Number(s.sale_price) || 0;
      g.profit += Number(s.profit) || 0;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.units - a.units);
  }, [sales]);

  const q = search.trim().toLowerCase();
  const filtered = sales.filter((s) => {
    if (storeF !== '' && String(s.store_id) !== storeF) return false;
    if (!q) return true;
    return [s.brand_model, s.serial_number, s.customer_name, s.sold_by, s.store_id && storeName(s.store_id)]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, sum] = await Promise.all([getSales(), getSalesSummary()]);
        if (!alive) return;
        setSales(s);
        setSummary(sum);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const reload = async () => {
    try {
      const [s, sum] = await Promise.all([getSales(), getSalesSummary()]);
      setSales(s);
      setSummary(sum);
    } catch (e) {
      onNotify?.(e.message, 'error');
    }
  };

  useEffect(() => {
    const onDeleted = () => reload();
    socket.on('sale:deleted', onDeleted);
    return () => socket.off('sale:deleted', onDeleted);
  }, []);

  const handleDelete = async (pwd, remarks) => {
    const s = danger?.sale;
    if (!s) return '';
    try {
      await deleteSale(s.id, pwd, remarks);
      onNotify?.('Sale deleted — laptop back to In Stock', 'success');
      setDanger(null);
      reload();
      return '';
    } catch (e) {
      return e.message;
    }
  };

  if (loading) return <p className="text-sm text-gray-500">Loading sales…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const cards = [
    { label: 'Units Sold', value: String(summary?.count ?? 0), mono: true },
    { label: 'Total Sales', value: inr(summary?.total_sales), mono: true, accent: true },
    { label: 'Total Profit', value: inr(summary?.total_profit), mono: true }
  ];

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500';
  const td = 'px-4 py-3 align-middle';
  const activeStore = stores.find((s) => String(s.id) === storeF);
  // Managers can process returns only for sales made from their own store.
  const isManager = userRole === 'manager';
  const canReturnCol = isAdmin || isSuperAdmin || isManager;
  const canReturnRow = (s) =>
    isAdmin || isSuperAdmin ||
    (isManager && homeStoreId != null && String(s.store_id) === String(homeStoreId));
  const emptyCols = 10 + (canReturnCol ? 1 : 0) + (isSuperAdmin ? 1 : 0);
  // The trailing action-ish column is sticky: Delete for super admins,
  // otherwise Return (admins/managers), otherwise Receipt.
  const receiptSticky = !canReturnCol && !isSuperAdmin;
  const returnSticky = canReturnCol && !isSuperAdmin;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sales by laptop, serial, store, customer or staff…"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">{filtered.length} of {sales.length}</span>
        </div>
        <button
          onClick={() => downloadSalesCsv(sales, stores)}
          disabled={!sales.length}
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-40"
        >
          Download CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-3 sm:p-5">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">{c.label}</p>
            <p className={`mt-1.5 font-mono text-xl sm:text-2xl font-medium tracking-tight sm:mt-2 ${c.accent ? 'text-blue-600' : 'text-gray-900'}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Store-wise sales boxes */}
      <div>
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Store-wise sales</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <button
            onClick={() => setStoreF('')}
            className={`rounded-xl border border-gray-100 bg-white flex flex-col items-start gap-1.5 p-4 text-left transition-colors duration-150 ${
              storeF === '' ? 'ring-2 ring-blue-200 bg-blue-50' : 'hover:bg-gray-50'
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">All Stores</span>
            <span className="text-2xl font-bold text-blue-600">{sales.length}</span>
            <span className="text-[11px] text-gray-500">units sold</span>
          </button>
          {storeBoxes.map((b) => (
            <button
              key={b.store_id ?? 'none'}
              onClick={() => setStoreF(String(b.store_id ?? ''))}
              className={`rounded-xl border border-gray-100 bg-white flex flex-col items-start gap-1.5 p-4 text-left transition-colors duration-150 ${
                storeF === String(b.store_id ?? '') ? 'ring-2 ring-blue-200 bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <span className="truncate w-full text-xs font-semibold uppercase tracking-wide text-gray-500">
                {storeName(b.store_id) || (b.store_id ? `Store #${b.store_id}` : 'Unknown store')}
              </span>
              <span className="text-2xl font-bold text-blue-600">{b.units}</span>
              <span className="font-mono text-[11px] text-gray-500">
                {inr(b.amount)} · profit {inr(b.profit)}
              </span>
            </button>
          ))}
        </div>
        {canSeeCustomer && (
          <p className="mt-2 px-1 text-[11px] text-gray-500">
            Customer name + phone shown only to admins / supervisors.
          </p>
        )}
      </div>

      {/* Sales details table */}
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-3">
           <h2 className="text-sm font-semibold tracking-tight text-gray-900">
            {activeStore ? `${activeStore.store_name} — sold details` : 'Sales details'}
          </h2>
          {activeStore && (
            <button onClick={() => setStoreF('')} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
              Show all stores
            </button>
          )}
        </div>
        <div ref={scrollRef} onScroll={onScroll} className="hidden lg:block overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className={th}>Laptop</th>
                <th className={th}>Serial</th>
                <th className={th}>Customer</th>
                <th className={th}>Phone</th>
                <th className={th}>Sale Price</th>
                <th className={th}>Profit</th>
                <th className={th}>Payment</th>
                <th className={th}>Sold By</th>
                <th className={th}>Sold At</th>
                <th className={receiptSticky ? stickyCol(th, scrolled) : th}>Receipt</th>
                {canReturnCol && <th className={returnSticky ? stickyCol(th, scrolled) : th}>Return</th>}
                {isSuperAdmin && <th className={stickyCol(th, scrolled)}>Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={emptyCols} className="px-4 py-10 text-center text-sm text-gray-500">
                    {q ? 'No sales match your search.' : 'No sales recorded yet.'}
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="transition-colors duration-150 hover:bg-gray-50">
                  <td className={`${td} font-medium text-gray-900`}>{s.brand_model}</td>
                  <td className={td}><span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{s.serial_number}</span></td>
                  <td className={`${td} text-gray-600`}>
                    {canSeeCustomer
                      ? (s.customer_name || <span className="text-gray-500">—</span>)
                      : <span className="text-gray-500">Restricted</span>}
                  </td>
                  <td className={`${td} font-mono text-xs text-gray-600`}>
                    {canSeeCustomer && (s.customer_phone_last4 || s.customer_phone)
                      ? <span className="inline-flex items-center gap-1">
                          <span>{revealedPhones.has(s.id) && s.customer_phone ? s.customer_phone : `••••${s.customer_phone_last4}`}</span>
                          {s.customer_phone && (
                            <button
                              type="button"
                              onClick={() => setRevealedPhones((prev) => { const next = new Set(prev); next.has(s.id) ? next.delete(s.id) : next.add(s.id); return next; })}
                              className="text-gray-500 hover:text-blue-600 transition-colors"
                              title={revealedPhones.has(s.id) ? 'Hide phone' : 'Show full phone'}
                            >
                              {revealedPhones.has(s.id)
                                ? <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                            </button>
                          )}
                        </span>
                      : <span className="text-gray-500">—</span>}
                  </td>
                  <td className={`${td} font-mono text-xs text-gray-900`}>{inr(s.sale_price)}</td>
                  <td className={`${td} font-mono text-xs font-medium ${s.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {inr(s.profit)}
                  </td>
                  <td className={`${td} text-xs text-gray-600`}>
                    {s.payment_method ? (
                      <span>{s.payment_method}{s.payment_detail ? ` · ${s.payment_detail}` : ''}</span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className={`${td} text-gray-600`}>{s.sold_by || '—'}</td>
                  <td className={`${td} font-mono text-[11px] text-gray-500`}>{formatTime(s.sold_at)}</td>
                  <td className={receiptSticky ? stickyCol(td, scrolled) : td}>
                    <button
                      onClick={() => printSaleReceipt(s, storeName(s.store_id), null, revealedPhones.has(s.id) ? s.customer_phone : null)}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                      title="Print sales receipt"
                    >
                      Receipt
                    </button>
                  </td>
                  {canReturnRow(s) && (
                    <td className={returnSticky ? stickyCol(td, scrolled) : td}>
                      <button
                        onClick={() => setReturnModal({ sale: s })}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                        title="Return this sale"
                      >
                        Return
                      </button>
                    </td>
                  )}
                  {isSuperAdmin && (
                    <td className={stickyCol(td, scrolled)}>
                      <button
                        onClick={() => setDanger({ sale: s })}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
                        title="Delete this sale (laptop returns to In Stock)"
                      >
                        Delete
                      </button>
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
            {q ? 'No sales match your search.' : 'No sales recorded yet.'}
          </div>
        )}
        {filtered.map((s) => (
          <div key={s.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{s.brand_model}</p>
                {s.serial_number && <span className="mt-0.5 inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{s.serial_number}</span>}
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-medium text-gray-900">{inr(s.sale_price)}</p>
                <p className={`font-mono text-[11px] ${s.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{inr(s.profit)}</p>
              </div>
            </div>
            {s.payment_method && (
              <p className="mt-1 text-[11px] text-gray-600">
                <span className="text-gray-500">Payment:</span> {s.payment_method}{s.payment_detail ? ` · ${s.payment_detail}` : ''}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-gray-600">
              <span>
                <span className="text-gray-500">Customer:</span>{' '}
                {canSeeCustomer
                  ? (s.customer_name || '—')
                  : <span className="text-gray-500">Restricted</span>}
              </span>
              {canSeeCustomer && (s.customer_phone_last4 || s.customer_phone) && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <span>{revealedPhones.has(s.id) && s.customer_phone ? s.customer_phone : `••••${s.customer_phone_last4}`}</span>
                  {s.customer_phone && (
                    <button
                      type="button"
                      onClick={() => setRevealedPhones((prev) => { const next = new Set(prev); next.has(s.id) ? next.delete(s.id) : next.add(s.id); return next; })}
                      className="text-gray-500 hover:text-blue-600 transition-colors"
                      title={revealedPhones.has(s.id) ? 'Hide phone' : 'Show full phone'}
                    >
                      {revealedPhones.has(s.id)
                        ? <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                    </button>
                  )}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-gray-500">
              <span>{storeName(s.store_id) || '—'}</span>
              {s.sold_by && <span>sold by {s.sold_by}</span>}
              <span>{formatTime(s.sold_at)}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                onClick={() => printSaleReceipt(s, storeName(s.store_id), null, revealedPhones.has(s.id) ? s.customer_phone : null)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                title="Print sales receipt"
              >
                Receipt
              </button>
              {canReturnRow(s) && (
                <button
                  onClick={() => setReturnModal({ sale: s })}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  title="Return this sale"
                >
                  Return
                </button>
              )}
              {isSuperAdmin && (
                <button onClick={() => setDanger({ sale: s })} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 ml-auto" title="Delete this sale (laptop returns to In Stock)">
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {danger && (
        <DangerConfirmModal
          title="Delete this sale?"
          warning={`Sale of "${danger.sale.brand_model}" (${danger.sale.serial_number}) — ₹${inr(danger.sale.sale_price)} will be removed and the laptop returns to In Stock. This cannot be undone.`}
          onConfirm={handleDelete}
          onClose={() => setDanger(null)}
        />
      )}

      {returnModal && (
        <ReturnSaleModal
          sale={returnModal.sale}
          stores={stores}
          onNotify={onNotify}
          onClose={() => setReturnModal(null)}
          onDone={() => { setReturnModal(null); reload(); }}
        />
      )}
    </div>
  );
}