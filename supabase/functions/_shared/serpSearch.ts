// serpSearch — the one leash for public web search.
//
// web-look answers a question through here, and the watch sweep re-asks the
// same question through here, so a topic watch compares the web against
// exactly the kind of answer the person first got. Reading only: this cannot
// sign in, submit, book, cancel or pay.

export type SerpHit = { title: string; url: string; snippet: string };

export async function serpSearch(query: string, apiKey: string): Promise<SerpHit[]> {
  if (!apiKey) throw new Error("SERPAPI_KEY missing");
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("q", query);
  u.searchParams.set("engine", "google");
  u.searchParams.set("num", "5");
  u.searchParams.set("api_key", apiKey);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`serpapi ${r.status}`);
  const j = await r.json();
  const organic = Array.isArray(j?.organic_results) ? j.organic_results : [];
  return organic
    .slice(0, 5)
    .map((o: Record<string, unknown>) => ({
      title: String(o?.title ?? "").slice(0, 300),
      url: String(o?.link ?? ""),
      snippet: String(o?.snippet ?? "").slice(0, 400),
    }))
    .filter((h: SerpHit) => h.url);
}
