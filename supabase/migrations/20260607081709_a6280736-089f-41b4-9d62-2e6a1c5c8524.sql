-- Connect brief_exports to projects so Living Briefs generated for a project
-- show up in the same history as entity / system briefs.
ALTER TABLE public.brief_exports
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS brief_exports_project_id_idx
  ON public.brief_exports(project_id);

-- Extend the scope_kind check so callers can mark a brief as project-scoped.
ALTER TABLE public.brief_exports
  DROP CONSTRAINT IF EXISTS brief_exports_scope_kind_check;
ALTER TABLE public.brief_exports
  ADD CONSTRAINT brief_exports_scope_kind_check
  CHECK (scope_kind IN ('system', 'entity', 'project'));
