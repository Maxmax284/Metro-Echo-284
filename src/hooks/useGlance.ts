// useGlance — the records behind the wrist card.
//
// Reads only, always scope-filtered. It borrows the nudges Today already produces
// rather than inventing a second signal store, then hands the facts to the pure
// gate in `@/lib/glance`. Nothing here executes anything.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useVantaContext } from "@/providers/VantaContextProvider";
import { useWearableLoop } from "@/hooks/useWearableLoop";
import { pickGlance, type GlanceDecision, type GlanceItem } from "@/lib/glance";
import type { Urgency } from "@/lib/deviceCompression";

type NudgeRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  priority: number;
  related_entity_type: string | null;
  related_entity_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

/**
 * Priority is a score, and a score alone may never create "critical" (see the
 * ambient rules doc). The wrist ceiling from an ordinary nudge is "needs you".
 */
export function urgencyForNudge(row: { kind: string; priority: number }): Urgency {
  if (row.kind === "commitment_overdue") return "needs_you";
  if (row.priority >= 4) return "needs_you";
  if (row.priority >= 2) return "meaningful";
  return "fyi";
}

const ENTITY_ROUTE: Record<string, string> = {
  commitment: "/?room=work",
  action: "/?room=work",
  note: "/?room=memory",
  project: "/projects",
  document: "/documents",
};

function hrefFor(row: NudgeRow): string {
  return ENTITY_ROUTE[row.related_entity_type ?? ""] ?? "/";
}

function withinQuietHours(start?: string, end?: string, now = new Date()): boolean {
  if (!start || !end) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? mins >= s && mins < e : mins >= s || mins < e;
}

export function useGlance() {
  const { user } = useAuth();
  const { applyScope, key } = useScope();
  const { prefs } = useUserPreferences();
  const { context } = useVantaContext();
  const { loop, loading: bodyLoading } = useWearableLoop();

  const [rows, setRows] = useState<NudgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await applyScope(
        supabase
          .from("nudges")
          .select(
            "id, kind, title, body, priority, related_entity_type, related_entity_id, status, created_at, updated_at",
          ),
      )
        .in("status", ["pending", "seen"])
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (err) throw err;
      setRows((data ?? []) as NudgeRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The glance could not be read.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key, nonce]);

  const quietHours = withinQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end);

  const items: GlanceItem[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        detail: r.body,
        urgency: urgencyForNudge(r),
        createdAt: r.created_at,
        // "seen" is Vanta's record that it was put in front of you already.
        lastSurfacedAt: r.status === "seen" ? r.updated_at : null,
        entity: { type: r.related_entity_type, id: r.related_entity_id },
        href: hrefFor(r),
      })),
    [rows],
  );

  const decision: GlanceDecision = useMemo(
    () =>
      pickGlance({
        items,
        posture: context.posture ?? null,
        quietHours,
        }),
    [items, context.posture, quietHours],
  );

  return {
    decision,
    quietHours,
    posture: context.posture ?? null,
    postureSource: context.postureSource ?? null,
    body: loop,
    loading: loading || bodyLoading,
    error,
    refresh: () => setNonce((n) => n + 1),
  };
}
