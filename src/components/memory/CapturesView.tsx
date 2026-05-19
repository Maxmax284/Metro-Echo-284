import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { generateEmbedding } from "@/lib/embeddings";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { CaptureCard, type CaptureAction, type CaptureSource } from "./CaptureCard";
import { useIntakeFeed, type IntakeRow } from "./useIntakeFeed";

const FILTERS: { id: "all" | CaptureSource | "review"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "review", label: "Needs review" },
  { id: "telegram", label: "Telegram" },
  { id: "companion", label: "Companion" },
  { id: "file", label: "Files" },
  { id: "field_note", label: "Field notes" },
];

async function logRoute(userId: string, item: IntakeRow, destination: string, extra: Record<string, any> = {}) {
  await supabase.from("audit_log").insert({
    user_id: userId,
    entity_type: "capture",
    entity_id: null,
    event: "capture.routed",
    payload: { capture_id: item.id, source: item.source, destination, ...extra },
  });
}

async function stampMessageRoute(item: IntakeRow, destination: string) {
  if (item._raw.kind !== "message") return;
  const row = item._raw.row;
  const prevMeta = row.metadata ?? {};
  await supabase.from("messages").update({
    metadata: { ...prevMeta, routed_to: destination, needs_review: false, detected_type: prevMeta.detected_type ?? destination },
  }).eq("id", row.id);
}

export function CapturesView({ ambiguousOnly = false }: { ambiguousOnly?: boolean }) {
  const { user } = useAuth();
  const { openSherlock } = useSherlock();
  const { items, loading, refresh } = useIntakeFeed(60);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>(ambiguousOnly ? "review" : "all");

  const filtered = useMemo(() => {
    let list = items;
    if (ambiguousOnly) list = list.filter((i) => i.needsReview);
    if (filter === "review") list = list.filter((i) => i.needsReview);
    else if (filter !== "all") list = list.filter((i) => i.source === filter);
    return list;
  }, [items, filter, ambiguousOnly]);

  const routeToNote = async (item: IntakeRow) => {
    if (!user) return;
    const { data } = await supabase.from("notes").insert({
      user_id: user.id,
      title: item.text.slice(0, 80),
      body: item.text,
      tags: [`source:${item.source}`],
    }).select("id").single();
    if (data) generateEmbedding("note", data.id);
    await stampMessageRoute(item, "memory");
    await logRoute(user.id, item, "memory", { note_id: data?.id });
    toast.success({ title: "Saved to Memory" });
    refresh();
  };

  const routeToCommitment = async (item: IntakeRow) => {
    if (!user) return;
    const { data } = await supabase.from("commitments").insert({
      user_id: user.id,
      summary: item.text.slice(0, 200),
    }).select("id").single();
    if (data) generateEmbedding("commitment", data.id);
    await stampMessageRoute(item, "commitments");
    await logRoute(user.id, item, "commitments", { commitment_id: data?.id });
    toast.success({ title: "Tracking as a commitment" });
    refresh();
  };

  const routeToReminder = async (item: IntakeRow) => {
    if (!user) return;
    const due = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const { data } = await supabase.from("commitments").insert({
      user_id: user.id,
      summary: item.text.slice(0, 200),
      due_at: due,
      remind_at: due,
      priority: "low",
    }).select("id").single();
    if (data) generateEmbedding("commitment", data.id);
    await stampMessageRoute(item, "reminders");
    await logRoute(user.id, item, "reminders", { commitment_id: data?.id });
    toast.success({ title: "Reminder set" });
    refresh();
  };

  const sendToSherlock = async (item: IntakeRow) => {
    openSherlock({
      entity_type: "freeform",
      title: item.text.slice(0, 80),
      text: item.text,
    });
    if (user) {
      await stampMessageRoute(item, "sherlock");
      await logRoute(user.id, item, "sherlock");
    }
  };

  const ignore = async (item: IntakeRow) => {
    if (!user) return;
    await stampMessageRoute(item, "ignored");
    await logRoute(user.id, item, "ignored");
    toast.message({ title: "Filed away" });
    refresh();
  };

  const actionsFor = (item: IntakeRow): CaptureAction[] => {
    if (item._raw.kind !== "message") {
      // files / field notes already have homes — offer Sherlock as the main lever
      return [
        { label: "Send to Sherlock", onClick: () => sendToSherlock(item) },
      ];
    }
    if (item.routedTo && item.routedTo !== "ignored") return []; // already handled
    return [
      { label: "Track as commitment", onClick: () => routeToCommitment(item), primary: true },
      { label: "Save as note", onClick: () => routeToNote(item) },
      { label: "Reminder", onClick: () => routeToReminder(item) },
      { label: "Send to Sherlock", onClick: () => sendToSherlock(item) },
      { label: "Ignore", onClick: () => ignore(item) },
    ];
  };

  return (
    <div className="space-y-3">
      {!ambiguousOnly && (
        <div className="-mx-1 flex snap-x snap-mandatory items-center gap-1.5 overflow-x-auto px-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 snap-start rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                filter === f.id
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={refresh}
            className="ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {loading && (
        <div className="rounded-md border border-dashed border-border/60 py-6 text-center text-[12px] text-muted-foreground">
          Looking at the front desk…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border/60 py-10 text-center text-[12px] text-muted-foreground">
          <Inbox className="h-5 w-5 opacity-50" />
          {ambiguousOnly ? "Nothing waiting on you. Clean desk." : "Nothing captured yet."}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((item) => (
          <CaptureCard key={item.id} item={item} actions={actionsFor(item)} />
        ))}
      </div>
    </div>
  );
}
