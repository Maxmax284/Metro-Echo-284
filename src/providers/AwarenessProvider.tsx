import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recordDeletion } from "@/lib/archive";
import { useAuth } from "@/lib/auth";

export type AwarenessConfidence = "low" | "medium" | "high";
export type AwarenessFreshness = "fresh" | "aging" | "stale" | "missing";

export type AwarenessPlace = {
  id: string;
  label: string;
  geo: any;
  country: string | null;
  region: string | null;
  updated_at?: string;
  /** Your own words, when you seeded the place by hand. */
  category?: string | null;
  notes?: string | null;
  address?: string | null;
  /** Your welcome stamp, pressed by hand. Cleared by a real move. */
  stamped_at?: string | null;
};

export type AwarenessBriefing = {
  id: string;
  section: string;
  content: string;
  confidence: AwarenessConfidence | null;
  generated_at: string;
  signal?: unknown | null;
};

export type AwarenessSlice = {
  place: AwarenessPlace | null;
  freshness: AwarenessFreshness;
  confidence: AwarenessConfidence | null;
  oldest_section: string | null;
  newest_at: string | null;
  missing_sections: string[];
  briefings: AwarenessBriefing[];
};

export const AWARENESS_SECTIONS = [
  "transport", "infrastructure", "payments", "etiquette",
  "hazards", "scams", "connectivity", "timing",
] as const;

const FRESH_MS = 24 * 60 * 60 * 1000;
const AGING_MS = 7 * 24 * 60 * 60 * 1000;

function classifyFreshness(generatedAt: string | null): AwarenessFreshness {
  if (!generatedAt) return "missing";
  const age = Date.now() - new Date(generatedAt).getTime();
  if (age < FRESH_MS) return "fresh";
  if (age < AGING_MS) return "aging";
  return "stale";
}

function worstConfidence(values: (AwarenessConfidence | null)[]): AwarenessConfidence | null {
  const order: Record<AwarenessConfidence, number> = { low: 0, medium: 1, high: 2 };
  let worst: AwarenessConfidence | null = null;
  for (const v of values) {
    if (!v) continue;
    if (worst === null || order[v] < order[worst]) worst = v;
  }
  return worst;
}

export type AwarenessSnapshot = {
  id: string;
  compact: {
    place?: { id: string; label: string };
    weather?: {
      tempC: number | null;
      condition: string | null;
      updated_at: string;
      hourly?: Array<{ at: string; tempC: number | null; condition: string | null; rainChance: number | null }>;
    } | null;
    summary?: string | null;
    briefing_count?: number;
    generated_at?: string;
  };
  full_data: any;
  sources_used: string[];
  generated_at: string;
  expires_at: string;
};

type Ctx = {
  place: AwarenessPlace | null;
  briefings: AwarenessBriefing[];
  latestBySection: Record<string, AwarenessBriefing | undefined>;
  loading: boolean;
  refresh: () => Promise<void>;
  generate: (section: string) => Promise<void>;
  generating: string | null;
  getSlice: (sections?: readonly string[]) => AwarenessSlice;
  overall: AwarenessSlice;
  snapshot: AwarenessSnapshot | null;
  snapshotLoading: boolean;
  refreshSnapshot: (force?: boolean) => Promise<void>;
  setActivePlace: (id: string) => Promise<void>;
  deletePlace: (id: string) => Promise<void>;
  /** Rows carrying your welcome stamp — the boot echoes them on stamped ground. */
  stampedPlaces: AwarenessPlace[];
};

const AwarenessCtx = createContext<Ctx | null>(null);

