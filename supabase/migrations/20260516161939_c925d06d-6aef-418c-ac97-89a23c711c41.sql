
-- 1. Backfill owner role for existing users
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::public.app_role FROM auth.users
ON CONFLICT DO NOTHING;

-- 2. Grant owner on new signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  insert into public.user_roles (user_id, role) values (new.id, 'owner');
  return new;
end;
$function$;

-- 3. system_controls
CREATE TABLE public.system_controls (
  owner_id uuid PRIMARY KEY,
  global_usage_mode text NOT NULL DEFAULT 'conservative',
  external_apis_enabled boolean NOT NULL DEFAULT true,
  serpapi_enabled boolean NOT NULL DEFAULT false,
  gemini_enabled boolean NOT NULL DEFAULT true,
  weather_enabled boolean NOT NULL DEFAULT true,
  calendar_sync_enabled boolean NOT NULL DEFAULT false,
  background_awareness_enabled boolean NOT NULL DEFAULT false,
  proactive_synthesis_enabled boolean NOT NULL DEFAULT false,
  file_analysis_enabled boolean NOT NULL DEFAULT true,
  deep_research_enabled boolean NOT NULL DEFAULT false,
  local_search_enabled boolean NOT NULL DEFAULT false,
  auto_refresh_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_controls_mode_check
    CHECK (global_usage_mode IN ('conservative','balanced','power','custom','manual','lockdown'))
);
ALTER TABLE public.system_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_controls owner select" ON public.system_controls
  FOR SELECT USING (auth.uid() = owner_id AND public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE POLICY "system_controls owner insert" ON public.system_controls
  FOR INSERT WITH CHECK (auth.uid() = owner_id AND public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE POLICY "system_controls owner update" ON public.system_controls
  FOR UPDATE USING (auth.uid() = owner_id AND public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (auth.uid() = owner_id AND public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE TRIGGER system_controls_touch
  BEFORE UPDATE ON public.system_controls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. usage_limits
CREATE TABLE public.usage_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  provider text NOT NULL,
  feature text NOT NULL,
  limit_per_minute integer,
  limit_per_hour integer,
  limit_per_day integer,
  limit_per_month integer,
  max_calls_per_task integer,
  auto_run_allowed boolean NOT NULL DEFAULT false,
  manual_approval_required boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  mode_override text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, provider, feature)
);
ALTER TABLE public.usage_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_limits owner all" ON public.usage_limits
  FOR ALL
  USING (auth.uid() = owner_id AND public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (auth.uid() = owner_id AND public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE TRIGGER usage_limits_touch
  BEFORE UPDATE ON public.usage_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. api_usage_logs
CREATE TABLE public.api_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  user_id uuid,
  provider text NOT NULL,
  feature text NOT NULL,
  request_type text,
  status text NOT NULL,
  estimated_cost numeric,
  tokens_used integer,
  credits_used integer,
  cache_hit boolean NOT NULL DEFAULT false,
  related_entity_type text,
  related_entity_id uuid,
  task_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_usage_logs_status_check
    CHECK (status IN ('allowed','blocked','cached','success','failed','rate_limited','disabled','over_budget'))
);
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_usage_logs owner select" ON public.api_usage_logs
  FOR SELECT USING (auth.uid() = owner_id AND public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE INDEX api_usage_logs_owner_created ON public.api_usage_logs (owner_id, created_at DESC);
CREATE INDEX api_usage_logs_provider_feature ON public.api_usage_logs (owner_id, provider, feature, created_at DESC);

-- 6. api_cache
CREATE TABLE public.api_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  provider text NOT NULL,
  feature text NOT NULL,
  query_hash text NOT NULL,
  normalized_query text,
  location_context jsonb,
  result_json jsonb NOT NULL,
  source_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (owner_id, provider, feature, query_hash)
);
ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_cache owner select" ON public.api_cache
  FOR SELECT USING (auth.uid() = owner_id AND public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE INDEX api_cache_lookup ON public.api_cache (owner_id, provider, feature, query_hash);
CREATE INDEX api_cache_expires ON public.api_cache (expires_at);

-- 7. Seed default system_controls for every owner
INSERT INTO public.system_controls (owner_id)
SELECT user_id FROM public.user_roles WHERE role = 'owner'::public.app_role
ON CONFLICT DO NOTHING;
