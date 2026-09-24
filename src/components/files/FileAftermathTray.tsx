// FileAftermathTray — the "what now?" card after a file is saved.
// Doctrine: every captured item must have a visible aftermath. Actions are
// drafts, not silent executions. AI is opt-in. Sensitive previews stay hidden.
//
// Layout: primary action row (up to 3) + "More" disclosure. Each action is a
// draft path — commitment now opens an inline confirm instead of inserting on
// click. Briefing candidate toggles review_status='suggested' +
// metadata.briefing_candidate. Canvas + link prefill the composer.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  FileText, MessageSquare, Sparkles, ListChecks, CalendarClock,
  Link2, BellRing, CheckSquare, Search, Archive, X, MoreHorizontal,
  Coins, Sun, LayoutGrid, Eye, EyeOff, Check, Users, History, FileSearch,
} from "lucide-react";
import { DocumentDetailSheet } from "@/components/documents/DocumentDetailSheet";
import { treatFileAsDocument, runExtraction, type DocumentKind } from "@/lib/documents";
import { formatDistanceToNow } from "date-fns";
import { AttachToProjectMenu } from "@/components/projects/AttachToProjectMenu";
import { objectIntentFor, kindForObject, nextStepsLine, readSummaryLine } from "@/lib/objectIntent";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { logFileEvent } from "@/lib/fileAudit";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { useCompanion } from "@/components/companion/CompanionContext";
import {
  fileSuggestedActionSchema,
  isSensitiveByType,
  suggestedActionsForType,
  type FileSuggestedAction,
  type FileSuggestedActionKind,
  type DetectedDocType,
} from "@/lib/fileIntake";
import { cn } from "@/lib/utils";

type FileRow = {
  id: string;
  filename: string;
  detected_doc_type: string | null;
  confidence: string | null;
  sensitive: boolean | null;
  review_status: string | null;
  suggested_actions: unknown;
  suggested_summary: string | null;
  extracted_entities: unknown;
  note_id: string | null;
  metadata: Record<string, unknown> | null;
};

type ActionDef = {
  kind: FileSuggestedActionKind | "ask";
  label: string;
  icon: typeof MessageSquare;
  ai?: boolean;
};

const ACTION_META: Record<string, { label: string; icon: typeof MessageSquare; ai?: boolean }> = {
  ask:                { label: "Ask",              icon: MessageSquare, ai: true },
  summarize:          { label: "Summarize",        icon: Sparkles,      ai: true },
  extract_dates:      { label: "Extract dates",    icon: CalendarClock, ai: true },
  extract_people:     { label: "Extract people",   icon: Users,         ai: true },
  extract_payments:   { label: "Extract amounts",  icon: Coins,         ai: true },
  create_reminder:    { label: "Reminder",         icon: BellRing },
  create_commitment:  { label: "Commitment",       icon: CheckSquare },
  create_action:      { label: "Action",           icon: ListChecks },
  attach_to_entity:   { label: "Link",             icon: Link2 },
  attach_to_item:     { label: "Attach",           icon: Link2 },
  add_to_briefing:    { label: "Add to briefing",  icon: Sun },
  send_to_sherlock:   { label: "Sherlock",         icon: Search,        ai: true },
  send_to_canvas:     { label: "Add to canvas",    icon: LayoutGrid },
  mark_reviewed:      { label: "Mark reviewed",    icon: Check },
  archive:            { label: "Archive",          icon: Archive },
  ignore:             { label: "Not now",          icon: X },
};

// ---------- helpers --------------------------------------------------------

function defFor(kind: string): ActionDef {
  const meta = ACTION_META[kind] ?? { label: kind.replace(/_/g, " "), icon: Sparkles };
  return { kind: kind as ActionDef["kind"], label: meta.label, icon: meta.icon, ai: meta.ai };
}

function firstDate(entities: unknown): string | null {
  if (!entities || typeof entities !== "object") return null;
  const dates = (entities as { dates?: unknown }).dates;
  if (Array.isArray(dates) && dates.length > 0 && typeof dates[0] === "string") return dates[0];
  return null;
}

function firstPerson(entities: unknown): string | null {
  if (!entities || typeof entities !== "object") return null;
  const people = (entities as { people?: unknown }).people;
  if (Array.isArray(people) && people.length > 0 && typeof people[0] === "string") return people[0];
  const locations = (entities as { locations?: unknown }).locations;
  if (Array.isArray(locations) && locations.length > 0 && typeof locations[0] === "string") return locations[0];
  return null;
}

