-- ============================================================================
-- Fix: pgcrypto lives in the public schema on this project, so the account
-- creation used extensions.crypt/extensions.gen_salt which do NOT exist here.
-- Replace with public.crypt / public.gen_salt in app_create_user and the
-- password-resetting app_update_user. Idempotent: safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_create_user(p_username text, p_password text, p_display_name text, p_role text, p_store_id bigint DEFAULT NULL, p_allowed_store_ids bigint[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth
AS $$
DECLARE
  v_role text := public.app_role();
  v_uid uuid := gen_random_uuid();
  v_email text;
  v_name text := lower(btrim(p_username));
BEGIN
  IF v_role NOT IN ('superadmin','admin') THEN RAISE EXCEPTION 'Only an admin or the super admin can create accounts'; END IF;
  IF p_role = 'superadmin' AND v_role <> 'superadmin' THEN RAISE EXCEPTION 'Only the super admin can create super admin accounts'; END IF;
  -- Role caps: 5 admin, 10 manager, 10 staff — upgrade required beyond
  IF COALESCE(p_role,'staff') = 'admin' AND (SELECT count(*) FROM public.profiles WHERE role='admin') >= 5 THEN RAISE EXCEPTION 'Admin limit reached: maximum 5 admins — upgrade required'; END IF;
  IF COALESCE(p_role,'staff') = 'manager' AND (SELECT count(*) FROM public.profiles WHERE role='manager') >= 10 THEN RAISE EXCEPTION 'Manager limit reached: maximum 10 managers — upgrade required'; END IF;
  IF COALESCE(p_role,'staff') = 'staff' AND (SELECT count(*) FROM public.profiles WHERE role='staff') >= 10 THEN RAISE EXCEPTION 'Staff limit reached: maximum 10 staff — upgrade required'; END IF;
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
          extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb, false, false, '', '', '', now(), now(), now(), now(), now());
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_uid, v_email, jsonb_build_object('sub', v_uid::text, 'email', v_email), 'email', now(), now(), now());
  INSERT INTO public.profiles (id, username, display_name, role, home_store_id, allowed_store_ids)
  VALUES (v_uid, v_name, COALESCE(btrim(p_display_name), v_name), COALESCE(p_role,'staff'), NULLIF(p_store_id, 0), p_allowed_store_ids);
  UPDATE auth.users SET
    confirmation_token = '',
    recovery_token = '',
    email_change = '',
    phone_change = '',
    reauthentication_token = '',
    email_change_token_current = '',
    email_change_token_new = ''
  WHERE id = v_uid;
  RETURN jsonb_build_object('user', jsonb_build_object(
    'id', v_uid, 'username', v_name, 'display_name', COALESCE(btrim(p_display_name), v_name),
    'role', COALESCE(p_role,'staff'), 'home_store_id', NULLIF(p_store_id, 0),
    'allowed_store_ids', p_allowed_store_ids, 'created_at', to_char(now(), 'YYYY-MM-DD HH24:MI:SS')));
END $$;

