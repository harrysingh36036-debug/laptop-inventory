-- ============================================================================
-- Delta: Login-page username dropdown
--   Adds a public RPC that returns the sign-in usernames (+ display names) so
--   the login page can offer a dropdown instead of typing. Only usernames and
--   display names are exposed (no ids, roles or hashes). Grants execution to
--   the `anon` role because this is read on the pre-auth login screen.
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_list_usernames()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'username', p.username,
      'display_name', p.display_name
    ) ORDER BY p.display_name NULLS LAST, p.username),
    '[]'::jsonb)
  FROM public.profiles p
  WHERE p.role IS DISTINCT FROM 'superadmin';
$$;

GRANT EXECUTE ON FUNCTION public.app_list_usernames() TO anon, authenticated;