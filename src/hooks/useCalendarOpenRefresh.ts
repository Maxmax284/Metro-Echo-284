// useCalendarOpenRefresh — re-read the calendar when you walk into a room.
//
// The background check already runs on its own. This is only about the moment
// you open Today or Schedule after being away: one quiet re-read, debounced per
// session, never blocking the page and never announcing itself.
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { shouldRefreshCalendars } from "@/lib/calendarSync";

export function useCalendarOpenRefresh(onDone?: () => void) {
  const { session } = useAuth();
  useEffect(() => {
    if (!session) return;
    if (!shouldRefreshCalendars()) return;
    let alive = true;
    supabase.functions
      .invoke("calendar-sync", { body: {} })
      .then(() => { if (alive) onDone?.(); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);
}
