// Inbound external-platform signals — pure detail building and urgency mapping.
//
// Two jobs, both deterministic and side-effect free so the server, the client
// and the tests read one definition:
//   1. Turn a raw platform payload into a human title + concrete detail lines.
//      Missing fields are omitted — nothing is invented or guessed.
//   2. Decide how urgently a captured signal deserves to reach the user.
//
// Nothing here executes anything. A signal becomes a capture and, at most, a
// notice. Approve/execute stays inside the platform.
import { urgencyRank, type Urgency } from "./urgency.ts";
import { compressNotice, type Verbosity } from "./compress.ts";


export type SignalDetail = {
  /** One-line headline, safe to use as a capture summary. */
  title: string;
  /** Concrete facts, one per line. Empty when the payload carried nothing. */
  lines: string[];
};

type Payload = Record<string, unknown>;

function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function pick(payload: Payload, keys: string[]): string | null {
  for (const k of keys) {
    const v = str(payload[k]);
    if (v) return v;
  }
  return null;
}

function excerpt(value: string, max = 240): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function dateOnly(value: string): string | null {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
  return new Date(t).toISOString().slice(0, 10);
}

function nightsBetween(from: string, to: string): number | null {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const n = Math.round((b - a) / 86_400_000);
  return n > 0 ? n : null;
}

function money(payload: Payload): string | null {
  const amount = pick(payload, ["amount", "amount_paid", "total", "total_amount", "total_price", "price", "amount_due"]);
  if (!amount) return null;
  const currency = pick(payload, ["currency", "currency_code"]);
  return currency ? `${amount} ${currency.toUpperCase()}` : amount;
}

/** Who moved it: staff name, guest, system, or import. Never invented. */
export function actorOf(payload: Payload): string | null {
  return pick(payload, [
    "actor", "actor_name", "changed_by", "changed_by_name", "updated_by",
    "created_by", "staff_name", "staff", "user_name", "initiated_by", "source_actor",
  ]);
}

export function reasonOf(payload: Payload): string | null {
  const r = pick(payload, ["reason", "note", "comment", "cancellation_reason", "change_reason"]);
  return r ? excerpt(r, 160) : null;
}

/** Stripe / manual / offline, inferred only from fields the payload actually carried. */
export function paymentMethodOf(payload: Payload): string | null {
  const direct = pick(payload, ["method", "payment_method", "provider", "card_brand", "gateway"]);
  if (direct) return direct;
  const session = pick(payload, ["session_id", "stripe_session_id", "payment_intent", "charge_id"]);
  if (session && /^(cs_|pi_|ch_)/i.test(session)) return "Stripe";
  return null;
}

/** Last segment of a uuid-ish reference — short enough to scan, still unique. */
export function shortRef(value: string): string {
  const clean = value.trim();
  if (/^[0-9a-f-]{20,}$/i.test(clean)) return clean.slice(0, 8);
  return clean;
}

function eventWords(eventType: string): string {
  return eventType.replace(/[._]/g, " ");
}

/**
 * Build a title + detail lines for a captured external signal.
 *
 * `displayName` is the platform's user-facing name (e.g. "LMT Camp State") so
 * renaming a platform never changes any of this logic.
 */
