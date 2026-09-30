// serpSearch — the one leash for public web search.
//
// web-look answers a question through here, and the watch sweep re-asks the
// same question through here, so a topic watch compares the web against
// exactly the kind of answer the person first got. Reading only: this cannot
// sign in, submit, book, cancel or pay.

export type SerpHit = { title: string; url: string; snippet: string };

/**
 * Junk domains — social feeds, video aggregators, app stores, forums and
 * content farms never carry a dispatch worth showing a person. Stripped at
 * the source so Echo and the radar only read real reporting.
 */
const JUNK_HOSTS = new Set([
  "youtube.com", "m.youtube.com", "youtu.be",
  "facebook.com", "m.facebook.com", "fb.com",
  "instagram.com", "m.instagram.com",
  "tiktok.com", "m.tiktok.com",
  "twitter.com", "x.com", "mobile.twitter.com",
  "whatsapp.com", "wa.me", "t.me", "telegram.me",
  "reddit.com", "m.reddit.com", "old.reddit.com",
  "pinterest.com", "m.pinterest.com",
  "linkedin.com", "m.linkedin.com",
  "quora.com", "m.quora.com",
  "medium.com", "substack.com",
  "apps.apple.com", "play.google.com",
  "amazon.com", "ebay.com",
  "yelp.com", "tripadvisor.com",
]);

function isJunkUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return JUNK_HOSTS.has(h);
  } catch {
    return false;
  }
}

export async function serpSearch(query: string, apiKey: string): Promise<SerpHit[]> {
  if (!apiKey) throw new Error("SERPAPI_KEY missing");
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("q", query);
  u.searchParams.set("engine", "google");
  u.searchParams.set("num", "10");
  u.searchParams.set("api_key", apiKey);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`serpapi ${r.status}`);
  const j = await r.json();
  const organic = Array.isArray(j?.organic_results) ? j.organic_results : [];
  return organic
    .map((o: Record<string, unknown>) => ({
      title: String(o?.title ?? "").slice(0, 300),
      url: String(o?.link ?? ""),
      snippet: String(o?.snippet ?? "").slice(0, 400),
    }))
    .filter((h: SerpHit) => h.url && !isJunkUrl(h.url))
    .slice(0, 5);
}
