export const inr = (n) => {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN')}`;
};

export function formatTime(iso) {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString();
}