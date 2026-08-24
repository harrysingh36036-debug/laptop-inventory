import { useEffect, useMemo, useState } from 'react';
import { getSales, getSalesSummary, deleteSale } from '../api';
import { formatTime, inr } from '../utils';
import { socket } from '../socket';
import SearchBox from './SearchBox';
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
  a.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
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

  if (loading) return <p className="text-sm text-ink-faint">Loading sales…</p>;
  if (error) return <p className="text-sm text-stock-risk">{error}</p>;

  const cards = [
    { label: 'Units Sold', value: String(summary?.count ?? 0), mono: true },
    { label: 'Total Sales', value: inr(summary?.total_sales), mono: true, accent: true },
    { label: 'Total Profit', value: inr(summary?.total_profit), mono: true }
  ];

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint';
  const td = 'px-4 py-3 align-middle';
  const activeStore = stores.find((s) => String(s.id) === storeF);
  // Managers can process returns only for sales made from their own store.
  const isManager = userRole === 'manager';
  const canReturnCol = isAdmin || isSuperAdmin || isManager;
  const canReturnRow = (s) =>
    isAdmin || isSuperAdmin ||
    (isManager && homeStoreId != null && String(s.store_id) === String(homeStoreId));
  const emptyCols = 10 + (canReturnCol ? 1 : 0) + (isSuperAdmin ? 1 : 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search sales by laptop, serial, store, customer or staff…"
          countLabel={`${filtered.length} of ${sales.length} sales`}
          className="max-w-md"
        />
        <button
          onClick={() => downloadSalesCsv(sales, stores)}
          disabled={!sales.length}
          className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
        >
          Download CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-ink-faint">{c.label}</p>
            <p className={`mt-2 font-mono text-2xl font-medium tracking-tight ${c.accent ? 'text-accent' : 'text-ink'}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Store-wise sales boxes */}
      <div>
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">Store-wise sales</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <button
            onClick={() => setStoreF('')}
            className={`panel flex flex-col items-start gap-1.5 p-4 text-left transition-colors duration-150 ${
              storeF === '' ? 'ring-2 ring-accent-line bg-accent-soft/20' : 'hover:bg-surface-2/70'
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">All Stores</span>
            <span className="font-display text-2xl font-bold text-accent">{sales.length}</span>
            <span className="text-[11px] text-ink-faint">units sold</span>
          </button>
          {storeBoxes.map((b) => (
            <button
              key={b.store_id ?? 'none'}
              onClick={() => setStoreF(String(b.store_id ?? ''))}
              className={`panel flex flex-col items-start gap-1.5 p-4 text-left transition-colors duration-150 ${
                storeF === String(b.store_id ?? '') ? 'ring-2 ring-accent-line bg-accent-soft/20' : 'hover:bg-surface-2/70'
              }`}
            >
              <span className="truncate w-full text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {storeName(b.store_id) || (b.store_id ? `Store #${b.store_id}` : 'Unknown store')}
              </span>
              <span className="font-display text-2xl font-bold text-accent">{b.units}</span>
              <span className="font-mono text-[11px] text-ink-faint">
                {inr(b.amount)} · profit {inr(b.profit)}
              </span>
            </button>
          ))}
        </div>
        {canSeeCustomer && (
          <p className="mt-2 px-1 text-[11px] text-ink-faint">
            Customer name + phone shown only to admins / supervisors.
          </p>
        )}
      </div>

      {/* Sales details table */}
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="font-display text-sm font-semibold tracking-tight text-ink">
            {activeStore ? `${activeStore.store_name} — sold details` : 'Sales details'}
          </h2>
          {activeStore && (
            <button onClick={() => setStoreF('')} className="btn-ghost">
              Show all stores
            </button>
          )}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Laptop</th>
                <th className={th}>Serial</th>
                <th className={th}>Customer</th>
                <th className={th}>Phone</th>
                <th className={th}>Sale Price</th>
                <th className={th}>Profit</th>
                <th className={th}>Payment</th>
                <th className={th}>Sold By</th>
                <th className={th}>Sold At</th>
                <th className={th}>Receipt</th>
                {canReturnCol && <th className={th}>Return</th>}
                {isSuperAdmin && <th className={th}>Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={emptyCols} className="px-4 py-10 text-center text-sm text-ink-faint">
                    {q ? 'No sales match your search.' : 'No sales recorded yet.'}
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="transition-colors duration-150 hover:bg-surface-2/60">
                  <td className={`${td} font-medium text-ink`}>{s.brand_model}</td>
                  <td className={td}><span className="mono-chip">{s.serial_number}</span></td>
                  <td className={`${td} text-ink-dim`}>
                    {canSeeCustomer
                      ? (s.customer_name || <span className="text-ink-faint">—</span>)
                      : <span className="text-ink-faint">Restricted</span>}
                  </td>
                  <td className={`${td} font-mono text-xs text-ink-dim`}>
                    {canSeeCustomer && (s.customer_phone_last4 || s.customer_phone)
                      ? <span className="inline-flex items-center gap-1">
                          <span>{revealedPhones.has(s.id) && s.customer_phone ? s.customer_phone : `••••${s.customer_phone_last4}`}</span>
                          {s.customer_phone && (
                            <button
                              type="button"
                              onClick={() => setRevealedPhones((prev) => { const next = new Set(prev); next.has(s.id) ? next.delete(s.id) : next.add(s.id); return next; })}
                              className="text-ink-faint hover:text-accent transition-colors"
                              title={revealedPhones.has(s.id) ? 'Hide phone' : 'Show full phone'}
                            >
                              {revealedPhones.has(s.id)
                                ? <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                            </button>
                          )}
                        </span>
                      : <span className="text-ink-faint">—</span>}
                  </td>
                  <td className={`${td} font-mono text-xs text-ink`}>{inr(s.sale_price)}</td>
                  <td className={`${td} font-mono text-xs font-medium ${s.profit >= 0 ? 'text-stock-ok' : 'text-stock-risk'}`}>
                    {inr(s.profit)}
                  </td>
                  <td className={`${td} text-xs text-ink-dim`}>
                    {s.payment_method ? (
                      <span>{s.payment_method}{s.payment_detail ? ` · ${s.payment_detail}` : ''}</span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className={`${td} text-ink-dim`}>{s.sold_by || '—'}</td>
                  <td className={`${td} font-mono text-[11px] text-ink-faint`}>{formatTime(s.sold_at)}</td>
                  <td className={td}>
                    <button
                      onClick={() => printSaleReceipt(s, storeName(s.store_id), null, revealedPhones.has(s.id) ? s.customer_phone : null)}
                      className="btn-ghost"
                      title="Print sales receipt"
                    >
                      Receipt
                    </button>
                  </td>
                  {canReturnRow(s) && (
                    <td className={td}>
                      <button
                        onClick={() => setReturnModal({ sale: s })}
                        className="btn-ghost"
                        title="Return this sale"
                      >
                        Return
                      </button>
                    </td>
                  )}
                  {isSuperAdmin && (
                    <td className={td}>
                      <button
                        onClick={() => setDanger({ sale: s })}
                        className="btn-danger"
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
      <div className="md:hidden divide-y divide-[var(--hairline)]">
        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-faint">
            {q ? 'No sales match your search.' : 'No sales recorded yet.'}
          </div>
        )}
        {filtered.map((s) => (
          <div key={s.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{s.brand_model}</p>
                {s.serial_number && <span className="mt-0.5 inline-block mono-chip">{s.serial_number}</span>}
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-medium text-ink">{inr(s.sale_price)}</p>
                <p className={`font-mono text-[11px] ${s.profit >= 0 ? 'text-stock-ok' : 'text-stock-risk'}`}>{inr(s.profit)}</p>
              </div>
            </div>
            {s.payment_method && (
              <p className="mt-1 text-[11px] text-ink-dim">
                <span className="text-ink-faint">Payment:</span> {s.payment_method}{s.payment_detail ? ` · ${s.payment_detail}` : ''}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-ink-dim">
              <span>
                <span className="text-ink-faint">Customer:</span>{' '}
                {canSeeCustomer
                  ? (s.customer_name || '—')
                  : <span className="text-ink-faint">Restricted</span>}
              </span>
              {canSeeCustomer && (s.customer_phone_last4 || s.customer_phone) && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <span>{revealedPhones.has(s.id) && s.customer_phone ? s.customer_phone : `••••${s.customer_phone_last4}`}</span>
                  {s.customer_phone && (
                    <button
                      type="button"
                      onClick={() => setRevealedPhones((prev) => { const next = new Set(prev); next.has(s.id) ? next.delete(s.id) : next.add(s.id); return next; })}
                      className="text-ink-faint hover:text-accent transition-colors"
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
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-ink-faint">
              <span>{storeName(s.store_id) || '—'}</span>
              {s.sold_by && <span>sold by {s.sold_by}</span>}
              <span>{formatTime(s.sold_at)}</span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                onClick={() => printSaleReceipt(s, storeName(s.store_id), null, revealedPhones.has(s.id) ? s.customer_phone : null)}
                className="btn-ghost"
                title="Print sales receipt"
              >
                Receipt
              </button>
              {canReturnRow(s) && (
                <button
                  onClick={() => setReturnModal({ sale: s })}
                  className="btn-ghost"
                  title="Return this sale"
                >
                  Return
                </button>
              )}
              {isSuperAdmin && (
                <button onClick={() => setDanger({ sale: s })} className="btn-danger ml-auto" title="Delete this sale (laptop returns to In Stock)">
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