export const STATUS_STYLES = {
  'In Stock': 'bg-emerald-100 text-emerald-700 ring-emerald-600/20',
  'In Transit': 'bg-amber-100 text-amber-700 ring-amber-600/20',
  Sold: 'bg-slate-100 text-slate-600 ring-slate-500/20'
};

export function formatTime(iso) {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString();
}