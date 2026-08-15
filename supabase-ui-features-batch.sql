-- ============================================================================
-- Delta: UI features batch
--  1. Restore full laptop payload fields that the hide-sold rewrite dropped:
--     product_line, ram, charger, purchase_comment, purchaser_aadhar_hash.
--     The dashboard "All product lines" dropdown and the admin purchase detail
--     view depend on these. Hide-sold default behaviour is preserved, and the
--     aadhar hash is only exposed to admins / the super admin.
--  2. Add app_create_user so an admin can create Manager and Admin accounts
--     (only the super admin can create a super admin).
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_get_laptops(p_store_id bigint DEFAULT NULL, p_status text DEFAULT NULL, p_search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id, 'brand', l.brand, 'brand_model', l.brand_model,
      'product_line', l.product_line,
      'processor_type', l.processor_type, 'ram', l.ram, 'generation', l.generation, 'storage_type', l.storage_type,
      'storage_size', l.storage_size,
      'purchased_from', l.purchased_from, 'graphics', l.graphics, 'graphics_type', l.graphics_type,
      'graphics_model', l.graphics_model, 'purchase_rate', l.purchase_rate, 'extra_charges', l.extra_charges,
      'serial_number', l.serial_number, 'current_store_id', l.current_store_id,
      'current_store_name', s.store_name, 'status', l.status,
      'charger', l.charger, 'purchase_comment', l.purchase_comment,
      'purchaser_aadhar_hash', CASE WHEN public.app_role() IN ('admin','superadmin') THEN l.purchaser_aadhar_hash ELSE NULL END,
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
    AND (p_search IS NULL OR l.brand ILIKE '%' || p_search || '%' OR l.product_line ILIKE '%' || p_search || '%' OR l.brand_model ILIKE '%' || p_search || '%' OR l.serial_number ILIKE '%' || p_search || '%');
  RETURN v_out;
END $$;

-- Create user (admin can create manager / admin / staff; only super admin can create super admin)
CREATE OR REPLACE FUNCTION public.app_create_user(p_username text, p_password text, p_display_name text, p_role text, p_store_id bigint DEFAULT NULL, p_allowed_store_ids bigint[] DEFAULT NULL)
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
  IF p_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN RAISE EXCEPTION 'Invalid home store'; END IF;
  IF p_allowed_store_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_allowed_store_ids) sid LEFT JOIN public.stores s ON s.id = sid WHERE s.id IS NULL
  ) THEN RAISE EXCEPTION 'Invalid allowed store'; END IF;
  v_email := v_name || '@laptop.inventory';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, confirmation_token, recovery_token, email_change, confirmation_sent_at, recovery_sent_at, email_change_sent_at, created_at, updated_at)
  VALUES (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
          extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(), '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb, false, false, '', '', '', now(), now(), now(), now(), now());
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_uid, v_email, jsonb_build_object('sub', v_uid::text, 'email', v_email), 'email', now(), now(), now());
  INSERT INTO public.profiles (id, username, display_name, role, home_store_id, allowed_store_ids)
  VALUES (v_uid, v_name, COALESCE(btrim(p_display_name), v_name), COALESCE(p_role,'staff'), NULLIF(p_store_id, 0), p_allowed_store_ids);
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
    'role', COALESCE(p_role,'staff'), 'home_store_id', NULLIF(p_store_id, 0),
    'allowed_store_ids', p_allowed_store_ids, 'created_at', to_char(now(), 'YYYY-MM-DD HH24:MI:SS')));
END $$;

GRANT EXECUTE ON FUNCTION public.app_create_user(text, text, text, text, bigint, bigint[]) TO authenticated;