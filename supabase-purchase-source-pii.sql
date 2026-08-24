-- ============================================================================
-- Delta: Purchase source type (customer | vendor | others) + admin-aligned
--   PII visibility via a `viewPII` role permission.
--
--  1. Adds source_type / source_id to purchases so the ledger records whether
--     a unit was bought from a customer, a vendor or someone else, and links
--     to the customers / vendors tables when applicable.
--  2. PII (purchaser name, phone, Aadhar) is returned by app_get_purchases and
--     app_get_laptops only when public.app_perm('viewPII') is true. Because
--     app_perm() always returns true for admin / superadmin, admins keep full
--     access and can grant/revoke "View PII" for managers and staff in
--     Admin Settings → Roles & Permissions.
-- Applies after: supabase-name-phone.sql, supabase-aadhar-admin-view.sql.
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Columns -----------------------------------------------------------------
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS source_id bigint;

COMMENT ON COLUMN public.purchases.source_type IS 'Where the unit was bought from: customer, vendor or others';
COMMENT ON COLUMN public.purchases.source_id IS 'customer id or vendor id when source_type links to one';

-- 2. List purchases: PII only for users with the viewPII permission -----------
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
      'source_type', p.source_type,
      'source_id', p.source_id,
      'purchase_rate', p.purchase_rate,
      'extra_charges', p.extra_charges,
      'quantity', p.quantity,
      'current_store_id', p.current_store_id,
      'current_store_name', s.store_name,
      'status', p.status,
      'comment', p.comment,
      'purchaser_aadhar_hash', CASE WHEN public.app_perm('viewPII') THEN p.purchaser_aadhar_hash ELSE NULL END,
      'purchaser_aadhar', CASE WHEN public.app_perm('viewPII') THEN p.purchaser_aadhar ELSE NULL END,
      'purchaser_name', CASE WHEN public.app_perm('viewPII') THEN p.purchaser_name ELSE NULL END,
      'purchaser_phone', CASE WHEN public.app_perm('viewPII') THEN p.purchaser_phone ELSE NULL END,
      'created_by', p.created_by,
      'created_at', to_char(p.created_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY p.purchased_at DESC, p.id DESC), '[]'::jsonb) INTO v_out
  FROM public.purchases p
  LEFT JOIN public.stores s ON s.id = p.current_store_id;
  RETURN v_out;
END $$;

-- 3. List laptops: same viewPII gate (app_perm returns true for admins) -------
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
      'purchaser_aadhar_hash', CASE WHEN public.app_perm('viewPII') THEN l.purchaser_aadhar_hash ELSE NULL END,
      'purchaser_aadhar', CASE WHEN public.app_perm('viewPII') THEN l.purchaser_aadhar ELSE NULL END,
      'purchaser_name', CASE WHEN public.app_perm('viewPII') THEN l.purchaser_name ELSE NULL END,
      'purchaser_phone', CASE WHEN public.app_perm('viewPII') THEN l.purchaser_phone ELSE NULL END,
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

-- 4. Create purchase: persist source type + id --------------------------------
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
  v_source_type text := NULLIF(btrim(COALESCE(p_data->>'source_type','')), '');
  i int;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF v_source_type NOT IN ('customer','vendor','others') THEN v_source_type := 'others'; END IF;
  INSERT INTO public.purchases (
    purchased_at, brand, brand_model, serial_number, processor, generation, ram, storage,
    graphics, purchased_from, purchase_rate, extra_charges, quantity, current_store_id, status, comment,
    purchaser_aadhar_hash, purchaser_aadhar, purchaser_name, purchaser_phone,
    source_type, source_id
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
    NULLIF(btrim(COALESCE(p_data->>'purchaser_phone','')), ''),
    v_source_type,
    CASE WHEN p_data->>'source_id' IS NULL OR p_data->>'source_id' = '' THEN NULL
         ELSE (p_data->>'source_id')::bigint END
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

-- 5. Update purchase: persist source type + id --------------------------------
CREATE OR REPLACE FUNCTION public.app_update_purchase(p_id bigint, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_source_type text;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchases WHERE id = p_id) THEN RAISE EXCEPTION 'Purchase record not found'; END IF;
  v_source_type := NULLIF(btrim(COALESCE(p_data->>'source_type','')), '');
  IF v_source_type NOT IN ('customer','vendor','others') THEN v_source_type := NULL; END IF;
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
    source_type = COALESCE(v_source_type, source_type),
    source_id = CASE WHEN p_data->>'source_id' IS NULL OR p_data->>'source_id' = '' THEN source_id
                     ELSE (p_data->>'source_id')::bigint END,
    updated_at = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

GRANT EXECUTE ON FUNCTION public.app_get_purchases() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_get_laptops(bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_create_purchase(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_update_purchase(bigint, jsonb) TO authenticated;