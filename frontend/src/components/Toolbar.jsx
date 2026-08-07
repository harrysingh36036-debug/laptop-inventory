import { useLabels } from '../labels.jsx';

export default function Toolbar({ search, setSearch, resultCount }) {
  const t = useLabels();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative flex-1 max-w-md">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
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
          className="field pl-9"
        />
      </div>
      <p className="text-sm text-ink-faint">
        <span className="font-mono text-ink-dim">{resultCount}</span> laptop{resultCount === 1 ? '' : 's'} shown
      </p>
    </div>
  );
}