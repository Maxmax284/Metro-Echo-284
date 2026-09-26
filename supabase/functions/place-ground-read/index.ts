// place-ground-read — Echo's plain read of where you are, plus real photos and
// a short dossier on the area itself.
//
// Doctrine:
//   - Photos, the local-language name, the history and the "what this place is"
//     text all come from Wikipedia. Free, no AI, no invention.
//   - The AI read is tap-only, grounded in that reference text and the resolved
//     place names, day part and weather. 6 reads a day.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { streamAstraText } from "../_shared/aiResponses.ts";

const Body = z.object({
  city: z.string().min(1).max(80),
  region: z.string().max(80).nullable(),
  country: z.string().max(80).nullable(),
  localTime: z.string().max(40).nullable(),
  /** "morning" | "afternoon" | "evening" | "night" — from the device clock. */
  dayPart: z.string().max(20).nullable().default(null),
  /** Plain weather line already on file, e.g. "partly cloudy, 29C". */
  weather: z.string().max(120).nullable().default(null),
  /** Local language code for the second name line, e.g. "th". */
  lang: z.string().max(8).nullable().default(null),
  nearby: z.array(z.string().max(80)).max(8),
  withRead: z.boolean().default(true),
});

const UA = { "User-Agent": "MetroEcho/1.0 (metroecho.lovable.app)" };
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function getJson(url: string) {
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function summary(title: string) {
  const j = await getJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  );
  if (!j || j.type === "disambiguation") return null;
  return {
    title: String(j.title ?? title),
    extract: String(j.extract ?? "").slice(0, 900),
    photo: (j.originalimage?.source ?? j.thumbnail?.source ?? null) as string | null,
    url: (j.content_urls?.desktop?.page ?? null) as string | null,
  };
}

/** Plain-text article, split into the sections worth reading on a phone. */
async function dossier(title: string, lang: string | null) {
  const j = await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=extracts|langlinks|pageimages&explaintext=1&redirects=1` +
      `&lllang=${encodeURIComponent(lang ?? "th")}&piprop=original&titles=${encodeURIComponent(title)}`,
  );
  const pages = j?.query?.pages ?? {};
  const page: any = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;
  const text = String(page.extract ?? "");
  const localName = (page.langlinks?.[0]?.["*"] as string | undefined) ?? null;

  /** Pull one plain section (with its subsections) by heading name. */
  const section = (names: string[]) => {
    for (const n of names) {
      const re = new RegExp(`\\n(=+)\\s*${n}[^=\\n]*=+\\s*\\n`, "i");
      const m = re.exec(text);
      if (!m) continue;
      const level = m[1].length;
      const rest = text.slice(m.index + m[0].length);
      // End at the next heading of the same or higher level, so subsections stay.
      const next = new RegExp(`\\n={2,${level}}[^=\\n]+={2,${level}}\\s*\\n`).exec(rest);
      const body = (next ? rest.slice(0, next.index) : rest)
        .replace(/^=+\s*([^=\n]+?)\s*=+$/gm, "$1:")
        .replace(/\n{2,}/g, "\n")
        .trim();
      if (body.length > 80) return body.slice(0, 1400);
    }
    return null;
  };

  const intro = text.split(/\n==+[^=]+=+\n/)[0].trim().slice(0, 900);
  return {
    localName,
    intro,
    history: section(["History", "Etymology and history", "Origins"]),
    geography: section(["Geography", "Geography and climate", "Districts", "Administration", "Economy", "Tourism"]),
    photo: (page.original?.source as string | undefined) ?? null,
  };
}

/** Who made a photo and how it may be used — the license terms require this
 *  to travel with the image, so credits are fetched with the photos and
 *  rendered under each one. */
type Credit = { url: string; artist: string | null; license: string | null; page: string | null };

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function creditFrom(ii: any, url: string): Credit {
  const em = ii?.extmetadata ?? {};
  const artist = em.Artist?.value ? stripHtml(String(em.Artist.value)).slice(0, 120) : null;
  const license = em.LicenseShortName?.value ? String(em.LicenseShortName.value).slice(0, 60) : null;
  const page = typeof ii?.descriptionurl === "string" ? ii.descriptionurl : null;
  return { url, artist: artist || null, license, page };
}

/** The File: name a Wikimedia image URL ends in (thumb URLs carry a width prefix). */
function fileNameFromUrl(u: string | null): string | null {
  if (!u) return null;
  try {
    const last = new URL(u).pathname.split("/").pop() ?? "";
    return decodeURIComponent(last.replace(/^\d+px-/, "")) || null;
  } catch { return null; }
}

/** One batched lookup of artist + license + source page for a set of File: names. */
async function creditsFor(files: { name: string; url: string }[]): Promise<Credit[]> {
  if (!files.length) return [];
  const titles = files.map((f) => `File:${f.name}`).join("|");
  const j = await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=extmetadata|url` +
      `&titles=${encodeURIComponent(titles)}`,
  );
  /* The API normalizes titles (underscores to spaces, first-letter case);
     match our raw URL-derived names through its normalization table. */
  const norm = new Map<string, string>();
  for (const n of (j?.query?.normalized ?? []) as any[]) norm.set(String(n.from), String(n.to));
  const byCanonical = new Map<string, any>();
  for (const p of Object.values(j?.query?.pages ?? {}) as any[]) {
    const name = String(p.title ?? "").replace(/^File:/, "");
    if (name) byCanonical.set(name, p.imageinfo?.[0]);
  }
  return files.map((f) => {
    const requested = `File:${f.name}`;
    const canonical = (norm.get(requested) ?? requested).replace(/^File:/, "");
    return creditFrom(byCanonical.get(canonical), f.url);
  });
}

