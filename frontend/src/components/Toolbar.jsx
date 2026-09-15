import { useLabels } from '../labels.jsx';

export default function Toolbar({ search, setSearch, resultCount }) {
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
      <p className="text-sm text-ink-faint">
        <span className="font-mono text-ink-dim">{resultCount}</span> laptop{resultCount === 1 ? '' : 's'} shown
      </p>
    </div>
  );
}