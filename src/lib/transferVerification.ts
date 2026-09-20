import type { FlightPlan } from "./flightPlan";

export type LocalFactSource = "boarding_pass" | "departures_board" | "airline_staff" | "traveler";
export type BaggageStatus = "through_checked" | "collect_here" | "unknown";
export type TransferRoute = "airside_transfer" | "enter_country" | "unknown";

export type LocalTransferVerification = {
  gate?: string | null;
  boarding_time?: string | null;
  /** Off the pass in the traveller's hand. A feed never carries these. */
  seat?: string | null;
  zone?: string | null;
  baggage_status?: BaggageStatus | null;
  transfer_route?: TransferRoute | null;
  source: LocalFactSource;
  verified_at: string;
};

export const LOCAL_SOURCE_WORDS: Record<LocalFactSource, string> = {
  boarding_pass: "Boarding pass",
  departures_board: "Official departures board",
  airline_staff: "Airline staff",
  traveler: "Traveler report",
};

export function localTransferFacts(plan: FlightPlan | null | undefined): LocalTransferVerification | null {
  return plan?.noticed_from?.local_verification ?? null;
}

export function transferGuidanceKey(input: {
  airport: string;
  planId: string;
  confirmed: boolean;
  providerGate?: string | null;
  providerCheckedAt?: string | null;
  local?: LocalTransferVerification | null;
}): string {
  const local = input.local;
  return [
    input.airport,
    input.planId,
    input.confirmed ? "confirmed" : "candidate",
    input.providerGate ?? "",
    input.providerCheckedAt ?? "",
    local?.gate ?? "",
    local?.boarding_time ?? "",
    local?.baggage_status ?? "",
    local?.transfer_route ?? "",
    local?.verified_at ?? "",
  ].join("|");
}

export function gateProvenance(
  providerGate: string | null | undefined,
  local: LocalTransferVerification | null,
): { value: string; source: string; conflict: boolean } {
  const provider = (providerGate ?? "").trim().toUpperCase();
  const localGate = (local?.gate ?? "").trim().toUpperCase();
  if (localGate) {
    return {
      value: localGate,
      source: `${LOCAL_SOURCE_WORDS[local?.source ?? "traveler"]} · traveler-verified locally`,
      conflict: !!provider && provider !== localGate,
    };
  }
  if (provider) return { value: provider, source: "Provider-reported", conflict: false };
  return { value: "Not on record", source: "Check locally", conflict: false };
}

export function transferChecklist(input: {
  confirmed: boolean;
  providerGate?: string | null;
  local?: LocalTransferVerification | null;
}): Array<{ label: string; state: "known" | "check" | "waiting"; detail: string }> {
  const local = input.local;
  const gate = gateProvenance(input.providerGate, local);
  return [
    {
      label: "Onward flight",
      state: input.confirmed ? "known" : "waiting",
      detail: input.confirmed ? "On your journey" : "Still a proposal — review before adding",
    },
    {
      label: "Gate and boarding",
      state: gate.value !== "Not on record" && !!local?.boarding_time ? "known" : "check",
      detail: gate.conflict
        ? "Local gate and provider gate disagree"
        : gate.value === "Not on record"
          ? "Check the official board or airline staff"
          : `Gate ${gate.value}${local?.boarding_time ? ` · boarding ${local.boarding_time}` : " · boarding time not locally verified"}`,
    },
    {
      label: "Checked baggage",
      state: local?.baggage_status && local.baggage_status !== "unknown" ? "known" : "check",
      detail:
        local?.baggage_status === "through_checked"
          ? "Recorded as checked through"
          : local?.baggage_status === "collect_here"
            ? "Recorded to collect here"
            : "Not known — do not assume baggage claim",
    },
    {
      label: "Transfer route",
      state: local?.transfer_route && local.transfer_route !== "unknown" ? "known" : "check",
      detail:
        local?.transfer_route === "airside_transfer"
          ? "Airside transfer locally verified"
          : local?.transfer_route === "enter_country"
            ? "Airport entry route locally verified"
            : "Follow Transfer signs and confirm the required steps",
    },
  ];
}