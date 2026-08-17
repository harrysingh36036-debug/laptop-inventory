-- Clear business data only.
-- Deletes: laptops, sales, purchases, repairs, transfer logs, customers, login logs.
-- KEEPS: stores, brands, user accounts (profiles), settings.
--
-- Run via: node backend/run-mgmt-sql.cjs backend/clear-business-data.sql
-- (with SUPABASE_TOKEN + PROJECT_REF set)
-- Or run directly in the Supabase SQL editor.

BEGIN;

-- Child tables first (respects foreign keys)
DELETE FROM public.loginlogs;
DELETE FROM public.sales;
DELETE FROM public.repairs;
DELETE FROM public.transferlogs;
DELETE FROM public.purchases;

-- Laptops after sales/repairs/transfers/purchases that reference them
DELETE FROM public.laptops;

-- Customers after sales reference them
DELETE FROM public.customers;

-- Optional: reset identity sequences so new IDs restart at 1
ALTER SEQUENCE public.laptops_id_seq RESTART WITH 1;
ALTER SEQUENCE public.sales_id_seq RESTART WITH 1;
ALTER SEQUENCE public.purchases_id_seq RESTART WITH 1;
ALTER SEQUENCE public.repairs_id_seq RESTART WITH 1;
ALTER SEQUENCE public.customers_id_seq RESTART WITH 1;

COMMIT;

-- Verify: should return 0 rows for all counts
-- SELECT 'laptops' AS t, count(*) FROM public.laptops
-- UNION ALL SELECT 'sales', count(*) FROM public.sales
-- UNION ALL SELECT 'purchases', count(*) FROM public.purchases
-- UNION ALL SELECT 'repairs', count(*) FROM public.repairs
-- UNION ALL SELECT 'customers', count(*) FROM public.customers
-- UNION ALL SELECT 'transferlogs', count(*) FROM public.transferlogs;