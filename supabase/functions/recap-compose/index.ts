import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { persistBriefDraft, writeBriefReceipt } from "../_shared/briefCore.ts";
import { corsHeaders } from "../_shared/http.ts";
// recap-compose — Phase 5 (Recap Intelligence)
// Composes a plain-English Weekly or Monthly recap from existing signals
// (audit_log, brief_exports, project_items, projects, sherlock_findings).
// Persists into brief_exports with scope_kind = recap_weekly | recap_monthly.
// No new tables. No automatic execution — always user-tap.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";


const Body = z.object({
  period: z.enum(["weekly", "monthly"]),
  // Optional override window in days. Defaults: weekly=7, monthly=30.
  range_days: z.number().int().min(1).max(120).optional(),
});

type Section = { id: string; heading: string; body: string };
type RecapDoc = {
  kind: "recap";
  title: string;
  subtitle: string;
  format: "weekly_review" | "monthly_review";
  scope_kind: "recap_weekly" | "recap_monthly";
  period: "weekly" | "monthly";
  generated_at: string;
  window: { since: string; until: string };
  sections: Section[];
  totals: Record<string, number>;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const user = await resolveUser(req, userClient as any);
    if (!user) return unauthorized();

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { period } = parsed.data;
    const rangeDays = parsed.data.range_days ?? (period === "weekly" ? 7 : 30);

    const until = new Date();
    const since = new Date(until.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();

    // Pull everything in parallel — read-only.
    const [auditRes, exportsRes, itemsRes, sherlockRes] = await Promise.all([
      userClient
        .from("audit_log")
        .select("id,event,entity_type,entity_id,created_at,payload")
        .eq("user_id", user.id)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(500),
      userClient
        .from("brief_exports")
        .select("id,title,project_id,format,scope_kind,status,created_at")
        .eq("user_id", user.id)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(80),
      userClient
        .from("project_items")
        .select("id,project_id,added_at,item_type")
        .gte("added_at", sinceIso)
        .order("added_at", { ascending: false })
        .limit(500),
      userClient
        .from("sherlock_findings")
        .select("id,title,kind,status,project_id,created_at")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(120),
    ]);

    const audit = auditRes.data ?? [];
    const exports = exportsRes.data ?? [];
    const items = itemsRes.data ?? [];
    const findings = sherlockRes.data ?? [];

    // Resolve project titles for anything we'll mention.
    const projectIds = new Set<string>();
    for (const i of items) if (i.project_id) projectIds.add(i.project_id);
    for (const e of exports) if (e.project_id) projectIds.add(e.project_id);
    for (const f of findings as any[]) if (f.project_id) projectIds.add(f.project_id);
    const projectNames = new Map<string, string>();
    if (projectIds.size > 0) {
      const { data: projs } = await userClient
        .from("projects")
        .select("id,title")
        .in("id", Array.from(projectIds));
      for (const p of (projs ?? []) as Array<{ id: string; title: string }>) {
        projectNames.set(p.id, p.title);
      }
    }

    // Aggregate project activity.
    const projActivity: Record<string, number> = {};
    for (const it of items) {
      const name = (it.project_id && projectNames.get(it.project_id)) || "Unfiled";
      projActivity[name] = (projActivity[name] ?? 0) + 1;
    }
    const topProjects = Object.entries(projActivity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    // All known projects → detect quiet ones.
    const { data: allProjects } = await userClient
      .from("projects")
      .select("id,title")
      .eq("user_id", user.id)
      .limit(200);
    const activeNames = new Set(Object.keys(projActivity));
    const quietProjects = (allProjects ?? [])
      .map((p: any) => p.title)
      .filter((t: string) => t && !activeNames.has(t))
      .slice(0, 6);

    // Exports + research.
    const exportsSaved = exports.filter((e) => e.status === "exported").length;
    const researchBriefs = exports.filter((e) => e.format === "research_brief").length;

    // Sherlock patterns — group by kind.
    const sherlockByKind: Record<string, number> = {};
    for (const f of findings as any[]) {
      const k = f.kind || "pattern";
      sherlockByKind[k] = (sherlockByKind[k] ?? 0) + 1;
    }
    const sherlockTop = Object.entries(sherlockByKind)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Needs-attention: open commitments / overdue from audit.
    const attentionEvents = audit.filter((a: any) =>
      ["commitment.overdue", "commitment.due_soon", "action.review_required", "sherlock.flagged"]
        .includes(a.event),
    );

    // Completed / handled.
    const completedEvents = audit.filter((a: any) =>
      ["commitment.completed", "action.executed", "brief.exported", "document.exported"]
        .includes(a.event),
    );

    // New captures.
    const captureEvents = audit.filter((a: any) =>
      ["telegram.message_in", "ecosystem.gth.captured", "file.uploaded", "ingest.success"]
        .includes(a.event),
    );

    const totals = {
      project_updates: items.length,
      exports_saved: exportsSaved,
      research_briefs: researchBriefs,
      sherlock_findings: findings.length,
      needs_attention: attentionEvents.length,
      completed: completedEvents.length,
      new_captures: captureEvents.length,
      quiet_projects: quietProjects.length,
    };

    // ---- Compose plain-English sections ------------------------------------
    const periodLabel = period === "weekly" ? "week" : "month";
    const summarySentences: string[] = [];

    if (topProjects.length === 0 && totals.new_captures === 0 && totals.exports_saved === 0) {
      summarySentences.push(`A quiet ${periodLabel}. Nothing moved that needs a recap.`);
    } else {
      if (topProjects.length > 0) {
        const lead = topProjects[0];
        summarySentences.push(`${lead[0]} carried most of the ${periodLabel}.`);
        if (topProjects.length > 1) {
          const others = topProjects.slice(1, 3).map((p) => p[0]).join(" and ");
          summarySentences.push(`${others} also saw movement.`);
        }
      }
      if (totals.exports_saved > 0) {
        summarySentences.push(
          totals.exports_saved === 1
            ? `One brief was exported and saved.`
            : `${totals.exports_saved} briefs were exported and saved.`,
        );
      }
      if (totals.research_briefs > 0) {
        summarySentences.push(
          totals.research_briefs === 1
            ? `One outside research brief was added.`
            : `${totals.research_briefs} outside research briefs were added.`,
        );
      }
      if (totals.needs_attention > 0) {
        summarySentences.push(`A few items still need attention.`);
      } else {
        summarySentences.push(`Nothing is overdue.`);
      }
    }

    const sections: Section[] = [
      {
        id: "overall",
        heading: `Overall ${periodLabel} summary`,
        body: summarySentences.join(" "),
      },
      {
        id: "most_active",
        heading: "Most active projects",
        body: topProjects.length
          ? topProjects.map(([n, c]) => `• ${n} — ${c} ${c === 1 ? "update" : "updates"}`).join("\n")
          : "No project activity in this window.",
      },
      {
        id: "needs_attention",
        heading: "Needs attention",
        body: totals.needs_attention > 0
          ? `${totals.needs_attention} ${totals.needs_attention === 1 ? "item is" : "items are"} waiting on you. Review them in the Inbox.`
          : "Nothing is waiting on you.",
      },
      {
        id: "completed",
        heading: "Completed and handled",
        body: totals.completed > 0
          ? `${totals.completed} ${totals.completed === 1 ? "thing was" : "things were"} closed out this ${periodLabel}.`
          : `Nothing was formally closed out this ${periodLabel}.`,
      },
      {
        id: "new_material",
        heading: "New material captured",
        body: totals.new_captures > 0
          ? `${totals.new_captures} new ${totals.new_captures === 1 ? "capture" : "captures"} landed.`
          : "No new captures.",
      },
      {
        id: "sherlock_patterns",
        heading: "Patterns Echo noticed",
        body: sherlockTop.length
          ? sherlockTop.map(([k, n]) => `• ${k.replace(/_/g, " ")} — ${n}`).join("\n")
          : "No new patterns surfaced.",
      },
      {
        id: "research_activity",
        heading: "Outside research",
        body: totals.research_briefs > 0
          ? `${totals.research_briefs} research ${totals.research_briefs === 1 ? "brief was" : "briefs were"} attached.`
          : "No outside research was run.",
      },
      {
        id: "quiet_areas",
        heading: "Quiet or inactive",
        body: quietProjects.length
          ? quietProjects.map((n) => `• ${n}`).join("\n")
          : "Every project saw movement.",
      },
      {
        id: "exports_saved",
        heading: "Exports saved",
        body: totals.exports_saved > 0
          ? `${totals.exports_saved} ${totals.exports_saved === 1 ? "export was" : "exports were"} saved this ${periodLabel}.`
          : "No exports saved.",
      },
    ];

    const sinceLabel = since.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const untilLabel = until.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const title = period === "weekly"
      ? `Weekly recap — ${sinceLabel} to ${untilLabel}`
      : `Monthly review — ${sinceLabel} to ${untilLabel}`;
    const subtitle = period === "weekly"
      ? `What actually happened this week.`
      : `What bigger pattern is forming this month.`;

    const doc: RecapDoc = {
      kind: "recap",
      title,
      subtitle,
      format: period === "weekly" ? "weekly_review" : "monthly_review",
      scope_kind: period === "weekly" ? "recap_weekly" : "recap_monthly",
      period,
      generated_at: new Date().toISOString(),
      window: { since: sinceIso, until: untilIso },
      sections,
      totals,
    };

    const exportId = await persistBriefDraft(userClient, {
      userId: user.id,
      format: doc.format,
      scopeKind: doc.scope_kind,
      title: doc.title,
      subtitle: doc.subtitle,
      brief: doc,
    });

    await writeBriefReceipt(userClient, {
      userId: user.id,
      entityType: "brief_export",
      entityId: exportId,
      event: period === "weekly" ? "recap.weekly_created" : "recap.monthly_created",
      metadata: { period, window: doc.window, totals, brief_export_id: exportId },
    });

    return new Response(JSON.stringify({
      brief_export_id: exportId,
      period,
      totals,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