function isDocumentLike(row: { filename: string; detected_doc_type: string | null }): boolean {
  const t = (row.detected_doc_type ?? "").toLowerCase();
  if (["contract", "invoice", "waiver", "policy", "other"].includes(t)) return true;
  const f = row.filename.toLowerCase();
  return /\.(pdf|docx?|rtf|txt)$/.test(f);
}

function detectedToDocKind(t: string | null): DocumentKind {
  switch ((t ?? "").toLowerCase()) {
    case "contract": return "other";
    case "invoice": return "invoice";
    case "policy": return "policy";
    default: return "unknown";
  }
}

const ACTIVITY_LABELS: Record<string, string> = {
  "file.staged": "Staged for upload",
  "file.upload_started": "Upload started",
  "file.uploaded": "Uploaded",
  "file.upload_failed": "Upload failed",
  "file.extraction_started": "Reading started",
  "file.extracted": "Read and classified",
  "file.extraction_failed": "Couldn't read it",
  "file.needs_review": "Marked needs review",
  "file.aftermath_opened": "Opened aftermath",
  "file.action_suggested": "Action chosen",
  "file.summarize_requested": "Summary drafted",
  "file.extract_requested": "Extraction drafted",
  "file.linked": "Linked",
  "file.reminder_created": "Reminder created",
  "file.reminder_drafted": "Reminder drafted",
  "file.commitment_created": "Commitment created",
  "file.canvas_drafted": "Canvas draft started",
  "file.briefing_marked": "Added to briefing",
  "file.briefing_removed": "Removed from briefing",
  "file.marked_reviewed": "Marked reviewed",
  "file.ignored": "Set aside",
  "file.sent_to_sherlock": "Sent to Sherlock",
  "file.archived": "Archived",
  "file.restored": "Restored",
  "capture.toast_shown": "Capture toast shown",
  "capture.toast_opened": "Opened from toast",
};

// ---------- component ------------------------------------------------------

