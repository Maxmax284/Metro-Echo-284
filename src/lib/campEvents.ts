// campEvents — hydrate a bridge capture (LMT Camp State, CampCore, Fenrir,
// website forms) from its stored payload into a structured operational event.
//
// Doctrine: nothing is invented. Every field comes from `metadata.external_payload`
// that the webhook already stored. When a field is genuinely absent it is named
// as a missing backend field rather than paraphrased as "not provided".
//
// This is read-only shaping. It never routes, never executes.

export type EventDisposition =
  | "no_action"
  | "needs_review"
  | "action_suggested"
  | "missing_data"
  | "error"
  | "synced";

export type EventConfidence = "high" | "medium" | "low";

export type OperationalFact = { label: string; value: string };

export type OperationalEvent = {
  platform: string;
  platformLabel: string;
  eventType: string;
  family: string;
  /** Short scannable reference (first uuid segment) and the full id for deep links. */
  ref: string | null;
  refFull: string | null;
  guest: string | null;
  room: string | null;
  stay: string | null;
  previousState: string | null;
  newState: string | null;
  amount: string | null;
  method: string | null;
  paymentKind: string | null;
  balance: string | null;
  actor: string | null;
  reason: string | null;
  /** Event time in Thailand (Asia/Bangkok) — the operator's clock. */
  localTime: string;
  facts: OperationalFact[];
  missing: string[];
  confidence: EventConfidence;
  disposition: EventDisposition;
  needsReview: boolean;
  /** One-line headline for the card. */
  headline: string;
  /** Plain-English one-liner: what happened and whether anything is needed. */
  summary: string;
  /** Grouping key: same booking + same event family collapse together. */
  groupKey: string;
  groupLabel: string;
};

const PLATFORM_LABELS: Record<string, string> = {
  ground_truth_hub: "LMT Camp State",
  campcore: "CampCore",
  fenrir_lock: "Fenrir Lock",
  website_forms: "Website",
};

const DISPOSITION_LABEL: Record<EventDisposition, string> = {
  no_action: "No action needed",
  needs_review: "Needs review",
  action_suggested: "Action suggested",
  missing_data: "Missing data",
  error: "Error",
  synced: "Synced",
};

export function dispositionLabel(d: EventDisposition): string {
  return DISPOSITION_LABEL[d];
}

/** Tailwind-safe chip classes for each status. Kept token-based, no raw colours. */
export function dispositionChipClass(d: EventDisposition): string {
  switch (d) {
    case "error":
      return "bg-destructive/15 text-destructive ring-destructive/40";
    case "action_suggested":
      return "bg-warn/15 text-warn ring-warn/40";
    case "missing_data":
    case "needs_review":
      return "bg-accent/15 text-accent ring-accent/40";
    case "synced":
      return "bg-primary/10 text-primary ring-primary/30";
    default:
      return "bg-muted/30 text-muted-foreground ring-border/60";
  }
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function pick(p: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = str(p[k]);
    if (v) return v;
  }
  return null;
}

export function shortRef(value: string): string {
  const clean = value.trim();
  return /^[0-9a-f-]{20,}$/i.test(clean) ? clean.slice(0, 8) : clean;
}

function humanState(v: string | null): string | null {
  if (!v) return null;
  return v.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function money(p: Record<string, unknown>): string | null {
  const amount = pick(p, ["amount", "amount_paid", "total", "total_price", "total_amount", "price", "amount_due"]);
  if (!amount) return null;
  const currency = pick(p, ["currency", "currency_code"]);
  const num = Number(amount);
  const shown = Number.isFinite(num) ? num.toLocaleString("en-US") : amount;
  return currency ? `${shown} ${currency.toUpperCase()}` : `฿${shown}`;
}

/** Thailand time — the operator's clock, stated explicitly. */
export function bangkokTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso)) + " Thailand time";
  } catch {
    return new Date(iso).toISOString();
  }
}

function paymentMethod(p: Record<string, unknown>): string | null {
  const direct = pick(p, ["method", "payment_method", "provider", "card_brand", "gateway"]);
  if (direct) return direct;
  const session = pick(p, ["session_id", "stripe_session_id", "payment_intent", "charge_id"]);
  if (session && /^(cs_|pi_|ch_)/i.test(session)) return "Stripe";
  return null;
}

