import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Inbox, RefreshCw, Clock, CheckCircle2, Link2, X, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { generateEmbedding } from "@/lib/embeddings";
import { linkEntities } from "@/lib/entityGraph";
import { resolveEntities } from "@/lib/entityResolve";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { SherlockChipTrigger } from "@/components/sherlock/SherlockChipTrigger";
import { EmbeddedSherlockFindings } from "@/components/sherlock/EmbeddedSherlockFindings";
import { CaptureCard, type CaptureAction, type CaptureSource } from "./CaptureCard";
import { useIntakeFeed, type IntakeRow } from "./useIntakeFeed";
import { LinkChips, readLinks } from "@/components/links/LinkChips";
import { EntityChips } from "@/components/entities/EntityChips";
import { RecognizePanel, type RouteLane } from "./RecognizePanel";
import { FileAftermathTray } from "@/components/files/FileAftermathTray";
import { logFileEvent } from "@/lib/fileAudit";
import { AftermathFooter, type NextMove } from "@/components/aftermath/AftermathFooter";
import { ConnectButton } from "@/components/links/ConnectButton";
import { LinkedChipsBar } from "@/components/links/LinkedChipsBar";
import { BulkConnectSheet } from "@/components/links/BulkConnectSheet";
import type { CrossKind } from "@/lib/crossLinks";

type InboxLane = "now" | "snoozed" | "done";

const FILTERS: { id: "all" | CaptureSource | "review"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "review", label: "Needs review" },
  { id: "telegram", label: "Telegram" },
  { id: "companion", label: "Companion" },
  { id: "file", label: "Files" },
  { id: "field_note", label: "Field notes" },
];

