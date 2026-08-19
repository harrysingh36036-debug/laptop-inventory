import { useEffect, useState } from 'react';
import { getInventoryStats } from '../api';
import { inr } from '../utils';

function Card({ label, value }) {
  return (
    <div className="panel p-5">
      <p className="text-xs uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-ink">{value}</p>
    </div>
  );
}

export default function InventoryStats({ stores, search = '', storeId = null }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    getInventoryStats({ storeId })
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [storeId]);

  if (loading) return <p className="text-sm text-ink-faint">Loading stock insights…</p>;
  if (error) return <p className="text-sm text-stock-risk">{error}</p>;

  const t = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint';
  const td = 'px-4 py-3 align-middle font-mono text-xs';

  const bar = (n, max) => {
    const pct = max ? (n / max) * 100 : 0;
    return (
      <div className="mt-1 h-2 w-full rounded bg-surface-2">
        <div className="h-2 rounded bg-accent" style={{ width: `${pct}%` }} />
      </div>
    );
  };

  const brandMax = Math.max(1, ...(stats.by_brand || [{ total: 1 }]).map((b) => b.total));

  const q = search.trim().toLowerCase();
  const match = (v) => !q || String(v || '').toLowerCase().includes(q);
  const brands = (stats.by_brand || []).filter((b) => match(b.brand));
  const generations = (stats.by_generation || []).filter((g) => match(g.generation));
  const configs = (stats.by_config || []).filter((c) => match(c.config));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Total Systems" value={stats.totals?.total ?? 0} />
        <Card label="In Stock" value={stats.totals?.in_stock ?? 0} />
        <Card label="In Transit" value={stats.totals?.in_transit ?? 0} />
        <Card label="Sold" value={stats.totals?.sold ?? 0} />
      </div>

      <div className="panel p-5">
        <h3 className="font-display text-sm font-semibold tracking-tight text-ink mb-3">Systems by Brand</h3>
        <div className="space-y-3">
          {brands.map((b) => (
            <div key={b.brand}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">{b.brand}</span>
                <span className="font-mono text-xs text-ink-dim">{b.total} total</span>
              </div>
              {bar(b.total, brandMax)}
              <div className="mt-1 flex gap-3 text-[11px] text-ink-faint">
                <span>Stock {b.in_stock}</span>
                <span>Transit {b.in_transit}</span>
                <span>Sold {b.sold}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <h3 className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              By Generation
            </h3>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className={t}>Generation</th>
                  <th className={`${t} text-right`}>Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hairline)]">
                {generations.map((g, i) => (
                  <tr key={i} className="hover:bg-surface-2/60">
                    <td className={td}>{g.generation}</td>
                    <td className={`${td} text-right font-mono`}>{g.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <h3 className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              By Configuration
            </h3>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className={t}>Spec</th>
                  <th className={`${t} text-right`}>Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hairline)]">
                {configs.map((c, i) => (
                  <tr key={i} className="hover:bg-surface-2/60">
                    <td className={td}>{c.config}</td>
                    <td className={`${td} text-right font-mono`}>{c.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
