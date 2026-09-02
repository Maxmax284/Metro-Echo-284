// connections — one honest state per connection, and the proof line under it.
//
// Doctrine: a connection card may only ever say one of six things, and it must
// back that word with evidence Vanta actually recorded. "Connected" without a
// last-received time is a claim, not a state. Off means off — never a zero,
// never an empty chart that reads like bad news.
//
// Pure module: no IO, no React. Surfaces pass in what they read.

export type ConnState =
  | "connected"
  | "partial"
  | "needs_setup"
  | "off"
  | "attention"
  | "no_data";

export const CONN_LABEL: Record<ConnState, string> = {
  connected: "Connected",
  partial: "Partly connected",
  needs_setup: "Needs setup",
  off: "Switched off",
  attention: "Needs attention",
  no_data: "No data yet",
};

/** Tone classes only — never the sole carrier of meaning; the word is always shown. */
export const CONN_TONE: Record<ConnState, string> = {
  connected: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  partial: "bg-primary/15 text-primary ring-primary/30",
  needs_setup: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  off: "bg-muted/40 text-muted-foreground ring-border/60",
  attention: "bg-destructive/15 text-destructive ring-destructive/30",
  no_data: "bg-muted/40 text-muted-foreground ring-border/60",
};

/**
 * One status lamp per connection row — the panel-light reading you can take in
 * without reading. Tone only: the word from CONN_LABEL is always shown next to
 * it, so nobody has to decode a colour.
 */
export const CONN_LAMP: Record<ConnState, string> = {
  connected: "bg-emerald-400 shadow-[0_0_6px_hsl(var(--primary)/0)]",
  partial: "bg-primary",
  needs_setup: "bg-amber-400",
  off: "bg-muted-foreground/40",
  attention: "bg-destructive",
  no_data: "bg-muted-foreground/40",
};


const MIN = 60_000;

