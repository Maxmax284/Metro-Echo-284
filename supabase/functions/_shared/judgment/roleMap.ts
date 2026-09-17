// roleMap — Metro Echo sits above the other products, it does not absorb them.
//
// Doctrine:
//   - One plain map so a signal is understood in the right life or work domain.
//     A guest complaint is hospitality. A gate reader failing is trust. They do
//     not get read the same way.
//   - No duplicate domain dashboard inside Metro Echo. Signals from these
//     systems surface only through Today / Work / Ask / Receipts.
//   - Connection status is a recorded fact. An inbound door existing is not the
//     same as a platform being connected, and Echo says which is which.
//
// Pure module.

export type PlatformId = "campstay" | "campcore" | "fenrir" | "fightiq" | "soicat" | "opsledger";

export type PlatformRole =
  | "hospitality"
  | "gym_operations"
  | "security_trust"
  | "training_analysis"
  | "language_culture"
  | "financial_clarity";

export type ConnectionState =
  /** A signal has actually arrived from it. */
  | "connected"
  /** The inbound door is built and waiting; nothing has come through. */
  | "seam_ready"
  /** Only mapped conceptually. Nothing is wired. */
  | "mapped_only";

export type PlatformFacts = {
  /** Inbound edge function exists for this platform. */
  seam: boolean;
  /** At least one inbound event has been recorded. */
  received: boolean;
};

export type PlatformRow = {
  id: PlatformId;
  label: string;
  role: PlatformRole;
  /** What its signals mean, in the person's terms. */
  plain: string;
  state: ConnectionState;
  /** What Echo will never do with it. */
  limit: string;
};

const SPEC: Array<Omit<PlatformRow, "state">> = [
  {
    id: "campstay",
    label: "CampStay",
    role: "hospitality",
    plain: "Guest and stay operations. A guest issue is read as hospitality work, not personal admin.",
    limit: "Echo reads its signals. It does not run bookings, rooms or guest messaging.",
  },
  {
    id: "campcore",
    label: "CampCore",
    role: "gym_operations",
    plain: "Gym, fighter and staff operations. A schedule change is read against training and staffing.",
    limit: "Echo reads its signals. Booking, payment and waiver logic stays inside CampCore.",
  },
  {
    id: "fenrir",
    label: "Fenrir",
    role: "security_trust",
    plain: "Security, access and trust events. An access failure is read as a trust matter.",
    limit: "Echo reads its signals. It grants nothing, revokes nothing and never escalates on its own.",
  },
  {
    id: "fightiq",
    label: "Fight IQ",
    role: "training_analysis",
    plain: "Fight and training analysis. Camp load is read against the week's shape.",
    limit: "Echo reads its signals. It does not coach, prescribe or judge performance.",
  },
  {
    id: "soicat",
    label: "SoiCat",
    role: "language_culture",
    plain: "Language and cultural translation. Local wording is read as context, not as instruction.",
    limit: "Echo reads its signals. It does not generalise about people or places.",
  },
  {
    id: "opsledger",
    label: "OpsLedger",
    role: "financial_clarity",
    plain: "Financial clarity. A money signal is read against dated obligations.",
    limit: "Echo reads its signals. It never moves money and never gives financial advice.",
  },
];

export function platformRoles(facts: Partial<Record<PlatformId, PlatformFacts>>): PlatformRow[] {
  return SPEC.map((spec) => {
    const f = facts[spec.id];
    const state: ConnectionState = f?.received ? "connected" : f?.seam ? "seam_ready" : "mapped_only";
    return { ...spec, state };
  });
}

export function roleOf(id: PlatformId): PlatformRole | null {
  return SPEC.find((s) => s.id === id)?.role ?? null;
}

/** Which life/work domain a signal from a platform belongs in. */
export function domainForSource(source: string): PlatformRole | null {
  const key = source.toLowerCase();
  const hit = SPEC.find((s) => key.includes(s.id) || key.includes(s.label.toLowerCase().replace(/\s+/g, "")));
  return hit?.role ?? null;
}

const STATE_WORDS: Record<ConnectionState, string> = {
  connected: "connected",
  seam_ready: "door open, nothing through it yet",
  mapped_only: "mapped only, not wired",
};

export function roleMapBlock(rows: PlatformRow[]): string {
  return [
    "Other platforms and what their signals mean (recorded fact — never claim one is connected when it is not):",
    ...rows.map((r) => `- ${r.label} (${r.role.replace(/_/g, " ")}): ${STATE_WORDS[r.state]}. ${r.plain} ${r.limit}`),
    "Metro Echo is the context layer above these. Their signals surface only through Today, Work, Ask and Receipts. Never build or imply a separate room for one of them.",
  ].join("\n");
}
