// appUserConnections — where each person's own connector handle lives.
//
// Encrypted, keyed by the authenticated user id, service-role only. The browser
// never sees these values; only edge functions read them.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptConnectionKey, encryptConnectionKey } from "./connectionKeyCrypto.ts";

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function saveConnectionKeyForUser(
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
  accountLabel?: string | null,
): Promise<void> {
  const { error } = await adminClient().from("app_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: await encryptConnectionKey(connectionAPIKey),
      account_label: accountLabel ?? null,
      /* A fresh grant clears the old complaint for this one service only. */
      last_error: null,
      last_error_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );

  if (error) throw error;
}

export async function getConnectionKeyForUser(
  userId: string,
  connectorId: string,
): Promise<string | null> {
  const { data, error } = await adminClient()
    .from("app_user_connections")
    .select("connection_key_ciphertext")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  try {
    return await decryptConnectionKey(data.connection_key_ciphertext as string);
  } catch {
    return null;
  }
}

export async function forgetConnectionForUser(userId: string, connectorId: string): Promise<void> {
  await adminClient()
    .from("app_user_connections")
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
}

export async function connectionLabelForUser(
  userId: string,
  connectorId: string,
): Promise<string | null> {
  const { data } = await adminClient()
    .from("app_user_connections")
    .select("account_label")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  return (data?.account_label as string | null) ?? null;
}