/** "2m ago" / "yesterday" — the age of a real recorded moment. */
export function ago(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const m = Math.round((now - t) / MIN);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** `Last received · 2m ago`, or the honest absence. */
export function proofLine(
  verb: string,
  iso: string | null | undefined,
  never: string,
  now = Date.now(),
): string {
  const rel = ago(iso, now);
  return rel ? `${verb} · ${rel}` : never;
}

export type ConnectionCard = {
  key: string;
  label: string;
  /** What this connection does, in one plain line. */
  blurb: string;
  state: ConnState;
  /** Evidence, not a claim. Always present. */
  proof: string;
  /** Extra recorded facts — capture state, direction, consent. Optional. */
  facts?: string[];
  /** What to do when the state is not "connected". Plain English. */
  fix?: string;
};

/* ---------------------------------------------------------------- Telegram */

export function telegramCard(input: {
  linked: boolean;
  lastInAt: string | null;
  captureOn: boolean;
  remindersOn: boolean;
  botConfigured: boolean;
}, now = Date.now()): ConnectionCard {
  const facts = [
    `Capture · ${input.captureOn ? "on" : "off"}`,
    `Reminder controls · ${input.remindersOn ? "on" : "off"}`,
    "Execution · never",
  ];
  let state: ConnState = "connected";
  let fix: string | undefined;
  if (!input.botConfigured) {
    state = "needs_setup";
    fix = "The connection key is missing, so the bot cannot be reached yet.";
  } else if (!input.linked) {
    state = "needs_setup";
    fix = "The bot is reachable, but this chat is not linked. Send it /link to pair.";
  } else if (!input.lastInAt) {
    state = "no_data";
    fix = "Chat is linked. Vanta has not received a message from it yet — send one to prove the path.";
  } else if (!input.captureOn) {
    state = "partial";
    fix = "Messages arrive but capture is switched off, so nothing is being kept.";
  }
  return {
    key: "telegram",
    label: "Telegram",
    blurb: "Messages and photos arrive as captures. Nothing runs from chat.",
    state,
    proof: proofLine("Last received", input.lastInAt, "Never received a message", now),
    facts,
    fix,
  };
}

/* ------------------------------------------------------------------- Email */

export function emailCard(input: {
  addressActive: boolean;
  lastReceivedAt: string | null;
}, now = Date.now()): ConnectionCard {
  const state: ConnState = !input.addressActive
    ? "needs_setup"
    : input.lastReceivedAt
      ? "connected"
      : "no_data";
  return {
    key: "email",
    label: "Email",
    blurb: "Forward mail to your Vanta address and it lands as a note with its attachments.",
    state,
    proof: proofLine("Last received", input.lastReceivedAt, "Never received mail", now),
    facts: ["Direction · inbound only"],
    fix: !input.addressActive
      ? "No inbound address is active yet. Create one, then forward a message to it."
      : input.lastReceivedAt
        ? undefined
        : "Address is live. Forward one real email to prove the path.",
  };
}

/* ---------------------------------------------------------------- Calendar */

export function calendarCard(input: {
  feeds: number;
  activeFeeds: number;
  lastSyncedAt: string | null;
  brokenFeeds: number;
}, now = Date.now()): ConnectionCard {
  let state: ConnState = "connected";
  let fix: string | undefined;
  if (input.feeds === 0) {
    state = "needs_setup";
    fix = "No calendar is linked. Paste a read-only calendar link to start.";
  } else if (input.brokenFeeds > 0) {
    state = "attention";
    fix = `${input.brokenFeeds} calendar${input.brokenFeeds === 1 ? "" : "s"} failed on the last check. Open Calendars to see why.`;
  } else if (input.activeFeeds === 0) {
    state = "off";
    fix = "Every linked calendar is switched off, so nothing is being read.";
  } else if (!input.lastSyncedAt) {
    state = "no_data";
    fix = "Linked but never checked yet. Run Sync now to prove it reads.";
  }
  return {
    key: "calendar",
    label: "Calendar",
    blurb: "Read-only feeds. Vanta sees your meetings and never writes back.",
    state,
    proof: proofLine("Last sync", input.lastSyncedAt, "Never synced", now),
    facts: [`Direction · read-only`, `${input.activeFeeds} of ${input.feeds} feed${input.feeds === 1 ? "" : "s"} on`],
    fix,
  };
}

/* --------------------------------------------------------------- Wearables */

export function wearableCard(input: {
  heartConsent: boolean;
  activityConsent: boolean;
  lastReadingAt: string | null;
  lastSource: string | null;
}, now = Date.now()): ConnectionCard {
  const consents = [input.heartConsent, input.activityConsent].filter(Boolean).length;
  let state: ConnState;
  let fix: string | undefined;
  if (consents === 0) {
    state = "off";
    fix = "Both switches are off: nothing is read, nothing is stored.";
  } else if (!input.lastReadingAt) {
    state = "no_data";
    fix = "Consent is on but no reading has arrived. Connect a strap or set up the phone hand-off.";
  } else if (consents === 1) {
    state = "partial";
    fix = input.heartConsent
      ? "Heart rate is on, daily activity is off."
      : "Daily activity is on, heart rate is off.";
  } else {
    state = "connected";
  }
  const facts = [
    `Heart rate · ${input.heartConsent ? "on" : "off"}`,
    `Daily activity · ${input.activityConsent ? "on" : "off"}`,
    input.lastSource ? `Last source · ${sourceLabel(input.lastSource)}` : "No source yet",
    "Body data changes how Vanta speaks, never what it decides.",
  ];
  return {
    key: "wearables",
    label: "Wearables and body context",
    blurb: "Heart rate, steps, sleep and workouts, only with your consent.",
    state,
    proof: proofLine("Last reading", input.lastReadingAt, "No readings yet", now),
    facts,
    fix,
  };
}

/** How a reading got here, in words. Manual is labelled as manual, always. */
export function sourceLabel(source: string | null | undefined): string {
  switch ((source ?? "").toLowerCase()) {
    case "bluetooth": return "Bluetooth strap";
    case "shortcut":
    case "phone":
    case "health": return "Phone health data";
    case "manual": return "Entered by hand";
    case "sweep": return "Daily sweep";
    default: return source ? source : "Unknown";
  }
}

/* -------------------------------------------------- Hub / external platform */

export function platformCard(input: {
  key: string;
  label: string;
  blurb: string;
  enabled: boolean;
  lastAt: string | null;
  count7d?: number;
}, now = Date.now()): ConnectionCard {
  const state: ConnState = !input.enabled
    ? "off"
    : input.lastAt
      ? "connected"
      : "no_data";
  return {
    key: input.key,
    label: input.label,
    blurb: input.blurb,
    state,
    proof: proofLine("Last received", input.lastAt, "Never linked", now),
    facts: typeof input.count7d === "number" ? [`${input.count7d} in the last 7 days`] : undefined,
    fix: !input.enabled
      ? "Switched off. Turn it on to let captures arrive."
      : input.lastAt
        ? undefined
        : "On, but nothing has arrived yet from this platform.",
  };
}

/* ------------------------------------------------------- Device families */

export type DeviceFamilyKey = "bluetooth" | "phone_health" | "imported" | "manual";

export type DeviceFamily = {
  key: DeviceFamilyKey;
  label: string;
  /** What this route actually is. */
  what: string;
  /** Honest examples. Never implies support that does not exist. */
  examples: string[];
  /** True when Vanta can do this today. */
  supported: boolean;
  /** The honest caveat, if there is one. */
  caveat?: string;
};

export const DEVICE_FAMILIES: DeviceFamily[] = [
  {
    key: "bluetooth",
    label: "Direct Bluetooth",
    what: "Live heart rate read in the browser while the connect page is open.",
    examples: ["Chest straps", "Armbands", "Watches that broadcast heart rate"],
    supported: true,
    caveat: "Reads only while the page is open, and the device has to broadcast heart rate. An Apple Watch will not.",
  },
  {
    key: "phone_health",
    label: "Phone health data",
    what: "Your phone posts steps, sleep and workouts to a private link on a schedule.",
    examples: ["Apple Health via Shortcuts", "Android Health Connect via automation"],
    supported: true,
    caveat: "Set up once, then it runs on its own. This is the route that builds history.",
  },
  {
    key: "imported",
    label: "Imported accounts",
    what: "Pulling history straight from a vendor account.",
    examples: ["Fitbit", "Garmin", "Oura", "WHOOP"],
    supported: false,
    caveat: "Not directly connected yet. Send the same data through phone health data instead.",
  },
  {
    key: "manual",
    label: "By hand",
    what: "Type a reading in yourself.",
    examples: ["Sleep hours", "Steps", "A workout you just finished"],
    supported: true,
    caveat: "Always labelled as entered by hand, so it never passes as a sensor reading.",
  },
];
