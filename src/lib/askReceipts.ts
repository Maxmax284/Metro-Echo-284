// Ask receipt meta — what an intent produced, in one place.
// Both the conversation surface and the inline heads-up reply render receipt
// lines from this map, so a draft is described the same way everywhere.
import { CheckSquare, ListPlus, BookmarkPlus, Eye } from "lucide-react";
import type { IntentAck } from "@/hooks/useIntentHandler";

export const RECEIPT_META: Record<
  IntentAck["kind"],
  { label: string; icon: typeof CheckSquare; surface: string }
> = {
  stage_action: { label: "Ready for your review", icon: ListPlus, surface: "actions" },
  add_commitment: { label: "Promise ready for review", icon: CheckSquare, surface: "commitments" },
  capture_note: { label: "Saved to memory", icon: BookmarkPlus, surface: "memory" },
  mark_waiting: { label: "Marked as waiting", icon: CheckSquare, surface: "commitments" },
  record_decision: { label: "Decision logged", icon: BookmarkPlus, surface: "memory" },
  save_artifact: { label: "Artifact saved", icon: BookmarkPlus, surface: "memory" },
  keep_an_eye_on: { label: "Echo is keeping an eye on it", icon: Eye, surface: "work" },
};
