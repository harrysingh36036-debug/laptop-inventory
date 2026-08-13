export default function SearchBox({ value, onChange, placeholder = 'Search…', className = '', countLabel }) {
  return (
    <div className={`relative ${className}`}>
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
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
        className="field pl-9"
      />
      {countLabel != null && (
        <p className="mt-1.5 text-xs text-ink-faint">
          <span className="font-mono text-ink-dim">{countLabel}</span>
        </p>
      )}
    </div>
  );
}