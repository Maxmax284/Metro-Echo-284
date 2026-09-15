import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type AppMode = "locked" | "observer" | "advisor" | "operator";

export const MODE_LABEL: Record<AppMode, string> = {
  locked: "Locked",
  observer: "Observer",
  advisor: "Advisor",
  operator: "Operator",
};

export const MODE_DESCRIPTION: Record<AppMode, string> = {
  locked: "Companion does nothing. Pure read.",
  observer: "Companion answers and captures notes only. No drafts.",
  advisor: "Companion can draft commitments and stage actions for review.",
  operator: "Companion drafts freely. Execution still requires your approval.",
};

/** What the Companion is allowed to do client-side. Mirrors server-side enforcement. */
export function modeAllows(mode: AppMode, intent: string): boolean {
  if (mode === "locked") return false;
  if (mode === "observer") {
    // travel_time only reads: the calendar, the current place, and a road route.
    // look_up reads the public web; check_page reads one page you point at.
    // Neither can sign in, submit anything or execute — so both are read-only.
    return intent === "capture_note" || intent === "run_sherlock" || intent === "query_awareness" || intent === "set_reminder" || intent === "cancel_reminder" || intent === "travel_time" || intent === "look_up" || intent === "check_page";
  }
  // advisor + operator: all draft-only intents allowed
  return true;
}

export function useMode() {
  const { user } = useAuth();
  const [mode, setModeState] = useState<AppMode>("advisor");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_modes")
        .select("mode")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setModeState(((data?.mode as AppMode) ?? "advisor"));
        setLoading(false);
      }
    })();

    const channel = supabase.channel(`user_modes:${user.id}:${Math.random().toString(36).slice(2)}`);
    channel
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "user_modes", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const next = (payload.new as any)?.mode as AppMode | undefined;
          if (next) setModeState(next);
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const setMode = useCallback(
    async (next: AppMode) => {
      if (!user) return;
      setModeState(next);
      await supabase
        .from("user_modes")
        .upsert({ user_id: user.id, mode: next }, { onConflict: "user_id" });
    },
    [user]
  );

  return { mode, setMode, loading };
}
