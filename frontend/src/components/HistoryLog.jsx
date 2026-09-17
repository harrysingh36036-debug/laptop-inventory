import { formatTime } from '../utils';
import { useLabels } from '../labels.jsx';

export default function HistoryLog({ logs }) {
  const t = useLabels();
  const th = 'px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500';
  const td = 'px-5 py-2.5 align-middle';
  return (
    <section className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-gray-200 px-5 py-4">
        <div>
          <h2 className="  text-sm font-semibold tracking-tight text-gray-900">{t.transferHistory}</h2>
          <p className="text-xs text-gray-500">{t.transferHistorySubtitle}</p>
        </div>
        <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{logs.length}</span>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="sticky top-0 bg-white backdrop-blur">
            <tr className="border-b border-gray-200">
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
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">
                  No transfers yet. Change a laptop's location to see it here.
                </td>
              </tr>
            )}
            {logs.map((log, i) => (
              <tr key={`${log.id}-${i}`} className="transition-colors duration-150 hover:bg-gray-50/60">
                <td className={`${td} text-gray-900`}>{log.brand_model}</td>
                <td className={td}>
                  <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">{log.serial_number}</span>
                </td>
                <td className={`${td} text-gray-600`}>{log.from_store_name ?? '—'}</td>
                <td className={`${td} font-medium text-gray-900`}>{log.to_store_name}</td>
                <td className={`${td} font-mono text-[11px] text-gray-500`}>{formatTime(log.changed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}