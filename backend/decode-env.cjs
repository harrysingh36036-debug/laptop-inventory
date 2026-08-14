const fs = require('fs');
const p = 'C:/Users/Admin/Documents/Default Project/laptop-inventory/frontend/.env';
const t = fs.readFileSync(p, 'utf8');
const url = (t.match(/VITE_SUPABASE_URL=(.*)/) || [])[1];
const key = ((t.match(/VITE_SUPABASE_ANON_KEY=(\S+)/) || [])[1] || '').trim();
console.log('url:  ', url);
if (key && key.split('.').length === 3) {
  const d = Buffer.from(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  console.log('anon payload:', d);
} else {
  console.log('anon key missing or malformed; raw:', key.slice(0, 20));
}