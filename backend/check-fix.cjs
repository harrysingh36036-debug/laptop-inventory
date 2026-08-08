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
  if (!r.ok) return null;
  const j = await r.json(); return j.access_token;
}
(async () => {
  const sa = await login('superadmin', newPass.superadmin);
  if (!sa) throw new Error('superadmin login failed');
  console.log('1. superadmin login           : OK');

  const mk = await rpc(sa, 'app_create_user', { p_username: 'end2end1', p_password: 'End2End!123', p_display_name: 'E2E', p_role: 'staff' });
  console.log('2. create via RPC             :', mk.status, mk.ok ? 'OK' : (mk.data?.message || mk.text).slice(0, 70));
  if (!mk.ok) throw new Error('create failed');

  const tok = await login('end2end1', 'End2End!123');
  console.log('3. created user can login     :', tok ? `OK (token len ${tok.length})` : 'FAIL');

  const get = await rpc(tok, 'app_get_laptops', {});
  console.log('4. created user can use RPC   :', get.status, Array.isArray(get.data) ? `OK ${get.data.length} rows` : (get.data?.message || get.text).slice(0, 60));

  const inv = await rpc(tok, 'app_add_vendor', { p_name: 'E2EVendor' });
  console.log('5. staff CANNOT add vendor    :', inv.status === 400 ? 'blocked OK' : `UNEXPECTED ${inv.status} ${(inv.data?.message || inv.text).slice(0, 50)}`);

  const users = await rpc(sa, 'app_get_users', {});
  const target = (users.data || []).find(u => u.username === 'end2end1');
  const del = await rpc(sa, 'app_delete_user', { p_id: target.id });
  console.log('6. cleanup                    :', del.status);
  const after = await rpc(sa, 'app_get_users', {});
  console.log('7. final accounts             :', (after.data || []).map(u => `${u.username}(${u.role})`).join(', '));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });