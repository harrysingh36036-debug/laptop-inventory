-- ============================================================================
-- Fix: security scanner reports "public.users is public, but RLS not enabled".
--
-- public.users was the legacy user table (username + password_hash). The app
-- now uses auth.users + public.profiles (read via the app_get_users RPC), and
-- supabase-migration.sql already drops this table. Remove it entirely so it is
-- no longer exposed to PostgREST.
-- ============================================================================

DROP TABLE IF EXISTS public.users;
