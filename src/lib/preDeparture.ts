// preDeparture — client mirror of the countdown errands. One set of rules, two
// runtimes: the screen injects the app's own 12-hour wording.
import {
  preDeparturePack as pack,
  type PreDepartureInput,
  type PreDeparturePack as Pack,
} from "../../supabase/functions/_shared/preDeparture";
import { flightTimeWords } from "./flightClock";

export {
  BE_AT_GATE_MIN,
  CHECK_IN_CLOSE_DOMESTIC_MIN,
  CHECK_IN_CLOSE_INTERNATIONAL_MIN,
  PACK_HORIZON_MIN,
  REMINDER_WINDOW_MIN,
  minutesToDeparture,
  preDepartureNotice,
} from "../../supabase/functions/_shared/preDeparture";
export type { PackItem, PreDeparturePack } from "../../supabase/functions/_shared/preDeparture";

export function preDeparturePack(input: Omit<PreDepartureInput, "words">): Pack {
  return pack({ ...input, words: (iso, tz, now) => flightTimeWords(iso, tz, now) });
}
