// Real undo for executed actions.
//
// Rollback used to be bookkeeping only: the row flipped to `rolled_back` and
// the side effect stayed in the world. This module actually reverses what ran
// for the executors that support it, and is honest when it cannot.
//
// Contract: `attemptUndo` never throws. It reports what happened so the caller
// can refuse the transition when a reversible action failed to reverse.

export type UndoOutcome = {
  /** True only when the external side effect was actually reversed. */
  undone: boolean;
  /** `none` = nothing to reverse, `unsupported` = executor has no undo path. */
  mode: "reversed" | "unsupported" | "none" | "failed";
  detail: string;
};

const gateway = (path: string) => `https://connector-gateway.lovable.dev/${path}`;

/** Env read that works under Deno (runtime) and the client typecheck (tests). */
function env(name: string): string | undefined {
  const d = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  return d?.env.get(name);
}

function connectorHeaders(connectionKey: string) {
  return {
    Authorization: `Bearer ${env("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

async function undoTelegram(result: Record<string, unknown>, config: Record<string, unknown>): Promise<UndoOutcome> {
  const chat_id = result?.chat_id ?? config?.chat_id;
  const message_id = result?.message_id;
  if (!chat_id || !message_id) {
    return { undone: false, mode: "unsupported", detail: "No chat or message id on the receipt — nothing to delete." };
  }
  const tgKey = env("TELEGRAM_API_KEY");
  if (!tgKey) return { undone: false, mode: "failed", detail: "Telegram connector is not linked." };
  const res = await fetch(gateway("telegram/deleteMessage"), {
    method: "POST",
    headers: connectorHeaders(tgKey),
    body: JSON.stringify({ chat_id, message_id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      undone: false,
      mode: "failed",
      detail: `Telegram refused the delete (${res.status}): ${JSON.stringify(body).slice(0, 200)}`,
    };
  }
  return { undone: true, mode: "reversed", detail: "Telegram message deleted." };
}

async function undoGoogleCalendar(result: Record<string, unknown>, config: Record<string, unknown>): Promise<UndoOutcome> {
  const event_id = result?.event_id;
  if (!event_id) return { undone: false, mode: "unsupported", detail: "No event id on the receipt." };
  const calKey = env("GOOGLE_CALENDAR_API_KEY");
  if (!calKey) return { undone: false, mode: "failed", detail: "Google Calendar connector is not linked." };
  const calendarId = encodeURIComponent(String(result?.calendar_id ?? config?.calendar_id ?? "primary"));
  const res = await fetch(
    gateway(`google_calendar/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(String(event_id))}`),
    { method: "DELETE", headers: connectorHeaders(calKey) },
  );
  // Calendar returns 204 on delete, 410 when it was already gone — both mean
  // the world matches "undone".
  if (res.ok || res.status === 410) {
    return { undone: true, mode: "reversed", detail: "Calendar event removed." };
  }
  const text = await res.text().catch(() => "");
  return { undone: false, mode: "failed", detail: `Calendar refused the delete (${res.status}): ${text.slice(0, 200)}` };
}

/** Executor kinds Echo can genuinely reverse. */
export const REVERSIBLE_KINDS = ["telegram", "google_calendar", "calendar"] as const;

export function isReversibleKind(kind: string | null | undefined): boolean {
  return !!kind && (REVERSIBLE_KINDS as readonly string[]).includes(kind);
}

/**
 * Attempt to reverse an executed action. `executorKind`/`executorConfig` come
 * from the executor that ran it, when it can still be found.
 */
export async function attemptUndo(args: {
  executorKind: string | null | undefined;
  executorConfig?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
}): Promise<UndoOutcome> {
  const { executorKind } = args;
  const result = args.result ?? {};
  const config = args.executorConfig ?? {};
  try {
    if (executorKind === "telegram") return await undoTelegram(result, config);
    if (executorKind === "google_calendar" || executorKind === "calendar") {
      return await undoGoogleCalendar(result, config);
    }
    if (!executorKind) {
      return { undone: false, mode: "none", detail: "Ran without an executor — nothing external to reverse." };
    }
    return {
      undone: false,
      mode: "unsupported",
      detail: `No automatic undo for ${executorKind}. Reverse it at the source.`,
    };
  } catch (e) {
    return { undone: false, mode: "failed", detail: e instanceof Error ? e.message : "Undo failed." };
  }
}
