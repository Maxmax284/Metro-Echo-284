// ProjectSticker — one die-cut sticker per project card. State from real fields.
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { play } from "@/lib/streetSound";
import { stickerFor, stickerTilt } from "@/lib/tactile";

const slapped = new Set<string>();

const TONE: Record<string, string> = {
  ACTIVE: "bg-primary text-primary-foreground",
  QUIET: "bg-muted text-muted-foreground",
  "NEEDS YOU": "bg-warn text-background",
  DONE: "bg-secondary text-secondary-foreground",
};

export function ProjectSticker({
  project,
  className,
}: {
  project: { id: string; status?: string | null; updated_at?: string | null; needsYou?: boolean };
  className?: string;
}) {
  const state = stickerFor(project);
  const fresh = useRef(!slapped.has(project.id));
  useEffect(() => {
    if (fresh.current) {
      slapped.add(project.id);
      play("snap");
    }
  }, [project.id]);
  return (
    <span
      className={cn(
        "die-sticker shrink-0 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em]",
        fresh.current && "sticker-slap",
        TONE[state],
        className,
      )}
      style={{ ["--tilt" as string]: `${stickerTilt(project.id)}deg` }}
    >
      {state}
    </span>
  );
}
