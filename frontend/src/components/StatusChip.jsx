// Status styles for the warm-dark surface. Saturated color is reserved for
// status semantics only — matching the Stockroom token rules.
const STATUS_MAP = {
  'In Stock': { color: 'text-green-600', dot: 'bg-green-600', label: 'In Stock' },
  'In Transit': { color: 'text-amber-600', dot: 'bg-amber-600', label: 'In Transit' },
  Sold: { color: 'text-gray-500', dot: 'bg-gray-400', label: 'Sold' }
};

export default function StatusChip({ status }) {
  const s = STATUS_MAP[status] || {
    color: 'text-gray-500',
    dot: 'bg-gray-400',
    label: status || '—'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}