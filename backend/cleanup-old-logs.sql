-- DB housekeeping: clear old log data only.
-- Keeps ALL business tables intact (stores, brands, laptops, sales,
-- purchases, repairs, customers, profiles/users, settings).
--
-- Run via: node backend/run-mgmt-sql.cjs backend/cleanup-old-logs.sql
-- (with SUPABASE_TOKEN + PROJECT_REF set)

-- 1. Login logs older than 90 days (IP/user-agent data)
DELETE FROM public.loginlogs WHERE logged_in < now() - interval '90 days';

-- 2. Transfer history older than 1 year (keep recent audit trail)
DELETE FROM public.transferlogs WHERE changed_at < now() - interval '365 days';

-- (Optional, uncomment) delete remarks/audit on deleted records older than 1 year
-- DELETE FROM public.delete_logs WHERE deleted_at < now() - interval '365 days';