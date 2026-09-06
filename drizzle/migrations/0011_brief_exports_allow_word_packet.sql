alter table public.brief_exports drop constraint brief_exports_format_check;
alter table public.brief_exports add constraint brief_exports_format_check
  check (format = any (array['operator','client','audit_packet','weekly_review','audio_script','research_brief','monthly_review','word_packet']));