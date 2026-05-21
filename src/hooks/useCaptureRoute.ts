// useCaptureRoute — single funnel for all triage actions on a capture
// (message, file, field note, note). Every route writes:
//   1. an entry in audit_log (the durable who/what/when trail)
//   2. an entry in capture_routes (the inbox-shaped route history)
//
// Doctrine: capture feeds the system, the user decides. This hook records
// what the user (or accepted Sherlock suggestion) did — it does not execute
// downstream effects. Callers stage the side-effect (insert reminder,
// commitment, action, etc.) and then call record() to keep the receipts.
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type CaptureKind = "message" | "file" | "field_note" | "note" | "other";

export type CaptureRouteAction =
  | "accepted"
  | "edited"
  | "dismissed"
  | "archived"
  | "attached"
  | "ignored"
  | "reviewed"
  | "snoozed"
  | "unsnoozed"
  | "routed"
  | "undo";

export type RecordRouteInput = {
  captureKind: CaptureKind;
  captureId: string;
  source?: string | null;
  suggestedRoute?: string | null;
  userAction: CaptureRouteAction;
  previousStatus?: string | null;
  newStatus?: string | null;
  sherlockFindingId?: string | null;
  payload?: Record<string, unknown>;
  /** Optional plain event name for audit_log; defaults to capture.<userAction>. */
  auditEvent?: string;
};

export function useCaptureRoute() {
  const { user } = useAuth();

  const record = useCallback(
    async (input: RecordRouteInput) => {
      if (!user) return null;
      const event = input.auditEvent ?? `capture.${input.userAction}`;
      const auditPayload = {
        capture_kind: input.captureKind,
        capture_id: input.captureId,
        source: input.source ?? null,
        suggested_route: input.suggestedRoute ?? null,
        previous_status: input.previousStatus ?? null,
        new_status: input.newStatus ?? null,
        sherlock_finding_id: input.sherlockFindingId ?? null,
        ...(input.payload ?? {}),
      };
      const { data: audit } = await supabase
        .from("audit_log")
        .insert({
          user_id: user.id,
          entity_type: "capture",
          entity_id: null,
          event,
          payload: auditPayload,
        })
        .select("id")
        .single();
      await supabase.from("capture_routes").insert({
        user_id: user.id,
        capture_kind: input.captureKind,
        capture_id: input.captureId,
        source: input.source ?? null,
        suggested_route: input.suggestedRoute ?? null,
        user_action: input.userAction,
        previous_status: input.previousStatus ?? null,
        new_status: input.newStatus ?? null,
        sherlock_finding_id: input.sherlockFindingId ?? null,
        audit_event_id: audit?.id ?? null,
        payload: input.payload ?? {},
      });
      return audit?.id ?? null;
    },
    [user],
  );

  return { record };
}

/** Convenience: list route history for a single capture. */
export async function loadCaptureHistory(
  userId: string,
  captureKind: CaptureKind,
  captureId: string,
  limit = 50,
) {
  const { data } = await supabase
    .from("capture_routes")
    .select("*")
    .eq("user_id", userId)
    .eq("capture_kind", captureKind)
    .eq("capture_id", captureId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
