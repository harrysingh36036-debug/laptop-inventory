-- ============================================================================
-- Delta: Admin account management — list + delete admin / manager / staff
--  1. Re-create app_get_users (dropped by v3-master) so the Users tab loads.
--  2. Add app_delete_user: admins can delete admin, manager and staff accounts
--     (never the super admin, never their own account). Password + remarks are
--     required, matching every other delete in the app. Super admin can delete
--     anyone except themselves.
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. User list (visibility per role, same shape as before)
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
      'allowed_store_ids', p.allowed_store_ids,
      'created_at', to_char(p.created_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY p.id), '[]'::jsonb) INTO v_out
   FROM public.profiles p
   LEFT JOIN public.stores s ON s.id = p.home_store_id
   WHERE (v_role = 'manager' AND p.role IN ('manager','staff'))
      OR (v_role = 'admin' AND p.role IN ('admin','manager','staff'))
      OR v_role = 'superadmin';
  RETURN v_out;
END $$;

-- 2. Delete a user account. Removing the Supabase auth user cascades to
--    profiles and identities (both reference auth.users ON DELETE CASCADE).
CREATE OR REPLACE FUNCTION public.app_delete_user(p_id uuid, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role   text := public.app_role();
  v_target text;
  v_name   text;
BEGIN
  IF v_role NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'Only an admin or the super admin can delete accounts'; END IF;
  IF p_id = auth.uid() THEN RAISE EXCEPTION 'You cannot delete your own account'; END IF;
  SELECT role, username INTO v_target, v_name FROM public.profiles WHERE id = p_id;
  IF v_target IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_role = 'admin' AND v_target = 'superadmin' THEN RAISE EXCEPTION 'You cannot delete the super admin account'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  DELETE FROM auth.users WHERE id = p_id;
  PERFORM public.app_log_delete('user', 0, v_name, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

GRANT EXECUTE ON FUNCTION public.app_get_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_delete_user(uuid, text, text) TO authenticated;