-- Add address column to vendors table
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';

-- Update app_add_vendor to accept address
CREATE OR REPLACE FUNCTION public.app_add_vendor(p_name text, p_contact text DEFAULT '', p_address text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.vendors%ROWTYPE;
BEGIN
  IF NOT public.app_perm('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Vendor name is required'; END IF;
  INSERT INTO public.vendors (name, contact, address) VALUES (btrim(p_name), p_contact, p_address) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END $$;
GRANT EXECUTE ON FUNCTION public.app_add_vendor(text, text, text) TO authenticated;

-- Update app_update_vendor to accept address
CREATE OR REPLACE FUNCTION public.app_update_vendor(p_id bigint, p_name text, p_contact text DEFAULT '', p_address text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.vendors%ROWTYPE;
BEGIN
  IF NOT public.app_perm('manageVendors') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  UPDATE public.vendors SET name = p_name, contact = p_contact, address = p_address WHERE id = p_id RETURNING * INTO v_row;
  IF v_row IS NULL THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  RETURN to_jsonb(v_row);
END $$;
GRANT EXECUTE ON FUNCTION public.app_update_vendor(bigint, text, text, text) TO authenticated;
