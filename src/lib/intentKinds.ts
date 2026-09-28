// intentKinds — the one place that says which tool calls can ever look like
// an approval draft.
//
// Doctrine: reads are frictionless by law; consequential writes are proposed
// by law. This is an allow-list for staging, not a growing list of exceptions
// for quiet reads — a model misfire, an unknown tool name or a half-parsed
// call can never produce "Drafted for approval".

/** Tool calls whose result proposes a real change and therefore may say it
    is waiting for approval. Anything not listed here never stages. */
const STAGEABLE_INTENTS = new Set(["stage_action", "stage_calendar_change", "refine_calendar_change"]);

/** True when an intent is allowed to render the staged-approval line. */
export function intentStagesApproval(name: string): boolean {
  return STAGEABLE_INTENTS.has(name);
}

/** The line a real staged proposal earns — and the only line that may carry
    that wording. */
export function stagedApprovalLine(name: string, args?: Record<string, unknown>): string {
  if (!intentStagesApproval(name)) return "";
  const a = (args ?? {}) as Record<string, unknown>;
  const what = String(a.title ?? a.summary ?? a.text ?? a.reference ?? "").trim();
  return `Drafted for approval${what ? `: ${what}` : ""}. Nothing has run.`;
}
