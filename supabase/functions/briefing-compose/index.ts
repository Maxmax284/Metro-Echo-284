// briefing-compose — Phase 5 (Briefings v2)
// Composes a structured operational briefing on explicit user tap.
// Returns: { headline, counts, best_first_move, narrative, items[] }
// No automatic invocation. No persistence beyond audit_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BRIEFING_VOICE } from "../_shared/vantaVoice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

type Item = {
  kind: "overdue" | "due_today" | "untriaged" | "stale" | "fresh_capture" | "sherlock";
  id: string;
  label: string;
  due_at?: string | null;
  age_hours?: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: claim } = await sb.auth.getUser(token);
    const user = claim?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const timezone: string = body?.timezone || "UTC";
    const partOfDay: "morning" | "midday" | "evening" = body?.part_of_day || "midday";
    // Variant: explicit > derived from part_of_day. "wrap" is a dedicated
    // end-of-day debrief; the others tune tone and which counts dominate.
    const requestedVariant = (body?.variant as string | undefined)?.toLowerCase();
    const variant: "morning" | "midday" | "evening" | "wrap" =
      requestedVariant === "morning" || requestedVariant === "midday" ||
      requestedVariant === "evening" || requestedVariant === "wrap"
        ? requestedVariant
        : partOfDay;

    const now = new Date();
    const endOfToday = new Date(now); endOfToday.setUTCHours(23, 59, 59, 999);
    const startOfToday = new Date(now); startOfToday.setUTCHours(0, 0, 0, 0);
    const sinceFresh = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const staleCutoff = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();

    // Parallel queries — keep them tight, cap rows. Wrap variant additionally
    // pulls today's closed commitments and recent observe findings.
    const [comm, files, actions, fresh, sherlock, closedToday, observed] = await Promise.all([
      sb.from("commitments")
        .select("id, summary, due_at, remind_at, status, created_at")
        .eq("status", "open")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(50),
      sb.from("ingested_files")
        .select("id, filename, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20),
      sb.from("actions")
        .select("id, title, status", { count: "exact" })
        .in("status", ["proposed", "staged"])
        .limit(10),
      sb.from("notes")
        .select("id, title, body, created_at")
        .gte("created_at", sinceFresh)
        .order("created_at", { ascending: false })
        .limit(10),
      sb.from("sherlock_findings_cache")
        .select("id, entity_type, updated_at", { count: "exact" })
        .gte("updated_at", sinceFresh)
        .limit(5),
      sb.from("commitments")
        .select("id, summary, completed_at")
        .gte("completed_at", startOfToday.toISOString())
        .limit(50),
      // Observe findings give Vanta a "Sherlock noticed…" cue to weave into
      // the narrative. Pulled fresh-only so the briefing stays current.
      sb.from("sherlock_findings_cache")
        .select("findings, entity_type, updated_at")
        .like("entity_type", "observe:%")
        .gte("updated_at", sinceFresh)
        .order("updated_at", { ascending: false })
        .limit(3),
    ]);

    const commitments = comm.data ?? [];
    const items: Item[] = [];
    let overdue = 0;
    let dueToday = 0;
    let stale = 0;

    for (const c of commitments) {
      const due = c.due_at ? new Date(c.due_at) : null;
      if (due && due < now) {
        overdue += 1;
        const ageH = (now.getTime() - due.getTime()) / 3.6e6;
        const isStale = c.due_at && c.due_at < staleCutoff;
        if (isStale) stale += 1;
        items.push({
          kind: isStale ? "stale" : "overdue",
          id: c.id,
          label: c.summary,
          due_at: c.due_at,
          age_hours: Math.round(ageH),
        });
      } else if (due && due <= endOfToday) {
        dueToday += 1;
        items.push({ kind: "due_today", id: c.id, label: c.summary, due_at: c.due_at });
      }
    }

    const untriagedFiles = (files.data ?? []).map((f) => ({
      kind: "untriaged" as const, id: f.id, label: f.filename ?? "Untitled file",
    }));
    items.push(...untriagedFiles);

    const freshCaptures = (fresh.data ?? []).map((n) => ({
      kind: "fresh_capture" as const,
      id: n.id,
      label: n.title || (n.body ?? "").slice(0, 80),
    }));
    items.push(...freshCaptures);

    const sherlockPending = (sherlock.data ?? []).map((s) => ({
      kind: "sherlock" as const, id: s.id, label: `${s.entity_type} finding`,
    }));
    items.push(...sherlockPending);

    const counts = {
      overdue,
      due_today: dueToday,
      untriaged: untriagedFiles.length,
      stale,
      fresh_captures: freshCaptures.length,
      approvals: actions.count ?? 0,
      sherlock_pending: sherlockPending.length,
    };

    // ---- Best-first-move heuristic (deterministic, no AI) ------------------
    let best_first_move = "";
    if (counts.overdue > 0) {
      const first = items.find((i) => i.kind === "overdue" || i.kind === "stale");
      best_first_move = first ? `Close out: ${first.label}` : `Clear ${counts.overdue} overdue.`;
    } else if (counts.approvals > 0) {
      best_first_move = `Review ${counts.approvals} action${counts.approvals === 1 ? "" : "s"} waiting on you.`;
    } else if (counts.due_today > 0) {
      const first = items.find((i) => i.kind === "due_today");
      best_first_move = first ? `Tee up: ${first.label}` : `Knock out ${counts.due_today} due today.`;
    } else if (counts.untriaged > 0) {
      best_first_move = `Triage ${counts.untriaged} item${counts.untriaged === 1 ? "" : "s"} in the inbox.`;
    } else if (counts.fresh_captures > 0) {
      best_first_move = `Glance at ${counts.fresh_captures} fresh capture${counts.fresh_captures === 1 ? "" : "s"}.`;
    } else {
      best_first_move = "Nothing urgent. Pick something you've been putting off.";
    }

    // ---- Headline ----------------------------------------------------------
    const parts: string[] = [];
    if (counts.overdue) parts.push(`${counts.overdue} overdue`);
    if (counts.due_today) parts.push(`${counts.due_today} due today`);
    if (counts.approvals) parts.push(`${counts.approvals} awaiting approval`);
    if (counts.untriaged) parts.push(`${counts.untriaged} to triage`);
    const headline = parts.length ? parts.join(" · ") : "Quiet runway.";

    // ---- AI narrative (server-side, single shot) ---------------------------
    let narrative: string | null = null;
    if (LOVABLE_KEY) {
      try {
        const top = items.slice(0, 8).map((i) => {
          const tag = i.kind === "stale" ? "stale"
            : i.kind === "overdue" ? "overdue"
            : i.kind === "due_today" ? "due today"
            : i.kind === "untriaged" ? "untriaged file"
            : i.kind === "sherlock" ? "Sherlock finding"
            : "fresh capture";
          return `- [${tag}] ${i.label}${i.due_at ? ` (due ${i.due_at})` : ""}`;
        }).join("\n");

        const prompt = `Compose a ${partOfDay} briefing in two short sentences max. Lead with what changed or what's slipping. End with: "${best_first_move}" verbatim. No greetings, no exclamation marks, no markdown.\n\nCounts: ${headline}.\nTimezone: ${timezone}.\nTop items:\n${top || "- none"}`;

        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_KEY}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: BRIEFING_VOICE },
              { role: "user", content: prompt },
            ],
            temperature: 0.4,
          }),
        });
        if (r.ok) {
          const j = await r.json();
          const txt = j?.choices?.[0]?.message?.content?.trim();
          if (txt) narrative = txt;
        } else {
          console.warn("briefing-compose ai non-ok", r.status);
        }
      } catch (e) {
        console.warn("briefing-compose ai failed", e instanceof Error ? e.message : e);
      }
    }

    // ---- Audit -------------------------------------------------------------
    await sb.from("audit_log").insert({
      user_id: user.id,
      entity_type: "briefing",
      event: "briefing.composed",
      payload: { counts, part_of_day: partOfDay, ai: !!narrative },
    });

    return new Response(JSON.stringify({
      headline,
      counts,
      best_first_move,
      narrative,
      items: items.slice(0, 20),
      generated_at: now.toISOString(),
      timezone,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("briefing-compose error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
