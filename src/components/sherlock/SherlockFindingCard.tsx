// SherlockFindingCard — shared card used by the Hub and embedded surfaces.
// Shows confidence + rationale + source, exposes Accept/Edit/Dismiss/Inspect.
// Never executes anything itself — callers provide accept/edit/dismiss flows.
import { useMemo, useState } from "react";
import { Sparkles, Check, X, Pencil, Eye, ShieldAlert, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusDot, confidenceTone } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { SherlockFinding } from "@/lib/sherlock/types";
import { acceptFinding, dismissFinding, editFinding } from "@/lib/sherlock/lifecycle";
import { vantaSay, vantaToast } from "@/lib/vantaVoice";
import { SherlockReviewModal } from "./SherlockReviewModal";
import { AftermathFooter } from "@/components/aftermath/AftermathFooter";
import { AttachToProjectMenu } from "@/components/projects/AttachToProjectMenu";
import { sherlockWhyFallback } from "@/lib/plainEnglish";
import { AskAboutButton } from "@/components/ask/AskAboutButton";

// Doctrine: lead with operator-friendly labels, not "Sherlock noticed X".
// "Detected by Sherlock" appears as a small trailing label elsewhere.
const MODE_LABEL: Record<string, string> = {
  observe: "Pattern noticed",
  extract: "Detail extracted",
  relate: "Possible connection",
  suggest: "Suggestion",
  investigate: "Worth a look",
};

const HIGH_IMPACT_ACTIONS = new Set([
  "create_commitment_from_sensitive",
  "attach_sensitive_file",
  "link_sensitive_entity",
  "route_to_project",
]);

export function SherlockFindingCard({
  finding,
  onChanged,
  onInspect,
  cooldownDays = 7,
  compact = false,
  className,
}: {
  finding: SherlockFinding;
  onChanged?: () => void;
  onInspect?: (f: SherlockFinding) => void;
  cooldownDays?: number;
  compact?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const needsConfirm = useMemo(
    () => finding.sensitive_flag || (finding.suggested_action && HIGH_IMPACT_ACTIONS.has(finding.suggested_action)),
    [finding.sensitive_flag, finding.suggested_action],
  );

  // Sensitive findings render a minimal preview: hide rationale + suggested
  // action + extracted data behind a reveal toggle. No auto-route. Every
  // action (accept, edit, dismiss) routes through the confirm modal.
  const hideDetails = finding.sensitive_flag && !revealed;
  const sensitiveCats: string[] = Array.isArray((finding.extracted_data as any)?.sensitive_categories)
    ? ((finding.extracted_data as any).sensitive_categories as string[])
    : [];

  const modeLabel = MODE_LABEL[finding.mode] ?? finding.mode;
  const created = finding.created_at ? formatDistanceToNow(new Date(finding.created_at), { addSuffix: true }) : "";

  async function runWithConfirm(fn: () => Promise<void>) {
    if (finding.sensitive_flag) { setConfirming(true); return; }
    await fn();
  }

  async function doAccept() {
    if (needsConfirm) { setConfirming(true); return; }
    setBusy(true);
    try {
      await acceptFinding(finding);
      vantaToast.success(vantaSay.sherlock.approved());
      onChanged?.();
    } catch {
      vantaToast.error(vantaSay.errorWith("Couldn't accept", "Try again."));
    } finally { setBusy(false); }
  }
  async function doDismiss() {
    await runWithConfirm(async () => {
      setBusy(true);
      try {
        await dismissFinding(finding, cooldownDays);
        vantaToast.success(vantaSay.sherlock.dismissed());
        onChanged?.();
      } catch {
        vantaToast.error(vantaSay.errorWith("Couldn't dismiss", "Try again."));
      } finally { setBusy(false); }
    });
  }
  async function doEdit() {
    await runWithConfirm(async () => {
      setBusy(true);
      try {
        await editFinding(finding, { note: "edited from card" });
        onChanged?.();
      } finally { setBusy(false); }
    });
  }

  return (
    <>
      <Card className={cn("border-border/60 bg-card/60 p-3", className)}>
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <span>{modeLabel}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <StatusDot tone={confidenceTone(finding.confidence)} title={`${finding.confidence} confidence`} />
                {finding.confidence}
              </span>
              {finding.sensitive_flag && (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-0.5 text-amber-500">
                    <ShieldAlert className="h-2.5 w-2.5" /> sensitive{sensitiveCats.length ? ` · ${sensitiveCats.join(", ")}` : ""}
                  </span>
                </>
              )}
              {created && (
                <>
                  <span aria-hidden>·</span>
                  <span>{created}</span>
                </>
              )}
            </div>
            {hideDetails ? (
              <>
                <div className="text-sm text-foreground/90">{vantaSay.sherlock.sensitiveHeld(sensitiveCats)}</div>
                <div className="text-xs text-muted-foreground">{vantaSay.sherlock.sensitiveRevealHint()}</div>
              </>
            ) : (
              <>
                <div className="text-sm text-foreground/90">{finding.summary}</div>
                {!compact && finding.rationale && (
                  <div className="text-xs text-muted-foreground">{finding.rationale}</div>
                )}
                {finding.suggested_action && (
                  <div className="text-[11px] text-primary/80">→ {finding.suggested_action.replace(/_/g, " ")}</div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {finding.sensitive_flag && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setRevealed((r) => !r)}
            >
              {revealed ? <EyeOff className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
              {revealed ? "Hide" : "Reveal"}
            </Button>
          )}
          <Button size="sm" variant="default" className="h-7 px-2 text-xs" disabled={busy} onClick={doAccept}>
            <Check className="mr-1 h-3 w-3" /> Accept
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={doEdit}>
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={doDismiss}>
            <X className="mr-1 h-3 w-3" /> Dismiss
          </Button>
          {onInspect && !finding.sensitive_flag && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onInspect(finding)}>
              <Eye className="mr-1 h-3 w-3" /> Inspect
            </Button>
          )}
          {!finding.sensitive_flag && (
            <AskAboutButton
              kind="sherlock"
              id={finding.id}
              label={finding.summary?.slice(0, 80) || "Finding"}
              question="Walk me through this finding and what it changes."
            />
          )}
          <AttachToProjectMenu
            itemType="finding"
            itemId={finding.id}
            itemLabel={finding.summary?.slice(0, 80)}
          />
        </div>
        <AftermathFooter
          next={{
            label: onInspect ? "Review in Sherlock" : "Open this finding",
            onClick: () => { if (onInspect) onInspect(finding); else setConfirming(true); },
            hint: finding.sensitive_flag
              ? "Sensitive — review before anything is applied."
              : sherlockWhyFallback(finding),
          }}
          whatHappensIfTap="Opens the review screen — nothing applies yet."
        />
      </Card>

      <SherlockReviewModal
        open={confirming}
        finding={finding}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          setBusy(true);
          try {
            await acceptFinding(finding);
            vantaToast.success(vantaSay.sherlock.approved());
            onChanged?.();
          } finally { setBusy(false); }
        }}
      />
    </>
  );
}
