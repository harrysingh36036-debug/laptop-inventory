import { useLabels } from '../labels.jsx';

export default function Toolbar({ search, setSearch, resultCount, sortBy, setSortBy, sortOrder, setSortOrder }) {
  const t = useLabels();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 max-w-md flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-blue-200 focus-within:ring-2 focus-within:ring-blue-50">
        <svg
          className="h-4 w-4 shrink-0 text-gray-500"
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
          className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Sort:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 focus:border-blue-600 focus:outline-none"
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
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 !px-2 !py-1.5 text-xs"
            title={`Sort ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        <span className="text-xs text-gray-500">
          <span className="font-mono text-gray-600">{resultCount}</span> laptop{resultCount === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}