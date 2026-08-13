-- ============================================================================
-- Delta: Login History (home store per account + login store logging + audit)
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Each account gets a home store (source of truth for red flags)
ALTER TABLE public.profiles   ADD COLUMN IF NOT EXISTS home_store_id bigint REFERENCES public.stores (id);
ALTER TABLE public.loginlogs  ADD COLUMN IF NOT EXISTS store_id      bigint REFERENCES public.stores (id);

-- 2. Anyone at the login screen can read store names (store picker pre-auth)
DROP POLICY IF EXISTS "stores_read_anon" ON public.stores;
CREATE POLICY "stores_read_anon" ON public.stores FOR SELECT TO anon USING (true);
GRANT SELECT ON public.stores TO anon;

-- 3. Account create/update carry the home store
CREATE OR REPLACE FUNCTION public.app_create_user(p_username text, p_password text, p_display_name text, p_role text, p_store_id bigint DEFAULT NULL)
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
  IF (SELECT count(*) FROM public.profiles) >= 8 THEN RAISE EXCEPTION 'Account limit reached: maximum 8 accounts'; END IF;
  IF v_name !~ '^[a-z0-9._-]{3,32}$' THEN RAISE EXCEPTION 'Username must be 3-32 chars: letters, numbers, . _ -'; END IF;
  IF COALESCE(p_password,'') = '' OR length(p_password) < 6 THEN RAISE EXCEPTION 'Password must be at least 6 characters'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_name) THEN RAISE EXCEPTION 'Username already taken'; END IF;
  IF p_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN RAISE EXCEPTION 'Invalid home store'; END IF;
  v_email := v_name || '@laptop.inventory';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, confirmation_token, recovery_token, email_change, confirmation_sent_at, recovery_sent_at, email_change_sent_at, created_at, updated_at)
  VALUES (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
          extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb, false, false, '', '', '', now(), now(), now(), now(), now());
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_uid, v_email, jsonb_build_object('sub', v_uid::text, 'email', v_email), 'email', now(), now(), now());
  INSERT INTO public.profiles (id, username, display_name, role, home_store_id)
  VALUES (v_uid, v_name, COALESCE(btrim(p_display_name), v_name), COALESCE(p_role,'staff'), NULLIF(p_store_id, 0));
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
    'role', COALESCE(p_role,'staff'), 'home_store_id', NULLIF(p_store_id, 0), 'created_at', to_char(now(), 'YYYY-MM-DD HH24:MI:SS')));
END $$;

CREATE OR REPLACE FUNCTION public.app_update_user(p_id uuid, p_username text, p_password text, p_display_name text, p_role text, p_store_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  SELECT * INTO v_cur FROM public.profiles WHERE id = p_id;
  RETURN jsonb_build_object('user', jsonb_build_object(
    'id', v_cur.id, 'username', v_cur.username, 'display_name', v_cur.display_name,
    'role', v_cur.role, 'home_store_id', v_cur.home_store_id, 'created_at', to_char(v_cur.created_at, 'YYYY-MM-DD HH24:MI:SS')));
END $$;

-- 4. User list carries the home store name
CREATE OR REPLACE FUNCTION public.app_get_users()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role text := public.app_role(); v_out jsonb;
BEGIN
  IF v_role NOT IN ('admin','superadmin','manager') THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'role', p.role, 'home_store_id', p.home_store_id, 'home_store_name', s.store_name,
      'created_at', to_char(p.created_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY p.id), '[]'::jsonb) INTO v_out
   FROM public.profiles p
   LEFT JOIN public.stores s ON s.id = p.home_store_id
   WHERE (v_role = 'manager' AND p.role IN ('manager','staff'))
      OR (v_role = 'admin' AND p.role IN ('admin','manager','staff'))
      OR v_role = 'superadmin';
  RETURN v_out;
END $$;

-- 5. Login audit: store signed in, home store, red flag when they differ
CREATE OR REPLACE FUNCTION public.app_get_login_logs(p_limit int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  IF public.app_role() NOT IN ('admin','superadmin') THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id, 'user_id', l.user_id, 'username', l.username, 'ip', l.ip,
      'user_agent', l.user_agent, 'store_id', l.store_id,
      'store_name', ls.store_name, 'home_store_id', p.home_store_id,
      'home_store_name', hs.store_name,
      'match', CASE WHEN p.home_store_id IS NULL THEN NULL
                    ELSE (l.store_id = p.home_store_id) END,
      'logged_in', to_char(l.logged_in, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY l.logged_in DESC), '[]'::jsonb) INTO v_out
  FROM public.loginlogs l
  LEFT JOIN public.stores ls ON ls.id = l.store_id
  LEFT JOIN public.profiles p ON p.id = l.user_id
  LEFT JOIN public.stores hs ON hs.id = p.home_store_id
  LIMIT p_limit;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_record_login(p_store_id bigint DEFAULT NULL, p_ip text DEFAULT NULL, p_user_agent text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_username text;
BEGIN
  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
  IF v_username IS NOT NULL THEN
    INSERT INTO public.loginlogs (user_id, username, ip, user_agent, store_id)
    VALUES (v_uid, v_username, p_ip, p_user_agent, NULLIF(p_store_id, 0));
  END IF;
END $$;