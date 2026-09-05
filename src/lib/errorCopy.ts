// errorCopy — every visible error answers three questions.
//
//   1. what broke
//   2. does the user need to do anything
//   3. what one action is available
//
// Generalizes the pattern started in aiErrors.ts to any failure a surface can
// hit. Raw status codes and function names never reach normal users: they are
// kept on `technical` for support, and surfaces only show it behind an explicit
// "details" affordance.

export type ErrorFixKind = "retry" | "sign_in" | "open_connections" | "top_up" | "none";

export type ErrorReading = {
  /** One plain sentence: what broke, and whether anything was changed. */
  what: string;
  /** true when the user has to act before this can work. */
  needsYou: boolean;
  /** The single available move. */
  fix: { kind: ErrorFixKind; label: string | null };
  /** Kept for support only. Never rendered by default. */
  technical: string | null;
};

const NOTHING_CHANGED = "Nothing was changed.";

function statusOf(err: unknown): number | null {
  const anyErr = err as { status?: number; context?: { status?: number }; message?: string } | null;
  if (typeof anyErr?.status === "number") return anyErr.status;
  if (typeof anyErr?.context?.status === "number") return anyErr.context.status;
  const m = typeof anyErr?.message === "string" ? anyErr.message.match(/\b(4\d\d|5\d\d)\b/) : null;
  return m ? Number(m[1]) : null;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  const anyErr = err as { message?: string } | null;
  return typeof anyErr?.message === "string" ? anyErr.message : "";
}

/**
 * Read any failure into copy a non-technical user can act on.
 * `doing` should be a short gerund phrase: "reading this file", "saving that".
 */
export function readError(err: unknown, ctx?: { doing?: string }): ErrorReading {
  const raw = messageOf(err);
  const status = statusOf(err);
  const doing = ctx?.doing ? ` while ${ctx.doing}` : "";
  const technical = status ? `${status}${raw ? ` — ${raw}` : ""}` : raw || null;

  const offline = /failed to fetch|network|offline|load failed/i.test(raw);
  if (offline) {
    return {
      what: `Echo couldn't reach the network${doing}. ${NOTHING_CHANGED}`,
      needsYou: false,
      fix: { kind: "retry", label: "Try again" },
      technical,
    };
  }

  if (/credits exhausted/i.test(raw) || status === 402) {
    return {
      what: "The workspace is out of AI credits, so Echo can't think about this right now.",
      needsYou: true,
      fix: { kind: "top_up", label: "Top up credits" },
      technical,
    };
  }

  if (/missing|not configured|no key|secret/i.test(raw) && /key|token|secret|connector/i.test(raw)) {
    return {
      what: "Echo can't reach this connection because its key is missing.",
      needsYou: true,
      fix: { kind: "open_connections", label: "Open Connections" },
      technical,
    };
  }

  switch (status) {
    case 400:
      return {
        what: `That wasn't something Echo could read${doing}. Try shorter or simpler input.`,
        needsYou: true,
        fix: { kind: "none", label: null },
        technical,
      };
    case 401:
      return {
        what: "Your session expired, so Echo stopped before changing anything.",
        needsYou: true,
        fix: { kind: "sign_in", label: "Sign in again" },
        technical,
      };
    case 403:
      return {
        what: "This is switched off for the workspace right now.",
        needsYou: true,
        fix: { kind: "open_connections", label: "Open Settings" },
        technical,
      };
    case 404:
      return {
        what: "Echo couldn't find that record. It may have been moved or removed.",
        needsYou: false,
        fix: { kind: "none", label: null },
        technical,
      };
    case 429:
      return {
        what: "Too many requests in a row. Give it a minute.",
        needsYou: false,
        fix: { kind: "retry", label: "Try again" },
        technical,
      };
    default:
      break;
  }

  if (status !== null && status >= 500) {
    return {
      what: `Echo hit a temporary problem${doing}. Your work is still saved.`,
      needsYou: false,
      fix: { kind: "retry", label: "Try again" },
      technical,
    };
  }

  return {
    what: `That didn't finish${doing}. ${NOTHING_CHANGED}`,
    needsYou: false,
    fix: { kind: "retry", label: "Try again" },
    technical,
  };
}

/** Where a fix leads, for surfaces that want to route it themselves. */
export const FIX_ROUTE: Record<ErrorFixKind, string | null> = {
  retry: null,
  sign_in: "/auth",
  open_connections: "/settings/integrations",
  top_up: null,
  none: null,
};
