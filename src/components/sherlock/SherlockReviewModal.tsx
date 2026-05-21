// SherlockReviewModal — confirm dialog for high-impact or sensitive accepts.
// Doctrine: high-impact action requires explicit confirmation, with rationale
// and confidence in view. Cancel = no-op. Confirm = caller proceeds.
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ShieldAlert } from "lucide-react";
import type { SherlockFinding } from "@/lib/sherlock/types";

export function SherlockReviewModal({
  open,
  finding,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  finding: SherlockFinding;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {finding.sensitive_flag && <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden />}
            Confirm before applying
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <div>{finding.summary}</div>
              {finding.rationale && (
                <div className="text-muted-foreground">Reason: {finding.rationale}</div>
              )}
              <div className="text-xs text-muted-foreground">
                Confidence: {finding.confidence}.
                {finding.sensitive_flag && " This item may contain sensitive details — review carefully."}
              </div>
              <div className="text-xs text-muted-foreground">
                Nothing has run yet. Approving will apply this suggestion.
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Approve</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
