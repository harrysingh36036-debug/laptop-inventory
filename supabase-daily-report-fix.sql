-- Fix: "missing FROM-clause entry for table 's'"
-- app_daily_report / app_daily_store_sales referenced alias s at outer level
-- while the derived table v only had store_id. Select store_name in v and
-- reference v.* in the outer query.

CREATE OR REPLACE FUNCTION public.app_daily_report(p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT jsonb_build_object(
    'date', to_char(p_date, 'YYYY-MM-DD'),
    'stores', COALESCE(jsonb_agg(
      jsonb_build_object(
        'store_id', v.store_id, 'store_name', v.store_name,
        'in_store', v.in_count,
        'sold_on', v.sold_count,
        'transferred_out_on', v.tout_count,
        'transferred_in_on', v.tin_count,
        'out_total', (COALESCE(v.sold_count,0) + COALESCE(v.tout_count,0)),
        'models', v.models
      ) ORDER BY v.store_name), '[]'::jsonb),
    'totals', jsonb_build_object(
      'in_store', COALESCE(SUM(v.in_count), 0),
      'sold_on', COALESCE(SUM(v.sold_count), 0),
      'transferred_out_on', COALESCE(SUM(v.tout_count), 0),
      'transferred_in_on', COALESCE(SUM(v.tin_count), 0),
      'out_total', COALESCE(SUM(v.sold_count), 0) + COALESCE(SUM(v.tout_count), 0))
  ) INTO v_out
  FROM (
    SELECT
      st.id AS store_id,
      st.store_name AS store_name,
      (SELECT count(*) FROM public.laptops l WHERE l.current_store_id = st.id AND l.status <> 'Sold') AS in_count,
      (SELECT count(*) FROM public.sales s WHERE s.store_id = st.id AND s.sold_at::date = p_date) AS sold_count,
      (SELECT count(*) FROM public.transferlogs tl WHERE tl.from_store_id = st.id AND tl.changed_at::date = p_date) AS tout_count,
      (SELECT count(*) FROM public.transferlogs tl2 WHERE tl2.to_store_id = st.id AND tl2.changed_at::date = p_date) AS tin_count,
      (SELECT COALESCE(jsonb_agg(x ORDER BY x.model), '[]'::jsonb) FROM (
         SELECT l2.brand_model AS model, count(*) AS count
         FROM public.laptops l2
         WHERE l2.current_store_id = st.id AND l2.status <> 'Sold'
         GROUP BY l2.brand_model
         UNION ALL
         SELECT s2.brand_model, count(*)
         FROM public.sales s2
         WHERE s2.store_id = st.id AND s2.sold_at::date = p_date
         GROUP BY s2.brand_model
      ) x) AS models
    FROM public.stores st
  ) v;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.app_daily_store_sales(p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM public.app_req_auth();
  SELECT jsonb_build_object(
    'date', to_char(p_date, 'YYYY-MM-DD'),
    'stores', COALESCE(jsonb_agg(
      jsonb_build_object(
        'store_id', v.store_id, 'store_name', v.store_name,
        'units', v.units,
        'amount', v.amount,
        'profit', v.profit
      ) ORDER BY v.store_name), '[]'::jsonb),
    'totals', jsonb_build_object(
      'units', COALESCE(SUM(v.units), 0),
      'amount', COALESCE(SUM(v.amount), 0),
      'profit', COALESCE(SUM(v.profit), 0))
  ) INTO v_out
  FROM (
    SELECT
      st.id AS store_id,
      st.store_name AS store_name,
      (SELECT count(*) FROM public.sales s WHERE s.store_id = st.id AND s.sold_at::date = p_date) AS units,
      (SELECT COALESCE(SUM(s2.sale_price), 0) FROM public.sales s2 WHERE s2.store_id = st.id AND s2.sold_at::date = p_date) AS amount,
      (SELECT COALESCE(SUM(s3.profit), 0) FROM public.sales s3 WHERE s3.store_id = st.id AND s3.sold_at::date = p_date) AS profit
    FROM public.stores st
  ) v;
  RETURN v_out;
END $$;
