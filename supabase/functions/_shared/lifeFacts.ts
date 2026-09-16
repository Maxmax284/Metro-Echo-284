// lifeFacts — the recorded facts behind the everyday-life layer, read once.
//
// Kept apart from the pure registry so the list stays testable without IO.
// Reads only. A domain is live because a row or a key exists, never because it
// would be nice if it did.
import type { LifeFacts } from "./streetSmart.ts";

type Client = { from: (table: string) => any };

export async function readLifeFacts(admin: Client, userId: string): Promise<LifeFacts> {
  const [feeds, body, place] = await Promise.all([
    admin.from("calendar_feeds").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("wearable_readings").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("awareness_places").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  return {
    calendar: (feeds?.count ?? 0) > 0,
    body: (body?.count ?? 0) > 0,
    place: (place?.count ?? 0) > 0,
    /* Public rates need no account. A failed read is reported on the answer. */
    rates: true,
    bank: !!Deno.env.get("PLAID_CLIENT_ID") && !!Deno.env.get("PLAID_SECRET"),
    flights: !!Deno.env.get("FLIGHT_API_KEY"),
    whatsapp: !!Deno.env.get("WHATSAPP_TOKEN") && !!Deno.env.get("WHATSAPP_PHONE_ID"),
  };
}
