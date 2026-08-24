-- ============================================================================
-- Super Admin: create / reset the superadmin account so you can log in
--   Idempotent — safe to re-run any time. It:
--     1. finds (or creates) the auth user with email 'superadmin@laptop.inventory',
--     2. resets its password to app.superadmin_password,
--     3. marks the email confirmed,
--     4. makes sure the email identity row exists,
--     5. upserts the public.profiles row with role 'superadmin'.
--
--   The password is read from a runtime variable so it is NEVER stored in the
--   repo. Run this in the Supabase SQL Editor in two steps:
--
--     SET app.superadmin_password = 'YourStrongPassw0rd!';
--     (then run the whole DO block below, or just the rest of the file)
--
--   Username shown in the app: superadmin  (display: Super Administrator)
--   The super admin is excluded from the login dropdown on purpose
--   (see supabase-login-username-list.sql).
-- ============================================================================

DO $$
DECLARE
  v_pass  text := current_setting('app.superadmin_password', true);
  v_email text := 'superadmin@laptop.inventory';
  v_id    uuid;
  v_cur_role text;
BEGIN
  IF v_pass IS NULL OR length(v_pass) < 6 THEN
    RAISE EXCEPTION 'Set a password first:  SET app.superadmin_password = ''YourStrongPassw0rd!'';';
  END IF;

  -- 1) Find or create the auth user.
  SELECT id INTO v_id FROM auth.users WHERE email = v_email;
  IF v_id IS NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            is_sso_user, is_anonymous, created_at, updated_at)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
            public.crypt(v_pass, public.gen_salt('bf', 10)), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false, now(), now())
    RETURNING id INTO v_id;
  END IF;

  -- 2) Reset password + confirm email so the account can sign in immediately.
  UPDATE auth.users
     SET encrypted_password = public.crypt(v_pass, public.gen_salt('bf', 10)),
         email_confirmed_at = COALESCE(email_confirmed_at, now())
   WHERE id = v_id;

  -- 3) Ensure the email identity row exists (GoTrue signs in via identities).
  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_id AND provider = 'email') THEN
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_id, v_email, jsonb_build_object('sub', v_id::text, 'email', v_email), 'email', now(), now(), now());
  END IF;

  -- 4) Upsert the profile as super admin.
  SELECT role INTO v_cur_role FROM public.profiles WHERE id = v_id;
  IF v_cur_role IS NULL THEN
    INSERT INTO public.profiles (id, username, display_name, role)
    VALUES (v_id, 'superadmin', 'Super Administrator', 'superadmin');
  ELSE
    UPDATE public.profiles
       SET username = 'superadmin',
           display_name = 'Super Administrator',
           role = 'superadmin'
     WHERE id = v_id;
  END IF;

  RAISE NOTICE 'Super admin ready. Email: %  Username: superadmin', v_email;
END $$;