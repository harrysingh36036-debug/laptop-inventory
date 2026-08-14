-- ---------------------------------------------------------------------------
-- Delta: re-add user management for admin — assign role + home store per user.
-- Used by the new "Users" tab in Admin Settings so an admin can grant a
-- manager access to a store (the store whose daily report the manager sees).
-- ---------------------------------------------------------------------------

-- 1. List users (admin/superadmin only) --------------------------------------
CREATE OR REPLACE FUNCTION public.app_get_users()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role text := public.app_role(); v_out jsonb;
BEGIN
  IF v_role NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'role', p.role,
      'home_store_id', p.home_store_id,
      'home_store_name', s.store_name,
      'created_at', to_char(p.created_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY p.username), '[]'::jsonb) INTO v_out
  FROM public.profiles p
  LEFT JOIN public.stores s ON s.id = p.home_store_id;
  RETURN v_out;
END $$;

-- 2. Update a user's role and/or home store (admin/superadmin only) ----------
CREATE OR REPLACE FUNCTION public.app_update_user(p_id uuid, p_role text DEFAULT NULL, p_store_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.app_role();
  v_cur public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_cur FROM public.profiles WHERE id = p_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  IF v_role = 'superadmin' THEN
    NULL; -- full control
  ELSIF v_role = 'admin' THEN
    IF v_cur.role = 'superadmin' THEN RAISE EXCEPTION 'You cannot modify the super admin account'; END IF;
    IF p_role = 'superadmin' THEN RAISE EXCEPTION 'Only the super admin can assign super admin'; END IF;
  ELSE
    RAISE EXCEPTION 'Insufficient permissions';
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
    'role', v_cur.role, 'home_store_id', v_cur.home_store_id,
    'created_at', to_char(v_cur.created_at, 'YYYY-MM-DD HH24:MI:SS')));
END $$;

GRANT EXECUTE ON FUNCTION public.app_get_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_update_user(uuid, text, bigint) TO authenticated;
