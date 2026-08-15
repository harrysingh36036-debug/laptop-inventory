-- ---------------------------------------------------------------------------
-- Delta: laptops spec columns were never applied to this project's live DB
-- (supabase-product-line-ram.sql + supabase-purchase-fields.sql were missing).
-- Adds the columns and re-creates the CRUD helpers that carry them.
-- purchase_comment stays optional in DB (frontend InventoryModal sends it via
-- handleSave payload, but keep permissive to avoid breaking existing flows).
-- ---------------------------------------------------------------------------

ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS product_line text;
ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS ram text;
ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS charger text;
ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS purchase_comment text;
ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS purchaser_aadhar_hash text;

COMMENT ON COLUMN public.laptops.product_line IS 'e.g. Inspiron, ThinkPad, Pavilion, ROG';
COMMENT ON COLUMN public.laptops.ram IS 'e.g. 8 GB, 16 GB, 32 GB';
COMMENT ON COLUMN public.laptops.charger IS 'with | without — charger included with purchase';
COMMENT ON COLUMN public.laptops.purchase_comment IS 'mandatory purchase/entry comment';
COMMENT ON COLUMN public.laptops.purchaser_aadhar_hash IS 'SHA-256(salt:aadhar) — never stores the raw number';

-- Normalize: carry the new fields
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
    'purchaser_aadhar_hash', NULLIF(btrim(COALESCE(p_data->>'purchaser_aadhar_hash','')), '')
  );
END $$;

-- Single create: store the new columns
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
  INSERT INTO public.laptops (brand, brand_model, product_line, processor_type, ram, generation, storage_type, storage_size, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status, charger, purchase_comment, purchaser_aadhar_hash)
  VALUES (v_l->>'brand', v_l->>'brand_model', v_l->>'product_line', v_l->>'processor_type', v_l->>'ram', v_l->>'generation', v_l->>'storage_type', v_l->>'storage_size', v_l->>'purchased_from', v_l->>'graphics', v_l->>'graphics_type', v_l->>'graphics_model', (v_l->>'purchase_rate')::numeric, (v_l->>'extra_charges')::numeric, v_serial, (v_l->>'current_store_id')::bigint, v_l->>'status', v_l->>'charger', v_l->>'purchase_comment', v_l->>'purchaser_aadhar_hash')
  RETURNING id INTO v_id;
  RETURN public.app_laptop_json(v_id);
END $$;

-- Bulk create: same columns
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
    INSERT INTO public.laptops (brand, brand_model, product_line, processor_type, ram, generation, storage_type, storage_size, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status, charger, purchase_comment, purchaser_aadhar_hash)
    VALUES (v_l->>'brand', v_l->>'brand_model', v_l->>'product_line', v_l->>'processor_type', v_l->>'ram', v_l->>'generation', v_l->>'storage_type', v_l->>'storage_size', v_l->>'purchased_from', v_l->>'graphics', v_l->>'graphics_type', v_l->>'graphics_model', (v_l->>'purchase_rate')::numeric, (v_l->>'extra_charges')::numeric, v_serial, (v_l->>'current_store_id')::bigint, v_l->>'status', v_l->>'charger', v_l->>'purchase_comment', v_l->>'purchaser_aadhar_hash')
    RETURNING id INTO v_id;
    v_result := v_result || jsonb_build_array(public.app_laptop_json(v_id));
  END LOOP;
  RETURN jsonb_build_object('laptops', v_result);
END $$;

-- Update: set the new columns (comment optional on edit)
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
    updated_at = now()
  WHERE id = p_id;
  RETURN public.app_laptop_json(p_id);
END $$;

-- Laptop payload helper: expose the new fields
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
      'created_at', to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS'),
      'updated_at', to_char(l.updated_at, 'YYYY-MM-DD HH24:MI:SS')
    ) INTO v_row
  FROM public.laptops l LEFT JOIN public.stores s ON s.id = l.current_store_id
  WHERE l.id = p_id;
  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.app_create_laptop(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_bulk_create_laptops(jsonb, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_update_laptop(bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_laptop_json(bigint) TO authenticated;