// GlobalDropZone — desktop drag-over → stage on FileUploadCard.
//
// Doctrine:
//  - Capture only. Drops never auto-ingest; they stage for review.
//  - The overlay only appears when the OS reports actual files in the drag.
//  - Dispatches a CustomEvent the FileUploadCard listens for; no prop drilling.
//  - Skipped on touch-only devices (no hover pointer) to avoid false positives.
import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export const VANTA_STAGE_FILES_EVENT = "vanta:stage-files";

export type VantaStageFilesDetail = {
  files: File[];
  source: "drop" | "share" | "paste";
};

function hasFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  // types is the only reliable signal during dragover (files list is empty until drop).
  return Array.from(dt.types ?? []).includes("Files");
}

export function GlobalDropZone() {
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    // Skip on touch-primary devices — no native drag-and-drop UX there.
    if (typeof window === "undefined") return;
    const fine = window.matchMedia?.("(pointer: fine)").matches ?? true;
    if (!fine) return;

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      depth.current += 1;
      setActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const onDrop = (e: DragEvent) => {
      depth.current = 0;
      setActive(false);
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      window.dispatchEvent(
        new CustomEvent<VantaStageFilesDetail>(VANTA_STAGE_FILES_EVENT, {
          detail: { files, source: "drop" },
        }),
      );
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  if (!active) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-[100] flex items-center justify-center",
        "bg-background/70 backdrop-blur-sm transition-opacity",
      )}
      aria-hidden
    >
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/60 bg-card/80 px-8 py-6 shadow-lg ring-1 ring-primary/20">
        <Upload className="h-6 w-6 text-primary" />
        <div className="text-sm font-medium text-foreground">Drop to stage in memory</div>
        <div className="text-[11px] text-muted-foreground">Files stage first · review before ingest</div>
      </div>
    </div>
  );
}
