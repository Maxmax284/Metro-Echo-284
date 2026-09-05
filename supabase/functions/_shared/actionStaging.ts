// actionStaging — the ONE place an action row is born.
//
// Every surface that drafts something consequential (Ask, the widget, Telegram,
// Sherlock, documents, capture lanes) builds its row here. Nothing in this file
// executes: it only produces a row in a pre-approval state. The staged →
// approved → executed gate stays where it always was (actions-transition /
// actions-execute).
//
// Why this exists: the risk vocabulary and the scope keys were being retyped at
// a dozen call sites, and two of those vocabularies didn't match the database.

/** The only risk values the database accepts (enum `action_risk`). */
export const ACTION_RISKS = ["low_reversible", "standard", "high"] as const;
export type ActionRisk = (typeof ACTION_RISKS)[number];

/** The only states an action may be born in. Never "approved", never "executed". */
export const STAGE_STATUSES = ["proposed", "staged"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

/**
 * Accepts every risk word any surface has ever used and returns a real one.
 * `low`/`medium` came from older call sites and are not database values.
 */
export function normalizeRisk(input: unknown): ActionRisk {
  const raw = String(input ?? "").trim().toLowerCase();
  switch (raw) {
    case "high":
    case "critical":
    case "irreversible":
      return "high";
    case "low":
    case "low_reversible":
    case "reversible":
    case "trivial":
      return "low_reversible";
    case "standard":
    case "medium":
    case "normal":
    case "":
      return "standard";
    default:
      return "standard";
  }
}

export function normalizeStageStatus(input: unknown): StageStatus {
  return String(input ?? "").trim().toLowerCase() === "proposed" ? "proposed" : "staged";
}

export type StageActionInput = {
  title: string;
  description?: string | null;
  /** Any risk word; normalized to a database value. */
  risk?: unknown;
  /** "staged" (ready for approval) or "proposed" (a looser draft). */
  status?: unknown;
  /** Where the draft came from: "telegram", "ask", "sherlock", a note id… */
  source: string;
  payload?: Record<string, unknown> | null;
};

export type ActionRow = {
  user_id: string;
  organization_id: string | null;
  title: string;
  description: string | null;
  risk: ActionRisk;
  status: StageStatus;
  source: string;
  payload?: Record<string, unknown> | null;
};

/** Build the row. Callers insert it; they never assemble it themselves. */
export function buildActionRow(
  input: StageActionInput & { userId: string; organizationId?: string | null },
): ActionRow {
  const row: ActionRow = {
    user_id: input.userId,
    organization_id: input.organizationId ?? null,
    title: String(input.title ?? "").trim().slice(0, 200) || "Untitled action",
    description: input.description ? String(input.description).slice(0, 4000) : null,
    risk: normalizeRisk(input.risk),
    status: normalizeStageStatus(input.status),
    source: String(input.source ?? "unknown"),
  };
  if (input.payload) row.payload = input.payload;
  return row;
}

/** An action row can never be born executable. Kept as a testable invariant. */
export function bornApproved(row: ActionRow): false | true {
  return !(STAGE_STATUSES as readonly string[]).includes(row.status);
}
