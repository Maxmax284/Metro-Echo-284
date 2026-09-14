// Echo's own calendar entries, from the glass.
//
// Doctrine:
//   - Feed rows stay read-only sense. Only entries Echo owns can be created,
//     edited or deleted, and only through this one path.
//   - Google is a mirror the person can switch off. When the mirror fails, the
//     entry still exists here and the reply says so plainly.
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

export type MirrorState = "synced" | "off" | "not_connected" | "error" | "pending";

export type EchoEventResult = {
  id: string | null;
  mirror: MirrorState;
  /** One plain sentence a surface can show as-is. */
  reply: string;
};

/** What the mirror did, in words, never a status code. */
function mirrorWords(state: MirrorState, verb: "Saved" | "Updated"): string {
  switch (state) {
    case "synced":
      return `${verb}, and Google has the same entry.`;
    case "off":
      return `${verb} here. Google mirroring is off, so nothing was sent.`;
    case "not_connected":
      return `${verb} here. Google is not connected, so only Echo holds it.`;
    case "error":
      return `${verb} here, but Google would not take it. Echo still has the entry.`;
    default:
      return `${verb}.`;
  }
}

async function call(body: Record<string, unknown>): Promise<{ raw: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke("echo-calendar", { body });
  if (error) {
    const detail = await (error as { context?: { text?: () => Promise<string> } }).context
      ?.text?.()
      .catch(() => "");
    throw new Error((detail || error.message).slice(0, 200));
  }
  const res = (data ?? {}) as Record<string, unknown>;
  if (res.error) throw new Error(String(res.error));
  return { raw: res };
}

export async function createEchoEvent(draft: EchoEventDraft): Promise<EchoEventResult> {
  const { raw } = await call({ op: "create", ...draft });
  const mirror = ((raw.google as { state?: MirrorState })?.state ?? "off") as MirrorState;
  return { id: ((raw.event as { id?: string })?.id ?? null), mirror, reply: mirrorWords(mirror, "Saved") };
}

export async function updateEchoEvent(id: string, draft: EchoEventDraft): Promise<EchoEventResult> {
  const { raw } = await call({ op: "update", id, ...draft });
  const mirror = ((raw.google as { state?: MirrorState })?.state ?? "off") as MirrorState;
  return { id, mirror, reply: mirrorWords(mirror, "Updated") };
}

export async function deleteEchoEvent(id: string): Promise<EchoEventResult> {
  const { raw } = await call({ op: "delete", id });
  const google = String(raw.google ?? "left");
  return {
    id,
    mirror: google === "removed" ? "synced" : google === "failed" ? "error" : "off",
    reply:
      google === "removed"
        ? "Deleted here and in Google."
        : google === "failed"
          ? "Deleted here. Google kept its copy — remove it there too."
          : "Deleted.",
  };
}

/** Whether Echo mirrors its own entries into Google. Default is on. */
export async function getGoogleMirrorOn(userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("preferences").eq("id", userId).maybeSingle();
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  return prefs.echo_calendar_google_sync !== false;
}

export async function setGoogleMirrorOn(userId: string, on: boolean): Promise<void> {
  const { data } = await supabase.from("profiles").select("preferences").eq("id", userId).maybeSingle();
  const prefs = { ...((data?.preferences ?? {}) as Record<string, unknown>), echo_calendar_google_sync: on };
  const { error } = await supabase.from("profiles").update({ preferences: prefs }).eq("id", userId);
  if (error) throw error;
}
