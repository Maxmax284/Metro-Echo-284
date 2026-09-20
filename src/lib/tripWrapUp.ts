// tripWrapUp — your word that a trip is over, before the clock says so.
//
// Doctrine: the desk stands down on its own a night after the last landing, but
// a person standing in the arrivals hall should not have to wait for a clock.
// Wrapping up is display only — it folds the desk now and writes a receipt.
// Nothing is deleted, the spine opens behind one tap, and anything new to fly
// lifts the fold instantly.
import { supabase } from "@/integrations/supabase/client";

/** What the button promises, in one place so every surface says the same thing. */
export const WRAP_UP_COPY = {
  action: "Wrap up this trip",
  hint: "Folds this trip into a quiet card now. Nothing is deleted — the legs, the times and what changed all keep, and Receipts holds the summary.",
  undo: "Open this trip back up",
};

/** One plain receipt for the word, holding the route and nothing else. */
export async function recordTripWrapUp(
  journeyId: string,
  route: string,
  opts: { undo?: boolean } = {},
): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const user_id = data.user?.id;
  if (!user_id) return;
  await supabase.from("audit_log").insert({
    user_id,
    entity_type: "journey",
    entity_id: null,
    event: opts.undo ? "journey.wrap_up_reopened" : "journey.wrapped_up",
    payload: { journey_id: journeyId, route, said_by: "you" },
  } as never);
}

/** True when this journey carries your word that it is finished. */
export function isWrappedUp(wrapped: string[] | undefined, journeyId: string | null): boolean {
  if (!journeyId) return false;
  return (wrapped ?? []).includes(journeyId);
}

/** Add or remove one journey id, without duplicates. */
export function toggleWrapped(
  wrapped: string[] | undefined,
  journeyId: string,
  on: boolean,
): string[] {
  const set = new Set(wrapped ?? []);
  if (on) set.add(journeyId);
  else set.delete(journeyId);
  return [...set];
}
