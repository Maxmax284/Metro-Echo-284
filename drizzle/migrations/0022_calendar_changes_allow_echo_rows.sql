-- Echo's own entries have no feed, but a moved time is still news and must
-- travel through the one change record every calendar move uses.
ALTER TABLE public.calendar_changes ALTER COLUMN feed_id DROP NOT NULL;
