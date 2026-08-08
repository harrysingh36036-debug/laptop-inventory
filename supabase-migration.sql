-- ============================================================================
-- Supabase-native migration for laptop-inventory
-- Applies: profiles (auth), RLS, realtime, and RPC functions replacing the
-- Express backend (server.js + pgdb.js). Run as postgres (service role).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Profiles: role/display-name for auth.users. Supabase Auth handles login.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.profiles CASCADE;
CREATE TABLE public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username     text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  role         text NOT NULL DEFAULT 'staff' CHECK (role IN ('superadmin','admin','manager','staff')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read any profile.
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (true);

-- The user may update only their own display_name (never role/username).
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Replace legacy LoginLogs (bigint user_id -> uuid) and drop legacy Users.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.loginlogs;
CREATE TABLE public.loginlogs (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  username   text NOT NULL,
  ip         text,
  user_agent text,
  logged_in  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loginlogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loginlogs_read" ON public.loginlogs FOR SELECT TO authenticated USING (true);

DROP TABLE IF EXISTS public.users;

-- Convert legacy TEXT timestamp columns (from the old node driver) to real
-- timestamps so the app_* RPC functions (which use to_char / now()) work.
ALTER TABLE public.stores      ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamp AT TIME ZONE 'UTC';
ALTER TABLE public.brands      ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamp AT TIME ZONE 'UTC';
ALTER TABLE public.laptops     ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamp AT TIME ZONE 'UTC';
ALTER TABLE public.laptops     ALTER COLUMN updated_at  TYPE timestamptz USING updated_at::timestamp  AT TIME ZONE 'UTC';
ALTER TABLE public.transferlogs ALTER COLUMN changed_at TYPE timestamptz USING changed_at::timestamp AT TIME ZONE 'UTC';
ALTER TABLE public.sales       ALTER COLUMN sold_at     TYPE timestamptz USING sold_at::timestamp AT TIME ZONE 'UTC';

-- ---------------------------------------------------------------------------
-- 3. Enables RLS on inventory tables (reads for all authenticated users).
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laptops     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferlogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stores_read"  ON public.stores      FOR SELECT TO authenticated USING (true);
CREATE POLICY "brands_read"  ON public.brands      FOR SELECT TO authenticated USING (true);
CREATE POLICY "laptops_read" ON public.laptops     FOR SELECT TO authenticated USING (true);
CREATE POLICY "logs_read"    ON public.transferlogs FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_read"   ON public.sales       FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_read" ON public.settings   FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 4. Realtime: publish changes for the tables the UI watches.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stores','brands','laptops','transferlogs','sales','settings','profiles']
  LOOP
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
  END LOOP;
EXCEPTION WHEN undefined_object THEN
  -- publication missing; ignore
END $$;

-- ---------------------------------------------------------------------------
-- 5. Role/permission helpers (called inside security-definer functions).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'anon'); $$;

CREATE OR REPLACE FUNCTION public.app_perm(p_perm text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.app_role();
  v_raw  text;
  v_perms jsonb;
BEGIN
  IF v_role IN ('admin', 'superadmin') THEN RETURN true; END IF;
  SELECT value INTO v_raw FROM public.settings WHERE key = 'role_permissions';
  IF v_raw IS NULL THEN RETURN false; END IF;
  BEGIN
    v_perms := v_raw::jsonb;
  EXCEPTION WHEN OTHERS THEN RETURN false;
  END;
  RETURN COALESCE((v_perms -> v_role -> p_perm)::boolean, false);
END $$;

-- Deny helper: raise a fixed error message the UI shows.
CREATE OR REPLACE FUNCTION public.app_deny()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT null::void WHERE false; $$;

-- ---------------------------------------------------------------------------
-- 6. Settings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_get_settings()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb := '{}'::jsonb;
BEGIN
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_out FROM public.settings;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_set_settings(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE k text; v text; v_role text := public.app_role();
BEGIN
  IF NOT public.app_perm('editLabels') AND v_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  FOR k, v IN SELECT key, value FROM jsonb_each_text(p_patch)
  LOOP
    INSERT INTO public.settings (key, value) VALUES (k, v)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END LOOP;
  RETURN public.app_get_settings();
END $$;

-- ---------------------------------------------------------------------------
-- 7. Stores
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_add_store(p_store_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.stores%ROWTYPE;
BEGIN
  IF public.app_role() NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF COALESCE(btrim(p_store_name),'') = '' THEN RAISE EXCEPTION 'store_name is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.stores WHERE store_name = btrim(p_store_name)) THEN
    RAISE EXCEPTION 'A store with that name already exists';
  END IF;
  INSERT INTO public.stores (store_name) VALUES (btrim(p_store_name)) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_rename_store(p_store_id bigint, p_store_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.stores%ROWTYPE;
BEGIN
  IF NOT public.app_perm('renameStores') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF COALESCE(btrim(p_store_name),'') = '' THEN RAISE EXCEPTION 'store_name cannot be empty'; END IF;
  IF EXISTS (SELECT 1 FROM public.stores WHERE store_name = btrim(p_store_name) AND id <> p_store_id) THEN
    RAISE EXCEPTION 'A store with that name already exists';
  END IF;
  UPDATE public.stores SET store_name = btrim(p_store_name) WHERE id = p_store_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Store not found'; END IF;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_store(p_store_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n int; v_used int;
BEGIN
  IF public.app_role() NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT count(*) INTO v_n FROM public.stores;
  IF v_n <= 1 THEN RAISE EXCEPTION 'Cannot remove the last store'; END IF;
  SELECT count(*) INTO v_used FROM public.laptops WHERE current_store_id = p_store_id;
  IF v_used > 0 THEN RAISE EXCEPTION 'Cannot remove: % laptop(s) still assigned. Move them first.', v_used; END IF;
  IF EXISTS (SELECT 1 FROM public.transferlogs WHERE from_store_id = p_store_id OR to_store_id = p_store_id) THEN
    RAISE EXCEPTION 'Cannot remove: store appears in transfer history.';
  END IF;
  DELETE FROM public.stores WHERE id = p_store_id;
  RETURN jsonb_build_object('ok', true, 'id', p_store_id);
END $$;

-- ---------------------------------------------------------------------------
-- 8. Brands
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_add_brand(p_name text, p_serial_prefix text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.brands%ROWTYPE;
BEGIN
  IF public.app_role() NOT IN ('admin','superadmin','manager') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF COALESCE(btrim(p_name),'') = '' THEN RAISE EXCEPTION 'name is required'; END IF;
  IF COALESCE(btrim(p_serial_prefix),'') = '' THEN RAISE EXCEPTION 'serial_prefix is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.brands WHERE name = btrim(p_name)) THEN
    RAISE EXCEPTION 'A brand with that name already exists';
  END IF;
  INSERT INTO public.brands (name, serial_prefix) VALUES (btrim(p_name), btrim(p_serial_prefix)) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_update_brand(p_id bigint, p_name text, p_serial_prefix text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.brands%ROWTYPE;
BEGIN
  IF public.app_role() NOT IN ('admin','superadmin','manager') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF EXISTS (SELECT 1 FROM public.brands WHERE name = btrim(p_name) AND id <> p_id) THEN
    RAISE EXCEPTION 'A brand with that name already exists';
  END IF;
  UPDATE public.brands SET name = btrim(p_name), serial_prefix = btrim(p_serial_prefix)
    WHERE id = p_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Brand not found'; END IF;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_brand(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name text; v_used int;
BEGIN
  IF public.app_role() NOT IN ('admin','superadmin','manager') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT name INTO v_name FROM public.brands WHERE id = p_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Brand not found'; END IF;
  SELECT count(*) INTO v_used FROM public.laptops WHERE brand = v_name;
  IF v_used > 0 THEN RAISE EXCEPTION 'Cannot remove: laptops exist with this brand.'; END IF;
  DELETE FROM public.brands WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- ---------------------------------------------------------------------------
-- 9. Laptops (serial gen, create, bulk, update, delete)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_next_serial(p_prefix text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_max int := 0; v_cur text;
BEGIN
  FOR v_cur IN SELECT serial_number FROM public.laptops WHERE serial_number LIKE p_prefix || '%'
  LOOP
    BEGIN
      v_max := GREATEST(v_max, substring(v_cur FROM length(p_prefix)+1)::int);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN p_prefix || lpad((v_max + 1)::text, 3, '0');
END $$;

-- Build normalized jsonb laptop object from raw input.
CREATE OR REPLACE FUNCTION public.app_normalize_laptop(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_brand text := COALESCE(btrim(p_data->>'brand'), '');
  v_model text := COALESCE(btrim(p_data->>'brand_model'), '');
BEGIN
  RETURN jsonb_build_object(
    'brand', v_brand,
    'brand_model', CASE WHEN v_model = '' THEN v_brand || COALESCE(p_data->>'model','') ELSE v_model END,
    'processor_type', NULLIF(btrim(COALESCE(p_data->>'processor_type','')), ''),
    'generation', NULLIF(btrim(COALESCE(p_data->>'generation','')), ''),
    'storage_type', NULLIF(btrim(COALESCE(p_data->>'storage_type','')), ''),
    'purchased_from', NULLIF(btrim(COALESCE(p_data->>'purchased_from','')), ''),
    'graphics', NULLIF(btrim(COALESCE(p_data->>'graphics','')), ''),
    'graphics_type', NULLIF(btrim(COALESCE(p_data->>'graphics_type','')), ''),
    'graphics_model', NULLIF(btrim(COALESCE(p_data->>'graphics_model','')), ''),
    'purchase_rate', CASE WHEN p_data->>'purchase_rate' IS NULL OR p_data->>'purchase_rate' = '' THEN NULL
                          ELSE (p_data->>'purchase_rate')::numeric END,
    'extra_charges', CASE WHEN p_data->>'extra_charges' IS NULL OR p_data->>'extra_charges' = '' THEN NULL
                          ELSE (p_data->>'extra_charges')::numeric END,
    'serial_number', NULLIF(btrim(COALESCE(p_data->>'serial_number','')), ''),
    'current_store_id', CASE WHEN p_data->>'current_store_id' IS NULL OR p_data->>'current_store_id' = '' THEN NULL
                             ELSE (p_data->>'current_store_id')::bigint END,
    'status', COALESCE(p_data->>'status','In Stock')
  );
END $$;

-- Attach store name + numeric coercion to a laptop row (matching old API shape).
CREATE OR REPLACE FUNCTION public.app_laptop_json(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row jsonb;
BEGIN
  SELECT jsonb_build_object(
      'id', l.id,
      'brand', l.brand,
      'brand_model', l.brand_model,
      'processor_type', l.processor_type,
      'generation', l.generation,
      'storage_type', l.storage_type,
      'purchased_from', l.purchased_from,
      'graphics', l.graphics,
      'graphics_type', l.graphics_type,
      'graphics_model', l.graphics_model,
      'purchase_rate', l.purchase_rate,
      'extra_charges', l.extra_charges,
      'serial_number', l.serial_number,
      'current_store_id', l.current_store_id,
      'current_store_name', s.store_name,
      'status', l.status,
      'created_at', to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS'),
      'updated_at', to_char(l.updated_at, 'YYYY-MM-DD HH24:MI:SS')
    ) INTO v_row
  FROM public.laptops l LEFT JOIN public.stores s ON s.id = l.current_store_id
  WHERE l.id = p_id;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.app_create_laptop(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_l jsonb := public.app_normalize_laptop(p_data);
  v_id bigint;
  v_serial text := NULLIF(btrim(COALESCE(p_data->>'serial_number','')), '');
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF v_l->>'brand' = '' THEN RAISE EXCEPTION 'brand is required'; END IF;
  IF v_l->>'brand_model' = '' THEN RAISE EXCEPTION 'brand_model is required'; END IF;
  IF v_l->>'status' NOT IN ('In Stock','In Transit','Sold') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF v_serial IS NULL THEN RAISE EXCEPTION 'serial_number is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.laptops WHERE serial_number = v_serial) THEN
    RAISE EXCEPTION 'Serial % already exists', v_serial;
  END IF;
  INSERT INTO public.laptops (brand, brand_model, processor_type, generation, storage_type, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status)
  VALUES (v_l->>'brand', v_l->>'brand_model', v_l->>'processor_type', v_l->>'generation', v_l->>'storage_type', v_l->>'purchased_from', v_l->>'graphics', v_l->>'graphics_type', v_l->>'graphics_model', (v_l->>'purchase_rate')::numeric, (v_l->>'extra_charges')::numeric, v_serial, (v_l->>'current_store_id')::bigint, v_l->>'status')
  RETURNING id INTO v_id;
  RETURN public.app_laptop_json(v_id);
END $$;

CREATE OR REPLACE FUNCTION public.app_bulk_create_laptops(p_data jsonb, p_quantity int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_l jsonb;
  v_serial text;
  v_id bigint;
  v_result jsonb := '[]'::jsonb;
  v_prefix text := COALESCE(NULLIF(btrim(COALESCE(p_data->>'serial_prefix','')), ''), NULLIF(btrim(COALESCE(p_data->>'brand','')), ''));
  v_brand_row public.brands%ROWTYPE;
  i int;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF p_quantity < 1 OR p_quantity > 1000 THEN RAISE EXCEPTION 'quantity must be between 1 and 1000'; END IF;
  SELECT * INTO v_brand_row FROM public.brands WHERE name = btrim(COALESCE(p_data->>'brand','')) LIMIT 1;
  IF v_brand_row.id IS NOT NULL THEN v_prefix := COALESCE(v_prefix, v_brand_row.serial_prefix); END IF;
  IF COALESCE(v_prefix,'') = '' THEN RAISE EXCEPTION 'Could not determine serial prefix. Add this brand first or provide a prefix.'; END IF;
  v_l := public.app_normalize_laptop(p_data);
  IF v_l->>'brand' = '' THEN RAISE EXCEPTION 'brand is required'; END IF;
  IF v_l->>'brand_model' = '' THEN RAISE EXCEPTION 'brand_model is required'; END IF;
  FOR i IN 1..p_quantity LOOP
    v_serial := public.app_next_serial(v_prefix);
    WHILE EXISTS (SELECT 1 FROM public.laptops WHERE serial_number = v_serial) LOOP
      v_serial := public.app_next_serial(v_prefix || 'X');
    END LOOP;
    INSERT INTO public.laptops (brand, brand_model, processor_type, generation, storage_type, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status)
    VALUES (v_l->>'brand', v_l->>'brand_model', v_l->>'processor_type', v_l->>'generation', v_l->>'storage_type', v_l->>'purchased_from', v_l->>'graphics', v_l->>'graphics_type', v_l->>'graphics_model', (v_l->>'purchase_rate')::numeric, (v_l->>'extra_charges')::numeric, v_serial, (v_l->>'current_store_id')::bigint, v_l->>'status')
    RETURNING id INTO v_id;
    v_result := v_result || jsonb_build_array(public.app_laptop_json(v_id));
  END LOOP;
  RETURN jsonb_build_object('laptops', v_result);
END $$;

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
  v_l := public.app_normalize_laptop(p_data || jsonb_build_object('brand_model', COALESCE(NULLIF(p_data->>'brand_model',''), v_cur.brand_model)));
  IF v_l->>'brand' = '' THEN v_l := jsonb_set(v_l, '{brand}', to_jsonb(v_cur.brand)); END IF;
  IF v_l->>'status' NOT IN ('In Stock','In Transit','Sold') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.laptops SET
    brand = v_l->>'brand',
    brand_model = v_l->>'brand_model',
    processor_type = v_l->>'processor_type',
    generation = v_l->>'generation',
    storage_type = v_l->>'storage_type',
    purchased_from = v_l->>'purchased_from',
    graphics = v_l->>'graphics',
    graphics_type = v_l->>'graphics_type',
    graphics_model = v_l->>'graphics_model',
    purchase_rate = (v_l->>'purchase_rate')::numeric,
    extra_charges = (v_l->>'extra_charges')::numeric,
    current_store_id = (v_l->>'current_store_id')::bigint,
    status = v_l->>'status',
    updated_at = now()
  WHERE id = p_id;
  RETURN public.app_laptop_json(p_id);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_laptop(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.laptops WHERE id = p_id) THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  DELETE FROM public.sales WHERE laptop_id = p_id;
  DELETE FROM public.transferlogs WHERE laptop_id = p_id;
  DELETE FROM public.laptops WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- Transfer with audit log (transactional).
CREATE OR REPLACE FUNCTION public.app_transfer_laptop(p_laptop_id bigint, p_to_store bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cur public.laptops%ROWTYPE;
  v_from public.stores%ROWTYPE;
  v_to public.stores%ROWTYPE;
BEGIN
  IF NOT public.app_perm('transferLaptops') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO v_cur FROM public.laptops WHERE id = p_laptop_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  SELECT * INTO v_to FROM public.stores WHERE id = p_to_store;
  IF v_to.id IS NULL THEN RAISE EXCEPTION 'Destination store not found'; END IF;
  SELECT * INTO v_from FROM public.stores WHERE id = v_cur.current_store_id;
  INSERT INTO public.transferlogs (laptop_id, from_store_id, to_store_id) VALUES (p_laptop_id, v_cur.current_store_id, p_to_store);
  UPDATE public.laptops SET current_store_id = p_to_store, updated_at = now() WHERE id = p_laptop_id;
  RETURN jsonb_build_object(
    'ok', true,
    'laptop', public.app_laptop_json(p_laptop_id),
    'from', to_jsonb(v_from),
    'to', to_jsonb(v_to)
  );
END $$;

-- ---------------------------------------------------------------------------
-- 10. Sales
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_sell_laptop(p_laptop_id bigint, p_sale_price numeric, p_sold_by text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cur public.laptops%ROWTYPE;
  v_cost numeric;
  v_profit numeric;
  v_row public.sales%ROWTYPE;
  v_store public.stores%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO v_cur FROM public.laptops WHERE id = p_laptop_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;
  IF v_cur.status = 'Sold' THEN RAISE EXCEPTION 'Laptop is already sold'; END IF;
  IF p_sale_price IS NULL OR p_sale_price < 0 THEN RAISE EXCEPTION 'sale_price is required'; END IF;
  v_cost := COALESCE(v_cur.purchase_rate,0) + COALESCE(v_cur.extra_charges,0);
  v_profit := p_sale_price - v_cost;
  INSERT INTO public.sales (laptop_id, serial_number, brand_model, store_id, sale_price, cost_price, profit, sold_by)
  VALUES (p_laptop_id, v_cur.serial_number, v_cur.brand_model, v_cur.current_store_id, p_sale_price, v_cost, v_profit, p_sold_by)
  RETURNING * INTO v_row;
  UPDATE public.laptops SET status = 'Sold', updated_at = now() WHERE id = p_laptop_id;
  SELECT * INTO v_store FROM public.stores WHERE id = v_row.store_id;
  RETURN jsonb_build_object(
    'sale', jsonb_build_object(
      'id', v_row.id, 'laptop_id', v_row.laptop_id, 'serial_number', v_row.serial_number,
      'brand_model', v_row.brand_model, 'store_id', v_row.store_id, 'store_name', v_store.store_name,
      'sale_price', v_row.sale_price, 'cost_price', v_row.cost_price, 'profit', v_row.profit,
      'sold_by', v_row.sold_by, 'sold_at', to_char(v_row.sold_at, 'YYYY-MM-DD HH24:MI:SS'))
  );
END $$;

CREATE OR REPLACE FUNCTION public.app_get_sales()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb := '[]'::jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', s.id, 'laptop_id', s.laptop_id, 'serial_number', s.serial_number, 'brand_model', s.brand_model,
      'store_id', s.store_id, 'store_name', st.store_name, 'sale_price', s.sale_price, 'cost_price', s.cost_price,
      'profit', s.profit, 'sold_by', s.sold_by, 'sold_at', to_char(s.sold_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY s.sold_at DESC), '[]'::jsonb) INTO v_out
  FROM public.sales s LEFT JOIN public.stores st ON st.id = s.store_id;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_sales_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  SELECT jsonb_build_object(
    'count', count(*),
    'total_sales', COALESCE(sum(sale_price),0),
    'total_profit', COALESCE(sum(profit),0),
    'total_cost', COALESCE(sum(cost_price),0)
  ) INTO v_out FROM public.sales;
  RETURN v_out;
END $$;

-- ---------------------------------------------------------------------------
-- 11. Users (auth.users + profiles), login logging, lists
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_create_user(p_username text, p_password text, p_display_name text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.app_role();
  v_uid uuid := gen_random_uuid();
  v_email text;
  v_name text := lower(btrim(p_username));
BEGIN
  IF v_role NOT IN ('superadmin','admin') THEN
    IF v_role = 'manager' AND NOT public.app_perm('createStaff') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
    IF p_role IN ('admin','superadmin') THEN RAISE EXCEPTION 'Managers cannot create admin accounts'; END IF;
  END IF;
  IF p_role = 'superadmin' AND v_role <> 'superadmin' THEN RAISE EXCEPTION 'Only the super admin can create super admin accounts'; END IF;
  IF v_name !~ '^[a-z0-9._-]{3,32}$' THEN RAISE EXCEPTION 'Username must be 3-32 chars: letters, numbers, . _ -'; END IF;
  IF COALESCE(p_password,'') = '' OR length(p_password) < 6 THEN RAISE EXCEPTION 'Password must be at least 6 characters'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_name) THEN RAISE EXCEPTION 'Username already taken'; END IF;
  v_email := v_name || '@laptop.inventory';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
  VALUES (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
          extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb, false, false, now(), now());
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_uid, v_email, jsonb_build_object('sub', v_uid::text, 'email', v_email), 'email', now(), now(), now());
  INSERT INTO public.profiles (id, username, display_name, role)
  VALUES (v_uid, v_name, COALESCE(btrim(p_display_name), v_name), COALESCE(p_role,'staff'));
  RETURN jsonb_build_object('user', jsonb_build_object(
    'id', v_uid, 'username', v_name, 'display_name', COALESCE(btrim(p_display_name), v_name),
    'role', COALESCE(p_role,'staff'), 'created_at', to_char(now(), 'YYYY-MM-DD HH24:MI:SS')));
END $$;

CREATE OR REPLACE FUNCTION public.app_update_user(p_id uuid, p_username text, p_password text, p_display_name text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.app_role();
  v_cur public.profiles%ROWTYPE;
  v_name text;
  v_email text;
BEGIN
  SELECT * INTO v_cur FROM public.profiles WHERE id = p_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_role = 'manager' THEN
    IF NOT public.app_perm('createStaff') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
    IF v_cur.role IN ('admin','superadmin') THEN RAISE EXCEPTION 'Admin accounts are hidden from managers'; END IF;
    IF p_role IN ('admin','superadmin') THEN RAISE EXCEPTION 'Managers cannot assign the admin role'; END IF;
  END IF;
  IF v_role = 'admin' THEN
    IF v_cur.role = 'superadmin' THEN RAISE EXCEPTION 'Admin cannot modify the super admin account'; END IF;
    IF p_role = 'superadmin' THEN RAISE EXCEPTION 'Admin cannot assign the super admin role'; END IF;
  END IF;
  IF p_username IS NOT NULL AND btrim(p_username) <> '' THEN
    v_name := lower(btrim(p_username));
    IF v_name !~ '^[a-z0-9._-]{3,32}$' THEN RAISE EXCEPTION 'Invalid username'; END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_name AND id <> p_id) THEN RAISE EXCEPTION 'Username already taken'; END IF;
    v_email := v_name || '@laptop.inventory';
    UPDATE auth.users SET email = v_email, updated_at = now() WHERE id = p_id;
    UPDATE auth.identities SET provider_id = v_email, identity_data = jsonb_build_object('sub', p_id::text, 'email', v_email)
      WHERE user_id = p_id AND provider = 'email';
    UPDATE public.profiles SET username = v_name WHERE id = p_id;
  END IF;
  IF p_password IS NOT NULL AND btrim(p_password) <> '' THEN
    IF length(p_password) < 6 THEN RAISE EXCEPTION 'Password must be at least 6 characters'; END IF;
    UPDATE auth.users SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), updated_at = now() WHERE id = p_id;
  END IF;
  IF p_display_name IS NOT NULL THEN
    UPDATE public.profiles SET display_name = COALESCE(btrim(p_display_name), v_cur.username) WHERE id = p_id;
  END IF;
  IF p_role IS NOT NULL AND p_role <> '' THEN
    IF p_role NOT IN ('superadmin','admin','manager','staff') THEN RAISE EXCEPTION 'Invalid role'; END IF;
    IF p_role = 'superadmin' AND v_role <> 'superadmin' THEN RAISE EXCEPTION 'Only the super admin can assign super admin'; END IF;
    IF v_role = 'admin' AND p_role = 'superadmin' THEN RAISE EXCEPTION 'Admin cannot assign the super admin role'; END IF;
    IF v_role = 'manager' AND p_role IN ('admin','superadmin') THEN RAISE EXCEPTION 'Managers cannot assign admin roles'; END IF;
    UPDATE public.profiles SET role = p_role WHERE id = p_id;
  END IF;
  SELECT * INTO v_cur FROM public.profiles WHERE id = p_id;
  RETURN jsonb_build_object('user', jsonb_build_object(
    'id', v_cur.id, 'username', v_cur.username, 'display_name', v_cur.display_name,
    'role', v_cur.role, 'created_at', to_char(v_cur.created_at, 'YYYY-MM-DD HH24:MI:SS')));
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_user(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role text := public.app_role();
BEGIN
  IF v_role NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_id) THEN RAISE EXCEPTION 'User not found'; END IF;
  DELETE FROM public.profiles WHERE id = p_id; -- cascades auth.users delete
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

CREATE OR REPLACE FUNCTION public.app_get_users()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role text := public.app_role(); v_out jsonb;
BEGIN
  IF v_role NOT IN ('admin','superadmin','manager') THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'role', p.role, 'created_at', to_char(p.created_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY p.id), '[]'::jsonb) INTO v_out
  FROM public.profiles p
  WHERE (v_role = 'manager' AND p.role NOT IN ('admin','superadmin'))
     OR (v_role = 'admin' AND p.role <> 'superadmin')
     OR v_role = 'superadmin';
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_get_login_logs(p_limit int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  IF public.app_role() NOT IN ('admin','superadmin') THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id, 'user_id', l.user_id, 'username', l.username, 'ip', l.ip,
      'user_agent', l.user_agent, 'logged_in', to_char(l.logged_in, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY l.logged_in DESC), '[]'::jsonb) INTO v_out
  FROM public.loginlogs l LIMIT p_limit;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_record_login(p_ip text, p_user_agent text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_username text;
BEGIN
  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
  IF v_username IS NOT NULL THEN
    INSERT INTO public.loginlogs (user_id, username, ip, user_agent) VALUES (v_uid, v_username, p_ip, p_user_agent);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 12. Read queries
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_get_laptops(p_store_id bigint DEFAULT NULL, p_status text DEFAULT NULL, p_search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id, 'brand', l.brand, 'brand_model', l.brand_model,
      'processor_type', l.processor_type, 'generation', l.generation, 'storage_type', l.storage_type,
      'purchased_from', l.purchased_from, 'graphics', l.graphics, 'graphics_type', l.graphics_type,
      'graphics_model', l.graphics_model, 'purchase_rate', l.purchase_rate, 'extra_charges', l.extra_charges,
      'serial_number', l.serial_number, 'current_store_id', l.current_store_id,
      'current_store_name', s.store_name, 'status', l.status,
      'created_at', to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS'),
      'updated_at', to_char(l.updated_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY l.updated_at DESC), '[]'::jsonb) INTO v_out
  FROM public.laptops l LEFT JOIN public.stores s ON s.id = l.current_store_id
  WHERE (p_store_id IS NULL OR l.current_store_id = p_store_id)
    AND (p_status IS NULL OR l.status = p_status)
    AND (p_search IS NULL OR l.brand ILIKE '%' || p_search || '%' OR l.brand_model ILIKE '%' || p_search || '%' OR l.serial_number ILIKE '%' || p_search || '%');
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_get_transfer_logs(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', tl.id, 'laptop_id', tl.laptop_id, 'from_store_id', tl.from_store_id, 'to_store_id', tl.to_store_id,
      'brand_model', l.brand_model, 'serial_number', l.serial_number,
      'from_store_name', fs.store_name, 'to_store_name', ts.store_name,
      'changed_at', to_char(tl.changed_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY tl.changed_at DESC), '[]'::jsonb) INTO v_out
  FROM public.transferlogs tl
  JOIN public.laptops l ON l.id = tl.laptop_id
  LEFT JOIN public.stores fs ON fs.id = tl.from_store_id
  LEFT JOIN public.stores ts ON ts.id = tl.to_store_id
  LIMIT p_limit;
  RETURN v_out;
END $$;

-- ---------------------------------------------------------------------------
-- 13. Grants (service/definer functions run as postgres; grant EXECUTE)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ---------------------------------------------------------------------------
-- 14. Seed: superadmin + admin (only if no profiles exist)
--     Passwords are NOT stored in this repository. Generate strong passwords
--     and set them via the Supabase dashboard (Authentication > Users) after
--     applying, or pass them at runtime via psql variables.
-- ---------------------------------------------------------------------------
-- If you need scripted seeding, create users with a DO block that reads
-- passwords from environment/JIT variables, e.g. current_setting('app.seed_pass', true):
DO $$
DECLARE v_super uuid := gen_random_uuid(); v_admin uuid := gen_random_uuid();
DECLARE p_super text := current_setting('app.superadmin_password', true);
DECLARE p_admin text := current_setting('app.admin_password', true);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
    IF p_super IS NULL OR p_admin IS NULL THEN
      RAISE EXCEPTION 'Set app.superadmin_password and app.admin_password (SET app.superadmin_password = ''...'') before seeding users';
    END IF;
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
    VALUES (v_super, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@laptop.inventory',
            extensions.crypt(p_super, extensions.gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false, now(), now());
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_super, 'superadmin@laptop.inventory', jsonb_build_object('sub', v_super::text, 'email', 'superadmin@laptop.inventory'), 'email', now(), now(), now());
    INSERT INTO public.profiles (id, username, display_name, role) VALUES (v_super, 'superadmin', 'Super Administrator', 'superadmin');

    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at)
    VALUES (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@laptop.inventory',
            extensions.crypt(p_admin, extensions.gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false, now(), now());
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_admin, 'admin@laptop.inventory', jsonb_build_object('sub', v_admin::text, 'email', 'admin@laptop.inventory'), 'email', now(), now(), now());
    INSERT INTO public.profiles (id, username, display_name, role) VALUES (v_admin, 'admin', 'System Administrator', 'admin');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 15. GoTrue compatibility: auth.users token columns must be '' not NULL, else
--     PASS /login returns 500 "Database error querying schema".
--     (pgcrypto lives in the extensions schema on Supabase.)
-- ---------------------------------------------------------------------------
UPDATE auth.users SET
  confirmation_token            = COALESCE(NULLIF(confirmation_token,''),''),
  recovery_token                = COALESCE(NULLIF(recovery_token,''),''),
  email_change_token_current    = COALESCE(NULLIF(email_change_token_current,''),''),
  email_change_token_new        = COALESCE(NULLIF(email_change_token_new,''),''),
  email_change                  = COALESCE(NULLIF(email_change,''),''),
  phone_change                  = COALESCE(NULLIF(phone_change,''),''),
  reauthentication_token        = COALESCE(NULLIF(reauthentication_token,''),''),
  confirmation_sent_at          = COALESCE(confirmation_sent_at, now()),
  recovery_sent_at              = COALESCE(recovery_sent_at, now()),
  email_change_sent_at          = COALESCE(email_change_sent_at, now());

-- ---------------------------------------------------------------------------
-- 16. V2 (applied): storage_size, vendors catalog, superadmin-only permission
--     model (app_perm_exact + manageVendors), auto serial for single adds,
--     and the account matrix (max 8 accounts; superadmin resets anyone,
--     admin only manager+staff, manager no password resets).
--     Apply supabase-update.sql on top of this file — it is idempotent and
--     contains every CREATE OR REPLACE from v2.
-- ---------------------------------------------------------------------------
