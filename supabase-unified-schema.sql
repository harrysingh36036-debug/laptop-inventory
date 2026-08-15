-- ============================================================================
-- LAPTOP INVENTORY - UNIFIED SUPABASE MASTER SCHEMA (v4.0)
-- Consolidates all 17 legacy patch scripts into one idempotent file.
-- Run in the Supabase SQL Editor (as postgres / service_role).
-- ============================================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- 1. CORE TABLES & ENUMS
-- ============================================================================

-- Stores
CREATE TABLE IF NOT EXISTS public.stores (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Brands
CREATE TABLE IF NOT EXISTS public.brands (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  serial_prefix TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vendors (Catalog & Suppliers)
CREATE TABLE IF NOT EXISTS public.vendors (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  contact    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customers
CREATE TABLE IF NOT EXISTS public.customers (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  address    TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Profiles (Linked 1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username          TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL DEFAULT '',
  role              TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('superadmin','admin','manager','staff')),
  home_store_id     BIGINT REFERENCES public.stores(id) ON DELETE SET NULL,
  allowed_store_ids BIGINT[] DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Laptops (Core Inventory)
CREATE TABLE IF NOT EXISTS public.laptops (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_model   TEXT NOT NULL,
  product_line  TEXT NOT NULL DEFAULT '',
  serial_number TEXT,
  cpu           TEXT NOT NULL DEFAULT '',
  ram           TEXT NOT NULL DEFAULT '',
  generation    TEXT NOT NULL DEFAULT '',
  storage_size  TEXT NOT NULL DEFAULT '',
  cost_price    NUMERIC NOT NULL DEFAULT 0,
  sale_price    NUMERIC,
  status        TEXT NOT NULL DEFAULT 'In Stock' CHECK (status IN ('In Stock','Transferred','Sold','In Repair','Reserved')),
  store_id      BIGINT REFERENCES public.stores(id) ON DELETE SET NULL,
  vendor_id     BIGINT REFERENCES public.vendors(id) ON DELETE SET NULL,
  charger       BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT NOT NULL DEFAULT '',
  aadhar_hash   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sales Ledger
CREATE TABLE IF NOT EXISTS public.sales (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  laptop_id     BIGINT REFERENCES public.laptops(id) ON DELETE SET NULL,
  customer_id   BIGINT REFERENCES public.customers(id) ON DELETE SET NULL,
  store_id      BIGINT REFERENCES public.stores(id) ON DELETE SET NULL,
  brand_model   TEXT NOT NULL DEFAULT '',
  serial_number TEXT NOT NULL DEFAULT '',
  cost_price    NUMERIC NOT NULL DEFAULT 0,
  sale_price    NUMERIC NOT NULL DEFAULT 0,
  sold_by       TEXT NOT NULL DEFAULT '',
  sold_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Repairs
CREATE TABLE IF NOT EXISTS public.repairs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  laptop_id     BIGINT REFERENCES public.laptops(id) ON DELETE SET NULL,
  serial_number TEXT NOT NULL DEFAULT '',
  brand_model   TEXT NOT NULL DEFAULT '',
  issue         TEXT NOT NULL DEFAULT '',
  vendor        TEXT NOT NULL DEFAULT '',
  cost          NUMERIC NOT NULL DEFAULT 0,
  charge        NUMERIC NOT NULL DEFAULT 0,
  store_id      BIGINT REFERENCES public.stores(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'In Repair',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purchases (Supplier Ledger)
CREATE TABLE IF NOT EXISTS public.purchases (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vendor_id    BIGINT REFERENCES public.vendors(id) ON DELETE SET NULL,
  invoice_no   TEXT NOT NULL DEFAULT '',
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount  NUMERIC NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'Paid',
  notes        TEXT NOT NULL DEFAULT '',
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Store Transfers Audit Log
CREATE TABLE IF NOT EXISTS public.transferlogs (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  laptop_id      BIGINT REFERENCES public.laptops(id) ON DELETE CASCADE,
  from_store_id  BIGINT REFERENCES public.stores(id) ON DELETE SET NULL,
  to_store_id    BIGINT REFERENCES public.stores(id) ON DELETE SET NULL,
  transferred_by TEXT NOT NULL DEFAULT '',
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deletion Audit Log
CREATE TABLE IF NOT EXISTS public.delete_logs (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type  TEXT NOT NULL,
  entity_id    BIGINT,
  entity_label TEXT,
  remarks      TEXT NOT NULL,
  deleted_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Settings Key-Value Store
CREATE TABLE IF NOT EXISTS public.settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed default settings if missing
INSERT INTO public.settings (key, value) VALUES
  ('role_permissions', '{"admin":{"editInventory":true,"transferLaptops":true,"createStaff":true,"renameStores":true,"editLabels":true,"manageVendors":true},"manager":{"editInventory":true,"transferLaptops":true,"createStaff":true,"renameStores":true,"editLabels":false,"manageVendors":false},"staff":{"editInventory":false,"transferLaptops":false,"createStaff":false,"renameStores":false,"editLabels":false,"manageVendors":false}}')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 2. ROW LEVEL SECURITY (RLS)
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['stores','brands','vendors','customers','profiles','laptops','sales','repairs','purchases','transferlogs','delete_logs','settings'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- Read policies
DROP POLICY IF EXISTS "stores_read" ON public.stores;
CREATE POLICY "stores_read" ON public.stores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "stores_read_anon" ON public.stores;
CREATE POLICY "stores_read_anon" ON public.stores FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "brands_read" ON public.brands;
CREATE POLICY "brands_read" ON public.brands FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "vendors_read" ON public.vendors;
CREATE POLICY "vendors_read" ON public.vendors FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "customers_read" ON public.customers;
CREATE POLICY "customers_read" ON public.customers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_read" ON public.profiles;
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "laptops_read" ON public.laptops;
CREATE POLICY "laptops_read" ON public.laptops FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sales_read" ON public.sales;
CREATE POLICY "sales_read" ON public.sales FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "repairs_read" ON public.repairs;
CREATE POLICY "repairs_read" ON public.repairs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "purchases_read" ON public.purchases;
CREATE POLICY "purchases_read" ON public.purchases FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "logs_read" ON public.transferlogs;
CREATE POLICY "logs_read" ON public.transferlogs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "delete_logs_read" ON public.delete_logs;
CREATE POLICY "delete_logs_read" ON public.delete_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "settings_read" ON public.settings;
CREATE POLICY "settings_read" ON public.settings FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 3. REALTIME PUBLICATION
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['stores','brands','vendors','customers','profiles','laptops','sales','repairs','purchases','transferlogs','delete_logs','settings'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
              WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 4. AUTH & USER PROFILE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- 5. PERMISSIONS & SECURITY HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'anon'); $$;

CREATE OR REPLACE FUNCTION public.app_perm_exact(p_perm text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.app_role();
  v_raw text;
  v_perms jsonb;
BEGIN
  IF v_role = 'superadmin' THEN RETURN true; END IF;
  SELECT value INTO v_raw FROM public.settings WHERE key = 'role_permissions';
  IF v_raw IS NULL THEN RETURN false; END IF;
  BEGIN
    v_perms := v_raw::jsonb;
  EXCEPTION WHEN OTHERS THEN RETURN false;
  END;
  RETURN COALESCE((v_perms -> v_role -> p_perm)::boolean, false);
END $$;

CREATE OR REPLACE FUNCTION public.app_perm(p_perm text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN public.app_perm_exact(p_perm);
END $$;

CREATE OR REPLACE FUNCTION public.app_verify_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_password IS NULL OR btrim(p_password) = '' THEN RETURN false; END IF;
  SELECT encrypted_password::text INTO v_hash FROM auth.users WHERE id = auth.uid();
  RETURN v_hash IS NOT NULL AND v_hash <> '' AND extensions.crypt(p_password, v_hash) = v_hash;
END $$;

CREATE OR REPLACE FUNCTION public.app_log_delete(p_entity_type text, p_entity_id bigint, p_label text, p_remarks text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_username text;
BEGIN
  SELECT username INTO v_username FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.delete_logs (entity_type, entity_id, entity_label, remarks, deleted_by)
  VALUES (p_entity_type, p_entity_id, p_label, btrim(p_remarks), v_username);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_guard(p_password text, p_remarks text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.app_verify_password(p_password) THEN
    RAISE EXCEPTION 'Your password is incorrect. Deletion cancelled.';
  END IF;
  IF COALESCE(btrim(p_remarks),'') = '' THEN
    RAISE EXCEPTION 'Remarks are required to delete.';
  END IF;
END $$;

-- ============================================================================
-- 6. RPC FUNCTIONS - INVENTORY & LAPTOPS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_get_laptops(
  p_store_id bigint DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  brand_model text,
  product_line text,
  serial_number text,
  cpu text,
  ram text,
  generation text,
  storage_size text,
  cost_price numeric,
  sale_price numeric,
  status text,
  store_id bigint,
  store_name text,
  vendor_id bigint,
  vendor_name text,
  charger boolean,
  notes text,
  aadhar_hash text,
  created_at timestamptz,
  updated_at timestamptz,
  sale_customer_name text,
  sale_price_actual numeric,
  sold_at timestamptz,
  sold_by text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    l.id,
    l.brand_model,
    l.product_line,
    l.serial_number,
    l.cpu,
    l.ram,
    l.generation,
    l.storage_size,
    l.cost_price,
    l.sale_price,
    l.status,
    l.store_id,
    s.name AS store_name,
    l.vendor_id,
    v.name AS vendor_name,
    l.charger,
    l.notes,
    l.aadhar_hash,
    l.created_at,
    l.updated_at,
    c.name AS sale_customer_name,
    sa.sale_price AS sale_price_actual,
    sa.sold_at,
    sa.sold_by
  FROM public.laptops l
  LEFT JOIN public.stores s ON s.id = l.store_id
  LEFT JOIN public.vendors v ON v.id = l.vendor_id
  LEFT JOIN LATERAL (
    SELECT customer_id, sale_price, sold_at, sold_by
    FROM public.sales
    WHERE laptop_id = l.id
    ORDER BY sold_at DESC
    LIMIT 1
  ) sa ON true
  LEFT JOIN public.customers c ON c.id = sa.customer_id
  WHERE (p_store_id IS NULL OR l.store_id = p_store_id)
    AND (
      CASE
        WHEN p_status IS NULL OR p_status = '' THEN l.status <> 'Sold'
        WHEN p_status = 'ALL' THEN true
        ELSE l.status = p_status
      END
    )
    AND (
      p_search IS NULL OR p_search = ''
      OR l.brand_model ILIKE '%' || p_search || '%'
      OR l.serial_number ILIKE '%' || p_search || '%'
      OR l.cpu ILIKE '%' || p_search || '%'
      OR l.ram ILIKE '%' || p_search || '%'
    )
  ORDER BY l.id DESC;
$$;

CREATE OR REPLACE FUNCTION public.app_create_laptop(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.laptops%ROWTYPE;
  v_brand_model text := btrim(COALESCE(p_data->>'brand_model', ''));
  v_serial text := btrim(COALESCE(p_data->>'serial_number', ''));
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF v_brand_model = '' THEN RAISE EXCEPTION 'Brand/Model is required'; END IF;

  INSERT INTO public.laptops (
    brand_model, product_line, serial_number, cpu, ram, generation,
    storage_size, cost_price, sale_price, status, store_id, vendor_id,
    charger, notes, aadhar_hash
  ) VALUES (
    v_brand_model,
    COALESCE(p_data->>'product_line', ''),
    NULLIF(v_serial, ''),
    COALESCE(p_data->>'cpu', ''),
    COALESCE(p_data->>'ram', ''),
    COALESCE(p_data->>'generation', ''),
    COALESCE(p_data->>'storage_size', ''),
    COALESCE((p_data->>'cost_price')::numeric, 0),
    (p_data->>'sale_price')::numeric,
    COALESCE(p_data->>'status', 'In Stock'),
    (p_data->>'store_id')::bigint,
    (p_data->>'vendor_id')::bigint,
    COALESCE((p_data->>'charger')::boolean, true),
    COALESCE(p_data->>'notes', ''),
    p_data->>'aadhar_hash'
  ) RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_bulk_create_laptops(p_data jsonb, p_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF p_quantity < 1 OR p_quantity > 500 THEN RAISE EXCEPTION 'Quantity must be between 1 and 500'; END IF;

  FOR i IN 1..p_quantity LOOP
    PERFORM public.app_create_laptop(p_data);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'count', v_count);
END $$;

CREATE OR REPLACE FUNCTION public.app_update_laptop(p_id bigint, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.laptops%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  UPDATE public.laptops SET
    brand_model  = COALESCE(p_data->>'brand_model', brand_model),
    product_line = COALESCE(p_data->>'product_line', product_line),
    serial_number= COALESCE(NULLIF(p_data->>'serial_number',''), serial_number),
    cpu          = COALESCE(p_data->>'cpu', cpu),
    ram          = COALESCE(p_data->>'ram', ram),
    generation   = COALESCE(p_data->>'generation', generation),
    storage_size = COALESCE(p_data->>'storage_size', storage_size),
    cost_price   = COALESCE((p_data->>'cost_price')::numeric, cost_price),
    sale_price   = COALESCE((p_data->>'sale_price')::numeric, sale_price),
    status       = COALESCE(p_data->>'status', status),
    store_id     = COALESCE((p_data->>'store_id')::bigint, store_id),
    vendor_id    = COALESCE((p_data->>'vendor_id')::bigint, vendor_id),
    charger      = COALESCE((p_data->>'charger')::boolean, charger),
    notes        = COALESCE(p_data->>'notes', notes),
    updated_at   = now()
  WHERE id = p_id RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_laptop(p_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_label text;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT brand_model || ' (' || COALESCE(serial_number,'No Serial') || ')' INTO v_label FROM public.laptops WHERE id = p_id;
  IF v_label IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;

  PERFORM public.app_delete_guard(p_password, p_remarks);

  DELETE FROM public.sales WHERE laptop_id = p_id;
  DELETE FROM public.transferlogs WHERE laptop_id = p_id;
  DELETE FROM public.repairs WHERE laptop_id = p_id;
  DELETE FROM public.laptops WHERE id = p_id;

  PERFORM public.app_log_delete('laptop', p_id, v_label, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- ============================================================================
-- 7. RPC FUNCTIONS - TRANSFERS & SALES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_transfer_laptop(p_laptop_id bigint, p_to_store bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_from_store bigint;
  v_username text;
BEGIN
  IF NOT public.app_perm('transferLaptops') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT store_id INTO v_from_store FROM public.laptops WHERE id = p_laptop_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  IF v_from_store = p_to_store THEN RAISE EXCEPTION 'Laptop is already in this store'; END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = auth.uid();

  UPDATE public.laptops
  SET store_id = p_to_store, updated_at = now()
  WHERE id = p_laptop_id;

  INSERT INTO public.transferlogs (laptop_id, from_store_id, to_store_id, transferred_by)
  VALUES (p_laptop_id, v_from_store, p_to_store, COALESCE(v_username, 'System'));

  RETURN jsonb_build_object('ok', true, 'laptop_id', p_laptop_id, 'to_store', p_to_store);
END $$;

CREATE OR REPLACE FUNCTION public.app_get_transfer_logs(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id bigint,
  laptop_id bigint,
  brand_model text,
  serial_number text,
  from_store_name text,
  to_store_name text,
  transferred_by text,
  changed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    t.id,
    t.laptop_id,
    COALESCE(l.brand_model, 'Deleted Laptop') AS brand_model,
    l.serial_number,
    fs.name AS from_store_name,
    ts.name AS to_store_name,
    t.transferred_by,
    t.changed_at
  FROM public.transferlogs t
  LEFT JOIN public.laptops l ON l.id = t.laptop_id
  LEFT JOIN public.stores fs ON fs.id = t.from_store_id
  LEFT JOIN public.stores ts ON ts.id = t.to_store_id
  ORDER BY t.changed_at DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.app_sell_laptop(
  p_laptop_id bigint,
  p_sale_price numeric,
  p_sold_by text DEFAULT '',
  p_customer_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_laptop public.laptops%ROWTYPE;
  v_sale public.sales%ROWTYPE;
BEGIN
  SELECT * INTO v_laptop FROM public.laptops WHERE id = p_laptop_id;
  IF v_laptop.id IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  IF v_laptop.status = 'Sold' THEN RAISE EXCEPTION 'Laptop is already sold'; END IF;

  UPDATE public.laptops
  SET status = 'Sold', sale_price = p_sale_price, updated_at = now()
  WHERE id = p_laptop_id;

  INSERT INTO public.sales (
    laptop_id, customer_id, store_id, brand_model, serial_number,
    cost_price, sale_price, sold_by, sold_at
  ) VALUES (
    v_laptop.id,
    p_customer_id,
    v_laptop.store_id,
    v_laptop.brand_model,
    COALESCE(v_laptop.serial_number, ''),
    v_laptop.cost_price,
    p_sale_price,
    COALESCE(NULLIF(p_sold_by,''), (SELECT username FROM public.profiles WHERE id = auth.uid()), 'staff'),
    now()
  ) RETURNING * INTO v_sale;

  RETURN to_jsonb(v_sale);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_sale(p_sale_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
BEGIN
  IF public.app_role() <> 'superadmin' THEN RAISE EXCEPTION 'Only the superadmin can delete sales'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;

  DELETE FROM public.sales WHERE id = p_sale_id;

  UPDATE public.laptops
  SET status = 'In Stock', updated_at = now()
  WHERE id = v_sale.laptop_id AND status = 'Sold';

  PERFORM public.app_log_delete('sale', p_sale_id, v_sale.brand_model || ' (' || v_sale.serial_number || ')', p_remarks);
  RETURN jsonb_build_object('ok', true, 'deleted_sale_id', p_sale_id);
END $$;

CREATE OR REPLACE FUNCTION public.app_get_sales()
RETURNS TABLE (
  id bigint,
  laptop_id bigint,
  customer_id bigint,
  customer_name text,
  store_id bigint,
  store_name text,
  brand_model text,
  serial_number text,
  cost_price numeric,
  sale_price numeric,
  profit numeric,
  sold_by text,
  sold_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    s.id,
    s.laptop_id,
    s.customer_id,
    c.name AS customer_name,
    s.store_id,
    st.name AS store_name,
    s.brand_model,
    s.serial_number,
    s.cost_price,
    s.sale_price,
    (s.sale_price - s.cost_price) AS profit,
    s.sold_by,
    s.sold_at
  FROM public.sales s
  LEFT JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN public.stores st ON st.id = s.store_id
  ORDER BY s.sold_at DESC;
$$;

-- ============================================================================
-- 8. RPC FUNCTIONS - REPAIRS & PURCHASES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_create_repair(
  p_laptop_id bigint DEFAULT NULL,
  p_serial_number text DEFAULT '',
  p_brand_model text DEFAULT '',
  p_issue text DEFAULT '',
  p_vendor text DEFAULT '',
  p_cost numeric DEFAULT 0,
  p_charge numeric DEFAULT 0,
  p_store_id bigint DEFAULT NULL,
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.repairs%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  INSERT INTO public.repairs (
    laptop_id, serial_number, brand_model, issue, vendor,
    cost, charge, store_id, notes, status
  ) VALUES (
    p_laptop_id,
    COALESCE(p_serial_number, ''),
    COALESCE(p_brand_model, ''),
    COALESCE(p_issue, ''),
    COALESCE(p_vendor, ''),
    COALESCE(p_cost, 0),
    COALESCE(p_charge, 0),
    p_store_id,
    COALESCE(p_notes, ''),
    'In Repair'
  ) RETURNING * INTO v_row;

  IF p_laptop_id IS NOT NULL THEN
    UPDATE public.laptops SET status = 'In Repair', updated_at = now() WHERE id = p_laptop_id;
  END IF;

  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_update_repair(
  p_id bigint,
  p_laptop_id bigint DEFAULT NULL,
  p_serial_number text DEFAULT NULL,
  p_brand_model text DEFAULT NULL,
  p_issue text DEFAULT NULL,
  p_vendor text DEFAULT NULL,
  p_cost numeric DEFAULT NULL,
  p_charge numeric DEFAULT NULL,
  p_store_id bigint DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.repairs%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  UPDATE public.repairs SET
    laptop_id     = COALESCE(p_laptop_id, laptop_id),
    serial_number = COALESCE(p_serial_number, serial_number),
    brand_model   = COALESCE(p_brand_model, brand_model),
    issue         = COALESCE(p_issue, issue),
    vendor        = COALESCE(p_vendor, vendor),
    cost          = COALESCE(p_cost, cost),
    charge        = COALESCE(p_charge, charge),
    store_id      = COALESCE(p_store_id, store_id),
    status        = COALESCE(p_status, status),
    notes         = COALESCE(p_notes, notes),
    updated_at    = now()
  WHERE id = p_id RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Repair not found'; END IF;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_repair(p_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.repairs%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);

  DELETE FROM public.repairs WHERE id = p_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Repair record not found'; END IF;

  PERFORM public.app_log_delete('repair', p_id, v_row.brand_model || ' (' || v_row.serial_number || ')', p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

CREATE OR REPLACE FUNCTION public.app_get_repairs()
RETURNS TABLE (
  id bigint,
  laptop_id bigint,
  serial_number text,
  brand_model text,
  issue text,
  vendor text,
  cost numeric,
  charge numeric,
  store_id bigint,
  store_name text,
  status text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    r.id,
    r.laptop_id,
    r.serial_number,
    r.brand_model,
    r.issue,
    r.vendor,
    r.cost,
    r.charge,
    r.store_id,
    s.name AS store_name,
    r.status,
    r.notes,
    r.created_at,
    r.updated_at
  FROM public.repairs r
  LEFT JOIN public.stores s ON s.id = r.store_id
  ORDER BY r.created_at DESC;
$$;

-- Purchases (Supplier Ledger)
CREATE OR REPLACE FUNCTION public.app_create_purchase(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.purchases%ROWTYPE;
BEGIN
  IF NOT public.app_perm('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  INSERT INTO public.purchases (
    vendor_id, invoice_no, total_amount, paid_amount, status, notes, purchased_at
  ) VALUES (
    (p_data->>'vendor_id')::bigint,
    COALESCE(p_data->>'invoice_no', ''),
    COALESCE((p_data->>'total_amount')::numeric, 0),
    COALESCE((p_data->>'paid_amount')::numeric, 0),
    COALESCE(p_data->>'status', 'Paid'),
    COALESCE(p_data->>'notes', ''),
    COALESCE((p_data->>'purchased_at')::timestamptz, now())
  ) RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_update_purchase(p_id bigint, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.purchases%ROWTYPE;
BEGIN
  IF NOT public.app_perm('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  UPDATE public.purchases SET
    vendor_id    = COALESCE((p_data->>'vendor_id')::bigint, vendor_id),
    invoice_no   = COALESCE(p_data->>'invoice_no', invoice_no),
    total_amount = COALESCE((p_data->>'total_amount')::numeric, total_amount),
    paid_amount  = COALESCE((p_data->>'paid_amount')::numeric, paid_amount),
    status       = COALESCE(p_data->>'status', status),
    notes        = COALESCE(p_data->>'notes', notes),
    purchased_at = COALESCE((p_data->>'purchased_at')::timestamptz, purchased_at)
  WHERE id = p_id RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_purchase(p_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.purchases%ROWTYPE;
BEGIN
  IF NOT public.app_perm('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);

  DELETE FROM public.purchases WHERE id = p_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Purchase record not found'; END IF;

  PERFORM public.app_log_delete('purchase', p_id, 'Invoice: ' || v_row.invoice_no, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

CREATE OR REPLACE FUNCTION public.app_get_purchases()
RETURNS TABLE (
  id bigint,
  vendor_id bigint,
  vendor_name text,
  invoice_no text,
  total_amount numeric,
  paid_amount numeric,
  status text,
  notes text,
  purchased_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.id,
    p.vendor_id,
    v.name AS vendor_name,
    p.invoice_no,
    p.total_amount,
    p.paid_amount,
    p.status,
    p.notes,
    p.purchased_at,
    p.created_at
  FROM public.purchases p
  LEFT JOIN public.vendors v ON v.id = p.vendor_id
  ORDER BY p.purchased_at DESC;
$$;

-- ============================================================================
-- 9. RPC FUNCTIONS - CATALOGS (BRANDS, VENDORS, CUSTOMERS, STORES)
-- ============================================================================

-- Brands
CREATE OR REPLACE FUNCTION public.app_add_brand(p_name text, p_serial_prefix text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.brands%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editLabels') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  INSERT INTO public.brands (name, serial_prefix)
  VALUES (btrim(p_name), btrim(p_serial_prefix)) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_update_brand(p_id bigint, p_name text, p_serial_prefix text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.brands%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editLabels') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  UPDATE public.brands SET name = btrim(p_name), serial_prefix = btrim(p_serial_prefix)
  WHERE id = p_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_brand(p_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.brands%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editLabels') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  DELETE FROM public.brands WHERE id = p_id RETURNING * INTO v_row;
  PERFORM public.app_log_delete('brand', p_id, v_row.name, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- Vendors
CREATE OR REPLACE FUNCTION public.app_add_vendor(p_name text, p_contact text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.vendors%ROWTYPE;
BEGIN
  IF NOT public.app_perm('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  INSERT INTO public.vendors (name, contact)
  VALUES (btrim(p_name), btrim(p_contact)) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_update_vendor(p_id bigint, p_name text, p_contact text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.vendors%ROWTYPE;
BEGIN
  IF NOT public.app_perm('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  UPDATE public.vendors SET name = btrim(p_name), contact = btrim(p_contact)
  WHERE id = p_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_vendor(p_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.vendors%ROWTYPE;
BEGIN
  IF NOT public.app_perm('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  DELETE FROM public.vendors WHERE id = p_id RETURNING * INTO v_row;
  PERFORM public.app_log_delete('vendor', p_id, v_row.name, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

CREATE OR REPLACE FUNCTION public.app_bulk_delete_vendors(p_ids bigint[], p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  IF NOT public.app_perm('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  FOREACH v_id IN ARRAY p_ids LOOP
    DELETE FROM public.vendors WHERE id = v_id;
    PERFORM public.app_log_delete('vendor', v_id, 'Bulk Delete', p_remarks);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'count', cardinality(p_ids));
END $$;

-- Customers
CREATE OR REPLACE FUNCTION public.app_get_customers()
RETURNS TABLE (
  id bigint,
  name text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz,
  purchased_laptops jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.phone,
    c.email,
    c.address,
    c.notes,
    c.created_at,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'id', s.id,
          'laptop_id', s.laptop_id,
          'brand_model', s.brand_model,
          'serial_number', s.serial_number,
          'sale_price', s.sale_price,
          'sold_at', s.sold_at
        ) ORDER BY s.sold_at DESC)
        FROM public.sales s
        WHERE s.customer_id = c.id
      ),
      '[]'::jsonb
    ) AS purchased_laptops
  FROM public.customers c
  ORDER BY c.name ASC;
$$;

CREATE OR REPLACE FUNCTION public.app_add_customer(
  p_name text,
  p_phone text DEFAULT '',
  p_email text DEFAULT '',
  p_address text DEFAULT '',
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.customers%ROWTYPE;
BEGIN
  INSERT INTO public.customers (name, phone, email, address, notes)
  VALUES (btrim(p_name), btrim(p_phone), btrim(p_email), btrim(p_address), btrim(p_notes))
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_update_customer(
  p_id bigint,
  p_name text,
  p_phone text DEFAULT '',
  p_email text DEFAULT '',
  p_address text DEFAULT '',
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.customers%ROWTYPE;
BEGIN
  UPDATE public.customers SET
    name = btrim(p_name),
    phone = btrim(p_phone),
    email = btrim(p_email),
    address = btrim(p_address),
    notes = btrim(p_notes)
  WHERE id = p_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_customer(p_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.customers%ROWTYPE;
BEGIN
  PERFORM public.app_delete_guard(p_password, p_remarks);
  DELETE FROM public.customers WHERE id = p_id RETURNING * INTO v_row;
  PERFORM public.app_log_delete('customer', p_id, v_row.name, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

CREATE OR REPLACE FUNCTION public.app_bulk_delete_customers(p_ids bigint[], p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  PERFORM public.app_delete_guard(p_password, p_remarks);
  FOREACH v_id IN ARRAY p_ids LOOP
    DELETE FROM public.customers WHERE id = v_id;
    PERFORM public.app_log_delete('customer', v_id, 'Bulk Delete', p_remarks);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'count', cardinality(p_ids));
END $$;

-- Stores
CREATE OR REPLACE FUNCTION public.app_add_store(p_store_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.stores%ROWTYPE;
BEGIN
  IF public.app_role() NOT IN ('superadmin', 'admin') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  INSERT INTO public.stores (name) VALUES (btrim(p_store_name)) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_rename_store(p_store_id bigint, p_store_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.stores%ROWTYPE;
BEGIN
  IF NOT public.app_perm('renameStores') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  UPDATE public.stores SET name = btrim(p_store_name) WHERE id = p_store_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_store(p_store_id bigint, p_password text DEFAULT NULL, p_remarks text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.stores%ROWTYPE;
BEGIN
  IF public.app_role() NOT IN ('superadmin', 'admin') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  PERFORM public.app_delete_guard(p_password, p_remarks);
  DELETE FROM public.stores WHERE id = p_store_id RETURNING * INTO v_row;
  PERFORM public.app_log_delete('store', p_store_id, v_row.name, p_remarks);
  RETURN jsonb_build_object('ok', true, 'id', p_store_id);
END $$;

-- ============================================================================
-- 10. RPC FUNCTIONS - USERS & SETTINGS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_get_users()
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  role text,
  home_store_id bigint,
  store_name text,
  allowed_store_ids bigint[],
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.role,
    p.home_store_id,
    s.name AS store_name,
    p.allowed_store_ids,
    p.created_at
  FROM public.profiles p
  LEFT JOIN public.stores s ON s.id = p.home_store_id
  WHERE (public.app_role() = 'superadmin' OR p.role <> 'superadmin')
  ORDER BY p.username ASC;
$$;

CREATE OR REPLACE FUNCTION public.app_update_user(
  p_id uuid,
  p_role text DEFAULT NULL,
  p_store_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.profiles%ROWTYPE;
BEGIN
  IF public.app_role() NOT IN ('superadmin', 'admin') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  UPDATE public.profiles SET
    role = COALESCE(p_role, role),
    home_store_id = p_store_id
  WHERE id = p_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_get_settings()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) FROM public.settings;
$$;

CREATE OR REPLACE FUNCTION public.app_set_settings(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  k text;
  v text;
BEGIN
  IF public.app_role() NOT IN ('superadmin', 'admin') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  FOR k, v IN SELECT key, value#>>'{}' FROM jsonb_each(p_patch) LOOP
    INSERT INTO public.settings (key, value) VALUES (k, v)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END LOOP;
  RETURN public.app_get_settings();
END $$;

-- ============================================================================
-- 11. RPC FUNCTIONS - REPORTS & SUMMARIES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_inventory_stats(
  p_store_id bigint DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_stock', COUNT(*) FILTER (WHERE status = 'In Stock'),
    'total_cost', COALESCE(SUM(cost_price) FILTER (WHERE status = 'In Stock'), 0),
    'total_sold', COUNT(*) FILTER (WHERE status = 'Sold'),
    'total_repair', COUNT(*) FILTER (WHERE status = 'In Repair')
  )
  FROM public.laptops
  WHERE (p_store_id IS NULL OR store_id = p_store_id);
$$;

CREATE OR REPLACE FUNCTION public.app_sales_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_count', COUNT(*),
    'total_revenue', COALESCE(SUM(sale_price), 0),
    'total_cost', COALESCE(SUM(cost_price), 0),
    'total_profit', COALESCE(SUM(sale_price - cost_price), 0)
  )
  FROM public.sales;
$$;

CREATE OR REPLACE FUNCTION public.app_repairs_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_repairs', COUNT(*),
    'in_repair', COUNT(*) FILTER (WHERE status = 'In Repair'),
    'completed', COUNT(*) FILTER (WHERE status = 'Completed'),
    'total_cost', COALESCE(SUM(cost), 0),
    'total_charge', COALESCE(SUM(charge), 0),
    'net_profit', COALESCE(SUM(charge - cost), 0)
  )
  FROM public.repairs;
$$;

CREATE OR REPLACE FUNCTION public.app_repairs_by_store()
RETURNS TABLE (
  store_id bigint,
  store_name text,
  repair_count bigint,
  total_cost numeric,
  total_charge numeric,
  profit numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    s.id AS store_id,
    s.name AS store_name,
    COUNT(r.id) AS repair_count,
    COALESCE(SUM(r.cost), 0) AS total_cost,
    COALESCE(SUM(r.charge), 0) AS total_charge,
    COALESCE(SUM(r.charge - r.cost), 0) AS profit
  FROM public.stores s
  LEFT JOIN public.repairs r ON r.store_id = s.id
  GROUP BY s.id, s.name
  ORDER BY s.name ASC;
$$;

CREATE OR REPLACE FUNCTION public.app_purchases_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_purchases', COUNT(*),
    'total_amount', COALESCE(SUM(total_amount), 0),
    'total_paid', COALESCE(SUM(paid_amount), 0),
    'total_pending', COALESCE(SUM(total_amount - paid_amount), 0)
  )
  FROM public.purchases;
$$;

CREATE OR REPLACE FUNCTION public.app_daily_report(p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.app_role();
  v_user_store bigint;
  v_res jsonb;
BEGIN
  IF v_role = 'manager' THEN
    SELECT home_store_id INTO v_user_store FROM public.profiles WHERE id = auth.uid();
  END IF;

  SELECT jsonb_build_object(
    'date', p_date,
    'sales_count', COUNT(*),
    'revenue', COALESCE(SUM(sale_price), 0),
    'cost', COALESCE(SUM(cost_price), 0),
    'profit', COALESCE(SUM(sale_price - cost_price), 0)
  ) INTO v_res
  FROM public.sales
  WHERE sold_at::date = p_date
    AND (v_user_store IS NULL OR store_id = v_user_store);

  RETURN v_res;
END $$;

CREATE OR REPLACE FUNCTION public.app_daily_store_sales(p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  store_id bigint,
  store_name text,
  sales_count bigint,
  revenue numeric,
  profit numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    st.id AS store_id,
    st.name AS store_name,
    COUNT(s.id) AS sales_count,
    COALESCE(SUM(s.sale_price), 0) AS revenue,
    COALESCE(SUM(s.sale_price - s.cost_price), 0) AS profit
  FROM public.stores st
  LEFT JOIN public.sales s ON s.store_id = st.id AND s.sold_at::date = p_date
  GROUP BY st.id, st.name
  ORDER BY st.name ASC;
$$;
