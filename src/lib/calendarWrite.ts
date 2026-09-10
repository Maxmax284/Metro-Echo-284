// What the calendar can actually do right now, in one place.
//
// The only calendar source today is a read-only .ics feed, so no proposal may
// claim a provider write. When Google write access is connected this is the
// single line that changes — the proposal UX stays exactly as it is.
import {
  calendarFieldLabel,
  normalizeCalendarChangeField,
  type CalendarWriteState,
} from "@/lib/calendarProposal";

export function calendarWriteState(): CalendarWriteState {
  return "read_only";
}

/* Labels and field normalisation live with the proposal shape so Telegram, the
   widget and Ask cannot drift into three different vocabularies. */
export { calendarFieldLabel };
export const normalizeCalendarField = normalizeCalendarChangeField;
