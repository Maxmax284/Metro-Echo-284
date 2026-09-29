-- Existing push subscribers consented by subscribing; set their channel toggle so
-- the screen and the rail agree. Only touches rows where the toggle isn't already true.
update public.profiles p
set preferences = coalesce(p.preferences, '{}'::jsonb) || '{"push_reminders_enabled": true}'::jsonb
where exists (
  select 1 from public.push_subscriptions s where s.user_id = p.id
)
and coalesce((p.preferences ->> 'push_reminders_enabled')::boolean, false) is distinct from true;