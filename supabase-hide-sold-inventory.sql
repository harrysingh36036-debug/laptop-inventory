-- Once a laptop is sold it should not appear in the default inventory view.
-- "Any status" now means In Stock + In Transit only. Selecting "Sold" from the
-- status filter (or opening the Sales tab) still shows sold laptops.

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
