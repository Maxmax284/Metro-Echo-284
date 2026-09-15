// echoAbilityFacts — the recorded facts behind Echo's reach, read once.
//
// Kept apart from the pure echoAbilities catalog so the list itself stays
// testable without IO. Reads only; it writes nothing and never guesses a
// connection it cannot see a row for.
import type { AbilityFacts } from "./echoAbilities.ts";

type Client = {
  from: (table: string) => any;
};

/**
 * @param admin service client (connection rows are platform-managed)
 * @param userId the person whose reach is being described
 */
export async function readAbilityFacts(admin: Client, userId: string): Promise<AbilityFacts> {
  const [conns, feeds, tg, watching] = await Promise.all([
    admin.from("app_user_connections").select("connector_id").eq("user_id", userId),
    admin.from("calendar_feeds").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("active", true),
    admin.from("telegram_chat_links").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("watches").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("state", "active"),
  ]);

  const ids = new Set<string>(((conns?.data ?? []) as Array<{ connector_id: string }>).map((r) => r.connector_id));

  return {
    calendar: ids.has("google_calendar") || (feeds?.count ?? 0) > 0,
    mail: ids.has("google_mail"),
    files: ids.has("google_drive"),
    telegram: (tg?.count ?? 0) > 0,
    web_search: !!Deno.env.get("SERPAPI_KEY"),
    watching: watching?.count ?? 0,
  };
}
