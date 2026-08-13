-- ============================================================================
-- Delta: Repairs module + Purchases module (v1)
-- Repairs : track laptops sent out for service (workshop, cost, status).
-- Purchases: ledger view over Laptops (every unit added is a purchase).
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Repairs table ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.repairs (
  id            BIGSERIAL PRIMARY KEY,
  laptop_id     BIGINT,
  serial_number TEXT,
  brand_model   TEXT,
  issue         TEXT NOT NULL,
  vendor        TEXT,
  cost          NUMERIC NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'Pending'
                CHECK (status IN ('Pending','In Progress','Repaired')),
  notes         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_repair_laptop FOREIGN KEY (laptop_id) REFERENCES public.laptops(id) ON DELETE SET NULL
);

ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read repairs; all writes go through RPCs.
DROP POLICY IF EXISTS "repairs_read" ON public.repairs;
CREATE POLICY "repairs_read" ON public.repairs FOR SELECT TO authenticated USING (true);

-- 2. Realtime publication -----------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['repairs']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      -- already a member of the publication; fine
      NULL;
    END;
  END LOOP;
EXCEPTION WHEN undefined_object THEN
  -- publication missing; ignore
END $$;

-- 3. Repairs RPCs -------------------------------------------------------------------

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
      'cost', r.cost, 'status', r.status, 'notes', r.notes, 'created_by', r.created_by,
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
      'total_cost',  COALESCE(SUM(COALESCE(cost, 0)), 0))
    INTO v_out FROM public.repairs;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_create_repair(
  p_laptop_id     bigint DEFAULT NULL,
  p_serial_number text DEFAULT '',
  p_brand_model   text DEFAULT '',
  p_issue         text DEFAULT '',
  p_vendor        text DEFAULT '',
  p_cost          numeric DEFAULT 0,
  p_notes         text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.repairs%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF COALESCE(btrim(p_issue),'') = '' THEN RAISE EXCEPTION 'issue is required'; END IF;
  INSERT INTO public.repairs (laptop_id, serial_number, brand_model, issue, vendor, cost, notes, created_by)
  VALUES (p_laptop_id,
          NULLIF(btrim(p_serial_number), ''),
          NULLIF(btrim(p_brand_model), ''),
          btrim(p_issue),
          NULLIF(btrim(p_vendor), ''),
          COALESCE(p_cost, 0),
          NULLIF(btrim(p_notes), ''),
          (SELECT username FROM public.profiles WHERE id = auth.uid()))
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_update_repair(
  p_id            bigint,
  p_laptop_id     bigint DEFAULT NULL,
  p_serial_number text DEFAULT NULL,
  p_brand_model   text DEFAULT NULL,
  p_issue         text DEFAULT NULL,
  p_vendor        text DEFAULT NULL,
  p_cost          numeric DEFAULT NULL,
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
    status        = COALESCE(p_status, status),
    notes         = COALESCE(NULLIF(btrim(COALESCE(p_notes, notes)), ''), notes),
    updated_at    = now()
  WHERE id = p_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Repair record not found'; END IF;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_repair(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  DELETE FROM public.repairs WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Repair record not found'; END IF;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- 4. Purchases RPCs (ledger over Laptops) -------------------------------------------

CREATE OR REPLACE FUNCTION public.app_get_purchases()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id, 'brand', l.brand, 'brand_model', l.brand_model,
      'serial_number', l.serial_number,
      'purchase_rate', l.purchase_rate, 'extra_charges', l.extra_charges,
      'purchased_from', l.purchased_from,
      'current_store_id', l.current_store_id, 'current_store_name', s.store_name,
      'status', l.status,
      'created_at', to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY l.created_at DESC, l.id DESC), '[]'::jsonb) INTO v_out
  FROM public.laptops l
  LEFT JOIN public.stores s ON s.id = l.current_store_id;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_purchases_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT jsonb_build_object(
      'total_units',   count(*),
      'total_rate',    COALESCE(SUM(COALESCE(purchase_rate, 0)), 0),
      'total_charges', COALESCE(SUM(COALESCE(extra_charges, 0)), 0),
      'total_value',   COALESCE(SUM(COALESCE(purchase_rate, 0) + COALESCE(extra_charges, 0)), 0),
      'month_units',   count(*) FILTER (WHERE created_at >= date_trunc('month', now())),
      'month_value',   COALESCE(SUM(COALESCE(purchase_rate, 0) + COALESCE(extra_charges, 0))
                        FILTER (WHERE created_at >= date_trunc('month', now())), 0))
    INTO v_out FROM public.laptops;
  RETURN v_out;
END $$;