export function FileAftermathTray({
  ingestedFileId,
  onDismiss,
  className,
}: {
  ingestedFileId: string;
  onDismiss?: () => void;
  className?: string;
}) {
  const { user } = useAuth();
  const { openSherlock } = useSherlock();
  const { setPrefill } = useCompanion();
  const [row, setRow] = useState<FileRow | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draftCommitment, setDraftCommitment] = useState<string | null>(null);
  const [previewRevealed, setPreviewRevealed] = useState(false);
  const [briefingPending, setBriefingPending] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activity, setActivity] = useState<Array<{ id: string; event: string; created_at: string }> | null>(null);
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  const [creatingDoc, setCreatingDoc] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("ingested_files")
        .select("id, filename, detected_doc_type, confidence, sensitive, review_status, suggested_actions, suggested_summary, extracted_entities, note_id, metadata")
        .eq("id", ingestedFileId)
        .maybeSingle();
      if (!alive) return;
      setRow((data as FileRow) ?? null);
      if (user) void logFileEvent(user.id, "file.aftermath_opened", ingestedFileId, {});
    })();
    return () => { alive = false; };
  }, [ingestedFileId, user]);

  const loadActivity = async () => {
    const { data } = await supabase
      .from("audit_log")
      .select("id, event, created_at")
      .eq("entity_type", "file")
      .eq("entity_id", ingestedFileId)
      .order("created_at", { ascending: false })
      .limit(20);
    setActivity((data as any) ?? []);
  };
  const toggleActivity = () => {
    const next = !activityOpen;
    setActivityOpen(next);
    if (next && activity === null) void loadActivity();
  };

  const sensitive = !!row?.sensitive || isSensitiveByType(row?.detected_doc_type ?? null);
  const isBriefingCandidate = !!(row?.metadata as any)?.briefing_candidate;

  // Build the deduped action list: classifier suggestions first, then per-type
  // defaults to fill in. Sensitive files get the trimmed-down default set.
  const actions = useMemo<ActionDef[]>(() => {
    if (!row) return [];
    const fromBackend: FileSuggestedAction[] = [];
    if (Array.isArray(row.suggested_actions)) {
      for (const x of row.suggested_actions as unknown[]) {
        const parsed = fileSuggestedActionSchema.safeParse(x);
        if (parsed.success) fromBackend.push(parsed.data);
      }
    }
    const seen = new Set<string>();
    const out: ActionDef[] = [];
    for (const s of fromBackend) {
      if (seen.has(s.kind)) continue;
      seen.add(s.kind);
      out.push({ ...defFor(s.kind), label: s.label || defFor(s.kind).label });
    }
    const fillers = suggestedActionsForType(
      (row.detected_doc_type ?? "unknown") as DetectedDocType,
      { sensitive },
    );
    for (const k of fillers) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(defFor(k));
    }
    // Always offer ask + archive as escape hatches.
    if (!seen.has("ask")) out.push(defFor("ask"));
    if (!seen.has("archive")) out.push(defFor("archive"));
    return out;
  }, [row, sensitive]);

  if (dismissed || !row) return null;

  const needsReview =
    row.review_status === "needs_review" || row.review_status === "new" || !row.review_status;

  const primary = actions.slice(0, 3);
  const more = actions.slice(3);

  const runAction = async (def: ActionDef) => {
    if (!user) return;
    void logFileEvent(user.id, "file.action_suggested", row.id, { kind: def.kind });
    try {
      switch (def.kind) {
        case "ask": {
          setPrefill(`About "${row.filename}" — `);
          toast.success("Prefilled the composer. Ask away.");
          break;
        }
        case "summarize":
        case "extract_dates":
        case "extract_people":
        case "extract_payments": {
          const verb =
            def.kind === "summarize" ? "Summarize" :
            def.kind === "extract_dates" ? "Extract dates from" :
            def.kind === "extract_people" ? "Extract people from" :
            "Extract amounts from";
          setPrefill(`${verb} "${row.filename}".`);
          void logFileEvent(
            user.id,
            def.kind === "summarize" ? "file.summarize_requested" : "file.extract_requested",
            row.id,
            { kind: def.kind },
          );
          toast.success("Drafted in the composer. Send to run.");
          break;
        }
        case "create_reminder": {
          const date = firstDate(row.extracted_entities);
          const seed = date
            ? `Remind me about "${row.filename}" on ${date} — `
            : `Remind me about "${row.filename}" — `;
          setPrefill(seed);
          void logFileEvent(user.id, "file.reminder_drafted", row.id, { had_date: !!date });
          toast.success(date ? "Reminder draft seeded with the date. Confirm." : vantaSay.file.reminderDrafted());
          break;
        }
        case "create_commitment": {
          // Open inline draft — DO NOT insert until user approves.
          setDraftCommitment(`Follow up on ${row.filename}`);
          break;
        }
        case "create_action": {
          setPrefill(`Draft an action for "${row.filename}" — `);
          toast.success("Drafted. Approve in Actions.");
          break;
        }
        case "attach_to_entity":
        case "attach_to_item": {
          const who = firstPerson(row.extracted_entities);
          setPrefill(who ? `Link "${row.filename}" to ${who}` : `Link "${row.filename}" to `);
          void logFileEvent(user.id, "file.linked", row.id, { seeded_with: who });
          toast.success("Tell me what to link it to.");
          break;
        }
        case "send_to_sherlock": {
          if (sensitive) {
            toast({ title: "Sensitive file", description: "Confirm again — Sherlock will read this." });
          }
          openSherlock({
            entity_type: "file",
            entity_id: row.note_id ?? row.id,
            title: row.filename,
            text: "",
          });
          void logFileEvent(user.id, "file.sent_to_sherlock", row.id, {});
          break;
        }
        case "send_to_canvas": {
          setPrefill(`Add "${row.filename}" to canvas — `);
          void logFileEvent(user.id, "file.canvas_drafted", row.id, {});
          toast.success("Tell me which canvas and I'll add it.");
          break;
        }
        case "add_to_briefing": {
          setBriefingPending(true);
          const nextMeta = { ...(row.metadata ?? {}), briefing_candidate: !isBriefingCandidate };
          const nextReview = !isBriefingCandidate ? "suggested" : row.review_status ?? "needs_review";
          const { error } = await supabase
            .from("ingested_files")
            .update({ metadata: nextMeta, review_status: nextReview } as any)
            .eq("id", row.id);
          setBriefingPending(false);
          if (error) throw error;
          setRow({ ...row, metadata: nextMeta, review_status: nextReview });
          void logFileEvent(
            user.id,
            isBriefingCandidate ? "file.briefing_removed" : "file.briefing_marked",
            row.id,
            {},
          );
          toast.success(isBriefingCandidate ? "Off the briefing." : "On the next briefing.");
          break;
        }
        case "mark_reviewed": {
          await supabase.from("ingested_files").update({ review_status: "attached" } as any).eq("id", row.id);
          setRow({ ...row, review_status: "attached" });
          void logFileEvent(user.id, "file.marked_reviewed", row.id, {});
          toast.success(vantaSay.file.reviewed());
          break;
        }
        case "archive": {
          await supabase.from("ingested_files").update({ review_status: "archived" } as any).eq("id", row.id);
          void logFileEvent(user.id, "file.archived", row.id, {});
          toast.success(vantaSay.archived());
          setDismissed(true);
          onDismiss?.();
          break;
        }
        case "ignore": {
          await supabase.from("ingested_files").update({ review_status: "ignored" } as any).eq("id", row.id);
          void logFileEvent(user.id, "file.ignored", row.id, {});
          toast.success("Set aside.");
          setDismissed(true);
          onDismiss?.();
          break;
        }
        default: {
          toast(`Drafted ${def.label.toLowerCase()}.`);
        }
      }
    } catch (e) {
      toast.fromError?.(e);
    }
  };

  const approveCommitment = async () => {
    if (!user || !draftCommitment) return;
    const summary = draftCommitment.trim();
    if (!summary) return;
    try {
      await supabase.from("commitments").insert({
        user_id: user.id,
        summary,
        metadata: { source_file_id: row.id, source_filename: row.filename },
      } as any);
      void logFileEvent(user.id, "file.commitment_created", row.id, { summary });
      toast.success(vantaSay.commitmentAdded());
      setDraftCommitment(null);
    } catch (e) {
      toast.fromError?.(e);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-primary/25 bg-primary/5 p-3 ring-1 ring-primary/20",
        className,
      )}
      aria-label="File aftermath"
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-foreground" title={row.filename}>
              {row.filename}
            </span>
            {/* One shared voice line for what this probably is — the same words
                Ask and Telegram use, instead of a raw detected-type code. */}
            <span className="text-[11px] text-muted-foreground">
              {objectIntentFor({ filename: row.filename, detectedDocType: row.detected_doc_type, confidence: row.confidence }).line}
            </span>
            {row.confidence && (
              <span className="text-[10px] text-muted-foreground">· {row.confidence}</span>
            )}
            {sensitive && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300 ring-1 ring-amber-500/40">
                Sensitive
              </span>
            )}
            {needsReview && !sensitive && (
              <span className="rounded-full bg-warn/10 px-1.5 py-0.5 text-[10px] text-warn ring-1 ring-warn/30">
                Needs review
              </span>
            )}
            {isBriefingCandidate && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary ring-1 ring-primary/30">
                <Sun className="h-2.5 w-2.5" /> Briefing
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {sensitive
              ? "Hidden by default. Tap to open."
              : "Saved to Memory → Files. What's next?"}
          </div>
          {sensitive && (
            <button
              type="button"
              onClick={() => setPreviewRevealed((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-amber-300 hover:underline"
            >
              {previewRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {previewRevealed ? "Hide preview" : "Reveal preview"}
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={() => { setDismissed(true); onDismiss(); }}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            aria-label="Hide"
            title="Hide"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* What came off it, then where it can go, then what can happen next —
          the same introduction Telegram gives a document. Nothing runs here. */}
      {!sensitive && (
        <div className="mt-2 rounded-xl border border-border/50 bg-background/50 p-2 ring-1 ring-border/30">
          <p className="text-[11.5px] leading-relaxed text-foreground/85">
            {readSummaryLine(row.suggested_summary, 320)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <AttachToProjectMenu itemType="file" itemId={row.id} itemLabel={row.filename} variant="chip" />
          </div>
          <p className="mt-1.5 text-[10.5px] text-muted-foreground">
            {nextStepsLine(kindForObject({ filename: row.filename, detectedDocType: row.detected_doc_type }))}
          </p>
        </div>
      )}

      {/* Inline commitment draft */}
      {draftCommitment !== null && (
        <div className="mt-2 rounded-xl border border-border/60 bg-background/60 p-2 ring-1 ring-border/40">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Commitment draft</div>
          <input
            type="text"
            value={draftCommitment}
            onChange={(e) => setDraftCommitment(e.target.value)}
            className="mt-1 w-full rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px] text-foreground focus:border-primary/40 focus:outline-none"
            placeholder="What needs following up?"
            autoFocus
          />
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setDraftCommitment(null)}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 px-2.5 text-[11px]" onClick={approveCommitment} disabled={!draftCommitment.trim()}>
              <Check className="mr-1 h-3 w-3" /> Approve
            </Button>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">Nothing's been saved yet. Approve to track it.</div>
        </div>
      )}

      {/* Treat as document — opens a dedicated Documents review surface */}
      {!sensitive && isDocumentLike(row) && (
        <div className="mt-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 px-2.5 text-[11.5px]"
            disabled={creatingDoc}
            onClick={async () => {
              if (!user || creatingDoc) return;
              setCreatingDoc(true);
              try {
                const doc = await treatFileAsDocument({
                  userId: user.id,
                  fileId: row.id,
                  filename: row.filename,
                  kind: detectedToDocKind(row.detected_doc_type),
                });
                /* The words were already pulled when the file arrived, so the
                   read is a copy, not an AI call. Land on a document that is
                   ready for review instead of one more button. */
                const read = await runExtraction(doc.id).catch(() => ({ ok: false }));
                setOpenDocumentId(doc.id);
                toast.success(read.ok ? "Read and ready for review." : "Opened in Documents. Tap Read to try again.");
              } catch (e) {
                toast.fromError?.(e);
              } finally {
                setCreatingDoc(false);
              }
            }}
          >
            <FileSearch className="h-3 w-3" /> Treat as document
          </Button>
          <DocumentDetailSheet
            documentId={openDocumentId}
            open={!!openDocumentId}
            onOpenChange={(o) => !o && setOpenDocumentId(null)}
          />
        </div>
      )}

      {/* Primary actions */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {primary.map((a) => {
          const Icon = a.icon;
          const isActive = a.kind === "add_to_briefing" && isBriefingCandidate;
          return (
            <Button
              key={a.kind}
              size="sm"
              variant={isActive ? "default" : "outline"}
              className="h-8 gap-1.5 px-2.5 text-[11.5px]"
              onClick={() => runAction(a)}
              disabled={a.kind === "add_to_briefing" && briefingPending}
            >
              <Icon className="h-3 w-3" />
              {a.label}
              {a.ai && <span className="ml-0.5 rounded bg-muted/40 px-1 text-[9px] text-muted-foreground">AI</span>}
            </Button>
          );
        })}
        {more.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-[11.5px] text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <MoreHorizontal className="h-3 w-3" />
            {expanded ? "Less" : `More (${more.length})`}
          </Button>
        )}
      </div>

      {/* Secondary actions */}
      {expanded && more.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 border-t border-border/40 pt-2">
          {more.map((a) => {
            const Icon = a.icon;
            return (
              <Button
                key={a.kind}
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => runAction(a)}
              >
                <Icon className="h-3 w-3" />
                {a.label}
                {a.ai && <span className="ml-0.5 rounded bg-muted/40 px-1 text-[9px]">AI</span>}
              </Button>
            );
          })}
        </div>
      )}

      {/* Activity disclosure (Phase 7) */}
      <div className="mt-2 border-t border-border/40 pt-1.5">
        <button
          type="button"
          onClick={toggleActivity}
          className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
          aria-expanded={activityOpen}
        >
          <History className="h-3 w-3" />
          {activityOpen ? "Hide activity" : "Activity"}
        </button>
        {activityOpen && (
          <ul className="mt-1.5 space-y-0.5">
            {activity === null && (
              <li className="text-[10.5px] text-muted-foreground">Loading…</li>
            )}
            {activity && activity.length === 0 && (
              <li className="text-[10.5px] text-muted-foreground">No activity yet.</li>
            )}
            {activity?.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-2 text-[10.5px]">
                <span className="truncate text-foreground/80">
                  {ACTIVITY_LABELS[e.event] ?? e.event.replace(/^file\./, "").replace(/_/g, " ")}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
