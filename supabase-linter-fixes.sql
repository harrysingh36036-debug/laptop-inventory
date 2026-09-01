-- ============================================================================
-- Security Advisor fixes for laptop-inventory (project ppdaqzjcttpdxgathged)
--
-- Addresses these findings (run as postgres in the Supabase SQL Editor):
--   0014 extension_in_public                     -> move pgcrypto to extensions
--   0024 rls_policy_always_true (purchases,
--        pending_transfers write policies)       -> drop permissive write policies
--   0028 anon_security_definer_function_executable -> REVOKE EXECUTE FROM PUBLIC
--
-- NOT addressed here (by design, do NOT "fix"):
--   0029 authenticated_security_definer_function_executable
--        Every app_* RPC is a SECURITY DEFINER function callable by signed-in
--        users. That is the app's architecture: each function enforces its own
--        authorization internally (app_req_auth for reads, app_perm/app_role for
--        writes). Revoking EXECUTE would break the entire UI.
--
-- NOT fixable in SQL:
--   auth_leaked_password_protection -> enable in Dashboard (see end of file).
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Move pgcrypto out of the public schema (lint 0014)
-- ---------------------------------------------------------------------------
ALTER EXTENSION pgcrypto SET SCHEMA extensions;

-- pgcrypto's crypt()/gen_salt() now live in the extensions schema, so the
-- three functions that referenced public.crypt/public.gen_salt (or bare crypt)
-- must be recreated against extensions.*. gen_random_uuid() is core PG (13+),
-- so it keeps resolving without pgcrypto.

-- app_verify_password: unqualified crypt() would no longer resolve.
CREATE OR REPLACE FUNCTION public.app_verify_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE v_hash text;
BEGIN
  IF p_password IS NULL OR btrim(p_password) = '' THEN RETURN false; END IF;
  SELECT encrypted_password::text INTO v_hash FROM auth.users WHERE id = auth.uid();
  RETURN v_hash IS NOT NULL AND v_hash <> '' AND extensions.crypt(p_password, v_hash) = v_hash;
END $$;

-- app_create_user: password hashing uses extensions.crypt/gen_salt.
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

-- app_update_user (password-resetting variant): extensions.crypt/gen_salt.
CREATE OR REPLACE FUNCTION public.app_update_user(p_id uuid, p_username text, p_password text, p_display_name text, p_role text, p_store_id bigint DEFAULT NULL, p_allowed_store_ids bigint[] DEFAULT NULL)
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

-- ---------------------------------------------------------------------------
-- 2. Drop permissive write RLS policies (lint 0024)
--    All writes go through SECURITY DEFINER RPCs (app_create_purchase,
--    app_update_purchase, app_delete_purchase, app_initiate_transfer, ...)
--    which enforce app_perm() internally. The USING/WITH CHECK (true) write
--    policies only expose direct PostgREST writes to every authenticated user,
--    so they are removed. SELECT (read) policies are intentionally kept.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.purchases') IS NOT NULL THEN
    DROP POLICY IF EXISTS "purchases_write" ON public.purchases;
    DROP POLICY IF EXISTS "purchases_update" ON public.purchases;
    DROP POLICY IF EXISTS "purchases_delete" ON public.purchases;
  END IF;
  IF to_regclass('public.pending_transfers') IS NOT NULL THEN
    DROP POLICY IF EXISTS "pt_insert" ON public.pending_transfers;
    DROP POLICY IF EXISTS "pt_update" ON public.pending_transfers;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Lock down EXECUTE on every public.app_* function (lint 0028)
--    Functions are EXECUTE-able by PUBLIC by default (proacl = NULL), and the
--    anon role inherits EXECUTE from PUBLIC. REVOKE ... FROM anon alone does
--    NOT remove that, so the PUBLIC grant must be revoked. Every RPC is then
--    re-granted to authenticated so signed-in users keep working. The app never
--    calls an RPC before login (the login screen only reads stores via the anon
--    stores_read_anon SELECT policy), so no function needs anon EXECUTE.
-- ---------------------------------------------------------------------------
-- Revoke PUBLIC EXECUTE from every function in the schema in one shot (this
-- covers all app_* overloads, including any re-created after an earlier pass),
-- then re-grant EXECUTE to authenticated so signed-in users keep working.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Durable fix: a new overload created later would get default PUBLIC EXECUTE and
-- re-trigger lint 0028. Stop that for functions created by postgres.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ensure anon can read stores (login-page store dropdown)
--    The login screen populates its "Which store are you at?" dropdown via a
--    direct anon read of the stores table (getStores() -> supabase.from('stores')),
--    NOT via an RPC. When there is no cached session the request runs as the
--    anon role, so anon needs SELECT on stores plus the anon read RLS policy.
--    Without this, fresh browsers/devices show an empty dropdown. This is
--    intentional anon access — the opposite of the section-3 lockdown.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.stores TO anon;

DROP POLICY IF EXISTS "stores_read_anon" ON public.stores;
CREATE POLICY "stores_read_anon" ON public.stores
  FOR SELECT TO anon USING (true);

-- =========================================================================
-- Verify (checks the effective privilege, which includes PUBLIC grants)
--   anon functions check:
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'app\_%'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  -- no output = every app_* function is locked down from anon
ORDER BY p.proname;

--   anon stores read check (expect true):
SELECT has_table_privilege('anon', 'public.stores', 'SELECT') AS anon_can_read_stores;

--   anon read policy present (expect a row for stores_read_anon):
SELECT polname, polcmd, polroles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'stores';
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'app\_%'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  -- no output = every app_* function is locked down from anon
ORDER BY p.proname;

-- ============================================================================
-- Not fixable in SQL:
--   auth_leaked_password_protection
--   Dashboard -> Authentication -> Config -> enable
--   "Prevent use of leaked passwords" (checks HaveIBeenPwned) and save.
-- ============================================================================