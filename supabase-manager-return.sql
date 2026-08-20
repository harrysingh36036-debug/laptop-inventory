-- ============================================================================
-- Delta: Managers can accept returns only for their own store
--   app_delete_sale (the "return sale" flow) was superadmin-only. Now admins
--   and superadmins keep full access, and a manager may return a sale only if
--   it was made from their home store. Password/remarks guard unchanged.
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_delete_sale(p_sale_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.sales%ROWTYPE;
  v_laptop_id bigint;
  v_store bigint;
  v_role text := public.app_role();
  v_home bigint;
BEGIN
  IF v_role NOT IN ('superadmin','admin','manager') THEN
    RAISE EXCEPTION 'Only an admin or the store manager can process a return';
  END IF;
  SELECT * INTO v_row FROM public.sales WHERE id = p_sale_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  -- Managers may only return sales that were made from their own store.
  IF v_role = 'manager' THEN
    v_home := (SELECT home_store_id FROM public.profiles WHERE id = auth.uid());
    IF v_row.store_id IS DISTINCT FROM v_home THEN
      RAISE EXCEPTION 'You can only return sales made from your own store';
    END IF;
  END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  v_laptop_id := v_row.laptop_id;
  v_store := v_row.store_id;
  DELETE FROM public.sales WHERE id = p_sale_id;
  UPDATE public.laptops
     SET status = 'In Stock', updated_at = now()
   WHERE id = v_laptop_id AND status = 'Sold';
  PERFORM public.app_log_delete('sale', p_sale_id, v_row.brand_model || ' ' || COALESCE(v_row.serial_number,''), p_remarks);
  RETURN jsonb_build_object('ok', true, 'deleted_sale_id', p_sale_id, 'laptop_id', v_laptop_id, 'store_id', v_store);
END $$;

GRANT EXECUTE ON FUNCTION public.app_delete_sale(bigint, text, text) TO authenticated;