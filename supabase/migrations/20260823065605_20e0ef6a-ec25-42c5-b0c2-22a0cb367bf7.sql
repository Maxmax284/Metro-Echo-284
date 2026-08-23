ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.calendar_feeds ADD COLUMN IF NOT EXISTS default_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS calendar_events_project_idx ON public.calendar_events(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS calendar_events_scope_start_idx ON public.calendar_events(user_id, organization_id, starts_at);