export function buildSignalDetail(
  displayName: string,
  eventType: string,
  payload: Payload = {},
): SignalDetail {
  const lines: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value) lines.push(`${label}: ${value}`);
  };

  const guest = pick(payload, ["guest_name", "guest", "customer_name", "name", "member_name"]);
  const room = pick(payload, ["room", "room_name", "unit", "unit_name", "unit_label", "room_type", "property", "cabin", "unit_id"]);
  const reference = pick(payload, ["booking_reference", "reference", "booking_id", "reservation_id", "confirmation_code", "code"]);
  const channel = pick(payload, ["channel", "source", "booking_channel", "platform"]);
  const message = pick(payload, ["message", "text", "summary", "note", "body", "description", "request"]);
  const status = pick(payload, ["status", "state", "new_status", "new_state", "to_status", "to_state", "booking_status"]);
  const previous = pick(payload, ["previous_status", "previous_state", "old_status", "old_state", "from_status", "from_state", "was"]);
  const checkIn = pick(payload, ["check_in", "checkin", "start_date", "arrival", "from"]);
  const checkOut = pick(payload, ["check_out", "checkout", "end_date", "departure", "to"]);
  const guests = pick(payload, ["guests", "party_size", "pax", "people", "headcount"]);

  const family = eventType.split(".")[0];

  if (family === "booking") {
    const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : null;
    push("Guest", guest);
    push("Room", room);
    if (checkIn && checkOut) {
      const inD = dateOnly(checkIn);
      const outD = dateOnly(checkOut);
      push("Stay", `${inD} → ${outD}${nights ? ` (${nights} night${nights === 1 ? "" : "s"})` : ""}`);
    } else if (checkIn) {
      push("Check-in", dateOnly(checkIn));
    }
    push("Guests", guests);
    if (previous && status) push("Status", `${previous} → ${status}`);
    else push("Status", status);
    push("Amount", money(payload));
    push("Reference", reference);
    push("Channel", channel);
    push("Changed by", actorOf(payload));
    push("Reason", reasonOf(payload));
    if (message) push("Note", excerpt(message));
    const head = [
      guest,
      room ? `room ${shortRef(room)}` : null,
      !guest && !room && reference ? `#${shortRef(reference)}` : null,
      previous && status ? `${previous} → ${status}` : status,
    ].filter(Boolean).join(" · ");
    return {
      title: `${displayName} ${eventWords(eventType)}${head ? `: ${head}` : ""}`,
      lines,
    };
  }

  if (family === "payment") {
    const amount = money(payload);
    push("Amount", amount);
    push("Method", paymentMethodOf(payload));
    push("Kind", pick(payload, ["payment_kind", "kind", "deposit_or_balance", "label"]));
    push("Status", status);
    push("Guest", guest);
    push("Reference", reference);
    const balBefore = pick(payload, ["previous_balance", "old_balance", "balance_before"]);
    const balAfter = pick(payload, ["balance", "new_balance", "balance_after", "balance_due"]);
    if (balBefore && balAfter) push("Balance", `${balBefore} → ${balAfter}`);
    else push("Balance", balAfter);
    const reason = pick(payload, ["failure_reason", "reason", "error", "decline_reason"]);
    push("Reason", reason ? excerpt(reason) : null);
    if (message && !reason) push("Note", excerpt(message));
    return {
      title: `${displayName} ${eventWords(eventType)}${amount ? `: ${amount}` : ""}${
        reference ? ` · #${shortRef(reference)}` : ""
      }`,
      lines,
    };
  }

  if (family === "notice") {
    // Universal notice: any connected platform can raise one and it rides
    // Vanta's own messaging pipe. Still capture-first, still notification only.
    const headline = pick(payload, ["title", "headline", "subject"]);
    const detailLines = Array.isArray(payload.lines)
      ? (payload.lines as unknown[]).map((l) => str(l)).filter((l): l is string => !!l)
      : [];
    for (const l of detailLines) lines.push(excerpt(l, 200));
    if (!detailLines.length && message) lines.push(excerpt(message));
    push("Reference", reference);
    return {
      title: headline ? `${displayName}: ${excerpt(headline, 120)}` : `${displayName} notice`,
      lines,
    };
  }

  // Guest messages, requests, member requests, security events, form posts.
  push("Guest", guest);
  push("Room", room);
  push("Urgency", pick(payload, ["urgency", "priority", "severity"]));
  push("Status", status);
  push("Reference", reference);
  if (message) push("Message", excerpt(message));
  const head = message ? excerpt(message, 90) : room ? `room ${room}` : guest;
  return {
    title: `${displayName} ${eventWords(eventType)}${head ? `: ${head}` : ""}`,
    lines,
  };
}

/**
 * How urgently a captured inbound signal deserves to reach the user.
 *
 * Money that failed and a guest waiting on a human are time-sensitive. A
 * cancellation is critical because the day's plan just changed. Everything
 * else is worth noticing, not interrupting.
 */
export function inboundUrgency(eventType: string, payload: Payload = {}): Urgency {
  const status = (pick(payload, ["status", "state", "new_status", "new_state", "booking_status"]) ?? "").toLowerCase();
  const severity = (pick(payload, ["severity", "urgency", "priority"]) ?? "").toLowerCase();

  if (eventType === "booking.state_changed" || eventType === "booking.updated") {
    if (/cancel|no.?show|refund/.test(status)) return "critical";
    return "attention";
  }
  if (eventType === "payment.failed") return "time_sensitive";
  if (eventType === "guest_request.created" || eventType === "guest_message.received") {
    return severity === "critical" || severity === "urgent" || severity === "high"
      ? "critical"
      : "time_sensitive";
  }
  if (eventType === "notice.raised") {
    // The raising platform states how loud it is; Vanta still owns the gates.
    if (severity === "critical") return "critical";
    if (severity === "urgent" || severity === "high" || severity === "time_sensitive") return "time_sensitive";
    if (severity === "low" || severity === "background") return "background";
    return "attention";
  }
  if (eventType === "booking.created") return "attention";
  if (eventType === "payment.received") return "useful";
  if (eventType === "integration.test") return "background";
  if (severity === "critical") return "critical";
  return "attention";
}

/**
 * Does this signal earn an immediate interruption? Time-sensitive and above
 * only — everything quieter waits for Today.
 */
export function shouldReachNow(urgency: Urgency): boolean {
  return urgencyRank(urgency) >= urgencyRank("time_sensitive");
}

/**
 * The exact text sent to a messaging channel. Notification only: what happened,
 * the concrete facts, and where to act. No buttons, no commands, no execution.
 *
 * Wording is composed by the compression seam so every channel reads from one
 * definition; this function only supplies the facts and the verbosity.
 */
export function inboundNoticeText(
  detail: SignalDetail,
  opts: { publicUrl?: string | null; nextStep?: string; verbosity?: Verbosity } = {},
): string {
  return compressNotice(
    {
      title: detail.title,
      lines: detail.lines,
      nextStepLine: opts.nextStep ?? "In Vanta's inbox for review — nothing was actioned.",
      publicUrl: opts.publicUrl,
    },
    opts.verbosity ?? "brief",
  );
}



/**
 * How much of the operational picture the payload actually carried.
 *
 * This is the single decision for "does a human need to look at this?" —
 * `needs_review` used to be hardcoded true for every inbound signal, which
 * made review meaningless. Missing fields are named, never guessed.
 */
export type SignalQuality = {
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
  /** Backend field names that were absent, in payload terms. */
  missing: string[];
  /** Machine label the UI turns into a status chip. */
  disposition: "no_action" | "needs_review" | "action_suggested" | "missing_data" | "error" | "synced";
};

export function signalQuality(eventType: string, payload: Payload = {}): SignalQuality {
  const family = eventType.split(".")[0];
  const ref = pick(payload, ["booking_reference", "reference", "booking_id", "reservation_id", "confirmation_code", "code"]);
  const guest = pick(payload, ["guest_name", "guest", "customer_name", "name", "member_name"]);
  const status = pick(payload, ["status", "state", "new_status", "new_state", "booking_status"]);
  const previous = pick(payload, ["previous_status", "previous_state", "old_status", "old_state", "from_status", "from_state"]);
  const actor = actorOf(payload);
  const amount = pick(payload, ["amount", "amount_paid", "total", "total_price", "total_amount"]);
  const missing: string[] = [];

  if (eventType === "integration.test") {
    return { confidence: "high", needsReview: false, missing: [], disposition: "synced" };
  }

  if (family === "booking") {
    if (!ref) missing.push("booking_id");
    if (!guest) missing.push("guest_name");
    if (!pick(payload, ["room", "room_name", "unit", "unit_name", "room_type", "unit_id"])) missing.push("room");
    if (eventType !== "booking.created") {
      if (!previous) missing.push("previous_state");
      if (!status) missing.push("state");
    }
    if (!actor) missing.push("actor");
  } else if (family === "payment") {
    if (!amount) missing.push("amount");
    if (!ref) missing.push("booking_id");
    if (!paymentMethodOf(payload)) missing.push("payment_method");
    if (!guest) missing.push("guest_name");
  } else {
    if (!pick(payload, ["message", "text", "summary", "note", "body", "description", "request"])) missing.push("message");
  }

  const hard = missing.filter((m) => m === "booking_id" || m === "amount" || m === "state" || m === "message");
  const cancelling = /cancel|no.?show|refund|dispute|chargeback/i.test(status ?? "");
  const failed = /fail|declin|error/i.test(eventType) || /fail|declin/i.test(status ?? "");

  const confidence: SignalQuality["confidence"] =
    hard.length ? "low"
    : missing.length ? "medium"
    : "high";

  const disposition: SignalQuality["disposition"] =
    failed ? "error"
    : hard.length ? "missing_data"
    : cancelling ? "action_suggested"
    : family === "guest_message" || family === "guest_request" || family === "member_request" ? "needs_review"
    : "no_action";

  return {
    confidence,
    needsReview: disposition === "error" || disposition === "missing_data" || disposition === "action_suggested" || disposition === "needs_review",
    missing,
    disposition,
  };
}
