// FileAftermathTray — the "what now?" card after a file is saved.
// Doctrine: every captured item must have a visible aftermath. Actions are
// drafts, not silent executions. AI is opt-in.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  FileText, MessageSquare, Sparkles, ListChecks, CalendarClock,
  Link2, BellRing, CheckSquare, Search, Archive, X,
} from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { logFileEvent } from "@/lib/fileAudit";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { useCompanion } from "@/components/companion/CompanionContext";
import {
  fileSuggestedActionSchema,
  isSensitiveByType,
  type FileSuggestedAction,
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
  note_id: string | null;
};

type ActionDef = {
  kind: string;
  label: string;
  icon: typeof MessageSquare;
  ai?: boolean;
};

const DEFAULTS: ActionDef[] = [
  { kind: "ask",                label: "Ask",              icon: MessageSquare, ai: true },
  { kind: "summarize",          label: "Summarize",        icon: Sparkles,      ai: true },
  { kind: "extract_dates",      label: "Extract dates",    icon: CalendarClock, ai: true },
  { kind: "extract_tasks",      label: "Extract tasks",    icon: ListChecks,    ai: true },
  { kind: "create_reminder",    label: "Create reminder",  icon: BellRing },
  { kind: "create_commitment",  label: "Create commitment",icon: CheckSquare },
  { kind: "attach_to_entity",   label: "Link",             icon: Link2 },
  { kind: "send_to_sherlock",   label: "Send to Sherlock", icon: Search,        ai: true },
  { kind: "archive",            label: "Archive",          icon: Archive },
];

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

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("ingested_files")
        .select("id, filename, detected_doc_type, confidence, sensitive, review_status, suggested_actions, note_id")
        .eq("id", ingestedFileId)
        .maybeSingle();
      if (!alive) return;
      setRow((data as FileRow) ?? null);
      if (user) void logFileEvent(user.id, "file.aftermath_opened", ingestedFileId, {});
    })();
    return () => { alive = false; };
  }, [ingestedFileId, user]);

  const suggested = useMemo<FileSuggestedAction[]>(() => {
    if (!row?.suggested_actions || !Array.isArray(row.suggested_actions)) return [];
    const out: FileSuggestedAction[] = [];
    for (const x of row.suggested_actions as unknown[]) {
      const parsed = fileSuggestedActionSchema.safeParse(x);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }, [row?.suggested_actions]);

  const actions = useMemo<ActionDef[]>(() => {
    if (suggested.length > 0) {
      const seen = new Set<string>();
      const fromBackend: ActionDef[] = [];
      for (const s of suggested) {
        if (seen.has(s.kind)) continue;
        seen.add(s.kind);
        const def = DEFAULTS.find((d) => d.kind === s.kind);
        fromBackend.push({
          kind: s.kind,
          label: s.label || def?.label || s.kind,
          icon: def?.icon ?? Sparkles,
          ai: def?.ai,
        });
      }
      // ensure Archive is always offered as a quiet escape hatch
      if (!seen.has("archive")) fromBackend.push(DEFAULTS[DEFAULTS.length - 1]);
      return fromBackend.slice(0, 6);
    }
    return DEFAULTS.slice(0, 5);
  }, [suggested]);

  if (dismissed || !row) return null;

  const sensitive = !!row.sensitive || isSensitiveByType(row.detected_doc_type);
  const needsReview =
    row.review_status === "needs_review" || row.review_status === "new" || !row.review_status;

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
        case "extract_tasks": {
          setPrefill(
            def.kind === "summarize"
              ? `Summarize "${row.filename}" (ingested_file_id: ${row.id}).`
              : def.kind === "extract_dates"
                ? `Extract dates from "${row.filename}" (ingested_file_id: ${row.id}).`
                : `Extract tasks from "${row.filename}" (ingested_file_id: ${row.id}).`,
          );
          void logFileEvent(user.id, def.kind === "summarize" ? "file.summarize_requested" : "file.extract_requested", row.id, {});
          toast.success("Drafted in the composer. Send to run.");
          break;
        }
        case "create_reminder": {
          setPrefill(`Remind me about "${row.filename}" — `);
          void logFileEvent(user.id, "file.reminder_created", row.id, {});
          toast.success("Tell me when, and I'll set it.");
          break;
        }
        case "create_commitment": {
          await supabase.from("commitments").insert({
            user_id: user.id,
            summary: `Follow up on ${row.filename}`,
          });
          void logFileEvent(user.id, "file.commitment_created", row.id, {});
          toast.success(vantaSay.commitmentAdded());
          break;
        }
        case "attach_to_entity": {
          setPrefill(`Link "${row.filename}" to `);
          void logFileEvent(user.id, "file.linked", row.id, {});
          toast.success("Tell me what to link it to.");
          break;
        }
        case "send_to_sherlock": {
          openSherlock({
            entity_type: "file",
            entity_id: row.note_id ?? row.id,
            title: row.filename,
            text: "",
          });
          void logFileEvent(user.id, "file.sent_to_sherlock", row.id, {});
          break;
        }
        case "archive": {
          await supabase
            .from("ingested_files")
            .update({ review_status: "archived" })
            .eq("id", row.id);
          void logFileEvent(user.id, "file.archived", row.id, {});
          toast.success(vantaSay.archived());
          setDismissed(true);
          onDismiss?.();
          break;
        }
        default: {
          toast(`Drafted ${def.label.toLowerCase()}.`);
        }
      }
    } catch (e) {
      toast.fromError(e);
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
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-foreground" title={row.filename}>
              {row.filename}
            </span>
            {row.detected_doc_type && row.detected_doc_type !== "unknown" && (
              <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border/40">
                {row.detected_doc_type.replace(/_/g, " ")}
              </span>
            )}
            {row.confidence && (
              <span className="text-[10px] text-muted-foreground">· {row.confidence}</span>
            )}
            {needsReview && (
              <span className="rounded-full bg-warn/10 px-1.5 py-0.5 text-[10px] text-warn ring-1 ring-warn/30">
                Needs review
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {sensitive
              ? vantaSay.sensitive.fileWarning()
              : "Saved to Memory → Files. Want to do anything with it?"}
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={() => { setDismissed(true); onDismiss(); }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Button
              key={a.kind}
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 px-2.5 text-[11.5px]"
              onClick={() => runAction(a)}
            >
              <Icon className="h-3 w-3" />
              {a.label}
              {a.ai && <span className="text-[9px] text-muted-foreground">AI</span>}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
