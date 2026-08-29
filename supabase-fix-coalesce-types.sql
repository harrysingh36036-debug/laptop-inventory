-- Fix COALESCE type mismatch in app_update_laptop
-- The ->> operator returns text, but columns like purchase_rate are numeric.
-- This causes: COALESCE types text and numeric cannot be matched

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
  IF v_cur.status = 'Sold' THEN RAISE EXCEPTION 'Sold units are final; delete the laptop to remove it'; END IF;
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
    purchase_rate = COALESCE((v_l->>'purchase_rate')::numeric, purchase_rate),
    extra_charges = COALESCE((v_l->>'extra_charges')::numeric, extra_charges),
    serial_number = COALESCE(v_l->>'serial_number', serial_number),
    current_store_id = COALESCE((v_l->>'current_store_id')::bigint, current_store_id),
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
