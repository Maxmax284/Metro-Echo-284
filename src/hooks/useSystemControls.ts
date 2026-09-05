import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type UsageMode = "conservative" | "balanced" | "power" | "custom" | "manual" | "lockdown";

export type SystemControls = {
  owner_id: string;
  global_usage_mode: UsageMode;
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
  gth_enabled: boolean;
  campcore_enabled: boolean;
  fenrir_enabled: boolean;
  updated_at: string;
};

export const MODE_LABEL: Record<UsageMode, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  power: "Power",
  custom: "Custom",
  manual: "Manual",
  lockdown: "Lockdown",
};

export const MODE_DESC: Record<UsageMode, string> = {
  conservative: "Save credits. Long caching, mostly manual refresh, strict research caps.",
  balanced: "Useful defaults. Reasonable refresh, limited proactive behavior.",
  power: "More proactive. Frequent synthesis, more research — still rate-limited.",
  custom: "Owner-defined caps per feature.",
  manual: "Background work off. Only user-triggered actions run.",
  lockdown: "All external APIs disabled. Internal reads only.",
};

const KILL_SWITCHES: Array<{ key: keyof SystemControls; label: string; hint: string }> = [
  { key: "external_apis_enabled", label: "Everything outside Metro Echo", hint: "One switch that stops all outside lookups." },
  { key: "serpapi_enabled", label: "Web and local lookups", hint: "Search, news and nearby places." },
  { key: "gemini_enabled", label: "Echo's reading and summarising", hint: "Turning documents, notes and surroundings into plain language." },
  { key: "weather_enabled", label: "Weather", hint: "Weather refresh." },
  { key: "calendar_sync_enabled", label: "Google Calendar", hint: "Calendar refresh." },
  { key: "background_awareness_enabled", label: "Background awareness refresh", hint: "Off by default." },
  { key: "proactive_synthesis_enabled", label: "Proactive synthesis", hint: "Once-daily theme detection." },
  { key: "file_analysis_enabled", label: "File analysis", hint: "Ingested file insights." },
  { key: "deep_research_enabled", label: "Deep research", hint: "Multi-call research, requires confirm." },
  { key: "local_search_enabled", label: "Nearby places", hint: "What's around a spot you picked." },
  { key: "auto_refresh_enabled", label: "Awareness auto-refresh", hint: "Off by default." },
];

export function useSystemControls() {
  const { session } = useAuth();
  const [controls, setControls] = useState<SystemControls | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) { setControls(null); setLoading(false); return; }
    setLoading(true);
    let { data } = await supabase.from("system_controls").select("*").eq("owner_id", session.user.id).maybeSingle();
    if (!data) {
      const ins = await supabase.from("system_controls").insert({ owner_id: session.user.id }).select("*").maybeSingle();
      data = ins.data;
    }
    setControls((data as SystemControls) ?? null);
    setLoading(false);
  }, [session]);

  useEffect(() => { load(); }, [load]);

  const update = useCallback(async (patch: Partial<SystemControls>) => {
    if (!session || !controls) return;
    const optimistic = { ...controls, ...patch } as SystemControls;
    setControls(optimistic);
    const { error } = await supabase.from("system_controls").update(patch).eq("owner_id", session.user.id);
    if (error) { setControls(controls); throw error; }
  }, [controls, session]);

  return { controls, loading, update, reload: load };
}

export { KILL_SWITCHES };
