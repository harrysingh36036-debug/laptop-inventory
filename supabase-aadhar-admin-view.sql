-- ============================================================================
-- Delta: Admin-visible full Aadhar
--   Adds a plaintext `purchaser_aadhar` column on `laptops` and `purchases` so
--   admins / the super admin can view the full 12-digit Aadhar in the Purchase
--   / Inventory Details panel. The existing `purchaser_aadhar_hash` (SHA-256)
--   is kept for non-admins and integrity checks. The raw number is only ever
--   returned to admins/superadmins by the RPCs below.
-- Applies after: supabase-laptops-spec-columns.sql, supabase-ui-features-batch.sql,
--   supabase-purchase-ledger.sql, supabase-sell-aadhar.sql.
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Columns -----------------------------------------------------------------
ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS purchaser_aadhar text;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS purchaser_aadhar text;

COMMENT ON COLUMN public.laptops.purchaser_aadhar IS 'Full Aadhar number — only exposed to admins/superadmin by the RPC layer';
COMMENT ON COLUMN public.purchases.purchaser_aadhar IS 'Full Aadhar number — only exposed to admins/superadmin by the RPC layer';

-- 2. Laptop normalize: carry the new field -----------------------------------
CREATE OR REPLACE FUNCTION public.app_normalize_laptop(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_brand text := COALESCE(btrim(p_data->>'brand'), '');
  v_model text := COALESCE(btrim(p_data->>'brand_model'), '');
BEGIN
  RETURN jsonb_build_object(
    'brand', v_brand,
    'brand_model', CASE WHEN v_model = '' THEN v_brand || COALESCE(p_data->>'model','') ELSE v_model END,
    'product_line', NULLIF(btrim(COALESCE(p_data->>'product_line','')), ''),
    'processor_type', NULLIF(btrim(COALESCE(p_data->>'processor_type','')), ''),
    'ram', NULLIF(btrim(COALESCE(p_data->>'ram','')), ''),
    'generation', NULLIF(btrim(COALESCE(p_data->>'generation','')), ''),
    'storage_type', NULLIF(btrim(COALESCE(p_data->>'storage_type','')), ''),
    'storage_size', NULLIF(btrim(COALESCE(p_data->>'storage_size','')), ''),
    'purchased_from', NULLIF(btrim(COALESCE(p_data->>'purchased_from','')), ''),
    'graphics', NULLIF(btrim(COALESCE(p_data->>'graphics','')), ''),
    'graphics_type', NULLIF(btrim(COALESCE(p_data->>'graphics_type','')), ''),
    'graphics_model', NULLIF(btrim(COALESCE(p_data->>'graphics_model','')), ''),
    'purchase_rate', CASE WHEN p_data->>'purchase_rate' IS NULL OR p_data->>'purchase_rate' = '' THEN NULL
                          ELSE (p_data->>'purchase_rate')::numeric END,
    'extra_charges', CASE WHEN p_data->>'extra_charges' IS NULL OR p_data->>'extra_charges' = '' THEN NULL
                          ELSE (p_data->>'extra_charges')::numeric END,
    'serial_number', NULLIF(btrim(COALESCE(p_data->>'serial_number','')), ''),
    'current_store_id', CASE WHEN p_data->>'current_store_id' IS NULL OR p_data->>'current_store_id' = '' THEN NULL
                             ELSE (p_data->>'current_store_id')::bigint END,
    'status', COALESCE(p_data->>'status','In Stock'),
    'charger', NULLIF(btrim(COALESCE(p_data->>'charger','')), ''),
    'purchase_comment', NULLIF(btrim(COALESCE(p_data->>'purchase_comment','')), ''),
    'purchaser_aadhar_hash', NULLIF(btrim(COALESCE(p_data->>'purchaser_aadhar_hash','')), ''),
    'purchaser_aadhar', NULLIF(btrim(COALESCE(p_data->>'purchaser_aadhar','')), '')
  );
END $$;

-- 3. Laptop create (single) ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_create_laptop(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_l jsonb := public.app_normalize_laptop(p_data);
  v_id bigint;
  v_serial text := NULLIF(btrim(COALESCE(p_data->>'serial_number','')), '');
  v_prefix text;
  v_brand_row public.brands%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF v_l->>'brand' = '' THEN RAISE EXCEPTION 'brand is required'; END IF;
  IF v_l->>'brand_model' = '' THEN RAISE EXCEPTION 'brand_model is required'; END IF;
  IF v_l->>'status' NOT IN ('In Stock','In Transit','Sold') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF v_serial IS NULL THEN
    SELECT * INTO v_brand_row FROM public.brands WHERE name = btrim(v_l->>'brand') LIMIT 1;
    v_prefix := NULLIF(btrim(COALESCE(p_data->>'serial_prefix','')), '');
    IF v_brand_row.id IS NOT NULL THEN v_prefix := COALESCE(v_prefix, v_brand_row.serial_prefix); END IF;
    v_prefix := COALESCE(v_prefix, v_l->>'brand');
    IF v_prefix = '' THEN RAISE EXCEPTION 'serial_number is required (no brand prefix is set for this brand)'; END IF;
    v_serial := public.app_next_serial(v_prefix);
    WHILE EXISTS (SELECT 1 FROM public.laptops WHERE serial_number = v_serial) LOOP
      v_serial := public.app_next_serial(v_prefix || 'X');
    END LOOP;
  END IF;
  IF EXISTS (SELECT 1 FROM public.laptops WHERE serial_number = v_serial) THEN
    RAISE EXCEPTION 'Serial % already exists', v_serial;
  END IF;
  INSERT INTO public.laptops (brand, brand_model, product_line, processor_type, ram, generation, storage_type, storage_size, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status, charger, purchase_comment, purchaser_aadhar_hash, purchaser_aadhar)
  VALUES (v_l->>'brand', v_l->>'brand_model', v_l->>'product_line', v_l->>'processor_type', v_l->>'ram', v_l->>'generation', v_l->>'storage_type', v_l->>'storage_size', v_l->>'purchased_from', v_l->>'graphics', v_l->>'graphics_type', v_l->>'graphics_model', (v_l->>'purchase_rate')::numeric, (v_l->>'extra_charges')::numeric, v_serial, (v_l->>'current_store_id')::bigint, v_l->>'status', v_l->>'charger', v_l->>'purchase_comment', v_l->>'purchaser_aadhar_hash', v_l->>'purchaser_aadhar')
  RETURNING id INTO v_id;
  RETURN public.app_laptop_json(v_id);
END $$;

-- 4. Laptop bulk create --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_bulk_create_laptops(p_data jsonb, p_quantity int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_l jsonb;
  v_serial text;
  v_id bigint;
  v_result jsonb := '[]'::jsonb;
  v_prefix text := COALESCE(NULLIF(btrim(COALESCE(p_data->>'serial_prefix','')), ''), NULLIF(btrim(COALESCE(p_data->>'brand','')), ''));
  v_brand_row public.brands%ROWTYPE;
  i int;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF p_quantity < 1 OR p_quantity > 1000 THEN RAISE EXCEPTION 'quantity must be between 1 and 1000'; END IF;
  SELECT * INTO v_brand_row FROM public.brands WHERE name = btrim(COALESCE(p_data->>'brand','')) LIMIT 1;
  IF v_brand_row.id IS NOT NULL THEN v_prefix := COALESCE(v_prefix, v_brand_row.serial_prefix); END IF;
  IF COALESCE(v_prefix,'') = '' THEN RAISE EXCEPTION 'Could not determine serial prefix. Add this brand first or provide a prefix.'; END IF;
  v_l := public.app_normalize_laptop(p_data);
  IF v_l->>'brand' = '' THEN RAISE EXCEPTION 'brand is required'; END IF;
  IF v_l->>'brand_model' = '' THEN RAISE EXCEPTION 'brand_model is required'; END IF;
  FOR i IN 1..p_quantity LOOP
    v_serial := public.app_next_serial(v_prefix);
    WHILE EXISTS (SELECT 1 FROM public.laptops WHERE serial_number = v_serial) LOOP
      v_serial := public.app_next_serial(v_prefix || 'X');
    END LOOP;
    INSERT INTO public.laptops (brand, brand_model, product_line, processor_type, ram, generation, storage_type, storage_size, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status, charger, purchase_comment, purchaser_aadhar_hash, purchaser_aadhar)
    VALUES (v_l->>'brand', v_l->>'brand_model', v_l->>'product_line', v_l->>'processor_type', v_l->>'ram', v_l->>'generation', v_l->>'storage_type', v_l->>'storage_size', v_l->>'purchased_from', v_l->>'graphics', v_l->>'graphics_type', v_l->>'graphics_model', (v_l->>'purchase_rate')::numeric, (v_l->>'extra_charges')::numeric, v_serial, (v_l->>'current_store_id')::bigint, v_l->>'status', v_l->>'charger', v_l->>'purchase_comment', v_l->>'purchaser_aadhar_hash', v_l->>'purchaser_aadhar')
    RETURNING id INTO v_id;
    v_result := v_result || jsonb_build_array(public.app_laptop_json(v_id));
  END LOOP;
  RETURN jsonb_build_object('laptops', v_result);
END $$;

-- 5. Laptop update -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_update_laptop(p_id bigint, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cur public.laptops%ROWTYPE;
  v_l jsonb;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO v_cur FROM public.laptops WHERE id = p_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  v_l := public.app_normalize_laptop(p_data || jsonb_build_object('brand_model', COALESCE(NULLIF(p_data->>'brand_model',''), v_cur.brand_model)));
  IF v_l->>'brand' = '' THEN v_l := jsonb_set(v_l, '{brand}', to_jsonb(v_cur.brand)); END IF;
  IF v_l->>'status' NOT IN ('In Stock','In Transit','Sold') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF v_l->>'status' = 'Sold' THEN RAISE EXCEPTION 'Use the Sell action to record a sale (sold units are tracked on the Sales board)'; END IF;
  IF v_cur.status = 'Sold' THEN RAISE EXCEPTION 'Sold units are final; delete the laptop to remove it'; END IF;
  UPDATE public.laptops SET
    brand = v_l->>'brand',
    brand_model = v_l->>'brand_model',
    product_line = v_l->>'product_line',
    processor_type = v_l->>'processor_type',
    ram = v_l->>'ram',
    generation = v_l->>'generation',
    storage_type = v_l->>'storage_type',
    storage_size = v_l->>'storage_size',
    purchased_from = v_l->>'purchased_from',
    graphics = v_l->>'graphics',
    graphics_type = v_l->>'graphics_type',
    graphics_model = v_l->>'graphics_model',
    purchase_rate = (v_l->>'purchase_rate')::numeric,
    extra_charges = (v_l->>'extra_charges')::numeric,
    current_store_id = (v_l->>'current_store_id')::bigint,
    status = v_l->>'status',
    charger = COALESCE(v_l->>'charger', v_cur.charger),
    purchase_comment = COALESCE(v_l->>'purchase_comment', v_cur.purchase_comment),
    purchaser_aadhar_hash = COALESCE(v_l->>'purchaser_aadhar_hash', v_cur.purchaser_aadhar_hash),
    purchaser_aadhar = COALESCE(v_l->>'purchaser_aadhar', v_cur.purchaser_aadhar),
    updated_at = now()
  WHERE id = p_id;
  RETURN public.app_laptop_json(p_id);
END $$;

-- 6. Laptop payload helper -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_laptop_json(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row jsonb;
BEGIN
  SELECT jsonb_build_object(
      'id', l.id,
      'brand', l.brand,
      'brand_model', l.brand_model,
      'product_line', l.product_line,
      'processor_type', l.processor_type,
      'ram', l.ram,
      'generation', l.generation,
      'storage_type', l.storage_type,
      'storage_size', l.storage_size,
      'purchased_from', l.purchased_from,
      'graphics', l.graphics,
      'graphics_type', l.graphics_type,
      'graphics_model', l.graphics_model,
      'purchase_rate', l.purchase_rate,
      'extra_charges', l.extra_charges,
      'serial_number', l.serial_number,
      'current_store_id', l.current_store_id,
      'current_store_name', s.store_name,
      'status', l.status,
      'charger', l.charger,
      'purchase_comment', l.purchase_comment,
      'purchaser_aadhar_hash', l.purchaser_aadhar_hash,
      'purchaser_aadhar', l.purchaser_aadhar,
      'created_at', to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS'),
      'updated_at', to_char(l.updated_at, 'YYYY-MM-DD HH24:MI:SS')
    ) INTO v_row
  FROM public.laptops l LEFT JOIN public.stores s ON s.id = l.current_store_id
  WHERE l.id = p_id;
  RETURN v_row;
END $$;

-- 7. List laptops: expose full aadhar only to admins --------------------------
CREATE OR REPLACE FUNCTION public.app_get_laptops(p_store_id bigint DEFAULT NULL, p_status text DEFAULT NULL, p_search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id, 'brand', l.brand, 'brand_model', l.brand_model,
      'product_line', l.product_line,
      'processor_type', l.processor_type, 'ram', l.ram, 'generation', l.generation, 'storage_type', l.storage_type,
      'storage_size', l.storage_size,
      'purchased_from', l.purchased_from, 'graphics', l.graphics, 'graphics_type', l.graphics_type,
      'graphics_model', l.graphics_model, 'purchase_rate', l.purchase_rate, 'extra_charges', l.extra_charges,
      'serial_number', l.serial_number, 'current_store_id', l.current_store_id,
      'current_store_name', s.store_name, 'status', l.status,
      'charger', l.charger, 'purchase_comment', l.purchase_comment,
      'purchaser_aadhar_hash', CASE WHEN public.app_role() IN ('admin','superadmin') THEN l.purchaser_aadhar_hash ELSE NULL END,
      'purchaser_aadhar', CASE WHEN public.app_role() IN ('admin','superadmin') THEN l.purchaser_aadhar ELSE NULL END,
      'sale_price', sl.sale_price, 'sale_customer_name', c.name, 'sold_at', to_char(sl.sold_at, 'YYYY-MM-DD HH24:MI:SS'), 'sold_by', sl.sold_by,
      'created_at', to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS'),
      'updated_at', to_char(l.updated_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY l.updated_at DESC), '[]'::jsonb) INTO v_out
  FROM public.laptops l
  LEFT JOIN public.stores s ON s.id = l.current_store_id
  LEFT JOIN public.sales sl ON sl.laptop_id = l.id AND sl.id = (
    SELECT id FROM public.sales WHERE laptop_id = l.id ORDER BY sold_at DESC, id DESC LIMIT 1
  )
  LEFT JOIN public.customers c ON c.id = sl.customer_id
  WHERE (p_store_id IS NULL OR l.current_store_id = p_store_id)
    AND (
      (p_status IS NULL AND l.status <> 'Sold')
      OR (p_status IS NOT NULL AND l.status = p_status)
    )
    AND (p_search IS NULL OR l.brand ILIKE '%' || p_search || '%' OR l.brand_model ILIKE '%' || p_search || '%' OR l.serial_number ILIKE '%' || p_search || '%');
  RETURN v_out;
END $$;

-- 8. Purchases: carry the field -----------------------------------------------
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
      'purchaser_aadhar_hash', CASE WHEN public.app_role() IN ('admin','superadmin') THEN p.purchaser_aadhar_hash ELSE NULL END,
      'purchaser_aadhar', CASE WHEN public.app_role() IN ('admin','superadmin') THEN p.purchaser_aadhar ELSE NULL END,
      'created_by', p.created_by,
      'created_at', to_char(p.created_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY p.purchased_at DESC, p.id DESC), '[]'::jsonb) INTO v_out
  FROM public.purchases p
  LEFT JOIN public.stores s ON s.id = p.current_store_id;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_create_purchase(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_qty int := GREATEST(COALESCE((p_data->>'quantity')::int, 1), 1);
  v_serial text;
  v_prefix text;
  v_brand_row public.brands%ROWTYPE;
  v_laptop_id bigint;
  v_store bigint;
  i int;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  INSERT INTO public.purchases (
    purchased_at, brand, brand_model, serial_number, processor, generation, ram, storage,
    graphics, purchased_from, purchase_rate, extra_charges, quantity, current_store_id, status, comment, purchaser_aadhar_hash, purchaser_aadhar
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
    v_qty,
    CASE WHEN p_data->>'current_store_id' IS NULL OR p_data->>'current_store_id' = '' THEN NULL
         ELSE (p_data->>'current_store_id')::bigint END,
    COALESCE(p_data->>'status','In Stock'),
    NULLIF(btrim(COALESCE(p_data->>'comment','')), ''),
    NULLIF(btrim(COALESCE(p_data->>'purchaser_aadhar_hash','')), ''),
    NULLIF(btrim(COALESCE(p_data->>'purchaser_aadhar','')), '')
  ) RETURNING id INTO v_id;

  v_store := CASE WHEN p_data->>'current_store_id' IS NULL OR p_data->>'current_store_id' = '' THEN NULL
                  ELSE (p_data->>'current_store_id')::bigint END;
  v_serial := NULLIF(btrim(COALESCE(p_data->>'serial_number','')), '');
  IF v_serial IS NULL THEN
    SELECT * INTO v_brand_row FROM public.brands WHERE name = btrim(COALESCE(p_data->>'brand','')) LIMIT 1;
    IF v_brand_row.id IS NOT NULL THEN v_prefix := v_brand_row.serial_prefix; END IF;
    v_prefix := COALESCE(v_prefix, btrim(COALESCE(p_data->>'brand','')));
  END IF;
  FOR i IN 1..v_qty LOOP
    IF i > 1 OR v_serial IS NULL THEN
      v_serial := public.app_next_serial(v_prefix);
      WHILE EXISTS (SELECT 1 FROM public.laptops WHERE serial_number = v_serial) LOOP
        v_serial := public.app_next_serial(v_prefix || 'X');
      END LOOP;
    END IF;
    INSERT INTO public.laptops (
      brand, brand_model, processor_type, ram, generation, storage_size, purchased_from,
      graphics, graphics_type, purchase_rate, extra_charges, serial_number, current_store_id,
      status, purchase_comment, purchaser_aadhar_hash, purchaser_aadhar, created_at, updated_at
    ) VALUES (
      NULLIF(btrim(COALESCE(p_data->>'brand','')), ''),
      NULLIF(btrim(COALESCE(p_data->>'brand_model','')), ''),
      NULLIF(btrim(COALESCE(p_data->>'processor','')), ''),
      NULLIF(btrim(COALESCE(p_data->>'ram','')), ''),
      NULLIF(btrim(COALESCE(p_data->>'generation','')), ''),
      NULLIF(btrim(COALESCE(p_data->>'storage','')), ''),
      NULLIF(btrim(COALESCE(p_data->>'purchased_from','')), ''),
      COALESCE(NULLIF(btrim(COALESCE(p_data->>'graphics','')), ''), 'no'),
      CASE WHEN btrim(COALESCE(p_data->>'graphics','')) = 'yes' THEN 'integrated' ELSE NULL END,
      COALESCE((p_data->>'purchase_rate')::numeric, 0),
      COALESCE((p_data->>'extra_charges')::numeric, 0),
      v_serial,
      v_store,
      COALESCE(p_data->>'status','In Stock'),
      NULLIF(btrim(COALESCE(p_data->>'comment','')), ''),
      NULLIF(btrim(COALESCE(p_data->>'purchaser_aadhar_hash','')), ''),
      NULLIF(btrim(COALESCE(p_data->>'purchaser_aadhar','')), ''),
      now(), now()
    ) RETURNING id INTO v_laptop_id;
    IF i > 1 OR NULLIF(btrim(COALESCE(p_data->>'serial_number','')), '') IS NULL THEN
      v_serial := NULL;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

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
    purchaser_aadhar_hash = NULLIF(btrim(COALESCE(p_data->>'purchaser_aadhar_hash','')), ''),
    purchaser_aadhar = NULLIF(btrim(COALESCE(p_data->>'purchaser_aadhar','')), ''),
    updated_at = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- 9. Sell: also clear the plaintext aadhar on the laptop -----------------------
CREATE OR REPLACE FUNCTION public.app_sell_laptop(
  p_laptop_id bigint,
  p_sale_price numeric,
  p_sold_by text,
  p_customer_id bigint DEFAULT NULL,
  p_purchaser_aadhar_hash text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cur public.laptops%ROWTYPE;
  v_cost numeric;
  v_profit numeric;
  v_row public.sales%ROWTYPE;
  v_store public.stores%ROWTYPE;
  v_customer public.customers%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO v_cur FROM public.laptops WHERE id = p_laptop_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  IF v_cur.status = 'Sold' THEN RAISE EXCEPTION 'Laptop is already sold'; END IF;
  IF p_sale_price IS NULL THEN RAISE EXCEPTION 'sale_price is required'; END IF;
  IF p_customer_id IS NOT NULL THEN
    SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
  END IF;
  v_cost := COALESCE(v_cur.purchase_rate,0) + COALESCE(v_cur.extra_charges,0);
  v_profit := p_sale_price - v_cost;
  INSERT INTO public.sales (laptop_id, serial_number, brand_model, store_id, sale_price, cost_price, profit, sold_by, customer_id)
  VALUES (p_laptop_id, v_cur.serial_number, v_cur.brand_model, v_cur.current_store_id, p_sale_price, v_cost, v_profit, p_sold_by, p_customer_id)
  RETURNING * INTO v_row;
  UPDATE public.laptops
     SET status = 'Sold',
         purchaser_aadhar_hash = NULL,
         purchaser_aadhar = NULL,
         updated_at = now()
   WHERE id = p_laptop_id;
  SELECT * INTO v_store FROM public.stores WHERE id = v_row.store_id;
  RETURN jsonb_build_object(
    'sale', jsonb_build_object(
      'id', v_row.id, 'laptop_id', v_row.laptop_id, 'serial_number', v_row.serial_number,
      'brand_model', v_row.brand_model, 'store_id', v_row.store_id, 'store_name', v_store.store_name,
      'sale_price', v_row.sale_price, 'cost_price', v_row.cost_price, 'profit', v_row.profit,
      'sold_by', v_row.sold_by, 'sold_at', to_char(v_row.sold_at, 'YYYY-MM-DD HH24:MI:SS'),
      'customer_id', v_row.customer_id, 'customer_name', v_customer.name)
  );
END $$;

-- 10. Grants ------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.app_create_laptop(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_bulk_create_laptops(jsonb, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_update_laptop(bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_laptop_json(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_get_laptops(bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_get_purchases() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_create_purchase(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_update_purchase(bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_sell_laptop(bigint, numeric, text, bigint, text) TO authenticated;
