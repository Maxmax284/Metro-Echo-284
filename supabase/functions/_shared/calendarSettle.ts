// calendarSettle — one place where a staged calendar change is decided, so a
// tapped button, a typed "yes" in chat and an in-app approval all travel the
// exact same path: transition -> events -> audit -> (connected, low risk) write.
//
// Doctrine: approval settles the action wherever it was staged. Nothing here
// widens risk, re-approves a decided action, or writes without a live
// connection.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  approvalOutcomeLine,
  isCalendarProposal,
  telegramProposalBelongsTo,
} from "./calendarProposal.ts";
import {
  calendarWriteStateForUser,
  executeCalendarProposal,
  projectCalendarEvent,
  telegramMayAutoExecute,
} from "./calendarExecute.ts";

export { readsAsApproval, readsAsRejection } from "./calendarSettleWords.ts";


export type SettleResult = {
  status: "needs_confirmation" | "approved" | "cancelled" | "executed" | "stale" | "not_found" | "already";
  text: string;
  actionId: string | null;
};

/**
 * Every calendar change from this chat still waiting on a yes, newest first.
 * Callers that settle on a bare "yes" must check the length: two proposals
 * waiting means the newest one is a guess, and a guess must not be approved.
 */
export async function pendingCalendarActions(admin: SupabaseClient, userId: string, telegramChatId?: string | number | null) {
  const { data } = await admin.from("actions")
    .select("id, status, payload, risk, organization_id, title, created_at")
    .eq("user_id", userId).eq("status", "staged")
    .order("created_at", { ascending: false }).limit(6);
  return ((data ?? []) as any[]).filter((r) =>
    isCalendarProposal(r.payload)
    && (telegramChatId == null || telegramProposalBelongsTo(r.payload, telegramChatId))
  );
}

/** The newest calendar change still waiting on a yes. */
export async function pendingCalendarAction(admin: SupabaseClient, userId: string, telegramChatId?: string | number | null) {
  const rows = await pendingCalendarActions(admin, userId, telegramChatId);
  return rows[0] ?? null;
}

export async function settleCalendarProposal(
  admin: SupabaseClient,
  userId: string,
  opts: {
    actionId: string;
    version?: number | null;
    approve: boolean;
    source: string;
    strongConfirm?: boolean;
    telegramChatId?: string | number | null;
    telegramMessageId?: string | number | null;
  },
): Promise<SettleResult> {
  const { data: act } = await admin.from("actions")
    .select("id, status, payload, risk, organization_id, title")
    .eq("id", opts.actionId).eq("user_id", userId).maybeSingle();
  if (!act || !isCalendarProposal(act.payload)) {
    return { status: "not_found", text: "Not found.", actionId: null };
  }
  const proposal = act.payload;
  if (opts.telegramChatId != null && !telegramProposalBelongsTo(proposal, opts.telegramChatId, opts.telegramMessageId)) {
    return { status: "not_found", text: "That approval belongs to a different chat or message.", actionId: null };
  }
  if (typeof opts.version === "number" && proposal.version !== opts.version) {
    return { status: "stale", text: "That changed since I asked — use the newest message.", actionId: act.id };
  }
  if (act.status !== "staged") {
    return {
      status: "already",
      text: act.status === "cancelled" ? "Already dropped." : "Already decided.",
      actionId: act.id,
    };
  }

  if (opts.approve && act.risk === "high" && !opts.strongConfirm) {
    return {
      status: "needs_confirmation",
      text: "This reaches other people. Confirm write to Google?",
      actionId: act.id,
    };
  }

  const to = opts.approve ? "approved" : "cancelled";
  const patch: Record<string, unknown> = { status: to };
  if (to === "approved" && act.risk === "high") patch.risk_acknowledged_at = new Date().toISOString();
  const { error: transErr } = await admin.from("actions").update(patch)
    .eq("id", act.id).eq("user_id", userId).eq("status", "staged");
  if (transErr) {
    return { status: "not_found", text: "Couldn't save that. Open Metro Echo.", actionId: act.id };
  }
  await admin.from("action_events").insert({
    user_id: userId, action_id: act.id, from_status: "staged", to_status: to,
    actor: "user", reason: `${opts.source} ${opts.approve ? "yes" : "no"} (v${proposal.version})`,
  });
  await admin.from("audit_log").insert({
    user_id: userId, organization_id: act.organization_id ?? null,
    entity_type: "action", entity_id: act.id, event: `transition:staged->${to}`,
    payload: {
      source: opts.source, as: "calendar_change", version: proposal.version,
      write_state: proposal.write_state, title: act.title ?? null,
    },
  });

  if (!opts.approve) {
    return { status: "cancelled", text: "Dropped. Nothing changed.", actionId: act.id };
  }

  const liveWriteState = await calendarWriteStateForUser(userId);
  let text = approvalOutcomeLine(liveWriteState);
  let status: SettleResult["status"] = "approved";

  if (liveWriteState === "connected" && (opts.strongConfirm || telegramMayAutoExecute({ ...proposal, write_state: "connected" }))) {
    try {
      const result = await executeCalendarProposal(admin, userId, {
        id: act.id, title: act.title, payload: proposal,
      });
      await projectCalendarEvent(admin, userId, proposal, result);
      await admin.from("actions").update({
        status: "executed", result, executed_at: new Date().toISOString(),
      }).eq("id", act.id).eq("user_id", userId);
      await admin.from("action_events").insert({
        user_id: userId, action_id: act.id, from_status: "approved", to_status: "executed",
        actor: "executor", reason: `${opts.source}_auto_execute`,
      });
      await admin.from("audit_log").insert({
        user_id: userId, organization_id: act.organization_id ?? null,
        entity_type: "action", entity_id: act.id, event: "execute.success",
        payload: { source: opts.source, result },
      });
      text = "Done. Google confirmed it, and the receipt is saved.";
      status = "executed";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "execution failed";
      await admin.from("audit_log").insert({
        user_id: userId, organization_id: act.organization_id ?? null,
        entity_type: "action", entity_id: act.id, event: "execute.failed",
        payload: { source: opts.source, error: msg },
      });
      text = `Approved, but Google couldn't write it: ${msg.slice(0, 120)}. Send /queue and hit Retry write.`;
    }
  }

  return { status, text, actionId: act.id };
}

