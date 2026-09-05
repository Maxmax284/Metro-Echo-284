// Client mirror of the trip spine. The arithmetic and the wording live in the
// shared edge-function module so the app, the server and Telegram cannot drift
// into three different ideas of how far you went or when a session went stale.
export * from "../../supabase/functions/_shared/trips";
