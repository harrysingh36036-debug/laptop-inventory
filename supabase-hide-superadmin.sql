-- ============================================================================
-- Delta: hide the super admin account from all non-super admins.
-- Admins and managers never see the super admin in the user list; only the
-- super admin can see their own account. Idempotent: safe to re-run.
-- ============================================================================

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
  LEFT JOIN public.stores s ON s.id = p.home_store_id
  WHERE v_role = 'superadmin' OR p.role <> 'superadmin';
  RETURN v_out;
END $$;