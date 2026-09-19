// mailExecute — the one place an approved reply actually leaves Gmail.
//
// Doctrine:
//   - Only reachable from actions-execute, only for an approved action. There is
//     no second send path.
//   - It uses this person's own Gmail connection. A missing send permission is a
//     question worth asking out loud, not a silent failure.
import { callGoogle } from "./googleService.ts";
import { GOOGLE_MAIL_CONNECTOR_ID } from "./appUserScopes.ts";
import { buildRawReply, replySubject } from "./mailRead.ts";
import { isMailProposal, type MailProposal } from "./mailProposal.ts";

type SbClient = {
  from: (table: string) => any;
};

export type MailExecuteResult = {
  provider: "gmail";
  message_id: string | null;
  thread_id: string | null;
  to: string;
  subject: string;
};

/** Pick or create this person's Gmail executor. Null when Gmail is not on. */
export async function ensureGmailExecutor(sb: SbClient, userId: string): Promise<string | null> {
  const { data: existing } = await sb
    .from("action_executors")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "gmail")
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: inserted, error } = await sb
    .from("action_executors")
    .insert({ user_id: userId, name: "Gmail", kind: "gmail", enabled: true, config: {} })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[mailExecute] could not create the Gmail executor:", error?.message);
    return null;
  }
  return inserted.id;
}

export async function executeMailProposal(
  userId: string,
  action: { id: string; payload: unknown },
): Promise<MailExecuteResult> {
  const proposal = action.payload as MailProposal | null;
  if (!isMailProposal(proposal)) throw new Error("that approval is not a written reply");

  const raw = buildRawReply({
    to: proposal.to,
    subject: replySubject(proposal.subject),
    body: proposal.body,
    inReplyTo: proposal.in_reply_to,
    references: proposal.references,
  });
  const res = await callGoogle(userId, GOOGLE_MAIL_CONNECTOR_ID, "/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proposal.thread_id ? { raw, threadId: proposal.thread_id } : { raw }),
  });
  if (!res.ok) {
    if (res.reason === "not_connected") throw new Error("Gmail is not switched on for this account.");
    if (res.reason === "service_off") throw new Error(`${res.detail} Nothing left your account.`);
    if (res.reason === "needs_you") {
      throw new Error("Google has not been given permission to send as you yet. Nothing left your account.");
    }
    throw new Error(`That did not send. Nothing left your account. ${res.detail}`.trim());
  }
  const sent = res.body as { id?: string; threadId?: string };
  return {
    provider: "gmail",
    message_id: sent.id ?? null,
    thread_id: sent.threadId ?? proposal.thread_id ?? null,
    to: proposal.to,
    subject: replySubject(proposal.subject),
  };
}
