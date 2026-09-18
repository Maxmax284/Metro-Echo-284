// Small Responses API client for one-shot server work. The response still
// streams on the wire so long reasoning runs keep the function alive.
export type AiResponseMessage = { role: "system" | "user" | "assistant"; content: string };

function retryDelay(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  return Math.min(8000, 1000 * (2 ** attempt)) + Math.floor(Math.random() * 300);
}

function gatewayMessage(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: { message?: string } };
    return parsed.message ?? parsed.error?.message ?? fallback;
  } catch {
    return raw.trim() || fallback;
  }
}

async function readSseText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let reasoning = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const event = JSON.parse(line.slice(6)) as { type?: string; delta?: string };
        if (event.type === "response.output_text.delta") output += event.delta ?? "";
        if (event.type === "response.reasoning_summary_text.delta") reasoning += event.delta ?? "";
      } catch { /* malformed event: terminal payload may still carry the answer */ }
    }
    if (done) break;
  }
  return output.trim() || reasoning.trim();
}

export async function streamAstraText(input: {
  apiKey: string;
  messages: AiResponseMessage[];
  incomingRunId?: string;
}): Promise<{ text: string; runId?: string }> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": input.apiKey,
        "X-Lovable-AIG-SDK": "fetch",
        ...(input.incomingRunId ? { "X-Lovable-AIG-Run-ID": input.incomingRunId } : {}),
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: input.messages,
        stream: true,
        store: false,
        reasoning: { effort: "medium", summary: "auto" },
        include: ["reasoning.encrypted_content"],
      }),
    });
    if (response.ok) {
      return {
        text: await readSseText(response),
        runId: response.headers.get("X-Lovable-AIG-Run-ID") ?? input.incomingRunId,
      };
    }
    const raw = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts - 1) {
      throw Object.assign(new Error(gatewayMessage(raw, `Lovable AI returned ${response.status}.`)), {
        status: response.status,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, response.headers.get("Retry-After"))));
  }
  throw new Error("Lovable AI did not return a response.");
}