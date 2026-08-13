-- ---------------------------------------------------------------------------
-- Super admin can delete a sale record (undo). Also returns the laptop to
-- In Stock so it can be sold again.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_delete_sale(p_sale_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.sales%ROWTYPE;
  v_laptop_id bigint;
  v_store bigint;
BEGIN
  IF public.app_role() <> 'superadmin' THEN RAISE EXCEPTION 'Only the super admin can delete sales'; END IF;
  SELECT * INTO v_row FROM public.sales WHERE id = p_sale_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  v_laptop_id := v_row.laptop_id;
  v_store := v_row.store_id;
  DELETE FROM public.sales WHERE id = p_sale_id;
  -- If the laptop still exists and is still marked Sold, return it to stock.
  UPDATE public.laptops
     SET status = 'In Stock', updated_at = now()
   WHERE id = v_laptop_id AND status = 'Sold';
  RETURN jsonb_build_object(
    'ok', true,
    'deleted_sale_id', p_sale_id,
    'laptop_id', v_laptop_id,
    'store_id', v_store
  );
END $$;

GRANT EXECUTE ON FUNCTION public.app_delete_sale(bigint) TO authenticated;