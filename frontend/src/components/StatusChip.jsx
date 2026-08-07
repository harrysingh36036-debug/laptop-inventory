// Status styles for the warm-dark surface. Saturated color is reserved for
// status semantics only — matching the Stockroom token rules.
const STATUS_MAP = {
  'In Stock': { color: 'text-stock-ok', dot: 'bg-stock-ok', label: 'In Stock' },
  'In Transit': { color: 'text-stock-transit', dot: 'bg-stock-transit', label: 'In Transit' },
  Sold: { color: 'text-stock-sold', dot: 'bg-stock-sold', label: 'Sold' }
};

export default function StatusChip({ status }) {
  const s = STATUS_MAP[status] || {
    color: 'text-stock-sold',
    dot: 'bg-stock-sold',
    label: status || '—'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}