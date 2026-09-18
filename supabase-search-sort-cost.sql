

CREATE OR REPLACE FUNCTION public.app_get_laptops(
  p_store_id bigint DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort_by text DEFAULT 'date',
  p_sort_order text DEFAULT 'desc'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
v_sql text;
v_order text;
v_dir text;
BEGIN
  v_order := CASE WHEN p_sort_by = 'serial' THEN 'l.serial_number'
                  WHEN p_sort_by = 'brand' THEN 'l.brand'
                  WHEN p_sort_by = 'model' THEN 'l.brand_model'
                  ELSE 'l.updated_at' END;
  v_dir := CASE WHEN lower(COALESCE(p_sort_order, '')) = 'asc' THEN 'ASC' ELSE 'DESC' END;
  v_sql := format($fmt$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id, 'brand', l.brand, 'brand_model', l.brand_model,
        'processor_type', l.processor_type, 'generation', l.generation, 'storage_type', l.storage_type,
        'storage_size', l.storage_size,
        'purchased_from', l.purchased_from, 'graphics', l.graphics, 'graphics_type', l.graphics_type,
        'graphics_model', l.graphics_model, 'purchase_rate', l.purchase_rate, 'extra_charges', l.extra_charges,
        'serial_number', l.serial_number, 'current_store_id', l.current_store_id,
        'current_store_name', s.store_name, 'status', l.status, 'type', l.type,
        'sale_price', sl.sale_price, 'sale_customer_name', c.name, 'sold_at', to_char(sl.sold_at, 'YYYY-MM-DD HH24:MI:SS'), 'sold_by', sl.sold_by,
        'created_at', to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS'),
        'updated_at', to_char(l.updated_at, 'YYYY-MM-DD HH24:MI:SS'))
        ORDER BY %s %s), '[]'::jsonb)
    FROM public.laptops l
    LEFT JOIN public.stores s ON s.id = l.current_store_id
    LEFT JOIN public.sales sl ON sl.laptop_id = l.id AND sl.id = (
      SELECT id FROM public.sales WHERE laptop_id = l.id ORDER BY sold_at DESC, id DESC LIMIT 1
    )
    LEFT JOIN public.customers c ON c.id = sl.customer_id
    WHERE (%L IS NULL OR l.current_store_id = %L)
      AND (%L IS NULL OR l.status = %L)
      AND (%L IS NULL OR l.brand ILIKE '%%' || %L || '%%' OR l.brand_model ILIKE '%%' || %L || '%%' OR l.serial_number ILIKE '%%' || %L || '%%' OR l.processor_type ILIKE '%%' || %L || '%%' OR l.generation ILIKE '%%' || %L || '%%' OR l.storage_type ILIKE '%%' || %L || '%%' OR l.storage_size ILIKE '%%' || %L || '%%' OR l.purchased_from ILIKE '%%' || %L || '%%' OR l.status ILIKE '%%' || %L || '%%' OR l.type ILIKE '%%' || %L || '%%' OR l.graphics ILIKE '%%' || %L || '%%' OR l.graphics_model ILIKE '%%' || %L || '%%' OR s.store_name ILIKE '%%' || %L || '%%')
  $fmt$, v_order, v_dir, p_store_id, p_store_id, p_status, p_status, p_search, p_search, p_search, p_search, p_search, p_search, p_search, p_search, p_search, p_search, p_search, p_search, p_search, p_search);
  EXECUTE v_sql INTO v_out;
  RETURN v_out;
END $$;

GRANT EXECUTE ON FUNCTION public.app_get_laptops(bigint, text, text, text, text) TO authenticated;
