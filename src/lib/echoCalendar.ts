// Echo's own calendar entries, from the glass.
//
// Doctrine:
//   - Feed rows stay read-only sense. Only entries Echo owns can be created,
//     edited or deleted, and only through this one path.
//   - Google is a mirror the person can switch off. When the mirror fails, the
//     entry still exists here and the row says what went wrong.
import { supabase } from "@/integrations/supabase/client";

export type EchoEventDraft = {
  title: string;
  starts_at: string;
  ends_at?: string | null;
  all_day?: boolean;
  location?: string | null;
  description?: string | null;
  project_id?: string | null;
  organization_id?: string | null;
};

export type EchoEventResult = {
  id: string;
  /** "synced" when Google holds a copy, "local" when the mirror is off, "error" when the mirror failed. */
  sync_state: "local" | "synced" | "error" | "off";
  sync_error: string | null;
  /** One plain sentence the surface can show as-is. */
  reply: string;
};

async function call(body: Record<string, unknown>): Promise<EchoEventResult> {
  const { data, error } = await supabase.functions.invoke("echo-calendar", { body });
  if (error) {
    const detail = await (error as { context?: { text?: () => Promise<string> } }).context?.text?.().catch(() => "");
    throw new Error(detail?.slice(0, 200) || error.message);
  }
  const res = data as EchoEventResult & { error?: string };
  if (res?.error) throw new Error(res.error);
  return res;
}

export const createEchoEvent = (draft: EchoEventDraft) => call({ op: "create", event: draft });

export const updateEchoEvent = (id: string, draft: Partial<EchoEventDraft>) =>
  call({ op: "update", id, event: draft });

export const deleteEchoEvent = (id: string) => call({ op: "delete", id });

/** Whether Echo mirrors its own entries into Google. Default is on. */
export async function getGoogleMirrorOn(userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("preferences").eq("id", userId).maybeSingle();
  const prefs = ((data?.preferences ?? {}) as Record<string, unknown>);
  return prefs.echo_calendar_google_sync !== false;
}

export async function setGoogleMirrorOn(userId: string, on: boolean): Promise<void> {
  const { data } = await supabase.from("profiles").select("preferences").eq("id", userId).maybeSingle();
  const prefs = { ...((data?.preferences ?? {}) as Record<string, unknown>), echo_calendar_google_sync: on };
  const { error } = await supabase.from("profiles").update({ preferences: prefs }).eq("id", userId);
  if (error) throw error;
}
