// ExecuteConfirmDialog — the last gate before something actually runs.
//
// Approving is a decision; executing is the moment the world changes. This is
// the one dialog both execute paths use (Actions surface and the inline
// approval card inside an Echo answer) so the confirmation story is identical
// wherever you tap Execute.
//
// Low-risk reversible actions confirm with one tap. Standard and high risk
// require typing "run", matching the existing approve gate.
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Boxes, FileCode2, History, Loader2, Play, Receipt, RotateCcw, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_COMMIT } from "@/lib/motion";
import { ConsequencePreview } from "@/components/ui/consequence-preview";
import { actionConsequence, moveBookingConsequence, sendReplyConsequence } from "@/lib/consequence";

export type ExecutableAction = {
  id: string;
  title: string;
  description?: string | null;
  risk: "low_reversible" | "standard" | "high";
  payload?: Record<string, unknown> | null;
  source?: string | null;
  affected_entities?: unknown[] | null;
  rollback_available?: boolean | null;
};

export type ExecuteExecutor = { id: string; name: string; kind: string };

const RiskIcon = { low_reversible: ShieldCheck, standard: Shield, high: ShieldAlert } as const;
const riskColor = {
  low_reversible: "text-signal",
  standard: "text-primary",
  high: "text-warn",
} as const;
const riskLabel = {
  low_reversible: "Low risk · reversible",
  standard: "Standard risk",
  high: "High risk",
} as const;

const CONFIRM_WORD = "run";

/** Reads the staged action and picks the closest plain-English preview. */
function consequenceForAction(action: ExecutableAction, executorLabel: string | null) {
  const p = (action.payload ?? {}) as Record<string, any>;
  const kind = String(p.kind ?? p.type ?? "").toLowerCase();
  const title = `${action.title} ${action.description ?? ""}`.toLowerCase();
  const looksBooking = kind.includes("booking") || kind.includes("reschedul") || /\bmove\b.*\bbooking|reschedul/.test(title);
  const looksReply = kind.includes("reply") || kind.includes("message") || kind.includes("email") || /\bsend\b.*(reply|message|email)/.test(title);
  if (looksBooking) {
    return moveBookingConsequence({
      label: p.label ?? p.booking_label ?? action.title,
      fromIso: p.from ?? p.from_at ?? p.current_at ?? null,
      toIso: p.to ?? p.to_at ?? p.new_at ?? null,
      who: p.who ?? p.customer ?? null,
      notifies: Array.isArray(p.notifies) ? p.notifies.map(String) : [],
      reversible: action.rollback_available !== false,
    });
  }
  if (looksReply && typeof (p.text ?? p.body) === "string") {
    return sendReplyConsequence({
      channel: String(p.channel ?? p.via ?? action.source ?? "the channel it came from"),
      to: p.to ?? p.recipient ?? null,
      text: String(p.text ?? p.body),
    });
  }
  return actionConsequence({
    title: action.title,
    description: action.description,
    risk: action.risk,
    affectedCount: Array.isArray(action.affected_entities) ? action.affected_entities.length : 0,
    rollback: action.rollback_available,
    executorLabel,
  });
}

/** True when this action needs a typed confirmation before it runs. */
export function needsTypedRunConfirm(risk: ExecutableAction["risk"]): boolean {
  return risk !== "low_reversible";
}

export function ExecuteConfirmDialog({
  action,
  executors = [],
  executorId,
  onExecutorChange,
  busy = false,
  onCancel,
  onConfirm,
}: {
  /** Open when an action is set; closed when null. */
  action: ExecutableAction | null;
  executors?: ExecuteExecutor[];
  executorId?: string;
  onExecutorChange?: (id: string) => void;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  /* The one moment of drama in the app: on confirm the card presses inward and
     its border goes solid, so executing feels like a mechanism engaging rather
     than a button turning grey. */
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    setTyped("");
    setCommitting(false);
  }, [action?.id]);

  if (!action) {
    return (
      <Dialog open={false} onOpenChange={() => onCancel()}>
        <DialogContent />
      </Dialog>
    );
  }

  const Icon = RiskIcon[action.risk];
  const typedRequired = needsTypedRunConfirm(action.risk);
  const ready = !typedRequired || typed.trim().toLowerCase() === CONFIRM_WORD;
  const affectedCount = Array.isArray(action.affected_entities) ? action.affected_entities.length : 0;
  const payloadStr =
    action.payload && Object.keys(action.payload).length > 0 ? JSON.stringify(action.payload, null, 2) : null;
  const chosen = executors.find((e) => e.id === executorId);
  const executorLabel = chosen ? `${chosen.kind}: ${chosen.name}` : null;
  const consequence = consequenceForAction(action, executorLabel);

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className={cn("h-5 w-5", riskColor[action.risk])} />
            Run this now?
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block text-sm font-medium text-foreground">{action.title}</span>
            {action.description ? (
              <span className="block text-xs text-muted-foreground">{action.description}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className={cn("space-y-3 rounded-[calc(var(--radius)-4px)] p-0.5", committing && MOTION_COMMIT)}>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={cn("gap-1", riskColor[action.risk])}>
              <Icon className="h-3 w-3" /> {riskLabel[action.risk]}
            </Badge>
            {action.source ? (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <History className="h-3 w-3" /> via {action.source}
              </Badge>
            ) : null}
            {affectedCount > 0 ? (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Boxes className="h-3 w-3" /> touches {affectedCount}
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className={cn("gap-1", action.rollback_available ? "text-signal" : "text-muted-foreground")}
            >
              <RotateCcw className="h-3 w-3" />
              {action.rollback_available ? "Can be undone" : "Can't be undone"}
            </Badge>
          </div>

          <ConsequencePreview consequence={consequence} />

          {executors.length > 0 && onExecutorChange ? (
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Run through</span>
              <select
                className="mt-1 h-11 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                value={executorId ?? ""}
                onChange={(e) => onExecutorChange(e.target.value)}
                aria-label="Choose how this runs"
              >
                <option value="">Mark done manually</option>
                {executors.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.kind}: {ex.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {payloadStr ? (
            <details className="rounded-md ring-1 ring-border/60">
              <summary className="flex min-h-[44px] cursor-pointer items-center gap-1.5 px-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <FileCode2 className="h-3 w-3" /> Exact details
              </summary>
              <pre className="scrollbar-thin max-h-48 overflow-auto rounded-b-md bg-surface-elevated/60 px-2 py-2 text-[11px] leading-snug text-foreground/90">
{payloadStr}
              </pre>
            </details>
          ) : null}

          {typedRequired ? (
            <div className="space-y-1.5 rounded-md border border-warn/30 bg-warn/5 p-2.5">
              <p className="text-xs text-foreground">
                This one isn't a one-tap run. Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to
                confirm.
              </p>
              <Input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={CONFIRM_WORD}
                className="h-11"
                aria-label={`Type ${CONFIRM_WORD} to confirm`}
              />
            </div>
          ) : null}

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Receipt className="h-3 w-3" /> Nothing else runs. Only this action.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" className="min-h-[44px]" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="min-h-[44px] gap-1.5"
            disabled={!ready || busy}
            onClick={() => {
              setCommitting(true);
              void onConfirm();
            }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
