-- ============================================================================
-- Delta: Add purchaser name + phone (mandatory on purchase)
--  1. Add columns to laptops + purchases
--  2. Update app_get_laptops, app_get_purchases to return them for admins
--  3. Update app_normalize_laptop, app_create_laptop, app_bulk_create_laptops,
--     app_update_laptop, app_create_purchase, app_update_purchase
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Add columns
ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS purchaser_name text;
ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS purchaser_phone text;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS purchaser_name text;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS purchaser_phone text;

-- 2. Update app_get_laptops
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
      'purchaser_name', CASE WHEN public.app_role() IN ('admin','superadmin') THEN l.purchaser_name ELSE NULL END,
      'purchaser_phone', CASE WHEN public.app_role() IN ('admin','superadmin') THEN l.purchaser_phone ELSE NULL END,
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

-- 3. Update app_get_purchases
CREATE OR REPLACE FUNCTION public.app_get_purchases()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
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
      'purchaser_name', CASE WHEN public.app_role() IN ('admin','superadmin') THEN p.purchaser_name ELSE NULL END,
      'purchaser_phone', CASE WHEN public.app_role() IN ('admin','superadmin') THEN p.purchaser_phone ELSE NULL END,
      'created_by', p.created_by,
      'created_at', to_char(p.created_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY p.purchased_at DESC, p.id DESC), '[]'::jsonb) INTO v_out
  FROM public.purchases p
  LEFT JOIN public.stores s ON s.id = p.current_store_id;
  RETURN v_out;
END $$;

-- 4. Update app_normalize_laptop
CREATE OR REPLACE FUNCTION public.app_normalize_laptop(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'brand', NULLIF(btrim(COALESCE(p_data->>'brand','')), ''),
    'brand_model', NULLIF(btrim(COALESCE(p_data->>'brand_model','')), ''),
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
    'purchaser_aadhar', NULLIF(btrim(COALESCE(p_data->>'purchaser_aadhar','')), ''),
    'purchaser_name', NULLIF(btrim(COALESCE(p_data->>'purchaser_name','')), ''),
    'purchaser_phone', NULLIF(btrim(COALESCE(p_data->>'purchaser_phone','')), '')
  );
END $$;

-- 5. Update app_create_laptop
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
  INSERT INTO public.laptops (brand, brand_model, product_line, processor_type, ram, generation, storage_type, storage_size, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status, charger, purchase_comment, purchaser_aadhar_hash, purchaser_aadhar, purchaser_name, purchaser_phone)
  VALUES (v_l->>'brand', v_l->>'brand_model', v_l->>'product_line', v_l->>'processor_type', v_l->>'ram', v_l->>'generation', v_l->>'storage_type', v_l->>'storage_size', v_l->>'purchased_from', v_l->>'graphics', v_l->>'graphics_type', v_l->>'graphics_model', (v_l->>'purchase_rate')::numeric, (v_l->>'extra_charges')::numeric, v_serial, (v_l->>'current_store_id')::bigint, v_l->>'status', v_l->>'charger', v_l->>'purchase_comment', v_l->>'purchaser_aadhar_hash', v_l->>'purchaser_aadhar', v_l->>'purchaser_name', v_l->>'purchaser_phone')
  RETURNING id INTO v_id;
  RETURN public.app_laptop_json(v_id);
END $$;

-- 6. Update app_bulk_create_laptops
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
    INSERT INTO public.laptops (brand, brand_model, product_line, processor_type, ram, generation, storage_type, storage_size, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status, charger, purchase_comment, purchaser_aadhar_hash, purchaser_aadhar, purchaser_name, purchaser_phone)
    VALUES (v_l->>'brand', v_l->>'brand_model', v_l->>'product_line', v_l->>'processor_type', v_l->>'ram', v_l->>'generation', v_l->>'storage_type', v_l->>'storage_size', v_l->>'purchased_from', v_l->>'graphics', v_l->>'graphics_type', v_l->>'graphics_model', (v_l->>'purchase_rate')::numeric, (v_l->>'extra_charges')::numeric, v_serial, (v_l->>'current_store_id')::bigint, v_l->>'status', v_l->>'charger', v_l->>'purchase_comment', v_l->>'purchaser_aadhar_hash', v_l->>'purchaser_aadhar', v_l->>'purchaser_name', v_l->>'purchaser_phone')
    RETURNING id INTO v_id;
    v_result := v_result || jsonb_build_array(public.app_laptop_json(v_id));
  END LOOP;
  RETURN jsonb_build_object('laptops', v_result);