/** The newest calendar change that said yes but hasn't landed in Google yet. */
export async function approvedUnwrittenCalendarAction(
  admin: SupabaseClient,
  userId: string,
  telegramChatId?: string | number | null,
) {
  const { data } = await admin.from("actions")
    .select("id, status, payload, risk, organization_id, title, created_at")
    .eq("user_id", userId).eq("status", "approved")
    .order("created_at", { ascending: false }).limit(6);
  const rows = ((data ?? []) as any[]).filter((r) =>
    isCalendarProposal(r.payload)
    && (telegramChatId == null || telegramProposalBelongsTo(r.payload, telegramChatId))
  );
  return rows[0] ?? null;
}

/**
 * Stop something before it runs — staged or approved-but-unwritten. Anything
 * already written to Google is undone, not stopped, so this refuses it and says
 * so instead of pretending.
 */
export async function stopCalendarProposal(
  admin: SupabaseClient,
  userId: string,
  opts: {
    actionId: string;
    source: string;
    telegramChatId?: string | number | null;
    telegramMessageId?: string | number | null;
  },
): Promise<SettleResult> {
  const { data: act } = await admin.from("actions")
    .select("id, status, payload, risk, organization_id, title")
    .eq("id", opts.actionId).eq("user_id", userId).maybeSingle();
  if (!act || !isCalendarProposal(act.payload)) return { status: "not_found", text: "Not found.", actionId: null };
  if (opts.telegramChatId != null && !telegramProposalBelongsTo(act.payload, opts.telegramChatId, opts.telegramMessageId)) {
    return { status: "not_found", text: "That stop belongs to a different chat or message.", actionId: null };
  }
  if (act.status === "cancelled" || act.status === "rolled_back") {
    return { status: "already", text: "Already stopped.", actionId: act.id };
  }
  if (act.status !== "staged" && act.status !== "proposed" && act.status !== "approved") {
    return {
      status: "already",
      text: "That one already ran. Undo it in Metro Echo — the receipt shows what happened.",
      actionId: act.id,
    };
  }
  const from = act.status;
  const { error } = await admin.from("actions").update({ status: "cancelled" })
    .eq("id", act.id).eq("user_id", userId).eq("status", from);
  if (error) return { status: "not_found", text: "Couldn't stop that. Open Metro Echo.", actionId: act.id };
  await admin.from("action_events").insert({
    user_id: userId, action_id: act.id, from_status: from, to_status: "cancelled",
    actor: "user", reason: `${opts.source} stop`,
  });
  await admin.from("audit_log").insert({
    user_id: userId, organization_id: act.organization_id ?? null,
    entity_type: "action", entity_id: act.id, event: `transition:${from}->cancelled`,
    payload: { source: opts.source, stopped_before_execute: true, title: act.title ?? null },
  });
  return { status: "cancelled", text: "Stopped. Nothing ran, and the record stays in Receipts.", actionId: act.id };
}