async function logRoute(userId: string, item: IntakeRow, destination: string, extra: Record<string, any> = {}) {
  // Doctrine: every route writes an audit event + a capture_routes row so the
  // inbox always has receipts. Best-effort — never throw inside a toast path.
  const captureKind = item._raw.kind;
  const captureId = item._raw.row.id;
  const userAction = extra.user_action ?? (
    destination === "ignored" ? "ignored"
    : destination === "snoozed" ? "snoozed"
    : destination === "unsnoozed" ? "unsnoozed"
    : destination === "undo_ignore" ? "undo"
    : "routed"
  );
  const { data: audit } = await supabase.from("audit_log").insert({
    user_id: userId,
    entity_type: "capture",
    entity_id: null,
    event: "capture.routed",
    payload: { capture_id: captureId, source: item.source, destination, ...extra },
  }).select("id").single();
  await supabase.from("capture_routes").insert({
    user_id: userId,
    capture_kind: captureKind,
    capture_id: captureId,
    source: item.source,
    suggested_route: extra.via ? destination : null,
    user_action: userAction,
    previous_status: item.routedTo ?? null,
    new_status: destination,
    audit_event_id: audit?.id ?? null,
    payload: extra as any,
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
  const [lane, setLane] = useState<InboxLane>("now");
  const [aftermathFileId, setAftermathFileId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = items;
    if (ambiguousOnly) {
      // Inbox V2 state machine — Now / Snoozed / Done
      if (lane === "snoozed") {
        list = list.filter((i) => i.isSnoozed);
      } else if (lane === "done") {
        list = list.filter((i) => i.isDone && !i.isSnoozed);
      } else {
        // "now" = needs review, not snoozed, not done
        list = list.filter((i) => i.needsReview && !i.isSnoozed && !i.isDone);
      }
    } else {
      // All-captures view filters
      if (filter === "review") list = list.filter((i) => i.needsReview);
      else if (filter !== "all") list = list.filter((i) => i.source === filter);
    }
    return list;
  }, [items, filter, ambiguousOnly, lane]);

  const routeToNote = async (item: IntakeRow) => {
    if (!user) return;
    const { data } = await supabase.from("notes").insert({
      user_id: user.id,
      title: item.text.slice(0, 80),
      body: item.text,
      tags: [`source:${item.source}`, "type:note"],
    }).select("id").single();
    if (data) generateEmbedding("note", data.id);
    if (data?.id) {
      linkEntities({ userId: user.id, source_kind: "note", source_id: data.id, text: item.text });
      resolveEntities({ source_kind: "note", source_id: data.id, text: item.text });
    }
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
    if (data?.id) {
      linkEntities({ userId: user.id, source_kind: "commitment", source_id: data.id, text: item.text });
      resolveEntities({ source_kind: "commitment", source_id: data.id, text: item.text });
    }
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
    if (data?.id) {
      linkEntities({ userId: user.id, source_kind: "commitment", source_id: data.id, text: item.text });
      resolveEntities({ source_kind: "commitment", source_id: data.id, text: item.text });
    }
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

  const undoIgnore = async (item: IntakeRow) => {
    if (!user || item._raw.kind !== "message") return;
    const row = item._raw.row;
    const prevMeta = row.metadata ?? {};
    await supabase.from("messages").update({
      metadata: { ...prevMeta, routed_to: null, needs_review: true },
    }).eq("id", row.id);
    await logRoute(user.id, item, "undo_ignore");
    toast.message({ title: "Back on the desk" });
    refresh();
  };

  const snooze = async (item: IntakeRow, hours: number) => {
    if (!user || item._raw.kind !== "message") return;
    const row = item._raw.row;
    const prevMeta = row.metadata ?? {};
    const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    await supabase.from("messages").update({
      metadata: { ...prevMeta, snoozed_until: until, needs_review: true },
    }).eq("id", row.id);
    await logRoute(user.id, item, "snoozed", { until, hours });
    toast.message({ title: vantaSay.inbox.snoozedUntil(new Date(until).toLocaleString()) });
    refresh();
  };

  const unsnooze = async (item: IntakeRow) => {
    if (!user || item._raw.kind !== "message") return;
    const row = item._raw.row;
    const prevMeta = row.metadata ?? {};
    await supabase.from("messages").update({
      metadata: { ...prevMeta, snoozed_until: null },
    }).eq("id", row.id);
    await logRoute(user.id, item, "unsnoozed");
    toast.message({ title: vantaSay.inbox.unsnoozed() });
    refresh();
  };

  // File-row actions: open the full aftermath tray, or run quick triage
  // (mark reviewed / archive / ignore / Sherlock). All routes flip
  // ingested_files.review_status — the source of truth the Inbox reads off.
  const setFileReview = async (item: IntakeRow, next: "attached" | "archived" | "ignored", event: Parameters<typeof logFileEvent>[1]) => {
    if (!user || item._raw.kind !== "file") return;
    const row = item._raw.row;
    await supabase.from("ingested_files").update({ review_status: next } as any).eq("id", row.id);
    void logFileEvent(user.id, event, row.id, { from: row.review_status ?? null });
    await logRoute(user.id, item, next === "attached" ? "memory" : next);
    refresh();
  };

  const sendFileToSherlock = async (item: IntakeRow) => {
    if (item._raw.kind !== "file") return;
    const row = item._raw.row;
    openSherlock({
      entity_type: "file",
      entity_id: row.note_id ?? row.id,
      title: row.filename,
      text: "",
    });
    if (user) {
      void logFileEvent(user.id, "file.sent_to_sherlock", row.id, {});
      await logRoute(user.id, item, "sherlock");
    }
  };

  const actionsFor = (item: IntakeRow): CaptureAction[] => {
    if (item._raw.kind === "file") {
      const row = item._raw.row;
      const status = row.review_status as string | null;
      if (status === "archived" || status === "ignored") {
        return [
          { label: "Bring back", onClick: () => setFileReview(item, "attached", "file.restored") },
          { label: "Open aftermath", onClick: () => setAftermathFileId(row.id) },
        ];
      }
      if (status === "attached") {
        return [
          { label: "Open aftermath", onClick: () => setAftermathFileId(row.id) },
          { label: "Send to Sherlock", onClick: () => sendFileToSherlock(item) },
          { label: "Archive", onClick: () => setFileReview(item, "archived", "file.archived") },
        ];
      }
      // needs_review / suggested / waiting / new — full triage menu
      return [
        { label: "Open aftermath", onClick: () => setAftermathFileId(row.id), primary: true },
        { label: "Mark reviewed", onClick: () => setFileReview(item, "attached", "file.marked_reviewed") },
        { label: "Send to Sherlock", onClick: () => sendFileToSherlock(item) },
        { label: "Archive", onClick: () => setFileReview(item, "archived", "file.archived") },
        { label: "Ignore", onClick: () => setFileReview(item, "ignored", "file.ignored") },
      ];
    }
    if (item._raw.kind !== "message") {
      return [
        { label: "Send to Sherlock", onClick: () => sendToSherlock(item) },
      ];
    }
    if (item.isSnoozed) {
      return [{ label: "Bring back now", onClick: () => unsnooze(item), primary: true }];
    }
    if (item.routedTo === "ignored") {
      return [{ label: "Undo", onClick: () => undoIgnore(item) }];
    }
    if (item.routedTo) return []; // already routed — read-only chip
    return [
      { label: "Track as commitment", onClick: () => routeToCommitment(item), primary: true },
      { label: "Save as note", onClick: () => routeToNote(item) },
      { label: "Reminder", onClick: () => routeToReminder(item) },
      { label: "Snooze 1h", onClick: () => snooze(item, 1) },
      { label: "Snooze tomorrow", onClick: () => snooze(item, 24) },
      { label: "Send to Sherlock", onClick: () => sendToSherlock(item) },
      { label: "Ignore", onClick: () => ignore(item) },
    ];
  };

  const snoozedCount = useMemo(() => items.filter((i) => i.isSnoozed).length, [items]);
  const nowCount = useMemo(
    () => items.filter((i) => i.needsReview && !i.isSnoozed && !i.isDone).length,
    [items],
  );
  const doneCount = useMemo(
    () => items.filter((i) => i.isDone && !i.isSnoozed).length,
    [items],
  );

  const LANES: { id: InboxLane; label: string; Icon: typeof Inbox; count: number }[] = [
    { id: "now", label: vantaSay.inbox.tabNow(), Icon: Inbox, count: nowCount },
    { id: "snoozed", label: vantaSay.inbox.tabSnoozed(), Icon: Clock, count: snoozedCount },
    { id: "done", label: vantaSay.inbox.tabDone(), Icon: CheckCircle2, count: doneCount },
  ];

  const emptyCopy =
    ambiguousOnly
      ? lane === "snoozed"
        ? vantaSay.inbox.emptySnoozed()
        : lane === "done"
          ? vantaSay.inbox.emptyDone()
          : vantaSay.inbox.emptyNow()
      : "Nothing captured yet.";

  return (
    <div className="space-y-3">
      {ambiguousOnly && (
        <div className="-mx-1 flex snap-x snap-mandatory items-center gap-1.5 overflow-x-auto px-1">
          {LANES.map((l) => {
            const Icon = l.Icon;
            const active = lane === l.id;
            return (
              <button
                key={l.id}
                onClick={() => setLane(l.id)}
                className={cn(
                  "inline-flex shrink-0 snap-start items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  active
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={active}
              >
                <Icon className="h-3 w-3" />
                {l.label}
                <span className="opacity-70">· {l.count}</span>
              </button>
            );
          })}
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

      {/* Bulk-select toolbar — available in both lanes. Lets the user
          connect many captures to one place in a single tap. */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <button
          type="button"
          onClick={() => { setSelectMode((s) => !s); setSelectedIds(new Set()); }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors",
            selectMode
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
          )}
        >
          <CheckSquare className="h-3 w-3" />
          {selectMode ? "Done selecting" : "Select multiple"}
        </button>
        {selectMode && selectedIds.size > 0 && (
          <span className="text-muted-foreground">{selectedIds.size} picked</span>
        )}
      </div>

      {loading && (
        <div className="rounded-md border border-dashed border-border/60 py-6 text-center text-[12px] text-muted-foreground">
          Looking at the front desk…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border/60 py-10 text-center text-[12px] text-muted-foreground">
          <Inbox className="h-5 w-5 opacity-50" />
          {emptyCopy}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((item) => {
          // Doctrine: linking is consistent across surfaces. Mount LinkChips on
          // message-row captures (the row we can persist `metadata.links` against).
          const isMessage = item._raw.kind === "message";
          const meta = isMessage ? (item._raw.row.metadata ?? {}) : {};
          const rawKind = item._raw.kind;
          const sourceKind = rawKind === "message" ? "message" as const
            : rawKind === "field_note" ? "field_note" as const
            : rawKind === "file" ? "ingested_file" as const
            : null;
          const acceptSuggestion = async (lane: RouteLane) => {
            // Sherlock drafts. The user accepts. Real routing still flows
            // through the same handlers as the manual lane buttons.
            if (lane === "memory") return routeToNote(item);
            if (lane === "commitment") return routeToCommitment(item);
            if (lane === "reminder") return routeToReminder(item);
            if (lane === "sherlock") return sendToSherlock(item);
            if (lane === "ignore") return ignore(item);
            if (lane === "action") {
              if (!user) return;
              await supabase.from("actions").insert({
                user_id: user.id,
                title: item.text.slice(0, 80),
                description: item.text,
                risk: "standard",
                status: "staged",
                source: "sherlock_suggest",
              });
              await stampMessageRoute(item, "actions");
              await logRoute(user.id, item, "actions", { via: "sherlock_suggest" });
              toast.success({ title: "Staged as action — review before run" });
              refresh();
            }
          };
          const showRecognize =
            isMessage && !item.routedTo && item.text && item.text.length > 4;
          const nextMove: NextMove | null = (() => {
            if (item._raw.kind === "file" && item.needsReview) {
              return {
                label: "Open file aftermath",
                onClick: () => setAftermathFileId(item._raw.row.id),
                hint: "Pick what this file becomes — nothing is filed yet.",
              };
            }
            if (item.needsReview) {
              return {
                label: "Pick a lane",
                onClick: () => {
                  // Scrolls the inline RecognizePanel into view; no execution.
                  document.getElementById(`capture-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                },
                hint: item.why ?? "Tell Vanta what this is so it stops asking.",
              };
            }
            if (item.routedTo) {
              return {
                label: `Open in ${item.routedTo}`,
                onClick: () => {
                  // No-op nav: stays on Memory. Audit keeps the receipt.
                  toast.info?.({ title: `Routed to ${item.routedTo}`, description: item.why ?? "Filed away." });
                },
                hint: `Already ${item.routedTo.toLowerCase()}.`,
              };
            }
            return null;
          })();
          const footer = (
            <div id={`capture-${item.id}`} className="space-y-1.5">
              {isMessage && !item.routedTo && (
                <SherlockChipTrigger
                  operation="suggest"
                  entityType="message"
                  entityId={item._raw.row.id}
                  text={item.text}
                  title={item.text.slice(0, 80)}
                  showWhenEmpty={false}
                />
              )}
              {isMessage && (
                <EmbeddedSherlockFindings sourceType="message" sourceId={item._raw.row.id} />
              )}
              {showRecognize && (
                <RecognizePanel
                  text={item.text}
                  entityType="message"
                  entityId={item._raw.row.id}
                  onAccept={acceptSuggestion}
                />
              )}
              {sourceKind && <EntityChips sourceKind={sourceKind} sourceId={item._raw.row.id} />}
              {isMessage && (
                <LinkChips
                  entityKind="message"
                  entityId={item._raw.row.id}
                  links={readLinks(meta)}
                  onChange={refresh}
                  compact
                />
              )}
              {(() => {
                const crossKind: CrossKind | null =
                  item._raw.kind === "message" ? "capture"
                  : item._raw.kind === "file" ? "file"
                  : null;
                if (!crossKind) return null;
                return (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ConnectButton source={{ kind: crossKind, id: item._raw.row.id, label: item.text.slice(0, 60) }} />
                    <LinkedChipsBar source={{ kind: crossKind, id: item._raw.row.id }} />
                  </div>
                );
              })()}
              {nextMove && (
                <AftermathFooter
                  next={nextMove}
                  whatHappensIfTap="Opens — nothing runs."
                />
              )}
            </div>
          );
          return (
            <CaptureCard key={item.id} item={item} actions={actionsFor(item)} footer={footer} />
          );
        })}
      </div>

      <Dialog open={!!aftermathFileId} onOpenChange={(o) => !o && setAftermathFileId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[13px]">What's next for this file?</DialogTitle>
          </DialogHeader>
          {aftermathFileId && (
            <FileAftermathTray
              ingestedFileId={aftermathFileId}
              onDismiss={() => { setAftermathFileId(null); refresh(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
