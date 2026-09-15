import { useLabels } from '../labels.jsx';

export default function StoreFilter({ stores, storeId, setStoreId, countFor }) {
  const t = useLabels();

  const row =
    'w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150';

  return (
    <div className="panel p-3">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {t.filterByStore}
      </h2>

      {/* All stores */}
      <button
        onClick={() => setStoreId('')}
        className={`mt-3 ${row} ${
          storeId === '' ? 'bg-accent-soft text-accent' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'
        }`}
      >
        <span className="font-medium">{t.allStores}</span>
        <span className="mono-chip">{countFor('all')}</span>
      </button>

      {/* Individual stores */}
      <div className="mt-1 max-h-72 space-y-0.5 overflow-y-auto pr-1">
        {stores.map((s, i) => {
          const active = String(s.id) === String(storeId);
          return (
            <button
              key={s.id}
              onClick={() => setStoreId(active ? '' : s.id)}
              className={`${row} ${active ? 'bg-accent-soft text-accent' : 'text-ink-dim hover:bg-surface-2 hover:text-ink'}`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className={`font-mono text-[10px] ${active ? 'text-accent/70' : 'text-ink-faint'}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="truncate">{s.store_name}</span>
              </span>
              <span className={`font-mono text-[11px] ${active ? 'text-accent/80' : 'text-ink-faint'}`}>
                {countFor(s.id)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}