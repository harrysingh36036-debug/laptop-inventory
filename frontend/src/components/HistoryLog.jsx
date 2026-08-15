import { formatTime } from '../utils';
import { useLabels } from '../labels.jsx';

export default function HistoryLog({ logs }) {
  const t = useLabels();
  const th = 'px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint';
  const td = 'px-5 py-2.5 align-middle';
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-tight text-ink">{t.transferHistory}</h2>
          <p className="text-xs text-ink-faint">{t.transferHistorySubtitle}</p>
        </div>
        <span className="mono-chip">{logs.length}</span>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="sticky top-0 bg-surface backdrop-blur">
            <tr className="border-b border-line">
              <th className={th}>Laptop</th>
              <th className={th}>Serial</th>
              <th className={th}>From</th>
              <th className={th}>To</th>
              <th className={th}>Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-ink-faint">
                  No transfers yet. Change a laptop's location to see it here.
                </td>
              </tr>
            )}
            {logs.map((log, i) => (
              <tr key={`${log.id}-${i}`} className="transition-colors duration-150 hover:bg-surface-2/60">
                <td className={`${td} text-ink`}>{log.brand_model}</td>
                <td className={td}>
                  <span className="mono-chip">{log.serial_number}</span>
                </td>
                <td className={`${td} text-ink-dim`}>{log.from_store_name ?? '—'}</td>
                <td className={`${td} font-medium text-ink`}>{log.to_store_name}</td>
                <td className={`${td} font-mono text-[11px] text-ink-faint`}>{formatTime(log.changed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}