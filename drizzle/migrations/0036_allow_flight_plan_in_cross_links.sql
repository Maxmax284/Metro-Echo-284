-- A screenshot that proves a flight must be linkable to that flight, so the
-- desk can always say which source a fact came from. Same evidence table as
-- everything else -- one more allowed kind, no new table, no new relation word.
alter table public.cross_links drop constraint if exists cross_links_source_kind_chk;
alter table public.cross_links add constraint cross_links_source_kind_chk
  check (source_kind = any (array['note','capture','commitment','action','file','message','entity','flight_plan']));

alter table public.cross_links drop constraint if exists cross_links_target_kind_chk;
alter table public.cross_links add constraint cross_links_target_kind_chk
  check (target_kind = any (array['note','capture','commitment','action','file','message','entity','flight_plan']));