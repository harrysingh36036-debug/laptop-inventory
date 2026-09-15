import { useLabels } from '../labels.jsx';

export default function Toolbar({ search, setSearch, resultCount, sortBy, setSortBy, sortOrder, setSortOrder }) {
  const t = useLabels();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 max-w-md flex-1 rounded-lg border border-line bg-white px-3 py-2 focus-within:border-accent-line focus-within:ring-2 focus-within:ring-accent-soft">
        <svg
          className="h-4 w-4 shrink-0 text-ink-faint"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
          />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-ink-faint">Sort:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink focus:border-accent focus:outline-none"
          >
            <option value="created_at">Date</option>
            <option value="brand">Brand</option>
            <option value="model">Model</option>
            <option value="price">Price</option>
            <option value="serial">Serial</option>
            <option value="status">Status</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="btn-ghost !px-2 !py-1.5 text-xs"
            title={`Sort ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        <span className="text-xs text-ink-faint">
          <span className="font-mono text-ink-dim">{resultCount}</span> laptop{resultCount === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}