-- ============================================================================
-- Delta: Allow any amount (no restrictions) for all monetary fields
--   Removes < 0 checks on sale_price and charge so any numeric value
--   (negative, zero, huge, decimals) is accepted throughout the inventory.
-- Idempotent: safe to re-run.
-- Run:  DATABASE_URL=postgres://... node backend/apply-sql.cjs supabase-unrestrict-amount.sql
--   or paste into Supabase SQL Editor as service_role.
-- ============================================================================

-- Allow any sale_price (previously rejected < 0) - update all sell RPC variants
CREATE OR REPLACE FUNCTION public.app_sell_laptop(p_laptop_id bigint, p_sale_price numeric, p_sold_by text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cur public.laptops%ROWTYPE; v_cost numeric; v_profit numeric; v_row public.sales%ROWTYPE; v_store public.stores%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO v_cur FROM public.laptops WHERE id = p_laptop_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  IF v_cur.status = 'Sold' THEN RAISE EXCEPTION 'Laptop is already sold'; END IF;
  IF p_sale_price IS NULL THEN RAISE EXCEPTION 'sale_price is required'; END IF;
  v_cost := COALESCE(v_cur.purchase_rate,0) + COALESCE(v_cur.extra_charges,0);
  v_profit := p_sale_price - v_cost;
  INSERT INTO public.sales (laptop_id, serial_number, brand_model, store_id, sale_price, cost_price, profit, sold_by)
  VALUES (p_laptop_id, v_cur.serial_number, v_cur.brand_model, v_cur.current_store_id, p_sale_price, v_cost, v_profit, p_sold_by) RETURNING * INTO v_row;
  UPDATE public.laptops SET status = 'Sold', updated_at = now() WHERE id = p_laptop_id;
  SELECT * INTO v_store FROM public.stores WHERE id = v_row.store_id;
  RETURN jsonb_build_object('sale', jsonb_build_object('id', v_row.id, 'laptop_id', v_row.laptop_id, 'serial_number', v_row.serial_number, 'brand_model', v_row.brand_model, 'store_id', v_row.store_id, 'store_name', v_store.store_name, 'sale_price', v_row.sale_price, 'cost_price', v_row.cost_price, 'profit', v_row.profit, 'sold_by', v_row.sold_by, 'sold_at', to_char(v_row.sold_at, 'YYYY-MM-DD HH24:MI:SS')));
END $$;

-- Variants with customer/aadhar/payment also unrestricted
CREATE OR REPLACE FUNCTION public.app_sell_laptop(p_laptop_id bigint, p_sale_price numeric, p_sold_by text, p_customer_id bigint DEFAULT NULL, p_purchaser_aadhar_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cur public.laptops%ROWTYPE; v_cost numeric; v_profit numeric; v_row public.sales%ROWTYPE; v_store public.stores%ROWTYPE; v_customer public.customers%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO v_cur FROM public.laptops WHERE id = p_laptop_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  IF v_cur.status = 'Sold' THEN RAISE EXCEPTION 'Laptop is already sold'; END IF;
  IF p_sale_price IS NULL THEN RAISE EXCEPTION 'sale_price is required'; END IF;
  IF p_customer_id IS NOT NULL THEN SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id; IF v_customer.id IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF; END IF;
  v_cost := COALESCE(v_cur.purchase_rate,0) + COALESCE(v_cur.extra_charges,0);
  v_profit := p_sale_price - v_cost;
  INSERT INTO public.sales (laptop_id, serial_number, brand_model, store_id, sale_price, cost_price, profit, sold_by, customer_id)
  VALUES (p_laptop_id, v_cur.serial_number, v_cur.brand_model, v_cur.current_store_id, p_sale_price, v_cost, v_profit, p_sold_by, p_customer_id) RETURNING * INTO v_row;
  UPDATE public.laptops SET status = 'Sold', purchaser_aadhar_hash = NULL, updated_at = now() WHERE id = p_laptop_id;
  SELECT * INTO v_store FROM public.stores WHERE id = v_row.store_id;
  RETURN jsonb_build_object('sale', jsonb_build_object('id', v_row.id, 'laptop_id', v_row.laptop_id, 'serial_number', v_row.serial_number, 'brand_model', v_row.brand_model, 'store_id', v_row.store_id, 'store_name', v_store.store_name, 'sale_price', v_row.sale_price, 'cost_price', v_row.cost_price, 'profit', v_row.profit, 'sold_by', v_row.sold_by, 'sold_at', to_char(v_row.sold_at, 'YYYY-MM-DD HH24:MI:SS'), 'customer_id', v_row.customer_id, 'customer_name', v_customer.name));
END $$;

CREATE OR REPLACE FUNCTION public.app_sell_laptop(p_laptop_id bigint, p_sale_price numeric, p_sold_by text, p_customer_id bigint DEFAULT NULL, p_purchaser_aadhar_hash text DEFAULT NULL, p_payment_method text DEFAULT NULL, p_payment_detail text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cur public.laptops%ROWTYPE; v_cost numeric; v_profit numeric; v_row public.sales%ROWTYPE; v_store public.stores%ROWTYPE; v_customer public.customers%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO v_cur FROM public.laptops WHERE id = p_laptop_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  IF v_cur.status = 'Sold' THEN RAISE EXCEPTION 'Laptop is already sold'; END IF;
  IF public.app_role() = 'manager' THEN IF v_cur.current_store_id IS DISTINCT FROM (SELECT home_store_id FROM public.profiles WHERE id = auth.uid()) THEN RAISE EXCEPTION 'You can only sell laptops assigned to your own store'; END IF; END IF;
  IF p_sale_price IS NULL THEN RAISE EXCEPTION 'sale_price is required'; END IF;
  IF p_customer_id IS NOT NULL THEN SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id; IF v_customer.id IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF; END IF;
  v_cost := COALESCE(v_cur.purchase_rate,0) + COALESCE(v_cur.extra_charges,0);
  v_profit := p_sale_price - v_cost;
  INSERT INTO public.sales (laptop_id, serial_number, brand_model, store_id, sale_price, cost_price, profit, sold_by, customer_id, payment_method, payment_detail)
  VALUES (p_laptop_id, v_cur.serial_number, v_cur.brand_model, v_cur.current_store_id, p_sale_price, v_cost, v_profit, p_sold_by, p_customer_id, p_payment_method, p_payment_detail) RETURNING * INTO v_row;
  UPDATE public.laptops SET status = 'Sold', purchaser_aadhar_hash = NULL, updated_at = now() WHERE id = p_laptop_id;
  SELECT * INTO v_store FROM public.stores WHERE id = v_row.store_id;
  RETURN jsonb_build_object('sale', jsonb_build_object('id', v_row.id, 'laptop_id', v_row.laptop_id, 'serial_number', v_row.serial_number, 'brand_model', v_row.brand_model, 'store_id', v_row.store_id, 'store_name', v_store.store_name, 'sale_price', v_row.sale_price, 'cost_price', v_row.cost_price, 'profit', v_row.profit, 'sold_by', v_row.sold_by, 'sold_at', to_char(v_row.sold_at, 'YYYY-MM-DD HH24:MI:SS'), 'customer_id', v_row.customer_id, 'customer_name', v_customer.name, 'payment_method', v_row.payment_method, 'payment_detail', v_row.payment_detail));
END $$;

-- Repairs: allow any charge/cost (previously rejected negative charge)
DROP FUNCTION IF EXISTS public.app_create_repair(bigint, text, text, text, text, numeric, text);
CREATE OR REPLACE FUNCTION public.app_create_repair(p_laptop_id bigint DEFAULT NULL, p_serial_number text DEFAULT '', p_brand_model text DEFAULT '', p_issue text DEFAULT '', p_vendor text DEFAULT '', p_cost numeric DEFAULT 0, p_charge numeric DEFAULT 0, p_notes text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.repairs%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF COALESCE(btrim(p_issue),'') = '' THEN RAISE EXCEPTION 'issue is required'; END IF;
  INSERT INTO public.repairs (laptop_id, serial_number, brand_model, issue, vendor, cost, charge, notes, created_by)
  VALUES (p_laptop_id, NULLIF(btrim(p_serial_number), ''), NULLIF(btrim(p_brand_model), ''), btrim(p_issue), NULLIF(btrim(p_vendor), ''), COALESCE(p_cost, 0), COALESCE(p_charge, 0), NULLIF(btrim(p_notes), ''), (SELECT username FROM public.profiles WHERE id = auth.uid())) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

DROP FUNCTION IF EXISTS public.app_create_repair(bigint, text, text, text, text, numeric, numeric, text);
CREATE OR REPLACE FUNCTION public.app_create_repair(p_laptop_id bigint DEFAULT NULL, p_serial_number text DEFAULT '', p_brand_model text DEFAULT '', p_issue text DEFAULT '', p_vendor text DEFAULT '', p_cost numeric DEFAULT 0, p_charge numeric DEFAULT 0, p_store_id bigint DEFAULT NULL, p_notes text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.repairs%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF COALESCE(btrim(p_issue),'') = '' THEN RAISE EXCEPTION 'issue is required'; END IF;
  INSERT INTO public.repairs (laptop_id, serial_number, brand_model, issue, vendor, cost, charge, store_id, notes, created_by)
  VALUES (p_laptop_id, NULLIF(btrim(p_serial_number), ''), NULLIF(btrim(p_brand_model), ''), btrim(p_issue), NULLIF(btrim(p_vendor), ''), COALESCE(p_cost, 0), COALESCE(p_charge, 0), p_store_id, NULLIF(btrim(p_notes), ''), (SELECT username FROM public.profiles WHERE id = auth.uid())) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
