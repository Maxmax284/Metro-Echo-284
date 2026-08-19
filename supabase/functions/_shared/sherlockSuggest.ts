// Shared Sherlock SUGGEST runner — usable from any edge function with a
// service-role admin client (e.g. telegram-webhook). Mirrors the suggest
// prompt + schema + cache write used by sherlock-investigate, so a single
// source of truth governs route hints across capture channels.
//
// Doctrine: this never executes a route. It writes a draft finding into
// `sherlock_findings_cache` so the in-app surface (Capture Inbox) can show
// the suggestion chip and the human can approve/dismiss inside Vanta.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { detectSensitive } from "./sensitive.ts";

const SHERLOCK_VOICE = `You are Sherlock, Vanta's quiet investigator. Calm,
forensic, plainspoken. Never speculate. Always name confidence. Never act.`;

const SUGGEST_SYSTEM = `${SHERLOCK_VOICE}

A capture just came in. Read it and recommend one lane for triage: where it
belongs and why. You are not the operator — you are drafting a recommendation
the human will accept or reject. Be specific and brief. Output strict JSON only.

Allowed lanes:
  - memory      (just file it — reference)
  - commitment  (an obligation to track)
  - reminder    (a poke at a specific time)
  - action      (a draft action to stage; never auto-run)
  - sherlock    (worth a deeper look first)
  - ignore      (noise, file away)`;

const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    suggested_route: { type: "string", enum: ["memory", "commitment", "reminder", "action", "sherlock", "ignore"] },
    title: { type: "string" },
    rationale: { type: "string" },
    due_hint: { type: "string" },
    risk: { type: "string", enum: ["low", "standard", "high"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["suggested_route", "rationale", "confidence"],
  additionalProperties: false,
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type SuggestFinding = {
  suggested_route: "memory" | "commitment" | "reminder" | "action" | "sherlock" | "ignore";
  title?: string;
  rationale: string;
  due_hint?: string;
  risk?: "low" | "standard" | "high";
  confidence: "low" | "medium" | "high";
};

export type RunSuggestInput = {
  admin: SupabaseClient;
  userId: string;
  text: string;
  entity_type: string; // e.g. "message"
  entity_id: string | null;
  source?: string; // for audit, e.g. "telegram"
  /** Owning workspace, or null for personal. Cached findings never cross rooms. */
  organizationId?: string | null;
};

/**
 * Runs Sherlock SUGGEST against the captured text and writes the result to
 * `sherlock_findings_cache`. Returns the finding (or null on failure) so the
 * caller can render warm language back to the user. Never throws.
 */
export async function runSherlockSuggest(input: RunSuggestInput): Promise<SuggestFinding | null> {
  const { admin, userId, text, entity_type, entity_id, source } = input;
  const organizationId = input.organizationId ?? null;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || !text.trim()) return null;

  const cacheType = `suggest:${entity_type}`;
  const scopeHash = await sha256(`suggest:${entity_type}:${entity_id ?? ""}:${text}`);

  // Cache check (1h)
  let cacheQ: any = admin
    .from("sherlock_findings_cache")
    .select("findings, updated_at")
    .eq("user_id", userId)
    .eq("entity_type", cacheType)
    .eq("scope_hash", scopeHash);
  cacheQ = organizationId ? cacheQ.eq("organization_id", organizationId) : cacheQ.is("organization_id", null);
  const { data: cached } = await cacheQ.maybeSingle();
  if (cached && new Date(cached.updated_at).getTime() > Date.now() - 60 * 60 * 1000) {
    return cached.findings as SuggestFinding;
  }

  let findings: SuggestFinding | null = null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SUGGEST_SYSTEM },
          { role: "user", content: `CAPTURE (${entity_type}):\n${text.slice(0, 4000)}` },
        ],
        tools: [{
          type: "function",
          function: { name: "suggest", description: "Return structured triage.", parameters: SUGGEST_SCHEMA },
        }],
        tool_choice: { type: "function", function: { name: "suggest" } },
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    findings = JSON.parse(args) as SuggestFinding;
  } catch {
    return null;
  }
  if (!findings) return null;

  // Sensitive-content discipline: if the capture matches any sensitive
  // heuristic, force a cautious posture — route to sherlock for human review,
  // cap confidence at low, and never auto-suggest a downstream action.
  const sens = detectSensitive(text);
  if (sens.sensitive) {
    findings = {
      ...findings,
      suggested_route: "sherlock",
      confidence: "low",
      rationale: `${findings.rationale || ""} Sensitive content detected (${sens.categories.join(", ")}); held for manual review.`.trim(),
    };
  }

  try {
    await admin.from("sherlock_findings_cache").upsert({
      user_id: userId,
      organization_id: organizationId,
      entity_type: cacheType,
      entity_id,
      scope_hash: scopeHash,
      findings: { ...findings, sensitive: sens.sensitive, sensitive_categories: sens.categories },
      confidence: findings.confidence,
    }, { onConflict: "user_id,entity_type,scope_hash" });
    await admin.from("audit_log").insert({
      user_id: userId,
      entity_type: `sherlock_suggest`,
      entity_id,
      event: "sherlock.suggested",
      payload: {
        entity_type,
        source: source ?? null,
        route: findings.suggested_route,
        confidence: findings.confidence,
        sensitive: sens.sensitive,
        sensitive_categories: sens.categories,
      },
    });
    if (sens.sensitive) {
      await admin.from("audit_log").insert({
        user_id: userId,
        entity_type: "sherlock_suggest",
        entity_id,
        event: "sherlock_sensitive_file_flagged",
        payload: { entity_type, source: source ?? null, categories: sens.categories },
      });
    }
  } catch { /* best-effort */ }

  return findings;
}
