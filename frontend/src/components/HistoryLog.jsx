import { formatTime } from '../utils';
import { useLabels } from '../labels.jsx';

export default function HistoryLog({ logs }) {
  const t = useLabels();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="font-semibold text-slate-800">{t.transferHistory}</h2>
        <p className="text-xs text-slate-500">{t.transferHistorySubtitle}</p>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Laptop</th>
              <th className="px-5 py-2.5 font-semibold">Serial</th>
              <th className="px-5 py-2.5 font-semibold">From</th>
              <th className="px-5 py-2.5 font-semibold">To</th>
              <th className="px-5 py-2.5 font-semibold">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  No transfers yet. Change a laptop's location to see it here.
                </td>
              </tr>
            )}
            {logs.map((log, i) => (
              <tr key={`${log.id}-${i}`} className="hover:bg-slate-50/60">
                <td className="px-5 py-2.5 text-slate-700">{log.brand_model}</td>
                <td className="px-5 py-2.5 font-mono text-xs text-slate-500">
                  {log.serial_number}
                </td>
                <td className="px-5 py-2.5 text-slate-600">{log.from_store_name ?? '—'}</td>
                <td className="px-5 py-2.5 font-medium text-slate-800">{log.to_store_name}</td>
                <td className="px-5 py-2.5 text-xs text-slate-500">{formatTime(log.changed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}