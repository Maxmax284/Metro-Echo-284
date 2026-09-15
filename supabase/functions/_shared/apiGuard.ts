// Shared API leash. Every external provider call MUST route through runGuarded().
// Enforces: kill switches, global usage mode, per-feature limits, cache, per-task loop cap.
// Writes a row to api_usage_logs for every attempt.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type GuardProvider =
  | "serpapi"
  | "gemini"
  | "open-meteo"
  | "google-calendar"
  | "lovable-ai"
  | "reddit-serpapi"   // Community: Reddit via SerpApi engine (primary)
  | "reddit-public"    // Community: public reddit.com JSON (fallback)
  | "web-page";        // Reading one public web page Echo was pointed at

export type GuardInput = {
  owner_id: string;
  user_id?: string;
  provider: GuardProvider;
  feature: string;            // e.g. "research.quick", "weather.current", "places.nearby"
  query?: string;
  location?: Record<string, unknown>;
  task_id?: string;           // when set, blockLoopingTask enforces max_calls_per_task
  related_entity_type?: string;
  related_entity_id?: string;
  cache_ttl_seconds?: number; // 0 disables caching for this call
  estimated_cost?: number;
};

export type GuardDecision =
  | { allow: true; reason: "fresh" | "cached"; cached?: unknown }
  | { allow: false; reason: GuardBlockReason; cached?: unknown };

export type GuardBlockReason =
  | "disabled"
  | "lockdown"
  | "manual_mode"
  | "rate_limited"
  | "over_task_cap"
  | "missing_controls";

const PROVIDER_KILL_KEY: Record<GuardProvider, keyof SystemControls> = {
  "serpapi": "serpapi_enabled",
  "gemini": "gemini_enabled",
  "open-meteo": "weather_enabled",
  "google-calendar": "calendar_sync_enabled",
  "lovable-ai": "gemini_enabled",
  "reddit-serpapi": "community_reddit_enabled",
  "reddit-public": "community_public_fallback_enabled",
  "web-page": "external_apis_enabled",
};

type SystemControls = {
  owner_id: string;
  global_usage_mode: string;
  external_apis_enabled: boolean;
  serpapi_enabled: boolean;
  gemini_enabled: boolean;
  weather_enabled: boolean;
  calendar_sync_enabled: boolean;
  background_awareness_enabled: boolean;
  proactive_synthesis_enabled: boolean;
  file_analysis_enabled: boolean;
  deep_research_enabled: boolean;
  local_search_enabled: boolean;
  auto_refresh_enabled: boolean;
  community_reddit_enabled: boolean;
  community_public_fallback_enabled: boolean;
};

type UsageLimit = {
  limit_per_minute: number | null;
  limit_per_hour: number | null;
  limit_per_day: number | null;
  limit_per_month: number | null;
  max_calls_per_task: number | null;
  enabled: boolean;
};

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function hashQuery(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function getCachedResult(
  db: SupabaseClient,
  input: { owner_id: string; provider: string; feature: string; query: string },
): Promise<unknown | null> {
  const query_hash = await hashQuery(input.query);
  const { data } = await db.from("api_cache")
    .select("result_json, expires_at")
    .eq("owner_id", input.owner_id)
    .eq("provider", input.provider)
    .eq("feature", input.feature)
    .eq("query_hash", query_hash)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.result_json;
}

export async function saveCacheResult(
  db: SupabaseClient,
  input: {
    owner_id: string; provider: string; feature: string;
    query: string; result: unknown; ttl_seconds: number;
    location?: Record<string, unknown>;
  },
) {
  const query_hash = await hashQuery(input.query);
  const expires_at = new Date(Date.now() + input.ttl_seconds * 1000).toISOString();
  await db.from("api_cache").upsert({
    owner_id: input.owner_id,
    provider: input.provider,
    feature: input.feature,
    query_hash,
    normalized_query: input.query,
    location_context: input.location ?? null,
    result_json: input.result,
    expires_at,
  }, { onConflict: "owner_id,provider,feature,query_hash" });
}

async function recordApiUsage(
  db: SupabaseClient,
  input: GuardInput,
  status: string,
  extras: { cache_hit?: boolean; error_message?: string; tokens_used?: number; credits_used?: number } = {},
) {
  await db.from("api_usage_logs").insert({
    owner_id: input.owner_id,
    user_id: input.user_id ?? null,
    provider: input.provider,
    feature: input.feature,
    status,
    cache_hit: extras.cache_hit ?? false,
    error_message: extras.error_message ?? null,
    tokens_used: extras.tokens_used ?? null,
    credits_used: extras.credits_used ?? null,
    estimated_cost: input.estimated_cost ?? null,
    related_entity_type: input.related_entity_type ?? null,
    related_entity_id: input.related_entity_id ?? null,
    task_id: input.task_id ?? null,
  });
}

async function loadControls(db: SupabaseClient, owner_id: string): Promise<SystemControls | null> {
  const { data } = await db.from("system_controls").select("*").eq("owner_id", owner_id).maybeSingle();
  if (data) return data as SystemControls;
  // Auto-seed defaults if missing
  await db.from("system_controls").insert({ owner_id }).select().maybeSingle();
  const { data: again } = await db.from("system_controls").select("*").eq("owner_id", owner_id).maybeSingle();
  return (again as SystemControls) ?? null;
}

async function loadLimit(
  db: SupabaseClient, owner_id: string, provider: string, feature: string,
): Promise<UsageLimit | null> {
  const { data } = await db.from("usage_limits")
    .select("limit_per_minute,limit_per_hour,limit_per_day,limit_per_month,max_calls_per_task,enabled")
    .eq("owner_id", owner_id).eq("provider", provider).eq("feature", feature)
    .maybeSingle();
  return (data as UsageLimit) ?? null;
}

async function countCalls(
  db: SupabaseClient, owner_id: string, provider: string, feature: string, sinceMs: number,
): Promise<number> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { count } = await db.from("api_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", owner_id).eq("provider", provider).eq("feature", feature)
    .in("status", ["allowed", "success"])
    .gte("created_at", since);
  return count ?? 0;
}

