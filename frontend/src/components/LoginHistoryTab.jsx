import { useCallback, useEffect, useState } from 'react';
import { getLoginLogs } from '../api';

const th = 'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-faint whitespace-nowrap';
const td = 'px-3 py-2 align-middle';

function StatusBadge({ log }) {
  if (log.match === true) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-stock-ok/30 bg-stock-ok/10 px-2.5 py-0.5 text-xs font-medium text-stock-ok">
        <span className="h-1.5 w-1.5 rounded-full bg-stock-ok" />
        At home store
      </span>
    );
  }
  if (log.match === false) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-stock-risk/40 bg-stock-risk/10 px-2.5 py-0.5 text-xs font-medium text-stock-risk">
        <span className="h-1.5 w-1.5 rounded-full bg-stock-risk" />
        Outside home store
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink-faint">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
      No home store
    </span>
  );
}

export default function LoginHistoryTab() {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLogs(null);
    setError('');
    try {
      setLogs(await getLoginLogs());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-faint">
          Every sign-in records the store it came from. A login from a store that
          is <span className="font-medium text-stock-risk">not the account's home store</span> is flagged red.
        </p>
        <button onClick={load} className="btn-ghost">
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-stock-risk/25 bg-stock-risk/10 px-3 py-2 text-sm text-stock-risk">
          {error}
        </p>
      )}

      {!logs ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-ink-faint">No logins recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2/50">
              <tr>
                <th className={th}>Account</th>
                <th className={th}>Store signed in</th>
                <th className={th}>Home store</th>
                <th className={th}>Signed in</th>
                <th className={th}>IP</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {logs.map((l) => (
                <tr key={l.id} className="transition-colors duration-150 hover:bg-surface-2/60">
                  <td className={`${td} font-medium text-ink`}>{l.username}</td>
                  <td className={td}>{l.store_name || '—'}</td>
                  <td className={`${td} text-ink-dim`}>{l.home_store_name || '—'}</td>
                  <td className={`${td} whitespace-nowrap text-ink-faint`}>{l.logged_in}</td>
                  <td className={`${td} font-mono text-xs text-ink-faint`}>{l.ip || '—'}</td>
                  <td className={td}>
                    <StatusBadge log={l} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}