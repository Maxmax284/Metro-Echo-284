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
  const amount = pick(payload, ["amount", "total", "total_amount", "price", "amount_due"]);
  if (!amount) return null;
  const currency = pick(payload, ["currency", "currency_code"]);
  return currency ? `${amount} ${currency.toUpperCase()}` : amount;
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
  const room = pick(payload, ["room", "room_name", "unit", "unit_name", "property", "cabin"]);
  const reference = pick(payload, ["booking_reference", "reference", "booking_id", "confirmation_code", "code"]);
  const channel = pick(payload, ["channel", "source", "booking_channel", "platform"]);
  const message = pick(payload, ["message", "text", "summary", "note", "body", "description", "request"]);
  const status = pick(payload, ["status", "state", "new_status", "booking_status"]);
  const previous = pick(payload, ["previous_status", "old_status", "from_status", "was"]);
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
    if (message) push("Note", excerpt(message));
    const head = [guest, room ? `room ${room}` : null].filter(Boolean).join(" · ");
    return {
      title: `${displayName} ${eventWords(eventType)}${head ? `: ${head}` : ""}`,
      lines,
    };
  }

  if (family === "payment") {
    const amount = money(payload);
    push("Amount", amount);
    push("Method", pick(payload, ["method", "payment_method", "card_brand"]));
    push("Status", status);
    push("Guest", guest);
    push("Reference", reference);
    const reason = pick(payload, ["failure_reason", "reason", "error", "decline_reason"]);
    push("Reason", reason ? excerpt(reason) : null);
    if (message && !reason) push("Note", excerpt(message));
    return {
      title: `${displayName} ${eventWords(eventType)}${amount ? `: ${amount}` : ""}`,
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
  const status = (pick(payload, ["status", "state", "new_status", "booking_status"]) ?? "").toLowerCase();
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