async function countTask(
  db: SupabaseClient, owner_id: string, task_id: string,
): Promise<number> {
  const { count } = await db.from("api_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", owner_id).eq("task_id", task_id)
    .in("status", ["allowed", "success"]);
  return count ?? 0;
}

// Main entry point. Wraps a provider call with the full leash.
export async function runGuarded<T>(
  input: GuardInput,
  call: () => Promise<T>,
): Promise<{ ok: true; data: T; cached: boolean } | { ok: false; reason: GuardBlockReason; error?: string }> {
  const db = adminClient();
  const controls = await loadControls(db, input.owner_id);
  if (!controls) {
    await recordApiUsage(db, input, "blocked", { error_message: "missing_controls" });
    return { ok: false, reason: "missing_controls" };
  }

  // Global kill switches
  if (controls.global_usage_mode === "lockdown" || !controls.external_apis_enabled) {
    await recordApiUsage(db, input, "disabled", { error_message: "lockdown" });
    return { ok: false, reason: "lockdown" };
  }
  if (controls.global_usage_mode === "manual" && !input.user_id) {
    // background tasks can't run in manual mode
    await recordApiUsage(db, input, "disabled", { error_message: "manual_mode" });
    return { ok: false, reason: "manual_mode" };
  }
  const killKey = PROVIDER_KILL_KEY[input.provider];
  if (killKey && !controls[killKey]) {
    await recordApiUsage(db, input, "disabled", { error_message: `${input.provider} disabled` });
    return { ok: false, reason: "disabled" };
  }

  // Cache check
  if (input.query && (input.cache_ttl_seconds ?? 0) > 0) {
    const cached = await getCachedResult(db, {
      owner_id: input.owner_id, provider: input.provider, feature: input.feature, query: input.query,
    });
    if (cached !== null) {
      await recordApiUsage(db, input, "cached", { cache_hit: true });
      return { ok: true, data: cached as T, cached: true };
    }
  }

  // Rate / loop limits
  const limit = await loadLimit(db, input.owner_id, input.provider, input.feature);
  if (limit && !limit.enabled) {
    await recordApiUsage(db, input, "disabled");
    return { ok: false, reason: "disabled" };
  }
  if (limit) {
    const windows: Array<[number | null, number, string]> = [
      [limit.limit_per_minute, 60_000, "minute"],
      [limit.limit_per_hour, 60 * 60_000, "hour"],
      [limit.limit_per_day, 24 * 60 * 60_000, "day"],
      [limit.limit_per_month, 30 * 24 * 60 * 60_000, "month"],
    ];
    for (const [cap, ms, _label] of windows) {
      if (cap == null) continue;
      const used = await countCalls(db, input.owner_id, input.provider, input.feature, ms);
      if (used >= cap) {
        await recordApiUsage(db, input, "rate_limited");
        return { ok: false, reason: "rate_limited" };
      }
    }
    if (limit.max_calls_per_task && input.task_id) {
      const used = await countTask(db, input.owner_id, input.task_id);
      if (used >= limit.max_calls_per_task) {
        await recordApiUsage(db, input, "blocked", { error_message: "task cap" });
        return { ok: false, reason: "over_task_cap" };
      }
    }
  }

  // Execute
  try {
    const data = await call();
    await recordApiUsage(db, input, "success");
    if (input.query && (input.cache_ttl_seconds ?? 0) > 0) {
      await saveCacheResult(db, {
        owner_id: input.owner_id, provider: input.provider, feature: input.feature,
        query: input.query, result: data, ttl_seconds: input.cache_ttl_seconds!,
        location: input.location,
      });
    }
    return { ok: true, data, cached: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordApiUsage(db, input, "failed", { error_message: msg });
    throw e;
  }
}