/**
 * Hydrate a capture row's metadata into an operational event.
 * Returns null for ordinary captures (typed notes, Telegram text, files).
 */
export function hydrateOperationalEvent(
  metadata: any,
  createdAt: string,
): OperationalEvent | null {
  const meta = metadata ?? {};
  const platform = str(meta.source_platform);
  const eventType = str(meta.event_type);
  if (!platform || !eventType) return null;
  const p = (meta.external_payload && typeof meta.external_payload === "object"
    ? meta.external_payload
    : {}) as Record<string, unknown>;

  const platformLabel = PLATFORM_LABELS[platform] ?? platform.replace(/_/g, " ");
  const family = eventType.split(".")[0];

  const refFull = pick(p, ["booking_reference", "reference", "booking_id", "reservation_id", "confirmation_code", "code"]);
  const guest = pick(p, ["guest_name", "guest", "customer_name", "name", "member_name"]);
  const roomRaw = pick(p, ["room", "room_name", "unit", "unit_name", "unit_label", "room_type", "property", "cabin", "unit_id"]);
  const room = roomRaw ? (roomRaw.length > 20 ? `Unit ${shortRef(roomRaw)}` : roomRaw) : null;
  const newState = humanState(pick(p, ["status", "state", "new_status", "new_state", "to_status", "to_state", "booking_status"]));
  const previousState = humanState(pick(p, ["previous_status", "previous_state", "old_status", "old_state", "from_status", "from_state", "was"]));
  const checkIn = pick(p, ["check_in", "checkin", "start_date", "arrival"]);
  const checkOut = pick(p, ["check_out", "checkout", "end_date", "departure"]);
  const stay = checkIn && checkOut ? `${checkIn.slice(0, 10)} → ${checkOut.slice(0, 10)}` : checkIn ?? null;
  const amount = money(p);
  const method = paymentMethod(p);
  const paymentKind = pick(p, ["payment_kind", "kind", "deposit_or_balance", "label"]);
  const balBefore = pick(p, ["previous_balance", "old_balance", "balance_before"]);
  const balAfter = pick(p, ["balance", "new_balance", "balance_after", "balance_due"]);
  const balance = balBefore && balAfter ? `${balBefore} → ${balAfter}` : balAfter;
  const actor = pick(p, [
    "actor", "actor_name", "changed_by", "changed_by_name", "updated_by",
    "created_by", "staff_name", "staff", "user_name", "initiated_by", "source_actor",
  ]);
  const reason = pick(p, ["reason", "note", "comment", "cancellation_reason", "change_reason"]);
  const guests = pick(p, ["guests", "num_guests", "party_size", "pax", "people", "headcount"]);

  // What is genuinely absent from the backend payload.
  const missing: string[] = [];
  if (family === "booking") {
    if (!refFull) missing.push("booking_id");
    if (!guest) missing.push("guest_name");
    if (!roomRaw) missing.push("room");
    if (eventType !== "booking.created") {
      if (!previousState) missing.push("previous_state");
      if (!newState) missing.push("state");
    }
    if (!actor) missing.push("actor");
  } else if (family === "payment") {
    if (!amount) missing.push("amount");
    if (!refFull) missing.push("booking_id");
    if (!method) missing.push("payment_method");
    if (!guest) missing.push("guest_name");
  }

  const hard = missing.filter((m) => m === "booking_id" || m === "amount" || m === "state");
  const cancelling = /cancel|no.?show|refund|dispute|chargeback/i.test(newState ?? "");
  const failed = /fail|declin|error/i.test(eventType) || /fail|declin/i.test(newState ?? "");

  const confidence: EventConfidence = hard.length ? "low" : missing.length ? "medium" : "high";
  const disposition: EventDisposition =
    eventType === "integration.test" ? "synced"
    : failed ? "error"
    : hard.length ? "missing_data"
    : cancelling ? "action_suggested"
    : family === "guest_message" || family === "guest_request" || family === "member_request" ? "needs_review"
    : "no_action";

  const facts: OperationalFact[] = [];
  const add = (label: string, value: string | null) => { if (value) facts.push({ label, value }); };
  add("Guest", guest);
  add("Booking", refFull ? `#${shortRef(refFull)}` : null);
  add("Room", room);
  add("Stay", stay);
  add("Guests", guests);
  if (previousState && newState) add("State", `${previousState} → ${newState}`);
  else add("State", newState);
  add("Amount", amount);
  add("Method", method);
  add("Kind", paymentKind);
  add("Balance", balance);
  add("Changed by", actor);
  add("Reason", reason);

  const who = guest ?? (refFull ? `Booking #${shortRef(refFull)}` : "A booking");
  const where = room ? ` — ${room}` : "";
  const localTime = bangkokTime(createdAt);

  let headline: string;
  let summary: string;
  if (eventType === "booking.created") {
    headline = `${who}${where} — new booking`;
    summary = `${who} booked${room ? ` ${room}` : ""}${stay ? ` for ${stay}` : ""}${amount ? `, ${amount}` : ""}. Recorded at ${localTime}.`;
  } else if (family === "booking") {
    headline = previousState && newState
      ? `${who}${where} — ${previousState} → ${newState}`
      : `${who}${where} — booking updated`;
    summary = previousState && newState
      ? `${who}${room ? ` (${room})` : ""} moved from ${previousState} to ${newState}${actor ? ` by ${actor}` : ""} at ${localTime}.`
      : `${who} was updated${actor ? ` by ${actor}` : ""} at ${localTime}.`;
    if (cancelling) summary += " Cancellation — the day's plan changed.";
    else if (!missing.length) summary += " No issue detected.";
  } else if (family === "payment") {
    headline = `${who} — payment ${amount ?? "received"}${failed ? " failed" : ""}`;
    summary = failed
      ? `Payment${amount ? ` of ${amount}` : ""} for ${who} failed${reason ? `: ${reason}` : ""} at ${localTime}.`
      : `${amount ?? "A payment"} received for ${who}${method ? ` via ${method}` : ""} at ${localTime}.${balance ? ` Balance ${balance}.` : ""}`;
  } else if (eventType === "integration.test") {
    headline = `${platformLabel} connection test`;
    summary = `${platformLabel} reached Echo at ${localTime}. Nothing to act on.`;
  } else {
    const msg = pick(p, ["message", "text", "summary", "note", "body", "description", "request"]);
    headline = msg ? msg.slice(0, 90) : `${platformLabel} ${eventType.replace(/[._]/g, " ")}`;
    summary = `${platformLabel} sent ${eventType.replace(/[._]/g, " ")} at ${localTime}.`;
  }

  if (disposition === "missing_data") {
    summary += ` ${platformLabel} did not send ${hard.join(", ")} — without it this can't be tied to a booking.`;
  }

  const groupKey = `${platform}:${eventType}:${refFull ?? "unlinked"}`;
  const groupLabel = `${platformLabel} ${eventType.replace(/[._]/g, " ")}${refFull ? ` · #${shortRef(refFull)}` : ""}`;

  return {
    platform, platformLabel, eventType, family,
    ref: refFull ? shortRef(refFull) : null,
    refFull,
    guest, room, stay, previousState, newState,
    amount, method, paymentKind, balance, actor, reason,
    localTime, facts, missing, confidence, disposition,
    needsReview: disposition === "error" || disposition === "missing_data"
      || disposition === "action_suggested" || disposition === "needs_review",
    headline, summary, groupKey, groupLabel,
  };
}

/**
 * The text handed to Sherlock / the advisor. Structured facts, not a title
 * string, so it stops asking for data the payload already carried.
 */
export function operationalBrief(ev: OperationalEvent): string {
  const lines = [
    `Source: ${ev.platformLabel} (${ev.eventType})`,
    `What happened: ${ev.summary}`,
    ...ev.facts.map((f) => `${f.label}: ${f.value}`),
    `Recorded: ${ev.localTime}`,
    `Confidence: ${ev.confidence}`,
  ];
  if (ev.missing.length) {
    lines.push(`Fields the source did not send: ${ev.missing.join(", ")}`);
  }
  lines.push("Do not ask for fields listed above as present. Nothing may execute from this capture.");
  return lines.join("\n");
}
