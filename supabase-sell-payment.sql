-- ============================================================================
-- Delta: Payment method captured at sale (sell)
--   Adds payment_method + payment_detail columns to public.sales and extends
--   app_sell_laptop to store them. UPI asks for the payee name; Credit Card
--   asks for the machine name; Cash stores no detail.
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_detail text;

-- Extend the sell RPC (new params default NULL so older callers still work).
CREATE OR REPLACE FUNCTION public.app_sell_laptop(
  p_laptop_id bigint,
  p_sale_price numeric,
  p_sold_by text,
  p_customer_id bigint DEFAULT NULL,
  p_purchaser_aadhar_hash text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_payment_detail text DEFAULT NULL)
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
  -- Managers may only sell laptops currently assigned to their own store.
  IF public.app_role() = 'manager' THEN
    IF v_cur.current_store_id IS DISTINCT FROM
       (SELECT home_store_id FROM public.profiles WHERE id = auth.uid()) THEN
      RAISE EXCEPTION 'You can only sell laptops assigned to your own store';
    END IF;
  END IF;
  IF p_sale_price IS NULL THEN RAISE EXCEPTION 'sale_price is required'; END IF;
  IF p_customer_id IS NOT NULL THEN
    SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id;
    IF v_customer.id IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
  END IF;
  v_cost := COALESCE(v_cur.purchase_rate,0) + COALESCE(v_cur.extra_charges,0);
  v_profit := p_sale_price - v_cost;
  INSERT INTO public.sales (laptop_id, serial_number, brand_model, store_id, sale_price, cost_price, profit, sold_by, customer_id, payment_method, payment_detail)
  VALUES (p_laptop_id, v_cur.serial_number, v_cur.brand_model, v_cur.current_store_id, p_sale_price, v_cost, v_profit, p_sold_by, p_customer_id, p_payment_method, p_payment_detail)
  RETURNING * INTO v_row;
  UPDATE public.laptops
     SET status = 'Sold',
         purchaser_aadhar_hash = NULL,
         updated_at = now()
   WHERE id = p_laptop_id;
  SELECT * INTO v_store FROM public.stores WHERE id = v_row.store_id;
  RETURN jsonb_build_object(
    'sale', jsonb_build_object(
      'id', v_row.id, 'laptop_id', v_row.laptop_id, 'serial_number', v_row.serial_number,
      'brand_model', v_row.brand_model, 'store_id', v_row.store_id, 'store_name', v_store.store_name,
      'sale_price', v_row.sale_price, 'cost_price', v_row.cost_price, 'profit', v_row.profit,
      'sold_by', v_row.sold_by, 'sold_at', to_char(v_row.sold_at, 'YYYY-MM-DD HH24:MI:SS'),
      'customer_id', v_row.customer_id, 'customer_name', v_customer.name,
      'payment_method', v_row.payment_method, 'payment_detail', v_row.payment_detail)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.app_sell_laptop(bigint, numeric, text, bigint, text, text, text) TO authenticated;

-- Surface payment fields in the Sales tab.
CREATE OR REPLACE FUNCTION public.app_get_sales()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', s.id, 'laptop_id', s.laptop_id, 'serial_number', s.serial_number, 'brand_model', s.brand_model,
      'store_id', s.store_id, 'store_name', st.store_name, 'sale_price', s.sale_price, 'cost_price', s.cost_price,
      'profit', s.profit, 'sold_by', s.sold_by, 'sold_at', to_char(s.sold_at, 'YYYY-MM-DD HH24:MI:SS'),
      'customer_id', s.customer_id, 'customer_name', c.name,
      'payment_method', s.payment_method, 'payment_detail', s.payment_detail)
      ORDER BY s.sold_at DESC), '[]'::jsonb) INTO v_out
  FROM public.sales s
  LEFT JOIN public.stores st ON st.id = s.store_id
  LEFT JOIN public.customers c ON c.id = s.customer_id;
  RETURN v_out;
END $$;