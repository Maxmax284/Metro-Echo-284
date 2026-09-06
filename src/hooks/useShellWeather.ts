// useShellWeather — the shell reflects the state of the world in every room.
//
// The calm / drift / pressure treatment used to be written by Today alone, so a
// person who opened straight into Work, Ask or Receipts got a neutral shell no
// matter how much was overdue. This hook owns that read at the shell level: it
// counts only (no rows fetched), applies the weather to <html>, and records the
// change so the shell's own history is auditable like everything else.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { applyWeather, deriveWeather, type Weather, type WeatherInputs } from "@/lib/weather";

const REFRESH_MS = 90_000;

export function useShellWeather() {
  const { user } = useAuth();
  const { applyScope, key, orgId } = useScope();
  const [weather, setWeather] = useState<Weather | null>(null);
  const last = useRef<Weather | null>(null);

  const read = useCallback(async () => {
    if (!user) return;
    const nowIso = new Date().toISOString();
    const count = (q: any) => q.then((r: any) => r.count ?? 0);
    const [overdue, attention, captures, noticed] = await Promise.all([
      count(
        applyScope(supabase.from("commitments").select("id", { count: "exact", head: true }))
          .eq("status", "open")
          .lt("due_at", nowIso),
      ),
      count(
        applyScope(supabase.from("actions").select("id", { count: "exact", head: true }))
          .in("status", ["staged", "proposed"]),
      ),
      count(
        applyScope(supabase.from("messages").select("id", { count: "exact", head: true }))
          .eq("role", "user")
          .contains("metadata", { needs_review: true }),
      ),
      count(
        applyScope(supabase.from("nudges").select("id", { count: "exact", head: true }))
          .eq("status", "pending"),
      ),
    ]);

    const inputs: WeatherInputs = {
      overdue,
      attention,
      captures,
      /* Security is read by Today from its own lane; the shell does not guess. */
      securityAlert: false,
      noticed: noticed > 0,
    };
    const next = deriveWeather(inputs);
    setWeather(next);
    if (next === last.current) return;
    const prev = last.current;
    last.current = next;
    applyWeather(next);

    /* One row per real change, never per read. This is what makes the shell's
       mood explainable after the fact instead of a vibe. */
    if (prev !== null) {
      try {
        await supabase.from("operational_state_events").insert({
          user_id: user.id,
          inferred_state: next,
          signals: { from: prev, organization_id: orgId ?? null, ...inputs },
        });
      } catch {
        /* Ambient telemetry: a failed write must never disturb the room. */
      }
    }
  }, [user, applyScope, orgId]);

  useEffect(() => {
    last.current = null;
    void read();
    const t = setInterval(() => void read(), REFRESH_MS);
    return () => clearInterval(t);
  }, [key, read]);

  return weather;
}
