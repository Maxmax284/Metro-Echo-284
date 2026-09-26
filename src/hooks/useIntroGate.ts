// useIntroGate — who owes the once-per-account welcome.
//
// The account carries the flag (profiles.preferences.intro_seen_at), so the
// Google sign-in round trip and new devices land on the same truth. A
// per-device mirror only saves the fetch on later opens. A failed read never
// traps anyone behind a ceremony: the app opens, and the next launch asks
// again.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { introDue, introMirrorKey } from "@/lib/introSequence";

export type IntroGate = "checking" | "show" | "done";

function mirrorSeen(userId: string): boolean {
  try {
    return !!localStorage.getItem(introMirrorKey(userId));
  } catch {
    return false;
  }
}

export function useIntroGate(userId: string | undefined): {
  gate: IntroGate;
  finishIntro: () => void;
} {
  const [gate, setGate] = useState<IntroGate>(() =>
    userId && mirrorSeen(userId) ? "done" : "checking",
  );

  useEffect(() => {
    if (!userId) return;
    if (mirrorSeen(userId)) {
      setGate("done");
      return;
    }
    let live = true;
    setGate("checking");
    void supabase
      .from("profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) {
          setGate("done");
          return;
        }
        const seen = (data?.preferences as { intro_seen_at?: unknown } | null)?.intro_seen_at;
        if (!introDue(seen)) {
          try {
            localStorage.setItem(introMirrorKey(userId), "1");
          } catch {
            /* private window — the server still remembers */
          }
          setGate("done");
        } else {
          setGate("show");
        }
      });
    return () => {
      live = false;
    };
  }, [userId]);

  return { gate, finishIntro: () => setGate("done") };
}
