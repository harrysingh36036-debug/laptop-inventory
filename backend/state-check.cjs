const fs = require('fs');
const path = require('path');
const { Client } = require(path.resolve(__dirname, '..', 'backend', 'node_modules', 'pg'));
const vars = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'ocivars.json'), 'utf8').replace(/^\uFEFF/, ''));
(async () => {
  const c = new Client({ connectionString: vars.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query('SELECT username, role FROM public.profiles ORDER BY username');
  console.log(r.rows.map((x) => `${x.username}@${x.role}`).join(', '));
  const code = await c.query('SELECT count(*)::int AS n FROM public.vendors');
  console.log('vendors rows:', code.rows[0].n);
  await c.end();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });