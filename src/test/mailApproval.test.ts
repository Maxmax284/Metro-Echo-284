// A written reply is a proposal, never a send.
import { describe, expect, it } from "vitest";
import {
  buildMailProposal,
  isMailProposal,
  mailProposalDescription,
  mailProposalTitle,
} from "../../supabase/functions/_shared/mailProposal";
import { buildActionRow, bornApproved } from "../../supabase/functions/_shared/actionStaging";

const proposal = buildMailProposal({
  to: "dani@example.com",
  toName: "Dani Rivera",
  subject: "Pickup time",
  body: "Six works. I'll be out front.",
  threadId: "t1",
  inReplyTo: "<abc@mail>",
});

describe("mail reply proposals", () => {
  it("recognises a written reply", () => {
    expect(isMailProposal(proposal)).toBe(true);
  });

  it("refuses an empty body — there is nothing to approve", () => {
    expect(isMailProposal({ ...proposal, body: "   " })).toBe(false);
    expect(isMailProposal({ kind: "calendar_change", changes: [] })).toBe(false);
    expect(isMailProposal(null)).toBe(false);
  });

  it("carries the exact words, thread and headers", () => {
    expect(proposal.body).toBe("Six works. I'll be out front.");
    expect(proposal.thread_id).toBe("t1");
    expect(proposal.in_reply_to).toBe("<abc@mail>");
    expect(proposal.references).toBeNull();
  });

  it("names the person on the approval card and says it cannot be unsent", () => {
    expect(mailProposalTitle(proposal)).toBe("Send your reply to Dani Rivera");
    const description = mailProposalDescription(proposal);
    expect(description).toContain("dani@example.com");
    expect(description).toContain("Six works");
    expect(description).toContain("cannot be unsent");
  });

  it("stages as high risk and is never born executable", () => {
    const row = buildActionRow({
      userId: "u1",
      organizationId: null,
      title: mailProposalTitle(proposal),
      description: mailProposalDescription(proposal),
      risk: "high",
      status: "staged",
      source: "mail",
      payload: proposal as unknown as Record<string, unknown>,
    });
    expect(row.risk).toBe("high");
    expect(row.status).toBe("staged");
    expect(bornApproved(row)).toBe(false);
  });
});
