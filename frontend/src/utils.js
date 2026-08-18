export const inr = (n) => {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN')}`;
};

export function formatTime(v) {
  if (!v) return '—';
  let s = String(v).trim();
  if (s.includes(' ')) s = s.replace(' ', 'T');
  if (s.endsWith('+00')) s = s.slice(0, -3) + 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
}

const AADHAR_SALT = 'laptop-inventory::aadhar::v1';

export async function hashAadhar(raw) {
  const data = new TextEncoder().encode(AADHAR_SALT + ':' + String(raw).trim());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}