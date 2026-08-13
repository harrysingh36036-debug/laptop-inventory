import { useEffect, useState } from 'react';
import { getTransferLogs } from '../api';
import { formatTime } from '../utils';
import { useLabels } from '../labels.jsx';
import SearchBox from './SearchBox';

export default function TransferHistoryTab({ stores }) {
  const t = useLabels();
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 100;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getTransferLogs(limit);
        if (alive) setLogs(data || []);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <p className="text-sm text-ink-faint">Loading transfer history…</p>;
  if (error) return <p className="text-sm text-stock-risk">{error}</p>;

  const storeName = (id) => stores.find((s) => s.id === id)?.store_name;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? logs.filter((l) =>
        [
          l.brand_model, l.serial_number, l.from_store_name, l.to_store_name, l.transferred_by,
          l.from_store_id && storeName(l.from_store_id), l.to_store_id && storeName(l.to_store_id)
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
    : logs;

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint';
  const td = 'px-4 py-3 align-middle';

  const cards = [
    { label: 'Total Transfers', value: String(logs.length), mono: true },
    { label: 'Unique Laptops', value: String(new Set(logs.map((l) => l.laptop_id)).size), mono: true }
  ];

  return (
    <div className="space-y-6 animate-rise">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Search transfers by laptop, serial, store or account…"
        countLabel={`${filtered.length} of ${logs.length} transfers`}
        className="max-w-md"
      />
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.label} className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-ink-faint">{c.label}</p>
            <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-ink">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Transfer table */}
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-display text-sm font-semibold tracking-tight text-ink">Transfer History</h2>
          <span className="mono-chip text-[10px]">{filtered.length} moves</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Date / Time</th>
                <th className={th}>{t.tableBrand}</th>
                <th className={th}>{t.tableSerial}</th>
                <th className={th}>From Store</th>
                <th className={th}>To Store</th>
                <th className={th}>Transferred By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-ink-faint">
                    {q ? 'No transfers match your search.' : 'No transfers recorded yet. Move a laptop to a different store to see it here.'}
                  </td>
                </tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="transition-colors duration-150 hover:bg-surface-2/60">
                  <td className={`${td} font-mono text-[11px] text-ink-faint`}>
                    {formatTime(l.changed_at)}
                  </td>
                  <td className={td}>
                    <p className="font-medium text-ink">{l.brand_model}</p>
                  </td>
                  <td className={td}>
                    <span className="mono-chip">{l.serial_number}</span>
                  </td>
                  <td className={td}>
                    {l.from_store_name || (l.from_store_id && storeName(l.from_store_id)) || (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className={td}>
                    {l.to_store_name || (l.to_store_id && storeName(l.to_store_id)) || (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className={td}>
                    {l.transferred_by ? (
                      <span className="mono-chip">{l.transferred_by}</span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
