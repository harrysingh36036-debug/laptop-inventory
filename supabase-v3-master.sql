-- ============================================================================
-- Delta v3: Repairs profit, password-verified deletes, daily reports,
--           sales customer masking, remove login tracker + account system
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Repairs: charge (what the customer paid). Profit = charge - cost (material).
ALTER TABLE public.repairs ADD COLUMN IF NOT EXISTS charge NUMERIC NOT NULL DEFAULT 0;

-- 2. Deletion audit table --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delete_logs (
  id          BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   BIGINT,
  entity_label TEXT,
  remarks     TEXT NOT NULL,
  deleted_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delete_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "delete_logs_read" ON public.delete_logs;
CREATE POLICY "delete_logs_read" ON public.delete_logs FOR SELECT TO authenticated USING (true);

-- 3. Realtime publication (idempotent adds) -------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['repairs','delete_logs']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 4. Password verification helper (checks the signed-in user's own password) ----
CREATE OR REPLACE FUNCTION public.app_verify_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE v_hash text;
BEGIN
  IF p_password IS NULL OR btrim(p_password) = '' THEN RETURN false; END IF;
  SELECT encrypted_password::text INTO v_hash FROM auth.users WHERE id = auth.uid();
  RETURN v_hash IS NOT NULL AND v_hash <> '' AND crypt(p_password, v_hash) = v_hash;
END $$;

-- Deletion audit helper (names the deleting user).
CREATE OR REPLACE FUNCTION public.app_log_delete(p_entity_type text, p_entity_id bigint, p_label text, p_remarks text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_username text;
BEGIN
  SELECT username INTO v_username FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.delete_logs (entity_type, entity_id, entity_label, remarks, deleted_by)
  VALUES (p_entity_type, p_entity_id, p_label, btrim(p_remarks), v_username);
END $$;

-- Guard used by every delete RPC: password must match + remarks required.
CREATE OR REPLACE FUNCTION public.app_delete_guard(p_password text, p_remarks text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.app_verify_password(p_password) THEN RAISE EXCEPTION 'Your password is incorrect. Deletion cancelled.'; END IF;
  IF COALESCE(btrim(p_remarks),'') = '' THEN RAISE EXCEPTION 'Remarks are required to delete.'; END IF;
END $$;

-- 5. Password-verified deletes (all data entities) ------------------------------

DROP FUNCTION IF EXISTS public.app_delete_laptop(bigint);
CREATE OR REPLACE FUNCTION public.app_delete_laptop(p_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_label text;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT brand_model || ' ' || COALESCE(serial_number,'') INTO v_label FROM public.laptops WHERE id = p_id;
  IF v_label IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  DELETE FROM public.sales WHERE laptop_id = p_id;
  DELETE FROM public.transferlogs WHERE laptop_id = p_id;
  DELETE FROM public.laptops WHERE id = p_id;
  PERFORM public.app_log_delete('laptop', p_id, v_label, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

DROP FUNCTION IF EXISTS public.app_delete_sale(bigint);
CREATE OR REPLACE FUNCTION public.app_delete_sale(p_sale_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.sales%ROWTYPE;
  v_laptop_id bigint;
  v_store bigint;
BEGIN
  IF public.app_role() <> 'superadmin' THEN RAISE EXCEPTION 'Only the super admin can delete sales'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  SELECT * INTO v_row FROM public.sales WHERE id = p_sale_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  v_laptop_id := v_row.laptop_id;
  v_store := v_row.store_id;
  DELETE FROM public.sales WHERE id = p_sale_id;
  UPDATE public.laptops
     SET status = 'In Stock', updated_at = now()
   WHERE id = v_laptop_id AND status = 'Sold';
  PERFORM public.app_log_delete('sale', p_sale_id, v_row.brand_model || ' ' || COALESCE(v_row.serial_number,''), p_remarks);
  RETURN jsonb_build_object('ok', true, 'deleted_sale_id', p_sale_id, 'laptop_id', v_laptop_id, 'store_id', v_store);
END $$;

DROP FUNCTION IF EXISTS public.app_delete_repair(bigint);
CREATE OR REPLACE FUNCTION public.app_delete_repair(p_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.repairs%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  DELETE FROM public.repairs WHERE id = p_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Repair record not found'; END IF;
  PERFORM public.app_log_delete('repair', p_id, v_row.brand_model || ' ' || COALESCE(v_row.serial_number,''), p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

DROP FUNCTION IF EXISTS public.app_delete_customer(bigint);
CREATE OR REPLACE FUNCTION public.app_delete_customer(p_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.customers%ROWTYPE; v_label text;
BEGIN
  IF NOT public.app_perm_exact('manageCustomers') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  DELETE FROM public.customers WHERE id = p_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
  v_label := v_row.name;
  PERFORM public.app_log_delete('customer', p_id, v_label, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

DROP FUNCTION IF EXISTS public.app_bulk_delete_customers(bigint[]);
CREATE OR REPLACE FUNCTION public.app_bulk_delete_customers(p_ids bigint[], p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  IF NOT public.app_perm_exact('manageCustomers') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN RAISE EXCEPTION 'No customers selected'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  DELETE FROM public.customers WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.app_log_delete('customers_bulk', p_ids[1], v_n || ' customer(s)', p_remarks);
  RETURN jsonb_build_object('ok', true, 'deleted', v_n);
END $$;

DROP FUNCTION IF EXISTS public.app_delete_brand(bigint);
CREATE OR REPLACE FUNCTION public.app_delete_brand(p_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name text; v_used int;
BEGIN
  IF public.app_role() NOT IN ('admin','superadmin','manager') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  SELECT name INTO v_name FROM public.brands WHERE id = p_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Brand not found'; END IF;
  SELECT count(*) INTO v_used FROM public.laptops WHERE brand = v_name;
  IF v_used > 0 THEN RAISE EXCEPTION 'Cannot remove: laptops exist with this brand.'; END IF;
  DELETE FROM public.brands WHERE id = p_id;
  PERFORM public.app_log_delete('brand', p_id, v_name, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

DROP FUNCTION IF EXISTS public.app_delete_vendor(bigint);
CREATE OR REPLACE FUNCTION public.app_delete_vendor(p_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.vendors%ROWTYPE;
BEGIN
  IF NOT public.app_perm_exact('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  DELETE FROM public.vendors WHERE id = p_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  PERFORM public.app_log_delete('vendor', p_id, v_row.name, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

DROP FUNCTION IF EXISTS public.app_bulk_delete_vendors(bigint[]);
CREATE OR REPLACE FUNCTION public.app_bulk_delete_vendors(p_ids bigint[], p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  IF NOT public.app_perm_exact('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN RAISE EXCEPTION 'No vendors selected'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  DELETE FROM public.vendors WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.app_log_delete('vendors_bulk', p_ids[1], v_n || ' vendor(s)', p_remarks);
  RETURN jsonb_build_object('ok', true, 'deleted', v_n);
END $$;

DROP FUNCTION IF EXISTS public.app_delete_store(bigint);
CREATE OR REPLACE FUNCTION public.app_delete_store(p_store_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n int; v_used int; v_name text;
BEGIN
  IF public.app_role() NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT count(*) INTO v_n FROM public.stores;
  IF v_n <= 1 THEN RAISE EXCEPTION 'Cannot remove the last store'; END IF;
  SELECT count(*) INTO v_used FROM public.laptops WHERE current_store_id = p_store_id;
  IF v_used > 0 THEN RAISE EXCEPTION 'Cannot remove: % laptop(s) still assigned. Move them first.', v_used; END IF;
  IF EXISTS (SELECT 1 FROM public.transferlogs WHERE from_store_id = p_store_id OR to_store_id = p_store_id) THEN
    RAISE EXCEPTION 'Cannot remove: store appears in transfer history.';
  END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  SELECT store_name INTO v_name FROM public.stores WHERE id = p_store_id;
  DELETE FROM public.stores WHERE id = p_store_id;
  PERFORM public.app_log_delete('store', p_store_id, v_name, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_store_id);
END $$;

-- 6. Repairs RPCs now carry charge ----------------------------------------------

CREATE OR REPLACE FUNCTION public.app_get_repairs()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'laptop_id', r.laptop_id, 'serial_number', r.serial_number,
      'brand_model', r.brand_model, 'issue', r.issue, 'vendor', r.vendor,
      'cost', r.cost, 'charge', COALESCE(r.charge, 0), 'profit', COALESCE(r.charge,0) - COALESCE(r.cost,0),
      'status', r.status, 'notes', r.notes, 'created_by', r.created_by,
      'created_at', to_char(r.created_at, 'YYYY-MM-DD HH24:MI:SS'),
      'updated_at', to_char(r.updated_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY r.updated_at DESC, r.id DESC), '[]'::jsonb) INTO v_out
  FROM public.repairs r;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_repairs_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT jsonb_build_object(
      'total',       count(*),
      'pending',     count(*) FILTER (WHERE status = 'Pending'),
      'in_progress', count(*) FILTER (WHERE status = 'In Progress'),
      'repaired',    count(*) FILTER (WHERE status = 'Repaired'),
      'total_cost',  COALESCE(SUM(COALESCE(cost, 0)), 0),
      'total_charge',COALESCE(SUM(COALESCE(charge, 0)), 0),
      'total_profit',COALESCE(SUM(COALESCE(charge, 0) - COALESCE(cost, 0)), 0))
    INTO v_out FROM public.repairs;
  RETURN v_out;
END $$;

DROP FUNCTION IF EXISTS public.app_create_repair(bigint, text, text, text, text, numeric, text);
CREATE OR REPLACE FUNCTION public.app_create_repair(
  p_laptop_id     bigint DEFAULT NULL,
  p_serial_number text DEFAULT '',
  p_brand_model   text DEFAULT '',
  p_issue         text DEFAULT '',
  p_vendor        text DEFAULT '',
  p_cost          numeric DEFAULT 0,
  p_charge        numeric DEFAULT 0,
  p_notes         text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.repairs%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF COALESCE(btrim(p_issue),'') = '' THEN RAISE EXCEPTION 'issue is required'; END IF;
  INSERT INTO public.repairs (laptop_id, serial_number, brand_model, issue, vendor, cost, charge, notes, created_by)
  VALUES (p_laptop_id,
          NULLIF(btrim(p_serial_number), ''),
          NULLIF(btrim(p_brand_model), ''),
          btrim(p_issue),
          NULLIF(btrim(p_vendor), ''),
          COALESCE(p_cost, 0),
          COALESCE(p_charge, 0),
          NULLIF(btrim(p_notes), ''),
          (SELECT username FROM public.profiles WHERE id = auth.uid()))
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

DROP FUNCTION IF EXISTS public.app_update_repair(bigint, bigint, text, text, text, text, numeric, text, text, text);
CREATE OR REPLACE FUNCTION public.app_update_repair(
  p_id            bigint,
  p_laptop_id     bigint DEFAULT NULL,
  p_serial_number text DEFAULT NULL,
  p_brand_model   text DEFAULT NULL,
  p_issue         text DEFAULT NULL,
  p_vendor        text DEFAULT NULL,
  p_cost          numeric DEFAULT NULL,
  p_charge        numeric DEFAULT NULL,
  p_status        text DEFAULT NULL,
  p_notes         text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.repairs%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  UPDATE public.repairs SET
    laptop_id     = COALESCE(p_laptop_id, laptop_id),
    serial_number = COALESCE(NULLIF(btrim(COALESCE(p_serial_number, serial_number)), ''), serial_number),
    brand_model   = COALESCE(NULLIF(btrim(COALESCE(p_brand_model, brand_model)), ''), brand_model),
    issue         = btrim(COALESCE(p_issue, issue)),
    vendor        = COALESCE(NULLIF(btrim(COALESCE(p_vendor, vendor)), ''), vendor),
    cost          = COALESCE(p_cost, cost),
    charge        = COALESCE(p_charge, charge),
    status        = COALESCE(p_status, status),
    notes         = COALESCE(NULLIF(btrim(COALESCE(p_notes, notes)), ''), notes),
    updated_at    = now()
  WHERE id = p_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Repair record not found'; END IF;
  RETURN to_jsonb(v_row);
END $$;

-- 7. Sales: customer phone is masked below admin/superadmin ---------------------

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
      'profit', s.profit, 'sold_by', s.sold_by, 'sold_at', to_char(s.sold_at, 'YYYY-MM-DD HH24:MI:SS'),
      'customer_id', s.customer_id,
      'customer_name', CASE WHEN public.app_role() IN ('admin','superadmin') THEN c.name ELSE NULL END,
      'customer_phone_last4', CASE WHEN public.app_role() IN ('admin','superadmin') THEN RIGHT(COALESCE(c.phone,''), 4) ELSE NULL END,
      'customer_phone', CASE WHEN public.app_role() IN ('admin','superadmin') THEN COALESCE(c.phone,'') ELSE NULL END)
      ORDER BY s.sold_at DESC), '[]'::jsonb) INTO v_out
  FROM public.sales s
  LEFT JOIN public.stores st ON st.id = s.store_id
  LEFT JOIN public.customers c ON c.id = s.customer_id;
  RETURN v_out;
END $$;

-- 8. Daily report: per store, systems in / out (sold + transferred) + models ----

CREATE OR REPLACE FUNCTION public.app_daily_report(p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT jsonb_build_object(
    'date', to_char(p_date, 'YYYY-MM-DD'),
    'stores', COALESCE(jsonb_agg(
      jsonb_build_object(
        'store_id', s.id, 'store_name', s.store_name,
        'in_store', v.in_count,
        'sold_on', v.sold_count,
        'transferred_out_on', v.tout_count,
        'transferred_in_on', v.tin_count,
        'out_total', (COALESCE(v.sold_count,0) + COALESCE(v.tout_count,0)),
        'models', v.models
      ) ORDER BY s.store_name), '[]'::jsonb),
    'totals', jsonb_build_object(
      'in_store', COALESCE(SUM(v.in_count), 0),
      'sold_on', COALESCE(SUM(v.sold_count), 0),
      'transferred_out_on', COALESCE(SUM(v.tout_count), 0),
      'transferred_in_on', COALESCE(SUM(v.tin_count), 0),
      'out_total', COALESCE(SUM(v.sold_count), 0) + COALESCE(SUM(v.tout_count), 0))
  ) INTO v_out
  FROM (
    SELECT
      st.id AS store_id,
      (SELECT count(*) FROM public.laptops l WHERE l.current_store_id = st.id AND l.status <> 'Sold') AS in_count,
      (SELECT count(*) FROM public.sales s WHERE s.store_id = st.id AND s.sold_at::date = p_date) AS sold_count,
      (SELECT count(*) FROM public.transferlogs tl WHERE tl.from_store_id = st.id AND tl.changed_at::date = p_date) AS tout_count,
      (SELECT count(*) FROM public.transferlogs tl2 WHERE tl2.to_store_id = st.id AND tl2.changed_at::date = p_date) AS tin_count,
      (SELECT COALESCE(jsonb_agg(x ORDER BY x.model), '[]'::jsonb) FROM (
         SELECT l2.brand_model AS model, count(*) AS count
         FROM public.laptops l2
         WHERE l2.current_store_id = st.id AND l2.status <> 'Sold'
         GROUP BY l2.brand_model
         UNION ALL
         SELECT s2.brand_model, count(*)
         FROM public.sales s2
         WHERE s2.store_id = st.id AND s2.sold_at::date = p_date
         GROUP BY s2.brand_model
      ) x) AS models
    FROM public.stores st
  ) v;
  RETURN v_out;
END $$;

-- 8b. Daily store-wise sales ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_daily_store_sales(p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT jsonb_build_object(
    'date', to_char(p_date, 'YYYY-MM-DD'),
    'stores', COALESCE(jsonb_agg(
      jsonb_build_object(
        'store_id', s.id, 'store_name', s.store_name,
        'units', v.units,
        'amount', v.amount,
        'profit', v.profit
      ) ORDER BY s.store_name), '[]'::jsonb),
    'totals', jsonb_build_object(
      'units', COALESCE(SUM(v.units), 0),
      'amount', COALESCE(SUM(v.amount), 0),
      'profit', COALESCE(SUM(v.profit), 0))
  ) INTO v_out
  FROM (
    SELECT
      st.id AS store_id,
      (SELECT count(*) FROM public.sales s WHERE s.store_id = st.id AND s.sold_at::date = p_date) AS units,
      (SELECT COALESCE(SUM(s2.sale_price), 0) FROM public.sales s2 WHERE s2.store_id = st.id AND s2.sold_at::date = p_date) AS amount,
      (SELECT COALESCE(SUM(s3.profit), 0) FROM public.sales s3 WHERE s3.store_id = st.id AND s3.sold_at::date = p_date) AS profit
    FROM public.stores st
  ) v;
  RETURN v_out;
END $$;

-- 9. REMOVE Login tracker + staff account system --------------------------------
DROP FUNCTION IF EXISTS public.app_record_login(bigint, text, text);
DROP FUNCTION IF EXISTS public.app_get_login_logs(int);
DROP FUNCTION IF EXISTS public.app_get_users();
DROP FUNCTION IF EXISTS public.app_create_user(text, text, text, text, bigint);
DROP FUNCTION IF EXISTS public.app_create_user(text, text, text, text, bigint, bigint[]);
DROP FUNCTION IF EXISTS public.app_update_user(uuid, text, text, text, bigint);
DROP FUNCTION IF EXISTS public.app_update_user(uuid, text, text, text, bigint, bigint[]);
DROP FUNCTION IF EXISTS public.app_delete_user(uuid);
DROP FUNCTION IF EXISTS public.app_bulk_delete_users(uuid[]);
DROP TABLE IF EXISTS public.loginlogs;

DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.loginlogs';
EXCEPTION WHEN undefined_object OR duplicate_object OR undefined_table THEN NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.app_daily_report(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_daily_store_sales(date) TO authenticated;