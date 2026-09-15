export default function SearchBox({ value, onChange, placeholder = 'Search…', className = '', countLabel }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 focus-within:border-accent-line focus-within:ring-2 focus-within:ring-accent-soft">
        <svg
          className="h-4 w-4 shrink-0 text-ink-faint"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      {countLabel != null && (
        <p className="mt-1.5 text-xs text-ink-faint">
          <span className="font-mono text-ink-dim">{countLabel}</span>
        </p>
      )}
    </div>
  );
}