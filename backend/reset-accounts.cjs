const fs = require('fs');
const path = require('path');
const vars = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'ocivars.json'), 'utf8').replace(/^\uFEFF/, ''));
const newPass = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'newpass.json'), 'utf8'));
const BASE = vars.VITE_SUPABASE_URL, KEY = vars.VITE_SUPABASE_ANON_KEY;
async function rpc(token, fn, body) {
  const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const t = await r.text(); let d = null; try { d = JSON.parse(t); } catch {}
  return { ok: r.ok, status: r.status, data: d, text: t };
}
async function login(u, p) {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${u}@laptop.inventory`, password: p }) });
  return r.ok ? (await r.json()).access_token : null;
}
(async () => {
  const sa = await login('superadmin', newPass.superadmin);
  if (!sa) throw new Error('superadmin login failed');
  const users = await rpc(sa, 'app_get_users', {});
  const list = Array.isArray(users.data) ? users.data : [];
  console.log('before:', list.map(u => `${u.username}(${u.role})`).join(', '));
  const victims = list.filter(u => u.username !== 'superadmin').map(u => u.id);
  if (victims.length) {
    const d = await rpc(sa, 'app_bulk_delete_users', { p_ids: victims });
    console.log('bulk delete:', d.status, JSON.stringify(d.data || d.text || '').slice(0, 100));
  } else console.log('nothing to delete');
  const after = await rpc(sa, 'app_get_users', {});
  console.log('after :', (after.data || []).map(u => `${u.username}(${u.role})`).join(', '));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });