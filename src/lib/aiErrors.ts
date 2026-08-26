/**
 * Plain-English readings of edge function / AI gateway failures.
 * Terminal states (402 / 403 / 400 / 401) must never be retried — we surface
 * the reason and stop. Only 429 and 5xx are worth trying again later.
 */

export type AiFailure = {
  status: number | null;
  code: string | null;
  message: string;
  retryable: boolean;
};

const COPY: Record<number, { message: string; retryable: boolean }> = {
  400: { message: "That request was not something Vanta could read. Try shorter text.", retryable: false },
  401: { message: "Sign in and try that again.", retryable: false },
  402: { message: "AI credits are used up for this workspace. Top up in Lovable, then try again.", retryable: false },
  403: { message: "AI is switched off for this workspace right now.", retryable: false },
  429: { message: "Too many requests in a row. Give it a minute and try again.", retryable: true },
};

/** Reads the JSON body out of a supabase-js FunctionsHttpError when present. */
export async function describeFunctionError(err: unknown): Promise<AiFailure> {
  const anyErr = err as { context?: Response; message?: string } | null;
  const res = anyErr?.context;
  let status: number | null = typeof res?.status === "number" ? res.status : null;
  let code: string | null = null;

  if (res && typeof res.clone === "function") {
    try {
      const body = await res.clone().json();
      code = (body?.error as string) ?? null;
    } catch {
      /* body was not JSON — status alone decides the copy */
    }
  }

  if (status === null && typeof anyErr?.message === "string") {
    const m = anyErr.message.match(/\b(4\d\d|5\d\d)\b/);
    if (m) status = Number(m[1]);
  }

  if (code === "credits exhausted") status = 402;
  if (code === "rate limited" || code === "rate_limited") status = 429;

  const known = status !== null ? COPY[status] : undefined;
  if (known) return { status, code, message: known.message, retryable: known.retryable };
  if (status !== null && status >= 500) {
    return { status, code, message: "An outside service did not respond. Nothing was changed.", retryable: true };
  }
  return {
    status,
    code,
    message: anyErr?.message || "That did not complete. Nothing was changed.",
    retryable: false,
  };
}
