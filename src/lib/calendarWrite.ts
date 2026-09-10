// What the calendar can actually do right now, in one place.
//
// Ask the backend once whether Google Calendar is connected. If the connector is
// not linked, proposals stay honest and approvals are held instead of applied.
import { supabase } from "@/integrations/supabase/client";
import {
  calendarFieldLabel,
  normalizeCalendarChangeField,
  type CalendarWriteState,
} from "@/lib/calendarProposal";

export async function calendarWriteState(): Promise<CalendarWriteState> {
  try {
    const { data, error } = await supabase.functions.invoke("calendar-write-status", {});
    if (error) throw error;
    return data?.write_state === "connected" ? "connected" : "read_only";
  } catch {
    // Fail closed: never claim a write we aren't sure we can perform.
    return "read_only";
  }
}

/* Labels and field normalisation live with the proposal shape so Telegram, the
   widget and Ask cannot drift into three different vocabularies. */
export { calendarFieldLabel };
export const normalizeCalendarField = normalizeCalendarChangeField;
