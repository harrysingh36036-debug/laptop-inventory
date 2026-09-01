-- Allow admin to create n managers (unlimited); other roles capped at 10
-- Run in Supabase SQL Editor (idempotent)
CREATE OR REPLACE FUNCTION public.app_create_user(p_username text, p_password text, p_display_name text, p_role text, p_store_id bigint DEFAULT NULL, p_allowed_store_ids bigint[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.app_role();
  v_uid uuid := gen_random_uuid();
  v_email text;
  v_name text := lower(btrim(p_username));
BEGIN
  IF v_role NOT IN ('superadmin','admin') THEN RAISE EXCEPTION 'Only an admin or the super admin can create accounts'; END IF;
  IF p_role = 'superadmin' AND v_role <> 'superadmin' THEN RAISE EXCEPTION 'Only the super admin can create super admin accounts'; END IF;
  -- Managers have no limit; other roles capped at 10 total accounts
  IF COALESCE(p_role,'staff') <> 'manager' AND (SELECT count(*) FROM public.profiles) >= 10 THEN RAISE EXCEPTION 'Account limit reached: maximum 10 accounts (managers unlimited)'; END IF;
  IF v_name !~ '^[a-z0-9._-]{3,32}$' THEN RAISE EXCEPTION 'Username must be 3-32 chars: letters, numbers, . _ -'; END IF;
  IF COALESCE(p_password,'') = '' OR length(p_password) < 6 THEN RAISE EXCEPTION 'Password must be at least 6 characters'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_name) THEN RAISE EXCEPTION 'Username already taken'; END IF;
  IF p_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN RAISE EXCEPTION 'Invalid home store'; END IF;
  IF p_allowed_store_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_allowed_store_ids) sid LEFT JOIN public.stores s ON s.id = sid WHERE s.id IS NULL
  ) THEN RAISE EXCEPTION 'Invalid allowed store'; END IF;
  v_email := v_name || '@laptop.inventory';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, confirmation_token, recovery_token, email_change, confirmation_sent_at, recovery_sent_at, email_change_sent_at, created_at, updated_at)
  VALUES (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
          COALESCE(public.crypt(p_password, public.gen_salt('bf', 10)), extensions.crypt(p_password, extensions.gen_salt('bf', 10))), now(), '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb, false, false, '', '', '', now(), now(), now(), now(), now());
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_uid, v_email, jsonb_build_object('sub', v_uid::text, 'email', v_email), 'email', now(), now(), now());
  INSERT INTO public.profiles (id, username, display_name, role, home_store_id, allowed_store_ids)
  VALUES (v_uid, v_name, COALESCE(btrim(p_display_name), v_name), COALESCE(p_role,'staff'), NULLIF(p_store_id, 0), p_allowed_store_ids);
  UPDATE auth.users SET confirmation_token = '', recovery_token = '', email_change = '', phone_change = '', reauthentication_token = '', email_change_token_current = '', email_change_token_new = '' WHERE id = v_uid;
  RETURN jsonb_build_object('user', jsonb_build_object('id', v_uid, 'username', v_name, 'display_name', COALESCE(btrim(p_display_name), v_name), 'role', COALESCE(p_role,'staff'), 'home_store_id', NULLIF(p_store_id, 0), 'allowed_store_ids', p_allowed_store_ids, 'created_at', to_char(now(), 'YYYY-MM-DD HH24:MI:SS')));
END $$;
GRANT EXECUTE ON FUNCTION public.app_create_user(text, text, text, text, bigint, bigint[]) TO authenticated;
