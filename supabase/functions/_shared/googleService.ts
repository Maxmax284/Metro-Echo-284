// googleService — one way to call any Google service as the signed-in person.
//
// Doctrine:
//   - Only this person's own connection is ever used. There is no borrowing of a
//     workspace credential for mail or files: if they have not granted it, the
//     answer is "not connected", never a silent fallback to somebody else's
//     account.
//   - A failure is reported as a failure. No empty list pretending to be calm.
import { callAsAppUser, appUserReconnectRequired } from "./appUserConnector.ts";
import { getConnectionKeyForUser, adminClient } from "./appUserConnections.ts";
import type { GoogleConnectorId } from "./appUserScopes.ts";

export const GATEWAY_BASE = "https://connector-gateway.lovable.dev";

export type GoogleCallOutcome =
  | { ok: true; body: unknown }
  | {
    ok: false;
    /* service_off is Google's own project switch, not a permission this person
       withheld. Saying "the permission you granted" there sends them to the
       wrong place, so it is named separately. */
    reason: "not_connected" | "needs_you" | "service_off" | "failed";
    detail: string;
    status?: number;
  };

/**
 * Google answers a switched-off API with 403 and says so in the body. That is a
 * one-time setting in the Google Cloud project behind the sign-in — no amount of
 * re-granting permission changes it.
 */
export function readsAsServiceOff(body: string): boolean {
  const said = body.toLowerCase();
  return (
    said.includes("has not been used in project") ||
    said.includes("api is disabled") ||
    (said.includes("accessnotconfigured") && said.includes("enable"))
  );
}

/** True when this person has granted this exact Google service. */
export async function hasGoogleService(userId: string, connectorId: GoogleConnectorId): Promise<boolean> {
  if (!Deno.env.get("LOVABLE_API_KEY")) return false;
  try {
    return !!(await getConnectionKeyForUser(userId, connectorId));
  } catch {
    return false;
  }
}

export async function callGoogle(
  userId: string,
  connectorId: GoogleConnectorId,
  path: string,
  init?: RequestInit,
): Promise<GoogleCallOutcome> {
  if (!Deno.env.get("LOVABLE_API_KEY")) {
    return { ok: false, reason: "not_connected", detail: "Google is not configured for this app yet." };
  }
  let key: string | null = null;
  try {
    key = await getConnectionKeyForUser(userId, connectorId);
  } catch {
    key = null;
  }
  if (!key) {
    return { ok: false, reason: "not_connected", detail: "You have not switched this Google service on." };
  }

  let res: Response;
  try {
    res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE,
      connectionAPIKey: key,
      connectorId,
      path,
      init,
    });
  } catch (e) {
    return { ok: false, reason: "failed", detail: e instanceof Error ? e.message : "unreachable" };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[google:${connectorId}] ${path} -> ${res.status}: ${detail.slice(0, 400)}`);
    if (await appUserReconnectRequired(res)) {
      await noteGoogleHealth(userId, connectorId, "Google needs you to sign in again.");
      return { ok: false, reason: "needs_you", detail: "Google needs you to sign in again.", status: res.status };
    }
    if (res.status === 401 || res.status === 403) {
      const said = "Google refused that with the permission you granted.";
      await noteGoogleHealth(userId, connectorId, said);
      return { ok: false, reason: "needs_you", detail: said, status: res.status };
    }
    /* A one-off wobble is not a broken permission. It leaves no red mark. */
    return { ok: false, reason: "failed", detail: detail.slice(0, 400) || res.statusText, status: res.status };
  }

  await noteGoogleHealth(userId, connectorId, null);

  const text = await res.text();
  try {
    return { ok: true, body: text ? JSON.parse(text) : null };
  } catch {
    return { ok: true, body: text };
  }
}

/**
 * Health lives on the one service that had the problem. A refused Gmail call
 * can never make Calendar or Drive look broken.
 */
export async function noteGoogleHealth(
  userId: string,
  connectorId: GoogleConnectorId,
  problem: string | null,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await adminClient()
      .from("app_user_connections")
      .update(
        problem
          ? { last_error: problem, last_error_at: now }
          : { last_error: null, last_error_at: null, last_ok_at: now },
      )
      .eq("user_id", userId)
      .eq("connector_id", connectorId);
  } catch {
    /* Health is a courtesy. It never breaks the call it describes. */
  }
}

