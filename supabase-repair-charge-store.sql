-- Delta: repairs get a store association + store-wise repair report.
-- cost  = item / material cost of the repair
-- charge= what was charged to the customer (already supported)
-- Adds: store_id on repairs, store name in listings, store-wise report RPC.
-- Idempotent: safe to re-run.

-- 1. Store on repairs ---------------------------------------------------------

ALTER TABLE public.repairs ADD COLUMN IF NOT EXISTS store_id bigint REFERENCES public.stores(id);
CREATE INDEX IF NOT EXISTS idx_repairs_store ON public.repairs(store_id);

-- 2. app_get_repairs: include store + charge + profit --------------------------

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
      'store_id', r.store_id, 'store_name', s.store_name,
      'status', r.status, 'notes', r.notes, 'created_by', r.created_by,
      'created_at', to_char(r.created_at, 'YYYY-MM-DD HH24:MI:SS'),
      'updated_at', to_char(r.updated_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY r.updated_at DESC, r.id DESC), '[]'::jsonb) INTO v_out
  FROM public.repairs r
  LEFT JOIN public.stores s ON s.id = r.store_id;
  RETURN v_out;
END $$;

-- 3. app_repairs_summary: include charged-to-customer + profit ----------------

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

-- 4. app_create_repair: accept charge + store ----------------------------------

DROP FUNCTION IF EXISTS public.app_create_repair(bigint, text, text, text, text, numeric, numeric, text);
CREATE OR REPLACE FUNCTION public.app_create_repair(
  p_laptop_id     bigint DEFAULT NULL,
  p_serial_number text DEFAULT '',
  p_brand_model   text DEFAULT '',
  p_issue         text DEFAULT '',
  p_vendor        text DEFAULT '',
  p_cost          numeric DEFAULT 0,
  p_charge        numeric DEFAULT 0,
  p_store_id      bigint DEFAULT NULL,
  p_notes         text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.repairs%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF COALESCE(btrim(p_issue),'') = '' THEN RAISE EXCEPTION 'issue is required'; END IF;
  IF p_charge IS NOT NULL AND p_charge < 0 THEN RAISE EXCEPTION 'charge cannot be negative'; END IF;
  INSERT INTO public.repairs (laptop_id, serial_number, brand_model, issue, vendor, cost, charge, store_id, notes, created_by)
  VALUES (p_laptop_id,
          NULLIF(btrim(p_serial_number), ''),
          NULLIF(btrim(p_brand_model), ''),
          btrim(p_issue),
          NULLIF(btrim(p_vendor), ''),
          COALESCE(p_cost, 0),
          COALESCE(p_charge, 0),
          p_store_id,
          NULLIF(btrim(p_notes), ''),
          (SELECT username FROM public.profiles WHERE id = auth.uid()))
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

-- 5. app_update_repair: accept charge + store ----------------------------------

DROP FUNCTION IF EXISTS public.app_update_repair(bigint, bigint, text, text, text, text, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.app_update_repair(bigint, bigint, text, text, text, text, numeric, numeric, text, text);
CREATE OR REPLACE FUNCTION public.app_update_repair(
  p_id            bigint,
  p_laptop_id     bigint DEFAULT NULL,
  p_serial_number text DEFAULT NULL,
  p_brand_model   text DEFAULT NULL,
  p_issue         text DEFAULT NULL,
  p_vendor        text DEFAULT NULL,
  p_cost          numeric DEFAULT NULL,
  p_charge        numeric DEFAULT NULL,
  p_store_id      bigint DEFAULT NULL,
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
    store_id      = COALESCE(p_store_id, store_id),
    status        = COALESCE(p_status, status),
    notes         = COALESCE(NULLIF(btrim(COALESCE(p_notes, notes)), ''), notes),
    updated_at    = now()
  WHERE id = p_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Repair record not found'; END IF;
  RETURN to_jsonb(v_row);
END $$;

-- 6. Store-wise repair report (respects manager home-store scoping) ------------

CREATE OR REPLACE FUNCTION public.app_repairs_by_store()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
        v_role text;
        v_home bigint;
BEGIN
  PERFORM public.app_req_auth();
  v_role := public.app_role();
  v_home := (SELECT home_store_id FROM public.profiles WHERE id = auth.uid());
  SELECT jsonb_build_object(
    'stores', COALESCE(jsonb_agg(
      jsonb_build_object(
        'store_id', v.store_id, 'store_name', v.store_name,
        'count', v.count, 'total_cost', v.total_cost, 'total_charge', v.total_charge, 'profit', v.profit
      ) ORDER BY v.store_name), '[]'::jsonb),
    'totals', jsonb_build_object(
      'count', COALESCE(SUM(v.count), 0),
      'total_cost', COALESCE(SUM(v.total_cost), 0),
      'total_charge', COALESCE(SUM(v.total_charge), 0),
      'profit', COALESCE(SUM(v.profit), 0))
  ) INTO v_out
  FROM (
    SELECT
      st.id AS store_id,
      st.store_name AS store_name,
      (SELECT count(*) FROM public.repairs r WHERE r.store_id = st.id) AS count,
      (SELECT COALESCE(SUM(r2.cost),0) FROM public.repairs r2 WHERE r2.store_id = st.id) AS total_cost,
      (SELECT COALESCE(SUM(r3.charge),0) FROM public.repairs r3 WHERE r3.store_id = st.id) AS total_charge,
      (SELECT COALESCE(SUM(COALESCE(r4.charge,0) - COALESCE(r4.cost,0)),0) FROM public.repairs r4 WHERE r4.store_id = st.id) AS profit
    FROM public.stores st
    WHERE v_role IN ('admin','superadmin') OR (v_home IS NOT NULL AND st.id = v_home)
  ) v;
  RETURN v_out;
END $$;
