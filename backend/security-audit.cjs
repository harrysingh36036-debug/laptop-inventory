const fs = require('fs');
const path = require('path');
const vars = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'ocivars.json'), 'utf8').replace(/^\uFEFF/, ''));
const newPass = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'newpass.json'), 'utf8'));
const BASE = vars.VITE_SUPABASE_URL;
const KEY = vars.VITE_SUPABASE_ANON_KEY;

const findings = [];

function report(sev, name, detail) {
  findings.push({ sev, name, detail });
  console.log(`${sev.toUpperCase().padEnd(6)} ${name}  ·  ${detail}`);
}

async function raw(method, url, headers, body) {
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

function rpcCall(token, fn, body) {
  return raw('POST', `${BASE}/rest/v1/rpc/${fn}`, {
    apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'
  }, body || {});
}

function tableRead(token, table, query) {
  return raw('GET', `${BASE}/rest/v1/${table}${query || '?select=*&limit=1'}`, {
    apikey: KEY, Authorization: `Bearer ${token}`
  });
}

async function login(user, pw) {
  const r = await raw('POST', `${BASE}/auth/v1/token?grant_type=password`, { apikey: KEY, 'Content-Type': 'application/json' }, { email: `${user}@laptop.inventory`, password: pw });
  return r.ok ? r.data.access_token : null;
}

(async () => {
  // ---- Attack surface 1: no credentials at all ------------------------------
  const a1 = await fetch(`${BASE}/rest/v1/laptops?select=id&limit=1`);
  report(a1.ok ? 'HIGH' : 'PASS', 'table read with NO credentials', `status ${a1.status}`);
  const a2 = await raw('GET', `${BASE}/rest/v1/laptops?select=id&limit=1`, { apikey: KEY });
  report(a2.ok ? 'HIGH' : 'PASS', 'table read with anon-key only', `status ${a2.status}`);
  const a3 = await raw('POST', `${BASE}/rest/v1/rpc/app_get_laptops`, { apikey: KEY, 'Content-Type': 'application/json' }, {});
  report(a3.ok ? 'HIGH' : 'PASS', 'RPC with anon-key only (no session)', `status ${a3.status} ${a3.data?.message || ''}`);

  // ---- Attack surface 2: least-privilege token (staff) ----------------------
  let lowTok = await login('aslamwdsdw', 'TestStaff123!');
  if (!lowTok && newPass.staff) lowTok = await login('aslamwdsdw', newPass.staff);
  const lowLabel = lowTok ? 'staff(aslamwdsdw)' : 'manager(aslam)';
  if (!lowTok) lowTok = await login('aslam', newPass.aslam);
  console.log('low-priv token:', lowLabel);

  const probes = [
    ['get users', 'app_get_users', {}],
    ['create user as admin', 'app_create_user', { p_username: 'hackadmin1', p_password: 'password123', p_display_name: 'H', p_role: 'admin' }],
    ['edit role_permissions settings', 'app_set_settings', { p_patch: { role_permissions: JSON.stringify({ staff: { editInventory: true } }) } }],
    ['edit app labels', 'app_set_settings', { p_patch: { appTitle: 'hacked' } }],
    ['add vendor', 'app_add_vendor', { p_name: 'HackVendor' }],
    ['add brand', 'app_add_brand', { p_name: 'HackBrand', p_serial_prefix: 'HB' }],
    ['add store', 'app_add_store', { p_store_name: 'HackStore' }],
    ['create laptop', 'app_create_laptop', { p_data: { brand: 'Hack', brand_model: 'X', serial_number: 'HACKSN' } }],
    ['reset someone password', 'app_update_user', { p_id: '00000000-0000-0000-0000-000000000001', p_username: null, p_password: 'hacked123', p_display_name: null, p_role: null }]
  ];
  for (const [label, fn, body] of probes) {
    const r = await rpcCall(lowTok, fn, body);
    report(r.ok ? 'HIGH' : 'PASS', `low-priv: ${label}`, `status ${r.status} ${r.data?.message || ''}`);
  }

  // ---- Attack surface 3: direct table reads with low-priv token (RLS) --------
  for (const t of ['loginlogs']) {
    const r = await tableRead(lowTok, t, '?select=*&limit=3');
    report(r.ok ? 'HIGH' : 'PASS', `low-priv direct read ${t}`, `status ${r.status} rows=${r.data?.length}`);
  }
  const prof = await tableRead(lowTok, 'profiles', '?select=username,role&limit=20');
  report(prof.ok ? 'MED' : 'PASS', 'low-priv enumerates all usernames via profiles', `status ${prof.status} ${(prof.data || []).map((p) => p.username).join(',')}`);

  // ---- Attack surface 4: user enumeration via auth endpoint ------------------
  for (const u of ['definitelynothere999', 'superadmin', 'aslam']) {
    const r = await raw('POST', `${BASE}/auth/v1/token?grant_type=password`, { apikey: KEY, 'Content-Type': 'application/json' }, { email: `${u}@laptop.inventory`, password: 'garbage-pw-1' });
    report('INFO', `auth enumeration probe ${u}`, `status ${r.status} ${String(r.data?.msg || r.data?.error_description || r.text).slice(0, 60)}`);
  }

  // ---- Attack surface 5: direct REST writes with superadmin token ------------
  const saTok = await login('superadmin', newPass.superadmin);
  const s1 = await raw('PATCH', `${BASE}/rest/v1/settings?key=appTitle`, { apikey: KEY, Authorization: `Bearer ${saTok}`, 'Content-Type': 'application/json' }, { value: 'HACKED_TITLE' });
  report(s1.ok ? 'INFO' : 'PASS', 'direct settings PATCH via REST (even superadmin lacks RLS write)', `status ${s1.status}`);
  const s2 = await raw('POST', `${BASE}/rest/v1/vendors`, { apikey: KEY, Authorization: `Bearer ${saTok}`, 'Content-Type': 'application/json' }, { name: 'DirectVendor' });
  report(s2.ok ? 'HIGH' : 'PASS', 'direct vendors INSERT bypassing RPC (RPC-only writes?)', `status ${s2.status} ${s2.data?.message || ''}`);

  const h = findings.filter((f) => f.sev === 'HIGH' || f.sev === 'MED').length;
  console.log(`\nHIGH+MED findings: ${h}`);
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });