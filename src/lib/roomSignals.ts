import type { RoomKey, SurfaceId } from "@/lib/navigation";

export type RoomSignalTone = "context" | "attention" | "critical" | "complete";

export type RoomSignal = {
  room: RoomKey;
  tone: RoomSignalTone;
  label: string;
  target: SurfaceId;
  situationId?: string | null;
  dedupeKey?: string | null;
  fresh?: boolean;
};

export type SignalNudge = {
  id: string;
  kind: string;
  title: string;
  priority: number;
  related_entity_type: string | null;
  related_entity_id: string | null;
  dedupe_key: string | null;
  status: string;
};

export type SignalAction = { id: string; title: string; status: string };

const WORK_TARGET: Record<string, SurfaceId> = {
  action: "actions",
  commitment: "commitments",
  project: "projects",
  document: "briefs",
};

/** One signal per room. State beats counts; absent means calm. */
export function deriveRoomSignals(input: {
  nudges: SignalNudge[];
  actions: SignalAction[];
  askContext?: { label: string; fresh?: boolean } | null;
  completion?: { id: string; label: string; fresh?: boolean } | null;
}): Partial<Record<RoomKey, RoomSignal>> {
  const out: Partial<Record<RoomKey, RoomSignal>> = {};
  const nudge = input.nudges
    .filter((row) => row.status === "pending")
    .sort((a, b) => b.priority - a.priority)[0];

  if (nudge) {
    const target = WORK_TARGET[nudge.related_entity_type ?? ""] ?? "today";
    out.today = {
      room: "today",
      tone: nudge.priority >= 95 ? "critical" : "attention",
      label: nudge.title,
      target,
      situationId: nudge.related_entity_id ?? nudge.id,
      dedupeKey: nudge.dedupe_key,
      fresh: true,
    };
  }

  const action = input.actions.find((row) => row.status === "staged" || row.status === "proposed");
  if (action) {
    out.work = {
      room: "work",
      tone: "attention",
      label: action.title,
      target: "actions",
      situationId: action.id,
      fresh: true,
    };
  }

  if (input.askContext) {
    out.ask = {
      room: "ask",
      tone: "context",
      label: input.askContext.label,
      target: "ask",
      situationId: "environment-edge",
      fresh: input.askContext.fresh,
    };
  }

  if (input.completion) {
    out.receipts = {
      room: "receipts",
      tone: "complete",
      label: input.completion.label,
      target: "receipts",
      situationId: input.completion.id,
      fresh: input.completion.fresh,
    };
  }
  return out;
}

const DISCOVERY_PREFIX = "metro.discovery.";

export function discoveryKey(kind: string, identity: string): string {
  return `${DISCOVERY_PREFIX}${kind}:${identity}`;
}

export function discoveryWasSeen(storage: Pick<Storage, "getItem">, key: string): boolean {
  return storage.getItem(key) === "seen";
}

export function markDiscoverySeen(storage: Pick<Storage, "setItem">, key: string): void {
  storage.setItem(key, "seen");
}