/** A few more real photographs of the same article, for the taped strip. */
async function gallery(title: string) {
  const j = await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=images&gimlimit=12&redirects=1` +
      `&prop=imageinfo&iiprop=url&iiurlwidth=640&titles=${encodeURIComponent(title)}`,
  );
  const pages = Object.values(j?.query?.pages ?? {}) as any[];
  return pages
    .map((p) => ({ name: String(p.title ?? ""), url: p.imageinfo?.[0]?.thumburl as string | undefined }))
    .filter((p) => p.url && /\.(jpe?g|png)$/i.test(p.name) && !/(logo|icon|flag|seal|map|locator|svg|commons)/i.test(p.name))
    .slice(0, 5)
    .map((p) => ({
      file: p.name.replace(/^File:/, ""),
      caption: p.name.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/[_-]+/g, " "),
      url: p.url!,
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const user = await resolveUser(req, client as any);
    if (!user) return json({ error: "Sign in first." }, 401);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const b = parsed.data;

    let page = await summary(b.city);
    let sourceTitle = page?.title ?? b.city;
    if (!page && b.region) {
      page = await summary(b.region);
      sourceTitle = page?.title ?? b.region;
    }
    const [dos, pics] = await Promise.all([
      dossier(sourceTitle, b.lang),
      gallery(sourceTitle),
    ]);
    const photosAll = [page?.photo ?? dos?.photo, ...pics.map((p) => p.url)]
      .filter((u, i, a): u is string => Boolean(u) && a.indexOf(u) === i)
      .slice(0, 5);
    const area = dos
      ? { localName: dos.localName, intro: dos.intro, history: dos.history, geography: dos.geography }
      : null;

    /* Attribution is not optional decoration — the photo licenses require
       it, so artist + license are resolved for every photo we ship. */
    const leadUrl = (page?.photo ?? dos?.photo ?? null) as string | null;
    const galleryFiles = pics.filter((p) => photos.includes(p.url)).map((p) => ({ name: p.file, url: p.url }));
    const leadName = fileNameFromUrl(leadUrl);
    const needsLead = Boolean(leadUrl && photos.includes(leadUrl) && leadName && !galleryFiles.some((f) => f.url === leadUrl));
    const credits = await creditsFor([
      ...(needsLead ? [{ name: leadName!, url: leadUrl! }] : []),
      ...galleryFiles,
    ]);

    if (!b.withRead) return json({ page, area, photos, credits, read: null });

    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await client.from("audit_log").select("id", { count: "exact", head: true })
      .eq("event", "ground_read.composed").gte("created_at", dayAgo);
    if ((count ?? 0) >= 6) {
      return json({ page, area, photos, credits, read: null, error: "Echo's local read is resting until tomorrow.", limited: true }, 429);
    }

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ page, area, photos, credits, error: "Echo's local read isn't set up yet." }, 500);

    const facts = [
      `Place: ${[b.city, b.region, b.country].filter(Boolean).join(", ")}`,
      b.localTime ? `Local time: ${b.localTime}${b.dayPart ? ` (${b.dayPart})` : ""}` : null,
      b.weather ? `Weather on file: ${b.weather}` : null,
      b.nearby.length ? `Nearby: ${b.nearby.join(", ")}` : null,
      page?.extract ? `Reference: ${page.extract}` : null,
      dos?.history ? `History reference: ${dos.history.slice(0, 500)}` : null,
    ].filter(Boolean).join("\n");

    const { text } = await streamAstraText({
      apiKey: key,
      incomingRunId: req.headers.get("X-Lovable-AIG-Run-ID") ?? undefined,
      messages: [
        {
          role: "system",
          content:
            "You are Echo, a calm field companion. Give the person a read of where they are, East Coast calm: direct, warm, a little dry, never robotic. Write in English. " +
            "Reply as 4 short lines, each starting with a label: 'The vibe:', 'Getting around:', 'Money & plugs:', 'If it goes sideways:'. Under 100 words total. " +
            "Write for the hour and the weather you are given: what is open or closed now, what the light and heat are doing, what that means for moving around. " +
            "Use general, well-known facts about the place and country; never invent specific businesses, prices or times. No exclamation marks.",
        },
        { role: "user", content: facts },
      ],
    });

    await client.from("audit_log").insert({
      user_id: user.id, event: "ground_read.composed", entity_type: "place", payload: { city: b.city },
    } as any);
    return json({ page, area, photos, credits, read: text || null });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return json({ error: e instanceof Error ? e.message : "Echo couldn't read the place." }, status);
  }
});
