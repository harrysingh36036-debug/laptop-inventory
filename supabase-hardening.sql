-- ============================================================================
-- Hardening: fix anon-key data exposure + tighten RLS on sensitive tables
-- ============================================================================

-- 0. Least-privilege defaults: staff is view-only (legacy granted editInventory)
UPDATE public.settings SET value = jsonb_set(value::jsonb, '{staff,editInventory}', 'false')::text
  WHERE key = 'role_permissions' AND COALESCE(value::jsonb->'staff'->>'editInventory','false') = 'true';

-- 1. Read RPCs must not run for anonymous callers (anon key is public in the
--    static bundle). The security-definer bodies bypass RLS, so gate inside.
CREATE OR REPLACE FUNCTION public.app_req_auth()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.app_role() = 'anon' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.app_get_laptops(p_store_id bigint DEFAULT NULL, p_status text DEFAULT NULL, p_search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id, 'brand', l.brand, 'brand_model', l.brand_model,
      'processor_type', l.processor_type, 'generation', l.generation, 'storage_type', l.storage_type,
      'storage_size', l.storage_size,
      'purchased_from', l.purchased_from, 'graphics', l.graphics, 'graphics_type', l.graphics_type,
      'graphics_model', l.graphics_model, 'purchase_rate', l.purchase_rate, 'extra_charges', l.extra_charges,
      'serial_number', l.serial_number, 'current_store_id', l.current_store_id,
      'current_store_name', s.store_name, 'status', l.status,
      'created_at', to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS'),
      'updated_at', to_char(l.updated_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY l.updated_at DESC), '[]'::jsonb) INTO v_out
  FROM public.laptops l LEFT JOIN public.stores s ON s.id = l.current_store_id
  WHERE (p_store_id IS NULL OR l.current_store_id = p_store_id)
    AND (p_status IS NULL OR l.status = p_status)
    AND (p_search IS NULL OR l.brand ILIKE '%' || p_search || '%' OR l.brand_model ILIKE '%' || p_search || '%' OR l.serial_number ILIKE '%' || p_search || '%');
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_get_settings()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_out FROM public.settings;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_get_sales()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', s.id, 'laptop_id', s.laptop_id, 'serial_number', s.serial_number, 'brand_model', s.brand_model,
      'store_id', s.store_id, 'store_name', st.store_name, 'sale_price', s.sale_price, 'cost_price', s.cost_price,
      'profit', s.profit, 'sold_by', s.sold_by, 'sold_at', to_char(s.sold_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY s.sold_at DESC), '[]'::jsonb) INTO v_out
  FROM public.sales s LEFT JOIN public.stores st ON st.id = s.store_id;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_sales_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT jsonb_build_object(
    'count', count(*),
    'total_sales', COALESCE(sum(sale_price),0),
    'total_profit', COALESCE(sum(profit),0),
    'total_cost', COALESCE(sum(cost_price),0)
  ) INTO v_out FROM public.sales;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_get_transfer_logs(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', tl.id, 'laptop_id', tl.laptop_id, 'from_store_id', tl.from_store_id, 'to_store_id', tl.to_store_id,
      'brand_model', l.brand_model, 'serial_number', l.serial_number,
      'from_store_name', fs.store_name, 'to_store_name', ts.store_name,
      'changed_at', to_char(tl.changed_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY tl.changed_at DESC), '[]'::jsonb) INTO v_out
  FROM public.transferlogs tl
  JOIN public.laptops l ON l.id = tl.laptop_id
  LEFT JOIN public.stores fs ON fs.id = tl.from_store_id
  LEFT JOIN public.stores ts ON ts.id = tl.to_store_id
  LIMIT p_limit;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_get_login_logs(p_limit int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  IF public.app_role() NOT IN ('admin','superadmin') THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id, 'user_id', l.user_id, 'username', l.username, 'ip', l.ip,
      'user_agent', l.user_agent, 'logged_in', to_char(l.logged_in, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY l.logged_in DESC), '[]'::jsonb) INTO v_out
  FROM public.loginlogs l LIMIT p_limit;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_get_stores()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb) INTO v_out FROM public.stores s;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_get_brands()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'serial_prefix', b.serial_prefix, 'created_at', b.created_at) ORDER BY b.name), '[]'::jsonb) INTO v_out FROM public.brands b;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_get_vendors()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.name), '[]'::jsonb) INTO v_out FROM public.vendors v;
  RETURN v_out;
END $$;

-- 2. Strip every EXECUTE from the anonymous role (belt): the anon key alone
--    must never be able to run a function.
REVOKE ALL ON FUNCTION public.app_req_auth FROM anon;

REVOKE ALL ON FUNCTION public.app_get_laptops, public.app_get_settings, public.app_get_sales,
  public.app_sales_summary, public.app_get_transfer_logs, public.app_get_login_logs,
  public.app_get_users, public.app_create_user, public.app_update_user, public.app_delete_user,
  public.app_add_store, public.app_rename_store, public.app_delete_store,
  public.app_add_brand, public.app_update_brand, public.app_delete_brand,
  public.app_add_vendor, public.app_update_vendor, public.app_delete_vendor, public.app_bulk_delete_vendors,
  public.app_create_laptop, public.app_bulk_create_laptops, public.app_update_laptop, public.app_delete_laptop,
  public.app_transfer_laptop, public.app_sell_laptop, public.app_set_settings,
  public.app_get_login_logs, public.app_record_login, public.app_get_settings FROM anon;

-- 3. Tighten RLS on sensitive tables for authenticated-but-low-priv users.
DROP POLICY IF EXISTS "loginlogs_read" ON public.loginlogs;
CREATE POLICY "loginlogs_read" ON public.loginlogs FOR SELECT TO authenticated
  USING (public.app_role() IN ('admin','superadmin'));

DROP POLICY IF EXISTS "profiles_read" ON public.profiles;
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.app_role() IN ('admin','superadmin'));

DROP POLICY IF EXISTS "settings_read" ON public.settings;
CREATE POLICY "settings_read" ON public.settings FOR SELECT TO authenticated
  USING (public.app_role() IN ('admin','superadmin'));

DROP POLICY IF EXISTS "sales_read" ON public.sales;
CREATE POLICY "sales_read" ON public.sales FOR SELECT TO authenticated
  USING (public.app_role() IN ('admin','superadmin','manager'));