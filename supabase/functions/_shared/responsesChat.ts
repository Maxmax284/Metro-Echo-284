// responsesChat — one shared client for conversational turns on the Responses API.
//
// Both Echo surfaces speak to openai/gpt-6-astra through here: vanta-converse
// (in-app Echo room) translates the stream live for the browser, telegram-webhook
// drains the same stream into one reply. Model, headers, tool shape and event
// parsing can never drift apart because they live in exactly one place.
//
// Division of labour (hardcoded, never a Settings toggle):
//   - ChatGPT (gpt-6-astra, this module) — the conversational brain.
//   - Gemini — the radar/search pipeline (sitrep, web-look, watch-sweep) and the
//     cheap read pre-pass that decides which lookups a turn needs.
//
// Event parsing is a pure reducer so tests can drive it without a network.

export type ChatRoleMessage = { role: "system" | "user" | "assistant"; content: string };

export type ResponsesTool = {
  type: "function";
  name: string;
  description?: string;
  parameters?: unknown;
};

/** Chat-completions tools ([{type:"function", function:{…}}]) → Responses shape. */
export function toResponsesTools(chatTools: unknown[]): ResponsesTool[] {
  const out: ResponsesTool[] = [];
  for (const raw of chatTools ?? []) {
    const t = raw as {
      type?: string;
      name?: string;
      description?: string;
      parameters?: unknown;
      function?: { name?: string; description?: string; parameters?: unknown };
    };
    const name = t?.function?.name ?? t?.name;
    if (!name) continue;
    out.push({
      type: "function",
      name: String(name),
      description: t?.function?.description ?? t?.description,
      parameters: t?.function?.parameters ?? t?.parameters,
    });
  }
  return out;
}

/* callId is the Responses function_call id — needed when the server itself
   answers the call and continues the turn with a function_call_output. */
export type ToolCall = { name: string; arguments: string; callId?: string };

export type TurnDelta =
  | { kind: "text"; delta: string }
  | { kind: "tool"; call: ToolCall };

type PendingCall = { name: string; args: string; callId: string; emitted: boolean };

/**
 * Pure event reducer. Feed parsed Responses SSE events; get text deltas and
 * completed tool calls back, in order. A function call emits exactly once —
 * when its arguments complete (`function_call_arguments.done`, with
 * `output_item.done` as the fallback), never twice.
 */
export function createTurnReducer(): { push: (event: unknown) => TurnDelta[] } {
  const calls = new Map<string, PendingCall>();
  const keyOf = (e: { item_id?: string; output_index?: number; item?: { id?: string } }) =>
    String(e.item_id ?? e.item?.id ?? `idx:${e.output_index ?? 0}`);

  return {
    push(event: unknown): TurnDelta[] {
      const e = event as {
        type?: string;
        delta?: string;
        arguments?: string;
        item_id?: string;
        output_index?: number;
        item?: { id?: string; type?: string; name?: string; arguments?: string; call_id?: string };
      };
      if (!e || typeof e.type !== "string") return [];

      if (e.type === "response.output_text.delta" && e.delta) {
        return [{ kind: "text", delta: e.delta }];
      }

      if (e.type === "response.output_item.added" && e.item?.type === "function_call") {
        calls.set(keyOf(e), {
          name: String(e.item.name ?? ""),
          args: String(e.item.arguments ?? ""),
          callId: String(e.item.call_id ?? ""),
          emitted: false,
        });
        return [];
      }

      if (e.type === "response.function_call_arguments.delta") {
        const pending = calls.get(keyOf(e));
        if (pending && e.delta) pending.args += e.delta;
        return [];
      }

      if (e.type === "response.function_call_arguments.done") {
        const key = keyOf(e);
        const pending = calls.get(key);
        if (!pending || pending.emitted) return [];
        pending.emitted = true;
        return [{ kind: "tool", call: { name: pending.name, arguments: String(e.arguments ?? pending.args), callId: pending.callId || undefined } }];
      }

      if (e.type === "response.output_item.done" && e.item?.type === "function_call") {
        const key = keyOf(e);
        const pending = calls.get(key) ?? {
          name: String(e.item.name ?? ""),
          args: "",
          callId: String(e.item.call_id ?? ""),
          emitted: false,
        };
        if (pending.emitted) return [];
        pending.emitted = true;
        calls.set(key, pending);
        return [{ kind: "tool", call: { name: pending.name, arguments: String(e.item.arguments ?? pending.args), callId: pending.callId || undefined } }];
      }

      return [];
    },
  };
}

/**
 * Open a streamed Responses turn. The caller owns status handling — 429/5xx are
 * the only retryable statuses and chat surfaces fail honestly instead of
 * hanging the person on a retry loop.
 */
export async function postResponsesTurn(opts: {
  apiKey: string;
  messages: ChatRoleMessage[];
  /** Chat-completions-shaped tools; translated here. */
  tools?: unknown[];
  effort?: "low" | "medium" | "high";
  runId?: string;
}): Promise<Response> {
  return await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": opts.apiKey,
      "X-Lovable-AIG-SDK": "fetch",
      ...(opts.runId ? { "X-Lovable-AIG-Run-ID": opts.runId } : {}),
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      input: opts.messages,
      stream: true,
      store: false,
      reasoning: { effort: opts.effort ?? "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      ...(opts.tools?.length ? { tools: toResponsesTools(opts.tools) } : {}),
    }),
  });
}

/** Parse an SSE body into Responses events. Malformed lines are skipped. */
export async function* iterResponsesEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let i: number;
    while ((i = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") continue;
      try {
        yield JSON.parse(json);
      } catch { /* partial frame — the completed event still carries the turn */ }
    }
    if (done) break;
  }
}

export type CollectedTurn = { text: string; toolCalls: ToolCall[]; runId?: string };

/**
 * Drain a streamed turn into text + tool calls. This is Telegram's shape: one
 * reply to send, then intents to apply. The stream still flows on the wire so
 * a long reasoning run keeps the function alive.
 */
export async function collectResponsesTurn(response: Response): Promise<CollectedTurn> {
  const reducer = createTurnReducer();
  let text = "";
  const toolCalls: ToolCall[] = [];
  if (response.body) {
    for await (const event of iterResponsesEvents(response.body)) {
      for (const d of reducer.push(event)) {
        if (d.kind === "text") text += d.delta;
        else toolCalls.push(d.call);
      }
    }
  }
  return {
    text,
    toolCalls,
    runId: response.headers.get("X-Lovable-AIG-Run-ID") ?? undefined,
  };
}
