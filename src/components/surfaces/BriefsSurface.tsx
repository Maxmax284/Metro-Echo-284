import { useState } from "react";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";
import { Button } from "@/components/ui/button";
import { FileText, FolderKanban } from "lucide-react";
import { BriefExportsList } from "@/components/briefs/BriefExportsList";

/**
 * BriefsSurface — no longer a room of its own.
 *
 * A brief is something a project puts out, so composing one lives on the
 * project page next to the work it summarises. This surface stays reachable by
 * old links and receipt deep links: it says where the door is now and lists
 * everything already exported, with receipts.
 */
export function BriefsSurface({ onNavigate }: { onNavigate?: (surface: "projects") => void } = {}) {
  const [count, setCount] = useState(0);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">What projects put out</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          You make one of these on the project itself — open a project and use “What this project
          puts out.” Everything already exported is listed here, with its receipt.
        </p>
      </header>

      <Button
        size="sm"
        variant="outline"
        className="mb-4 gap-1.5"
        onClick={() => (onNavigate ? onNavigate("projects") : undefined)}
      >
        <FolderKanban className="h-4 w-4" /> Open projects
      </Button>

      <BriefExportsList onLoaded={setCount} />

      {count === 0 ? (
        <p className="mt-3 text-[11.5px] leading-snug text-muted-foreground">
          Nothing's been put out yet. Open a project, summarise it, and the PDF or Word file lands
          here once you export it yourself.
        </p>
      ) : null}

      <SurfaceAftermath surface="briefs" />
    </div>
  );
}
