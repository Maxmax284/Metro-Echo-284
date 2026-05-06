
-- Fix mutable search path on set_updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql
security invoker set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;

-- handle_new_user: lock down execute (it's only called by the trigger, runs as definer)
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- set_updated_at: lock down execute (only called by triggers)
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- has_role: only authenticated users should call it
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
