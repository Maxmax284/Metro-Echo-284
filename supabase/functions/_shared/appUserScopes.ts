// The exact permissions Echo asks each person for. Declared once so consent and
// later calls can never drift apart.
export const GOOGLE_CALENDAR_CONNECTOR_ID = "google_calendar";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];
