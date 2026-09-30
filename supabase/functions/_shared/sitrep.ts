// sitrep — the one brain that reads search results, shared by web-look
// (question time) and watch-sweep (every check). SerpApi is the eyes; this is
// the voice that says what the reporting actually means. A failed synthesis
// never blocks a check: callers fall back to the raw headline.
// Pure module — the voice arrives as a parameter so tests can import this
// without dragging the whole prompt stack in.
export type SitrepHit = { title: string; url: string; snippet: string };

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

/** The source block the model reads. Pure, so tests can pin the shape. */
export function sitrepSourceLines(hits: SitrepHit[], max = 4): string {
  return hits
    .slice(0, max)
    .map((h, i) => {
      let host = "";
      try {
        host = new URL(h.url).hostname.replace(/^www\./, "");
      } catch {
        host = "";
      }
      return `Source ${i + 1} — ${h.title}${host ? ` (${host})` : ""}\n${h.snippet}`;
    })
    .join("\n\n");
}

/** First sentence of a verdict — the nudge title / radar headline form. */
export function firstLine(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const cut = flat.search(/(?<=[.!?])\s/);
  const line = cut > 0 ? flat.slice(0, cut) : flat;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * Read the filtered hits and speak a 2–3 sentence ground truth, conclusion
 * first. Returns "" when there is nothing to read or the gateway is down —
 * the caller decides the fallback, the check always lands.
 */
export async function sitrepFrom(
  question: string,
  hits: SitrepHit[],
  apiKey: string,
  voice: string,
): Promise<string> {
  if (!apiKey || hits.length === 0) return "";
  try {
    const r = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              `${RESEARCH_VOICE}\n\nYou are reading a handful of fresh web search results about a live situation. ` +
              `Write a 2–3 sentence situational sitrep: what is actually happening right now, what moved, what the person should know. ` +
              `Conclusion first. Never invent facts not in the sources. Never say "according to" — speak it as ground truth. ` +
              `If the sources are thin or contradictory, say exactly that.`,
          },
          {
            role: "user",
            content: `Question: ${question}\n\nFresh search results:\n${sitrepSourceLines(hits)}`,
          },
        ],
      }),
    });
    if (!r.ok) return "";
    const j = await r.json();
    return String(j?.choices?.[0]?.message?.content ?? "").trim();
  } catch {
    return "";
  }
}
