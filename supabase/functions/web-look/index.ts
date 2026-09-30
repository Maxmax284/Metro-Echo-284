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
import { fetchPage } from "../_shared/webFetch.ts";
import {
  BLOCK_LINE,
  safeUrl,
  searchFingerprint,
  sourceLine,
  webSearchWatchGoal,
  webWatchGoal,
  type PageRead,
} from "../_shared/webLook.ts";
import { serpSearch } from "../_shared/serpSearch.ts";

const Body = z.object({
  mode: z.enum(["read", "search", "watch"]).default("read"),
  url: z.string().max(2000).optional(),
  question: z.string().max(500).optional(),
  why: z.string().max(200).optional(),
  cadence_minutes: z.number().int().min(15).max(1440).optional(),
});

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY") ?? "";
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

/**
 * Synthesize a real sitrep from the filtered search hits — the AI reads the
 * reporting and speaks a 2–3 sentence ground truth, conclusion first.
 * Falls back to the raw hits if the gateway is unreachable.
 */
async function sitrepFrom(question: string, hits: Hit[]): Promise<string> {
  if (!LOVABLE_API_KEY || hits.length === 0) return "";
  const sourceLines = hits
    .slice(0, 4)
    .map((h, i) => `Source ${i + 1} — ${h.title} (${new URL(h.url).hostname.replace(/^www\./, "")})\n${h.snippet}`)
    .join("\n\n");
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
            content: `Question: ${question}\n\nFresh search results:\n${sourceLines}`,
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
        () => serpSearch(q, SERPAPI_KEY),
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

    /* ----------------------------------------------------- watch a topic */
    /* "Keep me updated" on a question, not a page: Echo re-asks the same
       question on a cadence and speaks only when new pages show up. A real
       watch row or an honest no — monitoring is never claimed without one. */
    if (mode === "watch" && !(parsed.data.url ?? "").trim()) {
      const q = (question ?? "").trim();
      if (q.length < 3) {
        return jsonResponse({ ok: false, answer: "Echo needs the actual question to keep an eye on it." }, 200);
      }
      const goal = webSearchWatchGoal(q);

      const { data: existing } = await db
        .from("watches")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "web_search")
        .in("state", ["on_it", "watching", "waiting", "needs_you"])
        .contains("success_when", { query: q })
        .maybeSingle();
      if (existing?.id) {
        return jsonResponse({
          ok: true,
          watch_id: existing.id,
          answer: `Echo is already keeping an eye on “${q}”.`,
        });
      }

      const res = await runGuarded(
        {
          owner_id: user.id,
          user_id: user.id,
          provider: "serpapi",
          feature: "web.watch",
          query: q,
          cache_ttl_seconds: 0,
        },
        () => serpSearch(q, SERPAPI_KEY),
      );
      if (!res.ok) {
        return jsonResponse({
          ok: false,
          blocked: res.reason,
          answer: "Web lookups are switched off right now, so Echo could not start that watch.",
        });
      }

      const cadence = cadence_minutes ?? 360;
      const { data: row, error } = await db
        .from("watches")
        .insert({
          user_id: user.id,
          organization_id: null,
          goal,
          kind: "web_search",
          subject_id: null,
          source: "ask",
          cadence_minutes: cadence,
          next_check_at: new Date(Date.now() + cadence * 60_000).toISOString(),
          stop_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
          success_when: {
            query: q,
            fingerprint: searchFingerprint(res.data),
            hits: res.data.slice(0, 3).map((h) => h.title),
          },
        })
        .select("id")
        .maybeSingle();
      if (error) return jsonResponse({ ok: false, answer: "Echo could not start that watch." }, 500);

      await db.from("audit_log").insert({
        user_id: user.id,
        entity_type: "watch",
        entity_id: row?.id ?? null,
        event: "watch.created",
        payload: { goal, kind: "web_search", source: "ask", query: q },
      });

      return jsonResponse({
        ok: true,
        watch_id: row?.id ?? null,
        answer:
          `Echo will keep checking what the web says about “${q}”. ` +
          `You will hear about it when it changes, not before.`,
      });
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