export function AwarenessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [place, setPlace] = useState<AwarenessPlace | null>(null);
  const [briefings, setBriefings] = useState<AwarenessBriefing[]>([]);
  const [stampedPlaces, setStampedPlaces] = useState<AwarenessPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AwarenessSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const channelRef = useRef<any>(null);

  const refresh = useCallback(async () => {
    if (!session) {
      setPlace(null);
      setBriefings([]);
      setStampedPlaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: p } = await supabase
      .from("awareness_places")
      .select("id,label,geo,country,region,address,category,notes,updated_at,stamped_at")
      // "reading" places are kept to read about, never to stand in for your fix.
      .or("category.is.null,category.not.in.(care,nearby,reading)")
      .is("archived_at", null)
      // Only a device fix can be "where you are". Saved places (Home, Work,
      // a named reading) are rows too, and editing one bumps updated_at —
      // without this, marking a place Home would teleport the whole app.
      .filter("geo->>source", "eq", "device")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const active = (p ?? null) as AwarenessPlace | null;
    setPlace(active);
    /* Stamped ground: the rows carrying your welcome stamp, so the boot can
       echo them when you stand on (or back near) one. */
    const { data: stamped } = await supabase
      .from("awareness_places")
      .select("id,label,geo,stamped_at")
      .not("stamped_at", "is", null)
      .is("archived_at", null);
    setStampedPlaces((stamped ?? []) as AwarenessPlace[]);
    if (active?.id) {
      const { data: b } = await supabase
        .from("awareness_briefings")
        .select("id,section,content,confidence,generated_at,signal")
        .eq("place_id", active.id)
        .order("generated_at", { ascending: false });
      setBriefings((b ?? []) as AwarenessBriefing[]);
    } else {
      setBriefings([]);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  // Light realtime: invalidate on inserts to either table for this user
  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel("awareness-provider")
      .on("postgres_changes", { event: "*", schema: "public", table: "awareness_briefings", filter: `user_id=eq.${session.user.id}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "awareness_places", filter: `user_id=eq.${session.user.id}` }, () => refresh())
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [session, refresh]);

  const generate = useCallback(async (section: string) => {
    if (!place) return;
    setGenerating(section);
    try {
      await supabase.functions.invoke("awareness-brief", { body: { place_id: place.id, section } });
      await refresh();
    } finally {
      setGenerating(null);
    }
  }, [place, refresh]);

  const latestBySection = useMemo(() => {
    const map: Record<string, AwarenessBriefing | undefined> = {};
    for (const b of briefings) if (!map[b.section]) map[b.section] = b;
    return map;
  }, [briefings]);

  const getSlice = useCallback((sections?: readonly string[]): AwarenessSlice => {
    const keys = sections ?? AWARENESS_SECTIONS;
    const items = keys.map((s) => latestBySection[s]).filter(Boolean) as AwarenessBriefing[];
    const missing = keys.filter((s) => !latestBySection[s]);
    if (!place) {
      return { place: null, freshness: "missing", confidence: null, oldest_section: null, newest_at: null, missing_sections: [...keys], briefings: [] };
    }
    if (items.length === 0) {
      return { place, freshness: "missing", confidence: null, oldest_section: null, newest_at: null, missing_sections: missing, briefings: [] };
    }
    let oldest = items[0];
    let newest = items[0];
    for (const b of items) {
      if (new Date(b.generated_at) < new Date(oldest.generated_at)) oldest = b;
      if (new Date(b.generated_at) > new Date(newest.generated_at)) newest = b;
    }
    return {
      place,
      freshness: classifyFreshness(oldest.generated_at),
      confidence: worstConfidence(items.map((b) => b.confidence)),
      oldest_section: oldest.section,
      newest_at: newest.generated_at,
      missing_sections: missing,
      briefings: items,
    };
  }, [latestBySection, place]);

  const overall = useMemo(() => getSlice(), [getSlice]);

  // Load most recent unexpired snapshot for current place
  const loadSnapshot = useCallback(async (placeId: string | null) => {
    if (!placeId) { setSnapshot(null); return; }
    const { data } = await supabase
      .from("awareness_snapshots" as any)
      .select("id, compact, full_data, sources_used, generated_at, expires_at")
      .eq("place_id", placeId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && new Date((data as any).expires_at).getTime() > Date.now()) {
      setSnapshot(data as unknown as AwarenessSnapshot);
    } else {
      setSnapshot(null);
    }
  }, []);

  useEffect(() => { loadSnapshot(place?.id ?? null); }, [place?.id, loadSnapshot]);

  const refreshSnapshot = useCallback(async (force?: boolean) => {
    if (!place) return;
    setSnapshotLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("awareness-snapshot", {
        body: { place_id: place.id, force_refresh: !!force },
      });
      if (!error && data?.snapshot) {
        setSnapshot(data.snapshot as AwarenessSnapshot);
      }
    } finally {
      setSnapshotLoading(false);
    }
  }, [place]);

  const setActivePlace = useCallback(async (id: string) => {
    // "Active" = most recently updated. Bumping updated_at makes it the active one.
    await supabase.from("awareness_places").update({ updated_at: new Date().toISOString() }).eq("id", id);
    await refresh();
  }, [refresh]);

  const deletePlace = useCallback(async (id: string) => {
    /* Provenance first: a snapshot receipt is written before the row and its
       briefings go, so a deleted pin can still be accounted for. */
    const { data: row } = await supabase
      .from("awareness_places")
      .select("id,label,geo,country,region,category,notes,address,created_at,stamped_at")
      .eq("id", id)
      .maybeSingle();
    if (row) await recordDeletion("place", id, row as unknown as Record<string, unknown>);
    await supabase.from("awareness_briefings").delete().eq("place_id", id);
    await supabase.from("awareness_snapshots" as any).delete().eq("place_id", id);
    await supabase.from("awareness_places").delete().eq("id", id);
    await refresh();
  }, [refresh]);

  const value = useMemo<Ctx>(() => ({
    place, briefings, latestBySection, loading, refresh, generate, generating, getSlice, overall,
    snapshot, snapshotLoading, refreshSnapshot, setActivePlace, deletePlace, stampedPlaces,
  }), [place, briefings, latestBySection, loading, refresh, generate, generating, getSlice, overall, snapshot, snapshotLoading, refreshSnapshot, setActivePlace, deletePlace, stampedPlaces]);

  return <AwarenessCtx.Provider value={value}>{children}</AwarenessCtx.Provider>;
}

export function useAwareness() {
  const v = useContext(AwarenessCtx);
  if (!v) throw new Error("useAwareness must be inside AwarenessProvider");
  return v;
}

/** Tolerant variant: returns null when used outside the provider. */
export function useAwarenessOptional() {
  return useContext(AwarenessCtx);
}

export function useAwarenessSlice(sections?: readonly string[]) {
  const { getSlice } = useAwareness();
  return useMemo(() => getSlice(sections), [getSlice, sections]);
}
