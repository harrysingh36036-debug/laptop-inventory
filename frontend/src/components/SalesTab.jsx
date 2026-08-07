import { useEffect, useState } from 'react';
import { getSales, getSalesSummary } from '../api';
import { formatTime } from '../utils';

const inr = (n) => {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN')}`;
};

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

  if (loading) return <p className="text-sm text-slate-400">Loading sales…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Units Sold</p>
          <p className="mt-1 text-3xl font-bold text-slate-800">{summary?.count ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total Sales</p>
          <p className="mt-1 text-3xl font-bold text-emerald-600">{inr(summary?.total_sales)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total Profit</p>
          <p className="mt-1 text-3xl font-bold text-slate-800">{inr(summary?.total_profit)}</p>
        </div>
      </div>

      {/* Sales table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Laptop</th>
                <th className="px-4 py-3 font-semibold">Serial</th>
                <th className="px-4 py-3 font-semibold">Store</th>
                <th className="px-4 py-3 font-semibold">Sale Price</th>
                <th className="px-4 py-3 font-semibold">Cost</th>
                <th className="px-4 py-3 font-semibold">Profit</th>
                <th className="px-4 py-3 font-semibold">Sold By</th>
                <th className="px-4 py-3 font-semibold">Sold At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    No sales recorded yet.
                  </td>
                </tr>
              )}
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.brand_model}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.serial_number}</td>
                  <td className="px-4 py-3 text-slate-700">{storeName(s.store_id) ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-slate-800">{inr(s.sale_price)}</td>
                  <td className="px-4 py-3 text-slate-500">{inr(s.cost_price)}</td>
                  <td className={`px-4 py-3 font-semibold ${s.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {inr(s.profit)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.sold_by || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatTime(s.sold_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}