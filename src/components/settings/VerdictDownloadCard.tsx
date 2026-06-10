import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Small card that exposes the latest Verdict PDF (concept, capabilities,
 * maturity gaps) as a one-tap download. PDF is shipped under public/.
 */
export function VerdictDownloadCard() {
  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Vanta — The Verdict</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Plain-English summary of what this thing is, what it can do, and what's
            still rough. Cover page included.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-[11.5px]">
          <a href="/vanta-verdict.pdf" download>
            <Download className="h-3.5 w-3.5" /> PDF
          </a>
        </Button>
      </div>
    </section>
  );
}
