const { Client } = require('pg');
const ref = 'ppdaqzjcttpdxgathged';
const host = 'aws-0-ap-southeast-1.pooler.supabase.com';
const dbPassword = process.env.DB_PASSWORD || 'PLACEHOLDER_PASSWORD';
const variants = [
  ['postgres.<ref>', `postgresql://postgres.${ref}:${encodeURIComponent(dbPassword)}@${host}:6543/postgres`],
  ['postgres (no ref)', `postgresql://postgres:${encodeURIComponent(dbPassword)}@${host}:6543/postgres`]
];
(async () => {
  for (const [label, cs] of variants) {
    const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
    try { await c.connect(); const r = await c.query('select current_user'); console.log('OK', label, JSON.stringify(r.rows[0])); await c.end(); process.exit(0); }
    catch (e) { console.log('FAIL', label, '::', e.message.slice(0, 140)); try { await c.end(); } catch {} }
  }
  process.exit(1);
})();