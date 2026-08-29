import { useState } from "react";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";
import { Button } from "@/components/ui/button";
import { FileText, Plus } from "lucide-react";
import { BriefComposerSheet } from "@/components/briefs/BriefComposerSheet";
import { BriefExportsList } from "@/components/briefs/BriefExportsList";

/**
 * BriefsSurface — first-class home for briefs & exports.
 * Thin wrapper around the existing composer + exports list.
 */
export function BriefsSurface() {
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h1 className="text-lg font-semibold">Briefs</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn what's in Vanta into a readable document — PDF, operator brief, audio script. Past exports stay here with receipts.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setComposerOpen(true)}>
          <Plus className="h-4 w-4" /> Create brief
        </Button>
      </header>

      <BriefExportsList />

      <BriefComposerSheet
        open={composerOpen}
        onOpenChange={setComposerOpen}
        defaultScope="system"
      />

      <SurfaceAftermath surface="briefs" />
    </div>
  );
}
