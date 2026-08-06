import { useLabels } from '../labels.jsx';

export default function StoreFilter({ stores, storeId, setStoreId, countFor, status, setStatus }) {
  const t = useLabels();
  const statuses = ['In Stock', 'In Transit', 'Sold'];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="px-1 text-sm font-semibold text-slate-700">{t.filterByStore}</h2>

      {/* All stores */}
      <button
        onClick={() => setStoreId('')}
        className={`mt-3 w-full rounded-lg px-3 py-2 text-left text-sm transition ${
          storeId === ''
            ? 'bg-slate-900 text-white'
            : 'text-slate-700 hover:bg-slate-100'
        }`}
      >
        {t.allStores} <span className="float-right opacity-60">{laptopsAll()}</span>
      </button>

      {/* Individual stores */}
      <div className="mt-1 max-h-72 space-y-0.5 overflow-y-auto pr-1">
        {stores.map((s) => {
          const active = String(s.id) === String(storeId);
          return (
            <button
              key={s.id}
              onClick={() => setStoreId(active ? '' : s.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {s.store_name}
              <span className="float-right opacity-60">{countFor(s.id)}</span>
            </button>
          );
        })}
      </div>

      {/* Status filter */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="px-1 text-sm font-semibold text-slate-700">{t.statusLabel}</h3>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="">{t.anyStatus}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  // Show total filtered count for "All Stores".
  function laptopsAll() {
    return countFor('all');
  }
}