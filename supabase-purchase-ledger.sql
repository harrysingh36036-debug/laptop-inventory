-- ---------------------------------------------------------------------------
-- Delta: Separate purchase ledger (money spent), independent of inventory.
--   Purchases recorded here are NOT laptops in inventory — they are purchase
--   transactions showing what was bought and how much was spent.
-- Applies after supabase-purchase-fields.sql
-- Run: paste into Supabase SQL Editor, or psql -f
-- ---------------------------------------------------------------------------

-- 1. Ledger table ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchases (
  id                BIGSERIAL PRIMARY KEY,
  purchased_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  brand             text,
  brand_model       text,
  serial_number     text,
  processor         text,
  generation        text,
  ram               text,
  storage           text,
  graphics          text,
  purchased_from    text,
  purchase_rate     numeric NOT NULL DEFAULT 0,
  extra_charges     numeric NOT NULL DEFAULT 0,
  quantity          int NOT NULL DEFAULT 1,
  current_store_id  bigint REFERENCES public.stores (id),
  status            text NOT NULL DEFAULT 'In Stock',
  comment           text,
  created_by        text,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchases_read" ON public.purchases;
CREATE POLICY "purchases_read" ON public.purchases FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "purchases_write" ON public.purchases;
CREATE POLICY "purchases_write" ON public.purchases FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "purchases_update" ON public.purchases;
CREATE POLICY "purchases_update" ON public.purchases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "purchases_delete" ON public.purchases;
CREATE POLICY "purchases_delete" ON public.purchases FOR DELETE TO authenticated USING (true);

-- 2. Realtime ----------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchases']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 3. List the ledger ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_get_purchases()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'purchased_at', to_char(p.purchased_at, 'YYYY-MM-DD HH24:MI:SS'),
      'brand', p.brand,
      'brand_model', p.brand_model,
      'serial_number', p.serial_number,
      'processor', p.processor,
      'generation', p.generation,
      'ram', p.ram,
      'storage', p.storage,
      'graphics', p.graphics,
      'purchased_from', p.purchased_from,
      'purchase_rate', p.purchase_rate,
      'extra_charges', p.extra_charges,
      'quantity', p.quantity,
      'current_store_id', p.current_store_id,
      'current_store_name', s.store_name,
      'status', p.status,
      'comment', p.comment,
      'created_by', p.created_by,
      'created_at', to_char(p.created_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY p.purchased_at DESC, p.id DESC), '[]'::jsonb) INTO v_out
  FROM public.purchases p
  LEFT JOIN public.stores s ON s.id = p.current_store_id;
  RETURN v_out;
END $$;

-- 4. Summary: money spent -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_purchases_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT jsonb_build_object(
      'total_units',   COALESCE(SUM(quantity), 0),
      'total_rate',    COALESCE(SUM(purchase_rate * quantity), 0),
      'total_charges', COALESCE(SUM(extra_charges * quantity), 0),
      'total_value',   COALESCE(SUM((purchase_rate + extra_charges) * quantity), 0),
      'month_units',   COALESCE(SUM(quantity) FILTER (WHERE purchased_at >= date_trunc('month', now())), 0),
      'month_value',   COALESCE(SUM((purchase_rate + extra_charges) * quantity)
                        FILTER (WHERE purchased_at >= date_trunc('month', now())), 0))
    INTO v_out FROM public.purchases;
  RETURN v_out;
END $$;

-- 5. Create a purchase record -------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_create_purchase(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  INSERT INTO public.purchases (
    purchased_at, brand, brand_model, serial_number, processor, generation, ram, storage,
    graphics, purchased_from, purchase_rate, extra_charges, quantity, current_store_id, status, comment
  ) VALUES (
    COALESCE(NULLIF(btrim(COALESCE(p_data->>'purchased_at','')), '')::timestamptz, now()),
    NULLIF(btrim(COALESCE(p_data->>'brand','')), ''),
    NULLIF(btrim(COALESCE(p_data->>'brand_model','')), ''),
    NULLIF(btrim(COALESCE(p_data->>'serial_number','')), ''),
    NULLIF(btrim(COALESCE(p_data->>'processor','')), ''),
    NULLIF(btrim(COALESCE(p_data->>'generation','')), ''),
    NULLIF(btrim(COALESCE(p_data->>'ram','')), ''),
    NULLIF(btrim(COALESCE(p_data->>'storage','')), ''),
    NULLIF(btrim(COALESCE(p_data->>'graphics','')), ''),
    NULLIF(btrim(COALESCE(p_data->>'purchased_from','')), ''),
    COALESCE((p_data->>'purchase_rate')::numeric, 0),
    COALESCE((p_data->>'extra_charges')::numeric, 0),
    GREATEST(COALESCE((p_data->>'quantity')::int, 1), 1),
    CASE WHEN p_data->>'current_store_id' IS NULL OR p_data->>'current_store_id' = '' THEN NULL
         ELSE (p_data->>'current_store_id')::bigint END,
    COALESCE(p_data->>'status','In Stock'),
    NULLIF(btrim(COALESCE(p_data->>'comment','')), '')
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- 6. Update a purchase record -------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_update_purchase(p_id bigint, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchases WHERE id = p_id) THEN RAISE EXCEPTION 'Purchase record not found'; END IF;
  UPDATE public.purchases SET
    purchased_at = COALESCE(NULLIF(btrim(COALESCE(p_data->>'purchased_at','')), '')::timestamptz, purchased_at),
    brand = NULLIF(btrim(COALESCE(p_data->>'brand','')), ''),
    brand_model = NULLIF(btrim(COALESCE(p_data->>'brand_model','')), ''),
    serial_number = NULLIF(btrim(COALESCE(p_data->>'serial_number','')), ''),
    processor = NULLIF(btrim(COALESCE(p_data->>'processor','')), ''),
    generation = NULLIF(btrim(COALESCE(p_data->>'generation','')), ''),
    ram = NULLIF(btrim(COALESCE(p_data->>'ram','')), ''),
    storage = NULLIF(btrim(COALESCE(p_data->>'storage','')), ''),
    graphics = NULLIF(btrim(COALESCE(p_data->>'graphics','')), ''),
    purchased_from = NULLIF(btrim(COALESCE(p_data->>'purchased_from','')), ''),
    purchase_rate = COALESCE((p_data->>'purchase_rate')::numeric, 0),
    extra_charges = COALESCE((p_data->>'extra_charges')::numeric, 0),
    quantity = GREATEST(COALESCE((p_data->>'quantity')::int, quantity), 1),
    current_store_id = CASE WHEN p_data->>'current_store_id' IS NULL OR p_data->>'current_store_id' = '' THEN NULL
                            ELSE (p_data->>'current_store_id')::bigint END,
    status = COALESCE(p_data->>'status','In Stock'),
    comment = NULLIF(btrim(COALESCE(p_data->>'comment','')), ''),
    updated_at = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- 7. Password-guarded delete --------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_delete_purchase(p_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_label text;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT COALESCE(brand_model,'purchase') || ' ' || COALESCE(serial_number,'') INTO v_label FROM public.purchases WHERE id = p_id;
  IF v_label IS NULL THEN RAISE EXCEPTION 'Purchase record not found'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  DELETE FROM public.purchases WHERE id = p_id;
  PERFORM public.app_log_delete('purchase', p_id, v_label, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

GRANT EXECUTE ON FUNCTION public.app_get_purchases() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_purchases_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_create_purchase(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_update_purchase(bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_delete_purchase(bigint, text, text) TO authenticated;