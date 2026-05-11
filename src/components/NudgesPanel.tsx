import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, X, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getCurrentPosition } from "@/lib/native";

type Nudge = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  priority: number;
  related_entity_type: string | null;
  related_entity_id: string | null;
  status: string;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = {
  commitment_overdue: "Overdue",
  commitment_due_today: "Due today",
  action_ready: "Action",
  note_stale: "Memory",
  arrival_new_area: "Arrival",
  arrival_known: "Place",
};

export function NudgesPanel({ collapsed = false }: { collapsed?: boolean }) {
  const { user } = useAuth();
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [open, setOpen] = useState(!collapsed);
  const pulsedRef = useRef(false);

  const load = async () => {
    const { data } = await supabase
      .from("nudges")
      .select("id, kind, title, body, priority, related_entity_type, related_entity_id, status, created_at")
      .in("status", ["pending", "seen"])
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8);
    setNudges((data ?? []) as Nudge[]);
  };

  const pulse = async () => {
    if (!user || pulsedRef.current) return;
    pulsedRef.current = true;
    const pos = await getCurrentPosition();
    const geo = pos ?? undefined;

    try {
      await supabase.functions.invoke("ambient-pulse", { body: { geo } });
    } catch { /* ignore */ }
    await load();
  };

  useEffect(() => {
    if (!user) return;
    load();
    pulse();
    const interval = setInterval(() => {
      pulsedRef.current = false;
      pulse();
    }, 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        pulsedRef.current = false;
        pulse();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  const dismiss = async (id: string) => {
    setNudges((n) => n.filter((x) => x.id !== id));
    await supabase.from("nudges").update({ status: "dismissed" }).eq("id", id);
  };

  if (!nudges.length) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-border/60 bg-surface-elevated px-2.5 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
        aria-label="Open nudges"
      >
        <Bell className="h-3 w-3 text-primary" />
        <span>{nudges.length}</span>
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          Ambient
        </div>
        {collapsed && (
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Hide">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {nudges.slice(0, 5).map((n) => (
          <Card key={n.id} className="flex items-start gap-2 p-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="shrink-0 text-[9px]">
                  {KIND_LABEL[n.kind] ?? n.kind}
                </Badge>
                <p className="truncate text-xs font-medium">{n.title}</p>
              </div>
              {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.body}</p>}
              <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => dismiss(n.id)}
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