END $$;

-- 7. Update app_update_laptop
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
  v_l := public.app_normalize_laptop(p_data);
  UPDATE public.laptops SET
    brand = COALESCE(v_l->>'brand', brand),
    brand_model = COALESCE(v_l->>'brand_model', brand_model),
    product_line = COALESCE(v_l->>'product_line', product_line),
    processor_type = COALESCE(v_l->>'processor_type', processor_type),
    ram = COALESCE(v_l->>'ram', ram),
    generation = COALESCE(v_l->>'generation', generation),
    storage_type = COALESCE(v_l->>'storage_type', storage_type),
    storage_size = COALESCE(v_l->>'storage_size', storage_size),
    purchased_from = COALESCE(v_l->>'purchased_from', purchased_from),
    graphics = COALESCE(v_l->>'graphics', graphics),
    graphics_type = COALESCE(v_l->>'graphics_type', graphics_type),
    graphics_model = COALESCE(v_l->>'graphics_model', graphics_model),
    purchase_rate = COALESCE(v_l->>'purchase_rate', purchase_rate),
    extra_charges = COALESCE(v_l->>'extra_charges', extra_charges),
    serial_number = COALESCE(v_l->>'serial_number', serial_number),
    current_store_id = COALESCE(v_l->>'current_store_id', current_store_id),
    status = COALESCE(v_l->>'status', status),
    charger = COALESCE(v_l->>'charger', charger),
    purchase_comment = COALESCE(v_l->>'purchase_comment', purchase_comment),
    purchaser_aadhar_hash = COALESCE(v_l->>'purchaser_aadhar_hash', purchaser_aadhar_hash),
    purchaser_aadhar = COALESCE(v_l->>'purchaser_aadhar', purchaser_aadhar),
    purchaser_name = COALESCE(v_l->>'purchaser_name', purchaser_name),
    purchaser_phone = COALESCE(v_l->>'purchaser_phone', purchaser_phone),
    updated_at = now()
  WHERE id = p_id;
  RETURN public.app_laptop_json(p_id);
END $$;

-- 8. Update app_create_purchase
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
    graphics, purchased_from, purchase_rate, extra_charges, quantity, current_store_id, status, comment,
    purchaser_aadhar_hash, purchaser_aadhar, purchaser_name, purchaser_phone
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
    NULLIF(btrim(COALESCE(p_data->>'purchaser_aadhar','')), ''),
    NULLIF(btrim(COALESCE(p_data->>'purchaser_name','')), ''),
    NULLIF(btrim(COALESCE(p_data->>'purchaser_phone','')), '')
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
      status, purchase_comment, purchaser_aadhar_hash, purchaser_aadhar, purchaser_name, purchaser_phone,
      created_at, updated_at
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
      NULLIF(btrim(COALESCE(p_data->>'purchaser_name','')), ''),
      NULLIF(btrim(COALESCE(p_data->>'purchaser_phone','')), ''),
      now(), now()
    ) RETURNING id INTO v_laptop_id;
    IF i > 1 OR NULLIF(btrim(COALESCE(p_data->>'serial_number','')), '') IS NULL THEN
      v_serial := NULL;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- 9. Update app_update_purchase
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
    purchaser_name = NULLIF(btrim(COALESCE(p_data->>'purchaser_name','')), ''),
    purchaser_phone = NULLIF(btrim(COALESCE(p_data->>'purchaser_phone','')), ''),
    updated_at = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;
