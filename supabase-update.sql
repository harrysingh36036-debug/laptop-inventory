-- ============================================================================
-- Delta: storage_size + vendors catalog + account/role rules + auto serials
-- Idempotent: safe to re-run on top of supabase-migration.sql (v1).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SSDs / HDD size on laptops
-- ---------------------------------------------------------------------------
ALTER TABLE public.laptops ADD COLUMN IF NOT EXISTS storage_size text;

-- ---------------------------------------------------------------------------
-- 2. Vendors catalog (who laptops are purchased from)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendors (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  contact    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vendors_read" ON public.vendors;
CREATE POLICY "vendors_read" ON public.vendors FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.vendors TO authenticated;

DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.vendors';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Exact permission check: superadmin always allowed; everyone else
--    (including admin) must be granted the permission by the super admin.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_perm_exact(p_perm text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role text := public.app_role(); v_raw text; v_perms jsonb;
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

-- ---------------------------------------------------------------------------
-- 4. Vendors: add / update / delete / bulk delete (superadmin-granted only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_add_vendor(p_name text, p_contact text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.vendors%ROWTYPE;
BEGIN
  IF NOT public.app_perm_exact('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF COALESCE(btrim(p_name),'') = '' THEN RAISE EXCEPTION 'name is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.vendors WHERE name = btrim(p_name)) THEN
    RAISE EXCEPTION 'A vendor with that name already exists';
  END IF;
  INSERT INTO public.vendors (name, contact)
  VALUES (btrim(p_name), COALESCE(btrim(p_contact),'')) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_update_vendor(p_id bigint, p_name text, p_contact text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.vendors%ROWTYPE;
BEGIN
  IF NOT public.app_perm_exact('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF COALESCE(btrim(p_name),'') = '' THEN RAISE EXCEPTION 'name is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.vendors WHERE name = btrim(p_name) AND id <> p_id) THEN
    RAISE EXCEPTION 'A vendor with that name already exists';
  END IF;
  UPDATE public.vendors SET name = btrim(p_name), contact = COALESCE(btrim(p_contact),'')
    WHERE id = p_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_vendor(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.vendors%ROWTYPE;
BEGIN
  IF NOT public.app_perm_exact('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  DELETE FROM public.vendors WHERE id = p_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

CREATE OR REPLACE FUNCTION public.app_bulk_delete_vendors(p_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  IF NOT public.app_perm_exact('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN RAISE EXCEPTION 'No vendors selected'; END IF;
  DELETE FROM public.vendors WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_n);
END $$;

-- ---------------------------------------------------------------------------
-- 5. Laptop payload now carries storage_size
-- ---------------------------------------------------------------------------
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
    'storage_size', NULLIF(btrim(COALESCE(p_data->>'storage_size','')), ''),
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
      'storage_size', l.storage_size,
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

-- ---------------------------------------------------------------------------
-- 6. Create single: auto-generated serial when none provided (brand prefix)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_create_laptop(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_l jsonb := public.app_normalize_laptop(p_data);
  v_id bigint;
  v_serial text := NULLIF(btrim(COALESCE(p_data->>'serial_number','')), '');
  v_prefix text;
  v_brand_row public.brands%ROWTYPE;
BEGIN
  IF NOT public.app_perm('editInventory') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF v_l->>'brand' = '' THEN RAISE EXCEPTION 'brand is required'; END IF;
  IF v_l->>'brand_model' = '' THEN RAISE EXCEPTION 'brand_model is required'; END IF;
  IF v_l->>'status' NOT IN ('In Stock','In Transit','Sold') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF v_serial IS NULL THEN
    SELECT * INTO v_brand_row FROM public.brands WHERE name = btrim(v_l->>'brand') LIMIT 1;
    v_prefix := NULLIF(btrim(COALESCE(p_data->>'serial_prefix','')), '');
    IF v_brand_row.id IS NOT NULL THEN v_prefix := COALESCE(v_prefix, v_brand_row.serial_prefix); END IF;
    v_prefix := COALESCE(v_prefix, v_l->>'brand');
    IF v_prefix = '' THEN RAISE EXCEPTION 'serial_number is required (no brand prefix is set for this brand)'; END IF;
    v_serial := public.app_next_serial(v_prefix);
    WHILE EXISTS (SELECT 1 FROM public.laptops WHERE serial_number = v_serial) LOOP
      v_serial := public.app_next_serial(v_prefix || 'X');
    END LOOP;
  END IF;
  IF EXISTS (SELECT 1 FROM public.laptops WHERE serial_number = v_serial) THEN
    RAISE EXCEPTION 'Serial % already exists', v_serial;
  END IF;
  INSERT INTO public.laptops (brand, brand_model, processor_type, generation, storage_type, storage_size, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status)
  VALUES (v_l->>'brand', v_l->>'brand_model', v_l->>'processor_type', v_l->>'generation', v_l->>'storage_type', v_l->>'storage_size', v_l->>'purchased_from', v_l->>'graphics', v_l->>'graphics_type', v_l->>'graphics_model', (v_l->>'purchase_rate')::numeric, (v_l->>'extra_charges')::numeric, v_serial, (v_l->>'current_store_id')::bigint, v_l->>'status')
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
    INSERT INTO public.laptops (brand, brand_model, processor_type, generation, storage_type, storage_size, purchased_from, graphics, graphics_type, graphics_model, purchase_rate, extra_charges, serial_number, current_store_id, status)
    VALUES (v_l->>'brand', v_l->>'brand_model', v_l->>'processor_type', v_l->>'generation', v_l->>'storage_type', v_l->>'storage_size', v_l->>'purchased_from', v_l->>'graphics', v_l->>'graphics_type', v_l->>'graphics_model', (v_l->>'purchase_rate')::numeric, (v_l->>'extra_charges')::numeric, v_serial, (v_l->>'current_store_id')::bigint, v_l->>'status')
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
  IF v_l->>'status' = 'Sold' THEN RAISE EXCEPTION 'Use the Sell action to record a sale (sold units are tracked on the Sales board)'; END IF;
  IF v_cur.status = 'Sold' THEN RAISE EXCEPTION 'Sold units are final; delete the laptop to remove it'; END IF;
  UPDATE public.laptops SET
    brand = v_l->>'brand',
    brand_model = v_l->>'brand_model',
    processor_type = v_l->>'processor_type',
    generation = v_l->>'generation',
    storage_type = v_l->>'storage_type',
    storage_size = v_l->>'storage_size',
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

-- ---------------------------------------------------------------------------
-- 7. Account rules: creation admin/superadmin only, max 8 accounts
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
  IF v_role NOT IN ('superadmin','admin') THEN RAISE EXCEPTION 'Only an admin or the super admin can create accounts'; END IF;
  IF p_role = 'superadmin' AND v_role <> 'superadmin' THEN RAISE EXCEPTION 'Only the super admin can create super admin accounts'; END IF;
  IF (SELECT count(*) FROM public.profiles) >= 8 THEN RAISE EXCEPTION 'Account limit reached: maximum 8 accounts'; END IF;
  IF v_name !~ '^[a-z0-9._-]{3,32}$' THEN RAISE EXCEPTION 'Username must be 3-32 chars: letters, numbers, . _ -'; END IF;
  IF COALESCE(p_password,'') = '' OR length(p_password) < 6 THEN RAISE EXCEPTION 'Password must be at least 6 characters'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_name) THEN RAISE EXCEPTION 'Username already taken'; END IF;
  v_email := v_name || '@laptop.inventory';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, confirmation_token, recovery_token, email_change, confirmation_sent_at, recovery_sent_at, email_change_sent_at, created_at, updated_at)
  VALUES (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
          extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb, false, false, '', '', '', now(), now(), now(), now(), now());
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_uid, v_email, jsonb_build_object('sub', v_uid::text, 'email', v_email), 'email', now(), now(), now());
  INSERT INTO public.profiles (id, username, display_name, role)
  VALUES (v_uid, v_name, COALESCE(btrim(p_display_name), v_name), COALESCE(p_role,'staff'));
  UPDATE auth.users SET
    confirmation_token = '',
    recovery_token = '',
    email_change = '',
    phone_change = '',
    reauthentication_token = '',
    email_change_token_current = '',
    email_change_token_new = ''
  WHERE id = v_uid;
  RETURN jsonb_build_object('user', jsonb_build_object(
    'id', v_uid, 'username', v_name, 'display_name', COALESCE(btrim(p_display_name), v_name),
    'role', COALESCE(p_role,'staff'), 'created_at', to_char(now(), 'YYYY-MM-DD HH24:MI:SS')));
END $$;

-- ---------------------------------------------------------------------------
-- 8. Password/role update matrix
--    superadmin: anyone. admin: manager+staff only (can reset their passwords,
--    never admins/superadmin). manager: staff/manager profile edits only,
--    no password resets.
-- ---------------------------------------------------------------------------
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

  IF v_role = 'superadmin' THEN
    NULL; -- full control over every account
  ELSIF v_role = 'admin' THEN
    IF v_cur.role NOT IN ('manager','staff') THEN RAISE EXCEPTION 'Admins can only manage manager and staff accounts'; END IF;
    IF p_role IN ('admin','superadmin') THEN RAISE EXCEPTION 'Admins cannot assign the admin or super admin role'; END IF;
  ELSIF v_role = 'manager' THEN
    IF NOT public.app_perm('createStaff') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
    IF v_cur.role IN ('admin','superadmin') THEN RAISE EXCEPTION 'Admin accounts are hidden from managers'; END IF;
    IF p_role IN ('admin','superadmin') THEN RAISE EXCEPTION 'Managers cannot assign the admin or super admin role'; END IF;
    IF p_password IS NOT NULL AND btrim(p_password) <> '' THEN
      RAISE EXCEPTION 'Only the super admin or an admin can reset passwords';
    END IF;
  ELSE
    RAISE EXCEPTION 'Insufficient permissions';
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
    UPDATE public.profiles SET role = p_role WHERE id = p_id;
  END IF;
  SELECT * INTO v_cur FROM public.profiles WHERE id = p_id;
  RETURN jsonb_build_object('user', jsonb_build_object(
    'id', v_cur.id, 'username', v_cur.username, 'display_name', v_cur.display_name,
    'role', v_cur.role, 'created_at', to_char(v_cur.created_at, 'YYYY-MM-DD HH24:MI:SS')));
END $$;

-- ---------------------------------------------------------------------------
-- 9. Delete rules: superadmin anyone (not self); admin managers/staff only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_delete_user(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role text := public.app_role(); v_target text;
BEGIN
  SELECT role INTO v_target FROM public.profiles WHERE id = p_id;
  IF v_target IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_role = 'superadmin' THEN
    IF p_id = auth.uid() THEN RAISE EXCEPTION 'Cannot delete your own account'; END IF;
  ELSIF v_role = 'admin' THEN
    IF v_target NOT IN ('manager','staff') THEN RAISE EXCEPTION 'Admins can only delete manager and staff accounts'; END IF;
    IF p_id = auth.uid() THEN RAISE EXCEPTION 'Cannot delete your own account'; END IF;
  ELSE
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  DELETE FROM auth.users WHERE id = p_id; -- cascades to profiles, identities, loginlogs
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- ---------------------------------------------------------------------------
-- 10. User list visibility per role
-- ---------------------------------------------------------------------------
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
  WHERE (v_role = 'manager' AND p.role IN ('manager','staff'))
     OR (v_role = 'admin' AND p.role IN ('manager','staff'))
     OR v_role = 'superadmin';
  RETURN v_out;
END $$;

-- ---------------------------------------------------------------------------
-- 11. Only the super admin may edit role_permissions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_set_settings(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE k text; v text; v_role text := public.app_role();
BEGIN
  IF NOT public.app_perm('editLabels') AND v_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  IF (p_patch ? 'role_permissions') AND v_role <> 'superadmin' THEN
    RAISE EXCEPTION 'Only the super admin can edit role permissions';
  END IF;
  FOR k, v IN SELECT key, value FROM jsonb_each_text(p_patch)
  LOOP
    INSERT INTO public.settings (key, value) VALUES (k, v)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END LOOP;
  RETURN public.app_get_settings();
END $$;

-- ---------------------------------------------------------------------------
-- 12. Laptop listing carries storage_size
-- ---------------------------------------------------------------------------
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
      'created_at', to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS'),
      'updated_at', to_char(l.updated_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY l.updated_at DESC), '[]'::jsonb) INTO v_out
  FROM public.laptops l LEFT JOIN public.stores s ON s.id = l.current_store_id
  WHERE (p_store_id IS NULL OR l.current_store_id = p_store_id)
    AND (p_status IS NULL OR l.status = p_status)
    AND (p_search IS NULL OR l.brand ILIKE '%' || p_search || '%' OR l.brand_model ILIKE '%' || p_search || '%' OR l.serial_number ILIKE '%' || p_search || '%');
  RETURN v_out;
END $$;

-- ---------------------------------------------------------------------------
-- 13. Bulk-delete users (superadmin anyone except self; admin managers/staff)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_bulk_delete_users(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.app_role();
  v_me uuid := auth.uid();
  v_ids uuid[];
  v_n int := 0;
BEGIN
  IF p_ids IS NULL THEN RAISE EXCEPTION 'No users selected'; END IF;
  v_ids := ARRAY(SELECT DISTINCT unnest(p_ids));
  IF v_ids = '{}' THEN RAISE EXCEPTION 'No users selected'; END IF;
  IF v_role = 'superadmin' THEN
    IF v_me = ANY(v_ids) THEN RAISE EXCEPTION 'Cannot delete your own account'; END IF;
  ELSIF v_role = 'admin' THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = ANY(v_ids) AND role NOT IN ('manager','staff')) THEN
      RAISE EXCEPTION 'Admins can only delete manager and staff accounts';
    END IF;
    IF v_me = ANY(v_ids) THEN RAISE EXCEPTION 'Cannot delete your own account'; END IF;
  ELSE
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  SELECT count(*) INTO v_n FROM public.profiles WHERE id = ANY(v_ids);
  DELETE FROM auth.users WHERE id = ANY(v_ids); -- cascades profiles, identities, loginlogs
  RETURN jsonb_build_object('ok', true, 'deleted', v_n);
END $$;

-- ============================================================================
-- 14. Customers catalog (who laptops are sold to)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL,
  phone      text NOT NULL DEFAULT '',
  email      text NOT NULL DEFAULT '',
  address    text NOT NULL DEFAULT '',
  notes      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_read" ON public.customers;
CREATE POLICY "customers_read" ON public.customers FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.customers TO authenticated;

DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.customers';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.app_get_customers()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email,
      'address', c.address, 'notes', c.notes,
      'created_at', to_char(c.created_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY c.name), '[]'::jsonb) INTO v_out
  FROM public.customers c;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_add_customer(p_name text, p_phone text DEFAULT '', p_email text DEFAULT '', p_address text DEFAULT '', p_notes text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.customers%ROWTYPE;
BEGIN
  IF NOT public.app_perm_exact('manageCustomers') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF COALESCE(btrim(p_name),'') = '' THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  INSERT INTO public.customers (name, phone, email, address, notes)
  VALUES (btrim(p_name), COALESCE(btrim(p_phone),''), COALESCE(btrim(p_email),''),
          COALESCE(btrim(p_address),''), COALESCE(btrim(p_notes),''))
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_update_customer(p_id bigint, p_name text, p_phone text DEFAULT '', p_email text DEFAULT '', p_address text DEFAULT '', p_notes text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.customers%ROWTYPE;
BEGIN
  IF NOT public.app_perm_exact('manageCustomers') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF COALESCE(btrim(p_name),'') = '' THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  UPDATE public.customers SET
    name = btrim(p_name), phone = COALESCE(btrim(p_phone),''), email = COALESCE(btrim(p_email),''),
    address = COALESCE(btrim(p_address),''), notes = COALESCE(btrim(p_notes),'')
    WHERE id = p_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
  RETURN to_jsonb(v_row);
END $$;

CREATE OR REPLACE FUNCTION public.app_delete_customer(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.customers%ROWTYPE;
BEGIN
  IF NOT public.app_perm_exact('manageCustomers') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  DELETE FROM public.customers WHERE id = p_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

CREATE OR REPLACE FUNCTION public.app_bulk_delete_customers(p_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  IF NOT public.app_perm_exact('manageCustomers') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN RAISE EXCEPTION 'No customers selected'; END IF;
  DELETE FROM public.customers WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_n);
END $$;