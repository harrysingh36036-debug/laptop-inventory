/**
 * import-sqlite.cjs
 * One-time data import: old SQLite inventory.db -> Supabase (postgres).
 * Preserves the bcrypt hashes of legacy users so their existing passwords work.
 */
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const DB_PATH = process.env.SQLITE_PATH || 'inventory.db';
const PG_URL = (process.env.DATABASE_URL || '').trim();

const db = new DatabaseSync(DB_PATH);
const client = new Client({ connectionString: PG_URL });

function ts(v) { return v ? String(v).replace(' ', 'T') + '+00' : null; }

async function main() {
  await client.connect();

  // --- settings (upsert 27) ---
  const settings = db.prepare('SELECT key, value FROM Settings').all();
  for (const s of settings) {
    await client.query(
      `INSERT INTO public.settings (key, value) VALUES ($1,$2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [s.key, s.value]);
  }
  console.log(`settings: ${settings.length} upserted`);

  // --- derives + insert laptops with explicit ids ---
  const laptops = db.prepare('SELECT * FROM Laptops').all();
  for (const l of laptops) {
    const parts = String(l.brand_model || '').trim().split(/\s+/);
    const brand = parts[0] || '';
    const brand_model = parts.slice(1).join(' ') || l.brand_model;
    await client.query(
      `INSERT INTO public.laptops (id, brand, brand_model, serial_number, current_store_id, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET brand=EXCLUDED.brand, brand_model=EXCLUDED.brand_model,
         serial_number=EXCLUDED.serial_number, current_store_id=EXCLUDED.current_store_id,
         status=EXCLUDED.status, updated_at=EXCLUDED.updated_at`,
      [l.id, brand, String(l.brand_model || ''), l.serial_number, l.current_store_id, l.status, ts(l.updated_at) || new Date().toISOString(), ts(l.updated_at) || new Date().toISOString()]);
  }
  console.log(`laptops] ${laptops.length} upserted`);

  // fix id sequence
  await client.query(`SELECT setval(pg_get_serial_sequence('public.laptops','id'), (SELECT COALESCE(MAX(id),0) FROM public.laptops))`);

  // --- transfer logs (only for existing laptops) ---
  const logs = db.prepare('SELECT * FROM TransferLogs').all();
  for (const log of logs) {
    const has = await client.query('SELECT 1 FROM public.laptops WHERE id=$1', [log.laptop_id]);
    if (!has.rows.length) { console.log(`transferlog] skip laptop ${log.laptop_id} (missing)`); continue; }
    await client.query(
      `INSERT INTO public.transferlogs (id, laptop_id, from_store_id, to_store_id, changed_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [log.id, log.laptop_id, log.from_store_id, log.to_store_id, ts(log.changed_at)]);
  }
  console.log(`transferlogs] ${logs.length} attempted`);
  await client.query(`SELECT setval(pg_get_serial_sequence('public.transferlogs','id'), (SELECT COALESCE(MAX(id),0) FROM public.transferlogs))`);

  // --- users: recreate legacy users in auth + profiles (keep bcrypt hash) ---
  const users = db.prepare('SELECT * FROM Users').all();
  const existing = (await client.query('SELECT username FROM public.profiles')).rows.map(r => r.username);
  let added = 0;
for (const u of users) {
    if (existing.includes(u.username)) { console.log(`user] ${u.username} already present`); continue; }
    const email = `${u.username}@laptop.inventory`;
    const found = await client.query('SELECT id FROM auth.users WHERE email=$1', [email]);
    let uid = found.rows[0]?.id;
    if (!uid) {
      uid = randomUUID();
      await client.query(
        `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
         VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,$3,now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,false,false,now(),now())`,
        [uid, email, u.password_hash]);
      console.log(`user] created auth for ${u.username}`);
    } else {
      await client.query('UPDATE auth.users SET encrypted_password=$2, email_confirmed_at=COALESCE(email_confirmed_at, now()) WHERE id=$1', [uid, u.password_hash]);
      console.log(`user] ${u.username} existed; password hash restored`);
    }
    const ident = await client.query('SELECT 1 FROM auth.identities WHERE user_id=$1 AND provider=$2', [uid, 'email']);
    if (!ident.rows.length) {
      await client.query(
        `INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
         VALUES (gen_random_uuid(),$1::uuid,$2::text,jsonb_build_object('sub', $1::text, 'email', $2::text),'email',now(),now(),now())`,
        [uid, email]);
    }
    await client.query(
      `INSERT INTO public.profiles (id, username, display_name, role)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (username) DO NOTHING`,
      [uid, u.username, u.display_name, u.role]);
    added++;
    console.log(`user] added ${u.username} (${u.role}, hash preserved)`);
  }
  console.log(`users] added ${added}, existing ${existing.join(',')}`);

  await client.end();
  console.log('import done');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  client.end().finally(() => process.exit(1));
});
