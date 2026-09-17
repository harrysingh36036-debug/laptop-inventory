export default function SearchBox({ value, onChange, placeholder = 'Search…', className = '', countLabel }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-blue-200 focus-within:ring-2 focus-within:ring-blue-50">
        <svg
          className="h-4 w-4 shrink-0 text-gray-500"
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
          className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500"
        />
      </div>
      {countLabel != null && (
        <p className="mt-1.5 text-xs text-gray-500">
          <span className="font-mono text-gray-600">{countLabel}</span>
        </p>
      )}
    </div>
  );
}