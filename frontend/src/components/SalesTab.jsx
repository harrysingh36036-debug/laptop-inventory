import { useEffect, useState } from 'react';
import { getSales, getSalesSummary } from '../api';
import { formatTime, inr } from '../utils';

function csvEscape(v) {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}
export function downloadSalesCsv(sales, stores) {
  const rows = [
    ['Sale ID', 'Laptop ID', 'Brand Model', 'Serial Number', 'Store', 'Sale Price', 'Cost Price', 'Profit', 'Customer', 'Sold By', 'Sold At']
  ];
  (sales || []).forEach((s) =>
    rows.push([
      s.id, s.laptop_id, s.brand_model, s.serial_number,
      stores.find((st) => st.id === s.store_id)?.store_name || s.store_id,
      s.sale_price, s.cost_price, s.profit,
      s.customer_name || (s.customer_id ? `#${s.customer_id}` : ''),
      s.sold_by, s.sold_at
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

export default function SalesTab({ stores }) {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storeName = (id) => stores.find((s) => s.id === id)?.store_name;

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

  if (loading) return <p className="text-sm text-ink-faint">Loading sales…</p>;
  if (error) return <p className="text-sm text-stock-risk">{error}</p>;

  const cards = [
    { label: 'Units Sold', value: String(summary?.count ?? 0), mono: true },
    { label: 'Total Sales', value: inr(summary?.total_sales), mono: true, accent: true },
    { label: 'Total Profit', value: inr(summary?.total_profit), mono: true }
  ];

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint';
  const td = 'px-4 py-3 align-middle';

  return (
    <div className="space-y-6 animate-rise">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-ink-faint">{c.label}</p>
            <p
              className={`mt-2 font-mono text-2xl font-medium tracking-tight ${
                c.accent ? 'text-accent' : 'text-ink'
              }`}
            >
              {c.value}
            </p>
          </div>
        ))}
      </div>

       {/* Sales table */}
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-sm font-semibold tracking-tight text-ink">Sales Report</h2>
          <button
            onClick={() => downloadSalesCsv(sales, stores)}
            disabled={!sales.length}
            className="btn-ghost btn-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            Download CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Laptop</th>
                <th className={th}>Serial</th>
                <th className={th}>Store</th>
                <th className={th}>Customer</th>
                <th className={th}>Sale Price</th>
                <th className={th}>Cost</th>
                <th className={th}>Profit</th>
                <th className={th}>Sold By</th>
                <th className={th}>Sold At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {sales.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-faint">
                    No sales recorded yet.
                  </td>
                </tr>
              )}
              {sales.map((s) => (
                <tr key={s.id} className="transition-colors duration-150 hover:bg-surface-2/60">
                  <td className={`${td} font-medium text-ink`}>{s.brand_model}</td>
                  <td className={td}>
                    <span className="mono-chip">{s.serial_number}</span>
                  </td>
                  <td className={`${td} text-ink-dim`}>
                    {storeName(s.store_id) ?? <span className="text-ink-faint">—</span>}
                  </td>
                  <td className={`${td} text-ink-dim`}>{s.customer_name || <span className="text-ink-faint">—</span>}</td>
                  <td className={`${td} font-mono text-xs text-ink`}>{inr(s.sale_price)}</td>
                  <td className={`${td} font-mono text-xs text-ink-dim`}>{inr(s.cost_price)}</td>
                  <td className={`${td} font-mono text-xs font-medium ${s.profit >= 0 ? 'text-stock-ok' : 'text-stock-risk'}`}>
                    {inr(s.profit)}
                  </td>
                  <td className={`${td} text-ink-dim`}>{s.sold_by || '—'}</td>
                  <td className={`${td} font-mono text-[11px] text-ink-faint`}>{formatTime(s.sold_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}