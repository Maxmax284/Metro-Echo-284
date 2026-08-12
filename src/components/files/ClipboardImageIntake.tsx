// ClipboardImageIntake — Phase 8 device signal: screenshot paste.
//
// Doctrine:
//  - Capture only. A pasted screenshot stages for review; nothing auto-ingests.
//  - Never hijacks a paste that belongs to a text field.
//  - Reuses the existing stage-files event, so the audit trail records source="paste".
//  - Renders nothing; it is a listener, not a surface.
import { useEffect } from "react";
import {
  VANTA_STAGE_FILES_EVENT,
  type VantaStageFilesDetail,
} from "@/components/files/GlobalDropZone";

function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node || !node.tagName) return false;
  const tag = node.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return node.isContentEditable === true;
}

function imagesFromClipboard(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const out: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (!f) continue;
    if (!f.type.startsWith("image/")) continue;
    // Clipboard images usually arrive unnamed ("image.png" at best).
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const ext = f.type.split("/")[1]?.split("+")[0] || "png";
    const named = f.name && f.name !== "image.png" ? f : new File([f], `screenshot-${stamp}.${ext}`, { type: f.type });
    out.push(named);
  }
  return out;
}

export function ClipboardImageIntake() {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imagesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      // A paste inside a text field that also carries text belongs to the field.
      const hasText = (e.clipboardData?.getData("text/plain") ?? "").trim().length > 0;
      if (isTypingTarget(e.target) && hasText) return;

      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent<VantaStageFilesDetail>(VANTA_STAGE_FILES_EVENT, {
          detail: { files, source: "paste" },
        }),
      );
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return null;
}
