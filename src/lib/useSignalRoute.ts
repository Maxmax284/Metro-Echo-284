// Stage 5 — Cross-surface routing for VantaSignal operational verbs.
// Single source of truth so HUD / AwarenessSurface / future surfaces all
// behave identically when a user clicks a SignalCard action button.

import { useCallback } from "react";
import { toast } from "sonner";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { supabase } from "@/integrations/supabase/client";
import type { SignalRoute, VantaSignal } from "@/lib/vantaSignal";

export type SignalRouteHandler = (route: SignalRoute, signal: VantaSignal) => void;

/**
 * useSignalRoute — returns a handler that wires VantaSignal `available_routes`
 * to real cross-surface actions. Safe to call from any surface; missing
 * targets degrade to toast feedback rather than silent no-ops.
 */
export function useSignalRoute(): SignalRouteHandler {
  const { refresh, refreshSnapshot } = useAwareness();
  const { openSherlock } = useSherlock();

  return useCallback<SignalRouteHandler>((route, signal) => {
    const title = signal.title || signal.signal_type;

    switch (route) {
      case "refresh_signal": {
        toast.message("Refreshing signal…");
        // Snapshot first (cheap, deterministic), then briefings.
        refreshSnapshot?.().catch(() => {});
        refresh().catch(() => {});
        return;
      }

      case "confirm_location":
      case "use_saved_place": {
        toast.message(
          route === "confirm_location" ? "Re-checking location…" : "Using saved place…",
          { description: "Pulling a fresh snapshot." },
        );
        refreshSnapshot?.().catch(() => {});
        return;
      }

      case "send_to_sherlock": {
        const text = [
          signal.short_summary,
          signal.why_it_matters && `Why it matters: ${signal.why_it_matters}`,
          signal.what_to_do_next && `Next: ${signal.what_to_do_next}`,
          signal.long_detail,
        ].filter(Boolean).join("\n\n");
        openSherlock({
          entity_type: "briefing",
          title,
          text,
        });
        return;
      }

      case "ask_vanta": {
        // No converse-prefill surface API yet — drop the question into the
        // clipboard so the user can paste into the Companion dock.
        const q = `About "${title}": ${signal.what_to_do_next || signal.short_summary}`;
        try {
          navigator.clipboard?.writeText(q);
          toast.success("Copied — paste into the Vanta dock to ask.");
        } catch {
          toast.message("Ask Vanta", { description: q });
        }
        return;
      }

      case "save_to_memory": {
        const body = [
          `# ${title}`,
          signal.short_summary,
          signal.why_it_matters && `\n**Why it matters:** ${signal.why_it_matters}`,
          signal.what_to_do_next && `**Next:** ${signal.what_to_do_next}`,
          signal.long_detail && `\n${signal.long_detail}`,
        ].filter(Boolean).join("\n");
        (async () => {
          try {
            const { data: u } = await supabase.auth.getUser();
            if (!u.user) { toast.error("Not signed in."); return; }
            const { error } = await supabase.from("notes").insert({
              user_id: u.user.id,
              title,
              body,
            });
            if (error) throw error;
            toast.success("Saved to memory.");
          } catch (e: any) {
            toast.error("Couldn't save", { description: e?.message ?? "Try again." });
          }
        })();
        return;
      }

      case "create_commitment": {
        (async () => {
          try {
            const { data: u } = await supabase.auth.getUser();
            if (!u.user) { toast.error("Not signed in."); return; }
            const { error } = await supabase.from("commitments").insert({
              user_id: u.user.id,
              summary: signal.what_to_do_next || title,
            });
            if (error) throw error;
            toast.success("Commitment staged.");
          } catch (e: any) {
            toast.error("Couldn't stage commitment", { description: e?.message ?? "Try again." });
          }
        })();
        return;
      }

      case "draft_action": {
        // Actions table shape varies; keep this as a staged-toast for now —
        // Stage 6 wires the real actions-transition flow.
        toast.message("Draft action queued", {
          description: signal.what_to_do_next || title,
        });
        return;
      }

      case "dismiss":
        return;

      default:
        toast.message(`Route: ${route}`);
    }
  }, [refresh, refreshSnapshot, openSherlock]);
}
