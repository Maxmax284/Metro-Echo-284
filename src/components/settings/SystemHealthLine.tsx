// SystemHealthLine — one line, plain words, no diagnostics dashboard.
//
// Doctrine: show enough of the backend to build trust, not enough to make the
// user operate it. Green when everything Vanta relies on is live, amber when
// something needs the user, neutral when nothing is connected yet. Colour never
// carries the meaning alone — the words say it.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSystemControls } from "@/hooks/useSystemControls";
import { INTEGRATIONS } from "@/lib/integrations/registry";
import { computeStatus } from "@/lib/integrations/status";
import { FreshnessLine } from "@/components/ui/freshness";
import { cn } from "@/lib/utils";

export type HealthTone = "good" | "attention" | "neutral";

export type HealthReading = {
  tone: HealthTone;
  /** The one line the user reads. */
  line: string;
  /** Short "Calendar connected · Telegram connected" detail, when useful. */
  detail: string | null;
};

/**
 * Turn the per-integration statuses into one sentence. Pure so it can be tested
 * without the network.
 */
export function readHealth(
  entries: { name: string; status: string }[],
): HealthReading {
  const live = entries.filter((e) => e.status === "live" || e.status === "configured" || e.status === "partial");
  const needs = entries.filter((e) => e.status === "needs_setup" || e.status === "blocked");

  const detail = live.length > 0 ? live.map((e) => `${e.name} connected`).join(" · ") : null;

  if (entries.length === 0) return { tone: "neutral", line: "Nothing connected yet.", detail: null };
  if (needs.length === 1) {
    return { tone: "attention", line: `${needs[0].name} needs setup.`, detail };
  }
  if (needs.length > 1) {
    return { tone: "attention", line: `${needs.length} connections need attention.`, detail };
  }
  if (live.length === 0) return { tone: "neutral", line: "Nothing connected yet.", detail: null };
  return { tone: "good", line: "All connected.", detail };
}

const DOT: Record<HealthTone, string> = {
  good: "bg-emerald-400",
  attention: "bg-amber-400",
  neutral: "bg-muted-foreground/50",
};

export function SystemHealthLine({ className }: { className?: string }) {
  const { session } = useAuth();
  const { controls } = useSystemControls();
  const [signals, setSignals] = useState<{ telegramLinked?: boolean; emailLinked?: boolean }>({});
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    (async () => {
      const [tg, em] = await Promise.all([
        supabase.from("telegram_chat_links").select("id").eq("user_id", session.user.id).limit(1),
        supabase
          .from("email_inbound_addresses")
          .select("id")
          .eq("user_id", session.user.id)
          .eq("active", true)
          .limit(1),
      ]);
      if (!alive) return;
      setSignals({ telegramLinked: (tg.data ?? []).length > 0, emailLinked: (em.data ?? []).length > 0 });
      setCheckedAt(Date.now());
    })();
    return () => {
      alive = false;
    };
  }, [session]);

  /* Only the connections a user actually relies on. Planned and deferred
     platforms are roadmap, not health. */
  const entries = INTEGRATIONS.filter((i) => i.bucket === "connected" && i.key !== "vanta_core").map((i) => ({
    name: i.name,
    status: computeStatus(i, controls ?? null, signals),
  }));

  const health = readHealth(entries);

  return (
    <Link
      to="/settings/integrations"
      className={cn(
        "vanta-focus group mb-4 flex items-center gap-2.5 rounded-xl surface-elevated px-3.5 py-2.5 ring-1 ring-border/60 hover:ring-primary/30",
        className,
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[health.tone])} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-foreground">{health.line}</span>
        {health.detail ? (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{health.detail}</span>
        ) : null}
      </span>
      <FreshnessLine at={checkedAt} />
    </Link>
  );
}
