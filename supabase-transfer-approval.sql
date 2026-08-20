-- ============================================================================
-- Transfer Approval Workflow
-- Managers can only transfer laptops from their own store.
-- Transfers require acceptance by the destination store's manager.
-- Laptop stays in source store until accepted.
-- ============================================================================

-- 1. pending_transfers table -------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pending_transfers (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  laptop_id     bigint NOT NULL REFERENCES public.laptops(id) ON DELETE CASCADE,
  from_store_id bigint NOT NULL REFERENCES public.stores(id),
  to_store_id   bigint NOT NULL REFERENCES public.stores(id),
  initiated_by  text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pt_read" ON public.pending_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "pt_insert" ON public.pending_transfers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pt_update" ON public.pending_transfers FOR UPDATE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_pt_laptop ON public.pending_transfers(laptop_id);
CREATE INDEX IF NOT EXISTS idx_pt_status ON public.pending_transfers(status);
CREATE INDEX IF NOT EXISTS idx_pt_to_store ON public.pending_transfers(to_store_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pt_from_store ON public.pending_transfers(from_store_id) WHERE status = 'pending';

-- Add to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pending_transfers' AND schemaname = 'public') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_transfers';
  END IF;
END $$;

-- 2. app_initiate_transfer ---------------------------------------------------
-- Manager of Store A requests a transfer of a laptop to Store B.
-- The laptop stays in Store A until the manager of Store B accepts.

CREATE OR REPLACE FUNCTION public.app_initiate_transfer(p_laptop_id bigint, p_to_store bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role   text := public.app_role();
  v_home   bigint;
  v_username text;
  v_laptop public.laptops%ROWTYPE;
  v_to     public.stores%ROWTYPE;
  v_existing bigint;
BEGIN
  IF NOT public.app_perm('transferLaptops') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  SELECT username, home_store_id INTO v_username, v_home FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO v_laptop FROM public.laptops WHERE id = p_laptop_id;
  IF v_laptop.id IS NULL THEN RAISE EXCEPTION 'Laptop not found'; END IF;

  SELECT * INTO v_to FROM public.stores WHERE id = p_to_store;
  IF v_to.id IS NULL THEN RAISE EXCEPTION 'Destination store not found'; END IF;

  IF v_laptop.current_store_id = p_to_store THEN RAISE EXCEPTION 'Laptop is already at that store'; END IF;

  -- Managers can only transfer laptops from their own store
  IF v_role = 'manager' THEN
    IF v_home IS NULL THEN RAISE EXCEPTION 'No home store assigned — ask an admin to set your home store'; END IF;
    IF v_laptop.current_store_id IS DISTINCT FROM v_home THEN RAISE EXCEPTION 'You can only transfer laptops from your own store'; END IF;
  END IF;

  -- Check no pending transfer already exists for this laptop
  SELECT id INTO v_existing FROM public.pending_transfers
    WHERE laptop_id = p_laptop_id AND status = 'pending' LIMIT 1;
  IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'This laptop already has a pending transfer'; END IF;

  INSERT INTO public.pending_transfers (laptop_id, from_store_id, to_store_id, initiated_by)
  VALUES (p_laptop_id, v_laptop.current_store_id, p_to_store, COALESCE(v_username, 'system'))
  RETURNING id INTO v_existing;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_existing,
    'laptop_id', p_laptop_id,
    'from_store_id', v_laptop.current_store_id,
    'to_store_id', p_to_store,
    'initiated_by', COALESCE(v_username, 'system'),
    'status', 'pending',
    'created_at', to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  );
END $$;

GRANT EXECUTE ON FUNCTION public.app_initiate_transfer(bigint, bigint) TO authenticated;

-- 3. app_accept_transfer -----------------------------------------------------
-- Manager of Store B accepts the transfer. Laptop moves from A to B.

CREATE OR REPLACE FUNCTION public.app_accept_transfer(p_transfer_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role   text := public.app_role();
  v_home   bigint;
  v_pt     public.pending_transfers%ROWTYPE;
  v_from   public.stores%ROWTYPE;
  v_to     public.stores%ROWTYPE;
  v_username text;
BEGIN
  IF NOT public.app_perm('transferLaptops') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  SELECT username, home_store_id INTO v_username, v_home FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO v_pt FROM public.pending_transfers WHERE id = p_transfer_id;
  IF v_pt.id IS NULL THEN RAISE EXCEPTION 'Transfer request not found'; END IF;
  IF v_pt.status <> 'pending' THEN RAISE EXCEPTION 'Transfer already ' || v_pt.status; END IF;

  -- Only the destination store manager (or admin/superadmin) can accept
  IF v_role = 'manager' THEN
    IF v_home IS NULL THEN RAISE EXCEPTION 'No home store assigned'; END IF;
    IF v_pt.to_store_id IS DISTINCT FROM v_home THEN RAISE EXCEPTION 'Only the destination store manager can accept this transfer'; END IF;
  END IF;

  -- Verify laptop is still at the source store
  IF NOT EXISTS (SELECT 1 FROM public.laptops WHERE id = v_pt.laptop_id AND current_store_id = v_pt.from_store_id) THEN
    RAISE EXCEPTION 'Laptop is no longer at the source store';
  END IF;

  -- Accept: move the laptop
  UPDATE public.pending_transfers SET status = 'accepted', updated_at = now() WHERE id = p_transfer_id;
  UPDATE public.laptops SET current_store_id = v_pt.to_store_id, updated_at = now() WHERE id = v_pt.laptop_id;

  SELECT * INTO v_from FROM public.stores WHERE id = v_pt.from_store_id;
  SELECT * INTO v_to FROM public.stores WHERE id = v_pt.to_store_id;

  INSERT INTO public.transferlogs (laptop_id, from_store_id, to_store_id, transferred_by)
  VALUES (v_pt.laptop_id, v_pt.from_store_id, v_pt.to_store_id, COALESCE(v_username, 'system'));

  RETURN jsonb_build_object(
    'ok', true,
    'transfer_id', p_transfer_id,
    'laptop_id', v_pt.laptop_id,
    'from', to_jsonb(v_from),
    'to', to_jsonb(v_to),
    'transferred_by', COALESCE(v_username, 'system')
  );
END $$;

GRANT EXECUTE ON FUNCTION public.app_accept_transfer(bigint) TO authenticated;

-- 4. app_reject_transfer -----------------------------------------------------
-- Manager of Store B rejects the transfer. Laptop stays in Store A.

CREATE OR REPLACE FUNCTION public.app_reject_transfer(p_transfer_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role   text := public.app_role();
  v_home   bigint;
  v_pt     public.pending_transfers%ROWTYPE;
BEGIN
  IF NOT public.app_perm('transferLaptops') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  SELECT home_store_id INTO v_home FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO v_pt FROM public.pending_transfers WHERE id = p_transfer_id;
  IF v_pt.id IS NULL THEN RAISE EXCEPTION 'Transfer request not found'; END IF;
  IF v_pt.status <> 'pending' THEN RAISE EXCEPTION 'Transfer already ' || v_pt.status; END IF;

  -- Only the destination store manager (or admin/superadmin) can reject
  IF v_role = 'manager' THEN
    IF v_home IS NULL THEN RAISE EXCEPTION 'No home store assigned'; END IF;
    IF v_pt.to_store_id IS DISTINCT FROM v_home THEN RAISE EXCEPTION 'Only the destination store manager can reject this transfer'; END IF;
  END IF;

  UPDATE public.pending_transfers SET status = 'rejected', updated_at = now() WHERE id = p_transfer_id;

  RETURN jsonb_build_object('ok', true, 'transfer_id', p_transfer_id, 'status', 'rejected');
END $$;

GRANT EXECUTE ON FUNCTION public.app_reject_transfer(bigint) TO authenticated;

-- 5. app_get_pending_transfers ------------------------------------------------
-- Returns pending transfers visible to the current user.
-- Managers see transfers involving their home store.
-- Admins/superadmins see all.

CREATE OR REPLACE FUNCTION public.app_get_pending_transfers()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.app_role();
  v_home bigint;
  v_out  jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT home_store_id INTO v_home FROM public.profiles WHERE id = auth.uid();

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', pt.id, 'laptop_id', pt.laptop_id,
      'from_store_id', pt.from_store_id, 'to_store_id', pt.to_store_id,
      'from_store_name', fs.store_name, 'to_store_name', ts.store_name,
      'brand_model', l.brand_model, 'serial_number', l.serial_number,
      'initiated_by', pt.initiated_by, 'status', pt.status,
      'created_at', to_char(pt.created_at, 'YYYY-MM-DD HH24:MI:SS'),
      'updated_at', to_char(pt.updated_at, 'YYYY-MM-DD HH24:MI:SS'))
      ORDER BY pt.created_at DESC), '[]'::jsonb) INTO v_out
  FROM public.pending_transfers pt
  JOIN public.laptops l ON l.id = pt.laptop_id
  LEFT JOIN public.stores fs ON fs.id = pt.from_store_id
  LEFT JOIN public.stores ts ON ts.id = pt.to_store_id
  WHERE pt.status = 'pending'
    AND (
      v_role IN ('admin', 'superadmin')
      OR pt.from_store_id = v_home
      OR pt.to_store_id = v_home
    );

  RETURN v_out;
END $$;

GRANT EXECUTE ON FUNCTION public.app_get_pending_transfers() TO authenticated;

-- 6. app_cancel_transfer -----------------------------------------------------
-- Initiator or admin can cancel a pending transfer before it's accepted.

CREATE OR REPLACE FUNCTION public.app_cancel_transfer(p_transfer_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.app_role();
  v_pt   public.pending_transfers%ROWTYPE;
BEGIN
  IF NOT public.app_perm('transferLaptops') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  SELECT * INTO v_pt FROM public.pending_transfers WHERE id = p_transfer_id;
  IF v_pt.id IS NULL THEN RAISE EXCEPTION 'Transfer request not found'; END IF;
  IF v_pt.status <> 'pending' THEN RAISE EXCEPTION 'Transfer already ' || v_pt.status; END IF;

  -- Manager can only cancel transfers they initiated from their store
  IF v_role = 'manager' THEN
    IF (SELECT home_store_id FROM public.profiles WHERE id = auth.uid()) IS DISTINCT FROM v_pt.from_store_id THEN
      RAISE EXCEPTION 'Only the initiator or an admin can cancel';
    END IF;
  END IF;

  UPDATE public.pending_transfers SET status = 'rejected', updated_at = now() WHERE id = p_transfer_id;

  RETURN jsonb_build_object('ok', true, 'transfer_id', p_transfer_id, 'status', 'cancelled');
END $$;

GRANT EXECUTE ON FUNCTION public.app_cancel_transfer(bigint) TO authenticated;
