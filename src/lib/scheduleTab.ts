// scheduleTab — open a specific Schedule desk without reloading the app.
//
// The Work tiles used to link to "/?surface=schedule&tab=money", which made the
// browser throw the whole app away and rebuild it (the black gap). Now the tile
// asks for the desk in place: the request is parked here and the Schedule room
// picks it up, whether it is already open or mounting for the first time.

export const SCHEDULE_TAB_EVENT = "vanta:schedule-tab";

let pending: string | null = null;

/** Ask Schedule to open one of its desks. */
export function requestScheduleTab(tab: string): void {
  pending = tab;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(SCHEDULE_TAB_EVENT, { detail: tab }));
}

/** Consume a parked request. Returns null when there is none. */
export function takeScheduleTab(): string | null {
  const t = pending;
  pending = null;
  return t;
}
