// googleService — one way to call any Google service as the signed-in person.
//
// Doctrine:
//   - Only this person's own connection is ever used. There is no borrowing of a
//     workspace credential for mail or files: if they have not granted it, the
//     answer is "not connected", never a silent fallback to somebody else's
//     account.
//   - A failure is reported as a failure. No empty list pretending to be calm.
import { callAsAppUser, appUserReconnectRequired } from "./appUserConnector.ts";
import { getConnectionKeyForUser } from "./appUserConnections.ts";
import type { GoogleConnectorId } from "./appUserScopes.ts";

export const GATEWAY_BASE = "https://connector-gateway.lovable.dev";

export type GoogleCallOutcome =
  | { ok: true; body: unknown }
  | { ok: false; reason: "not_connected" | "needs_you" | "failed"; detail: string; status?: number };

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
      return { ok: false, reason: "needs_you", detail: "Google needs you to sign in again.", status: res.status };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        reason: "needs_you",
        detail: "Google refused that with the permission you granted.",
        status: res.status,
      };
    }
    return { ok: false, reason: "failed", detail: detail.slice(0, 400) || res.statusText, status: res.status };
  }

  const text = await res.text();
  try {
    return { ok: true, body: text ? JSON.parse(text) : null };
  } catch {
    return { ok: true, body: text };
  }
}