CREATE OR REPLACE FUNCTION public.app_update_user(p_id uuid, p_username text, p_password text, p_display_name text, p_role text, p_store_id bigint DEFAULT NULL, p_allowed_store_ids bigint[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth
AS $$
DECLARE
  v_role text := public.app_role();
  v_cur public.profiles%ROWTYPE;
  v_name text;
  v_email text;
BEGIN
  SELECT * INTO v_cur FROM public.profiles WHERE id = p_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  IF v_role = 'superadmin' THEN
    NULL; -- full control over every account
   ELSIF v_role = 'admin' THEN
     IF v_cur.role = 'superadmin' THEN RAISE EXCEPTION 'You cannot modify the super admin account'; END IF;
     IF v_cur.role NOT IN ('manager','staff','admin') THEN RAISE EXCEPTION 'Admins can only manage manager, admin and staff accounts'; END IF;
     IF p_role = 'superadmin' THEN RAISE EXCEPTION 'Only the super admin can assign super admin'; END IF;
  ELSIF v_role = 'manager' THEN
    IF NOT public.app_perm('createStaff') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
    IF v_cur.role IN ('admin','superadmin') THEN RAISE EXCEPTION 'Admin accounts are hidden from managers'; END IF;
    IF p_role IN ('admin','superadmin') THEN RAISE EXCEPTION 'Managers cannot assign the admin or super admin role'; END IF;
    IF p_password IS NOT NULL AND btrim(p_password) <> '' THEN
      RAISE EXCEPTION 'Only the super admin or an admin can reset passwords';
    END IF;
  ELSE
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF p_username IS NOT NULL AND btrim(p_username) <> '' THEN
    v_name := lower(btrim(p_username));
    IF v_name !~ '^[a-z0-9._-]{3,32}$' THEN RAISE EXCEPTION 'Invalid username'; END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_name AND id <> p_id) THEN RAISE EXCEPTION 'Username already taken'; END IF;
    v_email := v_name || '@laptop.inventory';
    UPDATE auth.users SET email = v_email, updated_at = now() WHERE id = p_id;
    UPDATE auth.identities SET provider_id = v_email, identity_data = jsonb_build_object('sub', p_id::text, 'email', v_email)
      WHERE user_id = p_id AND provider = 'email';
    UPDATE public.profiles SET username = v_name WHERE id = p_id;
  END IF;
  IF p_password IS NOT NULL AND btrim(p_password) <> '' THEN
    IF length(p_password) < 6 THEN RAISE EXCEPTION 'Password must be at least 6 characters'; END IF;
    UPDATE auth.users SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), updated_at = now() WHERE id = p_id;
  END IF;
  IF p_display_name IS NOT NULL THEN
    UPDATE public.profiles SET display_name = COALESCE(btrim(p_display_name), v_cur.username) WHERE id = p_id;
  END IF;
  IF p_role IS NOT NULL AND p_role <> '' THEN
    IF p_role NOT IN ('superadmin','admin','manager','staff') THEN RAISE EXCEPTION 'Invalid role'; END IF;
    IF p_role = 'superadmin' AND v_role <> 'superadmin' THEN RAISE EXCEPTION 'Only the super admin can assign super admin'; END IF;
    UPDATE public.profiles SET role = p_role WHERE id = p_id;
  END IF;
  IF p_store_id IS NOT NULL THEN
    IF p_store_id = 0 THEN
      UPDATE public.profiles SET home_store_id = NULL WHERE id = p_id;
    ELSIF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
      RAISE EXCEPTION 'Invalid home store';
    ELSE
      UPDATE public.profiles SET home_store_id = p_store_id WHERE id = p_id;
    END IF;
  END IF;
  IF p_allowed_store_ids IS NOT NULL THEN
    IF cardinality(p_allowed_store_ids) = 0 THEN
      UPDATE public.profiles SET allowed_store_ids = NULL WHERE id = p_id;
    ELSIF EXISTS (
      SELECT 1 FROM unnest(p_allowed_store_ids) sid LEFT JOIN public.stores s ON s.id = sid WHERE s.id IS NULL
    ) THEN
      RAISE EXCEPTION 'Invalid allowed store';
    ELSE
      UPDATE public.profiles SET allowed_store_ids = p_allowed_store_ids WHERE id = p_id;
    END IF;
  END IF;
  SELECT * INTO v_cur FROM public.profiles WHERE id = p_id;
  RETURN jsonb_build_object('user', jsonb_build_object(
    'id', v_cur.id, 'username', v_cur.username, 'display_name', v_cur.display_name,
    'role', v_cur.role, 'home_store_id', v_cur.home_store_id,
    'allowed_store_ids', v_cur.allowed_store_ids, 'created_at', to_char(v_cur.created_at, 'YYYY-MM-DD HH24:MI:SS')));
END $$;