const fs = require('fs');
const path = require('path');
const vars = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'ocivars.json'), 'utf8').replace(/^\uFEFF/, ''));
const newPass = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'newpass.json'), 'utf8'));
const BASE = vars.VITE_SUPABASE_URL;
const KEY = vars.VITE_SUPABASE_ANON_KEY;

async function raw(method, url, headers, body) {
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, data, text: text.slice(0, 300) };
}

async function login(user, pw) {
  const r = await raw('POST', `${BASE}/auth/v1/token?grant_type=password`, { apikey: KEY, 'Content-Type': 'application/json' }, { email: `${user}@laptop.inventory`, password: pw });
  return r.ok ? r.data.access_token : null;
}

(async () => {
  // 1. anon-key only — what do reads actually return?
  const tbl = await raw('GET', `${BASE}/rest/v1/laptops?select=id,brand&limit=2`, { apikey: KEY });
  console.log('anon table read  :', tbl.status, tbl.ok ? JSON.stringify(tbl.data) : tbl.text);

  const rpcL = await raw('POST', `${BASE}/rest/v1/rpc/app_get_laptops`, { apikey: KEY, 'Content-Type': 'application/json' }, {});
  console.log('anon rpc laptops :', rpcL.status, JSON.stringify(rpcL.data).slice(0, 200));

  const rpcU = await raw('POST', `${BASE}/rest/v1/rpc/app_get_users`, { apikey: KEY, 'Content-Type': 'application/json' }, {});
  console.log('anon rpc users   :', rpcU.status, JSON.stringify(rpcU.data).slice(0, 120));

  const rpcS = await raw('POST', `${BASE}/rest/v1/rpc/app_get_settings`, { apikey: KEY, 'Content-Type': 'application/json' }, {});
  console.log('anon rpc settings:', rpcS.status, JSON.stringify(rpcS.data).slice(0, 120));

  // 2. create a real staff account, use ITS token
  const sa = await login('superadmin', newPass.superadmin);
  const mk = await raw('POST', `${BASE}/rest/v1/rpc/app_create_user`, { apikey: KEY, Authorization: `Bearer ${sa}`, 'Content-Type': 'application/json' }, { p_username: 'auditstaff1', p_password: 'AuditPw!12345', p_display_name: 'Audit Staff', p_role: 'staff' });
  console.log('create staff     :', mk.status, mk.data?.user?.username || mk.text);

  const staffTok = await login('auditstaff1', 'AuditPw!12345');
  console.log('staff login token len:', staffTok ? staffTok.length : 0, staffTok?.split('.').length);

  const inv = await raw('POST', `${BASE}/rest/v1/rpc/app_sell_laptop`, { apikey: KEY, Authorization: `Bearer ${staffTok}`, 'Content-Type': 'application/json' }, { p_laptop_id: 1, p_sale_price: 1, p_sold_by: 'audit.staff1' });
  console.log('staff->sell laptop (perm?) :', inv.status, (inv.data?.message || inv.text).slice(0, 80));

  const addV = await raw('POST', `${BASE}/rest/v1/rpc/app_add_vendor`, { apikey: KEY, Authorization: `Bearer ${staffTok}`, 'Content-Type': 'application/json' }, { p_name: 'AuditVendorV2' });
  console.log('staff->add vendor          :', addV.status, (addV.data?.message || addV.text).slice(0, 80));

  const lgs = await raw('GET', `${BASE}/rest/v1/loginlogs?select=*&limit=3&order=id.desc`, { apikey: KEY, Authorization: `Bearer ${staffTok}` });
  console.log('staff direct loginlogs read:', lgs.status, JSON.stringify(lgs.data).slice(0, 150));

  const prof = await raw('GET', `${BASE}/rest/v1/profiles?select=username,role&limit=20`, { apikey: KEY, Authorization: `Bearer ${staffTok}` });
  console.log('staff direct profiles read :', prof.status, JSON.stringify(prof.data).slice(0, 150));

  const setw = await raw('PATCH', `${BASE}/rest/v1/settings?key=appTitle`, { apikey: KEY, Authorization: `Bearer ${staffTok}`, 'Content-Type': 'application/json' }, { value: 'x' });
  console.log('staff direct settings PATCH:', setw.status, setw.text);

  // cleanup audit user
  const users = await raw('POST', `${BASE}/rest/v1/rpc/app_get_users`, { apikey: KEY, Authorization: `Bearer ${sa}`, 'Content-Type': 'application/json' }, {});
  const au = (users.data || []).find((u) => u.username === 'auditstaff1'
    || u.username === 'audit.staff1');
  if (au) {
    const del = await raw('POST', `${BASE}/rest/v1/rpc/app_delete_user`, { apikey: KEY, Authorization: `Bearer ${sa}`, 'Content-Type': 'application/json' }, { p_id: au.id });
    console.log('cleanup audit user          :', del.status);
  }
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });