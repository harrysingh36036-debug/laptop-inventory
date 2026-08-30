export const IST_TZ = 'Asia/Kolkata';

export const inr = (n) => {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN')}`;
};

// IST: whole app must show dates/times in Asia/Kolkata.
export function getIstToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: IST_TZ });
}
export function formatIstDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? String(dateStr) : d.toLocaleDateString('en-IN', { timeZone: IST_TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function formatIstDay(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { timeZone: IST_TZ, weekday: 'long' });
}
export function formatIstDateTime(v) {
  if (!v) return '—';
  let s = String(v).trim();
  if (s.includes(' ')) s = s.replace(' ', 'T');
  if (s.endsWith('+00')) s = s.slice(0, -3) + 'Z';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('en-IN', { timeZone: IST_TZ, dateStyle: 'medium', timeStyle: 'short' });
}
export function formatIstNow() {
  return new Date().toLocaleString('en-IN', { timeZone: IST_TZ, dateStyle: 'medium', timeStyle: 'medium' });
}

export function formatTime(v) {
  if (!v) return '—';
  let s = String(v).trim();
  if (s.includes(' ')) s = s.replace(' ', 'T');
  if (s.endsWith('+00')) s = s.slice(0, -3) + 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('en-IN', { timeZone: IST_TZ, dateStyle: 'medium', timeStyle: 'short' });
}

const AADHAR_SALT = 'laptop-inventory::aadhar::v1';

export async function hashAadhar(raw) {
  const data = new TextEncoder().encode(AADHAR_SALT + ':' + String(raw).trim());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}