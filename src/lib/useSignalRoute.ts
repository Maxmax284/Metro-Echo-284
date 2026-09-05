// Stage 5 — Cross-surface routing for VantaSignal operational verbs.
// Single source of truth so HUD / AwarenessSurface / future surfaces all
// behave identically when a user clicks a SignalCard action button.

import { useCallback } from "react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { supabase } from "@/integrations/supabase/client";
import type { SignalRoute, VantaSignal } from "@/lib/vantaSignal";
import { useCompanion } from "@/components/companion/CompanionContext";
import { useStageAction } from "@/hooks/useStageAction";
import { geohashFromGeo } from "@/lib/geohash";
import { linkEntities } from "@/lib/entityGraph";

export type SignalRouteHandler = (route: SignalRoute, signal: VantaSignal) => void;

/**
 * useSignalRoute — returns a handler that wires VantaSignal `available_routes`
 * to real cross-surface actions. Safe to call from any surface; missing
 * targets degrade to toast feedback rather than silent no-ops.
 */
export function useSignalRoute(): SignalRouteHandler {
  const { refresh, refreshSnapshot, place } = useAwareness();
  const { openSherlock } = useSherlock();
  const { openWithPrefill } = useCompanion();
  const stageAction = useStageAction();

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
        toast.message({ title: route === "confirm_location" ? "Re-checking location…" : "Using saved place…", description: "Pulling a fresh snapshot." });
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
        // Stage 6 — open the Companion dock prefilled with the question.
        const q = `About "${title}": ${signal.what_to_do_next || signal.short_summary}`;
        openWithPrefill(q);
        toast.message({ title: "Companion opened", description: "Edit or send the question." });
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
            if (!u.user) { toast.error(vantaSay.notSignedIn()); return; }
            const { data: inserted, error } = await supabase.from("notes").insert({
              user_id: u.user.id,
              title,
              body,
            }).select("id").single();
            if (error) throw error;
            if (inserted?.id) linkEntities({ userId: u.user.id, source_kind: "note", source_id: inserted.id, text: `${title}\n${body}` });
            toast.success(vantaSay.noteSaved());
          } catch (e: any) {
            toast.error(vantaSay.couldntSave());
          }
        })();
        return;
      }

      case "create_commitment": {
        (async () => {
          try {
            const { data: u } = await supabase.auth.getUser();
            if (!u.user) { toast.error(vantaSay.notSignedIn()); return; }
            const { data: inserted, error } = await supabase.from("commitments").insert({
              user_id: u.user.id,
              summary: signal.what_to_do_next || title,
            }).select("id").single();
            if (error) throw error;
            if (inserted?.id) linkEntities({ userId: u.user.id, source_kind: "commitment", source_id: inserted.id, text: signal.what_to_do_next || title });
            toast.success(vantaSay.actionStaged());
          } catch (e: any) {
            toast.error(vantaSay.couldntSave());
          }
        })();
        return;
      }

      case "draft_action": {
        // Stage 6 — insert a proposed action; user reviews + transitions in ActionsSurface.
        (async () => {
          try {
            const { data: u } = await supabase.auth.getUser();
            if (!u.user) { toast.error(vantaSay.notSignedIn()); return; }
            const description = [
              signal.short_summary,
              signal.why_it_matters && `Why it matters: ${signal.why_it_matters}`,
              signal.what_to_do_next && `Next: ${signal.what_to_do_next}`,
            ].filter(Boolean).join("\n\n");
            await stageAction({
              title: signal.what_to_do_next || title,
              description: description || null,
              source: `vanta-signal:${signal.signal_type}`,
              status: "proposed",
              risk: signal.risk_level,
              payload: { signal } as Record<string, unknown>,
            });
            toast.success(vantaSay.actionDrafted());
          } catch (e: any) {
            toast.error(vantaSay.couldntSave());
          }
        })();
        return;
      }

      case "dismiss":
        return;

      // ---------- Stage 2 — feedback verbs ----------
      case "mark_wrong":
      case "mark_useful":
      case "mark_outdated":
      case "flag_source":
      case "do_not_show_again": {
        const map: Record<string, { type: string; impact: string; toast: string }> = {
          mark_wrong:        { type: "wrong",      impact: "invalidate", toast: "Marked wrong. Vanta will lower confidence." },
          mark_useful:       { type: "useful",     impact: "raise",      toast: "Marked useful." },
          mark_outdated:     { type: "outdated",   impact: "lower",      toast: "Marked outdated." },
          flag_source:       { type: "source_bad", impact: "lower",      toast: "Source flagged." },
          do_not_show_again: { type: "reject",     impact: "invalidate", toast: "Won't show again." },
        };
        const cfg = map[route];
        (async () => {
          try {
            const { data: u } = await supabase.auth.getUser();
            if (!u.user) { toast.error(vantaSay.notSignedIn()); return; }
            const { data: inserted, error } = await supabase.from("corrections").insert({
              user_id: u.user.id,
              surface: "awareness",
              target_type: `signal:${signal.signal_type}`,
              target_id: signal.title || signal.signal_type,
              feedback_type: cfg.type as any,
              original_value: { signal } as any,
              confidence_impact: cfg.impact as any,
            }).select("id").single();
            if (error) throw error;
            // Stage 10 — audit hardening: every correction also writes an audit row.
            await supabase.from("audit_log").insert({
              user_id: u.user.id,
              entity_type: "correction",
              entity_id: inserted?.id ?? null,
              event: `correction:${cfg.type}`,
              payload: { surface: "awareness", target: signal.title || signal.signal_type, signal_type: signal.signal_type } as any,
            });
            toast.success(cfg.toast);
          } catch (e: any) {
            toast.error(vantaSay.couldntSave());
          }
        })();
        return;
      }

      case "add_field_note": {
        const summary = typeof window !== "undefined"
          ? window.prompt(`Field note about "${title}":`, "")
          : null;
        if (!summary || !summary.trim()) return;
        (async () => {
          try {
            const { data: u } = await supabase.auth.getUser();
            if (!u.user) { toast.error(vantaSay.notSignedIn()); return; }
            const { data: inserted, error } = await supabase.from("field_notes").insert({
              user_id: u.user.id,
              note_type: "custom",
              summary: summary.trim(),
              details: signal.short_summary || null,
              location_label: title,
              place_id: place?.id ?? null,
              geo: place?.geo ?? null,
              geohash: geohashFromGeo(place?.geo),
            }).select("id").single();
            if (error) throw error;
            if (inserted?.id) linkEntities({ userId: u.user.id, source_kind: "field_note", source_id: inserted.id, text: `${title}\n${summary.trim()}` });
            await supabase.from("audit_log").insert({
              user_id: u.user.id,
              entity_type: "field_note",
              entity_id: inserted?.id ?? null,
              event: "field_note:created",
              payload: { location_label: title, summary: summary.trim(), geohash: geohashFromGeo(place?.geo) } as any,
            });
            toast.success(vantaSay.fieldNoteSaved());
          } catch (e: any) {
            toast.error(vantaSay.couldntSave());
          }
        })();
        return;
      }

      default:
        toast.message(`Route: ${route}`);
    }
  }, [refresh, refreshSnapshot, openSherlock, openWithPrefill, place]);
}
