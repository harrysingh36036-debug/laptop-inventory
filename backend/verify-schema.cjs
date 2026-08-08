const fs = require('fs');
const path = require('path');
const { Client } = require(path.resolve(__dirname, '..', 'backend', 'node_modules', 'pg'));

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}
const vars = readJson(process.env.OCIVARS || path.join(process.env.TEMP, 'ocivars.json'));

(async () => {
  const c = new Client({ connectionString: vars.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='laptops' AND column_name='storage_size'");
  console.log('laptops.storage_size column present:', r.rowCount === 1);
  const v = await c.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('app_add_vendor','app_update_vendor','app_delete_vendor','app_bulk_delete_vendors','app_perm_exact')");
  console.log('vendor/perm functions:', v.rows[0].n, '/5');
  const t = await c.query("SELECT to_regclass('public.vendors') AS t");
  console.log('vendors table:', t.rows[0].t);
  const u = await c.query("SELECT count(*)::int AS n FROM public.profiles");
  console.log('current accounts:', u.rows[0].n, '(max 8)');
  const s = await c.query("SELECT key FROM public.settings WHERE key = 'role_permissions'");
  console.log('role_permissions key exists:', s.rowCount === 1);
  await c.end();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });