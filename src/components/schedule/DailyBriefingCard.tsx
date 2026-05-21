import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sunrise, Sun, Moon, Sparkles, Wand2, Loader2, Target } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { formatDistanceToNowStrict } from "date-fns";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";

type Commitment = {
  id: string;
  summary: string;
  due_at: string | null;
  remind_at: string | null;
  status: string;
};

/**
 * Doctrine: every surface answers "what is this / what happened / what can I do".
 * DailyBriefing collapses the user's day into a single tz-stamped sentence.
 * Pure read; no writes. Mounts on Schedule (Today) and is drop-in for Cockpit.
 */
export function DailyBriefingCard() {
  const { session, user } = useAuth();
  const { timezone } = useUserTimezone();
  const [items, setItems] = useState<Commitment[]>([]);
  const [overdue, setOverdue] = useState(0);
  const [files, setFiles] = useState(0);
  const [approvals, setApprovals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [polish, setPolish] = useState<string | null>(null);
  const [bestFirstMove, setBestFirstMove] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);
  const auditedRef = useRef(false);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
      const [c, a, f] = await Promise.all([
        supabase.from("commitments")
          .select("id, summary, due_at, remind_at, status")
          .eq("status", "open")
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(50),
        supabase.from("actions")
          .select("id", { count: "exact", head: true })
          .in("status", ["proposed", "staged"]),
        supabase.from("ingested_files")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      const rows = (c.data ?? []) as Commitment[];
      setItems(rows);
      const od = rows.filter((r) => r.due_at && new Date(r.due_at) < new Date()).length;
      setOverdue(od);
      setApprovals(a.count ?? 0);
      setFiles(f.count ?? 0);
      setLoading(false);

      // Audit briefing.generated once per session-mount (counts-first, no AI).
      if (user && !auditedRef.current) {
        auditedRef.current = true;
        await supabase.from("audit_log").insert({
          user_id: user.id,
          entity_type: "briefing",
          event: "briefing.generated",
          payload: { overdue: od, due_today: rows.length, approvals: a.count ?? 0, files_pending: f.count ?? 0 },
        });
      }
    })();
  }, [session, user]);

  const { Icon, greeting, clock } = useMemo(() => {
    const now = new Date();
    const hourStr = formatInTimeZone(now, timezone, "H");
    const h = Number(hourStr);
    const clock = formatInTimeZone(now, timezone, "h:mm a");
    if (h < 5) return { Icon: Moon, greeting: "Late night", clock };
    if (h < 12) return { Icon: Sunrise, greeting: "Good morning", clock };
    if (h < 18) return { Icon: Sun, greeting: "Afternoon", clock };
    return { Icon: Moon, greeting: "Evening", clock };
  }, [timezone]);

  const todayList = useMemo(() => {
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    return items.filter((c) => {
      const d = c.due_at || c.remind_at;
      return d && new Date(d).getTime() <= endOfDay.getTime();
    });
  }, [items]);

  const next = useMemo(() => {
    const now = Date.now();
    return items.find((c) => {
      const d = c.due_at || c.remind_at;
      return d && new Date(d).getTime() > now;
    });
  }, [items]);

  const line = useMemo(() => {
    if (loading) return "Reading the day…";
    const needsReview = files; // pending file ingest counts as "needs review"
    if (!overdue && !todayList.length && !approvals && !files) {
      return vantaSay.briefing.quiet();
    }
    const activeCount = todayList.length - overdue;
    const parts: string[] = [];
    if (activeCount > 0 || overdue || needsReview) {
      parts.push(vantaSay.briefing.morning({
        active: Math.max(activeCount, 0),
        overdue,
        review: needsReview,
      }));
    }
    if (approvals) parts.push(`${approvals} awaiting approval.`);
    return parts.join(" ");
  }, [loading, overdue, todayList.length, approvals, files]);

  const polishBriefing = async () => {
    if (!user || polishing) return;
    setPolishing(true);
    try {
      const hourStr = formatInTimeZone(new Date(), timezone, "H");
      const h = Number(hourStr);
      const part_of_day = h < 12 ? "morning" : h < 18 ? "midday" : "evening";
      const { data, error } = await supabase.functions.invoke("briefing-compose", {
        body: { timezone, part_of_day },
      });
      if (error) throw error;
      const d = data as {
        narrative?: string | null;
        headline?: string;
        best_first_move?: string;
      } | null;
      const text = d?.narrative
        ?? [d?.headline, d?.best_first_move ? vantaSay.briefing.bestFirstMove(d.best_first_move.replace(/\.$/, "")) : null]
            .filter(Boolean).join(" ");
      if (text) setPolish(text.trim());
    } catch (e) {
      toast.fromError(e);
    } finally {
      setPolishing(false);
    }
  };

  return (
    <Card className="border-border/60 bg-surface-elevated/60 p-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 rounded-md bg-primary/15 p-1.5 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 text-[12.5px] text-foreground/90">
            <span className="font-medium">{greeting}.</span>
            <span className="text-muted-foreground">{clock} {timezone}</span>
          </div>
          <p className="text-[12.5px] leading-snug text-foreground/85">{line}</p>
          {next && (
            <p className="flex items-baseline gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="h-2.5 w-2.5 text-primary" />
              <span className="truncate">Next: {next.summary}</span>
              <span className="shrink-0 text-muted-foreground/80">
                · {formatDistanceToNowStrict(new Date((next.due_at || next.remind_at)!), { addSuffix: true })}
              </span>
            </p>
          )}
          {polish && (
            <p className="mt-1 rounded-md bg-primary/5 p-2 text-[12px] italic text-foreground/85 ring-1 ring-primary/20">
              {polish}
            </p>
          )}
          {!loading && !polish && (overdue + todayList.length + approvals + files > 0) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10.5px] text-muted-foreground hover:text-primary"
              onClick={polishBriefing}
              disabled={polishing}
            >
              {polishing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
              Polish with Vanta
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
