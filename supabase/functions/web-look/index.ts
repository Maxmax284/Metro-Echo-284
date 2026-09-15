// web-look — the missing hand.
//
// Order of preference is product law, not a suggestion: a connected source
// first (calendar, mail, files), the open web last. This function is the last
// step, and it only ever *reads*. It cannot sign in, submit a form, book,
// cancel or pay. A page behind a login is reported as being behind a login.
//
// Three modes:
//   read   — one public page, answered against the question that was asked
//   search — a public web lookup through the existing SerpApi leash
//   watch  — start the one watch object on a page, so a change reports itself
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { jsonResponse, preflight } from "../_shared/http.ts";
import { adminClient, runGuarded } from "../_shared/apiGuard.ts";
import { RESEARCH_VOICE } from "../_shared/vantaVoice.ts";
import {
  BLOCK_LINE,
  fetchFailLine,
  hostLabel,
  readPage,
  safeUrl,
  sourceLine,
  webWatchGoal,
  type PageRead,
} from "../_shared/webLook.ts";

const Body = z.object({
  mode: z.enum(["read", "search", "watch"]).default("read"),
  url: z.string().max(2000).optional(),
  question: z.string().max(500).optional(),
  why: z.string().max(200).optional(),
  cadence_minutes: z.number().int().min(15).max(1440).optional(),
});

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY") ?? "";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000;

/** Fetch one public page as a browser-ish reader. Never follows a login. */
export async function fetchPage(url: string): Promise<
  { ok: true; read: PageRead } | { ok: false; line: string }
> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "MetroEcho/1.0 (+https://metroecho.lovable.app)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!r.ok) return { ok: false, line: fetchFailLine(r.status, hostLabel(url)) };
    const type = (r.headers.get("content-type") ?? "").toLowerCase();
    if (!type.includes("html") && !type.includes("text") && !type.includes("json")) {
      return { ok: false, line: `${hostLabel(url)} answered with a file Echo cannot read as a page.` };
    }
    const body = (await r.text()).slice(0, MAX_BYTES);
    return { ok: true, read: readPage(r.url || url, body) };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      line: aborted
        ? `${hostLabel(url)} took too long to answer.`
        : `Echo could not reach ${hostLabel(url)}.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function answerFrom(question: string, read: PageRead): Promise<string> {
  if (!LOVABLE_API_KEY) return read.text.slice(0, 1200);
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            `${RESEARCH_VOICE}\n\nYou are reading ONE web page the person pointed you at. ` +
            `Answer their question from that page only. Conclusion first, in one or two sentences. ` +
            `If the page does not say it, say "the page does not say" — never fill the gap. ` +
            `Never claim anything was booked, changed or confirmed by you: you only read.`,
        },
        {
          role: "user",
          content:
            `Question: ${question || "What does this page say that matters?"}\n\n` +
            `Page: ${read.title ?? read.host}\n${read.url}\n\n${read.text.slice(0, 9000)}`,
        },
      ],
    }),
  });
  if (!r.ok) return read.text.slice(0, 1200);
  const j = await r.json();
  return String(j?.choices?.[0]?.message?.content ?? "").trim() || read.text.slice(0, 1200);
}

type Hit = { title: string; url: string; snippet: string };

async function serpSearch(query: string): Promise<Hit[]> {
  if (!SERPAPI_KEY) throw new Error("SERPAPI_KEY missing");
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("q", query);
  u.searchParams.set("engine", "google");
  u.searchParams.set("num", "5");
  u.searchParams.set("api_key", SERPAPI_KEY);
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
    .filter((h: Hit) => h.url);
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const user = await resolveUser(req, userClient as never);
    if (!user) return unauthorized();

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonResponse({ error: "bad_request" }, 400);
    const { mode, question, why, cadence_minutes } = parsed.data;
    const db = adminClient();

    const { data: prof } = await db
      .from("profiles")
      .select("timezone")
      .eq("id", user.id)
      .maybeSingle();
    const timezone = (prof as { timezone?: string | null } | null)?.timezone ?? null;

    /* ------------------------------------------------------------ search */
    if (mode === "search") {
      const q = (question ?? "").trim();
      if (q.length < 3) return jsonResponse({ error: "question_required" }, 400);
      const res = await runGuarded(
        {
          owner_id: user.id,
          user_id: user.id,
          provider: "serpapi",
          feature: "web.search",
          query: q,
          cache_ttl_seconds: 3600,
        },
        () => serpSearch(q),
      );
      if (!res.ok) {
        return jsonResponse({
          ok: false,
          blocked: res.reason,
          answer: "Web lookups are switched off right now, so Echo did not go looking.",
        });
      }
      return jsonResponse({ ok: true, hits: res.data, source: "web search" });
    }

    /* -------------------------------------------------------- read / watch */
    const checked = safeUrl(parsed.data.url ?? "");
    if (!checked.ok) return jsonResponse({ ok: false, answer: BLOCK_LINE[checked.reason] }, 200);
    const url = checked.url;

    const guarded = await runGuarded(
      {
        owner_id: user.id,
        user_id: user.id,
        provider: "web-page",
        feature: mode === "watch" ? "web.watch" : "web.read",
        query: url,
        cache_ttl_seconds: mode === "watch" ? 0 : 900,
      },
      () => fetchPage(url),
    );
    if (!guarded.ok) {
      return jsonResponse({
        ok: false,
        blocked: guarded.reason,
        answer: "Reading outside pages is switched off right now, so Echo did not go looking.",
      });
    }
    const got = guarded.data;
    if (!got.ok) return jsonResponse({ ok: false, answer: got.line }, 200);
    const read = got.read;

    if (read.behind_login) {
      return jsonResponse({
        ok: false,
        behind_login: true,
        answer:
          `${read.host} is behind a sign-in. Echo does not log in anywhere on your behalf, ` +
          `so this one needs you to open it and tell Echo what it says.`,
      }, 200);
    }

    if (mode === "watch") {
      const goal = webWatchGoal(url, why ?? question ?? null);
      const { data: existing } = await db
        .from("watches")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "web_page")
        .in("state", ["on_it", "watching", "waiting", "needs_you"])
        .contains("success_when", { url })
        .maybeSingle();

      if (existing?.id) {
        return jsonResponse({
          ok: true,
          watch_id: existing.id,
          answer: `Echo is already keeping an eye on ${read.host}.`,
        });
      }

      const cadence = cadence_minutes ?? 180;
      const { data: row, error } = await db
        .from("watches")
        .insert({
          user_id: user.id,
          organization_id: null,
          goal,
          kind: "web_page",
          subject_id: null,
          source: "ask",
          cadence_minutes: cadence,
          next_check_at: new Date(Date.now() + cadence * 60_000).toISOString(),
          stop_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
          success_when: { url, fingerprint: read.fingerprint, host: read.host, title: read.title },
        })
        .select("id")
        .maybeSingle();
      if (error) return jsonResponse({ ok: false, answer: "Echo could not start that watch." }, 500);

      await db.from("audit_log").insert({
        user_id: user.id,
        entity_type: "watch",
        entity_id: row?.id ?? null,
        event: "watch.web_page_started",
        payload: { url, host: read.host, why: why ?? null },
      });

      return jsonResponse({
        ok: true,
        watch_id: row?.id ?? null,
        answer:
          `Echo read ${read.host} and will keep checking it. ` +
          `You will hear about it when it changes, not before.`,
        source: sourceLine(read, timezone),
      });
    }

    const answer = await answerFrom((question ?? "").trim(), read);
    return jsonResponse({
      ok: true,
      answer,
      title: read.title,
      host: read.host,
      url: read.url,
      source: sourceLine(read, timezone),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[web-look]", msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
