// Vanta navigation model — four primary rooms, everything else is a desk that
// lives under a room. Pure data + helpers so navigation behaviour is testable
// without mounting the shell.

export type RoomKey = "today" | "work" | "ask" | "receipts";

/** Every surface the shell can render (mirrors SurfaceKey). */
export type SurfaceId =
  | RoomKey
  | "command"
  | "inbox"
  | "projects"
  | "briefs"
  | "schedule"
  | "memory"
  | "commitments"
  | "actions"
  | "awareness"
  | "sherlock";

export const PRIMARY_ROOMS: RoomKey[] = ["today", "work", "ask", "receipts"];

export const DEFAULT_SURFACE: SurfaceId = "today";

export const ROOM_LABEL: Record<RoomKey, string> = {
  today: "Today",
  work: "Work",
  ask: "Ask",
  receipts: "Receipts",
};

/**
 * Which room owns each specialist desk. Used so a deep-linked desk knows the
 * parent room to highlight and to fall back to on back-navigation.
 */
export const SURFACE_PARENT: Record<SurfaceId, RoomKey> = {
  today: "today",
  work: "work",
  ask: "ask",
  receipts: "receipts",
  // Work desks
  projects: "work",
  inbox: "work",
  briefs: "work",
  memory: "work",
  commitments: "work",
  schedule: "work",
  actions: "work",
  sherlock: "work",
  awareness: "work",
  command: "work",
};

/** Desks that are reachable but no longer compete in the primary nav. */
export const ADVANCED_SURFACES: SurfaceId[] = [
  "projects",
  "inbox",
  "briefs",
  "memory",
  "commitments",
  "schedule",
  "actions",
  "sherlock",
  "awareness",
  "command",
];

export function isPrimaryRoom(id: string): id is RoomKey {
  return (PRIMARY_ROOMS as string[]).includes(id);
}

export function isSurfaceId(id: string | null | undefined): id is SurfaceId {
  return !!id && Object.prototype.hasOwnProperty.call(SURFACE_PARENT, id);
}

/** The room to highlight in the primary nav for the active surface. */
export function roomForSurface(id: SurfaceId): RoomKey {
  return SURFACE_PARENT[id] ?? "today";
}

/**
 * Backward compatibility: old links used `?surface=`/`?tab=` and some legacy
 * keys are now rooms. Returns the surface to open, or null when the URL says
 * nothing about navigation.
 */
export function parseSurfaceFromSearch(search: string): SurfaceId | null {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const raw = params.get("surface") ?? params.get("tab");
  if (!raw) return null;
  const legacy: Record<string, SurfaceId> = {
    audit: "receipts",
    cockpit: "command",
    chat: "ask",
    companion: "ask",
    conversation: "ask",
  };
  const mapped = legacy[raw] ?? raw;
  return isSurfaceId(mapped) ? mapped : null;
}

/** Query string for a surface, omitted for the default front door. */
export function surfaceSearch(id: SurfaceId): string {
  return id === DEFAULT_SURFACE ? "" : `?surface=${id}`;
}
