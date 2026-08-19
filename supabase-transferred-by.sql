-- ---------------------------------------------------------------------------
-- Transfer history audit: record which account performed each transfer.
-- Sources: superadmin / admin / staff all get recorded via auth.uid().
-- ---------------------------------------------------------------------------

ALTER TABLE public.transferlogs ADD COLUMN IF NOT EXISTS transferred_by text;

-- Record the acting username on transfer (resolved server-side, cannot be spoofed).
CREATE OR REPLACE FUNCTION public.app_transfer_laptop(p_laptop_id bigint, p_to_store bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cur public.laptops%ROWTYPE;
  v_from public.stores%ROWTYPE;
  v_to public.stores%ROWTYPE;
  v_username text;
BEGIN
  IF NOT public.app_perm('transferLaptops') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT username INTO v_username FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_cur FROM public.laptops WHERE id = p_laptop_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  SELECT * INTO v_to FROM public.stores WHERE id = p_to_store;
  IF v_to.id IS NULL THEN RAISE EXCEPTION 'Destination store not found'; END IF;
  SELECT * INTO v_from FROM public.stores WHERE id = v_cur.current_store_id;
  INSERT INTO public.transferlogs (laptop_id, from_store_id, to_store_id, transferred_by)
  VALUES (p_laptop_id, v_cur.current_store_id, p_to_store, COALESCE(v_username, 'system'));
  UPDATE public.laptops SET current_store_id = p_to_store, updated_at = now() WHERE id = p_laptop_id;
  RETURN jsonb_build_object(
    'ok', true,
    'laptop', public.app_laptop_json(p_laptop_id),
    'from', to_jsonb(v_from),
    'to', to_jsonb(v_to),
    'transferred_by', COALESCE(v_username, 'system')
  );
END $$;

-- Include transferred_by in the transfer history feed.
CREATE OR REPLACE FUNCTION public.app_get_transfer_logs(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', tl.id, 'laptop_id', tl.laptop_id, 'from_store_id', tl.from_store_id, 'to_store_id', tl.to_store_id,
      'brand_model', l.brand_model, 'serial_number', l.serial_number,
      'from_store_name', fs.store_name, 'to_store_name', ts.store_name,
      'transferred_by', tl.transferred_by,
      'changed_at', to_char(tl.changed_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY tl.changed_at DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT *
    FROM public.transferlogs
    ORDER BY changed_at DESC
    LIMIT p_limit
  ) tl
  JOIN public.laptops l ON l.id = tl.laptop_id
  LEFT JOIN public.stores fs ON fs.id = tl.from_store_id
  LEFT JOIN public.stores ts ON ts.id = tl.to_store_id
  ;
  RETURN v_out;
END $$;

GRANT EXECUTE ON FUNCTION public.app_transfer_laptop(bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_get_transfer_logs(int) TO authenticated;