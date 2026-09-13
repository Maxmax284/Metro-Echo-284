// The exact permissions Echo asks each person for, declared once so consent and
// later calls can never drift apart.
//
// Doctrine this file holds:
//   - One Google account in the UI, one separate grant per service underneath.
//     Signing in never means "Echo can see everything Google holds".
//   - Reading never implies writing. Gmail sending is its own scope, asked for
//     only when a person actually tries to send something.
//   - A credential issued for one Google product only authorises that product,
//     so each service is its own connection with its own stored key.

export const GOOGLE_CALENDAR_CONNECTOR_ID = "google_calendar";
export const GOOGLE_MAIL_CONNECTOR_ID = "google_mail";
export const GOOGLE_DRIVE_CONNECTOR_ID = "google_drive";

export const GOOGLE_CONNECTOR_IDS = [
  GOOGLE_CALENDAR_CONNECTOR_ID,
  GOOGLE_MAIL_CONNECTOR_ID,
  GOOGLE_DRIVE_CONNECTOR_ID,
] as const;

export type GoogleConnectorId = (typeof GOOGLE_CONNECTOR_IDS)[number];

/** Who you are. Never grants access to any Google product on its own. */
export const GOOGLE_IDENTITY_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

/** Sending mail is deliberately not part of reading mail. */
export const GOOGLE_MAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

const SERVICE_SCOPES: Record<GoogleConnectorId, string[]> = {
  [GOOGLE_CALENDAR_CONNECTOR_ID]: [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
  ],
  [GOOGLE_MAIL_CONNECTOR_ID]: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
  ],
  [GOOGLE_DRIVE_CONNECTOR_ID]: [
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
  ],
};

/** The env var holding the workspace client key for one Google service. */
export const GOOGLE_CLIENT_KEY_ENV: Record<GoogleConnectorId, string> = {
  [GOOGLE_CALENDAR_CONNECTOR_ID]: "GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY",
  [GOOGLE_MAIL_CONNECTOR_ID]: "GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY",
  [GOOGLE_DRIVE_CONNECTOR_ID]: "GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY",
};

export function isGoogleConnector(id: string): id is GoogleConnectorId {
  return (GOOGLE_CONNECTOR_IDS as readonly string[]).includes(id);
}

/**
 * Everything one consent screen should ask for: who you are, plus that one
 * service. `withSend` is only ever true when a person is trying to send.
 */
export function scopesForConnector(
  id: GoogleConnectorId,
  opts: { withSend?: boolean } = {},
): string[] {
  const out = [...GOOGLE_IDENTITY_SCOPES, ...SERVICE_SCOPES[id]];
  if (opts.withSend && id === GOOGLE_MAIL_CONNECTOR_ID) out.push(GOOGLE_MAIL_SEND_SCOPE);
  return [...new Set(out)];
}

/** Kept for the calendar path that already shipped. */
export const GOOGLE_CALENDAR_SCOPES = scopesForConnector(GOOGLE_CALENDAR_CONNECTOR_ID);
