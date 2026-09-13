// mailProposal — a reply that has been written but not sent.
//
// Doctrine:
//   - Echo prepares. A person approves. Only then does anything leave the
//     account. The exact words are carried on the proposal so the approval
//     screen shows what will actually go out — not a summary of it.
//   - Sending mail cannot be undone, so it is never low risk.
// Pure module: no IO, no Deno globals.

export type MailProposal = {
  kind: "mail_reply";
  to: string;
  to_name: string;
  subject: string;
  body: string;
  thread_id: string | null;
  in_reply_to: string | null;
  references: string | null;
};

export function isMailProposal(payload: unknown): payload is MailProposal {
  const p = payload as MailProposal | null;
  return (
    !!p && typeof p === "object" && p.kind === "mail_reply"
    && typeof p.to === "string" && p.to.length > 0
    && typeof p.body === "string" && p.body.trim().length > 0
  );
}

export function buildMailProposal(input: {
  to: string;
  toName?: string | null;
  subject: string;
  body: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
}): MailProposal {
  return {
    kind: "mail_reply",
    to: input.to.trim(),
    to_name: (input.toName ?? "").trim() || input.to.trim(),
    subject: input.subject.trim() || "(no subject)",
    body: input.body,
    thread_id: input.threadId ?? null,
    in_reply_to: input.inReplyTo ?? null,
    references: input.references ?? null,
  };
}

/** The line the approval card reads. Names the person, never the mechanism. */
export function mailProposalTitle(proposal: MailProposal): string {
  return `Send your reply to ${proposal.to_name}`;
}

/**
 * What approving this does, plus the exact text. Truncated for the row, never
 * for the send: the executor reads `payload.body`, not this description.
 */
export function mailProposalDescription(proposal: MailProposal): string {
  const preview = proposal.body.trim().slice(0, 600);
  return [
    `Subject: ${proposal.subject}`,
    `To: ${proposal.to}`,
    "",
    preview,
    "",
    "Approving sends this from your Gmail. It cannot be unsent.",
  ].join("\n");
}
