// googleHealth — one word per Google service, decided in one place.
//
// Doctrine:
//   - A service nobody switched on is never a problem. It stays available.
//   - A problem belongs to the one service that had it. A refused Gmail call can
//     never make Calendar or Drive look broken.
//   - Only something that was working and stopped may say "needs you".
// Pure module: no IO, no Deno globals.

import { GOOGLE_CONNECTOR_IDS, type GoogleConnectorId } from "./appUserScopes.ts";

export type GoogleServiceStatus = {
  service: GoogleConnectorId;
  connected: boolean;
  offerable: boolean;
  account: string | null;
  failing: boolean;
  detail: string | null;
};

export type ConnectionRow = {
  connector_id: string;
  account_label: string | null;
  last_error: string | null;
};

const FAILING_LINE: Record<GoogleConnectorId, string> = {
  google_calendar: "Google stopped answering for your calendar.",
  google_mail: "Google stopped answering for your mail. Switch it on again.",
  google_drive: "Google stopped answering for your files. Switch it on again.",
};

/**
 * @param rows this person's own connections, one per granted service
 * @param offerable which services this app is wired to offer at all
 * @param calendarSyncError the recorded calendar sync failure, if any
 */
export function googleServiceStatuses(input: {
  rows: ConnectionRow[];
  offerable: (service: GoogleConnectorId) => boolean;
  calendarSyncError?: string | null;
}): GoogleServiceStatus[] {
  const mine = new Map(input.rows.map((r) => [r.connector_id, r]));
  return GOOGLE_CONNECTOR_IDS.map((service) => {
    const row = mine.get(service);
    const connected = !!row;
    const own = row?.last_error ?? null;
    const problem = service === "google_calendar"
      ? own || (input.calendarSyncError ?? null)
      : own;
    const failing = connected && !!problem;
    return {
      service,
      connected,
      offerable: input.offerable(service),
      account: row?.account_label ?? null,
      failing,
      detail: failing ? FAILING_LINE[service] : null,
    };
  });
}
