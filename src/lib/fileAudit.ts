// File intake audit helper — every state change emits a receipt.
// Doctrine: capture leaves a trail. Failures included.
import { supabase } from "@/integrations/supabase/client";

export type FileAuditEvent =
  | "file.staged"
  | "file.upload_started"
  | "file.uploaded"
  | "file.upload_failed"
  | "file.extraction_started"
  | "file.extracted"
  | "file.extraction_failed"
  | "file.needs_review"
  | "file.aftermath_opened"
  | "file.action_suggested"
  | "file.summarize_requested"
  | "file.extract_requested"
  | "file.linked"
  | "file.reminder_created"
  | "file.commitment_created"
  | "file.sent_to_sherlock"
  | "file.archived"
  | "file.restored"
  | "capture.toast_shown"
  | "capture.toast_opened";

export async function logFileEvent(
  userId: string,
  event: FileAuditEvent,
  entityId: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.from("audit_log").insert({
      user_id: userId,
      entity_type: "file",
      entity_id: entityId,
      event,
      payload: payload as never,
    });
  } catch {
    // best-effort — never block the UI on an audit insert
  }
}
