import { useEffect, useMemo, useState } from 'react';
import { getSales, getSalesSummary, deleteSale } from '../api';
import { formatTime, inr } from '../utils';
import { socket } from '../socket';
import SearchBox from './SearchBox';
import DangerConfirmModal from './DangerConfirmModal';

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
export function printSaleReceipt(s, storeName, sellerName) {
  const w = window.open('', '_blank', 'width=520,height=700');
  if (!w) return;
  const total = Number(s.sale_price) || 0;
  w.document.write(`<!doctype html><html><head><title>Receipt ${s.serial_number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1d24; padding: 24px; }
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
  <div class="row"><span>Customer</span><b>${escapeHtml(s.customer_name || '—')}${s.customer_phone_last4 ? ' <span class="muted">•••• ' + escapeHtml(s.customer_phone_last4) + '</span>' : ''}</b></div>
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

export default function SalesTab({ stores, isSuperAdmin = false, canSeeCustomer = false, onNotify }) {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [storeF, setStoreF] = useState(''); // '' = all stores, else store id
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [danger, setDanger] = useState(null); // { sale }

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

  return (
    <div className="space-y-6 animate-rise">
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Laptop</th>
                <th className={th}>Serial</th>
                <th className={th}>Customer</th>
                <th className={th}>Phone</th>
                <th className={th}>Sale Price</th>
                <th className={th}>Profit</th>
                <th className={th}>Sold By</th>
                <th className={th}>Sold At</th>
                <th className={th}>Receipt</th>
                {isSuperAdmin && <th className={th}>Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isSuperAdmin ? 10 : 9} className="px-4 py-10 text-center text-sm text-ink-faint">
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
                    {canSeeCustomer && s.customer_phone_last4
                      ? `••••${s.customer_phone_last4}`
                      : <span className="text-ink-faint">—</span>}
                  </td>
                  <td className={`${td} font-mono text-xs text-ink`}>{inr(s.sale_price)}</td>
                  <td className={`${td} font-mono text-xs font-medium ${s.profit >= 0 ? 'text-stock-ok' : 'text-stock-risk'}`}>
                    {inr(s.profit)}
                  </td>
                  <td className={`${td} text-ink-dim`}>{s.sold_by || '—'}</td>
                  <td className={`${td} font-mono text-[11px] text-ink-faint`}>{formatTime(s.sold_at)}</td>
                  <td className={td}>
                    <button
                      onClick={() => printSaleReceipt(s, storeName(s.store_id))}
                      className="btn-ghost"
                      title="Print sales receipt"
                    >
                      Receipt
                    </button>
                  </td>
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

      {danger && (
        <DangerConfirmModal
          title="Delete this sale?"
          warning={`Sale of "${danger.sale.brand_model}" (${danger.sale.serial_number}) — ₹${inr(danger.sale.sale_price)} will be removed and the laptop returns to In Stock. This cannot be undone.`}
          onConfirm={handleDelete}
          onClose={() => setDanger(null)}
        />
      )}
    </div>
  );
}