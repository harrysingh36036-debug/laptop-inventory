const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require(path.resolve(__dirname, '..', 'backend', 'node_modules', 'pg'));

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}
const vars = readJson(process.env.OCIVARS || path.join(process.env.TEMP, 'ocivars.json'));
const passFile = process.env.NEWPASS || path.join(process.env.TEMP, 'newpass.json');

function genPw() {
  return crypto.randomBytes(15).toString('base64url').replace(/[-_]/g, 'x').slice(0, 20);
}

async function queryLabeled(client, label, sql, params) {
  try {
    await client.query(sql, params);
    console.log('ok', label);
  } catch (e) {
    console.error('FAIL', label, '->', e.message);
    throw new Error(label + ': ' + e.message);
  }
}

async function upsertAuthUser(client, { uid, email, displayName, role, password }) {
  const hash = await client.query('SELECT extensions.crypt($1, extensions.gen_salt(\'bf\', 10)) AS hash', [password]);
  const h = hash.rows[0].hash;
  const existing = await client.query('SELECT id::text AS id FROM auth.users WHERE email = $1::text', [email]);
  if (existing.rowCount > 0) {
    const eid = existing.rows[0].id;
    await queryLabeled(client, 'users-update', `UPDATE auth.users SET encrypted_password = $1::text, updated_at = now() WHERE id = $2::uuid`, [h, eid]);
    await queryLabeled(client, 'profiles-update', `UPDATE public.profiles SET display_name = $1::text, role = $2::text WHERE id = $3::uuid`, [displayName, role, eid]);
    return;
  }
  await queryLabeled(client, 'users', `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
    SELECT $1::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated'::text, 'authenticated'::text, $2::text, $3::text, now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false, now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = $2::text)`, [uid, email, h]);
  await queryLabeled(client, 'identities', `INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    SELECT gen_random_uuid(), $1::uuid, $2::text, jsonb_build_object('sub'::text, $1::text, 'email'::text, $2::text), 'email'::text, now(), now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = $1::uuid AND provider = 'email')`, [uid, email]);
  await queryLabeled(client, 'profiles', `INSERT INTO public.profiles (id, username, display_name, role, created_at)
    SELECT $1::uuid, $2::text, $3::text, $4::text, now()
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = $1::uuid)`,
    [uid, email.split('@')[0], displayName, role]);
}

(async () => {
  const c = new Client({ connectionString: vars.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const orphan = await c.query('DELETE FROM auth.users WHERE id NOT IN (SELECT id FROM public.profiles)');
  console.log('orphan auth users removed:', orphan.rowCount);

  const newPass = readJson(passFile);
  const adminPw = genPw();
  const aslamPw = genPw();

  await upsertAuthUser(c, {
    uid: crypto.randomUUID(),
    email: 'admin@laptop.inventory',
    displayName: 'System Administrator',
    role: 'admin',
    password: adminPw
  });
  await upsertAuthUser(c, {
    uid: crypto.randomUUID(),
    email: 'aslam@laptop.inventory',
    displayName: 'Aslam',
    role: 'manager',
    password: aslamPw
  });

  newPass.admin = adminPw;
  newPass.aslam = aslamPw;
  fs.writeFileSync(passFile, JSON.stringify(newPass, null, 2));

  await c.query(`UPDATE auth.users SET confirmation_token = COALESCE(NULLIF(confirmation_token,''),''),
      recovery_token = COALESCE(NULLIF(recovery_token,''),''),
      email_change_token_current = COALESCE(NULLIF(email_change_token_current,''),''),
      email_change_token_new = COALESCE(NULLIF(email_change_token_new,''),''),
      email_change = COALESCE(NULLIF(email_change,''),''),
      phone_change = COALESCE(NULLIF(phone_change,''),''),
      reauthentication_token = COALESCE(NULLIF(reauthentication_token,''),''),
      confirmation_sent_at = COALESCE(confirmation_sent_at, now()),
      recovery_sent_at = COALESCE(recovery_sent_at, now()),
      email_change_sent_at = COALESCE(email_change_sent_at, now())`);
  console.log('gotrue token columns normalized');

  const r = await c.query('SELECT username, role FROM public.profiles ORDER BY username');
  console.log('profiles now:', r.rows.map((x) => `${x.username}@${x.role}`).join(', '));
  console.log('new passwords saved to', passFile);
  await c.end();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });